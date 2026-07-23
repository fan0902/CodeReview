import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useApi } from "../../api/ApiProvider.js";
import type { FileTreeNode } from "../../api/client.js";
import { useWorkspace } from "../../state/workspace-store.js";
import { visibleFileTree } from "./file-tree-visibility.js";
import { QuickOpen } from "./QuickOpen.js";

export function FileBrowser() {
  const api = useApi();
  const project = useWorkspace((state) => state.project);
  const visitLocation = useWorkspace((state) => state.visitLocation);
  const tree = useQuery({
    queryKey: ["file-tree", project?.id],
    queryFn: api.getTree,
    enabled: Boolean(project),
  });
  const [showHidden, setShowHidden] = useState(false);
  const visibleTree = useMemo(
    () => visibleFileTree(tree.data ?? [], showHidden),
    [showHidden, tree.data],
  );
  if (!project) return <p className="region-placeholder">尚未打开工程</p>;
  if (tree.isPending) return <p className="region-placeholder">读取文件树…</p>;
  if (tree.isError) return <p role="alert">无法读取工程文件</p>;
  return (
    <div className="file-browser">
      <div className="file-browser-tools">
        <QuickOpen
          tree={visibleTree}
          onOpen={(path) => visitLocation({ path, line: 1, column: 1 })}
        />
        <label className="hidden-files-toggle">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(event) => setShowHidden(event.target.checked)}
          />
          <span>显示隐藏文件</span>
        </label>
      </div>
      <ul className="file-tree" role="tree" aria-label="文件树">
        {visibleTree.map((node) => (
          <TreeNode key={node.path} node={node} onOpen={(path) => visitLocation({ path, line: 1, column: 1 })} />
        ))}
      </ul>
    </div>
  );
}

function TreeNode({ node, onOpen }: { node: FileTreeNode; onOpen: (path: string) => void }) {
  if (node.type === "directory") {
    return (
      <li role="none">
        <details open>
          <summary>{node.name}</summary>
          <ul role="group">
            {node.children?.map((child) => (
              <TreeNode key={child.path} node={child} onOpen={onOpen} />
            ))}
          </ul>
        </details>
      </li>
    );
  }
  return (
    <li role="none">
      <button type="button" role="treeitem" onClick={() => onOpen(node.path)}>
        {node.name}
      </button>
    </li>
  );
}
