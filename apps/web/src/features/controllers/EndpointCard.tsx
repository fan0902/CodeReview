import type { ControllerEndpoint, ControllerParameter } from "@cr/contracts";

type Props = {
  endpoint: ControllerEndpoint;
  onOpen: (location: ControllerEndpoint["location"]) => void;
};

function formatParameter(parameter: ControllerParameter): string {
  const required = parameter.required
    ? "必填"
    : parameter.defaultValue
      ? `默认 ${parameter.defaultValue}`
      : "可选";
  return `${parameter.name} · ${parameter.source} · ${parameter.type || "未知类型"} · ${required}`;
}

export function EndpointCard({ endpoint, onOpen }: Props) {
  const response = endpoint.response.type || "未声明";
  const responseLabel = endpoint.response.statusCode
    ? `${response} · HTTP ${endpoint.response.statusCode}`
    : response;

  return (
    <article className="endpoint-card">
      <header>
        <span className={`http-method method-${endpoint.method.toLowerCase()}`}>
          {endpoint.method}
        </span>
        <code>{endpoint.path}</code>
      </header>
      <h3>{endpoint.name}</h3>
      {endpoint.description ? <p className="endpoint-description">{endpoint.description}</p> : null}

      <section aria-label="入参">
        <h4>入参</h4>
        {endpoint.parameters.length ? (
          <ul>
            {endpoint.parameters.map((parameter, index) => (
              <li key={`${parameter.name}-${index}`}>{formatParameter(parameter)}</li>
            ))}
          </ul>
        ) : (
          <p className="empty-field">无显式入参</p>
        )}
      </section>

      <section aria-label="出参">
        <h4>出参</h4>
        <p>{responseLabel}</p>
      </section>

      {endpoint.diagnostics.map((diagnostic) => (
        <p className="endpoint-diagnostic" role="note" key={diagnostic}>
          {diagnostic}
        </p>
      ))}

      <button
        type="button"
        className="source-link"
        aria-label={`打开源码：${endpoint.name}`}
        onClick={() => onOpen(endpoint.location)}
      >
        打开源码 · {endpoint.location.path}:{endpoint.location.line}
      </button>
    </article>
  );
}
