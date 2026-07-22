import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { appError } from "../errors.js";
import { resolveInside } from "./path-policy.js";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".mypy_cache",
  ".pytest_cache",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "venv",
]);

const MAX_BYTES = 5 * 1024 * 1024;

export type FileTreeNode = {
  name: string;
  path: string;
  type: "directory" | "file";
  children?: FileTreeNode[];
};

export type TextFile = {
  path: string;
  content: string;
};

export class FileService {
  constructor(private readonly root: string) {}

  async tree(): Promise<FileTreeNode[]> {
    const canonicalRoot = await realpath(this.root);
    return this.readDirectory(canonicalRoot, "");
  }

  async readText(relativePath: string): Promise<TextFile> {
    const absolutePath = await resolveInside(this.root, relativePath);
    const metadata = await stat(absolutePath);
    if (metadata.size > MAX_BYTES) {
      throw appError("FILE_TOO_LARGE");
    }

    const buffer = await readFile(absolutePath);
    if (buffer.includes(0)) {
      throw appError("BINARY_FILE");
    }

    try {
      return {
        path: relativePath,
        content: new TextDecoder("utf-8", { fatal: true }).decode(buffer),
      };
    } catch {
      throw appError("INVALID_ENCODING");
    }
  }

  private async readDirectory(
    absoluteDirectory: string,
    relativeDirectory: string,
  ): Promise<FileTreeNode[]> {
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    entries.sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) {
        return left.isDirectory() ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });

    const nodes: FileTreeNode[] = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      if (entry.isDirectory()) {
        nodes.push({
          name: entry.name,
          path: relativePath,
          type: "directory",
          children: await this.readDirectory(
            path.join(absoluteDirectory, entry.name),
            relativePath,
          ),
        });
      } else if (entry.isFile()) {
        nodes.push({ name: entry.name, path: relativePath, type: "file" });
      }
    }
    return nodes;
  }
}
