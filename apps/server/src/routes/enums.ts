import { Router } from "express";
import { z } from "zod";
import { AppError } from "../errors.js";
import { currentProject, type RouteContext } from "./context.js";

const bookmarkInput = z.object({
  relativePath: z.string().min(1),
  symbolName: z.string().min(1),
  language: z.enum(["python", "typescript"]),
});

export function enumRoutes(context: RouteContext): Router {
  const router = Router();
  router.get("/search", (request, response) => {
    currentProject(context);
    const query = z.string().min(1).parse(request.query.q);
    response.json(context.index.searchEnums(query));
  });
  router.get("/bookmarks", async (_request, response) => {
    const project = currentProject(context);
    const settings = await context.settings.read();
    response.json(
      settings.enumBookmarks
        .filter((bookmark) => bookmark.projectId === project.id)
        .map((bookmark) => {
          const found = context.index.findEnum(bookmark);
          return found
            ? { ...bookmark, state: "ready", members: found.members }
            : {
                ...bookmark,
                state: "missing",
                members: [],
                message: "The enum no longer exists at its saved location.",
              };
        }),
    );
  });
  router.post("/bookmarks", async (request, response) => {
    const project = currentProject(context);
    const input = bookmarkInput.parse(request.body);
    if (!context.index.findEnum(input)) {
      throw new AppError("ENUM_NOT_FOUND", "The selected enum was not found.", 404);
    }
    const settings = await context.settings.read();
    if (
      settings.enumBookmarks.some(
        (bookmark) =>
          bookmark.projectId === project.id &&
          bookmark.relativePath === input.relativePath &&
          bookmark.symbolName === input.symbolName,
      )
    ) {
      throw new AppError("ENUM_ALREADY_SAVED", "The enum is already saved.", 409);
    }
    response.status(201).json(
      await context.settings.addEnumBookmark({
        projectId: project.id,
        ...input,
      }),
    );
  });
  router.delete("/bookmarks/:id", async (request, response) => {
    const project = currentProject(context);
    const settings = await context.settings.read();
    const bookmark = settings.enumBookmarks.find(
      (item) => item.id === request.params.id && item.projectId === project.id,
    );
    if (!bookmark) {
      throw new AppError("ENUM_BOOKMARK_NOT_FOUND", "The enum bookmark was not found.", 404);
    }
    await context.settings.deleteEnumBookmark(bookmark.id);
    response.status(204).end();
  });
  return router;
}
