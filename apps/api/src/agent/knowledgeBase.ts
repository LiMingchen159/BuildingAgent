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
const MAX_DOCUMENTS = 500;
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

/** Catalog index — route here before blind KB exploration when present. */
export const KB_CATALOG_SUMMARY_NAME = "KB_CATALOG_SUMMARY.md";

/** BMS ops guide — use after Summary routing for fetch/API questions. */
export const KB_BMS_GUIDE_NAME = "bms_guide.md";

const KB_PROMPT_PINNED = [KB_CATALOG_SUMMARY_NAME, KB_BMS_GUIDE_NAME] as const;

function kbPromptRank(document: KnowledgeBaseDocument): number {
  const base = path.basename(document.path);
  const pinnedIndex = KB_PROMPT_PINNED.indexOf(base as (typeof KB_PROMPT_PINNED)[number]);
  if (pinnedIndex >= 0) {
    return pinnedIndex;
  }
  if (document.kind === "markdown" || document.kind === "turtle") {
    return KB_PROMPT_PINNED.length;
  }
  if (document.kind === "data" || document.kind === "text") {
    return KB_PROMPT_PINNED.length + 1;
  }
  return KB_PROMPT_PINNED.length + 2;
}

export function sortKnowledgeBaseForPrompt(documents: KnowledgeBaseDocument[]): KnowledgeBaseDocument[] {
  return [...documents].sort((left, right) => {
    const rankDiff = kbPromptRank(left) - kbPromptRank(right);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return left.path.localeCompare(right.path);
  });
}

export function hasKbCatalogSummary(documents: KnowledgeBaseDocument[]): boolean {
  return documents.some((document) => path.basename(document.path) === KB_CATALOG_SUMMARY_NAME);
}

export function kbCatalogRoutingBlock(documents: KnowledgeBaseDocument[]): string {
  if (!hasKbCatalogSummary(documents)) {
    return "";
  }

  const bmsGuide = documents.some((document) => path.basename(document.path) === KB_BMS_GUIDE_NAME);

  return [
    "KB ROUTING (catalog for naming/inventory — not for live values):",
    `- This project has \`${KB_CATALOG_SUMMARY_NAME}\` — use \`read_file\` for point names, inventories, manuals, Brick types, and task routing (§1 overview, §5 routing).`,
    "- **Values / trends / history / relative time** (yesterday, today, 昨天, 今天, metrics, show data) → call data tools first; do NOT `read_file` KB as a prefetch step.",
    "- Point names, Brick types, equipment inventory, manuals → Summary §2 and related KB sections via `read_file`.",
    "- Do NOT call data-query tools once per device to build inventories when Summary exists.",
    "- Current/historical **numeric values** → use project data tools (timeseries, points, live read per Available skills); KB catalog is for naming only.",
    bmsGuide
      ? "- `bms_guide.md` is API/ops detail — read only if tools fail; do not read it before trying data tools."
      : "- Use project data tools first; KB only to resolve point names or manuals.",
    "- PDF manuals / drawings → Summary §4 to pick the folder and filename.",
    "- Do not inject the full Summary into answers; read the sections you need via `read_file` offset/limit."
  ].join("\n");
}

const KB_CATALOG_QUESTION_PATTERNS = [
  /what points?/i,
  /which points?/i,
  /point list/i,
  /point catalog/i,
  /point names?/i,
  /equipment inventory/i,
  /brick type/i,
  /有哪些/,
  /有哪些点/,
  /点位清单/,
  /点名/,
  /清单/,
  /手册/,
  /manual/i,
  /catalog/i,
  /inventory/i
];

/** Relative time / trends / metrics — data tools first, not KB prefetch. */
const KB_DATA_QUERY_NEGATIVE_PATTERNS = [
  /\byesterday\b/i,
  /\btoday\b/i,
  /\blast\s+(week|month|day|hour|24h|7\s*days?)\b/i,
  /昨天/,
  /今天/,
  /昨日/,
  /趋势/,
  /\btrend/i,
  /\bhistory\b/i,
  /\bmetrics?\b/i,
  /show\s+data/i,
  /数据/,
  /读数/,
  /当前值/,
  /历史/
];

