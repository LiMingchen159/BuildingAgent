export const REPORT_SPEC_SCHEMA_VERSION = 1 as const;
export const REPORT_PLAN_SCHEMA_VERSION = 2 as const;
export const EVIDENCE_PACKAGE_SCHEMA_VERSION = 2 as const;

export const REPORT_WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
] as const;

export type ReportWeekday = (typeof REPORT_WEEKDAYS)[number];

export const REPORT_SECTION_KEYS = [
  "executive_summary",
  "key_findings",
  "system_performance",
  "selected_dashboards",
  "fault_summary",
  "equipment_analysis",
  "recommended_actions",
  "appendix"
] as const;

export type ReportSectionKey = (typeof REPORT_SECTION_KEYS)[number];

export const DEFAULT_REPORT_SECTION_ORDER: readonly ReportSectionKey[] = REPORT_SECTION_KEYS;

export type RelativeReportWindow = "previous_complete" | "current_to_date";

export type ReportPeriodSpec =
  | {
      kind: "weekly";
      window: RelativeReportWindow;
      weekStartsOn: ReportWeekday;
    }
  | {
      kind: "monthly";
      window: RelativeReportWindow;
    }
  | {
      kind: "custom";
      startAt: string;
      endAt: string;
    };

export type ReportSchedule =
  | { enabled: false }
  | {
      enabled: true;
      frequency: "weekly";
      weekday: ReportWeekday;
      time: string;
    }
  | {
      enabled: true;
      frequency: "monthly";
      dayOfMonth: number | "last";
      time: string;
      shortMonthPolicy: "last_day" | "skip";
    };

export interface ReportSectionSelection {
  section: ReportSectionKey;
  enabled: boolean;
}

export interface ReportSectionConfig {
  /** A single ordered source of truth for enabled and disabled report sections. */
  ordered: ReportSectionSelection[];
}

export type EquipmentSelection =
  | {
      mode: "all";
      /** Empty means all discovered equipment types. */
      equipmentTypes: string[];
    }
  | {
      mode: "selected";
      /** Stable project/semantic keys; UI labels must use EquipmentIdentity.shortIdentifier. */
      equipmentIds: string[];
    };

export interface ReportSpec {
  schemaVersion: typeof REPORT_SPEC_SCHEMA_VERSION;
  specId: string;
  projectId: string;
  title: string;
  timeZone: string;
  period: ReportPeriodSpec;
  schedule: ReportSchedule;
  sections: ReportSectionConfig;
  kpiKeys: string[];
  dashboardIds: string[];
  equipment: EquipmentSelection;
}

export type EquipmentNameSource =
  | "semantic_model"
  | "project_metadata"
  | "bms_metadata"
  | "deterministic_fallback";

export type ReportAssetSourceKind = Exclude<EquipmentNameSource, "deterministic_fallback">;

export interface EquipmentIdentity {
  /** Stable project/semantic key used to join KPI, plot, and FDD results. */
  equipmentId: string;
  /** Human-facing short code retained separately from the stable project key. */
  shortIdentifier: string;
  equipmentType: string;
  fullName: string;
  /** Always derived by code from shortIdentifier and fullName. */
  displayName: string;
  /** LLM is intentionally not an accepted source kind. */
  nameSource: EquipmentNameSource;
  /** Project metadata key, semantic URI, BMS inventory key, or deterministic fallback recipe. */
  nameSourceRef: string;
}

export interface ReportAssetSourceReference {
  sourceKind: ReportAssetSourceKind;
  sourceId: string;
  sourceRevision: string;
}

export interface ReportEquipmentSourceReference {
  sourceKind: ReportAssetSourceKind;
  sourceId: string;
  sourceRef: string;
  sourceTypes: string[];
  shortIdentifier?: string;
  fullName?: string;
}

export interface ReportEquipmentAssetProvenance {
  equipmentId: string;
  /** Canonical identity chosen by the deterministic resolver for planner consistency checks. */
  resolvedIdentity: EquipmentIdentity;
  profileId: string;
  profileVersion: number;
  classificationRuleRefs: string[];
  sources: ReportEquipmentSourceReference[];
}

