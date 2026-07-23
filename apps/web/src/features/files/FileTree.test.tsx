import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "../../api/ApiProvider.js";
import type { ApiClient } from "../../api/client.js";
import { useWorkspace } from "../../state/workspace-store.js";
import { FileBrowser } from "./FileTree.js";

beforeEach(() => {
  useWorkspace.getState().reset();
  useWorkspace.setState({
    project: { id: "p1", name: "sample", root: "/work/sample" },
  });
});
afterEach(cleanup);

describe("FileBrowser", () => {
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

  it("opens a supported source file in a tab", async () => {
    const api = {
      getTree: vi.fn().mockResolvedValue([
        {
          name: "src",
          path: "src",
          type: "directory",
          children: [{ name: "main.py", path: "src/main.py", type: "file" }],
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

    await userEvent.setup().click(await screen.findByRole("treeitem", { name: "main.py" }));

    expect(useWorkspace.getState().tabs).toContain("src/main.py");
    expect(useWorkspace.getState().activeLocation).toEqual({
      path: "src/main.py",
      line: 1,
      column: 1,
    });
  });
});
