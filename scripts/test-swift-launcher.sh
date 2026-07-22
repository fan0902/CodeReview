#!/usr/bin/env bash
set -euo pipefail

developer_dir="$(xcode-select -p)"
framework_dir="$developer_dir/Library/Developer/Frameworks"

DYLD_FRAMEWORK_PATH="$framework_dir" arch -arm64 swift test \
  --package-path "$(cd "$(dirname "$0")/.." && pwd)/launcher" \
  -Xswiftc -F -Xswiftc "$framework_dir" \
  -Xswiftc -Xfrontend -Xswiftc -disable-cross-import-overlays \
  -Xlinker -F -Xlinker "$framework_dir" \
  -Xlinker -rpath -Xlinker "$framework_dir" \
  "$@"