/** Reproducible source/rule manifest retained with every planned report. */
export interface ReportAssetProvenance {
  resolverVersion: number;
  sources: ReportAssetSourceReference[];
  equipment: ReportEquipmentAssetProvenance[];
}

interface EquipmentIdentityInputBase {
  equipmentId: string;
  /** Defaults to equipmentId when the source has no separate human-facing code. */
  shortIdentifier?: string;
  equipmentType: string;
}

export type EquipmentIdentityInput =
  | (EquipmentIdentityInputBase & {
      nameSource: Exclude<EquipmentNameSource, "deterministic_fallback">;
      fullName: string;
      nameSourceRef: string;
    })
  | (EquipmentIdentityInputBase & {
      nameSource: "deterministic_fallback";
    });

export interface EquipmentProfileAnalysis {
  performance: boolean;
  faultDiagnosis: boolean;
}

export interface EquipmentProfile {
  profileId: string;
  version: number;
  equipmentType: string;
  groupTitle: string;
  fleetMetricKeys: string[];
  fleetChartKeys: string[];
  metricKeys: string[];
  chartKeys: string[];
  analysis: EquipmentProfileAnalysis;
  order: number;
}

/** Deterministic presentation metadata resolved from the KPI/plot registry. */
export interface ResolvedSystemChartConfig {
  chartKey: string;
  metricKeys: string[];
}

/** A resolved half-open reporting interval: [startAt, endAt). */
export interface ResolvedReportPeriod {
  startAt: string;
  endAt: string;
  timeZone: string;
}

export type ReportScope =
  | { kind: "system" }
  | { kind: "fleet"; equipmentType: string }
  | { kind: "equipment"; equipmentId: string; equipmentType: string };

export type EvidenceSourceKind =
  | "bms"
  | "derived_metric"
  | "calculation"
  | "plot_tool"
  | "dashboard"
  | "fdd_rule"
  | "semantic_model"
  | "project_metadata";

export interface EvidenceReference {
  evidenceId: string;
  sourceKind: EvidenceSourceKind;
  sourceId: string;
  label?: string;
  observedAt?: string;
  checksum?: string;
  metadata?: Record<string, unknown>;
}

export type MetricAggregation =
  | "average"
  | "minimum"
  | "maximum"
  | "sum"
  | "count"
  | "duration"
  | "latest"
  | "custom";

interface MetricResultBase {
  resultId: string;
  metricKey: string;
  label: string;
  unit: string;
  scope: ReportScope;
  period: ResolvedReportPeriod;
  evidence: EvidenceReference[];
}

export interface MetricAvailableResult extends MetricResultBase {
  status: "available";
  value: number;
  aggregation: MetricAggregation;
  sampleCount: number;
  coverage: number;
}

export interface MetricNoDataResult extends MetricResultBase {
  status: "no_data";
  reason: string;
}

export interface MetricErrorResult extends MetricResultBase {
  status: "error";
  errorCode: string;
  message: string;
}

export type MetricResult = MetricAvailableResult | MetricNoDataResult | MetricErrorResult;

export interface ReportArtifact {
  artifactId: string;
  /** Relative to the report run output directory; never an absolute path. */
  relativePath: string;
  mediaType: "image/png" | "image/svg+xml" | "application/pdf";
  checksum: string;
}

interface ChartResultBase {
  resultId: string;
  chartKey: string;
  title: string;
  scope: ReportScope;
  period: ResolvedReportPeriod;
  evidence: EvidenceReference[];
}

export interface ChartReadyResult extends ChartResultBase {
  status: "ready";
  artifact: ReportArtifact;
}

export interface ChartNoDataResult extends ChartResultBase {
  status: "no_data";
  reason: string;
}

export interface ChartErrorResult extends ChartResultBase {
  status: "error";
  errorCode: string;
  message: string;
}

export type ChartResult = ChartReadyResult | ChartNoDataResult | ChartErrorResult;

interface DashboardResultBase {
  resultId: string;
  dashboardId: string;
  dashboardRevision: string;
  title: string;
  period: ResolvedReportPeriod;
  evidence: EvidenceReference[];
}

