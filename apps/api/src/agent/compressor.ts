import type { ProviderChatMessage } from "../providers.js";

export class ContextCompressor {
  constructor(
    private readonly maxMessages = 40,
    private readonly tailKeep = 8
  ) {}

  /** Compress conversation messages to stay within the max message budget. */
  compress(messages: ProviderChatMessage[]): ProviderChatMessage[] {
    if (messages.length <= this.maxMessages) return messages;

    const systemMessages: ProviderChatMessage[] = [];
    const nonSystem: ProviderChatMessage[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemMessages.push(msg);
      } else {
        nonSystem.push(msg);
      }
    }

    // If total messages fit within budget, return as-is
    if (systemMessages.length + nonSystem.length <= this.maxMessages) {
      return messages;
    }

    // Strategy: keep all system messages + tail recent messages + tool dedup
    const budget = this.maxMessages - systemMessages.length;
    if (budget <= 0) return [...systemMessages, ...nonSystem.slice(-this.tailKeep)];

    // Separate tail from older messages
    const tail = nonSystem.slice(-this.tailKeep);
    const older = nonSystem.slice(0, -this.tailKeep);
    const olderBudget = budget - tail.length;
    if (olderBudget <= 0) return [...systemMessages, ...tail];

    // For older messages: deduplicate tool results, keep only the newest per tool_call_id
    // Also keep user/assistant messages that aren't redundant
    const seenToolIds = new Set<string>();
    const compressed: ProviderChatMessage[] = [];

    // Process older messages from newest to oldest for dedup
    for (let i = older.length - 1; i >= 0; i--) {
      const msg = older[i]!;
      if (msg.role === "tool" && msg.tool_call_id) {
        if (seenToolIds.has(msg.tool_call_id)) continue;
        seenToolIds.add(msg.tool_call_id);
      }
      compressed.unshift(msg);
      if (compressed.length >= olderBudget) break;
    }

    // If we still have budget, fill in more from the front
    const result = [...systemMessages, ...compressed, ...tail];

    return result.slice(-this.maxMessages);
  }
}
