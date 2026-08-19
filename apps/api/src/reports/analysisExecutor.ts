import {
  ANALYSIS_PACKAGE_SCHEMA_VERSION,
  ANALYSIS_TOOL_INPUT_SCHEMA_VERSION,
  REPORT_PLAN_SCHEMA_VERSION,
  type AnalysisPackage,
  type AnalysisProvenance,
  type AnalysisResult,
  type AnalysisSegment,
  type AnalysisToolDraft,
  type AnalysisToolInput,
  type AnalysisToolScope,
  type ChartResult,
  type DashboardResult,
  type DataQualityIssue,
  type EquipmentIdentity,
  type EvidenceExecutionRecord,
  type EvidencePackage,
  type EvidenceReference,
  type FaultEvent,
  type MetricResult,
  type PlannedAnalysisRequest,
  type ReportPlan,
  type ReportScope,
  type ReportValidationIssue,
  type ReportValidationResult,
  deriveDeterministicEquipmentFullName,
  formatEquipmentDisplayName,
  isEquipmentIdentifierOnlyName,
  isValidIanaTimeZone,
  isRfc3339Instant
} from "./contracts.js";
import {
  analysisDefinitionRegistryRevision,
  findAnalysisDefinition,
  validateAnalysisDefinitionRegistry,
  type AnalysisDefinition,
  type AnalysisDefinitionRegistry
} from "./analysisDefinitions.js";
import {
  canonicalReportHash,
  validateEvidencePackageForPlan
} from "./evidenceExecutor.js";
import {
  REPORT_ANALYSIS_MAX_OUTPUT_TOKENS,
  REPORT_ANALYSIS_PROMPT_VERSION,
  REPORT_ANALYSIS_QUALITATIVE_STATEMENTS,
  REPORT_ANALYSIS_SYSTEM_PROMPT
} from "./analysisPrompt.js";
import {
  ReportAnalysisModelError,
  type ReportAnalysisModel
} from "./analysisTools.js";

export interface ExecuteReportAnalysisInput {
  plan: Readonly<ReportPlan>;
  evidencePackage: Readonly<EvidencePackage>;
  packageId: string;
  generatedAt: string;
}

export interface ExecuteReportAnalysisDependencies {
  definitions: AnalysisDefinitionRegistry;
  model: ReportAnalysisModel;
  maxConcurrency?: number;
  requestTimeoutMs?: number;
}

interface AnalysisProjection {
  input: AnalysisToolInput;
  evidenceByAlias: Map<string, string>;
  metricByAlias: Map<string, MetricResult>;
  equipmentByAlias: Map<string, EquipmentIdentity>;
  faultByAlias: Map<string, FaultEvent>;
  inputResultIds: string[];
  missingRequestIds: string[];
  selectedExecutions: EvidenceExecutionRecord[];
}

class InvalidAnalysisOutput extends Error {
  constructor() {
    super("Report analysis output is invalid.");
    this.name = "InvalidAnalysisOutput";
  }
}

class AnalysisRequestTimeout extends Error {
  constructor() {
    super("Report analysis provider timed out.");
    this.name = "AnalysisRequestTimeout";
  }
}

class AnalysisCapacityUnavailable extends Error {
  constructor() {
    super("Report analysis provider capacity is unavailable.");
    this.name = "AnalysisCapacityUnavailable";
  }
}

interface ModelCallLimiter {
  run<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T>;
}

const ANALYSIS_EXECUTOR_ID = "report-analysis-executor" as const;
const ANALYSIS_EXECUTOR_VERSION = "1" as const;
const ANALYSIS_MODEL_ADAPTER_ID = "report-analysis-model" as const;
const ANALYSIS_MODEL_ADAPTER_VERSION = "1" as const;
const SAFE_PACKAGE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SAFE_CONTROLLED_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const SAFE_UNIT = /^[A-Za-z0-9%°µμΔ/_.,:+*^·²³()-]{0,31}$/u;
const APPROVED_QUALITATIVE_STATEMENTS = new Set<string>(REPORT_ANALYSIS_QUALITATIVE_STATEMENTS);
const DIAGNOSIS_CERTAINTY_PATTERN = /\b(?:confirmed|proven|definite|certain|root\s+cause|caused\s+by|detected|fault\s+is|failure\s+is)\b|确认|证实|确定|根因|导致|检测到|故障是|失效是/iu;
const METRIC_AGGREGATIONS = new Set(["average", "minimum", "maximum", "sum", "count", "duration", "latest", "custom"]);
const FAULT_SEVERITIES = new Set(["low", "medium", "high", "critical"]);
const DATA_QUALITY_SEVERITIES = new Set(["info", "warning", "error"]);
const ANALYSIS_RESULT_STATUSES = new Set(["complete", "insufficient_evidence", "skipped", "error"]);
const ANALYSIS_KINDS = new Set([
  "executive_summary",
  "key_findings",
  "fault_summary",
  "fleet_performance",
  "equipment_performance",
  "fault_diagnosis",
  "recommendations"
]);
const VALID_NAME_SOURCES = new Set([
  "semantic_model",
  "project_metadata",
  "bms_metadata",
  "deterministic_fallback"
]);

function issue(path: string, code: string, message: string): ReportValidationIssue {
  return { path, code, message };
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function approvedQualitativeText(value: unknown, diagnosis = false): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  const statement = diagnosis && trimmed.startsWith("Possible hypothesis: ")
    ? trimmed.slice("Possible hypothesis: ".length)
    : trimmed;
  return (!diagnosis || trimmed.startsWith("Possible hypothesis: "))
    && APPROVED_QUALITATIVE_STATEMENTS.has(statement);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameReference(
  left: { definitionId: string; definitionVersion: string },
  right: { definitionId: string; definitionVersion: string }
): boolean {
  return left.definitionId === right.definitionId
    && left.definitionVersion === right.definitionVersion;
}

function sameScope(left: ReportScope, right: ReportScope): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "system" && right.kind === "system") return true;
  if (left.kind === "fleet" && right.kind === "fleet") {
    return left.equipmentType === right.equipmentType;
  }
  return left.kind === "equipment"
    && right.kind === "equipment"
    && left.equipmentId === right.equipmentId
    && left.equipmentType === right.equipmentType;
}

