#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
node -e 'require("node:sqlite")' || { printf "Threadline requires Node.js 22.13+ with node:sqlite.\n" >&2; exit 1; }
if [ ! -d node_modules/@react-router/dev ]; then
  npm ci
fi
npm run build
if curl -fsS http://127.0.0.1:43127/health 2>/dev/null | python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin).get("app")=="rewind-web" else 1)' 2>/dev/null; then
  if [ "${1:-}" != "--restart" ]; then
    printf 'Rewind is running: http://127.0.0.1:43127\n'
    exit 0
  fi
  # The new native bridge and frontend must be installed together.
  launchctl bootout "gui/$(id -u)/local.rewind.web"

fi
if [ "$(uname)" = "Darwin" ]; then
  node scripts/package-runtime.mjs "$HOME/Library/Application Support/RewindWeb/app"
  REWIND_NODE="$(command -v node)" REWIND_ROOT="$PWD" python3 - <<'PY'
import os, pathlib, plistlib
root = pathlib.Path.home()
folder = root / 'Library/LaunchAgents'
folder.mkdir(parents=True, exist_ok=True)
(root / 'Library/Logs').mkdir(parents=True, exist_ok=True)
app = root / 'Library/Application Support/RewindWeb/app'
app.mkdir(parents=True, exist_ok=True)
config = {
    'Label': 'local.rewind.web',
    'ProgramArguments': [os.environ['REWIND_NODE'], str(app / 'web/server.mjs')],
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
