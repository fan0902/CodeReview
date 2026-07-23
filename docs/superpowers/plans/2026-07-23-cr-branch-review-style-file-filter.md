# CR Branch Review Style and File Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle CR with the warm, card-based visual language of the approved Branch Review reference and add a persistent left-sidebar filter that matches file names, directory names, and relative paths without changing CR's analysis APIs.

**Architecture:** Keep the server tree and permanent ignore rules unchanged. Compose the existing hidden-item helper with a new pure recursive query filter inside `FileBrowser`, then render the derived tree in both the hierarchical browser and Quick Open while using a dedicated post-layout theme stylesheet for the approved visual system.

**Tech Stack:** React 19, TypeScript 5.9, Zustand, TanStack Query, Monaco Editor, CSS custom properties, Testing Library, Vitest, Playwright, Vite, Swift/AppKit packaging scripts, GitHub REST API.

---

## File map

- Modify `apps/web/src/features/files/file-tree-visibility.ts`: add the pure name/path query filter.
- Modify `apps/web/src/features/files/file-tree-visibility.test.ts`: specify recursive matching, ancestor retention, directory matches, normalization, and empty results.
- Modify `apps/web/src/features/files/FileTree.tsx`: add filter state, project-reset behavior, empty state, project summary, language badges, and selected-file semantics.
- Modify `apps/web/src/features/files/FileTree.test.tsx`: specify the complete sidebar interaction and preserve hidden-file/Quick Open behavior.
- Modify `apps/web/src/features/projects/ProjectToolbar.tsx`: reshape the application header around identity, project path, primary open action, and status badge.
- Modify `apps/web/src/features/projects/ProjectToolbar.test.tsx`: specify the new header hierarchy without changing its existing behavior.
- Modify `apps/web/src/App.tsx`: import the post-layout visual theme.
- Modify `apps/web/src/styles/tokens.css`: replace cold light colors with the approved warm palette and keep a compatible dark palette.
- Create `apps/web/src/styles/branch-review-theme.css`: define the approved header, sidebar, tabs, cards, responsive layout, and focus treatment.
- Create `apps/web/e2e/file-filter.spec.ts`: verify file-name, directory, relative-path, clear, and empty-state flows in a real browser.
- Modify `apps/web/e2e/readability.spec.ts`: protect the 1440px/1024px layout and generate visual evidence.
- Create `docs/superpowers/plans/2026-07-23-cr-branch-review-style-file-filter.md`: record this executable plan.
- Rebuild `.worktrees/cr-implementation/outputs/CR.app`, replace the shared `outputs/CR.app`, and publish the verified source tree to `fan0902/CodeReview`.

### Task 1: Define recursive file and directory filtering with TDD

**Files:**
- Modify: `apps/web/src/features/files/file-tree-visibility.test.ts`
- Modify: `apps/web/src/features/files/file-tree-visibility.ts`

- [ ] **Step 1: Write the failing pure-function tests**

Replace `apps/web/src/features/files/file-tree-visibility.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import type { FileTreeNode } from "../../api/client.js";
import { filterFileTree, visibleFileTree } from "./file-tree-visibility.js";

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
    name: "nest",
    path: "nest",
    type: "directory",
    children: [
      {
        name: "src",
        path: "nest/src",
        type: "directory",
        children: [
          { name: ".env", path: "nest/src/.env", type: "file" },
          { name: "role.enum.ts", path: "nest/src/role.enum.ts", type: "file" },
          { name: "users.controller.ts", path: "nest/src/users.controller.ts", type: "file" },
        ],
      },
    ],
  },
  {
    name: "python",
    path: "python",
    type: "directory",
    children: [
      { name: "app.py", path: "python/app.py", type: "file" },
      { name: "models.py", path: "python/models.py", type: "file" },
    ],
  },
] satisfies FileTreeNode[];

describe("visibleFileTree", () => {
  it("recursively removes dot-prefixed files and directories", () => {
    expect(visibleFileTree(tree, false)).toEqual([
      {
        name: "nest",
        path: "nest",
        type: "directory",
        children: [{
          name: "src",
          path: "nest/src",
          type: "directory",
          children: [
            { name: "role.enum.ts", path: "nest/src/role.enum.ts", type: "file" },
            { name: "users.controller.ts", path: "nest/src/users.controller.ts", type: "file" },
          ],
        }],
      },
      {
        name: "python",
        path: "python",
        type: "directory",
        children: [
          { name: "app.py", path: "python/app.py", type: "file" },
          { name: "models.py", path: "python/models.py", type: "file" },
        ],
      },
    ]);
  });

  it("returns the complete server tree when hidden items are enabled", () => {
    expect(visibleFileTree(tree, true)).toBe(tree);
  });
});

describe("filterFileTree", () => {
  it("returns the same tree for a blank query", () => {
    expect(filterFileTree(tree, "  ")).toBe(tree);
  });

  it("matches a file name and retains only its ancestors", () => {
    expect(filterFileTree(tree, "ROLE.ENUM")).toEqual([
      {
        name: "nest",
        path: "nest",
        type: "directory",
        children: [{
          name: "src",
          path: "nest/src",
          type: "directory",
          children: [{ name: "role.enum.ts", path: "nest/src/role.enum.ts", type: "file" }],
        }],
      },
    ]);
  });

  it("matches a complete relative path case-insensitively", () => {
    expect(filterFileTree(tree, "  PYTHON/MODELS  ")).toEqual([
      {
        name: "python",
        path: "python",
        type: "directory",
        children: [{ name: "models.py", path: "python/models.py", type: "file" }],
      },
    ]);
  });

  it("keeps the complete visible subtree when a directory matches", () => {
    expect(filterFileTree(tree, "python")).toEqual([tree[2]]);
  });

  it("returns an empty tree when nothing matches", () => {
    expect(filterFileTree(tree, "missing-service")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm run test --workspace @cr/web -- src/features/files/file-tree-visibility.test.ts
```

