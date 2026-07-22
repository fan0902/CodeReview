import type { ReactNode } from "react";
import { CodeViewer } from "./CodeViewer.js";
import { FileTabs } from "./FileTabs.js";
import { useWorkspace } from "../../state/workspace-store.js";

export function CodeWorkspace({ empty }: { empty: ReactNode }) {
  const location = useWorkspace((state) => state.activeLocation);
  const visit = useWorkspace((state) => state.visitLocation);
  const back = useWorkspace((state) => state.back);
  const forward = useWorkspace((state) => state.forward);
  if (!location) return <>{empty}</>;
  return (
    <div className="code-workspace">
      <FileTabs />
      <div className="editor-area">
        <CodeViewer location={location} onNavigate={visit} onBack={back} onForward={forward} />
      </div>
    </div>
  );
}
