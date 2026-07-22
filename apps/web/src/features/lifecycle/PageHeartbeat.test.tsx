import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "../../api/ApiProvider.js";
import type { ApiClient } from "../../api/client.js";
import { PageHeartbeat } from "./PageHeartbeat.js";

afterEach(cleanup);

describe("PageHeartbeat", () => {
  it("sends a heartbeat on mount, activity, and closes before unload", async () => {
    const heartbeat = vi.fn().mockResolvedValue(undefined);
    const closePage = vi.fn().mockReturnValue(true);
    render(
      <ApiProvider client={{ heartbeat, closePage } as unknown as ApiClient}>
        <PageHeartbeat />
      </ApiProvider>,
    );

    await waitFor(() => expect(heartbeat).toHaveBeenCalledTimes(1));
    fireEvent.pointerDown(window);
    await waitFor(() => expect(heartbeat).toHaveBeenCalledTimes(2));
    fireEvent(window, new Event("beforeunload"));
    expect(closePage).toHaveBeenCalledWith(expect.any(String));
  });
});
