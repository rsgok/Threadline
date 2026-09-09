import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {LibraryStore} from './storage.mjs';
import {ThoughtRelations} from './thought-relations.mjs';
test('relation jobs validate evidence, preserve review, reject stale sources and survive restart',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'thoughts-'));let store=new LibraryStore(dir);try{
 store.putTopic({id:'t',title:'Direction',goal:''});for(const [id,body] of [['a','Timeline is the default'],['b','Graph is another view']])store.put({id,title:id,body,topicID:'t'});
 let service=new ThoughtRelations(store);const job=service.create('t'),r={from:'a',to:'b',type:'extends',reason:'Views complement each other',fromQuote:'Timeline',toQuote:'Graph'};
 assert.throws(()=>service.submit(job.id,[{...r,toQuote:'invented'}]),/Quotes/);
 assert.throws(()=>service.submit(job.id,[{...r,to:'missing'}]),/Invalid/);
 service.submit(job.id,[r,r]);assert.equal(service.list('t').length,1);service.submit(job.id,[r,r]);
 const relation=service.list('t')[0];service.review(relation.id,'dismissed');const next=service.create('t');service.submit(next.id,[r]);assert.equal(service.list('t')[0].status,'dismissed');
 const stale=service.create('t');store.put({...store.get('a'),body:'Changed'});assert.throws(()=>service.submit(stale.id,[r]),/Source changed/);assert.throws(()=>service.review(relation.id,'confirmed'),/Source changed/);
 store.close();store=new LibraryStore(dir);service=new ThoughtRelations(store);assert.equal(service.list('t')[0].stale,true);assert.equal(service.get(job.id).status,'completed');
 store.remove('b');assert.equal(service.list('t').length,0);
 }finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('manual edits confirm suggestions, guard concurrent changes and resist AI overwrite',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'thought-manual-'));const store=new LibraryStore(dir);
 try{
  store.putTopic({id:'t',title:'Topic',goal:''});for(const [id,body]of [['a','First evidence'],['b','Second evidence']])store.put({id,title:id,body,topicID:'t'});
  const service=new ThoughtRelations(store),data={from:'a',to:'b',type:'related',reason:'Same question',fromQuote:'First',toQuote:'Second'};
  const r=service.manual('t',data);assert.equal(r.status,'confirmed');assert.equal(r.origin,'manual');
  assert.throws(()=>service.manual('t',data),/already exists/);
  const edited=service.manual('t',{...data,reason:'User clarification',revision:r.revision},r.id);
  assert.throws(()=>service.manual('t',{...data,revision:r.revision},r.id),/changed/);
  const job=service.create('t');service.submit(job.id,[data]);assert.equal(service.list('t')[0].reason,'User clarification');
  service.review(r.id,'dismissed');assert.throws(()=>service.manual('t',{...data,revision:edited.revision},r.id),/changed/);
  assert.throws(()=>service.manual('t',{...data,fromQuote:'invented'}),/Quotes/);
  assert.throws(()=>service.manual('t',{...data,to:'a'}),/different/);
 }finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
});
