import type { ChatToolDefinition } from "../providers.js";
import type { AgentTool, AgentToolContext, AgentToolSchema } from "./types.js";

export interface ToolDispatchResult {
  tool: string;
  result: Record<string, unknown>;
}

export class AgentToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  register(tool: AgentTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  list(): AgentTool[] {
    return [...this.tools.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  schemas(): AgentToolSchema[] {
    return this.list().map((tool) => tool.schema);
  }

  toOpenAIToolDefinitions(): ChatToolDefinition[] {
    return this.list().map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.schema.name,
        description: tool.schema.description,
        parameters: tool.schema.parameters
      }
    }));
  }

  async dispatch(name: string, args: Record<string, unknown>, context: AgentToolContext): Promise<ToolDispatchResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { tool: name, result: { error: `Unknown tool: ${name}` } };
    }
    try {
      return { tool: name, result: await tool.run(args, context) };
    } catch (error) {
      return {
        tool: name,
        result: { error: error instanceof Error ? error.message : "Tool execution failed." }
      };
    }
  }
}
