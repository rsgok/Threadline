# 验证记录

## Web 版（当前主入口）

- 当前会话入口：调用环境实测提供 `CODEX_THREAD_ID`，helper 输出对应的 `?thread=...&view=import` 链接，Codex 侧边栏直接显示“设计回复收藏工具”的消息选择器，无需另选会话。
- 在浏览器勾选当前会话第一条用户问题和第一条正式回答，成功创建“验收 · Rewind 最初的产品讨论”；完整文字、顺序和来源标识均保留。
- 增加会话过滤、注解还原、部分 JSONL 行、fork 隔离、快照变化及去重测试后，`npm test` 共 9 项通过。
- `rewind` skill 已安装到 `~/.codex/skills/rewind`，quick_validate 通过；helper 使用当前环境 ID 实测通过。新会话中技能自动发现尚需由 Codex 加载，当前任务目录不会凭空刷新。

- 2026-09-08：`npm test` 的 5 项集成测试通过，涵盖 CRUD、备注搜索、持久化、多页面版本冲突、可恢复删除、图片、导出、跨站拦截、损坏数据和一次性旧版导入。
- 在 Codex 内置浏览器实际完成粘贴收藏、编辑备注及原问题、自动保存、复制给 AI；读取浏览器剪贴板确认包含完整原文和上下文。
- 服务通过 macOS launchd 独立运行。停止任务内开发进程后，正式服务健康接口通过，网页刷新后收藏和修改仍然存在。
- 导出实际 ZIP 使用 Python zipfile 校验 CRC 完整性，确认同时包含 Markdown 和图片附件。
- 来源应用改为手动选择，避免原型中根据前台应用推测来源的误识别。
- 在 Codex 内置浏览器验证 560 × 820 的窄侧栏：单栏阅读、返回列表、按备注关键词搜索均通过。
- 在 Web 收藏框选取 PNG 并保存，正式后台服务的 Vision 识别成功，网页自动显示识别结果和原图缩略图。浏览器控制台没有错误日志。
- 交付截图位于 `artifacts/web/`；默认宽屏及窄侧栏均为真实操作截图。

## 早期 macOS 原型

环境：2026-09-08，Apple Silicon Mac，Swift 6.2.4。

- `swift test`：持久化、关键词搜索、删除、代码和附件导出、损坏数据保护、写入失败不发布状态、长 Unicode 标题导出。
- Release 应用构建和本机临时签名通过。
- 原生应用界面实测：剪贴板文字收藏、备注和原文自动保存、退出再启动保留内容、无结果搜索及恢复匹配、复制给 AI 后再收藏验证完整输出、系统目录选择器导出及文件内容检查。
- 图片界面实测：在预览中复制生成的 PNG，收藏后保留原图，Vision 成功识别三行英文并写入收藏正文。
- 应用前台的 Control + Option + S / R 组合键已通过 UI 自动化验证。系统全局热键注册成功，但自动化注入事件不会经过系统热键分发器，因此未据此宣称验证了用户从其他应用按实体键盘唤起的行为。
- 未验证：其他 Mac 上的签名分发、真实 Codex/Cursor 的所有剪贴板格式、中英文混排截图的识别准确率。富文本降级为文字，OCR 需核对原图。

测试生成物位于 `.build/`，不提交到源码。首次交付机器的收藏库中保留一条明确标记的使用示例。


## Threadline 思续工作区 · 2026-09-08

- 新增思路创建、问题修改、笔记归属持久化及并发版本检查。
- 本会话真实定位与命名讨论已归入“Threadline · 产品方向”；旧需求笔记经 UI 归入同一思路，完整原文保留。
- 实际在浏览器组合两篇笔记，填写下一步任务，点击复制并读取剪贴板核对：任务、思路背景、备注、原文、来源完整。
- 原有数据目录和启动服务 ID 保留兼容；产品页面采用 Threadline 品牌。
- 自动测试覆盖 11 项：原有链路、新思路数据、归属校验、过期写入拒绝、去除环境注入包装。


