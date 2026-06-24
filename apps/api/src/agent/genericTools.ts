import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, unlink, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import type { AgentMemoryStore, MemoryAction, MemoryTarget } from "./memory.js";
import type { SessionSearchIndex } from "../sessionIndex.js";
import {
  looksExecutableMemoryContent,
  type ProjectMemoryProposalBindings
} from "../projectMemoryProposals.js";
import { kbRootForProject, repoRootForProject } from "./knowledgeBase.js";
import { toolCacheManifestRelativePath } from "./toolCacheManifest.js";
import type { ProjectSkillBindings } from "../projectSkills.js";
import type { ProjectGroundingBindings } from "../projectGrounding.js";
import { boundsViolationResult } from "../platformBounds.js";
import { stringArrayArg, type ProjectFeedbackBindings } from "../projectFeedback.js";
import { hasSiteRuleSaveConsent } from "./siteRuleConsent.js";
import type { ChatMessage } from "../seed.js";
import type { AgentSkillRegistry } from "./skills.js";
import { AgentToolRegistry } from "./tools.js";
import type { AgentTool } from "./types.js";
import type { SchedulerService, ScheduledJob, JobRecurrence } from "../scheduler.js";
import { parseCancelCommand, parseListCommand, parseTimeExpression, nextCronTime } from "../scheduler.js";
import type { ProcessRegistry } from "./processRegistry.js";
import { chartSanityViolation, executeCodeInjectedHeader } from "./chartStyle.js";
import { augmentToolResultForEnvironment } from "./environmentSetup.js";
import { fetchEnteliLiveValue } from "./bmsLiveRead.js";
import { bmsCollectorBaseUrl } from "../bmsCollectorUrl.js";
import { fetchTimeseries } from "../bmsTimeseries.js";
import { dashboardPath, parseDashboardMutationInput } from "../dashboards.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const MAX_READ_BYTES = 200_000;
const MAX_WRITE_BYTES = 500_000;
const TERMINAL_TIMEOUT_MS = 30_000;
const TERMINAL_MAX_OUTPUT = 100_000;

const TEXT_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".ttl", ".rdf", ".csv", ".json", ".yaml", ".yml", ".xml", ".html", ".htm", ".css", ".js", ".ts", ".tsx", ".jsx", ".py", ".go", ".rs", ".java", ".c", ".h", ".cpp", ".hpp", ".sh", ".bash", ".zsh", ".sql", ".graphql", ".proto", ".toml", ".ini", ".cfg", ".conf", ".env", ".log"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp"]);

function lastUserMessageContent(messages: ChatMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") {
      return message.content ?? "";
    }
  }
  return "";
}

function textArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

function numArg(args: Record<string, unknown>, key: string, fallback: number): number {
  const value = args[key];
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  return fallback;
}

function resolveSafePath(baseRoot: string, requested: string): string | null {
  const resolved = path.resolve(baseRoot, requested);
  const normalized = path.normalize(resolved);
  if (!normalized.startsWith(baseRoot + path.sep) && normalized !== baseRoot) {
    return null;
  }
  return normalized;
}

function pythonExecutable(): string {
  const configured = process.env.PYTHON?.trim();
  if (configured) {
    return configured;
  }
  return process.platform === "win32" ? "python" : "python3";
}

function projectFileRoots(projectId: string): { kbRoot: string; repoRoot: string } {
  return {
    kbRoot: kbRootForProject(projectId),
    repoRoot: repoRootForProject(projectId)
  };
}

type ScopedRoot = "kb" | "repo";

interface ResolvedProjectPath {
  root: ScopedRoot;
  relativePath: string;
  absolutePath: string;
}

function normalizeRelativePath(requested: string): string {
  return requested.replace(/\\/g, "/").replace(/^\/+/, "");
}

