# CR Command+Click Definition Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CR navigate to a definition only after Command+left-click or F12, while preserving Command-based history back and forward.

**Architecture:** `CodeViewer` will stop navigating from Monaco's definition-provider lookup path and will own an explicit mouse-down listener instead. One shared `openDefinition` function will serve Command+click and F12, reading the latest source location from a ref so model switches cannot leave a stale path in the listener.

**Tech Stack:** React 19, TypeScript, Monaco Editor, Vitest, Testing Library, Playwright

---

## File map

- Modify `apps/web/src/features/files/CodeViewer.tsx`: replace the side-effecting definition provider with an explicit Command+left-click listener and preserve F12/history commands.
- Modify `apps/web/src/features/files/CodeViewer.test.tsx`: model Monaco mouse events and assert click gating, listener disposal, F12, back, and forward commands.
- Modify `apps/web/e2e/reader.spec.ts`: exercise Command hover, Command+click, history back, and history forward in a real Monaco editor.
- Rebuild `outputs/CR.app` in the feature worktree, then replace the primary worktree's `outputs/CR.app` after all verification passes.

### Task 1: Specify explicit definition navigation with failing tests

**Files:**
- Modify: `apps/web/src/features/files/CodeViewer.test.tsx`
- Modify: `apps/web/e2e/reader.spec.ts`

- [ ] **Step 1: Replace the Monaco test double with mouse-event support**

Update `monacoState` so tests can invoke the editor's mouse listener and inspect its disposal:

```tsx
const monacoState = vi.hoisted(() => ({
  mouseDown: null as null | ((event: {
    event: { metaKey: boolean; leftButton: boolean };
    target: { position: { lineNumber: number; column: number } | null };
  }) => void),
  mouseDisposable: { dispose: vi.fn() },
  commands: new Map<number, () => void | Promise<void>>(),
}));
```

Add `onMouseDown` to the editor double and use non-overlapping modifier constants:

```tsx
onMouseDown: vi.fn((listener: typeof monacoState.mouseDown) => {
  monacoState.mouseDown = listener;
  return monacoState.mouseDisposable;
}),
```

```tsx
KeyMod: { CtrlCmd: 256, Shift: 512 },
KeyCode: { F12: 3, Minus: 4 },
```

Reset `mouseDown` and `mouseDisposable.dispose` in `afterEach`.

- [ ] **Step 2: Write the failing Command+click gating tests**

Replace the provider-driven test with this Command+left-click test:

```tsx
it("opens a definition only after Command+left-click", async () => {
  const onNavigate = vi.fn();
  const api = fakeApi({
    getFile: vi.fn().mockResolvedValue({
      path: "nest/src/users.controller.ts",
      content: "const user: UserDto = value;",
    }),
    definition: vi.fn().mockResolvedValue({
      path: "nest/src/user.dto.ts",
      line: 1,
      column: 14,
    }),
  });
  renderViewer(api, onNavigate);
  await screen.findByText(/UserDto/);

  await act(async () => {
    monacoState.mouseDown?.({
      event: { metaKey: true, leftButton: true },
      target: { position: { lineNumber: 1, column: 13 } },
    });
  });

  expect(api.definition).toHaveBeenCalledWith({
    path: "nest/src/users.controller.ts",
    line: 1,
    column: 13,
  });
  expect(onNavigate).toHaveBeenCalledWith({
    path: "nest/src/user.dto.ts",
    line: 1,
    column: 14,
  });
});
```

Add one parameterized negative test covering plain click, right click, and missing position:

