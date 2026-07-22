import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IndexService } from "./analysis/index-service.js";
import { createApp } from "./app.js";
import { ProjectService } from "./projects/project-service.js";
import { SettingsService } from "./settings/settings-service.js";

const sourceFixture = fileURLToPath(
  new URL("../../../fixtures/mixed-project", import.meta.url),
);
const token = "test-token";
const origin = "http://127.0.0.1:43123";

let sandbox: string;
let projectPath: string;
let index: IndexService;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), "cr-api-"));
  projectPath = path.join(sandbox, "mixed-project");
  await cp(sourceFixture, projectPath, { recursive: true });
  const settings = await SettingsService.load(path.join(sandbox, "settings.json"));
  const projects = new ProjectService(settings, {
    select: async () => projectPath,
  });
  index = new IndexService();
  app = createApp({ token, allowedOrigin: () => origin, projects, settings, index });
});

afterEach(async () => {
  await index.close();
  await rm(sandbox, { recursive: true, force: true });
});

describe("session security", () => {
  it("leaves health public but requires token and trusted Origin elsewhere", async () => {
    await request(app).get("/api/health").expect(200);
    await request(app).get("/api/project/tree").expect(401);
    await request(app)
      .get("/api/project/tree")
      .set("Authorization", `Bearer ${token}`)
      .set("Origin", "https://evil.example")
      .expect(403);
  });

  it("accepts an authenticated heartbeat and a trusted beacon close", async () => {
    const heartbeat = { beat: vi.fn(), close: vi.fn() };
    const lifecycleApp = createApp({
      token,
      allowedOrigin: () => origin,
      projects: appProjects(),
      settings: await SettingsService.load(path.join(sandbox, "lifecycle-settings.json")),
      heartbeat: heartbeat as never,
    });

    await authorized(request(lifecycleApp).post("/api/lifecycle/heartbeat"))
      .send({ pageId: "page-1" })
      .expect(204);
    await request(lifecycleApp)
      .post("/api/lifecycle/pages/page-1/close")
      .set("Origin", origin)
      .send({ token })
      .expect(204);

    expect(heartbeat.beat).toHaveBeenCalledWith("page-1");
    expect(heartbeat.close).toHaveBeenCalledWith("page-1");
  });
});

describe("project APIs", () => {
  it("opens a project, exposes files, controllers, and recent projects", async () => {
    await authorized(request(app).post("/api/projects/select")).expect(200);
    await waitUntilReady();

    const tree = await authorized(request(app).get("/api/project/tree")).expect(200);
    expect(JSON.stringify(tree.body)).toContain("users.controller.ts");
    const controllers = await authorized(request(app).get("/api/controllers")).expect(200);
    expect(controllers.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ framework: "nestjs", path: "/users/:id" }),
        expect.objectContaining({ framework: "fastapi", path: "/users/{user_id}" }),
      ]),
    );
    const recent = await authorized(request(app).get("/api/projects/recent")).expect(200);
    expect(recent.body[0]).toMatchObject({ name: "mixed-project" });
  });

  it("rejects traversal through the file endpoint", async () => {
    await authorized(request(app).post("/api/projects/select")).expect(200);

    await authorized(
      request(app).get("/api/files/content").query({ path: "../settings.json" }),
    ).expect(403);
  });
});

describe("browser application", () => {
  it("serves the bundled browser UI without requiring an API token", async () => {
    const webRoot = path.join(sandbox, "web");
    await mkdir(webRoot);
    await writeFile(path.join(webRoot, "index.html"), "<main>CR browser UI</main>");
    const webApp = createApp({
      token,
      allowedOrigin: () => origin,
      projects: new ProjectService(
        await SettingsService.load(path.join(sandbox, "web-settings.json")),
        { select: async () => projectPath },
      ),
      settings: await SettingsService.load(path.join(sandbox, "web-settings.json")),
      webRoot,
    });

    const response = await request(webApp).get("/").expect(200);

    expect(response.text).toContain("CR browser UI");
  });
});

describe("enum bookmarks and watcher", () => {
  it("persists and deletes a resolved enum bookmark", async () => {
    await authorized(request(app).post("/api/projects/select")).expect(200);
    await waitUntilReady();

    const created = await authorized(request(app).post("/api/enums/bookmarks"))
      .send({
        relativePath: "python/app.py",
        symbolName: "State",
        language: "python",
      })
      .expect(201);
    const bookmarks = await authorized(request(app).get("/api/enums/bookmarks")).expect(200);
    expect(bookmarks.body[0]).toMatchObject({
      state: "ready",
      symbolName: "State",
      members: [{ name: "ACTIVE", value: '"active"' }, { name: "DISABLED", value: '"disabled"' }],
    });

    await authorized(
      request(app).delete(`/api/enums/bookmarks/${created.body.id}`),
    ).expect(204);
    await authorized(request(app).get("/api/enums/bookmarks")).expect(200, []);
  });

  it("refreshes enum values after a source file changes", async () => {
    await authorized(request(app).post("/api/projects/select")).expect(200);
    await waitUntilReady();
    const enumPath = path.join(projectPath, "nest/src/role.enum.ts");
    const original = await readFile(enumPath, "utf8");

    await writeFile(enumPath, original.replace('Viewer = "viewer",', 'Viewer = "reader",'));

    await waitFor(async () => {
      const result = await authorized(
        request(app).get("/api/enums/search").query({ q: "Role" }),
      );
      return JSON.stringify(result.body).includes("reader");
    });
  });
});

function authorized<T extends request.Test>(test: T): T {
  return test
    .set("Authorization", `Bearer ${token}`)
    .set("Origin", origin) as T;
}

function appProjects(): ProjectService {
  return new ProjectService({} as never, { select: async () => projectPath });
}

async function waitUntilReady(): Promise<void> {
  await waitFor(() => Promise.resolve(index.status().phase === "ready"));
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for condition");
}
