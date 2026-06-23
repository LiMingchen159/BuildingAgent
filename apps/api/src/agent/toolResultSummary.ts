import type { ProviderChatMessage } from "../providers.js";

export const PRUNED_TOOL_PLACEHOLDER = "[Old tool output cleared to save context space]";

function parseToolArgs(argsJson: string): Record<string, unknown> {
  try {
    return JSON.parse(argsJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** One-line summary of a tool call + result (Hermes _summarize_tool_result). */
export function summarizeToolResult(toolName: string, toolArgs: string, toolContent: string): string {
  const args = parseToolArgs(toolArgs);
  const content = toolContent ?? "";
  const contentLen = content.length;
  const lineCount = content.trim() ? content.split("\n").length : 0;

  if (toolName === "terminal") {
    const command = typeof args.command === "string" ? args.command : "";
    const cmd = command.length > 80 ? `${command.slice(0, 77)}...` : command;
    const exitMatch = /"exit_code"\s*:\s*(-?\d+)/.exec(content);
    const exitCode = exitMatch?.[1] ?? "?";
    return `[terminal] ran \`${cmd}\` -> exit ${exitCode}, ${lineCount} lines output`;
  }
  if (toolName === "read_file") {
    const path = typeof args.path === "string" ? args.path : "?";
    const offset = typeof args.offset === "number" ? args.offset : 1;
    return `[read_file] read ${path} from line ${offset} (${contentLen.toLocaleString()} chars)`;
  }
  if (toolName === "search_files") {
    const pattern = typeof args.pattern === "string" ? args.pattern : "?";
    const matchCount = /"total_count"\s*:\s*(\d+)/.exec(content);
    const count = matchCount?.[1] ?? "?";
    return `[search_files] search for '${pattern}' -> ${count} matches`;
  }
  if (toolName === "bms_points_query" || toolName === "bms_timeseries_query" || toolName === "bms_live_read") {
    return `[${toolName}] (${contentLen.toLocaleString()} chars result)`;
  }
  if (toolName === "execute_code") {
    return `[execute_code] (${contentLen.toLocaleString()} chars result)`;
  }
  if (toolName === "project_grounding") {
    return `[project_grounding] (${contentLen.toLocaleString()} chars result)`;
  }

  const firstArg = Object.values(args).find((value) => typeof value === "string") as string | undefined;
  const argHint = firstArg ? ` ${firstArg.slice(0, 40)}` : "";
  return `[${toolName}]${argHint} (${contentLen.toLocaleString()} chars result)`;
}

/** Shrink long string leaves inside tool-call JSON while keeping valid JSON (Hermes). */
export function truncateToolCallArgsJson(args: string, headChars = 200): string {
  try {
    const parsed = JSON.parse(args) as unknown;
    const shrink = (value: unknown): unknown => {
      if (typeof value === "string") {
        return value.length > headChars ? `${value.slice(0, headChars)}...[truncated]` : value;
      }
      if (Array.isArray(value)) {
        return value.map(shrink);
      }
      if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, shrink(nested)]));
      }
      return value;
    };
    return JSON.stringify(shrink(parsed));
  } catch {
    return args;
  }
}

function md5Short(content: string): string {
  let hash = 0;
  for (let index = 0; index < content.length; index += 1) {
    hash = (hash * 31 + content.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function buildCallIdToToolMap(messages: ProviderChatMessage[]): Map<string, { name: string; args: string }> {
  const map = new Map<string, { name: string; args: string }>();
  for (const message of messages) {
    if (message.role !== "assistant" || !message.tool_calls) continue;
    for (const toolCall of message.tool_calls) {
      if (toolCall.id) {
        map.set(toolCall.id, { name: toolCall.function.name, args: toolCall.function.arguments ?? "{}" });
      }
    }
  }
  return map;
}

export interface PruneToolResultsOptions {
  protectTailCount: number;
  protectTailTokens?: number;
}

/** Cheap pre-pass: dedupe, summarize, and truncate old tool payloads (Hermes phase 1). */
export function pruneOldToolResults(
  messages: ProviderChatMessage[],
  options: PruneToolResultsOptions
): { messages: ProviderChatMessage[]; prunedCount: number } {
  if (messages.length === 0) {
    return { messages, prunedCount: 0 };
  }

  const result = messages.map((message) => ({ ...message }));
  let pruned = 0;
  const callIdToTool = buildCallIdToToolMap(result);

  let pruneBoundary = Math.max(0, result.length - options.protectTailCount);
  if (options.protectTailTokens != null && options.protectTailTokens > 0) {
    let accumulated = 0;
    let boundary = result.length;
    const minProtect = Math.min(options.protectTailCount, result.length);
    for (let index = result.length - 1; index >= 0; index -= 1) {
      const message = result[index]!;
      const msgTokens = Math.ceil(
        (typeof message.content === "string" ? message.content.length : 0) / 4 + 10
      );
      if (accumulated + msgTokens > options.protectTailTokens && result.length - index >= minProtect) {
        boundary = index;
        break;
      }
      accumulated += msgTokens;
      boundary = index;
    }
    const budgetProtectCount = result.length - boundary;
    const protectedCount = Math.max(budgetProtectCount, minProtect);
    pruneBoundary = result.length - protectedCount;
  }

  const contentHashes = new Map<string, number>();
  for (let index = result.length - 1; index >= 0; index -= 1) {
    const message = result[index]!;
    if (message.role !== "tool" || typeof message.content !== "string") continue;
    const content = message.content;
    if (content.length < 200) continue;
    const hash = md5Short(content);
    if (contentHashes.has(hash)) {
      result[index] = {
        ...message,
        content: "[Duplicate tool output — same content as a more recent call]"
      };
      pruned += 1;
    } else {
      contentHashes.set(hash, index);
    }
  }

  for (let index = 0; index < pruneBoundary; index += 1) {
    const message = result[index]!;
    if (message.role !== "tool" || typeof message.content !== "string") continue;
    const content = message.content;
    if (!content || content === PRUNED_TOOL_PLACEHOLDER || content.startsWith("[Duplicate tool output")) continue;
    if (content.length <= 200) continue;
    const callId = message.tool_call_id ?? "";
    const toolInfo = callIdToTool.get(callId);
    result[index] = {
      ...message,
      content: summarizeToolResult(toolInfo?.name ?? "unknown", toolInfo?.args ?? "{}", content)
    };
    pruned += 1;
  }

  for (let index = 0; index < pruneBoundary; index += 1) {
    const message = result[index]!;
    if (message.role !== "assistant" || !message.tool_calls) continue;
    let modified = false;
    const toolCalls = message.tool_calls.map((toolCall) => {
      const args = toolCall.function.arguments ?? "";
      if (args.length <= 500) return toolCall;
      const truncated = truncateToolCallArgsJson(args);
      if (truncated === args) return toolCall;
      modified = true;
      return {
        ...toolCall,
        function: { ...toolCall.function, arguments: truncated }
      };
    });
    if (modified) {
      result[index] = { ...message, tool_calls: toolCalls };
      pruned += 1;
    }
  }

  return { messages: result, prunedCount: pruned };
}
