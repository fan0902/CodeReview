# CR Local Analysis Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the secure local TypeScript service that opens a project, reads Python/TypeScript files, indexes FastAPI/NestJS controllers and enums, persists enum bookmarks, and resolves definitions.

**Architecture:** A Node.js service owns the selected project root and exposes typed HTTP APIs on loopback only. Pure analysis modules use the TypeScript compiler API and Lezer Python parser; definition navigation is delegated to TypeScript Language Service and an embedded Pyright language server without executing project code.

**Tech Stack:** Node.js 22, TypeScript, Express 5, Zod, TypeScript Compiler API, `@lezer/python`, Pyright, `vscode-jsonrpc`, chokidar, Vitest, Supertest

---

## File map

- `package.json`: workspace scripts and pinned package manager.
- `tsconfig.base.json`: strict shared TypeScript configuration.
- `packages/contracts/src/index.ts`: API and domain types shared with the web client.
- `apps/server/src/app.ts`: Express composition only.
- `apps/server/src/main.ts`: process startup and loopback binding.
- `apps/server/src/security/session.ts`: token and Origin middleware.
- `apps/server/src/platform/directory-picker.ts`: macOS native directory selection.
- `apps/server/src/projects/project-service.ts`: current-project lifecycle.
- `apps/server/src/files/path-policy.ts`: canonical path containment.
- `apps/server/src/files/file-service.ts`: filtered tree and bounded reads.
- `apps/server/src/settings/settings-service.ts`: atomic local JSON persistence.
- `apps/server/src/analysis/typescript-analyzer.ts`: NestJS, TS enum and TS symbol analysis.
- `apps/server/src/analysis/python-analyzer.ts`: FastAPI and Python enum analysis.
- `apps/server/src/analysis/index-service.ts`: cancellable project index and watcher.
- `apps/server/src/navigation/typescript-navigation.ts`: TypeScript definition lookup.
- `apps/server/src/navigation/pyright-client.ts`: minimal Pyright LSP lifecycle and lookup.
- `apps/server/src/routes/*.ts`: one router per API domain.
- `fixtures/mixed-project/`: deterministic FastAPI/NestJS/enum fixture.

### Task 1: Workspace, contracts, and test harness

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/src/index.ts`
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/vitest.config.ts`
- Test: `packages/contracts/src/index.test.ts`

- [ ] **Step 1: Write the failing contracts test**

```ts
import { describe, expect, it } from "vitest";
import { sourceLocationSchema } from "./index.js";

describe("sourceLocationSchema", () => {
  it("rejects an absolute project path", () => {
    expect(() => sourceLocationSchema.parse({ path: "/tmp/a.ts", line: 1, column: 1 })).toThrow();
  });
});
```

- [ ] **Step 2: Create the workspace and verify the test fails**

```json
{
  "name": "cr",
  "private": true,
  "packageManager": "npm@10.9.2",
  "engines": { "node": ">=22" },
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present"
  }
}
```

Run: `npm install -D typescript vitest && npm install -w packages/contracts zod && npm test -w packages/contracts`

Expected: FAIL because `sourceLocationSchema` is not exported.

- [ ] **Step 3: Add strict configuration and shared contracts**

```ts
import { z } from "zod";

export const sourceLocationSchema = z.object({
  path: z.string().min(1).refine((value) => !value.startsWith("/"), "path must be relative"),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
});

export type SourceLocation = z.infer<typeof sourceLocationSchema>;
export type Language = "python" | "typescript";
export type IndexStatus = { phase: "idle" | "scanning" | "ready" | "error"; completed: number; total: number; diagnostics: string[] };
export type ControllerParameter = { name: string; source: "path" | "query" | "header" | "cookie" | "body" | "unknown"; type: string; required: boolean; defaultValue?: string };
export type ControllerEndpoint = { id: string; framework: "fastapi" | "nestjs"; method: string; path: string; name: string; description?: string; parameters: ControllerParameter[]; response: { type: string; statusCode?: number }; location: SourceLocation; diagnostics: string[] };
export type EnumCandidate = { language: Language; symbolName: string; qualifiedName: string; relativePath: string; location: SourceLocation };
export type EnumMember = { name: string; value: string; comment?: string };
export type EnumBookmark = { id: string; projectId: string; relativePath: string; symbolName: string; language: Language; createdAt: string };
export type ResolvedEnumBookmark = EnumBookmark & { state: "ready" | "missing" | "invalid"; members: EnumMember[]; message?: string };
```

