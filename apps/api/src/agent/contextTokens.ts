import type { ProviderChatMessage } from "../providers.js";

/** Rough chars-per-token estimate (Hermes uses 4). */
export const CHARS_PER_TOKEN = 4;

export const MINIMUM_CONTEXT_LENGTH = 64_000;

export function contentLengthForBudget(content: ProviderChatMessage["content"]): number {
  if (content == null) return 0;
  if (typeof content === "string") return content.length;
  return JSON.stringify(content).length;
}

export function estimateMessageTokens(message: ProviderChatMessage): number {
  let tokens = contentLengthForBudget(message.content) / CHARS_PER_TOKEN + 10;
  if (message.tool_calls) {
    for (const toolCall of message.tool_calls) {
      tokens += (toolCall.function.arguments?.length ?? 0) / CHARS_PER_TOKEN;
    }
  }
  return Math.ceil(tokens);
}

export function estimateMessagesTokensRough(messages: ProviderChatMessage[]): number {
  return messages.reduce((total, message) => total + estimateMessageTokens(message), 0);
}
