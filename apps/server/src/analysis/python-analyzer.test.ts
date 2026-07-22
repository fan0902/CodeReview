import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  analyzePythonFile,
  analyzePythonProject,
} from "./python-analyzer.js";

const fixtureRoot = fileURLToPath(
  new URL("../../../../fixtures/mixed-project", import.meta.url),
);

describe("analyzePythonProject", () => {
  it("extracts a FastAPI endpoint without executing source", async () => {
    const result = await analyzePythonProject(fixtureRoot);
    const endpoint = result.controllers.find((item) => item.name === "Get user");

    expect(endpoint).toMatchObject({
      framework: "fastapi",
      method: "GET",
      path: "/users/{user_id}",
      name: "Get user",
      response: { type: "UserOut" },
    });
    expect(endpoint?.parameters).toEqual([
      expect.objectContaining({
        name: "user_id",
        source: "path",
        type: "int",
        required: true,
      }),
      expect.objectContaining({
        name: "verbose",
        source: "query",
        type: "bool",
        required: false,
        defaultValue: "False",
      }),
    ]);
  });

  it("extracts Python Enum members", async () => {
    const result = await analyzePythonProject(fixtureRoot);

    expect(result.enums.find((item) => item.symbolName === "State")?.members).toEqual([
      { name: "ACTIVE", value: '"active"' },
      { name: "DISABLED", value: '"disabled"' },
    ]);
  });
});

describe("analyzePythonFile", () => {
  it("reports dynamic FastAPI path expressions", () => {
    const source = `
router = APIRouter(prefix=PREFIX)

@router.get(PATH)
async def list_items() -> list[Item]:
    return []
`;

    const result = analyzePythonFile("dynamic.py", source);

    expect(result.controllers[0]?.diagnostics.join(" ")).toContain("PREFIX");
    expect(result.controllers[0]?.diagnostics.join(" ")).toContain("PATH");
  });
});
