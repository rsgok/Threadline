(() => {
  const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/feishu.css'; document.head.append(style);
  const node = (tag, text, cls) => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };
  const button = (text, fn, cls = 'tool') => { const e = node('button', text, cls); e.onclick = fn; return e; };
  // Render menus in the page: embedded webviews do not consistently show native select popups.
  function recipientMenu(label) {
    const root = node('div', '', 'feishu-recipient-menu'), trigger = button(I18n.t("请选择"), () => toggle());
    const list = node('div', '', 'feishu-recipient-options'); list.hidden = true; list.setAttribute('role', 'listbox');
    trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-label', label); trigger.setAttribute('aria-expanded', 'false');
    root.append(trigger, list); let options = [], value = '';
    const close = () => { list.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
    function toggle() { if (trigger.disabled) return; list.hidden = !list.hidden; trigger.setAttribute('aria-expanded', String(!list.hidden)); if (!list.hidden) list.querySelector('[aria-selected="true"]')?.focus(); }
    function render() { trigger.textContent = (options.find(o => o.value === value)?.textContent || I18n.t("请选择")) + ' ▾'; list.replaceChildren();
      for (const option of options) { const row = button(option.textContent, () => { value = option.value; render(); close(); trigger.focus(); root.onchange?.(); }); row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(option.value === value)); list.append(row); }
    }
    root.add = option => { options.push(option); if (options.length === 1) value = option.value; render(); };
    root.replaceChildren = (...next) => { options = next; value = options[0]?.value || ''; close(); render(); };
    Object.defineProperties(root, { value: { get: () => value }, options: { get: () => options }, selectedOptions: { get: () => options.filter(o => o.value === value) }, disabled: { get: () => trigger.disabled, set: v => { trigger.disabled = v; if (v) close(); } } });
    document.addEventListener('click', e => { if (!root.contains(e.target)) close(); });
    root.addEventListener('keydown', e => { if (e.key === 'Escape' && !list.hidden) { e.preventDefault(); e.stopPropagation(); close(); trigger.focus(); } else if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); list.hidden = false; trigger.setAttribute('aria-expanded', 'true'); const rows = [...list.children]; const index = rows.indexOf(document.activeElement); rows[(index + (e.key === 'ArrowDown' ? 1 : rows.length - 1) + rows.length) % rows.length]?.focus(); } });
    return root;
  }
  let lastNotice = '', lastNoticeAt = 0;
  const notify = (text, kind = 'info') => { if (!text) return; if (text === lastNotice && Date.now() - lastNoticeAt < 6000) return; lastNotice = text; lastNoticeAt = Date.now(); notifyMessage(text, kind); };
  const post = async (route, data = {}) => { const result = await api('/api/feishu/' + route, { method: 'POST', body: JSON.stringify(data) }); const messages = { bind: I18n.t("飞书应用已绑定"), disconnect: I18n.t("已断开本机飞书连接"), cancel: I18n.t("已取消连接操作") }; if (messages[route]) notify(messages[route], 'success'); return result; };
  const dialog = node('dialog', '', 'feishu-dialog compact-dialog'); dialog.setAttribute('aria-label', I18n.t("连接飞书"));
  const heading = node('div', '', 'feishu-heading'); heading.append(node('h2', I18n.t("连接飞书")));
  const content = node('div');
  dialog.append(heading, content); document.body.append(dialog);
  let timer, lastView = '', working = false;
  setupModal(dialog, { canDismiss: () => !working });
  const attempt = async fn => { if (working) return; working = true; try { await fn(); } catch (e) { notify(e.message, 'error'); } finally { working = false; } };
  const connectionButton = button(I18n.t("连接飞书"), () => openConnection()); connectionButton.classList.add('feishu-connect');
  registerSettingsAction(connectionButton);
  // A visible entry remains available inside a narrow Codex panel.

  function link(text, url) { const a = node('a', text); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }
  async function refresh() {
    if (!dialog.open) return;
    try {
      const s = await api('/api/feishu/status');
      connectionButton.textContent = s.ready ? I18n.t("飞书已连接") : I18n.t("连接飞书");
      const key = JSON.stringify(s); if (key === lastView) return; lastView = key; content.replaceChildren();
      if (s.job && ['starting', 'waiting'].includes(s.job.status)) {
        content.append(node('p', s.job.kind === 'permissions' ? I18n.t("用飞书扫码，为当前 Threadline 应用补开权限。") : s.job.kind === 'create' ? I18n.t("用飞书扫码，创建你的 Threadline 应用。") : I18n.t("用飞书扫码，授权读取群列表；消息由你的 Threadline 机器人发送。")));
        if (s.job.qr) { const img = node('img', '', 'feishu-qr'); img.src = s.job.qr; img.alt = I18n.t("飞书授权二维码"); content.append(img, link(I18n.t("打开飞书确认页面 ↗"), s.job.url), node('p', I18n.t("若飞书要求企业审批，请按页面提示完成；二维码过期后可重新发起。"), 'feishu-muted')); }
        else content.append(node('p', I18n.t("正在获取二维码…")));
        content.append(button(I18n.t("取消本次连接"), () => attempt(async () => { await post('cancel'); lastView = ''; await refresh(); })));
        return;
      }
      if (s.job?.status === 'done') notify(s.job.kind === 'permissions' ? I18n.t("权限确认已完成，正在检查生效状态") : s.job.kind === 'authorize' ? I18n.t("飞书授权已完成") : I18n.t("飞书应用已创建"), 'success');
      if (s.job?.status === 'failed') notify(I18n.message(s.job.message), 'error');
      if (!s.connected) {
        content.append(node('p', I18n.t("创建你自己的飞书应用，将选中的 AI 讨论分享给同事。应用凭证独立保存，不使用 Peer 的账号配置。")));
        if (s.recoveryAppId) content.append(node('p', I18n.t("应用 ") + s.recoveryAppId + I18n.t(" 已创建。请从应用后台取回凭证，在下方绑定恢复。")));
        else content.append(button(I18n.t("扫码创建专属应用"), () => attempt(async () => { await post('create'); lastView = ''; await refresh(); }), 'primary'));
        const details = node('details', '', 'feishu-existing'); details.append(node('summary', I18n.t("绑定已有应用")));
        const app = node('input'); app.placeholder = 'App ID（cli_…）'; app.setAttribute('aria-label', 'App ID'); if (s.recoveryAppId) { app.value = s.recoveryAppId; app.readOnly = true; details.open = true; }
        const secret = node('input'); secret.type = 'password'; secret.autocomplete = 'off'; secret.placeholder = 'App Secret'; secret.setAttribute('aria-label', 'App Secret');
        details.append(app, secret, button(I18n.t("绑定应用"), () => attempt(async () => { const payload = { appId: app.value.trim(), appSecret: secret.value }; secret.value = ''; await post('bind', payload); lastView = ''; await refresh(); }), 'primary'));
        content.append(details, node('p', I18n.t("本版使用本机 lark-cli 保存独立凭证和完成用户授权；不上传到 Threadline 服务器。"), 'feishu-muted'));
      } else {
        content.append(node('p', I18n.t("应用 · ") + s.appId));
        if (s.connectionError) notify(s.connectionError, 'error');
        content.append(node('p', s.userAuthorized ? I18n.t("账号 · ") + (s.userName || I18n.t("飞书用户")) : I18n.t("下一步：授权读取你的群列表。")));
        if (s.ready) content.append(button(I18n.t("验证群列表"), () => attempt(async () => { const result = await api('/api/feishu/chats'); notify(I18n.t("读取成功，本页返回 ") + result.chats.length + I18n.t(" 个群。"), 'success'); })));
        else {
          if (s.missingBotScopes?.length) content.append(button(I18n.t("一键申请机器人发送权限"), () => attempt(async () => { await post('permissions', { kind: 'send' }); lastView = ''; await refresh(); })), link(I18n.t("权限管理（备用）↗"), s.permissionUrl));
          if (s.botScopeError) notify(s.botScopeError, 'error');
          if (!s.userAuthorized || s.missingScopes?.length) content.append(node('p', I18n.t("尚需授权：") + s.missingScopes.join('、'), 'feishu-muted'));
          if (!s.userAuthorized || s.missingScopes?.length) content.append(button(s.userAuthorized ? I18n.t("补充群列表授权") : I18n.t("授权群列表"), () => attempt(async () => { await post('authorize'); lastView = ''; await refresh(); }), 'primary'));
        }
        content.append(node('p', I18n.t("机器人需要加入目标群。开通权限并按飞书要求发布后，点击下方刷新。"), 'feishu-muted'), link(I18n.t("打开应用后台 ↗"), s.consoleUrl), button(I18n.t("刷新权限状态"), () => attempt(async () => { await api('/api/feishu/status?refresh=1'); lastView = ''; await refresh(); })));
        const disconnect=button(I18n.t("断开本机连接"), () => attempt(async () => { await post('disconnect'); lastView = ''; await refresh(); }));disconnect.dataset.intent='danger';content.append(disconnect);
        content.append(node('p', I18n.t("断开会清除本机用户登录态，不删除飞书应用，也不撤销服务端授权。"), 'feishu-muted'));
      }
    } catch (e) { notify(e.message, 'error'); }
  }
  async function openConnection() { lastView = ''; dialog.showModal(); await refresh(); clearInterval(timer); if (dialog.open) timer = setInterval(refresh, 2000); }
  dialog.addEventListener('close', () => { clearInterval(timer); if (sendDialog.open) loadChats(); });

  const sendDialog = node('dialog', '', 'feishu-dialog feishu-send-dialog'); sendDialog.setAttribute('aria-label', I18n.t("发送讨论到飞书"));
  const sendHeading = node('div', '', 'feishu-heading'); let sending = false;
  sendHeading.append(node('h2', I18n.t("发到飞书")));
  const identity = node('p', '', 'feishu-muted');
  const targetSwitch = node('div', '', 'feishu-target-switch'); targetSwitch.setAttribute('role', 'group'); targetSwitch.setAttribute('aria-label', I18n.t("发送目标"));
  let target = 'self', targetReady = false;
  const selfTarget = button(I18n.t("私聊"), () => changeTarget('self'));
  const groupTarget = button(I18n.t("群聊"), () => changeTarget('group'));
  targetSwitch.append(selfTarget, groupTarget);
  const userQuery = node('input'); userQuery.placeholder = I18n.t("搜索同事姓名或邮箱"); userQuery.setAttribute('aria-label', I18n.t("搜索收件人"));
  const userSelect = recipientMenu(I18n.t("私聊收件人")); userSelect.setAttribute('aria-label', I18n.t("私聊收件人")); userSelect.add(new Option(I18n.t("我（当前飞书用户）"), 'self'));
  const userSearch = button(I18n.t("搜索同事"), () => searchUsers());
  const contactAuth = button(I18n.t("授权搜索同事"), () => attempt(async () => { await post('authorize', { contacts: true }); await openConnection(); })); contactAuth.hidden = true;
  let userSearchGeneration = 0;
  async function searchUsers() {
    if (sending) return; const id = ++userSearchGeneration;
    try { const r = await api('/api/feishu/users?q=' + encodeURIComponent(userQuery.value.trim())); if (id !== userSearchGeneration) return;
      userSelect.replaceChildren(new Option(I18n.t("我（当前飞书用户）"), 'self'));
      for (const u of r.users) userSelect.add(new Option(u.name + (u.department ? ' · ' + u.department : '') + ' · ' + u.id.slice(-6), u.id));
      userSelect.querySelector('button').click();
      notify(r.hasMore ? I18n.t("结果较多，请补充姓名或邮箱缩小范围。") : r.users.length ? I18n.t("请选择收件人。") : I18n.t("没有找到同事。")); contactAuth.hidden = true;
    } catch (e) { notify(e.message, 'error'); contactAuth.hidden = !/权限|授权|permission|authoriz/i.test(e.rawMessage||e.message); }
  }
  userSelect.onchange = () => { recipientLabel.textContent = I18n.t("收件人：") + userSelect.selectedOptions[0].textContent; };
  userQuery.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); searchUsers(); } };
  const recipientLabel = node('p', '', 'feishu-muted');
  const hasTarget = () => targetReady && (target === 'self' || !!select.value);
  function changeTarget(value) { if (sending) return; target = value; targetReady = false;colleagueSearch.hidden=target==='group'; selfTarget.setAttribute('aria-pressed', String(target === 'self')); groupTarget.setAttribute('aria-pressed', String(target === 'group')); for (const e of [userQuery, userSelect, userSearch]) e.hidden = target === 'group'; contactAuth.hidden = true; for (const e of [query, search, select]) e.hidden = target === 'self'; more.hidden = true; loadChats(); }
  const query = node('input'); query.placeholder = I18n.t("搜索群聊"); query.setAttribute('aria-label', I18n.t("搜索飞书群聊"));
  const search = button(I18n.t("搜索"), () => loadChats());
  const select = recipientMenu(I18n.t("发送到哪个群")); select.setAttribute('aria-label', I18n.t("发送到哪个群"));
  const more = button(I18n.t("加载更多群"), () => loadChats(true)); more.hidden = true;
  const note = node('textarea'); note.placeholder = I18n.t("附一句说明（可选）"); note.maxLength = 2000; note.setAttribute('aria-label', I18n.t("发送附言"));
  const attachmentsBox = node('div', '', 'feishu-attachments'); let attachmentIDs = new Set();
  const preview = node('pre', '', 'feishu-preview'); const hint = node('p', I18n.t("以折叠卡片发送原文；请先将机器人加入目标群。图片和本地文件不会上传。"), 'feishu-muted');
  const refreshPreview = button(I18n.t("重试预览"), () => prepare());refreshPreview.hidden=true;
  const send = button(I18n.t("发送"), () => deliver(), 'primary'); send.disabled = true;
  const connection = button(I18n.t("连接 / 管理飞书"), () => openConnection());
  let shareBack, previewAttachments=[];
  const backToMethods=button(I18n.t("← 更换分享方式"),()=>{if(sending||!shareBack)return;const state={note:note.value,paths:previewAttachments.filter(a=>attachmentIDs.has(a.id)).map(a=>a.path)};sendDialog.close();shareBack(state);});
  const sendInner=node('div','','dialog-inner');
  const recipientSection=node('section','','share-recipient-section');const colleagueSearch=node('details');colleagueSearch.append(node('summary',I18n.t("查找其他同事")),userQuery,userSearch,contactAuth);
  recipientSection.append(node('h3',I18n.t("发送到")),targetSwitch,recipientLabel,userSelect,colleagueSearch,query,search,select,more);
  const connectionDetails=node('details','','share-connection-details');connectionDetails.append(node('summary',I18n.t("飞书连接")),identity,connection);
  const noteLabel=node('label',I18n.t("附言（可选）"),'field-label');note.id='feishu-share-note';noteLabel.htmlFor=note.id;
  const previewDetails=node('details','','share-preview-details');previewDetails.append(node('summary',I18n.t("查看完整内容")),preview);
  const sendActions=node('div','','dialog-bottom');sendActions.append(send);
  sendInner.append(sendHeading,backToMethods,recipientSection,connectionDetails,node('h3',I18n.t("分享内容")),noteLabel,note,attachmentsBox,previewDetails,hint,refreshPreview,sendActions);
  sendDialog.append(sendInner);document.body.append(sendDialog);
  let snapshot, previewId, pageToken = '', searchGeneration = 0, previewGeneration = 0, previewTimer;
  function schedulePreview() { clearTimeout(previewTimer);refreshPreview.hidden=true; previewGeneration++; previewId = null; send.disabled = true; send.textContent = I18n.t("正在更新预览…"); previewTimer = setTimeout(() => prepare(), 250); }
  note.oninput = schedulePreview;
  async function loadChats(append = false) {
    if (sending) return;
    const id = ++searchGeneration; send.disabled = true;
    try {
      const s = await api('/api/feishu/status'); identity.textContent = (target === 'self' ? s.privateReady : s.ready) ? I18n.t("发送身份：") + (s.botName || I18n.t("Threadline 机器人")) + I18n.t("（机器人）") : I18n.t("请先开通机器人发送权限，并授权群列表。");
      if (id !== searchGeneration) return;
      connectionDetails.open=!(target==='self'?s.privateReady:s.ready);
      targetReady = target === 'self' ? s.privateReady : s.ready;
      recipientLabel.textContent = target === 'self' ? I18n.t("收件人：") + (userSelect.value === 'self' ? (s.userName || I18n.t("当前飞书用户")) + I18n.t("（我）") : userSelect.selectedOptions[0].textContent) : I18n.t("请选择已加入机器人的群聊");
      if (!targetReady) return;
      if (target === 'self') { send.disabled = !previewId; return; }
      const result = await api('/api/feishu/chats?q=' + encodeURIComponent(query.value.trim()) + '&page=' + encodeURIComponent(append ? pageToken : ''));
      if (id !== searchGeneration) return;
      if (!append) { select.replaceChildren(); select.add(new Option(I18n.t("请选择群聊"), '')); }
      for (const c of result.chats) if (![...select.options].some(o => o.value === c.id)) select.add(new Option(c.name, c.id));
      pageToken = result.pageToken; more.hidden = !result.hasMore || !pageToken;
      if (!result.chats.length && !append) notify(I18n.t("没有找到可用群聊，请修改关键词。"));
      send.disabled = !previewId || !hasTarget();
    } catch (e) { notify(e.message, 'error'); }
  }
  select.onchange = () => { send.disabled = !previewId || !hasTarget() || sending; };
  query.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); loadChats(); } };
  async function prepare() {
    if (sending) return;refreshPreview.hidden=true; clearTimeout(previewTimer); const generation = ++previewGeneration; send.disabled = true; send.textContent = I18n.t("正在更新预览…"); previewId = null;
    try { const result = await post('preview', { ...snapshot, note: note.value, attachmentIDs: [...attachmentIDs] }); if (generation !== previewGeneration || !sendDialog.open) return; attachmentsBox.replaceChildren();previewAttachments=result.attachments||[];
      if (result.attachments?.length) {
        attachmentsBox.append(node('p', I18n.t("附件（勾选后上传；未选附件只注明未发送）")));
        for (const a of result.attachments) {
          const label = node('label', '', 'feishu-attachment'); const check = node('input'); check.type = 'checkbox'; check.checked = attachmentIDs.has(a.id); check.disabled = !a.available; check.dataset.available = String(a.available);
          check.onchange = () => { if (sending) return; if (check.checked) attachmentIDs.add(a.id); else attachmentIDs.delete(a.id); schedulePreview(); };
          const info = node('span', I18n.t`第 ${a.ordinal} 条 · ${a.name} · ${a.available ? Math.ceil(a.size / 1024) + ' KB' : I18n.message(a.problem)}`); info.title = a.path; label.append(check); if(a.kind==='image'&&a.available){const img=node('img','','share-attachment-thumb');img.src='/api/local-resource?'+new URLSearchParams({path:a.path,thread:snapshot.threadID,runtime:snapshot.runtime||'codex'});img.alt=a.name;label.append(img);} label.append(info); attachmentsBox.append(label);
        }
        const s = await api('/api/feishu/status'); if (generation !== previewGeneration || !sendDialog.open) return; if (s.uploadPermissionUrl) attachmentsBox.append(button(I18n.t("一键申请图片 / 文件上传权限"), () => attempt(async () => { await post('permissions', { kind: 'upload' }); await openConnection(); })), link(I18n.t("权限管理（备用）↗"), s.uploadPermissionUrl));
      }
      preview.textContent = result.text; hint.textContent = I18n.t`${result.count} 条消息 · 将发送 ${result.cardCount} 张折叠卡片 + ${result.fileCount || 0} 个文件。长消息分段保留原文。`; previewId = result.id; send.disabled = !hasTarget(); }
    catch (e) { if (generation === previewGeneration) notify(e.message, 'error'); }
    finally { if (generation === previewGeneration) { refreshPreview.hidden=!!previewId;refreshPreview.textContent=I18n.t("重试预览");send.textContent = I18n.t("确认发送到飞书"); send.disabled = !previewId || !hasTarget() || sending; } }
  }
  async function deliver() {
    if (sending || !previewId || !hasTarget()) return;
    sending = true; attachmentsBox.querySelectorAll('input').forEach(e => e.disabled = true); send.disabled = true; userSelect.disabled = userQuery.disabled = userSearch.disabled = note.disabled = select.disabled = query.disabled = true; send.textContent = I18n.t("正在发送…");
    try {
      const receipt = await post('send', { previewId, target: target === 'self' && userSelect.value !== 'self' ? 'user' : target, userId: userSelect.value, ...(target === 'group' ? { chatId: select.value } : {}) });
      notify(I18n.t("已发送到「") + (target === 'self' ? userSelect.selectedOptions[0].textContent : select.selectedOptions[0].textContent) + I18n.t("」，共 ") + receipt.sentCount + I18n.t(" 张卡片。原来的消息选择仍然保留，可以继续“留下”。"), 'success'); previewId = null;
    } catch (e) { notify(e.message, 'error'); }
    finally { sending = false; send.textContent = I18n.t("确认发送到飞书"); attachmentsBox.querySelectorAll('input').forEach(e => e.disabled = e.dataset.available !== 'true'); userSelect.disabled = userQuery.disabled = userSearch.disabled = note.disabled = select.disabled = query.disabled = false; send.disabled = !previewId || !hasTarget(); }
  }
  sendDialog.addEventListener('close', () => { clearTimeout(previewTimer);refreshPreview.hidden=true; previewGeneration++; });
  setupModal(sendDialog, { canDismiss: () => !sending });
  async function openSelectedShare(shared) {
    if (!activeSession || !selectedMessages.size) return;
    shareBack=shared?.onBack;backToMethods.hidden=!shareBack;
    const messages = activeSession.messages.filter(m => selectedMessages.has(m.id));
    snapshot = shared?.snapshot || { runtime: contextRuntime, threadID: activeSession.id, messageIDs: messages.map(m => m.id), fingerprints: Object.fromEntries(messages.map(m => [m.id, m.fingerprint])), includeProgress: $('include-progress').checked };
    attachmentIDs = new Set(); attachmentsBox.replaceChildren(); userSelect.replaceChildren(new Option(I18n.t("我（当前飞书用户）"), 'self')); userQuery.value = ''; userSearchGeneration++; note.value = shared?.note || ''; preview.textContent = ''; select.replaceChildren(); query.value = ''; previewId = null;
    const initial = await post('preview', { ...snapshot, note: note.value, attachmentIDs: [] }); attachmentIDs = new Set(initial.attachments.filter(a => a.available && (!Array.isArray(shared?.paths) || shared.paths.includes(a.path))).map(a => a.id));
    sendDialog.showModal(); changeTarget('self'); await prepare();
  }
  window.openFeishuShare = openSelectedShare;
  const sendSelected = button(I18n.t("发到飞书"), () => openSelectedShare(), 'tool');
  sendSelected.id = 'send-feishu'; sendSelected.disabled = true; $('save-session').before(sendSelected);
  const originalSelectionChanged = selectionChanged;
  selectionChanged = function() { originalSelectionChanged(); sendSelected.disabled = !selectedMessages.size || sessionLoading || sessionSaving; };
})();
