#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
output_app="$repo_root/outputs/CR.app"
contents="$output_app/Contents"
if [[ "$output_app" != "$repo_root/outputs/CR.app" ]]; then
  echo "Unexpected output path" >&2
  exit 1
fi
arch -arm64 npm run build --prefix "$repo_root"
arch -arm64 swift build -c release --package-path "$repo_root/launcher"
mkdir -p "$contents/MacOS" "$contents/Resources/runtime" "$contents/Resources/server" "$contents/Resources/web" "$contents/Resources/packages"
ditto "$repo_root/launcher/.build/release/CR" "$contents/MacOS/CR"
node_binary="$(arch -arm64 /bin/zsh -c 'command -v node')"
ditto "$node_binary" "$contents/Resources/runtime/node"
ditto "$repo_root/apps/server/dist" "$contents/Resources/server"
ditto "$repo_root/apps/web/dist" "$contents/Resources/web"
ditto "$repo_root/node_modules" "$contents/Resources/node_modules"
ditto "$repo_root/packages/contracts" "$contents/Resources/packages/contracts"
for workspace_link in web server; do
  if [[ -L "$contents/Resources/node_modules/@cr/$workspace_link" ]]; then
    unlink "$contents/Resources/node_modules/@cr/$workspace_link"
  fi
done
ditto "$repo_root/resources/CR.icns" "$contents/Resources/CR.icns"
ditto "$repo_root/resources/Info.plist.in" "$contents/Info.plist"
xattr -cr "$output_app"
codesign --force --deep --sign - "$output_app"
bash "$repo_root/scripts/test-macos-bundle.sh" "$output_app"
du -sh "$output_app"
