import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useApi } from "../../api/ApiProvider.js";
import { useWorkspace } from "../../state/workspace-store.js";
import { ControllerFilters } from "./ControllerFilters.js";
import { EndpointCard } from "./EndpointCard.js";

export function ControllerPanel() {
  const api = useApi();
  const project = useWorkspace((state) => state.project);
  const visitLocation = useWorkspace((state) => state.visitLocation);
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("");
  const controllers = useQuery({
    queryKey: ["controllers", project?.id],
    queryFn: api.getControllers,
    enabled: Boolean(project),
  });

  const methods = useMemo(
    () => [...new Set((controllers.data ?? []).map((endpoint) => endpoint.method))].sort(),
    [controllers.data],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return (controllers.data ?? []).filter(
      (endpoint) =>
        (!method || endpoint.method === method) &&
        (!normalized ||
          endpoint.name.toLocaleLowerCase().includes(normalized) ||
          endpoint.path.toLocaleLowerCase().includes(normalized)),
    );
  }, [controllers.data, method, query]);
  const groups = useMemo(() => {
    const grouped = new Map<string, typeof filtered>();
    for (const endpoint of filtered) {
      const items = grouped.get(endpoint.location.path) ?? [];
      items.push(endpoint);
      grouped.set(endpoint.location.path, items);
    }
    return [...grouped.entries()];
  }, [filtered]);

  if (!project) return <p className="panel-state">打开工程后展示 Controller 接口</p>;

  return (
    <section className="controller-panel" aria-label="Controller 接口">
      <ControllerFilters
        query={query}
        method={method}
        methods={methods}
        onQueryChange={setQuery}
        onMethodChange={setMethod}
      />
      {controllers.isPending ? <p className="panel-state">正在读取接口…</p> : null}
      {controllers.isError ? (
        <p className="panel-state panel-error" role="alert">
          Controller 信息读取失败
        </p>
      ) : null}
      {!controllers.isPending && !controllers.isError && !controllers.data?.length ? (
        <p className="panel-state">没有发现 Controller 接口</p>
      ) : null}
      {controllers.data?.length && !filtered.length ? (
        <p className="panel-state">没有匹配的接口</p>
      ) : null}
      <div className="controller-groups">
        {groups.map(([path, endpoints]) => (
          <section className="controller-group" key={path}>
            <h2 title={path}>{path}</h2>
            {endpoints.map((endpoint) => (
              <EndpointCard
                endpoint={endpoint}
                onOpen={visitLocation}
                key={endpoint.id}
              />
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}
