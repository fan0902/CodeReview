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
    let commandSignal: AbortSignal | undefined;
    const listenForPageCommands = vi.fn(
      (_pageId: string, _onCommand: unknown, signal: AbortSignal) => {
        commandSignal = signal;
        return new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
      },
    );
    render(
      <ApiProvider
        client={{
          heartbeat,
          closePage,
          listenForPageCommands,
        } as unknown as ApiClient}
      >
        <PageHeartbeat />
      </ApiProvider>,
    );

    await waitFor(() => expect(heartbeat).toHaveBeenCalledTimes(1));
    fireEvent.pointerDown(window);
    await waitFor(() => expect(heartbeat).toHaveBeenCalledTimes(2));
    fireEvent(window, new Event("beforeunload"));
    expect(closePage).toHaveBeenCalledWith(expect.any(String));
    cleanup();
    expect(commandSignal?.aborted).toBe(true);
  });

  it("reloads once when its page receives a reload command", async () => {
    const reload = vi.fn();
    const listenForPageCommands = vi.fn(
      async (
        _pageId: string,
        onCommand: (command: { type: "reload" }) => void,
        signal: AbortSignal,
      ) => {
        onCommand({ type: "reload" });
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
      },
    );
    const view = render(
      <ApiProvider
        client={{
          heartbeat: vi.fn().mockResolvedValue(undefined),
          closePage: vi.fn().mockReturnValue(true),
          listenForPageCommands,
        } as unknown as ApiClient}
      >
        <PageHeartbeat reload={reload} />
      </ApiProvider>,
    );

    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    view.unmount();
  });
});
