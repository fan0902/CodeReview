import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "../../api/ApiProvider.js";
import type { ApiClient } from "../../api/client.js";
import { useWorkspace } from "../../state/workspace-store.js";
import { ProjectToolbar } from "./ProjectToolbar.js";

beforeEach(() => {
  useWorkspace.getState().reset();
  useWorkspace.setState({
    project: { id: "p1", name: "sample", root: "/work/sample" },
  });
});
afterEach(cleanup);

describe("ProjectToolbar", () => {
  it("renders application identity, project location, and the primary open action", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ApiProvider
          client={{
            indexStatus: vi.fn().mockResolvedValue({
              phase: "ready",
              completed: 5,
              total: 5,
              diagnostics: [],
            }),
          } as unknown as ApiClient}
        >
          <ProjectToolbar />
        </ApiProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText("本地只读代码阅读")).toBeTruthy();
    expect(screen.getByLabelText("当前工程").textContent).toContain("sample");
    expect(screen.getByRole("button", { name: "打开工程" }).classList).toContain(
      "primary-action",
    );
  });

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

  it("checks indexing automatically after a project opens", async () => {
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

    await waitFor(() => expect(indexStatus).toHaveBeenCalledTimes(1));
    expect(screen.getByText("索引就绪")).toBeTruthy();
  });
});
