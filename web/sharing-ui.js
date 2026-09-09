(() => {
  const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/sharing.css'; document.head.append(style);
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls || tag === 'p') n.className = cls || 'dialog-hint'; return n; };
  const button = (text, fn, cls = 'tool') => { const b = el('button', text, cls); b.type = 'button'; b.onclick = fn; return b; };
  const post = (route, body) => api('/api/share/' + route, { method: 'POST', body: JSON.stringify(body || {}) });
  const modal = el('dialog', '', 'share-dialog'); modal.setAttribute('aria-label', '分享讨论');
  const header = el('div', '', 'dialog-head'); header.append(el('h2', '分享讨论'));
  const targetBox = el('div', '', 'share-methods'), destination = el('div'), connections = el('details'); connections.append(el('summary', '连接与设置'));
  const settings = el('div'); connections.append(settings);
  const note = el('textarea'); note.placeholder = '附一句说明（可选）'; note.setAttribute('aria-label', '分享附言'); note.maxLength = 2000;
  const attachmentBox = el('div', '', 'share-attachments'), summary = el('p', '', 'dialog-hint'), errors = el('p', '', 'dialog-error'); errors.setAttribute('role', 'alert');
  const preview = el('pre', '', 'share-preview carry-preview'), media = el('div', '', 'share-media'), actions = el('div', '', 'dialog-bottom share-actions'), cards = el('div', '', 'share-cards');
  const refresh = button('更新预览', () => prepare());
  const copyButton = button('复制文字', async () => { if (!job) return; try { try { await navigator.clipboard.writeText(job.text); summary.textContent='已复制，可粘贴到目标应用'; } catch { await copyText(job.text); summary.textContent='已复制，可粘贴到目标应用'; } } catch(e) { errors.textContent = e.message; } });
  const primaryAction=button('继续',()=>runPrimary(),'primary'); actions.append(primaryAction);
  const inner = el('div', '', 'dialog-inner');
  const noteLabel = el('label', '附言', 'field-label'); note.id = 'share-note'; noteLabel.htmlFor = note.id;
  const intro=el('p','','dialog-hint');
  const chooser=el('section','','share-chooser');chooser.append(intro,el('h3','保存到本机'),targetBox);
  const compose=el('section','','share-compose');compose.hidden=true;
  const back=button('← 更换分享方式',()=>showChooser());
  const contentHeading=el('h3','分享内容');
  const previewDetails=el('details','','share-preview-details');previewDetails.append(el('summary','查看完整内容'),preview,media);
  const statusLine=el('div','','share-status');statusLine.setAttribute('role','status');statusLine.append(summary);
  compose.append(back,destination,connections,contentHeading,noteLabel,note,attachmentBox,previewDetails,cards,statusLine,refresh,actions);
  inner.append(header,chooser,compose,errors); modal.append(inner); document.body.append(modal);
  let method='copy', previewTimer, cardsReady=false, returnedPaths=null, preparing=false, assetPaths=new Map();
  let platform = 'export', snapshot, job, status, selectedAssets = new Set(), busy = false, generation = 0, slackTarget = '', channelsCursor = '', graph = [];
  setupModal(modal, { canDismiss: () => !busy });
  function error(e) { errors.textContent = e.message || String(e); }
  const methods=[['copy','复制文字','粘贴到微信、邮件或其他应用'],['export','保存文件','下载文字与所选附件'],['cards','生成图卡','将讨论排成图片，方便转发'],['feishu','飞书','发送给同事或群聊'],['slack','Slack','发送到频道或私聊'],['discord','Discord','发送到已连接的频道']];
  function controls() {
    modal.querySelectorAll('button,input,textarea').forEach(e=>{e.disabled=busy;});
    const requiresConnection=['slack','discord'].includes(platform);
    const ready=job && (!requiresConnection || job.platform===platform);
    primaryAction.disabled=busy || !ready || job?.steps.some(s=>['sent','uncertain','sending'].includes(s.status));
    primaryAction.textContent=busy?'正在处理…':({copy:'复制文字',export:'下载文字与附件',cards:cardsReady?'下载全部图卡':'生成图卡',slack:'确认发送到 Slack',discord:'确认发送到 Discord'})[method]||'继续';
    attachmentBox.querySelectorAll('input').forEach(e=>e.disabled=busy||e.dataset.available!=='true');
    refresh.hidden=!!job||preparing;
    refresh.textContent='重试预览';
  }
  function invalidate() { generation++;job=null;preparing=true;cardsReady=false;cards.replaceChildren();summary.textContent='正在更新预览…';controls(); }
  function schedulePreview(){clearTimeout(previewTimer);invalidate();previewTimer=setTimeout(()=>prepare(),300);}
  note.oninput=schedulePreview;
  function showChooser(){
    if(busy)return;clearTimeout(previewTimer);generation++;compose.hidden=true;chooser.hidden=false;
    header.querySelector('h2').textContent='分享讨论';errors.textContent='';modal.scrollTop=0;
    intro.textContent=`已选 ${snapshot?.messageIDs.length||0} 条消息 · 选择一种分享方式`;
  }
  async function choose(value){
    if(busy)return;method=value;platform=['feishu','slack','discord'].includes(value)?value:'export';
    if(platform==='feishu'){
      const paths=returnedPaths||[...selectedAssets].map(id=>assetPaths.get(id)).filter(Boolean);
      modal.close();
      try{await window.openFeishuShare({snapshot,note:note.value,paths,onBack:state=>{
        note.value=state.note;returnedPaths=state.paths;modal.showModal();showChooser();
      }});}catch(e){modal.showModal();showChooser();error(e);}return;
    }
    chooser.hidden=true;compose.hidden=false;header.querySelector('h2').textContent=methods.find(m=>m[0]===value)[1];
    invalidate();configure();await prepare();modal.scrollTop=0;
  }
  function targets(){
    targetBox.replaceChildren();
    const local=el('div','','share-method-grid'),remote=el('div','','share-method-grid');
    for(const [value,label,description]of methods){const b=button('',()=>choose(value),'secondary share-method');b.append(el('strong',label),el('span',description));(value==='copy'||value==='export'||value==='cards'?local:remote).append(b);}
    targetBox.append(local,el('h3','直接发送'),remote);
  }
  async function runPrimary(){
    if(!job||busy)return;
    if(method==='copy'){await copyButton.onclick();return;}
    if(method==='export'){download('export');summary.textContent='已开始下载文字与附件';return;}
    if(method==='cards'){if(cardsReady)download('cards');else await makeCards();return;}
    await deliver();
  }
  const field = (label, type = 'text', placeholder = '') => { const wrap = el('label', label, 'field-label'), input = el('input'); input.type = type; input.placeholder = placeholder; input.setAttribute('aria-label', label); input.autocomplete = 'off'; wrap.append(input); return { wrap, input }; };
  function configure() {
    settings.replaceChildren(); destination.replaceChildren(); connections.hidden = !['slack','discord'].includes(platform);
    destination.hidden=platform==='export';
    if(platform!=='export')destination.append(el('h3','发送到'));
    if (platform === 'feishu') destination.append(el('p', '下一步选择飞书收件人。附言和附件选择会一并带入。'));
    if (platform === 'slack') {
      destination.append(el('p', status?.slack.connected ? '已连接：' + status.slack.team + ' · 以机器人发送' : '先在「连接与设置」中连接 Slack。'));
      const target = field('Slack 频道或成员 ID', 'text', 'C… / G… / U…'); target.input.value = slackTarget;
      target.input.oninput = () => { slackTarget = target.input.value.trim(); schedulePreview(); };
      destination.append(target.wrap, button('发给自己', () => { slackTarget = 'self'; target.input.value = 'self'; invalidate(); prepare(); }), button('加载已加入的频道', () => loadChannels(false)));
      const list = el('div', '', 'share-channel-list'); list.id = 'share-channels'; destination.append(list);
      const token = field('Slack Bot Token', 'password', 'xoxb-…'), self = field('我的 Slack 成员 ID（可选）', 'text', 'U…'); self.input.value = status?.slack.selfUserId || '';
      settings.append(el('p', '在 Slack 创建应用并安装到工作区。机器人需要 chat:write、files:write；列出频道需 channels:read、groups:read，私聊需 im:write。将机器人加入目标频道。'), token.wrap, self.wrap);
      const docs = el('a', '打开 Slack 应用管理'); docs.href = 'https://api.slack.com/apps'; docs.target = '_blank'; docs.rel = 'noopener noreferrer'; settings.append(docs);
      settings.append(button('验证并保存 Slack 连接', () => connect({ platform, token: token.input.value.trim(), selfUserId: self.input.value.trim() }, token.input)));
    }
    if (platform === 'discord') {
      destination.append(el('p', status?.discord.connected ? `目标：${status.discord.name} · 频道 ${status.discord.channel}` : '先连接目标 Discord 频道的 Webhook。'));
      const webhook = field('Discord Webhook URL', 'password', 'https://discord.com/api/webhooks/…');
      settings.append(el('p', '在 Discord 目标频道的「编辑频道 → 整合 → Webhook」创建并复制地址。只会发送到该频道。'), webhook.wrap, button('验证并保存 Discord 连接', () => connect({ platform, webhook: webhook.input.value.trim() }, webhook.input)));
    }
    if (['slack','discord'].includes(platform)) {
      settings.append(el('p', '凭证仅保存在本机，配置文件仅当前系统用户可读。', 'dialog-hint'));
      if (status?.[platform]?.connected) settings.append(button('断开此连接', async () => { if (busy) return; busy=true; controls(); try { status = await post('disconnect', { platform }); invalidate(); configure(); } catch(e) { error(e); } finally { busy=false; controls(); } }));
      connections.open = !status?.[platform]?.connected;
    }
  }
  async function connect(data, input) {
    if (busy) return; busy = true; controls(); errors.textContent = ''; input.value = '';
    try { status = await post('connect', data); invalidate(); configure(); }
    catch(e) { error(e); } finally { busy = false; controls(); }
    if (status?.[platform]?.connected) await prepare();
  }
  async function loadChannels(more) {
    if (busy) return; busy=true; controls(); errors.textContent='';
    try {
      const r = await api('/api/share/channels?cursor=' + encodeURIComponent(more ? channelsCursor : ''));
      graph = more ? [...graph,...r.channels] : r.channels; channelsCursor = r.cursor;
      const list = $('share-channels'); list.replaceChildren();
      for (const c of graph) list.append(button('# ' + c.name, () => { slackTarget=c.id; destination.querySelector('input').value=c.id; invalidate(); prepare(); }));
      if (channelsCursor) list.append(button('更多频道', () => loadChannels(true)));
      if (!graph.length) list.append(el('p', '此页没有机器人已加入的频道；可加载更多，或邀请机器人后重新加载。'));
    } catch(e) { error(e); } finally { busy=false; controls(); }
  }
  async function prepare() {
    if (busy || !snapshot || compose.hidden) return; clearTimeout(previewTimer); const gen = ++generation; job = null;preparing=true; errors.textContent = ''; summary.textContent = '正在准备预览…'; controls();
    const actual = platform === 'feishu' || !status?.[platform]?.connected || (platform === 'slack' && !slackTarget) ? 'export' : platform;
    try {
      const r = await post('preview', { ...snapshot, platform: actual, target: slackTarget, note: note.value, attachmentIDs: method==='copy'?[]:[...selectedAssets] });
      if (gen !== generation || !modal.open) return;
      if(returnedPaths&&method!=='copy'){selectedAssets=new Set(r.attachments.filter(a=>a.available&&returnedPaths.includes(a.path)).map(a=>a.id));returnedPaths=null;await prepare();return;}
      job=r;assetPaths=new Map(r.attachments.map(a=>[a.id,a.path])); cardsReady=false;cards.replaceChildren(); media.replaceChildren(); attachmentBox.replaceChildren();
      attachmentBox.hidden=method==='copy'||!r.attachments.length;
      if(r.attachments.length)attachmentBox.append(el('p','附带的图片与文件（可选）'));
      for (const a of r.attachments) {
        const label = el('label'), check = el('input'); check.type='checkbox'; check.checked=selectedAssets.has(a.id); check.dataset.available=String(a.available);
        check.onchange=()=>{if(check.checked)selectedAssets.add(a.id);else selectedAssets.delete(a.id);invalidate();prepare();};
        label.append(check,el('span',a.name+' · '+(a.available ? Math.ceil(a.size/1024)+' KB' : a.problem))); attachmentBox.append(label);
        if(a.selected && a.kind==='image'){const img=el('img');img.src=`/api/share/jobs/${r.id}/assets/${a.id}`;img.alt=a.name;media.append(img);}
      }
      preview.textContent=r.text;
      summary.textContent=`${r.messages.length} 条消息 · ${r.attachments.filter(a=>a.selected).length} 个所选附件`+(r.steps.length?` · 将分 ${r.steps.length} 次发送至 ${r.target}`:'')+(actual==='export' && ['slack','discord'].includes(platform)?' · 请先完成连接并选择收件人':'');
    } catch(e) { if(gen===generation) { error(e); summary.textContent='预览未完成'; } }
    finally { if(gen===generation){preparing=false;controls();} }
  }
  function download(kind) { if(!job)return;const a=el('a');a.href=`/api/share/jobs/${job.id}/${kind}`;a.download=kind==='cards'?'Threadline-cards.zip':'Threadline-share.zip';document.body.append(a);a.click();a.remove(); }
  async function makeCards() {
    if(!job||busy)return;busy=true;controls();errors.textContent='';cards.replaceChildren();
    try {
      const canvases=await renderShareCards(job,(n,total)=>summary.textContent=`正在排版 ${n}/${total} 条消息…`);
      for(let i=0;i<canvases.length;i++) {await post(`jobs/${job.id}/cards`,{index:i,total:canvases.length,image:canvases[i].toDataURL('image/png')});cards.append(canvases[i]);summary.textContent=`正在保存图卡 ${i+1}/${canvases.length}…`;}
      summary.textContent=`已生成 ${canvases.length} 张图卡，全部内容按顺序分页。`;
      cardsReady=true;
      if(canvases.length===1 && navigator.clipboard?.write && window.ClipboardItem) cards.prepend(button('复制图卡',async()=>{try{const blob=await new Promise(resolve=>canvases[0].toBlob(resolve,'image/png'));await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);notifyMessage('已复制图卡','success');}catch{errors.textContent='此环境无法复制图片，请下载图卡。';}}));
    }catch(e){error(e);}finally{busy=false;controls();}
  }
  async function deliver() {
    if(!job||busy)return;
    busy=true;controls();errors.textContent='';primaryAction.textContent='正在发送…';
    const sentJobID=job.id;const poll=setInterval(async()=>{try{const current=await api('/api/share/jobs/'+sentJobID);summary.textContent=`已完成 ${current.steps.filter(s=>s.status==='sent').length}/${current.steps.length} 部分`;}catch{}},2000);
    try { job=await post(`jobs/${job.id}/send`); modal.close(); await showRecord(job.id); }
    catch(e){error(e);}finally{clearInterval(poll);busy=false;controls();}
  }
  const historyDialog=el('dialog','','share-history-dialog');historyDialog.setAttribute('aria-label','分享记录');const historyBody=el('div'),historyInner=el('div','','dialog-inner'),historyHead=el('div','','dialog-head');historyHead.append(el('h2','分享记录'));historyInner.append(historyHead,historyBody);historyDialog.append(historyInner);document.body.append(historyDialog);let historyBusy=false;
  setupModal(historyDialog,{canDismiss:()=>!historyBusy});
  async function showRecord(id) {
    if(!historyDialog.open)historyDialog.showModal();historyBody.replaceChildren(el('p','正在读取…'));
    try {
      const record=await api('/api/share/jobs/'+id);historyBody.replaceChildren(el('h3',record.title),el('p',`${record.platform} → ${record.target}`),el('pre',record.text,'share-preview carry-preview'));
      const sent=record.steps.filter(s=>s.status==='sent').length;historyBody.append(el('p',`已完成 ${sent}/${record.steps.length} 部分`));
      for(const step of record.steps){const row=el('div','','share-step');row.append(el('span',`${step.label} · ${{sent:'已送达',pending:'待发送',sending:'发送中',failed:'失败',uncertain:'送达状态未知'}[step.status]}`));if(step.error)row.append(el('p',step.error,'dialog-error'));
        if(step.status==='uncertain') {row.append(el('p','请在目标应用核对这一部分，再选择：'));
          for(const [label,delivered]of[['确认已送达',true],['确认未送达',false]])row.append(button(label,async()=>{if(historyBusy)return;historyBusy=true;try{await post(`jobs/${id}/resolve`,{stepId:step.id,delivered});await showRecord(id);}catch(e){row.append(el('p',e.message,'dialog-error'));}finally{historyBusy=false;}}));}
        historyBody.append(row);
      }
      if(sent<record.steps.length && !record.expired && !record.sending && !record.steps.some(s=>s.status==='uncertain')) {const retry=button('继续发送未完成部分',async()=>{if(historyBusy)return;historyBusy=true;retry.disabled=true;try{await post(`jobs/${id}/send`);await showRecord(id);}catch(e){historyBody.append(el('p',e.message,'dialog-error'));}finally{historyBusy=false;retry.disabled=false;}},'primary');historyBody.append(retry);}
      if(record.expired)historyBody.append(el('p','预览已过期。发送记录保留，请重新选择内容。'));
      if(record.sending)historyBody.append(button('刷新发送进度',()=>showRecord(id)));
      historyBody.append(button('返回记录列表',()=>openHistory()));
    }catch(e){historyBody.replaceChildren(el('p',e.message,'dialog-error'));}
  }
  async function openHistory(){if(!historyDialog.open)historyDialog.showModal();historyBody.replaceChildren();try{const r=await api('/api/share/history');if(!r.jobs.length)historyBody.append(el('p','还没有 Slack 或 Discord 分享记录。'));for(const j of r.jobs)historyBody.append(button(`${j.title} · ${j.platform} · 已完成 ${j.steps.filter(s=>s.status==='sent').length}/${j.steps.length}`,()=>showRecord(j.id),'tool share-history-row'));}catch(e){historyBody.append(el('p',e.message,'dialog-error'));}}

  historyHead.append(button('关闭',()=>{if(!historyBusy)historyDialog.close();}));
  registerAppUtility(button('分享记录',openHistory));
  const entry=$('send-feishu');entry.textContent='分享';entry.setAttribute('aria-label','分享所选讨论');
  entry.onclick=async()=>{
    if(!activeSession||!selectedMessages.size||busy)return;
    const messages=activeSession.messages.filter(m=>selectedMessages.has(m.id));snapshot={runtime:contextRuntime,threadID:activeSession.id,messageIDs:messages.map(m=>m.id),fingerprints:Object.fromEntries(messages.map(m=>[m.id,m.fingerprint])),includeProgress:$('include-progress').checked};
    selectedAssets=new Set();returnedPaths=null;assetPaths=new Map();job=null;note.value='';cards.replaceChildren();preview.textContent='';errors.textContent='';targets();showChooser();modal.showModal();
    try{status=await api('/api/share/status');}catch(e){error(e);}controls();
  };
  modal.addEventListener('close',()=>{clearTimeout(previewTimer);generation++;});
})();
