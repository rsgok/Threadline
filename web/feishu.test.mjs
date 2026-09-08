import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFeishu, USER_SCOPES, BOT_SCOPES, UPLOAD_SCOPE, discussionAttachments, readSharedAttachment, buildDiscussionCards, buildDiscussionCard } from './feishu.mjs';
const tick = () => new Promise(r => setImmediate(r));
function fixture(t, cli, register, botScopes = () => [...BOT_SCOPES, UPLOAD_SCOPE]) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'threadline-feishu-'));
  const service = createFeishu({ dataDir, cli: (args, opts) => args[0] === 'api' && args[2] === '/open-apis/application/v6/scopes' ? Promise.resolve({ data: { scopes: botScopes().map(scope_name => ({ scope_name, scope_type: 'tenant', grant_status: 1 })) } }) : cli(args, opts), register, qr: async () => 'data:image/png;base64,test' });
  t.after(() => { service.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  return { service, dataDir };
}
const verified = scopes => ({ appId: 'cli_test', identities: { bot: { available: true, verified: true }, user: { available: true, verified: true, userName: 'Test', scope: scopes.join(' '), accessToken: 'must-never-be-public' } } });

test('disconnected feature does not access another app or its credentials', async t => {
  const { service } = fixture(t, () => { throw Error('must not call CLI'); });
  assert.equal((await service.status()).connected, false);
  await assert.rejects(service.authorize(), /先创建/);
});

test('binding isolates credentials through stdin; readiness requires verified user and every scope', async t => {
  let current = verified(['im:chat:read']); const calls = [];
  const { service, dataDir } = fixture(t, async (args, opts) => { calls.push({ args, opts }); return args[0] === 'config' ? { ok: true } : current; });
  const status = await service.bind({ appId: 'cli_test', appSecret: 'private-secret' });
  assert.equal(status.ready, false); assert.ok(status.missingScopes.includes('offline_access'));
  assert.equal(calls[0].opts.input, 'private-secret\n'); assert.ok(!calls[0].args.includes('private-secret'));
  assert.match(calls[0].args[calls[0].args.indexOf('--name') + 1], /^threadline-/);
  assert.ok(!JSON.stringify(status).includes('must-never'));
  assert.ok(!fs.readFileSync(path.join(dataDir, 'feishu.json'), 'utf8').includes('secret'));
  current = verified(USER_SCOPES); assert.equal((await service.status(true)).ready, true);
  current.appId = 'cli_other'; await assert.rejects(service.status(true), /不一致/);
});

test('creation exposes only QR and binds successful credentials, never business defaults', async t => {
  let options, finish;
  const { service } = fixture(t, async args => args[0] === 'auth' ? verified(USER_SCOPES) : { ok: true }, opts => { options = opts; return new Promise(r => { finish = r; }); });
  await service.create();
  await assert.rejects(service.create(), /进行中/);
  assert.equal(options.addons.preset, false); assert.deepEqual(options.addons.scopes.user, USER_SCOPES); assert.deepEqual(options.addons.scopes.tenant, [...BOT_SCOPES, UPLOAD_SCOPE]);
  await options.onQRCodeReady({ url: 'https://accounts.feishu.cn/test', expireIn: 300 });
  assert.equal((await service.status()).job.status, 'waiting');
  finish({ client_id: 'cli_test', client_secret: 'secret' }); await tick();
  assert.equal((await service.status()).ready, true);
});

test('canceled registration cannot bind late result', async t => {
  let finish; let binds = 0;
  const { service } = fixture(t, async args => { if (args[0] === 'config') binds++; return {}; }, () => new Promise(r => { finish = r; }));
  await service.create(); service.cancel(); finish({ client_id: 'cli_test', client_secret: 'secret' }); await tick();
  assert.equal(binds, 0); assert.equal((await service.status()).connected, false);
});

test('successful remote creation with failed local save must recover same app', async t => {
  const { service } = fixture(t, async args => { if (args[0] === 'config') throw Error('disk failure'); return {}; }, async () => ({ client_id: 'cli_test', client_secret: 'secret' }));
  await service.create(); await tick();
  assert.equal((await service.status()).recoveryAppId, 'cli_test');
  await assert.rejects(service.create(), /已绑定/);
});

test('sending is always bot identity, rejects missing scopes and preserves literal shell characters', async t => {
  let current = verified([]); const calls = [];
  const { service } = fixture(t, async (args, opts) => { calls.push(args); if (args[0] === 'auth') return current; if (args.includes('+messages-send')) return { ok: true, data: { message_id: 'om_test' } }; return { ok: true }; });
  await service.bind({ appId: 'cli_test', appSecret: 'secret' });
  const payload = { chatId: 'oc_test', requestId: '00000000-0000-4000-8000-000000000001', text: 'literal `uname` $(whoami)\nhello' };
  await assert.rejects(service.send(payload), /权限尚未就绪/);
  assert.equal(calls.some(c => c.includes('+messages-send')), false);
  current = verified(USER_SCOPES); assert.equal((await service.send(payload)).messageId, 'om_test');
  const args = calls.at(-1); assert.equal(args[args.indexOf('--as') + 1], 'bot'); assert.equal(args[args.indexOf('--text') + 1], payload.text);
  await service.send(payload); assert.equal(calls.at(-1)[calls.at(-1).indexOf('--idempotency-key') + 1], args[args.indexOf('--idempotency-key') + 1]);
});


test('discussion cards preserve original bodies and escape navigation labels', () => {
  const text = '<at id="all">everyone</at> **literal** `code`\nsecond line';
  const card = buildDiscussionCard({ title: '讨论主题', messages: [{ role: 'user', text }] });
  const panel = card.body.elements[0];
  assert.equal(panel.elements[0].content, text);
  assert.equal(panel.expanded, false);
  assert.ok(!panel.header.title.content.includes('<at'));
  assert.equal(card.header.title.content, '讨论主题');
});

test('verified bot without granted tenant send scope remains blocked until refreshed', async t => {
  let granted = [];
  const { service } = fixture(t, async args => args[0] === 'auth' ? verified(USER_SCOPES) : { ok: true }, undefined, () => granted);
  const status = await service.bind({ appId: 'cli_test', appSecret: 'secret' });
  assert.equal(status.ready, false);
  assert.deepEqual(status.missingBotScopes, BOT_SCOPES);
  assert.ok(status.permissionUrl.includes('im%3Amessage%3Asend_as_bot'));
  await assert.rejects(service.send({ chatId: 'oc_test', requestId: '00000000-0000-4000-8000-000000000001', text: 'test' }), /权限尚未就绪/);
  granted = BOT_SCOPES;
  assert.equal((await service.status(true)).ready, true);
});

test('self delivery resolves current app user server-side without requiring group scope', async t => {
  const calls = [];
  const identity = verified(['offline_access']); identity.identities.user.openId = 'ou_current';
  const { service } = fixture(t, async args => { calls.push(args); return args[0] === 'auth' ? identity : { ok: true, data: { message_id: 'om_self', chat_id: 'oc_private' } }; });
  await service.bind({ appId: 'cli_test', appSecret: 'secret' });
  const status = await service.status(true); assert.equal(status.ready, false); assert.equal(status.privateReady, true);
  const result = await service.send({ target: 'self', chatId: 'oc_ignored', userId: 'ou_forged', text: 'hello', requestId: '00000000-0000-4000-8000-000000000001' });
  assert.equal(result.chatId, 'oc_private');
  const args = calls.at(-1); assert.equal(args[args.indexOf('--user-id') + 1], 'ou_current'); assert.ok(!args.includes('--chat-id'));
});

test('multi-card packing preserves unicode, source order and every byte of long messages', () => {
  const messages = Array.from({ length: 17 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: i === 3 ? '😀中文\n```js\n'.repeat(4000) : `message ${i}` }));
  const cards = buildDiscussionCards({ title: '长讨论', messages, note: '附言' });
  assert.ok(cards.length > 3);
  const restored = new Map();
  for (const card of cards) {
    assert.ok(Buffer.byteLength(JSON.stringify(card)) <= 24000);
    const panels = card.body.elements.filter(e => e.tag === 'collapsible_panel'); assert.ok(panels.length <= 8);
    for (const panel of panels) { const index = Number(panel.header.title.content.match(/grey">(\d+)/)[1]); restored.set(index, (restored.get(index) || '') + panel.elements[0].content); }
  }
  assert.deepEqual([...restored.values()], messages.map(m => m.text));
});

test('other-user delivery only accepts a user returned by current app search', async t => {
  const calls = []; const identity = verified(USER_SCOPES); identity.identities.user.openId = 'ou_me';
  const { service } = fixture(t, async args => { calls.push(args); if (args[0] === 'auth') return identity; if (args[0] === 'contact') return { data: { users: [{ open_id: 'ou_colleague', localized_name: '同事', department: '研发' }] } }; return { data: { message_id: 'om_sent' } }; });
  await service.bind({ appId: 'cli_test', appSecret: 'secret' });
  const payload = { target: 'user', userId: 'ou_colleague', text: 'hello', requestId: '00000000-0000-4000-8000-000000000001' };
  await assert.rejects(service.send(payload), /重新搜索/);
  assert.equal((await service.users('同事')).users[0].name, '同事');
  await service.send(payload); const args = calls.at(-1); assert.equal(args[args.indexOf('--user-id') + 1], 'ou_colleague');
});

test('attachment validation rejects missing, empty and symlink files', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'threadline-attachment-test-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const real = path.join(dir, 'real.txt'), empty = path.join(dir, 'empty.txt'), link = path.join(dir, 'link.txt');
  fs.writeFileSync(real, 'document'); fs.writeFileSync(empty, ''); fs.symlinkSync(real, link);
  const items = discussionAttachments([{ id: 'm1', attachments: [real, empty, link, path.join(dir, 'missing.txt')].map(path => ({ path, kind: 'file' })) }]);
  assert.deepEqual(items.map(a => a.available), [true, false, false, false]); assert.equal(readSharedAttachment(items[0]).bytes.toString(), 'document');
});

test('upload stages exact previewed bytes using isolated app and cleans temporary copy', async t => {
  let staged;
  const { service, dataDir } = fixture(t, async (args, opts) => {
    if (args[0] === 'auth') return verified(USER_SCOPES);
    if (args.includes('--file')) { const relative = args[args.indexOf('--file') + 1].slice('file='.length); assert.equal(path.isAbsolute(relative), false); staged = path.join(opts.cwd, relative); assert.equal(fs.readFileSync(staged, 'utf8'), 'test file'); assert.ok(args.includes('--profile')); return { data: { file_key: 'file_test' } }; }
    return { ok: true };
  });
  await service.bind({ appId: 'cli_test', appSecret: 'secret' });
  const file = path.join(dataDir, 'report.txt'); fs.writeFileSync(file, 'test file');
  const [item] = discussionAttachments([{ id: 'm', attachments: [{ path: file, kind: 'file' }] }]);
  assert.equal(await service.upload(item), 'file_test'); assert.equal(fs.existsSync(staged), false);
  fs.writeFileSync(file, 'changed'); await assert.rejects(service.upload(item), /已变化/);
});

test('permission repair uses existing app and never replaces its binding', async t => {
  let options, finish; let binds = 0;
  const { service } = fixture(t, async args => { if (args[0] === 'config') binds++; return args[0] === 'auth' ? verified(USER_SCOPES) : {}; }, opts => { options = opts; return new Promise(r => finish = r); });
  await service.bind({ appId: 'cli_test', appSecret: 'secret' });
  await service.permissions('upload');
  assert.equal(options.appId, 'cli_test'); assert.equal(options.createOnly, undefined);
  assert.deepEqual(options.addons.scopes, { tenant: [UPLOAD_SCOPE] });
  await options.onQRCodeReady({ url: 'https://open.feishu.cn/permission-test', expireIn: 600 });
  assert.equal((await service.status()).job.kind, 'permissions');
  finish({ client_id: 'cli_other', client_secret: 'must-not-bind' }); await tick();
  assert.equal((await service.status()).job.status, 'failed'); assert.equal(binds, 1);
});

test('permission completion checks actual grant before reporting success', async t => {
  let finish;
  const { service } = fixture(t, async args => args[0] === 'auth' ? verified(USER_SCOPES) : {}, () => new Promise(r => finish = r), () => BOT_SCOPES);
  await service.bind({ appId: 'cli_test', appSecret: 'secret' });
  await service.permissions('upload'); finish({ client_id: 'cli_test' }); await tick();
  assert.equal((await service.status()).uploadReady, false);
  assert.equal((await service.status()).job.status, 'failed');
  await assert.rejects(service.upload({ name: 'a.png' }), /im:resource/);
});
