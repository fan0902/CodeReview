import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TypeScriptNavigation } from "./typescript-navigation.js";

const fixtureRoot = fileURLToPath(
  new URL("../../../../fixtures/mixed-project", import.meta.url),
);

describe("TypeScriptNavigation", () => {
  it("resolves an imported symbol to its project definition", async () => {
    const relativePath = "nest/src/users.controller.ts";
    const content = await readFile(path.join(fixtureRoot, relativePath), "utf8");
    const position = lineColumnOf(content, "UserDto", 2);
    const navigation = new TypeScriptNavigation(fixtureRoot);

    expect(navigation.definition(relativePath, position.line, position.column)).toEqual({
      path: "nest/src/user.dto.ts",
      line: 1,
      column: 14,
    });
  });

  it("returns null when no definition exists", () => {
    const navigation = new TypeScriptNavigation(fixtureRoot);

    expect(navigation.definition("nest/src/users.controller.ts", 1, 1)).toBeNull();
  });
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
