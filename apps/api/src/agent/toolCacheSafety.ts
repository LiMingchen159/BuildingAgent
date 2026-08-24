import { existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { repoRootForProject } from "./knowledgeBase.js";

function pathIsWithin(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === ""
    || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

export function safeToolCacheRoot(projectId: string): string {
  const cacheRoot = path.resolve(repoRootForProject(projectId), "outputs", ".tool_cache");
  if (!existsSync(cacheRoot)) {
    mkdirSync(cacheRoot, { recursive: true });
  }
  const info = lstatSync(cacheRoot);
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(cacheRoot) !== cacheRoot) {
    throw new Error("tool_cache_unsafe_root");
  }
  return cacheRoot;
}

export function safeToolCacheFilePath(projectId: string, relativePath: string): string {
  const repoRoot = repoRootForProject(projectId);
  const cacheRoot = safeToolCacheRoot(projectId);
  const absolutePath = path.resolve(repoRoot, relativePath);
  if (!pathIsWithin(cacheRoot, absolutePath)) {
    throw new Error("tool_cache_unsafe_path");
  }
  if (existsSync(absolutePath)) {
    const info = lstatSync(absolutePath);
    if (!info.isFile() || info.isSymbolicLink() || !pathIsWithin(cacheRoot, realpathSync(absolutePath))) {
      throw new Error("tool_cache_unsafe_path");
    }
  }
  return absolutePath;
}