function canonicalEqual(left: unknown, right: unknown): boolean {
  return canonicalReportHash(left) === canonicalReportHash(right);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function stableUnique(values: string[]): string[] {
  return [...new Set(values)];
}

function sortedUnique(values: string[]): string[] {
  return stableUnique(values).sort(compareText);
}

function referenceIds(references: EvidenceReference[]): string[] {
  return sortedUnique(references.map((reference) => reference.evidenceId));
}

function analysisTarget(request: PlannedAnalysisRequest): Pick<PlannedAnalysisRequest, "analysisKind" | "scope"> {
  return {
    analysisKind: request.analysisKind,
    scope: structuredClone(request.scope)
  } as Pick<PlannedAnalysisRequest, "analysisKind" | "scope">;
}

function equipmentIdentityIssues(plan: Readonly<ReportPlan>): ReportValidationIssue[] {
  const issues: ReportValidationIssue[] = [];
  if (plan.projectId !== plan.spec.projectId) {
    issues.push(issue("plan.projectId", "project_mismatch", "Report plan project does not match its specification."));
  }
  const provenanceById = new Map(plan.assetProvenance.equipment.map((entry) => [entry.equipmentId, entry]));
  for (const [index, equipment] of plan.equipment.entries()) {
    const path = `plan.equipment[${index}]`;
    if (!VALID_NAME_SOURCES.has(equipment.nameSource)) {
      issues.push(issue(`${path}.nameSource`, "invalid_name_source", "Equipment names must come from an authoritative source or deterministic fallback."));
    }
    if (
      !nonEmpty(equipment.equipmentId)
      || !nonEmpty(equipment.shortIdentifier)
      || !nonEmpty(equipment.fullName)
      || !nonEmpty(equipment.equipmentType)
      || !nonEmpty(equipment.nameSourceRef)
      || equipment.displayName !== formatEquipmentDisplayName(equipment.shortIdentifier, equipment.fullName)
      || isEquipmentIdentifierOnlyName(equipment.fullName, equipment.shortIdentifier, equipment.equipmentId)
    ) {
      issues.push(issue(path, "invalid_equipment_identity", "Equipment identity is not a valid authoritative short/full-name pair."));
    }
    if (equipment.nameSource === "deterministic_fallback") {
      const expectedName = deriveDeterministicEquipmentFullName(
        equipment.shortIdentifier,
        equipment.equipmentType
      );
      const expectedRef = `fallback:${equipment.equipmentType}:${equipment.equipmentId}:short=${equipment.shortIdentifier}`;
      if (equipment.fullName !== expectedName || equipment.nameSourceRef !== expectedRef) {
        issues.push(issue(path, "invalid_fallback_name", "Fallback equipment identity is not derived from its authoritative identifiers."));
      }
    }
    const provenance = provenanceById.get(equipment.equipmentId);
    if (!provenance || !canonicalEqual(provenance.resolvedIdentity, equipment)) {
      issues.push(issue(path, "identity_provenance_mismatch", "Equipment identity does not match asset provenance."));
    } else if (equipment.nameSource !== "deterministic_fallback") {
      const source = provenance.sources.find((candidate) => (
        candidate.sourceKind === equipment.nameSource
        && candidate.sourceRef === equipment.nameSourceRef
      ));
      if (
        !source
        || (source.fullName !== undefined && source.fullName !== equipment.fullName)
        || (source.shortIdentifier !== undefined && source.shortIdentifier !== equipment.shortIdentifier)
      ) {
        issues.push(issue(path, "name_source_not_found", "Equipment name does not match its retained authoritative source record."));
      }
    }
  }
  if (new Set(plan.equipment.map((item) => item.equipmentId)).size !== plan.equipment.length) {
    issues.push(issue("plan.equipment", "duplicate_equipment", "Report plan equipment IDs must be unique."));
  }
  if (provenanceById.size !== plan.assetProvenance.equipment.length) {
    issues.push(issue("plan.assetProvenance.equipment", "duplicate_equipment", "Asset provenance equipment IDs must be unique."));
  }
  return issues;
}

function validateAnalysisPlan(
  plan: Readonly<ReportPlan>,
  definitions: AnalysisDefinitionRegistry
): ReportValidationIssue[] {
  const issues: ReportValidationIssue[] = [];
  if (plan.schemaVersion !== REPORT_PLAN_SCHEMA_VERSION) {
    issues.push(issue("plan.schemaVersion", "unsupported_schema", `Report plan schema ${REPORT_PLAN_SCHEMA_VERSION} is required.`));
  }
  if (
    !isRfc3339Instant(plan.period.startAt)
    || !isRfc3339Instant(plan.period.endAt)
    || Date.parse(plan.period.startAt) >= Date.parse(plan.period.endAt)
  ) {
    issues.push(issue("plan.period", "invalid_period", "Report analysis requires a valid half-open report period."));
  }
  if (
    !isValidIanaTimeZone(plan.period.timeZone)
    || !isValidIanaTimeZone(plan.spec.timeZone)
    || plan.period.timeZone !== plan.spec.timeZone
  ) {
    issues.push(issue("plan.period.timeZone", "invalid_timezone", "Report period timezone must be the specification's valid IANA timezone."));
  }
  issues.push(...validateAnalysisDefinitionRegistry(definitions));
  const expectedRevision = analysisDefinitionRegistryRevision(definitions);
  if (plan.analysis.definitionsRevision !== expectedRevision) {
    issues.push(issue("plan.analysis.definitionsRevision", "definition_revision_mismatch", "Analysis definition revision does not match the active registry."));
  }

  const evidenceRequestIds = new Set([
    ...plan.evidence.metrics,
    ...plan.evidence.charts,
    ...plan.evidence.dashboards,
    ...plan.evidence.faults
  ].map((request) => request.requestId));
  const evidenceScopeById = new Map<string, ReportScope | null>([
    ...plan.evidence.metrics.map((request) => [request.requestId, request.scope] as const),
    ...plan.evidence.charts.map((request) => [request.requestId, request.scope] as const),
    ...plan.evidence.dashboards.map((request) => [request.requestId, null] as const),
    ...plan.evidence.faults.map((request) => [request.requestId, {
      kind: "equipment" as const,
      equipmentId: request.equipmentId,
      equipmentType: request.equipmentType
    }] as const)
  ]);
  const faultRequestIds = new Set(plan.evidence.faults.map((request) => request.requestId));
  const requestIds = new Set<string>();
  for (const [index, request] of plan.analysis.requests.entries()) {
    const path = `plan.analysis.requests[${index}]`;
    if (!nonEmpty(request.requestId)) {
      issues.push(issue(`${path}.requestId`, "required", "Analysis request ID is required."));
    } else if (requestIds.has(request.requestId)) {
      issues.push(issue(`${path}.requestId`, "duplicate_request", "Analysis request ID is duplicated."));
    } else {
      requestIds.add(request.requestId);
    }
    const definition = findAnalysisDefinition(definitions, request.analysisKind, request.scope.kind);
    if (!definition || !sameReference(definition, request.definition)) {
      issues.push(issue(`${path}.definition`, "definition_mismatch", "Analysis request does not use its pinned kind/scope definition."));
    }
    if (
      !SAFE_CONTROLLED_ID.test(request.definition.definitionId)
      || !SAFE_CONTROLLED_ID.test(request.definition.definitionVersion)
    ) {
      issues.push(issue(`${path}.definition`, "unsafe_prompt_token", "Analysis definition identifiers are not safe controlled tokens."));
    }
    if (request.evidenceRequestIds.length === 0) {
      issues.push(issue(`${path}.evidenceRequestIds`, "required", "Analysis requires deterministic evidence requests."));
    }
    if (new Set(request.evidenceRequestIds).size !== request.evidenceRequestIds.length) {
      issues.push(issue(`${path}.evidenceRequestIds`, "duplicate_reference", "Analysis evidence request IDs must be unique."));
    }
    for (const [evidenceIndex, requestId] of request.evidenceRequestIds.entries()) {
      if (!evidenceRequestIds.has(requestId)) {
        issues.push(issue(`${path}.evidenceRequestIds[${evidenceIndex}]`, "unknown_evidence_request", "Analysis references an evidence request that is absent from the plan."));
        continue;
      }
      const evidenceScope = evidenceScopeById.get(requestId);
      if (
        (evidenceScope === null && request.scope.kind !== "system")
        || (evidenceScope !== null && evidenceScope !== undefined && !scopeAllows(request, evidenceScope))
      ) {
        issues.push(issue(`${path}.evidenceRequestIds[${evidenceIndex}]`, "evidence_scope_mismatch", "Analysis references evidence outside its planned scope."));
      }
    }
    if (request.analysisKind === "fault_diagnosis" && request.condition !== "when_fault_detected") {
      issues.push(issue(`${path}.condition`, "invalid_condition", "Fault diagnosis must be gated by detected faults."));
    }
    if (
      request.analysisKind === "fault_diagnosis"
      && (
        request.evidenceRequestIds.length === 0
        || request.evidenceRequestIds.some((requestId) => !faultRequestIds.has(requestId))
      )
    ) {
      issues.push(issue(`${path}.evidenceRequestIds`, "invalid_fault_evidence", "Fault diagnosis may depend only on in-scope deterministic fault requests."));
    }
    if (!["always", "when_fault_detected", "when_evidence_available"].includes(request.condition)) {
      issues.push(issue(`${path}.condition`, "invalid_condition", "Analysis condition is invalid."));
    }
    const expectedCondition = request.analysisKind === "fault_diagnosis"
      ? "when_fault_detected"
      : request.analysisKind === "recommendations" && request.scope.kind === "equipment"
        ? "when_evidence_available"
        : "always";
    if (request.condition !== expectedCondition) {
      issues.push(issue(`${path}.condition`, "condition_mismatch", "Analysis condition does not match its kind and scope."));
    }
    const requestScope = request.scope;
    if (requestScope.kind === "equipment" && !plan.equipment.some((equipment) => (
      equipment.equipmentId === requestScope.equipmentId
      && equipment.equipmentType === requestScope.equipmentType
    ))) {
      issues.push(issue(`${path}.scope`, "equipment_not_found", "Analysis equipment scope is absent from the plan."));
    }
    if (requestScope.kind === "fleet" && !plan.equipment.some((equipment) => (
      equipment.equipmentType === requestScope.equipmentType
    ))) {
      issues.push(issue(`${path}.scope`, "equipment_type_not_found", "Analysis fleet scope is absent from the plan."));
    }
  }
  issues.push(...equipmentIdentityIssues(plan));
  return issues;
}

function promptVisibleEvidenceIssues(evidencePackage: Readonly<EvidencePackage>): ReportValidationIssue[] {
  const issues: ReportValidationIssue[] = [];
  const checkToken = (value: unknown, path: string): void => {
    if (typeof value !== "string" || !SAFE_CONTROLLED_ID.test(value)) {
      issues.push(issue(path, "unsafe_prompt_token", "Model-visible evidence identifiers must be safe controlled tokens."));
    }
  };
  for (const [index, equipment] of evidencePackage.equipment.entries()) {
    checkToken(equipment.equipmentType, `evidencePackage.equipment[${index}].equipmentType`);
  }
  for (const [index, result] of evidencePackage.metricResults.entries()) {
    const path = `evidencePackage.metricResults[${index}]`;
    checkToken(result.metricKey, `evidencePackage.metricResults[${index}].metricKey`);
    if (typeof result.unit !== "string" || !SAFE_UNIT.test(result.unit)) {
      issues.push(issue(`evidencePackage.metricResults[${index}].unit`, "unsafe_prompt_token", "Metric unit is not a safe controlled token."));
    }
    if (result.status !== "available" && result.status !== "no_data" && result.status !== "error") {
      issues.push(issue(`${path}.status`, "invalid_metric", "Metric result status is invalid."));
    } else if (result.status === "available" && (
      !Number.isFinite(result.value)
      || !METRIC_AGGREGATIONS.has(result.aggregation)
      || !Number.isInteger(result.sampleCount)
      || result.sampleCount < 0
      || !Number.isFinite(result.coverage)
      || result.coverage < 0
      || result.coverage > 1
    )) {
      issues.push(issue(path, "invalid_metric", "Available metric facts must contain finite values and valid aggregation, sample count, and coverage."));
    }
  }
  for (const [index, result] of evidencePackage.chartResults.entries()) {
    checkToken(result.chartKey, `evidencePackage.chartResults[${index}].chartKey`);
  }
  for (const [index, event] of evidencePackage.faultEvents.entries()) {
    const path = `evidencePackage.faultEvents[${index}]`;
    checkToken(event.faultCode, `${path}.faultCode`);
    if (!FAULT_SEVERITIES.has(event.severity)) {
      issues.push(issue(`${path}.severity`, "invalid_fault_event", "Fault severity is invalid."));
    }
    const terminalAt = event.status === "active"
      ? event.observedThrough
      : event.status === "resolved"
        ? event.endedAt
        : null;
    if (terminalAt === null) {
      issues.push(issue(`${path}.status`, "invalid_fault_event", "Fault status is invalid."));
      continue;
    }
    if (!isRfc3339Instant(event.startedAt) || !isRfc3339Instant(terminalAt)) {
      issues.push(issue(path, "invalid_fault_event", "Fault timestamps must be RFC3339 instants."));
      continue;
    }
    const startedAt = Date.parse(event.startedAt);
    const endedAt = Date.parse(terminalAt);
    const periodStart = Date.parse(evidencePackage.period.startAt);
    const periodEnd = Date.parse(evidencePackage.period.endAt);
    const expectedDuration = (Math.min(endedAt, periodEnd) - Math.max(startedAt, periodStart)) / 3_600_000;
    if (
      startedAt >= endedAt
      || startedAt >= periodEnd
      || endedAt <= periodStart
      || endedAt > periodEnd
      || !Number.isFinite(event.durationHours)
      || event.durationHours < 0
      || Math.abs(event.durationHours - expectedDuration) > 1e-9
    ) {
      issues.push(issue(path, "invalid_fault_event", "Fault interval and deterministic duration are invalid for the report period."));
    }
  }
  for (const [index, quality] of evidencePackage.dataQuality.entries()) {
    checkToken(quality.code, `evidencePackage.dataQuality[${index}].code`);
    if (!DATA_QUALITY_SEVERITIES.has(quality.severity)) {
      issues.push(issue(`evidencePackage.dataQuality[${index}].severity`, "invalid_data_quality", "Data-quality severity is invalid."));
    }
  }
  for (const [index, execution] of evidencePackage.executions.entries()) {
    if (execution.status !== "complete" && execution.status !== "no_data" && execution.status !== "error") {
      issues.push(issue(`evidencePackage.executions[${index}].status`, "invalid_execution", "Evidence execution status is invalid."));
      continue;
    }
    if (execution.status === "no_data") {
      checkToken(execution.reasonCode, `evidencePackage.executions[${index}].reasonCode`);
    }
    if (execution.status === "error") {
      checkToken(execution.errorCode, `evidencePackage.executions[${index}].errorCode`);
    }
  }
  return issues;
}

function validateExecutionInput(
  input: ExecuteReportAnalysisInput,
  dependencies: ExecuteReportAnalysisDependencies
): ReportValidationIssue[] {
  const issues: ReportValidationIssue[] = [];
  if (!SAFE_PACKAGE_ID.test(input.packageId)) {
    issues.push(issue("packageId", "invalid_id", "Analysis package ID must be a safe opaque identifier."));
  }
  if (!isRfc3339Instant(input.generatedAt)) {
    issues.push(issue("generatedAt", "invalid_datetime", "Analysis generatedAt must be an RFC3339 instant."));
  }
  if (
    dependencies.maxConcurrency !== undefined
    && (!Number.isInteger(dependencies.maxConcurrency) || dependencies.maxConcurrency < 1 || dependencies.maxConcurrency > 32)
  ) {
    issues.push(issue("maxConcurrency", "invalid_value", "Analysis concurrency must be an integer between one and thirty-two."));
  }
  if (
    dependencies.requestTimeoutMs !== undefined
    && (!Number.isInteger(dependencies.requestTimeoutMs) || dependencies.requestTimeoutMs < 1 || dependencies.requestTimeoutMs > 300_000)
  ) {
    issues.push(issue("requestTimeoutMs", "invalid_value", "Analysis timeout must be between one millisecond and five minutes."));
  }
  if (!nonEmpty(dependencies.model?.metadata?.id) || !nonEmpty(dependencies.model?.metadata?.model)) {
    issues.push(issue("model.metadata", "invalid_model", "Analysis model metadata is required."));
  }
  issues.push(...validateAnalysisPlan(input.plan, dependencies.definitions));
  const evidenceValidation = validateEvidencePackageForPlan(input.plan, input.evidencePackage);
  if (!evidenceValidation.ok) issues.push(...evidenceValidation.issues);
  issues.push(...promptVisibleEvidenceIssues(input.evidencePackage));
  return issues;
}

function scopeAllows(request: PlannedAnalysisRequest, scope: ReportScope): boolean {
  if (request.scope.kind === "system") return true;
  if (request.scope.kind === "fleet") {
    return (scope.kind === "fleet" || scope.kind === "equipment")
      && scope.equipmentType === request.scope.equipmentType;
  }
  return scope.kind === "equipment"
    && scope.equipmentId === request.scope.equipmentId
    && scope.equipmentType === request.scope.equipmentType;
}

function selectedEquipment(
  request: PlannedAnalysisRequest,
  equipment: EquipmentIdentity[]
): EquipmentIdentity[] {
  const scope = request.scope;
  if (scope.kind === "system") return equipment;
  if (scope.kind === "fleet") {
    return equipment.filter((item) => item.equipmentType === scope.equipmentType);
  }
  return equipment.filter((item) => item.equipmentId === scope.equipmentId);
}

function toToolScope(
  scope: ReportScope,
  equipmentAliasById: Map<string, string>
): AnalysisToolScope {
  if (scope.kind === "system") return { kind: "system" };
  if (scope.kind === "fleet") return { kind: "fleet", equipmentType: scope.equipmentType };
  const equipmentAlias = equipmentAliasById.get(scope.equipmentId);
  if (!equipmentAlias) throw new InvalidAnalysisOutput();
  return { kind: "equipment", equipmentAlias, equipmentType: scope.equipmentType };
}

function projectRequest(
  request: PlannedAnalysisRequest,
  requestIndex: number,
  plan: ReportPlan,
  evidencePackage: EvidencePackage
): AnalysisProjection {
  const executionById = new Map(evidencePackage.executions.map((execution) => [execution.requestId, execution]));
  const selectedExecutions = request.evidenceRequestIds.map((requestId) => {
    const execution = executionById.get(requestId);
    if (!execution) throw new InvalidAnalysisOutput();
    return execution;
  });
  const selectedRequestIds = new Set(request.evidenceRequestIds);
  const inputResultIds = stableUnique(selectedExecutions.flatMap((execution) => execution.resultIds));
  const selectedResultIds = new Set(inputResultIds);

  const equipmentByAlias = new Map<string, EquipmentIdentity>();
  const equipmentAliasById = new Map<string, string>();
  for (const [index, equipment] of selectedEquipment(request, plan.equipment).entries()) {
    const alias = `EQ${index + 1}`;
    equipmentByAlias.set(alias, equipment);
    equipmentAliasById.set(equipment.equipmentId, alias);
  }

  const evidenceByAlias = new Map<string, string>();
  const evidenceAliasById = new Map<string, string>();
  for (const execution of selectedExecutions) {
    for (const reference of execution.evidence) {
      if (!evidenceAliasById.has(reference.evidenceId)) {
        const alias = `E${evidenceAliasById.size + 1}`;
        evidenceAliasById.set(reference.evidenceId, alias);
        evidenceByAlias.set(alias, reference.evidenceId);
      }
    }
  }
  const aliasesFor = (references: EvidenceReference[]): string[] => sortedUnique(
    references.map((reference) => evidenceAliasById.get(reference.evidenceId)).filter((alias): alias is string => Boolean(alias))
  );

  const metricById = new Map(evidencePackage.metricResults.map((result) => [result.resultId, result]));
  const chartById = new Map(evidencePackage.chartResults.map((result) => [result.resultId, result]));
  const dashboardById = new Map(evidencePackage.dashboardResults.map((result) => [result.resultId, result]));
  const faultById = new Map(evidencePackage.faultEvents.map((event) => [event.eventId, event]));
  const metricByAlias = new Map<string, MetricResult>();
  const faultByAlias = new Map<string, FaultEvent>();
  const metrics: AnalysisToolInput["metrics"] = [];
  const charts: AnalysisToolInput["charts"] = [];
  const dashboards: AnalysisToolInput["dashboards"] = [];
  const faults: AnalysisToolInput["faults"] = [];

  for (const resultId of inputResultIds) {
    const metric = metricById.get(resultId);
    if (metric) {
      if (!scopeAllows(request, metric.scope)) throw new InvalidAnalysisOutput();
      if (metric.status === "available") {
        const alias = `M${metrics.length + 1}`;
        metricByAlias.set(alias, metric);
        metrics.push({
          metricAlias: alias,
          metricKey: metric.metricKey,
          scope: toToolScope(metric.scope, equipmentAliasById),
          unit: metric.unit,
          aggregation: metric.aggregation,
          value: metric.value,
          sampleCount: metric.sampleCount,
          coverage: metric.coverage,
          evidenceAliases: aliasesFor(metric.evidence)
        });
      }
      continue;
    }
    const chart = chartById.get(resultId);
    if (chart) {
      if (!scopeAllows(request, chart.scope)) throw new InvalidAnalysisOutput();
      // Artifact readiness is retained in EvidencePackage, but images contain no typed
      // observations that a text-only B-Agent may safely interpret.
      continue;
    }
    const dashboard = dashboardById.get(resultId);
    if (dashboard) {
      if (request.scope.kind !== "system") throw new InvalidAnalysisOutput();
      // Dashboard pixels are rendering evidence, not narrative facts.
      continue;
    }
    const fault = faultById.get(resultId);
    if (fault) {
      const realScope: ReportScope = {
        kind: "equipment",
        equipmentId: fault.equipment.equipmentId,
        equipmentType: fault.equipment.equipmentType
      };
      if (!scopeAllows(request, realScope)) throw new InvalidAnalysisOutput();
      const equipmentAlias = equipmentAliasById.get(fault.equipment.equipmentId);
      if (!equipmentAlias) throw new InvalidAnalysisOutput();
      const alias = `F${faults.length + 1}`;
      faultByAlias.set(alias, fault);
      const base = {
        faultAlias: alias,
        equipmentAlias,
        faultCode: fault.faultCode,
        severity: fault.severity,
        startedAt: fault.startedAt,
        durationHours: fault.durationHours,
        evidenceAliases: aliasesFor(fault.evidence)
      };
      faults.push(fault.status === "active"
        ? { ...base, status: "active", observedThrough: fault.observedThrough }
        : { ...base, status: "resolved", endedAt: fault.endedAt });
    }
  }

  const dataQuality: AnalysisToolInput["dataQuality"] = [];
  const addQuality = (
    severity: DataQualityIssue["severity"],
    code: string,
    references: EvidenceReference[]
  ): void => {
    dataQuality.push({
      qualityAlias: `Q${dataQuality.length + 1}`,
      severity,
      code,
      evidenceAliases: aliasesFor(references)
    });
  };
  for (const quality of evidencePackage.dataQuality) {
    if (quality.requestId && selectedRequestIds.has(quality.requestId)) {
      addQuality(quality.severity, quality.code, quality.evidence);
    }
  }
  for (const execution of selectedExecutions) {
    if (execution.status === "no_data") addQuality("warning", execution.reasonCode, execution.evidence);
    if (execution.status === "error") addQuality("error", execution.errorCode, execution.evidence);
    if (execution.requestKind === "fault" && execution.status === "complete" && execution.resultIds.length === 0) {
      addQuality("info", "fault_scan_complete_no_events", execution.evidence);
    }
  }

  const missingRequestIds = selectedExecutions
    .filter((execution) => execution.status !== "complete")
    .map((execution) => execution.requestId);
  const toolScope = request.scope.kind === "equipment"
    ? {
        kind: "equipment" as const,
        equipmentAlias: equipmentAliasById.get(request.scope.equipmentId)!,
        equipmentType: request.scope.equipmentType
      }
    : request.scope.kind === "fleet"
      ? { kind: "fleet" as const, equipmentType: request.scope.equipmentType }
      : { kind: "system" as const };
  const input: AnalysisToolInput = {
    schemaVersion: ANALYSIS_TOOL_INPUT_SCHEMA_VERSION,
    requestAlias: `REQ${requestIndex + 1}`,
    analysisKind: request.analysisKind,
    scope: toolScope,
    definition: { ...request.definition },
    period: structuredClone(plan.period),
    allowedCitationAliases: sortedUnique([
      ...metrics.flatMap((fact) => fact.evidenceAliases),
      ...faults.flatMap((fact) => fact.evidenceAliases),
      ...dataQuality.flatMap((fact) => fact.evidenceAliases)
    ]),
    equipment: [...equipmentByAlias.entries()].map(([equipmentAlias, equipment]) => ({
      equipmentAlias,
      equipmentType: equipment.equipmentType
    })),
    metrics,
    charts,
    dashboards,
    faults,
    dataQuality
  };
  return {
    input,
    evidenceByAlias,
    metricByAlias,
    equipmentByAlias,
    faultByAlias,
    inputResultIds,
    missingRequestIds,
    selectedExecutions
  };
}

function hasUsableEvidence(projection: AnalysisProjection): boolean {
  return projection.input.metrics.length > 0
    || projection.input.faults.length > 0;
}

function analysisId(
  plan: ReportPlan,
  evidencePackage: EvidencePackage,
  request: PlannedAnalysisRequest
): string {
  return `analysis_${canonicalReportHash({
    planId: plan.planId,
    evidencePackageRevision: evidencePackage.revisionHash,
    requestId: request.requestId,
    definition: request.definition
  }).slice(7, 31)}`;
}

function provenance(
  request: PlannedAnalysisRequest,
  evidencePackage: EvidencePackage,
  projection: AnalysisProjection,
  model: AnalysisProvenance["model"]
): AnalysisProvenance {
  return {
    producerKind: "b_agent",
    producerId: ANALYSIS_EXECUTOR_ID,
    producerVersion: ANALYSIS_EXECUTOR_VERSION,
    definition: { ...request.definition },
    evidencePackageRevision: evidencePackage.revisionHash,
    inputEvidenceRequestIds: [...request.evidenceRequestIds],
    inputResultIds: [...projection.inputResultIds],
    model
  };
}

function baseResult(
  request: PlannedAnalysisRequest,
  plan: ReportPlan,
  evidencePackage: EvidencePackage,
  projection: AnalysisProjection,
  generatedAt: string,
  model: AnalysisProvenance["model"]
) {
  return {
    analysisId: analysisId(plan, evidencePackage, request),
    requestId: request.requestId,
    evidencePackageId: evidencePackage.packageId,
    generatedAt,
    provenance: provenance(request, evidencePackage, projection, model),
    ...analysisTarget(request)
  };
}

function deterministicInsufficient(
  request: PlannedAnalysisRequest,
  plan: ReportPlan,
  evidencePackage: EvidencePackage,
  projection: AnalysisProjection,
  generatedAt: string,
  message = "The planned deterministic evidence is insufficient for this analysis."
): AnalysisResult {
  return {
    ...baseResult(request, plan, evidencePackage, projection, generatedAt, null),
    status: "insufficient_evidence",
    message,
    missingEvidence: [...projection.missingRequestIds]
  } as AnalysisResult;
}

function deterministicSkipped(
  request: PlannedAnalysisRequest,
  plan: ReportPlan,
  evidencePackage: EvidencePackage,
  projection: AnalysisProjection,
  generatedAt: string,
  reasonCode: string,
  message: string
): AnalysisResult {
  return {
    ...baseResult(request, plan, evidencePackage, projection, generatedAt, null),
    status: "skipped",
    reasonCode,
    message
  } as AnalysisResult;
}

function preflightOutcome(
  request: PlannedAnalysisRequest,
  plan: ReportPlan,
  evidencePackage: EvidencePackage,
  projection: AnalysisProjection,
  generatedAt: string
): AnalysisResult | null {
  if (request.condition === "when_fault_detected" && projection.input.faults.length === 0) {
    const faultExecutions = projection.selectedExecutions.filter((execution) => execution.requestKind === "fault");
    if (faultExecutions.length > 0 && faultExecutions.every((execution) => execution.status === "complete")) {
      return deterministicSkipped(
        request,
        plan,
        evidencePackage,
        projection,
        generatedAt,
        "condition_not_met",
        "No detected fault event requires diagnosis."
      );
    }
    return deterministicInsufficient(
      request,
      plan,
      evidencePackage,
      projection,
      generatedAt,
      "Fault detection evidence is unavailable, so diagnosis was not attempted."
    );
  }
  if (request.condition === "when_evidence_available" && !hasUsableEvidence(projection)) {
    return deterministicSkipped(
      request,
      plan,
      evidencePackage,
      projection,
      generatedAt,
      "condition_not_met",
      "No usable typed evidence is available for this conditional analysis."
    );
  }
  if (request.condition === "always" && !hasUsableEvidence(projection)) {
    return deterministicInsufficient(request, plan, evidencePackage, projection, generatedAt);
  }
  return null;
}

function resolveDraft(
  draft: AnalysisToolDraft,
  request: PlannedAnalysisRequest,
  projection: AnalysisProjection
): { segments: AnalysisSegment[]; evidenceIds: string[]; faultEventIds: string[] } {
  if (draft.requestAlias !== projection.input.requestAlias || draft.status !== "complete") {
    throw new InvalidAnalysisOutput();
  }
  const segments: AnalysisSegment[] = [];
  const allEvidenceIds: string[] = [];
  const faultEventIds: string[] = [];
  const allowedCitationAliases = new Set(projection.input.allowedCitationAliases);
  for (const segment of draft.segments) {
    if (segment.kind === "text") {
      if (
        !approvedQualitativeText(segment.text)
        || (
          (request.analysisKind === "fault_diagnosis" || request.analysisKind === "fault_summary")
          && DIAGNOSIS_CERTAINTY_PATTERN.test(segment.text)
        )
      ) {
        throw new InvalidAnalysisOutput();
      }
      const evidenceIds = sortedUnique(segment.citationAliases.map((alias) => {
        if (!allowedCitationAliases.has(alias)) throw new InvalidAnalysisOutput();
        const evidenceId = projection.evidenceByAlias.get(alias);
        if (!evidenceId) throw new InvalidAnalysisOutput();
        return evidenceId;
      }));
      if (evidenceIds.length === 0) throw new InvalidAnalysisOutput();
      segments.push({
        kind: "text",
        text: request.analysisKind === "fault_diagnosis"
          ? `Possible hypothesis: ${segment.text.trim()}`
          : segment.text.trim(),
        evidenceIds
      });
      allEvidenceIds.push(...evidenceIds);
      continue;
    }
    if (segment.kind === "metric_ref") {
      const metric = projection.metricByAlias.get(segment.metricAlias);
      if (!metric || metric.status !== "available") throw new InvalidAnalysisOutput();
      segments.push({ kind: "metric_ref", metricResultId: metric.resultId });
      allEvidenceIds.push(...referenceIds(metric.evidence));
      continue;
    }
    if (segment.kind === "equipment_ref") {
      const item = projection.equipmentByAlias.get(segment.equipmentAlias);
      if (!item) throw new InvalidAnalysisOutput();
      segments.push({ kind: "equipment_ref", equipmentId: item.equipmentId });
      continue;
    }
    const fault = projection.faultByAlias.get(segment.faultAlias);
    if (!fault) throw new InvalidAnalysisOutput();
    segments.push({ kind: "fault_ref", faultEventId: fault.eventId });
    faultEventIds.push(fault.eventId);
    allEvidenceIds.push(...referenceIds(fault.evidence));
  }
  if (segments.length === 0) throw new InvalidAnalysisOutput();
  if (!segments.some((segment) => segment.kind === "text") || allEvidenceIds.length === 0) {
    throw new InvalidAnalysisOutput();
  }
  if (request.analysisKind === "fault_diagnosis") {
    if (faultEventIds.length === 0 || !segments.some((segment) => segment.kind === "text")) {
      throw new InvalidAnalysisOutput();
    }
  }
  return {
    segments,
    evidenceIds: sortedUnique(allEvidenceIds),
    faultEventIds: stableUnique(faultEventIds)
  };
}

function createModelCallLimiter(maxConcurrency: number, requestTimeoutMs: number): ModelCallLimiter {
  let active = 0;
  const waiters: Array<{
    resolve: () => void;
    reject: (error: AnalysisCapacityUnavailable) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  const release = (): void => {
    active -= 1;
    const next = waiters.shift();
    if (!next) return;
    clearTimeout(next.timer);
    active += 1;
    next.resolve();
  };
  const acquire = async (): Promise<void> => {
    if (active < maxConcurrency) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new AnalysisCapacityUnavailable());
        }, requestTimeoutMs)
      };
      waiters.push(waiter);
    });
  };

  return {
    async run<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
      await acquire();
      const controller = new AbortController();
      type ProviderOutcome =
        | { kind: "value"; value: T }
        | { kind: "error"; error: unknown };
      const providerOutcome: Promise<ProviderOutcome> = Promise.resolve()
        .then(() => operation(controller.signal))
        .then(
          (value) => ({ kind: "value" as const, value }),
          (error: unknown) => ({ kind: "error" as const, error })
        );
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeoutOutcome = new Promise<{ kind: "timeout" }>((resolve) => {
        timer = setTimeout(() => resolve({ kind: "timeout" }), requestTimeoutMs);
      });
      const outcome = await Promise.race([providerOutcome, timeoutOutcome]);
      if (outcome.kind === "timeout") {
        controller.abort();
        // Do not release this permit until the underlying provider really settles.
        // Queued requests fail their acquisition deadline instead of exceeding the cap.
        void providerOutcome.then(() => release());
        throw new AnalysisRequestTimeout();
      }
      if (timer !== undefined) clearTimeout(timer);
      release();
      if (outcome.kind === "error") throw outcome.error;
      return outcome.value;
    }
  };
}

