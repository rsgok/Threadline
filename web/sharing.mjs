import { resolveCardTheme } from './card-themes.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { linkedAttachments } from './session-assets.mjs';

const fail = (status, message, uncertain = false) => Object.assign(new Error(message), { status, uncertain });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const ID = /^[a-f0-9-]{36}$/;
const safeName = value => path.basename(value).replace(/[\r\n<>"\\/:?*|]/g, '_').slice(0, 150) || 'attachment';
export const sharingCapabilities = {
  export: { name: '复制 / 导出', fileLimit: 25 * 1024 * 1024, textLimit: 0 },
  slack: { name: 'Slack', fileLimit: 25 * 1024 * 1024, textLimit: 3000 },
  discord: { name: 'Discord', fileLimit: 8 * 1024 * 1024, textLimit: 1900 },
};
const mime = name => ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' })[path.extname(name).toLowerCase()] || 'application/octet-stream';
function atomic(file, value) {
  const tmp = file + '.' + crypto.randomUUID() + '.tmp';
  try { fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600, flag: 'wx' }); fs.renameSync(tmp, file); }
  finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}
function readAttachment(file, limit) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || !stat.size) throw fail(400, '附件必须是非空文件');
    if (stat.size > limit) throw fail(413, `附件超过 ${limit / 1024 / 1024} MB 上限`);
    const bytes = Buffer.alloc(stat.size); let offset = 0;
    while (offset < bytes.length) { const n = fs.readSync(fd, bytes, offset, bytes.length - offset, offset); if (!n) throw fail(409, '附件读取不完整'); offset += n; }
    const after = fs.fstatSync(fd);
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw fail(409, '附件发生变化，请重新预览');
    return bytes;
  } finally { fs.closeSync(fd); }
}
export function splitText(text, limit) {
  const chars = Array.from(text), result = [];
  for (let i = 0; i < chars.length; i += limit) result.push(chars.slice(i, i + limit).join(''));
  return result;
}
export function shareText(text) {
  // Local paths cannot be opened by recipients. Keep the visible label instead.
  return text.replace(/(```[\s\S]*?```|`[^`\n]*`)|(!?)\[([^\]]*)\]\((<[^>]+>|[^)]+)\)/g, (raw, code, image, label, dest) => {
    if (code) return raw;
    const uri = dest.replace(/^<|>$/g, '');
    return uri.startsWith('/') || /^(file:|data:)/.test(uri) ? `[${image ? '图片：' : '文件：'}${label}]` : raw;
  });
}
export class Sharing {
  constructor({ dataDir, fetch: request = globalThis.fetch }) {
    this.root = path.join(dataDir, 'sharing'); fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
    this.configFile = path.join(this.root, 'connections.json'); this.request = request; this.locks = new Set();
    this.config = fs.existsSync(this.configFile) ? JSON.parse(fs.readFileSync(this.configFile, 'utf8')) : {};
  }
  status() {
    return { capabilities: sharingCapabilities, slack: this.config.slack ? { connected: true, team: this.config.slack.team, selfUserId: this.config.slack.selfUserId || '' } : { connected: false }, discord: this.config.discord ? { connected: true, name: this.config.discord.name, channel: this.config.discord.channel } : { connected: false } };
  }
  async json(url, options = {}) {
    let response;
    try { response = await this.request(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(30000) }); }
    catch { throw fail(502, '网络中断或超时，无法确认平台是否完成请求', true); }
    if (response.status === 429) throw fail(429, `平台限流，请在 ${response.headers.get('retry-after') || '稍后'} 秒后重试`);
    if (!response.ok) throw fail(502, `平台返回 HTTP ${response.status}`, response.status >= 500);
    try { return await response.json(); } catch { throw fail(502, '平台回执无法读取，请核对是否送达', true); }
  }
  async slack(method, body, token = this.config.slack?.token) {
    if (!token) throw fail(400, '请先连接 Slack');
    const result = await this.json('https://slack.com/api/' + method, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) });
    if (!result.ok) throw fail(502, `Slack：${String(result.error || '请求失败').replace(/[^a-z_]/g, '').slice(0, 80)}`, ['internal_error', 'fatal_error', 'request_timeout', 'service_unavailable'].includes(result.error));
    return result;
  }
  webhook(value) {
    let url; try { url = new URL(value); } catch { throw fail(400, '请输入 Discord 官方 Webhook 地址'); }
    if (url.protocol !== 'https:' || url.hostname !== 'discord.com' || url.port || url.username || url.password || url.search || url.hash || !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(url.pathname)) throw fail(400, '请输入 https://discord.com/api/webhooks/… 地址');
    return url.href;
  }
  async connect(data) {
    const next = structuredClone(this.config);
    if (data.platform === 'slack') {
      if (typeof data.token !== 'string' || !/^xoxb-[A-Za-z0-9-]{10,300}$/.test(data.token)) throw fail(400, '请输入 Slack Bot User OAuth Token（xoxb-…）');
      if (data.selfUserId && !/^[UW][A-Z0-9]{5,30}$/.test(data.selfUserId)) throw fail(400, 'Slack 成员 ID 格式不正确');
      const info = await this.slack('auth.test', {}, data.token);
      next.slack = { token: data.token, team: info.team, teamId: info.team_id, selfUserId: data.selfUserId || '' };
    } else if (data.platform === 'discord') {
      const webhook = this.webhook(data.webhook), info = await this.json(webhook);
      if (!info.id || !info.channel_id) throw fail(400, 'Webhook 未返回可用频道');
      next.discord = { webhook, name: info.name || 'Discord', channel: info.channel_id };
    } else throw fail(400, '不支持的连接');
    atomic(this.configFile, next); this.config = next; return this.status();
  }
  disconnect(platform) { if (!['slack', 'discord'].includes(platform)) throw fail(400, '不支持的连接'); const next = structuredClone(this.config); delete next[platform]; atomic(this.configFile, next); this.config = next; return this.status(); }
  async channels(cursor = '') {
    const r = await this.slack('conversations.list', { types: 'public_channel,private_channel', exclude_archived: true, limit: 100, cursor: String(cursor).slice(0, 1000) });
    return { channels: (r.channels || []).filter(c => c.is_member).map(c => ({ id: c.id, name: c.name })), cursor: r.response_metadata?.next_cursor || '' };
  }
  file(id) { if (!ID.test(id || '')) throw fail(400, '分享记录 ID 无效'); return path.join(this.root, id, 'preview.json'); }
  load(id) { const file = this.file(id); if (!fs.existsSync(file)) throw fail(404, '分享记录不存在'); return JSON.parse(fs.readFileSync(file, 'utf8')); }
  save(job) { atomic(this.file(job.id), job); }
  public(job) {
    return { id: job.id, platform: job.platform, target: job.targetLabel, title: job.title, cardTheme: job.cardTheme || 'sage', cardMode: job.cardMode || 'pages', note: job.note, text: job.text, messages: job.messages, attachments: job.attachments,
      createdAt: job.createdAt, startedAt: job.startedAt, expires: job.expires, expired: Date.now() > job.expires,
      steps: job.steps.map(s => ({ id: s.id, label: s.label, status: s.status === 'sending' && !this.locks.has(job.id) ? 'uncertain' : s.status, error: s.error || '', receipt: s.receipt || null })), sending: this.locks.has(job.id) };
  }
  history() {
    return fs.readdirSync(this.root).filter(id => ID.test(id)).map(id => this.public(this.load(id))).filter(j => j.platform !== 'export' && j.startedAt).sort((a, b) => b.createdAt - a.createdAt).slice(0, 30).map(({ messages, text, attachments, ...j }) => ({ ...j, attachmentCount: attachments.filter(a => a.selected).length }));
  }
  prepare({ session, selected, platform = 'export', target = '', note = '', attachmentIDs = [], cardTheme = 'sage', cardMode = 'pages', locale = 'zh-CN' }) {
    locale = locale === 'en' ? 'en' : 'zh-CN';
    resolveCardTheme(cardTheme);
    if (!['pages','long'].includes(cardMode)) throw fail(400, '图卡模式无效');
    for (const old of fs.readdirSync(this.root).filter(id => ID.test(id))) { const previous = this.load(old); if (previous.expires < Date.now() && previous.steps.every(s => s.status === 'pending')) fs.rmSync(path.dirname(this.file(old)), { recursive: true, force: true }); }
    const capability = Object.hasOwn(sharingCapabilities, platform) ? sharingCapabilities[platform] : null; if (!capability) throw fail(400, '请选择分享方式');
    if (typeof note !== 'string' || note.length > 2000 || typeof target !== 'string') throw fail(400, '附言或发送目标格式错误');
    if (!Array.isArray(attachmentIDs) || attachmentIDs.length > 50 || new Set(attachmentIDs).size !== attachmentIDs.length) throw fail(400, '附件选择无效');
    if (platform !== 'export' && !this.config[platform]) throw fail(400, `请先连接 ${capability.name}`);
    if (platform === 'slack') {
      if (target === 'self') target = this.config.slack.selfUserId;
      if (!/^[CGDUW][A-Z0-9]{5,30}$/.test(target || '')) throw fail(400, '请选择频道或填写 Slack 成员 ID；发给自己需先设置自己的成员 ID');
    }
    const id = crypto.randomUUID(), dir = path.dirname(this.file(id));
    const attachments = [], seen = new Set(); let total = 0;
    try {
      for (const m of selected) for (const a of [...(m.attachments || []), ...linkedAttachments(m.text)]) {
        if (seen.has(a.path)) continue; seen.add(a.path);
        if (seen.size > 50) throw fail(413, '一次最多分享 50 个附件');
        const item = { id: hash(a.path).slice(0, 24), path: a.path, name: safeName(a.path), kind: a.kind, messageId: m.id, selected: false, available: false };
        try {
          const bytes = readAttachment(a.path, capability.fileLimit); item.size = bytes.length; item.digest = hash(bytes); item.available = true;
          if (attachmentIDs.includes(item.id)) {
            total += bytes.length; if (total > 100 * 1024 * 1024) throw fail(413, '附件总量超过 100 MB');
            fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); fs.writeFileSync(path.join(dir, item.id), bytes, { mode: 0o600, flag: 'wx' }); item.selected = true;
          }
        } catch (e) { item.problem = e.code === 'ENOENT' ? '文件已移动或删除' : e.code === 'ELOOP' ? '不发送符号链接' : e.message; }
        attachments.push(item);
      }
      if (attachmentIDs.some(id => !attachments.some(a => a.id === id && a.selected))) throw fail(400, '部分所选附件不可用、超限或不属于这些消息，请重新选择');
      const messages = selected.map(m => {
        const images = attachments.filter(a => a.selected && a.kind === 'image' && a.messageId === m.id), parts = [], used = new Set(); let offset = 0;
        const prose = m.text.replace(/```[\s\S]*?```|`[^`\n]*`/g, code => ' '.repeat(code.length));
        for (const match of prose.matchAll(/!\[[^\]]*\]\((<[^>]+>|[^)]+)\)/g)) {
          const image = images.find(a => a.path === match[1].replace(/^<|>$/g, '')); if (!image) continue;
          if (match.index > offset) parts.push({ type: 'text', text: shareText(m.text.slice(offset, match.index)) });
          parts.push({ type: 'image', assetId: image.id }); used.add(image.id); offset = match.index + match[0].length;
        }
        if (offset < m.text.length) parts.push({ type: 'text', text: shareText(m.text.slice(offset)) });
        for (const image of images) if (!used.has(image.id)) parts.push({ type: 'image', assetId: image.id });
        return { id: m.id, role: m.role, text: shareText(m.text), imageIDs: images.map(a => a.id), parts };
      });
      const text = [session.title || '讨论摘录', note, ...messages.map(m => `【${m.role === 'user' ? '我' : 'AI'}】\n${m.text}`), ...attachments.map(a => `附件：${a.name}（${a.selected ? '随附发送' : '未选择，不发送'}）`)].filter(Boolean).join('\n\n');
      if (text.length > 2_000_000) throw fail(413, '内容超过 2 MB，请分批分享');
      const steps = platform === 'export' ? [] : [...splitText(text, capability.textLimit).map((text, i) => ({ id: crypto.randomUUID(), type: 'text', text, label: `文字 ${i + 1}`, status: 'pending' })), ...attachments.filter(a => a.selected).map(a => ({ id: crypto.randomUUID(), type: 'file', assetId: a.id, label: a.name, status: 'pending' }))];
      if (steps.length > 150) throw fail(413, '将产生超过 150 次发送，请减少所选内容');
      const job = { id, locale, cardTheme, cardMode, platform, target, targetLabel: platform === 'discord' ? `${this.config.discord.name} · ${this.config.discord.channel}` : target, configHash: platform === 'export' ? '' : hash(JSON.stringify(this.config[platform])), title: session.title || '讨论摘录', note, text, messages, attachments, steps, createdAt: Date.now(), expires: Date.now() + 24 * 60 * 60 * 1000 };
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); this.save(job); return this.public(job);
    } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); throw e; }
  }
  asset(id, assetId) {
    const job = this.load(id), a = job.attachments.find(a => a.id === assetId && a.selected);
    if (!a) throw fail(404, '附件不在此次分享中');
    const bytes = fs.readFileSync(path.join(path.dirname(this.file(id)), a.id));
    if (hash(bytes) !== a.digest) throw fail(409, '附件副本已变化，请重新预览');
    return { ...a, bytes, mime: mime(a.name) };
  }
  thumbnail(id, assetId) {
    const a = this.load(id).attachments.find(a => a.id === assetId && a.available && a.kind === 'image');
    if (!a) throw fail(404, '图片不在此次预览中');
    if (a.selected) return this.asset(id, assetId);
    const bytes = readAttachment(a.path, 25 * 1024 * 1024);
    if (hash(bytes) !== a.digest) throw fail(409, '图片已变化，请重新预览');
    return { bytes, mime: mime(a.name) };
  }
  exportEntries(id) {
    const job = this.load(id), chosen = job.attachments.filter(a => a.selected);
    const content = ['# ' + job.title, job.note, ...job.messages.map(m => `## ${m.role === 'user' ? '我' : 'AI'}\n\n${m.text}`), ...chosen.map(a => `${a.kind === 'image' ? '!' : ''}[${a.name.replace(/[\[\]]/g, '_')}](<attachments/${a.id}-${a.name}>)`)].filter(Boolean).join('\n\n');
    return [['discussion.md', Buffer.from(content)], ...chosen.map(a => [`attachments/${a.id}-${a.name}`, this.asset(id, a.id).bytes])];
  }
  resolve(id, stepId, delivered) {
    if (this.locks.has(id)) throw fail(409, '正在发送，请稍后核对');
    const job = this.load(id), step = job.steps.find(s => s.id === stepId);
    if (!step || !['uncertain', 'sending'].includes(step.status) || typeof delivered !== 'boolean') throw fail(400, '只可核对送达状态未知的部分');
    step.status = delivered ? 'sent' : 'pending'; step.receipt = delivered ? { verifiedByUser: true } : null; step.error = ''; this.save(job); return this.public(job);
  }
  async send(id) {
    if (this.locks.has(id)) throw fail(409, '这次分享正在发送');
    const job = this.load(id);
    if (!['slack', 'discord'].includes(job.platform)) throw fail(400, '此预览用于复制或导出');
    if (job.steps.every(s => s.status === 'sent')) return this.public(job);
    if (Date.now() > job.expires) throw fail(410, '预览已超过 24 小时，请重新选择内容');
    if (hash(JSON.stringify(this.config[job.platform] || null)) !== job.configHash) throw fail(409, '平台连接已变化，请重新预览');
    if (job.steps.some(s => ['uncertain', 'sending'].includes(s.status))) throw fail(409, '有部分内容送达状态未知，请先核对发送记录');
    job.startedAt ||= Date.now(); this.save(job);
    const connection = structuredClone(this.config[job.platform]);
    this.locks.add(id);
    try {
      if (job.platform === 'slack' && /^[UW]/.test(job.target) && !job.channel) { const r = await this.slack('conversations.open', { users: job.target }, connection.token); if (!r.channel?.id) throw fail(502, '未能打开 Slack 私聊'); job.channel = r.channel.id; this.save(job); }
      for (const step of job.steps) {
        if (step.status === 'sent') continue;
        step.status = 'sending'; step.error = ''; this.save(job);
        try {
          if (job.platform === 'discord') {
            const payload = { content: step.type === 'text' ? step.text : `附件：${step.label}`, allowed_mentions: { parse: [] }, flags: 4 };
            let body, headers;
            if (step.type === 'file') { const a = this.asset(id, step.assetId); body = new FormData(); body.append('payload_json', JSON.stringify(payload)); body.append('files[0]', new Blob([a.bytes], { type: a.mime }), a.name); }
            else { body = JSON.stringify(payload); headers = { 'Content-Type': 'application/json' }; }
            const r = await this.json(connection.webhook + '?wait=true', { method: 'POST', body, headers });
            if (!r.id) throw fail(502, 'Discord 未返回消息回执，请核对频道', true);
            step.receipt = { messageId: r.id, channelId: r.channel_id };
          } else if (step.type === 'text') {
            const r = await this.slack('chat.postMessage', { channel: job.channel || job.target, text: step.text, mrkdwn: false, parse: 'none', link_names: false, unfurl_links: false, unfurl_media: false, client_msg_id: step.id }, connection.token);
            if (!r.ts) throw fail(502, 'Slack 未返回消息回执，请核对频道', true);
            step.receipt = { timestamp: r.ts, channelId: r.channel };
          } else {
            const a = this.asset(id, step.assetId);
            if (!step.upload) { const r = await this.slack('files.getUploadURLExternal', { filename: a.name, length: a.bytes.length }, connection.token); const u = new URL(r.upload_url); if (u.protocol !== 'https:' || u.hostname !== 'files.slack.com' || u.username || u.password || u.port) throw fail(502, 'Slack 上传地址无效'); step.upload = { url: u.href, id: r.file_id }; this.save(job); }
            if (!step.uploaded) {
              let r; try { r = await this.request(step.upload.url, { method: 'POST', body: a.bytes, redirect: 'error', signal: AbortSignal.timeout(60000) }); } catch { throw fail(502, 'Slack 文件上传中断，可重试'); }
              if (!r.ok) { step.upload = null; throw fail(502, 'Slack 文件上传失败，可重试'); }
              step.uploaded = true; this.save(job);
            }
            await this.slack('files.completeUploadExternal', { files: [{ id: step.upload.id, title: a.name }], channel_id: job.channel || job.target }, connection.token); step.receipt = { fileId: step.upload.id };
          }
          step.status = 'sent'; this.save(job);
        } catch (e) { step.status = e.uncertain ? 'uncertain' : 'failed'; step.error = e.status ? e.message : '本机附件读取或发送失败'; this.save(job); break; }
      }
      this.locks.delete(id); return this.public(job);
    } finally { this.locks.delete(id); }
  }
}
