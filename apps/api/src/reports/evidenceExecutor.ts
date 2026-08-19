import { createHash } from "node:crypto";

import {
  EVIDENCE_PACKAGE_SCHEMA_VERSION,
  EVIDENCE_PRODUCER_KINDS,
  REPORT_PLAN_SCHEMA_VERSION,
  type ChartResult,
  type DashboardResult,
  type DataQualityIssue,
  type EvidenceDefinitionReference,
  type EvidenceExecutionRecord,
  type EvidencePackage,
  type EvidenceReference,
  type EvidenceToolProvenance,
  type FaultEvent,
  type MetricResult,
  type PlannedChartRequest,
  type PlannedDashboardRequest,
  type PlannedFaultRequest,
  type PlannedMetricRequest,
  type ReportArtifact,
  type ReportPlan,
  type ReportScope,
  type ReportValidationIssue,
  type ReportValidationResult,
  type ResolvedReportPeriod,
  deriveDeterministicEquipmentFullName,
  formatEquipmentDisplayName,
  isEquipmentIdentifierOnlyName,
  isRfc3339Instant
} from "./contracts.js";
import {
  evidenceDefinitionRegistryRevision,
  validateEvidenceDefinitionRegistry,
  type ChartEvidenceDefinition,
  type DashboardEvidenceDefinition,
  type EvidenceDefinitionRegistry,
  type FaultEvidenceDefinition,
  type MetricEvidenceDefinition
} from "./evidenceDefinitions.js";
import type {
  ChartToolFact,
  DashboardToolFact,
  EvidenceProducerDescriptor,
  EvidenceToolContext,
  EvidenceToolOutcome,
  FaultDetectionFact,
  FaultToolFact,
  MetricEvidenceTool,
  MetricToolFact,
  ReportArtifactCandidate,
  ReportEvidenceTools
} from "./evidenceTools.js";

export interface ExecuteReportEvidenceInput {
  plan: Readonly<ReportPlan>;
  packageId: string;
  generatedAt: string;
}

export interface ExecuteReportEvidenceDependencies {
  definitions: EvidenceDefinitionRegistry;
  tools: ReportEvidenceTools;
  maxConcurrency?: number;
  requestTimeoutMs?: number;
}

interface RequestRun<T> {
  execution: EvidenceExecutionRecord;
  results: T[];
  dataQuality: DataQualityIssue[];
}

class InvalidToolOutput extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidToolOutput";
  }
}

class ArtifactWriteFailure extends Error {
  constructor() {
    super("The report artifact could not be written.");
    this.name = "ArtifactWriteFailure";
  }
}

class EvidenceRequestTimeout extends Error {
  constructor() {
    super("Evidence provider timed out.");
    this.name = "EvidenceRequestTimeout";
  }
}

function issue(path: string, code: string, message: string): ReportValidationIssue {
  return { path, code, message };
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateOutcomeEnvelope<T>(value: unknown): asserts value is EvidenceToolOutcome<T> {
  if (!value || typeof value !== "object") {
    throw new InvalidToolOutput("Tool outcome must be an object.");
  }
  const outcome = value as Record<string, unknown>;
  if (!new Set(["complete", "no_data", "error"]).has(String(outcome.status))) {
    throw new InvalidToolOutput("Tool outcome status is invalid.");
  }
  if (outcome.sourceRevision !== undefined && !nonEmpty(outcome.sourceRevision)) {
    throw new InvalidToolOutput("Tool source revision must be a non-empty string.");
  }
  if (outcome.evidence !== undefined && !Array.isArray(outcome.evidence)) {
    throw new InvalidToolOutput("Tool outcome evidence must be an array.");
  }
  if (outcome.status === "complete" && !("value" in outcome)) {
    throw new InvalidToolOutput("Complete tool outcomes require a value.");
  }
  if (outcome.status === "no_data") {
    if (!nonEmpty(outcome.reasonCode) || !/^[a-z0-9_]+$/.test(outcome.reasonCode) || !nonEmpty(outcome.message)) {
      throw new InvalidToolOutput("No-data outcomes require a stable reasonCode and message.");
    }
  }
  if (outcome.status === "error") {
    if (!nonEmpty(outcome.errorCode) || !/^[a-z0-9_]+$/.test(outcome.errorCode) || !nonEmpty(outcome.message)) {
      throw new InvalidToolOutput("Error outcomes require a stable errorCode and message.");
    }
    if (typeof outcome.retryable !== "boolean") {
      throw new InvalidToolOutput("Error outcomes require a boolean retryable flag.");
    }
  }
}

async function withRequestTimeout<T>(
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new EvidenceRequestTimeout());
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value && typeof value === "object") {
    if (value instanceof Uint8Array) return Array.from(value);
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return value;
}

export function canonicalReportHash(value: unknown): string {
  const encoded = JSON.stringify(canonicalize(value));
  return `sha256:${createHash("sha256").update(encoded).digest("hex")}`;
}

function sameReference(left: EvidenceDefinitionReference, right: EvidenceDefinitionReference): boolean {
  return left.definitionId === right.definitionId
    && left.definitionVersion === right.definitionVersion;
}

