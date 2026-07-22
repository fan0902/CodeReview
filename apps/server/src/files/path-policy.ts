import { realpath } from "node:fs/promises";
import path from "node:path";
import { appError } from "../errors.js";

export async function resolveInside(root: string, relativePath: string): Promise<string> {
  if (
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/).includes("..")
  ) {
    throw appError("PATH_OUTSIDE_PROJECT");
  }

  const canonicalRoot = await realpath(root);
  let candidate: string;
  try {
    candidate = await realpath(path.join(canonicalRoot, relativePath));
  } catch (error) {
    throw error;
  }

  if (
    candidate !== canonicalRoot &&
    !candidate.startsWith(`${canonicalRoot}${path.sep}`)
  ) {
    throw appError("PATH_OUTSIDE_PROJECT");
  }

  return candidate;
}
