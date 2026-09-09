import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CardRenderer } from './card-renderer.mjs';
import { cardDocument } from './card-template.mjs';
import { Sharing } from './sharing.mjs';

function fixture(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'threadline-cards-'));
  const sharing = new Sharing({ dataDir }), renderer = new CardRenderer({ dataDir, sharing });
  t.after(() => { renderer.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  return { dataDir, sharing, renderer };
}
const args = text => ({ session: { title: '中文图卡' }, selected: [{ id: 'm', role: 'assistant', text }] });
async function terminal(renderer, id) {
  const until = Date.now() + 120000;
  while (Date.now() < until) {
    const status = renderer.status(id);
    if (['done', 'failed', 'cancelled'].includes(status.phase) && !renderer.active) return status;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw Error('render did not finish');
}

test('card template escapes untrusted HTML and only embeds selected snapshot images', t => {
  const { sharing, renderer } = fixture(t);
  const job = sharing.load(sharing.prepare(args('<script>alert(1)</script>\n\n![外链](https://example.com/secret.png)\n\n[链接](https://example.com)\n\n```js\nconst x = "<tag>";\n```')).id);
  job.title = '<img src=x onerror=alert(1)>';
  const html = cardDocument(job);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('data-language="js"'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('src="https://example.com'));
  assert.ok(!html.includes('href="https://example.com'));
  assert.equal(renderer.status(job.id).phase, 'idle');
  assert.equal(renderer.runtime().ready, false);
  assert.equal(fs.existsSync(renderer.runtimeRoot), false, 'opening a preview must not download Chromium');
});

test('real Chromium pagination preserves long paragraphs, code, lists and table cells; cancel retries and reuses completed PNGs', { skip: !process.env.CARD_TEST_RUNTIME, timeout: 180000 }, async t => {
  const { sharing, renderer } = fixture(t);
  renderer.runtimeRoot = path.resolve(process.env.CARD_TEST_RUNTIME);
  assert.equal(renderer.runtime().ready, true);
  const paragraph = Array.from({ length: 220 }, (_, i) => `段${i}中文👩🏽‍💻English `).join('');
  const code = Array.from({ length: 90 }, (_, i) => `const value${i} = "代码${i}";`).join('\n');
  const cells = Array.from({ length: 35 }, (_, i) => `| 行${i} | 内容${i} |`).join('\n');
  const giantCell = '超长单元格内容'.repeat(650);
  const text = `${paragraph}\n\n\`\`\`js\n${code}\n\`\`\`\n\n1. ${'有序列表内容'.repeat(600)}\n2. 最后一个列表项\n\n| 项目 | 说明 |\n| --- | --- |\n${cells}\n| 特长行 | ${giantCell} |\n\n结束标记`;
  const job = sharing.prepare(args(text));
  renderer.start(job.id);
  while (!renderer.active.child) await new Promise(resolve => setTimeout(resolve, 5));
  renderer.cancel(job.id);
  assert.equal((await terminal(renderer, job.id)).phase, 'cancelled');
  assert.equal(fs.existsSync(renderer.pageFile(job.id, 0)), false);
  renderer.start(job.id);
  const done = await terminal(renderer, job.id);
  assert.equal(done.phase, 'done', done.message);
  assert.ok(done.total > 10);
  const report = JSON.parse(fs.readFileSync(path.join(path.dirname(renderer.pageFile(job.id, 0)), 'layout.json')));
  assert.ok(report.pages.every(page => !page.overflow));
  const combined = report.pages.map(p => p.text.replace(/AI 回答 · 接上页/g, '')).join('').replace(/\s/g, '');
  assert.ok(combined.includes(paragraph.replace(/\s/g, '')), 'paragraph lost or reordered text');
  assert.ok(combined.includes(code.replace(/\s/g, '')), 'code lost or reordered text');
  assert.ok(combined.includes(giantCell), 'oversize table cell lost text');
  assert.ok(combined.includes('有序列表内容'.repeat(600)), 'list lost text');
  for (let i = 0; i < 35; i++) assert.ok(combined.includes(`行${i}内容${i}`));
  assert.ok(combined.endsWith('结束标记'));
  const png = fs.readFileSync(renderer.pageFile(job.id, 0));
  assert.equal(png.readUInt32BE(16), 1080); assert.equal(png.readUInt32BE(20), 1440);
  const restarted = new CardRenderer({ dataDir: path.dirname(sharing.root), sharing });
  assert.equal(restarted.status(job.id).phase, 'done');
  assert.equal(renderer.start(job.id).phase, 'done');
  assert.deepEqual(fs.readFileSync(renderer.pageFile(job.id, 0)), png);
});

test('selected image renders from its snapshot after source removal, corrupt snapshots are rejected', { skip: !process.env.CARD_TEST_RUNTIME, timeout: 120000 }, async t => {
  const { dataDir, sharing, renderer } = fixture(t);
  renderer.runtimeRoot = path.resolve(process.env.CARD_TEST_RUNTIME);
  const file = path.join(dataDir, 'image.png');
  fs.writeFileSync(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'));
  const input = { session: { title: '图片位置' }, selected: [{ id: 'image', role: 'assistant', text: `图片前\n\n![图片](<${file}>)\n\n图片后`, attachments: [{ path: file, kind: 'image' }] }] };
  const preview = sharing.prepare(input);
  const selected = sharing.prepare({ ...input, attachmentIDs: [preview.attachments[0].id] });
  fs.unlinkSync(file);
  renderer.start(selected.id);
  const result = await terminal(renderer, selected.id);
  assert.equal(result.phase, 'done', result.message);
  const layout = JSON.parse(fs.readFileSync(path.join(path.dirname(renderer.pageFile(selected.id, 0)), 'layout.json')));
  assert.deepEqual(layout.pages.flatMap(p => p.images), [{ width: 1, height: 1 }]);
  fs.writeFileSync(path.join(path.dirname(sharing.file(selected.id)), selected.attachments[0].id), 'changed bytes');
  const stored = sharing.load(selected.id); delete stored.cardEngine; sharing.save(stored);
  const fresh = new CardRenderer({ dataDir, sharing });
  assert.throws(() => fresh.start(selected.id), /变化|改变|损坏|不一致/);
});

test('theme is validated and saved with each immutable preview', t => {
  const { sharing } = fixture(t);
  const original = sharing.prepare({ ...args('同一份内容'), cardTheme: 'paper' });
  const changed = sharing.prepare({ ...args('同一份内容'), cardTheme: 'midnight' });
  assert.equal(original.cardTheme, 'paper');
  assert.equal(sharing.load(original.id).cardTheme, 'paper');
  assert.equal(sharing.load(changed.id).cardTheme, 'midnight');
  assert.notEqual(original.id, changed.id);
  assert.throws(() => sharing.prepare({ ...args('内容'), cardTheme: '</style>' }), /主题无效/);
  assert.match(cardDocument(sharing.load(changed.id)), /data-layout="night"/);
});

test('all theme layouts paginate the same content without overflow or missing text', { skip: !process.env.CARD_TEST_RUNTIME, timeout: 120000 }, async t => {
  const { cardThemes } = await import('./card-themes.mjs');
  const { sharing, renderer } = fixture(t);
  renderer.runtimeRoot = path.resolve(process.env.CARD_TEST_RUNTIME);
  const paragraph = '多主题跨页正文中文English👩🏽‍💻'.repeat(140);
  for (const theme of cardThemes) {
    const job = sharing.prepare({ ...args(`## 主题标题\n\n${paragraph}\n\n> 引用内容\n\n| 项目 | 结果 |\n| --- | --- |\n| 排版 | 完整 |\n\n\`\`\`js\nconst result = true;\n\`\`\`\n\n最终标记`), cardTheme: theme.id });
    renderer.start(job.id);
    const done = await terminal(renderer, job.id);
    assert.equal(done.phase, 'done', theme.id + ': ' + done.message);
    const report = JSON.parse(fs.readFileSync(path.join(path.dirname(renderer.pageFile(job.id, 0)), 'layout.json')));
    assert.ok(report.pages.every(page => !page.overflow), theme.id);
    const combined = report.pages.map(page => page.text.replace(/AI 回答 · 接上页/g, '')).join('').replace(/\s/g, '');
    assert.ok(combined.includes(paragraph), theme.id + ': missing text');
    assert.ok(combined.endsWith('最终标记'));
  }
});

test('long mode renders all text in one continuous PNG with a variable height', { skip: !process.env.CARD_TEST_RUNTIME, timeout: 120000 }, async t => {
  const { sharing, renderer } = fixture(t);renderer.runtimeRoot=path.resolve(process.env.CARD_TEST_RUNTIME);
  const text=Array.from({length:60},(_,i)=>`段落${i}：长图保持完整顺序，中文、English 与代码都应该清晰。`).join('\n\n');
  const job=sharing.prepare({...args(text),cardMode:'long',cardTheme:'blue'});
  renderer.start(job.id);const done=await terminal(renderer,job.id);assert.equal(done.phase,'done',done.message);assert.equal(done.total,1);
  const report=JSON.parse(fs.readFileSync(path.join(path.dirname(renderer.pageFile(job.id,0)),'layout.json')));
  assert.equal(report.pages.length,1);assert.ok(!report.pages[0].overflow);
  assert.ok(report.pages[0].text.replace(/\s/g,'').includes(text.replace(/\s/g,'')));
  const png=fs.readFileSync(renderer.pageFile(job.id,0));assert.equal(png.readUInt32BE(16),1080);assert.ok(png.readUInt32BE(20)>1440);
  assert.throws(()=>sharing.prepare({...args(text),cardMode:'bad'}),/模式无效/);
  const tooLong=sharing.prepare({...args(Array.from({length:900},(_,i)=>`第${i}段内容`).join('\n\n')),cardMode:'long'});
  renderer.start(tooLong.id);const rejected=await terminal(renderer,tooLong.id);assert.equal(rejected.phase,'failed');assert.match(rejected.message,/单张长图上限/);assert.equal(fs.existsSync(renderer.pageFile(tooLong.id,0)),false);
});

test('inline images survive empty attachment arrays and thumbnails do not imply export selection', t => {
  const {dataDir,sharing}=fixture(t);const file=path.join(dataDir,'image.png');
  fs.writeFileSync(file,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'));
  const input={session:{title:'图片'},selected:[{id:'m',role:'assistant',text:`前文\n\n![图](<${file}>)\n\n后文`,attachments:[]}]};
  const p=sharing.prepare(input);assert.equal(p.attachments.length,1);assert.equal(p.attachments[0].selected,false);
  assert.deepEqual(sharing.thumbnail(p.id,p.attachments[0].id).bytes,fs.readFileSync(file));assert.equal(sharing.exportEntries(p.id).length,1);
  const chosen=sharing.prepare({...input,attachmentIDs:[p.attachments[0].id]});
  assert.deepEqual(chosen.messages[0].parts.map(p=>p.type),['text','image','text']);
  assert.throws(()=>sharing.thumbnail(p.id,'a'.repeat(24)),/不在此次预览/);
  fs.writeFileSync(file,'changed');assert.throws(()=>sharing.thumbnail(p.id,p.attachments[0].id),/已变化/);
});
