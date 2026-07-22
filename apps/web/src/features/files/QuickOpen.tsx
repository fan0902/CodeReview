import { useEffect, useMemo, useState } from "react";
import type { FileTreeNode } from "../../api/client.js";

export function QuickOpen({ tree, onOpen }: { tree: FileTreeNode[]; onOpen: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const files = useMemo(() => flatten(tree), [tree]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.metaKey && event.key.toLocaleLowerCase() === "p") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  if (!open) {
    return <button className="quick-open-trigger" type="button" onClick={() => setOpen(true)}>搜索文件 <kbd>⌘P</kbd></button>;
  }
  const results = files.filter((file) => file.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 20);
  return (
    <div className="quick-open" role="dialog" aria-label="快速打开文件">
      <input autoFocus aria-label="搜索文件" value={query} onChange={(event) => setQuery(event.target.value)} />
      <ul>
        {results.map((file) => (
          <li key={file}><button type="button" onClick={() => { onOpen(file); setOpen(false); setQuery(""); }}>{file}</button></li>
        ))}
      </ul>
      <button type="button" onClick={() => setOpen(false)}>关闭</button>
    </div>
  );
}

function flatten(nodes: FileTreeNode[]): string[] {
  return nodes.flatMap((node) =>
    node.type === "file" ? [node.path] : flatten(node.children ?? []),
  );
}
