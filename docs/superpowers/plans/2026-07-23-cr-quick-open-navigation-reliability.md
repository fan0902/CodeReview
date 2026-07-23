# CR Quick Open and Navigation Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the Command+P result-list presentation and make Command+left-click definition navigation reliable while retaining F12 and adding clear failure feedback.

**Architecture:** `QuickOpen` keeps its current filtering behavior and gains explicit command-palette structure and theme-driven styles. `CodeViewer` adds a side-effect-free Monaco definition provider for native link feedback, a CR URI editor opener, and a browser-compatible explicit click path that shares cached definition resolution with F12 and non-blocking status messages.

**Tech Stack:** React 19, TypeScript 5.9, Monaco Editor 0.56, TanStack Query, Vitest, Testing Library, Playwright, Swift macOS launcher

---

## File map

- Create `apps/web/src/features/files/QuickOpen.test.tsx`: component contract for result limits, command-palette class names, full-path titles, open, and close behavior.
- Modify `apps/web/src/features/files/QuickOpen.tsx`: add semantic class names and complete-path metadata without changing search behavior.
- Modify `apps/web/src/styles/layout.css`: command-palette layout, scrolling, states, responsive sizing, and definition-status toast.
- Modify `apps/web/src/features/files/CodeViewer.test.tsx`: provider, editor opener, raw-browser mouse fallback, cache, F12, status, and disposal regressions.
- Modify `apps/web/src/features/files/CodeViewer.tsx`: pure provider, CR definition URI opener, compatible explicit click, cached resolver, deduplicated navigation, F12, and status UI.
- Modify `apps/web/e2e/reader.spec.ts`: real Monaco acceptance for Command+P layout, hover without navigation, Command+click, F12, failure status, and history.
- Rebuild `outputs/CR.app` in the feature worktree and replace the primary worktree's `outputs/CR.app` only after every check passes.

The Quick Open and definition work touch the same browser surface but remain separate commits. This keeps each fix independently reviewable while one final E2E commit proves the combined workflow.

### Task 1: Repair the Command+P result-list presentation

**Files:**
- Create: `apps/web/src/features/files/QuickOpen.test.tsx`
- Modify: `apps/web/src/features/files/QuickOpen.tsx`
- Modify: `apps/web/src/styles/layout.css:189-242`

- [ ] **Step 1: Write the failing QuickOpen component test**

Create `apps/web/src/features/files/QuickOpen.test.tsx` with the following test. It establishes the 20-result limit and the class names the CSS contract will target:

```tsx
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FileTreeNode } from "../../api/client.js";
import { QuickOpen } from "./QuickOpen.js";

afterEach(cleanup);

describe("QuickOpen", () => {
  it("renders a bounded command-palette result list and opens a selected file", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const tree: FileTreeNode[] = Array.from({ length: 25 }, (_, index) => ({
      name: `file-${String(index).padStart(2, "0")}.py`,
      path: `python/deep/file-${String(index).padStart(2, "0")}.py`,
      type: "file",
    }));

    render(<QuickOpen tree={tree} onOpen={onOpen} />);
    await user.click(screen.getByRole("button", { name: /搜索文件/ }));

    const dialog = screen.getByRole("dialog", { name: "快速打开文件" });
    const results = within(dialog).getByRole("list");
    expect(dialog.classList.contains("quick-open")).toBe(true);
    expect(results.classList.contains("quick-open-results")).toBe(true);
    expect(within(results).getAllByRole("button")).toHaveLength(20);

    const first = within(results).getByRole("button", {
      name: "python/deep/file-00.py",
    });
    expect(first.classList.contains("quick-open-result")).toBe(true);
    expect(first.getAttribute("title")).toBe("python/deep/file-00.py");

    await user.click(first);
    expect(onOpen).toHaveBeenCalledWith("python/deep/file-00.py");
    expect(screen.queryByRole("dialog", { name: "快速打开文件" })).toBeNull();
  });

  it("keeps the close action visually distinct", async () => {
    const user = userEvent.setup();
    render(<QuickOpen tree={[]} onOpen={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /搜索文件/ }));

    const close = screen.getByRole("button", { name: "关闭" });
    expect(close.classList.contains("quick-open-close")).toBe(true);
    await user.click(close);
    expect(screen.queryByRole("dialog", { name: "快速打开文件" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm test --workspace @cr/web -- QuickOpen.test.tsx
```

