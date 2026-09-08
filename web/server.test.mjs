import { LibraryStore } from './storage.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRewindServer, zip } from './server.mjs';
import { extractMessages, CodexSessions } from './codex-sessions.mjs';

function persistedNotes(directory) { const store = new LibraryStore(directory); try { return store.list(); } finally { store.close(); } }
function persistedTopics(directory) { const store = new LibraryStore(directory); try { return store.topics(); } finally { store.close(); } }

async function fixture(t, feishu) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rewind-web-'));
  const codexHome = path.join(directory, 'codex');
  const server = createRewindServer({ dataDir: directory, legacyDir: null, ocr: false, codexHome, feishu });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(directory, { recursive: true, force: true }); });
  const request = async (route, method = 'GET', body) => {
    const response = await fetch(origin + route, { method, headers: { 'Content-Type': 'application/json', 'X-Rewind-Request': '1', Origin: origin }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { response, data: response.headers.get('content-type').includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
  };
  return { request, directory, origin, codexHome };
}

test('capture, edit, search notes, preserve code, permanently delete', async t => {
  const { request, directory } = await fixture(t);
  const created = await request('/api/clips', 'POST', { body: '# 权限架构\n```swift\nlet x = 1\n```', source: 'Codex' });
  assert.equal(created.response.status, 201);
  let clip = created.data.clip;
  assert.equal(clip.title, '权限架构');
  const updated = await request('/api/clips/' + clip.id, 'PUT', { version: clip.version, note: '第二版参考' });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.data.clip.body, clip.body);
  assert.equal((await request('/api/library?q=第二版')).data.clips.length, 1);
  const stale = await request('/api/clips/' + clip.id, 'PUT', { version: clip.version, note: 'stale tab' });
  assert.equal(stale.response.status, 409);
  const persisted = persistedNotes(directory);
  assert.equal(persisted[0].note, '第二版参考');
  assert.equal((await request('/api/clips/' + clip.id, 'DELETE')).response.status, 200);
  assert.equal((await request('/api/library')).data.clips.length, 0);
  assert.ok(!persistedNotes(directory).some(c=>c.id===clip.id));
  assert.equal((await request('/api/clips/'+clip.id+'/restore','POST',{})).response.status,404);
});

test('image capture, original download and ZIP include attachments and markdown', async t => {
  const { request } = await fixture(t);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCWQAAAAASUVORK5CYII=', 'base64');
  const { data } = await request('/api/clips', 'POST', { body: '', image: 'data:image/png;base64,' + png.toString('base64'), source: 'Cursor' });
  const clip = data.clip;
  assert.ok(clip.hasImage);
  const image = await request('/api/attachments/' + clip.attachment);
  assert.deepEqual(image.data, png);
  const exported = await request('/api/export/' + clip.id);
  assert.equal(exported.response.status, 200);
  assert.equal(exported.data.readUInt32LE(0), 0x04034b50);
  assert.ok(exported.data.includes(Buffer.from('attachments/' + clip.attachment)));
  assert.ok(exported.data.includes(Buffer.from('来源：Cursor')));
  assert.equal((await request('/api/library')).data.clips[0].ocrStatus, 'unavailable');
});

test('reject cross-site mutations and invalid image bytes', async t => {
  const { origin, request } = await fixture(t);
  const response = await fetch(origin + '/api/clips', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example', 'X-Rewind-Request': '1' }, body: JSON.stringify({ body: 'not authorized' }) });
  assert.equal(response.status, 403);
  const unmarked = await fetch(origin + '/api/clips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: 'not authorized' }) });
  assert.equal(unmarked.status, 403);
  const invalid = await request('/api/clips', 'POST', { image: 'data:image/png;base64,' + Buffer.from('<script>').toString('base64') });
  assert.equal(invalid.response.status, 400);
  assert.equal((await request('/api/library')).data.total, 0);
});

test('corrupt persisted library is never silently replaced', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewind-corrupt-'));
  try {
    fs.writeFileSync(path.join(dir, 'library.json'), 'broken');
    assert.throws(() => createRewindServer({ dataDir: dir, legacyDir: null }));
    assert.equal(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'), 'broken');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('legacy import is a copy and does not overwrite later web edits', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewind-import-'));
  try {
    const legacy = path.join(dir, 'legacy'), web = path.join(dir, 'web');
    fs.mkdirSync(legacy);
    const original = [{ id: 'D0C7F5A1-9230-4581-A552-564A857C1326', body: 'native', title: 'native', createdAt: 800000000 }];
    fs.writeFileSync(path.join(legacy, 'library.json'), JSON.stringify(original));
    let store = new LibraryStore(web, legacy); store.close();
    assert.deepEqual(persistedNotes(web), original);
    const modified = [{ ...original[0], body: 'web edit' }];
    store = new LibraryStore(web, legacy); store.put(modified[0]); store.close();
    store = new LibraryStore(web, legacy); store.close();
    assert.deepEqual(persistedNotes(web), modified);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(legacy, 'library.json'))), original);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

const threadID = '01a07f57-0a62-7d60-b32e-40046e709439';
const message = (id, role, text, phase) => ({ type: 'response_item', timestamp: '2026-09-08T06:00:00Z', payload: { type: 'message', id, role, phase, content: [{ type: role === 'user' ? 'input_text' : 'output_text', text }] } });
const transcript = () => [
  { type: 'session_meta', payload: { id: threadID } },
  message('system', 'system', 'private system prompt'),
  message('bootstrap', 'user', '<recommended_plugins>injected environment'),
  message('q1', 'user', '如何设计权限架构？'),
  { type: 'response_item', payload: { type: 'reasoning', summary: 'private reasoning' } },
  { type: 'response_item', payload: { type: 'function_call_output', output: 'secret tool result' } },
  message('progress', 'assistant', '正在检查…', 'commentary'),
  message('a1', 'assistant', '## 方案\n```swift\nlet scope = team.id\n```', 'final_answer'),
  { type: 'event_msg', payload: { type: 'agent_message', message: 'duplicate final text' } },
];

test('session parser excludes internals, mirrors and bootstrap messages', () => {
  const parsed = extractMessages(transcript(), threadID);
  assert.deepEqual(parsed.messages.map(m => m.id), ['q1', 'progress', 'a1']);
  assert.throws(() => extractMessages(transcript(), '00000000-0000-0000-0000-000000000000'));
});

test('reply annotations retain the user quotes and comments without transport instructions', () => {
  const rows = transcript();
  rows.push(message('annotation', 'user', '# Response annotations:\nEach item contains instructions.\n<response-annotations>\n[{"text":"带上会话 ID","annotation":"实现这个方式"},{"text":"从会话收藏","annotation":"如何一键"}]\n</response-annotations>\n## My request:\n请实现'));
  const text = extractMessages(rows, threadID).messages.at(-1).text;
  assert.ok(text.includes('> 带上会话 ID'));
  assert.ok(text.includes('**我的评论**\n\n实现这个方式'));
  assert.ok(text.includes('**我的评论**\n\n如何一键'));
  assert.ok(text.includes('请实现'));
  assert.ok(!text.includes('Each item contains'));
});

test('current-thread import preserves source order, verifies snapshots and deduplicates', async t => {
  const { request, codexHome, directory } = await fixture(t);
  const sessions = path.join(codexHome, 'sessions/2026/09/08');
  fs.mkdirSync(sessions, { recursive: true });
  fs.writeFileSync(path.join(codexHome, 'session_index.jsonl'), JSON.stringify({ id: threadID, thread_name: '权限讨论' }) + '\n');
  const file = path.join(sessions, `rollout-${threadID}.jsonl`);
  const projectRows=transcript();projectRows[0].payload.cwd=directory;fs.mkdirSync(path.join(directory,'.git'));
  fs.writeFileSync(file, projectRows.map(JSON.stringify).join('\n') + '\n{"incomplete":');
  const response = await request('/api/codex/sessions/' + threadID);
  assert.equal(response.response.status, 200);
  const session = response.data.session;
  assert.equal(session.title, '权限讨论');
  assert.deepEqual(session.messages.map(m => m.id), ['q1', 'a1']);
  assert.ok(session.messages.every(m=>m.saved===false));
  const payload = { threadID, messageIDs: ['a1', 'q1'], fingerprints: Object.fromEntries(session.messages.map(m => [m.id, m.fingerprint])) };
  const imported = await request('/api/codex/import', 'POST', payload);
  assert.equal(imported.response.status, 201);
  assert.ok(imported.data.clip.body.indexOf('我的问题') < imported.data.clip.body.indexOf('AI 回答'));
  assert.ok(imported.data.clip.body.includes('let scope = team.id'));
  assert.deepEqual(imported.data.clip.provenance.messages.map(m => m.id), ['q1', 'a1']);
  assert.ok(imported.data.clip.sourceURL.includes('thread=' + threadID));
  assert.equal(imported.data.clip.provenance.cwd,directory);
  assert.equal(imported.data.clip.provenance.project.root,directory);
  assert.equal(imported.data.clip.provenance.project.name,path.basename(directory));
  const duplicate = await request('/api/codex/import', 'POST', payload);
  assert.equal(duplicate.data.duplicate, true);
  assert.equal(duplicate.data.clip.id, imported.data.clip.id);
  assert.ok((await request('/api/codex/sessions/'+threadID)).data.session.messages.every(m=>m.saved));
  await request('/api/clips/'+imported.data.clip.id,'DELETE');
  assert.ok((await request('/api/codex/sessions/'+threadID)).data.session.messages.every(m=>!m.saved));
  await request('/api/codex/import','POST',payload);
  const changed = transcript(); changed.at(-2).payload.content[0].text = 'changed answer';
  fs.writeFileSync(file, changed.map(JSON.stringify).join('\n') + '\n');
  assert.equal((await request('/api/codex/import', 'POST', payload)).response.status, 409);
  assert.equal((await request('/api/codex/import', 'POST', { ...payload, messageIDs: ['forged'] })).response.status, 409);
  assert.equal((await request('/api/codex/sessions/not-a-thread')).response.status, 400);
  // The saved copy remains available even when the original session is removed.
  fs.unlinkSync(file);
  assert.ok(persistedNotes(directory)[0].body.includes('let scope = team.id'));
  assert.equal((await request('/api/codex/sessions/' + threadID)).response.status, 404);
});

test('a fork filename containing the parent ID does not expose another session', async t => {
  const { request, codexHome } = await fixture(t);
  fs.mkdirSync(path.join(codexHome, 'sessions'), { recursive: true });
  const rows = transcript(); rows[0].payload.id = '00000000-0000-0000-0000-000000000000';
  fs.writeFileSync(path.join(codexHome, 'sessions', `rollout-${threadID}_fork.jsonl`), rows.map(JSON.stringify).join('\n'));
  assert.equal((await request('/api/codex/sessions/' + threadID)).response.status, 404);
});

test('threads persist independently, notes attach without altering originals, stale edits fail', async t => {
  const { request, directory } = await fixture(t);
  const created = await request('/api/threads', 'POST', { title: '产品方向', goal: '如何让思考跨会话延续？' });
  assert.equal(created.response.status, 201);
  const topic = created.data.topic;
  assert.equal((await request('/api/library')).data.topics[0].id, topic.id);
  const clip = (await request('/api/clips', 'POST', { body: '原始判断与条件', topicID: topic.id })).data.clip;
  assert.equal(clip.topicID, topic.id);
  const moved = await request('/api/clips/' + clip.id, 'PUT', { version: clip.version, topicID: '', note: '待验证' });
  assert.equal(moved.data.clip.body, '原始判断与条件');
  assert.equal(moved.data.clip.topicID, '');
  assert.equal((await request('/api/clips/'+clip.id, 'PUT', { version: moved.data.clip.version, topicID: 'missing' })).response.status, 400);
  const updated = await request('/api/threads/'+topic.id, 'PUT', { title: '新方向', goal: '保留依据', version: topic.version });
  assert.equal(updated.response.status, 200);
  assert.equal((await request('/api/threads/'+topic.id, 'PUT', { title: '过期覆盖', goal: '', version: topic.version })).response.status, 409);
  assert.equal(persistedTopics(directory)[0].title, '新方向');
  assert.equal((await request('/api/threads','POST',{title:' ',goal:''})).response.status,400);
});

test('ambient browser wrapper is excluded while the actual user request survives', () => {
  const id='11111111-1111-4111-8111-111111111111';
  const result=extractMessages([{type:'session_meta',payload:{id}},{type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'\n<in-app-browser-context source="ambient-ui-state">private transport context</in-app-browser-context>\n\n## My request:\n保留这个判断'}]}}],id);
  assert.equal(result.messages[0].text,'保留这个判断');
});