function runtimeAnalysisScope(value: unknown): boolean {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "system") return true;
  if (value.kind === "fleet") return nonEmpty(value.equipmentType);
  return value.kind === "equipment"
    && nonEmpty(value.equipmentId)
    && nonEmpty(value.equipmentType);
}

function runtimeAnalysisSegment(value: unknown): boolean {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "text") {
    return nonEmpty(value.text) && isStringArray(value.evidenceIds);
  }
  if (value.kind === "metric_ref") return nonEmpty(value.metricResultId);
  if (value.kind === "equipment_ref") return nonEmpty(value.equipmentId);
  if (value.kind === "fault_ref") return nonEmpty(value.faultEventId);
  return false;
}

function runtimeAnalysisProvenance(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.definition)) return false;
  if (
    value.producerKind !== "b_agent"
    || !nonEmpty(value.producerId)
    || !nonEmpty(value.producerVersion)
    || !nonEmpty(value.definition.definitionId)
    || !nonEmpty(value.definition.definitionVersion)
    || !nonEmpty(value.evidencePackageRevision)
    || !isStringArray(value.inputEvidenceRequestIds)
    || !isStringArray(value.inputResultIds)
  ) {
    return false;
  }
  if (value.model === null) return true;
  if (!isRecord(value.model)) return false;
  return nonEmpty(value.model.adapterId)
    && nonEmpty(value.model.adapterVersion)
    && nonEmpty(value.model.providerId)
    && nonEmpty(value.model.modelId)
    && nonEmpty(value.model.requestAlias)
    && nonEmpty(value.model.inputHash)
    && nonEmpty(value.model.promptVersion)
    && nonEmpty(value.model.promptHash)
    && (value.model.responseHash === null || nonEmpty(value.model.responseHash));
}