export interface DashboardReadyResult extends DashboardResultBase {
  status: "ready";
  artifact: ReportArtifact;
}

export interface DashboardNoDataResult extends DashboardResultBase {
  status: "no_data";
  reason: string;
}

export interface DashboardErrorResult extends DashboardResultBase {
  status: "error";
  errorCode: string;
  message: string;
}

export type DashboardResult = DashboardReadyResult | DashboardNoDataResult | DashboardErrorResult;

export type FaultSeverity = "low" | "medium" | "high" | "critical";

interface FaultEventBase {
  eventId: string;
  equipment: EquipmentIdentity;
  faultCode: string;
  severity: FaultSeverity;
  startedAt: string;
  durationHours: number;
  detectorId: string;
  detectorVersion: string;
  evidence: EvidenceReference[];
}

export interface ActiveFaultEvent extends FaultEventBase {
  status: "active";
  observedThrough: string;
}

export interface ResolvedFaultEvent extends FaultEventBase {
  status: "resolved";
  endedAt: string;
}

/** Detection facts only. Diagnosis and root-cause hypotheses belong to AnalysisResult. */
export type FaultEvent = ActiveFaultEvent | ResolvedFaultEvent;

export interface DataQualityIssue {
  issueId: string;
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  evidence: EvidenceReference[];
}

export interface EvidencePackage {
  schemaVersion: typeof EVIDENCE_PACKAGE_SCHEMA_VERSION;
  packageId: string;
  planId: string;
  projectId: string;
  scope: ReportScope;
  period: ResolvedReportPeriod;
  generatedAt: string;
  revisionHash: string;
  metricResults: MetricResult[];
  chartResults: ChartResult[];
  dashboardResults: DashboardResult[];
  faultEvents: FaultEvent[];
  dataQuality: DataQualityIssue[];
}

export type AnalysisKind =
  | "executive_summary"
  | "key_findings"
  | "fault_summary"
  | "fleet_performance"
  | "equipment_performance"
  | "fault_diagnosis"
  | "recommendations";

export type AnalysisSegment =
  /** Qualitative prose only; numeric values are inserted through typed references. */
  | { kind: "text"; text: string; evidenceIds: string[] }
  | { kind: "metric_ref"; metricResultId: string }
  | { kind: "equipment_ref"; equipmentId: string }
  | { kind: "fault_ref"; faultEventId: string };

interface AnalysisResultBase {
  analysisId: string;
  evidencePackageId: string;
  generatedAt: string;
}

interface CompleteAnalysisContent {
  status: "complete";
  segments: AnalysisSegment[];
  evidenceIds: string[];
}

export type CompleteAnalysisResult = AnalysisResultBase & CompleteAnalysisContent & (
  | {
      analysisKind: "executive_summary" | "key_findings" | "fault_summary";
      scope: { kind: "system" };
    }
  | {
      analysisKind: "recommendations";
      scope: ReportScope;
    }
  | {
      analysisKind: "fleet_performance";
      scope: { kind: "fleet"; equipmentType: string };
    }
  | {
      analysisKind: "equipment_performance";
      scope: { kind: "equipment"; equipmentId: string; equipmentType: string };
    }
  | {
      analysisKind: "fault_diagnosis";
      scope: { kind: "equipment"; equipmentId: string; equipmentType: string };
      /** Diagnoses can only refer to faults detected in the supplied package. */
      faultEventIds: string[];
    }
);

export interface InsufficientEvidenceAnalysisResult extends AnalysisResultBase {
  status: "insufficient_evidence";
  analysisKind: AnalysisKind;
  scope: ReportScope;
  message: string;
  missingEvidence: string[];
}

export interface ErrorAnalysisResult extends AnalysisResultBase {
  status: "error";
  analysisKind: AnalysisKind;
  scope: ReportScope;
  errorCode: string;
  message: string;
}

export type AnalysisResult =
  | CompleteAnalysisResult
  | InsufficientEvidenceAnalysisResult
  | ErrorAnalysisResult;

interface ReportBlockBase {
  blockId: string;
}

