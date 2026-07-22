import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  analyzeTypeScriptFile,
  analyzeTypeScriptProject,
} from "./typescript-analyzer.js";

const fixtureRoot = fileURLToPath(
  new URL("../../../../fixtures/mixed-project", import.meta.url),
);

describe("analyzeTypeScriptProject", () => {
  it("extracts a NestJS endpoint without executing source", async () => {
    const result = await analyzeTypeScriptProject(fixtureRoot);
    const endpoint = result.controllers.find((item) => item.name === "Get user");

    expect(endpoint).toMatchObject({
      framework: "nestjs",
      method: "GET",
      path: "/users/:id",
      name: "Get user",
      description: "Returns one user",
      response: { type: "Promise<UserDto>" },
    });
    expect(endpoint?.parameters).toEqual([
      expect.objectContaining({
        name: "id",
        source: "path",
        type: "string",
        required: true,
      }),
      expect.objectContaining({
        name: "verbose",
        source: "query",
        type: "boolean",
        required: false,
        defaultValue: "false",
      }),
    ]);
  });

  it("extracts regular and const enum members", async () => {
    const result = await analyzeTypeScriptProject(fixtureRoot);

    expect(result.enums.find((item) => item.symbolName === "Role")?.members).toEqual([
      { name: "Admin", value: '"admin"' },
      { name: "Viewer", value: '"viewer"' },
    ]);
    expect(result.enums.find((item) => item.symbolName === "Priority")?.members).toEqual([
      { name: "Low", value: "0" },
      { name: "High", value: "1" },
    ]);
  });
});

describe("analyzeTypeScriptFile", () => {
  it("marks a dynamic route expression instead of claiming a literal path", () => {
    const source = ts.createSourceFile(
      "dynamic.controller.ts",
      '@Controller(prefix) class DynamicController { @Get(route) list(): Item[] { return []; } }',
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    const result = analyzeTypeScriptFile(source, "dynamic.controller.ts");

    expect(result.controllers[0]?.diagnostics.join(" ")).toContain("prefix");
    expect(result.controllers[0]?.diagnostics.join(" ")).toContain("route");
  });
});
