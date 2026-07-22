export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ProjectSummary = { id: string; name: string; root: string };
export type RecentProject = {
  path: string;
  name: string;
  lastOpenedAt: string;
};
export type FileTreeNode = {
  name: string;
  path: string;
  type: "directory" | "file";
  children?: FileTreeNode[];
};
export type TextFile = { path: string; content: string };
export type ControllerEndpoint = import("@cr/contracts").ControllerEndpoint;
export type EnumCandidate = import("@cr/contracts").EnumCandidate;
export type EnumBookmark = import("@cr/contracts").EnumBookmark;
export type ResolvedEnumBookmark = import("@cr/contracts").ResolvedEnumBookmark;
export type EnumBookmarkInput = Pick<
  EnumBookmark,
  "relativePath" | "symbolName" | "language"
>;

type BrowserEnvironment = Pick<
  Window,
  "location" | "history" | "sessionStorage"
>;

export function createApiClient(browser: BrowserEnvironment = window) {
  const parameters = new URLSearchParams(browser.location.search);
  const launchToken = parameters.get("token");
  if (launchToken) {
    browser.sessionStorage.setItem("cr.sessionToken", launchToken);
    browser.history.replaceState(
      null,
      "",
      `${browser.location.pathname}${browser.location.hash}`,
    );
  }

  const headers = (): Record<string, string> => {
    const token = browser.sessionStorage.getItem("cr.sessionToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...headers(),
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    if (!response.ok) {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string };
      };
      throw new ApiError(
        body.error?.code ?? "HTTP_ERROR",
        body.error?.message ?? `Request failed with status ${response.status}.`,
        response.status,
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  return {
    headers,
    getTree: () => request<FileTreeNode[]>("/api/project/tree"),
    getFile: (path: string) =>
      request<TextFile>(`/api/files/content?${new URLSearchParams({ path })}`),
    definition: (location: import("@cr/contracts").SourceLocation) =>
      request<import("@cr/contracts").SourceLocation | null>(
        "/api/navigation/definition",
        {
          method: "POST",
          body: JSON.stringify(location),
        },
      ),
    getControllers: () =>
      request<ControllerEndpoint[]>("/api/controllers"),
    searchEnums: (query: string) =>
      request<EnumCandidate[]>(
        `/api/enums/search?${new URLSearchParams({ q: query })}`,
      ),
    getEnumBookmarks: () =>
      request<ResolvedEnumBookmark[]>("/api/enums/bookmarks"),
    addEnumBookmark: (input: EnumBookmarkInput) =>
      request<EnumBookmark>("/api/enums/bookmarks", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    deleteEnumBookmark: (id: string) =>
      request<void>(`/api/enums/bookmarks/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    heartbeat: (pageId: string) =>
      request<void>("/api/lifecycle/heartbeat", {
        method: "POST",
        body: JSON.stringify({ pageId }),
      }),
    closePage: (pageId: string) => {
      const token = browser.sessionStorage.getItem("cr.sessionToken") ?? "";
      return navigator.sendBeacon(
        `/api/lifecycle/pages/${encodeURIComponent(pageId)}/close`,
        new Blob([JSON.stringify({ token })], { type: "application/json" }),
      );
    },
    selectProject: () =>
      request<ProjectSummary | { cancelled: true }>("/api/projects/select", {
        method: "POST",
      }),
    recentProjects: () => request<RecentProject[]>("/api/projects/recent"),
    openRecent: (path: string) =>
      request<ProjectSummary>("/api/projects/open", {
        method: "POST",
        body: JSON.stringify({ path }),
      }),
    indexStatus: () =>
      request<import("@cr/contracts").IndexStatus>("/api/index/status"),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
