// A shared thought view for the app, browser and narrow side panel.
(()=>{
 let view='timeline',generation=0;
 const tr=(zh,en)=>I18n.locale.startsWith('en')?en:zh;
 const types={supports:['支持','Supports'],extends:['补充','Extends'],contradicts:['冲突','Contradicts'],related:['相关','Related']};
 const original=renderWorkspace;
 renderWorkspace=function(){original();if(workspaceMode==='topic'&&currentTopic)renderThought();else generation++;};
 function openNote(id){send('select',{id});}
 let poll;
 function excerpt(note){
  const raw=note.note?.trim()||note.body||'';
  const sections=raw.split(/^### (我的问题|AI 回答|AI 过程消息|My question|AI answer)(?:[^\n]*)\n/gm);
  let text=raw;for(let i=1;i<sections.length;i+=2)if(['AI 回答','AI answer'].includes(sections[i]))text=sections[i+1];
  return text.replace(/```[\s\S]*?```/g,tr('〔代码片段，打开原对话查看〕','[Code in original conversation]')).replace(/^\s*\|.*\|\s*$/gm,'').replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/gm,'').replace(/[*_`|]/g,'').replace(/<[^>]*>/g,'').replace(/^\s*[-=]{3,}\s*$/gm,'').replace(/\s+/g,' ').trim().slice(0,260);
 }
 function renderThought(){
  clearTimeout(poll);
  const topic=state.topics.find(t=>t.id===currentTopic);if(!topic)return;
  const token=++generation,root=$('workspace');root.hidden=false;
  for(const id of ['reader','editor','empty','toolbar-tools','copy-tools'])$(id).hidden=true;
  root.replaceChildren();
  const head=el('div','thought-heading');head.append(el('h1','thinking-title',topic.title),action(tr('编辑思路','Edit thought'),()=>openTopic(topic),'tool'));root.append(head);
  root.append(el('p','workspace-description',topic.goal||tr('围绕这个问题，继续积累讨论','Keep exploring this question')));
  const notes=state.clips.filter(n=>n.topicID===topic.id).sort((a,b)=>b.createdAt-a.createdAt||a.id.localeCompare(b.id));
  const controls=el('div','thought-controls'),tabs=el('div','thought-tabs');for(const [key,label] of [['timeline',tr('时间线','Timeline')],['graph',tr('关系图','Relations')]]){const b=action(label,()=>{view=key;renderThought()},'secondary');b.setAttribute('aria-pressed',String(view===key));tabs.append(b)}controls.append(tabs);
  const discover=action(tr('发现关联','Discover relations'),()=>analyze(topic,discover),'primary');discover.disabled=notes.length<2;controls.append(discover);root.append(controls);
  const status=el('div','thought-analysis-status');status.setAttribute('role','status');root.append(status);
  const box=el('div',view==='timeline'?'thought-timeline':'thought-relations');root.append(box);
  if(view==='timeline'){
   root.append(el('p','thought-footnote',tr('按收录时间排序 · 最新在前','Sorted by collection time · newest first')));
   for(const n of notes){const card=el('article','thought-event'),meta=el('div','thought-event-meta');meta.append(el('small','',n.date+' · '+n.source));card.append(meta,action(n.title,()=>openNote(n.id),'note-open'),el('p','thought-event-excerpt',excerpt(n)),action(tr('查看原对话 →','Open conversation →'),()=>openNote(n.id),'tool'));box.append(card)}
   if(!notes.length)box.append(el('p','workspace-empty',tr('收录第一段对话，开始这条思路','Collect a conversation to begin this thought')));
  }
  function update(){api('/api/thoughts/'+topic.id+'/relations').then(({relations,job})=>{
   if(token!==generation||!box.isConnected)return;
   discover.disabled=notes.length<2||job?.status==='running';discover.textContent=job?.status==='running'?tr('正在分析…','Analyzing…'):tr('发现关联','Discover relations');
   const errors={unavailable:tr('无法启动 Codex，请确认已安装并登录后重试','Could not start Codex. Install and sign in, then retry'),execution_failed:tr('Codex 分析未完成，请检查登录和网络后重试','Analysis failed. Check your sign-in and network, then retry'),timeout:tr('分析超时，可以重新尝试','Analysis timed out. Try again'),interrupted:tr('上次分析被中断，可以重新尝试','Analysis was interrupted. Try again'),invalid_result:tr('分析结果或原文发生变化，请重新分析','The result or source changed. Run analysis again'),too_large:tr('对话内容过多，请拆分为较小的思路后分析','Too much content. Split into smaller thoughts')};
   status.textContent=job?.status==='running'?tr('Codex 正在阅读对话并寻找有依据的联系，你可以继续浏览','Codex is finding evidence-backed connections. You can keep browsing'):job?.status==='completed'?tr(`分析完成 · ${job.count} 条建议，确认后加入关系图`,`Analysis complete · ${job.count} suggestions to review`):job?.status==='failed'?(errors[job.error]||tr('分析未完成，请重试','Analysis failed. Try again')):notes.length<2?tr('收录至少两段对话后，可以发现它们之间的联系','Collect at least two conversations to discover connections'):tr('让 Codex 寻找联系，结果由你确认','Let Codex find connections for you to review');
   if(view==='graph'){
    box.replaceChildren();drawGraph(box,notes,relations.filter(r=>r.status==='confirmed'&&!r.stale));
    const manual=action(tr('手动连接两段对话','Connect two conversations manually'),()=>editRelation(topic,notes),'tool');manual.disabled=notes.length<2;box.append(manual);
    const suggestions=relations.filter(r=>r.status==='suggested');
    const heading=el('div','thought-section-heading');heading.append(el('h2','',tr('待确认','For review')),el('small','',String(suggestions.length)));box.append(heading);
    if(!suggestions.length)box.append(el('p','workspace-description',tr('暂无待确认的关联，点击「发现关联」开始分析','No suggestions yet. Choose Discover relations to start')));
    for(const r of suggestions)box.append(relationCard(r,notes,topic));
    const confirmed=relations.filter(r=>r.status==='confirmed');if(confirmed.length){const details=el('details','thought-confirmed');details.append(el('summary','',tr(`查看已确认关联的依据 · ${confirmed.length}`,`Confirmed evidence · ${confirmed.length}`)));for(const r of confirmed)details.append(relationCard(r,notes,topic));box.append(details)}
   }
   if(job?.status==='running')poll=setTimeout(update,2000);
  }).catch(e=>{if(token===generation)status.textContent=e.message})}update();
 }
 function relationCard(r,notes,topic){
  const item=el('article','thought-relation'),label=el('span','relation-type',tr(...types[r.type]));item.append(label);
  if(r.stale)item.append(el('small','',tr('原文已变化，请重新核对','Source changed. Check evidence')));
  const pair=el('div','relation-pair');for(const [id,quote]of [[r.from,r.fromQuote],[r.to,r.toQuote]]){const source=el('div');source.append(action(notes.find(n=>n.id===id)?.title||id,()=>openNote(id),'tool'),el('blockquote','',quote));pair.append(source)}item.append(pair,el('p','relation-reason',r.reason));
  const actions=el('div','relation-actions'),review=status=>api('/api/relations/'+r.id,{method:'PUT',body:JSON.stringify({status})}).then(()=>renderThought()).catch(notifyError);
  if(r.status==='suggested'){const confirm=action(tr('确认关联','Confirm'),()=>review('confirmed'),'primary');confirm.disabled=r.stale;actions.append(confirm)}
  actions.append(action(tr('编辑','Edit'),()=>editRelation(topic,notes,r),'tool'),action(tr('移除','Dismiss'),()=>review('dismissed'),'tool'));item.append(actions);return item;
 }
 function drawGraph(root,notes,relations){
  const stage=el('div','thought-map');
  if(!relations.length){stage.append(el('div','thought-map-symbol','◎'),el('h2','',tr('把零散讨论，连成一条思路','Connect your conversations')),el('p','',tr('确认关联后，这里会呈现对话之间的支持、补充与分歧','Confirmed connections will show support, additions and disagreements')));root.append(stage);return}
  const title=el('div','thought-map-heading');title.append(el('span','',tr('已确认的联系','Confirmed connections')),el('small','',tr(`${relations.length} 条关联`,`${relations.length} connections`)));stage.append(title);
  for(const r of relations){const row=el('div','thought-map-row');for(const [index,id]of [r.from,r.to].entries()){
    if(index){const link=el('div','thought-map-link');link.append(el('span','relation-type',tr(...types[r.type])),el('span','thought-map-arrow','⟶'));link.title=r.reason;row.append(link)}
    const n=notes.find(n=>n.id===id);if(!n)continue;const node=action('',()=>openNote(id),'thought-map-node secondary');node.append(el('small','',n.date),el('strong','',n.title));row.append(node);
   }stage.append(row)}root.append(stage);
 }
 const editor=el('dialog');editor.id='thought-relation-editor';
 editor.innerHTML='<form class="dialog-inner"><div class="dialog-head"><h2></h2></div><p class="dialog-hint"></p><div class="relation-fields"></div><p class="dialog-error" role="alert"></p><div class="dialog-bottom"></div></form>';document.body.append(editor);
 let saving=false;setupModal(editor,{canDismiss:()=>!saving});
 function editRelation(topic,notes,relation){
  const form=editor.querySelector('form'),fields=editor.querySelector('.relation-fields'),error=editor.querySelector('.dialog-error');fields.replaceChildren();error.textContent='';
  editor.querySelector('h2').textContent=relation?tr('编辑关联','Edit relation'):tr('手动连接两段对话','Connect two conversations');
  editor.querySelector('.dialog-hint').textContent=tr('先选两段对话，再点选各自的依据，最后用一句话说明联系','Choose two conversations, select evidence from each, then explain their connection');
  const controls={};
  function field(key,label,node){const id='relation-'+key;node.id=id;const l=el('label','field-label',label);l.htmlFor=id;fields.append(l,node);controls[key]=node;return node;}
  for(const [key,label] of [['from',tr('从这段对话','From conversation')],['to',tr('关联到这段对话','To conversation')]]){
   const select=field(key,label,el('select','topic-select'));for(const n of notes)select.add(new Option(n.title,n.id));select.value=relation?.[key]||notes[key==='from'?0:1].id;
   const original=el('details','relation-source'),summary=el('summary','',tr('选择原文中的依据','Select source evidence')),body=el('div','relation-quote-options');original.append(summary,body);fields.append(original);
   const quote=field(key+'Quote',tr('已选依据（也可直接粘贴原文）','Selected evidence (or paste an exact quote)'),el('textarea','capture-input'));quote.required=true;quote.maxLength=2000;quote.value=relation?.[key+'Quote']||'';
   const update=()=>{body.replaceChildren();const source=notes.find(n=>n.id===select.value)?.body||'';for(const text of source.split(/\n\s*\n/).filter(x=>x.trim()&&!/^### (我的问题|AI 回答|AI 过程消息)/.test(x)&&!/^---+$/.test(x.trim()))){const pick=action(text.slice(0,2000),()=>{quote.value=text.slice(0,2000);original.open=false;quote.focus()},'secondary');body.append(pick)}};select.onchange=()=>{quote.value='';update();};update();
  }
  const type=field('type',tr('关系方向：前者如何关联后者','Direction: how the first relates to the second'),el('select','topic-select'));for(const [key,labels] of Object.entries(types))type.add(new Option(tr(...labels),key));type.value=relation?.type||'related';
  const reason=field('reason',tr('关联理由','Reason'),el('textarea','capture-input'));reason.required=true;reason.maxLength=2000;reason.value=relation?.reason||'';
  const foot=editor.querySelector('.dialog-bottom'),cancel=action(tr('取消','Cancel'),()=>editor.close(),'secondary'),save=el('button','primary',tr('保存并确认','Save and confirm'));cancel.type='button';save.type='submit';foot.replaceChildren(cancel,save);
  form.onsubmit=async event=>{event.preventDefault();if(saving)return;saving=true;save.disabled=cancel.disabled=true;error.textContent='';
   const data={topicID:topic.id,...Object.fromEntries(Object.entries(controls).map(([key,node])=>[key,node.value]))};if(relation)data.revision=relation.revision||0;
   try{await api(relation?'/api/relations/'+relation.id:'/api/thoughts/'+topic.id+'/relations',{method:relation?'PUT':'POST',body:JSON.stringify(data)});editor.close();view='graph';renderThought();}
   catch(e){error.textContent=e.message;}finally{saving=false;save.disabled=cancel.disabled=false;}
  };editor.showModal();
 }
 async function analyze(topic,button){button.disabled=true;button.textContent=tr('正在启动…','Starting…');try{await api('/api/thoughts/'+topic.id+'/analyze',{method:'POST'});if(currentTopic===topic.id&&workspaceMode==='topic'){view='graph';renderThought()}}catch(e){notifyError(e);button.disabled=false;button.textContent=tr('发现关联','Discover relations')}}
 renderWorkspace();
})();
