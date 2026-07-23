# CR Index-Ready Query Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the active project's cached Controller data once when asynchronous indexing becomes ready.

**Architecture:** Keep index lifecycle ownership in `ProjectToolbar` and use its existing polling result to invalidate the React Query Controller key. Track the project whose ready transition was handled so repeated ready checks do not create a refetch loop, while a new scan or project can trigger a fresh refresh.

**Tech Stack:** React 19, TanStack React Query, Vitest, Testing Library, Playwright, Swift Package Manager

---

## File Structure

- Modify `apps/web/src/features/projects/ProjectToolbar.test.tsx` to reproduce the stale empty Controller cache through the real toolbar and panel components.
- Modify `apps/web/src/features/projects/ProjectToolbar.tsx` to invalidate the project-scoped Controller query once per ready transition.
- Rebuild `outputs/CR.app` only after source verification succeeds.

### Task 1: Refresh Controller Data at Index Readiness

**Files:**
- Modify: `apps/web/src/features/projects/ProjectToolbar.test.tsx`
- Modify: `apps/web/src/features/projects/ProjectToolbar.tsx`

- [ ] **Step 1: Write the failing integration-style component test**

Add `ControllerPanel` to the test imports and render it next to `ProjectToolbar`. Configure `getControllers` to return an empty result before readiness and a real endpoint after invalidation. Configure `indexStatus` to return `scanning` and then `ready`.

```tsx
it("refreshes cached controllers once when indexing becomes ready", async () => {
  const indexStatus = vi
    .fn()
    .mockResolvedValueOnce({
      phase: "scanning",
      completed: 1,
      total: 5,
      diagnostics: [],
    })
    .mockResolvedValue({
      phase: "ready",
      completed: 5,
      total: 5,
      diagnostics: [],
    });
  const getControllers = vi
    .fn()
    .mockResolvedValueOnce([])
    .mockResolvedValue([
      {
        id: "nest-get-user",
        framework: "nestjs",
        method: "GET",
        path: "/users/:id",
        name: "Get user",
        parameters: [],
        response: { type: "UserDto", statusCode: 200 },
        location: { path: "nest/src/users.controller.ts", line: 10, column: 3 },
        diagnostics: [],
      },
    ]);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ApiProvider client={{ indexStatus, getControllers } as unknown as ApiClient}>
        <ProjectToolbar />
        <ControllerPanel />
      </ApiProvider>
    </QueryClientProvider>,
  );

  expect(await screen.findByText("没有发现 Controller 接口")).toBeTruthy();
  screen.getByRole("button", { name: "索引 1/5" }).click();
  expect(await screen.findByText("/users/:id")).toBeTruthy();
  expect(getControllers).toHaveBeenCalledTimes(2);

  screen.getByRole("button", { name: "索引就绪" }).click();
  await waitFor(() => expect(indexStatus).toHaveBeenCalledTimes(3));
  expect(getControllers).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run the focused test to verify RED**

Run: `npm test --workspace @cr/web -- ProjectToolbar.test.tsx`

Expected: FAIL because `getControllers` remains called once and `/users/:id` never appears after the index reaches ready.

- [ ] **Step 3: Implement one invalidation per ready transition**

Import `useQueryClient`, capture the client in `IndexStatus`, and remember the project whose ready state was handled.

```tsx
const queryClient = useQueryClient();
const refreshedProject = useRef<string | null>(null);

if (status.phase === "scanning") refreshedProject.current = null;
if (status.phase === "ready" && refreshedProject.current !== project.id) {
  refreshedProject.current = project.id;
  await queryClient.invalidateQueries({ queryKey: ["controllers", project.id] });
}
```

Include `queryClient` in the refresh callback dependency list. Keep existing status labels, polling interval, and error handling unchanged.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run: `npm test --workspace @cr/web -- ProjectToolbar.test.tsx`

Expected: all `ProjectToolbar` tests pass; the new test observes exactly two Controller requests.

- [ ] **Step 5: Run the web unit and type gates**

Run: `npm test --workspace @cr/web && npm run typecheck --workspace @cr/web`

Expected: 45 web tests pass and TypeScript exits 0.

- [ ] **Step 6: Commit the bug fix**

```bash
git add apps/web/src/features/projects/ProjectToolbar.test.tsx \
  apps/web/src/features/projects/ProjectToolbar.tsx
git commit -m "fix: refresh controllers when indexing completes"
```

### Task 2: Verify and Package the Completed App

**Files:**
- Rebuild: `outputs/CR.app`

- [ ] **Step 1: Run all source gates serially**

Run:

```bash
npm test
npm run typecheck
npm run build
npm run e2e --workspace @cr/web
bash scripts/test-swift-launcher.sh
git diff --check
```

Expected: Server 38, Web 45, Contracts 1, Playwright 4, and Swift 9 tests pass; typecheck, build, hygiene, and whitespace checks exit 0.

- [ ] **Step 2: Rebuild and verify the signed worktree App**

Run:

```bash
bash scripts/build-macos-app.sh
bash scripts/test-macos-bundle.sh outputs/CR.app
/usr/bin/codesign --verify --deep --strict --verbose=4 outputs/CR.app
bash scripts/smoke-macos-app.sh
```

Expected: bundle validation, strict signature validation, service health, same-tab refresh, and termination cleanup pass.

- [ ] **Step 3: Replace and launch the shared App**

Resolve the first worktree entry as the delivery root, copy the verified bundle to its `outputs/CR.app`, validate the copied signature, and open that exact path.

```bash
delivery_root="$(git worktree list --porcelain | awk '/^worktree / { print substr($0, 10); exit }')"
delivery_app="$delivery_root/outputs/CR.app"
ditto outputs/CR.app "$delivery_app"
/usr/bin/codesign --verify --deep --strict --verbose=4 "$delivery_app"
open "$delivery_app"
```

Expected: the shared App starts one regular launcher and its authenticated `/api/health` returns `{"status":"ready","name":"CR","version":"0.1.0"}`.

- [ ] **Step 4: Inspect final repository state**

Run:

```bash
git status --short --branch
git log --oneline -6
```

Expected: `.superpowers/` remains the only untracked path and all implementation commits are present on `feature/cr-implementation`.
