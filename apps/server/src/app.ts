import express, {
  type ErrorRequestHandler,
  type Express,
} from "express";
import { timingSafeEqual } from "node:crypto";
import { ZodError } from "zod";
import { IndexService } from "./analysis/index-service.js";
import { AppError } from "./errors.js";
import { NavigationService } from "./navigation/navigation-service.js";
import type { ProjectService } from "./projects/project-service.js";
import { controllerRoutes } from "./routes/controllers.js";
import { enumRoutes } from "./routes/enums.js";
import { fileRoutes } from "./routes/files.js";
import { indexStatusRoutes } from "./routes/index-status.js";
import { navigationRoutes } from "./routes/navigation.js";
import { projectRoutes } from "./routes/projects.js";
import { requireSession } from "./security/session.js";
import type { SettingsService } from "./settings/settings-service.js";
import type { HeartbeatClock } from "./lifecycle/heartbeat.js";

export type AppDependencies = {
  token: string;
  allowedOrigin: () => string;
  projects: ProjectService;
  settings: SettingsService;
  index?: IndexService;
  navigation?: NavigationService;
  webRoot?: string;
  heartbeat?: HeartbeatClock;
};

export function createApp(dependencies: AppDependencies): Express {
  const app = express();
  const context = {
    projects: dependencies.projects,
    settings: dependencies.settings,
    index: dependencies.index ?? new IndexService(),
    navigation: dependencies.navigation ?? new NavigationService(),
  };
  app.disable("x-powered-by");
  app.get("/api/health", (_request, response) => {
    response.json({ status: "ready", name: "CR", version: "0.1.0" });
  });
  if (dependencies.webRoot) {
    app.use(express.static(dependencies.webRoot, { index: "index.html" }));
  }
  app.post(
    "/api/lifecycle/pages/:id/close",
    express.json({ limit: "1kb" }),
    (request, response) => {
      if (request.get("Origin") !== dependencies.allowedOrigin()) {
        throw new AppError("UNTRUSTED_ORIGIN", "The request Origin is not trusted.", 403);
      }
      const supplied = typeof request.body?.token === "string" ? request.body.token : "";
      const expected = Buffer.from(dependencies.token);
      const actual = Buffer.from(supplied);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        throw new AppError("UNAUTHORIZED", "A valid CR session token is required.", 401);
      }
      dependencies.heartbeat?.close(request.params.id);
      response.status(204).end();
    },
  );
  app.use(express.json({ limit: "64kb" }));
  app.use("/api", requireSession(dependencies));
  app.use("/api/projects", projectRoutes(context));
  app.use("/api/project", fileRoutes(context));
  app.use("/api/files", fileRoutes(context));
  app.use("/api/navigation", navigationRoutes(context));
  app.use("/api/controllers", controllerRoutes(context));
  app.use("/api/enums", enumRoutes(context));
  app.use("/api/index/status", indexStatusRoutes(context));
  app.post("/api/lifecycle/heartbeat", (request, response) => {
    const pageId = typeof request.body?.pageId === "string" ? request.body.pageId : "";
    if (!pageId || pageId.length > 128) {
      throw new AppError("INVALID_PAGE_ID", "A valid page id is required.", 400);
    }
    dependencies.heartbeat?.beat(pageId);
    response.status(204).end();
  });
  app.use(((error, _request, response, _next) => {
    if (error instanceof ZodError) {
      response.status(400).json({
        error: { code: "INVALID_REQUEST", message: error.issues[0]?.message ?? "Invalid request." },
      });
      return;
    }
    if (error instanceof AppError) {
      response.status(error.status).json({
        error: { code: error.code, message: error.message },
      });
      return;
    }
    response.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Unexpected local service error." },
    });
  }) satisfies ErrorRequestHandler);
  return app;
}
