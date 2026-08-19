import { describe, expect, it, vi } from "vitest";
import type { ChatProvider } from "../providers.js";
import { createFddBindingProposerCompletionPort } from "./bindingProposerProvider.js";
import { fddBindingProposerToolDefinitions } from "./bindingProposerTools.js";

function request() {
  return {
    projectId: "project_element",
    messages: [
      { role: "system" as const, content: "restricted system" },
      {
        role: "assistant" as const,
        content: "",
        toolCalls: [{ id: "call_1", name: "get_inventory_facts", argumentsJson: "{}" }]
      }
    ],
    tools: fddBindingProposerToolDefinitions(),
    providerVersion: "adapter",
    modelVersion: "model",
    maxTokens: 512,
    signal: new AbortController().signal
  };
}

describe("restricted proposer ChatProvider adapter", () => {
  it("passes only bounded dedicated messages/tools and preserves strict schemas", async () => {
    let capturedRequest: Parameters<ChatProvider["complete"]>[0] | undefined;
    const complete = vi.fn(async (providerRequest: Parameters<ChatProvider["complete"]>[0]) => {
      capturedRequest = providerRequest;
      return {
        text: "{}",
        toolCalls: [{
          id: "call_2",
          type: "function" as const,
          function: { name: "list_point_families", arguments: "{}" }
        }],
        provider: { id: "openai", mode: "real" as const, model: "model-v1" },
        fallbackUsed: false
      };
    });
    const provider: ChatProvider = {
      metadata: { id: "openai", mode: "real", model: "model-v1" },
      complete
    };
    const port = createFddBindingProposerCompletionPort(provider);
    const result = await port.complete(request());

    expect(port.providerVersion).toMatch(/^fdd-chat-adapter-v1:openai:real:[a-f0-9]{16}$/u);
    expect(port.modelVersion).toBe("model-v1");
    expect(result.toolCalls).toEqual([{ id: "call_2", name: "list_point_families", argumentsJson: "{}" }]);
    expect(complete).toHaveBeenCalledOnce();
    const providerRequest = capturedRequest;
    if (!providerRequest) throw new Error("Provider request was not captured");
    expect(providerRequest).toMatchObject({
      projectId: "project_element",
      userId: "system_fdd_binding_proposer",
      toolChoice: "auto",
      maxTokens: 512,
      stream: false
    });
    expect(providerRequest.messages[1]).toMatchObject({ role: "assistant", content: null });
    const providerTools = providerRequest.tools ?? [];
    expect(providerTools.map((tool) => tool.function.name)).toEqual([
      "get_algorithm_contract",
      "get_evaluator_facts",
      "get_inventory_facts",
      "list_point_families",
      "inspect_point_family"
    ]);
    expect(providerTools.every((tool) => tool.function.parameters.additionalProperties === false)).toBe(true);
    expect(JSON.stringify(providerRequest)).not.toMatch(/read_file|write_file|deploy|memory|knowledge_base/u);
  });

  it("rejects mock providers, fallback output, and malformed tool calls", async () => {
    const mockProvider: ChatProvider = {
      metadata: { id: "mock", mode: "mock", model: "mock" },
      complete: async () => ({ text: "{}", provider: { id: "mock", mode: "mock", model: "mock" }, fallbackUsed: false })
    };
    await expect(createFddBindingProposerCompletionPort(mockProvider).complete(request()))
      .rejects.toMatchObject({ code: "provider_not_configured" });

    const fallbackProvider: ChatProvider = {
      metadata: { id: "real", mode: "real", model: "model" },
      complete: async () => ({ text: "{}", provider: { id: "mock", mode: "mock", model: "mock" }, fallbackUsed: true })
    };
    await expect(createFddBindingProposerCompletionPort(fallbackProvider).complete(request()))
      .rejects.toMatchObject({ code: "provider_fallback_rejected" });

    const malformedProvider: ChatProvider = {
      metadata: { id: "real", mode: "real", model: "model" },
      complete: async () => ({
        text: "",
        toolCalls: [{ id: 42 } as never],
        provider: { id: "real", mode: "real", model: "model" },
        fallbackUsed: false
      })
    };
    await expect(createFddBindingProposerCompletionPort(malformedProvider).complete(request()))
      .rejects.toMatchObject({ code: "provider_malformed_response" });
  });
});