function runtimeAnalysisResult(value: unknown): value is AnalysisResult {
  if (
    !isRecord(value)
    || !ANALYSIS_RESULT_STATUSES.has(value.status as string)
    || !ANALYSIS_KINDS.has(value.analysisKind as string)
    || !nonEmpty(value.analysisId)
    || !nonEmpty(value.requestId)
    || !nonEmpty(value.evidencePackageId)
    || !isRfc3339Instant(value.generatedAt as string)
    || !runtimeAnalysisScope(value.scope)
    || !runtimeAnalysisProvenance(value.provenance)
  ) {
    return false;
  }
  if (value.status === "complete") {
    if (
      !Array.isArray(value.segments)
      || !value.segments.every(runtimeAnalysisSegment)
      || !isStringArray(value.evidenceIds)
    ) {
      return false;
    }
    if (value.analysisKind === "fault_diagnosis") {
      return value.diagnosisNature === "hypothesis" && isStringArray(value.faultEventIds);
    }
    return value.diagnosisNature === undefined && value.faultEventIds === undefined;
  }
  if (value.status === "insufficient_evidence") {
    return nonEmpty(value.message) && isStringArray(value.missingEvidence);
  }
  if (value.status === "skipped") {
    return nonEmpty(value.reasonCode) && nonEmpty(value.message);
  }
  return value.status === "error"
    && nonEmpty(value.errorCode)
    && nonEmpty(value.message)
    && typeof value.retryable === "boolean";
}

