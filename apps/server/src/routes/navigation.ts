import { Router } from "express";
import { z } from "zod";
import { currentProject, type RouteContext } from "./context.js";

export function navigationRoutes(context: RouteContext): Router {
  const router = Router();
  router.post("/definition", async (request, response) => {
    currentProject(context);
    const input = z
      .object({
        path: z.string().min(1),
        line: z.number().int().positive(),
        column: z.number().int().positive(),
      })
      .parse(request.body);
    response.json(
      await context.navigation.definition(
        input.path,
        input.line,
        input.column,
      ),
    );
  });
  return router;
}
