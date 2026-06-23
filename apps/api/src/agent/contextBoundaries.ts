import type { ProviderChatMessage } from "../providers.js";
import { contentLengthForBudget, CHARS_PER_TOKEN } from "./contextTokens.js";

export function alignBoundaryForward(messages: ProviderChatMessage[], index: number): number {
  let cursor = index;
  while (cursor < messages.length && messages[cursor]?.role === "tool") {
    cursor += 1;
  }
  return cursor;
}

export function alignBoundaryBackward(messages: ProviderChatMessage[], index: number): number {
  if (index <= 0 || index >= messages.length) {
    return index;
  }
  let check = index - 1;
  while (check >= 0 && messages[check]?.role === "tool") {
    check -= 1;
  }
  const parent = messages[check];
  if (check >= 0 && parent?.role === "assistant" && parent.tool_calls?.length) {
    return check;
  }
  return index;
}

export function protectHeadSize(messages: ProviderChatMessage[], protectFirstN: number): number {
  let head = messages[0]?.role === "system" ? 1 : 0;
  return head + protectFirstN;
}

function findLastUserMessageIndex(messages: ProviderChatMessage[], headEnd: number): number {
  for (let index = messages.length - 1; index >= headEnd; index -= 1) {
    if (messages[index]?.role === "user") return index;
  }
  return -1;
}

export function ensureLastUserMessageInTail(
  messages: ProviderChatMessage[],
  cutIndex: number,
  headEnd: number
): number {
  const lastUserIndex = findLastUserMessageIndex(messages, headEnd);
  if (lastUserIndex < 0 || lastUserIndex >= cutIndex) {
    return cutIndex;
  }
  return Math.max(lastUserIndex, headEnd + 1);
}

export function findTailCutByTokens(
  messages: ProviderChatMessage[],
  headEnd: number,
  tokenBudget: number
): number {
  const total = messages.length;
  const minTail = total - headEnd > 1 ? Math.min(3, total - headEnd - 1) : 0;
  const softCeiling = Math.floor(tokenBudget * 1.5);
  let accumulated = 0;
  let cutIndex = total;

  for (let index = total - 1; index >= headEnd; index -= 1) {
    const message = messages[index]!;
    let msgTokens = Math.floor(contentLengthForBudget(message.content) / CHARS_PER_TOKEN) + 10;
    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        msgTokens += Math.floor((toolCall.function.arguments?.length ?? 0) / CHARS_PER_TOKEN);
      }
    }
    if (accumulated + msgTokens > softCeiling && total - index >= minTail) {
      break;
    }
    accumulated += msgTokens;
    cutIndex = index;
  }

  const fallbackCut = total - minTail;
  cutIndex = Math.min(cutIndex, fallbackCut);
  if (cutIndex <= headEnd) {
    cutIndex = Math.max(fallbackCut, headEnd + 1);
  }

  cutIndex = alignBoundaryBackward(messages, cutIndex);
  cutIndex = ensureLastUserMessageInTail(messages, cutIndex, headEnd);
  return Math.max(cutIndex, headEnd + 1);
}
