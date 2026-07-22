import { useQuery } from "@tanstack/react-query";
import { useApi } from "../../api/ApiProvider.js";
import type { FileTreeNode } from "../../api/client.js";
import { useWorkspace } from "../../state/workspace-store.js";
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
  if (!project) return <p className="region-placeholder">尚未打开工程</p>;
  if (tree.isPending) return <p className="region-placeholder">读取文件树…</p>;
  if (tree.isError) return <p role="alert">无法读取工程文件</p>;
  return (
    <div className="file-browser">
      <QuickOpen tree={tree.data} onOpen={(path) => visitLocation({ path, line: 1, column: 1 })} />
      <ul className="file-tree" role="tree" aria-label="文件树">
        {tree.data.map((node) => (
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
