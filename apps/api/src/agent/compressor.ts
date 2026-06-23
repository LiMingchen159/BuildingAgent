import type { ProviderChatMessage } from "../providers.js";
import {
  alignBoundaryForward,
  findTailCutByTokens,
  protectHeadSize
} from "./contextBoundaries.js";
import { estimateMessagesTokensRough, MINIMUM_CONTEXT_LENGTH } from "./contextTokens.js";
import {
  appendSummaryEndMarker,
  buildStaticFallbackSummary,
  chooseSummaryRole
} from "./staticContextSummary.js";
import { pruneOldToolResults } from "./toolResultSummary.js";

export {
  sanitizeToolPairs,
  splitProviderMessagesIntoBlocks
} from "./compressorPairs.js";

import { sanitizeToolPairs } from "./compressorPairs.js";

const STUB_TOOL_RESULT = "[Result from earlier conversation — cleared during context compression]";

export type ContextSummarizer = (turns: ProviderChatMessage[]) => Promise<string | null>;

export interface ContextCompressorOptions {
  contextLength?: number;
  thresholdPercent?: number;
  protectFirstN?: number;
  protectLastN?: number;
  summaryTargetRatio?: number;
  minimumThresholdTokens?: number;
  summarizer?: ContextSummarizer;
}

export interface ContextCompressionResult {
  messages: ProviderChatMessage[];
  changed: boolean;
  prunedCount: number;
  summarizedTurns: number;
}

export class ContextCompressor {
  readonly contextLength: number;
  readonly thresholdTokens: number;
  readonly tailTokenBudget: number;
  readonly protectFirstN: number;
  readonly protectLastN: number;
  private readonly summarizer: ContextSummarizer | undefined;
  private previousSummary: string | null = null;
  private ineffectiveCompressionCount = 0;

  constructor(options: ContextCompressorOptions = {}) {
    const thresholdPercent = options.thresholdPercent ?? 0.5;
    const summaryTargetRatio = Math.max(0.1, Math.min(options.summaryTargetRatio ?? 0.2, 0.8));
    this.contextLength = options.contextLength ?? 128_000;
    this.protectFirstN = options.protectFirstN ?? 3;
    this.protectLastN = options.protectLastN ?? 20;
    const minimumThreshold = options.minimumThresholdTokens ?? MINIMUM_CONTEXT_LENGTH;
    this.thresholdTokens = Math.max(
      Math.floor(this.contextLength * thresholdPercent),
      minimumThreshold
    );
    this.tailTokenBudget = Math.floor(this.thresholdTokens * summaryTargetRatio);
    this.summarizer = options.summarizer;
  }

  shouldCompress(messages: ProviderChatMessage[], promptTokens?: number): boolean {
    const tokens = promptTokens ?? estimateMessagesTokensRough(messages);
    if (tokens < this.thresholdTokens) {
      return false;
    }
    if (this.ineffectiveCompressionCount >= 2) {
      return false;
    }
    return this.hasContentToCompress(messages);
  }

  hasContentToCompress(messages: ProviderChatMessage[]): boolean {
    const compressStart = alignBoundaryForward(messages, protectHeadSize(messages, this.protectFirstN));
    const compressEnd = findTailCutByTokens(messages, compressStart, this.tailTokenBudget);
    return compressStart < compressEnd;
  }

  /** Hermes-style compression: prune → protect head/tail → summarize middle → sanitize pairs. */
  async compress(messages: ProviderChatMessage[]): Promise<ContextCompressionResult> {
    const beforeTokens = estimateMessagesTokensRough(messages);
    const minForCompress = protectHeadSize(messages, this.protectFirstN) + 3 + 1;
    if (messages.length <= minForCompress) {
      return { messages: sanitizeToolPairs(messages), changed: false, prunedCount: 0, summarizedTurns: 0 };
    }

    const { messages: prunedMessages, prunedCount } = pruneOldToolResults(messages, {
      protectTailCount: this.protectLastN,
      protectTailTokens: this.tailTokenBudget
    });

    const compressStart = alignBoundaryForward(
      prunedMessages,
      protectHeadSize(prunedMessages, this.protectFirstN)
    );
    const compressEnd = findTailCutByTokens(prunedMessages, compressStart, this.tailTokenBudget);
    if (compressStart >= compressEnd) {
      const sanitized = sanitizeToolPairs(prunedMessages);
      return {
        messages: sanitized,
        changed: prunedCount > 0 || !messagesEqual(messages, sanitized),
        prunedCount,
        summarizedTurns: 0
      };
    }

    const turnsToSummarize = prunedMessages.slice(compressStart, compressEnd);
    let summary = this.summarizer ? await this.summarizer(turnsToSummarize) : null;
    if (!summary?.trim()) {
      summary = buildStaticFallbackSummary(turnsToSummarize, this.previousSummary);
    }
    this.previousSummary = summary;

    const head = prunedMessages.slice(0, compressStart);
    const tail = prunedMessages.slice(compressEnd);
    const lastHeadRole = head[head.length - 1]?.role ?? "user";
    const firstTailRole = tail[0]?.role ?? "user";
    const { role: summaryRole, mergeIntoTail } = chooseSummaryRole(lastHeadRole, firstTailRole);
    const summaryContent = appendSummaryEndMarker(summary, summaryRole);

    const compressed: ProviderChatMessage[] = [...head];
    if (!mergeIntoTail) {
      compressed.push({ role: summaryRole, content: summaryContent });
    }

    for (let index = 0; index < tail.length; index += 1) {
      const message = tail[index]!;
      if (mergeIntoTail && index === 0) {
        const mergedPrefix =
          `${summaryContent}\n\n--- END OF CONTEXT SUMMARY — respond to the message below, not the summary above ---\n\n`;
        const existing = typeof message.content === "string" ? message.content : "";
        compressed.push({ ...message, content: `${mergedPrefix}${existing}`.trim() });
        continue;
      }
      compressed.push(message);
    }

    const sanitized = sanitizeToolPairs(compressed);
    const afterTokens = estimateMessagesTokensRough(sanitized);
    const savingsPct = beforeTokens > 0 ? ((beforeTokens - afterTokens) / beforeTokens) * 100 : 100;
    if (savingsPct < 10) {
      this.ineffectiveCompressionCount += 1;
    } else {
      this.ineffectiveCompressionCount = 0;
    }

    return {
      messages: sanitized,
      changed: prunedCount > 0 || turnsToSummarize.length > 0 || !messagesEqual(messages, sanitized),
      prunedCount,
      summarizedTurns: turnsToSummarize.length
    };
  }

  /** Synchronous path for tests and lightweight pruning-only passes. */
  compressSync(messages: ProviderChatMessage[]): ContextCompressionResult {
    const { messages: prunedMessages, prunedCount } = pruneOldToolResults(messages, {
      protectTailCount: this.protectLastN,
      protectTailTokens: this.tailTokenBudget
    });
    const sanitized = sanitizeToolPairs(prunedMessages);
    return {
      messages: sanitized,
      changed: prunedCount > 0 || !messagesEqual(messages, sanitized),
      prunedCount,
      summarizedTurns: 0
    };
  }
}

function messagesEqual(left: ProviderChatMessage[], right: ProviderChatMessage[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