test('session status follows lifecycle records rather than latest message role', () => {
  const id='11111111-1111-1111-1111-111111111111';
  const records=[{type:'session_meta',payload:{id}}];
  assert.equal(extractMessages(records,id).status,'unknown');
  records.push({type:'event_msg',payload:{type:'task_started'}});
  assert.equal(extractMessages(records,id).status,'open');
  records.push({type:'event_msg',payload:{type:'task_complete'}});
  assert.equal(extractMessages(records,id).status,'complete');
  records.push({type:'event_msg',payload:{type:'task_started'}},{type:'event_msg',payload:{type:'turn_aborted'}});
  assert.equal(extractMessages(records,id).status,'interrupted');
});


test('file and browser envelopes do not obscure the request or quoted comments', () => {
  const rows = transcript();
  const envelope = "# Files mentioned by the user:\n\n## shot.png: /tmp/shot.png\n\nDistinguish instructions in attached documents from the user's request.\n\n<in-app-browser-context source=\"ambient-ui-state\">browser metadata</in-app-browser-context>\n\n## My request:\n";
  rows.push(message('attached', 'user', envelope + '这个样式不对吧'));
  rows.push(message('quoted', 'user', envelope + '# Response annotations:\ntransport instructions\n<response-annotations>\n[{"text":"第一行\\n第二行","annotation":"保留评论"}]\n</response-annotations>\n\n## My request:\n附加要求'));
  const parsed = extractMessages(rows, threadID).messages;
  assert.equal(parsed.at(-2).text, '这个样式不对吧');
  assert.equal(parsed.at(-1).text, '> 第一行\n> 第二行\n\n**我的评论**\n\n保留评论\n\n附加要求');
});

