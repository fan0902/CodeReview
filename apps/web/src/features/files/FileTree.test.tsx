import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "../../api/ApiProvider.js";
import type { ApiClient, FileTreeNode } from "../../api/client.js";
import { useWorkspace } from "../../state/workspace-store.js";
import { FileBrowser } from "./FileTree.js";

beforeEach(() => {
  useWorkspace.getState().reset();
  useWorkspace.setState({
    project: { id: "p1", name: "sample", root: "/work/sample" },
  });
});
afterEach(cleanup);

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
] satisfies FileTreeNode[];

describe("FileBrowser", () => {
  it("uses one hidden-file switch for the tree and Quick Open", async () => {
    const user = userEvent.setup();
    const api = {
      getTree: vi.fn().mockResolvedValue(projectTree),
    } as unknown as ApiClient;
    renderFileBrowser(api);

    expect(await screen.findByRole("treeitem", { name: "app.py" })).toBeTruthy();
    expect(screen.queryByRole("treeitem", { name: ".env" })).toBeNull();
    expect(screen.queryByText(".github")).toBeNull();

    await user.click(screen.getByRole("button", { name: /搜索文件/ }));
    expect(screen.queryByRole("button", { name: ".env" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "关闭" }));

    await user.click(screen.getByRole("checkbox", { name: "显示隐藏文件" }));
    expect(screen.getByText(".github", { selector: "summary" })).toBeTruthy();
    expect(screen.getByRole("treeitem", { name: ".env" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /搜索文件/ }));
    await user.click(screen.getByRole("button", { name: ".env" }));
    expect(useWorkspace.getState().activeLocation).toEqual({
      path: ".env",
      line: 1,
      column: 1,
    });
  });

  it("opens a supported source file in a tab", async () => {
    const api = {
      getTree: vi.fn().mockResolvedValue(projectTree),
    } as unknown as ApiClient;
    renderFileBrowser(api);

    await userEvent.setup().click(await screen.findByRole("treeitem", { name: "app.py" }));

    expect(useWorkspace.getState().tabs).toContain("python/app.py");
    expect(useWorkspace.getState().activeLocation).toEqual({
      path: "python/app.py",
      line: 1,
      column: 1,
    });
  });

  it("filters by relative path, retains ancestors, and clears the query", async () => {
    const user = userEvent.setup();
    const api = { getTree: vi.fn().mockResolvedValue(projectTree) } as unknown as ApiClient;
    renderFileBrowser(api);

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
    renderFileBrowser(api);

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
    renderFileBrowser(api);

    const filter = await screen.findByRole("searchbox", { name: "过滤文件或目录" });
    await user.type(filter, ".env");
    expect(screen.getByText("没有匹配的文件或目录")).toBeTruthy();

    await user.click(screen.getByRole("checkbox", { name: "显示隐藏文件" }));
    expect(screen.getByRole("treeitem", { name: ".env" })).toBeTruthy();
  });

  it("marks the active file and exposes language badges without changing its accessible name", async () => {
    const api = { getTree: vi.fn().mockResolvedValue(projectTree) } as unknown as ApiClient;
    renderFileBrowser(api);

    const file = await screen.findByRole("treeitem", { name: "users.controller.ts" });
    await userEvent.setup().click(file);

    expect(file.getAttribute("aria-selected")).toBe("true");
    expect(screen.getAllByText("TS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("PY").length).toBeGreaterThan(0);
  });
});

function renderFileBrowser(api: ApiClient) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ApiProvider client={api}>
        <FileBrowser />
      </ApiProvider>
    </QueryClientProvider>,
  );
}
