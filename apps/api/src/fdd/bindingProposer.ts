import { createHash } from "node:crypto";
import {
  parseFddBindingProposalJson,
  planFleetGuard,
  type FddBindingProposal,
  type FddBindingProposalEvidenceRefKind,
  type FleetGuardPlan,
  type FleetGuardPlanInput
} from "@building-agent/fdd-deployment-planner";
import {
  FDD_BINDING_PROPOSER_SKILL_VERSION,
  FDD_BINDING_PROPOSER_SYSTEM_PROMPT,
  fddBindingProposerTaskMessage
} from "./bindingProposerSkill.js";
import {
  FDD_BINDING_PROPOSER_TOOL_VERSION,
  FddBindingProposerToolError,
  FddBindingProposerTools,
  buildFddBindingProposerSafeSnapshot,
  fddBindingProposerToolDefinitions,
  type FddBindingProposerSafeSnapshot,
  type FddBindingProposerToolDefinition
} from "./bindingProposerTools.js";

export type FddBindingProposerMode = "off" | "shadow";

export interface FddBindingProposerConfig {
  mode: FddBindingProposerMode;
  projectIds: string[];
  algorithmIds: string[];
}

export interface FddBindingProposerMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: FddBindingProposerToolCall[];
}

export interface FddBindingProposerToolCall {
  id: string;
  name: string;
  argumentsJson: string;
}

export interface FddBindingProposerCompletionRequest {
  projectId: string;
  messages: FddBindingProposerMessage[];
  tools: readonly FddBindingProposerToolDefinition[];
  providerVersion: string;
  modelVersion: string;
  maxTokens: number;
  signal: AbortSignal;
}

export interface FddBindingProposerCompletionResult {
  text: string;
  toolCalls?: FddBindingProposerToolCall[];
}

/** The only model capability exposed to the dedicated proposer. */
export interface FddBindingProposerCompletionPort {
  readonly providerVersion: string;
  readonly modelVersion: string;
  complete(request: FddBindingProposerCompletionRequest): Promise<FddBindingProposerCompletionResult>;
}

export type FddBindingProposerAuditErrorCode =
  | "snapshot_plan_mismatch"
  | "invalid_snapshot"
  | "provider_http_402"
  | "provider_error"
  | "timeout"
  | "invalid_json"
  | "invalid_proposal"
  | "response_too_large"
  | "tool_error"
  | "tool_round_limit";

export interface FddBindingProposerShadowComparison {
  fleetGuardState: FleetGuardPlan["state"];
  matchesFleetGuardFamilies: boolean | null;
}

export interface FddBindingProposerToolAudit {
  round: number;
  ordinal: number;
  toolName: string;
  argumentsHash: string;
  resultHash?: string;
  durationMs: number;
  status: "succeeded" | "failed";
}

export interface FddBindingProposerAuditRecord {
  runKey: string;
  projectId: string;
  status: "succeeded" | "failed";
  evidenceSnapshotHash: string;
  evidenceRefTableHash: string;
  evidenceRefSummary: Record<FddBindingProposalEvidenceRefKind, number>;
  algorithmSignatureHash: string;
  signatureHashes: Record<keyof FleetGuardPlanInput["signatures"], string>;
  fleetGuardPlanIdHash: string;
  fleetGuardPolicyVersion: string;
  fleetGuardPlanSignature: string;
  promptHash: string;
  skillPromptHash: string;
  toolContractHash: string;
  providerVersion: string;
  modelVersion: string;
  skillVersion: string;
  toolVersion: string;
  startedAt: string;
  finishedAt: string;
  toolCalls: FddBindingProposerToolAudit[];
  proposal?: FddBindingProposal;
  comparison?: FddBindingProposerShadowComparison;
  errorCode?: FddBindingProposerAuditErrorCode;
}

export interface FddBindingProposerAuditSink {
  append(record: FddBindingProposerAuditRecord): void | Promise<void>;
}

export interface FddBindingProposerShadowRequest {
  projectId: string;
  /** Project identity captured with the frozen evidence, independently of the scheduling caller. */
  evidenceProjectId: string;
  plannerInput: FleetGuardPlanInput;
}