function parseScopedPath(requested: string): { scope: ScopedRoot | null; relativePath: string } {
  const trimmed = requested.trim();
  if (/^kb:\//i.test(trimmed)) {
    return { scope: "kb", relativePath: normalizeRelativePath(trimmed.replace(/^kb:\//i, "")) };
  }
  if (/^repo:\//i.test(trimmed)) {
    return { scope: "repo", relativePath: normalizeRelativePath(trimmed.replace(/^repo:\//i, "")) };
  }
  return { scope: null, relativePath: normalizeRelativePath(trimmed) };
}

function formatScopedPath(root: ScopedRoot, relativePath: string): string {
  return `${root}:/${relativePath}`;
}

function resolveReadPath(projectId: string, requested: string): ResolvedProjectPath | null {
  const { kbRoot, repoRoot } = projectFileRoots(projectId);
  const parsed = parseScopedPath(requested);
  const candidates: Array<{ root: ScopedRoot; base: string }> =
    parsed.scope === "kb" ? [{ root: "kb", base: kbRoot }]
      : parsed.scope === "repo" ? [{ root: "repo", base: repoRoot }]
        : [{ root: "kb", base: kbRoot }, { root: "repo", base: repoRoot }];

  for (const candidate of candidates) {
    if (!existsSync(candidate.base)) continue;
    const safe = resolveSafePath(candidate.base, parsed.relativePath);
    if (safe && existsSync(safe)) {
      return {
        root: candidate.root,
        relativePath: parsed.relativePath,
        absolutePath: safe
      };
    }
  }
  return null;
}

function resolveRepoWritePath(projectId: string, requested: string): ResolvedProjectPath | null {
  const { repoRoot } = projectFileRoots(projectId);
  const parsed = parseScopedPath(requested);
  if (parsed.scope === "kb") {
    return null;
  }
  const safe = resolveSafePath(repoRoot, parsed.relativePath);
  if (!safe) {
    return null;
  }
  return {
    root: "repo",
    relativePath: parsed.relativePath,
    absolutePath: safe
  };
}

function terminalCommandGuard(command: string): { error: string } | null {
  const normalized = command.replace(/\r\n/g, "\n");
  if (/python\s+-\s+<<['"]?PY['"]?/i.test(normalized)) {
    return {
      error: "Bash heredoc syntax (`python - <<'PY'`) is not supported in this Windows PowerShell environment. Use the execute_code tool for Python snippets, or run Python with a real script file."
    };
  }
  if (/\/mnt\/data|\/workspace|\/app/.test(normalized)) {
    return {
      error: "This command is probing Linux/container paths (`/mnt/data`, `/workspace`, `/app`) that do not match this local project runtime. Use `os.environ['KB_DIR']` for source data and `os.environ['OUTPUT_DIR']` for generated outputs."
    };
  }
  return null;
}

function collectGeneratedImages(outputFiles: Array<{ path: string; name: string; sizeBytes: number }>, source: string): Array<Record<string, string>> {
  return outputFiles
    .filter((file) => IMAGE_EXTENSIONS.has(path.extname(file.name).toLowerCase()))
    .map((file) => ({
      src: file.path,
      alt: path.parse(file.name).name,
      filename: file.name,
      capturedAt: new Date().toISOString(),
      source
    }));
}

async function syncAndListOutputFiles(outputDir: string, kbRoot: string): Promise<{ files: Array<{ path: string; name: string; sizeBytes: number; modifiedAtMs: number }>; synced: string[] }> {
  // 1. Ensure outputs/ exists
  await mkdir(outputDir, { recursive: true });

  // 2. Migrate any files wrongly written to kb/outputs/ → repository/outputs/
  const synced: string[] = [];
  const kbOutputsDir = path.join(kbRoot, "outputs");
  try {
    const kbFiles = await readdir(kbOutputsDir, { withFileTypes: true });
    for (const c of kbFiles) {
      if (!c.isFile()) continue;
      const src = path.join(kbOutputsDir, c.name);
      const dst = path.join(outputDir, c.name);
      try {
        await copyFile(src, dst);
        synced.push(c.name);
      } catch { /* skip */ }
    }
  } catch { /* kb/outputs may not exist */ }

  // 3. List all files now in repository/outputs/
  const files: Array<{ path: string; name: string; sizeBytes: number; modifiedAtMs: number }> = [];
  try {
    const children = await readdir(outputDir, { withFileTypes: true });
    for (const c of children) {
      if (!c.isFile()) continue;
      try {
        const info = await stat(path.join(outputDir, c.name));
        files.push({ path: `outputs/${c.name}`, name: c.name, sizeBytes: info.size, modifiedAtMs: info.mtimeMs });
      } catch { /* skip */ }
    }
  } catch { /* output dir may not exist */ }

  return { files, synced };
}

function collectFreshGeneratedImages(
  outputFiles: Array<{ path: string; name: string; sizeBytes: number; modifiedAtMs: number }>,
  source: string,
  startedAtMs: number
): Array<Record<string, string>> {
  return collectGeneratedImages(
    outputFiles.filter((file) => file.modifiedAtMs >= startedAtMs - 1000),
    source
  );
}

function collectFreshGeneratedDownloads(
  outputFiles: Array<{ path: string; name: string; sizeBytes: number; modifiedAtMs: number }>,
  startedAtMs: number
): Array<{ path: string; filename: string }> {
  return outputFiles
    .filter((file) => file.modifiedAtMs >= startedAtMs - 1000)
    .filter((file) => !IMAGE_EXTENSIONS.has(path.extname(file.name).toLowerCase()))
    .map((file) => ({ path: file.path, filename: file.name }));
}

function appendGeneratedOutputHints(
  base: string,
  generatedImages: Array<Record<string, string>>,
  downloadLinks: Array<{ path: string; filename: string }>,
  synced: string[]
): string {
  if (generatedImages.length === 0 && downloadLinks.length === 0) {
    return base;
  }
  let augmented = `${base}\n\n=== OUTPUT FILES (copy these EXACT lines into your answer — do not edit paths or labels) ===`;
  if (generatedImages.length > 0) {
    augmented += `\n${generatedImages.map((file) => `![${file.filename}](${file.src})`).join("\n")}`;
  }
  if (downloadLinks.length > 0) {
    augmented += `\n${downloadLinks.map((file) => `[${file.filename}](${file.path})`).join("\n")}`;
  }
  if (synced.length > 0) {
    augmented += `\n(synced from kb/outputs/: ${synced.join(", ")})\nWARNING: writing to kb/outputs is invalid; files were copied into repository/outputs for compatibility.`;
  }
  return augmented;
}

const MEMORY_ACTIONS = new Set<MemoryAction>(["add", "replace", "remove", "read", "clear"]);
const MEMORY_TARGETS = new Set<MemoryTarget>(["user", "project"]);

export function createGenericToolRegistry(
  memory: AgentMemoryStore,
  scheduler?: SchedulerService,
  processRegistry?: ProcessRegistry,
  skills?: AgentSkillRegistry,
  projectSkillBindings?: ProjectSkillBindings,
  projectGroundingBindings?: ProjectGroundingBindings,
  projectFeedbackBindings?: ProjectFeedbackBindings,
  sessionIndex?: SessionSearchIndex,
  projectMemoryProposalBindings?: ProjectMemoryProposalBindings
): AgentToolRegistry {
  const registry = new AgentToolRegistry();
  const tools: AgentTool[] = [
    {
      name: "memory",
      category: "memory",
      description: "Manage curated memory banks: user preferences (target=user) or declarative project facts (target=project, configure only).",
      schema: {
        name: "memory",
        description:
          "Curated memory tool. action: add|replace|remove|read|clear. target: user|project. Project writes require project:configure.",
        parameters: {
          type: "object",
          properties: {
            action: { type: "string", description: "add, replace, remove, read, or clear." },
            target: { type: "string", description: "user (preferences) or project (declarative site facts)." },
            content: { type: "string", description: "Text for add/replace." },
            match: { type: "string", description: "Substring to match for replace/remove." }
          },
          required: ["action", "target"]
        }
      },
      async run(args, context) {
        const action = textArg(args, "action") as MemoryAction;
        const target = textArg(args, "target") as MemoryTarget;
        if (!MEMORY_ACTIONS.has(action)) {
          return { error: `Invalid action: ${action}` };
        }
        if (!MEMORY_TARGETS.has(target)) {
          return { error: `Invalid target: ${target}` };
        }
        const result = memory.runAction(
          context.projectId,
          context.userId,
          context.conversationId,
          action,
          target,
          {
            content: textArg(args, "content"),
            match: textArg(args, "match"),
            canConfigure: context.canConfigure
          }
        );
        return { ...result };
      }
    },
    {
      name: "memory_remember",
      category: "memory",
      description: "Shortcut: save a user preference to the user memory bank (alias for memory add/user).",
      schema: {
        name: "memory_remember",
        description: "Save a user preference to the user memory bank.",
        parameters: {
          type: "object",
          properties: { content: { type: "string", description: "Memory text to save." } },
          required: ["content"]
        }
      },
      async run(args, context) {
        const content = textArg(args, "content");
        if (!content) {
          return { error: "content is required" };
        }
        const result = memory.runAction(context.projectId, context.userId, context.conversationId, "add", "user", {
          content
        });
        return { memory: result };
      }
    },
    {
      name: "memory_search",
      category: "memory",
      description: "Search memories saved for the current project and user.",
      schema: {
        name: "memory_search",
        description: "Search memories saved for the current project and user.",
        parameters: {
          type: "object",
          properties: { query: { type: "string", description: "Search text." } },
          required: ["query"]
        }
      },
      async run(args, context) {
        return { memories: memory.search(context.projectId, context.userId, textArg(args, "query")) };
      }
    },
    ...(projectMemoryProposalBindings
      ? [
          {
            name: "memory_propose",
            category: "memory" as const,
            description:
              "Propose a declarative memory entry for user approval. Does not write until user confirms. Route executable rules to feedback_propose.",
            schema: {
              name: "memory_propose",
              description: "Propose memory for user confirmation. target: user|project.",
              parameters: {
                type: "object",
                properties: {
                  target: { type: "string", description: "user or project." },
                  content: { type: "string", description: "Declarative memory text." },
                  reason: { type: "string", description: "Why this should be saved." }
                },
                required: ["target", "content", "reason"]
              }
            },
            async run(args, context) {
              const target = textArg(args, "target") as MemoryTarget;
              const content = textArg(args, "content");
              const reason = textArg(args, "reason");
              if (!MEMORY_TARGETS.has(target)) {
                return { error: `Invalid target: ${target}` };
              }
              if (!content || !reason) {
                return { error: "content and reason are required" };
              }
              if (looksExecutableMemoryContent(content)) {
                return {
                  error: "executable_content",
                  message: "This looks executable. Use feedback_propose instead of memory_propose."
                };
              }
              if (target === "project" && !context.canConfigure) {
                return boundsViolationResult("Project memory proposals require project:configure.");
              }
              const proposal = projectMemoryProposalBindings.propose(
                context.projectId,
                context.conversationId,
                context.userId,
                target,
                content,
                reason
              );
              return { proposal, message: "Ask the user to confirm with save memory: yes before writing." };
            }
          } satisfies AgentTool,
          {
            name: "memory_commit_proposal",
            category: "memory" as const,
            description: "Commit the latest proposed memory (or a specific proposal_id) after user approval.",
            schema: {
              name: "memory_commit_proposal",
              description: "Commit a pending memory proposal into the curated bank.",
              parameters: {
                type: "object",
                properties: {
                  proposal_id: { type: "string", description: "Optional proposal id; defaults to latest in conversation." }
                }
              }
            },
            async run(args, context) {
              const proposalId = textArg(args, "proposal_id");
              const pending = proposalId
                ? projectMemoryProposalBindings
                    .list(context.projectId, context.userId)
                    .find((entry) => entry.id === proposalId && entry.status === "proposed")
                : projectMemoryProposalBindings.findLatestProposed(
                    context.projectId,
                    context.conversationId,
                    context.userId
                  );
              if (!pending) {
                return { error: "No pending memory proposal found." };
              }
              if (pending.target === "project" && !context.canConfigure) {
                return boundsViolationResult("Project memory writes require project:configure.");
              }
              const writeResult = memory.runAction(
                context.projectId,
                context.userId,
                context.conversationId,
                "add",
                pending.target,
                { content: pending.content, canConfigure: context.canConfigure }
              );
              if (!writeResult.success) {
                return { error: writeResult.error ?? "Failed to write memory." };
              }
              projectMemoryProposalBindings.commit(pending.id, context.projectId);
              return { proposal: pending, memory: writeResult };
            }
          } satisfies AgentTool
        ]
      : []),
    {
      name: "session_summary",
      category: "session",
      description: "Return a compact summary of the current chat session.",
      schema: {
        name: "session_summary",
        description: "Return a compact summary of the current chat session.",
        parameters: { type: "object", properties: {} }
      },
      async run(_args, context) {
        return {
          projectId: context.projectId,
          userId: context.userId,
          messageCount: context.messages.length,
          lastRole: context.messages.at(-1)?.role ?? null
        };
      }
    },
    {
      name: "session_reset",
      category: "session",
      description: "Clear conversation context only; user and project memory banks persist.",
      schema: {
        name: "session_reset",
        description: "Clear conversation context only; user and project memory banks persist.",
        parameters: { type: "object", properties: {} }
      },
      async run() {
        return {
          clearedMemories: 0,
          note: "User/project memory banks unchanged. Use memory(action=clear) to clear a bank explicitly."
        };
      }
    },
    ...(sessionIndex
      ? [
          {
            name: "session_search",
            category: "memory" as const,
            description: "Search past conversation transcripts (discovery), browse recent threads, or scroll around a message.",
            schema: {
              name: "session_search",
              description:
                "Recall past conversations. Modes: discovery (query), browse (no query), scroll (conversation_id + optional around_message_id).",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string", description: "FTS query for discovery mode." },
                  limit: { type: "number", description: "Max results (default 8)." },
                  conversation_id: { type: "string", description: "Conversation id for scroll mode." },
                  around_message_id: { type: "string", description: "Anchor message for scroll mode." },
                  window: { type: "number", description: "Messages before/after anchor (default 4)." }
                }
              }
            },
            async run(args, context) {
              const query = textArg(args, "query");
              const conversationId = textArg(args, "conversation_id");
              const limit = numArg(args, "limit", 8);
              const window = numArg(args, "window", 4);
              const aroundMessageId = textArg(args, "around_message_id") || undefined;

              if (conversationId) {
                return {
                  mode: "scroll",
                  messages: sessionIndex.scroll(
                    context.projectId,
                    conversationId,
                    aroundMessageId,
                    window
                  )
                };
              }
              if (query) {
                return {
                  mode: "discovery",
                  hits: sessionIndex.search(context.projectId, query, limit)
                };
              }
              return {
                mode: "browse",
                conversations: sessionIndex.browse(context.projectId, limit)
              };
            }
          } satisfies AgentTool
        ]
      : []),
    {
      name: "read_file",
      category: "file",
      description: "Read a file from the project Knowledge Base or Repository. Returns text content with line numbers.",
      schema: {
        name: "read_file",
        description: "Read a file from the project Knowledge Base. Use this to inspect TTL, CSV, Markdown, and other text files in the knowledge base.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path to the file, relative to the project Knowledge Base or Repository directory." },
            offset: { type: "number", description: "Line number to start reading from (1-indexed, default 1)." },
            limit: { type: "number", description: "Maximum number of lines to read (default 200, max 500)." }
          },
          required: ["path"]
        }
      },
      async run(args, context) {
        const requestedPath = textArg(args, "path");
        if (!requestedPath) {
          return { error: "path is required" };
        }
        const resolved = resolveReadPath(context.projectId, requestedPath);
        if (!resolved || !existsSync(resolved.absolutePath)) {
          return { error: "Path not found in project Knowledge Base or Repository." };
        }
        try {
          const info = await stat(resolved.absolutePath);
          if (!info.isFile()) {
            return { error: "Not a file." };
          }
          const ext = path.extname(resolved.absolutePath).toLowerCase();
          if (!TEXT_EXTENSIONS.has(ext) && ext !== "") {
            return { error: `Cannot read binary files (extension: ${ext}).` };
          }
          if (info.size > MAX_READ_BYTES) {
            return { error: `File too large (${info.size} bytes). Maximum is ${MAX_READ_BYTES} bytes.` };
          }
          const content = await readFile(resolved.absolutePath, "utf8");
          const lines = content.split("\n");
          const offset = numArg(args, "offset", 1);
          const limit = Math.min(numArg(args, "limit", 200), 500);
          const start = Math.max(0, offset - 1);
          const slice = lines.slice(start, start + limit);
          const result = slice.map((line, i) => `${String(start + i + 1).padStart(6, " ")}\t${line}`).join("\n");
          return {
            path: requestedPath,
            resolvedPath: formatScopedPath(resolved.root, resolved.relativePath),
            source: resolved.root === "repo" ? "repository" : "kb",
            totalLines: lines.length,
            offset: start + 1,
            lines: slice.length,
            content: result
          };
        } catch (error) {
          return { error: error instanceof Error ? error.message : "Could not read file." };
        }
      }
    },
    {
      name: "search_files",
      category: "file",
      description: "Search for files in the project Knowledge Base or Repository by glob pattern or find text in file contents.",
      schema: {
        name: "search_files",
        description: "Search for files in the project Knowledge Base or Repository. Use mode='files' to find files by name pattern (glob). Use mode='content' to grep for text inside files.",
        parameters: {
          type: "object",
          properties: {
            pattern: { type: "string", description: "Glob pattern for file names (mode=files) or text to search for (mode=content)." },
            mode: { type: "string", description: "Search mode: 'files' (glob by name) or 'content' (grep in file contents). Default: 'files'." },
            glob: { type: "string", description: "Optional glob filter to narrow file matches (e.g. '*.ttl', '**/*.md')." }
          },
          required: ["pattern"]
        }
      },
      async run(args, context) {
        const pattern = textArg(args, "pattern");
        if (!pattern) {
          return { error: "pattern is required" };
        }
        const mode = textArg(args, "mode") || "files";
        const { kbRoot, repoRoot } = projectFileRoots(context.projectId);
        const results: Array<{ path: string; source: "kb" | "repository"; preview?: string }> = [];
        const MAX_RESULTS = 50;

        async function visit(dir: string, root: string): Promise<void> {
          if (results.length >= MAX_RESULTS) return;
          let children;
          try {
            children = await readdir(dir, { withFileTypes: true });
          } catch {
            return;
          }
          for (const child of children) {
            if (results.length >= MAX_RESULTS) return;
            if (child.name.startsWith(".")) continue;
            const absolute = path.join(dir, child.name);
            if (child.isDirectory()) {
              await visit(absolute, root);
              continue;
            }
            const relative = path.relative(root, absolute).split(path.sep).join("/");
            if (mode === "files") {
              // Simple glob matching
              const regex = new RegExp(pattern.replace(/\*\*/g, "___GLOBSTAR___").replace(/\*/g, "[^/]*").replace(/\?/g, ".").replace(/___GLOBSTAR___/g, ".*"));
              if (regex.test(relative)) {
                results.push({
                  path: `${root === repoRoot ? "repo" : "kb"}:/${relative}`,
                  source: root === repoRoot ? "repository" : "kb"
                });
              }
            } else {
              // Content search
              const ext = path.extname(child.name).toLowerCase();
              if (!TEXT_EXTENSIONS.has(ext)) continue;
              const fileStat = await stat(absolute).catch(() => null);
              if (!fileStat || fileStat.size > MAX_READ_BYTES) continue;
              try {
                const content = await readFile(absolute, "utf8");
                if (content.includes(pattern)) {
                  const firstLine = content.split("\n").find((line) => line.includes(pattern))?.trim().slice(0, 120) ?? "";
                  results.push({
                    path: `${root === repoRoot ? "repo" : "kb"}:/${relative}`,
                    source: root === repoRoot ? "repository" : "kb",
                    preview: firstLine
                  });
                }
              } catch {
                // skip unreadable
              }
            }
          }
        }

        // Search both project KB and repo
        const globFilter = textArg(args, "glob");
        for (const root of [kbRoot, repoRoot]) {
          if (existsSync(root)) await visit(root, root);
        }

        let filtered = results;
        if (globFilter) {
          const globRegex = new RegExp(globFilter.replace(/\*\*/g, "___GLOBSTAR___").replace(/\*/g, "[^/]*").replace(/\?/g, ".").replace(/___GLOBSTAR___/g, ".*"));
          // Strip kb:/repo: prefix before testing glob
          filtered = results.filter((r) => {
            const pathPart = r.path.slice(r.path.indexOf(":/") + 2);
            return globRegex.test(pathPart);
          });
        }

        return {
          mode,
          pattern,
          matches: filtered.slice(0, MAX_RESULTS),
          count: filtered.length
        };
      }
    },

    {
      name: "bms_live_read",
      category: "utility",
      description:
        "Read current present-value from enteliWEB for Element chiller points (demo server has credentials pre-configured). Prefer this over curl for live BACnet values.",
      schema: {
        name: "bms_live_read",
        description:
          "Fetch live BACnet present-value via enteliWEB. Provide point_name (e.g. WCC_1_Chilled_Water_Temp), object_ref, or full api_path. Resolves api_path from local BMS catalog (server BMS_DATABASE_API_URL, default 127.0.0.1:8765) when needed.",
        parameters: {
          type: "object",
          properties: {
            point_name: { type: "string", description: "Point name in BMS-database catalog, e.g. WCC_1_Chilled_Water_Temp" },
            object_ref: { type: "string", description: "BACnet object ref, e.g. //Elements/10101.AV5" },
            api_path: { type: "string", description: "Full enteliWEB URL if already known" }
          },
          required: []
        }
      },
      async run(args) {
        const result = await fetchEnteliLiveValue({
          pointName: textArg(args, "point_name"),
          objectRef: textArg(args, "object_ref"),
          apiPath: textArg(args, "api_path")
        });
        return { ...result };
      }
    },

    {
      name: "bms_points_query",
      category: "building",
      description:
        "Fast BMS catalog lookup (local collector API). Returns point names, object_ref, api_path, last_value (~5min). Prefer over terminal/curl.",
      schema: {
        name: "bms_points_query",
        description:
          "Search the local BMS-database point catalog. Server-only http://127.0.0.1:8765. Use before bms_live_read when api_path is unknown.",
        parameters: {
          type: "object",
          properties: {
            q: { type: "string", description: "Search keyword, e.g. WCC_3 or WCC_3_Chilled_Water_Temp" },
            limit: { type: "number", description: "Max rows (default 50, max 200)" }
          },
          required: ["q"]
        }
      },
      async run(args) {
        const q = textArg(args, "q");
        if (!q) {
          return { error: "q is required" };
        }
        const limit = Math.min(Math.max(1, Math.floor(numArg(args, "limit", 50))), 200);
        const base = bmsCollectorBaseUrl();
        const url = `${base}/api/v1/points?${new URLSearchParams({ q, limit: String(limit) }).toString()}`;
        try {
          const response = await fetch(url, { headers: { accept: "application/json" } });
          if (!response.ok) {
            return { error: `bms_points_query_failed:${response.status}`, url };
          }
          const payload = (await response.json()) as { total?: number; items?: unknown[] };
          const total = payload.total ?? 0;
          const items = payload.items ?? [];
          return {
            total,
            items,
            base_url: base,
            ...(total === 0
              ? {
                  hint:
                    "No catalog matches for this query. Reuse exact `name` values from a prior successful bms_points_query in this turn; do not retry with aliases (TLKW, kW, human labels)."
                }
              : {})
          };
        } catch (error) {
          return { error: error instanceof Error ? error.message : "bms_points_query_failed", base_url: base };
        }
      }
    },

    {
      name: "bms_timeseries_query",
      category: "building",
      description:
        "Fast historical BMS series (merged poll+history). Prefer over terminal/curl. Times in UTC; display to users as Asia/Shanghai.",
      schema: {
        name: "bms_timeseries_query",
        description:
          "Fetch timeseries from local BMS-database GET /api/v1/timeseries. Provide name OR point_id OR object_ref, plus from (UTC ISO). For yesterday/today use from/to from CURRENT TIME CALENDAR RANGES in the system prompt.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Point name, e.g. WCC_3_Chilled_Water_Temp" },
            point_id: { type: "string", description: "Numeric point id from catalog" },
            object_ref: { type: "string", description: "BACnet object ref" },
            from: { type: "string", description: "Start time UTC ISO8601, e.g. 2026-05-17T00:00:00Z" },
            to: { type: "string", description: "End time UTC ISO8601 (optional)" },
            limit: { type: "number", description: "Max points (default 2000, max 20000)" },
            order: { type: "string", enum: ["asc", "desc"], description: "Sort order (default asc)" }
          },
          required: ["from"]
        }
      },
      async run(args) {
        const from = textArg(args, "from");
        if (!from) {
          return { error: "from is required (UTC ISO8601)" };
        }
        const name = textArg(args, "name");
        const pointId = textArg(args, "point_id");
        const objectRef = textArg(args, "object_ref");
        if (!name && !pointId && !objectRef) {
          return { error: "Provide name, point_id, or object_ref" };
        }
        const params: Record<string, string> = {
          from,
          limit: String(Math.min(Math.max(1, Math.floor(numArg(args, "limit", 2000))), 20000)),
          order: textArg(args, "order") === "desc" ? "desc" : "asc"
        };
        if (name) params.name = name;
        if (pointId) params.point_id = pointId;
        if (objectRef) params.object_ref = objectRef;
        const to = textArg(args, "to");
        if (to) params.to = to;
        const base = bmsCollectorBaseUrl();
        try {
          const result = await fetchTimeseries(base, params);
          return {
            total: result.total,
            items: result.items.slice(0, Number(params.limit)),
            base_url: base,
            query: params
          };
        } catch (error) {
          return { error: error instanceof Error ? error.message : "bms_timeseries_query_failed", base_url: base };
        }
      }
    },

    {
      name: "dashboard_create",
      category: "building",
      description:
        "Create a structured dashboard resource from a validated JSON spec. Use this when the user asks to monitor equipment or generate a dashboard.",
      schema: {
        name: "dashboard_create",
        description:
          "Create a dashboard with 3-column layout and typed widgets. Provide title, optional description, optional visibility, widgets, and layout. Never generate raw HTML/JS.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Dashboard title." },
            description: { type: "string", description: "Optional operator-facing description." },
            visibility: { type: "string", enum: ["private", "project"], description: "Optional visibility; defaults to private." },
            sourceConversationId: { type: "string", description: "Optional source conversation id." },
            widgets: { type: "array", description: "Widget definitions. Supported kinds: live_value_grid, timeseries_chart." },
            layout: { type: "array", description: "Grid placements in a 3-column layout." }
          },
          required: ["title", "widgets", "layout"]
        }
      },
      async run(args, context) {
        if (!context.dashboardOps) {
          return { error: "dashboard_create_unavailable" };
        }
        const parsed = parseDashboardMutationInput({
          ...args,
          sourceConversationId: textArg(args, "sourceConversationId") || context.conversationId
        });
        if ("error" in parsed) {
          return { error: parsed.error };
        }
        const dashboard = context.dashboardOps.create(parsed);
        return {
          ok: true,
          dashboard,
          path: dashboardPath(context.projectId, dashboard.id),
          message: `Dashboard created: ${dashboard.title}`
        };
      }
    },

    // --- Terminal / execute_code tool ---
    {
      name: "terminal",
      category: "utility",
      description: "Execute a shell command for installs, Python scripts, SPARQL, and CLIs. If a command fails due to missing packages or binaries, install them here first (pip/npm/apt), verify, then retry — do not workaround. Working directory is the Repository; outputs go to $OUTPUT_DIR.",
      schema: {
        name: "terminal",
        description: "Execute a shell command with timeout. Use to install dependencies (e.g. pip install matplotlib seaborn pandas) and run scripts/CLIs. On missing-library errors, install and retry before answering. cwd=Repository; outputs in $OUTPUT_DIR.",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string", description: "The shell command to execute (e.g. 'python -c \"print(1+1)\"', 'ls -la', 'sparql --query ...')." },
            timeout: { type: "number", description: "Timeout in seconds (default 30, max 120)." }
          },
          required: ["command"]
        }
      },
      async run(args, context) {
        const command = textArg(args, "command");
        if (!command) {
          return { error: "command is required" };
        }
        const guard = terminalCommandGuard(command);
        if (guard) {
          return guard;
        }
        const timeout = Math.min(numArg(args, "timeout", 30), 120) * 1000;
        const { kbRoot, repoRoot } = projectFileRoots(context.projectId);
        const outputDir = path.join(repoRoot, "outputs");
        const startedAtMs = Date.now();

        let result: string;
        try {
          await mkdir(outputDir, { recursive: true });

          // Force correct output path — replace ../kb/outputs with the actual OUTPUT_DIR
          const outputDirForward = outputDir.replace(/\\/g, "/");
          const patchedCommand = command.replace(/\.\.\/kb\/outputs/g, outputDirForward);

          result = await new Promise<string>((resolve, reject) => {
            const child = exec(patchedCommand, {
              cwd: repoRoot,
              timeout,
              maxBuffer: TERMINAL_MAX_OUTPUT,
              shell: process.env.SHELL ?? (process.platform === "win32" ? "cmd.exe" : "/bin/bash"),
              env: { ...process.env, PYTHONUNBUFFERED: "1", MPLBACKEND: "Agg", REPO_DIR: repoRoot, KB_DIR: kbRoot, OUTPUT_DIR: outputDir }
            }, (error, stdout, stderr) => {
              if (error && !stdout && !stderr) {
                reject(error);
                return;
              }
              const out = [stdout, stderr].filter(Boolean).join("\n").slice(0, TERMINAL_MAX_OUTPUT);
              resolve(out || error?.message || "(no output)");
            });
          });
        } catch (error) {
          result = error instanceof Error ? error.message : "Command failed";
        }

        const { files: outputFiles, synced } = await syncAndListOutputFiles(outputDir, kbRoot);
        const generatedImages = collectFreshGeneratedImages(outputFiles, "terminal", startedAtMs);
        const generatedDownloads = collectFreshGeneratedDownloads(outputFiles, startedAtMs);
        const augmentedOutput = appendGeneratedOutputHints(result.slice(0, TERMINAL_MAX_OUTPUT), generatedImages, generatedDownloads, synced);

        return augmentToolResultForEnvironment({
          command,
          cwd: repoRoot,
          outputDir,
          output: augmentedOutput,
          truncated: result.length > TERMINAL_MAX_OUTPUT,
          outputFiles,
          synced,
          generatedImages,
          generatedDownloads
        }, `${result}\n${augmentedOutput}`);
      }
    },

    // --- execute_code tool (dedicated Python execution) ---
    {
      name: "execute_code",
      category: "utility",
      description: "Run Python for analysis and charts. Data: build_combined_frame, data_coverage, col_series, load_all_series. Charts: new_figure, set_chart_title, plot_series, chart_color, format_hkt_axis, finalize_legend, save_chart (fixed enterprise style). matplotlib/seaborn/pandas pre-installed — do not pip install mid-turn.",
      schema: {
        name: "execute_code",
        description: "Execute Python for analysis/charts. Data: build_combined_frame() + data_coverage(); charts: new_figure() + set_chart_title() + plot_series() + format_hkt_axis + finalize_legend + save_chart. Fixed enterprise presentation style. Must end chart scripts with save_chart(fig, 'name.png'). English on-chart text only.",
        parameters: {
          type: "object",
          properties: {
            code: { type: "string", description: "Python source code to execute." },
            timeout: { type: "number", description: "Timeout in seconds (default 30, max 120)." }
          },
          required: ["code"]
        }
      },
      async run(args, context) {
        const code = textArg(args, "code");
        if (!code) {
          return { error: "code is required" };
        }
        const timeout = Math.min(numArg(args, "timeout", 30), 120) * 1000;
        const { kbRoot, repoRoot } = projectFileRoots(context.projectId);
        const outputDir = path.join(repoRoot, "outputs");
        const cacheDir = path.join(outputDir, ".tool_cache");
        const manifestPath = path.join(repoRoot, toolCacheManifestRelativePath(context.requestId));
        const tempPath = path.join(repoRoot, "_hermes_tmp.py");
        const startedAtMs = Date.now();

        let stdout = "";
        let stderr = "";
        let exitCode = 0;
        try {
          await mkdir(cacheDir, { recursive: true });
          await mkdir(outputDir, { recursive: true });

          // Force the correct output directory — replace any ../kb/outputs paths
          const patchedCode = executeCodeInjectedHeader() + code
            .replace(/Path\(['"]\.\.\/kb\/outputs['"]\)/g, `Path(os.environ['OUTPUT_DIR'])`)
            .replace(/['"]\.\.\/kb\/outputs\//g, `os.environ['OUTPUT_DIR'] + "/`)
            .replace(/['"]\.\.\/kb\/outputs['"]/g, `os.environ['OUTPUT_DIR']`);

          await writeFile(tempPath, patchedCode, "utf8");
          await new Promise<string>((resolve, reject) => {
            const child = exec(
              `${pythonExecutable()} "${tempPath}"`,
              {
                cwd: repoRoot,
                timeout,
                maxBuffer: TERMINAL_MAX_OUTPUT,
                shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
                env: {
                  ...process.env,
                  PYTHONUNBUFFERED: "1",
                  MPLBACKEND: "Agg",
                  REPO_DIR: repoRoot,
                  KB_DIR: kbRoot,
                  OUTPUT_DIR: outputDir,
                  REQUEST_ID: context.requestId,
                  TOOL_CACHE_MANIFEST: manifestPath
                }
              },
              (error, out, err) => {
                if (error && !out && !err) {
                  reject(error);
                  return;
                }
                stdout = (out || "").slice(0, TERMINAL_MAX_OUTPUT);
                stderr = (err || "").slice(0, TERMINAL_MAX_OUTPUT);
                if (error?.code != null) {
                  const code = typeof error.code === "number" ? error.code : Number(error.code);
                  if (Number.isFinite(code)) {
                    exitCode = code;
                  }
                }
                resolve(stdout || stderr || "(no output)");
              }
            );
          });
          if (/Traceback|SyntaxError|ModuleNotFoundError|FileNotFoundError/i.test(stderr)) {
            exitCode = exitCode || 1;
          }
          const { files: outputFiles, synced } = await syncAndListOutputFiles(outputDir, kbRoot);
          const generatedImages = collectFreshGeneratedImages(outputFiles, "execute_code", startedAtMs);
          const generatedDownloads = collectFreshGeneratedDownloads(outputFiles, startedAtMs);
          const sanityMessage = chartSanityViolation(code, generatedImages.length);
          if (sanityMessage && exitCode === 0) {
            exitCode = 1;
            stderr = stderr ? `${stderr}\n${sanityMessage}` : sanityMessage;
          }
          const augmentedStdout = appendGeneratedOutputHints(stdout.slice(0, TERMINAL_MAX_OUTPUT), generatedImages, generatedDownloads, synced);

          return augmentToolResultForEnvironment({
            stdout: augmentedStdout,
            stderr: stderr.slice(0, TERMINAL_MAX_OUTPUT),
            repoRoot,
            outputDir,
            truncated: stdout.length > TERMINAL_MAX_OUTPUT || stderr.length > TERMINAL_MAX_OUTPUT,
            outputFiles,
            synced,
            generatedImages,
            generatedDownloads,
            ...(exitCode !== 0 ? { exitCode, error: stderr.trim().split("\n").pop() ?? "Python execution failed" } : {})
          }, `${stdout}\n${stderr}`);
        } catch (error) {
          const failureText = stderr.slice(0, TERMINAL_MAX_OUTPUT) || (error instanceof Error ? error.message : "Execution failed");
          return augmentToolResultForEnvironment({
            stdout: stdout.slice(0, TERMINAL_MAX_OUTPUT),
            stderr: failureText,
            error: error instanceof Error ? error.message : "Execution failed",
            exitCode: 1,
            outputDir
          }, failureText);
        } finally {
          try { await unlink(tempPath); } catch { /* best effort cleanup */ }
        }
      }
    },

    // --- write_file tool ---
    {
      name: "write_file",
      category: "file",
      description: "Create or overwrite a file in the project Repository. All model-generated outputs should go to Repository.",
      schema: {
        name: "write_file",
        description: "Create or overwrite a text file in the project Repository. Creates parent directories automatically. Use outputs/ for user-facing generated artifacts.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path to the file, relative to the project Repository directory." },
            content: { type: "string", description: "File content to write." }
          },
          required: ["path", "content"]
        }
      },
      async run(args, context) {
        const requestedPath = textArg(args, "path");
        const content = textArg(args, "content");
        if (!requestedPath) {
          return { error: "path is required" };
        }
        if (!content) {
          return { error: "content is required" };
        }
        if (content.length > MAX_WRITE_BYTES) {
          return { error: `Content too large (${content.length} bytes). Maximum is ${MAX_WRITE_BYTES} bytes.` };
        }
        const resolved = resolveRepoWritePath(context.projectId, requestedPath);
        if (!resolved) {
          return { error: "Writes are only allowed inside the project Repository." };
        }
        try {
          await mkdir(path.dirname(resolved.absolutePath), { recursive: true });
          await writeFile(resolved.absolutePath, content, "utf8");
          const written = await stat(resolved.absolutePath);
          const normalizedPath = resolved.relativePath.replace(/\\/g, "/");
          const downloadHint =
            normalizedPath.startsWith("outputs/") && !IMAGE_EXTENSIONS.has(path.extname(normalizedPath).toLowerCase())
              ? ` Include in your answer: [${path.basename(normalizedPath)}](${normalizedPath})`
              : normalizedPath.startsWith("outputs/") && IMAGE_EXTENSIONS.has(path.extname(normalizedPath).toLowerCase())
                ? ` Include in your answer: ![${path.basename(normalizedPath)}](${normalizedPath})`
                : "";
          return {
            path: resolved.relativePath,
            resolvedPath: formatScopedPath("repo", resolved.relativePath),
            size: written.size,
            message: `File written to repository successfully (${written.size} bytes).${downloadHint}`
          };
        } catch (error) {
          return { error: error instanceof Error ? error.message : "Could not write file." };
        }
      }
    },

    // --- patch / edit_file tool ---
    {
      name: "patch",
      category: "file",
      description: "Replace a string in a project Repository file. Provide the exact old string and the new string. Only the first match is replaced. Use read_file first to see the current content.",
      schema: {
        name: "patch",
        description: "Make a targeted edit to a text file in the project Repository. Provide the exact old_string to find and the new_string to replace it with. Only the first occurrence is replaced.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path to the file, relative to the project Knowledge Base or Repository directory." },
            old_string: { type: "string", description: "Exact text to replace." },
            new_string: { type: "string", description: "Replacement text." }
          },
          required: ["path", "old_string", "new_string"]
        }
      },
      async run(args, context) {
        const requestedPath = textArg(args, "path");
        const oldStr = textArg(args, "old_string");
        const newStr = textArg(args, "new_string");
        if (!requestedPath) return { error: "path is required" };
        if (!oldStr) return { error: "old_string is required" };
        const resolved = resolveRepoWritePath(context.projectId, requestedPath);
        if (!resolved || !existsSync(resolved.absolutePath)) return { error: "Path not found in project Repository." };
        try {
          const info = await stat(resolved.absolutePath);
          if (!info.isFile()) return { error: "Not a file." };
          if (info.size > MAX_READ_BYTES) return { error: `File too large (${info.size} bytes).` };
          const content = await readFile(resolved.absolutePath, "utf8");
          const idx = content.indexOf(oldStr);
          if (idx === -1) return { error: "old_string not found in file. Use read_file to verify the exact content." };
          const patched = content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
          await writeFile(resolved.absolutePath, patched, "utf8");
          return {
            path: resolved.relativePath,
            resolvedPath: formatScopedPath("repo", resolved.relativePath),
            replaced: oldStr.length > 80 ? oldStr.slice(0, 80) + "..." : oldStr,
            message: `Replaced 1 occurrence. File now ${patched.length} chars.`
          };
        } catch (error) {
          return { error: error instanceof Error ? error.message : "Could not patch file." };
        }
      }
    },

    // --- Scheduler / Reminder tools ---
    {
      name: "schedule_reminder",
      category: "utility",
      description: "Schedule a timed reminder message. Supports delays from seconds to 30 days. Returns a job_id for cancellation.",
      schema: {
        name: "schedule_reminder",
        description: "Schedule a timed reminder message. Use when the user asks to be reminded about something after a time delay.",
        parameters: {
          type: "object",
          properties: {
            delay_seconds: { type: "number", description: "Delay in seconds before the reminder fires." },
            message: { type: "string", description: "The reminder message to send." }
          },
          required: ["delay_seconds", "message"]
        }
      },
      async run(args, context) {
        if (!scheduler) {
          return { error: "Scheduler service is not available." };
        }
        const delay = typeof args.delay_seconds === "number" ? args.delay_seconds : 0;
        const message = typeof args.message === "string" ? args.message.trim() : "";
        if (delay <= 0 || delay > 86400 * 30) {
          return { error: "delay_seconds must be between 1 and 2592000 (30 days)." };
        }
        if (!message) {
          return { error: "message is required." };
        }
        const job = scheduler.schedule({
          projectId: context.projectId,
          conversationId: context.conversationId,
          userId: context.userId,
          message,
          triggerAt: Date.now() + delay * 1000
        });
        return {
          jobId: job.jobId,
          message: job.message,
          triggerAt: new Date(job.triggerAt).toISOString(),
          delay_seconds: delay
        };
      }
    },
    {
      name: "cancel_reminder",
      category: "utility",
      description: "Cancel pending reminders. 'cancel_recent' cancels the most recent reminder; 'cancel_all' cancels all pending reminders for the project.",
      schema: {
        name: "cancel_reminder",
        description: "Cancel one or all pending reminders.",
        parameters: {
          type: "object",
          properties: {
            action: { type: "string", description: "'cancel_recent' or 'cancel_all'." }
          },
          required: ["action"]
        }
      },
      async run(args, context) {
        if (!scheduler) {
          return { error: "Scheduler service is not available." };
        }
        const action = typeof args.action === "string" ? args.action : "";
        if (action === "cancel_recent") {
          const cancelled = scheduler.cancelMostRecent(context.projectId);
          return cancelled
            ? { cancelled: true, jobId: cancelled.jobId, message: cancelled.message }
            : { cancelled: false, reason: "No pending reminders to cancel." };
        }
        if (action === "cancel_all") {
          const count = scheduler.cancelAll(context.projectId);
          return { cancelled: true, count };
        }
        return { error: "action must be 'cancel_recent' or 'cancel_all'." };
      }
    },
    {
      name: "list_reminders",
      category: "utility",
      description: "List all reminders for the current project.",
      schema: {
        name: "list_reminders",
        description: "List all reminder jobs for the current project.",
        parameters: { type: "object", properties: {} }
      },
      async run(_args, context) {
        if (!scheduler) {
          return { error: "Scheduler service is not available." };
        }
        const jobs = scheduler.list(context.projectId);
        return {
          reminders: jobs.map((j: ScheduledJob) => ({
            jobId: j.jobId,
            message: j.message,
            status: j.status,
            triggerAt: new Date(j.triggerAt).toISOString(),
            createdAt: new Date(j.createdAt).toISOString()
          })),
          count: jobs.length
        };
      }
    },
    {
      name: "cronjob",
      category: "utility",
      description: "Manage cron jobs: list, get, create, update, pause, resume, remove, trigger. Supports one-shot, interval, and cron-expression schedules.",
      schema: {
        name: "cronjob",
        description: "Manage scheduled and recurring jobs. Use 'list' to see all jobs, 'create' to schedule a new job (supports interval seconds, cron expressions), 'pause'/'resume' for recurring jobs, 'remove' to cancel.",
        parameters: {
          type: "object",
          properties: {
            action: {
              type: "string",
              description: "Action: 'list', 'get', 'create', 'update', 'pause', 'resume', 'remove', 'trigger'."
            },
            job_id: { type: "string", description: "Job ID for get/pause/resume/remove/trigger actions." },
            name: { type: "string", description: "Display name for the job (create/update)." },
            message: { type: "string", description: "Message to deliver when the job fires (create/update)." },
            schedule: { type: "string", description: "Cron expression (5-field: 'min hour dom month dow') or interval in seconds (create/update)." },
            is_interval: { type: "boolean", description: "If true, schedule is treated as interval seconds. If false or omitted, treated as cron expression." }
          },
          required: ["action"]
        }
      },
      async run(args, context) {
        if (!scheduler) {
          return { error: "Scheduler service is not available." };
        }
        const action = typeof args.action === "string" ? args.action : "";

        switch (action) {
          case "list": {
            const jobs = scheduler.list(context.projectId);
            return {
              jobs: jobs.map((j: ScheduledJob) => ({
                jobId: j.jobId,
                message: j.message,
                status: j.status,
                triggerAt: new Date(j.triggerAt).toISOString(),
                createdAt: new Date(j.createdAt).toISOString(),
                recurrence: j.recurrence ?? null,
                runCount: j.runCount ?? 0
              })),
              count: jobs.length
            };
          }

          case "get": {
            const jobId = typeof args.job_id === "string" ? args.job_id : "";
            if (!jobId) return { error: "job_id is required for 'get' action." };
            const jobs = scheduler.list(context.projectId);
            const job = jobs.find((j) => j.jobId === jobId);
            if (!job) return { error: `Job not found: ${jobId}` };
            return {
              job: {
                jobId: job.jobId,
                message: job.message,
                status: job.status,
                triggerAt: new Date(job.triggerAt).toISOString(),
                createdAt: new Date(job.createdAt).toISOString(),
                recurrence: job.recurrence ?? null,
                runCount: job.runCount ?? 0
              }
            };
          }

          case "create": {
            const message = typeof args.message === "string" ? args.message.trim() : "";
            if (!message) return { error: "message is required for 'create'." };

            const scheduleRaw = typeof args.schedule === "string" ? args.schedule.trim() : "";
            const isInterval = args.is_interval === true;

            let triggerAt = Date.now() + 60_000;
            let recurrence: JobRecurrence | undefined;

            if (isInterval && scheduleRaw) {
              const seconds = parseInt(scheduleRaw, 10);
              if (isNaN(seconds) || seconds <= 0) return { error: "schedule must be a positive number of seconds for interval type." };
              triggerAt = Date.now() + seconds * 1000;
              recurrence = { type: "interval", intervalSeconds: seconds };
            } else if (!isInterval && scheduleRaw) {
              recurrence = { type: "cron", cronExpression: scheduleRaw };
              triggerAt = nextCronTime(scheduleRaw, Date.now()) ?? Date.now() + 60_000;
            } else {
              // One-shot with default 60s delay
              triggerAt = Date.now() + 60_000;
            }

            const job = scheduler.schedule({
              projectId: context.projectId,
              conversationId: context.conversationId,
              userId: context.userId,
              message,
              triggerAt,
              ...(recurrence ? { recurrence } : {})
            });

            return {
              created: true,
              jobId: job.jobId,
              message: job.message,
              triggerAt: new Date(job.triggerAt).toISOString(),
              recurrence: job.recurrence ?? null
            };
          }

          case "pause": {
            const jobId = typeof args.job_id === "string" ? args.job_id : "";
            if (!jobId) return { error: "job_id is required." };
            const ok = scheduler.pause(jobId);
            return ok ? { paused: true, jobId } : { error: "Could not pause job. Is it a pending recurring job?" };
          }

          case "resume": {
            const jobId = typeof args.job_id === "string" ? args.job_id : "";
            if (!jobId) return { error: "job_id is required." };
            const ok = scheduler.resume(jobId);
            return ok ? { resumed: true, jobId } : { error: "Could not resume job. Is it a paused job?" };
          }

          case "remove": {
            const jobId = typeof args.job_id === "string" ? args.job_id : "";
            if (!jobId) return { error: "job_id is required." };
            const ok = scheduler.cancel(jobId);
            return ok ? { removed: true, jobId } : { error: "Could not remove job." };
          }

          case "trigger": {
            const jobId = typeof args.job_id === "string" ? args.job_id : "";
            if (!jobId) return { error: "job_id is required." };
            // Trigger by scheduling immediately
            const triggered = scheduler.schedule({
              projectId: context.projectId,
              conversationId: context.conversationId,
              userId: context.userId,
              message: `[Triggered] job ${jobId}`,
              triggerAt: Date.now() + 1000
            });
            return { triggered: true, jobId: triggered.jobId, message: "Job triggered for immediate execution." };
          }

          case "update": {
            const jobId = typeof args.job_id === "string" ? args.job_id : "";
            if (!jobId) return { error: "job_id is required." };
            // Cancel old, create new with same ID
            scheduler.cancel(jobId);
            const message = typeof args.message === "string" ? args.message.trim() : "Updated reminder";
            const updated = scheduler.schedule({
              projectId: context.projectId,
              conversationId: context.conversationId,
              userId: context.userId,
              message,
              triggerAt: Date.now() + 60_000
            });
            return { updated: true, jobId: updated.jobId, message: updated.message };
          }

          default:
            return { error: `Unknown action: ${action}. Supported: list, get, create, update, pause, resume, remove, trigger.` };
        }
      }
    },

    // --- Web search tools ---
    {
      name: "web_search",
      category: "web",
      description: "Search the web using DuckDuckGo Instant Answer API. Returns abstracts, related topics, and source URLs. Free, no API key required.",
      schema: {
        name: "web_search",
        description: "Search the web for information. Returns abstract, related topics, and source links. Use for looking up current information, documentation, or general knowledge.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query." }
          },
          required: ["query"]
        }
      },
      async run(args, context) {
        const query = textArg(args, "query");
        if (!query) return { error: "query is required." };
        try {
          const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 10_000);
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timer);
          if (!response.ok) {
            return { error: `Search returned HTTP ${response.status}.` };
          }
          const data = (await response.json()) as Record<string, unknown>;
          const results: Array<{ title: string; snippet: string; url?: string }> = [];

          // Abstract
          if (typeof data.AbstractText === "string" && data.AbstractText.trim()) {
            const abstractUrl = typeof data.AbstractURL === "string" ? data.AbstractURL : null;
            results.push({
              title: (typeof data.Heading === "string" ? data.Heading : "Abstract"),
              snippet: data.AbstractText as string,
              ...(abstractUrl ? { url: abstractUrl } : {})
            } as { title: string; snippet: string; url?: string });
          }

          // Related topics
          const relatedTopics = data.RelatedTopics as Array<Record<string, unknown>> | undefined;
          if (Array.isArray(relatedTopics)) {
            for (const topic of relatedTopics) {
              if (typeof topic.Text === "string") {
                const topicUrl = typeof topic.FirstURL === "string" ? topic.FirstURL : null;
                results.push({
                  title: typeof topic.FirstURL === "string"
                    ? decodeURIComponent((topic.FirstURL as string).split("/").pop() ?? "").replace(/_/g, " ")
                    : "",
                  snippet: topic.Text,
                  ...(topicUrl ? { url: topicUrl } : {})
                } as { title: string; snippet: string; url?: string });
              }
            }
          }

          // Answer
          if (typeof data.Answer === "string" && data.Answer.trim()) {
            results.unshift({
              title: "Answer",
              snippet: data.Answer
            });
          }

          return {
            query,
            results: results.slice(0, 20),
            resultCount: results.length,
            source: "DuckDuckGo"
          };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : "Web search failed.",
            query
          };
        }
      }
    },
    {
      name: "web_extract",
      category: "web",
      description: "Fetch and extract readable text content from a URL. Strips HTML tags, scripts, and styles.",
      schema: {
        name: "web_extract",
        description: "Fetch a URL and extract its readable text content. Use to read documentation pages, articles, or any web content.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL to fetch and extract text from." },
            max_length: { type: "number", description: "Maximum characters to return (default 10,000, max 50,000)." }
          },
          required: ["url"]
        }
      },
      async run(args, context) {
        const url = textArg(args, "url");
        if (!url) return { error: "url is required." };
        const maxLen = Math.min(numArg(args, "max_length", 10_000), 50_000);

        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 15_000);
          const response = await fetch(url, {
            signal: controller.signal,
            headers: {
              "User-Agent": "BuildingGPT/1.0 (web-extract-bot)",
              "Accept": "text/html,text/plain"
            }
          });
          clearTimeout(timer);

          if (!response.ok) {
            return { error: `HTTP ${response.status} from ${url}.` };
          }

          const contentType = response.headers.get("content-type") ?? "";
          if (!contentType.includes("text/") && !contentType.includes("application/json")) {
            return { error: `Unsupported content type: ${contentType}. Only text content is supported.` };
          }

          const html = await response.text();
          // Simple HTML-to-text: remove scripts, styles, tags
          const text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#x27;/g, "'")
            .replace(/&nbsp;/g, " ")
            .replace(/\s+/g, " ")
            .trim();

          const truncated = text.length > maxLen ? text.slice(0, maxLen) + "..." : text;

          return {
            url,
            text: truncated,
            length: truncated.length,
            truncated: text.length > maxLen
          };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : "Web extract failed.",
            url
          };
        }
      }
    },

    // --- Background process management tools ---
    {
      name: "process_start",
      category: "utility",
      description: "Start a command in the background. Returns a process_id for status checking and control.",
      schema: {
        name: "process_start",
        description: "Run a shell command in the background. Use for long-running tasks. Returns a process_id for use with process_status/process_kill.",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string", description: "Shell command to run in the background." }
          },
          required: ["command"]
        }
      },
      async run(args, context) {
        if (!processRegistry) {
          return { error: "Process registry is not available." };
        }
        const command = textArg(args, "command");
        if (!command) return { error: "command is required." };
        const processId = processRegistry.spawn(command);
        const info = processRegistry.status(processId);
        return {
          processId,
          command,
          status: info?.status ?? "running",
          startedAt: info?.startedAt ?? new Date().toISOString()
        };
      }
    },
    {
      name: "process_status",
      category: "utility",
      description: "Get the current status and output of a background process.",
      schema: {
        name: "process_status",
        description: "Check the status of a background process. Returns stdout, stderr, exit code, and status.",
        parameters: {
          type: "object",
          properties: {
            process_id: { type: "string", description: "Process ID from process_start." }
          },
          required: ["process_id"]
        }
      },
      async run(args, context) {
        if (!processRegistry) {
          return { error: "Process registry is not available." };
        }
        const processId = typeof args.process_id === "string" ? args.process_id : "";
        if (!processId) return { error: "process_id is required." };
        const info = processRegistry.status(processId);
        if (!info) return { error: `Process not found: ${processId}` };
        return {
          processId: info.processId,
          status: info.status,
          command: info.command,
          stdout: info.stdout.slice(-5000),
          stderr: info.stderr.slice(-5000),
          exitCode: info.exitCode,
          startedAt: info.startedAt,
          finishedAt: info.finishedAt
        };
      }
    },
    {
      name: "process_kill",
      category: "utility",
      description: "Terminate a running background process.",
      schema: {
        name: "process_kill",
        description: "Kill a background process by its process_id.",
        parameters: {
          type: "object",
          properties: {
            process_id: { type: "string", description: "Process ID from process_start." }
          },
          required: ["process_id"]
        }
      },
      async run(args, context) {
        if (!processRegistry) {
          return { error: "Process registry is not available." };
        }
        const processId = typeof args.process_id === "string" ? args.process_id : "";
        if (!processId) return { error: "process_id is required." };
        const ok = processRegistry.kill(processId);
        return ok
          ? { killed: true, processId }
          : { error: `Could not kill process: ${processId}. It may have already finished.` };
      }
    },
    {
      name: "process_list",
      category: "utility",
      description: "List all background processes (newest first).",
      schema: {
        name: "process_list",
        description: "List all background processes and their statuses.",
        parameters: { type: "object", properties: {} }
      },
      async run(_args, context) {
        if (!processRegistry) {
          return { error: "Process registry is not available." };
        }
        const processes = processRegistry.list();
        return {
          processes: processes.map((p) => ({
            processId: p.processId,
            command: p.command.slice(0, 100),
            status: p.status,
            exitCode: p.exitCode,
            startedAt: p.startedAt,
            finishedAt: p.finishedAt
          })),
          count: processes.length
        };
      }
    }
  ];

  for (const tool of tools) {
    registry.register(tool);
  }

  // Register skill CRUD tools if a skill registry is available
  if (skills) {
    for (const tool of skills.buildCrudToolDefs(projectSkillBindings)) {
      registry.register(tool);
    }
  }

  if (projectGroundingBindings) {
    registry.register({
      name: "project_grounding_add",
      category: "memory",
      description:
        "Save a site-specific project grounding rule (shared by all users). Use for explicit site facts; prefer feedback_commit_playbook after a correction workflow.",
      schema: {
        name: "project_grounding_add",
        description: "Add a project grounding rule that must be followed in future turns.",
        parameters: {
          type: "object",
          properties: {
            content: { type: "string", description: "Rule text to persist for this project." }
          },
          required: ["content"]
        }
      },
      async run(args, context) {
        if (!context.canConfigure) {
          return boundsViolationResult(
            "project_grounding_add requires project:configure. Use feedback_commit_playbook after the correction workflow."
          );
        }
        const content = textArg(args, "content");
        if (!content) {
          return { error: "content is required" };
        }
        const rule = projectGroundingBindings.add(context.projectId, content, {
          source: "operator",
          createdBy: context.userId
        });
        return { rule };
      }
    });
    registry.register({
      name: "project_grounding_list",
      category: "memory",
      description: "List project grounding rules for the current project.",
      schema: {
        name: "project_grounding_list",
        description: "List site-specific grounding rules.",
        parameters: { type: "object", properties: {}, required: [] }
      },
      async run(_args, context) {
        const rules = projectGroundingBindings.list(context.projectId);
        return { rules, count: rules.length, projectId: context.projectId };
      }
    });
  }

  if (projectFeedbackBindings) {
    registry.register({
      name: "feedback_propose",
      category: "memory",
      description:
        "Record a correction proposal ONLY after the user explicitly agrees to save it as a project rule. Never call in the same turn as the initial fix unless they asked to save.",
      schema: {
        name: "feedback_propose",
        description:
          "Record user correction and proposed fix plan; status=proposed. Requires prior user consent to save as a site rule.",
        parameters: {
          type: "object",
          properties: {
            user_correction: { type: "string", description: "What the user said was wrong (English)." },
            proposed_fix: {
              type: "string",
              description:
                "Broad site rule in English: underlying principle, evidence or signals, ambiguity handling, and scope of question types — not one exact phrasing or single data point."
            },
            trigger_topics: {
              type: "array",
              items: { type: "string" },
              description:
                "Keywords for the whole topic family, synonyms, and paraphrases users might use. Non-English phrases OK for matching only."
            }
          },
          required: ["user_correction", "proposed_fix", "trigger_topics"]
        }
      },
      async run(args, context) {
        const userCorrection = textArg(args, "user_correction");
        const proposedFix = textArg(args, "proposed_fix");
        const triggerTopics = stringArrayArg(args, "trigger_topics");
        if (!userCorrection || !proposedFix || triggerTopics.length === 0) {
          return { error: "user_correction, proposed_fix, and trigger_topics are required" };
        }
        const latestUser = lastUserMessageContent(context.messages);
        if (!hasSiteRuleSaveConsent(latestUser)) {
          return {
            error: "consent_required",
            message: "Ask the user in plain language first whether to remember. Do not mention proposal IDs."
          };
        }
        const proposal = projectFeedbackBindings.propose(context.projectId, context.conversationId, {
          userCorrection,
          proposedFix,
          triggerTopics
        });
        return {
          proposal,
          message:
            "Draft recorded (not active). Prefer feedback_save_site_rule to persist. Do not mention internal IDs to the user."
        };
      }
    });

    registry.register({
      name: "feedback_save_site_rule",
      category: "memory",
      description:
        "After explicit user consent, save a broad site judgment rule to project grounding. Preferred over feedback_propose for text rules.",
      schema: {
        name: "feedback_save_site_rule",
        description:
          "Persist an approved site rule (grounding only, no script). Requires prior user save consent. Pick rule_key from SITE RULE TEMPLATE KEYS; author field values from the correction principle.",
        parameters: {
          type: "object",
          properties: {
            rule_key: {
              type: "string",
              description:
                "Stable template key from SITE RULE TEMPLATE KEYS. Same key upserts the same stored rule id, e.g. wrong_running_state for chiller running-state corrections.",
              enum: ["wrong_running_state"]
            },
            name: {
              type: "string",
              description: "Short display name you author in English (see template guide for the rule_key)."
            },
            scope: {
              type: "string",
              description: "Broad rule scope you author in English (generalized, not one question wording)."
            },
            trigger: {
              type: "string",
              description: "When the rule applies — one sentence you author in English."
            },
            action: {
              type: "string",
              description: "Main judgment principle you author in English — injected into prompts."
            },
            exception: { type: "string", description: "Optional exception clause." },
            wrong_pattern: { type: "string", description: "What not to do (anti-pattern)." },
            trigger_topics: {
              type: "array",
              items: { type: "string" },
              description: "At least 4 topic paraphrases (English and/or Chinese) for retrieval."
            },
            systems: { type: "array", items: { type: "string" }, description: "Related systems, e.g. chiller plant." },
            equipment: { type: "array", items: { type: "string" }, description: "Related equipment, e.g. WCC." },
            brick_classes: { type: "array", items: { type: "string" }, description: "Related Brick classes." },
            error_type: { type: "string", description: "RuleErrorType metadata, e.g. wrong_running_state." },
            rule_summary: {
              type: "string",
              description: "Legacy fallback — prefer structured action/trigger/scope fields."
            },
            proposal_id: { type: "string", description: "Optional draft proposal id to mark committed." }
          },
          required: ["rule_key", "name", "action", "trigger", "scope", "trigger_topics"]
        }
      },
      async run(args, context) {
        const latestUser = lastUserMessageContent(context.messages);
        if (!hasSiteRuleSaveConsent(latestUser)) {
          return {
            error: "consent_required",
            message: "Ask the user in plain language first whether to remember for similar questions."
          };
        }
        if (!context.canConfigure) {
          return boundsViolationResult("feedback_save_site_rule requires project:configure.");
        }
        const ruleSummary = textArg(args, "rule_summary");
        const proposalId = textArg(args, "proposal_id");
        const triggerTopics = stringArrayArg(args, "trigger_topics");
        const ruleKey = textArg(args, "rule_key");
        const name = textArg(args, "name");
        const action = textArg(args, "action") ?? ruleSummary;
        const scope = textArg(args, "scope");
        const trigger = textArg(args, "trigger");
        const exception = textArg(args, "exception");
        const wrongPattern = textArg(args, "wrong_pattern");
        const systems = stringArrayArg(args, "systems");
        const equipment = stringArrayArg(args, "equipment");
        const brickClasses = stringArrayArg(args, "brick_classes");
        const errorType = textArg(args, "error_type");
        if (!action) {
          return { error: "action is required" };
        }
        try {
          const result = projectFeedbackBindings.saveSiteRule(context.projectId, context.conversationId, {
            ...(ruleKey ? { ruleKey } : {}),
            ...(name ? { name } : {}),
            ...(action ? { action } : {}),
            ...(scope ? { scope } : {}),
            ...(trigger ? { trigger } : {}),
            ...(exception ? { exception } : {}),
            ...(wrongPattern ? { wrongPattern } : {}),
            ...(triggerTopics.length > 0 ? { triggerTopics } : {}),
            ...(systems.length > 0 ? { systems } : {}),
            ...(equipment.length > 0 ? { equipment } : {}),
            ...(brickClasses.length > 0 ? { brickClasses } : {}),
            ...(errorType ? { errorType: errorType as import("../projectRules.js").RuleErrorType } : {}),
            ...(ruleSummary ? { ruleSummary } : {}),
            ...(proposalId ? { proposalId } : {}),
            createdBy: context.userId
          });
          return {
            ...result,
            saved: true,
            message:
              "Saved. Tell the user you will remember this for similar questions. Do not mention internal IDs."
          };
        } catch (error) {
          return { error: error instanceof Error ? error.message : "feedback_save_site_rule_failed" };
        }
      }
    });

    registry.register({
      name: "feedback_implement",
      category: "utility",
      description:
        "After user approval, write a feedback_tools Python script, execute it, and mark the proposal implemented.",
      schema: {
        name: "feedback_implement",
        description: "Implement an approved correction proposal as a repository script.",
        parameters: {
          type: "object",
          properties: {
            proposal_id: { type: "string", description: "Proposal id from feedback_propose." },
            script_content: { type: "string", description: "Full Python script source." },
            script_filename: { type: "string", description: "Filename only, e.g. chiller_running_status.py" }
          },
          required: ["proposal_id", "script_content", "script_filename"]
        }
      },
      async run(args, context) {
        const proposalId = textArg(args, "proposal_id");
        const scriptContent = textArg(args, "script_content");
        const scriptFilename = textArg(args, "script_filename");
        if (!proposalId || !scriptContent || !scriptFilename) {
          return { error: "proposal_id, script_content, and script_filename are required" };
        }
        try {
          const result = await projectFeedbackBindings.implement(context.projectId, proposalId, {
            scriptContent,
            scriptFilename
          });
          return result as unknown as Record<string, unknown>;
        } catch (error) {
          return { error: error instanceof Error ? error.message : "feedback_implement_failed" };
        }
      }
    });

    registry.register({
      name: "feedback_commit_playbook",
      category: "memory",
      description:
        "After user confirms, persist an implemented correction as an active playbook and project grounding rule.",
      schema: {
        name: "feedback_commit_playbook",
        description: "Commit implemented proposal to playbook + grounding.",
        parameters: {
          type: "object",
          properties: {
            proposal_id: { type: "string", description: "Implemented proposal id." },
            title: { type: "string", description: "Short playbook title." },
            grounding_summary: { type: "string", description: "Rule summary for future turns." }
          },
          required: ["proposal_id", "title", "grounding_summary"]
        }
      },
      async run(args, context) {
        const proposalId = textArg(args, "proposal_id");
        const title = textArg(args, "title");
        const groundingSummary = textArg(args, "grounding_summary");
        if (!proposalId || !title || !groundingSummary) {
          return { error: "proposal_id, title, and grounding_summary are required" };
        }
        try {
          const result = projectFeedbackBindings.commit(context.projectId, proposalId, {
            title,
            groundingSummary,
            createdBy: context.userId
          });
          return result as unknown as Record<string, unknown>;
        } catch (error) {
          return { error: error instanceof Error ? error.message : "feedback_commit_playbook_failed" };
        }
      }
    });

    registry.register({
      name: "feedback_list_playbooks",
      category: "memory",
      description: "List active project playbooks for correction reuse.",
      schema: {
        name: "feedback_list_playbooks",
        description: "List active playbooks.",
        parameters: { type: "object", properties: {}, required: [] }
      },
      async run(_args, context) {
        const playbooks = projectFeedbackBindings.listPlaybooks(context.projectId);
        return { playbooks, count: playbooks.length, projectId: context.projectId };
      }
    });

    registry.register({
      name: "feedback_run_playbook",
      category: "utility",
      description:
        "Run an active playbook script. Prefer this for topics that match a committed correction before ad-hoc analysis.",
      schema: {
        name: "feedback_run_playbook",
        description: "Execute playbook by id or topic keyword match.",
        parameters: {
          type: "object",
          properties: {
            playbook_id: { type: "string", description: "Playbook id, e.g. pb_000001." },
            topic: { type: "string", description: "User question topic for fuzzy match." }
          },
          required: []
        }
      },
      async run(args, context) {
        const playbookId = textArg(args, "playbook_id");
        const topic = textArg(args, "topic");
        if (!playbookId && !topic) {
          return { error: "playbook_id or topic is required" };
        }
        const input: { playbookId?: string; topic?: string } = {};
        if (playbookId) {
          input.playbookId = playbookId;
        }
        if (topic) {
          input.topic = topic;
        }
        return projectFeedbackBindings.runPlaybook(context.projectId, input);
      }
    });
  }

  return registry;
}
