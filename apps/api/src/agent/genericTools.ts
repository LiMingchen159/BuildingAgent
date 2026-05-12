import { existsSync } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import type { AgentMemoryStore } from "./memory.js";
import { knowledgeBaseRoot } from "./knowledgeBase.js";
import { AgentToolRegistry } from "./tools.js";
import type { AgentTool } from "./types.js";
import type { SchedulerService, ScheduledJob } from "../scheduler.js";
import { parseCancelCommand, parseListCommand, parseTimeExpression } from "../scheduler.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const MAX_READ_BYTES = 200_000;
const MAX_WRITE_BYTES = 500_000;
const TERMINAL_TIMEOUT_MS = 30_000;
const TERMINAL_MAX_OUTPUT = 100_000;
const TEXT_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".ttl", ".rdf", ".csv", ".json", ".yaml", ".yml", ".xml", ".html", ".htm", ".css", ".js", ".ts", ".tsx", ".jsx", ".py", ".go", ".rs", ".java", ".c", ".h", ".cpp", ".hpp", ".sh", ".bash", ".zsh", ".sql", ".graphql", ".proto", ".toml", ".ini", ".cfg", ".conf", ".env", ".log"]);

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

export function createGenericToolRegistry(memory: AgentMemoryStore, scheduler?: SchedulerService): AgentToolRegistry {
  const registry = new AgentToolRegistry();
  const tools: AgentTool[] = [
    {
      name: "memory_remember",
      category: "memory",
      description: "Save a short project-scoped memory for the current user.",
      schema: {
        name: "memory_remember",
        description: "Save a short project-scoped memory for the current user.",
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
        return { memory: memory.remember(context.projectId, context.userId, content) };
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
      description: "Clear the current user's project chat memory for a fresh conversation.",
      schema: {
        name: "session_reset",
        description: "Clear the current user's project chat memory for a fresh conversation.",
        parameters: { type: "object", properties: {} }
      },
      async run(_args, context) {
        return { clearedMemories: memory.clear(context.projectId, context.userId) };
      }
    },
    {
      name: "read_file",
      category: "file",
      description: "Read a file from the project Knowledge Base. Returns text content with line numbers.",
      schema: {
        name: "read_file",
        description: "Read a file from the project Knowledge Base. Use this to inspect TTL, CSV, Markdown, and other text files in the knowledge base.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path to the file, relative to the project Knowledge Base directory." },
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
        const kbRoot = knowledgeBaseRoot();
        const safePath = resolveSafePath(kbRoot, requestedPath);
        if (!safePath) {
          return { error: "Path traversal is not allowed." };
        }
        try {
          const info = await stat(safePath);
          if (!info.isFile()) {
            return { error: "Not a file." };
          }
          const ext = path.extname(safePath).toLowerCase();
          if (!TEXT_EXTENSIONS.has(ext) && ext !== "") {
            return { error: `Cannot read binary files (extension: ${ext}).` };
          }
          if (info.size > MAX_READ_BYTES) {
            return { error: `File too large (${info.size} bytes). Maximum is ${MAX_READ_BYTES} bytes.` };
          }
          const content = await readFile(safePath, "utf8");
          const lines = content.split("\n");
          const offset = numArg(args, "offset", 1);
          const limit = Math.min(numArg(args, "limit", 200), 500);
          const start = Math.max(0, offset - 1);
          const slice = lines.slice(start, start + limit);
          const result = slice.map((line, i) => `${String(start + i + 1).padStart(6, " ")}\t${line}`).join("\n");
          return {
            path: requestedPath,
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
      description: "Search for files in the project Knowledge Base by glob pattern or find text in file contents.",
      schema: {
        name: "search_files",
        description: "Search for files in the project Knowledge Base. Use mode='files' to find files by name pattern (glob). Use mode='content' to grep for text inside files.",
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
        const kbRoot = knowledgeBaseRoot();
        const results: string[] = [];
        const MAX_RESULTS = 50;

        async function visit(dir: string): Promise<void> {
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
              await visit(absolute);
              continue;
            }
            const relative = path.relative(kbRoot, absolute).split(path.sep).join("/");
            if (mode === "files") {
              // Simple glob matching
              const regex = new RegExp(pattern.replace(/\*\*/g, "___GLOBSTAR___").replace(/\*/g, "[^/]*").replace(/\?/g, ".").replace(/___GLOBSTAR___/g, ".*"));
              if (regex.test(relative)) {
                results.push(relative);
              }
            } else {
              // Content search
              const ext = path.extname(child.name).toLowerCase();
              if (!TEXT_EXTENSIONS.has(ext)) continue;
              const size = (await stat(absolute).catch(() => ({ size: 0 }))).size;
              if (size > MAX_READ_BYTES) continue;
              try {
                const content = await readFile(absolute, "utf8");
                if (content.includes(pattern)) {
                  const firstLine = content.split("\n").find((line) => line.includes(pattern))?.trim().slice(0, 120) ?? "";
                  results.push(`${relative}: ${firstLine}`);
                }
              } catch {
                // skip unreadable
              }
            }
          }
        }

        const globFilter = textArg(args, "glob");
        await visit(kbRoot);

        let filtered = results;
        if (globFilter && mode === "content") {
          const globRegex = new RegExp(globFilter.replace(/\*\*/g, "___GLOBSTAR___").replace(/\*/g, "[^/]*").replace(/\?/g, ".").replace(/___GLOBSTAR___/g, ".*"));
          filtered = results.filter((r) => globRegex.test(r.split(":")[0]!));
        }

        return {
          mode,
          pattern,
          matches: filtered.slice(0, MAX_RESULTS),
          count: filtered.length
        };
      }
    },

    // --- Terminal / execute_code tool ---
    {
      name: "terminal",
      category: "utility",
      description: "Execute a shell command. Use this to run Python scripts, SPARQL queries, shell commands, or any CLI tool. The working directory is the project Knowledge Base root. Commands time out after 30 seconds.",
      schema: {
        name: "terminal",
        description: "Execute a shell command with a timeout. Use for Python scripts, SPARQL queries, shell commands, git operations, or any CLI tool. The working directory is the project Knowledge Base root.",
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
        const timeout = Math.min(numArg(args, "timeout", 30), 120) * 1000;
        const kbRoot = knowledgeBaseRoot();

        let result: string;
        try {
          result = await new Promise<string>((resolve, reject) => {
            const child = exec(command, {
              cwd: kbRoot,
              timeout,
              maxBuffer: TERMINAL_MAX_OUTPUT,
              shell: process.env.SHELL ?? (process.platform === "win32" ? "cmd.exe" : "/bin/bash"),
              env: { ...process.env, PYTHONUNBUFFERED: "1" }
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

        return {
          command,
          cwd: kbRoot,
          output: result.slice(0, TERMINAL_MAX_OUTPUT),
          truncated: result.length > TERMINAL_MAX_OUTPUT
        };
      }
    },

    // --- write_file tool ---
    {
      name: "write_file",
      category: "file",
      description: "Create or overwrite a file in the project Knowledge Base.",
      schema: {
        name: "write_file",
        description: "Create or overwrite a text file in the project Knowledge Base. Creates parent directories automatically.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path to the file, relative to the project Knowledge Base directory." },
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
        const kbRoot = knowledgeBaseRoot();
        const safePath = resolveSafePath(kbRoot, requestedPath);
        if (!safePath) {
          return { error: "Path traversal is not allowed." };
        }
        try {
          await writeFile(safePath, content, "utf8");
          const written = await stat(safePath);
          return {
            path: requestedPath,
            size: written.size,
            message: `File written successfully (${written.size} bytes).`
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
      description: "Replace a string in a Knowledge Base file. Provide the exact old string and the new string. Only the first match is replaced. Use read_file first to see the current content.",
      schema: {
        name: "patch",
        description: "Make a targeted edit to a text file in the project Knowledge Base. Provide the exact old_string to find and the new_string to replace it with. Only the first occurrence is replaced.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path to the file, relative to the project Knowledge Base directory." },
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
        const kbRoot = knowledgeBaseRoot();
        const safePath = resolveSafePath(kbRoot, requestedPath);
        if (!safePath) return { error: "Path traversal is not allowed." };
        try {
          const info = await stat(safePath);
          if (!info.isFile()) return { error: "Not a file." };
          if (info.size > MAX_READ_BYTES) return { error: `File too large (${info.size} bytes).` };
          const content = await readFile(safePath, "utf8");
          const idx = content.indexOf(oldStr);
          if (idx === -1) return { error: "old_string not found in file. Use read_file to verify the exact content." };
          const patched = content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
          await writeFile(safePath, patched, "utf8");
          return {
            path: requestedPath,
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
    }
  ];

  for (const tool of tools) {
    registry.register(tool);
  }

  return registry;
}
