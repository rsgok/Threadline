import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { registerApp } from '@larksuiteoapi/node-sdk';
import QRCode from 'qrcode';

export const USER_SCOPES = ['im:chat:read', 'offline_access'];
export const BOT_SCOPES = ['im:message:send_as_bot'];
export const UPLOAD_SCOPE = 'im:resource';
const fail = (status, message) => Object.assign(new Error(message), { status });
const parse = text => { try { return JSON.parse(text); } catch { return null; } };

// Keep excerpts verbatim; only the compact navigation labels are shortened.
export function buildDiscussionCard({ title, messages, note = '', page = '' }) {
  const clip = (s, n) => Array.from(s).slice(0, n).join('');
  const plain = s => s.replace(/\s+/g, ' ').trim();
  const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/([*_[\]`])/g, '\\$1');
  const topic = clip(plain(title || '讨论摘录'), 60);
  return {
    schema: '2.0',
    config: { width_mode: 'default', summary: { content: clip(`讨论摘录 · ${topic} · ${messages.length} 条消息`, 60) } },
    header: { title: { tag: 'plain_text', content: topic + (page ? ` · ${page}` : '') }, subtitle: { tag: 'plain_text', content: `Threadline · ${messages.length} 条消息 · 展开查看原文` }, template: 'default' },
    body: { direction: 'vertical', padding: '12px', vertical_spacing: '8px', elements: [
      ...(note.trim() ? [{ tag: 'markdown', content: note.trim() }] : []),
      ...messages.map((m, i) => {
        const role = m.role === 'user' ? '用户' : m.phase === 'commentary' ? 'AI · 过程' : m.runtime==='cursor'?'Cursor':'Codex';
        const text = plain(m.text.split(/\n\s*\n/)[0].replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`#>]/g, ''));
        const excerpt = clip(text || (m.imageCount ? '图片' : '附件'), 36) + (Array.from(text).length > 36 ? '…' : '');
        return { tag: 'collapsible_panel', expanded: false,
          header: { title: { tag: 'markdown', content: `<font color="grey">${String(m.ordinal || i + 1).padStart(2, '0')}</font>  <font color="default">**${role}${m.continuation || ''}**</font>\n${escape(excerpt)}` },
            icon: { tag: 'standard_icon', token: 'down_outlined', color: 'grey' }, icon_position: 'right', icon_expanded_angle: -180, padding: '10px 12px 10px 12px' },
          border: { color: 'grey-200', corner_radius: '8px' }, padding: '12px',
          elements: [...(m.text.trim() ? [{ tag: 'markdown', content: m.text }] : []), ...(m.imageKeys || []).map(img => ({ tag: 'img', img_key: img.key, alt: { tag: 'plain_text', content: img.name }, mode: 'fit_horizontal' }))] };
      })
    ] }
  };
}

export function buildDiscussionCards({ title, messages, note = '' }) {
  if (Buffer.byteLength(JSON.stringify(messages)) > 2_000_000) throw fail(413, '讨论超过 2 MB，请分批发送。');
  const parts = [];
  messages.forEach((m, index) => {
    const chunks = []; let chunk = '', bytes = 0;
    for (const char of m.text) {
      const size = Buffer.byteLength(JSON.stringify(char)) - 2;
      if (bytes + size > 6000 && chunk) { chunks.push(chunk); chunk = ''; bytes = 0; }
      chunk += char; bytes += size;
    }
    chunks.push(chunk);
    chunks.forEach((text, i) => parts.push({ ...m, imageKeys: i === 0 ? m.imageKeys : [], imageCount: i === 0 ? m.imageCount : 0, text, ordinal: index + 1, continuation: chunks.length > 1 ? ` · ${i + 1}/${chunks.length} 段` : '' }));
  });
  const batches = []; let batch = [];
  const make = (messages, page = '999/999') => buildDiscussionCard({ title, messages, note, page });
  for (const part of parts) {
    if (batch.length && (batch.length >= 8 || Buffer.byteLength(JSON.stringify(make([...batch, part].map(m => ({ ...m, imageKeys: [] }))))) + [...batch, part].reduce((n, m) => n + (m.imageCount || 0) * 1000, 0) > 24000)) { batches.push(batch); batch = []; }
    batch.push(part);
  }
  if (batch.length) batches.push(batch);
  if (batches.length > 100) throw fail(413, '预计超过 100 张卡片，请分批发送。');
  return batches.map((messages, i) => make(messages, batches.length > 1 ? `${i + 1}/${batches.length}` : ''));
}

