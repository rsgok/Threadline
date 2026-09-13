import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionOrganization } from './session-organization.mjs';

test('organization persists and isolates identical IDs across runtimes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'threadline-org-'));
  try {
    const store = new SessionOrganization(dir);
    store.update({ action: 'tag', name: '设计', color: 'purple' });
    store.update({ action: 'addTag', keys: ['codex:same'], name: '设计' });
    store.update({ action: 'pin', keys: ['cursor:same'], pinned: true });
    store.update({ action: 'tag', name: '设计', color: 'blue' });
    const reloaded = new SessionOrganization(dir).read();
    assert.deepEqual(reloaded.sessions['codex:same'], { pinned: false, tags: ['设计'] });
    assert.deepEqual(reloaded.sessions['cursor:same'], { pinned: true, tags: [] });
    assert.equal(reloaded.tags[0].color, 'blue');
    store.update({ action: 'removeTag', keys: ['codex:same'], name: '设计' });
    assert.deepEqual(store.read().sessions['codex:same'].tags, []);
    assert.throws(() => store.update({ action: 'pin', keys: ['__proto__'], pinned: true }), { status: 400 });
    assert.throws(() => store.update({ action: 'tag', name: 'x', color: 'invalid' }), { status: 400 });
    assert.deepEqual(new SessionOrganization(dir).read(), store.read());
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
