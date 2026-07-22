# CR macOS Launcher and Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the verified CR service and browser UI into a self-contained `CR.app` that safely starts or reuses the local service and opens the default browser.

**Architecture:** A small Swift executable owns process-state validation, service launch, health polling, and browser opening. The app bundle embeds the Node runtime, compiled server, front-end assets, Pyright runtime, and version manifest; build and smoke scripts make the unsigned local artifact reproducible.

**Tech Stack:** Swift 6/Foundation/AppKit, macOS app bundle, Node.js 22 embedded runtime, Bash build orchestration, Vitest, XCTest-style Swift CLI tests, Playwright

---

## File map

- `launcher/Sources/CRLauncher/main.swift`: production entry point.
- `launcher/Sources/CRLauncher/ServiceState.swift`: PID/port/token state and ownership validation.
- `launcher/Sources/CRLauncher/ServiceLauncher.swift`: spawn, health wait, reuse, and browser open.
- `launcher/Tests/CRLauncherTests/`: deterministic launcher tests with fake processes/HTTP.
- `scripts/build-macos-app.sh`: reproducible `.app` construction.
- `scripts/smoke-macos-app.sh`: black-box app launch and API checks.
- `scripts/create-performance-fixture.ts`: fixed 20k-file benchmark generator.
- `apps/server/src/lifecycle/heartbeat.ts`: active-page idle shutdown.
- `apps/web/src/features/lifecycle/PageHeartbeat.tsx`: activity heartbeat.
- `resources/CR.icns`: CR application icon.
- `README.md`: developer, build, install, security, and usage instructions.
- `outputs/CR.app`: final local app artifact during development; release packaging may zip it.

### Task 1: Page heartbeat and deterministic idle shutdown

**Files:**
- Create: `apps/server/src/lifecycle/heartbeat.ts`
- Create: `apps/web/src/features/lifecycle/PageHeartbeat.tsx`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/main.ts`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/server/src/lifecycle/heartbeat.test.ts`
- Test: `apps/web/src/features/lifecycle/PageHeartbeat.test.tsx`

- [ ] **Step 1: Write fake-clock lifecycle tests**

```ts
it("exits after fifteen minutes without a page heartbeat", () => {
  const clock = new HeartbeatClock({ idleMs: 15 * 60_000, now: () => now, onIdle });
  clock.beat("page-1");
  now += 14 * 60_000;
  clock.sweep();
  expect(onIdle).not.toHaveBeenCalled();
  now += 61_000;
  clock.sweep();
  expect(onIdle).toHaveBeenCalledOnce();
});

it("sends a heartbeat on mount, activity, and before unload", async () => {
  render(<PageHeartbeat />);
  expect(api.heartbeat).toHaveBeenCalledWith(expect.any(String));
  fireEvent.pointerDown(window);
  expect(api.heartbeat).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -w apps/server -- src/lifecycle && npm test -w apps/web -- src/features/lifecycle`

Expected: FAIL because heartbeat components do not exist.

- [ ] **Step 3: Implement heartbeat API and shutdown policy**

```ts
export class HeartbeatClock {
  private readonly seen = new Map<string, number>();
  beat(pageId: string) { this.seen.set(pageId, this.now()); }
  close(pageId: string) { this.seen.delete(pageId); }
  sweep() {
    const cutoff = this.now() - this.idleMs;
    for (const [id, lastSeen] of this.seen) if (lastSeen < cutoff) this.seen.delete(id);
    if (this.seen.size === 0 && this.startedAt < cutoff) this.onIdle();
  }
}
```

Expose authenticated `POST /api/lifecycle/heartbeat` and `POST /api/lifecycle/pages/:id/close`. The React component generates one crypto UUID per tab, sends on mount and at most once per 30 seconds after user activity, sends every 60 seconds while visible, and uses `sendBeacon` with `{token}` in the JSON body during unload because custom headers are unavailable. Only the close route accepts a body token, validates it with a constant-time comparison, requires the exact local Origin, and rejects bodies larger than 1 KiB.

