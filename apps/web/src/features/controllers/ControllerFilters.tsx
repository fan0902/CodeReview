type Props = {
  query: string;
  method: string;
  methods: string[];
  onQueryChange: (query: string) => void;
  onMethodChange: (method: string) => void;
};

export function ControllerFilters({
  query,
  method,
  methods,
  onQueryChange,
  onMethodChange,
}: Props) {
  return (
    <div className="controller-filters">
      <input
        type="search"
        aria-label="筛选接口"
        placeholder="名称或路径"
        value={query}
        onChange={(event) => onQueryChange(event.currentTarget.value)}
      />
      <select
        aria-label="请求方法"
        value={method}
        onChange={(event) => onMethodChange(event.currentTarget.value)}
      >
        <option value="">全部方法</option>
        {methods.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </div>
  );
}