export function readSharedAttachment(item) {
  const fd = fs.openSync(item.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd); const limit = item.kind === 'image' ? 10 * 1024 * 1024 : 20 * 1024 * 1024;
    if (!stat.isFile() || stat.size === 0 || stat.size > limit) throw Error(`需要非空普通文件，大小不能超过 ${limit / 1024 / 1024} MB`);
    const bytes = Buffer.alloc(stat.size); let count = 0;
    while (count < bytes.length) { const n = fs.readSync(fd, bytes, count, bytes.length - count, count); if (!n) throw Error('文件读取不完整'); count += n; }
    const after = fs.fstatSync(fd); if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw Error('文件已变化');
    return { bytes, digest: crypto.createHash('sha256').update(bytes).digest('hex') };
  } finally { fs.closeSync(fd); }
}
export function discussionAttachments(messages) {
  const result = [];
  messages.forEach((m, index) => (m.attachments || []).forEach(a => {
    if (result.length >= 50) throw fail(413, '附件超过 50 个，请分批选择消息。');
    const item = { ...a, messageId: m.id, ordinal: index + 1, name: path.basename(a.path), id: crypto.createHash('sha256').update(m.id + ':' + a.path).digest('hex').slice(0, 24) };
    try { const { bytes, digest } = readSharedAttachment(item); item.size = bytes.length; item.digest = digest; item.available = true; }
    catch (e) { item.available = false; item.problem = e.code === 'ENOENT' ? '文件已不存在' : e.code === 'ELOOP' ? '暂不上传符号链接' : e.message; }
    result.push(item);
  }));
  return result;
}

// Never interpolate message text or credentials into a shell. Secrets go via stdin.
export function runLark(args, { input, signal, cwd, timeout = 30000 } = {}) {
  const binary = process.env.THREADLINE_LARK_CLI || ['/opt/homebrew/bin/lark-cli', '/usr/local/bin/lark-cli'].find(p => fs.existsSync(p)) || 'lark-cli';
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { signal, cwd, env: { ...process.env, PATH: [path.dirname(process.execPath), '/opt/homebrew/bin', '/usr/local/bin', process.env.PATH || '/usr/bin:/bin'].join(path.delimiter), LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => child.kill(), timeout);
    child.stdout.on('data', b => { out += b; if (out.length > 4_000_000) child.kill(); });
    child.stderr.on('data', b => { err += b; if (err.length > 1_000_000) child.kill(); });
    child.stdin.on('error', () => {});
    child.on('error', e => { clearTimeout(timer); reject(fail(503, e.code === 'ENOENT' ? '请先安装 lark-cli，再连接飞书。' : '飞书操作已取消或无法启动。')); });
    child.on('close', code => {
      clearTimeout(timer);
      const data = parse(out), problem = parse(err)?.error || data?.error;
      if (code !== 0 || data?.ok === false) {
        const missing = (problem?.missing_scopes || []).filter(s => /^[a-zA-Z0-9:._-]+$/.test(s));
        const safe = v => typeof v === 'string' && /^[a-zA-Z0-9_.:-]{1,100}$/.test(v) ? v : undefined;
        console.error(JSON.stringify({ event: 'feishu.cli_error', time: new Date().toISOString(), command: safe(args[0]), exitCode: code, type: safe(problem?.type), subtype: safe(problem?.subtype), code: typeof problem?.code === 'number' ? problem.code : undefined, logId: safe(problem?.log_id), missingScopes: missing }));
        const e = fail(502, missing.length ? '飞书权限不足：' + missing.join('、') + '。请在应用后台开通，再重新授权。' : '飞书操作未完成，请检查应用权限、授权状态或网络后重试。');
        // Do not forward raw CLI output: it may contain tokens or credentials.
        reject(e); return;
      }
      resolve(data || { ok: true });
    });
    child.stdin.end(input || '');
  });
}