Expected: FAIL because the result list, result buttons, close button, and path title do not yet have the asserted attributes.

- [ ] **Step 3: Add the minimal QuickOpen structure**

Update only the open-state JSX in `QuickOpen.tsx`:

```tsx
return (
  <div className="quick-open" role="dialog" aria-modal="true" aria-label="快速打开文件">
    <input
      autoFocus
      aria-label="搜索文件"
      placeholder="输入文件名或路径"
      value={query}
      onChange={(event) => setQuery(event.target.value)}
    />
    <ul className="quick-open-results">
      {results.map((file) => (
        <li key={file}>
          <button
            className="quick-open-result"
            type="button"
            title={file}
            onClick={() => {
              onOpen(file);
              setOpen(false);
              setQuery("");
            }}
          >
            {file}
          </button>
        </li>
      ))}
    </ul>
    <button className="quick-open-close" type="button" onClick={() => setOpen(false)}>
      关闭
    </button>
  </div>
);
```

Do not change `flatten`, substring matching, or `.slice(0, 20)`.

- [ ] **Step 4: Add the complete command-palette CSS**

Replace the current `.quick-open` and `.quick-open input` rules and add the result/close rules in `layout.css`:

```css
.quick-open {
  position: fixed;
  z-index: 20;
  top: 88px;
  left: 50%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 8px;
  width: min(680px, calc(100vw - 32px));
  max-height: min(600px, calc(100vh - 120px));
  padding: 10px;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  box-shadow:
    0 18px 48px color-mix(in srgb, var(--text) 18%, transparent),
    0 0 0 100vmax color-mix(in srgb, var(--canvas) 58%, transparent);
  transform: translateX(-50%);
}

.quick-open input {
  width: 100%;
  padding: 10px 11px;
  color: var(--text);
  background: var(--canvas);
  border: 1px solid var(--border);
  border-radius: 9px;
  outline: 0;
}

.quick-open input:focus {
  border-color: var(--focus);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus) 13%, transparent);
}

.quick-open .quick-open-results {
  max-height: min(440px, calc(100vh - 220px));
  padding: 4px 0;
  overflow-x: hidden;
  overflow-y: auto;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.quick-open-results li {
  min-width: 0;
}

.quick-open-result {
  display: block;
  width: 100%;
  padding: 8px 10px;
  overflow: hidden;
  color: var(--text);
  font-family: var(--mono);
  font-size: 12px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: transparent;
  border: 0;
  border-radius: 7px;
}

.quick-open-result:hover,
.quick-open-result:focus-visible {
  background: var(--surface-muted);
}

.quick-open-close {
  justify-self: end;
  padding: 6px 10px;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.quick-open-close:hover {
  color: var(--text);
  background: var(--surface-muted);
}
```

Retain the shared `.file-tree`, `.file-tree ul`, and `.quick-open ul` reset above these rules; `.quick-open .quick-open-results` intentionally has enough specificity to override its padding.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```bash
npm test --workspace @cr/web -- QuickOpen.test.tsx
npm run typecheck --workspace @cr/web
```

Expected: both QuickOpen tests PASS and TypeScript exits zero.

- [ ] **Step 6: Commit the Quick Open fix**

```bash
git add apps/web/src/features/files/QuickOpen.tsx \
  apps/web/src/features/files/QuickOpen.test.tsx \
  apps/web/src/styles/layout.css
git commit -m "fix: style quick open results"
```

### Task 2: Add reliable Monaco definition navigation and feedback

**Files:**
- Modify: `apps/web/src/features/files/CodeViewer.test.tsx`
- Modify: `apps/web/src/features/files/CodeViewer.tsx`
- Modify: `apps/web/src/styles/layout.css`

- [ ] **Step 1: Extend the Monaco test double before production code**

Replace the `monacoState` test fixture with state for two providers, an editor opener, the editor identity, mouse event browser fields, and disposable spies:

```tsx
type Position = { lineNumber: number; column: number };
type MouseInput = {
  event: {
    metaKey: boolean;
    leftButton: boolean;
    browserEvent?: { metaKey: boolean; button: number };
    preventDefault: ReturnType<typeof vi.fn>;
    stopPropagation: ReturnType<typeof vi.fn>;
  };
  target: { position: Position | null };
};

const monacoState = vi.hoisted(() => ({
  mouseDown: null as null | ((event: MouseInput) => void),
  providers: new Map<string, {
    provideDefinition: (_model: unknown, position: Position) => Promise<unknown>;
  }>(),
  opener: null as null | {
    openCodeEditor: (source: unknown, resource: {
      scheme: string;
      query: string;
    }) => boolean | Promise<boolean>;
  },
  editor: null as unknown,
  mouseDisposable: { dispose: vi.fn() },
  providerDisposables: [] as Array<{ dispose: ReturnType<typeof vi.fn> }>,
  openerDisposable: { dispose: vi.fn() },
  commands: new Map<number, () => void | Promise<void>>(),
}));
```

In the Monaco mock, store the editor object in `monacoState.editor` and expose these APIs:

```tsx
languages: {
  registerDefinitionProvider: vi.fn((language: string, provider: never) => {
    monacoState.providers.set(language, provider);
    const disposable = { dispose: vi.fn() };
    monacoState.providerDisposables.push(disposable);
    return disposable;
  }),
},
editor: {
  registerEditorOpener: vi.fn((opener: never) => {
    monacoState.opener = opener;
    return monacoState.openerDisposable;
  }),
},
Uri: {
  from: (parts: { scheme: string; path: string; query: string }) => parts,
},
Range: class {
  constructor(
    readonly startLineNumber: number,
    readonly startColumn: number,
    readonly endLineNumber: number,
    readonly endColumn: number,
  ) {}
},
KeyMod: { CtrlCmd: 256, Shift: 512 },
KeyCode: { F12: 3, Minus: 4 },
```

Reset both maps, all disposables, `opener`, and commands in `afterEach`. Give every synthetic mouse input fresh `preventDefault` and `stopPropagation` spies.

- [ ] **Step 2: Write failing provider and opener tests**

Add a test proving hover lookup has no navigation side effect and the CR opener performs the navigation:

```tsx
it("keeps definition-provider lookup side-effect free and opens its CR target", async () => {
  const onNavigate = vi.fn();
  const api = fakeApi({
    getFile: vi.fn().mockResolvedValue({ path: "source.ts", content: "UserDto" }),
    definition: vi.fn().mockResolvedValue({ path: "user.dto.ts", line: 3, column: 7 }),
  });
  renderViewer(api, onNavigate);
  await screen.findByText("UserDto");

  const definition = await monacoState.providers.get("typescript")?.provideDefinition(
    {},
    { lineNumber: 1, column: 1 },
  );

  expect([...monacoState.providers.keys()].sort()).toEqual(["python", "typescript"]);

  expect(definition).toMatchObject({
    uri: { scheme: "cr-definition" },
    range: { startLineNumber: 3, startColumn: 7 },
  });
  expect(onNavigate).not.toHaveBeenCalled();

  const handled = await monacoState.opener?.openCodeEditor(
    monacoState.editor,
    (definition as { uri: { scheme: string; query: string } }).uri,
  );
  expect(handled).toBe(true);
  expect(onNavigate).toHaveBeenCalledWith({ path: "user.dto.ts", line: 3, column: 7 });
});
```

Also assert both `python` and `typescript` providers are registered.

- [ ] **Step 3: Write failing browser-event fallback and request-reuse tests**

Add a test where Monaco's wrapper fields are false but the raw browser fields prove Command+left-click:

```tsx
it("accepts raw browser Command+left-click fields and reuses provider resolution", async () => {
  const onNavigate = vi.fn();
  const api = fakeApi({
    getFile: vi.fn().mockResolvedValue({ path: "source.ts", content: "UserDto" }),
    definition: vi.fn().mockResolvedValue({ path: "user.dto.ts", line: 1, column: 1 }),
  });
  renderViewer(api, onNavigate);
  await screen.findByText("UserDto");
  const position = { lineNumber: 1, column: 1 };
  await monacoState.providers.get("typescript")?.provideDefinition({}, position);

  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  await act(async () => {
    monacoState.mouseDown?.({
      event: {
        metaKey: false,
        leftButton: false,
        browserEvent: { metaKey: true, button: 0 },
        preventDefault,
        stopPropagation,
      },
      target: { position },
    });
  });

  expect(api.definition).toHaveBeenCalledOnce();
  expect(onNavigate).toHaveBeenCalledOnce();
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(stopPropagation).toHaveBeenCalledOnce();
});
```