function samePeriod(left: ResolvedReportPeriod, right: ResolvedReportPeriod): boolean {
  return left.startAt === right.startAt
    && left.endAt === right.endAt
    && left.timeZone === right.timeZone;
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

function sameUniqueStringSet(left: string[], right: string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === left.length
    && rightSet.size === right.length
    && leftSet.size === rightSet.size
    && [...leftSet].every((value) => rightSet.has(value));
}

function scopeBelongsToPlan(scope: ReportScope, plan: ReportPlan): boolean {
  if (scope.kind === "system") return true;
  if (scope.kind === "fleet") {
    return plan.equipment.some((equipment) => equipment.equipmentType === scope.equipmentType);
  }
  return plan.equipment.some((equipment) => (
    equipment.equipmentId === scope.equipmentId
    && equipment.equipmentType === scope.equipmentType
  ));
}

function referenceKey(reference: EvidenceDefinitionReference): string {
  return `${reference.definitionId}\u0000${reference.definitionVersion}`;
}

function descriptorIssues(
  path: string,
  descriptor: EvidenceProducerDescriptor,
  expectedKinds: Set<string>
): ReportValidationIssue[] {
  const issues: ReportValidationIssue[] = [];
  if (!EVIDENCE_PRODUCER_KINDS.includes(descriptor.producerKind)) {
    issues.push(issue(`${path}.producerKind`, "invalid_producer", "Unknown or LLM evidence producers are forbidden."));
  }
  if (!expectedKinds.has(descriptor.producerKind)) {
    issues.push(issue(`${path}.producerKind`, "producer_mismatch", "Tool producer does not match the pinned definitions."));
  }
  if (!nonEmpty(descriptor.producerId)) {
    issues.push(issue(`${path}.producerId`, "required", "Producer ID is required."));
  }
  if (!nonEmpty(descriptor.producerVersion)) {
    issues.push(issue(`${path}.producerVersion`, "required", "Producer version is required."));
  }
  return issues;
}

function validateExecutionInput(
  input: ExecuteReportEvidenceInput,
  dependencies: ExecuteReportEvidenceDependencies
): ReportValidationIssue[] {
  const issues: ReportValidationIssue[] = [];
  const plan = input.plan;
  if (!plan || typeof plan !== "object") {
    return [issue("plan", "invalid_type", "A report plan is required.")];
  }
  if (plan.schemaVersion !== REPORT_PLAN_SCHEMA_VERSION) {
    issues.push(issue("plan.schemaVersion", "unsupported_schema", `Report plan schema ${REPORT_PLAN_SCHEMA_VERSION} is required.`));
  }
  if (!nonEmpty(plan.planId)) issues.push(issue("plan.planId", "required", "Plan ID is required."));
  if (!nonEmpty(plan.projectId)) issues.push(issue("plan.projectId", "required", "Project ID is required."));
  if (!plan.spec || plan.projectId !== plan.spec.projectId) {
    issues.push(issue("plan.projectId", "project_mismatch", "Plan project must match the report specification."));
  }
  if (!nonEmpty(plan.assetRevision)) issues.push(issue("plan.assetRevision", "required", "Asset revision is required."));
  if (!nonEmpty(input.packageId)) issues.push(issue("packageId", "required", "Package ID is required."));
  if (!isRfc3339Instant(input.generatedAt)) {
    issues.push(issue("generatedAt", "invalid_datetime", "generatedAt must be an RFC3339 instant."));
  }
  if (!isRfc3339Instant(plan.period?.startAt ?? "") || !isRfc3339Instant(plan.period?.endAt ?? "")) {
    issues.push(issue("plan.period", "invalid_datetime", "Plan period must use RFC3339 instants."));
  } else if (Date.parse(plan.period.startAt) >= Date.parse(plan.period.endAt)) {
    issues.push(issue("plan.period", "invalid_range", "Plan period must be a non-empty half-open interval."));
  }
  if (!nonEmpty(plan.period?.timeZone)) {
    issues.push(issue("plan.period.timeZone", "required", "Plan timezone is required."));
  }
  if (!Array.isArray(plan.equipment)) {
    issues.push(issue("plan.equipment", "invalid_type", "Plan equipment must be an array."));
    return issues;
  }
  const equipmentIds = new Set<string>();
  const allowedNameSources = new Set([
    "semantic_model",
    "project_metadata",
    "bms_metadata",
    "deterministic_fallback"
  ]);
  for (const [index, equipment] of plan.equipment.entries()) {
    if (!nonEmpty(equipment.equipmentId)) {
      issues.push(issue(`plan.equipment[${index}].equipmentId`, "required", "Equipment ID is required."));
    } else if (equipmentIds.has(equipment.equipmentId)) {
      issues.push(issue(`plan.equipment[${index}].equipmentId`, "duplicate_equipment", "Equipment ID is duplicated."));
    } else {
      equipmentIds.add(equipment.equipmentId);
    }
    for (const field of ["shortIdentifier", "equipmentType", "fullName", "displayName", "nameSourceRef"] as const) {
      if (!nonEmpty(equipment[field])) {
        issues.push(issue(`plan.equipment[${index}].${field}`, "required", `${field} is required.`));
      }
    }
    if (!allowedNameSources.has(equipment.nameSource)) {
      issues.push(issue(
        `plan.equipment[${index}].nameSource`,
        "invalid_name_source",
        "Equipment names must come from an authoritative source or deterministic fallback."
      ));
    }
    if (
      nonEmpty(equipment.shortIdentifier)
      && nonEmpty(equipment.fullName)
      && equipment.displayName !== formatEquipmentDisplayName(equipment.shortIdentifier, equipment.fullName)
    ) {
      issues.push(issue(`plan.equipment[${index}].displayName`, "noncanonical_name", "Equipment display name is not canonical."));
    }
    if (
      equipment.nameSource === "deterministic_fallback"
      && nonEmpty(equipment.shortIdentifier)
      && nonEmpty(equipment.equipmentType)
    ) {
      const expectedName = deriveDeterministicEquipmentFullName(equipment.shortIdentifier, equipment.equipmentType);
      const expectedRef = `fallback:${equipment.equipmentType}:${equipment.equipmentId}:short=${equipment.shortIdentifier}`;
      if (equipment.fullName !== expectedName || equipment.nameSourceRef !== expectedRef) {
        issues.push(issue(`plan.equipment[${index}]`, "invalid_fallback_name", "Fallback equipment identity was altered."));
      }
    } else if (
      nonEmpty(equipment.equipmentId)
      && nonEmpty(equipment.shortIdentifier)
      && nonEmpty(equipment.fullName)
      && isEquipmentIdentifierOnlyName(equipment.fullName, equipment.equipmentId, equipment.shortIdentifier)
    ) {
      issues.push(issue(`plan.equipment[${index}].fullName`, "identifier_only_name", "Equipment full name is not descriptive."));
    }
  }
  if (!plan.assetProvenance || !Array.isArray(plan.assetProvenance.equipment)) {
    issues.push(issue("plan.assetProvenance", "required", "Asset provenance is required for evidence execution."));
  } else {
    const provenanceById = new Map(plan.assetProvenance.equipment.map((entry) => [entry.equipmentId, entry]));
    if (provenanceById.size !== plan.equipment.length) {
      issues.push(issue("plan.assetProvenance.equipment", "equipment_mismatch", "Asset provenance must match selected equipment exactly."));
    }
    const identityFields = [
      "equipmentId",
      "shortIdentifier",
      "equipmentType",
      "fullName",
      "displayName",
      "nameSource",
      "nameSourceRef"
    ] as const;
    for (const [index, equipment] of plan.equipment.entries()) {
      const provenance = provenanceById.get(equipment.equipmentId);
      const resolvedIdentity = provenance?.resolvedIdentity;
      if (!resolvedIdentity || identityFields.some((field) => resolvedIdentity[field] !== equipment[field])) {
        issues.push(issue(
          `plan.equipment[${index}]`,
          "identity_provenance_mismatch",
          "Equipment identity does not match authoritative asset provenance."
        ));
      }
      if (
        equipment.nameSource !== "deterministic_fallback"
        && !provenance?.sources.some((source) => (
          source.sourceKind === equipment.nameSource
          && source.sourceRef === equipment.nameSourceRef
        ))
      ) {
        issues.push(issue(
          `plan.equipment[${index}].nameSourceRef`,
          "name_source_not_found",
          "Equipment name source is absent from authoritative asset provenance."
        ));
      }
    }
  }

  issues.push(...validateEvidenceDefinitionRegistry(dependencies.definitions));
  if (!plan.evidence || typeof plan.evidence !== "object") {
    issues.push(issue("plan.evidence", "required", "Evidence plan is required."));
    return issues;
  }
  if (evidenceDefinitionRegistryRevision(dependencies.definitions) !== plan.evidence.definitionsRevision) {
    issues.push(issue(
      "plan.evidence.definitionsRevision",
      "definition_revision_mismatch",
      "Evidence definition registry does not match the revision pinned by the plan."
    ));
  }

  const metricDefinitions = new Map(dependencies.definitions.metrics.map((definition) => [referenceKey(definition), definition]));
  const chartDefinitions = new Map(dependencies.definitions.charts.map((definition) => [referenceKey(definition), definition]));
  const dashboardDefinitions = new Map(dependencies.definitions.dashboards.map((definition) => [referenceKey(definition), definition]));
  const faultDefinitions = new Map(dependencies.definitions.faults.map((definition) => [referenceKey(definition), definition]));
  const requestIds = new Set<string>();
  const metricRequestIds = new Set<string>();
  const faultRequestIds = new Set<string>();
  const faultSemanticKeys = new Set<string>();
  const metricRequestsById = new Map(plan.evidence.metrics.map((request) => [request.requestId, request]));
  const registerRequest = (requestId: string, path: string): void => {
    if (!nonEmpty(requestId)) {
      issues.push(issue(`${path}.requestId`, "required", "Request ID is required."));
    } else if (requestIds.has(requestId)) {
      issues.push(issue(`${path}.requestId`, "duplicate_request", `Request ${requestId} is duplicated.`));
    } else {
      requestIds.add(requestId);
    }
  };

  for (const [index, request] of plan.evidence.metrics.entries()) {
    const path = `plan.evidence.metrics[${index}]`;
    registerRequest(request.requestId, path);
    metricRequestIds.add(request.requestId);
    if (!scopeBelongsToPlan(request.scope, plan)) {
      issues.push(issue(`${path}.scope`, "scope_not_in_plan", "Metric scope is not present in the report plan."));
    }
    const definition = metricDefinitions.get(referenceKey(request.definition));
    if (!definition || definition.metricKey !== request.metricKey || definition.scopeKind !== request.scope.kind) {
      issues.push(issue(`${path}.definition`, "definition_mismatch", "Metric definition does not match the planned key and scope."));
    }
  }
  for (const [index, request] of plan.evidence.charts.entries()) {
    const path = `plan.evidence.charts[${index}]`;
    registerRequest(request.requestId, path);
    if (!scopeBelongsToPlan(request.scope, plan)) {
      issues.push(issue(`${path}.scope`, "scope_not_in_plan", "Chart scope is not present in the report plan."));
    }
    const definition = chartDefinitions.get(referenceKey(request.definition));
    if (!definition || definition.chartKey !== request.chartKey || definition.scopeKind !== request.scope.kind) {
      issues.push(issue(`${path}.definition`, "definition_mismatch", "Chart definition does not match the planned key and scope."));
    } else if (request.origin === "fault_summary") {
      if (definition.inputKind !== "faults") {
        issues.push(issue(`${path}.definition`, "definition_mismatch", "Fault chart definition must consume faults."));
      }
    } else {
      if (definition.inputKind !== "metrics") {
        issues.push(issue(`${path}.definition`, "definition_mismatch", "Metric chart definition must consume metrics."));
      }
      const plannedMetricKeys = request.inputMetricRequestIds
        .map((requestId) => metricRequestsById.get(requestId)?.metricKey)
        .filter((metricKey): metricKey is string => metricKey !== undefined);
      const exactInputs = plannedMetricKeys.length === definition.requiredMetricKeys.length
        && definition.requiredMetricKeys.every((metricKey) => plannedMetricKeys.includes(metricKey))
        && plannedMetricKeys.every((metricKey) => definition.requiredMetricKeys.includes(metricKey));
      if (!exactInputs) {
        issues.push(issue(`${path}.inputMetricRequestIds`, "definition_mismatch", "Chart inputs do not match its pinned metric definition."));
      }
      const dependenciesForChart = request.inputMetricRequestIds
        .map((requestId) => metricRequestsById.get(requestId))
        .filter((dependency): dependency is PlannedMetricRequest => dependency !== undefined);
      if (dependenciesForChart.some((dependency) => !sameScope(dependency.scope, request.scope))) {
        issues.push(issue(
          `${path}.inputMetricRequestIds`,
          "dependency_scope_mismatch",
          "Chart metric dependencies must match the chart scope exactly."
        ));
      }
      if (
        request.origin === "equipment_profile"
        && dependenciesForChart.some((dependency) => dependency.profileId !== request.profileId)
      ) {
        issues.push(issue(
          `${path}.inputMetricRequestIds`,
          "dependency_profile_mismatch",
          "Equipment-profile charts may only consume metrics from the same profile."
        ));
      }
      if (
        request.origin === "system_kpi"
        && !sameUniqueStringSet(request.metricKeys, definition.requiredMetricKeys)
      ) {
        issues.push(issue(
          `${path}.metricKeys`,
          "definition_mismatch",
          "System chart metric keys must match its pinned definition exactly."
        ));
      }
    }
    const inputIds = request.origin === "fault_summary"
      ? request.inputFaultRequestIds
      : request.inputMetricRequestIds;
    if (!Array.isArray(inputIds) || inputIds.length === 0) {
      issues.push(issue(`${path}.inputs`, "required", "Chart requests require explicit upstream evidence requests."));
    } else if (new Set(inputIds).size !== inputIds.length) {
      issues.push(issue(`${path}.inputs`, "duplicate_dependency", "Chart dependency request IDs must be unique."));
    }
  }
  for (const [index, request] of plan.evidence.dashboards.entries()) {
    const path = `plan.evidence.dashboards[${index}]`;
    registerRequest(request.requestId, path);
    if (!nonEmpty(request.dashboardId)) issues.push(issue(`${path}.dashboardId`, "required", "Dashboard ID is required."));
    if (!nonEmpty(request.dashboardRevision)) {
      issues.push(issue(`${path}.dashboardRevision`, "required", "Dashboard revision is required."));
    }
    if (!dashboardDefinitions.has(referenceKey(request.definition))) {
      issues.push(issue(`${path}.definition`, "definition_mismatch", "Dashboard renderer definition is not pinned by the registry."));
    }
  }
  for (const [index, request] of plan.evidence.faults.entries()) {
    const path = `plan.evidence.faults[${index}]`;
    registerRequest(request.requestId, path);
    faultRequestIds.add(request.requestId);
    const equipment = plan.equipment.find((item) => item.equipmentId === request.equipmentId);
    if (!equipment || equipment.equipmentType !== request.equipmentType) {
      issues.push(issue(`${path}.equipmentId`, "equipment_mismatch", "Fault request equipment is not present in the plan."));
    }
    const definition = faultDefinitions.get(referenceKey(request.definition));
    if (!definition || definition.equipmentType !== request.equipmentType) {
      issues.push(issue(`${path}.definition`, "definition_mismatch", "Fault definition does not match the planned equipment type."));
    }
    const semanticKey = `${request.equipmentId}\u0000${referenceKey(request.definition)}`;
    if (faultSemanticKeys.has(semanticKey)) {
      issues.push(issue(path, "duplicate_fault_request", "The same equipment and fault definition are planned more than once."));
    } else {
      faultSemanticKeys.add(semanticKey);
    }
  }
  for (const [index, request] of plan.evidence.charts.entries()) {
    const path = `plan.evidence.charts[${index}]`;
    if (request.origin === "fault_summary") {
      const expectedFaultRequestIds = plan.evidence.faults.map((fault) => fault.requestId);
      if (!sameUniqueStringSet(request.inputFaultRequestIds, expectedFaultRequestIds)) {
        issues.push(issue(
          `${path}.inputFaultRequestIds`,
          "fault_dependency_mismatch",
          "Fault summary charts must consume every planned fault request exactly once."
        ));
      }
      for (const inputId of request.inputFaultRequestIds) {
        if (!faultRequestIds.has(inputId)) {
          issues.push(issue(`${path}.inputFaultRequestIds`, "unknown_dependency", `Fault request ${inputId} does not exist.`));
        }
      }
    } else {
      for (const inputId of request.inputMetricRequestIds) {
        if (!metricRequestIds.has(inputId)) {
          issues.push(issue(`${path}.inputMetricRequestIds`, "unknown_dependency", `Metric request ${inputId} does not exist.`));
        }
      }
    }
  }
  for (const [index, analysis] of plan.analysis.requests.entries()) {
    for (const evidenceRequestId of analysis.evidenceRequestIds) {
      if (!requestIds.has(evidenceRequestId)) {
        issues.push(issue(
          `plan.analysis.requests[${index}].evidenceRequestIds`,
          "unknown_evidence_request",
          `Analysis references unknown evidence request ${evidenceRequestId}.`
        ));
      }
    }
  }

  if (plan.evidence.metrics.length > 0) {
    const selectedMetricKinds = new Set<string>();
    for (const request of plan.evidence.metrics) {
      const producerKind = metricDefinitions.get(referenceKey(request.definition))?.producerKind;
      if (producerKind) selectedMetricKinds.add(producerKind);
    }
    for (const producerKind of selectedMetricKinds) {
      const tool = dependencies.tools.metrics?.[producerKind as MetricEvidenceDefinition["producerKind"]];
      if (!tool) {
        issues.push(issue(
          `tools.metrics.${producerKind}`,
          "required",
          `A ${producerKind} metric evidence tool is required by the plan.`
        ));
        continue;
      }
      issues.push(...descriptorIssues(
        `tools.metrics.${producerKind}.descriptor`,
        tool.descriptor,
        new Set([producerKind])
      ));
    }
  }
  if (plan.evidence.charts.length > 0) {
    issues.push(...descriptorIssues("tools.chart.descriptor", dependencies.tools.chart.descriptor, new Set(["plot_tool"])));
  }
  if (plan.evidence.dashboards.length > 0) {
    issues.push(...descriptorIssues(
      "tools.dashboard.descriptor",
      dependencies.tools.dashboard.descriptor,
      new Set(["dashboard_renderer"])
    ));
  }
  if (plan.evidence.faults.length > 0) {
    issues.push(...descriptorIssues("tools.fault.descriptor", dependencies.tools.fault.descriptor, new Set(["fdd_rule"])));
  }
  if (!dependencies.tools.artifactSink || typeof dependencies.tools.artifactSink.write !== "function") {
    issues.push(issue("tools.artifactSink", "required", "An artifact sink is required."));
  }
  if (
    dependencies.maxConcurrency !== undefined
    && (!Number.isInteger(dependencies.maxConcurrency) || dependencies.maxConcurrency < 1 || dependencies.maxConcurrency > 32)
  ) {
    issues.push(issue("maxConcurrency", "invalid_value", "maxConcurrency must be an integer from 1 through 32."));
  }
  if (
    dependencies.requestTimeoutMs !== undefined
    && (!Number.isInteger(dependencies.requestTimeoutMs)
      || dependencies.requestTimeoutMs < 1
      || dependencies.requestTimeoutMs > 120_000)
  ) {
    issues.push(issue("requestTimeoutMs", "invalid_value", "requestTimeoutMs must be an integer from 1 through 120000."));
  }
  return issues;
}

function isJsonValue(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item, seen));
  if (typeof value !== "object") return false;
  if (seen.has(value as object)) return false;
  seen.add(value as object);
  const valid = Object.entries(value as Record<string, unknown>)
    .every(([, item]) => item !== undefined && isJsonValue(item, seen));
  seen.delete(value as object);
  return valid;
}

