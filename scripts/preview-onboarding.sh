#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
preview="$PWD/dist/Threadline Tour Preview.app"
mkdir -p "$preview/Contents/MacOS" "$preview/Contents/Resources/onboarding"
swiftc -parse-as-library Sources/Threadline/PreparationView.swift Tests/native/OnboardingPreview.swift -o "$preview/Contents/MacOS/TourPreview"
cp web/assets/onboarding/*.png "$preview/Contents/Resources/onboarding/"
cat > "$preview/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>local.threadline.tour-preview</string>
<key>CFBundleName</key><string>Threadline Tour Preview</string>
<key>CFBundleExecutable</key><string>TourPreview</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
echo "$preview"