Replace the existing negative cases with the complete compatible event matrix:

```tsx
it.each([
  [{ metaKey: false, leftButton: true, browserEvent: { metaKey: false, button: 0 } },
    { lineNumber: 1, column: 13 }],
  [{ metaKey: true, leftButton: false, browserEvent: { metaKey: true, button: 2 } },
    { lineNumber: 1, column: 13 }],
  [{ metaKey: true, leftButton: true, browserEvent: { metaKey: true, button: 0 } }, null],
])("does not resolve a definition for an incomplete Command click", async (event, position) => {
  const api = fakeApi({
    getFile: vi.fn().mockResolvedValue({ path: "source.ts", content: "UserDto" }),
  });
  renderViewer(api, vi.fn());
  await screen.findByText("UserDto");

  await act(async () => {
    monacoState.mouseDown?.({
      event: { ...event, preventDefault: vi.fn(), stopPropagation: vi.fn() },
      target: { position },
    });
  });

  expect(api.definition).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Write failing status and F12 tests**

Add these two cases:

```tsx
it("shows a polite status when an explicit navigation has no definition", async () => {
  const api = fakeApi({
    getFile: vi.fn().mockResolvedValue({ path: "source.ts", content: "missing" }),
    definition: vi.fn().mockResolvedValue(null),
  });
  renderViewer(api, vi.fn());
  await screen.findByText("missing");

  await act(async () => {
    monacoState.mouseDown?.(commandClick({ lineNumber: 1, column: 1 }));
  });

  expect((await screen.findByRole("status")).textContent).toBe(
    "未找到定义，可将光标置于符号上按 F12 重试",
  );
});

it("shows a retry status on failure and keeps F12 independent from mouse events", async () => {
  const api = fakeApi({
    getFile: vi.fn().mockResolvedValue({ path: "source.ts", content: "UserDto" }),
    definition: vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ path: "user.dto.ts", line: 1, column: 1 }),
  });
  const onNavigate = vi.fn();
  renderViewer(api, onNavigate);
  await screen.findByText("UserDto");

  await act(async () => {
    monacoState.mouseDown?.(commandClick({ lineNumber: 1, column: 1 }));
  });
  expect((await screen.findByRole("status")).textContent).toBe(
    "定义跳转失败，请按 F12 重试",
  );

  await act(async () => {
    await monacoState.commands.get(3)?.();
  });
  expect(onNavigate).toHaveBeenCalledWith({ path: "user.dto.ts", line: 1, column: 1 });
});
```

Add the wrapper-positive helper below the test block and preserve the existing back/forward command assertions:

```tsx
function commandClick(position: Position): MouseInput {
  return {
    event: {
      metaKey: true,
      leftButton: true,
      browserEvent: { metaKey: true, button: 0 },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    },
    target: { position },
  };
}
```

Expand the existing unmount test so every Monaco binding is verified:

```tsx
it("disposes providers, opener, and mouse listener on unmount", async () => {
  const view = renderViewer(
    fakeApi({ getFile: vi.fn().mockResolvedValue({ path: "source.ts", content: "value" }) }),
    vi.fn(),
  );
  await screen.findByText("value");
  view.unmount();

  expect(monacoState.providerDisposables).toHaveLength(2);
  expect(monacoState.providerDisposables.every((item) => item.dispose.mock.calls.length > 0))
    .toBe(true);
  expect(monacoState.openerDisposable.dispose).toHaveBeenCalled();
  expect(monacoState.mouseDisposable.dispose).toHaveBeenCalled();
});
```

- [ ] **Step 5: Run focused tests and verify RED**

Run:

```bash
npm test --workspace @cr/web -- CodeViewer.test.tsx
```

Expected: FAIL because the current component has no providers, opener, raw-event fallback, request reuse, or status UI.

- [ ] **Step 6: Implement shared definition resolution and status state**

In `CodeViewer.tsx`, replace `mouseDisposableRef` with registration/cache state and add status state:

```tsx
const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
const locationRef = useRef(location);
const registrationsRef = useRef<Array<{ dispose(): void }>>([]);
const definitionCacheRef = useRef(new Map<string, {
  expiresAt: number;
  promise: Promise<SourceLocation | null>;
}>());
const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const [definitionNotice, setDefinitionNotice] = useState<string | null>(null);
locationRef.current = location;

