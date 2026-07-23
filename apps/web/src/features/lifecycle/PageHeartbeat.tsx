import { useEffect, useRef } from "react";
import { useApi } from "../../api/ApiProvider.js";
import { ApiError } from "../../api/client.js";

const reloadWindow = () => window.location.reload();

export function PageHeartbeat({
  reload = reloadWindow,
}: {
  reload?: () => void;
}) {
  const api = useApi();
  const pageId = useRef(crypto.randomUUID());
  const lastActivityBeat = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    let retryDelay = 250;
    const beat = () => {
      if (document.visibilityState !== "hidden") void api.heartbeat(pageId.current);
    };
    const activity = () => {
      const now = Date.now();
      if (now - lastActivityBeat.current < 30_000) return;
      lastActivityBeat.current = now;
      beat();
    };
    const close = () => api.closePage(pageId.current);
    const listen = async (): Promise<void> => {
      while (!stopped) {
        try {
          await api.listenForPageCommands(
            pageId.current,
            (command) => {
              if (command.type === "reload") reload();
            },
            controller.signal,
          );
          retryDelay = 250;
        } catch (error) {
          if (controller.signal.aborted) return;
          if (error instanceof ApiError && [401, 403].includes(error.status)) return;
        }
        if (stopped) return;
        await new Promise((resolve) => window.setTimeout(resolve, retryDelay));
        retryDelay = Math.min(retryDelay * 2, 5_000);
      }
    };

    beat();
    void listen();
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    window.addEventListener("beforeunload", close);
    document.addEventListener("visibilitychange", beat);
    const interval = window.setInterval(beat, 60_000);
    return () => {
      stopped = true;
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("beforeunload", close);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [api, reload]);

  return null;
}
