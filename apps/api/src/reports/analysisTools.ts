import type {
  ChatProvider,
  ChatToolDefinition,
  ProviderMetadata
} from "../providers.js";
import {
  ANALYSIS_TOOL_DRAFT_SCHEMA_VERSION,
  ANALYSIS_TOOL_INPUT_SCHEMA_VERSION,
  type AnalysisToolDraft,
  type AnalysisToolDraftSegment,
  type AnalysisToolInput
} from "./contracts.js";
import {
  REPORT_ANALYSIS_MAX_OUTPUT_TOKENS,
  REPORT_ANALYSIS_QUALITATIVE_STATEMENTS,
  REPORT_ANALYSIS_SYSTEM_PROMPT
} from "./analysisPrompt.js";

export const REPORT_ANALYSIS_TOOL_NAME = "submit_report_analysis" as const;
export const REPORT_ANALYSIS_PROVIDER_USER_ID = "report-b-agent" as const;

const MAX_INPUT_BYTES = 256 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_SEGMENTS = 64;
const MAX_TEXT_LENGTH = 2_000;
const MAX_CITATIONS_PER_TEXT = 32;
const MAX_TOKENS = REPORT_ANALYSIS_MAX_OUTPUT_TOKENS;
const ALIAS_PATTERN = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/u;
const NUMERIC_TEXT_PATTERN = /\p{N}/u;
const APPROVED_QUALITATIVE_STATEMENTS = new Set<string>(REPORT_ANALYSIS_QUALITATIVE_STATEMENTS);
const UNSAFE_TEXT_PATTERNS = [
  /<\s*system\s*>/iu,
  /ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions/iu,
  /you\s+are\s+now\s+/iu
] as const;

export type ReportAnalysisModelSegment = AnalysisToolDraftSegment;
export type ReportAnalysisModelResult = AnalysisToolDraft;

export interface ReportAnalysisModelRequest {
  projectId: string;
  /** Stable internal request ID used for provider diagnostics, not model-authored content. */
  requestId: string;
  /** Alias-only typed facts. This value is always isolated as untrusted user data. */
  evidencePayload: AnalysisToolInput;
  signal?: AbortSignal;
  maxTokens?: number;
}

export interface ReportAnalysisModel {
  readonly metadata: Readonly<ProviderMetadata>;
  analyze(request: ReportAnalysisModelRequest): Promise<ReportAnalysisModelResult>;
}

export type ReportAnalysisModelErrorCode =
  | "invalid_input"
  | "input_too_large"
  | "provider_aborted"
  | "provider_failed"
  | "provider_fallback"
  | "invalid_output"
  | "output_too_large";

const ERROR_MESSAGES: Record<ReportAnalysisModelErrorCode, string> = {
  invalid_input: "Report analysis input is invalid.",
  input_too_large: "Report analysis input exceeds the allowed size.",
  provider_aborted: "Report analysis provider request was aborted.",
  provider_failed: "Report analysis provider failed.",
  provider_fallback: "Report analysis provider returned a fallback response.",
  invalid_output: "Report analysis provider returned an invalid result.",
  output_too_large: "Report analysis provider result exceeds the allowed size."
};

export class ReportAnalysisModelError extends Error {
  readonly code: ReportAnalysisModelErrorCode;

  constructor(code: ReportAnalysisModelErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "ReportAnalysisModelError";
    this.code = code;
  }
}