Expected: FAIL because `filterFileTree` is not exported.

- [ ] **Step 3: Implement the minimal pure query filter**

Append this export to `apps/web/src/features/files/file-tree-visibility.ts`:

```ts
export function filterFileTree(
  nodes: FileTreeNode[],
  query: string,
): FileTreeNode[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return nodes;

  return filterNodes(nodes, normalizedQuery);
}

function filterNodes(nodes: FileTreeNode[], normalizedQuery: string): FileTreeNode[] {
  return nodes.flatMap((node) => {
    const matches =
      node.name.toLocaleLowerCase().includes(normalizedQuery) ||
      node.path.toLocaleLowerCase().includes(normalizedQuery);

    if (node.type === "file") return matches ? [node] : [];
    if (matches) return [node];

    const children = filterNodes(node.children ?? [], normalizedQuery);
    return children.length ? [{ ...node, children }] : [];
  });
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npm run test --workspace @cr/web -- src/features/files/file-tree-visibility.test.ts
```

Expected: all seven file-tree visibility tests PASS.

- [ ] **Step 5: Commit the pure filtering behavior**

```bash
git add apps/web/src/features/files/file-tree-visibility.ts apps/web/src/features/files/file-tree-visibility.test.ts
git commit -m "feat: filter file tree by name and path"
```

### Task 2: Add the sidebar filter and file-row hierarchy with TDD

**Files:**
- Modify: `apps/web/src/features/files/FileTree.test.tsx`
- Modify: `apps/web/src/features/files/FileTree.tsx`

- [ ] **Step 1: Add failing sidebar interaction tests**

In `apps/web/src/features/files/FileTree.test.tsx`, extend the Testing Library import to include `act` and `waitFor`, then hoist this fixture immediately above `describe("FileBrowser", ...)`:

```ts
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
```

```ts
const projectTree = [
  {
    name: ".github",
    path: ".github",
    type: "directory",
    children: [{ name: "ci.yml", path: ".github/ci.yml", type: "file" }],
  },
  { name: ".env", path: ".env", type: "file" },
  {
    name: "nest",
    path: "nest",
    type: "directory",
    children: [{
      name: "src",
      path: "nest/src",
      type: "directory",
      children: [
        { name: "role.enum.ts", path: "nest/src/role.enum.ts", type: "file" },
        { name: "users.controller.ts", path: "nest/src/users.controller.ts", type: "file" },
      ],
    }],
  },
  {
    name: "python",
    path: "python",
    type: "directory",
    children: [
      { name: "app.py", path: "python/app.py", type: "file" },
      { name: "models.py", path: "python/models.py", type: "file" },
    ],
  },
] as const;
```

Change the first test's `getTree` mock to `vi.fn().mockResolvedValue(projectTree)`, then add these tests inside the existing `describe` block:

```tsx
it("filters by relative path, retains ancestors, and clears the query", async () => {
  const user = userEvent.setup();
  const api = { getTree: vi.fn().mockResolvedValue(projectTree) } as unknown as ApiClient;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ApiProvider client={api}>
        <FileBrowser />
      </ApiProvider>
    </QueryClientProvider>,
  );

  const filter = await screen.findByRole("searchbox", { name: "过滤文件或目录" });
  await user.type(filter, "nest/src/role");

  expect(screen.getByText("nest")).toBeTruthy();
  expect(screen.getByText("src")).toBeTruthy();
  expect(screen.getByRole("treeitem", { name: "role.enum.ts" })).toBeTruthy();
  expect(screen.queryByRole("treeitem", { name: "users.controller.ts" })).toBeNull();
  expect(screen.queryByRole("treeitem", { name: "app.py" })).toBeNull();

  await user.click(screen.getByRole("button", { name: "清空文件过滤" }));
  expect(screen.getByRole("treeitem", { name: "users.controller.ts" })).toBeTruthy();
  expect(screen.getByRole("treeitem", { name: "app.py" })).toBeTruthy();
});

it("shows an empty state and resets the filter when the project changes", async () => {
  const user = userEvent.setup();
  const api = { getTree: vi.fn().mockResolvedValue(projectTree) } as unknown as ApiClient;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ApiProvider client={api}>
        <FileBrowser />
      </ApiProvider>
    </QueryClientProvider>,
  );

  const filter = await screen.findByRole("searchbox", { name: "过滤文件或目录" });
  await user.type(filter, "not-present");
  expect(screen.getByText("没有匹配的文件或目录")).toBeTruthy();

  act(() => {
    useWorkspace.setState({
      project: { id: "p2", name: "other", root: "/work/other" },
    });
  });
  await waitFor(() => {
    expect((screen.getByRole("searchbox", { name: "过滤文件或目录" }) as HTMLInputElement).value).toBe("");
  });
});

it("applies hidden visibility before the persistent query", async () => {
  const user = userEvent.setup();
  const api = { getTree: vi.fn().mockResolvedValue(projectTree) } as unknown as ApiClient;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ApiProvider client={api}>
        <FileBrowser />
      </ApiProvider>
    </QueryClientProvider>,
  );

  const filter = await screen.findByRole("searchbox", { name: "过滤文件或目录" });
  await user.type(filter, ".env");
  expect(screen.getByText("没有匹配的文件或目录")).toBeTruthy();

  await user.click(screen.getByRole("checkbox", { name: "显示隐藏文件" }));
  expect(screen.getByRole("treeitem", { name: ".env" })).toBeTruthy();
});

it("marks the active file and exposes language badges without changing its accessible name", async () => {
  const api = { getTree: vi.fn().mockResolvedValue(projectTree) } as unknown as ApiClient;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ApiProvider client={api}>
        <FileBrowser />
      </ApiProvider>
    </QueryClientProvider>,
  );

  const file = await screen.findByRole("treeitem", { name: "users.controller.ts" });
  await userEvent.setup().click(file);

  expect(file.getAttribute("aria-selected")).toBe("true");
  expect(screen.getAllByText("TS").length).toBeGreaterThan(0);
  expect(screen.getAllByText("PY").length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the component test and verify RED**

Run:

```bash
npm run test --workspace @cr/web -- src/features/files/FileTree.test.tsx
```

Expected: FAIL because the filter input, clear action, empty state, badges, and selected semantics do not exist.

- [ ] **Step 3: Implement the complete sidebar behavior**

Replace `apps/web/src/features/files/FileTree.tsx` with:

```tsx
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useApi } from "../../api/ApiProvider.js";
import type { FileTreeNode } from "../../api/client.js";
import { useWorkspace } from "../../state/workspace-store.js";
import { filterFileTree, visibleFileTree } from "./file-tree-visibility.js";
import { QuickOpen } from "./QuickOpen.js";

export function FileBrowser() {
  const api = useApi();
  const project = useWorkspace((state) => state.project);
  const activePath = useWorkspace((state) => state.activeLocation?.path);
  const visitLocation = useWorkspace((state) => state.visitLocation);
  const tree = useQuery({
    queryKey: ["file-tree", project?.id],
    queryFn: api.getTree,
    enabled: Boolean(project),
  });
  const [showHidden, setShowHidden] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");

  useEffect(() => setFilterQuery(""), [project?.id]);

  const baseTree = useMemo(
    () => visibleFileTree(tree.data ?? [], showHidden),
    [showHidden, tree.data],
  );
  const filteredTree = useMemo(
    () => filterFileTree(baseTree, filterQuery),
    [baseTree, filterQuery],
  );

  if (!project) return <p className="region-placeholder">尚未打开工程</p>;
  if (tree.isPending) return <p className="region-placeholder">读取文件树…</p>;
  if (tree.isError) return <p className="panel-state panel-error" role="alert">无法读取工程文件</p>;

  const openFile = (path: string) => visitLocation({ path, line: 1, column: 1 });
  const hasFilter = Boolean(filterQuery.trim());

  return (
    <div className="file-browser">
      <div className="file-browser-header">
        <span className="repository-mark" aria-hidden="true">⌘</span>
        <div>
          <strong>{project.name}</strong>
          <code title={project.root}>{project.root}</code>
        </div>
      </div>
      <div className="file-browser-tools">
        <div className="file-filter">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            aria-label="过滤文件或目录"
            placeholder="过滤文件或目录"
            value={filterQuery}
            onChange={(event) => setFilterQuery(event.currentTarget.value)}
          />
          {filterQuery ? (
            <button type="button" aria-label="清空文件过滤" onClick={() => setFilterQuery("")}>
              ×
            </button>
          ) : null}
        </div>
        <div className="file-tool-row">
          <QuickOpen tree={filteredTree} onOpen={openFile} />
          <label className="hidden-files-toggle">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(event) => setShowHidden(event.target.checked)}
            />
            <span>显示隐藏文件</span>
          </label>
        </div>
      </div>
      {filteredTree.length ? (
        <ul className="file-tree" role="tree" aria-label="文件树">
          {filteredTree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              activePath={activePath}
              onOpen={openFile}
            />
          ))}
        </ul>
      ) : hasFilter ? (
        <div className="file-filter-empty">
          <strong>没有匹配的文件或目录</strong>
          <span>试试文件名、目录名或相对路径</span>
          <button type="button" onClick={() => setFilterQuery("")}>清空筛选</button>
        </div>
      ) : (
        <p className="panel-state">工程中没有可显示的文件</p>
      )}
    </div>
  );
}

