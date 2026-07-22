# CR Dock Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep CR visible as a regular running Dock application, reopen the default-browser UI from the Dock, stop its validated local service on quit, remove machine-specific and legacy-brand residue, rebuild the app, and publish the verified source to `fan0902/CodeReview`.

**Architecture:** Replace the one-shot Swift entry point with an AppKit application delegate and event loop while preserving `ServiceLauncher` as the single service/browser boundary. Add a small, independently tested service stopper and open-request gate; package metadata makes CR a regular app, repository hygiene becomes an automated test, and the empty GitHub repository receives the verified HEAD as `main`.

**Tech Stack:** Swift 6, AppKit, Swift Package Manager/XCTest, Bash, Node.js/npm, macOS `open`, `codesign`, Git and GitHub.

---

## File map

- Create `scripts/test-repository-hygiene.sh`: reject machine-specific paths and the former product name, and prove the default-browser API remains in use.
- Modify `package.json`: run the hygiene check as part of `npm test`.
- Modify `docs/superpowers/plans/2026-07-22-cr-app-icon.md`: replace four machine-specific delivery paths with portable commands.
- Modify `docs/superpowers/specs/2026-07-22-cr-dock-lifecycle-design.md`: remove literal forbidden examples while preserving the rule in neutral language.
- Modify `launcher/Package.swift`: add `CRLauncherTests`.
- Modify `launcher/Sources/CRLauncher/ServiceState.swift`: add an injectable, identity-validating service stopper.
- Modify `launcher/Sources/CRLauncher/ServiceLauncher.swift`: expose idempotent stop behavior while preserving `NSWorkspace.shared.open`.
- Create `launcher/Sources/CRLauncher/CRApplicationDelegate.swift`: own AppKit lifecycle, menu, reopen handling, and duplicate-open gating.
- Modify `launcher/Sources/CRLauncher/CRLauncherMain.swift`: run a regular AppKit application instead of exiting after the first browser open.
- Create `launcher/Tests/CRLauncherTests/ServiceStopperTests.swift`: cover valid, mismatched and corrupt stop states.
- Create `launcher/Tests/CRLauncherTests/CRApplicationDelegateTests.swift`: cover gate and lifecycle callbacks.
- Modify `resources/Info.plist.in`: remove the background-agent declaration.
- Modify `scripts/test-macos-bundle.sh`: reject bundles that hide their Dock icon.
- Modify `scripts/smoke-macos-app.sh`: test a persistent regular app, reopen/reuse, default-browser launch and clean quit.
- Rebuild and deliver `outputs/CR.app`.
- Add remote `origin` for `https://github.com/fan0902/CodeReview.git` and publish verified HEAD as remote `main`.

### Task 1: Add a repository hygiene contract and remove current residue

**Files:**
- Create: `scripts/test-repository-hygiene.sh`
- Modify: `package.json:11-15`
- Modify: `docs/superpowers/plans/2026-07-22-cr-app-icon.md:21,194,242-263`
- Modify: `docs/superpowers/specs/2026-07-22-cr-dock-lifecycle-design.md:69-105`

- [ ] **Step 1: Create the failing hygiene test**

Create `scripts/test-repository-hygiene.sh` with this content. The split string literals keep the test from matching its own forbidden patterns.

```bash
#!/usr/bin/env bash
set -euo pipefail

developer_home_prefix='/''Users/'
legacy_brand='tab''bit'
personal_workspace_name='fan''lei06'
status=0

check_absent() {
  local label="$1"
  local pattern="$2"
  shift 2
  if git grep -I -n "$@" -F "$pattern" -- .; then
    echo "Repository hygiene failed: $label" >&2
    status=1
  fi
}

check_absent "developer home path" "$developer_home_prefix"
check_absent "personal workspace name" "$personal_workspace_name"
check_absent "legacy product name" "$legacy_brand" -i

if ! git grep -I -n -F 'NSWorkspace.shared.open' -- launcher/Sources/CRLauncher/ServiceLauncher.swift >/dev/null; then
  echo "Repository hygiene failed: default-browser API not found" >&2
  status=1
fi

exit "$status"
```

Make it executable:

```bash
chmod +x scripts/test-repository-hygiene.sh
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
bash scripts/test-repository-hygiene.sh
```

