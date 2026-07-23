import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IndexService } from "./index-service.js";

let root: string;
let service: IndexService;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "cr-index-"));
  service = new IndexService();
});

afterEach(async () => {
  await service.close();
  await rm(root, { recursive: true, force: true });
});

describe("IndexService", () => {
  it("excludes nested worktrees from controller and enum analysis", async () => {
    await writeSource(
      "app/controllers/main_controller.py",
      `
from fastapi import APIRouter
router = APIRouter(prefix="/main")

@router.get("/health")
async def health() -> dict:
    return {}
`,
    );
    await writeSource(
      ".worktrees/branch/app/controllers/branch_controller.py",
      `
from enum import Enum
from fastapi import APIRouter

class WorktreeState(Enum):
    ACTIVE = "active"

router = APIRouter(prefix="/branch")

@router.get("/health")
async def branch_health() -> dict:
    return {}
`,
    );

    service.open(root);
    await vi.waitFor(() => expect(service.status().phase).toBe("ready"));

    expect(service.controllers().map((item) => item.location.path)).toEqual([
      "app/controllers/main_controller.py",
    ]);
    expect(service.enums().map((item) => item.symbolName)).not.toContain(
      "WorktreeState",
    );

    await writeSource(
      ".worktrees/later/app/controllers/later_controller.py",
      `
from fastapi import APIRouter
router = APIRouter(prefix="/later")

@router.get("/health")
async def later_health() -> dict:
    return {}
`,
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(service.controllers().map((item) => item.location.path)).toEqual([
      "app/controllers/main_controller.py",
    ]);
  });
});

async function writeSource(relativePath: string, source: string): Promise<void> {
  const absolutePath = path.join(root, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, source);
}
