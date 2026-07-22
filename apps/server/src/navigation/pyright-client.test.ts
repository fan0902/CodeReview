import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PyrightClient } from "./pyright-client.js";

const fixtureRoot = fileURLToPath(
  new URL("../../../../fixtures/mixed-project", import.meta.url),
);

describe("PyrightClient", () => {
  it("resolves an imported Python symbol through the language server", async () => {
    const relativePath = "python/app.py";
    const content = await readFile(path.join(fixtureRoot, relativePath), "utf8");
    const position = lineColumnOf(content, "UserOut", 2);
    const client = await PyrightClient.start(fixtureRoot);

    try {
      expect(await client.definition(relativePath, position.line, position.column)).toEqual({
        path: "python/models.py",
        line: 4,
        column: 7,
      });
    } finally {
      await client.stop();
    }
  }, 15_000);

  it("returns null for an unresolved position", async () => {
    const client = await PyrightClient.start(fixtureRoot);
    try {
      expect(await client.definition("python/app.py", 1, 1)).toBeNull();
    } finally {
      await client.stop();
    }
  }, 15_000);
});

function lineColumnOf(source: string, needle: string, occurrence = 1) {
  let offset = -1;
  let cursor = 0;
  for (let index = 0; index < occurrence; index += 1) {
    offset = source.indexOf(needle, cursor);
    cursor = offset + needle.length;
  }
  if (offset < 0) throw new Error(`Missing ${needle}`);
  const before = source.slice(0, offset);
  const lines = before.split("\n");
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}
