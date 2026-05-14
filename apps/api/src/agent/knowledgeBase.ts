import { existsSync, mkdirSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { KnowledgeBaseDocument, RepositoryArtifact } from "../seed.js";

function resolveKnowledgeBaseDefault(): string {
  const sourceDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(sourceDir, "../../../..");
  const candidates = [
    path.join(projectRoot, "Knowledge Base"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0]!;
}

const DEFAULT_KNOWLEDGE_BASE_DIR = resolveKnowledgeBaseDefault();
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const TEXT_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".ttl", ".rdf", ".csv", ".json", ".yaml", ".yml"]);
const MAX_DOCUMENTS = 80;
const MAX_EXCERPT_BYTES = 600;

export interface KnowledgeBaseIndexOptions {
  rootDir?: string | undefined;
}

export function knowledgeBaseRoot(env: Record<string, string | undefined> = process.env): string {
  const configured = env.BUILDING_AGENT_KNOWLEDGE_BASE_DIR?.trim() || env.KNOWLEDGE_BASE_DIR?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(PROJECT_ROOT, configured);
  }
  return DEFAULT_KNOWLEDGE_BASE_DIR;
}

export async function indexKnowledgeBase(projectId: string, options: KnowledgeBaseIndexOptions = {}): Promise<KnowledgeBaseDocument[]> {
  const rootDir = options.rootDir ?? knowledgeBaseRoot();
  const entries: KnowledgeBaseDocument[] = [];

  async function visit(currentDir: string): Promise<void> {
    if (entries.length >= MAX_DOCUMENTS) {
      return;
    }

    let children;
    try {
      children = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entries.length >= MAX_DOCUMENTS || child.name.startsWith(".")) {
        continue;
      }
      const absolutePath = path.join(currentDir, child.name);
      if (child.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!child.isFile()) {
        continue;
      }

      const info = await stat(absolutePath);
      const relativePath = path.relative(rootDir, absolutePath).split(path.sep).join("/");
      const extension = path.extname(child.name).toLowerCase();
      const excerpt = TEXT_EXTENSIONS.has(extension) ? await readExcerpt(absolutePath) : undefined;
      entries.push({
        id: `kb_${stableId(relativePath)}`,
        projectId,
        name: child.name,
        path: relativePath,
        kind: documentKind(extension),
        sizeBytes: info.size,
        ...(excerpt ? { excerpt } : {})
      });
    }
  }

  await visit(rootDir);
  return entries;
}

export function knowledgeBasePrompt(documents: KnowledgeBaseDocument[]): string {
  if (documents.length === 0) {
    return "Knowledge Base files: none discovered.";
  }

  return [
    "Knowledge Base files discovered for this project:",
    ...documents.slice(0, 5).map((document) => {
      const excerpt = document.excerpt ? ` Excerpt: ${document.excerpt}` : "";
      return `- ${document.path} (${document.kind}, ${document.sizeBytes} bytes).${excerpt}`;
    })
  ].join("\n");
}

async function readExcerpt(filePath: string): Promise<string | undefined> {
  try {
    const buffer = await readFile(filePath);
    return buffer.subarray(0, MAX_EXCERPT_BYTES).toString("utf8").replace(/\s+/gu, " ").trim().slice(0, 200) || undefined;
  } catch {
    return undefined;
  }
}

function documentKind(extension: string): KnowledgeBaseDocument["kind"] {
  if (extension === ".ttl" || extension === ".rdf") return "turtle";
  if (extension === ".md" || extension === ".markdown") return "markdown";
  if (extension === ".parquet") return "parquet";
  if (TEXT_EXTENSIONS.has(extension)) return "text";
  if ([".csv", ".json", ".yaml", ".yml"].includes(extension)) return "data";
  return "other";
}

function stableId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

// --- Repository (model-generated outputs) ---

export function dataRoot(env: Record<string, string | undefined> = process.env): string {
  const kb = knowledgeBaseRoot(env);
  return path.resolve(kb, "..", "data");
}

export function repoRootForProject(projectId: string, env: Record<string, string | undefined> = process.env): string {
  const repoPath = path.join(dataRoot(env), projectId, "repository");
  if (!existsSync(repoPath)) {
    try { mkdirSync(repoPath, { recursive: true }); } catch { /* best effort */ }
  }
  return repoPath;
}

export async function indexRepository(projectId: string, rootDir: string): Promise<RepositoryArtifact[]> {
  const entries: RepositoryArtifact[] = [];

  async function visit(currentDir: string): Promise<void> {
    if (entries.length >= MAX_DOCUMENTS) return;

    let children;
    try {
      children = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entries.length >= MAX_DOCUMENTS || child.name.startsWith(".")) continue;
      const absolutePath = path.join(currentDir, child.name);
      if (child.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!child.isFile()) continue;

      const info = await stat(absolutePath);
      const relativePath = path.relative(rootDir, absolutePath).split(path.sep).join("/");
      const extension = path.extname(child.name).toLowerCase();

      let excerpt: string | undefined;
      if (TEXT_EXTENSIONS.has(extension)) {
        try {
          const buffer = await readFile(absolutePath);
          excerpt = buffer.subarray(0, MAX_EXCERPT_BYTES).toString("utf8").replace(/\s+/gu, " ").trim().slice(0, 200) || undefined;
        } catch {
          // skip unreadable
        }
      }

      entries.push({
        id: `repo_${stableId(relativePath)}`,
        projectId,
        name: child.name,
        path: relativePath,
        kind: documentKind(extension) === "turtle" ? "analysis" : documentKind(extension) === "data" ? "summary" : "note",
        sizeBytes: info.size,
        generatedAt: info.mtime.toISOString(),
        ...(excerpt ? { description: excerpt } : {})
      });
    }
  }

  await visit(rootDir);
  return entries;
}
