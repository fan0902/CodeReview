import { describe, expect, it } from "vitest";
import type { FileTreeNode } from "../../api/client.js";
import { filterFileTree, visibleFileTree } from "./file-tree-visibility.js";

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
    name: "nest",
    path: "nest",
    type: "directory",
    children: [
      {
        name: "src",
        path: "nest/src",
        type: "directory",
        children: [
          { name: ".env", path: "nest/src/.env", type: "file" },
          { name: "role.enum.ts", path: "nest/src/role.enum.ts", type: "file" },
          { name: "users.controller.ts", path: "nest/src/users.controller.ts", type: "file" },
        ],
      },
    ],
  },
  {
    name: "python",
    path: "python",
    type: "directory",
    children: [
      { name: "app.py", path: "python/app.py", type: "file" },
      { name: "models.py", path: "python/models.py", type: "file" },
    ],
  },
] satisfies FileTreeNode[];

describe("visibleFileTree", () => {
  it("recursively removes dot-prefixed files and directories", () => {
    expect(visibleFileTree(tree, false)).toEqual([
      {
        name: "nest",
        path: "nest",
        type: "directory",
        children: [{
          name: "src",
          path: "nest/src",
          type: "directory",
          children: [
            { name: "role.enum.ts", path: "nest/src/role.enum.ts", type: "file" },
            { name: "users.controller.ts", path: "nest/src/users.controller.ts", type: "file" },
          ],
        }],
      },
      {
        name: "python",
        path: "python",
        type: "directory",
        children: [
          { name: "app.py", path: "python/app.py", type: "file" },
          { name: "models.py", path: "python/models.py", type: "file" },
        ],
      },
    ]);
  });

  it("returns the complete server tree when hidden items are enabled", () => {
    expect(visibleFileTree(tree, true)).toBe(tree);
  });
});

describe("filterFileTree", () => {
  it("returns the same tree for a blank query", () => {
    expect(filterFileTree(tree, "  ")).toBe(tree);
  });

  it("matches a file name and retains only its ancestors", () => {
    expect(filterFileTree(tree, "ROLE.ENUM")).toEqual([
      {
        name: "nest",
        path: "nest",
        type: "directory",
        children: [{
          name: "src",
          path: "nest/src",
          type: "directory",
          children: [{ name: "role.enum.ts", path: "nest/src/role.enum.ts", type: "file" }],
        }],
      },
    ]);
  });

  it("matches a complete relative path case-insensitively", () => {
    expect(filterFileTree(tree, "  PYTHON/MODELS  ")).toEqual([
      {
        name: "python",
        path: "python",
        type: "directory",
        children: [{ name: "models.py", path: "python/models.py", type: "file" }],
      },
    ]);
  });

  it("keeps the complete visible subtree when a directory matches", () => {
    expect(filterFileTree(tree, "python")).toEqual([tree[2]]);
  });

  it("returns an empty tree when nothing matches", () => {
    expect(filterFileTree(tree, "missing-service")).toEqual([]);
  });
});
