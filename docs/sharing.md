# 分享讨论

在收录页勾选消息，点击「分享」。先选择一种方式，再进入对应的内容或收件人页面；每页仅保留对应的主操作。附言与附件变化后自动更新预览，全文预览默认折叠；返回更换方式时保留附言和附件选择。只有点击确认发送按钮才会向平台投递。

## 复制、图卡与附件

- 「复制文字」保留正文和角色，Markdown 中的本机文件链接替换为可读标签。
- 「保存文件」中的「下载文字与附件」下载 ZIP，包含 discussion.md 和所选附件。不需要先创建笔记。
- 「生成图卡」目前使用自定义 Canvas 绘制，尚未接入 Playwright 或独立 Chromium 运行时，保留代码换行，按原文位置嵌入所选本地图片。长内容分页，页码标明顺序。下载 PNG 图卡 ZIP；支持剪贴板图片的浏览器在单页时提供复制图卡。
- 未选附件不上传、不导出；远程图片不自动下载。可将文字、图卡和附件手动分享到微信、WhatsApp 等应用。
- 一次最多 100 条消息、50 个附件；正文上限 2 MB，附件总量 100 MB。导出及 Slack 单文件上限 25 MB，Discord 保守限制为 8 MB。平台自身更低的限制仍然适用。

## Slack

在分享弹窗选择 Slack，打开「连接与设置」。

1. 在 https://api.slack.com/apps 创建应用，配置 Bot Token Scopes：chat:write、files:write。
2. 若需要列出机器人已加入的频道，增加 channels:read、groups:read；发送私聊增加 im:write。权限变更后重新安装应用。
3. 将 Bot User OAuth Token（xoxb-…）填入 Threadline，点击验证并保存。配置仅保存在本机 sharing/connections.json，文件权限为 0600；不会在状态接口返回凭证。
4. 将机器人加入目标频道。加载频道或填写频道 ID；可填写成员 ID 发送获准的机器人私聊。
5. 使用「发给自己」前，在设置中填写自己的 Slack 成员 ID。可在 Slack 个人资料的更多菜单复制成员 ID。

首版通过用户自行创建的 Slack 应用连接，不包含托管 OAuth 安装服务。文字以机器人身份发送；图片和文件使用 Slack external upload 流程，按顺序单独发送。

## Discord

在目标频道的「编辑频道 → 整合 → Webhook」创建 Webhook，将官方 discord.com 地址填入连接设置。验证时读取 Webhook 身份和频道，不发送测试消息。分享预览显示固定目标频道。

文字与附件按顺序发送。消息禁用自动提及，避免原文中的 @everyone 等内容意外通知全体成员。使用 wait=true 获取消息回执。

## 发送记录与重试

Slack、Discord 的预览、所选附件副本和分段回执保存在本机 sharing/ 目录。24 小时内可继续发送；重启后从「分享记录」恢复，已成功部分不重发。列表显示最近 30 条实际开始发送的记录。

网络超时、平台返回不确定错误或上次发送时进程中断，会显示「送达状态未知」。用户需到目标应用核对该部分，选择「确认已送达」或「确认未送达」，再继续。平台无统一的 exactly-once 保证，不能将未收到回执视为未发送。

预览时复制所选附件，发送使用该副本，因此原文件之后变化不会改变预览内容。变更连接后，旧的未完成分享要求重新预览，防止发送到其他账号或频道。未开始发送的过期预览，在下次预览时清理；已开始的记录保留。

飞书沿用既有连接、收件人和折叠卡片发送流程，统一分享入口会带入附言和附件选择。飞书现有预览有效期及重试方式见 README；本次的持久分享记录适用于 Slack、Discord。

## 验证与范围

自动化测试使用隔离的 HTTP 模拟响应，覆盖上传、部分失败、重启恢复、不确定送达、并发发送、凭证变更、附件限制与 ZIP 导出。UI 用隔离示例会话验收，包括代码、图片、文件、图卡分页和飞书预览传递。真实 Slack/Discord 租户的授权、管理员限制及实际送达尚需凭证验收。

本版不包含企业微信、钉钉、Telegram、公开平台发帖、定时群发及托管分享网页。

官方接口参考：
- https://docs.slack.dev/reference/methods/chat.postMessage/
- https://docs.slack.dev/reference/methods/files.getUploadURLExternal/
- https://docs.slack.dev/reference/methods/files.completeUploadExternal/
- https://docs.discord.com/developers/resources/webhook