- [ ] **Step 4: Run lifecycle and regression tests**

Run: `npm test -w apps/server -- src/lifecycle src/app.test.ts && npm test -w apps/web -- src/features/lifecycle && npm run typecheck`

Expected: PASS; a valid heartbeat prevents shutdown and malformed/untrusted heartbeats are rejected.

- [ ] **Step 5: Commit lifecycle handling**

```bash
git add apps/server/src/lifecycle apps/server/src/app.ts apps/server/src/main.ts apps/web/src/features/lifecycle apps/web/src/App.tsx
git commit -m "feat: stop CR after browser inactivity"
```

### Task 2: Swift launcher state, service start, and reuse

**Files:**
- Create: `launcher/Package.swift`
- Create: `launcher/Sources/CRLauncher/main.swift`
- Create: `launcher/Sources/CRLauncher/ServiceState.swift`
- Create: `launcher/Sources/CRLauncher/ServiceLauncher.swift`
- Create: `launcher/Tests/CRLauncherTests/ServiceStateTests.swift`
- Create: `launcher/Tests/CRLauncherTests/ServiceLauncherTests.swift`

- [ ] **Step 1: Write launcher state and health tests**

```swift
func testRejectsStateOwnedByAnotherUserOrWrongExecutable() throws {
    let state = ServiceState(pid: 42, port: 49152, token: "secret", uid: 999, executable: "/tmp/not-cr")
    XCTAssertFalse(validator.isReusable(state, expectedUID: getuid(), expectedExecutable: resources.appendingPathComponent("runtime/node")))
}

func testReusesHealthyServiceAndOpensBrowser() async throws {
    health.stub(port: 49152, token: "secret", result: true)
    try await launcher.launchOrReuse()
    XCTAssertEqual(process.spawnCount, 0)
    XCTAssertEqual(browser.openedURL, URL(string: "http://127.0.0.1:49152/?token=secret"))
}
```

- [ ] **Step 2: Create Swift package and verify failure**

Run: `swift test --package-path launcher`

Expected: FAIL because launcher types do not exist.

- [ ] **Step 3: Implement validated reuse and first launch**

```swift
struct ServiceState: Codable {
    let pid: Int32
    let port: UInt16
    let token: String
    let uid: uid_t
    let executable: String
}

func launchOrReuse() async throws {
    if let state = try stateStore.load(), validator.isReusable(state), await health.isReady(state) {
        try browser.open(url(for: state))
        return
    }
    try stateStore.removeIfPresent()
    let token = secureRandomToken(byteCount: 32)
    let child = try process.spawn(node: resources.node, arguments: [resources.server, "--host", "127.0.0.1", "--port", "0", "--token", token])
    let state = try await waitForStartupLine(child, token: token, timeout: .seconds(10))
    try stateStore.save(state, permissions: 0o600)
    try browser.open(url(for: state))
}
```

Validate `kill(pid, 0)`, current UID, canonical executable path from `proc_pidpath`, health response version, and token. Parse exactly one JSON startup line. On timeout, terminate only the child created by this launch and show an `NSAlert` with the log path. Use `NSWorkspace.shared.open` for the default browser.

- [ ] **Step 4: Run Swift tests**

Run: `swift test --package-path launcher`

Expected: PASS for first launch, healthy reuse, stale PID, wrong executable, port collision handled by server port zero, startup timeout, and browser-open failure.

- [ ] **Step 5: Commit the launcher**

```bash
git add launcher
git commit -m "feat: add CR macOS launcher"
```

### Task 3: Reproducible self-contained app bundle

**Files:**
- Create: `scripts/build-macos-app.sh`
- Create: `resources/Info.plist.in`
- Create: `resources/CR.icns`
- Modify: `apps/server/package.json`
- Modify: `.gitignore`
- Test: `scripts/test-macos-bundle.sh`