const disposeEditorBindings = () => {
  for (const registration of registrationsRef.current.splice(0)) registration.dispose();
};

const showDefinitionNotice = (message: string) => {
  if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
  setDefinitionNotice(message);
  noticeTimerRef.current = setTimeout(() => {
    setDefinitionNotice(null);
    noticeTimerRef.current = null;
  }, 2_000);
};
```

Inside `handleMount`, dispose previous bindings, then define one cached resolver. Cache entries live for 1.5 seconds and expired entries are removed before every lookup:

```tsx
disposeEditorBindings();
editorRef.current = editor;

const resolveDefinition = (position: { lineNumber: number; column: number }) => {
  const source = {
    path: locationRef.current.path,
    line: position.lineNumber,
    column: position.column,
  };
  const key = `${source.path}:${source.line}:${source.column}`;
  const now = Date.now();
  for (const [candidate, entry] of definitionCacheRef.current) {
    if (entry.expiresAt <= now) definitionCacheRef.current.delete(candidate);
  }
  const cached = definitionCacheRef.current.get(key);
  if (cached) return cached.promise;

  const promise = api.definition(source).catch((error: unknown) => {
    definitionCacheRef.current.delete(key);
    throw error;
  });
  definitionCacheRef.current.set(key, { expiresAt: now + 1_500, promise });
  return promise;
};
```

- [ ] **Step 7: Register the pure providers and CR editor opener**

Still inside `handleMount`, create CR URIs whose query contains the exact `SourceLocation`:

```tsx
const toDefinitionUri = (target: SourceLocation) =>
  monaco.Uri.from({
    scheme: "cr-definition",
    path: "/target",
    query: new URLSearchParams({
      path: target.path,
      line: String(target.line),
      column: String(target.column),
    }).toString(),
  });

const fromDefinitionUri = (resource: { scheme: string; query: string }) => {
  if (resource.scheme !== "cr-definition") return null;
  const parameters = new URLSearchParams(resource.query);
  const path = parameters.get("path");
  const line = Number(parameters.get("line"));
  const column = Number(parameters.get("column"));
  return path && Number.isInteger(line) && line > 0 && Number.isInteger(column) && column > 0
    ? { path, line, column }
    : null;
};

let lastNavigation = { key: "", at: 0 };
const navigateToTarget = (target: SourceLocation) => {
  const key = `${target.path}:${target.line}:${target.column}`;
  const now = Date.now();
  if (lastNavigation.key === key && now - lastNavigation.at < 250) return;
  lastNavigation = { key, at: now };
  onNavigate(target);
};

const provider = {
  provideDefinition: async (_model: unknown, position: { lineNumber: number; column: number }) => {
    try {
      const target = await resolveDefinition(position);
      if (!target) return null;
      return {
        uri: toDefinitionUri(target),
        range: new monaco.Range(target.line, target.column, target.line, target.column),
      };
    } catch {
      return null;
    }
  },
};

const providerDisposables = ["python", "typescript"].map((language) =>
  monaco.languages.registerDefinitionProvider(language, provider),
);
const openerDisposable = monaco.editor.registerEditorOpener({
  openCodeEditor: (source, resource) => {
    if (source !== editor) return false;
    const target = fromDefinitionUri(resource);
    if (!target) return false;
    navigateToTarget(target);
    return true;
  },
});
```

The provider catches lookup errors silently because Monaco may invoke it during hover.

- [ ] **Step 8: Implement compatible explicit click and F12**

Add the explicit navigation function and event fallback:

```tsx
const navigateFromPosition = async (position: { lineNumber: number; column: number }) => {
  try {
    const target = await resolveDefinition(position);
    if (!target) {
      showDefinitionNotice("未找到定义，可将光标置于符号上按 F12 重试");
      return;
    }
    setDefinitionNotice(null);
    navigateToTarget(target);
  } catch {
    showDefinitionNotice("定义跳转失败，请按 F12 重试");
  }
};

const mouseDisposable = editor.onMouseDown((event) => {
  const browserEvent = event.event.browserEvent;
  const commandPressed = event.event.metaKey || browserEvent?.metaKey === true;
  const leftButton = event.event.leftButton || browserEvent?.button === 0;
  const position = event.target.position;
  if (!commandPressed || !leftButton || !position) return;
  event.event.preventDefault();
  event.event.stopPropagation();
  void navigateFromPosition(position);
});

