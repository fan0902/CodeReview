import { describe, expect, it } from "vitest";
import { MacDirectoryPicker } from "./directory-picker.js";

describe("MacDirectoryPicker", () => {
  it("returns a trimmed POSIX folder path", async () => {
    const picker = new MacDirectoryPicker(async (file, args) => {
      expect(file).toBe("/usr/bin/osascript");
      expect(args.join(" ")).toContain("choose folder");
      return { stdout: "/work/project/\n", stderr: "" };
    });

    expect(await picker.select()).toBe("/work/project/");
  });

  it("maps AppleScript cancellation to null", async () => {
    const picker = new MacDirectoryPicker(async () => {
      throw new Error("execution error: User canceled. (-128)");
    });

    expect(await picker.select()).toBeNull();
  });
});
