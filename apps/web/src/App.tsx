import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ApiProvider, useApi } from "./api/ApiProvider.js";
import { createApiClient, type ApiClient } from "./api/client.js";
import { AppShell } from "./components/layout/AppShell.js";
import { ProjectToolbar } from "./features/projects/ProjectToolbar.js";
import { CodeWorkspace } from "./features/files/CodeWorkspace.js";
import { FileBrowser } from "./features/files/FileTree.js";
import { InformationPanel } from "./features/information/InformationPanel.js";
import { PageHeartbeat } from "./features/lifecycle/PageHeartbeat.js";
import { useWorkspace } from "./state/workspace-store.js";
import "./styles/layout.css";
import "./styles/branch-review-theme.css";

export function App() {
  const api = useMemo(() => createApiClient(), []);
  const queryClient = useMemo(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    [],
  );
  return <CrApplication api={api} queryClient={queryClient} />;
}

export function CrApplication({
  api,
  queryClient,
}: {
  api: ApiClient;
  queryClient: QueryClient;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>
        <PageHeartbeat />
        <Workspace />
      </ApiProvider>
    </QueryClientProvider>
  );
}

function Workspace() {
  const rightPanelOpen = useWorkspace((state) => state.rightPanelOpen);
  const rightPanelWidth = useWorkspace((state) => state.rightPanelWidth);
  const toggleRightPanel = useWorkspace((state) => state.toggleRightPanel);
  const setRightPanelWidth = useWorkspace((state) => state.setRightPanelWidth);
  return (
    <AppShell
      toolbar={<ProjectToolbar />}
      files={<FileBrowser />}
      code={<CodeWorkspace empty={<WorkspaceHome />} />}
      information={<InformationPanel />}
      rightPanelOpen={rightPanelOpen}
      rightPanelWidth={rightPanelWidth}
      onToggleRightPanel={toggleRightPanel}
      onResizeRightPanel={setRightPanelWidth}
    />
  );
}

function WorkspaceHome() {
  const api = useApi();
  const project = useWorkspace((state) => state.project);
  const setProject = useWorkspace((state) => state.setProject);
  const recent = useQuery({
    queryKey: ["recent-projects"],
    queryFn: api.recentProjects,
    enabled: !project,
  });
  if (project) return <div className="empty-code">从左侧选择文件开始阅读</div>;
  return (
    <section className="welcome">
      <h1>打开一个代码工程</h1>
      <p>CR 会在本机只读分析 Python 与 TypeScript 源码。</p>
      {recent.data?.length ? (
        <div className="recent-projects">
          <h2>最近工程</h2>
          {recent.data.map((item) => (
            <button
              type="button"
              key={item.path}
              aria-label={`重新打开 ${item.name}`}
              onClick={async () => setProject(await api.openRecent(item.path))}
            >
              <strong>{item.name}</strong>
              <code>{item.path}</code>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
