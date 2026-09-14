import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import * as zlib from 'node:zlib';
import { TerminalSessions, parseClaude, parsePi, parseDeepSeek } from './terminal-sessions.mjs';
import { createRewindServer } from './server.mjs';
import { terminalID as id, terminalRows, encodeRows, writeTerminalFixture } from '../Tests/fixtures/terminal-sessions.mjs';

const parsers = { claude: parseClaude, pi: parsePi, deepseek: parseDeepSeek };
for (const runtime of Object.keys(parsers)) test(`${runtime}: keeps original messages, filters tools/instructions/reasoning, stable fingerprints`, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'threadline-parser-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const text = encodeRows(terminalRows(runtime)), parse = text => parsers[runtime](text, id, root);
  const s = parse(text);
  assert.equal(s.messages.length, 2);
  assert.ok(s.messages.every(m => !/private|abandoned/.test(m.text)));
  assert.equal(s.project.root, '/sample/project');
  assert.deepEqual(s, parse(text + '{"partial":'));
  const changed = parse(text.replace('保留原文和自己的判断', '重新审视这个判断'));
  assert.equal(changed.messages[1].id, s.messages[1].id);
  assert.notEqual(changed.messages[1].fingerprint, s.messages[1].fingerprint);
  assert.throws(() => parse(text + '{broken}\n'), /Invalid transcript/);
  if (runtime !== 'deepseek') assert.equal(s.messages[0].attachments.length, 1);
});

test('Pi follows parent chain, refuses cycles/missing ancestors/new formats and preserves precompaction original messages', () => {
  const rows = terminalRows('pi');
  rows.push({ type: 'compaction', id: 'compact', parentId: 'info', summary: 'derived summary', firstKeptEntryId: 'a1' });
  assert.equal(parsePi(encodeRows(rows), id).messages.length, 2);
  rows.at(-1).parentId = 'missing';
  assert.throws(() => parsePi(encodeRows(rows), id), /incomplete/);
  rows.at(-1).parentId = 'compact';
  assert.throws(() => parsePi(encodeRows(rows), id), /Invalid Pi/);
  rows[0].version = 4;
  assert.throws(() => parsePi(encodeRows(rows), id), /Unsupported/);
});

test('Claude rejects sidechains and foreign session rows; repeated writes replace the same UUID', () => {
  const rows = terminalRows('claude');
  rows.push({ ...rows[0], sessionId: 'foreign', uuid: 'foreign' });
  assert.equal(parseClaude(encodeRows(rows), id).messages.length, 2);
  rows.push({ ...rows[2], message: { role: 'assistant', content: 'updated answer' } });
  assert.equal(parseClaude(encodeRows(rows), id).messages[1].text, 'updated answer');
  rows[0].isSidechain = true;
  assert.equal(parseClaude(encodeRows(rows), id), null);
});

test('DeepSeek keeps original text across compaction, refuses unknown format and excludes subagents', () => {
  const rows = terminalRows('deepseek');
  rows.push({ type: 'user/message', seq: 6, surfaceOp: { op: 'replace', startSeq: 1, endSeq: 4 }, data: { role: 'user', source: { kind: 'plugin' }, content: [{ type: 'text', text: 'derived compacted context' }] } });
  assert.equal(parseDeepSeek(encodeRows(rows), id).messages.length, 2);
  rows[0].version = 4;
  assert.throws(() => parseDeepSeek(encodeRows(rows), id), /Unsupported/);
  rows[0].version = 3; rows[0].origin = 'subagent';
  assert.equal(parseDeepSeek(encodeRows(rows), id), null);
});