function analysisPackageRevision(analysisPackage: Omit<AnalysisPackage, "revisionHash">): string {
  return canonicalReportHash({
    ...analysisPackage,
    packageId: undefined,
    generatedAt: undefined,
    results: analysisPackage.results.map((result) => ({ ...result, generatedAt: undefined }))
  });
}

/** Pure downstream trust-boundary validation for a completed analysis package. */
export function validateAnalysisPackageForPlan(
  plan: Readonly<ReportPlan>,
  evidencePackage: Readonly<EvidencePackage>,
  analysisPackage: Readonly<AnalysisPackage>
): ReportValidationResult<AnalysisPackage> {
  const issues: ReportValidationIssue[] = [];
  const evidenceValidation = validateEvidencePackageForPlan(plan, evidencePackage);
  if (!evidenceValidation.ok) issues.push(...evidenceValidation.issues);
  if (analysisPackage.schemaVersion !== ANALYSIS_PACKAGE_SCHEMA_VERSION) {
    issues.push(issue("analysisPackage.schemaVersion", "unsupported_schema", `Analysis package schema ${ANALYSIS_PACKAGE_SCHEMA_VERSION} is required.`));
  }
  if (!SAFE_PACKAGE_ID.test(analysisPackage.packageId)) {
    issues.push(issue("analysisPackage.packageId", "invalid_id", "Analysis package ID is invalid."));
  }
  if (analysisPackage.planId !== plan.planId || analysisPackage.planRevision !== canonicalReportHash(plan)) {
    issues.push(issue("analysisPackage.planRevision", "plan_mismatch", "Analysis package does not match the report plan."));
  }
  if (
    analysisPackage.projectId !== plan.projectId
    || analysisPackage.assetRevision !== plan.assetRevision
    || !canonicalEqual(analysisPackage.period, plan.period)
  ) {
    issues.push(issue("analysisPackage", "report_context_mismatch", "Analysis package report context does not match the plan."));
  }
  if (
    analysisPackage.evidencePackageId !== evidencePackage.packageId
    || analysisPackage.evidencePackageRevision !== evidencePackage.revisionHash
  ) {
    issues.push(issue("analysisPackage.evidencePackageRevision", "evidence_mismatch", "Analysis package does not match its evidence package."));
  }
  if (analysisPackage.definitionsRevision !== plan.analysis.definitionsRevision) {
    issues.push(issue("analysisPackage.definitionsRevision", "definition_revision_mismatch", "Analysis definitions do not match the plan."));
  }
  if (!isRfc3339Instant(analysisPackage.generatedAt)) {
    issues.push(issue("analysisPackage.generatedAt", "invalid_datetime", "Analysis package generatedAt must be an RFC3339 instant."));
  }
  const runtimeResults: unknown[] = Array.isArray(analysisPackage.results)
    ? analysisPackage.results
    : [];
  if (!Array.isArray(analysisPackage.results)) {
    issues.push(issue("analysisPackage.results", "invalid_type", "Analysis package results must be an array."));
  }
  if (runtimeResults.length !== plan.analysis.requests.length) {
    issues.push(issue("analysisPackage.results", "result_cardinality_mismatch", "Every planned analysis request must have exactly one result."));
  }
  const actualOrder = runtimeResults.map((result) => isRecord(result) ? result.requestId : null);
  const expectedOrder = plan.analysis.requests.map((request) => request.requestId);
  if (!canonicalEqual(actualOrder, expectedOrder)) {
    issues.push(issue("analysisPackage.results", "result_order_mismatch", "Analysis results must follow stable plan order."));
  }
  const analysisIds = new Set<string>();
  const executionById = new Map(evidencePackage.executions.map((execution) => [execution.requestId, execution]));
  const metricById = new Map(evidencePackage.metricResults.map((result) => [result.resultId, result]));
  const faultById = new Map(evidencePackage.faultEvents.map((event) => [event.eventId, event]));

  for (const [index, request] of plan.analysis.requests.entries()) {
    const rawResult = runtimeResults[index];
    if (rawResult === undefined) continue;
    const path = `analysisPackage.results[${index}]`;
    if (!runtimeAnalysisResult(rawResult)) {
      issues.push(issue(path, "invalid_analysis_result", "Analysis result does not match a supported runtime result shape."));
      continue;
    }
    const result = rawResult;
    let projection: AnalysisProjection | null = null;
    try {
      projection = projectRequest(
        request,
        index,
        structuredClone(plan) as ReportPlan,
        structuredClone(evidencePackage) as EvidencePackage
      );
    } catch {
      issues.push(issue(path, "invalid_analysis_projection", "Analysis result inputs cannot be projected from the plan."));
    }
    const expectedPreflight = projection
      ? preflightOutcome(
          request,
          plan as ReportPlan,
          evidencePackage as EvidencePackage,
          projection,
          analysisPackage.generatedAt
        )
      : null;
    if (expectedPreflight && !canonicalEqual(result, expectedPreflight)) {
      issues.push(issue(path, "condition_outcome_mismatch", "Analysis result does not match its deterministic condition outcome."));
    }
    if (
      !expectedPreflight
      && (
        result.status === "skipped"
        || (result.status === "insufficient_evidence" && result.provenance.model === null)
      )
    ) {
      issues.push(issue(path, "condition_outcome_mismatch", "Analysis was skipped without a deterministic preflight condition."));
    }
    if (result.analysisId !== analysisId(plan as ReportPlan, evidencePackage as EvidencePackage, request)) {
      issues.push(issue(`${path}.analysisId`, "analysis_id_mismatch", "Analysis result ID is not deterministic for its request."));
    }
    if (analysisIds.has(result.analysisId)) {
      issues.push(issue(`${path}.analysisId`, "duplicate_analysis", "Analysis result ID is duplicated."));
    }
    analysisIds.add(result.analysisId);
    if (
      result.requestId !== request.requestId
      || result.analysisKind !== request.analysisKind
      || !sameScope(result.scope, request.scope)
      || result.evidencePackageId !== evidencePackage.packageId
      || result.generatedAt !== analysisPackage.generatedAt
    ) {
      issues.push(issue(path, "analysis_result_mismatch", "Analysis result target or package binding is invalid."));
    }
    const expectedResultIds = stableUnique(request.evidenceRequestIds.flatMap((requestId) => (
      executionById.get(requestId)?.resultIds ?? []
    )));
    if (
      result.provenance.producerKind !== "b_agent"
      || result.provenance.producerId !== ANALYSIS_EXECUTOR_ID
      || result.provenance.producerVersion !== ANALYSIS_EXECUTOR_VERSION
      || !sameReference(result.provenance.definition, request.definition)
      || result.provenance.evidencePackageRevision !== evidencePackage.revisionHash
      || !canonicalEqual(result.provenance.inputEvidenceRequestIds, request.evidenceRequestIds)
      || !canonicalEqual(result.provenance.inputResultIds, expectedResultIds)
    ) {
      issues.push(issue(`${path}.provenance`, "provenance_mismatch", "Analysis provenance does not match its planned evidence inputs."));
    }
    if (result.provenance.model) {
      const model = result.provenance.model;
      if (
        !projection
        || model.adapterId !== ANALYSIS_MODEL_ADAPTER_ID
        || model.adapterVersion !== ANALYSIS_MODEL_ADAPTER_VERSION
        || !nonEmpty(model.providerId)
        || !nonEmpty(model.modelId)
        || model.requestAlias !== `REQ${index + 1}`
        || model.inputHash !== canonicalReportHash(projection.input)
        || model.promptVersion !== REPORT_ANALYSIS_PROMPT_VERSION
        || model.promptHash !== canonicalReportHash(REPORT_ANALYSIS_SYSTEM_PROMPT)
        || (model.responseHash !== null && !/^sha256:[a-f0-9]{64}$/u.test(model.responseHash))
      ) {
        issues.push(issue(`${path}.provenance.model`, "model_provenance_mismatch", "Analysis model provenance is invalid."));
      }
    }

    if (result.status === "complete") {
      if (!result.provenance.model || result.provenance.model.responseHash === null) {
        issues.push(issue(`${path}.provenance.model`, "model_provenance_mismatch", "Complete analysis requires accepted model provenance."));
      }
      const selectedEvidenceIds = new Set(request.evidenceRequestIds.flatMap((requestId) => (
        executionById.get(requestId)?.evidence.map((reference) => reference.evidenceId) ?? []
      )));
      const selectedEquipmentIds = new Set(selectedEquipment(request, plan.equipment).map((item) => item.equipmentId));
      const computedEvidenceIds: string[] = [];
      const computedFaultIds: string[] = [];
      let textCount = 0;
      for (const [segmentIndex, segment] of result.segments.entries()) {
        const segmentPath = `${path}.segments[${segmentIndex}]`;
        if (segment.kind === "text") {
          textCount += 1;
          if (
            !approvedQualitativeText(
              segment.text,
              request.analysisKind === "fault_diagnosis"
            )
            || segment.evidenceIds.length === 0
            || segment.evidenceIds.some((evidenceId) => !selectedEvidenceIds.has(evidenceId))
          ) {
            issues.push(issue(segmentPath, "ungrounded_text", "Analysis text is not grounded in allowed typed evidence."));
          }
          if (
            (request.analysisKind === "fault_diagnosis" || request.analysisKind === "fault_summary")
            && DIAGNOSIS_CERTAINTY_PATTERN.test(segment.text)
          ) {
            issues.push(issue(segmentPath, "invalid_fault_claim", "Fault prose crosses the detection/diagnosis boundary."));
          }
          computedEvidenceIds.push(...segment.evidenceIds);
        } else if (segment.kind === "metric_ref") {
          const metric = metricById.get(segment.metricResultId);
          if (!metric || metric.status !== "available" || !expectedResultIds.includes(metric.resultId)) {
            issues.push(issue(segmentPath, "unauthorized_reference", "Metric reference is not an available planned result."));
          } else {
            computedEvidenceIds.push(...referenceIds(metric.evidence));
          }
        } else if (segment.kind === "equipment_ref") {
          if (!selectedEquipmentIds.has(segment.equipmentId)) {
            issues.push(issue(segmentPath, "unauthorized_reference", "Equipment reference is outside the analysis scope."));
          }
        } else {
          const fault = faultById.get(segment.faultEventId);
          if (!fault || !expectedResultIds.includes(fault.eventId)) {
            issues.push(issue(segmentPath, "unauthorized_reference", "Fault reference is outside the planned evidence slice."));
          } else {
            computedFaultIds.push(fault.eventId);
            computedEvidenceIds.push(...referenceIds(fault.evidence));
          }
        }
      }
      if (textCount === 0 || computedEvidenceIds.length === 0 || !canonicalEqual(result.evidenceIds, sortedUnique(computedEvidenceIds))) {
        issues.push(issue(path, "incomplete_grounding", "Complete analysis must retain grounded text and canonical evidence references."));
      }
      if (request.analysisKind === "fault_diagnosis" && result.analysisKind === "fault_diagnosis") {
        if (
          result.diagnosisNature !== "hypothesis"
          || computedFaultIds.length === 0
          || !canonicalEqual(result.faultEventIds, stableUnique(computedFaultIds))
        ) {
          issues.push(issue(path, "invalid_fault_diagnosis", "Fault diagnosis must be a hypothesis over supplied fault events."));
        }
      }
    } else if (result.status === "insufficient_evidence") {
      const expectedMissing = request.evidenceRequestIds.filter((requestId) => (
        executionById.get(requestId)?.status !== "complete"
      ));
      if (!canonicalEqual(result.missingEvidence, expectedMissing)) {
        issues.push(issue(`${path}.missingEvidence`, "missing_evidence_mismatch", "Missing evidence must name only unavailable planned requests."));
      }
    } else if (result.status === "skipped") {
      if (result.provenance.model !== null || !nonEmpty(result.reasonCode)) {
        issues.push(issue(path, "invalid_skipped_result", "Skipped analysis must be deterministic and must not claim a model invocation."));
      }
    } else if (result.status === "error") {
      if (
        (result.errorCode === "analysis_capacity_unavailable" && result.provenance.model !== null)
        || (
          result.errorCode !== "analysis_capacity_unavailable"
          && (!result.provenance.model || result.provenance.model.responseHash !== null)
        )
      ) {
        issues.push(issue(path, "invalid_error_result", "Analysis errors have inconsistent model invocation provenance."));
      }
    }
  }

  if (Array.isArray(analysisPackage.results)) {
    const { revisionHash: _revisionHash, ...withoutRevision } = analysisPackage;
    if (analysisPackage.revisionHash !== analysisPackageRevision(withoutRevision)) {
      issues.push(issue("analysisPackage.revisionHash", "revision_hash_mismatch", "Analysis package revision hash is invalid."));
    }
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: structuredClone(analysisPackage) as AnalysisPackage };
}