```tsx
it.each([
  [{ metaKey: false, leftButton: true }, { lineNumber: 1, column: 13 }],
  [{ metaKey: true, leftButton: false }, { lineNumber: 1, column: 13 }],
  [{ metaKey: true, leftButton: true }, null],
])("does not resolve a definition for an incomplete Command click", async (event, position) => {
  const api = fakeApi({
    getFile: vi.fn().mockResolvedValue({
      path: "nest/src/users.controller.ts",
      content: "const user: UserDto = value;",
    }),
  });
  renderViewer(api, vi.fn());
  await screen.findByText(/UserDto/);

  await act(async () => {
    monacoState.mouseDown?.({ event, target: { position } });
  });

  expect(api.definition).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Add command-registration and cleanup tests**

Extend `renderViewer` to accept optional `onBack` and `onForward` callbacks. Add:

```tsx
it("keeps F12, Command-minus, and Command-Shift-minus navigation", async () => {
  const onNavigate = vi.fn();
  const onBack = vi.fn();
  const onForward = vi.fn();
  const api = fakeApi({
    getFile: vi.fn().mockResolvedValue({ path: "nest/src/users.controller.ts", content: "UserDto" }),
    definition: vi.fn().mockResolvedValue({ path: "nest/src/user.dto.ts", line: 1, column: 1 }),
  });
  renderViewer(api, onNavigate, onBack, onForward);
  await screen.findByText("UserDto");

  await act(async () => { await monacoState.commands.get(3)?.(); });
  monacoState.commands.get(256 | 4)?.();
  monacoState.commands.get(256 | 512 | 4)?.();

  expect(onNavigate).toHaveBeenCalled();
  expect(onBack).toHaveBeenCalledOnce();
  expect(onForward).toHaveBeenCalledOnce();
});

it("disposes the Command-click listener on unmount", async () => {
  const view = renderViewer(
    fakeApi({ getFile: vi.fn().mockResolvedValue({ path: "a.ts", content: "value" }) }),
    vi.fn(),
  );
  await screen.findByText("value");
  view.unmount();
  expect(monacoState.mouseDisposable.dispose).toHaveBeenCalled();
});
```

- [ ] **Step 4: Change the browser acceptance flow before production code**

In `apps/web/e2e/reader.spec.ts`, replace the initial click-then-F12 sequence with:

```ts
const sourceTab = page.getByRole("tab", { name: "users.controller.ts" });
const returnTypeLine = page.locator(".view-line").filter({ hasText: "Promise<UserDto>" });
const userDto = returnTypeLine.getByText("UserDto", { exact: true });

await page.keyboard.down("Meta");
await userDto.hover();
await expect(sourceTab).toHaveAttribute("aria-selected", "true");
await userDto.click();
await page.keyboard.up("Meta");

await expect(page.getByRole("tab", { name: "user.dto.ts" })).toHaveAttribute(
  "aria-selected",
  "true",
);
await page.keyboard.press("Meta+-");
await expect(sourceTab).toHaveAttribute("aria-selected", "true");
await page.keyboard.press("Meta+Shift+-");
await expect(page.getByRole("tab", { name: "user.dto.ts" })).toHaveAttribute(
  "aria-selected",
  "true",
);
```

Keep the remaining Controller and enum acceptance steps unchanged.

- [ ] **Step 5: Run the focused tests and verify RED**

Run:

```bash
npm test --workspace @cr/web -- CodeViewer.test.tsx
npm run e2e --workspace @cr/web -- reader.spec.ts
```

Expected: the component test fails because the current editor never registers `onMouseDown`; the browser test fails because Command hover still navigates before the click.

### Task 2: Implement Command+left-click without provider side effects

**Files:**
- Modify: `apps/web/src/features/files/CodeViewer.tsx`
- Test: `apps/web/src/features/files/CodeViewer.test.tsx`
- Test: `apps/web/e2e/reader.spec.ts`

- [ ] **Step 1: Track the latest location and mouse listener**

Replace the provider disposable ref with these refs near the top of `CodeViewer`:

```tsx
const locationRef = useRef(location);
const mouseDisposableRef = useRef<{ dispose(): void } | null>(null);
locationRef.current = location;
```

- [ ] **Step 2: Replace the side-effecting Definition Provider**

Inside `handleMount`, remove `registerDefinitionProvider`. Define `openDefinition` using the latest source path, then register the explicit listener:

```tsx
const openDefinition = async (position: { lineNumber: number; column: number }) => {
  const target = await api.definition({
    path: locationRef.current.path,
    line: position.lineNumber,
    column: position.column,
  });
  if (target) onNavigate(target);
};

