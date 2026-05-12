import { existsSync } from "node:fs";
import { readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import type { AgentMemoryStore } from "./memory.js";
import { knowledgeBaseRoot } from "./knowledgeBase.js";
import { AgentToolRegistry } from "./tools.js";
import type { AgentTool } from "./types.js";
import type { SchedulerService, ScheduledJob, JobRecurrence } from "../scheduler.js";
import { parseCancelCommand, parseListCommand, parseTimeExpression, nextCronTime } from "../scheduler.js";
import type { ProcessRegistry } from "./processRegistry.js";

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

export function createGenericToolRegistry(memory: AgentMemoryStore, scheduler?: SchedulerService, processRegistry?: ProcessRegistry): AgentToolRegistry {
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

    // --- execute_code tool (dedicated Python execution) ---
    {
      name: "execute_code",
      category: "utility",
      description: "Execute Python code in a sandboxed subprocess. Writes code to a temp file, runs it with timeout, captures stdout/stderr. Use this instead of terminal for running Python snippets.",
      schema: {
        name: "execute_code",
        description: "Execute Python code in a subprocess. Use this for data analysis, computations, or processing files in the Knowledge Base. The working directory is the project Knowledge Base root.",
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
        const kbRoot = knowledgeBaseRoot();
        const tempPath = path.join(kbRoot, "_hermes_tmp.py");

        let stdout = "";
        let stderr = "";
        try {
          await writeFile(tempPath, code, "utf8");
          const result = await new Promise<string>((resolve, reject) => {
            const child = exec(
              `python "${tempPath}"`,
              {
                cwd: kbRoot,
                timeout,
                maxBuffer: TERMINAL_MAX_OUTPUT,
                shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
                env: { ...process.env, PYTHONUNBUFFERED: "1" }
              },
              (error, out, err) => {
                if (error && !out && !err) {
                  reject(error);
                  return;
                }
                stdout = (out || "").slice(0, TERMINAL_MAX_OUTPUT);
                stderr = (err || "").slice(0, TERMINAL_MAX_OUTPUT);
                resolve(stdout || stderr || "(no output)");
              }
            );
          });
          return {
            stdout: stdout.slice(0, TERMINAL_MAX_OUTPUT),
            stderr: stderr.slice(0, TERMINAL_MAX_OUTPUT),
            truncated: stdout.length > TERMINAL_MAX_OUTPUT || stderr.length > TERMINAL_MAX_OUTPUT
          };
        } catch (error) {
          return {
            stdout: stdout.slice(0, TERMINAL_MAX_OUTPUT),
            stderr: stderr.slice(0, TERMINAL_MAX_OUTPUT) || (error instanceof Error ? error.message : "Execution failed"),
            error: error instanceof Error ? error.message : "Execution failed"
          };
        } finally {
          try { await unlink(tempPath); } catch { /* best effort cleanup */ }
        }
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

  return registry;
}
