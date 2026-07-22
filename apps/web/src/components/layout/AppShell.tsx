import type { ReactNode } from "react";

export function AppShell({
  toolbar,
  files,
  code,
  information,
  rightPanelOpen,
  onToggleRightPanel,
}: {
  toolbar: ReactNode;
  files: ReactNode;
  code: ReactNode;
  information: ReactNode;
  rightPanelOpen: boolean;
  onToggleRightPanel: () => void;
}) {
  return (
    <div className="app-shell">
      <header className="topbar">{toolbar}</header>
      <div className={`workspace-grid${rightPanelOpen ? "" : " information-closed"}`}>
        <nav className="files-region" aria-label="工程文件">
          {files}
        </nav>
        <main className="code-region" aria-label="代码阅读区">
          {code}
        </main>
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
