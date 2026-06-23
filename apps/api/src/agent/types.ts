import type { ChatCompletionResult, ChatProvider, ChatToolCall, ProviderChatMessage } from "../providers.js";
import type { ChatMessage, ChatMessageDownload, ChatMessageImage, KnowledgeBaseDocument, RepositoryArtifact } from "../seed.js";

export type AgentLifecycleEventType =
  | "user_message_received"
  | "memory_recalled"
  | "skills_applied"
  | "tool_started"
  | "tool_completed"
  | "provider_started"
  | "assistant_message_completed"
  | "memory_synced"
  | "loop_started"
  | "progress"
  /** Agent work narration shown in Worked-for gray area (maps to narration_token). */
  | "work_token"
  /** Explicit gate: subsequent answer_token chunks belong in final-answer. */
  | "answer_start"
  /** Final answer chunk (maps to SSE answer_token). */
  | "answer_token"
  | "answer_end"
  | "turn_completed"
  | "validation_warning";

export interface AgentLifecycleEvent {
  type: AgentLifecycleEventType;
  message: string;
  at: string;
  metadata?: Record<string, unknown>;
}

export interface AgentTurnRequest {
  projectId: string;
  userId: string;
  requestId: string;
  conversationId: string;
  canConfigure: boolean;
  messages: ChatMessage[];
  providerMessages: ProviderChatMessage[];
  provider: ChatProvider;
  knowledgeBaseDocuments: KnowledgeBaseDocument[];
  repositoryArtifacts: RepositoryArtifact[];
}

export interface AgentTurnResult {
  completion: ChatCompletionResult;
  events: AgentLifecycleEvent[];
  generatedImages: ChatMessageImage[];
  generatedDownloads: ChatMessageDownload[];
}

export interface AgentLoopResult {
  finalText: string;
  events: AgentLifecycleEvent[];
  toolCallHistory: Array<{ name: string; args: Record<string, unknown>; result: Record<string, unknown> }>;
  iterations: number;
  generatedImages: ChatMessageImage[];
  generatedDownloads: ChatMessageDownload[];
}

export interface AgentStreamEvent {
  type: AgentLifecycleEventType;
  message: string;
  at: string;
  metadata?: Record<string, string | number | boolean>;
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
  conversationId: string;
  canConfigure: boolean;
  messages: ChatMessage[];
  /** OpenAI tool_call id — used for compaction cache filenames. */
  toolCallId?: string;
}

export interface AgentTool {
  name: string;
  category: "memory" | "session" | "utility" | "building" | "file" | "web";
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