export interface TitleBlock extends ReportBlockBase {
  kind: "title";
  title: string;
  subtitle?: string;
}

export interface TextBlock extends ReportBlockBase {
  kind: "text";
  /** B-Agent prose must enter through AnalysisBlock. */
  source: "deterministic";
  text: string;
  format: "plain" | "markdown";
}

export interface KpiBlock extends ReportBlockBase {
  kind: "kpi";
  title: string;
  metricResultIds: string[];
}

export interface TableColumn {
  key: string;
  label: string;
  alignment?: "left" | "center" | "right";
}

export type TableCell =
  | { kind: "text"; text: string }
  | { kind: "metric_ref"; metricResultId: string }
  | { kind: "equipment_ref"; equipmentId: string }
  | { kind: "fault_ref"; faultEventId: string };

export interface TableBlock extends ReportBlockBase {
  kind: "table";
  title?: string;
  columns: TableColumn[];
  rows: Array<Record<string, TableCell>>;
}

export interface ChartBlock extends ReportBlockBase {
  kind: "chart";
  chartResultId: string;
  caption?: string;
}

export interface DashboardBlock extends ReportBlockBase {
  kind: "dashboard";
  dashboardResultId: string;
  caption?: string;
}

export interface FaultBlock extends ReportBlockBase {
  kind: "fault";
  title: string;
  faultEventIds: string[];
}

export interface AnalysisBlock extends ReportBlockBase {
  kind: "analysis";
  title: string;
  analysisResultId: string;
}

export interface SectionBlock extends ReportBlockBase {
  kind: "section";
  title: string;
  level: 1 | 2 | 3;
  blocks: ReportBlock[];
}

export interface PageBreakBlock extends ReportBlockBase {
  kind: "page_break";
}

/** Renderer-neutral; block values reference typed results instead of copying facts. */
export type ReportBlock =
  | TitleBlock
  | TextBlock
  | KpiBlock
  | TableBlock
  | ChartBlock
  | DashboardBlock
  | FaultBlock
  | AnalysisBlock
  | SectionBlock
  | PageBreakBlock;

export type ReportPlanSection =
  | { kind: "cover" }
  | { kind: "report_information" }
  | { kind: "standard"; section: Exclude<ReportSectionKey, "equipment_analysis"> }
  | {
      kind: "equipment_group";
      equipmentType: string;
      profileId: string;
      profileVersion: number;
      title: string;
      equipmentIds: string[];
    };

export interface EquipmentGroupPlan {
  equipmentType: string;
  profileId: string;
  profileVersion: number;
  title: string;
  equipment: EquipmentIdentity[];
}

export interface PlannedMetricRequest {
  requestId: string;
  metricKey: string;
  scope: ReportScope;
  profileId?: string;
}

export type PlannedChartRequest =
  | {
      requestId: string;
      origin: "system_kpi";
      chartKey: string;
      scope: { kind: "system" };
      metricKeys: string[];
      inputMetricRequestIds: string[];
    }
  | {
      requestId: string;
      origin: "fault_summary";
      chartKey: "fault_distribution" | "fault_timeline";
      scope: { kind: "system" };
      inputFaultRequestIds: string[];
    }
  | {
      requestId: string;
      origin: "equipment_profile";
      chartKey: string;
      scope: Extract<ReportScope, { kind: "fleet" | "equipment" }>;
      profileId: string;
    };

export interface PlannedDashboardRequest {
  requestId: string;
  dashboardId: string;
}

export interface PlannedFaultRequest {
  requestId: string;
  equipmentId: string;
  equipmentType: string;
}

export interface ReportEvidencePlan {
  metrics: PlannedMetricRequest[];
  charts: PlannedChartRequest[];
  dashboards: PlannedDashboardRequest[];
  faults: PlannedFaultRequest[];
}

export interface PlannedAnalysisRequest {
  requestId: string;
  analysisKind: AnalysisKind;
  scope: ReportScope;
  condition: "always" | "when_fault_detected" | "when_actionable_evidence";
  /** Deterministic tool requests that must be resolved before this analysis may run. */
  evidenceRequestIds: string[];
}

