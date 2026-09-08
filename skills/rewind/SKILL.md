---
name: rewind
description: 在 Threadline 侧边栏打开当前 Codex 会话的消息选择页。用户说“留下当前讨论”“保存这几条回复”或使用 $rewind 时使用。
---

# 留下当前讨论

运行本 skill 下的 `scripts/current_session.py`。脚本从当前执行环境的 `CODEX_THREAD_ID` 生成 Threadline 链接，并按需启动已安装的本机服务。

使用脚本返回的 `url` 调用 `mcp__codex_app__open_in_codex`，target 为 browser，placement 为 right。在回复中也给出该链接，文字为“留下当前讨论”。页面自动打开当前会话的勾选界面，不需要用户再寻找会话或点击导入入口。

如果打开浏览器工具不可用，直接返回链接。如果没有当前会话 ID，说明不能确定当前会话；不要猜最近一条，也不要使用旧会话 ID。用户提供了明确的会话 ID 时，可通过 `--thread` 传给脚本。

默认只打开选择页，由用户勾选消息并保存；不要自行决定要保存哪些消息。此接入读取这台 Mac 的 Codex 本地会话，远程或云端会话没有本地记录时不可用。
