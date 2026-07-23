import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type {
  ControllerEndpoint,
  IndexStatus,
  Language,
} from "@cr/contracts";
import chokidar, { type FSWatcher } from "chokidar";
import ts from "typescript";
import { analyzePythonFile } from "./python-analyzer.js";
import type { AnalysisResult, AnalyzedEnum } from "./types.js";
import { analyzeTypeScriptFile } from "./typescript-analyzer.js";

const IGNORED = /(^|[/\\])(\.git|\.worktrees|node_modules|\.venv|venv|dist|build|coverage|__pycache__)([/\\]|$)/;

export class IndexService {
  private generation = 0;
  private projectRoot: string | null = null;
  private watcher: FSWatcher | null = null;
  private readonly files = new Map<string, AnalysisResult>();
  private currentStatus: IndexStatus = {
    phase: "idle",
    completed: 0,
    total: 0,
    diagnostics: [],
  };
  private debounce: NodeJS.Timeout | null = null;

  open(root: string): void {
    const generation = ++this.generation;
    this.projectRoot = root;
    this.files.clear();
    this.currentStatus = {
      phase: "scanning",
      completed: 0,
      total: 0,
      diagnostics: [],
    };
    if (this.watcher) void this.watcher.close();
    this.watcher = null;
    queueMicrotask(() => void this.build(generation));
  }

  status(): IndexStatus {
    return structuredClone(this.currentStatus);
  }

  controllers(): ControllerEndpoint[] {
    return [...this.files.values()].flatMap((result) => result.controllers);
  }

  enums(): AnalyzedEnum[] {
    return [...this.files.values()].flatMap((result) => result.enums);
  }

  searchEnums(query: string): AnalyzedEnum[] {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return [];
    return this.enums().filter(
      (item) =>
        item.symbolName.toLocaleLowerCase().includes(normalized) ||
        item.qualifiedName.toLocaleLowerCase().includes(normalized),
    );
  }

  findEnum(input: {
    relativePath: string;
    symbolName: string;
    language?: Language;
  }): AnalyzedEnum | undefined {
    return this.enums().find(
      (item) =>
        item.relativePath === input.relativePath &&
        item.symbolName === input.symbolName &&
        (!input.language || item.language === input.language),
    );
  }

  async close(): Promise<void> {
    this.generation += 1;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = null;
    await this.watcher?.close();
    this.watcher = null;
    this.projectRoot = null;
    this.files.clear();
    this.currentStatus = {
      phase: "idle",
      completed: 0,
      total: 0,
      diagnostics: [],
    };
  }

  private async build(generation: number): Promise<void> {
    const root = this.projectRoot;
    if (!root) return;
    try {
      const files = await discoverSourceFiles(root);
      if (generation !== this.generation) return;
      this.currentStatus.total = files.length;
      for (const relativePath of files) {
        if (generation !== this.generation) return;
        await this.indexOne(relativePath);
        this.currentStatus.completed += 1;
      }
      if (generation !== this.generation) return;
      await this.startWatcher(root, generation);
      if (generation === this.generation) this.currentStatus.phase = "ready";
    } catch (error) {
      if (generation !== this.generation) return;
      this.currentStatus.phase = "error";
      this.currentStatus.diagnostics.push(
        error instanceof Error ? error.message : "Indexing failed.",
      );
    }
  }

  private async indexOne(relativePath: string): Promise<void> {
    const root = this.projectRoot;
    if (!root) return;
    if (!isSourceFile(relativePath)) {
      this.files.delete(relativePath);
      return;
    }
    try {
      const source = await readFile(path.join(root, relativePath), "utf8");
      const result = relativePath.endsWith(".py")
        ? analyzePythonFile(relativePath, source)
        : analyzeTypeScriptFile(
            ts.createSourceFile(
              relativePath,
              source,
              ts.ScriptTarget.Latest,
              true,
              relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
            ),
            relativePath,
          );
      this.files.set(relativePath, result);
    } catch (error) {
      this.files.delete(relativePath);
      this.currentStatus.diagnostics.push(
        `${relativePath}: ${error instanceof Error ? error.message : "parse failed"}`,
      );
    }
  }

  private async startWatcher(root: string, generation: number): Promise<void> {
    const watcher = chokidar.watch(".", {
      cwd: root,
      ignored: (watchedPath, metadata) =>
        IGNORED.test(watchedPath) ||
        Boolean(metadata?.isFile() && !isSourceFile(watchedPath)),
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 75, pollInterval: 20 },
    });
    this.watcher = watcher;
    watcher.on("all", (event, relativePath) => {
      if (generation !== this.generation) return;
      if (this.debounce) clearTimeout(this.debounce);
      this.debounce = setTimeout(() => {
        if (event === "unlink") this.files.delete(relativePath);
        else void this.indexOne(relativePath);
      }, 100);
    });
    await new Promise<void>((resolve, reject) => {
      watcher.once("ready", resolve);
      watcher.once("error", reject);
    });
  }
}

async function discoverSourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
      if (IGNORED.test(relativePath)) continue;
      if (entry.isDirectory()) await visit(absolutePath);
      else if (entry.isFile() && isSourceFile(relativePath)) files.push(relativePath);
    }
  }
  await visit(root);
  return files;
}

function isSourceFile(relativePath: string): boolean {
  return (
    relativePath.endsWith(".py") ||
    ((relativePath.endsWith(".ts") || relativePath.endsWith(".tsx")) &&
      !relativePath.endsWith(".d.ts"))
  );
}
