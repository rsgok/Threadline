import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { mediaMarkdown, linkedAttachments } from './session-assets.mjs';
import { THREAD_ID } from './codex-sessions.mjs';

const failure = (status, message) => Object.assign(new Error(message), { status });
const hash = text => crypto.createHash('sha256').update(text).digest('hex');

// Cursor Agents writes one JSONL message stream per conversation. Only explicit
// user/assistant text is displayable; tool results and thinking are not messages.
export function parseCursorTranscript(text, id, assetCacheDir) {
  const messages = [];
  for (const line of text.split('\n')) {
    let record;
    try { record = JSON.parse(line); } catch { continue; }
    const message = record.message || record;
    const role = record.role || message.role;
    if (!['user', 'assistant'].includes(role)) continue;
    const content = message.content;
    let body = typeof content === 'string' ? content : Array.isArray(content)
      ? content.filter(block => block.type === 'text' && typeof block.text === 'string').map(block => block.text).join('\n\n') : '';
    body = [body, mediaMarkdown(Array.isArray(content) ? content.filter(b => b.type !== 'tool_result') : [], assetCacheDir)].filter(Boolean).join('\n\n');
    body = body.replace(/^\s*<user_query>\s*([\s\S]*?)\s*<\/user_query>\s*$/, '$1').trim();
    if (!body) continue;
    const timestamp = typeof record.timestamp === 'string' && Number.isFinite(Date.parse(record.timestamp)) ? record.timestamp : '';
    messages.push({ id: hash(id + ':' + messages.length + ':' + role).slice(0, 32), role,
      attachments: linkedAttachments(body), phase: role === 'assistant' ? 'final' : '', text: body, timestamp,
      fingerprint: hash(role + '\n' + body), hasImages: /!\[[^\]]*\]\(/.test(body) });
  }
  return messages;
}

export class CursorSessions {
  constructor(home = path.join(os.homedir(), '.cursor', 'projects'), assetCacheDir) { this.assetCacheDir = assetCacheDir; this.home = home; this.cache = new Map(); }
  async files() {
    const files = [];
    const visit = async (dir, depth, inTranscripts = false) => {
      if (depth > 5) return;
      let entries;
      try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); }
      catch (error) { if (error.code === 'ENOENT') return; throw failure(500, '无法读取 Cursor 会话目录，请检查目录权限。'); }
      for (const entry of entries) {
        if (entry.isSymbolicLink() || entry.name === 'subagents' || entry.name.startsWith('.')) continue;
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) await visit(file, depth + 1, inTranscripts || entry.name === 'agent-transcripts');
        else if (inTranscripts && entry.isFile() && entry.name.endsWith('.jsonl') && THREAD_ID.test(entry.name.slice(0, -6))) {
          const stat = await fs.promises.stat(file);
          files.push({ file, id: entry.name.slice(0, -6), modified: stat.mtimeMs, size: stat.size });
        }
      }
    };
    await visit(this.home, 0, path.basename(this.home) === 'agent-transcripts');
    return files.sort((a,b) => b.modified-a.modified);
  }
  async snapshot(entry) {
    if (entry.size > 64 * 1024 * 1024) throw failure(413, '这条 Cursor 会话过大，请导出需要的片段后手动收录。');
    const stamp = entry.modified + ':' + entry.size, cached = this.cache.get(entry.file);
    if (cached?.stamp === stamp) return structuredClone(cached.session);
    const text = await fs.promises.readFile(entry.file, 'utf8');
    const messages = parseCursorTranscript(text, entry.id, this.assetCacheDir);
    const session = { id: entry.id, runtime: 'cursor', title: messages.find(m=>m.role==='user')?.text.replace(/\s+/g,' ').slice(0,100) || 'Cursor 会话',
      updatedAt: new Date(entry.modified).toISOString(), status: 'unknown', cwd: '', project: null, messages, hiddenProgress: 0 };
    if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(entry.file, { stamp, session });
    return structuredClone(session);
  }
  async recent() {
    const result = [], seen = new Set();
    for (const entry of (await this.files()).slice(0, 100)) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      const session = await this.snapshot(entry);
      if (session.messages.length) { const { messages, ...summary } = session; result.push(summary); }
    }
    return result;
  }
  async get(id) {
    if (!THREAD_ID.test(id || '')) throw failure(400, '会话 ID 格式不正确。');
    const entry = (await this.files()).find(entry=>entry.id===id);
    if (!entry) throw failure(404, '没有找到这条 Cursor 本地会话。请确认在这台电脑上打开过该会话，且会话记录已启用。');
    return this.snapshot(entry);
  }
}
