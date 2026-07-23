# CR Resizable Information Panel and Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent draggable information-panel width, keep Controller and Enum analysis out of nested `.worktrees`, and bind navigation history to the macOS Control-minus shortcuts.

**Architecture:** The web workspace store owns the saved panel width, a focused helper validates persistence and clamping, and `AppShell` manages pointer dragging while CSS consumes a custom property. The server index extends its one ignored-path rule so both initial discovery and watcher events exclude `.worktrees`. Monaco keeps the existing history callbacks but registers them with the physical Control modifier.

**Tech Stack:** React 19, Zustand, TypeScript, CSS Grid, Monaco Editor, Express index service, Vitest, Testing Library, Playwright, Swift launcher scripts.

---

## File Structure

- Create `apps/web/src/components/layout/information-panel-width.ts`: width constants, validation, clamping, and local-storage helpers.
- Create `apps/web/src/components/layout/information-panel-width.test.ts`: focused persistence and clamping coverage.
- Modify `apps/web/src/state/workspace-store.ts`: own `rightPanelWidth` and persist width changes.
- Modify `apps/web/src/App.tsx`: pass width state and resize callback into the application shell.
- Modify `apps/web/src/components/layout/AppShell.tsx`: render the separator and manage pointer drag lifecycle.
- Modify `apps/web/src/components/layout/AppShell.test.tsx`: prove drag updates and persisted store state.
- Modify `apps/web/src/styles/layout.css`: base grid custom property and resizer geometry.
- Modify `apps/web/src/styles/branch-review-theme.css`: final themed grid and desktop/mobile resizer presentation.
- Create `apps/server/src/analysis/index-service.test.ts`: prove nested worktree sources never enter the index.
- Modify `apps/server/src/analysis/index-service.ts`: exclude `.worktrees` in discovery and watcher paths.
- Modify `apps/web/src/features/files/CodeViewer.test.tsx`: require physical Control shortcut registrations.
- Modify `apps/web/src/features/files/CodeViewer.tsx`: use Monaco `WinCtrl` for back and forward.
- Modify `apps/web/e2e/reader.spec.ts`: exercise Control-minus history in a real Monaco editor.
- Create `apps/web/e2e/information-panel-resize.spec.ts`: exercise drag and reload persistence.
- Modify `README.md`: document the exact back and forward shortcuts.

### Task 1: Add panel-width rules and persistence

**Files:**
- Create: `apps/web/src/components/layout/information-panel-width.ts`
- Create: `apps/web/src/components/layout/information-panel-width.test.ts`
- Modify: `apps/web/src/state/workspace-store.ts`

- [ ] **Step 1: Write failing helper tests**

Create tests that express the saved-width contract before the helper exists:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_INFORMATION_PANEL_WIDTH,
  clampInformationPanelWidth,
  readInformationPanelWidth,
  writeInformationPanelWidth,
} from "./information-panel-width.js";

describe("information panel width", () => {
  it("clamps the panel between 320 pixels and half the workspace", () => {
    expect(clampInformationPanelWidth(200, 1440)).toBe(320);
    expect(clampInformationPanelWidth(540, 1440)).toBe(540);
    expect(clampInformationPanelWidth(900, 1440)).toBe(720);
  });

  it("persists a valid width and rejects invalid saved values", () => {
    const storage = new MapStorage();
    writeInformationPanelWidth(536, storage);
    expect(readInformationPanelWidth(storage)).toBe(536);
    storage.setItem("cr.informationPanelWidth", "not-a-number");
    expect(readInformationPanelWidth(storage)).toBe(DEFAULT_INFORMATION_PANEL_WIDTH);
  });
});

class MapStorage implements Pick<Storage, "getItem" | "setItem"> {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}
```

- [ ] **Step 2: Run the helper test and verify RED**

Run:

```bash
npm test -w apps/web -- information-panel-width.test.ts
```

Expected: FAIL because `information-panel-width.ts` does not exist.

- [ ] **Step 3: Implement the minimal helper**

Create the constants and functions with guarded storage access:

```ts
export const DEFAULT_INFORMATION_PANEL_WIDTH = 420;
export const MIN_INFORMATION_PANEL_WIDTH = 320;
export const INFORMATION_PANEL_STORAGE_KEY = "cr.informationPanelWidth";

type WidthStorage = Pick<Storage, "getItem" | "setItem">;

export function clampInformationPanelWidth(width: number, workspaceWidth: number): number {
  const maximum = Math.max(
    MIN_INFORMATION_PANEL_WIDTH,
    Math.floor(workspaceWidth * 0.5),
  );
  return Math.round(Math.min(maximum, Math.max(MIN_INFORMATION_PANEL_WIDTH, width)));
}

