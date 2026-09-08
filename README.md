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