test('Discovery isolates symlinks/subagents, selects newest DSH generation, refreshes files, and keeps readable sessions beside failures', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'threadline-discovery-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const runtime of Object.keys(parsers)) {
    const file = writeTerminalFixture(root, runtime);
    const reader = new TerminalSessions(runtime, path.join(root, runtime));
    const hiddenDir = path.join(path.dirname(file), 'subagents'); fs.mkdirSync(hiddenDir);
    fs.copyFileSync(file, path.join(hiddenDir, 'hidden.jsonl'));
    fs.symlinkSync(file, path.join(path.dirname(file), 'linked.jsonl'));
    assert.equal((await reader.recent()).length, 1);
    assert.equal((await reader.get(id)).messages.length, 2);
    await assert.rejects(() => reader.get('../escape'), { status: 400 });
    await assert.rejects(() => reader.get('no-such-session'), { status: 404 });
    if (runtime === 'deepseek') {
      writeTerminalFixture(root, runtime, { version: 4, rows: [{ ...terminalRows(runtime)[0], version: 4 }] });
      assert.equal((await reader.recent()).length, 0);
      assert.match(reader.warnings[0], /Unsupported/);
      await assert.rejects(() => reader.get(id), /Unsupported/);
    } else {
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('保留原文和自己的判断', '新的判断'));
      assert.match((await reader.get(id)).messages[1].text, /新的判断/);
    }
  }
});

test('DeepSeek reads concatenated compressed frames and an incomplete last write', { skip: !zlib.zstdCompressSync }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'threadline-zstd-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const rows = terminalRows('deepseek');
  const file = writeTerminalFixture(root, 'deepseek', { compressed: true });
  const frames = rows.map(r => zlib.zstdCompressSync(JSON.stringify(r) + '\n'));
  fs.writeFileSync(file, Buffer.concat([...frames, zlib.zstdCompressSync('{"partial":').subarray(0, 7)]));
  const reader = new TerminalSessions('deepseek', path.join(root, 'deepseek'));
  assert.equal((await reader.get(id)).messages.length, 2);
});

