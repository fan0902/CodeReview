import { describe, expect, it } from "vitest";
import type { FileTreeNode } from "../../api/client.js";
import { visibleFileTree } from "./file-tree-visibility.js";

const tree = [
  {
    name: ".github",
    path: ".github",
    type: "directory",
    children: [
      { name: "ci.yml", path: ".github/ci.yml", type: "file" },
    ],
  },
  {
    name: "src",
    path: "src",
    type: "directory",
    children: [
      { name: ".env", path: "src/.env", type: "file" },
      { name: "main.ts", path: "src/main.ts", type: "file" },
    ],
  },
] satisfies FileTreeNode[];

describe("visibleFileTree", () => {
  it("recursively removes dot-prefixed files and directories", () => {
    expect(visibleFileTree(tree, false)).toEqual([
      {
        name: "src",
        path: "src",
        type: "directory",
        children: [
          { name: "main.ts", path: "src/main.ts", type: "file" },
        ],
      },
    ]);
  });

  it("returns the complete server tree when hidden items are enabled", () => {
    expect(visibleFileTree(tree, true)).toBe(tree);
  });
});
