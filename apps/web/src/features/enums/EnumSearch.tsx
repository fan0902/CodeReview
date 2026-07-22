import type { EnumCandidate } from "@cr/contracts";

type Props = {
  query: string;
  candidates: EnumCandidate[];
  selected: EnumCandidate | null;
  searching: boolean;
  onQueryChange: (query: string) => void;
  onSelect: (candidate: EnumCandidate) => void;
};

export function EnumSearch({
  query,
  candidates,
  selected,
  searching,
  onQueryChange,
  onSelect,
}: Props) {
  return (
    <div className="enum-search">
      <label htmlFor="enum-class-search">添加枚举</label>
      <input
        id="enum-class-search"
        role="combobox"
        aria-label="枚举类"
        aria-autocomplete="list"
        aria-expanded={candidates.length > 0}
        aria-controls="enum-candidates"
        placeholder="输入类名，例如 State"
        value={query}
        onChange={(event) => onQueryChange(event.currentTarget.value)}
      />
      {searching ? <p className="enum-search-state">正在搜索…</p> : null}
      {query.trim() && !searching && !candidates.length ? (
        <p className="enum-search-state">没有匹配的枚举</p>
      ) : null}
      {candidates.length ? (
        <div id="enum-candidates" className="enum-candidates" role="listbox">
          {candidates.map((candidate) => {
            const label = `${candidate.symbolName} · ${candidate.language} · ${candidate.relativePath}`;
            const active =
              selected?.relativePath === candidate.relativePath &&
              selected.symbolName === candidate.symbolName &&
              selected.language === candidate.language;
            return (
              <button
                type="button"
                role="option"
                aria-label={label}
                aria-selected={active}
                className={active ? "selected" : undefined}
                key={`${candidate.language}:${candidate.relativePath}:${candidate.symbolName}`}
                onClick={() => onSelect(candidate)}
              >
                <strong>{candidate.symbolName}</strong>
                <span>{candidate.language} · {candidate.relativePath}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
