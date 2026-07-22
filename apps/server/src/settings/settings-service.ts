import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EnumBookmark, Language } from "@cr/contracts";
import { z } from "zod";

const recentProjectSchema = z.object({
  path: z.string().min(1),
  lastOpenedAt: z.string().datetime(),
});

const enumBookmarkSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().min(1),
  relativePath: z.string().min(1),
  symbolName: z.string().min(1),
  language: z.enum(["python", "typescript"]),
  createdAt: z.string().datetime(),
});

const settingsSchema = z.object({
  version: z.literal(1),
  recentProjects: z.array(recentProjectSchema).max(12),
  enumBookmarks: z.array(enumBookmarkSchema),
});

export type Settings = z.infer<typeof settingsSchema>;
export type RecentProject = z.infer<typeof recentProjectSchema>;

const EMPTY_SETTINGS: Settings = {
  version: 1,
  recentProjects: [],
  enumBookmarks: [],
};

export class SettingsService {
  private constructor(
    private readonly filePath: string,
    private value: Settings,
  ) {}

  static async load(filePath: string): Promise<SettingsService> {
    try {
      const value = settingsSchema.parse(JSON.parse(await readFile(filePath, "utf8")));
      return new SettingsService(filePath, value);
    } catch (error) {
      if (isMissingFile(error)) {
        return new SettingsService(filePath, structuredClone(EMPTY_SETTINGS));
      }

      await mkdir(path.dirname(filePath), { recursive: true });
      try {
        await rename(filePath, `${filePath}.corrupt-${Date.now()}`);
      } catch (renameError) {
        if (!isMissingFile(renameError)) {
          throw renameError;
        }
      }
      const service = new SettingsService(filePath, structuredClone(EMPTY_SETTINGS));
      await service.persist(service.value);
      return service;
    }
  }

  async read(): Promise<Settings> {
    return structuredClone(this.value);
  }

  async update(change: (current: Settings) => Settings): Promise<Settings> {
    const next = settingsSchema.parse(change(await this.read()));
    await this.persist(next);
    this.value = next;
    return this.read();
  }

  async addRecentProject(projectPath: string): Promise<void> {
    const now = new Date().toISOString();
    await this.update((current) => ({
      ...current,
      recentProjects: [
        { path: projectPath, lastOpenedAt: now },
        ...current.recentProjects.filter((project) => project.path !== projectPath),
      ].slice(0, 12),
    }));
  }

  async addEnumBookmark(input: {
    projectId: string;
    relativePath: string;
    symbolName: string;
    language: Language;
  }): Promise<EnumBookmark> {
    const bookmark: EnumBookmark = {
      id: randomUUID(),
      ...input,
      createdAt: new Date().toISOString(),
    };
    await this.update((current) => ({
      ...current,
      enumBookmarks: [...current.enumBookmarks, bookmark],
    }));
    return bookmark;
  }

  async deleteEnumBookmark(id: string): Promise<boolean> {
    const before = this.value.enumBookmarks.length;
    await this.update((current) => ({
      ...current,
      enumBookmarks: current.enumBookmarks.filter((bookmark) => bookmark.id !== id),
    }));
    return this.value.enumBookmarks.length < before;
  }

  static projectId(canonicalPath: string): string {
    return createHash("sha256").update(canonicalPath).digest("hex");
  }

  private async persist(value: Settings): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.filePath);
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
