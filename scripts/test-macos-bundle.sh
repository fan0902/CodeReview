#!/usr/bin/env bash
set -euo pipefail
app_path="${1:?CR.app path required}"
test -x "$app_path/Contents/MacOS/CR"
test -x "$app_path/Contents/Resources/runtime/node"
test -f "$app_path/Contents/Resources/server/main.js"
test -f "$app_path/Contents/Resources/web/index.html"
test -f "$app_path/Contents/Resources/node_modules/pyright/langserver.index.js"
test -s "$app_path/Contents/Resources/CR.icns"
icon_name="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIconFile' "$app_path/Contents/Info.plist")"
test "$icon_name" = "CR"
if /usr/libexec/PlistBuddy -c 'Print :LSUIElement' "$app_path/Contents/Info.plist" >/dev/null 2>&1; then
  echo "CR must be a regular Dock application" >&2
  exit 1
fi
plutil -lint "$app_path/Contents/Info.plist"
codesign --verify --deep --strict "$app_path"
