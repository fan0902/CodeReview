import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { SourceLocation } from "@cr/contracts";
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from "vscode-jsonrpc/node";
import { AppError } from "../errors.js";

type LspPosition = { line: number; character: number };
type LspRange = { start: LspPosition; end: LspPosition };
type LspLocation = { uri: string; range: LspRange };
type LspLocationLink = { targetUri: string; targetSelectionRange: LspRange };

const require = createRequire(import.meta.url);

export class PyrightClient {
  private readonly opened = new Set<string>();
  private stopped = false;

  private constructor(
    private readonly root: string,
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly connection: MessageConnection,
  ) {}

  static async start(root: string): Promise<PyrightClient> {
    const canonicalRoot = path.resolve(root);
    const langserver = require.resolve("pyright/langserver.index.js");
    const child = spawn(process.execPath, [langserver, "--stdio"], {
      cwd: canonicalRoot,
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const connection = createMessageConnection(
      new StreamMessageReader(child.stdout),
      new StreamMessageWriter(child.stdin),
    );
    connection.listen();
    const client = new PyrightClient(canonicalRoot, child, connection);
    try {
      await client.withTimeout(
        connection.sendRequest("initialize", {
          processId: process.pid,
          rootUri: pathToFileURL(canonicalRoot).href,
          capabilities: {
            textDocument: { definition: { linkSupport: true } },
          },
          workspaceFolders: [
            {
              uri: pathToFileURL(canonicalRoot).href,
              name: path.basename(canonicalRoot),
            },
          ],
        }),
      );
      await connection.sendNotification("initialized", {});
      return client;
    } catch (error) {
      child.kill();
      connection.dispose();
      throw new AppError(
        "LANGUAGE_SERVICE_UNAVAILABLE",
        error instanceof Error ? error.message : "Pyright failed to initialize.",
        503,
      );
    }
  }

  async definition(
    relativePath: string,
    line: number,
    column: number,
  ): Promise<SourceLocation | null> {
    if (this.stopped) {
      throw new AppError(
        "LANGUAGE_SERVICE_UNAVAILABLE",
        "Pyright is not running.",
        503,
      );
    }
    const absolutePath = path.resolve(this.root, relativePath);
    if (!this.isInside(absolutePath) || line < 1 || column < 1) return null;
    const uri = pathToFileURL(absolutePath).href;
    if (!this.opened.has(uri)) {
      await this.connection.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId: "python",
          version: 1,
          text: await readFile(absolutePath, "utf8"),
        },
      });
      this.opened.add(uri);
    }
    const response = await this.withTimeout(
      this.connection.sendRequest<
        LspLocation | LspLocation[] | LspLocationLink[] | null
      >("textDocument/definition", {
        textDocument: { uri },
        position: { line: line - 1, character: column - 1 },
      }),
    );
    const first = Array.isArray(response) ? response[0] : response;
    if (!first) return null;
    const targetUri = "targetUri" in first ? first.targetUri : first.uri;
    const targetRange =
      "targetSelectionRange" in first ? first.targetSelectionRange : first.range;
    const targetPath = fileURLToPath(targetUri);
    if (!this.isInside(targetPath)) return null;
    return {
      path: path.relative(this.root, targetPath).split(path.sep).join("/"),
      line: targetRange.start.line + 1,
      column: targetRange.start.character + 1,
    };
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    try {
      await this.withTimeout(this.connection.sendRequest("shutdown"));
      await this.connection.sendNotification("exit");
    } catch {
      this.child.kill();
    } finally {
      this.connection.dispose();
      if (!this.child.killed) this.child.kill();
    }
  }

  private isInside(fileName: string): boolean {
    const relative = path.relative(this.root, path.resolve(fileName));
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new AppError(
                  "LANGUAGE_SERVICE_UNAVAILABLE",
                  "Pyright did not respond within 5 seconds.",
                  503,
                ),
              ),
            5_000,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