export interface ReportAnalysisPlan {
  /** Rendering intents; a later execution adapter may safely batch compatible requests. */
  requests: PlannedAnalysisRequest[];
}

export interface ReportPlan {
  schemaVersion: typeof REPORT_PLAN_SCHEMA_VERSION;
  planId: string;
  spec: ReportSpec;
  projectId: string;
  plannedAt: string;
  period: ResolvedReportPeriod;
  equipment: EquipmentIdentity[];
  equipmentGroups: EquipmentGroupPlan[];
  sections: ReportPlanSection[];
  evidence: ReportEvidencePlan;
  analysis: ReportAnalysisPlan;
  /** Required snapshot/hash of the authoritative asset metadata used for names. */
  assetRevision: string;
  /** Source revisions, entity URIs, and classification rules behind selected equipment. */
  assetProvenance: ReportAssetProvenance;
}

export interface ReportValidationIssue {
  path: string;
  code: string;
  message: string;
}

export type ReportValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ReportValidationIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  value: unknown,
  path: string,
  issues: ReportValidationIssue[],
  maxLength = 200
): string {
  if (typeof value !== "string" || !value.trim()) {
    issues.push({ path, code: "required", message: `${path} must be a non-empty string.` });
    return "";
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    issues.push({ path, code: "too_long", message: `${path} must be at most ${maxLength} characters.` });
  }
  return normalized;
}

