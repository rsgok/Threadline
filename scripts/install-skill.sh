#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - <<'PY'
import os, pathlib, shutil
root = pathlib.Path(os.environ.get('CODEX_HOME', str(pathlib.Path.home() / '.codex'))) / 'skills'
for name in ['rewind', 'threadline']:
    destination = root / name
    if destination.exists():
        existing = destination / 'SKILL.md'
        if not existing.exists() or not any(marker in existing.read_text() for marker in ['# 收藏当前会话', '# 留下当前讨论']):
            raise SystemExit('已存在其他 '+name+' skill，未覆盖。')
    shutil.copytree(pathlib.Path('skills') / name, destination, dirs_exist_ok=True)
    print('Installed:', destination)
PY
