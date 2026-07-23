# CR Project Path and Hidden Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the opened project's absolute path and add a default-off hidden-file switch that synchronizes the left file tree with `⌘P` search, then rebuild the macOS app and publish the verified source.

**Architecture:** Keep the server API and permanent ignore rules unchanged. Derive one visible tree in `FileBrowser` with a small pure recursive helper, pass that same tree to both the rendered hierarchy and `QuickOpen`, and render `ProjectSummary.root` in the existing toolbar with truncation-only CSS.

**Tech Stack:** React 19, TypeScript 5.9, Zustand, TanStack Query, Testing Library, Vitest, Playwright, Vite, Swift/AppKit packaging scripts, Git and GitHub CLI.

---

## File map

- Modify `apps/web/src/features/projects/ProjectToolbar.test.tsx`: specify absolute-path rendering.
- Modify `apps/web/src/features/projects/ProjectToolbar.tsx`: render the current project's canonical root.
- Create `apps/web/src/features/files/file-tree-visibility.test.ts`: specify recursive dot-item filtering.
- Create `apps/web/src/features/files/file-tree-visibility.ts`: provide the pure visible-tree helper.
- Modify `apps/web/src/features/files/FileTree.test.tsx`: specify the default-off switch and synchronized `⌘P` candidates.
- Modify `apps/web/src/features/files/FileTree.tsx`: own the switch state and pass one visible tree to both consumers.
- Modify `apps/web/src/styles/layout.css`: style the path, filter controls, and narrow-width truncation.
- Create `docs/superpowers/plans/2026-07-23-cr-project-path-hidden-files.md`: record this executable plan.
- Rebuild `.worktrees/cr-implementation/outputs/CR.app`, copy it to the shared `outputs/CR.app`, and publish the verified Git tree to `fan0902/CodeReview`.

### Task 1: Display the canonical project path in the toolbar

**Files:**
- Modify: `apps/web/src/features/projects/ProjectToolbar.test.tsx`
- Modify: `apps/web/src/features/projects/ProjectToolbar.tsx`
- Modify: `apps/web/src/styles/layout.css`

- [ ] **Step 1: Write the failing toolbar test**

Add this test inside the existing `describe("ProjectToolbar", ...)` block in `apps/web/src/features/projects/ProjectToolbar.test.tsx`:

```tsx
it("shows the opened project's absolute path", async () => {
  const indexStatus = vi.fn().mockResolvedValue({
    phase: "ready",
    completed: 5,
    total: 5,
    diagnostics: [],
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ApiProvider client={{ indexStatus } as unknown as ApiClient}>
        <ProjectToolbar />
      </ApiProvider>
    </QueryClientProvider>,
  );

  const projectPath = screen.getByLabelText("工程绝对路径");
  expect(projectPath.textContent).toBe("/work/sample");
  expect(projectPath.getAttribute("title")).toBe("/work/sample");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm run test --workspace @cr/web -- src/features/projects/ProjectToolbar.test.tsx
```

Expected: FAIL because no element has the accessible name `工程绝对路径`.

- [ ] **Step 3: Render the absolute path**

In `apps/web/src/features/projects/ProjectToolbar.tsx`, insert this element immediately after `.project-name` and before the open-project button:

```tsx
{project ? (
  <code className="project-path" aria-label="工程绝对路径" title={project.root}>
    {project.root}
  </code>
) : null}
```

- [ ] **Step 4: Add toolbar truncation styles**

Update the relevant toolbar rules in `apps/web/src/styles/layout.css` to keep the primary actions visible while allowing both labels to truncate:

```css
.project-name {
  flex: 0 1 auto;
  max-width: 30%;
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-path {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-toolbar > button {
  flex: 0 0 auto;
}
```

Keep the existing `.index-status` rule so the status remains aligned at the right edge.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
npm run test --workspace @cr/web -- src/features/projects/ProjectToolbar.test.tsx
```

Expected: both `ProjectToolbar` tests PASS.

- [ ] **Step 6: Commit the toolbar behavior**

```bash
git add apps/web/src/features/projects/ProjectToolbar.test.tsx apps/web/src/features/projects/ProjectToolbar.tsx apps/web/src/styles/layout.css
git commit -m "feat: show opened project path"
```

### Task 2: Define recursive hidden-item filtering with TDD

**Files:**
- Create: `apps/web/src/features/files/file-tree-visibility.test.ts`
- Create: `apps/web/src/features/files/file-tree-visibility.ts`

- [ ] **Step 1: Write the failing pure-function tests**

Create `apps/web/src/features/files/file-tree-visibility.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { FileTreeNode } from "../../api/client.js";
import { visibleFileTree } from "./file-tree-visibility.js";

