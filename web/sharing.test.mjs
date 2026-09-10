import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Sharing, splitText, shareText } from './sharing.mjs';
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function fixture(t, request) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'threadline-sharing-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, service: new Sharing({ dataDir: dir, fetch: request }) };
}
function selection(file, text = '结果 **完整原文** @everyone') { return { session: { title: '分享测试' }, selected: [{ id: 'm1', role: 'assistant', text, attachments: file ? [{ path: file, kind: 'file' }] : [] }] }; }
async function discord(service) { await service.connect({ platform: 'discord', webhook: 'https://discord.com/api/webhooks/123456789/abcdefghijk' }); }

test('preview excludes unselected files, snapshots chosen bytes, hides credentials and rejects arbitrary destinations', async t => {
  const { service, dir } = fixture(t, async () => response({ id: '123', channel_id: '456', name: '测试频道' }));
  await discord(service);
  await assert.rejects(service.connect({ platform: 'discord', webhook: 'https://localhost/api/webhooks/1/token' }), /官方|discord/);
  const file = path.join(dir, 'report.txt'); fs.writeFileSync(file, 'original bytes');
  const args = selection(file, `[报告](<${file}>)`), first = service.prepare(args);
  assert.equal(first.attachments[0].selected, false);
  assert.equal(service.exportEntries(first.id).length, 1);
  const chosen = service.prepare({ ...args, attachmentIDs: [first.attachments[0].id] });
  fs.writeFileSync(file, 'changed');
  assert.equal(service.asset(chosen.id, chosen.attachments[0].id).bytes.toString(), 'original bytes');
  assert.ok(!chosen.text.includes(dir));
  assert.ok(!JSON.stringify(service.status()).includes('abcdefghijk'));
  assert.equal(fs.statSync(service.configFile).mode & 0o777, 0o600);
  assert.throws(() => service.prepare({ ...args, attachmentIDs: ['not-in-message'] }), /不可用|不属于/);
});

test('Discord sends multipart files and suppresses mentions; confirmed progress survives restart and retry', async t => {
  let posts = 0, failOnce = true; const sent = [];
  const request = async (url, opts) => {
    if (!opts.method) return response({ id: '123', channel_id: '456' });
    posts++; sent.push(opts.body);
    if (posts === 2 && failOnce) { failOnce = false; return response({}, 400); }
    return response({ id: 'message-' + posts, channel_id: '456' });
  };
  const { service, dir } = fixture(t, request); await discord(service);
  const file = path.join(dir, 'report.txt'); fs.writeFileSync(file, 'report');
  const first = service.prepare(selection(file));
  const preview = service.prepare({ ...selection(file, 'A'.repeat(2400)), platform: 'discord', attachmentIDs: [first.attachments[0].id] });
  let job = await service.send(preview.id);
  assert.deepEqual(job.steps.map(s => s.status), ['sent', 'failed', 'pending']);
  const resumed = new Sharing({ dataDir: dir, fetch: request }); job = await resumed.send(job.id);
  assert.ok(job.steps.every(s => s.status === 'sent')); assert.equal(posts, 4);
  await resumed.send(job.id); assert.equal(posts, 4);
  assert.deepEqual(JSON.parse(sent[0]).allowed_mentions, { parse: [] });
  assert.ok(sent.at(-1) instanceof FormData); assert.equal(await sent.at(-1).get('files[0]').text(), 'report');
  assert.equal(job.sending, false);
});

test('ambiguous delivery requires explicit resolution; a restarted in-flight step is never blindly resent', async t => {
  let posts=0;
  const {service,dir}=fixture(t,async(url,opts)=>{if(!opts.method)return response({id:'123',channel_id:'456'});posts++;throw Error('secret-url-must-not-leak');});await discord(service);
  const preview=service.prepare({...selection(),platform:'discord'});
  const job=await service.send(preview.id);assert.equal(job.steps[0].status,'uncertain');assert.ok(!JSON.stringify(job).includes('secret-url'));
  const resumed=new Sharing({dataDir:dir,fetch:async()=>{throw Error('must not send');}});
  await assert.rejects(resumed.send(job.id),/未知/);assert.equal(posts,1);
  resumed.resolve(job.id,job.steps[0].id,true);assert.ok((await resumed.send(job.id)).steps.every(s=>s.status==='sent'));
  const p=resumed.prepare({...selection(),platform:'discord'}),stored=resumed.load(p.id);stored.steps[0].status='sending';resumed.save(stored);
  assert.equal(resumed.public(resumed.load(p.id)).steps[0].status,'uncertain');await assert.rejects(resumed.send(p.id),/未知/);
});