export type FddBindingProposerScheduleResult =
  | { status: "off" | "project_not_allowed" | "algorithm_not_allowed" | "capacity_limited" }
  | { status: "scheduled" | "deduplicated"; runKey: string; completion: Promise<FddBindingProposerAuditRecord> };

export interface FddBindingProposerShadowServiceOptions {
  config: FddBindingProposerConfig;
  completionPort: FddBindingProposerCompletionPort;
  auditSink?: FddBindingProposerAuditSink;
  timeoutMs?: number;
  maxTokens?: number;
  now?: () => string;
  nowMs?: () => number;
  auditTimeoutMs?: number;
  successTtlMs?: number;
  failureBackoffMs?: number;
  maxCachedRuns?: number;
  skillVersion?: string;
  toolVersion?: string;
}

interface FddBindingProposerSafePlanProjection {
  state: FleetGuardPlan["state"];
  roleFamilies: Array<{ role: string; familyKey: string }>;
  planIdHash: string;
  policyVersion: string;
  signature: string;
}

interface FddBindingProposerPreparedSuccess {
  status: "ready";
  projectId: string;
  snapshot: FddBindingProposerSafeSnapshot;
  plan: FddBindingProposerSafePlanProjection;
  signatureHashes: Record<keyof FleetGuardPlanInput["signatures"], string>;
}

interface FddBindingProposerPreparedFailure {
  status: "failed";
  projectId: string;
  errorCode: FddBindingProposerAuditErrorCode;
  evidenceSnapshotHash: string;
  algorithmSignatureHash: string;
  signatureHashes: Record<keyof FleetGuardPlanInput["signatures"], string>;
}

type FddBindingProposerPreparedRun = FddBindingProposerPreparedSuccess | FddBindingProposerPreparedFailure;

interface FddBindingProposerScheduledRun {
  prepared: FddBindingProposerPreparedRun;
  providerVersion: string;
  modelVersion: string;
  skillVersion: string;
  toolVersion: string;
  promptHash: string;
  skillPromptHash: string;
  toolContractHash: string;
  inputFingerprint: string;
}

interface FddBindingProposerCachedRun {
  completion: Promise<FddBindingProposerAuditRecord>;
  expiresAtMs: number;
  settled: boolean;
}

class FddBindingProposerRunError extends Error {
  constructor(readonly code: FddBindingProposerAuditErrorCode) {
    super(code);
    this.name = "FddBindingProposerRunError";
  }
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => typeof record[key] !== "undefined")
    .sort(compareText)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function contentHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function proposalPromptHash(input: {
  projectId: string;
  evidenceSnapshotHash: string;
  algorithmSignature: string;
  requiredRoles: string[];
}): string {
  const task = fddBindingProposerTaskMessage({
    projectId: input.projectId,
    evidenceSnapshotHash: input.evidenceSnapshotHash,
    algorithmSignature: input.algorithmSignature,
    requiredRoles: input.requiredRoles
  });
  return contentHash(canonicalJson([
    { role: "system", content: FDD_BINDING_PROPOSER_SYSTEM_PROMPT },
    { role: "user", content: task }
  ]));
}

export function fddBindingProposerConfigFromEnv(
  env: Record<string, string | undefined>
): FddBindingProposerConfig {
  const mode = env.BUILDING_AGENT_FDD_PROPOSER_MODE?.trim().toLowerCase() === "shadow"
    ? "shadow"
    : "off";
  const projectIds = [...new Set((env.BUILDING_AGENT_FDD_PROPOSER_PROJECT_IDS ?? "")
    .split(",")
    .map((projectId) => projectId.trim())
    .filter((projectId) => Boolean(projectId) && projectId !== "*"))]
    .sort(compareText);
  const algorithmIds = [...new Set((env.BUILDING_AGENT_FDD_PROPOSER_ALGORITHM_IDS ?? "")
    .split(",")
    .map((algorithmId) => algorithmId.trim())
    .filter((algorithmId) => Boolean(algorithmId) && algorithmId !== "*"))]
    .sort(compareText);
  return { mode, projectIds, algorithmIds };
}

function shadowRunKey(input: {
  projectId: string;
  inputFingerprint: string;
  skillPromptHash: string;
  toolContractHash: string;
  providerVersion: string;
  modelVersion: string;
  skillVersion: string;
  toolVersion: string;
}): string {
  return createHash("sha256")
    .update(JSON.stringify([
      input.projectId,
      input.inputFingerprint,
      input.skillPromptHash,
      input.toolContractHash,
      input.providerVersion,
      input.modelVersion,
      input.skillVersion,
      input.toolVersion
    ]))
    .digest("hex");
}

