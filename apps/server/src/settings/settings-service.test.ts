import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SettingsService } from "./settings-service.js";

let sandbox: string;
let settingsPath: string;

beforeEach(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), "cr-settings-"));
  settingsPath = path.join(sandbox, "nested", "settings.json");
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

describe("SettingsService", () => {
  it("creates empty versioned settings", async () => {
    const settings = await SettingsService.load(settingsPath);

    expect(await settings.read()).toEqual({
      version: 1,
      recentProjects: [],
      enumBookmarks: [],
    });
  });

  it("backs up corrupt JSON before resetting", async () => {
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, "{");

    const settings = await SettingsService.load(settingsPath);

    expect(await settings.read()).toEqual({
      version: 1,
      recentProjects: [],
      enumBookmarks: [],
    });
    expect((await readdir(path.dirname(settingsPath))).filter((name) => name.startsWith("settings.json.corrupt-"))).toHaveLength(1);
  });

  it("writes valid JSON atomically without leaving a temporary file", async () => {
    const settings = await SettingsService.load(settingsPath);

    await settings.addRecentProject("/work/project");

    expect(JSON.parse(await readFile(settingsPath, "utf8"))).toMatchObject({
      recentProjects: [{ path: "/work/project" }],
    });
    expect((await readdir(path.dirname(settingsPath))).some((name) => name.endsWith(".tmp"))).toBe(false);
  });
});