Expected: exit 1. Output identifies four machine-specific paths in the historical icon plan and literal forbidden examples in the Dock specification.

- [ ] **Step 3: Replace machine-specific paths and literal legacy examples**

In `docs/superpowers/plans/2026-07-22-cr-app-icon.md`:

- Change both deliverable bullets to `outputs/CR.app`.
- Replace the shared-copy command with a caller-supplied portable root:

```bash
delivery_root="${CR_DELIVERY_ROOT:?Set CR_DELIVERY_ROOT to the target checkout}"
delivery_app="$delivery_root/outputs/CR.app"
ditto outputs/CR.app "$delivery_app"
```

- Reuse `delivery_app` in the follow-up verification commands.

In `docs/superpowers/specs/2026-07-22-cr-dock-lifecycle-design.md`, describe the blocked values as “developer-machine home prefixes”, “personal workspace names” and “legacy product names” without spelling the forbidden values literally. Preserve the explicit distinction between runtime user-selected project paths and hardcoded developer paths.

- [ ] **Step 4: Run the hygiene test and verify GREEN**

Run:

```bash
bash scripts/test-repository-hygiene.sh
```

Expected: exit 0 with no matches.

- [ ] **Step 5: Add the hygiene gate to the main test command**

Change the root scripts in `package.json` to:

```json
"scripts": {
  "build": "npm run build --workspaces --if-present",
  "test": "npm run test:hygiene && npm run test --workspaces --if-present",
  "test:hygiene": "bash scripts/test-repository-hygiene.sh",
  "typecheck": "npm run typecheck --workspaces --if-present"
}
```

Run:

```bash
npm run test:hygiene
```

Expected: exit 0.

- [ ] **Step 6: Commit the hygiene contract**

```bash
git add package.json scripts/test-repository-hygiene.sh docs/superpowers/plans/2026-07-22-cr-app-icon.md docs/superpowers/specs/2026-07-22-cr-dock-lifecycle-design.md
git commit -m "test: enforce CR repository hygiene"
```

### Task 2: Add safe service shutdown with TDD

**Files:**
- Modify: `launcher/Package.swift`
- Modify: `launcher/Sources/CRLauncher/ServiceState.swift`
- Modify: `launcher/Sources/CRLauncher/ServiceLauncher.swift`
- Create: `launcher/Tests/CRLauncherTests/ServiceStopperTests.swift`

- [ ] **Step 1: Add the Swift test target**

Change `launcher/Package.swift` targets to:

```swift
targets: [
  .executableTarget(name: "CRLauncher"),
  .testTarget(name: "CRLauncherTests", dependencies: ["CRLauncher"]),
]
```

- [ ] **Step 2: Write failing service-stopper tests**

Create `launcher/Tests/CRLauncherTests/ServiceStopperTests.swift`:

```swift
import Darwin
import Foundation
import XCTest
@testable import CRLauncher

final class ServiceStopperTests: XCTestCase {
  func testStopsValidatedProcessAndRemovesState() throws {
    let fixture = try StopFixture()
    var terminated: [Int32] = []
    let stopper = ServiceStopper(
      validator: fixture.validator(actualExecutable: fixture.executable),
      terminate: { terminated.append($0) }
    )

    stopper.stop(stateURL: fixture.stateURL)

    XCTAssertEqual(terminated, [fixture.state.pid])
    XCTAssertFalse(FileManager.default.fileExists(atPath: fixture.stateURL.path))
  }

  func testDoesNotStopMismatchedProcessAndRemovesStaleState() throws {
    let fixture = try StopFixture()
    var terminated: [Int32] = []
    let stopper = ServiceStopper(
      validator: fixture.validator(actualExecutable: "/different/node"),
      terminate: { terminated.append($0) }
    )

    stopper.stop(stateURL: fixture.stateURL)

    XCTAssertTrue(terminated.isEmpty)
    XCTAssertFalse(FileManager.default.fileExists(atPath: fixture.stateURL.path))
  }

  func testDoesNotStopProcessForCorruptState() throws {
    let fixture = try StopFixture(writeValidState: false)
    var terminated: [Int32] = []
    let stopper = ServiceStopper(
      validator: fixture.validator(actualExecutable: fixture.executable),
      terminate: { terminated.append($0) }
    )

    stopper.stop(stateURL: fixture.stateURL)

    XCTAssertTrue(terminated.isEmpty)
    XCTAssertFalse(FileManager.default.fileExists(atPath: fixture.stateURL.path))
  }
}

private struct StopFixture {
  let directory: URL
  let stateURL: URL
  let executable = "/portable/runtime/node"
  let state: ServiceState

  init(writeValidState: Bool = true) throws {
    directory = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    stateURL = directory.appendingPathComponent("service.json")
    state = ServiceState(pid: 4242, port: 4123, token: "token", uid: getuid(), executable: executable)
    let data = writeValidState ? try JSONEncoder().encode(state) : Data("broken".utf8)
    try data.write(to: stateURL)
  }

  func validator(actualExecutable: String) -> ServiceStateValidator {
    ServiceStateValidator(
      expectedUID: getuid(),
      expectedExecutable: executable,
      processExists: { $0 == state.pid },
      executableForPID: { $0 == state.pid ? actualExecutable : nil }
    )
  }
}
```