function TreeNode({
  node,
  activePath,
  onOpen,
}: {
  node: FileTreeNode;
  activePath?: string;
  onOpen: (path: string) => void;
}) {
  if (node.type === "directory") {
    return (
      <li role="none">
        <details open>
          <summary>{node.name}</summary>
          <ul role="group">
            {node.children?.map((child) => (
              <TreeNode key={child.path} node={child} activePath={activePath} onOpen={onOpen} />
            ))}
          </ul>
        </details>
      </li>
    );
  }

  const badge = fileBadge(node.path);
  const parentPath = node.path.includes("/") ? node.path.slice(0, node.path.lastIndexOf("/")) : "工程根目录";
  return (
    <li role="none">
      <button
        type="button"
        role="treeitem"
        aria-label={node.name}
        aria-selected={node.path === activePath}
        onClick={() => onOpen(node.path)}
      >
        <span className={`file-type-badge ${badge.className}`} aria-hidden="true">{badge.label}</span>
        <span className="file-node-copy">
          <span className="file-node-name">{node.name}</span>
          <span className="file-node-path">{parentPath}</span>
        </span>
      </button>
    </li>
  );
}

function fileBadge(path: string): { label: string; className: string } {
  if (/\.py$/i.test(path)) return { label: "PY", className: "file-type-python" };
  if (/\.tsx?$/i.test(path)) return { label: "TS", className: "file-type-typescript" };
  return { label: "·", className: "file-type-other" };
}
```

The rendered tree and `QuickOpen` both receive `filteredTree`, so hidden-item visibility and the persistent sidebar query have one consistent result set.

- [ ] **Step 4: Run the component test and verify GREEN**

Run:

```bash
npm run test --workspace @cr/web -- src/features/files/FileTree.test.tsx
```

Expected: all six `FileBrowser` tests PASS, including the existing hidden-item, Quick Open, and source-opening behavior.

- [ ] **Step 5: Commit the sidebar behavior**

```bash
git add apps/web/src/features/files/FileTree.tsx apps/web/src/features/files/FileTree.test.tsx
git commit -m "feat: add file and directory sidebar filter"
```

### Task 3: Reshape the project toolbar around the approved hierarchy

**Files:**
- Modify: `apps/web/src/features/projects/ProjectToolbar.test.tsx`
- Modify: `apps/web/src/features/projects/ProjectToolbar.tsx`

- [ ] **Step 1: Write the failing header hierarchy test**

Add this test inside `describe("ProjectToolbar", ...)`:

```tsx
it("renders application identity, project location, and the primary open action", () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ApiProvider client={{
        indexStatus: vi.fn().mockResolvedValue({
          phase: "ready",
          completed: 5,
          total: 5,
          diagnostics: [],
        }),
      } as unknown as ApiClient}>
        <ProjectToolbar />
      </ApiProvider>
    </QueryClientProvider>,
  );

  expect(screen.getByText("本地只读代码阅读")).toBeTruthy();
  expect(screen.getByLabelText("当前工程").textContent).toContain("sample");
  expect(screen.getByRole("button", { name: "打开工程" }).classList).toContain("primary-action");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm run test --workspace @cr/web -- src/features/projects/ProjectToolbar.test.tsx
