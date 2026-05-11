import type { AgentMemoryStore } from "./memory.js";
import type { AgentSkillRegistry } from "./skills.js";
import type { AgentToolRegistry } from "./tools.js";
import type { AgentLifecycleEvent, AgentTurnRequest, AgentTurnResult } from "./types.js";

export interface AgentRuntimeOptions {
  memory: AgentMemoryStore;
  tools: AgentToolRegistry;
  skills: AgentSkillRegistry;
}

export class AgentRuntime {
  constructor(private readonly options: AgentRuntimeOptions) {}

  async runTurn(request: AgentTurnRequest): Promise<AgentTurnResult> {
    const events: AgentLifecycleEvent[] = [];
    const addEvent = (type: AgentLifecycleEvent["type"], message: string, metadata?: AgentLifecycleEvent["metadata"]) => {
      events.push({ type, message, at: new Date().toISOString(), ...(metadata ? { metadata } : {}) });
    };

    addEvent("user_message_received", "User message accepted by the agent runtime.", {
      messageCount: request.messages.length
    });

    const lastUserMessage = request.providerMessages.at(-1)?.content ?? "";
    const recalled = this.options.memory.list(request.projectId, request.userId).slice(-5);
    addEvent("memory_recalled", "Project-scoped memory recall completed.", {
      memoryCount: recalled.length
    });
    const skillHints = this.options.skills.promptHints();
    addEvent("skills_applied", "Runtime skill hints prepared.", {
      skillCount: this.options.skills.list().length
    });
    const memoryContent = this.extractMemoryCommand(lastUserMessage);
    if (memoryContent) {
      addEvent("tool_started", "Saving explicit user memory.", { tool: "memory_remember" });
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
      addEvent("tool_completed", "Explicit user memory saved.", { tool: "memory_remember" });
    }

    addEvent("provider_started", "Provider completion started.", {
      provider: request.provider.metadata.id,
      model: request.provider.metadata.model,
      toolCount: this.options.tools.schemas().length,
      skillCount: this.options.skills.list().length
    });

    const contextMessages = [
      {
        role: "system" as const,
        content: [
          "You are BuildingAgent, a Hermes-like project assistant MVP.",
          "Be concise, actionable, and explicit about mocked BIM/Brick/IFC/timeseries data.",
          "Never expose secrets or hidden credentials.",
          skillHints ? `Available skills:\n${skillHints}` : "",
          recalled.length > 0 ? `Project memory:\n${recalled.map((entry) => `- ${entry.content}`).join("\n")}` : "Project memory: none yet.",
          `Available tools: ${this.options.tools.schemas().map((tool) => tool.name).join(", ")}`
        ].filter(Boolean).join("\n\n")
      },
      ...request.providerMessages
    ];

    const completion = await request.provider.complete({
      projectId: request.projectId,
      userId: request.userId,
      requestId: request.requestId,
      messages: contextMessages
    });

    this.options.memory.syncTurn(request.projectId, request.userId, lastUserMessage, completion.text);
    addEvent("assistant_message_completed", "Assistant message completed.", {
      fallbackUsed: completion.fallbackUsed
    });
    addEvent("memory_synced", "Turn memory sync completed.");

    return { completion, events };
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