const SIGNATURE_KEYS = ["algorithm", "evaluator", "inventory", "evidence", "template", "skill", "model", "tool"] as const;

function signatureHashes(signatures: FleetGuardPlanInput["signatures"] | undefined): Record<typeof SIGNATURE_KEYS[number], string> {
  return Object.fromEntries(SIGNATURE_KEYS.map((key) => {
    const value = signatures?.[key];
    return [key, contentHash(canonicalJson({ present: typeof value !== "undefined", value }))];
  })) as Record<typeof SIGNATURE_KEYS[number], string>;
}

function emptyEvidenceRefSummary(): Record<FddBindingProposalEvidenceRefKind, number> {
  return { family_fact: 0, found_lookup: 0, lookup_fact: 0 };
}

function evidenceRefSummary(
  snapshot: FddBindingProposerSafeSnapshot
): Record<FddBindingProposalEvidenceRefKind, number> {
  const summary = emptyEvidenceRefSummary();
  for (const reference of snapshot.evidenceRefs) summary[reference.kind] += 1;
  return summary;
}

function plannerInputWithinShadowBounds(input: FleetGuardPlanInput): boolean {
  if (
    input.algorithm.requiredRoles.length > 64
    || input.inventory.members.length > 10_000
    || input.inventory.members.length * input.algorithm.requiredRoles.length > 32_768
    || input.roleFamilies.length > 4_096
    || input.lookups.length > 8_192
  ) return false;
  let observations = 0;
  for (const lookup of input.lookups) {
    observations += lookup.observations.length;
    if (observations > 8_192) return false;
  }
  return true;
}

function prepareShadowRun(request: FddBindingProposerShadowRequest): {
  prepared: FddBindingProposerPreparedRun;
  inputFingerprint: string;
  promptHash: string;
} {
  const projectId = typeof request.projectId === "string" ? request.projectId.trim() : "";
  const evidenceProjectId = typeof request.evidenceProjectId === "string" ? request.evidenceProjectId.trim() : "";
  const hashedSignatures = signatureHashes(request.plannerInput?.signatures);
  const failure = (errorCode: FddBindingProposerAuditErrorCode): {
    prepared: FddBindingProposerPreparedFailure;
    inputFingerprint: string;
    promptHash: string;
  } => {
    const evidenceSnapshotHash = contentHash(canonicalJson({
      projectId,
      evidenceProjectId,
      evidenceSignatureHash: hashedSignatures.evidence
    }));
    const prepared: FddBindingProposerPreparedFailure = {
      status: "failed",
      projectId,
      errorCode,
      evidenceSnapshotHash,
      algorithmSignatureHash: hashedSignatures.algorithm,
      signatureHashes: hashedSignatures
    };
    return {
      prepared,
      inputFingerprint: contentHash(canonicalJson(prepared)),
      promptHash: contentHash("prompt_unavailable")
    };
  };
  if (!projectId || projectId !== evidenceProjectId) return failure("snapshot_plan_mismatch");
  if (!plannerInputWithinShadowBounds(request.plannerInput)) return failure("invalid_snapshot");
  try {
    const snapshot = buildFddBindingProposerSafeSnapshot(projectId, request.plannerInput);
    // The service, not its caller or the model, owns this authoritative replay.
    const internalPlan = planFleetGuard(request.plannerInput);
    const plan: FddBindingProposerSafePlanProjection = {
      state: internalPlan.state,
      roleFamilies: internalPlan.roleFamilies.map(({ role, familyKey }) => ({ role, familyKey })),
      planIdHash: contentHash(internalPlan.planId),
      policyVersion: internalPlan.policyVersion,
      signature: contentHash(canonicalJson(internalPlan))
    };
    const prepared: FddBindingProposerPreparedSuccess = {
      status: "ready",
      projectId,
      snapshot,
      plan,
      signatureHashes: hashedSignatures
    };
    return {
      prepared,
      inputFingerprint: contentHash(canonicalJson({
        projectId,
        evidenceSnapshotHash: snapshot.evidenceSnapshotHash,
        algorithmSignature: snapshot.algorithmSignature,
        evidenceRefTableHash: snapshot.evidenceRefTableHash,
        plan
      })),
      promptHash: proposalPromptHash({
        projectId,
        evidenceSnapshotHash: snapshot.evidenceSnapshotHash,
        algorithmSignature: snapshot.algorithmSignature,
        requiredRoles: snapshot.algorithm.requiredRoles.map((role) => role.role)
      })
    };
  } catch (error) {
    return failure(error instanceof FddBindingProposerRunError ? error.code : "invalid_snapshot");
  }
}

