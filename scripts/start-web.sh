#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
node -e 'require("node:sqlite")' || { printf "Threadline requires Node.js 22.13+ with node:sqlite.\n" >&2; exit 1; }
if [ ! -d node_modules/@larksuiteoapi/node-sdk ] || [ ! -d node_modules/qrcode ] || [ ! -d node_modules/playwright-core ] || [ ! -d node_modules/markdown-it ] || [ ! -d node_modules/@fontsource-variable/noto-sans-sc ] || [ ! -d node_modules/@fontsource/jetbrains-mono ]; then
  npm ci --omit=dev
fi
if curl -fsS http://127.0.0.1:43127/health 2>/dev/null | python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin).get("app")=="rewind-web" else 1)' 2>/dev/null; then
  printf 'Rewind is running: http://127.0.0.1:43127\n'
  exit 0
fi
if [ "$(uname)" = "Darwin" ]; then
  REWIND_NODE="$(command -v node)" REWIND_ROOT="$PWD" python3 - <<'PY'
import os, pathlib, plistlib, shutil
root = pathlib.Path.home()
folder = root / 'Library/LaunchAgents'
folder.mkdir(parents=True, exist_ok=True)
(root / 'Library/Logs').mkdir(parents=True, exist_ok=True)
app = root / 'Library/Application Support/RewindWeb/app'
app.mkdir(parents=True, exist_ok=True)
for name in ['thought-relations.mjs', 'thoughts-ui.js', 'i18n.js', 'i18n-catalog.js', 'sharing.mjs', 'sharing-ui.js', 'card-themes.mjs', 'card-renderer.mjs', 'card-worker.mjs', 'card-template.mjs', 'card-template.css', 'card-layout.js', 'sharing.css', 'session-assets.mjs', 'storage.mjs', 'server.mjs', 'index.html', 'ocr.swift', 'codex-sessions.mjs', 'cursor-sessions.mjs', 'threadline.css', 'buttons.css', 'threadline.js', 'feishu.mjs', 'feishu-ui.js', 'feishu.css']:
    shutil.copy2(pathlib.Path(os.environ['REWIND_ROOT']) / 'web' / name, app / name)
shutil.copytree(pathlib.Path(os.environ['REWIND_ROOT']) / 'plugins', app / 'plugins', dirs_exist_ok=True)
shutil.copytree(pathlib.Path(os.environ['REWIND_ROOT']) / 'web/assets', app / 'assets', dirs_exist_ok=True)
shutil.copytree(pathlib.Path(os.environ['REWIND_ROOT']) / 'node_modules', app / 'node_modules', dirs_exist_ok=True)
config = {
    'Label': 'local.rewind.web',
    'ProgramArguments': [os.environ['REWIND_NODE'], str(app / 'server.mjs')],
    'WorkingDirectory': str(app),
    'RunAtLoad': False,
    'KeepAlive': False,
    'StandardOutPath': str(root / 'Library/Logs/RewindWeb.log'),
    'StandardErrorPath': str(root / 'Library/Logs/RewindWeb.log'),
}
with (folder / 'local.rewind.web.plist').open('wb') as f:
    plistlib.dump(config, f)
PY
  REWIND_DOMAIN="gui/$(id -u)"
  if launchctl print "$REWIND_DOMAIN/local.rewind.web" >/dev/null 2>&1; then
    launchctl bootout "$REWIND_DOMAIN/local.rewind.web"
  fi
  launchctl bootstrap "$REWIND_DOMAIN" "$HOME/Library/LaunchAgents/local.rewind.web.plist"
  launchctl kickstart "$REWIND_DOMAIN/local.rewind.web"
  printf 'Rewind started: http://127.0.0.1:43127\n'
else
  exec node web/server.mjs
fi
