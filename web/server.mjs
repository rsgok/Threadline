import { cardThemes } from './card-themes.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { CodexSessions, THREAD_ID } from './codex-sessions.mjs';
import { CursorSessions } from './cursor-sessions.mjs';
import { archiveAssets, portableBody } from './session-assets.mjs';
import { Sharing } from './sharing.mjs';
import { CardRenderer } from './card-renderer.mjs';
import { LibraryStore } from './storage.mjs';
import { createFeishu, buildDiscussionCards, discussionAttachments, readSharedAttachment } from './feishu.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const referenceEpoch = 978307200;
const now = () => Date.now() / 1000 - referenceEpoch;
const version = clip => crypto.createHash('sha256').update(JSON.stringify(clip)).digest('hex').slice(0, 24);
const fields = ['title', 'body', 'note', 'question', 'source', 'sourceURL', 'topicID'];
const error = (status, message) => Object.assign(new Error(message), { status });
const defaultDir = path.join(os.homedir(), 'Library/Application Support/RewindWeb');
const defaultLegacy = path.join(os.homedir(), 'Library/Application Support/Rewind');
const date = value => new Date((value + referenceEpoch) * 1000).toLocaleDateString('zh-CN');

export function markdown(c) {
  return [`# ${c.title}`, '', `来源：${c.source}`, `保存时间：${date(c.createdAt)}`,
    ...(c.provenance?.project ? [`项目：${c.provenance.project.name}`, `项目目录：${c.provenance.project.root}`] : []),
    ...(c.provenance?.cwd ? [`工作目录：${c.provenance.cwd}`] : []),
    ...(c.sourceURL ? ['', `会话链接：${c.sourceURL}`] : []),
    ...(c.review ? ['', '## 核实状态', '', `${c.review.status} · ${c.review.at}`, c.review.reason] : []),
    ...(c.question ? ['', '## 原问题', '', c.question] : []),
    ...(c.note ? ['', '## 我的备注', '', c.note] : []), '', '## 笔记原文', '', portableBody(c),
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

export function createRewindServer({ dataDir = defaultDir, legacyDir = defaultLegacy, ocr = true, codexHome, cursorHome, feishu: feishuOverride } = {}) {
  fs.mkdirSync(path.join(dataDir, 'attachments'), { recursive: true, mode: 0o700 });
  const store = new LibraryStore(dataDir, legacyDir);
  const publicTopic = t => ({ ...t, version: version(t) });
  const validateTopic = data => {
    if ('topicID' in data && data.topicID && !store.topic(data.topicID)) throw error(400, '这条思路不存在，请刷新后重试。');
  };
  const codex = new CodexSessions(codexHome, path.join(dataDir, 'session-assets'));
  const cursor = new CursorSessions(cursorHome, path.join(dataDir, 'session-assets'));
  const provider = runtime => { if (!runtime || runtime==='codex') return codex; if(runtime==='cursor')return cursor; throw error(400,'不支持的 Runtime。'); };
  const feishu = feishuOverride || createFeishu({ dataDir });
  const previews = new Map();
  const sharing = new Sharing({ dataDir });
  const cardRenderer = new CardRenderer({ dataDir, sharing });
  async function selectedDiscussion(data) {
    if (!THREAD_ID.test(data.threadID || '') || !Array.isArray(data.messageIDs) || !data.messageIDs.length || data.messageIDs.length > 100 || new Set(data.messageIDs).size !== data.messageIDs.length) throw error(400, '请选择 1 到 100 条消息。');
    const session = await provider(data.runtime).get(data.threadID, { includeProgress: data.includeProgress === true });
    const selected = session.messages.filter(m => data.messageIDs.includes(m.id));
    if (selected.length !== data.messageIDs.length || !data.fingerprints || selected.some(m => data.fingerprints[m.id] !== m.fingerprint)) throw error(409, '消息已变化，请刷新后重新选择。');
    return { session, selected };
  }
  const publicClip = c => ({ ...c, version: version(c), date: date(c.createdAt), hasImage: !!c.attachment });
  const imagePath = name => path.join(dataDir, 'attachments', path.basename(name));

  function preserveAttachments(clip, selected) {
    const archived = archiveAssets(selected, dataDir);
    clip.assets = archived.assets;
    clip.assetWarnings = archived.warnings;
    clip.provenance.imagesCopied = selected.some(m => m.hasImages) && !archived.warnings.length && archived.assets.some(a => a.kind === 'image');
    clip.provenance.filesCopied = archived.assets.length;
    try { store.put(clip); }
    catch (err) { for (const a of clip.assets) { try { fs.unlinkSync(imagePath(a.storedName)); } catch {} } throw err; }
  }

  function recognize(id) {
    const original = store.get(id);
    if (!original || !original.attachment) return;
    if (!ocr || process.platform !== 'darwin') {
      store.put({ ...original, ocrStatus: 'unavailable' }); return;
    }
    execFile('/usr/bin/swift', [path.join(here, 'ocr.swift'), imagePath(original.attachment)], { timeout: 90000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      const current = store.get(id);
      if (!current || current.deletedAt) return;
      let text = ''; try { if (!err) text = JSON.parse(stdout).text || ''; } catch { err = Error('OCR'); }
      const next = { ...current, ocrStatus: err ? 'failed' : text ? 'done' : 'empty' };
      if (!next.body && text) {
        next.body = text;
        if (next.title === '截图收藏') next.title = Array.from(text.split('\n').find(x => x.trim()) || '截图收藏').slice(0, 64).join('');
        next.updatedAt = now();
      }
      try { store.put(next); } catch (err) { console.error('OCR save failed:', err.message); }
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
      if (req.method === 'GET' && ['/assets/threadline-icon.png','/assets/user-avatar.png','/assets/codex-avatar.png','/assets/cursor-avatar.png'].includes(pathname)) return send(200,fs.readFileSync(path.join(here,pathname)),'image/png');
      if (req.method === 'GET' && pathname === '/favicon.svg') return send(200,fs.readFileSync(path.join(here,'assets','threadline-icon.png')),'image/png');
      if (req.method === 'POST' && pathname === '/api/app/open') {
        if (process.platform !== 'darwin') throw error(400, '此入口用于打开 Mac 应用');
        const app = [path.join(os.homedir(), 'Applications/Threadline.app'), '/Applications/Threadline.app'].find(file => fs.existsSync(file));
        if (!app) throw error(404, '尚未安装 Threadline 应用，请先运行安装脚本');
        await new Promise((resolve, reject) => execFile('/usr/bin/open', [app], err => err ? reject(error(500, '无法打开 Threadline 应用')) : resolve()));
        return send(200, { opened: true });
      }
      if (req.method === 'GET' && pathname === '/health') return send(200, { app: 'rewind-web', version: '0.2.0' });
      if (req.method === 'GET' && ['/landing', '/landing/', '/landing.html'].includes(pathname)) return send(200, fs.readFileSync(path.join(here, 'landing.html')), 'text/html; charset=utf-8');
      if (req.method === 'GET' && ['/landing.css', '/landing.js'].includes(pathname)) return send(200, fs.readFileSync(path.join(here, pathname.slice(1))), pathname.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8');
      if (req.method === 'GET' && pathname === '/') return send(200, fs.readFileSync(path.join(here, 'index.html')), 'text/html; charset=utf-8');
      if (req.method === 'GET' && pathname === '/api/share/card-themes') return send(200, { themes: cardThemes });
      if (req.method === 'GET' && ['/i18n.js', '/i18n-catalog.js', '/threadline.css', '/buttons.css', '/threadline.js', '/feishu-ui.js', '/feishu.css', '/sharing-ui.js', '/sharing.css'].includes(pathname)) return send(200, fs.readFileSync(path.join(here, pathname.slice(1))), pathname.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8');
      if (pathname.startsWith('/api/share/')) {
        if (req.headers['sec-fetch-site'] === 'cross-site') throw error(403, '拒绝跨站请求。');
        if (req.method === 'GET' && pathname === '/api/share/status') return send(200, sharing.status());
        if (req.method === 'GET' && pathname === '/api/share/channels') return send(200, await sharing.channels(url.searchParams.get('cursor') || ''));
        if (req.method === 'GET' && pathname === '/api/share/history') return send(200, { jobs: sharing.history() });
        if (req.method === 'POST' && pathname === '/api/share/connect') return send(200, await sharing.connect(await readJSON(req)));
        if (req.method === 'POST' && pathname === '/api/share/disconnect') return send(200, sharing.disconnect((await readJSON(req)).platform));
        if (req.method === 'POST' && pathname === '/api/share/preview') {
          const data = await readJSON(req), { session, selected } = await selectedDiscussion(data);
          return send(201, sharing.prepare({ session, selected, platform: data.platform, target: data.target, note: data.note, attachmentIDs: data.attachmentIDs, cardTheme: data.cardTheme, cardMode: data.cardMode, locale: data.locale }));
        }
        const renderRoute = pathname.match(/^\/api\/share\/jobs\/([a-f0-9-]{36})\/render(?:\/(cancel|pages)(?:\/(\d+))?)?$/);
        if (renderRoute) {
          const [, id, action, pageNumber] = renderRoute;
          if (!action && req.method === 'POST') return send(202, cardRenderer.start(id));
          if (!action && req.method === 'GET') return send(200, cardRenderer.status(id));
          if (action === 'cancel' && req.method === 'POST') return send(200, cardRenderer.cancel(id));
          if (action === 'pages' && req.method === 'GET') {
            const status = cardRenderer.status(id), index = Number(pageNumber);
            if (status.phase !== 'done' || !Number.isInteger(index) || index < 0 || index >= status.total) throw error(404, '图卡页面不存在');
            return send(200, fs.readFileSync(cardRenderer.pageFile(id, index)), 'image/png');
          }
          throw error(404, '图卡操作不存在');
        }
        const shareRoute = pathname.match(/^\/api\/share\/jobs\/([a-f0-9-]{36})(?:\/(send|resolve|export|cards|assets|thumbnails)(?:\/([a-f0-9]{24}))?)?$/);
        if (shareRoute) {
          const [, id, action, assetId] = shareRoute;
          if (!action && req.method === 'GET') return send(200, sharing.public(sharing.load(id)));
          if (action === 'send' && req.method === 'POST') return send(200, await sharing.send(id));
          if (action === 'resolve' && req.method === 'POST') { const d = await readJSON(req); return send(200, sharing.resolve(id, d.stepId, d.delivered)); }
          if (action === 'thumbnails' && req.method === 'GET') { const a = sharing.thumbnail(id, assetId); return send(200, a.bytes, a.mime); }
          if (action === 'assets' && req.method === 'GET') { const a = sharing.asset(id, assetId); return send(200, a.bytes, a.mime); }
          if (action === 'export' && req.method === 'GET') { res.setHeader('Content-Disposition', 'attachment; filename="Threadline-share.zip"'); return send(200, zip(sharing.exportEntries(id)), 'application/zip'); }
          if (action === 'cards' && req.method === 'POST') {
            const d = await readJSON(req), job = sharing.load(id);
            if (cardRenderer.active?.id === id) throw error(409, '图卡正在生成');
            delete job.cardEngine;
            if (!Number.isInteger(d.index) || !Number.isInteger(d.total) || d.index < 0 || d.index >= d.total || d.total > 200) throw error(400, '图卡页码无效');
            if (d.index === 0) job.cardPages = [];
            const image = parseImage(d.image); if (image.extension !== 'png') throw error(400, '图卡需要 PNG 格式');
            const file = path.join(path.dirname(sharing.file(id)), 'card-' + d.index + '.png');
            fs.writeFileSync(file, image.data, { mode: 0o600 }); job.cardCount = d.total; job.cardPages = [...new Set([...(job.cardPages || []), d.index])]; sharing.save(job);
            return send(200, { saved: true });
          }
          if (action === 'cards' && req.method === 'GET') {
            const job = sharing.load(id); if (!job.cardCount || Array.from({length:job.cardCount}, (_,i)=>i).some(i=>!job.cardPages?.includes(i))) throw error(409, '请先生成完整图卡');
            const entries = Array.from({length:job.cardCount}, (_,i)=>['Threadline-'+String(i+1).padStart(3,'0')+'.png', fs.readFileSync(job.cardEngine === 'chromium-v1' ? cardRenderer.pageFile(id, i) : path.join(path.dirname(sharing.file(id)), 'card-'+i+'.png'))]);
            res.setHeader('Content-Disposition', 'attachment; filename="Threadline-cards.zip"'); return send(200, zip(entries), 'application/zip');
          }
        }
        throw error(404, '分享接口不存在');
      }
      if (pathname === '/api/feishu/status' && req.method === 'GET') return send(200, await feishu.status(url.searchParams.get('refresh') === '1'));
      if (pathname === '/api/feishu/users' && req.method === 'GET') return send(200, await feishu.users(url.searchParams.get('q') || ''));
      if (pathname === '/api/feishu/chats' && req.method === 'GET') return send(200, await feishu.chats((url.searchParams.get('q') || '').slice(0, 100), (url.searchParams.get('page') || '').slice(0, 2000)));
      if (pathname.startsWith('/api/feishu/') && req.method === 'POST') {
        const data = await readJSON(req);
        if (pathname === '/api/feishu/create') return send(202, await feishu.create());
        if (pathname === '/api/feishu/bind') return send(200, await feishu.bind(data));
        if (pathname === '/api/feishu/permissions') return send(202, await feishu.permissions(data.kind));
        if (pathname === '/api/feishu/authorize') return send(202, await feishu.authorize(data.contacts === true));
        if (pathname === '/api/feishu/cancel') return send(200, feishu.cancel());
        if (pathname === '/api/feishu/disconnect') return send(200, await feishu.disconnect());
        if (pathname === '/api/feishu/preview') {
          if (typeof data.note !== 'string' || data.note.length > 2000) throw error(400, '附言最多 2000 字。');
          const { session, selected } = await selectedDiscussion(data);
          const attachments = discussionAttachments(selected);
          const attachmentIDs = data.attachmentIDs || [];
          if (!Array.isArray(attachmentIDs) || new Set(attachmentIDs).size !== attachmentIDs.length || attachmentIDs.some(id => !attachments.some(a => a.id === id && a.available))) throw error(400, '请只选择预览中可用的附件。');
          const chosen = attachments.filter(a => attachmentIDs.includes(a.id));
          if (chosen.reduce((n, a) => n + a.size, 0) > 100 * 1024 * 1024) throw error(413, '附件总量超过 100 MB，请分批发送。');
          if (selected.some(m => chosen.filter(a => a.messageId === m.id && a.kind === 'image').length > 8)) throw error(413, '同一条消息最多上传 8 张图片，请减少附件选择。');
          const shared = selected.map(m => {
            let body = m.text;
            const associated = attachments.filter(a => a.messageId === m.id);
            for (const a of associated) { body = body.replace(/!?\[[^\]]*\]\(<?([^<>\n]*?)>?\)/g, (raw, dest) => dest === a.path ? '' : raw); body = body.split(a.path).join(a.name); }
            const notes = associated.filter(a => a.kind !== 'image' || !attachmentIDs.includes(a.id)).map(a => `附件：${a.name}（${attachmentIDs.includes(a.id) ? '文件单独发送' : '未发送'}）`);
            return { ...m, runtime:data.runtime||'codex', text: [body.trim(), ...notes].filter(Boolean).join('\n\n'), imageCount: chosen.filter(a => a.messageId === m.id && a.kind === 'image').length };
          });
          const text = [data.note.trim(), '讨论摘录 · ' + session.title, ...shared.map(m => (m.role === 'user' ? '【我】' : m.phase === 'commentary' ? '【AI · 过程】' : data.runtime==='cursor'?'【Cursor】':'【Codex】') + '\n' + m.text)].filter(Boolean).join('\n\n');
          for (const [id, p] of previews) if (p.expires < Date.now()) previews.delete(id);
          if (previews.size >= 100) throw error(429, '预览过多，请稍后重试。');
          const id = crypto.randomUUID();
          const cards = buildDiscussionCards({ title: session.title, messages: shared, note: data.note });
          previews.set(id, { text, cards, shared, title: session.title, note: data.note, attachments: chosen, uploads: {}, fileReceipts: [], receipts: [], selection: data, expires: Date.now() + 20 * 60 * 1000 });
          return send(200, { id, text, attachments: attachments.map(({ digest, ...a }) => a), fileCount: chosen.filter(a => a.kind === 'file').length, cardCount: cards.length, count: selected.length, hasImages: selected.some(m => m.hasImages) });
        }
        if (pathname === '/api/feishu/send') {
          const preview = previews.get(data.previewId);
          if (!preview || preview.expires < Date.now()) throw error(409, '预览已过期，请重新预览后发送。');
          await selectedDiscussion(preview.selection);
          const target = data.target ?? (data.chatId ? 'group' : 'self');
          if (!['self', 'user', 'group'].includes(target)) throw error(400, '发送目标无效。');
          const destination = target === 'self' ? 'self' : target === 'user' ? 'user:' + data.userId : 'group:' + data.chatId;
          if (preview.destination && preview.destination !== destination) throw error(409, '发送已开始，请保持原收件人重试。');
          if (preview.receipt) { if (preview.destination !== destination) throw error(409, '这份摘录已发送，请重新预览后选择其他群。'); return send(200, preview.receipt); }
          if (preview.sending) throw error(409, '正在发送，请等待结果。');
          preview.sending = true;
          preview.destination = destination;
          try {
            // Verify all chosen bytes before uploading anything on the first attempt.
            if (!Object.keys(preview.uploads).length) for (const a of preview.attachments) {
              try { if (readSharedAttachment(a).digest !== a.digest) throw Error(); } catch { throw error(409, '附件已变化或不可读取，请重新预览：' + a.name); }
            }
            for (const a of preview.attachments) if (!preview.uploads[a.id]) preview.uploads[a.id] = await feishu.upload(a);
            if (!preview.receipts.length) preview.cards = buildDiscussionCards({ title: preview.title, note: preview.note, messages: preview.shared.map(m => ({ ...m, imageKeys: preview.attachments.filter(a => a.messageId === m.id && a.kind === 'image').map(a => ({ key: preview.uploads[a.id], name: a.name })) })) });
            for (let i = preview.receipts.length; i < preview.cards.length; i++) {
              const requestId = crypto.createHash('sha256').update(data.previewId + ':' + i).digest('hex').slice(0, 36).padEnd(36, '0');
              preview.receipts.push(await feishu.send({ target, userId: data.userId, chatId: data.chatId, text: preview.text, card: preview.cards[i], requestId }));
            }
            const files = preview.attachments.filter(a => a.kind === 'file');
            for (let i = preview.fileReceipts.length; i < files.length; i++) {
              const requestId = crypto.createHash('sha256').update(data.previewId + ':file:' + i).digest('hex').padEnd(36, '0').slice(0, 36);
              preview.fileReceipts.push(await feishu.send({ target, userId: data.userId, chatId: data.chatId, fileKey: preview.uploads[files[i].id], requestId }));
            }
            preview.receipt = { fileCount: preview.fileReceipts.length, ...preview.receipts.at(-1), sentCount: preview.receipts.length, cardCount: preview.cards.length };
            return send(200, preview.receipt);
          } catch (e) { throw error(e.status || 502, `已发送 ${preview.receipts.length}/${preview.cards.length} 张卡片、${preview.fileReceipts.length} 个文件。${e.message} 保持当前预览重试，将从未成功的卡片继续。`); }
          finally { preview.sending = false; }
        }
      }
      if (pathname === '/api/threads' && req.method === 'POST') {
        const data = await readJSON(req);
        if (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 120 || typeof data.goal !== 'string' || data.goal.length > 12000) throw error(400, '请填写思路名称（最多 120 字）与有效的问题描述。');
        const topic = { id: crypto.randomUUID(), title: data.title.trim(), goal: data.goal, createdAt: now(), updatedAt: now() };
        store.putTopic(topic);
        return send(201, { topic: publicTopic(topic) });
      }
      const topicRoute = pathname.match(/^\/api\/threads\/([a-f0-9-]{36})$/);
      if (topicRoute && req.method === 'PUT') {
        const data = await readJSON(req), old = store.topic(topicRoute[1]);
        if (!old) throw error(404, '思路不存在。');
        if (data.version !== version(old)) throw error(409, '思路已在其他页面更新，请刷新后重试。');
        if (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 120 || typeof data.goal !== 'string' || data.goal.length > 12000) throw error(400, '名称或问题描述格式错误。');
        const topic = { ...old, title: data.title.trim(), goal: data.goal, updatedAt: now() };
        store.putTopic(topic);
        return send(200, { topic: publicTopic(topic) });
      }
      if (pathname === '/api/local-resource' && ['GET','POST'].includes(req.method)) {
        if (req.headers['sec-fetch-site'] === 'cross-site') throw error(403, '拒绝跨站请求。');
        const requested = url.searchParams.get('path') || '';
        if (!path.isAbsolute(requested) || requested.includes('\0')) throw error(400, '无效的文件路径。');
        const sources = [];
        const thread = url.searchParams.get('thread');

        const clip = store.get(url.searchParams.get('clip') || '');
        if (clip && !clip.deletedAt) sources.push(clip.body || '');
        const references = text=>[...text.matchAll(/!?\[[^\]]*\]\((<[^>]+>|[^)]+)\)/g)].some(m=>m[1].replace(/^<|>$/g,'').trim().replace(/:\d+(?::\d+)?$/, '')===requested.replace(/:\d+(?::\d+)?$/, ''));
        if (!sources.some(references) && !clip?.assets?.some(a => a.originalPath === requested) && thread) sources.push(...(await provider(url.searchParams.get('runtime')).get(thread, {includeProgress:true})).messages.map(m=>m.text));
        const referenced = sources.some(references) || (clip && !clip.deletedAt && clip.assets?.some(a => a.originalPath === requested));
        if (!referenced) throw error(404, '这段内容未引用该文件。');
        const savedAsset = clip && !clip.deletedAt && clip.assets?.find(a => a.originalPath === requested.replace(/:\d+(?::\d+)?$/, ''));
        const resourcePath = savedAsset ? imagePath(savedAsset.storedName) : requested.replace(/:\d+(?::\d+)?$/, '');
        let stat;try {stat=fs.statSync(resourcePath)} catch {throw error(404,'文件已移动或删除。')}
        if (req.method === 'POST') {
          await new Promise((resolve,reject)=>execFile('/usr/bin/open',['-R',resourcePath],err=>err?reject(error(500,'无法在 Finder 中显示文件。')):resolve()));
          return send(200,{ok:true});
        }
        const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'}[path.extname(resourcePath).toLowerCase()];
        if (!mime || !stat.isFile() || stat.size>25*1024*1024) throw error(415,'该文件不支持图片预览。');
        return send(200,fs.readFileSync(resourcePath),mime);
      }
      if (req.method === 'GET' && pathname === '/api/sessions/recent') {
        const results=await Promise.allSettled([codex.recent(),cursor.recent()]);
        const sessions=results.flatMap((r,i)=>r.status==='fulfilled'?r.value.map(s=>({...s,runtime:i?'cursor':'codex'})):[]);
        return send(200,{sessions:sessions.sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')),
          errors:results.flatMap((r,i)=>r.status==='rejected'?[{runtime:i?'cursor':'codex',message:r.reason.message}]:[])});
      }
      if (req.method === 'GET' && /^\/api\/(codex|cursor)\/recent$/.test(pathname)) return send(200, { sessions: await provider(pathname.split('/')[2]).recent() });
      const sessionRoute = pathname.match(/^\/api\/(codex|cursor)\/sessions\/([^/]+)$/);
      if (req.method === 'GET' && sessionRoute) {
        const session = await provider(sessionRoute[1]).get(sessionRoute[2], { includeProgress: url.searchParams.get('progress') === '1' });
        session.runtime=sessionRoute[1];
        const saved = store.by('provenance.threadID', session.id).filter(c=>(c.provenance.runtime||'codex')===session.runtime).flatMap(c=>c.provenance.messages||[]);
        session.messages = session.messages.map(m=>({...m,saved:saved.some(old=>old.id===m.id || (old.fingerprint===m.fingerprint && old.role===m.role) || (m.timestamp && old.timestamp===m.timestamp && old.role===m.role))}));
        return send(200, { session });
      }
      if (req.method === 'POST' && /^\/api\/(codex|cursor)\/import$/.test(pathname)) {
        const data = await readJSON(req);
        data.runtime=pathname.split('/')[2];
        if (!THREAD_ID.test(data.threadID || '') || !Array.isArray(data.messageIDs) || !data.messageIDs.length || data.messageIDs.length > 100 || data.messageIDs.some(id => typeof id !== 'string')) throw error(400, '请选择 1 到 100 条消息。');
        if (new Set(data.messageIDs).size !== data.messageIDs.length) throw error(400, '消息选择有重复。');
        validateFields(data); validateTopic(data);
        const session = await provider(data.runtime).get(data.threadID, { includeProgress: data.includeProgress === true });
        const selected = session.messages.filter(m => data.messageIDs.includes(m.id));
        if (selected.length !== data.messageIDs.length) throw error(409, '部分消息已变化或不属于这条会话，请刷新后重新选择。');
        if (!data.fingerprints || selected.some(m => data.fingerprints[m.id] !== m.fingerprint)) throw error(409, '消息正文已变化，请刷新预览后重新选择。');
        const importedKey = crypto.createHash('sha256').update(JSON.stringify([...(data.runtime==='cursor'?['cursor']:[]),session.id, selected.map(m => [m.id, m.fingerprint])])).digest('hex');
        const existing = store.by('codexImportKey', importedKey)[0];
        if (existing) {
          if (!Array.isArray(existing.assets)) { existing.updatedAt = now(); preserveAttachments(existing, selected); }
          return send(200, { clip: publicClip(existing), duplicate: true });
        }
        const body = selected.map(m => `### ${m.role === 'user' ? '我的问题' : m.phase === 'commentary' ? 'AI 过程消息' : 'AI 回答'}${m.timestamp ? ' · ' + m.timestamp.replace('T', ' ').replace(/\.\d+Z$/, ' UTC') : ''}\n\n${m.text}`).join('\n\n---\n\n');
        if (body.length > 2_000_000) throw error(413, '所选消息过长，请分批收藏。');
        const timestamp = now();
        const clip = { id: crypto.randomUUID().toUpperCase(), title: data.title?.trim() || session.title,
          body, topicID: data.topicID || '', note: data.note || '', question: '', source: data.runtime==='cursor'?'Cursor':'Codex', sourceURL: `http://${req.headers.host}/?thread=${session.id}&runtime=${data.runtime}&view=import`,
          createdAt: timestamp, updatedAt: timestamp, codexImportKey: importedKey,
          provenance: { runtime: data.runtime, threadID: session.id, threadTitle: session.title, cwd:session.cwd || '', project:session.project || null,
            messages: selected.map(m => ({ id: m.id, role: m.role, timestamp: m.timestamp, fingerprint: m.fingerprint })),
            imagesCopied: false, containsImageReferences: selected.some(m => m.hasImages) } };
        preserveAttachments(clip, selected);
        return send(201, { clip: publicClip(clip), duplicate: false });
      }
      if (req.method === 'GET' && pathname === '/api/library') {
        const query = url.searchParams.get('q') || '';
        return send(200, { clips: store.list(query).map(publicClip), total: store.count(), topics: store.topics().map(publicTopic), query });
      }
      if (req.method === 'POST' && pathname === '/api/clips') {
        const data = await readJSON(req); validateFields(data); validateTopic(data);
        if (!(data.body || '').trim() && !data.image) throw error(400, '先粘贴一段文字或添加图片。');
        let image;
        if (data.image) image = parseImage(data.image);
        const body = data.body || '', timestamp = now();
        const clip = { id: crypto.randomUUID().toUpperCase(), title: data.title || Array.from(body.split('\n').find(x => x.trim())?.replace(/^#+\s*/, '') || '截图收藏').slice(0, 64).join(''), body, topicID: data.topicID || '', note: data.note || '', question: data.question || '', sourceURL: data.sourceURL || '', source: data.source || '手动收藏', createdAt: timestamp, updatedAt: timestamp };
        if (image) { clip.attachment = crypto.randomUUID() + '.' + image.extension; clip.ocrStatus = body ? 'not-needed' : 'pending'; fs.writeFileSync(imagePath(clip.attachment), image.data, { mode: 0o600 }); }
        try { store.put(clip); } catch (err) { if (clip.attachment) fs.unlinkSync(imagePath(clip.attachment)); throw err; }
        send(201, { clip: publicClip(clip) });
        if (clip.ocrStatus === 'pending') recognize(clip.id);
        return;
      }
      const reviewRoute = pathname.match(/^\/api\/clips\/([A-Fa-f0-9-]{36})\/review$/);
      if (reviewRoute && req.method === 'POST') {
        const data = await readJSON(req), old = store.get(reviewRoute[1]);
        if (!old || old.deletedAt) throw error(404, '笔记不存在。');
        if (data.version !== version(old)) throw error(409, '笔记已变化，请重新读取后再标记。');
        if (!['outdated', 'updated'].includes(data.status) || typeof data.reason !== 'string' || !data.reason.trim() || data.reason.length > 12000) throw error(400, '请选择已过时或已更新，并填写原因（最多 12000 字）。');
        const review = { status: data.status, reason: data.reason.trim(), at: new Date().toISOString() };
        const next = { ...old, review, reviewHistory: [...(old.reviewHistory || []), review], updatedAt: now() };
        store.put(next);
        return send(200, { clip: publicClip(next) });
      }
      const route = pathname.match(/^\/api\/clips\/([A-Fa-f0-9-]{36})$/);
      if (route) {
        const existing = store.get(route[1]);
        if (!existing) throw error(404, '收藏不存在。');
        if (req.method === 'PUT' && !route[2]) {
          const data = await readJSON(req); validateFields(data); validateTopic(data);
          const existing = store.get(route[1]);
          if (!existing || existing.deletedAt) throw error(409, '笔记不存在。');
          if (data.version !== version(existing)) throw error(409, '这条收藏已在其他页面更新。请保留当前文字，刷新后再编辑。');
          const next = { ...existing, updatedAt: now() };
          for (const k of fields) if (k in data) next[k] = data[k];
          store.put(next);
          return send(200, { clip: publicClip(next) });
        }
        if (req.method === 'DELETE') {
          store.remove(existing.id);
          for (const a of existing.assets || []) { try { fs.unlinkSync(imagePath(a.storedName)); } catch (err) { if (err.code !== 'ENOENT') console.error('Attachment cleanup failed:', err.message); } }
          if(existing.attachment && !store.by('attachment', existing.attachment, false).length) {
            try { fs.unlinkSync(imagePath(existing.attachment)); } catch(err) { if(err.code!=='ENOENT')console.error('Attachment cleanup failed:',err.message); }
          }
          return send(200,{ok:true});
        }
      }
      if (req.method === 'GET' && pathname.startsWith('/api/attachments/')) {
        const name = decodeURIComponent(pathname.slice('/api/attachments/'.length));
        if (name !== path.basename(name) || !store.by('attachment', name).length) throw error(404, '图片不存在。');
        const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' }[path.extname(name)] || 'application/octet-stream';
        return send(200, fs.readFileSync(imagePath(name)), mime);
      }
      if (req.method === 'GET' && pathname.startsWith('/api/export/')) {
        const id = pathname.slice('/api/export/'.length), selection = (id === 'all' ? store.list() : [store.get(id)].filter(c => c && !c.deletedAt));
        if (!selection.length) throw error(404, '没有可导出的收藏。');
        const entries = [];
        const includedTopics = store.topics().filter(t => id === 'all' || selection.some(c => c.topicID === t.id));
        entries.push(['threadline.json', Buffer.from(JSON.stringify({ topics: includedTopics, notes: selection }, null, 2))]);
        for (const c of selection) {
          const safeTitle = Array.from(c.title.replace(/[\/\\:?%*|"<>\r\n]/g, '-')).slice(0, 24).join('');
          entries.push([`${safeTitle}-${c.id}.md`, Buffer.from(markdown(c))]);
          for (const a of c.assets || []) entries.push([`attachments/${a.storedName}`, fs.readFileSync(imagePath(a.storedName))]);
          if (c.attachment) entries.push([`attachments/${path.basename(c.attachment)}`, fs.readFileSync(imagePath(c.attachment))]);
        }
        res.setHeader('Content-Disposition', 'attachment; filename="Threadline-export.zip"');
        return send(200, zip(entries), 'application/zip');
      }
      throw error(404, '页面不存在。');
    } catch (err) { if (!res.headersSent) send(err.status || 500, { error: err.status ? err.message : '本机保存或读取失败，原数据未被清空。' }); }
  });
  server.on('close', () => { feishu.close?.(); store.close(); });
  server.on('close', () => cardRenderer.close());
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createRewindServer({ dataDir: process.env.REWIND_WEB_DATA_DIR || defaultDir });
  const port = Number(process.env.REWIND_WEB_PORT || 43127);
  server.on('error', err => { console.error(err.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Rewind: http://127.0.0.1:${port}`));
}