function proposalComparison(
  proposal: FddBindingProposal,
  plan: Pick<FddBindingProposerSafePlanProjection, "state" | "roleFamilies">
): FddBindingProposerShadowComparison {
  if (proposal.outcome === "abstain") {
    return { fleetGuardState: plan.state, matchesFleetGuardFamilies: null };
  }
  const selectedByRole = new Map(plan.roleFamilies.map((family) => [family.role, family.familyKey]));
  const matches = proposal.bindings.length === plan.roleFamilies.length
    && proposal.bindings.every((binding) => selectedByRole.get(binding.role) === binding.pointFamilyKey);
  return { fleetGuardState: plan.state, matchesFleetGuardFamilies: matches };
}

function classifyProviderFailure(error: unknown): FddBindingProposerAuditErrorCode {
  if (error instanceof FddBindingProposerRunError || error instanceof FddBindingProposerToolError) {
    return error instanceof FddBindingProposerRunError ? error.code : "tool_error";
  }
  if (typeof error === "object" && error !== null) {
    const code = "code" in error ? (error as { code?: unknown }).code : undefined;
    const status = "status" in error ? (error as { status?: unknown }).status : undefined;
    if (code === "provider_http_error" && (status === 402 || status === "402")) return "provider_http_402";
  }
  return "provider_error";
}

