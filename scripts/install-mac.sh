#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/start-web.sh --restart
bash scripts/build-mac.sh
# Preserve the previous native prototype as an archive before replacing its app bundle.
python3 - <<'PY'
import pathlib,shutil,datetime
root=pathlib.Path.home();apps=root/'Applications';apps.mkdir(exist_ok=True)
for name in ['Rewind.app','Threadline.app']:
 old=apps/name
 if old.exists():
  backups=root/'Library/Application Support/RewindWeb/app-backups';backups.mkdir(parents=True,exist_ok=True)
  archive=backups/(name.removesuffix('.app')+'-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S'))
  shutil.make_archive(str(archive),'zip',apps,name)
  shutil.rmtree(old)
shutil.copytree('dist/Threadline.app',apps/'Threadline.app',symlinks=True)
print('Installed:',apps/'Threadline.app')
PY
codesign --verify --deep --strict "$HOME/Applications/Threadline.app"
