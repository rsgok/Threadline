#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - "$@" <<'PY'
import argparse, os, pathlib, shutil
parser = argparse.ArgumentParser(description='Install Threadline in one local agent runtime')
parser.add_argument('--runtime', choices=['codex', 'claude', 'pi', 'deepseek'], default='codex')
args = parser.parse_args()
home = pathlib.Path.home()
roots = {
    'codex': pathlib.Path(os.environ.get('CODEX_HOME', str(home / '.codex'))) / 'skills',
    'claude': pathlib.Path(os.environ.get('CLAUDE_CONFIG_DIR', str(home / '.claude'))) / 'skills',
    'pi': pathlib.Path(os.environ.get('PI_CODING_AGENT_DIR', str(home / '.pi' / 'agent'))) / 'skills',
    'deepseek': pathlib.Path(os.environ.get('DSH_HOME', str(home / '.dsh'))) / 'skills',
}
root = roots[args.runtime]
names = ['rewind', 'threadline'] if args.runtime == 'codex' else ['threadline']
for name in names:
    destination = root / name
    if destination.is_symlink():
        raise SystemExit('Refusing to overwrite a symlink: ' + str(destination))
    if destination.exists():
        existing = destination / 'SKILL.md'
        if not existing.exists() or not any(marker in existing.read_text() for marker in ['# 收藏当前会话', '# 留下当前讨论']):
            raise SystemExit('已存在其他 '+name+' skill，未覆盖。')
    shutil.copytree(pathlib.Path('skills') / name, destination, dirs_exist_ok=True)
    if name == 'threadline' and args.runtime != 'codex':
        body = '\n\n## 当前安装入口\n\n本 Skill 安装在 ' + args.runtime + ' 中。session、panel、open 命令必须使用 `--runtime ' + args.runtime + '`，不要沿用 Codex 的默认值\n'
        if args.runtime == 'claude':
            body += '\n当前 Claude Code 会话 ID：`${CLAUDE_SESSION_ID}`。将这个已展开的值显式传给 `--thread`；它是 Skill 模板替换值，不要假设 shell 中存在同名环境变量\n'
        else:
            body += '\n在 Agent 的 shell 工具中调用 `threadline open --runtime ' + args.runtime + '` 可使用 runtime 提供的当前会话 ID；没有 ID 时明确指定，不猜最近会话\n'
        with (destination / 'SKILL.md').open('a') as f:
            f.write(body)
    print('Installed:', destination)
PY
