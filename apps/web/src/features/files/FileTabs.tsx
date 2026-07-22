import { useWorkspace } from "../../state/workspace-store.js";

export function FileTabs() {
  const tabs = useWorkspace((state) => state.tabs);
  const active = useWorkspace((state) => state.activeLocation?.path);
  const visit = useWorkspace((state) => state.visitLocation);
  const close = useWorkspace((state) => state.closeTab);
  return (
    <div className="file-tabs" role="tablist" aria-label="打开的文件">
      {tabs.map((tab) => (
        <div className={tab === active ? "file-tab active" : "file-tab"} key={tab}>
          <button type="button" role="tab" aria-selected={tab === active} onClick={() => visit({ path: tab, line: 1, column: 1 })}>{baseName(tab)}</button>
          <button type="button" aria-label={`关闭 ${baseName(tab)}`} onClick={() => close(tab)}>×</button>
        </div>
      ))}
    </div>
  );
}

function baseName(filePath: string): string {
  return filePath.split("/").at(-1) ?? filePath;
}
