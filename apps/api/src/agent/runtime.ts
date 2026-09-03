import type { AgentMemoryStore } from "./memory.js";
import type { AgentSkillRegistry } from "./skills.js";
import type { AgentToolRegistry } from "./tools.js";
import type { AgentLifecycleEvent, AgentLifecycleEventType, AgentLoopResult, AgentTurnRequest, AgentTurnResult } from "./types.js";
import {
  memoryGuidanceBlock,
  sameTurnMemoryOverflowBlock,
  sessionSearchGuidanceBlock,
  sessionSearchPrefetchHintBlock
} from "./memoryGuidance.js";
import { perTurnLanguageBlock } from "./locale.js";
import { executionDisciplineBlock, platformBoundsNotice, platformKernelPrompt, projectInputsPrompt } from "./systemPrompt.js";
import { temporalQueryHintBlock, wallClockContextBlock } from "./temporalContext.js";
import { groundingPromptBlock, type ProjectGroundingBindings, type ProjectGroundingRule } from "../projectGrounding.js";
import { feedbackProposalGuidanceBlock, isLikelyCorrectionTurn, playbooksPromptBlock, type ProjectFeedbackBindings } from "../projectFeedback.js";
import type { FeedbackEpisode, RuleErrorType } from "../projectRules.js";
import type { GroundingRuleIndex } from "../groundingRuleIndex.js";
import { formatRetrievedRulesPreview, resolveRuleDisplayName, siteRuleTemplateGuidanceBlock } from "../projectRules.js";
import { alwaysOnGroundingRules, retrieveGroundingRules, selectGroundingForTurn, shouldAttemptGroundingRuleRetrieval } from "../groundingRuleRetrieval.js";
import { validateAssistantAgainstRules } from "../projectRuleValidator.js";
import { hasSiteRuleSaveConsent, siteRuleSaveConsentHintBlock } from "./siteRuleConsent.js";
import { sanitizeUserFacingAssistantText, userFacingRulesBlock } from "./userFacingRules.js";
import {
  kbCatalogPrefetchHintBlock,
  kbCatalogRoutingBlock,
  knowledgeBasePrompt,
  repositoryPrompt
} from "./knowledgeBase.js";
import {
  ProviderError,
  type ChatCompletionResult,
  type ChatToolCall,
  type ChatToolDefinition,
  type ProviderChatMessage
} from "../providers.js";
import { ContextCompressor } from "./compressor.js";
import { estimateMessagesTokensRough } from "./contextTokens.js";
import type { ChatMessage, ChatMessageDownload, ChatMessageImage } from "../seed.js";

type ProviderIterationResult = ChatCompletionResult & {
  contentEventsEmitted?: boolean;
};
import { normalizeRepositoryAssetPath } from "../repositoryDownloadLinks.js";
import { toolActivityOutput, toolExitCode } from "./toolActivityPreview.js";
import { isLocalHistoryProducerCall, RequestHistoryExecutionGuard } from "./requestHistoryExecutionGuard.js";
import type { DashboardMutationInput, DashboardRecord } from "../dashboards.js";
import { RequestToolExecutionPolicy } from "./requestToolExecutionPolicy.js";

export interface AgentRuntimeOptions {
  memory: AgentMemoryStore;
  tools: AgentToolRegistry;
  skills: AgentSkillRegistry;
  resolveProjectSkillIds: (projectId: string) => string[];
  projectGrounding?: ProjectGroundingBindings;
  projectFeedback?: ProjectFeedbackBindings;
  groundingRuleIndex?: GroundingRuleIndex;
  onCaptureFeedback?: (input: {
    projectId: string;
    conversationId: string;
    userCorrection: string;
    messages: ChatMessage[];
    errorType?: RuleErrorType;
  }) => FeedbackEpisode | null;
  dashboardOps?: {
    create: (input: DashboardMutationInput, request: Pick<AgentTurnRequest, "projectId" | "userId" | "conversationId">) => DashboardRecord;
  };
  maxIterations?: number;
  compressor?: ContextCompressor;
}

