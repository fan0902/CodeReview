import { Router } from "express";
import type { RouteContext } from "./context.js";
import { currentProject } from "./context.js";

export function controllerRoutes(context: RouteContext): Router {
  const router = Router();
  router.get("/", (request, response) => {
    currentProject(context);
    const query = String(request.query.q ?? "").toLocaleLowerCase();
    const method = String(request.query.method ?? "").toUpperCase();
    response.json(
      context.index.controllers().filter(
        (endpoint) =>
          (!method || endpoint.method === method) &&
          (!query ||
            endpoint.path.toLocaleLowerCase().includes(query) ||
            endpoint.name.toLocaleLowerCase().includes(query)),
      ),
    );
  });
  return router;
}
