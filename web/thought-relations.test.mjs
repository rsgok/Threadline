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
