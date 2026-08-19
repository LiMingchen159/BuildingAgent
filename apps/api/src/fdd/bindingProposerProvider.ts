import { createHash } from "node:crypto";
import type { ChatProvider, ChatToolDefinition, ProviderChatMessage } from "../providers.js";
import type {
  FddBindingProposerCompletionPort,
  FddBindingProposerCompletionRequest,
  FddBindingProposerCompletionResult
} from "./bindingProposer.js";

function providerMessages(request: FddBindingProposerCompletionRequest): ProviderChatMessage[] {
  return request.messages.map((message) => ({
    role: message.role,
    content: message.role === "assistant" && message.toolCalls?.length ? null : message.content,
    ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
    ...(message.toolCalls ? {
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function" as const,
        function: { name: call.name, arguments: call.argumentsJson }
      }))
    } : {})
  }));
}

function providerTools(request: FddBindingProposerCompletionRequest): ChatToolDefinition[] {
  return request.tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties: structuredClone(tool.inputSchema.properties),
        ...(tool.inputSchema.required ? { required: [...tool.inputSchema.required] } : {}),
        additionalProperties: false
      }
    }
  }));
}

/**
 * Minimal provider adapter for the restricted proposer. It deliberately
 * bypasses AgentRuntime, generic tools, memory, KB retrieval, and user input.
 */
export function createFddBindingProposerCompletionPort(
  provider: ChatProvider
): FddBindingProposerCompletionPort {
  const adapterRevision = createHash("sha256")
    .update(JSON.stringify({
      id: provider.metadata.id,
      mode: provider.metadata.mode,
      model: provider.metadata.model,
      status: provider.metadata.status ?? null
    }))
    .digest("hex")
    .slice(0, 16);
  return {
    providerVersion: `fdd-chat-adapter-v1:${provider.metadata.id}:${provider.metadata.mode}:${adapterRevision}`,
    modelVersion: provider.metadata.model,
    async complete(request): Promise<FddBindingProposerCompletionResult> {
      if (provider.metadata.mode !== "real") {
        throw Object.assign(new Error("Restricted proposer requires a real configured provider."), {
          code: "provider_not_configured"
        });
      }
      const requestId = `fdd_proposer_${createHash("sha256")
        .update(JSON.stringify([request.projectId, request.messages, request.tools]))
        .digest("hex")
        .slice(0, 24)}`;
      const result = await provider.complete({
        projectId: request.projectId,
        userId: "system_fdd_binding_proposer",
        requestId,
        messages: providerMessages(request),
        tools: providerTools(request),
        toolChoice: "auto",
        maxTokens: request.maxTokens,
        signal: request.signal,
        stream: false
      });
      if (result.fallbackUsed || result.provider.mode !== "real") {
        throw Object.assign(new Error("Restricted proposer does not accept fallback model output."), {
          code: "provider_fallback_rejected"
        });
      }
      const toolCalls = result.toolCalls?.map((call) => {
        if (
          typeof call?.id !== "string"
          || call.type !== "function"
          || typeof call.function?.name !== "string"
          || typeof call.function?.arguments !== "string"
        ) {
          throw Object.assign(new Error("Provider returned an invalid restricted tool call."), {
            code: "provider_malformed_response"
          });
        }
        return {
          id: call.id,
          name: call.function.name,
          argumentsJson: call.function.arguments
        };
      });
      return {
        text: result.text,
        ...(toolCalls ? { toolCalls } : {})
      };
    }
  };
}
