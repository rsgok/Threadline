(() => {
  const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/sharing.css'; document.head.append(style);
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls || tag === 'p') n.className = cls || 'dialog-hint'; return n; };
  const button = (text, fn, cls = 'tool') => { const b = el('button', text, cls); b.type = 'button'; b.onclick = fn; return b; };
  const post = (route, body) => api('/api/share/' + route, { method: 'POST', body: JSON.stringify(body || {}) });
  const modal = el('dialog', '', 'share-dialog'); modal.setAttribute('aria-label', I18n.t("分享讨论"));
  const header = el('div', '', 'dialog-head'); header.append(el('h2', I18n.t("分享讨论")));
  const targetBox = el('div', '', 'share-methods'), destination = el('div'), connections = el('details'); connections.append(el('summary', I18n.t("连接与设置")));
  const settings = el('div'); connections.append(settings);
  const note = el('textarea'); note.placeholder = I18n.t("附一句说明（可选）"); note.setAttribute('aria-label', I18n.t("分享附言")); note.maxLength = 2000;
  const attachmentBox = el('div', '', 'share-attachments'), summary = el('p', '', 'dialog-hint'), errors = el('p', '', 'dialog-error'); errors.setAttribute('role', 'alert');
  const preview = el('pre', '', 'share-preview carry-preview'), media = el('div', '', 'share-media'), actions = el('div', '', 'dialog-bottom share-actions'), cards = el('div', '', 'share-cards');
  const refresh = button(I18n.t("更新预览"), () => prepare());
  const copyButton = button(I18n.t("复制文字"), async () => { if (!job) return; try { try { await navigator.clipboard.writeText(job.text); summary.textContent=I18n.t("已复制，可粘贴到目标应用"); } catch { await copyText(job.text); summary.textContent=I18n.t("已复制，可粘贴到目标应用"); } } catch(e) { errors.textContent = e.message; } });
  const primaryAction=button(I18n.t("继续"),()=>runPrimary(),'primary'); actions.append(primaryAction);
  const inner = el('div', '', 'dialog-inner');
  const noteLabel = el('label', I18n.t("附言"), 'field-label'); note.id = 'share-note'; noteLabel.htmlFor = note.id;
  const intro=el('p','','dialog-hint');
  const chooser=el('section','','share-chooser');chooser.append(intro,el('h3',I18n.t("保存到本机")),targetBox);
  const compose=el('section','','share-compose');compose.hidden=true;
  const back=button(I18n.t("← 更换分享方式"),()=>showChooser());
  const themeBox=el('section','','share-theme-section');
  let themes=[],cardTheme='sage',cardMode='pages',assetsInitialized=false;
  const modeBox=el('div','','share-mode-picker');
  modeBox.setAttribute('aria-label',I18n.t("图卡模式"));
  for(const [value,label] of [['pages',I18n.t("分页图卡")],['long',I18n.t("单张长图")]]){const b=button(label,()=>changeMode(value),'secondary');b.dataset.mode=value;modeBox.append(b);}
  try{cardTheme=localStorage.getItem('threadline.cardTheme')||'sage';}catch{}
  const contentHeading=el('h3',I18n.t("分享内容"));
  const previewDetails=el('details','','share-preview-details');previewDetails.append(el('summary',I18n.t("查看完整内容")),preview,media);
  const statusLine=el('div','','share-status');statusLine.setAttribute('role','status');statusLine.append(summary);
  compose.append(back,destination,connections,themeBox,modeBox,contentHeading,noteLabel,note,attachmentBox,previewDetails,statusLine,refresh,actions);
  inner.append(header,chooser,compose,errors); modal.append(inner); document.body.append(modal);
  let method='copy', previewTimer, cardsReady=false, returnedPaths=null, preparing=false, assetPaths=new Map();
  let platform = 'export', snapshot, job, status, selectedAssets = new Set(), busy = false, generation = 0, slackTarget = '', channelsCursor = '', graph = [];
  setupModal(modal, { canDismiss: () => !busy });
  const resultDialog=el('dialog','','card-result-dialog');resultDialog.setAttribute('aria-label',I18n.t("图卡预览"));
  const resultInner=el('div','','dialog-inner'),resultHead=el('div','','dialog-head');resultHead.append(el('h2',I18n.t("图卡预览")),button(I18n.t("返回调整"),()=>{if(!busy)resultDialog.close();}));
  const resultTools=el('div','','card-result-tools'),resultTheme=el('select'),resultMode=el('select');
  resultTheme.setAttribute('aria-label',I18n.t("预览主题"));resultMode.setAttribute('aria-label',I18n.t("预览模式"));
  resultMode.append(new Option(I18n.t("分页图卡"),'pages'),new Option(I18n.t("单张长图"),'long'));
  resultTheme.onchange=()=>changeTheme(resultTheme.value);resultMode.onchange=()=>changeMode(resultMode.value);
  const resultCopy=button(I18n.t("复制图卡"),async()=>{
    if(!job||!cardsReady||busy||preparing)return;
    try{const bytes=fetch(`/api/share/jobs/${job.id}/render/pages/${resultPage}`).then(response=>{if(!response.ok)throw Error(I18n.t("图片读取失败"));return response.blob();});await navigator.clipboard.write([new ClipboardItem({'image/png':bytes})]);resultHint.textContent=I18n.t("已复制图卡");}catch{resultHint.textContent=I18n.t("此环境无法复制图片，请下载图卡");}
  },'secondary');
  const resultDownload=button(I18n.t("下载图卡"),()=>downloadCards(),'primary');
  const originalDownload=button(I18n.t("下载文字与附件"),()=>download('export'),'secondary');
  resultTools.append(resultTheme,resultMode,resultCopy,resultDownload,originalDownload);
  const resultHint=el('p'),pager=el('div','','card-result-pager');let resultPage=0,resultTotal=0;
  const previousPage=button(I18n.t("上一张"),()=>showCardPage(resultPage-1),'secondary'),nextPage=button(I18n.t("下一张"),()=>showCardPage(resultPage+1),'secondary'),pageLabel=el('span');pager.append(previousPage,pageLabel,nextPage);
  resultInner.append(resultHead,resultTools,resultHint,pager,cards);resultDialog.append(resultInner);document.body.append(resultDialog);
  setupModal(resultDialog,{canDismiss:()=>!busy&&!preparing});
  function showCardPage(index){
    resultPage=Math.max(0,Math.min(resultTotal-1,index));cards.replaceChildren();
    const img=el('img');img.src=`/api/share/jobs/${job.id}/render/pages/${resultPage}`;img.alt=cardMode==='long'?I18n.t("完整长图"):I18n.t`图卡 ${resultPage+1} / ${resultTotal}`;
    const figure=el('figure');figure.append(img);cards.append(figure);cards.scrollTop=0;
    pager.hidden=resultTotal<2;pageLabel.textContent=`${resultPage+1} / ${resultTotal}`;previousPage.disabled=resultPage===0;nextPage.disabled=resultPage===resultTotal-1;
  }
  function downloadCards(){if(!job||!cardsReady)return;if(cardMode==='long'){const a=el('a');a.href=`/api/share/jobs/${job.id}/render/pages/0`;a.download='Threadline-long.png';document.body.append(a);a.click();a.remove();}else download('cards');}
  function syncResultControls(){
    resultTheme.replaceChildren(...themes.map(t=>new Option(I18n.t(t.name),t.id)));resultTheme.value=cardTheme;resultMode.value=cardMode;
    resultDialog.querySelectorAll('button,select').forEach(b=>b.disabled=busy||preparing);
    resultCopy.hidden=!(navigator.clipboard?.write&&window.ClipboardItem);resultCopy.disabled=busy||preparing||!cardsReady;resultCopy.textContent=resultTotal>1?I18n.t("复制当前图卡"):I18n.t("复制图卡");
    resultDownload.disabled=busy||preparing||!cardsReady;resultDownload.textContent=cardMode==='long'?I18n.t("下载长图 PNG"):I18n.t("下载全部图卡");
    originalDownload.hidden=!job?.attachments.some(a=>a.selected);
    if(cardsReady&&!busy&&!preparing){previousPage.disabled=resultPage===0;nextPage.disabled=resultPage===resultTotal-1;}
  }
  async function changeTheme(value){
    if(busy||preparing||value===cardTheme)return;const regenerate=cardsReady;cardTheme=value;
    try{localStorage.setItem('threadline.cardTheme',cardTheme);}catch{}
    invalidate();themePicker();await prepare();if(regenerate&&job&&modal.open)await makeCards();else if(regenerate&&!job)resultDialog.close();
  }
  async function changeMode(value){
    if(busy||preparing||value===cardMode)return;const regenerate=cardsReady;cardMode=value;
    invalidate();themePicker();await prepare();if(regenerate&&job&&modal.open)await makeCards();else if(regenerate&&!job)resultDialog.close();
  }
  function error(e) { errors.textContent = e.message || String(e); }
  const methods=[['copy',I18n.t("复制文字"),I18n.t("粘贴到微信、邮件或其他应用")],['export',I18n.t("保存文件"),I18n.t("下载文字与所选附件")],['cards',I18n.t("生成图卡"),I18n.t("将讨论排成图片，方便转发")],['feishu',I18n.t("飞书"),I18n.t("发送给同事或群聊")],['slack','Slack',I18n.t("发送到频道或私聊")],['discord','Discord',I18n.t("发送到已连接的频道")]];
  function controls() {
    modal.querySelectorAll('button,input,textarea,select').forEach(e=>{e.disabled=busy;});
    const requiresConnection=['slack','discord'].includes(platform);
    const ready=job && (!requiresConnection || job.platform===platform);
    primaryAction.disabled=busy || !ready || job?.steps.some(s=>['sent','uncertain','sending'].includes(s.status));
    primaryAction.textContent=busy?I18n.t("正在处理…"):({copy:I18n.t("复制文字"),export:I18n.t("下载文字与附件"),cards:cardsReady?I18n.t("查看图卡"):I18n.t("生成图卡"),slack:I18n.t("确认发送到 Slack"),discord:I18n.t("确认发送到 Discord")})[method]||I18n.t("继续");
    attachmentBox.querySelectorAll('input').forEach(e=>e.disabled=busy||e.dataset.available!=='true');
    themeBox.querySelectorAll('button').forEach(b=>b.disabled=busy||preparing);
    modeBox.querySelectorAll('button').forEach(b=>{b.disabled=busy||preparing;b.setAttribute('aria-pressed',String(b.dataset.mode===cardMode));});
    syncResultControls();
    refresh.hidden=!!job||preparing;
    refresh.textContent=I18n.t("重试预览");
  }
  function invalidate() { generation++;job=null;preparing=true;cardsReady=false;cards.replaceChildren();summary.textContent=I18n.t("正在更新预览…");controls(); }
  function schedulePreview(){clearTimeout(previewTimer);invalidate();previewTimer=setTimeout(()=>prepare(),300);}
  note.oninput=schedulePreview;
  function showChooser(){
    if(busy)return;clearTimeout(previewTimer);generation++;compose.hidden=true;chooser.hidden=false;
    header.querySelector('h2').textContent=I18n.t("分享讨论");errors.textContent='';modal.scrollTop=0;
    intro.textContent=I18n.t`已选 ${snapshot?.messageIDs.length||0} 条消息 · 选择一种分享方式`;
  }
  async function choose(value){
    if(busy)return;method=value;platform=['feishu','slack','discord'].includes(value)?value:'export';
    if(platform==='feishu'){
      const paths=returnedPaths||(assetsInitialized?[...selectedAssets].map(id=>assetPaths.get(id)).filter(Boolean):undefined);
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
    targetBox.append(local,el('h3',I18n.t("直接发送")),remote);
  }
  async function runPrimary(){
    if(!job||busy)return;
    if(method==='copy'){await copyButton.onclick();return;}
    if(method==='export'){download('export');summary.textContent=I18n.t("已开始下载文字与附件");return;}
    if(method==='cards'){if(cardsReady)resultDialog.showModal();else await makeCards();return;}
    await deliver();
  }
  const field = (label, type = 'text', placeholder = '') => { const wrap = el('label', label, 'field-label'), input = el('input'); input.type = type; input.placeholder = placeholder; input.setAttribute('aria-label', label); input.autocomplete = 'off'; wrap.append(input); return { wrap, input }; };
  function themePicker() {
    modeBox.hidden=method!=='cards';themeBox.hidden=method!=='cards';themeBox.replaceChildren();
    if(method!=='cards')return;
    themeBox.append(el('h3',I18n.t("图卡主题")),el('p',I18n.t("排版与配色一起切换，记住上次选择")));
    const grid=el('div','','share-theme-grid');grid.setAttribute('aria-label',I18n.t("选择图卡主题"));
    for(const theme of themes){
      const selected=theme.id===cardTheme;
      const b=button('',()=>changeTheme(theme.id),'secondary share-theme');
      b.setAttribute('aria-pressed',String(selected));b.setAttribute('aria-label',I18n.t(theme.name)+' · '+I18n.t(theme.description));
      const swatch=el('span','','share-theme-swatch');swatch.setAttribute('aria-hidden','true');swatch.dataset.layout=theme.layout;
      swatch.style.setProperty('--sample-paper',theme.paper);swatch.style.setProperty('--sample-ink',theme.ink);swatch.style.setProperty('--sample-accent',theme.accent);swatch.style.setProperty('--sample-soft',theme.soft);
      swatch.append(el('span',I18n.t("Aa 思续"),'sample-title'),el('span','','sample-line'),el('span','','sample-line'),el('span','','sample-quote'));
      b.append(swatch,el('strong',I18n.t(theme.name)),el('span',I18n.t(theme.description),'share-theme-description'));grid.append(b);
    }
    themeBox.append(grid);controls();
  }
  function configure() {
    themePicker();
    settings.replaceChildren(); destination.replaceChildren(); connections.hidden = !['slack','discord'].includes(platform);
    destination.hidden=platform==='export';
    if(platform!=='export')destination.append(el('h3',I18n.t("发送到")));
    if(method==='cards'){destination.hidden=false;destination.append(el('p',I18n.t("首次生成会按需下载图卡引擎，显示下载进度；之后可离线生成。图卡仅在本机处理")));}
    if (platform === 'feishu') destination.append(el('p', I18n.t("下一步选择飞书收件人。附言和附件选择会一并带入。")));
    if (platform === 'slack') {
      destination.append(el('p', status?.slack.connected ? I18n.t("已连接：") + status.slack.team + I18n.t(" · 以机器人发送") : I18n.t("先在「连接与设置」中连接 Slack。")));
      const target = field(I18n.t("Slack 频道或成员 ID"), 'text', 'C… / G… / U…'); target.input.value = slackTarget;
      target.input.oninput = () => { slackTarget = target.input.value.trim(); schedulePreview(); };
      destination.append(target.wrap, button(I18n.t("发给自己"), () => { slackTarget = 'self'; target.input.value = 'self'; invalidate(); prepare(); }), button(I18n.t("加载已加入的频道"), () => loadChannels(false)));
      const list = el('div', '', 'share-channel-list'); list.id = 'share-channels'; destination.append(list);
      const token = field('Slack Bot Token', 'password', 'xoxb-…'), self = field(I18n.t("我的 Slack 成员 ID（可选）"), 'text', 'U…'); self.input.value = status?.slack.selfUserId || '';
      settings.append(el('p', I18n.t("在 Slack 创建应用并安装到工作区。机器人需要 chat:write、files:write；列出频道需 channels:read、groups:read，私聊需 im:write。将机器人加入目标频道。")), token.wrap, self.wrap);
      const docs = el('a', I18n.t("打开 Slack 应用管理")); docs.href = 'https://api.slack.com/apps'; docs.target = '_blank'; docs.rel = 'noopener noreferrer'; settings.append(docs);
      settings.append(button(I18n.t("验证并保存 Slack 连接"), () => connect({ platform, token: token.input.value.trim(), selfUserId: self.input.value.trim() }, token.input)));
    }
    if (platform === 'discord') {
      destination.append(el('p', status?.discord.connected ? I18n.t`目标：${status.discord.name} · 频道 ${status.discord.channel}` : I18n.t("先连接目标 Discord 频道的 Webhook。")));
      const webhook = field('Discord Webhook URL', 'password', 'https://discord.com/api/webhooks/…');
      settings.append(el('p', I18n.t("在 Discord 目标频道的「编辑频道 → 整合 → Webhook」创建并复制地址。只会发送到该频道。")), webhook.wrap, button(I18n.t("验证并保存 Discord 连接"), () => connect({ platform, webhook: webhook.input.value.trim() }, webhook.input)));
    }
    if (['slack','discord'].includes(platform)) {
      settings.append(el('p', I18n.t("凭证仅保存在本机，配置文件仅当前系统用户可读。"), 'dialog-hint'));
      if (status?.[platform]?.connected) settings.append(button(I18n.t("断开此连接"), async () => { if (busy) return; busy=true; controls(); try { status = await post('disconnect', { platform }); invalidate(); configure(); } catch(e) { error(e); } finally { busy=false; controls(); } }));
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
      if (channelsCursor) list.append(button(I18n.t("更多频道"), () => loadChannels(true)));
      if (!graph.length) list.append(el('p', I18n.t("此页没有机器人已加入的频道；可加载更多，或邀请机器人后重新加载。")));
    } catch(e) { error(e); } finally { busy=false; controls(); }
  }
  async function prepare() {
    if (busy || !snapshot || compose.hidden) return; clearTimeout(previewTimer); const gen = ++generation; job = null;preparing=true; errors.textContent = ''; summary.textContent = I18n.t("正在准备预览…"); controls();
    const actual = platform === 'feishu' || !status?.[platform]?.connected || (platform === 'slack' && !slackTarget) ? 'export' : platform;
    try {
      const r = await post('preview', { ...snapshot, platform: actual, target: slackTarget, note: note.value, cardTheme, cardMode, locale: I18n.locale, attachmentIDs: method==='copy'?[]:[...selectedAssets] });
      if (gen !== generation || !modal.open) return;
      if(!assetsInitialized&&method!=='copy'&&!returnedPaths){assetsInitialized=true;selectedAssets=new Set(r.attachments.filter(a=>a.available).map(a=>a.id));if(selectedAssets.size){await prepare();return;}}
      if(returnedPaths&&method!=='copy'){assetsInitialized=true;selectedAssets=new Set(r.attachments.filter(a=>a.available&&returnedPaths.includes(a.path)).map(a=>a.id));returnedPaths=null;await prepare();return;}
      job=r;assetPaths=new Map(r.attachments.map(a=>[a.id,a.path])); cardsReady=false;cards.replaceChildren(); media.replaceChildren(); attachmentBox.replaceChildren();
      attachmentBox.hidden=method==='copy'||!r.attachments.length;
      if(r.attachments.length)attachmentBox.append(el('p',I18n.t("附带的图片与文件（可选）")));
      for (const a of r.attachments) {
        const label = el('label'), check = el('input'); check.type='checkbox'; check.checked=selectedAssets.has(a.id); check.dataset.available=String(a.available);
        check.onchange=()=>{if(check.checked)selectedAssets.add(a.id);else selectedAssets.delete(a.id);invalidate();prepare();};
        label.append(check);
        if(a.kind==='image'&&a.available){const thumb=el('img','','share-attachment-thumb');thumb.src=`/api/share/jobs/${r.id}/thumbnails/${a.id}`;thumb.alt=a.name;thumb.onerror=()=>{thumb.replaceWith(el('span',I18n.t("图片暂不可预览"),'dialog-hint'));};label.append(thumb);}
        label.append(el('span',a.name+' · '+(a.available ? Math.ceil(a.size/1024)+' KB' : I18n.message(a.problem)))); attachmentBox.append(label);
        if(a.selected && a.kind==='image'){const img=el('img');img.src=`/api/share/jobs/${r.id}/assets/${a.id}`;img.alt=a.name;media.append(img);}
      }
      preview.textContent=r.text;
      summary.textContent=I18n.count(r.messages.length)+' · '+I18n.count(r.attachments.filter(a=>a.selected).length,'attachment')+(r.steps.length?I18n.t` · 将分 ${r.steps.length} 次发送至 ${r.target}`:'')+(actual==='export' && ['slack','discord'].includes(platform)?I18n.t(" · 请先完成连接并选择收件人"):'');
    } catch(e) { if(gen===generation) { error(e); summary.textContent=I18n.t("预览未完成"); } }
    finally { if(gen===generation){preparing=false;controls();} }
  }
  function download(kind) { if(!job)return;const a=el('a');a.href=`/api/share/jobs/${job.id}/${kind}`;a.download=kind==='cards'?'Threadline-cards.zip':'Threadline-share.zip';document.body.append(a);a.click();a.remove(); }
  async function makeCards() {
    if(!job||busy)return;busy=true;controls();errors.textContent='';cards.replaceChildren();pager.hidden=true;resultHint.textContent=I18n.t("正在生成预览…");if(!resultDialog.open)resultDialog.showModal();
    const renderID=job.id;
    const statusBox=el('div','','share-render-status'),label=el('p',I18n.t("正在准备图卡")),bar=el('progress');bar.max=100;bar.setAttribute('aria-label',I18n.t("图卡生成进度"));
    const cancel=button(I18n.t("取消生成"),async()=>{cancel.disabled=true;try{await post(`jobs/${renderID}/render/cancel`);}catch(e){error(e);resultHint.textContent=e.message;cancel.disabled=false;}});
    statusBox.setAttribute('role','status');statusBox.append(label,bar,cancel);cards.append(statusBox);
    try {
      let state=await post(`jobs/${renderID}/render`);
      while(true){
        label.textContent=I18n.message(state.message)||I18n.t("正在生成图卡");summary.textContent=label.textContent;resultHint.textContent=label.textContent;
        if(state.percent!==undefined)bar.value=state.percent;
        else if(state.total)bar.value=(state.completed||0)/state.total*100;
        else bar.removeAttribute('value');
        if(state.phase==='done')break;
        if(state.phase==='failed'||state.phase==='cancelled')throw Error(I18n.message(state.message));
        await new Promise(resolve=>setTimeout(resolve,650));
        state=await api(`/api/share/jobs/${renderID}/render`);
      }
      cardsReady=true;resultTotal=state.total;showCardPage(0);
      resultHint.textContent=cardMode==='long'?I18n.t("单张完整长图 · 向下滚动查看全部内容"):I18n.t`已生成 ${state.total} 张图卡 · 可逐张查看`;
      summary.textContent=cardMode==='long'?I18n.t("已生成单张长图"):I18n.t`已生成 ${state.total} 张图卡`;
    }catch(e){cards.replaceChildren();error(e);resultHint.textContent=e.message;cards.append(button(I18n.t("重试生成"),()=>makeCards(),'primary'));summary.textContent=I18n.t("未生成图卡，可重试");}finally{busy=false;controls();}
  }
  async function deliver() {
    if(!job||busy)return;
    busy=true;controls();errors.textContent='';primaryAction.textContent=I18n.t("正在发送…");
    const sentJobID=job.id;const poll=setInterval(async()=>{try{const current=await api('/api/share/jobs/'+sentJobID);summary.textContent=I18n.t`已完成 ${current.steps.filter(s=>s.status==='sent').length}/${current.steps.length} 部分`;}catch{}},2000);
    try { job=await post(`jobs/${job.id}/send`); modal.close(); await showRecord(job.id); }
    catch(e){error(e);}finally{clearInterval(poll);busy=false;controls();}
  }
  const historyDialog=el('dialog','','share-history-dialog');historyDialog.setAttribute('aria-label',I18n.t("分享记录"));const historyBody=el('div'),historyInner=el('div','','dialog-inner'),historyHead=el('div','','dialog-head');historyHead.append(el('h2',I18n.t("分享记录")));historyInner.append(historyHead,historyBody);historyDialog.append(historyInner);document.body.append(historyDialog);let historyBusy=false;
  setupModal(historyDialog,{canDismiss:()=>!historyBusy});
  async function showRecord(id) {
    if(!historyDialog.open)historyDialog.showModal();historyBody.replaceChildren(el('p',I18n.t("正在读取…")));
    try {
      const record=await api('/api/share/jobs/'+id);historyBody.replaceChildren(el('h3',record.title),el('p',`${record.platform} → ${record.target}`),el('pre',record.text,'share-preview carry-preview'));
      const sent=record.steps.filter(s=>s.status==='sent').length;historyBody.append(el('p',I18n.t`已完成 ${sent}/${record.steps.length} 部分`));
      for(const step of record.steps){const row=el('div','','share-step');row.append(el('span',`${step.label} · ${{sent:I18n.t("已送达"),pending:I18n.t("待发送"),sending:I18n.t("发送中"),failed:I18n.t("失败"),uncertain:I18n.t("送达状态未知")}[step.status]}`));if(step.error)row.append(el('p',I18n.message(step.error),'dialog-error'));
        if(step.status==='uncertain') {row.append(el('p',I18n.t("请在目标应用核对这一部分，再选择：")));
          for(const [label,delivered]of[[I18n.t("确认已送达"),true],[I18n.t("确认未送达"),false]])row.append(button(label,async()=>{if(historyBusy)return;historyBusy=true;try{await post(`jobs/${id}/resolve`,{stepId:step.id,delivered});await showRecord(id);}catch(e){row.append(el('p',e.message,'dialog-error'));}finally{historyBusy=false;}}));}
        historyBody.append(row);
      }
      if(sent<record.steps.length && !record.expired && !record.sending && !record.steps.some(s=>s.status==='uncertain')) {const retry=button(I18n.t("继续发送未完成部分"),async()=>{if(historyBusy)return;historyBusy=true;retry.disabled=true;try{await post(`jobs/${id}/send`);await showRecord(id);}catch(e){historyBody.append(el('p',e.message,'dialog-error'));}finally{historyBusy=false;retry.disabled=false;}},'primary');historyBody.append(retry);}
      if(record.expired)historyBody.append(el('p',I18n.t("预览已过期。发送记录保留，请重新选择内容。")));
      if(record.sending)historyBody.append(button(I18n.t("刷新发送进度"),()=>showRecord(id)));
      historyBody.append(button(I18n.t("返回记录列表"),()=>openHistory()));
    }catch(e){historyBody.replaceChildren(el('p',e.message,'dialog-error'));}
  }
  async function openHistory(){if(!historyDialog.open)historyDialog.showModal();historyBody.replaceChildren();try{const r=await api('/api/share/history');if(!r.jobs.length)historyBody.append(el('p',I18n.t("还没有 Slack 或 Discord 分享记录。")));for(const j of r.jobs)historyBody.append(button(I18n.t`${j.title} · ${j.platform} · 已完成 ${j.steps.filter(s=>s.status==='sent').length}/${j.steps.length}`,()=>showRecord(j.id),'tool share-history-row'));}catch(e){historyBody.append(el('p',e.message,'dialog-error'));}}

  historyHead.append(button(I18n.t("关闭"),()=>{if(!historyBusy)historyDialog.close();}));
  registerAppUtility(button(I18n.t("分享记录"),openHistory));
  const entry=$('send-feishu');entry.textContent=I18n.t("分享");entry.setAttribute('aria-label',I18n.t("分享所选讨论"));
  entry.onclick=async()=>{
    if(!activeSession||!selectedMessages.size||busy)return;
    const messages=activeSession.messages.filter(m=>selectedMessages.has(m.id));snapshot={runtime:contextRuntime,threadID:activeSession.id,messageIDs:messages.map(m=>m.id),fingerprints:Object.fromEntries(messages.map(m=>[m.id,m.fingerprint])),includeProgress:$('include-progress').checked};
    assetsInitialized=false;selectedAssets=new Set();returnedPaths=null;assetPaths=new Map();job=null;note.value='';cards.replaceChildren();preview.textContent='';errors.textContent='';targets();showChooser();modal.showModal();
    try{const result=await Promise.all([api('/api/share/status'),api('/api/share/card-themes')]);status=result[0];themes=result[1].themes;if(!themes.some(t=>t.id===cardTheme))cardTheme='sage';themePicker();}catch(e){error(e);}controls();
  };
  modal.addEventListener('close',()=>{clearTimeout(previewTimer);generation++;});
})();
