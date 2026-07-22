import { useEffect, useRef } from "react";
import { useApi } from "../../api/ApiProvider.js";

export function PageHeartbeat() {
  const api = useApi();
  const pageId = useRef(crypto.randomUUID());
  const lastActivityBeat = useRef(0);

  useEffect(() => {
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

    beat();
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    window.addEventListener("beforeunload", close);
    document.addEventListener("visibilitychange", beat);
    const interval = window.setInterval(beat, 60_000);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("beforeunload", close);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [api]);

  return null;
}
