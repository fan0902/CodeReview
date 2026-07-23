import {
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  clampInformationPanelWidth,
  MIN_INFORMATION_PANEL_WIDTH,
} from "./information-panel-width.js";

export function AppShell({
  toolbar,
  files,
  code,
  information,
  rightPanelOpen,
  rightPanelWidth,
  onToggleRightPanel,
  onResizeRightPanel,
}: {
  toolbar: ReactNode;
  files: ReactNode;
  code: ReactNode;
  information: ReactNode;
  rightPanelOpen: boolean;
  rightPanelWidth: number;
  onToggleRightPanel: () => void;
  onResizeRightPanel: (width: number) => void;
}) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const stopResizeRef = useRef<(() => void) | null>(null);

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const workspace = workspaceRef.current;
    if (!workspace) return;
    event.preventDefault();
    stopResizeRef.current?.();

    const move = (moveEvent: PointerEvent) => {
      const bounds = workspace.getBoundingClientRect();
      onResizeRightPanel(
        clampInformationPanelWidth(bounds.right - moveEvent.clientX, bounds.width),
      );
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      document.body.classList.remove("information-resizing");
      if (stopResizeRef.current === stop) stopResizeRef.current = null;
    };

    stopResizeRef.current = stop;
    document.body.classList.add("information-resizing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  useEffect(() => () => stopResizeRef.current?.(), []);

  return (
    <div className="app-shell">
      <header className="topbar">{toolbar}</header>
      <div
        ref={workspaceRef}
        data-testid="workspace-grid"
        className={`workspace-grid${rightPanelOpen ? "" : " information-closed"}`}
        style={{
          "--information-panel-width": `${rightPanelWidth}px`,
        } as CSSProperties}
      >
        <nav className="files-region" aria-label="工程文件">
          {files}
        </nav>
        <main className="code-region" aria-label="代码阅读区">
          {code}
        </main>
        {rightPanelOpen ? (
          <div
            className="information-resizer"
            role="separator"
            aria-label="调整工程信息宽度"
            aria-orientation="vertical"
            aria-valuemin={MIN_INFORMATION_PANEL_WIDTH}
            aria-valuenow={rightPanelWidth}
            tabIndex={0}
            onPointerDown={beginResize}
          />
        ) : null}
        {rightPanelOpen ? (
          <aside className="information-region" aria-label="工程信息">
            <button
              className="panel-toggle"
              type="button"
              aria-label="折叠工程信息"
              onClick={onToggleRightPanel}
            >
              ›
            </button>
            {information}
          </aside>
        ) : (
          <button
            className="information-rail"
            type="button"
            aria-label="展开工程信息"
            onClick={onToggleRightPanel}
          >
            ‹
          </button>
        )}
      </div>
    </div>
  );
}