registrationsRef.current = [
  ...providerDisposables,
  openerDisposable,
  mouseDisposable,
];

editor.addCommand(monaco.KeyCode.F12, () => {
  const position = editor.getPosition();
  if (position) void navigateFromPosition(position);
});
```

Keep the existing Command-minus and Command-Shift-minus commands immediately after F12.

- [ ] **Step 9: Render and style the non-blocking status**

Wrap the loaded editor and status in `CodeViewer.tsx`:

```tsx
return (
  <div className="code-viewer">
    <Editor
      height="100%"
      path={location.path}
      language={languageFor(location.path)}
      theme={editorTheme}
      value={file.data.content}
      onMount={handleMount}
      onUnmount={disposeEditorBindings}
      options={{
        readOnly: true,
        minimap: { enabled: false },
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        definitionLinkOpensInPeek: false,
      }}
    />
    {definitionNotice ? (
      <div className="definition-status" role="status" aria-live="polite">
        {definitionNotice}
      </div>
    ) : null}
  </div>
);
```

Add to `layout.css` after `.editor-area`:

```css
.code-viewer {
  position: relative;
  width: 100%;
  height: 100%;
}

.definition-status {
  position: absolute;
  z-index: 5;
  right: 16px;
  bottom: 16px;
  max-width: min(420px, calc(100% - 32px));
  padding: 8px 11px;
  color: var(--text);
  font-size: 12px;
  background: color-mix(in srgb, var(--surface) 96%, transparent);
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--text) 14%, transparent);
  pointer-events: none;
}
```

Replace the cleanup effect with one that releases every registration, cache entry, and timer:

```tsx
useEffect(
  () => () => {
    disposeEditorBindings();
    definitionCacheRef.current.clear();
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
  },
  [],
);
```

- [ ] **Step 10: Run focused tests and verify GREEN**

Run:

```bash
npm test --workspace @cr/web -- CodeViewer.test.tsx
npm run typecheck --workspace @cr/web
```

Expected: all CodeViewer tests PASS, including both provider registrations, hover purity, opener navigation, raw-browser fallback, request reuse, F12, notices, history commands, and disposal; typecheck exits zero.

- [ ] **Step 11: Commit the definition navigation fix**

```bash
git add apps/web/src/features/files/CodeViewer.tsx \
  apps/web/src/features/files/CodeViewer.test.tsx \
  apps/web/src/styles/layout.css
git commit -m "fix: harden definition navigation"
```

### Task 3: Prove the combined workflow in a real Monaco editor

**Files:**
- Modify: `apps/web/e2e/reader.spec.ts`

- [ ] **Step 1: Add Command+P computed-style acceptance**

Immediately after `openFixture(page)`, add:

```ts
await page.keyboard.press("Meta+p");
const quickOpen = page.getByRole("dialog", { name: "快速打开文件" });
const quickResults = quickOpen.locator(".quick-open-results");
await expect(quickOpen).toBeVisible();
await expect(quickOpen).toHaveCSS("position", "fixed");
await expect(quickResults).toHaveCSS("overflow-y", "auto");
await expect(quickOpen.getByRole("button", { name: "nest/src/user.dto.ts" }))
  .toHaveCSS("border-top-width", "0px");