test('Slack uses external upload flow, opens member DM, and resumes without resending text', async t => {
  const calls=[];let finalize=0;
  const {service,dir}=fixture(t,async(url,opts)=>{
    const method=url.split('/').at(-1);calls.push(method);
    if(url.startsWith('https://files.slack.com/')){assert.equal(Buffer.from(opts.body).toString(),'report');return new Response('ok');}
    const body=JSON.parse(opts.body);
    if(method==='auth.test')return response({ok:true,team:'Workspace',team_id:'T123456'});
    if(method==='conversations.open'){assert.equal(body.users,'U123456');return response({ok:true,channel:{id:'D123456'}});}
    if(method==='chat.postMessage'){assert.equal(body.channel,'D123456');assert.equal(body.mrkdwn,false);return response({ok:true,ts:'123.456',channel:'D123456'});}
    if(method==='files.getUploadURLExternal')return response({ok:true,file_id:'F123456',upload_url:'https://files.slack.com/upload/v1/test'});
    if(method==='files.completeUploadExternal'){finalize++;if(finalize===1)return response({ok:false,error:'missing_scope'});return response({ok:true,files:[{id:'F123456'}]});}
    throw Error('unexpected');
  });
  await service.connect({platform:'slack',token:'xoxb-test-token-123456789',selfUserId:'U123456'});
  const file=path.join(dir,'report.txt');fs.writeFileSync(file,'report');
  const a=service.prepare(selection(file));const p=service.prepare({...selection(file),platform:'slack',target:'self',attachmentIDs:[a.attachments[0].id]});
  assert.equal((await service.send(p.id)).steps.at(-1).status,'failed');
  assert.ok((await service.send(p.id)).steps.every(s=>s.status==='sent'));
  assert.equal(calls.filter(c=>c==='chat.postMessage').length,1);assert.equal(calls.filter(c=>c==='files.getUploadURLExternal').length,1);assert.equal(calls.filter(c=>c==='conversations.open').length,1);
});

test('changed connection and concurrent sends cannot redirect or duplicate a preview',async t=>{
  let release,started;const wait=new Promise(r=>started=r);
  const {service}=fixture(t,async(url,opts)=>{if(!opts.method)return response({id:'123',channel_id:'456'});started();await new Promise(r=>release=r);return response({id:'sent',channel_id:'456'});});await discord(service);
  const p=service.prepare({...selection(),platform:'discord'});const running=service.send(p.id);await wait;await assert.rejects(service.send(p.id),/正在发送/);release();await running;
  const second=service.prepare({...selection(),platform:'discord'});service.disconnect('discord');await assert.rejects(service.send(second.id),/连接已变化/);
});

test('text pagination is lossless with emoji and attachments have platform limits',async t=>{
  const text='中文👩‍💻🙂'.repeat(1500);assert.equal(splitText(text,1900).join(''),text);assert.ok(splitText(text,1900).every(s=>Array.from(s).length<=1900));
  const {service,dir}=fixture(t,async()=>response({id:'123',channel_id:'456'}));await discord(service);
  const file=path.join(dir,'large.bin');const fd=fs.openSync(file,'w');fs.ftruncateSync(fd,9*1024*1024);fs.closeSync(fd);
  const preview=service.prepare({...selection(file),platform:'discord'});assert.equal(preview.attachments[0].available,false);assert.match(preview.attachments[0].problem,/8 MB/);
});

test('image parts preserve position between surrounding text, and history excludes unsubmitted previews', async t => {
  const {service,dir}=fixture(t,async(url,opts)=>!opts.method?response({id:'123',channel_id:'456'}):response({id:'sent',channel_id:'456'}));await discord(service);
  const file=path.join(dir,'image.png');fs.writeFileSync(file,'test image bytes');
  const args={session:{title:'顺序'},selected:[{id:'m',role:'assistant',text:`前文\n![图](<${file}>)\n后文`,attachments:[{path:file,kind:'image'}]}]};
  const initial=service.prepare(args),p=service.prepare({...args,platform:'discord',attachmentIDs:[initial.attachments[0].id]});
  assert.deepEqual(p.messages[0].parts.map(p=>p.type),['text','image','text']);assert.equal(p.messages[0].parts.at(-1).text,'\n后文');assert.equal(service.history().length,0);
  await service.send(p.id);assert.equal(service.history().length,1);
});


test('sharing preserves literal Markdown examples inside code', () => {
  const code = '```md\n![example](/tmp/example.png)\n```';
  assert.equal(shareText(code), code);
  assert.equal(shareText('`[file](/tmp/file.txt)`'), '`[file](/tmp/file.txt)`');
});

test('local and Feishu activity persists, excludes previews, and retains outcomes after preview cleanup', t => {
  const { service, dir } = fixture(t);
  const preview = service.prepare(selection());
  assert.deepEqual(service.history(), []);
  service.recordLocal(preview.id, 'export');
  service.recordActivity({ id: 'feishu-test', title: '飞书讨论', text: '原文', platform: 'feishu', target: 'self', action: 'send', status: 'failed', detail: '1/2' });
  service.recordActivity({ id: 'feishu-test', title: '飞书讨论', text: '原文', platform: 'feishu', target: 'self', action: 'send', status: 'completed' });
  fs.rmSync(path.dirname(service.file(preview.id)), { recursive: true });
  const reopened = new Sharing({ dataDir: dir });
  assert.equal(reopened.history().length, 2);
  assert.equal(reopened.activity('feishu-test').status, 'completed');
  assert.equal(reopened.history().find(job => job.action === 'export').text.includes('完整原文'), true);
  assert.equal(fs.statSync(path.join(service.root, 'activity.json')).mode & 0o777, 0o600);
});