- [ ] **Step 3: Run Swift tests and verify RED**

Run:

```bash
swift test --package-path launcher
```

Expected: compilation fails because `ServiceStopper` does not exist.

- [ ] **Step 4: Implement the minimal identity-validating stopper**

Append to `launcher/Sources/CRLauncher/ServiceState.swift`:

```swift
struct ServiceStopper {
  let validator: ServiceStateValidator
  let terminate: (Int32) -> Void
  var fileManager: FileManager = .default

  func stop(stateURL: URL) {
    defer { try? fileManager.removeItem(at: stateURL) }
    guard
      let data = try? Data(contentsOf: stateURL),
      let state = try? JSONDecoder().decode(ServiceState.self, from: data),
      validator.isReusable(state)
    else { return }
    terminate(state.pid)
  }

  static func system(expectedExecutable: URL) -> ServiceStopper {
    ServiceStopper(
      validator: .system(expectedExecutable: expectedExecutable),
      terminate: { _ = kill($0, SIGTERM) }
    )
  }
}
```

Add to `ServiceLauncher`:

```swift
func stopService() {
  let node = resources.appendingPathComponent("runtime/node")
  let stateURL = support.appendingPathComponent("service.json")
  ServiceStopper.system(expectedExecutable: node).stop(stateURL: stateURL)
}
```

- [ ] **Step 5: Run Swift tests and verify GREEN**

Run:

```bash
swift test --package-path launcher
```

Expected: all three `ServiceStopperTests` pass.

- [ ] **Step 6: Commit safe shutdown**

```bash
git add launcher/Package.swift launcher/Sources/CRLauncher/ServiceState.swift launcher/Sources/CRLauncher/ServiceLauncher.swift launcher/Tests/CRLauncherTests/ServiceStopperTests.swift
git commit -m "feat: stop validated CR service on quit"
```

### Task 3: Keep the AppKit launcher alive and handle Dock reopen

**Files:**
- Create: `launcher/Sources/CRLauncher/CRApplicationDelegate.swift`
- Modify: `launcher/Sources/CRLauncher/CRLauncherMain.swift`
- Create: `launcher/Tests/CRLauncherTests/CRApplicationDelegateTests.swift`

- [ ] **Step 1: Write failing gate and lifecycle tests**

Create `launcher/Tests/CRLauncherTests/CRApplicationDelegateTests.swift`:

```swift
import AppKit
import XCTest
@testable import CRLauncher

final class CRApplicationDelegateTests: XCTestCase {
  func testOpenRequestGateRejectsConcurrentRequestAndResets() {
    var gate = OpenRequestGate()
    XCTAssertTrue(gate.begin())
    XCTAssertFalse(gate.begin())
    gate.end()
    XCTAssertTrue(gate.begin())
  }

  @MainActor
  func testLifecycleRequestsOpenAndStopsService() async {
    let service = RecordingServiceManager()
    let delegate = CRApplicationDelegate(service: service)

    delegate.applicationDidFinishLaunching(
      Notification(name: NSApplication.didFinishLaunchingNotification)
    )
    await waitUntil { service.launchCount == 1 }

    XCTAssertTrue(
      delegate.applicationShouldHandleReopen(NSApplication.shared, hasVisibleWindows: false)
    )
    await waitUntil { service.launchCount == 2 }

    delegate.applicationWillTerminate(
      Notification(name: NSApplication.willTerminateNotification)
    )
    XCTAssertEqual(service.stopCount, 1)
  }

  @MainActor
  private func waitUntil(_ condition: @escaping () -> Bool) async {
    for _ in 0..<100 {
      if condition() { return }
      await Task.yield()
    }
    XCTFail("Timed out waiting for lifecycle callback")
  }
}

@MainActor
private final class RecordingServiceManager: ServiceManaging {
  var launchCount = 0
  var stopCount = 0

  func launchOrReuse() async throws { launchCount += 1 }
  func stopService() { stopCount += 1 }
}
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
swift test --package-path launcher --filter CRApplicationDelegateTests
```

