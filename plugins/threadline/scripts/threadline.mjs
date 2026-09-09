#!/usr/bin/env node
import fs from 'node:fs';
const [command,id,file]=process.argv.slice(2);
const base=new URL(process.env.THREADLINE_URL||'http://127.0.0.1:43127');
if(base.hostname!=='127.0.0.1'||base.protocol!=='http:'||base.username||base.password)throw Error('Only a local Threadline server is supported');
let route,method='GET',body;
if(command==='topics')route='/api/threads';
else if(command==='analyze'){route='/api/thoughts/'+encodeURIComponent(id)+'/analyze';method='POST';}
else if(command==='input')route='/api/analysis/'+encodeURIComponent(id);
else if(command==='submit'){route='/api/analysis/'+encodeURIComponent(id);method='POST';body=JSON.stringify({relations:JSON.parse(fs.readFileSync(file,'utf8'))});}
else throw Error('Usage: threadline.mjs topics | analyze <topic-id> | input <job-id> | submit <job-id> <relations.json>');
const response=await fetch(new URL(route,base),{method,headers:{'x-rewind-request':'1','content-type':'application/json'},body,signal:AbortSignal.timeout(15000)});
const result=await response.json();if(!response.ok)throw Error(result.error||JSON.stringify(result));
console.log(JSON.stringify(command==='topics'?result.topics:result,null,2));
