import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ChatToolDefinition } from "../providers.js";
import { compactToolResult } from "./toolResultCompaction.js";
import type { AgentTool, AgentToolContext, AgentToolSchema } from "./types.js";

export interface ToolDispatchResult {
  tool: string;
  result: Record<string, unknown>;
}

export interface ToolCallLogEntry {
  id: string;
  tool: string;
  category: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  error: string | null;
  startedAt: string;
  durationMs: number;
  projectId: string;
  conversationId: string;
  requestId: string;
  userId: string;
}

export class AgentToolRegistry {
  private readonly tools = new Map<string, AgentTool>();
  private readonly logs: ToolCallLogEntry[] = [];
  private logSequence = 0;
  private maxLogs = 2000;
  private dataDir: string | null = null;

  register(tool: AgentTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  enableLogging(dataDir: string, maxLogs = 2000): void {
    this.dataDir = dataDir;
    this.maxLogs = maxLogs;
    this.loadLogs();
  }

  list(): AgentTool[] {
    return [...this.tools.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  schemas(): AgentToolSchema[] {
    return this.list().map((tool) => tool.schema);
  }

  toOpenAIToolDefinitions(): ChatToolDefinition[] {
    return this.list().map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.schema.name,
        description: tool.schema.description,
        parameters: tool.schema.parameters
      }
    }));
  }

  async dispatch(name: string, args: Record<string, unknown>, context: AgentToolContext): Promise<ToolDispatchResult> {
    const tool = this.tools.get(name);
    const startedAt = Date.now();

    if (!tool) {
      const result: ToolDispatchResult = { tool: name, result: { error: `Unknown tool: ${name}` } };
      this.recordLog({ tool: name, category: "unknown", args, result: result.result, error: `Unknown tool: ${name}`, startedAt, context });
      return result;
    }

    try {
      const rawResult = await tool.run(args, context);
      const result = compactToolResult(rawResult, context, name, args);
      this.recordLog({ tool: name, category: tool.category, args, result, error: null, startedAt, context });
      return { tool: name, result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Tool execution failed.";
      const result: ToolDispatchResult = { tool: name, result: { error: errorMessage } };
      this.recordLog({ tool: name, category: tool.category, args, result: result.result, error: errorMessage, startedAt, context });
      return result;
    }
  }

  /** Return recent log entries (newest first), optionally filtered by project or tool. */
  queryLogs(filter?: { projectId?: string; tool?: string; limit?: number }): ToolCallLogEntry[] {
    let results = [...this.logs];
    if (filter?.projectId) {
      results = results.filter((e) => e.projectId === filter.projectId);
    }
    if (filter?.tool) {
      results = results.filter((e) => e.tool === filter.tool);
    }
    return results.slice(0, filter?.limit ?? 100);
  }

  /** Return the total number of logged tool calls. */
  logCount(): number {
    return this.logs.length;
  }

  // ---- internal ----

  private recordLog(params: {
    tool: string;
    category: string;
    args: Record<string, unknown>;
    result: Record<string, unknown>;
    error: string | null;
    startedAt: number;
    context: AgentToolContext;
  }): void {
    this.logSequence += 1;
    const entry: ToolCallLogEntry = {
      id: `tclog_${String(this.logSequence).padStart(8, "0")}`,
      tool: params.tool,
      category: params.category,
      args: params.args,
      result: params.result,
      error: params.error,
      startedAt: new Date(params.startedAt).toISOString(),
      durationMs: Date.now() - params.startedAt,
      projectId: params.context.projectId,
      conversationId: params.context.conversationId,
      requestId: params.context.requestId,
      userId: params.context.userId
    };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.splice(0, this.logs.length - this.maxLogs);
    }
    this.persistLogs();
  }

  private persistLogs(): void {
    if (!this.dataDir) return;
    try {
      if (!existsSync(this.dataDir)) {
        mkdirSync(this.dataDir, { recursive: true });
      }
      writeFileSync(this.logPath(), JSON.stringify(this.logs, null, 2), "utf8");
    } catch {
      // best effort
    }
  }

  private loadLogs(): void {
    if (!this.dataDir) return;
    try {
      const filePath = this.logPath();
      if (existsSync(filePath)) {
        const raw = readFileSync(filePath, "utf8");
        const stored: ToolCallLogEntry[] = JSON.parse(raw);
        let maxSeq = 0;
        for (const entry of stored) {
          this.logs.push(entry);
          const match = /^tclog_(\d+)$/.exec(entry.id);
          if (match) maxSeq = Math.max(maxSeq, Number(match[1]!));
        }
        this.logSequence = maxSeq;
      }
    } catch {
      // best effort
    }
  }

  private logPath(): string {
    return path.join(this.dataDir!, "tool_call_logs.json");
  }
}
