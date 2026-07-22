import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./client.js";

beforeEach(() => {
  sessionStorage.clear();
  history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

describe("createApiClient", () => {
  it("moves the launch token from the URL to sessionStorage", () => {
    history.replaceState(null, "", "/?token=secret");

    const client = createApiClient(window);

    expect(sessionStorage.getItem("cr.sessionToken")).toBe("secret");
    expect(location.search).toBe("");
    expect(client.headers()).toMatchObject({ Authorization: "Bearer secret" });
  });

  it("normalizes structured API errors", async () => {
    sessionStorage.setItem("cr.sessionToken", "secret");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: "NO_PROJECT", message: "Open a project" },
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(createApiClient(window).getTree()).rejects.toMatchObject({
      code: "NO_PROJECT",
      message: "Open a project",
    });
  });

  it("sends a trusted JSON request when selecting a project", async () => {
    sessionStorage.setItem("cr.sessionToken", "secret");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "p1", name: "sample", root: "/work/sample" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createApiClient(window).selectProject();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/select",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends the source position when resolving a definition", async () => {
    sessionStorage.setItem("cr.sessionToken", "secret");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ path: "target.ts", line: 2, column: 3 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createApiClient(window).definition({ path: "source.ts", line: 4, column: 5 });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/navigation/definition",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ path: "source.ts", line: 4, column: 5 }),
      }),
    );
  });
});