Expected: compilation fails because `OpenRequestGate`, `ServiceManaging` and `CRApplicationDelegate` do not exist.

- [ ] **Step 3: Implement the application delegate and request gate**

Create `launcher/Sources/CRLauncher/CRApplicationDelegate.swift` with:

```swift
import AppKit
import Foundation

@MainActor
protocol ServiceManaging: AnyObject {
  func launchOrReuse() async throws
  func stopService()
}

extension ServiceLauncher: ServiceManaging {}

struct OpenRequestGate {
  private(set) var isActive = false

  mutating func begin() -> Bool {
    guard !isActive else { return false }
    isActive = true
    return true
  }

  mutating func end() { isActive = false }
}

@MainActor
final class CRApplicationDelegate: NSObject, NSApplicationDelegate {
  private let service: ServiceManaging
  private var gate = OpenRequestGate()

  init(service: ServiceManaging) {
    self.service = service
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    installMainMenu()
    requestOpen(terminateOnFailure: true)
  }

  func applicationShouldHandleReopen(
    _ sender: NSApplication,
    hasVisibleWindows flag: Bool
  ) -> Bool {
    requestOpen(terminateOnFailure: false)
    return true
  }

  func applicationWillTerminate(_ notification: Notification) {
    service.stopService()
  }

  private func requestOpen(terminateOnFailure: Bool) {
    guard gate.begin() else { return }
    Task { [weak self] in
      guard let self else { return }
      defer { gate.end() }
      do {
        try await service.launchOrReuse()
      } catch {
        present(error)
        if terminateOnFailure { NSApplication.shared.terminate(nil) }
      }
    }
  }

  private func present(_ error: Error) {
    let alert = NSAlert()
    alert.alertStyle = .critical
    alert.messageText = "CR 无法启动"
    alert.informativeText = error.localizedDescription
    alert.runModal()
  }

  private func installMainMenu() {
    let mainMenu = NSMenu()
    let appItem = NSMenuItem()
    mainMenu.addItem(appItem)

    let appMenu = NSMenu(title: "CR")
    appMenu.addItem(
      withTitle: "关于 CR",
      action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)),
      keyEquivalent: ""
    )
    appMenu.addItem(NSMenuItem.separator())
    appMenu.addItem(
      withTitle: "隐藏 CR",
      action: #selector(NSApplication.hide(_:)),
      keyEquivalent: "h"
    )
    appMenu.addItem(
      withTitle: "退出 CR",
      action: #selector(NSApplication.terminate(_:)),
      keyEquivalent: "q"
    )
    appItem.submenu = appMenu
    NSApplication.shared.mainMenu = mainMenu
  }
}
```

- [ ] **Step 4: Replace the one-shot entry point with an AppKit event loop**

Replace `CRLauncherMain.swift` with:

```swift
import AppKit
import Foundation

@main
enum CRLauncherMain {
  @MainActor
  static func main() {
    let application = NSApplication.shared
    application.setActivationPolicy(.regular)
    do {
      let delegate = CRApplicationDelegate(service: try ServiceLauncher())
      application.delegate = delegate
      withExtendedLifetime(delegate) {
        application.run()
      }
    } catch {
      let alert = NSAlert()
      alert.alertStyle = .critical
      alert.messageText = "CR 无法启动"
      alert.informativeText = error.localizedDescription
      alert.runModal()
    }
  }
}
```

- [ ] **Step 5: Run focused and full Swift tests**

Run:

```bash
swift test --package-path launcher --filter CRApplicationDelegateTests
swift test --package-path launcher
```