```

Expected: FAIL because the subtitle, current-project region, and primary-action class do not exist.

- [ ] **Step 3: Replace only the toolbar return markup**

In `ProjectToolbar`, replace the existing `return (...)` with:

```tsx
return (
  <div className="project-toolbar">
    <div className="app-identity">
      <span className="brand-mark" aria-hidden="true">CR</span>
      <span className="brand-copy">
        <strong>CR</strong>
        <small>本地只读代码阅读</small>
      </span>
    </div>
    <div className="project-location" aria-label="当前工程">
      <span className="folder-mark" aria-hidden="true">▱</span>
      <span className="project-location-copy">
        <span className="project-name">{project?.name ?? "未打开工程"}</span>
        {project ? (
          <code className="project-path" aria-label="工程绝对路径" title={project.root}>
            {project.root}
          </code>
        ) : (
          <span className="project-path-empty">选择本地 Python 或 TypeScript 工程</span>
        )}
      </span>
    </div>
    <button
      className="primary-action"
      type="button"
      onClick={() => void openProject()}
      disabled={opening}
    >
      {opening ? "正在打开…" : "打开工程"}
    </button>
    <IndexStatus />
  </div>
);
```

Do not change `openProject` or the request/error behavior in `IndexStatus`. Replace the `IndexStatus` return with this status-specific class so the visual dot never shows a green success state for errors or idle indexing:

```tsx
const tone = label === "索引就绪" ? "ready" : label === "索引异常" ? "error" : "neutral";
return (
  <button
    className={`index-status status-${tone}`}
    type="button"
    onClick={() => void refresh()}
  >
    {label}
  </button>
);
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npm run test --workspace @cr/web -- src/features/projects/ProjectToolbar.test.tsx
```

Expected: all three toolbar tests PASS.

- [ ] **Step 5: Commit the header structure**

```bash
git add apps/web/src/features/projects/ProjectToolbar.tsx apps/web/src/features/projects/ProjectToolbar.test.tsx
git commit -m "feat: clarify CR project header hierarchy"
```

### Task 4: Apply the approved visual system

**Files:**
- Modify: `apps/web/src/styles/tokens.css`
- Create: `apps/web/src/styles/branch-review-theme.css`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Capture the current visual baseline**

Run:

```bash
npm run build --workspace @cr/web
npm run e2e --workspace @cr/web -- readability.spec.ts
```

Expected: PASS and the existing cold blue/gray screenshots are present under `apps/web/test-results/readability/` for comparison.

- [ ] **Step 2: Replace the palette tokens**

Replace the variable declarations at the top of `apps/web/src/styles/tokens.css` with:

```css
:root {
  color-scheme: light dark;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-synthesis: none;
  --canvas: #f8f5ee;
  --surface: #fffdf9;
  --surface-muted: #f1ebdf;
  --surface-strong: #e9e0d2;
  --border: #ded5c7;
  --border-strong: #c9beae;
  --text: #282722;
  --text-muted: #817b71;
  --accent: #272621;
  --focus: #2976c8;
  --danger: #a85245;
  --success: #2f8065;
  --method-get: #27745d;
  --method-post: #987026;
  --method-put: #466697;
  --method-delete: #a14f43;
  --mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
}

@media (prefers-color-scheme: dark) {
  :root {
    --canvas: #1d1c19;
    --surface: #25241f;
    --surface-muted: #302e28;
    --surface-strong: #39362e;
    --border: #49463e;
    --border-strong: #5c574d;
    --text: #f1eee7;
    --text-muted: #b8b1a5;
    --accent: #f0ece4;
    --focus: #78aee7;
    --danger: #dc8a7c;
    --success: #72bea1;
  }
}
```

Keep the existing universal sizing, root dimensions, body, form-font, focus, and monospace rules below these declarations unchanged.

- [ ] **Step 3: Add the complete post-layout theme**

Create `apps/web/src/styles/branch-review-theme.css` with:

```css
.app-shell {
  grid-template-rows: 76px minmax(0, 1fr);
  background: var(--canvas);
}

.topbar {
  padding: 0 22px;
  background: color-mix(in srgb, var(--surface) 94%, transparent);
  border-color: var(--border);
}

.project-toolbar {
  display: grid;
  grid-template-columns: minmax(190px, 240px) minmax(260px, 1fr) auto auto;
  gap: 12px;
}

.app-identity,
.project-location,
.project-location-copy,
.brand-copy {
  min-width: 0;
}

.app-identity,
.project-location {
  display: flex;
  align-items: center;
}

.app-identity { gap: 11px; }

.brand-mark {
  display: grid;
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  place-items: center;
  color: #fff;
  font-size: 14px;
  font-weight: 750;
  letter-spacing: .08em;
  background: #292823;
  border-radius: 12px;
}

.brand-copy,
.project-location-copy {
  display: grid;
  gap: 2px;
}

.brand-copy strong { font-size: 17px; }
.brand-copy small,
.project-path-empty { color: var(--text-muted); font-size: 11px; }

.project-location {
  gap: 10px;
  min-height: 44px;
  padding: 7px 12px;
  background: var(--canvas);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.folder-mark { color: var(--text-muted); font-size: 19px; }
.project-location-copy { overflow: hidden; }
.project-name { max-width: none; font-size: 12px; }
.project-path { font-size: 11px; }

.project-toolbar .primary-action,
.save-enum {
  color: var(--surface);
  background: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 10px;
}

.project-toolbar .primary-action { min-height: 44px; padding: 0 18px; font-weight: 650; }
.project-toolbar .primary-action:disabled { opacity: .55; }

.project-toolbar .index-status {
  min-height: 34px;
  padding: 0 10px;
  margin-left: 0;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 999px;
}

.project-toolbar .index-status::before {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 7px;
  content: "";
  background: var(--text-muted);
  border-radius: 50%;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--text-muted) 13%, transparent);
}

