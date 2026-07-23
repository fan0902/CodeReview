import { QueryClient } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../../api/client.js";
import { CrApplication } from "../../App.js";
import { useWorkspace } from "../../state/workspace-store.js";

beforeEach(() => {
  localStorage.clear();
  useWorkspace.setState({
    project: null,
    rightPanelOpen: true,
    rightPanelWidth: 420,
  });
});

afterEach(cleanup);

describe("CR application shell", () => {
  it("keeps the current project when directory selection is cancelled", async () => {
    useWorkspace.setState({
      project: { id: "p1", name: "mixed-project", root: "/work/mixed-project" },
    });
    const api = fakeApi({ selectProject: vi.fn().mockResolvedValue({ cancelled: true }) });
    renderApplication(api);

    await userEvent.setup().click(screen.getByRole("button", { name: "打开工程" }));

    expect(screen.getByLabelText("当前工程").textContent).toContain("mixed-project");
  });

  it("renders file, code, and collapsible information regions", () => {
    renderApplication(fakeApi());

    expect(screen.getByRole("navigation", { name: "工程文件" })).toBeTruthy();
    expect(screen.getByRole("main", { name: "代码阅读区" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "工程信息" })).toBeTruthy();
  });

  it("resizes the information panel by dragging its separator", () => {
    renderApplication(fakeApi());
    const grid = screen.getByTestId("workspace-grid");
    vi.spyOn(grid, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 1440,
      top: 0,
      bottom: 800,
      width: 1440,
      height: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const separator = screen.getByRole("separator", {
      name: "调整工程信息宽度",
    });

    fireEvent.pointerDown(separator, { button: 0, clientX: 1020 });
    fireEvent.pointerMove(window, { clientX: 900 });
    fireEvent.pointerUp(window);

    expect(useWorkspace.getState().rightPanelWidth).toBe(540);
    expect(localStorage.getItem("cr.informationPanelWidth")).toBe("540");
    expect(grid.style.getPropertyValue("--information-panel-width")).toBe("540px");
  });

  it("offers recent projects and reopens the selected one", async () => {
    const openRecent = vi.fn().mockResolvedValue({
      id: "p1",
      name: "mixed-project",
      root: "/work/mixed-project",
    });
    const api = fakeApi({
      recentProjects: vi.fn().mockResolvedValue([
        {
          path: "/work/mixed-project",
          name: "mixed-project",
          lastOpenedAt: "2026-07-22T00:00:00Z",
        },
      ]),
      openRecent,
    });
    renderApplication(api);

    await userEvent.setup().click(
      await screen.findByRole("button", { name: "重新打开 mixed-project" }),
    );

    expect(openRecent).toHaveBeenCalledWith("/work/mixed-project");
    expect(screen.getByLabelText("当前工程").textContent).toContain("mixed-project");
  });
});

function renderApplication(api: ApiClient) {
  return render(
    <CrApplication api={api} queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />,
  );
}

function fakeApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    headers: () => ({ Authorization: "Bearer test" }),
    getTree: vi.fn().mockResolvedValue([]),
    selectProject: vi.fn().mockResolvedValue({ cancelled: true }),
    recentProjects: vi.fn().mockResolvedValue([]),
    openRecent: vi.fn(),
    indexStatus: vi.fn().mockResolvedValue({
      phase: "idle",
      completed: 0,
      total: 0,
      diagnostics: [],
    }),
    getControllers: vi.fn().mockResolvedValue([]),
    getEnumBookmarks: vi.fn().mockResolvedValue([]),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    closePage: vi.fn().mockReturnValue(true),
    ...overrides,
  } as ApiClient;
}