function fail(code: ReportAnalysisModelErrorCode): never {
  throw new ReportAnalysisModelError(code);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isAlias(value: unknown): value is string {
  return typeof value === "string" && ALIAS_PATTERN.test(value);
}

function parseAlias(value: unknown): string {
  if (!isAlias(value)) fail("invalid_output");
  return value;
}

function parseCitationAliases(value: unknown): string[] {
  if (
    !Array.isArray(value)
    || value.length === 0
    || value.length > MAX_CITATIONS_PER_TEXT
  ) {
    fail("invalid_output");
  }
  const citations = value.map((candidate) => parseAlias(candidate));
  if (new Set(citations).size !== citations.length) fail("invalid_output");
  return citations;
}

function parseText(value: unknown): string {
  if (typeof value !== "string") fail("invalid_output");
  const text = value.trim();
  if (!text || text.length > MAX_TEXT_LENGTH) fail("invalid_output");
  if (NUMERIC_TEXT_PATTERN.test(text)) fail("invalid_output");
  if (UNSAFE_TEXT_PATTERNS.some((pattern) => pattern.test(text))) fail("invalid_output");
  if (/\p{Cc}/u.test(text)) fail("invalid_output");
  if (!APPROVED_QUALITATIVE_STATEMENTS.has(text)) fail("invalid_output");
  return text;
}

function parseSegment(value: unknown): AnalysisToolDraftSegment {
  if (!isRecord(value) || typeof value.kind !== "string") fail("invalid_output");
  switch (value.kind) {
    case "text":
      if (!hasExactKeys(value, ["kind", "text", "citationAliases"])) fail("invalid_output");
      return {
        kind: "text",
        text: parseText(value.text),
        citationAliases: parseCitationAliases(value.citationAliases)
      };
    case "metric_ref":
      if (!hasExactKeys(value, ["kind", "metricAlias"])) fail("invalid_output");
      return { kind: "metric_ref", metricAlias: parseAlias(value.metricAlias) };
    case "equipment_ref":
      if (!hasExactKeys(value, ["kind", "equipmentAlias"])) fail("invalid_output");
      return { kind: "equipment_ref", equipmentAlias: parseAlias(value.equipmentAlias) };
    case "fault_ref":
      if (!hasExactKeys(value, ["kind", "faultAlias"])) fail("invalid_output");
      return { kind: "fault_ref", faultAlias: parseAlias(value.faultAlias) };
    default:
      return fail("invalid_output");
  }
}

function parseModelResult(rawArguments: string, expectedRequestAlias: string): AnalysisToolDraft {
  if (byteLength(rawArguments) > MAX_OUTPUT_BYTES) fail("output_too_large");
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArguments) as unknown;
  } catch {
    return fail("invalid_output");
  }
  if (!isRecord(parsed)) return fail("invalid_output");
  if (parsed.schemaVersion !== ANALYSIS_TOOL_DRAFT_SCHEMA_VERSION) fail("invalid_output");
  const requestAlias = parseAlias(parsed.requestAlias);
  if (requestAlias !== expectedRequestAlias) fail("invalid_output");
  if (parsed.status !== "complete" && parsed.status !== "insufficient_evidence") {
    fail("invalid_output");
  }
  if (!Array.isArray(parsed.segments) || parsed.segments.length > MAX_SEGMENTS) {
    fail("invalid_output");
  }
  const segments = parsed.segments.map((segment) => parseSegment(segment));
  if (parsed.status === "complete") {
    if (!hasExactKeys(parsed, ["schemaVersion", "requestAlias", "status", "segments"])) {
      fail("invalid_output");
    }
    if (segments.length === 0) fail("invalid_output");
    return {
      schemaVersion: ANALYSIS_TOOL_DRAFT_SCHEMA_VERSION,
      requestAlias,
      status: "complete",
      segments
    };
  }
  if (!hasExactKeys(parsed, ["schemaVersion", "requestAlias", "status", "segments"])) {
    fail("invalid_output");
  }
  if (segments.length !== 0) fail("invalid_output");
  return {
    schemaVersion: ANALYSIS_TOOL_DRAFT_SCHEMA_VERSION,
    requestAlias,
    status: "insufficient_evidence",
    segments: []
  };
}

const toolParameters: ChatToolDefinition["function"]["parameters"] & {
  additionalProperties: false;
} = {
  type: "object",
  additionalProperties: false,
  properties: {
    schemaVersion: { const: ANALYSIS_TOOL_DRAFT_SCHEMA_VERSION },
    requestAlias: { type: "string" },
    status: { type: "string", enum: ["complete", "insufficient_evidence"] },
    segments: {
      type: "array",
      maxItems: MAX_SEGMENTS,
      items: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: { const: "text" },
              text: { type: "string", maxLength: MAX_TEXT_LENGTH },
              citationAliases: {
                type: "array",
                minItems: 1,
                maxItems: MAX_CITATIONS_PER_TEXT,
                uniqueItems: true,
                items: { type: "string" }
              }
            },
            required: ["kind", "text", "citationAliases"]
          },
          {
            type: "object",
            additionalProperties: false,
            properties: { kind: { const: "metric_ref" }, metricAlias: { type: "string" } },
            required: ["kind", "metricAlias"]
          },
          {
            type: "object",
            additionalProperties: false,
            properties: { kind: { const: "equipment_ref" }, equipmentAlias: { type: "string" } },
            required: ["kind", "equipmentAlias"]
          },
          {
            type: "object",
            additionalProperties: false,
            properties: { kind: { const: "fault_ref" }, faultAlias: { type: "string" } },
            required: ["kind", "faultAlias"]
          }
        ]
      }
    }
  },
  required: ["schemaVersion", "requestAlias", "status", "segments"]
};