.project-toolbar .status-ready::before { background: var(--success); box-shadow: 0 0 0 4px color-mix(in srgb, var(--success) 13%, transparent); }
.project-toolbar .status-error::before { background: var(--danger); box-shadow: 0 0 0 4px color-mix(in srgb, var(--danger) 13%, transparent); }

.workspace-grid { grid-template-columns: minmax(280px, 20vw) minmax(560px, 1fr) minmax(320px, 24vw); gap: 1px; background: var(--border); }
.workspace-grid.information-closed { grid-template-columns: minmax(280px, 20vw) minmax(560px, 1fr) 34px; }
.files-region { background: var(--surface-muted); border-right: 0; }
.code-region,
.information-region { background: var(--surface); }
.information-region { border-left: 0; }

.file-browser { grid-template-rows: auto auto minmax(0, 1fr); }

.file-browser-header {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 16px 14px 12px;
  border-bottom: 1px solid var(--border);
}

.file-browser-header > div { min-width: 0; }
.file-browser-header strong,
.file-browser-header code { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-browser-header strong { font-size: 14px; }
.file-browser-header code { margin-top: 3px; color: var(--text-muted); font-size: 10px; }

.repository-mark {
  display: grid;
  flex: 0 0 34px;
  width: 34px;
  height: 34px;
  place-items: center;
  color: #a75242;
  background: #f4ddd5;
  border-radius: 10px;
}

.file-browser-tools { gap: 9px; padding: 12px 12px 10px; }

.file-filter {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  padding: 0 9px;
  color: var(--text-muted);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.file-filter:focus-within { border-color: var(--focus); box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus) 13%, transparent); }
.file-filter input { min-width: 0; padding: 8px; background: transparent; border: 0; outline: 0; }
.file-filter input::-webkit-search-cancel-button { display: none; }
.file-filter button { padding: 3px 5px; color: var(--text-muted); background: transparent; border: 0; }