Create `tsconfig.base.json` with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `module` and `moduleResolution` set to `NodeNext`, and `target` set to `ES2022`. Add package scripts `test`, `typecheck`, and `build` using Vitest and `tsc`.

- [ ] **Step 4: Run contract tests and typecheck**

Run: `npm test -w packages/contracts && npm run typecheck -w packages/contracts`

Expected: PASS with one test and zero TypeScript errors.

- [ ] **Step 5: Commit the scaffold**

```bash
git add package.json package-lock.json tsconfig.base.json packages apps/server
git commit -m "build: scaffold CR local engine"
```

### Task 2: Canonical path policy and bounded file browsing

**Files:**
- Create: `apps/server/src/files/path-policy.ts`
- Create: `apps/server/src/files/file-service.ts`
- Test: `apps/server/src/files/file-service.test.ts`

- [ ] **Step 1: Write path escape and file-tree tests**

```ts
it("rejects traversal and symlink escape", async () => {
  const root = await fixtureRoot();
  await expect(resolveInside(root, "../secret.txt")).rejects.toMatchObject({ code: "PATH_OUTSIDE_PROJECT" });
  await expect(resolveInside(root, "outside-link/secret.txt")).rejects.toMatchObject({ code: "PATH_OUTSIDE_PROJECT" });
});

it("filters generated folders but keeps declaration files visible", async () => {
  const tree = await new FileService(await fixtureRoot()).tree();
  expect(flatten(tree)).toContain("src/types.d.ts");
  expect(flatten(tree)).not.toContain("node_modules/pkg/index.ts");
});

it("rejects files larger than five MiB", async () => {
  await expect(new FileService(await fixtureRoot()).readText("large.py")).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `npm test -w apps/server -- src/files/file-service.test.ts`

Expected: FAIL because `resolveInside` and `FileService` do not exist.

- [ ] **Step 3: Implement canonical containment and bounded reads**

```ts
const IGNORED = new Set([".git", "node_modules", ".venv", "venv", "dist", "build", "coverage", "__pycache__", ".pytest_cache"]);
const MAX_BYTES = 5 * 1024 * 1024;

export async function resolveInside(root: string, relativePath: string): Promise<string> {
  if (path.isAbsolute(relativePath) || relativePath.split(path.sep).includes("..")) throw appError("PATH_OUTSIDE_PROJECT");
  const canonicalRoot = await fs.realpath(root);
  const candidate = await fs.realpath(path.join(canonicalRoot, relativePath));
  if (candidate !== canonicalRoot && !candidate.startsWith(`${canonicalRoot}${path.sep}`)) throw appError("PATH_OUTSIDE_PROJECT");
  return candidate;
}