const SUBMIT_REPORT_ANALYSIS_TOOL: ChatToolDefinition = Object.freeze({
  type: "function",
  function: {
    name: REPORT_ANALYSIS_TOOL_NAME,
    description: "Submit one grounded report-analysis result. This tool records output only and is never dispatched.",
    parameters: toolParameters
  }
});

function serializePayload(request: ReportAnalysisModelRequest): string {
  let json: string;
  try {
    json = JSON.stringify(request.evidencePayload);
  } catch {
    return fail("invalid_input");
  }
  if (typeof json !== "string") fail("invalid_input");
  const payload = `UNTRUSTED_EVIDENCE_JSON\n${json}`;
  if (byteLength(payload) > MAX_INPUT_BYTES) fail("input_too_large");
  return payload;
}

function validateRequest(request: ReportAnalysisModelRequest): void {
  if (!request || typeof request !== "object") fail("invalid_input");
  if (typeof request.projectId !== "string" || !request.projectId.trim()) fail("invalid_input");
  if (typeof request.requestId !== "string" || !request.requestId.trim()) fail("invalid_input");
  if (!isRecord(request.evidencePayload)) fail("invalid_input");
  if (request.evidencePayload.schemaVersion !== ANALYSIS_TOOL_INPUT_SCHEMA_VERSION) fail("invalid_input");
  if (!isAlias(request.evidencePayload.requestAlias)) fail("invalid_input");
  if (
    request.maxTokens !== undefined
    && (!Number.isInteger(request.maxTokens) || request.maxTokens < 1 || request.maxTokens > MAX_TOKENS)
  ) {
    fail("invalid_input");
  }
}

/**
 * Narrow B-Agent adapter. It performs one provider completion and parses the
 * inert structured submission itself; it never dispatches provider tool calls.
 */
export function createChatProviderAnalysisModel(provider: ChatProvider): ReportAnalysisModel {
  const metadata = Object.freeze({ ...provider.metadata });
  return {
    metadata,
    async analyze(request) {
      validateRequest(request);
      const payload = serializePayload(request);
      let completion: Awaited<ReturnType<ChatProvider["complete"]>>;
      try {
        completion = await provider.complete({
          projectId: request.projectId.trim(),
          userId: REPORT_ANALYSIS_PROVIDER_USER_ID,
          requestId: request.requestId.trim(),
          messages: [
            { role: "system", content: REPORT_ANALYSIS_SYSTEM_PROMPT },
            { role: "user", content: payload }
          ],
          tools: [SUBMIT_REPORT_ANALYSIS_TOOL],
          toolChoice: "required",
          ...(request.signal !== undefined ? { signal: request.signal } : {}),
          maxTokens: request.maxTokens ?? REPORT_ANALYSIS_MAX_OUTPUT_TOKENS
        });
      } catch {
        if (request.signal?.aborted) fail("provider_aborted");
        return fail("provider_failed");
      }
      if (!completion || typeof completion !== "object") fail("invalid_output");
      if (completion.fallbackUsed !== false) fail("provider_fallback");
      if (!Array.isArray(completion.toolCalls) || completion.toolCalls.length !== 1) {
        fail("invalid_output");
      }
      const call = completion.toolCalls[0];
      if (
        !call
        || call.type !== "function"
        || call.function?.name !== REPORT_ANALYSIS_TOOL_NAME
        || typeof call.function.arguments !== "string"
      ) {
        fail("invalid_output");
      }
      return parseModelResult(call.function.arguments, request.evidencePayload.requestAlias);
    }
  };
}