for (const runtime of Object.keys(parsers)) test(`${runtime}: API + CLI discover, exact link, import, source, deduplication and stale selection`, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'threadline-runtime-api-'));
  const file = writeTerminalFixture(root, runtime);
  const homes = Object.fromEntries(['codex', 'cursor', 'claude', 'pi', 'deepseek'].map(r => [r + 'Home', path.join(root, r)]));
  const server = createRewindServer({ ...homes, dataDir: path.join(root, 'data'), legacyDir: null, ocr: false, feishu: { close() {} } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const mockBin = path.join(root, 'bin'), openedURL = path.join(root, 'opened-url');
  fs.mkdirSync(mockBin);
  for (const command of ['open', 'xdg-open']) fs.writeFileSync(path.join(mockBin, command), '#!/bin/sh\nprintf "%s" "$1" > "$THREADLINE_OPEN_CAPTURE"\n', { mode: 0o755 });
  const request = async (route, body) => { const r = await fetch(origin + route, { method: body ? 'POST' : 'GET', headers: { Origin: origin, 'X-Rewind-Request': '1', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, ...await r.json() }; };
  const cli = args => new Promise((resolve, reject) => {
    const child = spawn('python3', ['skills/threadline/scripts/threadline.py', '--url', origin, ...args], { env: { ...process.env, PATH: mockBin + path.delimiter + process.env.PATH, THREADLINE_OPEN_CAPTURE: openedURL, CODEX_THREAD_ID: 'wrong-parent', PI_SESSION_ID: id, DSH_SESSION_ID: id } });
    let out = '', err = ''; child.stdout.on('data', d => out += d); child.stderr.on('data', d => err += d); child.on('error', reject); child.on('close', code => resolve({ code, ...JSON.parse(code ? err : out) }));
  });
  assert.equal((await request('/api/sessions/recent')).sessions[0].runtime, runtime);
  const snapshot = await cli(['session', '--runtime', runtime, '--thread', id]);
  assert.equal(snapshot.code, 0); assert.equal(snapshot.session.messages.length, 2);
  const panel = await cli(['panel', '--runtime', runtime, '--thread', id]);
  assert.equal(panel.url, origin + `/collect/${runtime}/${id}?panel=1`);
  assert.equal((await cli(['open', '--browser', '--runtime', runtime, '--thread', id])).opened, true);
  assert.equal(fs.readFileSync(openedURL, 'utf8'), origin + `/collect/${runtime}/${id}`);
  fs.unlinkSync(openedURL);
  assert.equal((await cli(['open', '--browser', '--runtime', runtime, '--thread', '33333333-3333-4333-8333-333333333333'])).status, 404);
  assert.equal(fs.existsSync(openedURL), false);
  if (runtime !== 'claude') assert.equal((await cli(['panel', '--runtime', runtime])).threadID, id);
  else assert.equal((await cli(['panel', '--runtime', runtime])).code, 2);
  const snapshotFile = path.join(root, 'snapshot.json'); fs.writeFileSync(snapshotFile, JSON.stringify(snapshot));
  const args = ['import', '--snapshot', snapshotFile, ...snapshot.session.messages.flatMap(m => ['--message', m.id])];
  const saved = await cli(args);
  assert.equal(saved.code, 0); assert.equal(saved.duplicate, false); assert.equal(saved.clip.provenance.runtime, runtime);
  assert.match(saved.clip.sourceURL, new RegExp('runtime=' + runtime));
  assert.equal((await cli(args)).duplicate, true);
  assert.ok((await request(`/api/${runtime}/sessions/${id}`)).session.messages.every(m => m.saved));
  const body = { threadID: id, messageIDs: snapshot.session.messages.map(m => m.id), fingerprints: Object.fromEntries(snapshot.session.messages.map(m => [m.id, m.fingerprint])) };
  assert.equal((await request('/api/feishu/preview', { ...body, runtime, note: '' })).status, 200);
  assert.equal((await request('/api/sessions/organization', { action: 'pin', keys: [runtime + ':' + id], pinned: true })).status, 200);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('保留原文和自己的判断', '变化后的判断'));
  assert.equal((await cli(args)).status, 409);
});

test('A shared ID across runtimes never collides when saving, and edited messages stop claiming to be saved', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'threadline-runtime-identity-'));
  const files = Object.fromEntries(Object.keys(parsers).map(runtime => [runtime, writeTerminalFixture(root, runtime)]));
  const homes = Object.fromEntries(['codex', 'cursor', 'claude', 'pi', 'deepseek'].map(r => [r + 'Home', path.join(root, r)]));
  const server = createRewindServer({ ...homes, dataDir: path.join(root, 'data'), legacyDir: null, ocr: false, feishu: { close() {} } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const request = async (route, body) => { const response = await fetch(origin + route, { method: body ? 'POST' : 'GET', headers: { Origin: origin, 'X-Rewind-Request': '1', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); assert.ok(response.ok); return response.json(); };
  const ids = new Set();
  for (const runtime of Object.keys(parsers)) {
    const { session } = await request(`/api/${runtime}/sessions/${id}`), m = session.messages[1];
    assert.ok(session.messages.every(m => !m.saved));
    const result = await request(`/api/${runtime}/import`, { threadID: id, messageIDs: [m.id], fingerprints: { [m.id]: m.fingerprint } });
    ids.add(result.clip.id); assert.equal(result.duplicate, false);
    fs.writeFileSync(files[runtime], fs.readFileSync(files[runtime], 'utf8').replace('保留原文和自己的判断', '改写后的判断'));
    assert.equal((await request(`/api/${runtime}/sessions/${id}`)).session.messages[1].saved, false);
  }
  assert.equal(ids.size, 3);
});

test('Pi and DeepSeek support non-UUID default-safe custom IDs; attachment-only DSH messages remain explicit', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'threadline-custom-id-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const runtime of ['pi', 'deepseek']) {
    const custom = 'session_custom-123'; writeTerminalFixture(root, runtime, { id: custom });
    const reader = new TerminalSessions(runtime, path.join(root, runtime));
    assert.equal((await reader.get(custom)).id, custom);
  }
  const rows = terminalRows('deepseek');
  rows[1].data.content = [{ type: 'image', attachment: { attachmentId: 'sha256:sample', name: 'diagram.png', bytes: 100, width: 10, height: 10, mediaType: 'image/png' } }];
  const s = parseDeepSeek(encodeRows(rows), id);
  assert.equal(s.messages.length, 2);
  assert.equal(s.messages[0].hasImages, true);
  assert.equal(s.messages[0].attachments.length, 0);
  assert.equal(s.messages[0].unresolvedAttachments[0].name, 'diagram.png');
});
