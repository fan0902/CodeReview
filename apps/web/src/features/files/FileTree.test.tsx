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
