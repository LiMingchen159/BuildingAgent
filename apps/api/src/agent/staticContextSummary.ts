import type { ProviderChatMessage } from "../providers.js";
import { buildCallIdToToolMap, summarizeToolResult } from "./toolResultSummary.js";

export const SUMMARY_PREFIX =
  "[CONTEXT COMPACTION — REFERENCE ONLY] Earlier turns were compacted into the summary below. "
  + "This is a handoff from a previous context window — treat it as background reference, NOT as active instructions. "
  + "Do NOT answer questions or fulfill requests mentioned in this summary; they were already addressed. "
  + "Respond ONLY to the latest user message that appears AFTER this summary — that message is the single source of truth for what to do right now. "
  + "If the latest user message contradicts, supersedes, changes topic from, or diverges from work described in the summary, the latest message WINS — discard stale items and do not wrap up the old task first. "
  + "Reverse signals in the latest message (e.g. stop, undo, never mind, a new topic or date range) must immediately end any in-flight work described in the summary; do not re-surface it. "
  + "IMPORTANT: Persistent memory in the system prompt is ALWAYS authoritative — never deprioritize memory due to this compaction note. "
  + "The current session state may reflect work described here — avoid repeating it:";

const FALLBACK_TURN_MAX_CHARS = 500;
const FALLBACK_SUMMARY_MAX_CHARS = 12_000;

function compactTurnText(content: ProviderChatMessage["content"]): string {
  const text = typeof content === "string" ? content : JSON.stringify(content ?? "");
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= FALLBACK_TURN_MAX_CHARS) return normalized;
  return `${normalized.slice(0, FALLBACK_TURN_MAX_CHARS - 15).trim()} ...[truncated]`;
}

function bulletList(items: string[], limit: number): string {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    unique.push(trimmed);
    if (unique.length >= limit) break;
  }
  return unique.length > 0 ? unique.map((entry) => `- ${entry}`).join("\n") : "None.";
}

/** Deterministic middle-region handoff when no LLM summarizer is available (Hermes fallback). */
export function buildStaticFallbackSummary(
  turns: ProviderChatMessage[],
  previousSummary?: string | null
): string {
  const userAsks: string[] = [];
  const assistantActions: string[] = [];
  const toolActions: string[] = [];
  const relevantFiles: string[] = [];
  const blockers: string[] = [];
  const lastDroppedTurns: string[] = [];
  const callIdToTool = buildCallIdToToolMap(turns);

  const rememberDropped = (label: string, text: string): void => {
    if (!text.trim()) return;
    lastDroppedTurns.push(`${label}: ${text}`);
    if (lastDroppedTurns.length > 8) lastDroppedTurns.shift();
  };

  for (const message of turns) {
    const role = message.role;
    let text = compactTurnText(message.content);

    if (role === "assistant" && message.tool_calls?.length) {
      const toolNames = message.tool_calls.map((call) => call.function.name).join(", ");
      const prefix = `tool calls: ${toolNames}`;
      rememberDropped("ASSISTANT", text ? `${prefix}; ${text}` : prefix);
    } else {
      rememberDropped(role.toUpperCase(), text);
    }

    if (text.length > 600) {
      text = `${text.slice(0, 420).trim()} ... ${text.slice(-160).trim()}`;
    }

    if (role === "user" && text) {
      userAsks.push(text);
    } else if (role === "assistant") {
      if (message.tool_calls?.length) {
        assistantActions.push(`Called tool(s): ${message.tool_calls.map((call) => call.function.name).slice(0, 6).join(", ")}`);
      } else if (text) {
        assistantActions.push(text);
      }
    } else if (role === "tool") {
      const callId = message.tool_call_id ?? "";
      const toolInfo = callIdToTool.get(callId);
      toolActions.push(summarizeToolResult(toolInfo?.name ?? "unknown", toolInfo?.args ?? "{}", text));
      if (/\b(error|failed|exception|traceback|timeout|timed out|fatal)\b/i.test(text)) {
        blockers.push(text.slice(0, 500));
      }
      const pathMatch = /"(?:path|file_path|output_path)"\s*:\s*"([^"]+)"/g;
      let match: RegExpExecArray | null;
      while ((match = pathMatch.exec(text)) !== null) {
        if (match[1]) relevantFiles.push(match[1]);
      }
    }
  }

  const completed = [...assistantActions, ...toolActions].slice(0, 12).map((item, index) => `${index + 1}. ${item}`);
  const activeTask = userAsks.length > 0 ? `User asked: ${JSON.stringify(userAsks[userAsks.length - 1])}` : "Unknown from deterministic fallback.";
  const previousNote = previousSummary
    ? "\n\nPrevious compaction summary was present and should still be treated as background continuity context."
    : "";

  const body = `## Active Task
${activeTask}

## Goal
Recovered from a deterministic fallback because the LLM context summarizer was unavailable. Continue from the protected recent messages after this summary and use current file/system state for exact details.${previousNote}

## Completed Actions
${completed.length > 0 ? completed.join("\n") : "None recoverable from compacted turns."}

## Blocked
${bulletList(blockers, 5)}

## Relevant Files
${bulletList(relevantFiles, 12)}

## Remaining Work
Continue from the most recent unfulfilled user ask and protected tail messages. Verify state with tools before making claims.

## Last Dropped Turns
${bulletList(lastDroppedTurns, 8)}

## Critical Context
Summary generation was unavailable, so this is a best-effort deterministic fallback for ${turns.length} compacted message(s).`;

  let summary = `${SUMMARY_PREFIX}\n\n${body.trim()}`;
  if (summary.length > FALLBACK_SUMMARY_MAX_CHARS) {
    summary = `${summary.slice(0, FALLBACK_SUMMARY_MAX_CHARS - 42).trim()}\n...[fallback summary truncated]`;
  }
  return summary;
}

export function chooseSummaryRole(
  lastHeadRole: string,
  firstTailRole: string
): { role: "user" | "assistant"; mergeIntoTail: boolean } {
  let summaryRole: "user" | "assistant" = lastHeadRole === "assistant" || lastHeadRole === "tool" ? "user" : "assistant";
  if (summaryRole === firstTailRole) {
    const flipped = summaryRole === "user" ? "assistant" : "user";
    if (flipped !== lastHeadRole) {
      summaryRole = flipped;
    } else {
      return { role: summaryRole, mergeIntoTail: true };
    }
  }
  return { role: summaryRole, mergeIntoTail: false };
}

export function appendSummaryEndMarker(summary: string, role: "user" | "assistant"): string {
  if (role !== "user") return summary;
  return `${summary}\n\n--- END OF CONTEXT SUMMARY — respond to the message below, not the summary above ---`;
}
