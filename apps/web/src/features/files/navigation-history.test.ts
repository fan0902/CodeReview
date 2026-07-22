import { describe, expect, it } from "vitest";
import { createNavigationHistory } from "./navigation-history.js";

describe("navigation history", () => {
  it("supports backward and forward source locations", () => {
    const history = createNavigationHistory();
    history.visit({ path: "a.ts", line: 1, column: 1 });
    history.visit({ path: "b.ts", line: 8, column: 3 });

    expect(history.back()).toEqual({ path: "a.ts", line: 1, column: 1 });
    expect(history.forward()).toEqual({ path: "b.ts", line: 8, column: 3 });
  });

  it("drops forward entries after a new visit", () => {
    const history = createNavigationHistory();
    history.visit({ path: "a.ts", line: 1, column: 1 });
    history.visit({ path: "b.ts", line: 1, column: 1 });
    history.back();
    history.visit({ path: "c.ts", line: 1, column: 1 });

    expect(history.forward()).toBeNull();
  });
});
