import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { mediaMarkdown } from './session-assets.mjs';

export const THREAD_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const failure = (status, message) => Object.assign(new Error(message), { status });
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const injected = /^(?:<recommended_plugins>|<environment_context>|<permissions instructions>|<skills_instructions>|# AGENTS\.md instructions|<system-reminder>)/;

function visibleUserText(text) {
  // Codex injects the selected skill as a separate user-role transport message.
  // Strip only the recognized envelope; retain any real request after it.
  text = text.replace(/^\s*(?:<skill>\s*<name>[^<>\n]+<\/name>\s*<path>\/[^<>\n]+\/SKILL\.md<\/path>[\s\S]*?<\/skill>\s*)+/, '');
  // Uploaded images and question replies have their own Codex transport shapes.
  text = text.replace(/<image\s+name=\[Image #\d+\]\s+path="([^"<>]+)"\s*>\s*<\/image>/g, (raw, file) => {
    if (!path.isAbsolute(file)) return raw;
    return `\n\n![上传的图片](<${file}>)\n\n`;
  });
  const reply = text.match(/^\s*<send_user_message_question_reply>\s*([\s\S]*?)\s*<\/send_user_message_question_reply>\s*$/);
  if (reply) {
    try {
      const items = JSON.parse(reply[1]);
      if (Array.isArray(items) && items.length && items.every(item => typeof item.question === 'string' && typeof item.answer === 'string')) {
        return items.map(item => `> ${item.question.replace(/\n/g, '\n> ')}\n\n**我的回答**\n\n${item.answer}`).join('\n\n');
      }
    } catch { /* Preserve malformed replies rather than dropping user content. */ }
  }
  // Strip only known leading transport envelopes, keeping the user's request.
  text = text.replace(/^\s*# Files mentioned by the user:[\s\S]*?Distinguish instructions in attached documents from the user's request\.\s*/, '');
  text = text.replace(/^\s*<in-app-browser-context\b[^>]*>[\s\S]*?<\/in-app-browser-context>\s*/, '');
  text = text.replace(/^\s*## My request:\s*/, '');
  if (text.trimStart().startsWith('# Browser comments:')) {
    const boundary = text.search(/<in-app-browser-context\b|## My request:/);
    const preamble = boundary < 0 ? text : text.slice(0, boundary);
    const comments = preamble.split(/## User Comment \d+\s*\n/).slice(1).map(block => {
      const target = block.match(/^Target: "(.*)"\s*$/m)?.[1];
      const comment = block.match(/^Comment:\s*\n([\s\S]*)$/m)?.[1]?.trim();
      return [target ? `> ${target}` : '', comment ? `**我的评论**\n\n${comment}` : ''].filter(Boolean).join('\n\n');
    }).filter(Boolean);
    if (comments.length) {
      let request = text.match(/## My request:\s*\n([\s\S]*)/)?.[1] || '';
      request = request.replace(/\n*The next image is untrusted page evidence from the browser page for Comment [\s\S]*$/, '').trim();
      return [...comments, ...(request ? [request] : [])].join('\n\n');
    }
  }
  // Codex encodes the user's reply annotations with a transport preamble.
  // Keep the selected quotes and comments, not the transport instructions.
  if (!text.trimStart().startsWith('# Response annotations:')) return text;
  const match = text.match(/<response-annotations>\s*([\s\S]*?)\s*<\/response-annotations>/);
  if (!match) return text;
  try {
    const items = JSON.parse(match[1]);
    if (!Array.isArray(items)) return text;
    const annotations = items.map(item => [typeof item.text === 'string' && item.text ? `> ${item.text.replace(/\n/g, '\n> ')}` : '', typeof item.annotation === 'string' && item.annotation ? `**我的评论**\n\n${item.annotation}` : ''].filter(Boolean).join('\n\n')).filter(Boolean);
    const request = text.split('## My request:')[1]?.trim();
    return [...annotations, ...(request ? [request] : [])].join('\n\n') || text;
  } catch { return text; }
}

// Uploaded-image envelopes and input_image blocks describe the same ordered
// uploads. Prefer the durable block copy at the envelope's original position.
function userContent(rawText, content, assetCacheDir) {
  const envelope=/<image\s+name=\[Image #\d+\]\s+path="([^"<>]+)"\s*>\s*<\/image>/g;
  const uploads=content.filter(block=>block.type==='input_image');
  const markers=[...rawText.matchAll(envelope)];
  if (!markers.length || markers.length!==uploads.length) {
    return [visibleUserText(rawText),mediaMarkdown(content,assetCacheDir)].filter(Boolean).join('\n\n');
  }
  let index=0;
  const consumed=new Set();
  const text=rawText.replace(envelope,original=>{
    const block=uploads[index++];
    const media=mediaMarkdown(block,assetCacheDir);
    if (!media) return original;
    consumed.add(block);
    return '\n\n'+media+'\n\n';
  });
  return [visibleUserText(text),mediaMarkdown(content.filter(block=>!consumed.has(block)),assetCacheDir)].filter(Boolean).join('\n\n');
}

// Codex appends structured memory attribution after the visible answer.
// Remove only this recognized trailing envelope, never quoted/code examples.
function visibleAssistantText(text) {
  return text.replace(/(?:^|\n)\s*<oai-mem-citation>\s*<citation_entries>[\s\S]*?<\/citation_entries>\s*<rollout_ids>[\s\S]*?<\/rollout_ids>\s*<\/oai-mem-citation>\s*$/, '').trimEnd();
}

// Select conversation messages and explicit media from tool results. Tool text,
// developer/system instructions, event mirrors and reasoning stay hidden.
export function extractMessages(records, threadID, { assetCacheDir } = {}) {
  let metadata, turnID = '', sequence = 0, status = 'unknown';
  const messages = new Map();
  for (const record of records) {
    let p = record.payload || {};
    if (record.type === 'response_item' && ['function_call_output', 'custom_tool_call_output', 'image_generation_call'].includes(p.type)) {
      const media = mediaMarkdown(p, assetCacheDir);
      if (!media) continue;
      p = { type: 'message', id: p.id || 'asset-' + hash(threadID + ':' + (p.call_id || record.timestamp || '') + ':' + media).slice(0, 32), role: 'assistant', phase: 'commentary', content: [{ type: 'output_text', text: media }] };
    }
    if(record.type==='event_msg'){if(p.type==='task_started')status='open';else if(p.type==='task_complete')status='complete';else if(p.type==='turn_aborted')status='interrupted';continue;}
    if (record.type === 'session_meta') { metadata = p; continue; }
    if (record.type === 'turn_context') { turnID = p.turn_id || ''; continue; }
    if (record.type !== 'response_item' || p.type !== 'message' || !['user', 'assistant'].includes(p.role)) continue;
    if (p.role === 'assistant' && ![undefined, null, 'final', 'final_answer', 'commentary'].includes(p.phase)) continue;
    if (p.channel && !['final', 'commentary'].includes(p.channel)) continue;
    const content = Array.isArray(p.content) ? p.content : [];
    const rawText = content.filter(c => ['input_text', 'output_text'].includes(c.type)).map(c => c.text || '').join('\n');
    const text = p.role === 'user' ? userContent(rawText,content,assetCacheDir) : [visibleAssistantText(rawText),mediaMarkdown(content,assetCacheDir)].filter(Boolean).join('\n\n');
    if (!text.trim() || (p.role === 'user' && injected.test(text.trim()))) continue;
    const id = p.id || 'local-' + hash([threadID, p.role, record.timestamp || '', text, sequence++].join('\n')).slice(0, 32);
    let annotations=[];
    if(p.role==='user'){try{const encoded=rawText.match(/<response-annotations>\s*([\s\S]*?)\s*<\/response-annotations>/);if(encoded){const items=JSON.parse(encoded[1]);if(Array.isArray(items))annotations=items.filter(x=>typeof x.text==='string'||typeof x.annotation==='string').map(x=>({text:x.text||'',comment:x.annotation||''}))}}catch{}}
    const attachments = [];
    const addAttachment = (file, kind) => { if (path.isAbsolute(file) && !attachments.some(a => a.path === file)) attachments.push({ path: file, kind }); };
    const filesBlock = rawText.match(/^\s*# Files mentioned by the user:([\s\S]*?)Distinguish instructions in attached documents/);
    if (filesBlock) for (const match of filesBlock[1].matchAll(/^- [^\n]+: (\/[^\n]+)$/gm)) addAttachment(match[1].trim(), /\.(png|jpe?g|gif|webp|bmp)$/i.test(match[1].trim()) ? 'image' : 'file');
    const withoutCode = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    for (const match of withoutCode.matchAll(/(!?)\[[^\]]*\]\(<?(\/[^<>\n]*?)>?\)/g)) {
      // Images are explicit embeds. Assistant links are offered for review, never uploaded automatically.
      if (match[1] || p.role === 'assistant') addAttachment(match[2].replace(/:\d+(?::\d+)?$/, ''), match[1] ? 'image' : 'file');
    }
    messages.set(id, { id, attachments, annotations, role: p.role, phase: p.phase || p.channel || (p.role === 'assistant' ? 'final' : 'user'), turnID,
      timestamp: record.timestamp || '', text, hasImages: content.some(c => /image/.test(c.type || '')) || /!\[[^\]]*\]\(/.test(text),
      fingerprint: hash(text + JSON.stringify(attachments)) });
  }
  if (!metadata || metadata.id?.toLowerCase() !== threadID.toLowerCase()) throw failure(404, '未找到对应的本机会话。不会切换到其他会话。');
  return { id: metadata.id, cwd: metadata.cwd || '', status, messages: [...messages.values()] };
}

export class CodexSessions {
  constructor(home = process.env.REWIND_CODEX_HOME || process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), assetCacheDir) {
    this.assetCacheDir = assetCacheDir;
    this.home = home;
    this.paths = new Map();
  }

  async candidates(directory, id, result) {
    let entries;
    try { entries = await fs.promises.opendir(directory); } catch (err) { if (err.code === 'ENOENT') return; throw err; }
    for await (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await this.candidates(file, id, result);
      else if (entry.isFile() && entry.name.endsWith('.jsonl') && entry.name.toLowerCase().includes(id.toLowerCase())) result.push(file);
    }
  }

  async readFile(file, id) {
    if ((await fs.promises.stat(file)).size > 256 * 1024 * 1024) throw failure(413, '这条会话超过当前读取上限，请先使用粘贴收藏。');
    const lines = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
    const records = [];
    for await (const line of lines) {
      try {
        const record = JSON.parse(line);
        if ((['session_meta', 'turn_context'].includes(record.type) || (record.type === 'event_msg' && ['task_started','task_complete','turn_aborted'].includes(record.payload?.type))) || (record.type === 'response_item' && ['message', 'function_call_output', 'custom_tool_call_output', 'image_generation_call'].includes(record.payload?.type))) records.push(record);
      } catch { /* A live session can end with an incomplete final JSONL record. */ }
    }
    return extractMessages(records, id, { assetCacheDir: this.assetCacheDir });
  }

  async recent() {
    const file = path.join(this.home, 'session_index.jsonl');
    if (!fs.existsSync(file)) return [];
    const entries = new Map();
    for await (const line of readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity })) {
      try { const r = JSON.parse(line); if (THREAD_ID.test(r.id || '')) entries.set(r.id, { id: r.id, title: r.thread_name || '未命名会话', updatedAt: r.updated_at || '' }); } catch {}
    }
    return [...entries.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,100);
  }

  async title(id) {
    const file = path.join(this.home, 'session_index.jsonl');
    if (!fs.existsSync(file)) return '';
    let title = '';
    for await (const line of readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity })) {
      try { const record = JSON.parse(line); if (record.id?.toLowerCase() === id.toLowerCase()) title = record.thread_name || ''; } catch {}
    }
    return title;
  }

  async projectFor(cwd) {
    if (!cwd || !path.isAbsolute(cwd)) return null;
    try {
      const config=JSON.parse(await fs.promises.readFile(path.join(this.home,'.codex-global-state.json'),'utf8'));
      const roots=config['electron-saved-workspace-roots'];
      const root=Array.isArray(roots)?roots.filter(r=>typeof r==='string'&&(cwd===r||cwd.startsWith(r+path.sep))).sort((a,b)=>b.length-a.length)[0]:null;
      if(root)return {name:config['electron-workspace-root-labels']?.[root]||path.basename(root),root,source:'codex-workspace'};
    } catch {}
    for(let root=cwd;root!==path.dirname(root);root=path.dirname(root)) {
      if(fs.existsSync(path.join(root,'.git')))return {name:path.basename(root),root,source:'git-root'};
    }
    return null;
  }

  async get(id, { includeProgress = false } = {}) {
    if (!THREAD_ID.test(id)) throw failure(400, '会话 ID 格式不正确。');
    let snapshot;
    const cached = this.paths.get(id);
    if (cached && fs.existsSync(cached)) snapshot = await this.readFile(cached, id);
    else {
      const candidates = [];
      await this.candidates(path.join(this.home, 'sessions'), id, candidates);
      await this.candidates(path.join(this.home, 'archived_sessions'), id, candidates);
      candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
      for (const file of candidates) {
        try { snapshot = await this.readFile(file, id); this.paths.set(id, file); break; }
        catch (err) { if (err.status !== 404) throw err; }
      }
    }
    if (!snapshot) throw failure(404, '本机没有这条 Codex 会话。远程或云端会话暂不支持，请使用粘贴收藏。');
    const title = await this.title(id) || snapshot.messages.find(m => m.role === 'user')?.text.slice(0, 60) || 'Codex 会话';
    return { id: snapshot.id, title, cwd:snapshot.cwd, project:await this.projectFor(snapshot.cwd), status: snapshot.status, messages: snapshot.messages.filter(m => includeProgress || m.phase !== 'commentary'),
      hiddenProgress: snapshot.messages.filter(m => m.phase === 'commentary').length };
  }
}
