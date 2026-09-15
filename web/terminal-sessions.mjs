import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import * as zlib from 'node:zlib';
import { promisify } from 'node:util';
import { mediaMarkdown, linkedAttachments } from './session-assets.mjs';

import { runtimeNames, sessionID } from './runtimes.mjs';
const fail = (message, status = 422) => Object.assign(new Error(message), { status });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const date = value => value !== undefined && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : '';
const LIMIT = 64 * 1024 * 1024;

function records(text) {
  const lines = text.split('\n'), result = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    try { result.push(JSON.parse(lines[i])); }
    catch { if (i !== lines.length - 1) throw fail('Invalid transcript JSON; refresh after the runtime finishes writing.'); }
  }
  return result;
}
function visibleMessage(id, role, content, timestamp, cacheDir) {
  const blocks = Array.isArray(content) ? content.filter(b => ['text', 'image', 'file'].includes(b?.type)) : [];
  const body = typeof content === 'string' ? content : blocks.filter(b => b.type === 'text' && typeof b.text === 'string').map(b => b.text).join('\n\n');
  // Never recurse into tool results or reasoning. Unresolved DSH attachments remain explicit.
  const media = mediaMarkdown(blocks, cacheDir);
  const unresolved = blocks.filter(b => b.attachment).map(b => `[${b.type === 'image' ? 'Image' : 'File'}: ${String(b.attachment.name || b.attachment.attachmentId).replace(/[\r\n\[\]]/g, '_')} — attachment stored by DeepSeek Harness]`).join('\n');
  const text = [body, media, unresolved].filter(Boolean).join('\n\n').trim();
  if (!text) return null;
  const attachments = linkedAttachments(text);
  return { id: String(id), role, text, timestamp: date(timestamp), phase: role === 'assistant' ? 'final' : '', attachments,
    unresolvedAttachments: blocks.filter(b => b.attachment).map(b => ({ name: b.attachment.name || String(b.attachment.attachmentId), path: String(b.attachment.attachmentId), reason: 'DeepSeek Harness 附件尚未复制，请在原应用中查看' })),
    fingerprint: hash(role + '\n' + text + JSON.stringify(attachments)), hasImages: /!\[/.test(text) || blocks.some(b => b.type === 'image') };
}
function makeSession(runtime, id, messages, cwd, title) {
  return { runtime, id, messages: messages.filter(Boolean), cwd: cwd || '', project: cwd ? { name: path.basename(cwd), root: cwd } : null,
    title: title || messages.find(m => m?.role === 'user')?.text.replace(/\s+/g, ' ').slice(0, 100) || runtimeNames[runtime], status: 'unknown', hiddenProgress: 0 };
}
export function parseClaude(text, id, cacheDir) {
  const rows = records(text);
  if (rows.some(r => r.isSidechain === true)) return null;
  const chat = rows.filter(r => ['user', 'assistant'].includes(r.type) && r.sessionId === id && !r.isMeta && !r.isCompactSummary);
  if (!chat.length) return null;
  const messages = new Map();
  for (const r of chat) {
    const m = r.message;
    if (!m || m.role !== r.type || typeof r.uuid !== 'string') continue;
    const value = visibleMessage(r.uuid, m.role, m.content, r.timestamp, cacheDir);
    if (value) messages.set(r.uuid, value);
  }
  const title = rows.findLast(r => r.type === 'custom-title' && r.sessionId === id)?.customTitle;
  return makeSession('claude', id, [...messages.values()], chat.find(r => typeof r.cwd === 'string')?.cwd, typeof title === 'string' ? title : '');
}
export function parsePi(text, id, cacheDir) {
  const rows = records(text), header = rows[0];
  if (header?.type !== 'session' || header.id !== id) throw fail('Pi session identity does not match its transcript.');
  if (![1, 2, 3].includes(header.version)) throw fail('Unsupported Pi session format.');
  let branch = rows.slice(1);
  if (header.version >= 2) {
    const entries = branch.filter(r => typeof r.id === 'string'), byID = new Map(entries.map(r => [r.id, r]));
    if (entries.length !== byID.size) throw fail('Duplicate Pi session entry IDs.');
    branch = []; let entry = entries.at(-1); const seen = new Set();
    while (entry) {
      if (seen.has(entry.id)) throw fail('Invalid Pi session branch.');
      seen.add(entry.id); branch.unshift(entry);
      if (entry.parentId == null) break;
      entry = byID.get(entry.parentId);
      if (!entry) throw fail('Pi session branch is incomplete.');
    }
  }
  const messages = branch.filter(r => r.type === 'message' && ['user', 'assistant'].includes(r.message?.role))
    .map((r, i) => visibleMessage(r.id || `legacy-${i}`, r.message.role, r.message.content, r.timestamp || r.message.timestamp, cacheDir));
  const title = rows.findLast(r => r.type === 'session_info' && typeof r.name === 'string')?.name;
  return makeSession('pi', id, messages, header.cwd, title);
}
export function parseDeepSeek(text, id, cacheDir) {
  const rows = records(text), header = rows[0];
  if (header?.type !== 'session' || header.id !== id) throw fail('DeepSeek Harness session identity does not match its transcript.');
  if (header.origin === 'subagent' || header.delegationDepth > 0) return null;
  if (header.version !== 3) throw fail('Unsupported DeepSeek Harness session format; this adapter reads v3.');
  // Preserve original human discussion across compaction. Replacement nodes are derived context,
  // not new original replies. Only original append events are collected.
  const messages = new Map(); let title = '';
  let previousSeq = -1;
  for (const r of rows.slice(1)) {
    if (!r || !Number.isSafeInteger(r.seq) || r.seq <= previousSeq) throw fail('Invalid DeepSeek Harness event sequence.');
    previousSeq = r.seq;
    if (r.type === 'session/title') { if (typeof r.data?.title === 'string') title = r.data.title; continue; }
    if (!['user/message', 'assistant/message'].includes(r.type)) continue;
    const m = r.type === 'user/message' ? r.data : r.data?.message;
    if (!m || !Array.isArray(m.content) || typeof m.source?.kind !== 'string') throw fail('Invalid DeepSeek Harness message.');
    if (!['user', 'model'].includes(m.source.kind)) continue;
    if (r.surfaceOp !== 'append') continue;
    const value = visibleMessage(`event-${r.seq}`, m.role, m.content, r.time, cacheDir);
    if (value && ['user', 'assistant'].includes(m.role)) messages.set(r.seq, value);
  }
  return makeSession('deepseek', id, [...messages.values()], header.cwd, title);
}

// Zstandard framing: locate complete batches, ignoring only a torn final batch.
// Do not suppress decompression/checksum failures inside a complete frame.
function* completeZstdFrames(bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const start = offset;
    if (offset + 5 > bytes.length) return;
    if (bytes.readUInt32LE(offset) !== 0xfd2fb528) throw fail('Invalid compressed DeepSeek Harness transcript.');
    const descriptor = bytes[offset + 4];
    if (descriptor & 0x18) throw fail('Invalid Zstandard frame header.');
    const single = Boolean(descriptor & 0x20), sizeFlag = descriptor >> 6, dictionary = descriptor & 3;
    offset += 5 + (single ? 0 : 1) + (dictionary === 3 ? 4 : dictionary) + (sizeFlag ? 2 ** sizeFlag : single ? 1 : 0);
    if (offset > bytes.length) return;
    while (true) {
      if (offset + 3 > bytes.length) return;
      const block = bytes.readUIntLE(offset, 3), type = (block >> 1) & 3;
      if (type === 3) throw fail('Invalid Zstandard block.');
      offset += 3 + (type === 1 ? 1 : block >>> 3);
      if (offset > bytes.length) return;
      if (block & 1) break;
    }
    if (descriptor & 4) offset += 4;
    if (offset > bytes.length) return;
    yield bytes.subarray(start, offset);
  }
}

