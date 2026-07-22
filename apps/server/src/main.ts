import { once } from "node:events";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { IndexService } from "./analysis/index-service.js";
import { createApp } from "./app.js";
import { NavigationService } from "./navigation/navigation-service.js";
import { MacDirectoryPicker } from "./platform/directory-picker.js";
import { ProjectService } from "./projects/project-service.js";
import { parseServerOptions } from "./server-options.js";
import { SettingsService } from "./settings/settings-service.js";
import { HeartbeatClock } from "./lifecycle/heartbeat.js";

export async function main(arguments_ = process.argv.slice(2)): Promise<void> {
  const options = parseServerOptions(arguments_);
  const testMode = process.env.CR_TEST_MODE === "1";
  const supportDirectory =
    testMode && process.env.CR_APP_SUPPORT_DIR
      ? process.env.CR_APP_SUPPORT_DIR
      : path.join(homedir(), "Library", "Application Support", "CR");
  const settings = await SettingsService.load(
    path.join(supportDirectory, "settings.json"),
  );
  const testProject = testMode ? process.env.CR_TEST_PROJECT : undefined;
  const projects = new ProjectService(
    settings,
    testProject ? { select: async () => testProject } : new MacDirectoryPicker(),
  );
  const index = new IndexService();
  const navigation = new NavigationService();
  let shutdown: () => Promise<void> = async () => undefined;
  const heartbeat = new HeartbeatClock({
    idleMs: 15 * 60_000,
    now: Date.now,
    onIdle: () => void shutdown().then(() => process.exit(0)),
  });
  const sweepTimer = setInterval(() => heartbeat.sweep(), 60_000);
  let allowedOrigin = "";
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const webRoot = process.env.CR_WEB_ROOT ?? path.resolve(moduleDirectory, "../../web/dist");
  const app = createApp({
    token: options.token,
    allowedOrigin: () => allowedOrigin,
    projects,
    settings,
    index,
    navigation,
    heartbeat,
    webRoot,
  });
  const server = app.listen(options.port, options.host);
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("CR could not determine its local port.");
  }
  allowedOrigin = `http://${options.host}:${address.port}`;
  if (testProject) await projects.select();
  process.stdout.write(
    `${JSON.stringify({
      status: "ready",
      url: `${allowedOrigin}/?token=${encodeURIComponent(options.token)}`,
      host: options.host,
      port: address.port,
      pid: process.pid,
    })}\n`,
  );

  shutdown = async () => {
    clearInterval(sweepTimer);
    server.close();
    await Promise.all([index.close(), navigation.close()]);
  };
  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
}

const executable = process.argv[1];
if (executable && import.meta.url === pathToFileURL(executable).href) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
