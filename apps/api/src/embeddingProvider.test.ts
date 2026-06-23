import { describe, expect, it } from "vitest";
import { createEmbeddingProvider } from "./embeddingProvider.js";

describe("embeddingProvider", () => {
  it("defaults to LLM gateway and text-embedding-3-small when embedding env is unset", () => {
    const provider = createEmbeddingProvider({
      BUILDING_AGENT_LLM_API_KEY: "llm-key",
      BUILDING_AGENT_LLM_BASE_URL: "https://yunwu.ai/v1",
      DASHSCOPE_API_KEY: "dashscope-key"
    });
    expect(provider.isConfigured()).toBe(true);
  });

  it("uses explicit embedding overrides when provided", async () => {
    let requestedUrl = "";
    let requestedBody = "";
    const provider = createEmbeddingProvider(
      {
        BUILDING_AGENT_LLM_API_KEY: "llm-key",
        BUILDING_AGENT_LLM_BASE_URL: "https://yunwu.ai/v1",
        BUILDING_AGENT_EMBEDDING_API_KEY: "embed-key",
        BUILDING_AGENT_EMBEDDING_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        BUILDING_AGENT_EMBEDDING_MODEL: "text-embedding-v3"
      },
      async (url, init) => {
        requestedUrl = String(url);
        requestedBody = String(init?.body ?? "");
        return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), { status: 200 });
      }
    );
    const vector = await provider.embedText("hello");
    expect(vector).toEqual([0.1, 0.2]);
    expect(requestedUrl).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings");
    expect(requestedBody).toContain("text-embedding-v3");
    expect(requestedBody).not.toContain("text-embedding-3-small");
  });
});