export class FileService {
  constructor(private readonly root: string) {}
  async readText(relativePath: string) {
    const absolutePath = await resolveInside(this.root, relativePath);
    const stat = await fs.stat(absolutePath);
    if (stat.size > MAX_BYTES) throw appError("FILE_TOO_LARGE");
    const buffer = await fs.readFile(absolutePath);
    if (buffer.includes(0)) throw appError("BINARY_FILE");
    return { path: relativePath, content: new TextDecoder("utf-8", { fatal: true }).decode(buffer) };
  }
}
```

Implement recursive `tree()` with deterministic directory-first sorting, ignored directories, relative POSIX paths, and nodes `{name,path,type,children?}`.

- [ ] **Step 4: Run focused and full server tests**

Run: `npm test -w apps/server -- src/files/file-service.test.ts && npm run typecheck -w apps/server`

Expected: PASS and zero TypeScript errors.

- [ ] **Step 5: Commit secure file browsing**

```bash
git add apps/server/src/files
git commit -m "feat: add secure project file browsing"
```

### Task 3: Project lifecycle and atomic settings

**Files:**
- Create: `apps/server/src/platform/directory-picker.ts`
- Create: `apps/server/src/projects/project-service.ts`
- Create: `apps/server/src/settings/settings-service.ts`
- Test: `apps/server/src/projects/project-service.test.ts`
- Test: `apps/server/src/settings/settings-service.test.ts`

- [ ] **Step 1: Write lifecycle and persistence tests**

```ts
it("restores only a previously selected project", async () => {
  const settings = await testSettings();
  const projects = new ProjectService(settings);
  await expect(projects.openRecent("/unapproved/path")).rejects.toMatchObject({ code: "PROJECT_NOT_RECENT" });
  await projects.select(fixturePath);
  expect((await projects.openRecent(fixturePath)).root).toBe(await fs.realpath(fixturePath));
});

it("keeps the current project when the native picker is cancelled", async () => {
  picker.select.mockResolvedValue(null);
  const before = projects.current();
  expect(await projects.select()).toEqual({ cancelled: true });
  expect(projects.current()).toEqual(before);
});

