import type { AgentMemoryStore } from "./memory.js";
import type { AgentSkillRegistry } from "./skills.js";
import type { AgentToolRegistry } from "./tools.js";
import type { AgentLifecycleEvent, AgentLifecycleEventType, AgentLoopResult, AgentTurnRequest, AgentTurnResult } from "./types.js";
import { knowledgeBasePrompt } from "./knowledgeBase.js";
import type { ChatCompletionDelta, ChatCompletionResult, ChatToolCall, ProviderChatMessage } from "../providers.js";

export interface AgentRuntimeOptions {
  memory: AgentMemoryStore;
  tools: AgentToolRegistry;
  skills: AgentSkillRegistry;
  maxIterations?: number;
}

interface WorkingToolCall {
  call: ChatToolCall;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

export class AgentRuntime {
  constructor(private readonly options: AgentRuntimeOptions) {}

  private makeEvent(type: AgentLifecycleEventType, message: string, metadata?: AgentLifecycleEvent["metadata"]): AgentLifecycleEvent {
    return { type, message, at: new Date().toISOString(), ...(metadata ? { metadata } : {}) };
  }

  async *runTurnStream(request: AgentTurnRequest): AsyncGenerator<AgentLifecycleEvent, AgentLoopResult, undefined> {
    const maxIterations = this.options.maxIterations ?? 10;
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

    while (iterations < maxIterations) {
      iterations += 1;

      yield yieldEvent(this.makeEvent("provider_started", `Agent iteration ${iterations}: calling LLM provider.`, {
        provider: request.provider.metadata.id,
        model: request.provider.metadata.model,
        iteration: iterations,
        toolCount: toolDefs.length
      }));

      const completion = await request.provider.complete({
        projectId: request.projectId,
        userId: request.userId,
        requestId: request.requestId,
        messages: conversationMessages.slice(),
        tools: toolDefs,
        toolChoice: "auto"
      });

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
      finalText = "I've completed the maximum number of analysis steps. Here's what I found so far.";
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
