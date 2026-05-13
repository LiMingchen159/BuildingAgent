import type { AgentMemoryStore } from "./memory.js";
import type { AgentSkillRegistry } from "./skills.js";
import type { AgentToolRegistry } from "./tools.js";
import type { AgentLifecycleEvent, AgentLifecycleEventType, AgentLoopResult, AgentTurnRequest, AgentTurnResult } from "./types.js";
import { knowledgeBasePrompt } from "./knowledgeBase.js";
import type { ChatCompletionResult, ChatToolCall, ChatToolDefinition, ProviderChatMessage } from "../providers.js";
import { ContextCompressor } from "./compressor.js";

export interface AgentRuntimeOptions {
  memory: AgentMemoryStore;
  tools: AgentToolRegistry;
  skills: AgentSkillRegistry;
  maxIterations?: number;
  compressor?: ContextCompressor;
}

interface WorkingToolCall {
  call: ChatToolCall;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AgentRuntime {
  constructor(private readonly options: AgentRuntimeOptions) {}

  private makeEvent(type: AgentLifecycleEventType, message: string, metadata?: AgentLifecycleEvent["metadata"]): AgentLifecycleEvent {
    return { type, message, at: new Date().toISOString(), ...(metadata ? { metadata } : {}) };
  }

  private async *callProvider(
    request: AgentTurnRequest,
    messages: ProviderChatMessage[],
    toolDefs: ChatToolDefinition[]
  ): AsyncGenerator<AgentLifecycleEvent, ChatCompletionResult, undefined> {
    if (request.provider.completeStream) {
      let streamText = "";
      // OpenAI streams tool_call deltas keyed by `index`, not `id` — only the first
      // chunk for each index carries `id` and `function.name`; later chunks append
      // `function.arguments` fragments and must be joined on index.
      const streamToolCallsByIndex = new Map<number, ChatToolCall>();
      let fallbackToolIndex = 0;

      try {
        for await (const delta of request.provider.completeStream({
          projectId: request.projectId,
          userId: request.userId,
          requestId: request.requestId,
          messages: messages.slice(),
          tools: toolDefs,
          toolChoice: "auto"
        })) {
          if (delta.progress) {
            yield this.makeEvent("progress", delta.progress);
          }
          if (delta.content) {
            streamText += delta.content;
            yield this.makeEvent("thinking", delta.content);
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
        }
      } catch (streamError) {
        // Stream failed, fall back to non-streaming. Add cooldown for rate limits.
        if (typeof streamError === "object" && streamError !== null && "status" in streamError && (streamError as { status?: number }).status === 429) {
          await sleep(5000);
        }
        return await this.callProviderWithRetry(request, messages, toolDefs, 2);
      }

      const streamToolCalls = [...streamToolCallsByIndex.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, entry]) => entry)
        .filter((entry) => entry.id && entry.function.name);

      const trimmedStreamText = streamText.trim();
      if (!trimmedStreamText && streamToolCalls.length === 0) {
        return await this.callProviderWithRetry(request, messages, toolDefs, 2);
      }

      const result: ChatCompletionResult = {
        text: trimmedStreamText,
        provider: request.provider.metadata,
        fallbackUsed: false
      };
      if (streamToolCalls.length > 0) result.toolCalls = streamToolCalls;
      return result;
    }

    return await this.callProviderWithRetry(request, messages, toolDefs, 2);
  }

