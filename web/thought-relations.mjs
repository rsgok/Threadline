import crypto from 'node:crypto';
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (message, status=400) => { throw Object.assign(Error(message), {status}); };
export class ThoughtRelations {
  constructor(store) {
    this.store=store;
    store.db.exec('CREATE TABLE IF NOT EXISTS thought_analysis (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS thought_relations (id TEXT PRIMARY KEY, data TEXT NOT NULL)');
  }
  records(table) { return this.store.db.prepare(`SELECT data FROM ${table}`).all().map(r=>JSON.parse(r.data)); }
  save(table, value) { this.store.db.prepare(`INSERT INTO ${table}(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(value.id,JSON.stringify(value)); return value; }
  notes(topicID) { return this.store.list().filter(n=>n.topicID===topicID); }
  fingerprint(n) { return digest([n.id,n.topicID,n.body,n.note,n.title]); }
  list(topicID) {
    const notes=new Map(this.notes(topicID).map(n=>[n.id,n]));
    return this.records('thought_relations').filter(r=>r.topicID===topicID && notes.has(r.from) && notes.has(r.to)).map(r=>({...r,stale:[r.from,r.to].some(id=>r.versions[id]!==this.fingerprint(notes.get(id)))}));
  }
  create(topicID) {
    if(!this.store.topic(topicID))fail('Thought not found',404);
    const notes=this.notes(topicID);
    if(notes.length<2)fail('At least two conversations are required');
    return this.save('thought_analysis',{id:crypto.randomUUID(),topicID,createdAt:new Date().toISOString(),status:'pending',versions:Object.fromEntries(notes.map(n=>[n.id,this.fingerprint(n)]))});
  }
  get(id) { const job=this.records('thought_analysis').find(j=>j.id===id);if(!job)fail('Analysis not found',404);return job; }
  input(id) {
    const job=this.get(id),notes=this.notes(job.topicID);
    if(!this.store.topic(job.topicID)||Object.keys(job.versions).some(id=>!notes.some(n=>n.id===id&&this.fingerprint(n)===job.versions[id])))fail('Source changed; create a new analysis',409);
    return {job,topic:this.store.topic(job.topicID),notes:notes.filter(n=>job.versions[n.id]).map(({id,title,body,note})=>({id,title,body,note})),existing:this.list(job.topicID)};
  }
  submit(id, candidates) {
    const {job,notes}=this.input(id);
    if(!Array.isArray(candidates)||candidates.length>100)fail('Expected at most 100 relations');
    const byID=new Map(notes.map(n=>[n.id,n]));
    const clean=candidates.map(r=>{
      if(!r||!byID.has(r.from)||!byID.has(r.to)||r.from===r.to||!['supports','extends','contradicts','related'].includes(r.type))fail('Invalid relation endpoints or type');
      for(const k of ['reason','fromQuote','toQuote'])if(typeof r[k]!=='string'||!r[k].trim()||r[k].length>2000)fail('Reason and exact source quotes are required');
      if(!byID.get(r.from).body.includes(r.fromQuote)||!byID.get(r.to).body.includes(r.toQuote))fail('Quotes must exist in the original conversations');
      const key=digest([job.topicID,r.from,r.to,r.type,job.versions[r.from],job.versions[r.to]]);
      return {id:key,topicID:job.topicID,from:r.from,to:r.to,type:r.type,reason:r.reason,fromQuote:r.fromQuote,toQuote:r.toQuote,status:'suggested',analysisID:id,versions:job.versions,createdAt:new Date().toISOString()};
    });
    const resultHash=digest(candidates);
    if(job.status==='completed'){if(job.resultHash!==resultHash)fail('Analysis already completed',409);return job;}
    this.store.db.exec('BEGIN IMMEDIATE');
    try {
      const existing=new Set(this.records('thought_relations').map(r=>r.id));
      for(const r of clean)if(!existing.has(r.id)){this.save('thought_relations',r);existing.add(r.id);}
      this.save('thought_analysis',{...job,status:'completed',resultHash,count:clean.length});this.store.db.exec('COMMIT');
    }catch(e){this.store.db.exec('ROLLBACK');throw e;}
    return this.get(id);
  }
  review(id,status) {
    if(!['confirmed','dismissed'].includes(status))fail('Invalid review status');
    const r=this.records('thought_relations').find(r=>r.id===id);if(!r)fail('Relation not found',404);
    if(status==='confirmed'&&!this.list(r.topicID).some(x=>x.id===id&&!x.stale))fail('Source changed; analyze again',409);
    return this.save('thought_relations',{...r,status});
  }
}