mouseDisposableRef.current?.dispose();
mouseDisposableRef.current = editor.onMouseDown((event) => {
  const position = event.target.position;
  if (!event.event.metaKey || !event.event.leftButton || !position) return;
  void openDefinition(position);
});
```

Keep the existing F12 and history commands immediately after the listener registration.

- [ ] **Step 3: Dispose the correct listener**

Replace the unmount effect with:

```tsx
useEffect(() => () => mouseDisposableRef.current?.dispose(), []);
```

- [ ] **Step 4: Run focused component tests and verify GREEN**

Run:

```bash
npm test --workspace @cr/web -- CodeViewer.test.tsx
```

Expected: all `CodeViewer` tests pass, including Command+click gating, F12/history commands, and disposal.

- [ ] **Step 5: Run the real-browser regression and verify GREEN**

Run:

```bash
npm run e2e --workspace @cr/web -- reader.spec.ts
```

Expected: the reader test passes; Command hover keeps `users.controller.ts` active, Command+click opens `user.dto.ts`, and back/forward shortcuts switch between them.

- [ ] **Step 6: Commit the behavior change**

```bash
git add apps/web/src/features/files/CodeViewer.tsx apps/web/src/features/files/CodeViewer.test.tsx apps/web/e2e/reader.spec.ts
git commit -m "fix: require command click for definition navigation"
```

### Task 3: Verify, rebuild, and replace the shared CR.app

**Files:**
- Verify: all tracked source and tests
- Rebuild: `outputs/CR.app`
- Replace: primary worktree `outputs/CR.app`

- [ ] **Step 1: Run complete repository verification**

```bash
npm test
npm run typecheck
npm run build
npm run e2e --workspace @cr/web
bash scripts/test-swift-launcher.sh
bash scripts/test-repository-hygiene.sh
git diff --check
```

Expected: Server 38, Web tests including the new CodeViewer cases, Contracts 1, Playwright 4, and Swift 9 all pass; typecheck, build, hygiene, and whitespace checks exit zero. `.superpowers/` remains the only untracked path.

- [ ] **Step 2: Stop only the currently shared CR launcher**

```bash
delivery_root="$(git worktree list --porcelain | awk '/^worktree / { print substr($0, 10); exit }')"
delivery_app="$delivery_root/outputs/CR.app"
xcrun swift -e 'import AppKit
let executable = CommandLine.arguments[1]
for app in NSRunningApplication.runningApplications(withBundleIdentifier: "com.local.cr")
where app.executableURL?.path == executable {
  _ = app.terminate()
}' "$delivery_app/Contents/MacOS/CR"
```

Expected: only the shared CR launcher and its validated local service terminate.

- [ ] **Step 3: Build, sign, and smoke-test the worktree app**

```bash
bash scripts/build-macos-app.sh
bash scripts/test-macos-bundle.sh outputs/CR.app
bash scripts/smoke-macos-app.sh
codesign --verify --deep --strict --verbose=2 outputs/CR.app
```

Expected: bundle structure, signature, service, path security, Dock lifecycle, and page reuse checks pass.

- [ ] **Step 4: Replace and start the shared app**

```bash
delivery_root="$(git worktree list --porcelain | awk '/^worktree / { print substr($0, 10); exit }')"
delivery_app="$delivery_root/outputs/CR.app"
ditto outputs/CR.app "$delivery_app"
codesign --verify --deep --strict --verbose=2 "$delivery_app"
open "$delivery_app"
```

Expected: the shared app starts, opens or refreshes the default-browser CR page, and `/api/health` returns `{"status":"ready","name":"CR","version":"0.1.0"}`.

- [ ] **Step 5: Perform packaged-app acceptance**

In the real default browser:

1. Open a Python or TypeScript project and a file containing a resolvable symbol.
2. Hold Command and hover the symbol; confirm the active file does not change.
3. Command+left-click the symbol; confirm the definition opens.
4. Press `Command + -`; confirm CR returns to the source location.
5. Press `Command + Shift + -`; confirm CR moves forward to the definition.
6. Place the cursor on a resolvable symbol and press F12; confirm it still opens the definition.

Expected: explicit Command+click and F12 navigate; Command hover and ordinary clicks do not; history shortcuts work in both directions.
