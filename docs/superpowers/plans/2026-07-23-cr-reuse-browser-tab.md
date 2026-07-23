# CR Reuse Browser Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make repeated CR App activations refresh only the most recently active connected CR tab, while opening a new default-browser tab when no connected page exists.

**Architecture:** Extend the existing heartbeat clock into a page lifecycle registry that tracks activity order and authenticated server-sent event connections. The launcher asks the local server to refresh an existing page before falling back to `NSWorkspace.shared.open`, while the browser listens for a single `reload` command over an authenticated streaming `fetch`.

**Tech Stack:** Swift 6/AppKit/Foundation, Node.js 22, Express 5, TypeScript 5.9, React 19, Fetch streams/SSE, Vitest, Testing Library, Swift Testing, Bash, Playwright, GitHub REST API.

---

## File map

- Modify `apps/server/src/lifecycle/heartbeat.ts`: own page activity, live command connections, deterministic recent-page selection, and idle cleanup.
- Modify `apps/server/src/lifecycle/heartbeat.test.ts`: specify recent-page selection and disconnect behavior.
- Modify `apps/server/src/app.ts`: expose authenticated page-event and launcher-reopen lifecycle routes.
- Modify `apps/server/src/app.test.ts`: verify route authentication, stream registration, and refresh results.
- Modify `apps/web/src/api/client.ts`: parse authenticated SSE frames from a streaming `fetch`.
- Modify `apps/web/src/api/client.test.ts`: verify headers, frame parsing, and malformed-event handling.
- Modify `apps/web/src/features/lifecycle/PageHeartbeat.tsx`: connect the command stream, reload once per command, and retry recoverable disconnects.
- Modify `apps/web/src/features/lifecycle/PageHeartbeat.test.tsx`: verify reload targeting, cleanup, and existing heartbeat behavior.
- Create `launcher/Sources/CRLauncher/PageReuseCoordinator.swift`: contain the refresh-or-open decision and default-browser activation.
- Create `launcher/Tests/CRLauncherTests/PageReuseCoordinatorTests.swift`: specify Swift request and decision behavior without opening a real browser.
- Modify `launcher/Sources/CRLauncher/ServiceState.swift`: expose the origin and reopen endpoint without duplicating URL construction.
- Modify `launcher/Sources/CRLauncher/ServiceLauncher.swift`: use refresh-or-open only on the reusable-service branch.
- Modify `scripts/smoke-macos-app.sh`: prove a second App activation receives one reload event while reusing the same service.

### Task 1: Select and signal the most recently active server page

**Files:**
- Modify: `apps/server/src/lifecycle/heartbeat.test.ts`
- Modify: `apps/server/src/lifecycle/heartbeat.ts`

- [ ] **Step 1: Write failing lifecycle-registry tests**

Add these focused cases inside the existing `HeartbeatClock` suite:

```ts
it("refreshes only the most recently active connected page", () => {
  let now = 0;
  const clock = new HeartbeatClock({ idleMs: 60_000, now: () => now, onIdle: vi.fn() });
  const first = vi.fn();
  const second = vi.fn();
  clock.beat("page-1");
  const disconnectFirst = clock.connect("page-1", first);
  clock.beat("page-2");
  clock.connect("page-2", second);
  now += 1;
  clock.beat("page-1");

  expect(clock.refreshMostRecent()).toBe(true);
  expect(first).toHaveBeenCalledWith({ type: "reload" });
  expect(second).not.toHaveBeenCalled();
  disconnectFirst();
});

it("skips disconnected pages and reports when none remain", () => {
  const clock = new HeartbeatClock({ idleMs: 60_000, now: () => 0, onIdle: vi.fn() });
  const first = vi.fn();
  const second = vi.fn();
  clock.beat("page-1");
  const disconnectFirst = clock.connect("page-1", first);
  clock.beat("page-2");
  const disconnectSecond = clock.connect("page-2", second);
  disconnectSecond();

  expect(clock.refreshMostRecent()).toBe(true);
  expect(first).toHaveBeenCalledOnce();
  disconnectFirst();
  expect(clock.refreshMostRecent()).toBe(false);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm test --workspace @cr/server -- src/lifecycle/heartbeat.test.ts
```