Expected: lifecycle tests and all launcher tests pass. If Swift 6 reports actor-isolation diagnostics, keep the delegate and its fake service on `@MainActor`; do not make service state globally unchecked-sendable.

- [ ] **Step 6: Commit the persistent Dock lifecycle**

```bash
git add launcher/Sources/CRLauncher/CRApplicationDelegate.swift launcher/Sources/CRLauncher/CRLauncherMain.swift launcher/Tests/CRLauncherTests/CRApplicationDelegateTests.swift
git commit -m "feat: keep CR visible in the Dock"
```

### Task 4: Make packaging and smoke tests enforce Dock visibility

**Files:**
- Modify: `scripts/test-macos-bundle.sh`
- Modify: `resources/Info.plist.in`
- Modify: `scripts/smoke-macos-app.sh`

- [ ] **Step 1: Add a failing bundle assertion**

Insert before `plutil -lint` in `scripts/test-macos-bundle.sh`:

```bash
if /usr/libexec/PlistBuddy -c 'Print :LSUIElement' "$app_path/Contents/Info.plist" >/dev/null 2>&1; then
  echo "CR must be a regular Dock application" >&2
  exit 1
fi
```

- [ ] **Step 2: Run the old bundle test and verify RED**

Run:

```bash
bash scripts/test-macos-bundle.sh outputs/CR.app
```

Expected: exit 1 with `CR must be a regular Dock application`.

- [ ] **Step 3: Remove the background-agent declaration**

Delete this pair from `resources/Info.plist.in`:

```xml
  <key>LSUIElement</key><true/>
```

Run:

```bash
plutil -lint resources/Info.plist.in
```

Expected: `resources/Info.plist.in: OK`.

- [ ] **Step 4: Update the smoke test for a persistent app**

Replace `scripts/smoke-macos-app.sh` with:

```bash
#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
app_path="$repo_root/outputs/CR.app"
support_root="$(mktemp -d "${TMPDIR:-/tmp}/cr-smoke.XXXXXX")"
state_file="$support_root/service.json"
launcher_pid=""
service_pid=""

cleanup() {
  if [[ "$launcher_pid" =~ ^[0-9]+$ ]] && kill -0 "$launcher_pid" 2>/dev/null; then
    kill "$launcher_pid" 2>/dev/null || true
  fi
  if [[ "$service_pid" =~ ^[0-9]+$ ]] && kill -0 "$service_pid" 2>/dev/null; then
    kill "$service_pid" 2>/dev/null || true
  fi
  find "$support_root" -type f -delete 2>/dev/null || true
  rmdir "$support_root" 2>/dev/null || true
}
trap cleanup EXIT

open --env CR_TEST_MODE=1 \
  --env "CR_APP_SUPPORT_DIR=$support_root" \
  --env "CR_TEST_PROJECT=$repo_root/fixtures/mixed-project" \
  -n "$app_path"

for _ in {1..100}; do
  [[ -f "$state_file" ]] && break
  sleep 0.1
done
test -f "$state_file"

for _ in {1..100}; do
  launcher_pid="$(pgrep -f "$app_path/Contents/MacOS/CR" | head -n 1 || true)"
  [[ "$launcher_pid" =~ ^[0-9]+$ ]] && break
  sleep 0.1
done
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

read -r service_pid port token < <("$app_path/Contents/Resources/runtime/node" -e '
const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
console.log(s.pid, s.port, s.token)
' "$state_file")
origin="http://127.0.0.1:$port"
curl --fail --silent "$origin/api/health" | grep -q '"name":"CR"'
curl --fail --silent -H "Authorization: Bearer $token" -H "Origin: $origin" \
  "$origin/api/project/tree" | grep -q 'users.controller.ts'
status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  -H "Authorization: Bearer $token" -H "Origin: $origin" \
  "$origin/api/files/content?path=../settings.json")"
test "$status" = "403"

open "$app_path"
sleep 0.5
second_pid="$("$app_path/Contents/Resources/runtime/node" -e '
console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).pid)
' "$state_file")"
test "$second_pid" = "$service_pid"

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
```

- [ ] **Step 5: Build the updated application and verify GREEN**

Run:

```bash
bash scripts/build-macos-app.sh
bash scripts/test-macos-bundle.sh outputs/CR.app
bash scripts/smoke-macos-app.sh
```

