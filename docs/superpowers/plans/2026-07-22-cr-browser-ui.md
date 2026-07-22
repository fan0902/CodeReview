# CR Browser UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the concise, readable browser interface for opening projects, browsing and navigating code, inspecting controllers, and managing persistent enum cards.

**Architecture:** A React single-page app consumes only the local typed API and keeps navigation/UI state in focused stores. Monaco is isolated behind a code-viewer adapter, while file tree, controller panel, and enum panel remain independently testable components.

**Tech Stack:** React 19, TypeScript, Vite, Monaco Editor, TanStack Query, Zustand, Vitest, Testing Library, MSW, Playwright

---

## File map

- `apps/web/src/api/client.ts`: token-aware API client and error normalization.
- `apps/web/src/state/workspace-store.ts`: current file, tabs, history, panel state.
- `apps/web/src/components/layout/AppShell.tsx`: three-column layout and toolbar.
- `apps/web/src/features/projects/`: open/recent project controls and index status.
- `apps/web/src/features/files/`: file tree, quick open, tabs, and Monaco wrapper.
- `apps/web/src/features/controllers/`: controller list, filters, and source navigation.
- `apps/web/src/features/enums/`: enum search, bookmark cards, re-link, and deletion.
- `apps/web/src/styles/`: tokens, layout, focus, light/dark theme.
- `apps/web/e2e/`: browser acceptance tests against the fixture server.

### Task 1: Web scaffold, API client, and design tokens

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/index.html`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/styles/tokens.css`
- Test: `apps/web/src/api/client.test.ts`

- [ ] **Step 1: Write failing token-handling tests**

```ts
it("moves the launch token from the URL to sessionStorage", () => {
  history.replaceState(null, "", "/?token=secret");
  const client = createApiClient(window);
  expect(sessionStorage.getItem("cr.sessionToken")).toBe("secret");
  expect(location.search).toBe("");
  expect(client.headers()).toMatchObject({ Authorization: "Bearer secret" });
});

it("normalizes structured API errors", async () => {
  server.use(http.get("/api/project/tree", () => HttpResponse.json({ error: { code: "NO_PROJECT", message: "Open a project" } }, { status: 409 })));
  await expect(api.getTree()).rejects.toMatchObject({ code: "NO_PROJECT", message: "Open a project" });
});
```

- [ ] **Step 2: Install web dependencies and verify failure**

Run: `npm install -w apps/web react react-dom @tanstack/react-query zustand monaco-editor @monaco-editor/react @cr/contracts && npm install -D -w apps/web vite @vitejs/plugin-react vitest jsdom @testing-library/react @testing-library/user-event msw @types/react @types/react-dom && npm test -w apps/web -- src/api/client.test.ts`

Expected: FAIL because `createApiClient` is absent.

- [ ] **Step 3: Implement the API client and visual tokens**

```ts
export function createApiClient(browser: Pick<Window, "location" | "history" | "sessionStorage"> = window) {
  const params = new URLSearchParams(browser.location.search);
  const launchedToken = params.get("token");
  if (launchedToken) {
    browser.sessionStorage.setItem("cr.sessionToken", launchedToken);
    browser.history.replaceState(null, "", browser.location.pathname + browser.location.hash);
  }
  const token = browser.sessionStorage.getItem("cr.sessionToken");
  return createTypedMethods(async (path, init) => normalize(await fetch(path, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${token}` } })));
}
```

Define CSS variables for canvas, surface, border, primary/secondary text, focus ring, low-saturation HTTP method colors, system UI font, and monospace font. Add `prefers-color-scheme: dark`; do not add gradients or decorative shadows.

- [ ] **Step 4: Run tests and production build**

Run: `npm test -w apps/web -- src/api/client.test.ts && npm run typecheck -w apps/web && npm run build -w apps/web`

Expected: PASS and `apps/web/dist/index.html` exists.

- [ ] **Step 5: Commit the web foundation**

```bash
git add apps/web package.json package-lock.json
git commit -m "build: scaffold CR browser interface"
```

### Task 2: Three-column shell and project opening

**Files:**
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/components/layout/AppShell.tsx`
- Create: `apps/web/src/features/projects/ProjectToolbar.tsx`
- Create: `apps/web/src/features/projects/IndexStatus.tsx`
- Create: `apps/web/src/state/workspace-store.ts`
- Create: `apps/web/src/styles/layout.css`
- Test: `apps/web/src/components/layout/AppShell.test.tsx`

