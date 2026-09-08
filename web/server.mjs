import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { CodexSessions, THREAD_ID } from './codex-sessions.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const referenceEpoch = 978307200;
const now = () => Date.now() / 1000 - referenceEpoch;
const version = clip => crypto.createHash('sha256').update(JSON.stringify(clip)).digest('hex').slice(0, 24);
const fields = ['title', 'body', 'note', 'question', 'source', 'sourceURL', 'topicID'];
const error = (status, message) => Object.assign(new Error(message), { status });
const defaultDir = path.join(os.homedir(), 'Library/Application Support/RewindWeb');
const defaultLegacy = path.join(os.homedir(), 'Library/Application Support/Rewind');
const date = value => new Date((value + referenceEpoch) * 1000).toLocaleDateString('zh-CN');

function atomicWrite(file, value) {
  const temporary = file + '.' + crypto.randomUUID() + '.tmp';
  try { fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 }); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

function loadLibrary(file) {
  if (!fs.existsSync(file)) return [];
  const clips = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(clips) || !clips.every(c => c && typeof c.id === 'string' && typeof c.body === 'string' && typeof c.title === 'string')) throw new Error('收藏库格式有误，已停止以避免覆盖原文件。');
  return clips;
}

export function markdown(c) {
  return [`# ${c.title}`, '', `来源：${c.source}`, `保存时间：${date(c.createdAt)}`,
    ...(c.provenance?.project ? [`项目：${c.provenance.project.name}`, `项目目录：${c.provenance.project.root}`] : []),
    ...(c.provenance?.cwd ? [`工作目录：${c.provenance.cwd}`] : []),
    ...(c.sourceURL ? ['', `会话链接：${c.sourceURL}`] : []),
    ...(c.question ? ['', '## 原问题', '', c.question] : []),
    ...(c.note ? ['', '## 我的备注', '', c.note] : []), '', '## 笔记原文', '', c.body,
    ...(c.attachment ? ['', `![笔记原图](attachments/${path.basename(c.attachment)})`] : []), ''].join('\n');
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}

// ZIP with uncompressed entries. No shell invocation or third-party dependency.
export function zip(entries) {
  const local = [], central = []; let offset = 0;
  for (const [name, value] of entries) {
    const filename = Buffer.from(name), data = Buffer.from(value), crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, data);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0x800, 8);
    directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(filename.length, 28); directory.writeUInt32LE(offset, 42);
    central.push(directory, filename); offset += header.length + filename.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

async function readJSON(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw error(415, '需要 JSON 请求。');
  let length = 0; const chunks = [];
  for await (const chunk of req) { length += chunk.length; if (length > 18 * 1024 * 1024) throw error(413, '内容太大，请使用 12 MB 以内的图片。'); chunks.push(chunk); }
  try { const data = JSON.parse(Buffer.concat(chunks).toString()); if (!data || Array.isArray(data) || typeof data !== 'object') throw Error(); return data; }
  catch { throw error(400, '请求内容无法解析。'); }
}

function validateFields(data) {
  for (const key of fields) if (key in data && (typeof data[key] !== 'string' || data[key].length > (key === 'body' ? 2_000_000 : 12_000))) throw error(400, `${key} 内容过长或格式错误。`);
}

function parseImage(value) {
  if (typeof value !== 'string') throw error(400, '图片格式错误。');
  const match = value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) throw error(400, '支持 PNG、JPEG、WebP 图片。');
  const data = Buffer.from(match[2], 'base64'), kind = match[1];
  if (!data.length || data.length > 12 * 1024 * 1024) throw error(413, '图片需要小于 12 MB。');
  const valid = kind === 'png' ? data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : kind === 'jpeg' ? data[0] === 255 && data[1] === 216 && data[2] === 255 : data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) throw error(400, '图片内容与格式不符。');
  return { data, extension: kind === 'jpeg' ? 'jpg' : kind };
}

