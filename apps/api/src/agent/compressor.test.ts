import { describe, expect, it } from "vitest";
import type { ProviderChatMessage } from "../providers.js";
import { ContextCompressor, sanitizeToolPairs, splitProviderMessagesIntoBlocks } from "./compressor.js";
import { buildStaticFallbackSummary, SUMMARY_PREFIX } from "./staticContextSummary.js";
import { pruneOldToolResults, summarizeToolResult } from "./toolResultSummary.js";

function assistantWithTools(id: string, toolNames: string[]): ProviderChatMessage {
  return {
    role: "assistant",
    content: null,
    tool_calls: toolNames.map((name, index) => ({
      id: `${id}_${index}`,
      type: "function",
      function: { name, arguments: "{}" }
    }))
  };
}

function toolResult(callId: string, payload: Record<string, unknown> = { ok: true }): ProviderChatMessage {
  return {
    role: "tool",
    content: JSON.stringify({ ...payload, callId }),
    tool_call_id: callId
  };
}

describe("Hermes-style context compression", () => {
  it("groups assistant tool_calls with following tool results", () => {
    const blocks = splitProviderMessagesIntoBlocks([
      { role: "user", content: "hello" },
      assistantWithTools("a1", ["read_file"]),
      toolResult("a1_0"),
      { role: "assistant", content: "done" }
    ]);
    expect(blocks).toHaveLength(3);
    expect(blocks[1]).toMatchObject({ kind: "tool_group" });
  });

  it("removes orphaned tool results", () => {
    const sanitized = sanitizeToolPairs([
      { role: "user", content: "hello" },
      toolResult("missing_call")
    ]);
    expect(sanitized).toEqual([{ role: "user", content: "hello" }]);
  });

  it("adds stub tool results for assistant tool_calls missing results", () => {
    const sanitized = sanitizeToolPairs([
      { role: "user", content: "hello" },
      assistantWithTools("a1", ["read_file"])
    ]);
    expect(sanitized).toHaveLength(3);
    expect(sanitized[2]).toMatchObject({ role: "tool", tool_call_id: "a1_0" });
  });

  it("summarizes large old tool outputs during pruning", () => {
    const oldContent = "a".repeat(500);
    const newContent = "b".repeat(500);
    const messages: ProviderChatMessage[] = [
      { role: "user", content: "q" },
      assistantWithTools("old", ["read_file"]),
      { role: "tool", content: oldContent, tool_call_id: "old_0" },
      { role: "user", content: "q2" },
      assistantWithTools("new", ["terminal"]),
      { role: "tool", content: newContent, tool_call_id: "new_0" }
    ];
    const { messages: pruned, prunedCount } = pruneOldToolResults(messages, {
      protectTailCount: 2
    });
    expect(prunedCount).toBeGreaterThan(0);
    expect(pruned[2]?.content).toContain("[read_file]");
    expect(typeof pruned[5]?.content).toBe("string");
    expect((pruned[5]?.content as string).length).toBeGreaterThan(400);
  });

  it("builds static fallback summary with Hermes prefix", () => {
    const summary = buildStaticFallbackSummary([
      { role: "user", content: "How many chillers are running?" },
      assistantWithTools("a1", ["bms_points_query"]),
      toolResult("a1_0", { count: 4 })
    ]);
    expect(summary.startsWith(SUMMARY_PREFIX)).toBe(true);
    expect(summary).toContain("chillers");
    expect(summarizeToolResult("terminal", '{"command":"npm test"}', '{"exit_code":0,"output":"ok"}')).toContain("[terminal]");
  });

  it("does not leave orphan tool messages after full compression", async () => {
    const messages: ProviderChatMessage[] = [{ role: "system", content: "sys" }];
    for (let turn = 0; turn < 12; turn += 1) {
      messages.push({ role: "user", content: `question ${turn}` });
      messages.push(assistantWithTools(`turn_${turn}`, ["bms_points_query"]));
      messages.push(toolResult(`turn_${turn}_0`, { data: "x".repeat(1200) }));
      messages.push({ role: "assistant", content: `answer ${turn}` });
    }

    const compressor = new ContextCompressor({
      contextLength: 32_000,
      thresholdPercent: 0.1,
      minimumThresholdTokens: 500,
      protectFirstN: 1,
      protectLastN: 6
    });
    expect(compressor.shouldCompress(messages)).toBe(true);

    const compressed = await compressor.compress(messages);
    for (let index = 0; index < compressed.messages.length; index += 1) {
      const message = compressed.messages[index]!;
      if (message.role !== "tool") continue;
      const previous = compressed.messages[index - 1];
      expect(previous?.role).toBe("assistant");
      expect(previous?.tool_calls?.some((call) => call.id === message.tool_call_id)).toBe(true);
    }
    expect(compressed.summarizedTurns).toBeGreaterThan(0);
  });
});
