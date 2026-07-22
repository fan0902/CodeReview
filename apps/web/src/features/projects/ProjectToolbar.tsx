import { useCallback, useEffect, useRef, useState } from "react";
import { useApi } from "../../api/ApiProvider.js";
import { useWorkspace } from "../../state/workspace-store.js";

export function ProjectToolbar() {
  const api = useApi();
  const project = useWorkspace((state) => state.project);
  const setProject = useWorkspace((state) => state.setProject);
  const [opening, setOpening] = useState(false);

  const openProject = async () => {
    setOpening(true);
    try {
      const result = await api.selectProject();
      if (!("cancelled" in result)) setProject(result);
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="project-toolbar">
      <strong className="brand">CR</strong>
      <span className="project-name">{project?.name ?? "未打开工程"}</span>
      <button type="button" onClick={() => void openProject()} disabled={opening}>
        {opening ? "正在打开…" : "打开工程"}
      </button>
      <IndexStatus />
    </div>
  );
}

function IndexStatus() {
  const api = useApi();
  const project = useWorkspace((state) => state.project);
  const [label, setLabel] = useState("未索引");
  const timer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!project) return;
    try {
      const status = await api.indexStatus();
      setLabel(
        status.phase === "scanning"
          ? `索引 ${status.completed}/${status.total}`
          : status.phase === "ready"
            ? "索引就绪"
            : status.phase === "error"
              ? "索引异常"
              : "未索引",
      );
      if (timer.current !== null) window.clearTimeout(timer.current);
      if (status.phase === "scanning") {
        timer.current = window.setTimeout(() => void refresh(), 750);
      }
    } catch {
      setLabel("索引异常");
    }
  }, [api, project]);

  useEffect(() => {
    if (!project) {
      setLabel("未索引");
      return;
    }
    void refresh();
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [project, refresh]);

  return (
    <button className="index-status" type="button" onClick={() => void refresh()}>
      {label}
    </button>
  );
}
