import { describe, expect, it } from "vitest";
import { sourceLocationSchema } from "./index.js";

describe("sourceLocationSchema", () => {
  it("rejects an absolute project path", () => {
    expect(() =>
      sourceLocationSchema.parse({ path: "/tmp/a.ts", line: 1, column: 1 }),
    ).toThrow();
  });
});
