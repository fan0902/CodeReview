import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileService } from "./file-service.js";
import { resolveInside } from "./path-policy.js";

let sandbox: string;
let root: string;
let outside: string;

beforeEach(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), "cr-files-"));
  root = path.join(sandbox, "project");
  outside = path.join(sandbox, "outside");
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(path.join(root, "src", "main.ts"), "export const value = 1;\n");
  await writeFile(path.join(root, "src", "types.d.ts"), "export type Id = string;\n");
  await writeFile(path.join(root, "node_modules", "pkg", "index.ts"), "ignored\n");
  await writeFile(path.join(outside, "secret.txt"), "secret\n");
  await symlink(outside, path.join(root, "outside-link"));
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

describe("resolveInside", () => {
  it("rejects parent traversal", async () => {
    await expect(resolveInside(root, "../outside/secret.txt")).rejects.toMatchObject({
      code: "PATH_OUTSIDE_PROJECT",
    });
  });

  it("rejects a symlink that escapes the project", async () => {
    await expect(resolveInside(root, "outside-link/secret.txt")).rejects.toMatchObject({
      code: "PATH_OUTSIDE_PROJECT",
    });
  });
});

describe("FileService", () => {
  it("filters generated folders but keeps declaration files visible", async () => {
    const tree = await new FileService(root).tree();
    const paths = flatten(tree);

    expect(paths).toContain("src/types.d.ts");
    expect(paths).toContain("src/main.ts");
    expect(paths).not.toContain("node_modules");
    expect(paths).not.toContain("node_modules/pkg/index.ts");
  });

  it("rejects files larger than five MiB", async () => {
    await writeFile(path.join(root, "large.py"), Buffer.alloc(5 * 1024 * 1024 + 1, 65));

    await expect(new FileService(root).readText("large.py")).rejects.toMatchObject({
      code: "FILE_TOO_LARGE",
    });
  });

  it("rejects binary files", async () => {
    await writeFile(path.join(root, "image.py"), Buffer.from([65, 0, 66]));

    await expect(new FileService(root).readText("image.py")).rejects.toMatchObject({
      code: "BINARY_FILE",
    });
  });
});

function flatten(nodes: Array<{ path: string; children?: unknown[] }>): string[] {
  return nodes.flatMap((node) => [
    node.path,
    ...flatten((node.children ?? []) as Array<{ path: string; children?: unknown[] }>),
  ]);
}
