<p align="center">
  <img src="web/assets/threadline-icon.png" width="96" height="96" alt="Threadline 图标">
</p>

<h1 align="center">Threadline · 思续</h1>

<p align="center"><strong>思续，让思考继续</strong></p>

<p align="center">
  为 AI 对话中的想法、判断和上下文，留一个本地的家<br>
  留下值得保留的内容，加入自己的理解，再带回下一次讨论
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#如何使用">如何使用</a> ·
  <a href="docs/agent-runtime.md">Agent 集成</a> ·
  <a href="#文档">文档</a> ·
  <a href="https://github.com/rsgok/Threadline/issues">问题反馈</a>
</p>

<p align="center"><a href="README.md">English</a> · <strong>简体中文</strong></p>

<p align="center"><sub>macOS 13+ · 本地存储 · Codex 与 Cursor · 早期开发阶段</sub></p>

![Threadline 当前 Mac 界面：选择对话中值得保留的消息，收录到本地资料库](web/assets/landing-collect.png)

<p align="center"><sub>当前应用的真实界面，使用示例对话展示</sub></p>

## 为什么做 Threadline？

一次 AI 对话可能推动很多工作：确定一个设计判断、理解一个复杂问题，或终于找到值得继续的方向。但下一次讨论开始时，我们常常又要翻历史、找原文，把背景重新解释一遍

Threadline 让这些进展可以继续积累。把值得保留的消息连同上下文留下来，补上自己的理解，再把相关笔记带进下一次讨论

它与你的 AI 工具一起工作。哪些内容进入资料库，哪些判断值得继续，由你决定

## 如何使用

### 1. 留下有用的部分

浏览本机的 **Codex** 和 **Cursor Agent** 会话，选择具体消息，保存原文、来源引用，以及能够识别的项目上下文。支持的本地图片和文件可以随笔记一起保存副本

### 2. 加入自己的思考

阅读原文，补上自己的判断，把相关笔记组织成思路。需要回到某个决定时，搜索资料库即可找到它。理解发生变化后，可以把笔记标记为已过时或已更新，并记录原因

### 3. 让下一次讨论接着往前走

组合多篇笔记，复制到下一次 AI 对话。也可以导出 Markdown 和附件，把所选消息生成图卡，或通过飞书、Slack、Discord 分享讨论

<details>
<summary><strong>查看笔记阅读界面</strong></summary>

![Threadline 笔记阅读界面，包含对话原文、个人理解和继续使用笔记的入口](web/assets/landing-library.png)

</details>

## 融入你的工作方式

| 能力 | 可以做什么 |
| --- | --- |
| **Mac App** | 使用双栏资料库阅读、编辑笔记，折叠或拖动调整侧栏宽度 |
| **Runtime 侧栏** | 在当前 AI 对话旁打开 Threadline，随时留下进展 |
| **保留上下文** | 保存消息原文、来源引用，以及能够识别的项目资料 |
| **本地资料库** | 在 Mac 上保存笔记和附件副本，导出包含 Markdown 的 ZIP |
| **分享讨论** | 复制文字、导出文件和 PNG 图卡，或发送到已连接的平台 |
| **Skill + CLI** | 让 Agent 通过同一个本地服务保存、查找和复用笔记 |

应用支持英文和简体中文。首次使用跟随系统语言，也可以在「设置」中手动选择

## 快速开始

Threadline 当前通过**源码安装**。Mac App 依赖本机的 Node.js 环境，暂未提供独立安装包

### 环境要求

- **macOS 13 或更高版本**
- **Node.js 22.13 或更高版本**及 npm
- **Swift 5.9 或更高版本**，可通过 Xcode 或 Xcode Command Line Tools 安装
- **Python 3**，供安装脚本和可选 CLI 使用

### 安装 Mac App

```sh
git clone https://github.com/rsgok/Threadline.git
cd Threadline
npm ci
bash scripts/install-mac.sh
open "$HOME/Applications/Threadline.app"
```

安装脚本会启动本地服务、构建应用，并安装到 `~/Applications/Threadline.app`。也可以通过 [127.0.0.1:43127](http://127.0.0.1:43127) 打开网页界面

### 在 Codex 中使用

```sh
bash scripts/install-skill.sh
```

新建一个 Codex 会话，使用 `$threadline` 为当前讨论打开 Threadline。CLI 配置和其他 Agent Runtime 的接入方式见 [Agent 集成指南](docs/agent-runtime.md)

### 收录第一段对话

1. 打开「收录会话」，选择一条本机 Codex 或 Cursor 对话
2. 勾选值得保留的消息，点击「记录」
3. 打开保存的笔记，补上自己的理解，准备继续讨论时点击「接着用」

## 数据保存在你的 Mac 上

资料库位于 `~/Library/Application Support/RewindWeb`，目录名称为兼容早期版本而保留

- 笔记和思路存储在本机 SQLite 数据库中
- 能够识别的本地附件可以保存副本，远程图片保留链接
- 只有确认发送后，才会向已连接的平台分享内容
- ZIP 导出包含 Markdown 和已保存附件，方便在应用之外继续使用

存储结构、附件限制和迁移方式见 [本地数据与备份](docs/local-data.md)

## 当前支持范围

- 会话收录读取 **Codex 和 Cursor Agent 的本机记录**，不下载云端历史，也不恢复旧版 Cursor IDE 数据库
- Mac App 当前需要从源码构建，并依赖已安装的 Node.js
- PNG 图卡首次生成时下载 Chromium 排版组件，安装后在本机完成渲染
- 飞书、Slack、Discord 需要分别配置连接；飞书还需要本机安装 `lark-cli`

## 文档

| 指南 | 内容 |
| --- | --- |
| [Agent 集成（英文）](docs/agent-runtime.md) | 安装 CLI 和 Skill，接入其他 Runtime，保存和复用笔记 |
| [本地数据与备份（英文）](docs/local-data.md) | 存储、导出、附件处理与备份 |
| [开发指南（英文）](docs/development.md) | 从源码运行、验证改动与项目结构 |
| [分享指南](docs/sharing.md) | 平台连接、图卡、大小限制与重试机制 |
| [界面语言（英文）](docs/i18n.md) | 语言设置和翻译约定 |

## 参与贡献

欢迎提交问题、使用反馈和范围明确的 Pull Request。[创建 Issue](https://github.com/rsgok/Threadline/issues) 时，请描述预期行为、实际结果和复现步骤，并使用示例对话说明问题

修改应用前，请先阅读 [AGENTS.md](AGENTS.md) 和[开发指南](docs/development.md)。调整产品说明或安装步骤时，请同步维护中英文 README

## 许可证

Threadline 采用 [Apache License 2.0](LICENSE) 许可证，第三方依赖保留各自的许可证