function uniqueStringList(
  value: unknown,
  path: string,
  issues: ReportValidationIssue[]
): string[] {
  if (!Array.isArray(value)) {
    issues.push({ path, code: "invalid_type", message: `${path} must be an array.` });
    return [];
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const normalized = requiredString(entry, `${path}[${index}]`, issues);
    if (!normalized) continue;
    if (seen.has(normalized)) {
      issues.push({
        path: `${path}[${index}]`,
        code: "duplicate",
        message: `${path} must not contain duplicate values.`
      });
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function isRfc3339Instant(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysByMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysByMonth[month - 1]!) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  if (match[7] !== "Z" && (Number(match[8]) > 23 || Number(match[9]) > 59)) return false;
  return Number.isFinite(Date.parse(value));
}

function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

function validLocalTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function parsePeriod(value: unknown, issues: ReportValidationIssue[]): ReportPeriodSpec | null {
  if (!isRecord(value)) {
    issues.push({ path: "period", code: "invalid_type", message: "period must be an object." });
    return null;
  }
  if (value.kind === "weekly") {
    const window = value.window;
    const weekStartsOn = value.weekStartsOn;
    if (window !== "previous_complete" && window !== "current_to_date") {
      issues.push({ path: "period.window", code: "invalid_value", message: "Weekly period window is invalid." });
    }
    if (!REPORT_WEEKDAYS.includes(weekStartsOn as ReportWeekday)) {
      issues.push({ path: "period.weekStartsOn", code: "invalid_value", message: "Weekly period weekday is invalid." });
    }
    if (
      (window === "previous_complete" || window === "current_to_date")
      && REPORT_WEEKDAYS.includes(weekStartsOn as ReportWeekday)
    ) {
      return { kind: "weekly", window, weekStartsOn: weekStartsOn as ReportWeekday };
    }
    return null;
  }
  if (value.kind === "monthly") {
    const window = value.window;
    if (window !== "previous_complete" && window !== "current_to_date") {
      issues.push({ path: "period.window", code: "invalid_value", message: "Monthly period window is invalid." });
      return null;
    }
    return { kind: "monthly", window };
  }
  if (value.kind === "custom") {
    const startAt = requiredString(value.startAt, "period.startAt", issues);
    const endAt = requiredString(value.endAt, "period.endAt", issues);
    if (startAt && !isRfc3339Instant(startAt)) {
      issues.push({ path: "period.startAt", code: "invalid_datetime", message: "period.startAt must be an ISO-8601 instant." });
    }
    if (endAt && !isRfc3339Instant(endAt)) {
      issues.push({ path: "period.endAt", code: "invalid_datetime", message: "period.endAt must be an ISO-8601 instant." });
    }
    if (isRfc3339Instant(startAt) && isRfc3339Instant(endAt) && Date.parse(startAt) >= Date.parse(endAt)) {
      issues.push({ path: "period.endAt", code: "invalid_range", message: "period.endAt must be after period.startAt." });
    }
    return isRfc3339Instant(startAt) && isRfc3339Instant(endAt) && Date.parse(startAt) < Date.parse(endAt)
      ? { kind: "custom", startAt, endAt }
      : null;
  }
  issues.push({ path: "period.kind", code: "invalid_value", message: "period.kind must be weekly, monthly, or custom." });
  return null;
}

function parseSchedule(value: unknown, issues: ReportValidationIssue[]): ReportSchedule | null {
  if (!isRecord(value) || typeof value.enabled !== "boolean") {
    issues.push({ path: "schedule", code: "invalid_type", message: "schedule must contain an enabled boolean." });
    return null;
  }
  if (!value.enabled) return { enabled: false };

  const time = requiredString(value.time, "schedule.time", issues);
  if (time && !validLocalTime(time)) {
    issues.push({ path: "schedule.time", code: "invalid_time", message: "schedule.time must use 24-hour HH:mm format." });
  }
  if (value.frequency === "weekly") {
    if (!REPORT_WEEKDAYS.includes(value.weekday as ReportWeekday)) {
      issues.push({ path: "schedule.weekday", code: "invalid_value", message: "schedule.weekday is invalid." });
      return null;
    }
    return validLocalTime(time)
      ? { enabled: true, frequency: "weekly", weekday: value.weekday as ReportWeekday, time }
      : null;
  }
  if (value.frequency === "monthly") {
    const dayOfMonth = value.dayOfMonth;
    if (dayOfMonth !== "last" && (!Number.isInteger(dayOfMonth) || Number(dayOfMonth) < 1 || Number(dayOfMonth) > 31)) {
      issues.push({ path: "schedule.dayOfMonth", code: "invalid_value", message: "schedule.dayOfMonth must be 1-31 or last." });
    }
    const shortMonthPolicy = value.shortMonthPolicy ?? "last_day";
    if (shortMonthPolicy !== "last_day" && shortMonthPolicy !== "skip") {
      issues.push({ path: "schedule.shortMonthPolicy", code: "invalid_value", message: "Monthly short-month policy is invalid." });
    }
    if (
      validLocalTime(time)
      && (dayOfMonth === "last" || (Number.isInteger(dayOfMonth) && Number(dayOfMonth) >= 1 && Number(dayOfMonth) <= 31))
      && (shortMonthPolicy === "last_day" || shortMonthPolicy === "skip")
    ) {
      return {
        enabled: true,
        frequency: "monthly",
        dayOfMonth: dayOfMonth as number | "last",
        time,
        shortMonthPolicy
      };
    }
    return null;
  }
  issues.push({ path: "schedule.frequency", code: "invalid_value", message: "Enabled schedule frequency must be weekly or monthly." });
  return null;
}

function parseSections(value: unknown, issues: ReportValidationIssue[]): ReportSectionConfig | null {
  if (!isRecord(value)) {
    issues.push({ path: "sections", code: "invalid_type", message: "sections must be an object." });
    return null;
  }
  if (!Array.isArray(value.ordered)) {
    issues.push({ path: "sections.ordered", code: "invalid_type", message: "sections.ordered must be an array." });
    return null;
  }
  const ordered: ReportSectionSelection[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.ordered.entries()) {
    const path = `sections.ordered[${index}]`;
    if (!isRecord(entry)) {
      issues.push({ path, code: "invalid_type", message: "Each section selection must be an object." });
      continue;
    }
    if (typeof entry.section !== "string" || !REPORT_SECTION_KEYS.includes(entry.section as ReportSectionKey)) {
      issues.push({ path: `${path}.section`, code: "invalid_value", message: "Section selection contains an unknown section." });
      continue;
    }
    if (typeof entry.enabled !== "boolean") {
      issues.push({ path: `${path}.enabled`, code: "invalid_type", message: "Section enabled must be a boolean." });
      continue;
    }
    if (seen.has(entry.section)) {
      issues.push({ path: `${path}.section`, code: "duplicate", message: "Section selections must not contain duplicates." });
      continue;
    }
    seen.add(entry.section);
    ordered.push({ section: entry.section as ReportSectionKey, enabled: entry.enabled });
  }
  for (const key of REPORT_SECTION_KEYS) {
    if (!seen.has(key)) {
      issues.push({ path: "sections.ordered", code: "missing_section", message: `sections.ordered must include ${key}.` });
    }
  }
  return ordered.length === REPORT_SECTION_KEYS.length ? { ordered } : null;
}

function parseEquipmentSelection(value: unknown, issues: ReportValidationIssue[]): EquipmentSelection | null {
  if (!isRecord(value)) {
    issues.push({ path: "equipment", code: "invalid_type", message: "equipment must be an object." });
    return null;
  }
  if (value.mode === "all") {
    return { mode: "all", equipmentTypes: uniqueStringList(value.equipmentTypes ?? [], "equipment.equipmentTypes", issues) };
  }
  if (value.mode === "selected") {
    const equipmentIds = uniqueStringList(value.equipmentIds, "equipment.equipmentIds", issues);
    return { mode: "selected", equipmentIds };
  }
  issues.push({ path: "equipment.mode", code: "invalid_value", message: "equipment.mode must be all or selected." });
  return null;
}

/** Parse and normalize a persisted/API ReportSpec without invoking tools or an LLM. */
export function parseReportSpec(value: unknown): ReportValidationResult<ReportSpec> {
  const issues: ReportValidationIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: "$", code: "invalid_type", message: "Report specification must be an object." }] };
  }
  if (value.schemaVersion !== REPORT_SPEC_SCHEMA_VERSION) {
    issues.push({ path: "schemaVersion", code: "unsupported_version", message: `schemaVersion must be ${REPORT_SPEC_SCHEMA_VERSION}.` });
  }
  const specId = requiredString(value.specId, "specId", issues);
  const projectId = requiredString(value.projectId, "projectId", issues);
  const title = requiredString(value.title, "title", issues, 160);
  const timeZone = requiredString(value.timeZone, "timeZone", issues);
  if (timeZone && !validTimeZone(timeZone)) {
    issues.push({ path: "timeZone", code: "invalid_timezone", message: "timeZone must be a valid IANA timezone." });
  }

  const period = parsePeriod(value.period, issues);
  const schedule = parseSchedule(value.schedule, issues);
  const sections = parseSections(value.sections, issues);
  const kpiKeys = uniqueStringList(value.kpiKeys, "kpiKeys", issues);
  const dashboardIds = uniqueStringList(value.dashboardIds, "dashboardIds", issues);
  const equipment = parseEquipmentSelection(value.equipment, issues);

  if (period?.kind === "custom" && schedule?.enabled) {
    issues.push({ path: "schedule.enabled", code: "incompatible", message: "A fixed custom period cannot use a recurring schedule." });
  }
  if (period?.kind === "weekly" && schedule?.enabled && schedule.frequency !== "weekly") {
    issues.push({ path: "schedule.frequency", code: "incompatible", message: "A weekly report requires a weekly schedule." });
  }
  if (period?.kind === "monthly" && schedule?.enabled && schedule.frequency !== "monthly") {
    issues.push({ path: "schedule.frequency", code: "incompatible", message: "A monthly report requires a monthly schedule." });
  }
  if (sections && sectionEnabled(sections, "selected_dashboards") && dashboardIds.length === 0) {
    issues.push({ path: "dashboardIds", code: "required", message: "Selected dashboards section requires at least one dashboard ID." });
  }
  if (sections && sectionEnabled(sections, "system_performance") && kpiKeys.length === 0) {
    issues.push({ path: "kpiKeys", code: "required", message: "System performance section requires at least one KPI key." });
  }

  if (
    issues.length > 0
    || !specId
    || !projectId
    || !title
    || !validTimeZone(timeZone)
    || !period
    || !schedule
    || !sections
    || !equipment
  ) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    value: {
      schemaVersion: REPORT_SPEC_SCHEMA_VERSION,
      specId,
      projectId,
      title,
      timeZone,
      period,
      schedule,
      sections,
      kpiKeys,
      dashboardIds,
      equipment
    }
  };
}

