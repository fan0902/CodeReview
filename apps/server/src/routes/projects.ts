import { Router } from "express";
import { z } from "zod";
import type { RouteContext } from "./context.js";

export function projectRoutes(context: RouteContext): Router {
  const router = Router();
  router.post("/select", async (_request, response) => {
    const result = await context.projects.select();
    if (!("cancelled" in result)) {
      context.index.open(result.root);
      context.navigation.open(result.root);
    }
    response.json(result);
  });
  router.get("/recent", async (_request, response) => {
    response.json(await context.projects.recentProjects());
  });
  router.post("/open", async (request, response) => {
    const { path } = z.object({ path: z.string().min(1) }).parse(request.body);
    const project = await context.projects.openRecent(path);
    context.index.open(project.root);
    context.navigation.open(project.root);
    response.json(project);
  });
  return router;
}