export function shouldPrefetchKbCatalog(userMessage: string): boolean {
  const trimmed = userMessage.trim();
  if (!trimmed) {
    return false;
  }
  if (KB_DATA_QUERY_NEGATIVE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return false;
  }
  return KB_CATALOG_QUESTION_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function kbCatalogPrefetchHintBlock(
  userMessage: string,
  documents: KnowledgeBaseDocument[]
): string {
  if (!hasKbCatalogSummary(documents) || !shouldPrefetchKbCatalog(userMessage)) {
    return "";
  }

  return [
    "KB CATALOG HINT: The user is asking about point names, inventories, manuals, or equipment lists.",
    `Read \`${KB_CATALOG_SUMMARY_NAME}\` via read_file (§1 overview, §2 for point tables, §5 task routing).`,
    "Do not run data-query tools across all devices to assemble inventories — use Summary §2 instead.",
    "If they also need current/historical **values**, call data tools directly; do not read KB first for numeric/trend questions."
  ].join(" ");
}

export function knowledgeBasePrompt(documents: KnowledgeBaseDocument[], limit = 5): string {
  if (documents.length === 0 || limit <= 0) {
    return "Knowledge Base files: none discovered.";
  }

  const ordered = sortKnowledgeBaseForPrompt(documents);

  return [
    "Knowledge Base files discovered for this project (pinned catalog guides first):",
    ...ordered.slice(0, limit).map((document) => {
      const excerpt = document.excerpt ? ` Excerpt: ${document.excerpt}` : "";
      const pin =
        path.basename(document.path) === KB_CATALOG_SUMMARY_NAME
          ? " [catalog index — read §1+§5 first]"
          : path.basename(document.path) === KB_BMS_GUIDE_NAME
            ? " [BMS ops — after Summary for fetch questions]"
            : "";
      return `- ${document.path} (${document.kind}, ${document.sizeBytes} bytes).${pin}${excerpt}`;
    })
  ].join("\n");
}

export function repositoryPrompt(artifacts: RepositoryArtifact[], limit = 8): string {
  if (artifacts.length === 0 || limit <= 0) {
    return "Repository files discovered for this project: none yet.";
  }

  return [
    "Repository files discovered for this project:",
    ...artifacts.slice(0, limit).map((artifact) => {
      const location = artifact.path ?? artifact.name;
      const description = artifact.description ? ` Summary: ${artifact.description}` : "";
      const size = typeof artifact.sizeBytes === "number" ? `${artifact.sizeBytes} bytes` : "size unknown";
      return `- ${location} (${artifact.kind}, ${size}).${description}`;
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

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp"]);

function repoKind(name: string, extension: string): "note" | "analysis" | "summary" | "image" | "chart" | "report" | "table" {
  if (IMAGE_EXTENSIONS.has(extension)) {
    // Heuristic: files in "chart" or "figure" paths, or with chart/figure in name, are charts
    const lower = name.toLowerCase();
    if (lower.includes("chart") || lower.includes("figure") || lower.includes("plot")) return "chart";
    return "image";
  }
  if (extension === ".csv" || extension === ".parquet") return "table";
  if (extension === ".ttl" || extension === ".rdf") return "analysis";
  if (extension === ".json" || extension === ".yaml" || extension === ".yml") return "data" as "analysis";
  if (extension === ".md" || extension === ".markdown") return "note";
  const docKind = documentKind(extension);
  if (docKind === "data") return "table";
  if (docKind === "turtle") return "analysis";
  if (docKind === "markdown") return "note";
  return "note";
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

// --- Data root (project-scoped KB + Repository) ---

export function dataRoot(env: Record<string, string | undefined> = process.env): string {
  const configured = env.BUILDING_AGENT_DATA_DIR?.trim() || env.DATA_DIR?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(PROJECT_ROOT, configured);
  }
  return path.resolve(PROJECT_ROOT, "data");
}

export function kbRootForProject(projectId: string, env: Record<string, string | undefined> = process.env): string {
  const kbPath = path.join(dataRoot(env), projectId, "kb");
  if (!existsSync(kbPath)) {
    try { mkdirSync(kbPath, { recursive: true }); } catch { /* best effort */ }
  }
  return kbPath;
}

export function repoRootForProject(projectId: string, env: Record<string, string | undefined> = process.env): string {
  const repoPath = path.join(dataRoot(env), projectId, "repository");
  if (!existsSync(repoPath)) {
    try { mkdirSync(repoPath, { recursive: true }); } catch { /* best effort */ }
  }
  return repoPath;
}

export async function countFiles(rootDir: string): Promise<number> {
  let count = 0;

  async function visit(dir: string): Promise<void> {
    let children;
    try {
      children = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const child of children) {
      if (child.name.startsWith(".")) continue;
      if (child.isDirectory()) {
        await visit(path.join(dir, child.name));
      } else if (child.isFile()) {
        count += 1;
      }
    }
  }

  if (existsSync(rootDir)) {
    await visit(rootDir);
  }
  return count;
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
        kind: repoKind(child.name, extension),
        sizeBytes: info.size,
        generatedAt: info.mtime.toISOString(),
        ...(excerpt ? { description: excerpt } : {})
      });
    }
  }

  await visit(rootDir);
  return entries;
}