- [ ] **Step 1: Write layout and open-project tests**

```tsx
it("keeps the current project when directory selection is cancelled", async () => {
  api.selectProject.mockResolvedValue({ cancelled: true });
  render(<App />);
  await user.click(screen.getByRole("button", { name: "打开工程" }));
  expect(screen.getByText("mixed-project")).toBeVisible();
});

it("offers recent projects and reopens the selected one", async () => {
  api.recentProjects.mockResolvedValue([{ path: "/work/mixed-project", name: "mixed-project", lastOpenedAt: "2026-07-22T00:00:00Z" }]);
  render(<App />);
  await user.click(await screen.findByRole("button", { name: "重新打开 mixed-project" }));
  expect(api.openRecent).toHaveBeenCalledWith("/work/mixed-project");
});

it("renders file, code, and collapsible information regions", () => {
  render(<AppShell />);
  expect(screen.getByRole("navigation", { name: "工程文件" })).toBeVisible();
  expect(screen.getByRole("main", { name: "代码阅读区" })).toBeVisible();
  expect(screen.getByRole("complementary", { name: "工程信息" })).toBeVisible();
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -w apps/web -- src/components/layout/AppShell.test.tsx`

Expected: FAIL because the shell and toolbar are missing.

- [ ] **Step 3: Implement shell, state, and project controls**

```ts
type WorkspaceState = {
  project: ProjectSummary | null;
  rightPanelOpen: boolean;
  setProject(project: ProjectSummary): void;
  toggleRightPanel(): void;
};

export const useWorkspace = create<WorkspaceState>((set) => ({
  project: null,
  rightPanelOpen: true,
  setProject: (project) => set({ project }),
  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
}));
```

Create a semantic toolbar and CSS Grid shell with resizable left/right columns, minimum 560px code area, 240px left minimum, 320px right minimum, and a one-button collapsed right rail. On initial load request recent projects; show them in the empty state and open only after explicit selection. Poll index status every 750ms only while scanning.

- [ ] **Step 4: Run component and accessibility assertions**

Run: `npm test -w apps/web -- src/components/layout/AppShell.test.tsx && npm run typecheck -w apps/web`

Expected: PASS; all interactive elements have names and visible focus indicators.

- [ ] **Step 5: Commit the application shell**

```bash
git add apps/web/src/App.tsx apps/web/src/components apps/web/src/features/projects apps/web/src/state apps/web/src/styles
git commit -m "feat: add CR project workspace shell"
```

### Task 3: File tree, tabs, Monaco, and definition history

**Files:**
- Create: `apps/web/src/features/files/FileTree.tsx`
- Create: `apps/web/src/features/files/QuickOpen.tsx`
- Create: `apps/web/src/features/files/FileTabs.tsx`
- Create: `apps/web/src/features/files/CodeViewer.tsx`
- Create: `apps/web/src/features/files/navigation-history.ts`
- Test: `apps/web/src/features/files/CodeViewer.test.tsx`
- Test: `apps/web/src/features/files/navigation-history.test.ts`

- [ ] **Step 1: Write file-opening and history tests**

```ts
it("supports backward and forward source history", () => {
  const history = createNavigationHistory();
  history.visit({ path: "a.ts", line: 1, column: 1 });
  history.visit({ path: "b.ts", line: 8, column: 3 });
  expect(history.back()).toEqual({ path: "a.ts", line: 1, column: 1 });
  expect(history.forward()).toEqual({ path: "b.ts", line: 8, column: 3 });
});

it("opens a definition returned by the API", async () => {
  api.definition.mockResolvedValue({ path: "nest/src/user.dto.ts", line: 1, column: 14 });
  render(<CodeViewer file="nest/src/users.controller.ts" />);
  await triggerMonacoDefinition("UserDto");
  expect(api.getFile).toHaveBeenCalledWith("nest/src/user.dto.ts");
  expect(monacoReveal).toHaveBeenCalledWith(1, 14);
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -w apps/web -- src/features/files`

Expected: FAIL because history and reader components do not exist.

- [ ] **Step 3: Implement focused browsing components**

```ts
export function createNavigationHistory() {
  let entries: SourceLocation[] = [];
  let cursor = -1;
  return {
    visit(location: SourceLocation) { entries = entries.slice(0, cursor + 1); entries.push(location); cursor = entries.length - 1; },
    back() { if (cursor <= 0) return null; cursor -= 1; return entries[cursor] ?? null; },
    forward() { if (cursor >= entries.length - 1) return null; cursor += 1; return entries[cursor] ?? null; },
  };
}
```