export function createRewindServer({ dataDir = defaultDir, legacyDir = defaultLegacy, ocr = true, codexHome } = {}) {
  fs.mkdirSync(path.join(dataDir, 'attachments'), { recursive: true, mode: 0o700 });
  const file = path.join(dataDir, 'library.json');
  // A one-time copy keeps the earlier native prototype independent and intact.
  if (!fs.existsSync(file) && legacyDir && fs.existsSync(path.join(legacyDir, 'library.json'))) {
    const legacy = loadLibrary(path.join(legacyDir, 'library.json'));
    for (const c of legacy) if (c.attachment) {
      const name = path.basename(c.attachment);
      fs.copyFileSync(path.join(legacyDir, 'attachments', name), path.join(dataDir, 'attachments', name));
    }
    atomicWrite(file, legacy);
  }
  let clips = loadLibrary(file);
  const topicFile = path.join(dataDir, 'threads.json');
  let topics = fs.existsSync(topicFile) ? JSON.parse(fs.readFileSync(topicFile, 'utf8')) : [];
  if (!Array.isArray(topics) || topics.some(t => !t || typeof t.id !== 'string' || typeof t.title !== 'string' || typeof t.goal !== 'string')) throw Error('思路数据格式错误，已停止读取。');
  const publicTopic = t => ({ ...t, version: version(t) });
  const validateTopic = data => {
    if ('topicID' in data && data.topicID && !topics.some(t => t.id === data.topicID)) throw error(400, '这条思路不存在，请刷新后重试。');
  };
  const codex = new CodexSessions(codexHome);
  const commit = next => { atomicWrite(file, next); clips = next; };
  const publicClip = c => ({ ...c, version: version(c), date: date(c.createdAt), hasImage: !!c.attachment });
  const imagePath = name => path.join(dataDir, 'attachments', path.basename(name));

  function recognize(id) {
    const original = clips.find(c => c.id === id);
    if (!original || !original.attachment) return;
    if (!ocr || process.platform !== 'darwin') {
      commit(clips.map(c => c.id === id ? { ...c, ocrStatus: 'unavailable' } : c)); return;
    }
    execFile('/usr/bin/swift', [path.join(here, 'ocr.swift'), imagePath(original.attachment)], { timeout: 90000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      const current = clips.find(c => c.id === id);
      if (!current || current.deletedAt) return;
      let text = ''; try { if (!err) text = JSON.parse(stdout).text || ''; } catch { err = Error('OCR'); }
      const next = { ...current, ocrStatus: err ? 'failed' : text ? 'done' : 'empty' };
      if (!next.body && text) {
        next.body = text;
        if (next.title === '截图收藏') next.title = Array.from(text.split('\n').find(x => x.trim()) || '截图收藏').slice(0, 64).join('');
        next.updatedAt = now();
      }
      try { commit(clips.map(c => c.id === id ? next : c)); } catch (err) { console.error('OCR save failed:', err.message); }
    });
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    const send = (status, body, type = 'application/json; charset=utf-8') => { res.writeHead(status, { 'Content-Type': type }); res.end(type.startsWith('application/json') ? JSON.stringify(body) : body); };
    try {
      const port = server.address()?.port;
      if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(req.headers.host)) throw error(403, '仅接受本机访问。');
      const origin = `http://${req.headers.host}`;
      if (req.headers.origin && req.headers.origin !== origin) throw error(403, '拒绝跨站请求。');
      if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-rewind-request'] !== '1') throw error(403, '请求缺少本机页面标记。');
      const url = new URL(req.url, origin), pathname = url.pathname;
      if (req.method === 'GET' && pathname === '/favicon.svg') return send(200,fs.readFileSync(path.join(here,'favicon.svg')),'image/svg+xml');
      if (req.method === 'GET' && pathname === '/health') return send(200, { app: 'rewind-web', version: '0.2.0' });
      if (req.method === 'GET' && pathname === '/') return send(200, fs.readFileSync(path.join(here, 'index.html')), 'text/html; charset=utf-8');
      if (req.method === 'GET' && ['/threadline.css', '/threadline.js'].includes(pathname)) return send(200, fs.readFileSync(path.join(here, pathname.slice(1))), pathname.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8');
      if (pathname === '/api/threads' && req.method === 'POST') {
        const data = await readJSON(req);
        if (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 120 || typeof data.goal !== 'string' || data.goal.length > 12000) throw error(400, '请填写思路名称（最多 120 字）与有效的问题描述。');
        const topic = { id: crypto.randomUUID(), title: data.title.trim(), goal: data.goal, createdAt: now(), updatedAt: now() };
        const next = [topic, ...topics]; atomicWrite(topicFile, next); topics = next;
        return send(201, { topic: publicTopic(topic) });
      }
      const topicRoute = pathname.match(/^\/api\/threads\/([a-f0-9-]{36})$/);
      if (topicRoute && req.method === 'PUT') {
        const data = await readJSON(req), old = topics.find(t => t.id === topicRoute[1]);
        if (!old) throw error(404, '思路不存在。');
        if (data.version !== version(old)) throw error(409, '思路已在其他页面更新，请刷新后重试。');
        if (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 120 || typeof data.goal !== 'string' || data.goal.length > 12000) throw error(400, '名称或问题描述格式错误。');
        const topic = { ...old, title: data.title.trim(), goal: data.goal, updatedAt: now() };
        const next = topics.map(t => t.id === old.id ? topic : t); atomicWrite(topicFile, next); topics = next;
        return send(200, { topic: publicTopic(topic) });
      }
      if (pathname === '/api/local-resource' && ['GET','POST'].includes(req.method)) {
        if (req.headers['sec-fetch-site'] === 'cross-site') throw error(403, '拒绝跨站请求。');
        const requested = url.searchParams.get('path') || '';
        if (!path.isAbsolute(requested) || requested.includes('\0')) throw error(400, '无效的文件路径。');
        const sources = [];
        const thread = url.searchParams.get('thread');
        if (thread) sources.push(...(await codex.get(thread, {includeProgress:true})).messages.map(m=>m.text));
        const clip = clips.find(c=>c.id===url.searchParams.get('clip')&&!c.deletedAt);
        if (clip) sources.push(clip.body || '');
        const referenced = sources.some(text=>[...text.matchAll(/!?\[[^\]]*\]\((<[^>]+>|[^)]+)\)/g)].some(m=>m[1].replace(/^<|>$/g,'').trim()===requested));
        if (!referenced) throw error(404, '这段内容未引用该文件。');
        let stat;try {stat=fs.statSync(requested)} catch {throw error(404,'文件已移动或删除。')}
        if (req.method === 'POST') {
          await new Promise((resolve,reject)=>execFile('/usr/bin/open',['-R',requested],err=>err?reject(error(500,'无法在 Finder 中显示文件。')):resolve()));
          return send(200,{ok:true});
        }
        const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'}[path.extname(requested).toLowerCase()];
        if (!mime || !stat.isFile() || stat.size>25*1024*1024) throw error(415,'该文件不支持图片预览。');
        return send(200,fs.readFileSync(requested),mime);
      }
      if (req.method === 'GET' && pathname === '/api/codex/recent') return send(200, { sessions: await codex.recent() });
      const sessionRoute = pathname.match(/^\/api\/codex\/sessions\/([^/]+)$/);
      if (req.method === 'GET' && sessionRoute) {
        const session = await codex.get(sessionRoute[1], { includeProgress: url.searchParams.get('progress') === '1' });
        const saved = clips.filter(c=>!c.deletedAt&&c.provenance?.threadID===session.id).flatMap(c=>c.provenance.messages||[]);
        session.messages = session.messages.map(m=>({...m,saved:saved.some(old=>old.id===m.id || (old.fingerprint===m.fingerprint && old.role===m.role) || (m.timestamp && old.timestamp===m.timestamp && old.role===m.role))}));
        return send(200, { session });
      }
      if (req.method === 'POST' && pathname === '/api/codex/import') {
        const data = await readJSON(req);
        if (!THREAD_ID.test(data.threadID || '') || !Array.isArray(data.messageIDs) || !data.messageIDs.length || data.messageIDs.length > 100 || data.messageIDs.some(id => typeof id !== 'string')) throw error(400, '请选择 1 到 100 条消息。');
        if (new Set(data.messageIDs).size !== data.messageIDs.length) throw error(400, '消息选择有重复。');
        validateFields(data); validateTopic(data);
        const session = await codex.get(data.threadID, { includeProgress: data.includeProgress === true });
        const selected = session.messages.filter(m => data.messageIDs.includes(m.id));
        if (selected.length !== data.messageIDs.length) throw error(409, '部分消息已变化或不属于这条会话，请刷新后重新选择。');
        if (!data.fingerprints || selected.some(m => data.fingerprints[m.id] !== m.fingerprint)) throw error(409, '消息正文已变化，请刷新预览后重新选择。');
        const importedKey = crypto.createHash('sha256').update(JSON.stringify([session.id, selected.map(m => [m.id, m.fingerprint])])).digest('hex');
        const existing = clips.find(c => c.codexImportKey === importedKey && !c.deletedAt);
        if (existing) return send(200, { clip: publicClip(existing), duplicate: true });
        const body = selected.map(m => `### ${m.role === 'user' ? '我的问题' : m.phase === 'commentary' ? 'AI 过程消息' : 'AI 回答'}${m.timestamp ? ' · ' + m.timestamp.replace('T', ' ').replace(/\.\d+Z$/, ' UTC') : ''}\n\n${m.text}`).join('\n\n---\n\n');
        if (body.length > 2_000_000) throw error(413, '所选消息过长，请分批收藏。');
        const timestamp = now();
        const clip = { id: crypto.randomUUID().toUpperCase(), title: data.title?.trim() || session.title,
          body, topicID: data.topicID || '', note: data.note || '', question: '', source: 'Codex', sourceURL: `http://${req.headers.host}/?thread=${session.id}&view=import`,
          createdAt: timestamp, updatedAt: timestamp, codexImportKey: importedKey,
          provenance: { runtime: 'codex', threadID: session.id, threadTitle: session.title, cwd:session.cwd || '', project:session.project || null,
            messages: selected.map(m => ({ id: m.id, role: m.role, timestamp: m.timestamp, fingerprint: m.fingerprint })),
            imagesCopied: false, containsImageReferences: selected.some(m => m.hasImages) } };
        commit([clip, ...clips]);
        return send(201, { clip: publicClip(clip), duplicate: false });
      }
      if (req.method === 'GET' && pathname === '/api/library') {
        const query = url.searchParams.get('q') || '';
        const normalize = x => x.normalize('NFKC').toLocaleLowerCase();
        const terms = normalize(query).split(/\s+/).filter(Boolean);
        const active = clips.filter(c => !c.deletedAt);
        const matched = active.filter(c => terms.every(t => normalize(fields.map(k => c[k] || '').join('\n')).includes(t)));
        return send(200, { clips: matched.map(publicClip), total: clips.filter(c => !c.deletedAt).length, topics: topics.map(publicTopic), query });
      }
      if (req.method === 'POST' && pathname === '/api/clips') {
        const data = await readJSON(req); validateFields(data); validateTopic(data);
        if (!(data.body || '').trim() && !data.image) throw error(400, '先粘贴一段文字或添加图片。');
        let image;
        if (data.image) image = parseImage(data.image);
        const body = data.body || '', timestamp = now();
        const clip = { id: crypto.randomUUID().toUpperCase(), title: data.title || Array.from(body.split('\n').find(x => x.trim())?.replace(/^#+\s*/, '') || '截图收藏').slice(0, 64).join(''), body, topicID: data.topicID || '', note: data.note || '', question: data.question || '', sourceURL: data.sourceURL || '', source: data.source || '手动收藏', createdAt: timestamp, updatedAt: timestamp };
        if (image) { clip.attachment = crypto.randomUUID() + '.' + image.extension; clip.ocrStatus = body ? 'not-needed' : 'pending'; fs.writeFileSync(imagePath(clip.attachment), image.data, { mode: 0o600 }); }
        try { commit([clip, ...clips]); } catch (err) { if (clip.attachment) fs.unlinkSync(imagePath(clip.attachment)); throw err; }
        send(201, { clip: publicClip(clip) });
        if (clip.ocrStatus === 'pending') recognize(clip.id);
        return;
      }
      const route = pathname.match(/^\/api\/clips\/([A-Fa-f0-9-]{36})$/);
      if (route) {
        const existing = clips.find(c => c.id === route[1]);
        if (!existing) throw error(404, '收藏不存在。');
        if (req.method === 'PUT' && !route[2]) {
          const data = await readJSON(req); validateFields(data); validateTopic(data);
          if (existing.deletedAt) throw error(409, '笔记不存在。');
          if (data.version !== version(existing)) throw error(409, '这条收藏已在其他页面更新。请保留当前文字，刷新后再编辑。');
          const next = { ...existing, updatedAt: now() };
          for (const k of fields) if (k in data) next[k] = data[k];
          commit(clips.map(c => c.id === next.id ? next : c));
          return send(200, { clip: publicClip(next) });
        }
        if (req.method === 'DELETE') {
          commit(clips.filter(c=>c.id!==existing.id));
          if(existing.attachment && !clips.some(c=>c.attachment===existing.attachment)) {
            try { fs.unlinkSync(imagePath(existing.attachment)); } catch(err) { if(err.code!=='ENOENT')console.error('Attachment cleanup failed:',err.message); }
          }
          return send(200,{ok:true});
        }
      }
      if (req.method === 'GET' && pathname.startsWith('/api/attachments/')) {
        const name = decodeURIComponent(pathname.slice('/api/attachments/'.length));
        if (name !== path.basename(name) || !clips.some(c => c.attachment === name && !c.deletedAt)) throw error(404, '图片不存在。');
        const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' }[path.extname(name)] || 'application/octet-stream';
        return send(200, fs.readFileSync(imagePath(name)), mime);
      }
      if (req.method === 'GET' && pathname.startsWith('/api/export/')) {
        const id = pathname.slice('/api/export/'.length), selection = clips.filter(c => !c.deletedAt && (id === 'all' || c.id === id));
        if (!selection.length) throw error(404, '没有可导出的收藏。');
        const entries = [];
        const includedTopics = topics.filter(t => id === 'all' || selection.some(c => c.topicID === t.id));
        entries.push(['threadline.json', Buffer.from(JSON.stringify({ topics: includedTopics, notes: selection }, null, 2))]);
        for (const c of selection) {
          const safeTitle = Array.from(c.title.replace(/[\/\\:?%*|"<>\r\n]/g, '-')).slice(0, 24).join('');
          entries.push([`${safeTitle}-${c.id}.md`, Buffer.from(markdown(c))]);
          if (c.attachment) entries.push([`attachments/${path.basename(c.attachment)}`, fs.readFileSync(imagePath(c.attachment))]);
        }
        res.setHeader('Content-Disposition', 'attachment; filename="Threadline-export.zip"');
        return send(200, zip(entries), 'application/zip');
      }
      throw error(404, '页面不存在。');
    } catch (err) { if (!res.headersSent) send(err.status || 500, { error: err.status ? err.message : '本机保存或读取失败，原数据未被清空。' }); }
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createRewindServer({ dataDir: process.env.REWIND_WEB_DATA_DIR || defaultDir });
  const port = Number(process.env.REWIND_WEB_PORT || 43127);
  server.on('error', err => { console.error(err.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Rewind: http://127.0.0.1:${port}`));
}