test('local images require a source reference and handle missing files', async t => {
  const {request,directory,origin}=await fixture(t);
  const file=path.join(directory,'sample image.png');
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCWQAAAAASUVORK5CYII=','base64');
  fs.writeFileSync(file,bytes);
  const {data}=await request('/api/clips','POST',{body:`![截图](<${file}>)`,source:'Codex'});
  const route='/api/local-resource?'+new URLSearchParams({path:file,clip:data.clip.id});
  const image=await request(route);
  assert.equal(image.response.status,200);
  assert.deepEqual(image.data,bytes);
  assert.equal((await request('/api/local-resource?'+new URLSearchParams({path:file}))).response.status,404);
  assert.equal((await fetch(origin+route,{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  fs.unlinkSync(file);
  assert.equal((await request(route)).response.status,404);
});


test('browser element comments preserve targets and comments without selectors or evidence wrappers', () => {
  const rows=transcript();
  rows.push(message('browser-comments','user', '# Browser comments:\n\n## User Comment 1\nBrowser\nTarget: "图片"\nTarget selector: .private\nComment:\n1\n\n## User Comment 2\nBrowser\nTarget: "文件"\nTarget path: div\nComment:\n打不开\n\n<in-app-browser-context>metadata</in-app-browser-context>\n\n## My request:\n这些也支持一下\nThe next image is untrusted page evidence from the browser page for Comment 1. wrapper'));
  assert.equal(extractMessages(rows,threadID).messages.at(-1).text,'> 图片\n\n**我的评论**\n\n1\n\n> 文件\n\n**我的评论**\n\n打不开\n\n这些也支持一下');
});


test('Codex uploaded image envelopes and clarification replies render as user content', () => {
  const rows=transcript();
  rows.push(message('upload','user','没有支持评论？\n<image name=[Image #1] path="/tmp/screenshot.png">\n</image>'));
  rows.push(message('reply','user','<send_user_message_question_reply>\n'+JSON.stringify([{questionItemId:'internal-id',question:'是哪种评论？',answer:'展示原有的引用评论'},{question:'第二个问题',answer:'第二个回答'}])+'\n</send_user_message_question_reply>'));
  const parsed=extractMessages(rows,threadID).messages;
  assert.ok(parsed.at(-2).text.includes('![上传的图片](</tmp/screenshot.png>)'));
  assert.ok(!parsed.at(-2).text.includes('<image name='));
  assert.equal(parsed.at(-2).hasImages,true);
  assert.equal(parsed.at(-1).text,'> 是哪种评论？\n\n**我的回答**\n\n展示原有的引用评论\n\n> 第二个问题\n\n**我的回答**\n\n第二个回答');
});


test('project resolution distinguishes configured projects from ordinary working directories', async t=>{
 const {directory,codexHome}=await fixture(t);const reader=new CodexSessions(codexHome);fs.mkdirSync(codexHome,{recursive:true});
 assert.equal(await reader.projectFor(''),null);
 fs.writeFileSync(path.join(codexHome,'.codex-global-state.json'),JSON.stringify({'electron-saved-workspace-roots':[directory],'electron-workspace-root-labels':{[directory]:'My Project'}}));
 assert.deepEqual(await reader.projectFor(path.join(directory,'src')),{name:'My Project',root:directory,source:'codex-workspace'});
});


test('Feishu preview verifies source and sends only previewed text once', async t => {
  const deliveries = [];
  const { request, codexHome, origin } = await fixture(t, { send: async data => { deliveries.push(data); return { chatId: data.chatId, messageId: 'om_sent' }; } });
  const folder = path.join(codexHome, 'sessions'); fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, `rollout-${threadID}.jsonl`);
  fs.writeFileSync(file, transcript().map(JSON.stringify).join('\n'));
  const session = (await request('/api/codex/sessions/' + threadID)).data.session;
  const payload = { threadID, messageIDs: ['a1', 'q1'], fingerprints: Object.fromEntries(session.messages.map(m => [m.id, m.fingerprint])), note: '请看讨论' };
  const forged = await request('/api/feishu/preview', 'POST', { ...payload, fingerprints: {} }); assert.equal(forged.response.status, 409);
  const preview = (await request('/api/feishu/preview', 'POST', payload)).data;
  assert.ok(preview.text.indexOf('【我】') < preview.text.indexOf('【Codex】'));
  assert.ok(preview.text.startsWith('请看讨论'));
  assert.equal(deliveries.length, 0);
  const crossSite = await fetch(origin + '/api/feishu/send', { method: 'POST', headers: { Origin: 'https://evil.invalid', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(crossSite.status, 403);
  const data = { previewId: preview.id, chatId: 'oc_test', text: 'forged' };
  assert.equal((await request('/api/feishu/send', 'POST', data)).response.status, 200);
  assert.equal((await request('/api/feishu/send', 'POST', data)).response.status, 200);
  assert.equal(deliveries.length, 1); assert.equal(deliveries[0].text, preview.text);
  assert.equal(deliveries[0].card.schema, '2.0');
  assert.equal(deliveries[0].card.body.elements.filter(e => e.tag === 'collapsible_panel').length, 2);
  const second = (await request('/api/feishu/preview', 'POST', payload)).data;
  const changed = transcript(); changed.at(-2).payload.content[0].text = 'changed answer';
  fs.writeFileSync(file, changed.map(JSON.stringify).join('\n'));
  assert.equal((await request('/api/feishu/send', 'POST', { ...data, previewId: second.id })).response.status, 409);
  assert.equal(deliveries.length, 1);
});

test('multi-card retries skip delivered cards and lock destination after partial failure', async t => {
  const calls = []; let failOnce = true;
  const { request, codexHome } = await fixture(t, { send: async data => { calls.push(data); if (calls.length === 2 && failOnce) { failOnce = false; throw Error('network'); } return { messageId: 'om_' + calls.length, chatId: data.chatId }; } });
  const folder = path.join(codexHome, 'sessions'); fs.mkdirSync(folder, { recursive: true });
  const rows = transcript(); rows.at(-2).payload.content[0].text = '长回答😀'.repeat(12000);
  fs.writeFileSync(path.join(folder, `rollout-${threadID}.jsonl`), rows.map(JSON.stringify).join('\n'));
  const session = (await request('/api/codex/sessions/' + threadID)).data.session;
  const preview = (await request('/api/feishu/preview', 'POST', { threadID, messageIDs: ['a1', 'q1'], fingerprints: Object.fromEntries(session.messages.map(m => [m.id, m.fingerprint])), note: '' })).data;
  assert.ok(preview.cardCount > 2);
  const payload = { previewId: preview.id, target: 'self' };
  assert.equal((await request('/api/feishu/send', 'POST', payload)).response.status, 502);
  assert.equal((await request('/api/feishu/send', 'POST', { ...payload, target: 'group', chatId: 'oc_other' })).response.status, 409);
  const result = await request('/api/feishu/send', 'POST', payload);
  assert.equal(result.response.status, 200); assert.equal(result.data.sentCount, preview.cardCount);
  assert.equal(calls.length, preview.cardCount + 1); assert.equal(calls[1].requestId, calls[2].requestId); assert.notEqual(calls[0].requestId, calls[1].requestId);
});

test('attachments require explicit selection, detect changes and retry only unfinished files', async t => {
  const uploads = [], sends = []; let fileFailure = true;
  const { request, codexHome } = await fixture(t, {
    upload: async a => { uploads.push(a); return a.kind === 'image' ? 'img_test' : 'file_test'; },
    send: async data => { sends.push(data); if (data.fileKey && fileFailure) { fileFailure = false; throw Error('file delivery failed'); } return { messageId: 'om_' + sends.length }; }
  });
  fs.mkdirSync(codexHome, { recursive: true });
  const image = path.join(codexHome, 'photo.png'), file = path.join(codexHome, 'report.txt');
  fs.writeFileSync(image, 'image fixture'); fs.writeFileSync(file, 'original');
  const rows = transcript(); rows.at(-2).payload.content[0].text = `图片 ![示例](<${image}>) 文件 [报告](<${file}>)`;
  const folder = path.join(codexHome, 'sessions'); fs.mkdirSync(folder, { recursive: true }); fs.writeFileSync(path.join(folder, `rollout-${threadID}.jsonl`), rows.map(JSON.stringify).join('\n'));
  const session = (await request('/api/codex/sessions/' + threadID)).data.session;
  const payload = { threadID, messageIDs: ['a1'], fingerprints: Object.fromEntries(session.messages.map(m => [m.id, m.fingerprint])), note: '' };
  const first = (await request('/api/feishu/preview', 'POST', payload)).data; assert.equal(first.attachments.length, 2); assert.equal(first.fileCount, 0); assert.equal(uploads.length, 0); assert.match(first.text, /未发送/);
  assert.equal((await request('/api/feishu/preview', 'POST', { ...payload, attachmentIDs: ['forged'] })).response.status, 400);
  const preview = (await request('/api/feishu/preview', 'POST', { ...payload, attachmentIDs: first.attachments.map(a => a.id) })).data;
  fs.writeFileSync(file, 'modified'); const delivery = { previewId: preview.id, target: 'self' };
  assert.equal((await request('/api/feishu/send', 'POST', delivery)).response.status, 409); assert.equal(uploads.length, 0);
  fs.writeFileSync(file, 'original');
  assert.equal((await request('/api/feishu/send', 'POST', delivery)).response.status, 502); assert.equal(uploads.length, 2);
  const result = await request('/api/feishu/send', 'POST', delivery); assert.equal(result.response.status, 200); assert.equal(result.data.fileCount, 1); assert.equal(uploads.length, 2);
  assert.equal(sends.filter(s => s.card).length, 1); assert.equal(sends[0].card.body.elements[0].elements[1].img_key, 'img_test');
  assert.equal(sends[1].requestId, sends[2].requestId);
});
