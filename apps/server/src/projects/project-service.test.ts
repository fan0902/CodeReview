import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DirectoryPicker } from "../platform/directory-picker.js";
import { SettingsService } from "../settings/settings-service.js";
import { ProjectService } from "./project-service.js";

let sandbox: string;
let projectPath: string;
let settings: SettingsService;

beforeEach(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), "cr-project-"));
  projectPath = path.join(sandbox, "sample");
  await mkdir(projectPath);
  settings = await SettingsService.load(path.join(sandbox, "settings.json"));
});

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

describe("ProjectService", () => {
  it("restores only a previously selected project", async () => {
    const picker = pickerReturning(projectPath);
    const projects = new ProjectService(settings, picker);

    await expect(projects.openRecent(path.join(sandbox, "unapproved"))).rejects.toMatchObject({
      code: "PROJECT_NOT_RECENT",
    });
    await projects.select();

    expect((await projects.openRecent(projectPath)).root).toBe(await realpath(projectPath));
  });

  it("keeps the current project when selection is cancelled", async () => {
    let selection: string | null = projectPath;
    const projects = new ProjectService(settings, {
      select: async () => selection,
    });
    await projects.select();
    const before = projects.current();
    selection = null;

    expect(await projects.select()).toEqual({ cancelled: true });
    expect(projects.current()).toEqual(before);
  });
});

function pickerReturning(value: string | null): DirectoryPicker {
  return { select: async () => value };
}
