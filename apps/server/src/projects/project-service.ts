import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { DirectoryPicker } from "../platform/directory-picker.js";
import { SettingsService } from "../settings/settings-service.js";
import { AppError } from "../errors.js";

export type ProjectSummary = {
  id: string;
  name: string;
  root: string;
};

export class ProjectService {
  private selected: ProjectSummary | null = null;

  constructor(
    private readonly settings: SettingsService,
    private readonly picker: DirectoryPicker,
  ) {}

  current(): ProjectSummary | null {
    return this.selected ? { ...this.selected } : null;
  }

  async select(): Promise<{ cancelled: true } | ProjectSummary> {
    const selectedPath = await this.picker.select();
    if (selectedPath === null) {
      return { cancelled: true };
    }
    return this.openAndRemember(selectedPath);
  }

  async openRecent(projectPath: string): Promise<ProjectSummary> {
    const settings = await this.settings.read();
    if (settings.recentProjects.some((project) => project.path === projectPath)) {
      return this.openAndRemember(projectPath);
    }

    let canonicalPath: string;
    try {
      canonicalPath = await realpath(projectPath);
    } catch {
      throw new AppError("PROJECT_NOT_RECENT", "The project has not been selected before.", 403);
    }
    if (!settings.recentProjects.some((project) => project.path === canonicalPath)) {
      throw new AppError("PROJECT_NOT_RECENT", "The project has not been selected before.", 403);
    }
    return this.openAndRemember(canonicalPath);
  }

  async recentProjects() {
    return (await this.settings.read()).recentProjects.map((project) => ({
      ...project,
      name: path.basename(project.path),
    }));
  }

  private async openAndRemember(projectPath: string): Promise<ProjectSummary> {
    const canonicalPath = await realpath(projectPath);
    if (!(await stat(canonicalPath)).isDirectory()) {
      throw new AppError("PROJECT_NOT_DIRECTORY", "The selected path is not a directory.", 400);
    }
    const project = {
      id: SettingsService.projectId(canonicalPath),
      name: path.basename(canonicalPath),
      root: canonicalPath,
    };
    this.selected = project;
    await this.settings.addRecentProject(canonicalPath);
    return { ...project };
  }
}
