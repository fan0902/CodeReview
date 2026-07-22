import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "../../api/ApiProvider.js";
import type { ApiClient } from "../../api/client.js";
import { useWorkspace } from "../../state/workspace-store.js";
import { ControllerPanel } from "./ControllerPanel.js";

const endpoints = [
  {
    id: "fastapi-get-user",
    framework: "fastapi" as const,
    method: "GET",
    path: "/users/{user_id}",
    name: "Get user",
    description: "Return one user.",
    parameters: [
      {
        name: "user_id",
        source: "path" as const,
        type: "int",
        required: true,
      },
    ],
    response: { type: "UserOut", statusCode: 200 },
    location: { path: "python/app.py", line: 14, column: 1 },
    diagnostics: ["Response model could not be resolved."],
  },
  {
    id: "nest-create-user",
    framework: "nestjs" as const,
    method: "POST",
    path: "/users",
    name: "Create user",
    parameters: [
      {
        name: "body",
        source: "body" as const,
        type: "CreateUserDto",
        required: true,
      },
    ],
    response: { type: "" },
    location: { path: "nest/src/users.controller.ts", line: 21, column: 3 },
    diagnostics: [],
  },
];

beforeEach(() => {
  useWorkspace.getState().reset();
  useWorkspace.setState({
    project: { id: "p1", name: "sample", root: "/work/sample" },
  });
});

afterEach(cleanup);

describe("ControllerPanel", () => {
  it("shows method, path, input, output, and unresolved diagnostics", async () => {
    renderPanel(fakeApi());

    expect(await screen.findByText("GET", { selector: ".http-method" })).toBeTruthy();
    expect(screen.getByText("/users/{user_id}")).toBeTruthy();
    expect(screen.getByText("user_id · path · int · 必填")).toBeTruthy();
    expect(screen.getByText("UserOut · HTTP 200")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toContain(
      "Response model could not be resolved.",
    );
    expect(screen.getByText("未声明")).toBeTruthy();
  });

  it("filters by name and method, then opens the endpoint source", async () => {
    const user = userEvent.setup();
    renderPanel(fakeApi());

    await screen.findByText("Get user");
    await user.type(screen.getByRole("searchbox", { name: "筛选接口" }), "Create");
    await user.selectOptions(screen.getByRole("combobox", { name: "请求方法" }), "POST");

    expect(screen.queryByText("Get user")).toBeNull();
    await user.click(screen.getByRole("button", { name: "打开源码：Create user" }));
    expect(useWorkspace.getState().activeLocation).toEqual({
      path: "nest/src/users.controller.ts",
      line: 21,
      column: 3,
    });
  });

  it("shows a useful empty state", async () => {
    renderPanel(fakeApi({ getControllers: vi.fn().mockResolvedValue([]) }));

    expect(await screen.findByText("没有发现 Controller 接口")).toBeTruthy();
  });
});

function renderPanel(api: ApiClient) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ApiProvider client={api}>
        <ControllerPanel />
      </ApiProvider>
    </QueryClientProvider>,
  );
}

function fakeApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    getControllers: vi.fn().mockResolvedValue(endpoints),
    ...overrides,
  } as unknown as ApiClient;
}