export function readInformationPanelWidth(
  storage: WidthStorage | undefined = safeStorage(),
): number {
  if (!storage) return DEFAULT_INFORMATION_PANEL_WIDTH;
  const width = Number(storage.getItem(INFORMATION_PANEL_STORAGE_KEY));
  return Number.isFinite(width) && width >= MIN_INFORMATION_PANEL_WIDTH
    ? Math.round(width)
    : DEFAULT_INFORMATION_PANEL_WIDTH;
}

export function writeInformationPanelWidth(
  width: number,
  storage: WidthStorage | undefined = safeStorage(),
): void {
  storage?.setItem(INFORMATION_PANEL_STORAGE_KEY, String(Math.round(width)));
}

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
```

Extend `WorkspaceState` with `rightPanelWidth` and `setRightPanelWidth`. Initialize it from `readInformationPanelWidth()` and persist from the setter:

```ts
rightPanelWidth: readInformationPanelWidth(),
setRightPanelWidth: (width) => {
  writeInformationPanelWidth(width);
  set({ rightPanelWidth: width });
},
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npm test -w apps/web -- information-panel-width.test.ts
```

Expected: the new tests pass.

- [ ] **Step 5: Commit the width model**

```bash
git add apps/web/src/components/layout/information-panel-width.ts \
  apps/web/src/components/layout/information-panel-width.test.ts \
  apps/web/src/state/workspace-store.ts
git commit -m "feat: persist information panel width"
```

### Task 2: Make the information panel draggable

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/layout/AppShell.tsx`
- Modify: `apps/web/src/components/layout/AppShell.test.tsx`
- Modify: `apps/web/src/styles/layout.css`
- Modify: `apps/web/src/styles/branch-review-theme.css`

- [ ] **Step 1: Write the failing drag test**

Reset `rightPanelWidth` to 420 in `beforeEach`, render the application, mock the grid rectangle, and drive pointer events:

```ts
it("resizes the information panel by dragging its separator", () => {
  renderApplication(fakeApi());
  const grid = screen.getByTestId("workspace-grid");
  vi.spyOn(grid, "getBoundingClientRect").mockReturnValue({
    left: 0, right: 1440, top: 0, bottom: 800,
    width: 1440, height: 800, x: 0, y: 0, toJSON: () => ({}),
  });
  const separator = screen.getByRole("separator", { name: "调整工程信息宽度" });

  fireEvent.pointerDown(separator, { button: 0, clientX: 1020 });
  fireEvent.pointerMove(window, { clientX: 900 });
  fireEvent.pointerUp(window);

  expect(useWorkspace.getState().rightPanelWidth).toBe(540);
  expect(localStorage.getItem("cr.informationPanelWidth")).toBe("540");
  expect(grid.style.getPropertyValue("--information-panel-width")).toBe("540px");
});
```

- [ ] **Step 2: Run the shell test and verify RED**

Run:

```bash
npm test -w apps/web -- AppShell.test.tsx
```

Expected: FAIL because no separator, width state, or custom property is rendered.

- [ ] **Step 3: Implement pointer dragging and CSS layout**

Pass `rightPanelWidth` and `setRightPanelWidth` from `App.tsx` to `AppShell`. In `AppShell`, render the workspace grid with a custom property and an overlay separator while the panel is open:

```tsx
<div
  ref={workspaceRef}
  data-testid="workspace-grid"
  className={`workspace-grid${rightPanelOpen ? "" : " information-closed"}`}
  style={{ "--information-panel-width": `${rightPanelWidth}px` } as CSSProperties}
>
  {/* files and code regions */}
  {rightPanelOpen ? (
    <div
      className="information-resizer"
      role="separator"
      aria-label="调整工程信息宽度"
      aria-orientation="vertical"
      aria-valuemin={MIN_INFORMATION_PANEL_WIDTH}
      aria-valuenow={rightPanelWidth}
      onPointerDown={beginResize}
    />
  ) : null}
  {/* information region or collapsed rail */}
</div>
```

`beginResize` must calculate `workspaceRect.right - move.clientX`, clamp it with the helper, update continuously, and remove `pointermove`, `pointerup`, and `pointercancel` listeners on completion and unmount.

Use the custom property in both base and themed CSS:

```css
.workspace-grid {
  position: relative;
  grid-template-columns: minmax(280px, 20vw) minmax(560px, 1fr)
    var(--information-panel-width, 420px);
}

.information-resizer {
  position: absolute;
  z-index: 4;
  top: 0;
  right: calc(var(--information-panel-width, 420px) - 5px);
  bottom: 0;
  width: 10px;
  cursor: col-resize;
  touch-action: none;
}

.information-resizer::after {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 4px;
  width: 2px;
  content: "";
  background: transparent;
}

.information-resizer:hover::after,
.information-resizer:focus-visible::after {
  background: var(--focus);
}

@media (max-width: 1150px) {
  .information-resizer { display: none; }
}
```

