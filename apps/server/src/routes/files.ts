import { Router } from "express";
import { z } from "zod";
import { FileService } from "../files/file-service.js";
import { currentProject, type RouteContext } from "./context.js";

export function fileRoutes(context: RouteContext): Router {
  const router = Router();
  router.get("/tree", async (_request, response) => {
    response.json(await new FileService(currentProject(context).root).tree());
  });
  router.get("/content", async (request, response) => {
    const { path } = z.object({ path: z.string().min(1) }).parse(request.query);
    response.json(
      await new FileService(currentProject(context).root).readText(path),
    );
  });
  return router;
}