await quickOpen.getByRole("button", { name: "关闭" }).click();
await expect(quickOpen).not.toBeVisible();
```

- [ ] **Step 2: Extend definition navigation acceptance**

Keep the existing Command hover and Command+click assertions. After the history forward assertion, add an independent F12 pass:

```ts
await page.keyboard.press("Meta+-");
await expect(sourceTab).toHaveAttribute("aria-selected", "true");
await userDto.click();
await page.keyboard.press("F12");
await expect(page.getByRole("tab", { name: "user.dto.ts" })).toHaveAttribute(
  "aria-selected",
  "true",
);
```

Then return to the source and click a symbol without a fixture definition:

```ts
await page.keyboard.press("Meta+-");
const controllerLine = page.locator(".view-line").filter({ hasText: '@Controller("users")' });
const unresolvedController = controllerLine.getByText("Controller", { exact: true });
await unresolvedController.click({ modifiers: ["Meta"] });
await expect(page.getByRole("status")).toHaveText(
  "未找到定义，可将光标置于符号上按 F12 重试",
);
await expect(sourceTab).toHaveAttribute("aria-selected", "true");
```

- [ ] **Step 3: Run the reader regression and verify GREEN**

Run:

```bash
npm run build --workspace @cr/web
npm run e2e --workspace @cr/web -- reader.spec.ts
```

Expected: the reader test PASSes; the command palette has bounded list styling, hover does not navigate, Command+click and F12 open `user.dto.ts`, history still works, and an unresolved symbol shows status without changing tabs.

- [ ] **Step 4: Commit the browser regression**

```bash
git add apps/web/e2e/reader.spec.ts
git commit -m "test: cover quick open and definition fallbacks"
```

### Task 4: Complete verification and rebuild CR.app

**Files:**
- Verify: all tracked project files
- Build: `outputs/CR.app` in the current feature worktree
- Replace: `outputs/CR.app` in the primary worktree resolved from `git worktree list`

- [ ] **Step 1: Run the complete repository verification**

Run:

```bash
npm test
npm run typecheck
npm run build
npm run e2e --workspace @cr/web
bash scripts/test-swift-launcher.sh
bash scripts/test-repository-hygiene.sh
git diff --check
git status --short
```

Expected: every test, typecheck, build, Playwright scenario, Swift launcher test, hygiene check, and whitespace check exits zero. `git status --short` contains only the pre-existing untracked `.superpowers/` directory.

- [ ] **Step 2: Stop only the shared CR launcher**

Run the path-qualified termination script:

```bash
delivery_root="$(git worktree list --porcelain | awk '/^worktree / { print substr($0, 10); exit }')"
shared_app="$delivery_root/outputs/CR.app"
xcrun swift -e 'import AppKit
let executable = CommandLine.arguments[1]
for app in NSRunningApplication.runningApplications(withBundleIdentifier: "com.local.cr")
where app.executableURL?.path == executable {
  _ = app.terminate()
}' "$shared_app/Contents/MacOS/CR"
```

Expected: only the instance whose executable is inside the shared app path terminates. Do not terminate unrelated apps or use a broad process match.

- [ ] **Step 3: Build, sign, and smoke-test the feature-worktree app**

Run:

```bash
bash scripts/build-macos-app.sh
bash scripts/test-macos-bundle.sh outputs/CR.app
bash scripts/smoke-macos-app.sh
codesign --verify --deep --strict --verbose=2 outputs/CR.app
```

Expected: build, bundle validation, isolated lifecycle smoke test, and strict signature verification all exit zero.

- [ ] **Step 4: Replace and restart the shared app**

Run:

```bash
delivery_root="$(git worktree list --porcelain | awk '/^worktree / { print substr($0, 10); exit }')"
shared_app="$delivery_root/outputs/CR.app"
ditto outputs/CR.app "$shared_app"
codesign --verify --deep --strict --verbose=2 "$shared_app"
open "$shared_app"
```

Expected: the signed shared app starts and opens or refreshes the most recently active CR tab in the current default browser.

- [ ] **Step 5: Perform packaged-app acceptance**

In the opened CR page:

1. Reopen `tab-commerce` and wait for “索引就绪”.
2. Press `Command + P`; verify the command panel is compact, paths remain on one line, and the result area scrolls.
3. Open `app/controllers/member/member_controller.py`.
4. Hold Command over `_service.get_level`; verify link feedback appears without switching files.
5. Command+left-click `get_level`; verify `app/services/member/member_service.py` opens.
6. Press `Command + -`; verify CR returns to `member_controller.py`.
7. Put the cursor on `get_level` and press `F12`; verify the same definition opens.
8. Command+click a non-resolvable symbol; verify the two-second status appears and the current file remains active.

Expected: all eight checks succeed. If the system default browser cannot be controlled by the configured automation surface, record that limitation and have the user perform these eight visible checks; do not bypass browser permissions with another control channel.

- [ ] **Step 6: Confirm final Git and delivery state**

Run:

```bash
git log -4 --oneline
git status --short
delivery_root="$(git worktree list --porcelain | awk '/^worktree / { print substr($0, 10); exit }')"
codesign --verify --deep --strict --verbose=2 \
  "$delivery_root/outputs/CR.app"
```

Expected: the design/plan and three implementation commits are present, `.superpowers/` is the only untracked path, and the shared CR.app signature is valid. Do not push; pushing requires separate explicit user approval.
