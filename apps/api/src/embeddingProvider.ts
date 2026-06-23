export interface EmbeddingProvider {
  embedText(text: string): Promise<number[] | null>;
  isConfigured(): boolean;
}

type FetchLike = typeof fetch;

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveEmbeddingConfig(env: NodeJS.ProcessEnv): { apiKey?: string; baseUrl: string; model: string } {
  const explicitEmbeddingKey = nonEmpty(env.BUILDING_AGENT_EMBEDDING_API_KEY);
  const explicitBaseUrl = nonEmpty(env.BUILDING_AGENT_EMBEDDING_BASE_URL ?? env.EMBEDDING_BASE_URL);
  const explicitModel = nonEmpty(env.BUILDING_AGENT_EMBEDDING_MODEL ?? env.EMBEDDING_MODEL);
  const llmKey = nonEmpty(
    env.BUILDING_AGENT_LLM_API_KEY ?? env.LLM_API_KEY ?? env.OPENAI_API_KEY ?? env.CHAT_PROVIDER_API_KEY
  );
  const llmBaseUrl = nonEmpty(
    env.BUILDING_AGENT_LLM_BASE_URL ?? env.LLM_BASE_URL ?? env.OPENAI_BASE_URL ?? env.CHAT_PROVIDER_BASE_URL
  );

  const apiKey = explicitEmbeddingKey ?? llmKey;
  const baseUrl = (explicitBaseUrl ?? llmBaseUrl ?? "https://api.openai.com/v1").replace(/\/+$/u, "");
  const model = explicitModel ?? DEFAULT_EMBEDDING_MODEL;

  return { ...(apiKey ? { apiKey } : {}), baseUrl, model };
}

export function createEmbeddingProvider(env: NodeJS.ProcessEnv = process.env, fetchImpl: FetchLike = fetch): EmbeddingProvider {
  const { apiKey, baseUrl, model } = resolveEmbeddingConfig(env);

  return {
    isConfigured() {
      return Boolean(apiKey);
    },
    async embedText(text: string): Promise<number[] | null> {
      if (!apiKey) {
        return null;
      }
      const trimmed = text.trim();
      if (!trimmed) {
        return null;
      }
      try {
        const response = await fetchImpl(`${baseUrl}/embeddings`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({ model, input: trimmed }),
          signal: AbortSignal.timeout(15_000)
        });
        if (!response.ok) {
          return null;
        }
        const payload = (await response.json()) as {
          data?: Array<{ embedding?: number[] }>;
        };
        const embedding = payload.data?.[0]?.embedding;
        return Array.isArray(embedding) && embedding.length > 0 ? embedding : null;
      } catch {
        return null;
      }
    }
  };
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function embeddingToBlob(values: number[]): Buffer {
  const buffer = Buffer.alloc(values.length * 4);
  for (let index = 0; index < values.length; index += 1) {
    buffer.writeFloatLE(values[index] ?? 0, index * 4);
  }
  return buffer;
}

export function embeddingFromBlob(blob: Buffer | null): number[] | null {
  if (!blob || blob.length === 0 || blob.length % 4 !== 0) {
    return null;
  }
  const values: number[] = [];
  for (let offset = 0; offset < blob.length; offset += 4) {
    values.push(blob.readFloatLE(offset));
  }
  return values;
}