Render only supported text files in Monaco with `readOnly: true`, `definitionLinkOpensInPeek: false`, minimap off, line numbers on, and language derived from extension. Register F12/Cmd+Click through Monaco definition provider, and Ctrl+- / Ctrl+Shift+- through commands. `Cmd+P` filters flattened tree paths and opens the selected file.

- [ ] **Step 4: Run browsing tests and build**

Run: `npm test -w apps/web -- src/features/files && npm run typecheck -w apps/web && npm run build -w apps/web`

Expected: PASS; tests cover close-tab fallback, missing definition toast, large/binary file message, and preserving scroll per tab.

- [ ] **Step 5: Commit code browsing**

```bash
git add apps/web/src/features/files apps/web/src/state
git commit -m "feat: browse and navigate project code"
```

### Task 4: Controller information panel

**Files:**
- Create: `apps/web/src/features/controllers/ControllerPanel.tsx`
- Create: `apps/web/src/features/controllers/ControllerFilters.tsx`
- Create: `apps/web/src/features/controllers/EndpointCard.tsx`
- Test: `apps/web/src/features/controllers/ControllerPanel.test.tsx`

- [ ] **Step 1: Write filtering and source-location tests**

```tsx
it("shows method, path, input, output, and unresolved diagnostics", async () => {
  render(<ControllerPanel />);
  expect(await screen.findByText("GET")).toBeVisible();
  expect(screen.getByText("/users/{user_id}")).toBeVisible();
  expect(screen.getByText("user_id · path · int · 必填")).toBeVisible();
  expect(screen.getByText("UserOut")).toBeVisible();
});

it("filters and opens the endpoint source", async () => {
  await user.type(screen.getByRole("searchbox", { name: "筛选接口" }), "Get user");
  await user.click(await screen.findByRole("button", { name: /打开源码/ }));
  expect(openLocation).toHaveBeenCalledWith(expect.objectContaining({ path: "python/app.py" }));
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -w apps/web -- src/features/controllers`

Expected: FAIL because the panel is missing.

- [ ] **Step 3: Implement grouped, readable endpoint cards**

```tsx
export function EndpointCard({ endpoint, onOpen }: Props) {
  return <article className="endpoint-card">
    <header><span className={`method method-${endpoint.method.toLowerCase()}`}>{endpoint.method}</span><code>{endpoint.path}</code></header>
    <h3>{endpoint.name}</h3>
    {endpoint.description && <p>{endpoint.description}</p>}
    <DefinitionList title="入参" rows={endpoint.parameters.map(formatParameter)} empty="无显式入参" />
    <DefinitionList title="出参" rows={[endpoint.response.type || "未声明"]} />
    {endpoint.diagnostics.map((item) => <p role="note" key={item}>{item}</p>)}
    <button onClick={() => onOpen(endpoint.location)}>打开源码</button>
  </article>;
}
```

Group by relative source path and route group, filter by method/path/name, use text labels with method colors, and show scanning/empty/error states without covering the code reader.

- [ ] **Step 4: Run controller tests**

Run: `npm test -w apps/web -- src/features/controllers && npm run typecheck -w apps/web`

Expected: PASS for both frameworks, no-parameter endpoints, `未声明`, dynamic diagnostics, filters, and source opening.

- [ ] **Step 5: Commit controller UI**

```bash
git add apps/web/src/features/controllers
git commit -m "feat: display controller interface details"
```

### Task 5: Enum search, persistence states, re-link, and deletion

**Files:**
- Create: `apps/web/src/features/enums/EnumPanel.tsx`
- Create: `apps/web/src/features/enums/EnumSearch.tsx`
- Create: `apps/web/src/features/enums/EnumCard.tsx`
- Test: `apps/web/src/features/enums/EnumPanel.test.tsx`

- [ ] **Step 1: Write add, restore, invalid, and delete tests**

```tsx
it("searches candidates and saves the selected enum", async () => {
  render(<EnumPanel />);
  await user.type(screen.getByRole("combobox", { name: "枚举类" }), "State");
  await user.click(await screen.findByRole("option", { name: /State.*python\/app.py/ }));
  await user.click(screen.getByRole("button", { name: "保存枚举" }));
  expect(api.addEnumBookmark).toHaveBeenCalledWith({ relativePath: "python/app.py", symbolName: "State", language: "python" });
  expect(await screen.findByText("ACTIVE")).toBeVisible();
});

it("deletes only after confirmation", async () => {
  await user.click(screen.getByRole("button", { name: "删除 State" }));
  await user.click(screen.getByRole("button", { name: "确认删除" }));
  expect(api.deleteEnumBookmark).toHaveBeenCalledWith("bookmark-1");
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -w apps/web -- src/features/enums`

