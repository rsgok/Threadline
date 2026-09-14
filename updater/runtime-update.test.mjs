import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { RuntimeUpdater, verifyManifest, unpack, compareVersions, download } from './runtime-update.mjs';

const keys = crypto.generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
function archive(version = '0.0.3', extra = []) {
  return gzipSync(JSON.stringify({ format: 1, files: [
    { path: 'package.json', data: Buffer.from(JSON.stringify({ version })).toString('base64') },
    { path: 'web/server.mjs', data: Buffer.from('// fixture server').toString('base64') },
    { path: 'build/client/index.html', data: Buffer.from('fixture').toString('base64') }, ...extra,
  ] }));
}
function fixture(t, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'threadline-update-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'app'));
  fs.writeFileSync(path.join(root, 'app/package.json'), JSON.stringify({ version: '0.0.2' }));
  fs.writeFileSync(path.join(root, 'notes-sentinel'), 'user data must survive');
  const bytes = overrides.bytes ?? archive();
  const metadata = { format: 1, dataSchema: 1, version: '0.0.3', minNode: '22.13.0', minShellBuild: 7, url: 'https://updates.example/features.json.gz', size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), notes: 'Update notes', ...overrides.metadata };
  const payload = Buffer.from(JSON.stringify(metadata));
  const envelope = Buffer.from(JSON.stringify({ payload: payload.toString('base64'), signature: crypto.sign(null, payload, keys.privateKey).toString('base64') }));
  const restarts = [];
  const updater = new RuntimeUpdater({ root, config: { feedURL: 'https://updates.example/runtime.json', publicKey }, shellBuild: 7,
    fetchBytes: async url => url.endsWith('runtime.json') ? envelope : bytes,
    restart: async () => { restarts.push(updater.currentVersion()); }, healthy: async () => true,
    ...overrides.options,
  });
  return { root, updater, restarts, envelope, bytes };
}
test('checks signed metadata and installs without modifying user data', async t => {
  const { root, updater, restarts } = fixture(t);
  assert.equal((await updater.check()).state, 'available');
  assert.equal((await updater.install('0.0.3')).state, 'installed');
  assert.equal(updater.currentVersion(), '0.0.3');
  assert.deepEqual(restarts, ['0.0.3']);
  assert.equal(fs.readFileSync(path.join(root, 'notes-sentinel'), 'utf8'), 'user data must survive');
  assert.ok(fs.lstatSync(path.join(root, 'app')).isSymbolicLink());
  assert.ok(!fs.existsSync(path.join(root, 'update-pending.json')));
});
test('failed health check restores and restarts the previous version', async t => {
  const { updater, restarts } = fixture(t, { options: { healthy: async version => version === '0.0.2' } });
  await assert.rejects(updater.install('0.0.3'), /previous version restored/);
  assert.equal(updater.currentVersion(), '0.0.2');
  assert.deepEqual(restarts, ['0.0.3', '0.0.2']);
});
test('restart failure keeps rollback journal for recovery if rollback cannot restart', async t => {
  const { updater, root } = fixture(t, { options: { restart: async () => { throw Error('restart failed'); } } });
  await assert.rejects(updater.install('0.0.3'));
  assert.equal(updater.currentVersion(), '0.0.2');
  assert.ok(fs.existsSync(path.join(root, 'update-pending.json')));
  updater.restart = async () => {};
  await updater.recover();
  assert.equal(updater.currentVersion(), '0.0.2');
});
test('tampered manifest cannot authorize an update', t => {
  const { envelope } = fixture(t);
  const bad = JSON.parse(envelope); bad.payload = Buffer.from('{}').toString('base64');
  assert.throws(() => verifyManifest(Buffer.from(JSON.stringify(bad)), publicKey), /signature/);
});
test('checksum mismatch never switches the running package', async t => {
  const { updater, restarts } = fixture(t, { metadata: { sha256: '0'.repeat(64) } });
  await assert.rejects(updater.install('0.0.3'), /checksum/);
  assert.equal(updater.currentVersion(), '0.0.2'); assert.equal(restarts.length, 0);
});
test('archive traversal is rejected before installation', async t => {
  const { updater } = fixture(t, { bytes: archive('0.0.3', [{ path: 'web/../../outside', data: '' }]) });
  await assert.rejects(updater.install('0.0.3'), /Unsafe/);
  assert.equal(updater.currentVersion(), '0.0.2');
});
test('version changes and incompatible runtimes require another check', async t => {
  const { updater } = fixture(t);
  await assert.rejects(updater.install('0.0.4'), /changed/);
  updater.shellBuild = 6;
  assert.equal((await updater.check()).blocked, 'shell');
  await assert.rejects(updater.install('0.0.3'), /incompatible/);
  const incompatible = fixture(t, { metadata: { minNode: '999.0.0' } });
  assert.equal((await incompatible.updater.check()).blocked, 'node');
});
test('missing feed is distinct from latest and downgrade is never offered', async t => {
  const { updater } = fixture(t, { metadata: { version: '0.0.1' } });
  assert.equal((await updater.check()).state, 'current');
  updater.config = {};
  assert.equal((await updater.check()).state, 'unconfigured');
});
test('concurrent install does not touch active files', async t => {
  const { updater, root } = fixture(t);
  fs.mkdirSync(path.join(root, 'update.lock'));
  await assert.rejects(updater.install('0.0.3'), /Another update/);
  assert.equal(updater.currentVersion(), '0.0.2');
});
test('rejects HTTP and unsafe version formats', async () => {
  await assert.rejects(download('http://updates.example/update'), /HTTPS/);
  assert.throws(() => compareVersions('1.2', '1.2.3'));
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1);
});
test('incomplete or duplicate archive entries fail closed', t => {
  const { root } = fixture(t);
  const target = path.join(root, 'staging'); fs.mkdirSync(target);
  assert.throws(() => unpack(archive('0.0.3', [{ path: 'package.json', data: '' }]), target), /Unsafe/);
});
test('download follows HTTPS CDN redirects but rejects a downgrade and size overflow', async () => {
  let calls = 0;
  const bytes = await download('https://updates.example/package', 8, async () => ++calls === 1 ? new Response(null, { status: 302, headers: { location: 'https://cdn.example/package' } }) : new Response('signed'));
  assert.equal(bytes.toString(), 'signed');
  await assert.rejects(download('https://updates.example/package', 8, async () => new Response(null, { status: 302, headers: { location: 'http://cdn.example/package' } })), /HTTPS/);
  await assert.rejects(download('https://updates.example/package', 2, async () => new Response('too big')), /size limit/);
});
test('future data schemas are rejected before any files are changed', async t => {
  const { updater } = fixture(t, { metadata: { dataSchema: 2 } });
  await assert.rejects(updater.check(), /metadata/);
  assert.equal(updater.currentVersion(), '0.0.2');
});