export function createFeishu({ dataDir, cli = runLark, register = registerApp, qr = url => QRCode.toDataURL(url, { width: 240, margin: 2 }) }) {
  const file = path.join(dataDir, 'feishu.json');
  const profile = 'threadline-' + crypto.createHash('sha256').update(path.resolve(dataDir)).digest('hex').slice(0, 12);
  let binding = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  let job = null, controller = null, generation = 0, busy = false;
  let statusCache = null; const recipients = new Map();
  const jobs = () => job ? { ...job } : null;
  const call = (args, opts) => cli([...args, '--profile', profile], opts);
  const save = value => { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 }); fs.renameSync(tmp, file); binding = value; statusCache = null; };
  const needBinding = () => { if (!binding || binding.recovery) throw fail(409, '请先创建或绑定飞书应用。'); };
  const invalidate = () => { recipients.clear(); generation++; controller?.abort(); controller = null; job = null; statusCache = null; };
  const assertIdle = () => { if (busy || job?.status === 'waiting' || job?.status === 'starting') throw fail(409, '已有连接操作进行中，请完成或取消后重试。'); };
  async function status(force = false) {
    if (binding?.recovery) return { connected: false, recoveryAppId: binding.appId, job: jobs() };
    if (!binding) return { connected: false, userAuthorized: false, ready: false, job: jobs() };
    if (!force && statusCache && Date.now() - statusCache.at < 15000) return { ...statusCache.value, job: jobs() };
    let raw;
    try { raw = await call(['auth', 'status', '--json', '--verify']); }
    catch (e) { return { connected: true, appId: binding.appId, userAuthorized: false, ready: false, connectionError: e.message, consoleUrl: `https://open.feishu.cn/app/${binding.appId}`, job: jobs() }; }
    if (raw.appId !== binding.appId) throw fail(409, '飞书配置与当前绑定不一致，请重新绑定。');
    const user = raw.identities?.user || {};
    const scopes = new Set((user.scope || '').split(/[ ,]+/));
    const missingScopes = USER_SCOPES.filter(s => !scopes.has(s));
    const userAuthorized = user.available === true && user.verified === true;
    let botScopeError = '';
    let granted = [];
    try { const result = await call(['api', 'GET', '/open-apis/application/v6/scopes', '--as', 'bot', '--json']); granted = result.data?.scopes || []; }
    catch (e) { botScopeError = e.message; }
    const botSendGranted = granted.some(s => s.scope_type === 'tenant' && s.grant_status === 1 && ['im:message:send_as_bot', 'im:message:send', 'im:message'].includes(s.scope_name));
    const botReady = raw.identities?.bot?.available === true && raw.identities?.bot?.verified === true && botSendGranted;
    const scopeUrl = scopes => `https://open.feishu.cn/app/${encodeURIComponent(binding.appId)}/auth?${new URLSearchParams({ q: scopes.join(','), op_from: 'openapi', token_type: 'tenant' })}`;
    const permissionUrl = scopeUrl(BOT_SCOPES);
    const uploadReady = granted.some(s => s.scope_type === 'tenant' && s.grant_status === 1 && [UPLOAD_SCOPE, 'im:resource:upload'].includes(s.scope_name));
    const value = { uploadReady, uploadPermissionUrl: scopeUrl([UPLOAD_SCOPE]), privateReady: botReady && userAuthorized && /^ou_[a-zA-Z0-9]+$/.test(user.openId || ''), userOpenId: user.openId || '', botReady, botScopeError, permissionUrl, botName: raw.identities?.bot?.appName || 'Threadline', missingBotScopes: botSendGranted ? [] : BOT_SCOPES, connected: true, appId: binding.appId, userName: user.userName || '', userAuthorized, missingScopes, ready: userAuthorized && !missingScopes.length && botReady, consoleUrl: `https://open.feishu.cn/app/${binding.appId}` };
    statusCache = { at: Date.now(), value };
    return { ...value, job: jobs() };
  }
  async function bind(appId, secret) {
    if (!/^cli_[a-zA-Z0-9]+$/.test(appId || '') || typeof secret !== 'string' || !secret.trim() || secret.length > 512) throw fail(400, '请填写有效的 App ID 和 App Secret。');
    // --name appends a dedicated profile; all subsequent calls explicitly select it.
    await cli(['config', 'init', '--name', profile, '--app-id', appId, '--app-secret-stdin', '--brand', 'feishu'], { input: secret.trim() + '\n' });
    save({ appId, profile });
  }
  async function create() {
    assertIdle(); if (binding) throw fail(409, '已绑定应用。如需更换，请先断开连接。');
    busy = true;
    try { await cli(['--version']); } finally { busy = false; }
    const id = ++generation; controller = new AbortController(); job = { status: 'starting', kind: 'create' };
    register({ source: 'threadline', createOnly: true, signal: controller.signal,
      appPreset: { avatar: 'https://magic-builder.tos-cn-beijing.volces.com/threadline/assets/threadline-icon-v1.png', name: 'Threadline · {user}', desc: '把选中的 AI 讨论分享给飞书同事' },
      addons: { preset: false, scopes: { user: USER_SCOPES, tenant: [...BOT_SCOPES, UPLOAD_SCOPE] } },
      onQRCodeReady: async info => {
        let image; try { image = await qr(info.url); } catch { return; }
        if (id === generation && job?.status === 'starting') job = { status: 'waiting', kind: 'create', url: info.url, qr: image, expiresAt: Date.now() + info.expireIn * 1000 };
      },
    }).then(async result => {
      if (id !== generation) return;
      if (!result.client_id || !result.client_secret) throw Error('missing credentials');
      // Credentials stay inside this service and the CLI credential store.
      busy = true;
      try { await bind(result.client_id, result.client_secret); }
      catch { save({ appId: result.client_id, profile, recovery: true }); job = { status: 'failed', kind: 'create', message: `应用 ${result.client_id} 已创建，但本机保存失败。请使用“绑定已有应用”恢复，不要重复创建。` }; return; }
      finally { busy = false; }
      job = { status: 'done', kind: 'create' };
    }).catch(() => { if (id === generation) job = { status: 'failed', kind: 'create', message: '创建未完成：可能已取消、二维码过期或需要企业审批。请检查飞书确认页。' }; });
    return jobs();
  }
  async function permissions(kind) {
    needBinding(); assertIdle();
    if (!['upload', 'send'].includes(kind)) throw fail(400, '权限类型无效。');
    const appId = binding.appId, id = ++generation;
    controller = new AbortController(); job = { status: 'starting', kind: 'permissions' };
    register({ source: 'threadline', appId, signal: controller.signal,
      addons: { preset: false, scopes: { tenant: kind === 'upload' ? [UPLOAD_SCOPE] : BOT_SCOPES } },
      onQRCodeReady: async info => {
        const image = await qr(info.url);
        if (id === generation) job = { status: 'waiting', kind: 'permissions', url: info.url, qr: image, expiresAt: Date.now() + info.expireIn * 1000 };
      }
    }).then(async result => {
      if (id !== generation) return;
      if (result.client_id !== appId) { job = { status: 'failed', kind: 'permissions', message: '申请结果不是当前绑定应用，请重新发起。' }; return; }
      statusCache = null;
      const current = await status(true);
      if (id !== generation) return;
      const granted = kind === 'upload' ? current.uploadReady : current.botReady;
      console.error(JSON.stringify({ event: 'feishu.permission_check', time: new Date().toISOString(), kind, granted: !!granted }));
      job = granted ? { status: 'done', kind: 'permissions' } : { status: 'failed', kind: 'permissions', message: '扫码已结束，但所需应用权限尚未生效。请在权限管理页检查开通、发布或审批状态。' };
    }).catch(() => { if (id === generation) job = { status: 'failed', kind: 'permissions', message: '权限申请未完成，可重试或使用应用后台入口。' }; });
    return jobs();
  }
  async function authorize(contacts = false) {
    needBinding(); assertIdle();
    const id = ++generation; controller = new AbortController(); job = { status: 'starting', kind: 'authorize' };
    try {
      const response = await call(['auth', 'login', '--scope', [...USER_SCOPES, ...(contacts ? ['contact:user:search'] : [])].join(' '), '--no-wait', '--json'], { signal: controller.signal });
      const data = response.data || response;
      const url = data.verification_uri_complete || data.verification_url || data.verification_uri;
      if (!url || !data.device_code) throw Error('missing device flow');
      const image = await qr(url);
      if (id !== generation) return jobs();
      job = { status: 'waiting', kind: 'authorize', url, qr: image, expiresAt: Date.now() + (data.expires_in || 600) * 1000 };
      call(['auth', 'login', '--device-code', data.device_code, '--json'], { signal: controller.signal, timeout: 660000 }).then(() => {
        if (id === generation) { statusCache = null; job = { status: 'done', kind: 'authorize' }; }
      }).catch(() => { if (id === generation) job = { status: 'failed', kind: 'authorize', message: '授权未完成，请确认应用已开通发送权限，并重新授权。' }; });
      return jobs();
    } catch { if (id === generation) job = { status: 'failed', kind: 'authorize', message: '无法发起用户授权，请检查应用权限及网络后重试。' }; return jobs(); }
  }
  async function chats(query = '', pageToken = '') {
    const current = await status(); if (!current.userAuthorized) throw fail(409, '请先完成飞书用户授权。');
    const args = query ? ['im', '+chat-search', '--query', query, '--search-types', 'private,public_joined,external'] : ['im', '+chat-list'];
    args.push('--as', 'user', '--page-size', '30', '--json'); if (pageToken) args.push('--page-token', pageToken);
    const result = await call(args), data = result.data || {};
    return { chats: (data.chats || data.items || []).map(c => ({ id: c.chat_id, name: c.name || '未命名群', description: c.description || '' })), hasMore: data.has_more === true, pageToken: data.page_token || '' };
  }
  return { status, create, authorize, permissions, chats,
    async upload(item) {
      needBinding();
      if (!(await status(true)).uploadReady) { console.error(JSON.stringify({ event: 'feishu.upload_blocked', time: new Date().toISOString(), scope: UPLOAD_SCOPE })); throw fail(409, '飞书尚未授予附件上传权限 im:resource，请在权限管理页检查开通、发布或审批状态。'); }
      let content;
      try { content = readSharedAttachment(item); } catch { throw fail(409, '附件无法读取，请重新预览：' + item.name); }
      if (content.digest !== item.digest) throw fail(409, '附件内容已变化，请重新预览：' + item.name);
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'threadline-upload-'));
      try {
        const file = path.join(dir, item.name); fs.writeFileSync(file, content.bytes, { mode: 0o600 });
        const result = item.kind === 'image'
          ? await call(['im', 'images', 'create', '--as', 'bot', '--data', JSON.stringify({ image_type: 'message' }), '--file', 'image=' + item.name, '--json'], { cwd: dir })
          : await call(['api', 'POST', '/open-apis/im/v1/files', '--as', 'bot', '--data', JSON.stringify({ file_type: 'stream', file_name: item.name }), '--file', 'file=' + item.name, '--json'], { cwd: dir });
        const key = result.data?.[item.kind === 'image' ? 'image_key' : 'file_key'];
        if (!key) throw fail(502, '未获得附件上传回执，请重试。');
        return key;
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    },
    async users(query) {
      if (typeof query !== 'string' || !query.trim() || query.length > 50) throw fail(400, '请输入姓名或邮箱（最多 50 字）。');
      needBinding();
      const result = await call(['contact', '+search-user', '--query', query.trim(), '--as', 'user', '--page-size', '20', '--json']);
      const users = (result.data?.users || []).filter(u => /^ou_[a-zA-Z0-9]+$/.test(u.open_id)).map(u => ({ id: u.open_id, name: u.localized_name || u.name || u.open_id, department: u.department || '' }));
      for (const user of users) recipients.set(user.id, Date.now());
      for (const [id, at] of recipients) if (Date.now() - at > 3600000) recipients.delete(id);
      return { users, hasMore: result.data?.has_more === true };
    },
    async bind(data) { assertIdle(); if (binding && (!binding.recovery || binding.appId !== data.appId)) throw fail(409, '请先断开当前应用，再绑定其他应用。'); busy = true; try { await bind(data.appId, data.appSecret); } finally { busy = false; } return status(true); },
    async disconnect() { if (busy) throw fail(409, '正在保存应用，请稍后重试。'); invalidate(); if (binding && !binding.recovery) await call(['auth', 'logout', '--json']); fs.rmSync(file, { force: true }); binding = null; return { connected: false }; },
    cancel() { if (busy) throw fail(409, '正在保存应用，请稍后重试。'); invalidate(); return { ok: true }; },
    close() { invalidate(); },
    async send({ chatId, target = chatId ? 'group' : 'self', userId, text, card, fileKey, requestId }) {
      if (!['self', 'user', 'group'].includes(target) || (target === 'group' && !/^oc_[a-zA-Z0-9]+$/.test(chatId || '')) || !/^[a-f0-9-]{36}$/.test(requestId || '')) throw fail(400, '发送目标或请求标识无效。');
      if (target === 'user' && (!recipients.has(userId) || Date.now() - recipients.get(userId) > 3600000)) throw fail(400, '请重新搜索并选择收件人。');
      if (!card && !fileKey && (typeof text !== 'string' || !text.trim() || Buffer.byteLength(JSON.stringify({ text })) > 18000)) throw fail(400, '所选消息超过本版单条发送长度，请减少选择后再发送。');
      if (card && Buffer.byteLength(JSON.stringify(card)) > 28000) throw fail(400, '所选卡片内容过长，请减少消息后重试。');
      const current = await status(true);
      if (!(target !== 'group' ? current.privateReady : current.ready)) throw fail(409, '机器人发送权限尚未就绪，请开通应用权限并授权群列表。');
      const recipient = target === 'self' ? current.userOpenId : target === 'user' ? userId : chatId;
      const key = crypto.createHash('sha256').update(JSON.stringify([binding.appId, target, recipient, fileKey || card || text, requestId])).digest('hex').slice(0, 48);
      const response = await call(['im', '+messages-send', '--as', 'bot', ...(target !== 'group' ? ['--user-id', recipient] : ['--chat-id', recipient]), ...(fileKey ? ['--file', fileKey] : card ? ['--msg-type', 'interactive', '--content', JSON.stringify(card)] : ['--text', text]), '--idempotency-key', key, '--json']);
      const data = response.data || {};
      const messageId = data.message_id || data.message?.message_id;
      if (!messageId) throw fail(502, '未获得发送回执，结果不确定。请先检查目标群，再用同一预览重试。');
      return { messageId, chatId: data.chat_id || chatId, target };
    },
  };
}