## Mac 应用更新 · 2026-09-08

- Threadline release 编译成功；本机 ad-hoc 签名与严格校验通过。
- 安装到 ~/Applications/Threadline.app，保留旧 bundle id 以兼容系统记录；旧应用包先 ZIP 归档。
- 实际原生窗口加载当前思路和笔记；两篇组合的复制操作成功，导出弹出 NSSavePanel（取消验收，不额外保存文件）。
- 退出应用并停止本机服务，再启动应用，自动 kickstart 服务并成功加载工作区。
- Dock icns 与菜单栏 PNG 由网页同款曲线路径生成。

## 2026-09-08 Native Codex sidebar handoff
- Installed Mac app includes “在 Codex 侧栏打开” in the page and tray menu.
- Uses the installed Codex app's `codex://browser?url=...` handler. Preserves the selected note/topic; flushes edits before handing off. Does not send a chat message.
- Native message handler accepts main-frame localhost:43127 URLs only. No external command execution or arbitrary protocol bridge.
- Release Swift build and all 11 Node tests pass; installed bundle signature verified.
- Clicked from the native app on a selected note. Codex's browser-sidebar-manager log confirmed right-panel creation and dom-ready for that exact note URL. Its conversation context was a client-new-thread placeholder, so targeting a specific existing active task is not established by this check. Native Codex UI inspection was denied by Computer Use; visual acceptance remains unverified.
- This external route does not return the active Codex task ID. `$threadline` remains the exact task-aware import entry. No recent-session heuristic is used.

## 2026-09-08 Explicit panel mode and Cursor Agents correction
- `panel=1` promotes the existing panel CSS media rules independently of viewport width. Native Codex handoff and installed threadline/rewind skill helpers include the flag.
- Codex in-app browser verified the panel header, tabs, hidden nested sidebar, and note reader. Cursor Agents' Browser panel loaded the same local app next to the selected Starling document update conversation; captured artifacts/threadline/09-cursor-agents-panel.png.
- An initial IDE webview extension was the wrong surface. Removed its source, VSIX, installation script, and uninstalled threadline.threadline. Reverted the temporary frame-ancestor exception; server retains X-Frame-Options DENY.
- Cursor Mac handoff now explicitly copies the URL and focuses Agents via cursor://anysphere.cursor-deeplink/glass. It does not claim automatic Browser navigation. Browser URL routing is absent from the inspected installed Agents deep-link handler. No Cursor chat ingestion was implemented.
- Updated native app installed and signed. All 11 server tests pass.

## Thinking-first panel refactor
- Removed four-tab navigation from panel rendering. Topic chooser leads to a question, personal judgments, and expandable source discussions. Search and unassigned notes are secondary entry points.
- Note reader derives its back link from the note's topic. Import and paste default to the selected topic.
- Browser verified panel tabs hidden, import topic preselected, and selected evidence carried into the reuse dialog.
- Uses existing notes and remarks; does not fabricate conclusions or introduce a judgment-history data model.

## Capture-first sidebar
- Panel opens directly to session choice, or message selection when a thread ID is supplied. Unreadable sessions fall back to choice.
- Lists six recent sessions initially; search, more, and last readable message previews aid identification. Recency is not treated as the active task.
- Browser verified selecting this task loads 49 messages, scrolls to the newest message, stores selected thread in URL, and keeps optional title/remark/topic fields collapsed.
- Panel import success keeps the picker open, clears selection, and offers a note link; library remains a secondary exit. Mac handoff requests import view by default.
- All 11 server tests passed. Web assets deployed to the installed local service.

## doany-inspired visual refresh
- Inspected https://doany.ai/ visually: warm paper, bold black type, yellow accent, outlined controls and offset shadows.
- Applied to session chooser, message selection and optional details; added compact Threadline wordmark. Kept capture-first navigation and readable long-message text.
- Browser inspected chooser and message page. Updated installed web assets; no data model changes.
