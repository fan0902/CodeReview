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
      <div className="app-identity">
        <span className="brand-mark" aria-hidden="true">CR</span>
        <span className="brand-copy">
          <strong>CR</strong>
          <small>本地只读代码阅读</small>
        </span>
      </div>
      <div className="project-location" aria-label="当前工程">
        <span className="folder-mark" aria-hidden="true">▱</span>
        <span className="project-location-copy">
          <span className="project-name">{project?.name ?? "未打开工程"}</span>
          {project ? (
            <code className="project-path" aria-label="工程绝对路径" title={project.root}>
              {project.root}
            </code>
          ) : (
            <span className="project-path-empty">选择本地 Python 或 TypeScript 工程</span>
          )}
        </span>
      </div>
      <button
        className="primary-action"
        type="button"
        onClick={() => void openProject()}
        disabled={opening}
      >
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

  const tone = label === "索引就绪" ? "ready" : label === "索引异常" ? "error" : "neutral";
  return (
    <button
      className={`index-status status-${tone}`}
      type="button"
      onClick={() => void refresh()}
    >
      {label}
    </button>
  );
}