- [ ] **Step 1: Write the failing bundle structure test**

```bash
#!/usr/bin/env bash
set -euo pipefail
app_path="${1:?CR.app path required}"
test -x "$app_path/Contents/MacOS/CR"
test -x "$app_path/Contents/Resources/runtime/node"
test -f "$app_path/Contents/Resources/server/main.js"
test -f "$app_path/Contents/Resources/web/index.html"
test -f "$app_path/Contents/Resources/pyright/langserver.index.js"
plutil -lint "$app_path/Contents/Info.plist"
codesign --verify --deep --strict "$app_path"
```

- [ ] **Step 2: Run it to verify failure**

Run: `bash scripts/test-macos-bundle.sh outputs/CR.app`

Expected: FAIL because the app bundle is absent.

- [ ] **Step 3: Implement deterministic bundle creation**

`scripts/build-macos-app.sh` must:

```bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
output_app="$repo_root/outputs/CR.app"
npm ci --prefix "$repo_root"
npm run test --prefix "$repo_root"
npm run build --prefix "$repo_root"
swift build -c release --package-path "$repo_root/launcher"
mkdir -p "$output_app/Contents/MacOS" "$output_app/Contents/Resources/runtime" "$output_app/Contents/Resources/server" "$output_app/Contents/Resources/web" "$output_app/Contents/Resources/pyright"
```

Then copy the release Swift binary, the exact Node executable used for the build, server bundle, Vite build, Monaco workers, Pyright langserver bundle, license notices, icon, and generated Info.plist. Strip extended attributes, ad-hoc sign with `codesign --force --deep --sign -`, and run `scripts/test-macos-bundle.sh`. Never depend on `/usr/local`, Homebrew, or the user's Node/Python at runtime.

- [ ] **Step 4: Build and validate the bundle**

Run: `bash scripts/build-macos-app.sh && bash scripts/test-macos-bundle.sh outputs/CR.app`

Expected: PASS; `du -sh outputs/CR.app` reports the artifact size and `otool -L` shows only system dynamic libraries for the launcher.

- [ ] **Step 5: Commit packaging sources, not generated app contents**

```bash
git add scripts resources apps/server/package.json .gitignore package-lock.json
git commit -m "build: package CR as a macOS app"
```

### Task 4: Black-box launch, reuse, security, and enum persistence smoke test

**Files:**
- Create: `scripts/smoke-macos-app.sh`
- Create: `apps/web/e2e/macos-launch.spec.ts`
- Test: `scripts/smoke-macos-app.sh`

- [ ] **Step 1: Write the black-box smoke flow**

```bash
open -g "outputs/CR.app"
state_file="$HOME/Library/Application Support/CR/service.json"
for attempt in {1..100}; do test -f "$state_file" && break; sleep 0.1; done
test -f "$state_file"
pid="$(jq -r .pid "$state_file")"
port="$(jq -r .port "$state_file")"
token="$(jq -r .token "$state_file")"
curl --fail "http://127.0.0.1:$port/api/health"
first_pid="$pid"
open -g "outputs/CR.app"
sleep 1
test "$(jq -r .pid "$state_file")" = "$first_pid"
curl --fail -H "Authorization: Bearer $token" -H "Origin: http://127.0.0.1:$port" "http://127.0.0.1:$port/api/project/tree"
```

The script must use a temporary CR config directory supplied through a test-only `CR_APP_SUPPORT_DIR`, open the fixture project through a test-only launcher argument, assert a traversal request is rejected, and terminate only the recorded CR PID in cleanup.

- [ ] **Step 2: Run smoke test to expose missing test hooks**

Run: `bash scripts/smoke-macos-app.sh`

Expected: FAIL until launcher and server honor the isolated test config and fixture project arguments.

- [ ] **Step 3: Add bounded test hooks and Playwright launch acceptance**

