#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/start-web.sh
swift build -c release --product Threadline
THREADLINE_APP="$PWD/dist/Threadline.app"
mkdir -p "$THREADLINE_APP/Contents/MacOS" "$THREADLINE_APP/Contents/Resources" dist/Threadline.iconset
cp .build/release/Threadline "$THREADLINE_APP/Contents/MacOS/Threadline"
swift scripts/make-icon.swift "$PWD/dist/Threadline.iconset"
iconutil -c icns dist/Threadline.iconset -o "$THREADLINE_APP/Contents/Resources/Threadline.icns"
cp dist/TrayIcon.png "$THREADLINE_APP/Contents/Resources/TrayIcon.png"
python3 - <<'PY'
import plistlib,pathlib
info={'CFBundleName':'Threadline','CFBundleDisplayName':'Threadline','CFBundleIdentifier':'local.rewind.app','CFBundleExecutable':'Threadline','CFBundlePackageType':'APPL','CFBundleShortVersionString':'0.3.0','CFBundleVersion':'3','CFBundleIconFile':'Threadline','LSMinimumSystemVersion':'13.0','NSHighResolutionCapable':True,'NSAppTransportSecurity':{'NSAllowsLocalNetworking':True}}
with pathlib.Path('dist/Threadline.app/Contents/Info.plist').open('wb') as f:plistlib.dump(info,f)
PY
codesign --force --deep --sign - "$THREADLINE_APP"
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
shutil.copytree('dist/Threadline.app',apps/'Threadline.app')
print('Installed:',apps/'Threadline.app')
PY
codesign --verify --deep --strict "$HOME/Applications/Threadline.app"
