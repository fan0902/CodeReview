import type { SourceLocation } from "@cr/contracts";
import { PyrightClient } from "./pyright-client.js";
import { TypeScriptNavigation } from "./typescript-navigation.js";

export class NavigationService {
  private root: string | null = null;
  private typescript: TypeScriptNavigation | null = null;
  private pyright: Promise<PyrightClient> | null = null;

  open(root: string): void {
    if (this.pyright) void this.pyright.then((client) => client.stop());
    this.root = root;
    this.typescript = new TypeScriptNavigation(root);
    this.pyright = null;
  }

  async definition(
    relativePath: string,
    line: number,
    column: number,
  ): Promise<SourceLocation | null> {
    if (!this.root || !this.typescript) return null;
    if (relativePath.endsWith(".py")) {
      this.pyright ??= PyrightClient.start(this.root);
      return (await this.pyright).definition(relativePath, line, column);
    }
    return this.typescript.definition(relativePath, line, column);
  }

  async close(): Promise<void> {
    if (this.pyright) await (await this.pyright).stop();
    this.pyright = null;
    this.typescript = null;
    this.root = null;
  }
}