Accept `CR_APP_SUPPORT_DIR` and `CR_TEST_PROJECT` only when `CR_TEST_MODE=1`; production ignores them. The Playwright test connects to the browser URL captured by the smoke script and repeats the full code jump, Controller view, enum add, reload, and delete workflow.

```ts
test("packaged CR completes the reader workflow", async ({ page }) => {
  await page.goto(process.env.CR_TEST_URL!);
  await expect(page.getByText("mixed-project")).toBeVisible();
  await verifyCodeJump(page);
  await verifyControllers(page, ["/users/:id", "/users/{user_id}"]);
  await verifyEnumPersistence(page, "State");
});
```

- [ ] **Step 4: Run packaged acceptance twice**

Run: `bash scripts/build-macos-app.sh && bash scripts/smoke-macos-app.sh && bash scripts/smoke-macos-app.sh`

Expected: both runs PASS; no CR process or temporary config remains after cleanup.

- [ ] **Step 5: Commit black-box verification**

```bash
git add scripts/smoke-macos-app.sh apps/web/e2e/macos-launch.spec.ts launcher apps/server
git commit -m "test: verify packaged CR launch workflow"
```

### Task 5: Performance fixture, documentation, and final audit

**Files:**
- Create: `scripts/create-performance-fixture.ts`
- Create: `scripts/benchmark.ts`
- Create: `README.md`
- Create: `docs/acceptance/2026-07-22-cr-results.md`
- Modify: `package.json`

- [ ] **Step 1: Write benchmark assertions before generation**

```ts
const result = await benchmark({ files: 20_000, totalBytes: 500 * 1024 * 1024 });
expect(result.initialTreeMs).toBeLessThan(2_000);
expect(result.fullIndexMs).toBeLessThan(30_000);
expect(result.openFileP95Ms).toBeLessThan(300);
expect(result.definitionP95Ms).toBeLessThan(800);
```

- [ ] **Step 2: Verify benchmark setup fails**

Run: `npm run benchmark`

Expected: FAIL because the generator and benchmark entry point are missing.

- [ ] **Step 3: Implement deterministic benchmark and user documentation**

Generate exactly 10,000 Python and 10,000 TypeScript files with seeded imports and definitions; pad comments until the total source size is 500 MiB. Benchmark against a warm local server with 100 file opens and 100 definition requests, calculate nearest-rank P95, and emit JSON under `outputs/benchmark.json`.

README sections must include: product scope, screenshot, requirements for development only, `npm ci`, dev run, tests, `CR.app` build, installation by copying to Applications, first launch, opening/reopening a project, code navigation shortcuts, Controller fields, enum add/delete, local config path, privacy/security, unsigned-app warning, and clean uninstall.

Record exact test/build/smoke/benchmark commands, timestamp, Git commit, macOS version, architecture, Node used for build, result summaries, screenshot paths, and any unmet threshold in `docs/acceptance/2026-07-22-cr-results.md`.

- [ ] **Step 4: Execute the requirement-by-requirement final audit**

Run:

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run e2e -w apps/web
npm run benchmark
bash scripts/build-macos-app.sh
bash scripts/test-macos-bundle.sh outputs/CR.app
bash scripts/smoke-macos-app.sh
git status --short
```

Expected: every command succeeds, benchmark thresholds pass, `CR.app` is valid and smoke-tested, and Git status contains only intentionally ignored `outputs/` artifacts.

- [ ] **Step 5: Commit docs and acceptance evidence**

```bash
git add README.md docs/acceptance scripts/create-performance-fixture.ts scripts/benchmark.ts package.json package-lock.json
git commit -m "docs: add CR build and acceptance evidence"
```

## Plan 3 completion gate

Do not claim completion from unit tests alone. Confirm all six original requirements against current evidence: local project opening; Python/TypeScript viewing; definition jump and history; FastAPI/NestJS input/output display; enum add, source-refresh, restart restore, re-link, and delete; self-contained `CR.app` opening the default browser; concise readable UI at both acceptance widths. Only after every item has direct evidence may the active goal be marked complete.