const tree = [
  {
    name: ".github",
    path: ".github",
    type: "directory",
    children: [
      { name: "ci.yml", path: ".github/ci.yml", type: "file" },
    ],
  },
  {
    name: "src",
    path: "src",
    type: "directory",
    children: [
      { name: ".env", path: "src/.env", type: "file" },
      { name: "main.ts", path: "src/main.ts", type: "file" },
    ],
  },
] satisfies FileTreeNode[];

describe("visibleFileTree", () => {
  it("recursively removes dot-prefixed files and directories", () => {
    expect(visibleFileTree(tree, false)).toEqual([
      {
        name: "src",
        path: "src",
        type: "directory",
        children: [
          { name: "main.ts", path: "src/main.ts", type: "file" },
        ],
      },
    ]);
  });

  it("returns the complete server tree when hidden items are enabled", () => {
    expect(visibleFileTree(tree, true)).toBe(tree);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm run test --workspace @cr/web -- src/features/files/file-tree-visibility.test.ts
```

Expected: FAIL because `file-tree-visibility.js` and `visibleFileTree` do not exist.

- [ ] **Step 3: Implement the minimal pure helper**

Create `apps/web/src/features/files/file-tree-visibility.ts`:

```ts
import type { FileTreeNode } from "../../api/client.js";

export function visibleFileTree(
  nodes: FileTreeNode[],
  showHidden: boolean,
): FileTreeNode[] {
  if (showHidden) return nodes;
  return nodes
    .filter((node) => !node.name.startsWith("."))
    .map((node) =>
      node.type === "directory"
        ? {
            ...node,
            children: visibleFileTree(node.children ?? [], false),
          }
        : node,
    );
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npm run test --workspace @cr/web -- src/features/files/file-tree-visibility.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit the pure filtering boundary**

```bash
git add apps/web/src/features/files/file-tree-visibility.test.ts apps/web/src/features/files/file-tree-visibility.ts
git commit -m "feat: filter hidden file tree nodes"
```

### Task 3: Add the synchronized file-tree and Quick Open switch

**Files:**
- Modify: `apps/web/src/features/files/FileTree.test.tsx`
- Modify: `apps/web/src/features/files/FileTree.tsx`
- Modify: `apps/web/src/styles/layout.css`

- [ ] **Step 1: Write the failing integration test**

Add this test inside the existing `describe("FileBrowser", ...)` block in `apps/web/src/features/files/FileTree.test.tsx`:

```tsx
it("uses one hidden-file switch for the tree and Quick Open", async () => {
  const user = userEvent.setup();
  const api = {
    getTree: vi.fn().mockResolvedValue([
      {
        name: ".github",
        path: ".github",
        type: "directory",
        children: [
          { name: "ci.yml", path: ".github/ci.yml", type: "file" },
        ],
      },
      { name: ".env", path: ".env", type: "file" },
      {
        name: "src",
        path: "src",
        type: "directory",
        children: [
          { name: "main.py", path: "src/main.py", type: "file" },
        ],
      },
    ]),
  } as unknown as ApiClient;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ApiProvider client={api}>
        <FileBrowser />
      </ApiProvider>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole("treeitem", { name: "main.py" })).toBeTruthy();
  expect(screen.queryByRole("treeitem", { name: ".env" })).toBeNull();
  expect(screen.queryByText(".github")).toBeNull();

  await user.click(screen.getByRole("button", { name: /搜索文件/ }));
  expect(screen.queryByRole("button", { name: ".env" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "关闭" }));

  await user.click(screen.getByRole("checkbox", { name: "显示隐藏文件" }));
  expect(screen.getByText(".github")).toBeTruthy();
  expect(screen.getByRole("treeitem", { name: ".env" })).toBeTruthy();

  await user.click(screen.getByRole("button", { name: /搜索文件/ }));
  await user.click(screen.getByRole("button", { name: ".env" }));
  expect(useWorkspace.getState().activeLocation).toEqual({
    path: ".env",
    line: 1,
    column: 1,
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm run test --workspace @cr/web -- src/features/files/FileTree.test.tsx
```

Expected: the new test FAILS because the hidden nodes are visible by default and no `显示隐藏文件` checkbox exists.

- [ ] **Step 3: Derive and share one visible tree**

Update the imports in `apps/web/src/features/files/FileTree.tsx`:

```tsx
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { visibleFileTree } from "./file-tree-visibility.js";
```

Inside `FileBrowser`, add the state and derived tree immediately after the query:

```tsx
const [showHidden, setShowHidden] = useState(false);
const visibleTree = useMemo(
  () => visibleFileTree(tree.data ?? [], showHidden),
  [showHidden, tree.data],
);
```

Replace the current return value with this structure, preserving the existing `visitLocation` calls:

```tsx
return (
  <div className="file-browser">
    <div className="file-browser-tools">
      <QuickOpen
        tree={visibleTree}
        onOpen={(path) => visitLocation({ path, line: 1, column: 1 })}
      />
      <label className="hidden-files-toggle">
        <input
          type="checkbox"
          checked={showHidden}
          onChange={(event) => setShowHidden(event.target.checked)}
        />
        <span>显示隐藏文件</span>
      </label>
    </div>
    <ul className="file-tree" role="tree" aria-label="文件树">
      {visibleTree.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          onOpen={(path) => visitLocation({ path, line: 1, column: 1 })}
        />
      ))}
    </ul>
  </div>
);
```

- [ ] **Step 4: Style the compact filter controls**

Add these rules next to the existing `.quick-open-trigger` styles in `apps/web/src/styles/layout.css`:

```css
.file-browser-tools {
  display: grid;
  gap: 7px;
  padding: 10px;
}

.file-browser-tools .quick-open-trigger {
  margin: 0;
}

.hidden-files-toggle {
  display: flex;
  gap: 7px;
  align-items: center;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
}

.hidden-files-toggle input {
  margin: 0;
  accent-color: var(--accent);
}
```

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```bash
npm run test --workspace @cr/web -- src/features/files/file-tree-visibility.test.ts src/features/files/FileTree.test.tsx
```

Expected: all visibility-helper and `FileBrowser` tests PASS.

- [ ] **Step 6: Commit the synchronized controls**

```bash
git add apps/web/src/features/files/FileTree.test.tsx apps/web/src/features/files/FileTree.tsx apps/web/src/styles/layout.css
git commit -m "feat: toggle hidden files in browser"
```

### Task 4: Run full regression and visual verification

**Files:**
- Verify: all tracked source files
- Inspect: `apps/web/test-results/readability/1440x900-light.png`
- Inspect: `apps/web/test-results/readability/1024x768-dark.png`

- [ ] **Step 1: Run the complete JavaScript and TypeScript verification**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: hygiene and every workspace test PASS, type checking exits 0, and every workspace build exits 0.

- [ ] **Step 2: Run browser acceptance tests**

Run:

```bash
npm run e2e --workspace @cr/web
```

Expected: all Playwright tests PASS and readability screenshots are regenerated.

- [ ] **Step 3: Inspect both layout extremes**

Open these generated images with the local image viewer used by the execution environment:

```text
apps/web/test-results/readability/1440x900-light.png
apps/web/test-results/readability/1024x768-dark.png
```

Verify that the absolute path truncates without overlapping `打开工程` or the index status, the hidden-file checkbox remains readable, and the code pane keeps its existing minimum width.

- [ ] **Step 4: Run Swift launcher tests**

Run:

```bash
bash scripts/test-swift-launcher.sh
```

Expected: all Swift launcher tests PASS.

### Task 5: Rebuild and deliver the macOS application

**Files:**
- Rebuild: `.worktrees/cr-implementation/outputs/CR.app`
- Replace: `outputs/CR.app`

- [ ] **Step 1: Stop only the currently running shared CR app**

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
```

Expected: the shared CR launcher and its validated Node child exit; unrelated applications remain running.

- [ ] **Step 2: Build and smoke-test the worktree app**

Run:

```bash
bash scripts/build-macos-app.sh
bash scripts/smoke-macos-app.sh
```

Expected: packaging, signature, regular-Dock lifecycle, service health, reopen reuse, and clean quit checks all PASS.

- [ ] **Step 3: Copy the signed app to the shared delivery location**

Run:

```bash
delivery_root="$(git worktree list --porcelain | awk '/^worktree / { print substr($0, 10); exit }')"
delivery_app="$delivery_root/outputs/CR.app"
ditto outputs/CR.app "$delivery_app"
codesign --verify --deep --strict --verbose=2 "$delivery_app"
```

Expected: `codesign` exits 0 and identifies the shared bundle as valid.

- [ ] **Step 4: Launch the final app and leave it running for user review**

Open `delivery_app` through Computer Use, then inspect the browser selected by macOS as the user's default.

Expected: the default browser shows the new CR build, the macOS running-app list contains exactly one regular `com.local.cr` app, and the local `/api/health` endpoint returns 200. Leave this final copy running so its CR icon remains visible in the Dock.

### Task 6: Publish the verified source tree to GitHub

**Files:**
- Publish: all tracked changes since local baseline `9353fd5e`
- Remote: `fan0902/CodeReview`, branch `main`

- [ ] **Step 1: Confirm the local delivery tree is clean except for known user-owned files**

Run:

```bash
git status --short --branch
git diff --check 9353fd5e HEAD
```

Expected: `.superpowers/` is the only untracked path, there are no tracked working-tree changes, and `git diff --check` exits 0.

- [ ] **Step 2: Create GitHub blobs and a tree based on current remote main**

Run this from the worktree root:

```bash
remote_head="$(gh api repos/fan0902/CodeReview/git/ref/heads/main --jq '.object.sha')"
remote_tree="$(gh api "repos/fan0902/CodeReview/git/commits/$remote_head" --jq '.tree.sha')"
tree_entries='[]'

while IFS= read -r changed_path; do
  encoded="$(base64 < "$changed_path" | tr -d '\n')"
  blob_sha="$(
    jq -n --arg content "$encoded" '{content:$content,encoding:"base64"}' |
      gh api --method POST repos/fan0902/CodeReview/git/blobs --input - --jq '.sha'
  )"
  tree_entries="$(
    jq \
      --arg path "$changed_path" \
      --arg sha "$blob_sha" \
      '. + [{path:$path,mode:"100644",type:"blob",sha:$sha}]' \
      <<<"$tree_entries"
  )"
done < <(git diff --name-only --diff-filter=ACMRT 9353fd5e HEAD)

published_tree="$(
  jq -n \
    --arg base_tree "$remote_tree" \
    --argjson tree "$tree_entries" \
    '{base_tree:$base_tree,tree:$tree}' |
    gh api --method POST repos/fan0902/CodeReview/git/trees --input - --jq '.sha'
)"
```

Expected: every changed text file receives a blob SHA and `published_tree` contains a new tree SHA.

- [ ] **Step 3: Create and advance the clean remote main commit**

Run:

```bash
published_commit="$(
  jq -n \
    --arg message "feat: show project path and filter hidden files" \
    --arg tree "$published_tree" \
    --arg parent "$remote_head" \
    '{message:$message,tree:$tree,parents:[$parent]}' |
    gh api --method POST repos/fan0902/CodeReview/git/commits --input - --jq '.sha'
)"

jq -n --arg sha "$published_commit" '{sha:$sha,force:false}' |
  gh api --method PATCH repos/fan0902/CodeReview/git/refs/heads/main --input -
```

Expected: GitHub updates `main` without force and returns the new ref SHA.

- [ ] **Step 4: Verify remote and local trees are identical**

Run:

```bash
remote_main="$(gh api repos/fan0902/CodeReview/git/ref/heads/main --jq '.object.sha')"
remote_tree="$(gh api "repos/fan0902/CodeReview/git/commits/$remote_main" --jq '.tree.sha')"
local_tree="$(git rev-parse HEAD^{tree})"
test "$remote_tree" = "$local_tree"
printf 'remote_main=%s\nremote_tree=%s\nlocal_tree=%s\n' \
  "$remote_main" "$remote_tree" "$local_tree"
```

Expected: `test` exits 0 and the printed remote and local tree SHAs match exactly.