// Read-only discovery. IDs never become paths supplied by callers, and symlinks are skipped.
export class TerminalSessions {
  constructor(runtime, home, cacheDir) {
    this.runtime = runtime; this.cacheDir = cacheDir; this.cache = new Map();
    this.home = home ?? ({
      claude: path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects'),
      pi: process.env.PI_CODING_AGENT_SESSION_DIR || path.join(process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent'), 'sessions'),
      deepseek: path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'sessions'),
    })[runtime];
  }
  async files() {
    const found = [];
    const visit = async (dir, depth) => {
      if (depth > 4) return;
      let entries;
      try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); }
      catch (e) { if (e.code === 'ENOENT') return; throw e; }
      if (this.runtime === 'deepseek') {
        const generations = entries.filter(e => e.isFile() && /^session(?:\.v[1-9][0-9]*)?\.jsonl(?:\.zstd)?$/.test(e.name));
        const latest = generations.sort((a,b) => Number(b.name.match(/\.v(\d+)/)?.[1] || 0) - Number(a.name.match(/\.v(\d+)/)?.[1] || 0))[0];
        if (latest) { const file = path.join(dir, latest.name); found.push({ file, id: path.basename(dir), ...await fs.promises.stat(file) }); }
      }
      for (const e of entries) {
        if (e.isSymbolicLink() || e.name === 'subagents' || e.name.startsWith('.')) continue;
        const file = path.join(dir, e.name);
        if (e.isDirectory()) await visit(file, depth + 1);
        else if (e.isFile() && e.name.endsWith('.jsonl') && this.runtime !== 'deepseek') {
          const id = this.runtime === 'claude' ? e.name.slice(0, -6) : null;
          if (id && !sessionID(id)) continue;
          found.push({ file, id, ...await fs.promises.stat(file) });
        }
      }
    };
    await visit(this.home, 0);
    return found.sort((a,b) => b.mtimeMs-a.mtimeMs);
  }
  async read(entry) {
    if (entry.size > LIMIT) throw fail('Transcript exceeds the 64 MB reading limit.', 413);
    if (!entry.file.endsWith('.zstd')) return fs.promises.readFile(entry.file, 'utf8');
    if (!zlib.zstdDecompress) throw fail('Reading compressed DeepSeek Harness sessions requires Node.js 22.15 or newer.');
    const bytes = await fs.promises.readFile(entry.file), chunks = []; let total = 0;
    // Node's decoder consumes one frame. DSH appends independently compressed batches.
    for (const frame of completeZstdFrames(bytes)) {
      const chunk = await promisify(zlib.zstdDecompress)(frame, { maxOutputLength: LIMIT - total });
      total += chunk.length;
      if (total >= LIMIT) throw fail('Expanded transcript exceeds 64 MB.', 413);
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  async snapshot(entry) {
    const stamp = `${entry.mtimeMs}:${entry.size}`, cached = this.cache.get(entry.file);
    if (cached?.stamp === stamp) return structuredClone(cached.session);
    const text = await this.read(entry);
    const header = records(text)[0];
    const id = this.runtime === 'claude' ? entry.id : header?.id;
    if (!sessionID(id)) throw fail('Unsupported session ID.');
    const parser = { claude: parseClaude, pi: parsePi, deepseek: parseDeepSeek }[this.runtime];
    let session;
    try { session = parser(text, id, this.cacheDir); }
    catch (error) { error.sessionID = id; throw error; }
    if (session) session.updatedAt = new Date(entry.mtimeMs).toISOString();
    const cost = (session?.messages || []).reduce((n, m) => n + m.text.length * 2 + 512, 0);
    this.cache.delete(entry.file);
    let total = [...this.cache.values()].reduce((n, value) => n + value.cost, 0);
    while (this.cache.size && (this.cache.size >= 100 || total + cost > 16 * 1024 * 1024)) {
      const key = this.cache.keys().next().value; total -= this.cache.get(key).cost; this.cache.delete(key);
    }
    if (cost <= 16 * 1024 * 1024) this.cache.set(entry.file, { stamp, session, cost });
    return structuredClone(session);
  }
  async indexEntries() {
    return (await this.files()).slice(0, 100).map(entry => ({
      ...entry, stamp: [entry.mtimeMs, entry.ctimeMs, entry.ino, entry.size, entry.file].join(':'),
      updatedAt: new Date(entry.mtimeMs).toISOString(),
    }));
  }
  async indexSummary(entry) {
    const session = await this.snapshot(entry);
    // The disk index is compact; do not retain every transcript in the reader cache.
    this.cache.delete(entry.file);
    return session;
  }
  async recent() {
    const result = [], seen = new Set(), errors = [];
    for (const entry of (await this.files()).slice(0, 100)) {
      try {
        const s = await this.snapshot(entry);
        if (s?.messages.length && !seen.has(s.id)) { seen.add(s.id); const { messages, ...summary } = s; result.push(summary); }
      } catch (e) { errors.push(e.message); }
    }
    // Keep readable sessions available while making incompatible/corrupt records visible.
    this.warnings = [...new Set(errors)];
    return result;
  }
  async get(id) {
    if (!sessionID(id)) throw fail('Invalid session ID.', 400);
    for (const entry of await this.files()) {
      if (this.runtime === 'claude' && entry.id !== id) continue;
      // Pi IDs are in headers; DSH directory IDs may be encoded. Never guess a recent session.
      let s;
      try { s = await this.snapshot(entry); }
      catch (e) { if (e.sessionID === id || entry.id === id) throw e; continue; }
      if (s?.id === id) return s;
    }
    throw fail(`No local ${runtimeNames[this.runtime]} conversation matches this ID.`, 404);
  }
}
