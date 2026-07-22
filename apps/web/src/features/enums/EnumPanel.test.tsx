import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "../../api/ApiProvider.js";
import type { ApiClient } from "../../api/client.js";
import { useWorkspace } from "../../state/workspace-store.js";
import { EnumPanel } from "./EnumPanel.js";

const stateCandidate = {
  language: "python" as const,
  symbolName: "State",
  qualifiedName: "app.State",
  relativePath: "python/app.py",
  location: { path: "python/app.py", line: 4, column: 1 },
};

const readyBookmark = {
  id: "bookmark-1",
  projectId: "p1",
  relativePath: "python/app.py",
  symbolName: "State",
  language: "python" as const,
  createdAt: "2026-07-22T00:00:00Z",
  state: "ready" as const,
  members: [
    { name: "ACTIVE", value: '"active"' },
    { name: "DISABLED", value: '"disabled"', comment: "No access" },
  ],
};

beforeEach(() => {
  useWorkspace.getState().reset();
  useWorkspace.setState({
    project: { id: "p1", name: "sample", root: "/work/sample" },
  });
});

afterEach(cleanup);

describe("EnumPanel", () => {
  it("selects one same-name candidate and saves it", async () => {
    const addEnumBookmark = vi.fn().mockResolvedValue({ id: "bookmark-1" });
    const getEnumBookmarks = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue([readyBookmark]);
    const api = fakeApi({
      searchEnums: vi.fn().mockResolvedValue([
        stateCandidate,
        { ...stateCandidate, relativePath: "other/state.ts", language: "typescript" },
      ]),
      addEnumBookmark,
      getEnumBookmarks,
    });
    const user = userEvent.setup();
    renderPanel(api);

    await user.type(screen.getByRole("combobox", { name: "枚举类" }), "State");
    await user.click(
      await screen.findByRole("option", { name: "State · python · python/app.py" }),
    );
    await user.click(screen.getByRole("button", { name: "保存枚举" }));

    expect(addEnumBookmark).toHaveBeenCalledWith({
      relativePath: "python/app.py",
      symbolName: "State",
      language: "python",
    });
    expect(await screen.findByText("ACTIVE")).toBeTruthy();
    expect(getEnumBookmarks).toHaveBeenCalledTimes(2);
  });

  it("restores saved members with language, path, values, and comments", async () => {
    renderPanel(fakeApi({ getEnumBookmarks: vi.fn().mockResolvedValue([readyBookmark]) }));

    expect(await screen.findByText("State")).toBeTruthy();
    expect(screen.getByText("Python · python/app.py")).toBeTruthy();
    expect(screen.getByText('"disabled"')).toBeTruthy();
    expect(screen.getByText("No access")).toBeTruthy();
  });

  it("requires confirmation before deleting a bookmark", async () => {
    const deleteEnumBookmark = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPanel(
      fakeApi({
        getEnumBookmarks: vi.fn().mockResolvedValue([readyBookmark]),
        deleteEnumBookmark,
      }),
    );

    await user.click(await screen.findByRole("button", { name: "删除 State" }));
    expect(deleteEnumBookmark).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "取消删除" }));
    expect(deleteEnumBookmark).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "删除 State" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));

    expect(deleteEnumBookmark).toHaveBeenCalledWith("bookmark-1");
  });

  it("re-links a missing bookmark only after the replacement is saved", async () => {
    const missing = {
      ...readyBookmark,
      state: "missing" as const,
      members: [],
      message: "The enum no longer exists at its saved location.",
    };
    const addEnumBookmark = vi.fn().mockResolvedValue({ id: "bookmark-2" });
    const deleteEnumBookmark = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPanel(
      fakeApi({
        getEnumBookmarks: vi.fn().mockResolvedValue([missing]),
        searchEnums: vi.fn().mockResolvedValue([
          { ...stateCandidate, relativePath: "python/domain/state.py" },
        ]),
        addEnumBookmark,
        deleteEnumBookmark,
      }),
    );

    expect(await screen.findByRole("alert")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "重新定位 State" }));
    await user.type(screen.getByRole("combobox", { name: "枚举类" }), "State");
    await user.click(
      await screen.findByRole("option", {
        name: "State · python · python/domain/state.py",
      }),
    );
    await user.click(screen.getByRole("button", { name: "更新枚举" }));

    await waitFor(() => expect(deleteEnumBookmark).toHaveBeenCalledWith("bookmark-1"));
    expect(addEnumBookmark.mock.invocationCallOrder[0]).toBeLessThan(
      deleteEnumBookmark.mock.invocationCallOrder[0]!,
    );
  });

  it("keeps the old bookmark when saving a replacement fails", async () => {
    const deleteEnumBookmark = vi.fn();
    const user = userEvent.setup();
    renderPanel(
      fakeApi({
        getEnumBookmarks: vi.fn().mockResolvedValue([
          { ...readyBookmark, state: "invalid", members: [], message: "Invalid enum" },
        ]),
        searchEnums: vi.fn().mockResolvedValue([stateCandidate]),
        addEnumBookmark: vi.fn().mockRejectedValue(new Error("save failed")),
        deleteEnumBookmark,
      }),
    );

    await user.click(await screen.findByRole("button", { name: "重新定位 State" }));
    await user.type(screen.getByRole("combobox", { name: "枚举类" }), "State");
    await user.click(
      await screen.findByRole("option", { name: "State · python · python/app.py" }),
    );
    await user.click(screen.getByRole("button", { name: "更新枚举" }));

    expect(await screen.findByRole("alert", { name: "保存失败" })).toBeTruthy();
    expect(deleteEnumBookmark).not.toHaveBeenCalled();
  });
});

function renderPanel(api: ApiClient) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ApiProvider client={api}>
        <EnumPanel />
      </ApiProvider>
    </QueryClientProvider>,
  );
}

function fakeApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    getEnumBookmarks: vi.fn().mockResolvedValue([]),
    searchEnums: vi.fn().mockResolvedValue([]),
    addEnumBookmark: vi.fn(),
    deleteEnumBookmark: vi.fn(),
    ...overrides,
  } as unknown as ApiClient;
}
