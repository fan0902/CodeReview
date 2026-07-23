import type { FileTreeNode } from "../../api/client.js";

export function visibleFileTree(
  nodes: FileTreeNode[],
  showHidden: boolean,
): FileTreeNode[] {
  if (showHidden) return nodes;
  return nodes
    .filter((node) => !node.name.startsWith("."))
    .map((node) =>
      node.type === "directory"
        ? {
            ...node,
            children: visibleFileTree(node.children ?? [], false),
          }
        : node,
    );
}