Expected: build, bundle test and persistent lifecycle smoke all exit 0. The browser URL is still opened by `NSWorkspace.shared.open`, so macOS chooses the user's default browser.

- [ ] **Step 6: Commit package lifecycle enforcement**

```bash
git add resources/Info.plist.in scripts/test-macos-bundle.sh scripts/smoke-macos-app.sh
git commit -m "test: verify CR Dock lifecycle"
```

### Task 5: Run full verification and replace the local deliverable

**Files:**
- Verify: repository source and `outputs/CR.app`
- Deliver: workspace-root `outputs/CR.app`

- [ ] **Step 1: Run every source and native check**

Run:

```bash
npm test
npm run typecheck
npm run build
swift test --package-path launcher
arch -arm64 swift build -c release --package-path launcher
```

Expected: hygiene passes; 58 existing web/server/contract tests plus all new Swift tests pass; typecheck and both builds exit 0.

- [ ] **Step 2: Rebuild and exercise the final bundle**

Run:

```bash
bash scripts/build-macos-app.sh
bash scripts/test-macos-bundle.sh outputs/CR.app
bash scripts/smoke-macos-app.sh
codesign --verify --deep --strict outputs/CR.app
```

Expected: all commands exit 0.

- [ ] **Step 3: Verify Dock and browser metadata**

Run:

```bash
! /usr/libexec/PlistBuddy -c 'Print :LSUIElement' outputs/CR.app/Contents/Info.plist >/dev/null 2>&1
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIconFile' outputs/CR.app/Contents/Info.plist)" = "CR"
git grep -I -n -F 'NSWorkspace.shared.open' -- launcher/Sources/CRLauncher/ServiceLauncher.swift
```

Expected: the hidden-agent key is absent, the icon name is `CR`, and both browser-open paths use the system workspace API.

- [ ] **Step 4: Copy to the workspace-root delivery directory**

Resolve the main checkout without embedding a machine path:

```bash
delivery_root="$(git worktree list --porcelain | awk '/^worktree / { print substr($0, 10); exit }')"
delivery_app="$delivery_root/outputs/CR.app"
ditto outputs/CR.app "$delivery_app"
ditto resources/CR-icon-1024.png "$delivery_root/outputs/CR-icon-preview.png"
```

- [ ] **Step 5: Re-verify the copied deliverable**

Run:

```bash
codesign --verify --deep --strict "$delivery_app"
bash scripts/test-macos-bundle.sh "$delivery_app"
```

Expected: both commands exit 0.

### Task 6: Publish the verified source to GitHub

**Files:**
- No source-file changes expected.
- Remote target: `https://github.com/fan0902/CodeReview.git`
- Remote branch: `main`

- [ ] **Step 1: Invoke the GitHub publishing workflow**

Use the `github:yeet` skill before any remote mutation. Confirm the current branch, clean tracked status, commit list, and target remote.

- [ ] **Step 2: Confirm the target remains empty**

Run:

```bash
git ls-remote --heads https://github.com/fan0902/CodeReview.git
```

Expected: no branch refs. If a branch appears, stop and compare histories before pushing; do not force-push.

- [ ] **Step 3: Configure the target remote**

Run:

```bash
if git remote get-url origin >/dev/null 2>&1; then
  test "$(git remote get-url origin)" = "https://github.com/fan0902/CodeReview.git"
else
  git remote add origin https://github.com/fan0902/CodeReview.git
fi
git remote -v
```

Expected: fetch and push URLs both point to `fan0902/CodeReview`.

- [ ] **Step 4: Push verified HEAD as the initial main branch**

Run:

```bash
git push -u origin HEAD:main
```

Expected: a new remote `main` branch is created without force.

- [ ] **Step 5: Verify the remote commit exactly matches local HEAD**

Run:

```bash
local_head="$(git rev-parse HEAD)"
remote_head="$(git ls-remote origin refs/heads/main | awk '{print $1}')"
test "$remote_head" = "$local_head"
printf 'local=%s\nremote=%s\n' "$local_head" "$remote_head"
```

Expected: both SHAs are identical.

- [ ] **Step 6: Record final state**

Run:

```bash
git status --short
git log -8 --oneline --decorate
```

Expected: tracked files are clean; only the pre-existing visual-companion directory may remain untracked; HEAD and `origin/main` identify the same commit.