.file-tool-row { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
.file-tool-row .quick-open-trigger { flex: 0 1 auto; padding: 5px 7px; font-size: 11px; background: transparent; border-color: transparent; }
.hidden-files-toggle { flex: 0 0 auto; font-size: 11px; }

.file-tree { padding: 2px 8px 16px; }
.file-tree ul { padding-left: 13px; }
.file-tree summary { padding: 6px 7px; color: var(--text-muted); font-size: 12px; font-weight: 650; cursor: pointer; }

.file-tree button[role="treeitem"] {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 9px;
  align-items: center;
  min-height: 52px;
  padding: 6px 7px;
  margin: 2px 0;
  border: 1px solid transparent;
  border-radius: 11px;
}

.file-tree button[role="treeitem"]:hover { background: color-mix(in srgb, var(--surface) 70%, transparent); }
.file-tree button[role="treeitem"][aria-selected="true"] { background: var(--surface); border-color: var(--focus); box-shadow: 0 1px 5px color-mix(in srgb, var(--text) 8%, transparent); }

.file-type-badge {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  font-size: 10px;
  font-weight: 700;
  border-radius: 9px;
}

.file-type-python { color: #3f7284; background: #dcecf1; }
.file-type-typescript { color: #4a67a0; background: #e0e7f5; }
.file-type-other { color: var(--text-muted); background: var(--surface-strong); }
.file-node-copy,
.file-node-name,
.file-node-path { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-node-name { font-size: 12px; font-weight: 600; }
.file-node-path { margin-top: 3px; color: var(--text-muted); font-size: 10px; }

.file-filter-empty { display: grid; gap: 5px; align-content: start; padding: 28px 18px; color: var(--text-muted); text-align: center; }
.file-filter-empty strong { color: var(--text); font-size: 13px; }
.file-filter-empty span { font-size: 11px; }
.file-filter-empty button { justify-self: center; padding: 5px 8px; color: var(--focus); background: transparent; border: 0; }

.file-tabs { padding: 6px 7px 0; background: var(--canvas); }
.file-tab { margin-right: 4px; border: 1px solid transparent; border-bottom: 0; border-radius: 9px 9px 0 0; }
.file-tab.active { background: var(--surface); border-color: var(--border); }

.information-tabs { gap: 4px; padding: 7px; background: var(--canvas); }
.information-tabs button { border-radius: 8px; }
.information-tabs button[aria-selected="true"] { border-bottom-color: var(--accent); }
.controller-filters { padding: 12px; background: var(--surface); }
.controller-filters input,
.controller-filters select,
.enum-search > input { border-radius: 9px; }
.endpoint-card,
.enum-card { border-radius: 12px; box-shadow: 0 1px 3px color-mix(in srgb, var(--text) 5%, transparent); }
.source-link { color: var(--focus); }
.panel-toggle,
.information-rail { color: var(--text-muted); background: var(--surface-muted); }

.welcome { padding: 36px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; box-shadow: 0 10px 30px color-mix(in srgb, var(--text) 6%, transparent); }
.recent-projects button { border-radius: 10px; }

@media (max-width: 1150px) {
  .workspace-grid:not(.information-closed) { grid-template-columns: minmax(240px, 26vw) minmax(560px, 1fr) 34px; }
  .app-identity { gap: 8px; }
  .brand-copy small { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; }
}
```

- [ ] **Step 4: Import the theme after base layout styles**

In `apps/web/src/App.tsx`, add this import immediately after `import "./styles/layout.css";`:

```ts
import "./styles/branch-review-theme.css";
```

- [ ] **Step 5: Run unit tests, typecheck, and production build**

Run:

```bash
npm run test --workspace @cr/web
npm run typecheck --workspace @cr/web
npm run build --workspace @cr/web
```

Expected: all Web unit tests PASS, TypeScript exits 0, and Vite produces `apps/web/dist`.

- [ ] **Step 6: Commit the approved visual system**

```bash
git add apps/web/src/App.tsx apps/web/src/styles/tokens.css apps/web/src/styles/branch-review-theme.css
git commit -m "style: align CR with warm review interface"
```

### Task 5: Protect the browser interaction and responsive visuals

**Files:**
- Create: `apps/web/e2e/file-filter.spec.ts`
- Modify: `apps/web/e2e/readability.spec.ts`

- [ ] **Step 1: Write the end-to-end file-filter flow**

Create `apps/web/e2e/file-filter.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { openFixture } from "./helpers.js";

test("filters files and directories by name and relative path", async ({ page }) => {
  await openFixture(page);
  const filter = page.getByRole("searchbox", { name: "过滤文件或目录" });

  await filter.fill("nest/src/role");
  await expect(page.getByText("nest", { exact: true })).toBeVisible();
  await expect(page.getByText("src", { exact: true })).toBeVisible();
  await expect(page.getByRole("treeitem", { name: "role.enum.ts" })).toBeVisible();
  await expect(page.getByRole("treeitem", { name: "users.controller.ts" })).toHaveCount(0);

  await filter.fill("python");
  await expect(page.getByRole("treeitem", { name: "app.py" })).toBeVisible();
  await expect(page.getByRole("treeitem", { name: "models.py" })).toBeVisible();

  await filter.fill("missing-service");
  await expect(page.getByText("没有匹配的文件或目录")).toBeVisible();
  await page.getByRole("button", { name: "清空筛选" }).click();
  await expect(page.getByRole("treeitem", { name: "users.controller.ts" })).toBeVisible();
});
```

- [ ] **Step 2: Strengthen responsive assertions**

Inside the viewport loop in `apps/web/e2e/readability.spec.ts`, after `openFixture(page)` and before opening the source file, add:

```ts
await expect(page.getByText("本地只读代码阅读")).toBeVisible();
await expect(page.getByRole("searchbox", { name: "过滤文件或目录" })).toBeVisible();
await expect(page.getByLabel("当前工程")).toContainText("mixed-project");
```

After calculating `codeBox`, add:

```ts
const headerBox = await page.locator(".project-toolbar").boundingBox();
expect(headerBox?.width).toBeLessThanOrEqual(viewport.width - 28);
const sidebarBox = await page.getByRole("navigation", { name: "工程文件" }).boundingBox();
expect(sidebarBox?.width).toBeGreaterThanOrEqual(240);
```

- [ ] **Step 3: Run focused browser tests**

Run:

```bash
npm run build --workspace @cr/web
npm run e2e --workspace @cr/web -- file-filter.spec.ts readability.spec.ts reader.spec.ts
```

Expected: file filtering, controller/enum/navigation regression, and both viewport scenarios PASS.

- [ ] **Step 4: Inspect the generated screenshots**

Open these images with the local image viewer:

```text
apps/web/test-results/readability/1440x900-light.png
apps/web/test-results/readability/1024x768-light.png
apps/web/test-results/readability/1440x900-dark.png
apps/web/test-results/readability/1024x768-dark.png
```

Compare the light screenshots with the approved reference and verify: warm white canvas, beige sidebar, black primary button, clear project path hierarchy, rounded inputs/cards, visible file badges, selected-file outline, and no horizontal overlap. Verify the dark screenshots preserve the same hierarchy and readable contrast.

- [ ] **Step 5: Commit the browser acceptance coverage**

```bash
git add apps/web/e2e/file-filter.spec.ts apps/web/e2e/readability.spec.ts
git commit -m "test: cover CR filtering and visual hierarchy"
```

### Task 6: Run full verification, rebuild CR.app, and publish

**Files:**
- Verify: all tracked source and tests
- Rebuild: `.worktrees/cr-implementation/outputs/CR.app`
- Replace: shared `outputs/CR.app`
- Publish: `fan0902/CodeReview`, branch `main`

- [ ] **Step 1: Run the complete repository verification**

Run:

```bash
npm test
npm run typecheck
npm run build
npm run e2e --workspace @cr/web
bash scripts/test-swift-launcher.sh
bash scripts/test-repository-hygiene.sh
git diff --check 45b0e15841dbc5b2449167c45602df4d7deb30dd HEAD
```

Expected: all JS/TS tests, Playwright tests, Swift tests, typechecks, builds, hygiene checks, and whitespace checks PASS. `.superpowers/` remains the only untracked path.

- [ ] **Step 2: Stop only the currently delivered CR launcher**

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

Expected: only the running shared CR launcher terminates; unrelated applications remain running.

- [ ] **Step 3: Build, sign, and smoke-test the worktree app**

Run:

```bash
bash scripts/build-macos-app.sh
bash scripts/test-macos-bundle.sh outputs/CR.app
bash scripts/smoke-macos-app.sh
codesign --verify --deep --strict --verbose=2 outputs/CR.app
```

Expected: bundle structure, ad-hoc signature, regular Dock lifecycle, local service, path security, browser-page reuse, and clean quit checks all PASS.

- [ ] **Step 4: Replace and validate the shared app**

Run:

```bash
delivery_root="$(git worktree list --porcelain | awk '/^worktree / { print substr($0, 10); exit }')"
delivery_app="$delivery_root/outputs/CR.app"
if [[ "$delivery_app" != "$delivery_root/outputs/CR.app" ]]; then
  exit 1
fi
ditto outputs/CR.app "$delivery_app"
codesign --verify --deep --strict --verbose=2 "$delivery_app"
open "$delivery_app"
```

Expected: the signed shared app starts as one regular `com.local.cr` Dock application and opens or refreshes the most recently active CR tab in the system default browser.

- [ ] **Step 5: Perform final visual acceptance on the packaged app**

In the default browser opened by the shared app:

1. Open the mixed fixture or another Python/TypeScript project.
2. Confirm the absolute project path is readable and truncates safely.
3. Filter by a file name, a directory name, and a relative path.
4. Toggle hidden files while a query is active.
5. Open a result, confirm its selected outline, and verify definition navigation.
6. Inspect Controllers and Enums, including locally saved and deleted enum entries.
7. Click CR in the Dock again and confirm the most recently active tab refreshes without creating another tab.

Expected: all approved UI and existing CR behaviors work in the packaged app.

- [ ] **Step 6: Verify the remote baseline before writing GitHub**

Run:

```bash
expected_remote_tree="98d0f364352a81562f8402347a30200939d7321c"
remote_head="$(gh api repos/fan0902/CodeReview/git/ref/heads/main --jq '.object.sha')"
remote_tree="$(gh api "repos/fan0902/CodeReview/git/commits/$remote_head" --jq '.tree.sha')"
test "$remote_tree" = "$expected_remote_tree"
printf 'remote_head=%s\nremote_tree=%s\n' "$remote_head" "$remote_tree"
```

Expected: the current remote tree still equals the last verified baseline. If it differs, stop and reconcile the concurrent remote update instead of publishing.

- [ ] **Step 7: Create GitHub blobs and a tree for every local change**

Run from the worktree root:

```bash
local_baseline="45b0e15841dbc5b2449167c45602df4d7deb30dd"
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
done < <(git diff --name-only --diff-filter=ACMRT "$local_baseline" HEAD)

published_tree="$(
  jq -n --arg base_tree "$remote_tree" --argjson tree "$tree_entries" \
    '{base_tree:$base_tree,tree:$tree}' |
    gh api --method POST repos/fan0902/CodeReview/git/trees --input - --jq '.sha'
)"
```

Expected: every changed source, test, spec, and plan file receives a blob SHA, and `published_tree` contains the new Git tree SHA.

- [ ] **Step 8: Create and advance the remote commit without force**

Run:

```bash
published_commit="$(
  jq -n \
    --arg message "feat: refresh CR interface and add file filtering" \
    --arg tree "$published_tree" \
    --arg parent "$remote_head" \
    '{message:$message,tree:$tree,parents:[$parent]}' |
    gh api --method POST repos/fan0902/CodeReview/git/commits --input - --jq '.sha'
)"

jq -n --arg sha "$published_commit" '{sha:$sha,force:false}' |
  gh api --method PATCH repos/fan0902/CodeReview/git/refs/heads/main --input -
```

Expected: GitHub advances `main` without force and returns the new ref SHA.

- [ ] **Step 9: Prove local and remote source trees are identical**

Run:

```bash
remote_main="$(gh api repos/fan0902/CodeReview/git/ref/heads/main --jq '.object.sha')"
published_remote_tree="$(gh api "repos/fan0902/CodeReview/git/commits/$remote_main" --jq '.tree.sha')"
local_tree="$(git rev-parse HEAD^{tree})"
test "$published_remote_tree" = "$local_tree"
git status --short --branch
printf 'remote_main=%s\nremote_tree=%s\nlocal_tree=%s\n' \
  "$remote_main" "$published_remote_tree" "$local_tree"
```

Expected: remote and local tree SHAs are identical, tracked files are clean, and `.superpowers/` remains unmodified and untracked.