Expected: FAIL because enum components are missing.

- [ ] **Step 3: Implement enum workflow and cards**

```tsx
export function EnumCard({ item }: { item: ResolvedEnumBookmark }) {
  return <article>
    <header><strong>{item.symbolName}</strong><code>{item.relativePath}</code></header>
    {item.state === "ready" ? <dl>{item.members.flatMap((member) => [<dt key={`${member.name}-k`}>{member.name}</dt>, <dd key={`${member.name}-v`}><code>{member.value}</code>{member.comment}</dd>])}</dl> : <p role="alert">{item.message}</p>}
    {item.state !== "ready" && <button>重新定位</button>}
    <button aria-label={`删除 ${item.symbolName}`}>删除</button>
  </article>;
}
```

Debounce search by 200ms, show language and path in every candidate, disable save until one exact candidate is selected, invalidate bookmarks query after add/delete, keep missing/invalid cards visible, and implement re-link by replacing the old bookmark only after the new one is created successfully.

- [ ] **Step 4: Run enum tests**

Run: `npm test -w apps/web -- src/features/enums && npm run typecheck -w apps/web`

Expected: PASS for same-name candidates, add, reload restore, member rendering, invalid state, re-link, cancel delete, and confirmed delete.

- [ ] **Step 5: Commit enum UI**

```bash
git add apps/web/src/features/enums
git commit -m "feat: manage persistent enum views"
```

### Task 6: Integrated browser acceptance and visual readability

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/reader.spec.ts`
- Create: `apps/web/e2e/readability.spec.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Write end-to-end acceptance tests**

```ts
test("opens, navigates, inspects controllers, and restores an enum", async ({ page }) => {
  await launchFixture(page);
  await page.getByRole("treeitem", { name: "users.controller.ts" }).click();
  await page.getByText("UserDto", { exact: true }).click({ modifiers: ["Meta"] });
  await expect(page.getByRole("main")).toContainText("export class UserDto");
  await page.getByRole("tab", { name: "Controllers" }).click();
  await expect(page.getByText("/users/:id")).toBeVisible();
  await addEnum(page, "Role", "nest/src/role.enum.ts");
  await page.reload();
  await expect(page.getByText("Admin")).toBeVisible();
  await page.getByRole("button", { name: "删除 Role" }).click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.getByText("Admin")).not.toBeVisible();
});
```

- [ ] **Step 2: Install Playwright and verify failure**

Run: `npm install -D -w apps/web @playwright/test && npx playwright install chromium && npm run e2e -w apps/web`

Expected: FAIL until the server serves `apps/web/dist` and the app composes all panels.

- [ ] **Step 3: Complete composition and readability checks**

Serve Vite assets from Express in production and proxy `/api` in Vite development. Add Playwright assertions at 1440x900 and 1024x768 for no horizontal page overflow, minimum 560px code area at desktop width, right-panel collapse at narrow width, visible keyboard focus, method text labels, and light/dark screenshots.

```ts
await page.setViewportSize({ width: 1024, height: 768 });
await expect(page.locator("main")).toHaveCSS("min-width", "560px");
await page.keyboard.press("Tab");
await expect(page.locator(":focus-visible")).toBeVisible();
expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
```

- [ ] **Step 4: Run the complete browser gate**

Run: `npm test -w apps/web && npm run typecheck && npm run build && npm run e2e -w apps/web`

Expected: all unit/component/E2E tests PASS; screenshots are written under `apps/web/test-results/readability/` for manual review.

- [ ] **Step 5: Commit the integrated browser UI**

```bash
git add apps/web apps/server/src/app.ts package-lock.json
git commit -m "test: verify CR browser reading workflow"
```

## Plan 2 completion gate

Run `npm test && npm run typecheck && npm run build && npm run e2e -w apps/web`.

Expected: every check passes, the fixture workflow proves code viewing/jump, controller details, enum add/reload/delete, and both reference screenshots remain readable. Continue with `2026-07-22-cr-macos-delivery.md` only after this gate passes.