- [ ] **Step 4: Run the shell and width tests and verify GREEN**

Run:

```bash
npm test -w apps/web -- AppShell.test.tsx information-panel-width.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 5: Commit the draggable layout**

```bash
git add apps/web/src/App.tsx apps/web/src/components/layout/AppShell.tsx \
  apps/web/src/components/layout/AppShell.test.tsx apps/web/src/styles/layout.css \
  apps/web/src/styles/branch-review-theme.css
git commit -m "feat: resize the information panel"
```

### Task 3: Exclude nested Git worktrees from analysis

**Files:**
- Create: `apps/server/src/analysis/index-service.test.ts`
- Modify: `apps/server/src/analysis/index-service.ts`

- [ ] **Step 1: Write a failing index boundary test**

Build a temporary project with one normal FastAPI controller and one controller plus enum under `.worktrees/branch/`:

```ts
it("excludes nested worktrees from controller and enum analysis", async () => {
  await writeSource("app/controllers/main_controller.py", `
from fastapi import APIRouter
router = APIRouter(prefix="/main")
@router.get("/health")
async def health() -> dict:
    return {}
`);
  await writeSource(".worktrees/branch/app/controllers/branch_controller.py", `
from enum import Enum
from fastapi import APIRouter
class WorktreeState(Enum):
    ACTIVE = "active"
router = APIRouter(prefix="/branch")
@router.get("/health")
async def branch_health() -> dict:
    return {}
`);

  service.open(root);
  await vi.waitFor(() => expect(service.status().phase).toBe("ready"));

  expect(service.controllers().map((item) => item.location.path)).toEqual([
    "app/controllers/main_controller.py",
  ]);
  expect(service.enums().map((item) => item.symbolName)).not.toContain("WorktreeState");

  await writeSource(".worktrees/later/app/controllers/later_controller.py", `
from fastapi import APIRouter
router = APIRouter(prefix="/later")
@router.get("/health")
async def later_health() -> dict:
    return {}
`);
  await new Promise((resolve) => setTimeout(resolve, 250));
  expect(service.controllers().map((item) => item.location.path)).toEqual([
    "app/controllers/main_controller.py",
  ]);
});
```

The test setup creates and removes a unique temporary directory and always calls `await service.close()`.

- [ ] **Step 2: Run the server test and verify RED**

Run:

```bash
npm test -w apps/server -- index-service.test.ts
```

Expected: FAIL because the `.worktrees/branch` endpoint and enum are indexed.

- [ ] **Step 3: Extend the shared ignore rule**

Add `.worktrees` to the existing path expression used by both discovery and Chokidar:

```ts
const IGNORED = /(^|[/\\])(\.git|\.worktrees|node_modules|\.venv|venv|dist|build|coverage|__pycache__)([/\\]|$)/;
```

Do not change the file-tree hidden-directory behavior.

- [ ] **Step 4: Run the index test and verify GREEN**

Run:

```bash
npm test -w apps/server -- index-service.test.ts
```

Expected: only the main-project controller remains and the worktree enum is absent.

- [ ] **Step 5: Commit the analysis boundary**

```bash
git add apps/server/src/analysis/index-service.ts \
  apps/server/src/analysis/index-service.test.ts
git commit -m "fix: exclude nested worktrees from analysis"
```

### Task 4: Bind history to Control-minus

**Files:**
- Modify: `apps/web/src/features/files/CodeViewer.test.tsx`
- Modify: `apps/web/src/features/files/CodeViewer.tsx`
- Modify: `apps/web/e2e/reader.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Change the Monaco test first**

Add `WinCtrl: 1024` to the Monaco mock, rename the shortcut test, and require the physical Control registrations:

```ts
KeyMod: { CtrlCmd: 256, Shift: 512, WinCtrl: 1024 },
```

```ts
monacoState.commands.get(1024 | 4)?.();
monacoState.commands.get(1024 | 512 | 4)?.();
expect(onBack).toHaveBeenCalledOnce();
expect(onForward).toHaveBeenCalledOnce();
expect(monacoState.commands.has(256 | 4)).toBe(false);
```

- [ ] **Step 2: Run the CodeViewer test and verify RED**

Run:

```bash
npm test -w apps/web -- CodeViewer.test.tsx
```

Expected: FAIL because production still registers `CtrlCmd`, which maps to Command on macOS.

- [ ] **Step 3: Change Monaco command registration**

Replace both history key registrations:

```ts
editor.addCommand(monaco.KeyMod.WinCtrl | monaco.KeyCode.Minus, onBack);
editor.addCommand(
  monaco.KeyMod.WinCtrl | monaco.KeyMod.Shift | monaco.KeyCode.Minus,
  onForward,
);
```

Update `README.md` to state that F12 and Command+click jump to definitions, `Control + -` goes back, and `Control + Shift + -` goes forward.

- [ ] **Step 4: Run the CodeViewer test and verify GREEN**

Run:

```bash
npm test -w apps/web -- CodeViewer.test.tsx
```

Expected: the shortcut test and all definition-navigation tests pass.

- [ ] **Step 5: Update real Monaco E2E expectations**

Replace each `Meta+-` history action in `reader.spec.ts` with `Control+-`, and replace `Meta+Shift+-` with `Control+Shift+-`. Keep Meta for Command+click definition navigation.

- [ ] **Step 6: Commit the shortcut correction**

```bash
git add apps/web/src/features/files/CodeViewer.tsx \
  apps/web/src/features/files/CodeViewer.test.tsx apps/web/e2e/reader.spec.ts README.md
git commit -m "fix: bind navigation history to control minus"
```

### Task 5: Add browser coverage for width persistence

**Files:**
- Create: `apps/web/e2e/information-panel-resize.spec.ts`

- [ ] **Step 1: Write the browser test**

At a 1440-pixel viewport, open the fixture, drag the separator left by 120 pixels, assert the panel grew, reload and reopen the fixture, and assert the width is restored within a two-pixel tolerance:

```ts
test("resizes and restores the information panel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFixture(page);
  const panel = page.getByRole("complementary", { name: "工程信息" });
  const separator = page.getByRole("separator", { name: "调整工程信息宽度" });
  const before = await panel.boundingBox();
  const handle = await separator.boundingBox();
  if (!before || !handle) throw new Error("information panel is not measurable");

  await page.mouse.move(handle.x + handle.width / 2, handle.y + 80);
  await page.mouse.down();
  await page.mouse.move(handle.x - 120, handle.y + 80);
  await page.mouse.up();
  const resized = await panel.boundingBox();
  expect(resized?.width).toBeGreaterThan(before.width + 100);

  await reopenFixture(page);
  await expect.poll(async () => (await panel.boundingBox())?.width ?? 0)
    .toBeGreaterThan(before.width + 100);
});
```

- [ ] **Step 2: Run all Playwright tests**

Run:

```bash
npm run e2e -w apps/web
```

Expected: 5 tests pass, including physical Control history and resize persistence.

- [ ] **Step 3: Commit browser coverage**

```bash
git add apps/web/e2e/information-panel-resize.spec.ts
git commit -m "test: cover information panel persistence"
```

### Task 6: Full verification and macOS App delivery

**Files:**
- Verify: all changed files and generated `outputs/CR.app`

- [ ] **Step 1: Run the complete repository gates**

```bash
npm test
npm run typecheck
npm run build
npm run e2e -w apps/web
bash scripts/test-swift-launcher.sh
git diff --check
```

Expected: Server, Web, Contracts, Playwright, and Swift tests pass; typecheck, build, hygiene, and diff checks succeed.

- [ ] **Step 2: Rebuild and verify the worktree App**

```bash
bash scripts/build-macos-app.sh
bash scripts/test-macos-bundle.sh outputs/CR.app
bash scripts/smoke-macos-app.sh
codesign --verify --deep --strict --verbose=2 outputs/CR.app
```

Expected: bundle check is OK, smoke reaches `smoke: complete`, and codesign reports a valid designated requirement.

- [ ] **Step 3: Update and launch the shared App**

Stop only the running launcher whose executable path exactly matches the shared CR.app, copy the verified worktree bundle with `ditto`, verify its signature, and open it. Do not stop unrelated CR, Node, or browser processes.

- [ ] **Step 4: Perform real-browser acceptance**

Open the main project and verify:

1. The information panel grows and shrinks by dragging and retains its width after relaunch.
2. Controller paths contain no `.worktrees/` entries.
3. Command+click still jumps to a Python definition.
4. `Control + -` returns to the source position and `Control + Shift + -` moves forward.
5. F12 still jumps independently.

- [ ] **Step 5: Inspect final Git and App state**

```bash
git status --short
git log -10 --oneline
common_git_dir="$(git rev-parse --git-common-dir)"
shared_root="$(cd "$common_git_dir/.." && pwd)"
codesign --verify --deep --strict --verbose=2 "$shared_root/outputs/CR.app"
```

Expected: only the user's pre-existing `.superpowers/` directory remains untracked, commits are present on `feature/cr-implementation`, and the shared App signature is valid. Do not push without a new explicit user approval.
