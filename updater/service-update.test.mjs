// Exercise the real process boundary: the installer survives a feature-service restart.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { RuntimeUpdater } from './runtime-update.mjs';

for (const fail of [false, true]) test(`real feature process ${fail ? 'rolls back after startup failure' : 'restarts into the signed release'}`, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'threadline-service-update-'));
  const app = path.join(root, 'app'); fs.mkdirSync(path.join(app, 'web'), { recursive: true });
  const server = `import http from 'node:http'; import fs from 'node:fs';
const version = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url))).version;
const server = http.createServer((req,res)=>res.end(JSON.stringify({app:'rewind-web', version})));
server.listen(0,'127.0.0.1',()=>console.log(server.address().port));`;
  fs.writeFileSync(path.join(app, 'web/server.mjs'), server);
  fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ version: '0.0.2' }));
  let child, port;
  const stop = async () => {
    if (child && child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
  };
  t.after(async () => { await stop(); fs.rmSync(root, { recursive: true, force: true }); });
  const restart = async () => {
    await stop(); port = undefined;
    child = spawn(process.execPath, [path.join(app, 'web/server.mjs')], { stdio: ['ignore', 'pipe', 'ignore'] });
    await Promise.race([once(child.stdout, 'data').then(([data]) => { port = Number(data.toString().trim()); }), once(child, 'exit')]);
  };
  const healthy = async version => {
    if (!port) return false;
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    return (await response.json()).version === version;
  };
  await restart(); assert.ok(await healthy('0.0.2'));
  const files = Object.entries({ 'package.json': JSON.stringify({ version: '0.0.3' }), 'web/server.mjs': fail ? 'process.exit(1)' : server, 'build/client/index.html': 'new interface' }).map(([path, value]) => ({ path, data: Buffer.from(value).toString('base64') }));
  const bytes = gzipSync(JSON.stringify({ format: 1, files }));
  const keys = crypto.generateKeyPairSync('ed25519');
  const payload = Buffer.from(JSON.stringify({ format: 1, dataSchema: 1, version: '0.0.3', minNode: '22.13.0', minShellBuild: 7, url: 'https://updates.example/features', size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), notes: '' }));
  const manifest = Buffer.from(JSON.stringify({ payload: payload.toString('base64'), signature: crypto.sign(null, payload, keys.privateKey).toString('base64') }));
  const updater = new RuntimeUpdater({ root, shellBuild: 7, config: { feedURL: 'https://updates.example/feed', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }) }, fetchBytes: async url => url.endsWith('/feed') ? manifest : bytes, restart, healthy });
  if (fail) { await assert.rejects(updater.install('0.0.3'), /previous version restored/); assert.ok(await healthy('0.0.2')); }
  else { await updater.install('0.0.3'); assert.ok(await healthy('0.0.3')); }
});

test('production server entrypoint starts when launched through the app symlink', { timeout: 10000 }, async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'threadline-entrypoint-'));
  const linked = path.join(temporary, 'app');
  fs.symlinkSync(path.resolve(import.meta.dirname, '..'), linked, 'dir');
  const child = spawn(process.execPath, [path.join(linked, 'web/server.mjs')], {
    env: { ...process.env, HOME: temporary, REWIND_WEB_DATA_DIR: path.join(temporary, 'data'), REWIND_WEB_PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    fs.rmSync(temporary, { recursive: true, force: true });
  });
  const started = await Promise.race([
    once(child.stdout, 'data').then(([bytes]) => bytes.toString()),
    once(child, 'exit').then(([code]) => `unexpected exit ${code}`),
  ]);
  assert.match(started, /^Rewind: http:\/\/127.0.0.1:/);
});

test('fresh preparation starts a real service and reuses it without a network request', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'threadline-fresh-start-'));
  let child, port;
  const stop = async () => {
    if (child && child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
  };
  t.after(async () => { await stop(); fs.rmSync(root, { recursive: true, force: true }); });
  const source = `import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const server=http.createServer((req,res)=>res.end(JSON.stringify({version:'0.0.3',runtimeRoot:fs.realpathSync(root)})));
server.listen(0,'127.0.0.1',()=>console.log(server.address().port));`;
  const files = Object.entries({ 'package.json': JSON.stringify({ version: '0.0.3' }), 'web/server.mjs': source, 'build/client/index.html': 'matching interface' }).map(([path, value]) => ({ path, data: Buffer.from(value).toString('base64') }));
  const bytes = gzipSync(JSON.stringify({ format: 1, files }));
  const keys = crypto.generateKeyPairSync('ed25519');
  const payload = Buffer.from(JSON.stringify({ format: 1, dataSchema: 1, version: '0.0.3', minNode: '22.13.0', minShellBuild: 9, url: 'https://updates.example/features', size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), notes: '' }));
  const manifest = Buffer.from(JSON.stringify({ payload: payload.toString('base64'), signature: crypto.sign(null, payload, keys.privateKey).toString('base64') }));
  const updater = new RuntimeUpdater({ root, shellBuild: 9, config: { feedURL: 'https://updates.example/feed', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }) }, fetchBytes: async url => url.endsWith('/feed') ? manifest : bytes,
    restart: async () => {
      await stop();
      child = spawn(process.execPath, [path.join(root, 'app/web/server.mjs')], { stdio: ['ignore', 'pipe', 'ignore'] });
      const [data] = await once(child.stdout, 'data'); port = Number(data.toString());
    },
    healthy: async version => {
      const value = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
      return value.version === version && value.runtimeRoot === fs.realpathSync(path.join(root, 'app'));
    },
  });
  assert.equal((await updater.prepare('0.0.3')).state, 'ready');
  updater.fetchBytes = async () => { throw Error('network must not be required'); };
  assert.equal((await updater.prepare('0.0.3')).state, 'ready');
  assert.equal(fs.readFileSync(path.join(root, 'app/build/client/index.html'), 'utf8'), 'matching interface');
});
