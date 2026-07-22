import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { EnumCandidate, ResolvedEnumBookmark } from "@cr/contracts";
import { useApi } from "../../api/ApiProvider.js";
import { useWorkspace } from "../../state/workspace-store.js";
import { EnumCard } from "./EnumCard.js";
import { EnumSearch } from "./EnumSearch.js";

export function EnumPanel() {
  const api = useApi();
  const queryClient = useQueryClient();
  const project = useWorkspace((state) => state.project);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selected, setSelected] = useState<EnumCandidate | null>(null);
  const [replacement, setReplacement] = useState<ResolvedEnumBookmark | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  const bookmarks = useQuery({
    queryKey: ["enum-bookmarks", project?.id],
    queryFn: api.getEnumBookmarks,
    enabled: Boolean(project),
  });
  const candidates = useQuery({
    queryKey: ["enum-search", project?.id, debouncedQuery],
    queryFn: () => api.searchEnums(debouncedQuery),
    enabled: Boolean(project && debouncedQuery),
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("请先选择枚举。");
      const created = await api.addEnumBookmark({
        relativePath: selected.relativePath,
        symbolName: selected.symbolName,
        language: selected.language,
      });
      if (replacement) await api.deleteEnumBookmark(replacement.id);
      return created;
    },
    onSuccess: async () => {
      setQuery("");
      setDebouncedQuery("");
      setSelected(null);
      setReplacement(null);
      setSaveError(null);
      await queryClient.invalidateQueries({ queryKey: ["enum-bookmarks", project?.id] });
    },
    onError: (error) => {
      setSaveError(error instanceof Error ? error.message : "保存失败");
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteEnumBookmark(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["enum-bookmarks", project?.id] });
    },
  });

  const beginRelink = (item: ResolvedEnumBookmark) => {
    setReplacement(item);
    setQuery("");
    setSelected(null);
    setSaveError(null);
    document.getElementById("enum-class-search")?.focus();
  };

  if (!project) return <p className="panel-state">打开工程后可收藏枚举</p>;

  return (
    <section className="enum-panel" aria-label="枚举收藏">
      {replacement ? (
        <p className="relink-state">正在重新定位 {replacement.symbolName}</p>
      ) : null}
      <EnumSearch
        query={query}
        candidates={candidates.data ?? []}
        selected={selected}
        searching={candidates.isFetching}
        onQueryChange={(nextQuery) => {
          setQuery(nextQuery);
          setSelected(null);
          setSaveError(null);
        }}
        onSelect={setSelected}
      />
      <button
        type="button"
        className="save-enum"
        disabled={!selected || save.isPending}
        onClick={() => save.mutate()}
      >
        {replacement ? "更新枚举" : "保存枚举"}
      </button>
      {saveError ? (
        <p className="enum-save-error" role="alert" aria-label="保存失败">
          保存失败：{saveError}
        </p>
      ) : null}

      {bookmarks.isPending ? <p className="panel-state">正在读取收藏…</p> : null}
      {bookmarks.isError ? (
        <p className="panel-state panel-error" role="alert">枚举收藏读取失败</p>
      ) : null}
      {!bookmarks.isPending && !bookmarks.isError && !bookmarks.data?.length ? (
        <p className="panel-state">尚未收藏枚举</p>
      ) : null}
      <div className="enum-bookmarks">
        {bookmarks.data?.map((item) => (
          <EnumCard
            item={item}
            deleting={remove.isPending && remove.variables === item.id}
            onDelete={(id) => remove.mutate(id)}
            onRelink={beginRelink}
            key={item.id}
          />
        ))}
      </div>
    </section>
  );
}
