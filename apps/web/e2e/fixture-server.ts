import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IndexService } from "../../server/src/analysis/index-service.js";
import { createApp } from "../../server/src/app.js";
import { NavigationService } from "../../server/src/navigation/navigation-service.js";
import { ProjectService } from "../../server/src/projects/project-service.js";
import { SettingsService } from "../../server/src/settings/settings-service.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const supportRoot = await mkdtemp(path.join(tmpdir(), "cr-web-e2e-"));
const fixtureRoot = path.join(repositoryRoot, "fixtures/mixed-project");
const settings = await SettingsService.load(path.join(supportRoot, "settings.json"));
const projects = new ProjectService(settings, { select: async () => fixtureRoot });
const index = new IndexService();
const navigation = new NavigationService();
const origin = "http://127.0.0.1:43123";
const app = createApp({
  token: "e2e-token",
  allowedOrigin: () => origin,
  projects,
  settings,
  index,
  navigation,
  webRoot: path.join(repositoryRoot, "apps/web/dist"),
});
const server = app.listen(43123, "127.0.0.1");
await once(server, "listening");

const shutdown = async () => {
  server.close();
  await Promise.all([index.close(), navigation.close()]);
  await rm(supportRoot, { recursive: true, force: true });
};
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