export function formatEquipmentDisplayName(shortIdentifier: string, fullName: string): string {
  return `${shortIdentifier.trim()} — ${fullName.trim()}`;
}

function normalizedEquipmentIdentifier(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** True when a purported full name is only a punctuation/case variant of an equipment code. */
export function isEquipmentIdentifierOnlyName(
  fullName: string,
  equipmentId: string,
  shortIdentifier: string = equipmentId
): boolean {
  const candidate = normalizedEquipmentIdentifier(fullName);
  if (!candidate) return false;
  return candidate === normalizedEquipmentIdentifier(equipmentId)
    || candidate === normalizedEquipmentIdentifier(shortIdentifier);
}

function equipmentTypeLabel(equipmentType: string): string {
  const knownLabels: Record<string, string> = {
    ahu: "Air Handling Unit",
    boiler: "Boiler",
    chiller: "Chiller",
    chilled_water_pump: "Chilled Water Pump",
    condenser_water_pump: "Condenser Water Pump",
    cooling_tower: "Cooling Tower",
    fcu: "Fan Coil Unit",
    vav: "Variable Air Volume Box"
  };
  return knownLabels[equipmentType]
    ?? equipmentType
      .split(/[_-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
}

/** Derive the only permitted fallback name when authoritative project metadata has no name. */
export function deriveDeterministicEquipmentFullName(shortIdentifier: string, equipmentType: string): string {
  const numericSuffix = /(\d+)(?!.*\d)/.exec(shortIdentifier)?.[1];
  return numericSuffix
    ? `${equipmentTypeLabel(equipmentType)} ${numericSuffix}`
    : `${equipmentTypeLabel(equipmentType)} ${shortIdentifier}`;
}

/**
 * Build the canonical identity from a trusted asset resolver. Metadata names carry
 * a source reference; fallback names are derived only from equipment type and ID.
 */
export function createEquipmentIdentity(
  input: EquipmentIdentityInput
): ReportValidationResult<EquipmentIdentity> {
  const issues: ReportValidationIssue[] = [];
  const equipmentId = requiredString(input.equipmentId, "equipmentId", issues);
  const shortIdentifier = input.shortIdentifier === undefined
    ? equipmentId
    : requiredString(input.shortIdentifier, "shortIdentifier", issues);
  const equipmentType = requiredString(input.equipmentType, "equipmentType", issues);
  const allowedSources: EquipmentNameSource[] = [
    "semantic_model",
    "project_metadata",
    "bms_metadata",
    "deterministic_fallback"
  ];
  if (!allowedSources.includes(input.nameSource)) {
    issues.push({ path: "nameSource", code: "invalid_value", message: "Equipment name source must be deterministic project metadata." });
  }
  const fullName = input.nameSource === "deterministic_fallback"
    ? deriveDeterministicEquipmentFullName(shortIdentifier, equipmentType)
    : requiredString((input as { fullName?: unknown }).fullName, "fullName", issues);
  if (
    input.nameSource !== "deterministic_fallback"
    && fullName
    && isEquipmentIdentifierOnlyName(fullName, equipmentId, shortIdentifier)
  ) {
    issues.push({
      path: "fullName",
      code: "identifier_only_name",
      message: "Equipment full name must be descriptive rather than a copy of its identifier."
    });
  }
  const nameSourceRef = input.nameSource === "deterministic_fallback"
    ? `fallback:${equipmentType}:${equipmentId}:short=${shortIdentifier}`
    : requiredString((input as { nameSourceRef?: unknown }).nameSourceRef, "nameSourceRef", issues);
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: {
      equipmentId,
      shortIdentifier,
      equipmentType,
      fullName,
      displayName: formatEquipmentDisplayName(shortIdentifier, fullName),
      nameSource: input.nameSource,
      nameSourceRef
    }
  };
}

export function sectionEnabled(config: ReportSectionConfig, section: ReportSectionKey): boolean {
  return config.ordered.find((entry) => entry.section === section)?.enabled ?? false;
}