function evidenceReferences(value: unknown): EvidenceReference[] {
  if (!Array.isArray(value)) throw new InvalidToolOutput("Evidence references must be an array.");
  const ids = new Set<string>();
  return value.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object") {
      throw new InvalidToolOutput(`Evidence reference ${index} is invalid.`);
    }
    const reference = candidate as EvidenceReference;
    if (!nonEmpty(reference.evidenceId) || ids.has(reference.evidenceId)) {
      throw new InvalidToolOutput("Evidence IDs must be non-empty and unique within a result.");
    }
    ids.add(reference.evidenceId);
    if (!EVIDENCE_SOURCE_KINDS.has(reference.sourceKind) || !nonEmpty(reference.sourceId)) {
      throw new InvalidToolOutput("Evidence source is unknown, empty, or LLM-originated.");
    }
    if (reference.observedAt !== undefined && !isRfc3339Instant(reference.observedAt)) {
      throw new InvalidToolOutput("Evidence observedAt must be an RFC3339 instant.");
    }
    if (reference.checksum !== undefined && !SHA256_PATTERN.test(reference.checksum)) {
      throw new InvalidToolOutput("Evidence checksum must use sha256:<hex> format.");
    }
    if (reference.metadata !== undefined && !isJsonValue(reference.metadata)) {
      throw new InvalidToolOutput("Evidence metadata must contain finite JSON values only.");
    }
    return structuredClone(reference);
  }).sort((left, right) => compareText(left.evidenceId, right.evidenceId));
}

function mergeEvidenceReferences(...groups: EvidenceReference[][]): EvidenceReference[] {
  const byId = new Map<string, EvidenceReference>();
  for (const reference of groups.flat()) {
    const existing = byId.get(reference.evidenceId);
    if (existing && JSON.stringify(canonicalize(existing)) !== JSON.stringify(canonicalize(reference))) {
      throw new InvalidToolOutput(`Evidence ${reference.evidenceId} has conflicting definitions.`);
    }
    if (!existing) byId.set(reference.evidenceId, structuredClone(reference));
  }
  return [...byId.values()].sort((left, right) => compareText(left.evidenceId, right.evidenceId));
}

const EVIDENCE_SOURCE_KINDS = new Set([
  "bms",
  "derived_metric",
  "calculation",
  "plot_tool",
  "dashboard",
  "fdd_rule",
  "semantic_model",
  "project_metadata"
]);
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

function resultId(kind: "metric" | "chart" | "dashboard", requestId: string): string {
  return `${kind}_${canonicalReportHash(requestId).slice("sha256:".length, "sha256:".length + 24)}`;
}

function provenanceFor(
  descriptor: EvidenceProducerDescriptor,
  definition: EvidenceDefinitionReference,
  context: EvidenceToolContext,
  request: unknown,
  inputEvidenceIds: string[],
  sourceRevision?: string
): EvidenceToolProvenance {
  const provenance: EvidenceToolProvenance = {
    producerKind: descriptor.producerKind,
    producerId: descriptor.producerId,
    producerVersion: descriptor.producerVersion,
    definition: { ...definition },
    queryHash: canonicalReportHash({
      planId: context.planId,
      projectId: context.projectId,
      assetRevision: context.assetRevision,
      period: context.period,
      request,
      definition,
      inputEvidenceIds
    }),
    inputEvidenceIds: [...inputEvidenceIds]
  };
  if (nonEmpty(sourceRevision)) provenance.sourceRevision = sourceRevision;
  return provenance;
}

function dataQualityFor(
  requestId: string,
  status: "no_data" | "error",
  code: string,
  message: string,
  evidence: EvidenceReference[]
): DataQualityIssue {
  return {
    issueId: `quality_${canonicalReportHash({ requestId, status, code }).slice(7, 31)}`,
    requestId,
    severity: status === "error" ? "error" : "warning",
    code,
    message,
    evidence: structuredClone(evidence)
  };
}

function completeExecution(
  requestId: string,
  requestKind: EvidenceExecutionRecord["requestKind"],
  resultIds: string[],
  evidence: EvidenceReference[],
  provenance: EvidenceToolProvenance
): EvidenceExecutionRecord {
  return {
    requestId,
    requestKind,
    status: "complete",
    resultIds,
    evidence: mergeEvidenceReferences(evidence),
    provenance
  };
}

function noDataExecution(
  requestId: string,
  requestKind: EvidenceExecutionRecord["requestKind"],
  resultIds: string[],
  evidence: EvidenceReference[],
  provenance: EvidenceToolProvenance,
  reasonCode: string,
  message: string
): EvidenceExecutionRecord {
  return {
    requestId,
    requestKind,
    status: "no_data",
    resultIds,
    evidence: mergeEvidenceReferences(evidence),
    provenance,
    reasonCode,
    message
  };
}

function errorExecution(
  requestId: string,
  requestKind: EvidenceExecutionRecord["requestKind"],
  resultIds: string[],
  evidence: EvidenceReference[],
  provenance: EvidenceToolProvenance,
  errorCode: string,
  message: string,
  retryable: boolean
): EvidenceExecutionRecord {
  return {
    requestId,
    requestKind,
    status: "error",
    resultIds,
    evidence: mergeEvidenceReferences(evidence),
    provenance,
    errorCode,
    message,
    retryable
  };
}

function outcomeEvidence<T>(outcome: EvidenceToolOutcome<T>): EvidenceReference[] {
  return evidenceReferences(outcome.evidence ?? []);
}

function invalidMessage(error: unknown): string {
  if (error instanceof InvalidToolOutput) return error.message;
  return "Evidence provider returned an invalid result.";
}

function metricErrorRun(
  request: PlannedMetricRequest,
  definition: MetricEvidenceDefinition,
  provenance: EvidenceToolProvenance,
  errorCode: string,
  message: string,
  retryable: boolean,
  period: ResolvedReportPeriod,
  evidence: EvidenceReference[] = []
): RequestRun<MetricResult> {
  const id = resultId("metric", request.requestId);
  const result: MetricResult = {
    resultId: id,
    metricKey: request.metricKey,
    label: definition.label,
    unit: definition.unit,
    scope: structuredClone(request.scope),
    period: structuredClone(period),
    evidence,
    status: "error",
    errorCode,
    message
  };
  return {
    execution: errorExecution(request.requestId, "metric", [id], evidence, provenance, errorCode, message, retryable),
    results: [result],
    dataQuality: [dataQualityFor(request.requestId, "error", errorCode, message, evidence)]
  };
}

