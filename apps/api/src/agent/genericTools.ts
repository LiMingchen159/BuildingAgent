import type { AgentMemoryStore } from "./memory.js";
import { AgentToolRegistry } from "./tools.js";
import type { AgentTool } from "./types.js";

function textArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

export function createGenericToolRegistry(memory: AgentMemoryStore): AgentToolRegistry {
  const registry = new AgentToolRegistry();
  const tools: AgentTool[] = [
    {
      name: "memory_remember",
      category: "memory",
      description: "Save a short project-scoped memory for the current user.",
      schema: {
        name: "memory_remember",
        description: "Save a short project-scoped memory for the current user.",
        parameters: {
          type: "object",
          properties: { content: { type: "string", description: "Memory text to save." } },
          required: ["content"]
        }
      },
      async run(args, context) {
        const content = textArg(args, "content");
        if (!content) {
          return { error: "content is required" };
        }
        return { memory: memory.remember(context.projectId, context.userId, content) };
      }
    },
    {
      name: "memory_search",
      category: "memory",
      description: "Search memories saved for the current project and user.",
      schema: {
        name: "memory_search",
        description: "Search memories saved for the current project and user.",
        parameters: {
          type: "object",
          properties: { query: { type: "string", description: "Search text." } },
          required: ["query"]
        }
      },
      async run(args, context) {
        return { memories: memory.search(context.projectId, context.userId, textArg(args, "query")) };
      }
    },
    {
      name: "session_summary",
      category: "session",
      description: "Return a compact summary of the current chat session.",
      schema: {
        name: "session_summary",
        description: "Return a compact summary of the current chat session.",
        parameters: { type: "object", properties: {} }
      },
      async run(_args, context) {
        return {
          projectId: context.projectId,
          userId: context.userId,
          messageCount: context.messages.length,
          lastRole: context.messages.at(-1)?.role ?? null
        };
      }
    }
  ];

  for (const tool of tools) {
    registry.register(tool);
  }

  return registry;
}
