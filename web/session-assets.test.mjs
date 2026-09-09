import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mediaMarkdown, archiveAssets } from './session-assets.mjs';
import { extractMessages } from './codex-sessions.mjs';
import { parseCursorTranscript } from './cursor-sessions.mjs';
const id = '01a07f57-0a62-7d60-b32e-40046e709439';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCWQAAAAASUVORK5CYII=';
const image = { type: 'input_image', image_url: 'data:image/png;base64,' + png };
function directory(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'threadline-media-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }

test('Codex includes image-only messages and tool media without tool text; stable IDs and deduplicated cache', t => {
  const dir = directory(t);
  const records = [{ type: 'session_meta', payload: { id } },
    { type: 'response_item', payload: { type: 'message', role: 'user', content: [image] } },
    { type: 'response_item', payload: { type: 'custom_tool_call_output', call_id: 'call1', output: [{ type: 'input_text', text: 'secret log /private/password.txt' }, image] } },
    { type: 'response_item', payload: { type: 'function_call_output', call_id: 'call2', output: JSON.stringify({ content: [{ type: 'resource_link', uri: 'file:///tmp/report.pdf', name: '报告' }] }) } }];
  const parsed = extractMessages(records, id, { assetCacheDir: dir }).messages;
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].attachments[0].kind, 'image');
  assert.equal(parsed[2].attachments[0].path, '/tmp/report.pdf');
  assert.ok(parsed.every(m => !m.text.includes('secret')));
  assert.deepEqual(fs.readFileSync(parsed[0].attachments[0].path), Buffer.from(png, 'base64'));
  assert.equal(fs.readdirSync(dir).length, 1);
  assert.deepEqual(extractMessages(records, id, { assetCacheDir: dir }).messages, parsed);
});

test('Cursor image-only blocks and file links become attachments', t => {
  const dir = directory(t);
  const rows = [{ role: 'assistant', message: { content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: png } }] } }, { role: 'assistant', message: { content: [{ type: 'text', text: '[文档](</tmp/report.pdf>)' }] } }];
  const messages = parseCursorTranscript(rows.map(JSON.stringify).join('\n'), id, dir);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].attachments[0].kind, 'image');
  assert.equal(messages[1].attachments[0].kind, 'file');
});

test('archive reports missing, symlink, directory and oversized files; keeps successful copies', t => {
  const dir = directory(t); fs.mkdirSync(path.join(dir, 'attachments'));
  const good = path.join(dir, 'report.pdf'); fs.writeFileSync(good, 'pdf content');
  const link = path.join(dir, 'link.pdf'); fs.symlinkSync(good, link);
  const huge = path.join(dir, 'huge.bin'); const fd = fs.openSync(huge, 'w'); fs.ftruncateSync(fd, 26 * 1024 * 1024); fs.closeSync(fd);
  const result = archiveAssets([{ text: '', attachments: [good, link, dir, huge, path.join(dir, 'missing')].map(path => ({ path, kind: 'file' })) }], dir);
  assert.equal(result.assets.length, 1); assert.equal(result.warnings.length, 4);
  assert.equal(fs.readFileSync(path.join(dir, 'attachments', result.assets[0].storedName), 'utf8'), 'pdf content');
  assert.equal(mediaMarkdown({ output: 'secret log /tmp/report.pdf' }, dir), '');
});

test('tool preview images are progress; explicit final-answer images remain final', t => {
  const dir=directory(t);
  const records=[{type:'session_meta',payload:{id}},
    {type:'response_item',payload:{type:'custom_tool_call_output',call_id:'preview',output:[image]}},
    {type:'response_item',payload:{type:'message',role:'assistant',channel:'commentary',content:[image]}},
    {type:'response_item',payload:{type:'message',role:'assistant',channel:'final',content:[{type:'output_text',text:'这是交付结果'},image]}}];
  const messages=extractMessages(records,id,{assetCacheDir:dir}).messages;
  assert.deepEqual(messages.map(m=>m.phase),['commentary','commentary','final']);
  assert.equal(messages.filter(m=>m.phase!=='commentary').length,1);
  assert.ok(messages.at(-1).hasImages);
});

test('assistant memory envelope is excluded from visible text and attachments; examples and user text remain intact', () => {
  const envelope='<oai-mem-citation>\n<citation_entries>\nMEMORY.md:18-18|note=[context]\n</citation_entries>\n<rollout_ids>\n</rollout_ids>\n</oai-mem-citation>';
  const message=(role,text)=>({type:'response_item',payload:{type:'message',role,content:[{type:'output_text',text}]}});
  const messages=extractMessages([{type:'session_meta',payload:{id}},message('assistant','完成\n\n'+envelope),message('assistant','```xml\n'+envelope+'\n```'),message('user',envelope)],id).messages;
  assert.equal(messages[0].text,'完成');
  assert.equal(messages[1].text,'```xml\n'+envelope+'\n```');
  assert.equal(messages[2].text,envelope);
});

test('Codex upload envelope and image block render once, retaining multiple uploads and standalone images', t => {
  const dir=directory(t);
  const marker=n=>`<image name=[Image #${n}] path="/missing/upload-${n}.png">\n</image>`;
  const parse=content=>extractMessages([{type:'session_meta',payload:{id}},{type:'response_item',payload:{type:'message',role:'user',content}}],id,{assetCacheDir:dir}).messages[0];
  const one=parse([{type:'input_text',text:'看这张图\n'+marker(1)},image]);
  assert.equal((one.text.match(/!\[/g)||[]).length,1);
  assert.equal(one.attachments.length,1);
  assert.ok(one.text.startsWith('看这张图'));
  assert.ok(fs.existsSync(one.attachments[0].path));
  const second={type:'input_image',image_url:'https://example.com/second.png'};
  const two=parse([{type:'input_text',text:marker(1)+'\n第二张\n'+marker(2)},image,second]);
  assert.equal((two.text.match(/!\[/g)||[]).length,2);
  assert.ok(two.text.indexOf('第二张')<two.text.indexOf('https://example.com/second.png'));
  assert.equal((parse([image,second]).text.match(/!\[/g)||[]).length,2);
  const pathOnly=parse([{type:'input_text',text:marker(1)}]);
  assert.ok(pathOnly.text.includes('/missing/upload-1.png'));
});