async function runMetric(
  request: PlannedMetricRequest,
  definition: MetricEvidenceDefinition,
  context: EvidenceToolContext,
  tool: MetricEvidenceTool
): Promise<RequestRun<MetricResult>> {
  const baseProvenance = provenanceFor(tool.descriptor, request.definition, context, request, []);
  let failureEvidence: EvidenceReference[] = [];
  let failureProvenance = baseProvenance;
  const id = resultId("metric", request.requestId);
  try {
    const frozenInput = deepFreeze({
      context: structuredClone(context),
      request: structuredClone(request),
      definition: structuredClone(definition)
    });
    const outcome = structuredClone(await withRequestTimeout(
      context.requestTimeoutMs,
      (signal) => tool.execute(Object.freeze({ ...frozenInput, signal }))
    ));
    validateOutcomeEnvelope<MetricToolFact>(outcome);
    const evidence = outcomeEvidence(outcome);
    let provenance = provenanceFor(
      tool.descriptor,
      request.definition,
      context,
      request,
      evidence.map((reference) => reference.evidenceId),
      outcome.sourceRevision
    );
    failureEvidence = evidence;
    failureProvenance = provenance;
    if (outcome.status === "no_data") {
      const result: MetricResult = {
        resultId: id,
        metricKey: request.metricKey,
        label: definition.label,
        unit: definition.unit,
        scope: structuredClone(request.scope),
        period: structuredClone(context.period),
        evidence,
        status: "no_data",
        reason: outcome.message
      };
      return {
        execution: noDataExecution(
          request.requestId,
          "metric",
          [id],
          evidence,
          provenance,
          outcome.reasonCode,
          outcome.message
        ),
        results: [result],
        dataQuality: [dataQualityFor(request.requestId, "no_data", outcome.reasonCode, outcome.message, evidence)]
      };
    }
    if (outcome.status === "error") {
      const result: MetricResult = {
        resultId: id,
        metricKey: request.metricKey,
        label: definition.label,
        unit: definition.unit,
        scope: structuredClone(request.scope),
        period: structuredClone(context.period),
        evidence,
        status: "error",
        errorCode: outcome.errorCode,
        message: outcome.message
      };
      return {
        execution: errorExecution(
          request.requestId,
          "metric",
          [id],
          evidence,
          provenance,
          outcome.errorCode,
          outcome.message,
          outcome.retryable
        ),
        results: [result],
        dataQuality: [dataQualityFor(request.requestId, "error", outcome.errorCode, outcome.message, evidence)]
      };
    }
    const fact = outcome.value;
    if (
      fact.projectId !== context.projectId
      || fact.metricKey !== request.metricKey
      || !sameScope(fact.scope, request.scope)
      || !samePeriod(fact.period, context.period)
      || !sameReference(fact.definition, request.definition)
      || fact.observedUnit !== definition.unit
    ) {
      throw new InvalidToolOutput("Metric project, key, scope, period, definition, or unit does not match the plan.");
    }
    if (!Number.isFinite(fact.value)) throw new InvalidToolOutput("Metric value must be finite.");
    if (!Number.isInteger(fact.sampleCount) || fact.sampleCount < 1) {
      throw new InvalidToolOutput("Available metrics require a positive integer sample count.");
    }
    if (!Number.isFinite(fact.coverage) || fact.coverage < 0 || fact.coverage > 1) {
      throw new InvalidToolOutput("Metric coverage must be between 0 and 1.");
    }
    const factEvidence = mergeEvidenceReferences(evidence, evidenceReferences(fact.evidence));
    if (factEvidence.length === 0) {
      throw new InvalidToolOutput("Available metric facts require at least one typed evidence reference.");
    }
    provenance = provenanceFor(
      tool.descriptor,
      request.definition,
      context,
      request,
      factEvidence.map((reference) => reference.evidenceId),
      outcome.sourceRevision
    );
    failureEvidence = factEvidence;
    failureProvenance = provenance;
    if (fact.coverage < definition.minimumCoverage) {
      const message = `Coverage ${fact.coverage} is below the required ${definition.minimumCoverage}.`;
      const result: MetricResult = {
        resultId: id,
        metricKey: request.metricKey,
        label: definition.label,
        unit: definition.unit,
        scope: structuredClone(request.scope),
        period: structuredClone(context.period),
        evidence: factEvidence,
        status: "no_data",
        reason: message
      };
      return {
        execution: noDataExecution(
          request.requestId,
          "metric",
          [id],
          factEvidence,
          provenance,
          "insufficient_coverage",
          message
        ),
        results: [result],
        dataQuality: [dataQualityFor(request.requestId, "no_data", "insufficient_coverage", message, factEvidence)]
      };
    }
    const result: MetricResult = {
      resultId: id,
      metricKey: request.metricKey,
      label: definition.label,
      unit: definition.unit,
      scope: structuredClone(request.scope),
      period: structuredClone(context.period),
      evidence: factEvidence,
      status: "available",
      value: fact.value,
      aggregation: definition.aggregation,
      sampleCount: fact.sampleCount,
      coverage: fact.coverage
    };
    return {
      execution: completeExecution(request.requestId, "metric", [id], factEvidence, provenance),
      results: [result],
      dataQuality: []
    };
  } catch (error) {
    const errorCode = error instanceof EvidenceRequestTimeout
      ? "timeout"
      : error instanceof InvalidToolOutput
        ? "invalid_tool_output"
        : "provider_exception";
    const message = error instanceof EvidenceRequestTimeout
      ? error.message
      : error instanceof InvalidToolOutput
        ? invalidMessage(error)
        : "Metric evidence provider threw an exception.";
    return metricErrorRun(
      request,
      definition,
      failureProvenance,
      errorCode,
      message,
      !(error instanceof InvalidToolOutput),
      context.period,
      failureEvidence
    );
  }
}

function validArtifactPath(relativePath: string, mediaType: ReportArtifact["mediaType"]): boolean {
  if (!nonEmpty(relativePath) || relativePath.includes("\\") || relativePath.includes("\0")) return false;
  if (relativePath.startsWith("/") || /^[A-Za-z]:/.test(relativePath)) return false;
  const segments = relativePath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return false;
  const extension = relativePath.toLowerCase().slice(relativePath.lastIndexOf("."));
  return (mediaType === "image/png" && extension === ".png")
    || (mediaType === "image/svg+xml" && extension === ".svg")
    || (mediaType === "application/pdf" && extension === ".pdf");
}

async function materializeArtifact(
  requestId: string,
  candidate: ReportArtifactCandidate,
  context: EvidenceToolContext,
  tools: ReportEvidenceTools
): Promise<ReportArtifact> {
  if (!validArtifactPath(candidate.relativePath, candidate.mediaType)) {
    throw new InvalidToolOutput("Artifact path or extension is unsafe or inconsistent with its media type.");
  }
  if (!(candidate.bytes instanceof Uint8Array) || candidate.bytes.byteLength === 0 || candidate.bytes.byteLength > 50_000_000) {
    throw new InvalidToolOutput("Artifact bytes must be a non-empty Uint8Array no larger than 50 MB.");
  }
  const bytes = new Uint8Array(candidate.bytes);
  const checksum = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  const namespace = canonicalReportHash(requestId).slice(7, 27);
  const relativePath = `evidence/${namespace}/${candidate.relativePath}`;
  const artifact: ReportArtifact = {
    artifactId: `artifact_${canonicalReportHash({ requestId, checksum }).slice(7, 31)}`,
    relativePath,
    mediaType: candidate.mediaType,
    checksum
  };
  try {
    await withRequestTimeout(context.requestTimeoutMs, (signal) => tools.artifactSink.write({
      ...artifact,
      storageNamespace: `run_${canonicalReportHash({
        projectId: context.projectId,
        planId: context.planId,
        packageId: context.packageId
      }).slice(7, 39)}`,
      packageId: context.packageId,
      planId: context.planId,
      projectId: context.projectId,
      signal,
      bytes: new Uint8Array(bytes)
    }));
  } catch (error) {
    if (error instanceof EvidenceRequestTimeout) throw error;
    throw new ArtifactWriteFailure();
  }
  return artifact;
}

function dashboardResultBase(
  request: PlannedDashboardRequest,
  context: EvidenceToolContext,
  evidence: EvidenceReference[]
) {
  return {
    resultId: resultId("dashboard", request.requestId),
    dashboardId: request.dashboardId,
    dashboardRevision: request.dashboardRevision,
    title: request.dashboardId,
    period: structuredClone(context.period),
    evidence
  };
}

async function runDashboard(
  request: PlannedDashboardRequest,
  context: EvidenceToolContext,
  tools: ReportEvidenceTools
): Promise<RequestRun<DashboardResult>> {
  const baseProvenance = provenanceFor(tools.dashboard.descriptor, request.definition, context, request, []);
  let failureEvidence: EvidenceReference[] = [];
  let failureProvenance = baseProvenance;
  const base = dashboardResultBase(request, context, []);
  try {
    const frozenInput = deepFreeze({
      context: structuredClone(context),
      request: structuredClone(request)
    });
    const outcome = structuredClone(await withRequestTimeout(
      context.requestTimeoutMs,
      (signal) => tools.dashboard.execute(Object.freeze({ ...frozenInput, signal }))
    ));
    validateOutcomeEnvelope<DashboardToolFact>(outcome);
    const evidence = outcomeEvidence(outcome);
    let provenance = provenanceFor(
      tools.dashboard.descriptor,
      request.definition,
      context,
      request,
      evidence.map((reference) => reference.evidenceId),
      outcome.sourceRevision
    );
    failureEvidence = evidence;
    failureProvenance = provenance;
    if (outcome.status === "no_data") {
      const result: DashboardResult = { ...base, evidence, status: "no_data", reason: outcome.message };
      return {
        execution: noDataExecution(
          request.requestId,
          "dashboard",
          [base.resultId],
          evidence,
          provenance,
          outcome.reasonCode,
          outcome.message
        ),
        results: [result],
        dataQuality: [dataQualityFor(request.requestId, "no_data", outcome.reasonCode, outcome.message, evidence)]
      };
    }
    if (outcome.status === "error") {
      const result: DashboardResult = {
        ...base,
        evidence,
        status: "error",
        errorCode: outcome.errorCode,
        message: outcome.message
      };
      return {
        execution: errorExecution(
          request.requestId,
          "dashboard",
          [base.resultId],
          evidence,
          provenance,
          outcome.errorCode,
          outcome.message,
          outcome.retryable
        ),
        results: [result],
        dataQuality: [dataQualityFor(request.requestId, "error", outcome.errorCode, outcome.message, evidence)]
      };
    }
    const fact = outcome.value;
    if (
      fact.projectId !== context.projectId
      || fact.dashboardId !== request.dashboardId
      || fact.dashboardRevision !== request.dashboardRevision
      || !samePeriod(fact.period, context.period)
      || !sameReference(fact.definition, request.definition)
      || !nonEmpty(fact.title)
    ) {
      throw new InvalidToolOutput("Dashboard project, ID, revision, period, definition, or title does not match the plan.");
    }
    const factEvidence = mergeEvidenceReferences(evidence, evidenceReferences(fact.evidence));
    if (factEvidence.length === 0) {
      throw new InvalidToolOutput("Ready dashboards require at least one typed evidence reference.");
    }
    provenance = provenanceFor(
      tools.dashboard.descriptor,
      request.definition,
      context,
      request,
      factEvidence.map((reference) => reference.evidenceId),
      outcome.sourceRevision
    );
    failureEvidence = factEvidence;
    failureProvenance = provenance;
    const artifact = await materializeArtifact(request.requestId, fact.artifact, context, tools);
    const result: DashboardResult = {
      ...base,
      title: fact.title,
      evidence: factEvidence,
      status: "ready",
      artifact
    };
    return {
      execution: completeExecution(request.requestId, "dashboard", [base.resultId], factEvidence, provenance),
      results: [result],
      dataQuality: []
    };
  } catch (error) {
    const errorCode = error instanceof EvidenceRequestTimeout
      ? "timeout"
      : error instanceof ArtifactWriteFailure
      ? "artifact_failed"
      : error instanceof InvalidToolOutput
        ? "invalid_tool_output"
        : "provider_exception";
    const message = error instanceof EvidenceRequestTimeout
      ? error.message
      : error instanceof ArtifactWriteFailure
      ? error.message
      : error instanceof InvalidToolOutput
        ? error.message
        : "Dashboard evidence provider threw an exception.";
    const result: DashboardResult = {
      ...base,
      evidence: failureEvidence,
      status: "error",
      errorCode,
      message
    };
    return {
      execution: errorExecution(
        request.requestId,
        "dashboard",
        [base.resultId],
        failureEvidence,
        failureProvenance,
        errorCode,
        message,
        !(error instanceof InvalidToolOutput)
      ),
      results: [result],
      dataQuality: [dataQualityFor(request.requestId, "error", errorCode, message, failureEvidence)]
    };
  }
}

