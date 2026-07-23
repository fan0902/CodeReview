#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
app_path="$repo_root/outputs/CR.app"
support_root="$(mktemp -d "${TMPDIR:-/tmp}/cr-smoke.XXXXXX")"
state_file="$support_root/service.json"
launcher_pid=""
service_pid=""
events_pid=""
checkpoint() { printf 'smoke: %s\n' "$1"; }
cleanup() {
  if [[ ! "$service_pid" =~ ^[0-9]+$ && -f "$state_file" ]]; then
    service_pid="$("$app_path/Contents/Resources/runtime/node" -e '
try { console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).pid) } catch {}
' "$state_file" 2>/dev/null || true)"
  fi
  if [[ "$launcher_pid" =~ ^[0-9]+$ ]] && kill -0 "$launcher_pid" 2>/dev/null; then
    kill "$launcher_pid" 2>/dev/null || true
  fi
  if [[ "$service_pid" =~ ^[0-9]+$ ]] && kill -0 "$service_pid" 2>/dev/null; then
    kill "$service_pid" 2>/dev/null || true
  fi
  if [[ "$events_pid" =~ ^[0-9]+$ ]] && kill -0 "$events_pid" 2>/dev/null; then
    kill "$events_pid" 2>/dev/null || true
  fi
  find "$support_root" -type f -delete 2>/dev/null || true
  rmdir "$support_root" 2>/dev/null || true
}
trap cleanup EXIT

checkpoint "launch"
CR_TEST_MODE=1 \
  CR_APP_SUPPORT_DIR="$support_root" \
  CR_TEST_PROJECT="$repo_root/fixtures/mixed-project" \
  "$app_path/Contents/MacOS/CR" \
  >"$support_root/launcher.stdout.log" \
  2>"$support_root/launcher.stderr.log" &
launcher_pid=$!

for _ in {1..100}; do
  [[ -f "$state_file" ]] && break
  sleep 0.1
done
test -f "$state_file"

checkpoint "launcher"
[[ "$launcher_pid" =~ ^[0-9]+$ ]]
kill -0 "$launcher_pid"

swift -e '
import AppKit
import Darwin
guard
  let value = Int32(CommandLine.arguments[1]),
  let app = NSRunningApplication(processIdentifier: value),
  app.activationPolicy == .regular
else { exit(1) }
' "$launcher_pid"

checkpoint "service"
read -r service_pid port token < <("$app_path/Contents/Resources/runtime/node" -e '
const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
console.log(s.pid, s.port, s.token)
' "$state_file")
origin="http://127.0.0.1:$port"
curl --fail --silent "$origin/api/health" | grep -q '"name":"CR"'
curl --fail --silent -H "Authorization: Bearer $token" -H "Origin: $origin" "$origin/api/project/tree" | grep -q 'users.controller.ts'
status="$(curl --silent --output /dev/null --write-out '%{http_code}' -H "Authorization: Bearer $token" -H "Origin: $origin" "$origin/api/files/content?path=../settings.json")"
test "$status" = "403"

events_file="$support_root/page-events.log"
curl --no-buffer --silent \
  -H "Authorization: Bearer $token" \
  -H "Origin: $origin" \
  "$origin/api/lifecycle/pages/smoke-page/events" >"$events_file" &
events_pid=$!
curl --fail --silent \
  -H "Authorization: Bearer $token" \
  -H "Origin: $origin" \
  -H "Content-Type: application/json" \
  -d '{"pageId":"smoke-page"}' \
  "$origin/api/lifecycle/heartbeat"
for _ in {1..50}; do
  grep -q 'connected' "$events_file" && break
  sleep 0.1
done
grep -q 'connected' "$events_file"

checkpoint "reopen"
open "$app_path"
for _ in {1..50}; do
  grep -q '"type":"reload"' "$events_file" && break
  sleep 0.1
done
grep -q '"type":"reload"' "$events_file"
reload_count="$(grep -o '"type":"reload"' "$events_file" | wc -l | tr -d ' ')"
test "$reload_count" = "1"
second_pid="$("$app_path/Contents/Resources/runtime/node" -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).pid)' "$state_file")"
test "$second_pid" = "$service_pid"

checkpoint "terminate"
swift -e '
import AppKit
import Darwin
guard
  let value = Int32(CommandLine.arguments[1]),
  let app = NSRunningApplication(processIdentifier: value),
  app.terminate()
else { exit(1) }
' "$launcher_pid"

for _ in {1..100}; do
  if ! kill -0 "$launcher_pid" 2>/dev/null \
    && ! kill -0 "$service_pid" 2>/dev/null \
    && [[ ! -f "$state_file" ]]; then
    break
  fi
  sleep 0.1
done
! kill -0 "$launcher_pid" 2>/dev/null
! kill -0 "$service_pid" 2>/dev/null
test ! -f "$state_file"
launcher_pid=""
service_pid=""
checkpoint "complete"
