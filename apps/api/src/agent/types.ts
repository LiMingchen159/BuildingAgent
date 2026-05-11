import type { ChatCompletionResult, ChatProvider, ProviderChatMessage } from "../providers.js";
import type { ChatMessage, KnowledgeBaseDocument } from "../seed.js";

export type AgentLifecycleEventType =
  | "user_message_received"
  | "memory_recalled"
  | "skills_applied"
  | "tool_started"
  | "tool_completed"
  | "provider_started"
  | "assistant_message_completed"
  | "memory_synced";

export interface AgentLifecycleEvent {
  type: AgentLifecycleEventType;
  message: string;
  at: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface AgentTurnRequest {
  projectId: string;
  userId: string;
  requestId: string;
  messages: ChatMessage[];
  providerMessages: ProviderChatMessage[];
  provider: ChatProvider;
  knowledgeBaseDocuments: KnowledgeBaseDocument[];
}

export interface AgentTurnResult {
  completion: ChatCompletionResult;
  events: AgentLifecycleEvent[];
}

export interface AgentToolSchema {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface AgentToolContext {
  projectId: string;
  userId: string;
  requestId: string;
  messages: ChatMessage[];
}

export interface AgentTool {
  name: string;
  category: "memory" | "session" | "utility" | "building";
  description: string;
  schema: AgentToolSchema;
  run(args: Record<string, unknown>, context: AgentToolContext): Promise<Record<string, unknown>>;
}

export interface AgentSkill {
  id: string;
  name: string;
  domain: "building" | "project" | "runtime";
  description: string;
  promptHint: string;
}
