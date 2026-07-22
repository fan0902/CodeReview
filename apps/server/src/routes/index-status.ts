import { Router } from "express";
import { currentProject, type RouteContext } from "./context.js";

export function indexStatusRoutes(context: RouteContext): Router {
  const router = Router();
  router.get("/", (_request, response) => {
    currentProject(context);
    response.json(context.index.status());
  });
  return router;
}
