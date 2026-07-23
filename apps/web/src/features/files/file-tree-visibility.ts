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

export function filterFileTree(
  nodes: FileTreeNode[],
  query: string,
): FileTreeNode[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return nodes;

  return filterNodes(nodes, normalizedQuery);
}

function filterNodes(nodes: FileTreeNode[], normalizedQuery: string): FileTreeNode[] {
  return nodes.flatMap((node) => {
    const matches =
      node.name.toLocaleLowerCase().includes(normalizedQuery) ||
      node.path.toLocaleLowerCase().includes(normalizedQuery);

    if (node.type === "file") return matches ? [node] : [];
    if (matches) return [node];

    const children = filterNodes(node.children ?? [], normalizedQuery);
    return children.length ? [{ ...node, children }] : [];
  });
}
