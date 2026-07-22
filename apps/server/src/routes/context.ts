import type { IndexService } from "../analysis/index-service.js";
import { AppError } from "../errors.js";
import type { NavigationService } from "../navigation/navigation-service.js";
import type { ProjectService } from "../projects/project-service.js";
import type { SettingsService } from "../settings/settings-service.js";

export type RouteContext = {
  projects: ProjectService;
  settings: SettingsService;
  index: IndexService;
  navigation: NavigationService;
};

export function currentProject(context: RouteContext) {
  const project = context.projects.current();
  if (!project) throw new AppError("NO_PROJECT", "Open a project first.", 409);
  return project;
}