Expected: FAIL because `connect` and `refreshMostRecent` do not exist.

- [ ] **Step 3: Implement the minimal page registry**

Replace the timestamp-only map with a focused page record while retaining the public methods used by existing tests:

```ts
export type PageCommand = { type: "reload" };

type PageRecord = {
  lastSeen: number;
  activityOrder: number;
  send?: (command: PageCommand) => void;
};

export class HeartbeatClock {
  private readonly pages = new Map<string, PageRecord>();
  private readonly startedAt: number;
  private idleNotified = false;
  private activityOrder = 0;

  constructor(
    private readonly options: {
      idleMs: number;
      now: () => number;
      onIdle: () => void;
    },
  ) {
    this.startedAt = options.now();
  }

  beat(pageId: string): void {
    const current = this.pages.get(pageId);
    this.pages.set(pageId, {
      lastSeen: this.options.now(),
      activityOrder: ++this.activityOrder,
      send: current?.send,
    });
    this.idleNotified = false;
  }

  connect(pageId: string, send: (command: PageCommand) => void): () => void {
    const current = this.pages.get(pageId);
    this.pages.set(pageId, {
      lastSeen: current?.lastSeen ?? this.options.now(),
      activityOrder: current?.activityOrder ?? ++this.activityOrder,
      send,
    });
    return () => {
      const page = this.pages.get(pageId);
      if (page?.send === send) page.send = undefined;
    };
  }

  refreshMostRecent(): boolean {
    const target = [...this.pages.values()]
      .filter((page) => page.send)
      .sort((left, right) => right.activityOrder - left.activityOrder)[0];
    if (!target?.send) return false;
    target.send({ type: "reload" });
    return true;
  }

  close(pageId: string): void {
    this.pages.delete(pageId);
  }

  activePages(): string[] {
    return [...this.pages.keys()];
  }

  sweep(): void {
    const cutoff = this.options.now() - this.options.idleMs;
    for (const [id, page] of this.pages) {
      if (page.lastSeen < cutoff) this.pages.delete(id);
    }
    if (!this.pages.size && this.startedAt < cutoff && !this.idleNotified) {
      this.idleNotified = true;
      this.options.onIdle();
    }
  }
}
```

- [ ] **Step 4: Run the lifecycle tests and verify GREEN**

Run:

```bash
npm test --workspace @cr/server -- src/lifecycle/heartbeat.test.ts
```

Expected: all `HeartbeatClock` tests PASS.

- [ ] **Step 5: Commit the registry behavior**

```bash
git add apps/server/src/lifecycle/heartbeat.ts apps/server/src/lifecycle/heartbeat.test.ts
git commit -m "feat: target most recent CR page"
```

### Task 2: Add authenticated event and reopen routes

**Files:**
- Modify: `apps/server/src/app.test.ts`
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: Write failing route tests**

Import `once` from `node:events`, then extend the session-security test using a real ephemeral HTTP server so the streaming response can be aborted deterministically:

```ts
it("streams page commands and reports whether reopen refreshed a page", async () => {
  let send: ((command: { type: "reload" }) => void) | undefined;
  const heartbeat = {
    beat: vi.fn(),
    close: vi.fn(),
    connect: vi.fn((_id: string, callback: typeof send) => {
      send = callback;
      return vi.fn();
    }),
    refreshMostRecent: vi.fn(() => {
      send?.({ type: "reload" });
      return Boolean(send);
    }),
  };
  const lifecycleApp = createApp({
    token,
    allowedOrigin: () => origin,
    projects: appProjects(),
    settings: await SettingsService.load(path.join(sandbox, "stream-settings.json")),
    heartbeat: heartbeat as never,
  });

  const server = lifecycleApp.listen(0);
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test port");
  const controller = new AbortController();
  try {
    const events = await fetch(
      `http://127.0.0.1:${address.port}/api/lifecycle/pages/page-1/events`,
      {
        headers: { Authorization: `Bearer ${token}`, Origin: origin },
        signal: controller.signal,
      },
    );
    const reader = events.body!.getReader();
    await reader.read();
    const reopened = await fetch(
      `http://127.0.0.1:${address.port}/api/lifecycle/reopen`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Origin: origin },
      },
    );
    const event = new TextDecoder().decode((await reader.read()).value);

    expect(await reopened.json()).toEqual({ refreshed: true });
    expect(event).toContain('data: {"type":"reload"}');
    expect(heartbeat.connect).toHaveBeenCalledWith("page-1", expect.any(Function));
  } finally {
    controller.abort();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("rejects an unauthenticated page event connection", async () => {
  await request(app).get("/api/lifecycle/pages/page-1/events").expect(401);
});
```

- [ ] **Step 2: Run the route tests and verify RED**

Run:

```bash
npm test --workspace @cr/server -- src/app.test.ts
```

Expected: FAIL with 404 for the missing lifecycle routes.

- [ ] **Step 3: Implement the two routes after `requireSession`**

Add explicit page-ID validation and SSE headers:

```ts
app.get("/api/lifecycle/pages/:id/events", (request, response) => {
  const pageId = request.params.id;
  if (!pageId || pageId.length > 128) {
    throw new AppError("INVALID_PAGE_ID", "A valid page id is required.", 400);
  }
  response.status(200);
  response.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  response.flushHeaders();
  response.write(": connected\n\n");
  const disconnect =
    dependencies.heartbeat?.connect(pageId, (command) => {
      response.write(`data: ${JSON.stringify(command)}\n\n`);
    }) ?? (() => undefined);
  response.once("close", disconnect);
});

app.post("/api/lifecycle/reopen", (_request, response) => {
  response.json({
    refreshed: dependencies.heartbeat?.refreshMostRecent() ?? false,
  });
});
```

Keep the beacon close route before the JSON/session middleware; place both new routes after `app.use("/api", requireSession(dependencies))` so browser and launcher requests use the existing session contract.

- [ ] **Step 4: Run server tests and type checking**

Run:

```bash
npm test --workspace @cr/server -- src/app.test.ts src/lifecycle/heartbeat.test.ts
npm run typecheck --workspace @cr/server
```

Expected: all selected tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit the lifecycle API**

```bash
git add apps/server/src/app.ts apps/server/src/app.test.ts
git commit -m "feat: stream CR page refresh commands"
```

### Task 3: Listen for reload commands in the browser

**Files:**
- Modify: `apps/web/src/api/client.test.ts`
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/features/lifecycle/PageHeartbeat.test.tsx`
- Modify: `apps/web/src/features/lifecycle/PageHeartbeat.tsx`

- [ ] **Step 1: Write a failing API stream test**

Add a `ReadableStream` response and verify authenticated parsing:

```ts
it("streams authenticated page reload commands", async () => {
  sessionStorage.setItem("cr.sessionToken", "secret");
  const encoder = new TextEncoder();
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(': connected\n\ndata: {"type":"reload"}\n\n'));
          controller.close();
        },
      }),
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  const commands: Array<{ type: "reload" }> = [];

  await createApiClient(window).listenForPageCommands(
    "page-1",
    (command) => commands.push(command),
    new AbortController().signal,
  );

  expect(commands).toEqual([{ type: "reload" }]);
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/lifecycle/pages/page-1/events",
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer secret" }),
    }),
  );
});
```

Add a second case with `data: not-json\n\n` and assert that no command is emitted.

- [ ] **Step 2: Run the API client test and verify RED**

Run:

```bash
npm test --workspace @cr/web -- src/api/client.test.ts
```

Expected: FAIL because `listenForPageCommands` does not exist.

- [ ] **Step 3: Implement authenticated SSE parsing**

Add the public command type and client method. Parse complete frames across arbitrary chunks, ignore comment frames and malformed payloads, and pass the caller's abort signal:

```ts
export type PageCommand = { type: "reload" };

async function listenForPageCommands(
  pageId: string,
  onCommand: (command: PageCommand) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(
    `/api/lifecycle/pages/${encodeURIComponent(pageId)}/events`,
    { headers: headers(), signal },
  );
  if (!response.ok) {
    throw new ApiError("PAGE_EVENTS_FAILED", "CR page events are unavailable.", response.status);
  }
  if (!response.body) {
    throw new ApiError("PAGE_EVENTS_FAILED", "CR page events are unavailable.", 500);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      try {
        const parsed = JSON.parse(data) as { type?: unknown };
        if (parsed.type === "reload") onCommand({ type: "reload" });
      } catch {
        // Ignore malformed local event frames; the next valid frame remains usable.
      }
    }
    if (done) return;
  }
}
```

Expose it from `createApiClient` as:

```ts
listenForPageCommands,
```

- [ ] **Step 4: Run the API tests and verify GREEN**

Run:

```bash
npm test --workspace @cr/web -- src/api/client.test.ts
```

Expected: all API client tests PASS.

- [ ] **Step 5: Write failing `PageHeartbeat` reload tests**

Extend the test fake and inject a reload callback:

```tsx
it("reloads once when its page receives a reload command", async () => {
  const reload = vi.fn();
  const listenForPageCommands = vi.fn(
    async (
      _pageId: string,
      onCommand: (command: { type: "reload" }) => void,
      signal: AbortSignal,
    ) => {
      onCommand({ type: "reload" });
      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
    },
  );
  const view = render(
    <ApiProvider
      client={{
        heartbeat: vi.fn().mockResolvedValue(undefined),
        closePage: vi.fn().mockReturnValue(true),
        listenForPageCommands,
      } as unknown as ApiClient}
    >
      <PageHeartbeat reload={reload} />
    </ApiProvider>,
  );

  await waitFor(() => expect(reload).toHaveBeenCalledOnce());
  view.unmount();
});
```

Update the existing heartbeat test fake with a listener that remains pending until its signal is aborted, then assert unmount aborts it.

- [ ] **Step 6: Run the component test and verify RED**

Run:

```bash
npm test --workspace @cr/web -- src/features/lifecycle/PageHeartbeat.test.tsx
```

Expected: FAIL because `reload` and `listenForPageCommands` are not wired.

- [ ] **Step 7: Implement page command listening with capped retry**

Import `ApiError`, keep a stable default reload function, and replace `PageHeartbeat` with this complete abortable command loop plus the existing heartbeat behavior:

```tsx
import { useEffect, useRef } from "react";
import { useApi } from "../../api/ApiProvider.js";
import { ApiError } from "../../api/client.js";

const reloadWindow = () => window.location.reload();

export function PageHeartbeat({
  reload = reloadWindow,
}: {
  reload?: () => void;
}) {
  const api = useApi();
  const pageId = useRef(crypto.randomUUID());
  const lastActivityBeat = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    let retryDelay = 250;
    const beat = () => {
      if (document.visibilityState !== "hidden") void api.heartbeat(pageId.current);
    };
    const activity = () => {
      const now = Date.now();
      if (now - lastActivityBeat.current < 30_000) return;
      lastActivityBeat.current = now;
      beat();
    };
    const close = () => api.closePage(pageId.current);
    const listen = async (): Promise<void> => {
      while (!stopped) {
        try {
          await api.listenForPageCommands(
            pageId.current,
            (command) => {
              if (command.type === "reload") reload();
            },
            controller.signal,
          );
          retryDelay = 250;
        } catch (error) {
          if (controller.signal.aborted) return;
          if (error instanceof ApiError && [401, 403].includes(error.status)) return;
        }
        if (stopped) return;
        await new Promise((resolve) => window.setTimeout(resolve, retryDelay));
        retryDelay = Math.min(retryDelay * 2, 5_000);
      }
    };

    beat();
    void listen();
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    window.addEventListener("beforeunload", close);
    document.addEventListener("visibilitychange", beat);
    const interval = window.setInterval(beat, 60_000);
    return () => {
      stopped = true;
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("beforeunload", close);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [api, reload]);

  return null;
}
```

- [ ] **Step 8: Run web tests and type checking**

Run:

```bash
npm test --workspace @cr/web -- src/api/client.test.ts src/features/lifecycle/PageHeartbeat.test.tsx
npm run typecheck --workspace @cr/web
```

Expected: selected tests PASS and TypeScript exits 0.

- [ ] **Step 9: Commit the browser listener**

```bash
git add apps/web/src/api/client.ts apps/web/src/api/client.test.ts apps/web/src/features/lifecycle/PageHeartbeat.tsx apps/web/src/features/lifecycle/PageHeartbeat.test.tsx
git commit -m "feat: reload targeted CR browser page"
```

### Task 4: Refresh before opening from the macOS launcher

**Files:**
- Create: `launcher/Sources/CRLauncher/PageReuseCoordinator.swift`
- Create: `launcher/Tests/CRLauncherTests/PageReuseCoordinatorTests.swift`
- Modify: `launcher/Sources/CRLauncher/ServiceState.swift`
- Modify: `launcher/Sources/CRLauncher/ServiceLauncher.swift`

- [ ] **Step 1: Write failing Swift coordinator tests**

Specify the decision without touching `NSWorkspace`:

```swift
import Foundation
import Testing
@testable import CRLauncher

@Suite(.serialized)
@MainActor
struct PageReuseCoordinatorTests {
  @Test
  func refreshesAndActivatesWithoutOpeningURL() async {
    let recorder = BrowserRecorder()
    let coordinator = PageReuseCoordinator(
      requestRefresh: { _ in true },
      open: { recorder.opened.append($0); return true },
      activate: { recorder.activated.append($0) }
    )
    let state = serviceState()

    #expect(await coordinator.reuse(state))
    #expect(recorder.opened.isEmpty)
    #expect(recorder.activated == [state.launchURL])
  }

  @Test
  func opensURLWhenNoConnectedPageCanRefresh() async {
    let recorder = BrowserRecorder()
    let coordinator = PageReuseCoordinator(
      requestRefresh: { _ in false },
      open: { recorder.opened.append($0); return true },
      activate: { recorder.activated.append($0) }
    )
    let state = serviceState()

    #expect(await coordinator.reuse(state))
    #expect(recorder.opened == [state.launchURL])
    #expect(recorder.activated.isEmpty)
  }

  private func serviceState() -> ServiceState {
    ServiceState(pid: 1, port: 43123, token: "secret", uid: getuid(), executable: "/runtime/node")
  }
}

@MainActor
private final class BrowserRecorder {
  var opened: [URL] = []
  var activated: [URL] = []
}
```

Add a request-construction test using an injected transport and assert:

```swift
@Test
func sendsAuthenticatedRefreshRequest() async {
  let state = serviceState()
  var captured: URLRequest?
  let result = await PageReuseCoordinator.requestRefresh(state) { request in
    captured = request
    let response = HTTPURLResponse(
      url: request.url!,
      statusCode: 200,
      httpVersion: nil,
      headerFields: ["Content-Type": "application/json"]
    )!
    return (Data(#"{"refreshed":true}"#.utf8), response)
  }

  #expect(result)
  #expect(captured?.url == state.reopenURL)
  #expect(captured?.httpMethod == "POST")
  #expect(captured?.value(forHTTPHeaderField: "Authorization") == "Bearer secret")
  #expect(captured?.value(forHTTPHeaderField: "Origin") == state.origin)
}
```

- [ ] **Step 2: Run Swift tests and verify RED**

Run:

```bash
bash scripts/test-swift-launcher.sh
```

Expected: build FAIL because `PageReuseCoordinator`, `ServiceState.origin`, and `ServiceState.reopenURL` do not exist.

- [ ] **Step 3: Add service endpoint URLs**

Extend `ServiceState`:

```swift
var origin: String {
  "http://127.0.0.1:\(port)"
}

var reopenURL: URL {
  URL(string: "\(origin)/api/lifecycle/reopen")!
}

var launchURL: URL {
  var components = URLComponents(string: origin)!
  components.path = "/"
  components.queryItems = [URLQueryItem(name: "token", value: token)]
  return components.url!
}
```

Replace the existing `launchURL` implementation with the version above so host and port have one source of truth.

- [ ] **Step 4: Implement the coordinator and system browser adapter**

Create a main-actor coordinator with injectable closures:

```swift
import AppKit
import Foundation

private struct RefreshResponse: Decodable {
  let refreshed: Bool
}

@MainActor
struct PageReuseCoordinator {
  let requestRefresh: (ServiceState) async -> Bool
  let open: (URL) -> Bool
  let activate: (URL) -> Void

  func reuse(_ state: ServiceState) async -> Bool {
    if await requestRefresh(state) {
      activate(state.launchURL)
      return true
    }
    return open(state.launchURL)
  }

  func openNew(_ state: ServiceState) -> Bool {
    open(state.launchURL)
  }

  static func requestRefresh(
    _ state: ServiceState,
    transport: (URLRequest) async throws -> (Data, URLResponse)
  ) async -> Bool {
    var request = URLRequest(url: state.reopenURL)
    request.httpMethod = "POST"
    request.timeoutInterval = 2
    request.setValue("Bearer \(state.token)", forHTTPHeaderField: "Authorization")
    request.setValue(state.origin, forHTTPHeaderField: "Origin")
    do {
      let (data, response) = try await transport(request)
      guard (response as? HTTPURLResponse)?.statusCode == 200 else { return false }
      return (try? JSONDecoder().decode(RefreshResponse.self, from: data).refreshed) == true
    } catch {
      return false
    }
  }

  static var system: PageReuseCoordinator {
    PageReuseCoordinator(
      requestRefresh: { state in
        await PageReuseCoordinator.requestRefresh(state) { request in
          try await URLSession.shared.data(for: request)
        }
      },
      open: { NSWorkspace.shared.open($0) },
      activate: { url in
        guard
          let applicationURL = NSWorkspace.shared.urlForApplication(toOpen: url),
          let bundleIdentifier = Bundle(url: applicationURL)?.bundleIdentifier,
          let application = NSRunningApplication
            .runningApplications(withBundleIdentifier: bundleIdentifier)
            .first
        else { return }
        _ = application.activate(options: [.activateIgnoringOtherApps])
      }
    )
  }
}
```

Keep `NSWorkspace.shared.open` exclusively in the injected system `open` closure so repository hygiene continues to verify default-browser support.

- [ ] **Step 5: Wire reusable and new-service branches**

Add the coordinator as an injectable `ServiceLauncher` dependency with `.system` default. Change only the two browser actions:

```swift
@MainActor
final class ServiceLauncher {
  private let resources: URL
  private let support: URL
  private let pageReuse: PageReuseCoordinator

  init(
    resources: URL = Bundle.main.resourceURL!,
    pageReuse: PageReuseCoordinator = .system
  ) throws {
    self.resources = resources
    self.pageReuse = pageReuse
    if ProcessInfo.processInfo.environment["CR_TEST_MODE"] == "1",
       let testSupport = ProcessInfo.processInfo.environment["CR_APP_SUPPORT_DIR"] {
      support = URL(fileURLWithPath: testSupport, isDirectory: true)
    } else {
      let base = try FileManager.default.url(
        for: .applicationSupportDirectory,
        in: .userDomainMask,
        appropriateFor: nil,
        create: true
      )
      support = base.appendingPathComponent("CR", isDirectory: true)
    }
    try FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
  }
}

if let state = try? loadState(stateURL), validator.isReusable(state), await healthy(state) {
  guard await pageReuse.reuse(state) else { throw LauncherError.serviceUnavailable }
  return
}
```

For a newly started service:

```swift
guard await healthy(state), pageReuse.openNew(state) else {
  process.terminate()
  throw LauncherError.serviceUnavailable
}
```

- [ ] **Step 6: Run Swift tests and verify GREEN**

Run:

```bash
bash scripts/test-swift-launcher.sh
```

Expected: all Swift tests PASS, including refresh success, no-page fallback, request headers, and existing application lifecycle tests.

- [ ] **Step 7: Commit the launcher behavior**

```bash
git add launcher/Sources/CRLauncher/PageReuseCoordinator.swift launcher/Sources/CRLauncher/ServiceState.swift launcher/Sources/CRLauncher/ServiceLauncher.swift launcher/Tests/CRLauncherTests/PageReuseCoordinatorTests.swift
git commit -m "feat: reuse active CR browser tab"
```

### Task 5: Add end-to-end macOS smoke coverage

**Files:**
- Modify: `scripts/smoke-macos-app.sh`

- [ ] **Step 1: Register a synthetic active page in the smoke test**

After the service security checks, start an authenticated event stream and send its heartbeat:

```bash
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
```

Initialize `events_pid=""` with the other PID variables, add this exact cleanup block, and poll until the stream is connected:

```bash
if [[ "$events_pid" =~ ^[0-9]+$ ]] && kill -0 "$events_pid" 2>/dev/null; then
  kill "$events_pid" 2>/dev/null || true
fi

for _ in {1..50}; do
  grep -q 'connected' "$events_file" && break
  sleep 0.1
done
grep -q 'connected' "$events_file"
```

- [ ] **Step 2: Assert second activation emits reload and reuses the service**

Replace the fixed `sleep 0.5` reopen assertion with bounded polling:

```bash
open "$app_path"
for _ in {1..50}; do
  grep -q '"type":"reload"' "$events_file" && break
  sleep 0.1
done
grep -q '"type":"reload"' "$events_file"
reload_count="$(grep -o '"type":"reload"' "$events_file" | wc -l | tr -d ' ')"
test "$reload_count" = "1"
second_pid="$("$app_path/Contents/Resources/runtime/node" -e \
  'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).pid)' \
  "$state_file")"
test "$second_pid" = "$service_pid"
```

- [ ] **Step 3: Build and run the smoke test**

Run:

```bash
bash scripts/build-macos-app.sh
bash scripts/smoke-macos-app.sh
```

Expected: every smoke checkpoint reaches `complete`; the event log contains exactly one reload command for the synthetic most-recent page and the service PID remains unchanged.

- [ ] **Step 4: Commit smoke coverage**

```bash
git add scripts/smoke-macos-app.sh
git commit -m "test: cover CR browser tab reuse"
```

### Task 6: Run complete verification and deliver CR.app

**Files:**
- Verify: all tracked source files
- Rebuild: `outputs/CR.app`
- Replace: shared `outputs/CR.app` in the primary worktree

- [ ] **Step 1: Run all source verification**

Run:

```bash
npm test
npm run typecheck
npm run build
npm run e2e --workspace @cr/web
bash scripts/test-swift-launcher.sh
```

Expected: repository hygiene and all workspace tests PASS, type checking and builds exit 0, all Playwright tests PASS, and all Swift tests PASS.

- [ ] **Step 2: Build, smoke-test, and verify the signed app**

Run:

```bash
bash scripts/build-macos-app.sh
bash scripts/smoke-macos-app.sh
codesign --verify --deep --strict --verbose=2 outputs/CR.app
```

Expected: build and smoke checkpoints PASS and strict signature verification exits 0.

- [ ] **Step 3: Stop only the shared CR instance and replace it**

Run:

```bash
delivery_root="$(git worktree list --porcelain | awk '/^worktree / { print substr($0, 10); exit }')"
delivery_app="$delivery_root/outputs/CR.app"
xcrun swift -e 'import AppKit
let executable = CommandLine.arguments[1]
for app in NSRunningApplication.runningApplications(withBundleIdentifier: "com.local.cr")
where app.executableURL?.path == executable {
  _ = app.terminate()
}' "$delivery_app/Contents/MacOS/CR"
ditto outputs/CR.app "$delivery_app"
codesign --verify --deep --strict --verbose=2 "$delivery_app"
```

Expected: only the previous shared CR launcher is terminated; the new signed bundle replaces it successfully.

- [ ] **Step 4: Perform real default-browser acceptance**

Launch the shared `delivery_app`, record the current CR tab count in the system default browser, then activate `delivery_app` again. Verify:

```text
first activation: one CR tab exists
second activation: CR tab count is unchanged
second activation: the existing page reloads
two-page case: only the page with the latest pointer or keyboard activity reloads
closed-page case: a new CR tab opens
```

Use Computer Use only for acceptance observation; do not add browser-specific automation or identifiers to product code. Leave the final CR App running in the Dock.

### Task 7: Publish the verified source tree to GitHub

**Files:**
- Publish: tracked changes after local publication base `17e71544`
- Remote: `fan0902/CodeReview`, branch `main`

- [ ] **Step 1: Confirm clean local scope and unchanged remote base tree**

Run:

```bash
git status --short --branch
git diff --check 17e71544 HEAD
remote_head="$(gh api repos/fan0902/CodeReview/git/ref/heads/main --jq '.object.sha')"
remote_tree="$(gh api "repos/fan0902/CodeReview/git/commits/$remote_head" --jq '.tree.sha')"
expected_base_tree="$(git rev-parse 17e71544^{tree})"
test "$remote_tree" = "$expected_base_tree"
```

Expected: `.superpowers/` is the only untracked path, no tracked changes remain, `git diff --check` exits 0, and remote main still has the same source tree as local publication base. Stop rather than overwrite if the remote tree changed.

- [ ] **Step 2: Create blobs and a Git tree for every changed tracked file**

Run:

```bash
tree_entries='[]'
while IFS= read -r changed_path; do
  encoded="$(base64 < "$changed_path" | tr -d '\n')"
  blob_sha="$(
    jq -n --arg content "$encoded" '{content:$content,encoding:"base64"}' |
      gh api --method POST repos/fan0902/CodeReview/git/blobs --input - --jq '.sha'
  )"
  tree_entries="$(
    jq --arg path "$changed_path" --arg sha "$blob_sha" \
      '. + [{path:$path,mode:"100644",type:"blob",sha:$sha}]' \
      <<<"$tree_entries"
  )"
done < <(git diff --name-only --diff-filter=ACMRT 17e71544 HEAD)

published_tree="$(
  jq -n --arg base_tree "$remote_tree" --argjson tree "$tree_entries" \
    '{base_tree:$base_tree,tree:$tree}' |
    gh api --method POST repos/fan0902/CodeReview/git/trees --input - --jq '.sha'
)"
```

Expected: each changed source, test, script, spec, and plan has a blob SHA, and `published_tree` is non-empty.

- [ ] **Step 3: Create and advance the remote commit without force**

Run:

```bash
published_commit="$(
  jq -n \
    --arg message "feat: reuse active CR browser tab" \
    --arg tree "$published_tree" \
    --arg parent "$remote_head" \
    '{message:$message,tree:$tree,parents:[$parent]}' |
    gh api --method POST repos/fan0902/CodeReview/git/commits --input - --jq '.sha'
)"
jq -n --arg sha "$published_commit" '{sha:$sha,force:false}' |
  gh api --method PATCH repos/fan0902/CodeReview/git/refs/heads/main --input -
```

Expected: GitHub advances `main` without force and returns the new ref.

- [ ] **Step 4: Verify remote and local trees match exactly**

Run:

```bash
remote_main="$(gh api repos/fan0902/CodeReview/git/ref/heads/main --jq '.object.sha')"
remote_tree="$(gh api "repos/fan0902/CodeReview/git/commits/$remote_main" --jq '.tree.sha')"
local_tree="$(git rev-parse HEAD^{tree})"
test "$remote_tree" = "$local_tree"
printf 'remote_main=%s\nremote_tree=%s\nlocal_tree=%s\n' \
  "$remote_main" "$remote_tree" "$local_tree"
```

Expected: the equality check exits 0 and the printed remote and local tree SHAs are identical.
