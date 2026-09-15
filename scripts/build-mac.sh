#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
swift build -c release --product Threadline
THREADLINE_APP="$PWD/dist/Threadline.app"
mkdir -p "$THREADLINE_APP/Contents/MacOS" "$THREADLINE_APP/Contents/Resources/updater" "$THREADLINE_APP/Contents/Frameworks" dist/Threadline.iconset
cp .build/release/Threadline "$THREADLINE_APP/Contents/MacOS/Threadline"
ditto .build/artifacts/sparkle/Sparkle/Sparkle.xcframework/macos-arm64_x86_64/Sparkle.framework "$THREADLINE_APP/Contents/Frameworks/Sparkle.framework"
cp updater/cli.mjs updater/runtime-update.mjs updater/service.mjs "$THREADLINE_APP/Contents/Resources/updater/"
cp updater/node-runtime.json "$THREADLINE_APP/Contents/Resources/node-runtime.json"
swift scripts/make-icon.swift "$PWD/dist/Threadline.iconset"
iconutil -c icns dist/Threadline.iconset -o "$THREADLINE_APP/Contents/Resources/ThreadlineGreen.icns"
swift scripts/make-menu-icon.swift "$THREADLINE_APP/Contents/Resources/MenuIcon.pdf"
python3 - <<'PY'
import json,plistlib,pathlib,os,urllib.parse
info={'CFBundleName':'Threadline','CFBundleDisplayName':'Threadline','CFBundleIdentifier':'local.rewind.app','CFBundleExecutable':'Threadline','CFBundlePackageType':'APPL','CFBundleShortVersionString':json.loads(pathlib.Path('package.json').read_text())['version'],'CFBundleVersion':os.getenv('THREADLINE_BUILD_NUMBER','9'),'CFBundleURLTypes':[{'CFBundleURLName':'Threadline Conversation','CFBundleURLSchemes':['threadline']}],'CFBundleIconFile':'ThreadlineGreen','LSMinimumSystemVersion':'13.0','NSHighResolutionCapable':True,'NSAppTransportSecurity':{'NSAllowsLocalNetworking':True},'SUEnableAutomaticChecks':False,'SUAutomaticallyUpdate':False,'SUAllowsAutomaticUpdates':False,'SUVerifyUpdateBeforeExtraction':True}
if not info['CFBundleVersion'].isdigit(): raise SystemExit('Build number must be an increasing integer')
saved=json.loads(pathlib.Path('updater/release-config.json').read_text()) if os.getenv('THREADLINE_DISABLE_UPDATES')!='1' else {}
feed=os.getenv('THREADLINE_SPARKLE_FEED_URL',saved.get('sparkleFeedURL','')); key=os.getenv('THREADLINE_SPARKLE_PUBLIC_KEY',saved.get('sparklePublicKey',''))
if bool(feed) != bool(key): raise SystemExit('Both Sparkle feed and public key are required')
if feed:
 if urllib.parse.urlparse(feed).scheme!='https': raise SystemExit('Sparkle feed must use HTTPS')
 info.update(SUFeedURL=feed,SUPublicEDKey=key)
runtime_feed=os.getenv('THREADLINE_RUNTIME_FEED_URL',saved.get('runtimeFeedURL','')); key_file=os.getenv('THREADLINE_RUNTIME_PUBLIC_KEY_FILE','')
runtime_key=pathlib.Path(key_file).read_text() if key_file else saved.get('runtimePublicKey','')
if bool(runtime_feed) != bool(runtime_key): raise SystemExit('Both runtime feed and public key file are required')
if runtime_feed and urllib.parse.urlparse(runtime_feed).scheme!='https': raise SystemExit('Runtime feed must use HTTPS')
config={'feedURL':runtime_feed,'publicKey':runtime_key,'minimumVersion':info['CFBundleShortVersionString']}
pathlib.Path('dist/Threadline.app/Contents/Resources/update-config.json').write_text(json.dumps(config))
with pathlib.Path('dist/Threadline.app/Contents/Info.plist').open('wb') as f:plistlib.dump(info,f)
PY
# Sign nested Sparkle executables from the inside out, preserving framework symlinks.
THREADLINE_SIGN_IDENTITY="${THREADLINE_SIGN_IDENTITY:--}" python3 - <<'PY'
import os,pathlib,subprocess
app=pathlib.Path('dist/Threadline.app'); framework=app/'Contents/Frameworks/Sparkle.framework'; base=framework/'Versions/B'
identity=os.environ['THREADLINE_SIGN_IDENTITY']
args=['codesign','--force','--sign',identity]
if identity!='-': args+=['--options','runtime','--timestamp']
for item in [base/'Autoupdate',base/'Updater.app',base/'XPCServices/Downloader.xpc',base/'XPCServices/Installer.xpc',framework,app]:
 subprocess.run(args+[str(item)],check=True)
PY
codesign --verify --deep --strict "$THREADLINE_APP"
