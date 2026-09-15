import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionIndex } from './session-index.mjs';

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'threadline-index-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let entries = [{file: 'a', stamp: '1'}], reads = [], fail = false;
  const providers = { codex: {
    home: '/fictional/codex',
    async indexEntries() { if (fail) throw Error('permission denied'); return entries; },
    async indexSummary(entry) {
      reads.push(entry.file);
      return { id: entry.file, title: entry.file, cwd: '/project', messages: [{text: 'x'.repeat(900)}] };
    },
  }};
  return { directory, providers, reads, entries: value => { entries = value; }, fail: value => { fail = value; } };
}
test('persisted display snapshot returns before source discovery and unchanged transcripts are not read', async t => {
  const f = fixture(t), first = new SessionIndex(f.directory, f.providers);
  assert.equal(first.snapshot().initialized, false);
  await first.sync();
  assert.deepEqual(f.reads, ['a']);
  assert.equal(first.snapshot().details['codex:a'].messages[0].text.length, 500);
  const revision = first.status().revision;
  first.close();
  const restarted = new SessionIndex(f.directory, f.providers);
  assert.equal(restarted.snapshot().sessions.length, 1);
  assert.equal(restarted.status().revision, revision);
  await restarted.sync();
  assert.deepEqual(f.reads, ['a']);
  assert.equal(restarted.status().revision, revision);
  restarted.close();
});
test('only new and changed files are parsed; failed scans retain the last snapshot; deletion is reconciled', async t => {
  const f = fixture(t), index = new SessionIndex(f.directory, f.providers);
  await index.sync();
  f.entries([{file: 'a', stamp: '2'}, {file: 'b', stamp: '1'}]);
  await index.sync();
  assert.deepEqual(f.reads.sort(), ['a', 'a', 'b']);
  assert.equal(index.snapshot().sessions.length, 2);
  f.fail(true);
  await index.sync();
  assert.equal(index.snapshot().sessions.length, 2);
  assert.match(index.snapshot().errors[0].message, /permission/);
  f.fail(false); f.entries([{file: 'b', stamp: '1'}]);
  await index.sync();
  assert.equal(index.snapshot().sessions[0].id, 'b');
  assert.equal(index.snapshot().sessions.length, 1);
  index.close();
});
test('overlapping synchronization coalesces and empty libraries finish initialization', async t => {
  const f = fixture(t), index = new SessionIndex(f.directory, f.providers);
  await Promise.all([index.sync(), index.sync(), index.sync()]);
  assert.deepEqual(f.reads, ['a']);
  f.entries([]);
  await index.sync();
  assert.equal(index.status().initialized, true);
  assert.deepEqual(index.snapshot().sessions, []);
  index.close();
});
test('an unchanged failed transcript is not reparsed; changes retry it', async t => {
  const f = fixture(t);
  let attempts = 0;
  f.providers.codex.indexSummary = async () => { attempts++; throw Error('incomplete record'); };
  const index = new SessionIndex(f.directory, f.providers);
  await index.sync(); await index.sync();
  assert.equal(attempts, 1);
  f.entries([{file:'a', stamp:'2'}]);
  await index.sync();
  assert.equal(attempts, 2);
  index.close();
});

test('Codex file changes are detected even when session_index timestamps do not change', async t => {
  const { CodexSessions } = await import('./codex-sessions.mjs');
  const f = fixture(t);
  const home = path.join(f.directory, 'codex');
  fs.mkdirSync(path.join(home, 'sessions'), {recursive:true});
  const id = '11111111-1111-4111-8111-000000000001';
  const transcript = path.join(home, 'sessions', 'rollout-' + id + '.jsonl');
  fs.writeFileSync(path.join(home, 'session_index.jsonl'), JSON.stringify({id,thread_name:'Original',updated_at:'2026-09-16T00:00:00Z'}) + '\n');
  const writeRows = text => fs.writeFileSync(transcript, [
    {type:'session_meta', payload:{id,cwd:'/fictional/project'}},
    {type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text}]}},
  ].map(value=>JSON.stringify(value)).join('\n')+'\n');
  writeRows('first');
  const index = new SessionIndex(f.directory, {codex:new CodexSessions(home)});
  await index.sync();
  assert.equal(index.snapshot().details['codex:'+id].messages[0].text, 'first');
  const before = index.status().revision;
  writeRows('second message with more content');
  await index.sync();
  assert.notEqual(index.status().revision,before);
  assert.equal(index.snapshot().details['codex:'+id].messages[0].text,'second message with more content');
  index.close();
});
test('snapshot cache is invalidated when indexed conversations change', async t => {
  const f = fixture(t), index = new SessionIndex(f.directory, f.providers);
  await index.sync();
  const before = index.snapshot();
  assert.equal(index.snapshot().sessions, before.sessions);
  f.entries([{file:'b',stamp:'1'}]);
  await index.sync();
  assert.notEqual(index.snapshot().sessions, before.sessions);
  assert.deepEqual(index.snapshot().sessions.map(row=>row.id), ['b']);
  assert.deepEqual(before.sessions.map(row=>row.id), ['a']);
  index.close();
});