function terminalAt(event: FaultDetectionFact): string {
  return event.status === "active" ? event.observedThrough : event.endedAt;
}

function faultEventsFromFact(
  request: PlannedFaultRequest,
  definition: FaultEvidenceDefinition,
  fact: FaultToolFact,
  context: EvidenceToolContext
): FaultEvent[] {
  if (
    fact.projectId !== context.projectId
    || fact.equipmentId !== request.equipmentId
    || fact.equipmentType !== request.equipmentType
    || !samePeriod(fact.period, context.period)
    || !sameReference(fact.definition, request.definition)
    || !Array.isArray(fact.events)
  ) {
    throw new InvalidToolOutput("Fault project, equipment, period, or definition does not match the plan.");
  }
  const equipment = context.equipment.find((item) => item.equipmentId === request.equipmentId);
  if (!equipment) throw new InvalidToolOutput("Fault request equipment is missing from the plan.");
  const rulesByCode = new Map(definition.rules.map((rule) => [rule.faultCode, rule]));
  const ids = new Set<string>();
  const events = fact.events.map((event) => {
    const rule = rulesByCode.get(event.faultCode);
    if (!rule) throw new InvalidToolOutput(`Fault code ${event.faultCode} is not registered.`);
    if (!isRfc3339Instant(event.startedAt) || !isRfc3339Instant(terminalAt(event))) {
      throw new InvalidToolOutput("Fault timestamps must be RFC3339 instants.");
    }
    const startedAt = Date.parse(event.startedAt);
    const endedAt = Date.parse(terminalAt(event));
    const periodStart = Date.parse(context.period.startAt);
    const periodEnd = Date.parse(context.period.endAt);
    if (startedAt >= endedAt || startedAt >= periodEnd || endedAt <= periodStart || endedAt > periodEnd) {
      throw new InvalidToolOutput("Fault interval must overlap and end within the report period.");
    }
    const durationHours = (Math.min(endedAt, periodEnd) - Math.max(startedAt, periodStart)) / 3_600_000;
    const evidence = evidenceReferences(event.evidence);
    if (evidence.length === 0) {
      throw new InvalidToolOutput("Fault events require at least one typed evidence reference.");
    }
    const eventId = `fault_${canonicalReportHash({
      requestId: request.requestId,
      faultCode: event.faultCode,
      startedAt: event.startedAt,
      status: event.status,
      terminalAt: terminalAt(event)
    }).slice(7, 31)}`;
    if (ids.has(eventId)) throw new InvalidToolOutput("Fault provider returned duplicate events.");
    ids.add(eventId);
    const base = {
      eventId,
      equipment: structuredClone(equipment),
      faultCode: event.faultCode,
      severity: rule.severity,
      startedAt: event.startedAt,
      durationHours,
      detectorId: rule.detectorId,
      detectorVersion: rule.detectorVersion,
      evidence
    };
    return event.status === "active"
      ? { ...base, status: "active" as const, observedThrough: event.observedThrough }
      : { ...base, status: "resolved" as const, endedAt: event.endedAt };
  });
  return events.sort((left, right) => (
    Date.parse(left.startedAt) - Date.parse(right.startedAt)
    || compareText(left.faultCode, right.faultCode)
    || compareText(left.eventId, right.eventId)
  ));
}

async function runFault(
  request: PlannedFaultRequest,
  definition: FaultEvidenceDefinition,
  context: EvidenceToolContext,
  tools: ReportEvidenceTools
): Promise<RequestRun<FaultEvent>> {
  const baseProvenance = provenanceFor(tools.fault.descriptor, request.definition, context, request, []);
  let failureEvidence: EvidenceReference[] = [];
  let failureProvenance = baseProvenance;
  try {
    const frozenInput = deepFreeze({
      context: structuredClone(context),
      request: structuredClone(request),
      definition: structuredClone(definition)
    });
    const outcome = structuredClone(await withRequestTimeout(
      context.requestTimeoutMs,
      (signal) => tools.fault.execute(Object.freeze({ ...frozenInput, signal }))
    ));
    validateOutcomeEnvelope<FaultToolFact>(outcome);
    const evidence = outcomeEvidence(outcome);
    let provenance = provenanceFor(
      tools.fault.descriptor,
      request.definition,
      context,
      request,
      evidence.map((reference) => reference.evidenceId),
      outcome.sourceRevision
    );
    failureEvidence = evidence;
    failureProvenance = provenance;
    if (outcome.status === "no_data") {
      return {
        execution: noDataExecution(
          request.requestId,
          "fault",
          [],
          evidence,
          provenance,
          outcome.reasonCode,
          outcome.message
        ),
        results: [],
        dataQuality: [dataQualityFor(request.requestId, "no_data", outcome.reasonCode, outcome.message, evidence)]
      };
    }
    if (outcome.status === "error") {
      return {
        execution: errorExecution(
          request.requestId,
          "fault",
          [],
          evidence,
          provenance,
          outcome.errorCode,
          outcome.message,
          outcome.retryable
        ),
        results: [],
        dataQuality: [dataQualityFor(request.requestId, "error", outcome.errorCode, outcome.message, evidence)]
      };
    }
    if (evidence.length === 0) {
      throw new InvalidToolOutput("Completed fault scans require query or coverage evidence, including zero-fault scans.");
    }
    const events = faultEventsFromFact(request, definition, outcome.value, context);
    const sourceEvidence = mergeEvidenceReferences(
      evidence,
      ...events.map((event) => event.evidence)
    );
    provenance = provenanceFor(
      tools.fault.descriptor,
      request.definition,
      context,
      request,
      sourceEvidence.map((reference) => reference.evidenceId),
      outcome.sourceRevision
    );
    failureEvidence = sourceEvidence;
    failureProvenance = provenance;
    return {
      execution: completeExecution(
        request.requestId,
        "fault",
        events.map((event) => event.eventId),
        sourceEvidence,
        provenance
      ),
      results: events,
      dataQuality: []
    };
  } catch (error) {
    const errorCode = error instanceof EvidenceRequestTimeout
      ? "timeout"
      : error instanceof InvalidToolOutput
        ? "invalid_tool_output"
        : "provider_exception";
    const message = error instanceof EvidenceRequestTimeout
      ? error.message
      : error instanceof InvalidToolOutput
      ? error.message
      : "Fault evidence provider threw an exception.";
    return {
      execution: errorExecution(
        request.requestId,
        "fault",
        [],
        failureEvidence,
        failureProvenance,
        errorCode,
        message,
        !(error instanceof InvalidToolOutput)
      ),
      results: [],
      dataQuality: [dataQualityFor(request.requestId, "error", errorCode, message, failureEvidence)]
    };
  }
}

function chartResultBase(
  request: PlannedChartRequest,
  context: EvidenceToolContext,
  evidence: EvidenceReference[]
) {
  return {
    resultId: resultId("chart", request.requestId),
    chartKey: request.chartKey,
    title: request.chartKey,
    scope: structuredClone(request.scope),
    period: structuredClone(context.period),
    evidence
  };
}