function errorDetails(error: unknown): { errorCode: string; message: string; retryable: boolean } {
  if (error instanceof AnalysisRequestTimeout) {
    return { errorCode: "analysis_timeout", message: "Report analysis provider timed out.", retryable: true };
  }
  if (error instanceof AnalysisCapacityUnavailable) {
    return { errorCode: "analysis_capacity_unavailable", message: "Report analysis provider capacity is unavailable.", retryable: true };
  }
  if (error instanceof InvalidAnalysisOutput) {
    return { errorCode: "invalid_model_output", message: "Report analysis provider returned an invalid grounded result.", retryable: false };
  }
  if (error instanceof ReportAnalysisModelError) {
    const retryable = error.code === "provider_failed" || error.code === "provider_aborted";
    return { errorCode: error.code, message: error.message, retryable };
  }
  return { errorCode: "provider_failed", message: "Report analysis provider failed.", retryable: true };
}

async function runRequest(
  request: PlannedAnalysisRequest,
  requestIndex: number,
  definition: AnalysisDefinition,
  plan: ReportPlan,
  evidencePackage: EvidencePackage,
  generatedAt: string,
  model: ReportAnalysisModel,
  modelCalls: ModelCallLimiter
): Promise<AnalysisResult> {
  let projection: AnalysisProjection;
  try {
    projection = projectRequest(request, requestIndex, plan, evidencePackage);
  } catch {
    const emptyProjection: AnalysisProjection = {
      input: {
        schemaVersion: ANALYSIS_TOOL_INPUT_SCHEMA_VERSION,
        requestAlias: `REQ${requestIndex + 1}`,
        analysisKind: request.analysisKind,
        scope: request.scope.kind === "system"
          ? { kind: "system" }
          : request.scope.kind === "fleet"
            ? { kind: "fleet", equipmentType: request.scope.equipmentType }
            : { kind: "equipment", equipmentAlias: "EQ1", equipmentType: request.scope.equipmentType },
        definition: { ...request.definition },
        period: structuredClone(plan.period),
        allowedCitationAliases: [],
        equipment: [],
        metrics: [],
        charts: [],
        dashboards: [],
        faults: [],
        dataQuality: []
      },
      evidenceByAlias: new Map(),
      metricByAlias: new Map(),
      equipmentByAlias: new Map(),
      faultByAlias: new Map(),
      inputResultIds: [],
      missingRequestIds: [...request.evidenceRequestIds],
      selectedExecutions: []
    };
    return {
      ...baseResult(request, plan, evidencePackage, emptyProjection, generatedAt, null),
      status: "error",
      errorCode: "invalid_analysis_projection",
      message: "The planned evidence could not be projected safely for analysis.",
      retryable: false
    } as AnalysisResult;
  }
  const preflight = preflightOutcome(request, plan, evidencePackage, projection, generatedAt);
  if (preflight) return preflight;

  const frozenInput = deepFreeze(structuredClone(projection.input));
  const inputHash = canonicalReportHash(frozenInput);
  const commonModelProvenance = {
    adapterId: ANALYSIS_MODEL_ADAPTER_ID,
    adapterVersion: ANALYSIS_MODEL_ADAPTER_VERSION,
    providerId: model.metadata.id,
    modelId: model.metadata.model,
    requestAlias: frozenInput.requestAlias,
    inputHash,
    promptVersion: definition.promptVersion,
    promptHash: canonicalReportHash(REPORT_ANALYSIS_SYSTEM_PROMPT)
  };
  let draft: AnalysisToolDraft;
  try {
    draft = await modelCalls.run((signal) => model.analyze({
      projectId: plan.projectId,
      requestId: `report-analysis:${request.requestId}`,
      evidencePayload: frozenInput,
      signal,
      maxTokens: REPORT_ANALYSIS_MAX_OUTPUT_TOKENS
    }));
    if (!canonicalEqual(frozenInput, projection.input)) throw new InvalidAnalysisOutput();
    if (draft.status === "insufficient_evidence") {
      return {
        ...baseResult(request, plan, evidencePackage, projection, generatedAt, {
          ...commonModelProvenance,
          responseHash: canonicalReportHash(draft)
        }),
        status: "insufficient_evidence",
        message: "The B-Agent could not support a grounded analysis from the supplied typed evidence.",
        missingEvidence: [...projection.missingRequestIds]
      } as AnalysisResult;
    }
    const resolved = resolveDraft(draft, request, projection);
    const complete = {
      ...baseResult(request, plan, evidencePackage, projection, generatedAt, {
        ...commonModelProvenance,
        responseHash: canonicalReportHash(draft)
      }),
      status: "complete" as const,
      segments: resolved.segments,
      evidenceIds: resolved.evidenceIds,
      ...(request.analysisKind === "fault_diagnosis"
        ? { diagnosisNature: "hypothesis" as const, faultEventIds: resolved.faultEventIds }
        : {})
    };
    return complete as AnalysisResult;
  } catch (error) {
    const details = errorDetails(error);
    const modelProvenance = error instanceof AnalysisCapacityUnavailable
      ? null
      : {
          ...commonModelProvenance,
          responseHash: null
        };
    return {
      ...baseResult(request, plan, evidencePackage, projection, generatedAt, modelProvenance),
      status: "error",
      ...details
    } as AnalysisResult;
  }
}

