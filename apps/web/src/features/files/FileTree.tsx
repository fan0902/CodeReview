import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useApi } from "../../api/ApiProvider.js";
import type { FileTreeNode } from "../../api/client.js";
import { useWorkspace } from "../../state/workspace-store.js";
import { filterFileTree, visibleFileTree } from "./file-tree-visibility.js";
import { QuickOpen } from "./QuickOpen.js";

export function FileBrowser() {
  const api = useApi();
  const project = useWorkspace((state) => state.project);
  const activePath = useWorkspace((state) => state.activeLocation?.path);
  const visitLocation = useWorkspace((state) => state.visitLocation);
  const tree = useQuery({
    queryKey: ["file-tree", project?.id],
    queryFn: api.getTree,
    enabled: Boolean(project),
  });
  const [showHidden, setShowHidden] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");

  useEffect(() => setFilterQuery(""), [project?.id]);

  const baseTree = useMemo(
    () => visibleFileTree(tree.data ?? [], showHidden),
    [showHidden, tree.data],
  );
  const filteredTree = useMemo(
    () => filterFileTree(baseTree, filterQuery),
    [baseTree, filterQuery],
  );

  if (!project) return <p className="region-placeholder">尚未打开工程</p>;
  if (tree.isPending) return <p className="region-placeholder">读取文件树…</p>;
  if (tree.isError) {
    return <p className="panel-state panel-error" role="alert">无法读取工程文件</p>;
  }

  const openFile = (path: string) => visitLocation({ path, line: 1, column: 1 });
  const hasFilter = Boolean(filterQuery.trim());

  return (
    <div className="file-browser">
      <div className="file-browser-header">
        <span className="repository-mark" aria-hidden="true">⌘</span>
        <div>
          <strong>{project.name}</strong>
          <code title={project.root}>{project.root}</code>
        </div>
      </div>
      <div className="file-browser-tools">
        <div className="file-filter">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            aria-label="过滤文件或目录"
            placeholder="过滤文件或目录"
            value={filterQuery}
            onChange={(event) => setFilterQuery(event.currentTarget.value)}
          />
          {filterQuery ? (
            <button
              type="button"
              aria-label="清空文件过滤"
              onClick={() => setFilterQuery("")}
            >
              ×
            </button>
          ) : null}
        </div>
        <div className="file-tool-row">
          <QuickOpen tree={filteredTree} onOpen={openFile} />
          <label className="hidden-files-toggle">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(event) => setShowHidden(event.target.checked)}
            />
            <span>显示隐藏文件</span>
          </label>
        </div>
      </div>
      {filteredTree.length ? (
        <ul className="file-tree" role="tree" aria-label="文件树">
          {filteredTree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              activePath={activePath}
              onOpen={openFile}
            />
          ))}
        </ul>
      ) : hasFilter ? (
        <div className="file-filter-empty">
          <strong>没有匹配的文件或目录</strong>
          <span>试试文件名、目录名或相对路径</span>
          <button type="button" onClick={() => setFilterQuery("")}>清空筛选</button>
        </div>
      ) : (
        <p className="panel-state">工程中没有可显示的文件</p>
      )}
    </div>
  );
}

function TreeNode({
  node,
  activePath,
  onOpen,
}: {
  node: FileTreeNode;
  activePath: string | undefined;
  onOpen: (path: string) => void;
}) {
  if (node.type === "directory") {
    return (
      <li role="none">
        <details open>
          <summary>{node.name}</summary>
          <ul role="group">
            {node.children?.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                activePath={activePath}
                onOpen={onOpen}
              />
            ))}
          </ul>
        </details>
      </li>
    );
  }

  const badge = fileBadge(node.path);
  const parentPath = node.path.includes("/")
    ? node.path.slice(0, node.path.lastIndexOf("/"))
    : "工程根目录";
  return (
    <li role="none">
      <button
        type="button"
        role="treeitem"
        aria-label={node.name}
        aria-selected={node.path === activePath}
        onClick={() => onOpen(node.path)}
      >
        <span className={`file-type-badge ${badge.className}`} aria-hidden="true">
          {badge.label}
        </span>
        <span className="file-node-copy">
          <span className="file-node-name">{node.name}</span>
          <span className="file-node-path">{parentPath}</span>
        </span>
      </button>
    </li>
  );
}

function fileBadge(path: string): { label: string; className: string } {
  if (/\.py$/i.test(path)) return { label: "PY", className: "file-type-python" };
  if (/\.tsx?$/i.test(path)) {
    return { label: "TS", className: "file-type-typescript" };
  }
  return { label: "·", className: "file-type-other" };
}
