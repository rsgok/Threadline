# Threadline · 思续

把想清楚的，带到下一次。保留 AI 对话中的进展、判断和原文，再带回下一次讨论。

## 两种使用方式

- **Runtime 侧边栏**：选择本机 Codex 会话，勾选消息，留下进展。页面可见时每 5 秒检查更新。
- **Mac App**：两栏资料库，左侧搜索和筛选，右侧阅读、编辑和组合笔记；左栏可折叠、拖动调宽。

支持 Markdown、引用评论、本地图片预览和文件定位。保存时携带消息来源、项目与工作目录（能够识别时）。思路是可选的组织方式；“接着用”可组合多篇笔记，复制给下一次 AI 对话。

## 运行

需要 macOS 13+、Swift 5.9+ 和 Node.js 22.13+。Mac App 使用系统 WebKit，当前依赖本机 Node 环境，不是包含全部依赖的独立分发包。

```sh
# 启动本地 Web 服务
bash scripts/start-web.sh

# 构建并安装到 ~/Applications/Threadline.app
bash scripts/install-mac.sh

# 安装 Codex 技能
bash scripts/install-skill.sh
```

Web 入口：<http://127.0.0.1:43127>。`?panel=1` 使用侧边栏布局；`?native=1` 使用桌面布局；`thread=<Codex 会话 UUID>` 定位来源会话。

在 Codex 使用 `$threadline` 打开对应会话。Mac App 也支持打开 Codex 侧栏；Cursor Agents 当前通过复制链接到其 Browser 使用，不会自动读取 Cursor 会话。

## 本地数据

- 为兼容早期版本，数据目录保留为 `~/Library/Application Support/RewindWeb`。
- `library.sqlite` 使用 Node 内置 SQLite 按条保存笔记和思路；`attachments/` 保存手动上传的图片。
- 首次启动在事务中迁移旧 `library.json`、`threads.json`，原文件保持不变，作为迁移前备份。迁移完成后不再读写旧 JSON；迁移失败会回滚并停止启动。
- SQLite 使用 WAL 日志。备份当前资料时先停止服务，再复制整个数据目录（运行中不要只复制 `.sqlite` 文件）。旧 JSON 不包含迁移后的修改。
- 搜索在数据库中执行，保持中文、Unicode 规范化和多词子串匹配；当前列表接口仍返回匹配笔记全文，尚未分页。
- 会话引用的本地文件与远程图片只保存引用，不复制文件；原文件失效会影响预览。
- 删除笔记直接删除记录，没有回收站；引用的原始文件不受影响。
- 组合草稿保存在当前标签页的 sessionStorage。
- 安装脚本会归档旧应用包，保留用户笔记数据。

## 开发与验证

```sh
npm test
swift test
swift build -c release --product Threadline
```

`web/` 包含本地 HTTP 服务、Codex 记录读取及网页界面；`Sources/Threadline/` 是当前 Mac 外壳；`Sources/Rewind/` 和 `Sources/RewindCore/` 保留早期原型与兼容代码；`skills/` 和 `scripts/` 提供技能及本机安装工具。

运行中的服务使用安装副本。修改网页后通过以下命令重新部署：

```sh
bash scripts/stop-web.sh
bash scripts/start-web.sh
```

刷新页面或重启 Mac App 即可加载新版本。开发截图、导出记录和构建产物不纳入版本控制。

### 分享到飞书

在会话里勾选消息后，可以选择「留下」或「发到飞书」。默认私聊发给当前用户，也可搜索选择同事或切换群聊。预览后点击「发送」才会实际投递。

首次点击「连接飞书」：

1. 选择「扫码创建专属应用」，通过飞书官方 SDK 创建自己的应用；也可填写已有应用的 App ID / Secret。
2. 接续用户授权，申请 用户权限 `im:chat:read`、`offline_access`，以及应用权限 `im:message:send_as_bot`；搜索同事时按需授权 `contact:user:search`。若企业需要审批，先完成权限开通和发布。
3. 授权完成后，可验证群列表，再回到消息选择器发送。

