import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CursorSessions, parseCursorTranscript } from './cursor-sessions.mjs';
import { createRewindServer } from './server.mjs';

const id='12345678-1234-1234-1234-123456789abc';
const rows=[
 {role:'system',message:{content:[{type:'text',text:'private system'}]}},
 {role:'user',message:{content:[{type:'text',text:'<user_query>你好\n继续这个问题</user_query>'}]}},
 {role:'assistant',message:{content:[{type:'thinking',text:'private reasoning'},{type:'tool_use',input:{secret:'private tool'}},{type:'text',text:'公开回答'}]}},
 {role:'tool',message:{content:'private result'}},
];
const transcript=rows.map(r=>JSON.stringify(r)).join('\n')+'\n';

test('Cursor parser keeps only conversation text and stable selection across tool appends',()=>{
 const messages=parseCursorTranscript(transcript,id);
 assert.deepEqual(messages.map(m=>m.text),['你好\n继续这个问题','公开回答']);
 assert.deepEqual(messages,parseCursorTranscript(transcript+'{"role":"tool","message":{"content":"extra"}}\n{"partial":',id));
 assert.notEqual(messages[1].fingerprint,parseCursorTranscript(transcript.replace('公开回答','修改回答'),id)[1].fingerprint);
});

test('Cursor scanner handles nested transcripts, excludes subagents and symlinks, refreshes live files',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'threadline-cursor-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dir=path.join(root,'project','agent-transcripts',id);fs.mkdirSync(dir,{recursive:true});
 const file=path.join(dir,id+'.jsonl');fs.writeFileSync(file,transcript);
 const hidden=path.join(dir,'subagents');fs.mkdirSync(hidden);fs.writeFileSync(path.join(hidden,'22345678-1234-1234-1234-123456789abc.jsonl'),transcript);
 fs.symlinkSync(file,path.join(dir,'32345678-1234-1234-1234-123456789abc.jsonl'));
 const reader=new CursorSessions(root);
 assert.equal((await reader.recent()).length,1);
 assert.equal((await reader.get(id)).messages.length,2);
 fs.appendFileSync(file,JSON.stringify({role:'user',message:{content:'后续问题'}})+'\n');
 assert.equal((await reader.get(id)).messages.length,3);
 await assert.rejects(()=>reader.get('../escape'),{status:400});
});

test('Cursor full API: discover, preview, import, deduplicate, preserve source and reject stale snapshots',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'threadline-cursor-api-'));
 const home=path.join(root,'cursor'),dir=path.join(home,'project','agent-transcripts',id);
 fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,id+'.jsonl');fs.writeFileSync(file,transcript);
 const server=createRewindServer({dataDir:path.join(root,'data'),legacyDir:null,codexHome:path.join(root,'codex'),cursorHome:home,ocr:false,feishu:{close(){}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true})});
 const origin='http://127.0.0.1:'+server.address().port;
 const request=async(route,body)=>{const r=await fetch(origin+route,{method:body?'POST':'GET',headers:{Origin:origin,'X-Rewind-Request':'1','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,...await r.json()}};
 const list=await request('/api/sessions/recent');assert.equal(list.sessions[0].runtime,'cursor');
 const {session}=await request('/api/cursor/sessions/'+id);
 const body={runtime:'cursor',threadID:id,messageIDs:session.messages.map(m=>m.id),fingerprints:Object.fromEntries(session.messages.map(m=>[m.id,m.fingerprint])),note:''};
 const preview=await request('/api/feishu/preview',body);assert.equal(preview.status,200);assert.match(preview.text,/Cursor/);
 const saved=await request('/api/cursor/import',body);assert.equal(saved.status,201);assert.equal(saved.clip.source,'Cursor');assert.equal(saved.clip.provenance.runtime,'cursor');assert.match(saved.clip.sourceURL,/runtime=cursor/);
 assert.equal((await request('/api/cursor/import',body)).duplicate,true);
 assert.equal((await request('/api/cursor/sessions/'+id)).session.messages.every(m=>m.saved),true);
 assert.equal((await request('/api/codex/sessions/'+id)).status,404);
 fs.writeFileSync(file,transcript.replace('公开回答','已变化的回答'));
 assert.equal((await request('/api/cursor/import',body)).status,409);
});