  private async callProviderWithRetry(
    request: AgentTurnRequest,
    messages: ProviderChatMessage[],
    toolDefs: ChatToolDefinition[],
    maxRetries: number = 2
  ): Promise<ChatCompletionResult> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const completion = await request.provider.complete({
          projectId: request.projectId,
          userId: request.userId,
          requestId: request.requestId,
          messages: messages.slice(),
          tools: toolDefs,
          toolChoice: "auto"
        });
        return completion;
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          // 429 rate-limit: wait 10-20s before retry; other errors use standard backoff
          const isRateLimit =
            typeof error === "object" && error !== null && "status" in error && (error as { status?: number }).status === 429;
          const delay = isRateLimit
            ? 10000 + Math.floor(Math.random() * 10000)
            : Math.min(1000 * Math.pow(2, attempt), 8000);
          await sleep(delay);
        }
      }
    }
    throw lastError;
  }

  async *runTurnStream(request: AgentTurnRequest): AsyncGenerator<AgentLifecycleEvent, AgentLoopResult, undefined> {
    const maxIterations = this.options.maxIterations ?? 20;
    const events: AgentLifecycleEvent[] = [];
    const toolCallHistory: Array<{ name: string; args: Record<string, unknown>; result: Record<string, unknown> }> = [];

    const yieldEvent = (event: AgentLifecycleEvent) => {
      events.push(event);
      return event;
    };

    // --- Initial lifecycle events ---
    yield yieldEvent(this.makeEvent("loop_started", "Agent loop started. Planning next steps..."));
    yield yieldEvent(this.makeEvent("user_message_received", "User message accepted by the agent runtime.", {
      messageCount: request.messages.length
    }));

    const recalled = this.options.memory.list(request.projectId, request.userId).slice(-5);
    yield yieldEvent(this.makeEvent("memory_recalled", "Project-scoped memory recall completed.", {
      memoryCount: recalled.length
    }));

    const skillHints = this.options.skills.promptHints();
    yield yieldEvent(this.makeEvent("skills_applied", "Runtime skill hints prepared.", {
      skillCount: this.options.skills.list().length
    }));

    // --- Handle explicit memory commands ---
    const lastUserMessage = request.providerMessages.at(-1)?.content ?? "";
    const memoryContent = this.extractMemoryCommand(lastUserMessage);
    if (memoryContent) {
      yield yieldEvent(this.makeEvent("tool_started", "Saving explicit user memory.", { tool: "memory_remember" }));
      await this.options.tools.dispatch(
        "memory_remember",
        { content: memoryContent },
        {
          projectId: request.projectId,
          userId: request.userId,
          requestId: request.requestId,
          conversationId: request.conversationId,
          messages: request.messages
        }
      );
      yield yieldEvent(this.makeEvent("tool_completed", "Explicit user memory saved.", { tool: "memory_remember" }));
    }

    // --- Build system message ---
    const toolDefs = this.options.tools.toOpenAIToolDefinitions();
    const systemContent = [
      "You are BuildingAgent, a Hermes-like autonomous project assistant.",
      "You have access to tools. Use them proactively to gather information before answering.",
      "When you need data: call the right tool, review the result, then decide your next step.",
      "Plan your work: tell the user what you're going to do, then do it step by step.",
      "You can schedule reminders for users. When a user asks to be reminded, use schedule_reminder with an appropriate delay.",
      "Be concise, actionable, and explicit about mocked BIM/Brick/IFC/timeseries data.",
      "Never expose secrets or hidden credentials.",
      skillHints ? `Available skills:\n${skillHints}` : "",
      `Available tools: ${this.options.tools.schemas().map((tool) => tool.name).join(", ")}`,
      recalled.length > 0 ? `Project memory:\n${recalled.map((entry) => `- ${entry.content}`).join("\n")}` : "Project memory: none yet.",
      knowledgeBasePrompt(request.knowledgeBaseDocuments)
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
    const compressor = this.options.compressor ?? new ContextCompressor();

    while (iterations < maxIterations) {
      iterations += 1;

      // Compress conversation if it exceeds the threshold
      const compressedMessages = compressor.compress(conversationMessages);
      if (compressedMessages.length < conversationMessages.length) {
        yield yieldEvent(this.makeEvent("tool_started", `Context compressed: ${conversationMessages.length} → ${compressedMessages.length} messages.`));
        // Keep the system message and compressed non-system messages
        conversationMessages.length = 0;
        conversationMessages.push(...compressedMessages);
      }

      yield yieldEvent(this.makeEvent("provider_started", `Agent iteration ${iterations}: calling LLM provider.`, {
        provider: request.provider.metadata.id,
        model: request.provider.metadata.model,
        iteration: iterations,
        toolCount: toolDefs.length
      }));

      // Try streaming first for real-time token output; fall back to non-streaming.
      const providerEvents = this.callProvider(request, conversationMessages, toolDefs);
      let providerStep = await providerEvents.next();
      while (!providerStep.done) {
        yield yieldEvent(providerStep.value);
        providerStep = await providerEvents.next();
      }
      const completion = providerStep.value;

      finalProvider = completion.provider;
      finalFallbackUsed = completion.fallbackUsed;

      // Append assistant message
      const assistantMsg: ProviderChatMessage = {
        role: "assistant",
        content: completion.text || null,
        ...(completion.toolCalls ? { tool_calls: completion.toolCalls } : {})
      };
      conversationMessages.push(assistantMsg);

      // If no tool calls, this is the final answer
      if (!completion.toolCalls || completion.toolCalls.length === 0) {
        finalText = completion.text;
        break;
      }

      // --- Execute tool calls ---
      yield yieldEvent(this.makeEvent("tool_started", `Executing ${completion.toolCalls.length} tool call(s).`, {
        toolCount: completion.toolCalls.length,
        tools: completion.toolCalls.map((tc) => tc.function.name).join(", ")
      }));

      for (const tc of completion.toolCalls) {
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch {
          args = {};
        }

        yield yieldEvent(this.makeEvent("tool_started", `Running tool: ${tc.function.name}`, {
          tool: tc.function.name,
          args: JSON.stringify(args).slice(0, 200)
        }));

        const dispatchResult = await this.options.tools.dispatch(
          tc.function.name,
          args,
          {
            projectId: request.projectId,
            userId: request.userId,
            requestId: request.requestId,
            conversationId: request.conversationId,
            messages: request.messages
          }
        );

        yield yieldEvent(this.makeEvent("tool_completed", `Tool ${tc.function.name} completed.`, {
          tool: tc.function.name,
          resultPreview: JSON.stringify(dispatchResult.result).slice(0, 300)
        }));

        toolCallHistory.push({
          name: tc.function.name,
          args,
          result: dispatchResult.result
        });

        // Append tool result to conversation
        conversationMessages.push({
          role: "tool",
          content: JSON.stringify(dispatchResult.result),
          tool_call_id: tc.id
        });
      }

      yield yieldEvent(this.makeEvent("tool_completed", `All tool calls for iteration ${iterations} completed.`, {
        iteration: iterations,
        completedTools: toolCallHistory.length
      }));
    }

    if (iterations >= maxIterations && !finalText) {
      yield yieldEvent(this.makeEvent("provider_started", "Max iterations reached. Making final summary call without tools.", {
        iteration: iterations + 1,
        grace: true
      }));
      try {
        const graceEvents = this.callProvider(request, conversationMessages, []);
        let graceStep = await graceEvents.next();
        while (!graceStep.done) {
          yield yieldEvent(graceStep.value);
          graceStep = await graceEvents.next();
        }
        const graceCompletion = graceStep.value;
        finalText = graceCompletion.text || "I've completed the maximum number of analysis steps.";
        finalProvider = graceCompletion.provider;
        finalFallbackUsed = graceCompletion.fallbackUsed;
      } catch {
        finalText = "I've completed the maximum number of analysis steps. Here's what I found so far.";
      }
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
      toolsUsed: toolCallHistory.length
    }));

    return {
      finalText,
      events,
      toolCallHistory,
      iterations
    };
  }

  async runTurn(request: AgentTurnRequest): Promise<AgentTurnResult> {
    const events: AgentLifecycleEvent[] = [];
    let finalText = "";
    let finalProvider = request.provider.metadata;
    let finalFallbackUsed = false;

    for await (const event of this.runTurnStream(request)) {
      events.push(event);
      if (event.type === "turn_completed") {
        finalText = event.message;
      }
      if (event.metadata?.fallbackUsed !== undefined) {
        finalFallbackUsed = Boolean(event.metadata.fallbackUsed);
      }
    }

    return {
      completion: {
        text: finalText,
        provider: finalProvider,
        fallbackUsed: finalFallbackUsed
      },
      events
    };
  }

  private extractMemoryCommand(message: string): string | null {
    const trimmed = message.trim();
    const lowered = trimmed.toLowerCase();
    if (lowered.startsWith("remember ")) {
      return trimmed.slice("remember ".length).trim() || null;
    }
    if (lowered.startsWith("remember:")) {
      return trimmed.slice("remember:".length).trim() || null;
    }
    return null;
  }
}