/**
 * Execute grounded, read-only B-Agent interpretation over an immutable evidence package.
 * The model sees only per-request alias projections and cannot dispatch tools or author facts.
 */
export async function executeReportAnalysis(
  input: ExecuteReportAnalysisInput,
  dependencies: ExecuteReportAnalysisDependencies
): Promise<ReportValidationResult<AnalysisPackage>> {
  const issues = validateExecutionInput(input, dependencies);
  if (issues.length > 0) return { ok: false, issues };

  const plan = structuredClone(input.plan) as ReportPlan;
  const validatedEvidence = validateEvidencePackageForPlan(plan, input.evidencePackage);
  if (!validatedEvidence.ok) return validatedEvidence;
  const evidencePackage = validatedEvidence.value;
  const definitions = structuredClone(dependencies.definitions) as AnalysisDefinitionRegistry;
  const definitionByReference = new Map(definitions.definitions.map((definition) => [
    `${definition.definitionId}\u0000${definition.definitionVersion}`,
    definition
  ]));
  const modelCalls = createModelCallLimiter(
    dependencies.maxConcurrency ?? 4,
    dependencies.requestTimeoutMs ?? 30_000
  );
  const results = await Promise.all(plan.analysis.requests.map((request, index) => runRequest(
    request,
    index,
    definitionByReference.get(`${request.definition.definitionId}\u0000${request.definition.definitionVersion}`)!,
    plan,
    evidencePackage,
    input.generatedAt,
    dependencies.model,
    modelCalls
  )));

  const packageWithoutRevision = {
    schemaVersion: ANALYSIS_PACKAGE_SCHEMA_VERSION,
    packageId: input.packageId,
    planId: plan.planId,
    planRevision: evidencePackage.planRevision,
    projectId: plan.projectId,
    assetRevision: plan.assetRevision,
    period: structuredClone(plan.period),
    evidencePackageId: evidencePackage.packageId,
    evidencePackageRevision: evidencePackage.revisionHash,
    definitionsRevision: plan.analysis.definitionsRevision,
    generatedAt: input.generatedAt,
    results
  };
  const analysisPackage: AnalysisPackage = {
    ...packageWithoutRevision,
    revisionHash: analysisPackageRevision(packageWithoutRevision)
  };
  return validateAnalysisPackageForPlan(plan, evidencePackage, analysisPackage);
}
