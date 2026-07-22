import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "../../api/ApiProvider.js";
import type { ApiClient } from "../../api/client.js";
import { useWorkspace } from "../../state/workspace-store.js";
import { InformationPanel } from "./InformationPanel.js";

beforeEach(() => {
  useWorkspace.getState().reset();
  useWorkspace.setState({
    project: { id: "p1", name: "sample", root: "/work/sample" },
  });
});
afterEach(cleanup);

describe("InformationPanel", () => {
  it("switches between Controller and enum views", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ApiProvider
          client={
            {
              getControllers: vi.fn().mockResolvedValue([]),
              getEnumBookmarks: vi.fn().mockResolvedValue([]),
            } as unknown as ApiClient
          }
        >
          <InformationPanel />
        </ApiProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("tab", { name: "Controllers", selected: true })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("tab", { name: "Enums" }));
    expect(screen.getByRole("tab", { name: "Enums", selected: true })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "枚举类" })).toBeTruthy();
  });
});