it("backs up corrupt JSON before resetting", async () => {
  await fs.writeFile(settingsPath, "{");
  const settings = await SettingsService.load(settingsPath);
  expect(await settings.read()).toEqual({ version: 1, recentProjects: [], enumBookmarks: [] });
  expect(await glob(`${settingsPath}.corrupt-*`)).toHaveLength(1);
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -w apps/server -- src/projects/project-service.test.ts src/settings/settings-service.test.ts`

Expected: FAIL because both services are missing.

- [ ] **Step 3: Implement settings schema and atomic update**

```ts
const settingsSchema = z.object({
  version: z.literal(1),
  recentProjects: z.array(z.object({ path: z.string(), lastOpenedAt: z.string() })).max(12),
  enumBookmarks: z.array(z.object({ id: z.string(), projectId: z.string(), relativePath: z.string(), symbolName: z.string(), language: z.enum(["python", "typescript"]), createdAt: z.string() })),
});

async update(change: (current: Settings) => Settings): Promise<Settings> {
  const next = settingsSchema.parse(change(await this.read()));
  const temporary = `${this.filePath}.${process.pid}.tmp`;
  await fs.mkdir(path.dirname(this.filePath), { recursive: true });
  await fs.writeFile(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
  await fs.rename(temporary, this.filePath);
  return next;
}
```

Implement corrupt-file backup, SHA-256 `projectId(realpath)`, recent-project cap, bookmark add/delete, and current-project ownership in `ProjectService`. The production settings path is `~/Library/Application Support/CR/settings.json`; tests inject a temporary path.

Implement `MacDirectoryPicker` with `execFile("/usr/bin/osascript", ["-e", "POSIX path of (choose folder with prompt \"选择代码工程\")"])`. Treat AppleScript error `-128` as cancellation, trim the returned POSIX path, canonicalize it before storing, and map every other failure to `DIRECTORY_PICKER_FAILED`. The script text is constant and never interpolates user input.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -w apps/server -- src/projects src/settings && npm run typecheck -w apps/server`

Expected: PASS; repeated writes leave valid JSON and no `.tmp` files.

- [ ] **Step 5: Commit project and settings services**

```bash
git add apps/server/src/projects apps/server/src/settings
git commit -m "feat: persist CR project settings"
```

### Task 4: TypeScript analysis for NestJS and enums

**Files:**
- Create: `apps/server/src/analysis/typescript-analyzer.ts`
- Create: `fixtures/mixed-project/nest/src/users.controller.ts`
- Create: `fixtures/mixed-project/nest/src/role.enum.ts`
- Test: `apps/server/src/analysis/typescript-analyzer.test.ts`

- [ ] **Step 1: Add a deterministic NestJS fixture and failing assertions**

```ts
@Controller("users")
export class UsersController {
  @Get(":id")
  @ApiOperation({ summary: "Get user" })
  getUser(@Param("id") id: string, @Query("verbose") verbose = false): Promise<UserDto> { throw new Error(); }
}

export enum Role { Admin = "admin", Viewer = "viewer" }
```

```ts
it("extracts a NestJS endpoint and enum without executing source", () => {
  const result = analyzeTypeScriptProject(fixtureRoot);
  expect(result.controllers[0]).toMatchObject({ framework: "nestjs", method: "GET", path: "/users/:id", name: "Get user", response: { type: "Promise<UserDto>" } });
  expect(result.controllers[0]?.parameters).toEqual([
    expect.objectContaining({ name: "id", source: "path", type: "string", required: true }),
    expect.objectContaining({ name: "verbose", source: "query", type: "boolean", required: false, defaultValue: "false" }),
  ]);
  expect(result.enums[0]?.members).toEqual([{ name: "Admin", value: '"admin"' }, { name: "Viewer", value: '"viewer"' }]);
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -w apps/server -- src/analysis/typescript-analyzer.test.ts`

Expected: FAIL because the analyzer is absent.

- [ ] **Step 3: Implement AST-only TypeScript analysis**

```ts
export function analyzeTypeScriptFile(sourceFile: ts.SourceFile): AnalysisResult {
  const controllers: ControllerEndpoint[] = [];
  const enums: AnalyzedEnum[] = [];
  sourceFile.forEachChild((node) => {
    if (ts.isEnumDeclaration(node)) enums.push(readEnum(node, sourceFile));
    if (ts.isClassDeclaration(node) && decoratorCall(node, "Controller")) {
      controllers.push(...readNestController(node, sourceFile));
    }
  });
  return { controllers, enums, symbols: collectDeclarations(sourceFile) };
}
```

Implement literal decorator argument extraction, path joining, `Get/Post/Put/Patch/Delete/Options/Head`, `ApiOperation`, parameter decorators, required/default semantics, explicit return type, source locations, and a diagnostic containing the original expression whenever a decorator argument is dynamic.

- [ ] **Step 4: Run analyzer tests**

Run: `npm test -w apps/server -- src/analysis/typescript-analyzer.test.ts && npm run typecheck -w apps/server`

Expected: PASS for literal, empty-path, dynamic-path, DTO body, Promise response, enum numeric auto-values, string values, and const enum cases.

- [ ] **Step 5: Commit TypeScript analysis**

```bash
git add apps/server/src/analysis/typescript-analyzer* fixtures/mixed-project/nest
git commit -m "feat: index NestJS controllers and TypeScript enums"
```

### Task 5: Python analysis for FastAPI and enums

**Files:**
- Create: `apps/server/src/analysis/python-analyzer.ts`
- Create: `fixtures/mixed-project/python/app.py`
- Create: `fixtures/mixed-project/python/models.py`
- Test: `apps/server/src/analysis/python-analyzer.test.ts`

- [ ] **Step 1: Add the FastAPI fixture and failing assertions**

```python
router = APIRouter(prefix="/users")

@router.get("/{user_id}", summary="Get user", response_model=UserOut)
def get_user(user_id: int, verbose: bool = Query(False)) -> UserOut:
    raise NotImplementedError

class State(str, Enum):
    ACTIVE = "active"
    DISABLED = "disabled"
```

Assert the endpoint path is `/users/{user_id}`, `user_id` is a required path integer, `verbose` is an optional query boolean, response type is `UserOut`, and enum members preserve literal source values.

- [ ] **Step 2: Verify the tests fail**

Run: `npm install -w apps/server @lezer/python @lezer/common && npm test -w apps/server -- src/analysis/python-analyzer.test.ts`

Expected: FAIL because `analyzePythonFile` is absent.

- [ ] **Step 3: Implement Lezer-based Python analysis**

```ts
export function analyzePythonFile(relativePath: string, source: string): AnalysisResult {
  const tree = pythonLanguage.parser.parse(source);
  const context = collectAssignmentsAndImports(tree, source);
  return {
    controllers: readFastApiRoutes(tree, source, relativePath, context),
    enums: readPythonEnums(tree, source, relativePath, context),
    symbols: collectPythonDeclarations(tree, source, relativePath),
  };
}
```

Implement aliases for `FastAPI`/`APIRouter`, literal router prefixes, route decorators `get/post/put/patch/delete/options/head`, summary/description/response_model, annotations and defaults, FastAPI `Path/Query/Header/Cookie/Body`, return annotation fallback, and `Enum/IntEnum/StrEnum` base matching. Never import or execute the fixture.

- [ ] **Step 4: Run Python analyzer tests**

Run: `npm test -w apps/server -- src/analysis/python-analyzer.test.ts && npm run typecheck -w apps/server`

Expected: PASS for decorators, dynamic values with diagnostics, async functions, multiline signatures, enum aliases, numeric values, comments, and syntax-error isolation.

- [ ] **Step 5: Commit Python analysis**

```bash
git add apps/server/src/analysis/python-analyzer* fixtures/mixed-project/python
git commit -m "feat: index FastAPI controllers and Python enums"
```

### Task 6: Definition navigation adapters

**Files:**
- Create: `apps/server/src/navigation/typescript-navigation.ts`
- Create: `apps/server/src/navigation/pyright-client.ts`
- Test: `apps/server/src/navigation/typescript-navigation.test.ts`
- Test: `apps/server/src/navigation/pyright-client.test.ts`

- [ ] **Step 1: Write cross-file definition tests**

```ts
it("resolves an imported TypeScript symbol", async () => {
  const location = await tsNavigation.definition("nest/src/users.controller.ts", lineOf("UserDto"), columnOf("UserDto"));
  expect(location).toEqual({ path: "nest/src/user.dto.ts", line: 1, column: 14 });
});

it("resolves an imported Python symbol through Pyright", async () => {
  const location = await pyright.definition("python/app.py", lineOf("UserOut"), columnOf("UserOut"));
  expect(location).toEqual({ path: "python/models.py", line: 3, column: 7 });
});
```

- [ ] **Step 2: Install LSP dependencies and verify failure**

Run: `npm install -w apps/server pyright vscode-jsonrpc && npm test -w apps/server -- src/navigation`

Expected: FAIL because both navigation adapters are missing.

- [ ] **Step 3: Implement TypeScript and Pyright adapters**

```ts
export class TypeScriptNavigation {
  definition(relativePath: string, line: number, column: number): SourceLocation | null {
    const fileName = this.absolute(relativePath);
    const source = this.service.getProgram()?.getSourceFile(fileName);
    if (!source) return null;
    const offset = source.getPositionOfLineAndCharacter(line - 1, column - 1);
    const target = this.service.getDefinitionAtPosition(fileName, offset)?.[0];
    return target ? this.toProjectLocation(target.fileName, target.textSpan.start) : null;
  }
}
```

`PyrightClient` must spawn the packaged `pyright-langserver.js --stdio`, send `initialize`, `initialized`, `textDocument/didOpen`, and `textDocument/definition` through `vscode-jsonrpc`, convert file URIs to project-relative one-based locations, return `null` for outside-project definitions, enforce a 5-second request timeout, and terminate on project close.

- [ ] **Step 4: Run navigation tests**

Run: `npm test -w apps/server -- src/navigation && npm run typecheck -w apps/server`

Expected: PASS; missing symbols return `null`, outside-project targets return `null`, and a stopped Pyright process yields error code `LANGUAGE_SERVICE_UNAVAILABLE`.

- [ ] **Step 5: Commit navigation adapters**

```bash
git add apps/server/src/navigation package-lock.json
git commit -m "feat: resolve Python and TypeScript definitions"
```

### Task 7: Index coordinator, secured HTTP APIs, and watcher

**Files:**
- Create: `apps/server/src/analysis/index-service.ts`
- Create: `apps/server/src/security/session.ts`
- Create: `apps/server/src/routes/projects.ts`
- Create: `apps/server/src/routes/files.ts`
- Create: `apps/server/src/routes/navigation.ts`
- Create: `apps/server/src/routes/controllers.ts`
- Create: `apps/server/src/routes/enums.ts`
- Create: `apps/server/src/routes/index-status.ts`
- Create: `apps/server/src/app.ts`
- Create: `apps/server/src/main.ts`
- Test: `apps/server/src/app.test.ts`

- [ ] **Step 1: Write API, auth, bookmark, and refresh tests**

```ts
it("requires the session token and trusted Origin", async () => {
  await request(app).get("/api/project/tree").expect(401);
  await request(app).get("/api/project/tree").set("Authorization", `Bearer ${token}`).set("Origin", "https://evil.example").expect(403);
});

it("persists and deletes an enum bookmark", async () => {
  const created = await api.post("/api/enums/bookmarks").send({ relativePath: "python/app.py", symbolName: "State", language: "python" }).expect(201);
  await api.get("/api/enums/bookmarks").expect(200).expect(({ body }) => expect(body[0].members).toHaveLength(2));
  await api.delete(`/api/enums/bookmarks/${created.body.id}`).expect(204);
  await api.get("/api/enums/bookmarks").expect(200, []);
});
```

Also assert health is unauthenticated, traversal returns 403, picker cancellation preserves the current project, recent-project listing/opening works, opening a project returns before `status.phase` becomes `ready`, controller results contain both frameworks, and a changed fixture file updates the index after the watcher debounce.

- [ ] **Step 2: Install server dependencies and verify failure**

Run: `npm install -w apps/server express chokidar zod && npm install -D -w apps/server supertest @types/express @types/supertest tsx && npm test -w apps/server -- src/app.test.ts`

Expected: FAIL because `createApp` is missing.

- [ ] **Step 3: Implement cancellable indexing and API composition**

```ts
export class IndexService {
  async open(root: string): Promise<void> {
    this.generation += 1;
    const generation = this.generation;
    this.status = { phase: "scanning", completed: 0, total: 0, diagnostics: [] };
    const files = await discoverSourceFiles(root);
    this.status.total = files.length;
    for (const file of files) {
      if (generation !== this.generation) return;
      await this.indexOne(file);
      this.status.completed += 1;
    }
    if (generation === this.generation) this.status.phase = "ready";
  }
}
```

Compose all routes from injected services. `POST /api/projects/select` invokes `MacDirectoryPicker`; `GET /api/projects/recent` lists settings entries and `POST /api/projects/open` accepts only one of those canonical paths. Validate query/body data with Zod, map domain errors to stable JSON `{error:{code,message}}`, bind only `127.0.0.1`, accept `Authorization: Bearer <token>`, allow only the exact local app Origin, and expose `/api/health` without credentials. Enum search is case-insensitive substring matching; bookmark creation validates that the selected enum currently exists.

- [ ] **Step 4: Run full local-engine verification**

Run: `npm test -w packages/contracts && npm test -w apps/server && npm run typecheck && npm run build`

Expected: all tests PASS, both workspaces typecheck, and build emits `apps/server/dist/main.js`.

- [ ] **Step 5: Commit the working local engine**

```bash
git add apps/server packages/contracts fixtures package.json package-lock.json
git commit -m "feat: expose CR local analysis APIs"
```

## Plan 1 completion gate

Run:

```bash
npm test -w apps/server
npm run typecheck
node apps/server/dist/main.js --host 127.0.0.1 --port 0 --token test-token
```

Expected: tests and typecheck pass; startup prints one JSON line containing a loopback URL, selected port, PID, and health status. Stop the process after requesting `/api/health`. Continue with `2026-07-22-cr-browser-ui.md` only after this gate passes.