async function runChart(
  request: PlannedChartRequest,
  definition: ChartEvidenceDefinition,
  context: EvidenceToolContext,
  tools: ReportEvidenceTools,
  executionsByRequestId: Map<string, EvidenceExecutionRecord>,
  metricResultsByRequestId: Map<string, MetricResult[]>,
  faultEventsByRequestId: Map<string, FaultEvent[]>
): Promise<RequestRun<ChartResult>> {
  const inputRequestIds = request.origin === "fault_summary"
    ? request.inputFaultRequestIds
    : request.inputMetricRequestIds;
  const inputExecutions = inputRequestIds.map((requestId) => executionsByRequestId.get(requestId)!);
  const metricResults = request.origin === "fault_summary"
    ? []
    : inputRequestIds.flatMap((requestId) => metricResultsByRequestId.get(requestId) ?? []);
  const faultEvents = request.origin === "fault_summary"
    ? inputRequestIds.flatMap((requestId) => faultEventsByRequestId.get(requestId) ?? [])
    : [];
  let upstreamEvidence: EvidenceReference[];
  try {
    upstreamEvidence = mergeEvidenceReferences(
      ...inputExecutions.map((execution) => execution.evidence),
      ...metricResults.map((result) => result.evidence),
      ...faultEvents.map((event) => event.evidence)
    );
  } catch (error) {
    const message = error instanceof InvalidToolOutput
      ? error.message
      : "Upstream chart evidence is invalid.";
    const provenance = provenanceFor(tools.chart.descriptor, request.definition, context, request, []);
    const result = {
      ...chartResultBase(request, context, []),
      status: "error" as const,
      errorCode: "invalid_tool_output",
      message
    };
    return {
      execution: errorExecution(
        request.requestId,
        "chart",
        [result.resultId],
        [],
        provenance,
        "invalid_tool_output",
        message,
        false
      ),
      results: [result],
      dataQuality: [dataQualityFor(request.requestId, "error", "invalid_tool_output", message, [])]
    };
  }
  const inputEvidenceIds = upstreamEvidence.map((evidence) => evidence.evidenceId);
  const baseProvenance = provenanceFor(
    tools.chart.descriptor,
    request.definition,
    context,
    request,
    inputEvidenceIds
  );
  let failureEvidence = upstreamEvidence;
  let failureProvenance = baseProvenance;
  const base = chartResultBase(request, context, upstreamEvidence);
  if (inputExecutions.some((execution) => execution.status === "error")) {
    const message = "A required upstream evidence request failed.";
    const result: ChartResult = { ...base, status: "error", errorCode: "upstream_error", message };
    return {
      execution: errorExecution(
        request.requestId,
        "chart",
        [base.resultId],
        upstreamEvidence,
        baseProvenance,
        "upstream_error",
        message,
        false
      ),
      results: [result],
      dataQuality: [dataQualityFor(request.requestId, "error", "upstream_error", message, upstreamEvidence)]
    };
  }
  const allInputsComplete = inputExecutions.every((execution) => execution.status === "complete");
  const hasUsableInput = allInputsComplete && (request.origin === "fault_summary"
    ? true
    : metricResults.length === inputRequestIds.length
      && metricResults.every((result) => result.status === "available"));
  if (!hasUsableInput) {
    const message = "All required upstream evidence requests returned no usable data.";
    const result: ChartResult = { ...base, status: "no_data", reason: message };
    return {
      execution: noDataExecution(
        request.requestId,
        "chart",
        [base.resultId],
        upstreamEvidence,
        baseProvenance,
        "upstream_no_data",
        message
      ),
      results: [result],
      dataQuality: [dataQualityFor(request.requestId, "no_data", "upstream_no_data", message, upstreamEvidence)]
    };
  }
  try {
    const frozenInput = deepFreeze({
      context: structuredClone(context),
      request: structuredClone(request),
      definition: structuredClone(definition),
      metricResults: structuredClone(metricResults),
      faultEvents: structuredClone(faultEvents),
      inputExecutions: structuredClone(inputExecutions)
    });
    const outcome = structuredClone(await withRequestTimeout(
      context.requestTimeoutMs,
      (signal) => tools.chart.execute(Object.freeze({ ...frozenInput, signal }))
    ));
    validateOutcomeEnvelope<ChartToolFact>(outcome);
    const evidence = mergeEvidenceReferences(upstreamEvidence, outcomeEvidence(outcome));
    let provenance = provenanceFor(
      tools.chart.descriptor,
      request.definition,
      context,
      request,
      [...new Set([...inputEvidenceIds, ...evidence.map((reference) => reference.evidenceId)])].sort(),
      outcome.sourceRevision
    );
    failureEvidence = evidence;
    failureProvenance = provenance;
    if (outcome.status === "no_data") {
      const result: ChartResult = { ...base, evidence, status: "no_data", reason: outcome.message };
      return {
        execution: noDataExecution(
          request.requestId,
          "chart",
          [base.resultId],
          evidence,
          provenance,
          outcome.reasonCode,
          outcome.message
        ),
        results: [result],
        dataQuality: [dataQualityFor(request.requestId, "no_data", outcome.reasonCode, outcome.message, evidence)]
      };
    }
    if (outcome.status === "error") {
      const result: ChartResult = {
        ...base,
        evidence,
        status: "error",
        errorCode: outcome.errorCode,
        message: outcome.message
      };
      return {
        execution: errorExecution(
          request.requestId,
          "chart",
          [base.resultId],
          evidence,
          provenance,
          outcome.errorCode,
          outcome.message,
          outcome.retryable
        ),
        results: [result],
        dataQuality: [dataQualityFor(request.requestId, "error", outcome.errorCode, outcome.message, evidence)]
      };
    }
    const fact = outcome.value;
    if (
      fact.projectId !== context.projectId
      || fact.chartKey !== request.chartKey
      || !sameScope(fact.scope, request.scope)
      || !samePeriod(fact.period, context.period)
      || !sameReference(fact.definition, request.definition)
      || !nonEmpty(fact.title)
    ) {
      throw new InvalidToolOutput("Chart project, key, scope, period, definition, or title does not match the plan.");
    }
    const factEvidence = mergeEvidenceReferences(upstreamEvidence, evidence, evidenceReferences(fact.evidence));
    if (factEvidence.length === 0) {
      throw new InvalidToolOutput("Ready charts require at least one typed evidence reference.");
    }
    provenance = provenanceFor(
      tools.chart.descriptor,
      request.definition,
      context,
      request,
      factEvidence.map((reference) => reference.evidenceId),
      outcome.sourceRevision
    );
    failureEvidence = factEvidence;
    failureProvenance = provenance;
    const artifact = await materializeArtifact(request.requestId, fact.artifact, context, tools);
    const result: ChartResult = {
      ...base,
      title: fact.title,
      evidence: factEvidence,
      status: "ready",
      artifact
    };
    return {
      execution: completeExecution(request.requestId, "chart", [base.resultId], factEvidence, provenance),
      results: [result],
      dataQuality: []
    };
  } catch (error) {
    const errorCode = error instanceof EvidenceRequestTimeout
      ? "timeout"
      : error instanceof ArtifactWriteFailure
      ? "artifact_failed"
      : error instanceof InvalidToolOutput
        ? "invalid_tool_output"
        : "provider_exception";
    const message = error instanceof EvidenceRequestTimeout
      ? error.message
      : error instanceof ArtifactWriteFailure
      ? error.message
      : error instanceof InvalidToolOutput
        ? error.message
        : "Chart evidence provider threw an exception.";
    const result: ChartResult = {
      ...base,
      evidence: failureEvidence,
      status: "error",
      errorCode,
      message
    };
    return {
      execution: errorExecution(
        request.requestId,
        "chart",
        [base.resultId],
        failureEvidence,
        failureProvenance,
        errorCode,
        message,
        !(error instanceof InvalidToolOutput)
      ),
      results: [result],
      dataQuality: [dataQualityFor(request.requestId, "error", errorCode, message, failureEvidence)]
    };
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function executionOrder(plan: ReportPlan): string[] {
  return [
    ...plan.evidence.metrics,
    ...plan.evidence.charts,
    ...plan.evidence.dashboards,
    ...plan.evidence.faults
  ].map((request) => request.requestId);
}

type EvidencePackageCollections = Pick<
  EvidencePackage,
  | "executions"
  | "metricResults"
  | "chartResults"
  | "dashboardResults"
  | "faultEvents"
  | "dataQuality"
>;

function packageEvidenceIntegrityIssues(value: EvidencePackageCollections): ReportValidationIssue[] {
  const issues: ReportValidationIssue[] = [];
  const canonicalReferenceById = new Map<string, string>();
  const executionByRequestId = new Map<string, EvidenceExecutionRecord>();
  const executionByResultId = new Map<string, EvidenceExecutionRecord>();
  const resultKinds = new Map<string, EvidenceExecutionRecord["requestKind"]>();
  const registeredResultIds = new Set<string>();

  const registerReferences = (references: EvidenceReference[], path: string): void => {
    let validatedReferences: EvidenceReference[];
    try {
      validatedReferences = evidenceReferences(references);
    } catch (error) {
      issues.push(issue(
        path,
        "invalid_evidence_reference",
        error instanceof InvalidToolOutput ? error.message : "Evidence references are invalid."
      ));
      return;
    }
    for (const [index, reference] of validatedReferences.entries()) {
      const canonical = JSON.stringify(canonicalize(reference));
      const existing = canonicalReferenceById.get(reference.evidenceId);
      if (existing !== undefined && existing !== canonical) {
        issues.push(issue(
          `${path}[${index}]`,
          "conflicting_evidence_reference",
          `Evidence ${reference.evidenceId} has conflicting definitions in the package.`
        ));
      } else {
        canonicalReferenceById.set(reference.evidenceId, canonical);
      }
    }
  };

  for (const [index, execution] of value.executions.entries()) {
    if (executionByRequestId.has(execution.requestId)) {
      issues.push(issue(
        `executions[${index}].requestId`,
        "duplicate_execution",
        `Request ${execution.requestId} has more than one execution record.`
      ));
    } else {
      executionByRequestId.set(execution.requestId, execution);
    }
    registerReferences(execution.evidence, `executions[${index}].evidence`);
    const evidenceIds = new Set(execution.evidence.map((reference) => reference.evidenceId));
    for (const evidenceId of execution.provenance.inputEvidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        issues.push(issue(
          `executions[${index}].provenance.inputEvidenceIds`,
          "unresolved_evidence_reference",
          `Provenance evidence ${evidenceId} is not retained by its execution record.`
        ));
      }
    }
    if (execution.requestKind !== "fault" && execution.resultIds.length !== 1) {
      issues.push(issue(
        `executions[${index}].resultIds`,
        "invalid_result_cardinality",
        "Metric, chart, and dashboard requests must each own exactly one result."
      ));
    }
    if (execution.requestKind === "fault" && execution.status !== "complete" && execution.resultIds.length !== 0) {
      issues.push(issue(
        `executions[${index}].resultIds`,
        "invalid_result_cardinality",
        "Fault no-data and error executions cannot own fault events."
      ));
    }
    if (new Set(execution.resultIds).size !== execution.resultIds.length) {
      issues.push(issue(
        `executions[${index}].resultIds`,
        "duplicate_result_reference",
        "An execution record cannot reference the same result more than once."
      ));
    }
    for (const resultId of execution.resultIds) {
      if (executionByResultId.has(resultId)) {
        issues.push(issue(
          `executions[${index}].resultIds`,
          "duplicate_result_owner",
          `Result ${resultId} is owned by more than one request.`
        ));
      } else {
        executionByResultId.set(resultId, execution);
      }
    }
  }

  const registerResult = (
    result: MetricResult | ChartResult | DashboardResult,
    expectedKind: "metric" | "chart" | "dashboard",
    path: string
  ): void => {
    registerReferences(result.evidence, `${path}.evidence`);
    if (registeredResultIds.has(result.resultId)) {
      issues.push(issue(path, "duplicate_result", `Result ${result.resultId} is duplicated in the package.`));
    } else {
      registeredResultIds.add(result.resultId);
    }
    const owner = executionByResultId.get(result.resultId);
    if (!owner || owner.requestKind !== expectedKind) {
      issues.push(issue(path, "orphan_result", `Result ${result.resultId} has no matching ${expectedKind} execution.`));
      return;
    }
    resultKinds.set(result.resultId, expectedKind);
    const ownerEvidenceIds = new Set(owner.evidence.map((reference) => reference.evidenceId));
    if (result.evidence.some((reference) => !ownerEvidenceIds.has(reference.evidenceId))) {
      issues.push(issue(`${path}.evidence`, "unresolved_evidence_reference", "Result evidence is absent from its execution record."));
    }
  };
  value.metricResults.forEach((result, index) => registerResult(result, "metric", `metricResults[${index}]`));
  value.chartResults.forEach((result, index) => registerResult(result, "chart", `chartResults[${index}]`));
  value.dashboardResults.forEach((result, index) => registerResult(result, "dashboard", `dashboardResults[${index}]`));
  for (const [index, event] of value.faultEvents.entries()) {
    registerReferences(event.evidence, `faultEvents[${index}].evidence`);
    if (registeredResultIds.has(event.eventId)) {
      issues.push(issue(
        `faultEvents[${index}]`,
        "duplicate_result",
        `Fault event ${event.eventId} is duplicated in the package.`
      ));
    } else {
      registeredResultIds.add(event.eventId);
    }
    const owner = executionByResultId.get(event.eventId);
    if (!owner || owner.requestKind !== "fault") {
      issues.push(issue(`faultEvents[${index}]`, "orphan_result", `Fault event ${event.eventId} has no matching execution.`));
      continue;
    }
    resultKinds.set(event.eventId, "fault");
    const ownerEvidenceIds = new Set(owner.evidence.map((reference) => reference.evidenceId));
    if (event.evidence.some((reference) => !ownerEvidenceIds.has(reference.evidenceId))) {
      issues.push(issue(
        `faultEvents[${index}].evidence`,
        "unresolved_evidence_reference",
        "Fault evidence is absent from its execution record."
      ));
    }
  }
  for (const [index, quality] of value.dataQuality.entries()) {
    registerReferences(quality.evidence, `dataQuality[${index}].evidence`);
    if (quality.requestId) {
      const owner = executionByRequestId.get(quality.requestId);
      const ownerEvidenceIds = new Set(owner?.evidence.map((reference) => reference.evidenceId) ?? []);
      if (!owner || quality.evidence.some((reference) => !ownerEvidenceIds.has(reference.evidenceId))) {
        issues.push(issue(
          `dataQuality[${index}].evidence`,
          "unresolved_evidence_reference",
          "Data quality evidence is absent from its execution record."
        ));
      }
    }
  }
  for (const [resultId, execution] of executionByResultId) {
    if (resultKinds.get(resultId) !== execution.requestKind) {
      issues.push(issue(
        `executions.${execution.requestId}.resultIds`,
        "orphan_result_reference",
        `Execution result ${resultId} is absent from the matching result collection.`
      ));
    }
  }
  return issues;
}

type ExpectedEvidenceRequest =
  | { kind: "metric"; request: PlannedMetricRequest }
  | { kind: "chart"; request: PlannedChartRequest }
  | { kind: "dashboard"; request: PlannedDashboardRequest }
  | { kind: "fault"; request: PlannedFaultRequest };

function canonicalEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function evidencePackageRevision(evidencePackage: Readonly<EvidencePackage>): string {
  const { revisionHash: _revisionHash, ...withoutRevision } = evidencePackage;
  return canonicalReportHash({
    ...withoutRevision,
    packageId: undefined,
    generatedAt: undefined
  });
}

function expectedEvidenceRequests(plan: Readonly<ReportPlan>): ExpectedEvidenceRequest[] {
  return [
    ...plan.evidence.metrics.map((request) => ({ kind: "metric" as const, request })),
    ...plan.evidence.charts.map((request) => ({ kind: "chart" as const, request })),
    ...plan.evidence.dashboards.map((request) => ({ kind: "dashboard" as const, request })),
    ...plan.evidence.faults.map((request) => ({ kind: "fault" as const, request }))
  ];
}

function resultStatusMatchesExecution(
  resultStatus: MetricResult["status"] | ChartResult["status"] | DashboardResult["status"],
  executionStatus: EvidenceExecutionRecord["status"]
): boolean {
  const expectedExecutionStatus = resultStatus === "available" || resultStatus === "ready"
    ? "complete"
    : resultStatus;
  return expectedExecutionStatus === executionStatus;
}

/**
 * Validate that an evidence package is the complete, internally linked output for a report plan.
 * This trust-boundary check performs no tool calls and does not mutate either input.
 */
export function validateEvidencePackageForPlan(
  plan: Readonly<ReportPlan>,
  evidencePackage: Readonly<EvidencePackage>
): ReportValidationResult<EvidencePackage> {
  const issues: ReportValidationIssue[] = [];
  if (plan.schemaVersion !== REPORT_PLAN_SCHEMA_VERSION) {
    issues.push(issue(
      "plan.schemaVersion",
      "unsupported_schema",
      `Report plan schema ${REPORT_PLAN_SCHEMA_VERSION} is required.`
    ));
  }
  if (evidencePackage.schemaVersion !== EVIDENCE_PACKAGE_SCHEMA_VERSION) {
    issues.push(issue(
      "evidencePackage.schemaVersion",
      "unsupported_schema",
      `Evidence package schema ${EVIDENCE_PACKAGE_SCHEMA_VERSION} is required.`
    ));
  }
  if (!nonEmpty(evidencePackage.packageId)) {
    issues.push(issue("evidencePackage.packageId", "required", "Evidence package ID is required."));
  }
  if (!isRfc3339Instant(evidencePackage.generatedAt)) {
    issues.push(issue(
      "evidencePackage.generatedAt",
      "invalid_datetime",
      "Evidence package generatedAt must be an RFC3339 instant."
    ));
  }
  if (evidencePackage.planId !== plan.planId) {
    issues.push(issue("evidencePackage.planId", "plan_mismatch", "Evidence package plan ID does not match the plan."));
  }
  const expectedPlanRevision = canonicalReportHash(plan);
  if (evidencePackage.planRevision !== expectedPlanRevision) {
    issues.push(issue(
      "evidencePackage.planRevision",
      "plan_revision_mismatch",
      "Evidence package plan revision does not match the supplied plan."
    ));
  }
  if (evidencePackage.projectId !== plan.projectId) {
    issues.push(issue(
      "evidencePackage.projectId",
      "project_mismatch",
      "Evidence package project does not match the plan."
    ));
  }
  if (evidencePackage.assetRevision !== plan.assetRevision) {
    issues.push(issue(
      "evidencePackage.assetRevision",
      "asset_revision_mismatch",
      "Evidence package asset revision does not match the plan."
    ));
  }
  if (!samePeriod(evidencePackage.period, plan.period)) {
    issues.push(issue(
      "evidencePackage.period",
      "period_mismatch",
      "Evidence package period does not match the plan."
    ));
  }
  if (!canonicalEqual(evidencePackage.equipment, plan.equipment)) {
    issues.push(issue(
      "evidencePackage.equipment",
      "equipment_mismatch",
      "Evidence package equipment identities do not match the plan exactly."
    ));
  }
  if (evidencePackage.revisionHash !== evidencePackageRevision(evidencePackage)) {
    issues.push(issue(
      "evidencePackage.revisionHash",
      "revision_hash_mismatch",
      "Evidence package revision hash is invalid."
    ));
  }

  const expectedRequests = expectedEvidenceRequests(plan);
  const expectedById = new Map<string, ExpectedEvidenceRequest>();
  for (const expected of expectedRequests) {
    if (expectedById.has(expected.request.requestId)) {
      issues.push(issue(
        "plan.evidence",
        "duplicate_request",
        `Plan evidence request ${expected.request.requestId} is duplicated.`
      ));
    } else {
      expectedById.set(expected.request.requestId, expected);
    }
  }
  const executionCounts = new Map<string, number>();
  const executionByResultId = new Map<string, EvidenceExecutionRecord>();
  const plannedExecutionOrder = expectedRequests.map((expected) => expected.request.requestId);
  if (!canonicalEqual(
    evidencePackage.executions.map((execution) => execution.requestId),
    plannedExecutionOrder
  )) {
    issues.push(issue(
      "evidencePackage.executions",
      "execution_order_mismatch",
      "Evidence executions must follow the deterministic plan request order."
    ));
  }
  for (const [index, execution] of evidencePackage.executions.entries()) {
    executionCounts.set(execution.requestId, (executionCounts.get(execution.requestId) ?? 0) + 1);
    const expected = expectedById.get(execution.requestId);
    if (!expected) {
      issues.push(issue(
        `evidencePackage.executions[${index}].requestId`,
        "unknown_execution",
        `Execution ${execution.requestId} is not planned.`
      ));
    } else {
      if (execution.requestKind !== expected.kind) {
        issues.push(issue(
          `evidencePackage.executions[${index}].requestKind`,
          "request_kind_mismatch",
          `Execution ${execution.requestId} has the wrong request kind.`
        ));
      }
      if (!sameReference(execution.provenance.definition, expected.request.definition)) {
        issues.push(issue(
          `evidencePackage.executions[${index}].provenance.definition`,
          "definition_mismatch",
          `Execution ${execution.requestId} does not use the definition pinned by the plan.`
        ));
      }
      const canonicalInputEvidenceIds = [...new Set(execution.provenance.inputEvidenceIds)].sort(compareText);
      if (!canonicalEqual(execution.provenance.inputEvidenceIds, canonicalInputEvidenceIds)) {
        issues.push(issue(
          `evidencePackage.executions[${index}].provenance.inputEvidenceIds`,
          "noncanonical_evidence_references",
          "Execution provenance evidence IDs must be unique and canonically ordered."
        ));
      }
      const expectedQueryHash = canonicalReportHash({
        planId: plan.planId,
        projectId: plan.projectId,
        assetRevision: plan.assetRevision,
        period: plan.period,
        request: expected.request,
        definition: expected.request.definition,
        inputEvidenceIds: execution.provenance.inputEvidenceIds
      });
      if (execution.provenance.queryHash !== expectedQueryHash) {
        issues.push(issue(
          `evidencePackage.executions[${index}].provenance.queryHash`,
          "query_hash_mismatch",
          `Execution ${execution.requestId} query hash does not match its canonical plan input.`
        ));
      }
    }
    if (
      !EVIDENCE_PRODUCER_KINDS.includes(execution.provenance.producerKind)
      || !nonEmpty(execution.provenance.producerId)
      || !nonEmpty(execution.provenance.producerVersion)
      || (
        execution.provenance.sourceRevision !== undefined
        && !nonEmpty(execution.provenance.sourceRevision)
      )
    ) {
      issues.push(issue(
        `evidencePackage.executions[${index}].provenance`,
        "invalid_provenance",
        `Execution ${execution.requestId} has invalid producer provenance.`
      ));
    }
    for (const resultId of execution.resultIds) {
      if (!executionByResultId.has(resultId)) executionByResultId.set(resultId, execution);
    }
  }
  for (const expected of expectedRequests) {
    const count = executionCounts.get(expected.request.requestId) ?? 0;
    if (count === 0) {
      issues.push(issue(
        "evidencePackage.executions",
        "missing_execution",
        `Planned request ${expected.request.requestId} has no execution record.`
      ));
    } else if (count > 1) {
      issues.push(issue(
        "evidencePackage.executions",
        "duplicate_execution",
        `Planned request ${expected.request.requestId} has ${count} execution records.`
      ));
    }
  }

  for (const [index, result] of evidencePackage.metricResults.entries()) {
    const owner = executionByResultId.get(result.resultId);
    const expected = owner ? expectedById.get(owner.requestId) : undefined;
    if (
      expected?.kind === "metric"
      && (
        result.metricKey !== expected.request.metricKey
        || !sameScope(result.scope, expected.request.scope)
        || !samePeriod(result.period, plan.period)
      )
    ) {
      issues.push(issue(
        `evidencePackage.metricResults[${index}]`,
        "result_plan_mismatch",
        `Metric result ${result.resultId} does not match its planned request.`
      ));
    }
    if (owner && !resultStatusMatchesExecution(result.status, owner.status)) {
      issues.push(issue(
        `evidencePackage.metricResults[${index}].status`,
        "result_status_mismatch",
        `Metric result ${result.resultId} status does not match its execution.`
      ));
    }
  }
  for (const [index, result] of evidencePackage.chartResults.entries()) {
    const owner = executionByResultId.get(result.resultId);
    const expected = owner ? expectedById.get(owner.requestId) : undefined;
    if (
      expected?.kind === "chart"
      && (
        result.chartKey !== expected.request.chartKey
        || !sameScope(result.scope, expected.request.scope)
        || !samePeriod(result.period, plan.period)
      )
    ) {
      issues.push(issue(
        `evidencePackage.chartResults[${index}]`,
        "result_plan_mismatch",
        `Chart result ${result.resultId} does not match its planned request.`
      ));
    }
    if (owner && !resultStatusMatchesExecution(result.status, owner.status)) {
      issues.push(issue(
        `evidencePackage.chartResults[${index}].status`,
        "result_status_mismatch",
        `Chart result ${result.resultId} status does not match its execution.`
      ));
    }
  }
  for (const [index, result] of evidencePackage.dashboardResults.entries()) {
    const owner = executionByResultId.get(result.resultId);
    const expected = owner ? expectedById.get(owner.requestId) : undefined;
    if (
      expected?.kind === "dashboard"
      && (
        result.dashboardId !== expected.request.dashboardId
        || result.dashboardRevision !== expected.request.dashboardRevision
        || !samePeriod(result.period, plan.period)
      )
    ) {
      issues.push(issue(
        `evidencePackage.dashboardResults[${index}]`,
        "result_plan_mismatch",
        `Dashboard result ${result.resultId} does not match its planned request.`
      ));
    }
    if (owner && !resultStatusMatchesExecution(result.status, owner.status)) {
      issues.push(issue(
        `evidencePackage.dashboardResults[${index}].status`,
        "result_status_mismatch",
        `Dashboard result ${result.resultId} status does not match its execution.`
      ));
    }
  }
  for (const [index, event] of evidencePackage.faultEvents.entries()) {
    const owner = executionByResultId.get(event.eventId);
    const expected = owner ? expectedById.get(owner.requestId) : undefined;
    if (expected?.kind === "fault") {
      const plannedEquipment = plan.equipment.find((equipment) => equipment.equipmentId === expected.request.equipmentId);
      if (
        event.equipment.equipmentId !== expected.request.equipmentId
        || event.equipment.equipmentType !== expected.request.equipmentType
        || !plannedEquipment
        || !canonicalEqual(event.equipment, plannedEquipment)
      ) {
        issues.push(issue(
          `evidencePackage.faultEvents[${index}].equipment`,
          "result_plan_mismatch",
          `Fault event ${event.eventId} equipment does not match its planned request.`
        ));
      }
    }
    if (owner && owner.status !== "complete") {
      issues.push(issue(
        `evidencePackage.faultEvents[${index}]`,
        "result_status_mismatch",
        `Fault event ${event.eventId} belongs to a non-complete execution.`
      ));
    }
  }

  const resultOrderChecks: Array<{
    kind: EvidenceExecutionRecord["requestKind"];
    path: string;
    actualIds: string[];
  }> = [
    { kind: "metric", path: "evidencePackage.metricResults", actualIds: evidencePackage.metricResults.map((item) => item.resultId) },
    { kind: "chart", path: "evidencePackage.chartResults", actualIds: evidencePackage.chartResults.map((item) => item.resultId) },
    { kind: "dashboard", path: "evidencePackage.dashboardResults", actualIds: evidencePackage.dashboardResults.map((item) => item.resultId) },
    { kind: "fault", path: "evidencePackage.faultEvents", actualIds: evidencePackage.faultEvents.map((item) => item.eventId) }
  ];
  for (const check of resultOrderChecks) {
    const expectedIds = evidencePackage.executions
      .filter((execution) => execution.requestKind === check.kind)
      .flatMap((execution) => execution.resultIds);
    if (!canonicalEqual(check.actualIds, expectedIds)) {
      issues.push(issue(
        check.path,
        "result_order_mismatch",
        `${check.kind} results must follow their deterministic execution ownership order.`
      ));
    }
  }

  issues.push(...packageEvidenceIntegrityIssues(evidencePackage as EvidencePackage));
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: structuredClone(evidencePackage) as EvidencePackage };
}

