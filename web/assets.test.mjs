import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assetBody, assetEtag, assetPaths, isAsset } from './assets.mjs';

test('bundled artwork is discoverable and served from the shipped assets', () => {
  assert.equal(isAsset('/assets/threadline-icon.png'), true);
  assert.equal(isAsset('/favicon.svg'), true);
  assert.equal(isAsset('/assets/landing-collect.png'), true);
  assert.equal(isAsset('/assets/missing.png'), false);
  assert.equal(isAsset('/api/library'), false);
  for (const [route, file] of Object.entries(assetPaths)) {
    assert.ok(fs.existsSync(file), `${route} is missing ${file}`);
    assert.equal(fs.statSync(file).isFile(), true, route);
  }
});

test('the favicon reuses the application artwork', () => {
  assert.equal(assetPaths['/favicon.svg'], assetPaths['/assets/threadline-icon.png']);
});

test('asset bodies are cached and reused until the file changes', () => {
  const file = assetPaths['/assets/threadline-icon.png'];
  const stat = fs.statSync(file);
  const first = assetBody(file, stat);
  const second = assetBody(file, stat);
  assert.equal(first, second, 'the same file revision should reuse the cached body');
  assert.equal(first.length, stat.size);
  const stale = { ...stat, mtimeMs: stat.mtimeMs + 1 };
  const third = assetBody(file, stale);
  assert.equal(third.length, stat.size);
});

test('the etag changes when the artwork changes', () => {
  const stat = fs.statSync(assetPaths['/assets/threadline-icon.png']);
  const etag = assetEtag(stat);
  assert.match(etag, /^"[0-9a-f]+-[0-9a-f]+"$/);
  assert.notEqual(etag, assetEtag({ ...stat, mtimeMs: stat.mtimeMs + 1 }));
  assert.notEqual(etag, assetEtag({ ...stat, size: stat.size + 1 }));
});

test('the interface icon stays small enough to load instantly', () => {
  // The interface never renders the icon larger than 96 CSS pixels. A much
  // larger asset only slows the first paint of every window.
  const stat = fs.statSync(assetPaths['/assets/threadline-icon.png']);
  assert.ok(stat.size < 150 * 1024, `icon is ${stat.size} bytes`);
  const header = fs.readFileSync(assetPaths['/assets/threadline-icon.png']).subarray(0, 24);
  assert.equal(header.readUInt32BE(16), 256, 'icon should be 256 pixels wide');
  assert.equal(header.readUInt32BE(20), 256, 'icon should be 256 pixels tall');
});

test('the message avatars match the size they are shown at', () => {
  // A message avatar is 30 CSS pixels wide, so 64 pixels is already twice the
  // resolution any display needs.
  for (const name of ['user-avatar', 'codex-avatar', 'cursor-avatar']) {
    const file = assetPaths[`/assets/${name}.png`];
    const stat = fs.statSync(file);
    assert.ok(stat.size < 20 * 1024, `${name} is ${stat.size} bytes`);
    const header = fs.readFileSync(file).subarray(0, 24);
    assert.equal(header.readUInt32BE(16), 64, `${name} should be 64 pixels wide`);
    assert.equal(header.readUInt32BE(20), 64, `${name} should be 64 pixels tall`);
  }
});