interface WorkingToolCall {
  call: ChatToolCall;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

function plainToolArguments(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? value as Record<string, unknown>
    : {};
}
function parseGeneratedImages(result: Record<string, unknown>): ChatMessageImage[] {
  const images: ChatMessageImage[] = [];
  const seen = new Set<string>();
  const pushImage = (entry: unknown) => {
    if (typeof entry !== "object" || entry === null) {
      return;
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.src !== "string" || typeof record.alt !== "string") {
      return;
    }
    const normalized = record.src.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    images.push({
      src: record.src,
      alt: record.alt,
      ...(typeof record.filename === "string" ? { filename: record.filename } : {}),
      ...(typeof record.capturedAt === "string" ? { capturedAt: record.capturedAt } : {}),
      ...(typeof record.source === "string" ? { source: record.source } : {})
    });
  };

  // Only trust tool-supplied generatedImages (already freshness-filtered).
  // Do not scan outputFiles here — that list includes the whole outputs/ folder
  // and would re-attach charts from earlier conversations.
  if (Array.isArray(result.generatedImages)) {
    for (const entry of result.generatedImages) {
      pushImage(entry);
    }
  }

  return images;
}

function parseGeneratedDownloads(result: Record<string, unknown>): ChatMessageDownload[] {
  const downloads: ChatMessageDownload[] = [];
  const seen = new Set<string>();
  const pushDownload = (entry: unknown) => {
    if (typeof entry !== "object" || entry === null) {
      return;
    }
    const record = entry as Record<string, unknown>;
    const rawPath = typeof record.path === "string" ? record.path : "";
    const path = normalizeRepositoryAssetPath(rawPath);
    if (!path.startsWith("outputs/")) {
      return;
    }
    const key = path.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    downloads.push({
      path,
      filename: typeof record.filename === "string" ? record.filename : path.split("/").pop() ?? path
    });
  };

  if (Array.isArray(result.generatedDownloads)) {
    for (const entry of result.generatedDownloads) {
      pushDownload(entry);
    }
  }
  return downloads;
}

const DEFAULT_TOOL_CONCURRENCY = Number(process.env.BUILDING_AGENT_TOOL_CONCURRENCY ?? 8);
const AGENT_TURN_TIMEOUT_MS = 180_000;
const PROVIDER_PAYLOAD_SOFT_BYTES = 1024 * 1024;

function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/**
 * Compact only completed, older tool rows. The newest assistant/tool protocol
 * pair is kept byte-for-byte so a provider never receives an orphaned or
 * altered current tool continuation.
 */
export function compactOldToolRowsForProvider(
  messages: ProviderChatMessage[],
  tools: ChatToolDefinition[]
): ProviderChatMessage[] {
  if (serializedBytes({ messages, tools }) <= PROVIDER_PAYLOAD_SOFT_BYTES) {
    return messages.slice();
  }

  let currentAssistantIndex = messages.length;
  if (messages.at(-1)?.role === "tool") {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]!;
      if (message.role === "assistant" && message.tool_calls && message.tool_calls.length > 0) {
        currentAssistantIndex = index;
        break;
      }
    }
  }

  return messages.map((message, index) => {
    if (message.role !== "tool" || index > currentAssistantIndex) {
      return { ...message };
    }
    const originalBytes = new TextEncoder().encode(message.content ?? "").byteLength;
    return {
      ...message,
      content: JSON.stringify({
        compacted: true,
        summary: "Earlier tool result omitted before provider request.",
        originalBytes
      })
    };
  });
}

function agentTurnTimeoutError(): ProviderError {
  return new ProviderError("Agent turn deadline exceeded.", {
    code: "agent_turn_timeout",
    status: 504,
    responseDetail: `turn exceeded ${AGENT_TURN_TIMEOUT_MS / 1000}s deadline`
  });
}

function agentTurnCancelledError(): ProviderError {
  return new ProviderError("Agent turn was cancelled.", {
    code: "agent_turn_cancelled"
  });
}

function raceWithSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? agentTurnTimeoutError());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? agentTurnTimeoutError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  maxConcurrency: number
): Promise<T[]> {
  if (tasks.length === 0) {
    return [];
  }
  const limit = Math.max(1, maxConcurrency);
  const results = new Array<T>(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= tasks.length) {
        return;
      }
      results[index] = await tasks[index]!();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export class AgentRuntime {
  constructor(private readonly options: AgentRuntimeOptions) {}

  private makeEvent(type: AgentLifecycleEventType, message: string, metadata?: AgentLifecycleEvent["metadata"]): AgentLifecycleEvent {
    return { type, message, at: new Date().toISOString(), ...(metadata ? { metadata } : {}) };
  }

  private *emitBufferedIterationContent(
    chunks: string[],
    hasTools: boolean
  ): Generator<AgentLifecycleEvent, void, undefined> {
    if (chunks.length === 0) {
      return;
    }
    if (hasTools) {
      for (const chunk of chunks) {
        yield this.makeEvent("work_token", chunk);
      }
      return;
    }
    yield this.makeEvent("answer_start", "Final answer streaming started.");
    for (const chunk of chunks) {
      yield this.makeEvent("answer_token", chunk);
    }
    yield this.makeEvent("answer_end", "Final answer streaming completed.");
  }

  private async *callProvider(
    request: AgentTurnRequest,
    messages: ProviderChatMessage[],
    toolDefs: ChatToolDefinition[],
    turnSignal: AbortSignal
  ): AsyncGenerator<AgentLifecycleEvent, ProviderIterationResult, undefined> {
    const providerMessages = compactOldToolRowsForProvider(messages, toolDefs);
    if (request.provider.completeStream) {
      let streamText = "";
      // OpenAI streams tool_call deltas keyed by `index`, not `id` — only the first
      // chunk for each index carries `id` and `function.name`; later chunks append
      // `function.arguments` fragments and must be joined on index.
      const streamToolCallsByIndex = new Map<number, ChatToolCall>();
      let fallbackToolIndex = 0;
      const pendingContent: string[] = [];
      let contentEventsEmitted = false;

      const providerStream = request.provider.completeStream({
          projectId: request.projectId,
          userId: request.userId,
          requestId: request.requestId,
          messages: providerMessages,
          tools: toolDefs,
          toolChoice: "auto",
          signal: turnSignal
        })[Symbol.asyncIterator]();
      try {
        while (true) {
          const step = await raceWithSignal(providerStream.next(), turnSignal);
          if (step.done) {
            break;
          }
          const delta = step.value;
          if (delta.progress) {
            yield this.makeEvent("progress", delta.progress.label, {
              progressKind: delta.progress.kind,
              ...(delta.progress.raw ? { progressRaw: delta.progress.raw } : {})
            });
          }
          if (delta.toolCalls) {
            for (const tc of delta.toolCalls) {
              const rawIndex = (tc as { index?: unknown }).index;
              const idx = typeof rawIndex === "number" ? rawIndex : fallbackToolIndex++;
              let entry = streamToolCallsByIndex.get(idx);
              if (!entry) {
                entry = { id: tc.id ?? "", type: "function", function: { name: "", arguments: "" } };
                streamToolCallsByIndex.set(idx, entry);
              }
              if (tc.id) entry.id = tc.id;
              if (tc.type) entry.type = tc.type;
              if (tc.function?.name) entry.function.name += tc.function.name;
              if (tc.function?.arguments) entry.function.arguments += tc.function.arguments;
            }
          }
          if (delta.content) {
            streamText += delta.content;
            pendingContent.push(delta.content);
            yield this.makeEvent("work_token", delta.content);
            contentEventsEmitted = true;
          }
        }
      } catch (streamError) {
        // The provider adapter exclusively owns retries. Replaying this request
        // here can duplicate tool calls or content already emitted to the user.
        throw streamError;
      }

      const streamToolCalls = [...streamToolCallsByIndex.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, entry]) => entry)
        .filter((entry) => entry.id && entry.function.name);

      const trimmedStreamText = streamText.trim();
      if (!trimmedStreamText && streamToolCalls.length === 0) {
        throw new ProviderError("Chat provider stream completed without content.", {
          code: "provider_empty_response",
          provider: request.provider.metadata
        });
      }

      const hasTools = streamToolCalls.length > 0;
      if (!hasTools && pendingContent.length > 0) {
        yield this.makeEvent("answer_start", "Final answer streaming started.");
        if (!contentEventsEmitted) {
          for (const chunk of pendingContent) {
            yield this.makeEvent("answer_token", chunk);
          }
        }
        yield this.makeEvent("answer_end", "Final answer streaming completed.");
        contentEventsEmitted = true;
      } else if (hasTools && !contentEventsEmitted && pendingContent.length > 0) {
        for (const event of this.emitBufferedIterationContent(pendingContent, true)) {
          yield event;
          contentEventsEmitted = true;
        }
      }

      const result: ProviderIterationResult = {
        text: trimmedStreamText,
        provider: request.provider.metadata,
        fallbackUsed: false,
        contentEventsEmitted
      };
      if (hasTools) result.toolCalls = streamToolCalls;
      return result;
    }

    const completion = await raceWithSignal(request.provider.complete({
      projectId: request.projectId,
      userId: request.userId,
      requestId: request.requestId,
      messages: providerMessages,
      tools: toolDefs,
      toolChoice: "auto",
      signal: turnSignal
    }), turnSignal);
    return { ...completion, contentEventsEmitted: false };
  }

  async *runTurnStream(
    request: AgentTurnRequest,
    externalSignal?: AbortSignal
  ): AsyncGenerator<AgentLifecycleEvent, AgentLoopResult, undefined> {
    const controller = new AbortController();
    const onExternalAbort = () => controller.abort(
      externalSignal?.reason instanceof ProviderError ? externalSignal.reason : agentTurnCancelledError()
    );
    if (externalSignal?.aborted) {
      onExternalAbort();
    } else {
      externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
    }
    const timeout = setTimeout(() => controller.abort(agentTurnTimeoutError()), AGENT_TURN_TIMEOUT_MS);
    try {
      return yield* this.runTurnStreamWithinDeadline(request, controller.signal);
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    }
  }

  private async *runTurnStreamWithinDeadline(
    request: AgentTurnRequest,
    turnSignal: AbortSignal
  ): AsyncGenerator<AgentLifecycleEvent, AgentLoopResult, undefined> {
    const maxIterations = this.options.maxIterations ?? 20;
    const events: AgentLifecycleEvent[] = [];
    const toolCallHistory: Array<{ name: string; args: Record<string, unknown>; result: Record<string, unknown> }> = [];
    const generatedImages = new Map<string, ChatMessageImage>();
    const generatedDownloads = new Map<string, ChatMessageDownload>();
    const requestToolPolicy = new RequestToolExecutionPolicy();

    const yieldEvent = (event: AgentLifecycleEvent) => {
      events.push(event);
      return event;
    };

    // --- Initial lifecycle events ---
    yield yieldEvent(this.makeEvent("loop_started", "Agent loop started. Planning next steps..."));
    yield yieldEvent(this.makeEvent("user_message_received", "User message accepted by the agent runtime.", {
      messageCount: request.messages.length
    }));

    const projectSkillIds = this.options.resolveProjectSkillIds(request.projectId);
    const skillHints = this.options.skills.promptHintsForProject(projectSkillIds);
    yield yieldEvent(this.makeEvent("skills_applied", "Project skill hints prepared.", {
      skillCount: projectSkillIds.length,
      projectId: request.projectId
    }));

    const lastUserMessage = request.providerMessages.at(-1)?.content ?? "";
    const allGroundingRules = this.options.projectGrounding?.list(request.projectId) ?? [];
    let groundingRules: ProjectGroundingRule[] = allGroundingRules;
    let retrievedGroundingRules: ProjectGroundingRule[] = [];

    if (this.options.groundingRuleIndex && shouldAttemptGroundingRuleRetrieval(lastUserMessage)) {
      const groundingRetrieveId = `grounding_${request.requestId}`;
      yield yieldEvent(this.makeEvent("tool_started", "Retrieving site rules.", {
        tool: "project_grounding",
        toolCallId: groundingRetrieveId
      }));
      const retrieveStartedAt = Date.now();
      const retrieval = await raceWithSignal(retrieveGroundingRules(
        this.options.groundingRuleIndex,
        request.projectId,
        lastUserMessage,
        allGroundingRules
      ), turnSignal);
      groundingRules = selectGroundingForTurn(allGroundingRules, retrieval);
      retrievedGroundingRules = retrieval.retrieved;
      const retrievedRuleNames = retrievedGroundingRules.map((rule) => resolveRuleDisplayName(rule));
      yield yieldEvent(this.makeEvent("tool_completed", "Site rule retrieval completed.", {
        tool: "project_grounding",
        toolCallId: groundingRetrieveId,
        retrievedGroundingCount: retrievedGroundingRules.length,
        retrievedRuleNames,
        durationMs: Date.now() - retrieveStartedAt,
        resultPreview:
          retrievedGroundingRules.length > 0
            ? formatRetrievedRulesPreview(retrievedGroundingRules)
            : "No approved site rules matched this question.",
        ...(process.env.RULE_RETRIEVAL_DEBUG === "1"
          ? { retrievalDiagnostics: retrieval.diagnostics }
          : {})
      }));
    } else {
      groundingRules = this.options.groundingRuleIndex && lastUserMessage.trim()
        ? alwaysOnGroundingRules(allGroundingRules)
        : allGroundingRules;
    }

    if (isLikelyCorrectionTurn(lastUserMessage) && this.options.onCaptureFeedback) {
      this.options.onCaptureFeedback({
        projectId: request.projectId,
        conversationId: request.conversationId,
        userCorrection: lastUserMessage,
        messages: request.messages,
        ...(/tlkw|run_status|冷机|运行/i.test(lastUserMessage) ? { errorType: "wrong_running_state" as const } : {})
      });
    }

    const activePlaybooks = this.options.projectFeedback?.listPlaybooks(request.projectId) ?? [];
    if (activePlaybooks.length > 0) {
      yield yieldEvent(this.makeEvent("memory_recalled", "Project playbooks loaded.", {
        playbookCount: activePlaybooks.length
      }));
    }

    // --- Handle explicit memory / grounding commands ---
    const toolContext = {
      projectId: request.projectId,
      userId: request.userId,
      requestId: request.requestId,
      conversationId: request.conversationId,
      canConfigure: request.canConfigure,
      messages: request.messages
    };
    const dispatchTurnTool = (name: string, args: Record<string, unknown>) =>
      raceWithSignal(this.options.tools.dispatch(name, args, toolContext), turnSignal);
    if (this.isSaveMemoryCommand(lastUserMessage)) {
      yield yieldEvent(this.makeEvent("tool_started", "Committing approved memory proposal.", { tool: "memory_commit_proposal" }));
      await dispatchTurnTool("memory_commit_proposal", {});
      yield yieldEvent(this.makeEvent("tool_completed", "Approved memory proposal committed.", { tool: "memory_commit_proposal" }));
    } else {
    const proposedSiteRule =
      hasSiteRuleSaveConsent(lastUserMessage) && this.options.projectFeedback
        ? this.options.projectFeedback.findLatestProposedProposal(request.projectId, request.conversationId)
        : null;
    if (proposedSiteRule && request.canConfigure) {
      yield yieldEvent(this.makeEvent("tool_started", "Saving approved site rule.", { tool: "feedback_save_site_rule" }));
      await dispatchTurnTool(
        "feedback_save_site_rule",
        {
          action: proposedSiteRule.proposedFix,
          scope: proposedSiteRule.triggerTopics[0] ?? "site judgment queries",
          trigger: `When user asks questions related to: ${proposedSiteRule.triggerTopics.join(", ")}`,
          trigger_topics: proposedSiteRule.triggerTopics,
          proposal_id: proposedSiteRule.id
        }
      );
      yield yieldEvent(this.makeEvent("tool_completed", "Site rule saved.", { tool: "feedback_save_site_rule" }));
    } else {
    const projectNoteContent = this.extractProjectNoteCommand(lastUserMessage);
    if (projectNoteContent) {
      if (!request.canConfigure) {
        yield yieldEvent(
          this.makeEvent("tool_completed", "Project memory bank write blocked by platform bounds.", {
            tool: "memory",
            boundsViolation: true
          })
        );
      } else {
        yield yieldEvent(this.makeEvent("tool_started", "Saving project memory note.", { tool: "memory" }));
        await dispatchTurnTool(
          "memory",
          { action: "add", target: "project", content: projectNoteContent }
        );
        yield yieldEvent(this.makeEvent("tool_completed", "Project memory note saved.", { tool: "memory" }));
      }
    } else {
      const groundingContent = this.extractProjectGroundingCommand(lastUserMessage);
      if (groundingContent && this.options.projectGrounding) {
        if (!request.canConfigure) {
          yield yieldEvent(
            this.makeEvent("tool_completed", "Project grounding blocked by platform bounds.", {
              tool: "project_grounding_add",
              boundsViolation: true
            })
          );
        } else {
          yield yieldEvent(this.makeEvent("tool_started", "Saving project grounding rule.", { tool: "project_grounding_add" }));
          await dispatchTurnTool("project_grounding_add", { content: groundingContent });
          yield yieldEvent(this.makeEvent("tool_completed", "Project grounding rule saved.", { tool: "project_grounding_add" }));
        }
      } else if (this.isCommitPlaybookCommand(lastUserMessage) && this.options.projectFeedback) {
      const proposal = this.options.projectFeedback.findLatestImplementedProposal(
        request.projectId,
        request.conversationId
      );
      if (proposal) {
        const title = proposal.triggerTopics[0] ?? proposal.proposedFix.slice(0, 80);
        const groundingSummary = `${proposal.userCorrection} Fix: ${proposal.proposedFix}`;
        yield yieldEvent(this.makeEvent("tool_started", "Committing feedback playbook.", { tool: "feedback_commit_playbook" }));
        await dispatchTurnTool(
          "feedback_commit_playbook",
          {
            proposal_id: proposal.id,
            title,
            grounding_summary: groundingSummary
          }
        );
        yield yieldEvent(this.makeEvent("tool_completed", "Feedback playbook committed.", { tool: "feedback_commit_playbook" }));
      }
      } else {
        const memoryContent = this.extractMemoryCommand(lastUserMessage);
        if (memoryContent) {
          yield yieldEvent(this.makeEvent("tool_started", "Saving explicit user memory.", { tool: "memory" }));
          await dispatchTurnTool(
            "memory",
            { action: "add", target: "user", content: memoryContent }
          );
          yield yieldEvent(this.makeEvent("tool_completed", "Explicit user memory saved.", { tool: "memory" }));
        }
      }
    }
    }
    }

    const memoryBlocks = this.options.memory.getPromptBlocks(
      request.projectId,
      request.userId,
      request.conversationId
    );
    yield yieldEvent(this.makeEvent("memory_recalled", "Curated memory banks loaded.", {
      memoryCount: memoryBlocks.userEntryCount + memoryBlocks.projectEntryCount
    }));

    // --- Build system message ---
    const toolDefs = this.options.tools.toOpenAIToolDefinitions();
    const groundingBlock = groundingPromptBlock(groundingRules);
    const playbooksBlock = playbooksPromptBlock(activePlaybooks);
    const prefetchHint = sessionSearchPrefetchHintBlock(lastUserMessage);
    const temporalHint = temporalQueryHintBlock(lastUserMessage);
    const kbCatalogHint = kbCatalogPrefetchHintBlock(lastUserMessage, request.knowledgeBaseDocuments);
    const sameTurnEnabled = process.env.MEMORY_SAME_TURN_INJECT !== "false";
    const sameTurnOverflow = sameTurnEnabled
      ? this.options.memory.getSameTurnOverflow(request.projectId, request.userId, request.conversationId)
      : [];
    const systemContent = [
      platformKernelPrompt(),
      wallClockContextBlock(),
      perTurnLanguageBlock(lastUserMessage),
      executionDisciplineBlock(),
      platformBoundsNotice(),
      memoryGuidanceBlock(),
      userFacingRulesBlock(),
      feedbackProposalGuidanceBlock(),
      siteRuleTemplateGuidanceBlock(),
      sessionSearchGuidanceBlock(),
      siteRuleSaveConsentHintBlock(lastUserMessage),
      prefetchHint,
      temporalHint,
      kbCatalogHint,
      skillHints ? `Available skills:\n${skillHints}` : "",
      `Available tools: ${this.options.tools.schemas().map((tool) => tool.name).join(", ")}`,
      memoryBlocks.userBlock || "User memory: none yet.",
      memoryBlocks.projectBlock || "Project memory: none yet.",
      sameTurnMemoryOverflowBlock(sameTurnOverflow),
      groundingBlock,
      playbooksBlock,
      projectInputsPrompt(),
      kbCatalogRoutingBlock(request.knowledgeBaseDocuments),
      knowledgeBasePrompt(request.knowledgeBaseDocuments),
      repositoryPrompt(request.repositoryArtifacts)
    ].filter(Boolean).join("\n\n");

    const conversationMessages: ProviderChatMessage[] = [
      { role: "system", content: systemContent },
      ...request.providerMessages
    ];

    // --- Multi-turn agent loop ---
    let finalText = "";
    let finalProvider = request.provider.metadata;
    let finalFallbackUsed = false;
    let iterations = 0;
    const compressor = this.options.compressor ?? new ContextCompressor({
      contextLength: 128_000
    });
    const historyExecutionGuard = new RequestHistoryExecutionGuard();

    while (iterations < maxIterations) {
      iterations += 1;

      // Cheap Hermes-style tool pruning on long turns (no LLM call).
      if (conversationMessages.length > 24) {
        const pruned = compressor.compressSync(conversationMessages);
        if (pruned.changed) {
          conversationMessages.length = 0;
          conversationMessages.push(...pruned.messages);
        }
      }

      // Full compaction: prune → protect head/tail → summarize middle → sanitize tool pairs.
      const roughTokens = estimateMessagesTokensRough(conversationMessages);
      if (compressor.shouldCompress(conversationMessages, roughTokens)) {
        const compressed = await raceWithSignal(compressor.compress(conversationMessages), turnSignal);
        if (compressed.changed) {
          yield yieldEvent(this.makeEvent(
            "tool_started",
            `Context compressed: pruned ${compressed.prunedCount} tool row(s), summarized ${compressed.summarizedTurns} middle turn(s).`
          ));
          conversationMessages.length = 0;
          conversationMessages.push(...compressed.messages);
        }
      }

      yield yieldEvent(this.makeEvent("provider_started", `Agent iteration ${iterations}: calling LLM provider.`, {
        provider: request.provider.metadata.id,
        model: request.provider.metadata.model,
        iteration: iterations,
        toolCount: toolDefs.length
      }));

      // Use exactly one provider method; the adapter exclusively owns retry policy.
      const providerEvents = this.callProvider(request, conversationMessages, toolDefs, turnSignal);
      let providerStep = await providerEvents.next();
      while (!providerStep.done) {
        yield yieldEvent(providerStep.value);
        providerStep = await providerEvents.next();
      }
      const completion = providerStep.value;

      finalProvider = completion.provider;
      finalFallbackUsed = completion.fallbackUsed;

      if (!completion.contentEventsEmitted && completion.text.trim()) {
        const hasTools = Boolean(completion.toolCalls && completion.toolCalls.length > 0);
        for (const event of this.emitBufferedIterationContent([completion.text], hasTools)) {
          yield yieldEvent(event);
        }
      }

      // Append assistant message
      const assistantMsg: ProviderChatMessage = {
        role: "assistant",
        content: completion.text || null,
        ...(completion.toolCalls ? { tool_calls: completion.toolCalls } : {})
      };
      conversationMessages.push(assistantMsg);

      // If no tool calls, this is the final answer
      if (!completion.toolCalls || completion.toolCalls.length === 0) {
        finalText = sanitizeUserFacingAssistantText(completion.text);
        break;
      }

      // --- Execute tool calls ---
      yield yieldEvent(this.makeEvent("tool_started", `Executing ${completion.toolCalls.length} tool call(s).`, {
        toolCount: completion.toolCalls.length,
        tools: completion.toolCalls.map((tc) => tc.function.name).join(", "),
        iteration: iterations
      }));

      const parsedToolCalls: WorkingToolCall[] = completion.toolCalls.map((tc) => {
        let args: Record<string, unknown>;
        try {
          args = plainToolArguments(JSON.parse(tc.function.arguments) as unknown);
        } catch {
          args = {};
        }
        return { call: tc, args, result: {} };
      });
      historyExecutionGuard.observeBatch(parsedToolCalls.map((entry) => ({
        name: entry.call.function.name,
        args: entry.args
      })));

      for (const entry of parsedToolCalls) {
        yield yieldEvent(this.makeEvent("tool_started", `Running tool: ${entry.call.function.name}`, {
          tool: entry.call.function.name,
          toolCallId: entry.call.id,
          args: JSON.stringify(entry.args).slice(0, 200),
          iteration: iterations
        }));
      }

      const toolConcurrency = DEFAULT_TOOL_CONCURRENCY;
      const dispatchStartedAt = Date.now();
      const dispatchEntry = (entry: WorkingToolCall) => async () => {
        const startedAt = Date.now();
        const deduplicated = await requestToolPolicy.run(
          entry.call.function.name,
          entry.args,
          () => this.options.tools.dispatch(
            entry.call.function.name,
            entry.args,
            {
              projectId: request.projectId,
              userId: request.userId,
              requestId: request.requestId,
              conversationId: request.conversationId,
              canConfigure: request.canConfigure,
              messages: request.messages,
              toolCallId: entry.call.id,
              ...historyExecutionGuard.contextFields(),
              ...(this.options.dashboardOps
                ? {
                    dashboardOps: {
                      create: (input: DashboardMutationInput) =>
                        this.options.dashboardOps!.create(input, {
                          projectId: request.projectId,
                          userId: request.userId,
                          conversationId: request.conversationId
                        })
                    }
                  }
                : {})
            }
          )
        );
        const dispatchResult = deduplicated.value;
        return {
          entry,
          dispatchResult,
          deduplicated: deduplicated.reused,
          durationMs: Date.now() - startedAt,
          startedAt
        };
      };
      const historyProducers = parsedToolCalls.filter((entry) => isLocalHistoryProducerCall({
        name: entry.call.function.name,
        args: entry.args
      }));
      const remainingToolCalls = historyProducers.length > 0
        ? parsedToolCalls.filter((entry) => !isLocalHistoryProducerCall({
            name: entry.call.function.name,
            args: entry.args
          }))
        : parsedToolCalls;
      const producerResults = historyProducers.length > 0
        ? await raceWithSignal(
            runWithConcurrency(historyProducers.map(dispatchEntry), toolConcurrency),
            turnSignal
          )
        : [];
      historyExecutionGuard.completeProducerBatch(producerResults.map(({ entry, dispatchResult }) => ({
        name: entry.call.function.name,
        args: entry.args,
        result: dispatchResult.result
      })));
      if (historyExecutionGuard.contextFields().localHistoryDatasetReady === true) {
        requestToolPolicy.markHistoryDatasetReady();
      }
      const remainingResults = await raceWithSignal(
        runWithConcurrency(remainingToolCalls.map(dispatchEntry), toolConcurrency),
        turnSignal
      );
      const resultOrder = new Map(parsedToolCalls.map((entry, index) => [entry.call.id, index]));
      const dispatchResults = [...producerResults, ...remainingResults]
        .sort((left, right) =>
          (resultOrder.get(left.entry.call.id) ?? 0) - (resultOrder.get(right.entry.call.id) ?? 0)
        );

      for (const { entry, dispatchResult, deduplicated, durationMs, startedAt } of dispatchResults) {
        entry.result = dispatchResult.result;

        const exitCode = toolExitCode(dispatchResult.result);
        yield yieldEvent(this.makeEvent("tool_completed", `Tool ${entry.call.function.name} completed.`, {
          tool: entry.call.function.name,
          toolCallId: entry.call.id,
          durationMs,
          startedAt,
          iteration: iterations,
          ...(deduplicated ? { deduplicated: true } : {}),
          ...(exitCode !== undefined ? { exitCode } : {}),
          resultPreview: toolActivityOutput(dispatchResult.result, 500) ?? JSON.stringify(dispatchResult.result).slice(0, 300)
        }));

        toolCallHistory.push({
          name: entry.call.function.name,
          args: entry.args,
          result: dispatchResult.result
        });
        for (const image of parseGeneratedImages(dispatchResult.result)) {
          generatedImages.set(image.src, image);
        }
        for (const download of parseGeneratedDownloads(dispatchResult.result)) {
          generatedDownloads.set(download.path.toLowerCase(), download);
        }

        conversationMessages.push({
          role: "tool",
          content: JSON.stringify(dispatchResult.result),
          tool_call_id: entry.call.id
        });
      }

      const parallelWallMs = Date.now() - dispatchStartedAt;
      if (parsedToolCalls.length > 1) {
        yield yieldEvent(this.makeEvent("tool_completed", `Parallel tool batch completed (${parsedToolCalls.length} calls, ${parallelWallMs}ms wall).`, {
          iteration: iterations,
          parallel: true,
          toolCount: parsedToolCalls.length,
          durationMs: parallelWallMs
        }));
      }

      yield yieldEvent(this.makeEvent("tool_completed", `All tool calls for iteration ${iterations} completed.`, {
        iteration: iterations,
        completedTools: toolCallHistory.length,
        flushToolActivities: true
      }));
    }

    if (iterations >= maxIterations && !finalText) {
      yield yieldEvent(this.makeEvent("provider_started", "Max iterations reached. Making final summary call without tools.", {
        iteration: iterations + 1,
        grace: true
      }));
      try {
        const graceEvents = this.callProvider(request, conversationMessages, [], turnSignal);
        let graceStep = await graceEvents.next();
        while (!graceStep.done) {
          yield yieldEvent(graceStep.value);
          graceStep = await graceEvents.next();
        }
        const graceCompletion = graceStep.value;
        finalText = sanitizeUserFacingAssistantText(
          graceCompletion.text || "I've completed the maximum number of analysis steps."
        );
        finalProvider = graceCompletion.provider;
        finalFallbackUsed = graceCompletion.fallbackUsed;
      } catch {
        finalText = "I've completed the maximum number of analysis steps. Here's what I found so far.";
      }
    }

    finalText = sanitizeUserFacingAssistantText(finalText);

    const validationWarnings = validateAssistantAgainstRules(finalText, retrievedGroundingRules);
    if (validationWarnings.length > 0) {
      yield yieldEvent(this.makeEvent("validation_warning", "Project rule validation flagged potential issues.", {
        validationWarnings
      }));
    }

    yield yieldEvent(this.makeEvent("assistant_message_completed", "Assistant message completed.", {
      fallbackUsed: finalFallbackUsed,
      iterations,
      toolsUsed: toolCallHistory.length
    }));

    this.options.memory.syncTurn(request.projectId, request.userId, lastUserMessage, finalText);
    yield yieldEvent(this.makeEvent("memory_synced", "Turn memory sync completed."));
    yield yieldEvent(this.makeEvent("turn_completed", finalText || "Turn completed.", {
      iterations,
      toolsUsed: toolCallHistory.length,
      ...(validationWarnings.length > 0 ? { validationWarnings } : {})
    }));

    return {
      finalText,
      events,
      toolCallHistory,
      iterations,
      generatedImages: [...generatedImages.values()],
      generatedDownloads: [...generatedDownloads.values()]
    };
  }

  async runTurn(request: AgentTurnRequest, externalSignal?: AbortSignal): Promise<AgentTurnResult> {
    const events: AgentLifecycleEvent[] = [];
    let finalText = "";
    let finalFallbackUsed = false;
    let generatedImages: ChatMessageImage[] = [];
    let generatedDownloads: ChatMessageDownload[] = [];

    const stream = this.runTurnStream(request, externalSignal);
    let next = await stream.next();
    while (!next.done) {
      const event = next.value;
      events.push(event);
      if (event.type === "turn_completed") {
        finalText = event.message;
      }
      if (event.metadata?.fallbackUsed !== undefined) {
        finalFallbackUsed = Boolean(event.metadata.fallbackUsed);
      }
      next = await stream.next();
    }
    generatedImages = next.value.generatedImages;
    generatedDownloads = next.value.generatedDownloads;

    return {
      completion: {
        text: finalText,
        provider: request.provider.metadata,
        fallbackUsed: finalFallbackUsed
      },
      events,
      generatedImages,
      generatedDownloads
    };
  }

  private isSaveMemoryCommand(message: string): boolean {
    const trimmed = message.trim().toLowerCase();
    return (
      trimmed === "保存记忆: 是" ||
      trimmed === "保存记忆:是" ||
      trimmed === "保存记忆 是" ||
      trimmed === "save memory: yes" ||
      trimmed === "save memory yes"
    );
  }

  private isCommitPlaybookCommand(message: string): boolean {
    const trimmed = message.trim().toLowerCase();
    return (
      trimmed === "commit playbook: yes" ||
      trimmed === "commit playbook yes" ||
      trimmed === "commit playbook:yes" ||
      trimmed.startsWith("commit playbook:")
    );
  }

  private extractProjectNoteCommand(message: string): string | null {
    const trimmed = message.trim();
    const lowered = trimmed.toLowerCase();
    if (lowered.startsWith("remember project note:")) {
      return trimmed.slice("remember project note:".length).trim() || null;
    }
    if (lowered.startsWith("remember project note ")) {
      return trimmed.slice("remember project note ".length).trim() || null;
    }
    return null;
  }

  private extractProjectGroundingCommand(message: string): string | null {
    const trimmed = message.trim();
    const lowered = trimmed.toLowerCase();
    if (lowered.startsWith("remember project note:") || lowered.startsWith("remember project note ")) {
      return null;
    }
    if (lowered.startsWith("remember project:")) {
      return trimmed.slice("remember project:".length).trim() || null;
    }
    if (lowered.startsWith("remember project ")) {
      return trimmed.slice("remember project ".length).trim() || null;
    }
    if (lowered.startsWith("correct:")) {
      return trimmed.slice("correct:".length).trim() || null;
    }
    if (lowered.startsWith("correct ")) {
      return trimmed.slice("correct ".length).trim() || null;
    }
    return null;
  }

  private extractMemoryCommand(message: string): string | null {
    const trimmed = message.trim();
    const lowered = trimmed.toLowerCase();
    if (
      lowered.startsWith("remember project note:") ||
      lowered.startsWith("remember project note ") ||
      lowered.startsWith("remember project:") ||
      lowered.startsWith("remember project ")
    ) {
      return null;
    }
    if (lowered.startsWith("correct:") || lowered.startsWith("correct ")) {
      return null;
    }
    if (this.isCommitPlaybookCommand(trimmed)) {
      return null;
    }
    if (this.isSaveMemoryCommand(trimmed)) {
      return null;
    }
    if (lowered.startsWith("remember ")) {
      return trimmed.slice("remember ".length).trim() || null;
    }
    if (lowered.startsWith("remember:")) {
      return trimmed.slice("remember:".length).trim() || null;
    }
    return null;
  }
}