function createConcurrencyLimiter(maxConcurrency: number) {
  let active = 0;
  const waiters: Array<() => void> = [];
  const acquire = async (): Promise<void> => {
    if (active < maxConcurrency) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve) => waiters.push(resolve));
    active += 1;
  };
  const release = (): void => {
    active -= 1;
    waiters.shift()?.();
  };
  return async <T>(operation: () => Promise<T>): Promise<T> => {
    await acquire();
    try {
      return await operation();
    } finally {
      release();
    }
  };
}

export async function executeReportEvidence(
  input: ExecuteReportEvidenceInput,
  dependencies: ExecuteReportEvidenceDependencies
): Promise<ReportValidationResult<import("./contracts.js").EvidencePackage>> {
  const issues = validateExecutionInput(input, dependencies);
  if (issues.length > 0) return { ok: false, issues };

  const plan = structuredClone(input.plan) as ReportPlan;
  const definitions = structuredClone(dependencies.definitions);
  const planRevision = canonicalReportHash(plan);
  const context: EvidenceToolContext = deepFreeze({
    packageId: input.packageId.trim(),
    planId: plan.planId,
    planRevision,
    projectId: plan.projectId,
    assetRevision: plan.assetRevision,
    period: structuredClone(plan.period),
    equipment: structuredClone(plan.equipment),
    requestTimeoutMs: dependencies.requestTimeoutMs ?? 30_000
  });
  const metricDefinitions = new Map(definitions.metrics.map((definition) => [referenceKey(definition), definition]));
  const chartDefinitions = new Map(definitions.charts.map((definition) => [referenceKey(definition), definition]));
  const faultDefinitions = new Map(definitions.faults.map((definition) => [referenceKey(definition), definition]));
  const withConcurrency = createConcurrencyLimiter(dependencies.maxConcurrency ?? 8);

  const [metricRuns, dashboardRuns, faultRuns] = await Promise.all([
    Promise.all(plan.evidence.metrics.map((request) => withConcurrency(() => runMetric(
      request,
      metricDefinitions.get(referenceKey(request.definition))!,
      context,
      dependencies.tools.metrics[
        metricDefinitions.get(referenceKey(request.definition))!.producerKind
      ]!
    )))),
    Promise.all(plan.evidence.dashboards.map((request) => withConcurrency(() => (
      runDashboard(request, context, dependencies.tools)
    )))),
    Promise.all(plan.evidence.faults.map((request) => withConcurrency(() => runFault(
      request,
      faultDefinitions.get(referenceKey(request.definition))!,
      context,
      dependencies.tools
    ))))
  ]);

  const executionsByRequestId = new Map<string, EvidenceExecutionRecord>();
  const metricResultsByRequestId = new Map<string, MetricResult[]>();
  const faultEventsByRequestId = new Map<string, FaultEvent[]>();
  for (const [index, run] of metricRuns.entries()) {
    const requestId = plan.evidence.metrics[index]!.requestId;
    executionsByRequestId.set(requestId, run.execution);
    metricResultsByRequestId.set(requestId, run.results);
  }
  for (const [index, run] of dashboardRuns.entries()) {
    executionsByRequestId.set(plan.evidence.dashboards[index]!.requestId, run.execution);
  }
  for (const [index, run] of faultRuns.entries()) {
    const requestId = plan.evidence.faults[index]!.requestId;
    executionsByRequestId.set(requestId, run.execution);
    faultEventsByRequestId.set(requestId, run.results);
  }

  const chartRuns = await Promise.all(plan.evidence.charts.map((request) => withConcurrency(() => runChart(
    request,
    chartDefinitions.get(referenceKey(request.definition))!,
    context,
    dependencies.tools,
    executionsByRequestId,
    metricResultsByRequestId,
    faultEventsByRequestId
  ))));
  for (const [index, run] of chartRuns.entries()) {
    executionsByRequestId.set(plan.evidence.charts[index]!.requestId, run.execution);
  }

  const packageWithoutRevision = {
    schemaVersion: EVIDENCE_PACKAGE_SCHEMA_VERSION,
    packageId: input.packageId.trim(),
    planId: plan.planId,
    planRevision,
    projectId: plan.projectId,
    assetRevision: plan.assetRevision,
    equipment: structuredClone(plan.equipment),
    period: structuredClone(plan.period),
    generatedAt: input.generatedAt,
    executions: executionOrder(plan).map((requestId) => structuredClone(executionsByRequestId.get(requestId)!)),
    metricResults: metricRuns.flatMap((run) => structuredClone(run.results)),
    chartResults: chartRuns.flatMap((run) => structuredClone(run.results)),
    dashboardResults: dashboardRuns.flatMap((run) => structuredClone(run.results)),
    faultEvents: faultRuns.flatMap((run) => structuredClone(run.results)),
    dataQuality: [
      ...metricRuns,
      ...chartRuns,
      ...dashboardRuns,
      ...faultRuns
    ].flatMap((run) => structuredClone(run.dataQuality))
  };
  const revisionPayload = {
    ...packageWithoutRevision,
    packageId: undefined,
    generatedAt: undefined
  };
  const evidencePackage = {
    ...packageWithoutRevision,
    revisionHash: canonicalReportHash(revisionPayload)
  };
  return validateEvidencePackageForPlan(plan, evidencePackage);
}
