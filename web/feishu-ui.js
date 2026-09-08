(() => {
  const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/feishu.css'; document.head.append(style);
  const node = (tag, text, cls) => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };
  const button = (text, fn, cls = 'tool') => { const e = node('button', text, cls); e.onclick = fn; return e; };
  // Render menus in the page: embedded webviews do not consistently show native select popups.
  function recipientMenu(label) {
    const root = node('div', '', 'feishu-recipient-menu'), trigger = button('请选择', () => toggle());
    const list = node('div', '', 'feishu-recipient-options'); list.hidden = true; list.setAttribute('role', 'listbox');
    trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-label', label); trigger.setAttribute('aria-expanded', 'false');
    root.append(trigger, list); let options = [], value = '';
    const close = () => { list.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
    function toggle() { if (trigger.disabled) return; list.hidden = !list.hidden; trigger.setAttribute('aria-expanded', String(!list.hidden)); if (!list.hidden) list.querySelector('[aria-selected="true"]')?.focus(); }
    function render() { trigger.textContent = (options.find(o => o.value === value)?.textContent || '请选择') + ' ▾'; list.replaceChildren();
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
  const post = async (route, data = {}) => { const result = await api('/api/feishu/' + route, { method: 'POST', body: JSON.stringify(data) }); const messages = { bind: '飞书应用已绑定', disconnect: '已断开本机飞书连接', cancel: '已取消连接操作' }; if (messages[route]) notify(messages[route], 'success'); return result; };
  const dialog = node('dialog', '', 'feishu-dialog compact-dialog'); dialog.setAttribute('aria-label', '连接飞书');
  const heading = node('div', '', 'feishu-heading'); heading.append(node('h2', '连接飞书'), button('关闭', () => dialog.close()));
  const content = node('div');
  dialog.append(heading, content); document.body.append(dialog);
  let timer, lastView = '', working = false;
  const attempt = async fn => { if (working) return; working = true; try { await fn(); } catch (e) { notify(e.message, 'error'); } finally { working = false; } };
  const connectionButton = button('连接飞书', () => openConnection()); connectionButton.classList.add('feishu-connect');
  (document.querySelector('.native-context-header') || document.querySelector('.toolbar')).append(connectionButton);
  // A visible entry remains available inside a narrow Codex panel.
  const panelEntry = button('飞书', () => openConnection()); panelEntry.classList.add('feishu-panel-connect'); document.querySelector('.panel-header')?.append(panelEntry);
  function link(text, url) { const a = node('a', text); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }
  async function refresh() {
    if (!dialog.open) return;
    try {
      const s = await api('/api/feishu/status');
      connectionButton.textContent = s.ready ? '飞书已连接' : '连接飞书';
      const key = JSON.stringify(s); if (key === lastView) return; lastView = key; content.replaceChildren();
      if (s.job && ['starting', 'waiting'].includes(s.job.status)) {
        content.append(node('p', s.job.kind === 'permissions' ? '用飞书扫码，为当前 Threadline 应用补开权限。' : s.job.kind === 'create' ? '用飞书扫码，创建你的 Threadline 应用。' : '用飞书扫码，授权读取群列表；消息由你的 Threadline 机器人发送。'));
        if (s.job.qr) { const img = node('img', '', 'feishu-qr'); img.src = s.job.qr; img.alt = '飞书授权二维码'; content.append(img, link('打开飞书确认页面 ↗', s.job.url), node('p', '若飞书要求企业审批，请按页面提示完成；二维码过期后可重新发起。', 'feishu-muted')); }
        else content.append(node('p', '正在获取二维码…'));
        content.append(button('取消本次连接', () => attempt(async () => { await post('cancel'); lastView = ''; await refresh(); })));
        return;
      }
      if (s.job?.status === 'done') notify(s.job.kind === 'permissions' ? '权限确认已完成，正在检查生效状态' : s.job.kind === 'authorize' ? '飞书授权已完成' : '飞书应用已创建', 'success');
      if (s.job?.status === 'failed') notify(s.job.message, 'error');
      if (!s.connected) {
        content.append(node('p', '创建你自己的飞书应用，将选中的 AI 讨论分享给同事。应用凭证独立保存，不使用 Peer 的账号配置。'));
        if (s.recoveryAppId) content.append(node('p', '应用 ' + s.recoveryAppId + ' 已创建。请从应用后台取回凭证，在下方绑定恢复。'));
        else content.append(button('扫码创建专属应用', () => attempt(async () => { await post('create'); lastView = ''; await refresh(); }), 'primary'));
        const details = node('details', '', 'feishu-existing'); details.append(node('summary', '绑定已有应用'));
        const app = node('input'); app.placeholder = 'App ID（cli_…）'; app.setAttribute('aria-label', 'App ID'); if (s.recoveryAppId) { app.value = s.recoveryAppId; app.readOnly = true; details.open = true; }
        const secret = node('input'); secret.type = 'password'; secret.autocomplete = 'off'; secret.placeholder = 'App Secret'; secret.setAttribute('aria-label', 'App Secret');
        details.append(app, secret, button('绑定应用', () => attempt(async () => { const payload = { appId: app.value.trim(), appSecret: secret.value }; secret.value = ''; await post('bind', payload); lastView = ''; await refresh(); }), 'primary'));
        content.append(details, node('p', '本版使用本机 lark-cli 保存独立凭证和完成用户授权；不上传到 Threadline 服务器。', 'feishu-muted'));
      } else {
        content.append(node('p', '应用 · ' + s.appId));
        if (s.connectionError) notify(s.connectionError, 'error');
        content.append(node('p', s.userAuthorized ? '账号 · ' + (s.userName || '飞书用户') : '下一步：授权读取你的群列表。'));
        if (s.ready) content.append(button('验证群列表', () => attempt(async () => { const result = await api('/api/feishu/chats'); notify('读取成功，本页返回 ' + result.chats.length + ' 个群。', 'success'); })));
        else {
          if (s.missingBotScopes?.length) content.append(button('一键申请机器人发送权限', () => attempt(async () => { await post('permissions', { kind: 'send' }); lastView = ''; await refresh(); })), link('权限管理（备用）↗', s.permissionUrl));
          if (s.botScopeError) notify(s.botScopeError, 'error');
          if (!s.userAuthorized || s.missingScopes?.length) content.append(node('p', '尚需授权：' + s.missingScopes.join('、'), 'feishu-muted'));
          if (!s.userAuthorized || s.missingScopes?.length) content.append(button(s.userAuthorized ? '补充群列表授权' : '授权群列表', () => attempt(async () => { await post('authorize'); lastView = ''; await refresh(); }), 'primary'));
        }
        content.append(node('p', '机器人需要加入目标群。开通权限并按飞书要求发布后，点击下方刷新。', 'feishu-muted'), link('打开应用后台 ↗', s.consoleUrl), button('刷新权限状态', () => attempt(async () => { await api('/api/feishu/status?refresh=1'); lastView = ''; await refresh(); })));
        content.append(button('断开本机连接', () => attempt(async () => { await post('disconnect'); lastView = ''; await refresh(); })));
        content.append(node('p', '断开会清除本机用户登录态，不删除飞书应用，也不撤销服务端授权。', 'feishu-muted'));
      }
    } catch (e) { notify(e.message, 'error'); }
  }
  async function openConnection() { lastView = ''; dialog.showModal(); await refresh(); clearInterval(timer); timer = setInterval(refresh, 2000); }
  dialog.addEventListener('close', () => { clearInterval(timer); if (sendDialog.open) loadChats(); });

  const sendDialog = node('dialog', '', 'feishu-dialog compact-dialog feishu-send-dialog'); sendDialog.setAttribute('aria-label', '发送讨论到飞书');
  const sendHeading = node('div', '', 'feishu-heading'); let sending = false;
  sendHeading.append(node('h2', '发到飞书'), button('关闭', () => { if (!sending) sendDialog.close(); }));
  const identity = node('p', '', 'feishu-muted');
  const targetSwitch = node('div', '', 'feishu-target-switch'); targetSwitch.setAttribute('role', 'group'); targetSwitch.setAttribute('aria-label', '发送目标');
  let target = 'self', targetReady = false;
  const selfTarget = button('私聊', () => changeTarget('self'));
  const groupTarget = button('群聊', () => changeTarget('group'));
  targetSwitch.append(selfTarget, groupTarget);
  const userQuery = node('input'); userQuery.placeholder = '搜索同事姓名或邮箱'; userQuery.setAttribute('aria-label', '搜索收件人');
  const userSelect = recipientMenu('私聊收件人'); userSelect.setAttribute('aria-label', '私聊收件人'); userSelect.add(new Option('我（当前飞书用户）', 'self'));
  const userSearch = button('搜索同事', () => searchUsers());
  const contactAuth = button('授权搜索同事', () => attempt(async () => { await post('authorize', { contacts: true }); await openConnection(); })); contactAuth.hidden = true;
  let userSearchGeneration = 0;
  async function searchUsers() {
    if (sending) return; const id = ++userSearchGeneration;
    try { const r = await api('/api/feishu/users?q=' + encodeURIComponent(userQuery.value.trim())); if (id !== userSearchGeneration) return;
      userSelect.replaceChildren(new Option('我（当前飞书用户）', 'self'));
      for (const u of r.users) userSelect.add(new Option(u.name + (u.department ? ' · ' + u.department : '') + ' · ' + u.id.slice(-6), u.id));
      userSelect.querySelector('button').click();
      notify(r.hasMore ? '结果较多，请补充姓名或邮箱缩小范围。' : r.users.length ? '请选择收件人。' : '没有找到同事。'); contactAuth.hidden = true;
    } catch (e) { notify(e.message, 'error'); contactAuth.hidden = !/权限|授权/.test(e.message); }
  }
  userSelect.onchange = () => { recipientLabel.textContent = '收件人：' + userSelect.selectedOptions[0].textContent; };
  userQuery.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); searchUsers(); } };
  const recipientLabel = node('p', '', 'feishu-muted');
  const hasTarget = () => targetReady && (target === 'self' || !!select.value);
  function changeTarget(value) { if (sending) return; target = value; targetReady = false; selfTarget.setAttribute('aria-pressed', String(target === 'self')); groupTarget.setAttribute('aria-pressed', String(target === 'group')); for (const e of [userQuery, userSelect, userSearch]) e.hidden = target === 'group'; contactAuth.hidden = true; for (const e of [query, search, select]) e.hidden = target === 'self'; more.hidden = true; loadChats(); }
  const query = node('input'); query.placeholder = '搜索群聊'; query.setAttribute('aria-label', '搜索飞书群聊');
  const search = button('搜索', () => loadChats());
  const select = recipientMenu('发送到哪个群'); select.setAttribute('aria-label', '发送到哪个群');
  const more = button('加载更多群', () => loadChats(true)); more.hidden = true;
  const note = node('textarea'); note.placeholder = '附一句说明（可选）'; note.maxLength = 2000; note.setAttribute('aria-label', '发送附言');
  const attachmentsBox = node('div', '', 'feishu-attachments'); let attachmentIDs = new Set();
  const preview = node('pre', '', 'feishu-preview'); const hint = node('p', '以折叠卡片发送原文；请先将机器人加入目标群。图片和本地文件不会上传。', 'feishu-muted');
  const refreshPreview = button('更新预览', () => prepare());
  const send = button('发送', () => deliver(), 'primary'); send.disabled = true;
  const connection = button('连接 / 管理飞书', () => openConnection());
  sendDialog.append(sendHeading, identity, connection, targetSwitch, recipientLabel, userSelect, userQuery, userSearch, contactAuth, query, search, select, more, note, refreshPreview, hint, attachmentsBox, preview, send); document.body.append(sendDialog);
  let snapshot, previewId, pageToken = '', searchGeneration = 0, previewGeneration = 0, previewTimer;
  function schedulePreview() { clearTimeout(previewTimer); previewGeneration++; previewId = null; send.disabled = true; send.textContent = '正在更新预览…'; previewTimer = setTimeout(() => prepare(), 250); }
  note.oninput = schedulePreview;
  async function loadChats(append = false) {
    if (sending) return;
    const id = ++searchGeneration; send.disabled = true;
    try {
      const s = await api('/api/feishu/status'); identity.textContent = (target === 'self' ? s.privateReady : s.ready) ? '发送身份：' + (s.botName || 'Threadline 机器人') + '（机器人）' : '请先开通机器人发送权限，并授权群列表。';
      if (id !== searchGeneration) return;
      targetReady = target === 'self' ? s.privateReady : s.ready;
      recipientLabel.textContent = target === 'self' ? '收件人：' + (userSelect.value === 'self' ? (s.userName || '当前飞书用户') + '（我）' : userSelect.selectedOptions[0].textContent) : '请选择已加入机器人的群聊';
      if (!targetReady) return;
      if (target === 'self') { send.disabled = !previewId; return; }
      const result = await api('/api/feishu/chats?q=' + encodeURIComponent(query.value.trim()) + '&page=' + encodeURIComponent(append ? pageToken : ''));
      if (id !== searchGeneration) return;
      if (!append) { select.replaceChildren(); select.add(new Option('请选择群聊', '')); }
      for (const c of result.chats) if (![...select.options].some(o => o.value === c.id)) select.add(new Option(c.name, c.id));
      pageToken = result.pageToken; more.hidden = !result.hasMore || !pageToken;
      if (!result.chats.length && !append) notify('没有找到可用群聊，请修改关键词。');
      send.disabled = !previewId || !hasTarget();
    } catch (e) { notify(e.message, 'error'); }
  }
  select.onchange = () => { send.disabled = !previewId || !hasTarget() || sending; };
  query.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); loadChats(); } };
  async function prepare() {
    if (sending) return; clearTimeout(previewTimer); const generation = ++previewGeneration; send.disabled = true; send.textContent = '正在更新预览…'; previewId = null; 
    try { const result = await post('preview', { ...snapshot, note: note.value, attachmentIDs: [...attachmentIDs] }); if (generation !== previewGeneration || !sendDialog.open) return; attachmentsBox.replaceChildren();
      if (result.attachments?.length) {
        attachmentsBox.append(node('p', '附件（勾选后上传；未选附件只注明未发送）'));
        for (const a of result.attachments) {
          const label = node('label', '', 'feishu-attachment'); const check = node('input'); check.type = 'checkbox'; check.checked = attachmentIDs.has(a.id); check.disabled = !a.available; check.dataset.available = String(a.available);
          check.onchange = () => { if (sending) return; if (check.checked) attachmentIDs.add(a.id); else attachmentIDs.delete(a.id); schedulePreview(); };
          const info = node('span', `第 ${a.ordinal} 条 · ${a.name} · ${a.available ? Math.ceil(a.size / 1024) + ' KB' : a.problem}`); info.title = a.path; label.append(check, info); attachmentsBox.append(label);
        }
        const s = await api('/api/feishu/status'); if (generation !== previewGeneration || !sendDialog.open) return; if (s.uploadPermissionUrl) attachmentsBox.append(button('一键申请图片 / 文件上传权限', () => attempt(async () => { await post('permissions', { kind: 'upload' }); await openConnection(); })), link('权限管理（备用）↗', s.uploadPermissionUrl));
      }
      preview.textContent = result.text; hint.textContent = `${result.count} 条消息 · 将发送 ${result.cardCount} 张折叠卡片 + ${result.fileCount || 0} 个文件。长消息分段保留原文。`; previewId = result.id; send.disabled = !hasTarget(); }
    catch (e) { if (generation === previewGeneration) notify(e.message, 'error'); }
    finally { if (generation === previewGeneration) { send.textContent = '发送'; send.disabled = !previewId || !hasTarget() || sending; } }
  }
  async function deliver() {
    if (sending || !previewId || !hasTarget()) return;
    sending = true; attachmentsBox.querySelectorAll('input').forEach(e => e.disabled = true); send.disabled = true; userSelect.disabled = userQuery.disabled = userSearch.disabled = note.disabled = select.disabled = query.disabled = true; send.textContent = '正在发送…';
    try {
      const receipt = await post('send', { previewId, target: target === 'self' && userSelect.value !== 'self' ? 'user' : target, userId: userSelect.value, ...(target === 'group' ? { chatId: select.value } : {}) });
      notify('已发送到「' + (target === 'self' ? userSelect.selectedOptions[0].textContent : select.selectedOptions[0].textContent) + '」，共 ' + receipt.sentCount + ' 张卡片。原来的消息选择仍然保留，可以继续“留下”。', 'success'); previewId = null;
    } catch (e) { notify(e.message, 'error'); }
    finally { sending = false; send.textContent = '发送'; attachmentsBox.querySelectorAll('input').forEach(e => e.disabled = e.dataset.available !== 'true'); userSelect.disabled = userQuery.disabled = userSearch.disabled = note.disabled = select.disabled = query.disabled = false; send.disabled = !previewId || !hasTarget(); }
  }
  sendDialog.addEventListener('close', () => { clearTimeout(previewTimer); previewGeneration++; });
  sendDialog.addEventListener('cancel', e => { if (sending) e.preventDefault(); });
  const sendSelected = button('发到飞书', async () => {
    if (!activeSession || !selectedMessages.size) return;
    const messages = activeSession.messages.filter(m => selectedMessages.has(m.id));
    snapshot = { threadID: activeSession.id, messageIDs: messages.map(m => m.id), fingerprints: Object.fromEntries(messages.map(m => [m.id, m.fingerprint])), includeProgress: $('include-progress').checked };
    attachmentIDs = new Set(); attachmentsBox.replaceChildren(); userSelect.replaceChildren(new Option('我（当前飞书用户）', 'self')); userQuery.value = ''; userSearchGeneration++; note.value = ''; preview.textContent = ''; select.replaceChildren(); query.value = ''; previewId = null;
    sendDialog.showModal(); changeTarget('self'); await prepare();
  }, 'tool');
  sendSelected.id = 'send-feishu'; sendSelected.disabled = true; $('save-session').before(sendSelected);
  const originalSelectionChanged = selectionChanged;
  selectionChanged = function() { originalSelectionChanged(); sendSelected.disabled = !selectedMessages.size || sessionLoading || sessionSaving; };
})();
