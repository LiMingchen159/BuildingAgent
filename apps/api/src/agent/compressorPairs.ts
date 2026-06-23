import type { ProviderChatMessage } from "../providers.js";

const STUB_TOOL_RESULT = "[Result from earlier conversation — cleared during context compression]";

type MessageBlock =
  | { kind: "single"; messages: [ProviderChatMessage] }
  | { kind: "tool_group"; messages: ProviderChatMessage[] };

function toolCallId(toolCall: NonNullable<ProviderChatMessage["tool_calls"]>[number]): string {
  return toolCall.id?.trim() ?? "";
}

/** Split non-system messages into atomic blocks; tool results stay with their assistant tool_calls row. */
export function splitProviderMessagesIntoBlocks(messages: ProviderChatMessage[]): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  let index = 0;
  while (index < messages.length) {
    const message = messages[index]!;
    if (message.role === "assistant" && message.tool_calls && message.tool_calls.length > 0) {
      const group: ProviderChatMessage[] = [message];
      index += 1;
      while (index < messages.length && messages[index]!.role === "tool") {
        group.push(messages[index]!);
        index += 1;
      }
      blocks.push({ kind: "tool_group", messages: group });
      continue;
    }
    blocks.push({ kind: "single", messages: [message] });
    index += 1;
  }
  return blocks;
}

/**
 * Fix orphaned tool_call / tool pairs after compression.
 * Mirrors Hermes ContextCompressor._sanitize_tool_pairs.
 */
export function sanitizeToolPairs(messages: ProviderChatMessage[]): ProviderChatMessage[] {
  const survivingCallIds = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant" || !message.tool_calls) continue;
    for (const toolCall of message.tool_calls) {
      const callId = toolCallId(toolCall);
      if (callId) survivingCallIds.add(callId);
    }
  }

  const resultCallIds = new Set<string>();
  for (const message of messages) {
    if (message.role === "tool" && message.tool_call_id) {
      resultCallIds.add(message.tool_call_id);
    }
  }

  let sanitized = messages.filter((message) => {
    if (message.role !== "tool" || !message.tool_call_id) return true;
    return survivingCallIds.has(message.tool_call_id);
  });

  const missingResults = [...survivingCallIds].filter((callId) => !resultCallIds.has(callId));
  if (missingResults.length === 0) {
    return sanitized;
  }

  const missing = new Set(missingResults);
  const patched: ProviderChatMessage[] = [];
  for (const message of sanitized) {
    patched.push(message);
    if (message.role !== "assistant" || !message.tool_calls) continue;
    for (const toolCall of message.tool_calls) {
      const callId = toolCallId(toolCall);
      if (!callId || !missing.has(callId)) continue;
      patched.push({
        role: "tool",
        content: STUB_TOOL_RESULT,
        tool_call_id: callId
      });
      missing.delete(callId);
    }
  }

  return patched;
}
