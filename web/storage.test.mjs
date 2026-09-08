import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LibraryStore } from './storage.mjs';

function directory(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'threadline-sqlite-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }
test('migration preserves every field, order, deleted rows and original bytes; restart never reimports', t => {
  const dir = directory(t), notes = [{ id: 'a', title: '中文', body: 'ＡＢＣ 测试', provenance: { messages: [{ id: 'm' }] } }, { id: 'b', title: 'old', body: 'deleted', deletedAt: 1 }];
  const original = JSON.stringify(notes, null, 2);
  fs.writeFileSync(path.join(dir, 'library.json'), original);
  fs.writeFileSync(path.join(dir, 'threads.json'), JSON.stringify([{ id: 't', title: '方向', goal: '目标' }]));
  let store = new LibraryStore(dir);
  assert.deepEqual(store.get('a'), notes[0]); assert.deepEqual(store.get('b'), notes[1]);
  assert.equal(store.list('abc 测试').length, 1); assert.equal(store.count(), 1); assert.equal(store.topics().length, 1);
  store.remove('a'); store.close();
  store = new LibraryStore(dir); assert.equal(store.get('a'), undefined); store.close();
  assert.equal(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'), original);
});
test('invalid or duplicate legacy records roll back migration and allow a corrected retry', t => {
  const dir = directory(t), note = { id: 'a', title: 'title', body: 'body' };
  fs.writeFileSync(path.join(dir, 'library.json'), JSON.stringify([note, note]));
  assert.throws(() => new LibraryStore(dir));
  fs.writeFileSync(path.join(dir, 'library.json'), JSON.stringify([note]));
  const store = new LibraryStore(dir); assert.deepEqual(store.list(), [note]); store.close();
});
test('independent connections see individual updates without overwriting other records', t => {
  const dir = directory(t), a = new LibraryStore(dir), b = new LibraryStore(dir);
  try {
    a.put({ id: 'a', title: 'A', body: 'first' }); b.put({ id: 'b', title: 'B', body: 'second' });
    a.put({ ...a.get('a'), note: 'updated' });
    assert.equal(b.count(), 2); assert.equal(b.get('a').note, 'updated'); assert.equal(a.get('b').body, 'second');
    assert.deepEqual(a.list().map(x => x.id), ['b', 'a']);
  } finally { a.close(); b.close(); }
});