本版需要本机安装 `lark-cli`。每个 Threadline 数据目录使用独立的 `threadline-…` CLI profile，凭证由 CLI 管理（macOS 使用其配置的凭证存储），不会读取 Peer profile 作为替代。`feishu.json` 只保存 App ID 和 profile 名称；Threadline 网页不接收应用密钥或用户 token 的回传。绑定已有应用时，用户输入的密钥通过本地服务与子进程 stdin 传递。可通过 `THREADLINE_LARK_CLI` 指定 CLI 可执行文件。

以机器人身份发送折叠卡片，群聊需要先加入机器人。最多 100 条消息、2 MB 内容；每张最多 8 个面板、约 24 KB，最多 100 张。超长单条分段，不截断原文。附件默认不选：预览列出文件名、大小和可用性，勾选后图片嵌入对应消息，文件在卡片后单独发送。上传需应用权限 `im:resource`。图片上限 10 MB，普通文件上限 20 MB，总量 100 MB；最多 50 个附件、每条消息最多 8 张图片。预览后文件变化会阻止发送，缺失、空文件和符号链接不可选。上传和文件发送分别缓存回执。预览显示卡片数，有效 20 分钟；逐张记录回执，失败后保持当前预览重试，跳过已成功卡片。预览及回执仅保存在内存中，服务重启后不可继续原预览。断开本机连接会退出该 profile 的用户登录态，不删除远端应用或撤销服务端授权。

开发运行前先执行 `npm ci`。安装脚本会同步 Node 依赖到本机服务目录。扫码创建、企业审批及用户发送权限仍需用真实账号验收；自动化测试使用隔离的模拟飞书服务，不会向群聊投递测试消息。

## Agent runtime：Skill + CLI

```sh
bash scripts/install-cli.sh    # ~/.local/bin/threadline；可设 THREADLINE_BIN_DIR
bash scripts/install-skill.sh  # Codex skill
export PATH="$HOME/.local/bin:$PATH"
threadline health
threadline list --query '设计判断'
threadline save --title '本次进展' --file ./progress.md --source 'Agent Runtime'
threadline get NOTE_UUID
```

CLI 只需 Python 3，无第三方依赖，也可直接执行 `python3 skills/threadline/scripts/threadline.py`。将整个 `skills/threadline` 目录复制到其他 runtime 的 skill 目录即可使用。服务仍需按上文启动；CLI 与 UI 共用 HTTP API 和资料库，不直接操作 SQLite。默认地址可用 `THREADLINE_URL` 或全局 `--url` 覆盖，仅接受 loopback HTTP。远程 runtime 需配置 SSH 隧道，或自行部署本地服务；本机 Codex 导入读取服务端机器的记录。

支持 `health`、`panel`、`list`、`get`、`save`、`update`、`delete`、`export`、`sessions`、`session`、`import`、`topics`、`topic-create`。运行 `threadline COMMAND --help` 查看参数。除 help 外 stdout 输出 JSON，错误 JSON 写 stderr；退出码 0 成功、2 参数错误、1 执行失败。更新必须提供 `get` 返回的 `version`；导入必须提供 `session` 输出的快照文件和明确的消息 ID，服务校验指纹并去重。普通保存不幂等，超时后先查询确认再决定是否重试。导出 ZIP 不覆盖已有文件。

笔记支持 `outdated`（已过时）和 `updated`（已更新）标记，必须填写原因。阅读页可以标记并查看历史，CLI 使用 `threadline mark NOTE_UUID --version VERSION --status outdated --reason '新事实与依据'`。原文不被覆盖，每次标记追加时间和原因；资料复用与导出携带当前状态。`updated` 需在原因中说明更正结论或已完成的修订，不代表整篇笔记全面核验。已有笔记无需迁移，未标记也不代表已确认有效。