async function completeWithDeadline(
  port: FddBindingProposerCompletionPort,
  request: FddBindingProposerCompletionRequest,
  deadlineMs: number,
  abortController: AbortController
): Promise<FddBindingProposerCompletionResult> {
  const remainingMs = deadlineMs - Date.now();
  if (remainingMs <= 0) {
    abortController.abort();
    throw new FddBindingProposerRunError("timeout");
  }
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      abortController.abort();
      reject(new FddBindingProposerRunError("timeout"));
    }, remainingMs);
  });
  try {
    return await Promise.race([port.complete(request), timeout]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function runDedicatedBindingProposer(input: {
  tools: FddBindingProposerTools;
  completionPort: FddBindingProposerCompletionPort;
  providerVersion: string;
  modelVersion: string;
  deadlineMs: number;
  maxTokens: number;
  toolAudit: FddBindingProposerToolAudit[];
}): Promise<FddBindingProposal> {
  const abortController = new AbortController();
  const messages: FddBindingProposerMessage[] = [
    { role: "system", content: FDD_BINDING_PROPOSER_SYSTEM_PROMPT },
    {
      role: "user",
      content: fddBindingProposerTaskMessage({
        projectId: input.tools.snapshot.projectId,
        evidenceSnapshotHash: input.tools.snapshot.evidenceSnapshotHash,
        algorithmSignature: input.tools.snapshot.algorithmSignature,
        requiredRoles: input.tools.snapshot.algorithm.requiredRoles.map((role) => role.role)
      })
    }
  ];
  let toolRounds = 0;
  let contextChars = messages.reduce((total, message) => total + message.content.length, 0);
  const seenToolCallIds = new Set<string>();
  while (true) {
    const completion = await completeWithDeadline(input.completionPort, {
      projectId: input.tools.snapshot.projectId,
      messages: messages.map((message) => ({
        ...message,
        ...(message.toolCalls ? { toolCalls: message.toolCalls.map((call) => ({ ...call })) } : {})
      })),
      tools: input.tools.definitions.map((definition) => structuredClone(definition)),
      providerVersion: input.providerVersion,
      modelVersion: input.modelVersion,
      maxTokens: input.maxTokens,
      signal: abortController.signal
    }, input.deadlineMs, abortController);
    if (typeof completion !== "object" || completion === null || typeof completion.text !== "string") {
      throw new FddBindingProposerRunError("invalid_json");
    }
    const toolCalls = completion.toolCalls ?? [];
    if (!Array.isArray(toolCalls)) throw new FddBindingProposerRunError("tool_error");
    if (toolCalls.length > 0) {
      if (toolRounds >= 2) throw new FddBindingProposerRunError("tool_round_limit");
      if (toolCalls.length > 4) throw new FddBindingProposerRunError("tool_round_limit");
      for (const call of toolCalls) {
        if (
          typeof call !== "object"
          || call === null
          || typeof call.id !== "string"
          || !/^[A-Za-z0-9_-]{1,128}$/u.test(call.id)
          || typeof call.name !== "string"
          || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(call.name)
          || typeof call.argumentsJson !== "string"
          || call.argumentsJson.length > 4_096
          || seenToolCallIds.has(call.id)
        ) {
          throw new FddBindingProposerRunError("tool_error");
        }
        seenToolCallIds.add(call.id);
      }
      toolRounds += 1;
      messages.push({
        role: "assistant",
        content: "",
        toolCalls: toolCalls.map((call) => ({ ...call }))
      });
      for (const call of toolCalls) {
        const startedAtMs = Date.now();
        const auditBase = {
          round: toolRounds,
          ordinal: input.toolAudit.length + 1,
          toolName: call.name,
          argumentsHash: contentHash(call.argumentsJson)
        };
        try {
          const content = input.tools.execute(call.name, call.argumentsJson);
          contextChars += content.length + call.argumentsJson.length;
          if (contextChars > 96_000) {
            throw new FddBindingProposerRunError("tool_error");
          }
          input.toolAudit.push({
            ...auditBase,
            resultHash: contentHash(content),
            durationMs: Math.max(0, Date.now() - startedAtMs),
            status: "succeeded"
          });
          messages.push({ role: "tool", content, toolCallId: call.id });
        } catch (error) {
          input.toolAudit.push({
            ...auditBase,
            durationMs: Math.max(0, Date.now() - startedAtMs),
            status: "failed"
          });
          throw error;
        }
      }
      continue;
    }
    const validation = parseFddBindingProposalJson(completion.text, input.tools.snapshot.validationContext);
    if (!validation.ok) {
      const code = validation.code === "invalid_json"
        ? "invalid_json"
        : validation.code === "response_too_large"
          ? "response_too_large"
          : "invalid_proposal";
      throw new FddBindingProposerRunError(code);
    }
    return validation.proposal;
  }
}

async function appendAuditSafely(
  sink: FddBindingProposerAuditSink | undefined,
  record: FddBindingProposerAuditRecord,
  timeoutMs: number
): Promise<void> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!sink) return;
    const timeout = new Promise<void>((resolve) => {
      timeoutHandle = setTimeout(resolve, timeoutMs);
    });
    await Promise.race([Promise.resolve(sink.append(structuredClone(record))), timeout]);
  } catch {
    // Shadow audit persistence must never affect FDD checks, tasks, or deploy.
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

export class InMemoryFddBindingProposerAuditStore implements FddBindingProposerAuditSink {
  private readonly recordsByProject = new Map<string, FddBindingProposerAuditRecord[]>();

  constructor(
    private readonly options: { maxRecordsPerProject?: number; ttlMs?: number; nowMs?: () => number } = {}
  ) {}

  private prune(projectId: string): FddBindingProposerAuditRecord[] {
    const now = (this.options.nowMs ?? Date.now)();
    const ttlMs = Math.max(1, this.options.ttlMs ?? 7 * 24 * 60 * 60_000);
    const maxRecords = Math.max(1, Math.min(this.options.maxRecordsPerProject ?? 100, 1_000));
    const records = (this.recordsByProject.get(projectId) ?? [])
      .filter((record) => {
        const finishedAtMs = Date.parse(record.finishedAt);
        return Number.isFinite(finishedAtMs) && now - finishedAtMs <= ttlMs;
      })
      .slice(-maxRecords);
    this.recordsByProject.set(projectId, records);
    return records;
  }

  append(record: FddBindingProposerAuditRecord): void {
    const maxRecords = Math.max(1, Math.min(this.options.maxRecordsPerProject ?? 100, 1_000));
    const records = this.prune(record.projectId);
    this.recordsByProject.set(record.projectId, [
      ...records.filter((entry) => entry.runKey !== record.runKey),
      structuredClone(record)
    ].slice(-maxRecords));
  }

  list(projectId: string): FddBindingProposerAuditRecord[] {
    return this.prune(projectId).map((record) => structuredClone(record));
  }
}

export interface FddBindingProposerAuditStorage {
  fddBindingProposalAuditsByProject?: Record<string, FddBindingProposerAuditRecord[]>;
}

/** Additive, project-scoped, bounded persistence adapter for SeedStore. */
export class ProjectFddBindingProposerAuditStore implements FddBindingProposerAuditSink {
  constructor(
    private readonly storage: FddBindingProposerAuditStorage,
    private readonly persistSoon: () => void,
    private readonly options: {
      maxRecordsPerProject?: number;
      ttlMs?: number;
      nowMs?: () => number;
      projectExists?: (projectId: string) => boolean;
    } = {}
  ) {}

  append(record: FddBindingProposerAuditRecord): void {
    // A project can be deleted while its detached shadow run is in flight.
    // Never resurrect a deleted project's audit collection.
    if (this.options.projectExists && !this.options.projectExists(record.projectId)) return;
    const now = (this.options.nowMs ?? Date.now)();
    const ttlMs = Math.max(1, this.options.ttlMs ?? 7 * 24 * 60 * 60_000);
    const maxRecords = Math.max(1, Math.min(this.options.maxRecordsPerProject ?? 100, 1_000));
    const records = (this.storage.fddBindingProposalAuditsByProject?.[record.projectId] ?? [])
      .filter((entry) => {
        const finishedAtMs = Date.parse(entry.finishedAt);
        return Number.isFinite(finishedAtMs) && now - finishedAtMs <= ttlMs;
      });
    const next = [
      ...records.filter((entry) => entry.runKey !== record.runKey),
      structuredClone(record)
    ].slice(-maxRecords);
    this.storage.fddBindingProposalAuditsByProject = {
      ...(this.storage.fddBindingProposalAuditsByProject ?? {}),
      [record.projectId]: next
    };
    this.persistSoon();
  }
}

export class FddBindingProposerShadowService {
  private readonly config: FddBindingProposerConfig;
  private readonly completionPort: FddBindingProposerCompletionPort;
  private readonly auditSink: FddBindingProposerAuditSink | undefined;
  private readonly timeoutMs: number;
  private readonly maxTokens: number;
  private readonly now: () => string;
  private readonly nowMs: () => number;
  private readonly auditTimeoutMs: number;
  private readonly successTtlMs: number;
  private readonly failureBackoffMs: number;
  private readonly maxCachedRuns: number;
  private readonly skillVersion: string;
  private readonly toolVersion: string;
  private readonly skillPromptHash: string;
  private readonly toolContractHash: string;
  private readonly runs = new Map<string, FddBindingProposerCachedRun>();
  private queue: Promise<void> = Promise.resolve();

  constructor(options: FddBindingProposerShadowServiceOptions) {
    this.config = {
      mode: options.config.mode,
      projectIds: [...new Set(options.config.projectIds.map((projectId) => projectId.trim()).filter(Boolean))].sort(compareText),
      algorithmIds: [...new Set(options.config.algorithmIds.map((algorithmId) => algorithmId.trim()).filter(Boolean))].sort(compareText)
    };
    this.completionPort = options.completionPort;
    this.auditSink = options.auditSink;
    this.timeoutMs = Math.max(1, Math.min(options.timeoutMs ?? 5_000, 30_000));
    this.maxTokens = Math.max(64, Math.min(options.maxTokens ?? 600, 1_024));
    this.now = options.now ?? (() => new Date().toISOString());
    this.nowMs = options.nowMs ?? Date.now;
    this.auditTimeoutMs = Math.max(1, Math.min(options.auditTimeoutMs ?? 100, 1_000));
    this.successTtlMs = Math.max(1_000, Math.min(options.successTtlMs ?? 15 * 60_000, 24 * 60 * 60_000));
    this.failureBackoffMs = Math.max(100, Math.min(options.failureBackoffMs ?? 30_000, 5 * 60_000));
    this.maxCachedRuns = Math.max(1, Math.min(options.maxCachedRuns ?? 256, 2_048));
    this.skillVersion = options.skillVersion ?? FDD_BINDING_PROPOSER_SKILL_VERSION;
    this.toolVersion = options.toolVersion ?? FDD_BINDING_PROPOSER_TOOL_VERSION;
    this.skillPromptHash = contentHash(canonicalJson([
      FDD_BINDING_PROPOSER_SYSTEM_PROMPT,
      fddBindingProposerTaskMessage({
        projectId: "__project__",
        evidenceSnapshotHash: "__snapshot__",
        algorithmSignature: "__algorithm__",
        requiredRoles: ["__role__"]
      })
    ]));
    this.toolContractHash = contentHash(canonicalJson(fddBindingProposerToolDefinitions()));
  }

  schedule(request: FddBindingProposerShadowRequest): FddBindingProposerScheduleResult {
    if (this.config.mode !== "shadow") return { status: "off" };
    if (!this.config.projectIds.includes(request.projectId)) return { status: "project_not_allowed" };
    const algorithmId = typeof request.plannerInput?.algorithm?.id === "string"
      ? request.plannerInput.algorithm.id.trim()
      : "";
    if (!this.config.algorithmIds.includes(algorithmId)) return { status: "algorithm_not_allowed" };
    const nowMs = this.nowMs();
    for (const [key, cached] of this.runs) {
      if (cached.settled && cached.expiresAtMs <= nowMs) this.runs.delete(key);
    }
    const preparation = prepareShadowRun(request);
    const scheduledRun: FddBindingProposerScheduledRun = {
      prepared: preparation.prepared,
      providerVersion: this.completionPort.providerVersion,
      modelVersion: this.completionPort.modelVersion,
      skillVersion: this.skillVersion,
      toolVersion: this.toolVersion,
      promptHash: preparation.promptHash,
      skillPromptHash: this.skillPromptHash,
      toolContractHash: this.toolContractHash,
      inputFingerprint: preparation.inputFingerprint
    };
    const runKey = shadowRunKey({
      projectId: scheduledRun.prepared.projectId,
      inputFingerprint: scheduledRun.inputFingerprint,
      skillPromptHash: scheduledRun.skillPromptHash,
      toolContractHash: scheduledRun.toolContractHash,
      providerVersion: scheduledRun.providerVersion,
      modelVersion: scheduledRun.modelVersion,
      skillVersion: scheduledRun.skillVersion,
      toolVersion: scheduledRun.toolVersion
    });
    const existing = this.runs.get(runKey);
    if (existing && (!existing.settled || existing.expiresAtMs > nowMs)) {
      this.runs.delete(runKey);
      this.runs.set(runKey, existing);
      return { status: "deduplicated", runKey, completion: existing.completion };
    }
    // Preparation is strictly bounded and runs beyond the authoritative API
    // response. Check the exact key before eviction so TTL/backoff dedupe can
    // never be bypassed by a full cache.
    if (this.runs.size >= this.maxCachedRuns) {
      const evictable = [...this.runs.entries()].find(([, entry]) => entry.settled);
      if (evictable) this.runs.delete(evictable[0]);
      else return { status: "capacity_limited" };
    }
    const completion = this.queue.then(() => this.execute(runKey, scheduledRun));
    this.queue = completion.then(() => undefined, () => undefined);
    const cached: FddBindingProposerCachedRun = {
      completion,
      expiresAtMs: nowMs + this.successTtlMs,
      settled: false
    };
    this.runs.set(runKey, cached);
    void completion.then((record) => {
      cached.settled = true;
      cached.expiresAtMs = this.nowMs() + (record.status === "failed" ? this.failureBackoffMs : this.successTtlMs);
    }, () => {
      cached.settled = true;
      cached.expiresAtMs = this.nowMs() + this.failureBackoffMs;
    });
    return { status: "scheduled", runKey, completion };
  }

  private async execute(
    runKey: string,
    scheduledRun: FddBindingProposerScheduledRun
  ): Promise<FddBindingProposerAuditRecord> {
    const { prepared } = scheduledRun;
    const deadlineMs = Date.now() + this.timeoutMs;
    const assertWithinDeadline = (): void => {
      if (Date.now() >= deadlineMs) throw new FddBindingProposerRunError("timeout");
    };
    const startedAt = this.now();
    const toolAudit: FddBindingProposerToolAudit[] = [];
    const evidenceSnapshotHash = prepared.status === "ready"
      ? prepared.snapshot.evidenceSnapshotHash
      : prepared.evidenceSnapshotHash;
    const algorithmSignatureHash = prepared.status === "ready"
      ? contentHash(prepared.snapshot.algorithmSignature)
      : prepared.algorithmSignatureHash;
    const refTableHash = prepared.status === "ready"
      ? prepared.snapshot.evidenceRefTableHash
      : contentHash("evidence_refs_unavailable");
    const refSummary = prepared.status === "ready"
      ? evidenceRefSummary(prepared.snapshot)
      : emptyEvidenceRefSummary();
    const fleetGuardPlanIdHash = prepared.status === "ready"
      ? prepared.plan.planIdHash
      : contentHash("plan_unavailable");
    const fleetGuardPolicyVersion = prepared.status === "ready"
      ? prepared.plan.policyVersion
      : "fleetguard-unavailable";
    const fleetGuardPlanSignature = prepared.status === "ready"
      ? prepared.plan.signature
      : contentHash("plan_unavailable");
    const auditBase = () => ({
      runKey,
      projectId: prepared.projectId,
      evidenceSnapshotHash,
      evidenceRefTableHash: refTableHash,
      evidenceRefSummary: { ...refSummary },
      algorithmSignatureHash,
      signatureHashes: prepared.signatureHashes,
      fleetGuardPlanIdHash,
      fleetGuardPolicyVersion,
      fleetGuardPlanSignature,
      promptHash: scheduledRun.promptHash,
      skillPromptHash: scheduledRun.skillPromptHash,
      toolContractHash: scheduledRun.toolContractHash,
      providerVersion: scheduledRun.providerVersion,
      modelVersion: scheduledRun.modelVersion,
      skillVersion: scheduledRun.skillVersion,
      toolVersion: scheduledRun.toolVersion,
      startedAt
    });
    let record: FddBindingProposerAuditRecord;
    try {
      assertWithinDeadline();
      if (prepared.status === "failed") throw new FddBindingProposerRunError(prepared.errorCode);
      assertWithinDeadline();
      const proposal = await runDedicatedBindingProposer({
        tools: new FddBindingProposerTools(prepared.snapshot),
        completionPort: this.completionPort,
        providerVersion: scheduledRun.providerVersion,
        modelVersion: scheduledRun.modelVersion,
        deadlineMs,
        maxTokens: this.maxTokens,
        toolAudit
      });
      record = {
        ...auditBase(),
        status: "succeeded",
        finishedAt: this.now(),
        toolCalls: toolAudit.map((entry) => ({ ...entry })),
        proposal,
        comparison: proposalComparison(proposal, prepared.plan)
      };
    } catch (error) {
      const errorCode = error instanceof FddBindingProposerToolError && error.code === "invalid_snapshot"
        ? "invalid_snapshot"
        : classifyProviderFailure(error);
      record = {
        ...auditBase(),
        status: "failed",
        finishedAt: this.now(),
        toolCalls: toolAudit.map((entry) => ({ ...entry })),
        errorCode
      };
    }
    // Persistence is bounded and detached so a slow store cannot hold the
    // single model queue or affect authoritative FDD work.
    void appendAuditSafely(this.auditSink, record, this.auditTimeoutMs);
    return record;
  }
}

/**
 * Narrow production adapter: the caller collects one frozen evidence snapshot,
 * this function plans from it once, then schedules an optional non-blocking
 * shadow proposal from that exact same value. It performs no BMS/Brick I/O.
 */
export function planFleetGuardWithBindingProposerShadow(input: {
  projectId: string;
  plannerInput: FleetGuardPlanInput;
  shadowService: FddBindingProposerShadowService;
}): { fleetGuardPlan: FleetGuardPlan; shadow: FddBindingProposerScheduleResult } {
  const fleetGuardPlan = planFleetGuard(input.plannerInput);
  const shadow = input.shadowService.schedule({
    projectId: input.projectId,
    evidenceProjectId: input.projectId,
    plannerInput: input.plannerInput
  });
  return { fleetGuardPlan, shadow };
}
