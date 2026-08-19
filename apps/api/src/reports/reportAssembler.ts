import {
  REPORT_DOCUMENT_SCHEMA_VERSION,
  isRfc3339Instant,
  type AnalysisKind,
  type AnalysisPackage,
  type AnalysisResult,
  type EvidenceDefinitionReference,
  type EvidencePackage,
  type EquipmentIdentity,
  type ReportBlock,
  type ReportDocument,
  type ReportPlan,
  type ReportPlanSection,
  type ReportScope,
  type ReportValidationIssue,
  type ReportValidationResult,
  type SectionBlock,
  type TableBlock,
  type TableCell
} from "./contracts.js";
import { validateAnalysisPackageForPlan } from "./analysisExecutor.js";
import {
  evidenceDefinitionRegistryRevision,
  validateEvidenceDefinitionRegistry,
  type EvidenceDefinitionRegistry
} from "./evidenceDefinitions.js";
import {
  canonicalReportHash,
  validateEvidencePackageForPlan
} from "./evidenceExecutor.js";

export const REPORT_ASSEMBLER_ID = "generic-report-block-assembler" as const;
export const REPORT_ASSEMBLER_VERSION = "1" as const;

const MAX_BLOCKS = 10_000;
const MAX_BLOCK_DEPTH = 8;
const MAX_TABLE_COLUMNS = 64;
const MAX_TABLE_ROWS = 50_000;
const MAX_STRING_LENGTH = 16_384;
const MAX_JSON_NODES = 200_000;
const MAX_DATA_QUALITY_MESSAGE_LENGTH = 2_048;
const SAFE_DOCUMENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;
const SAFE_BLOCK_ID = /^block_[a-f0-9]{24}$/u;

const SECTION_TITLES = {
  executive_summary: "Executive Summary",
  key_findings: "Key Findings",
  system_performance: "System Performance",
  selected_dashboards: "Selected Dashboards",
  fault_summary: "Fault Summary",
  recommended_actions: "Recommended Actions",
  appendix: "Appendix"
} as const;

const ANALYSIS_TITLES: Record<AnalysisKind, string> = {
  executive_summary: "Executive Summary",
  key_findings: "Key Findings",
  fault_summary: "Fault Interpretation",
  fleet_performance: "Fleet Performance Analysis",
  equipment_performance: "Performance Analysis",
  fault_diagnosis: "Fault Diagnosis",
  recommendations: "Recommended Actions"
};

export interface AssembleReportDocumentInput {
  plan: ReportPlan;
  evidencePackage: EvidencePackage;
  analysisPackage: AnalysisPackage;
  evidenceDefinitions: EvidenceDefinitionRegistry;
  documentId: string;
  generatedAt: string;
}

export interface ValidateReportDocumentInput extends AssembleReportDocumentInput {
  document: Readonly<ReportDocument>;
}

interface AssemblyIndex {
  executionByRequestId: Map<string, EvidencePackage["executions"][number]>;
  analysisByRequestId: Map<string, AnalysisResult>;
  equipmentById: Map<string, EquipmentIdentity>;
}

interface ReferenceCounts {
  metric: Map<string, number>;
  chart: Map<string, number>;
  dashboard: Map<string, number>;
  faultRequest: Map<string, number>;
  analysis: Map<string, number>;
}

function issue(path: string, code: string, message: string): ReportValidationIssue {
  return { path, code, message };
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function canonicalEqual(left: unknown, right: unknown): boolean {
  return canonicalReportHash(left) === canonicalReportHash(right);
}

function uniqueIssues(issues: ReportValidationIssue[]): ReportValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((candidate) => {
    const key = `${candidate.path}\u0000${candidate.code}\u0000${candidate.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function expectedPlanSections(plan: Readonly<ReportPlan>): ReportPlanSection[] {
  const sections: ReportPlanSection[] = [{ kind: "cover" }, { kind: "report_information" }];
  for (const selection of plan.spec.sections.ordered) {
    if (!selection.enabled) continue;
    if (selection.section === "equipment_analysis") {
      for (const group of plan.equipmentGroups) {
        sections.push({
          kind: "equipment_group",
          equipmentType: group.equipmentType,
          profileId: group.profileId,
          profileVersion: group.profileVersion,
          title: group.title,
          equipmentIds: group.equipment.map((equipment) => equipment.equipmentId)
        });
      }
    } else {
      sections.push({ kind: "standard", section: selection.section });
    }
  }
  return sections;
}

function validatePlanAssemblyShape(plan: Readonly<ReportPlan>): ReportValidationIssue[] {
  const issues: ReportValidationIssue[] = [];
  if (!Array.isArray(plan.sections) || !Array.isArray(plan.equipmentGroups)) {
    return [issue("plan.sections", "invalid_type", "Report plan sections and equipment groups must be arrays.")];
  }
  const expected = expectedPlanSections(plan);
  if (!canonicalEqual(plan.sections, expected)) {
    issues.push(issue(
      "plan.sections",
      "section_plan_mismatch",
      "Report plan sections must exactly follow the configured section and equipment-group order."
    ));
  }
  const equipmentById = new Map(plan.equipment.map((equipment) => [equipment.equipmentId, equipment]));
  const groupedIds = new Set<string>();
  for (const [groupIndex, group] of plan.equipmentGroups.entries()) {
    const path = `plan.equipmentGroups[${groupIndex}]`;
    if (!nonEmpty(group.title) || !nonEmpty(group.equipmentType) || !nonEmpty(group.profileId)) {
      issues.push(issue(path, "invalid_group", "Equipment group identity and title are required."));
    }
    for (const [equipmentIndex, equipment] of group.equipment.entries()) {
      const itemPath = `${path}.equipment[${equipmentIndex}]`;
      const planned = equipmentById.get(equipment.equipmentId);
      if (!planned || !canonicalEqual(planned, equipment) || equipment.equipmentType !== group.equipmentType) {
        issues.push(issue(itemPath, "equipment_scope_mismatch", "Equipment group member does not match the plan identity and type."));
      }
      if (groupedIds.has(equipment.equipmentId)) {
        issues.push(issue(itemPath, "duplicate_equipment", "Equipment appears in more than one report group."));
      }
      groupedIds.add(equipment.equipmentId);
    }
  }
  if (plan.spec.sections.ordered.some((selection) => selection.section === "equipment_analysis" && selection.enabled)) {
    const expectedIds = [...equipmentById.keys()].sort();
    const actualIds = [...groupedIds].sort();
    if (!canonicalEqual(actualIds, expectedIds)) {
      issues.push(issue(
        "plan.equipmentGroups",
        "equipment_coverage_mismatch",
        "Enabled equipment analysis must group every selected equipment identity exactly once."
      ));
    }
  }
  return issues;
}

function upstreamIssues(input: AssembleReportDocumentInput): ReportValidationIssue[] {
  const issues: ReportValidationIssue[] = [];
  if (!SAFE_DOCUMENT_ID.test(input.documentId)) {
    issues.push(issue("documentId", "invalid_id", "Document ID must be a safe non-empty identifier no longer than 200 characters."));
  }
  if (!isRfc3339Instant(input.generatedAt)) {
    issues.push(issue("generatedAt", "invalid_datetime", "Document generatedAt must be an RFC3339 instant."));
  }
  try {
    issues.push(...validateEvidenceDefinitionRegistry(input.evidenceDefinitions));
  } catch {
    issues.push(issue("evidenceDefinitions", "invalid_registry", "Evidence definition registry could not be validated."));
  }
  let definitionsRevision: string | null = null;
  if (!issues.some((candidate) => candidate.path.startsWith("evidenceDefinitions"))) {
    try {
      definitionsRevision = evidenceDefinitionRegistryRevision(input.evidenceDefinitions);
    } catch {
      issues.push(issue("evidenceDefinitions", "invalid_registry", "Evidence definition registry revision could not be computed."));
    }
  }
  if (definitionsRevision !== null && definitionsRevision !== input.plan.evidence?.definitionsRevision) {
    issues.push(issue(
      "plan.evidence.definitionsRevision",
      "definition_revision_mismatch",
      "Evidence definitions do not match the revision pinned by the report plan."
    ));
  }
  try {
    const evidence = validateEvidencePackageForPlan(input.plan, input.evidencePackage);
    if (!evidence.ok) issues.push(...evidence.issues);
  } catch {
    issues.push(issue("evidencePackage", "invalid_package", "Evidence package could not be validated for the report plan."));
  }
  try {
    const analysis = validateAnalysisPackageForPlan(input.plan, input.evidencePackage, input.analysisPackage);
    if (!analysis.ok) issues.push(...analysis.issues);
  } catch {
    issues.push(issue("analysisPackage", "invalid_package", "Analysis package could not be validated for the report plan."));
  }
  try {
    issues.push(...validatePlanAssemblyShape(input.plan));
  } catch {
    issues.push(issue("plan.sections", "invalid_plan", "Report plan section structure could not be validated."));
  }
  return uniqueIssues(issues);
}

function blockId(path: readonly (string | number)[]): string {
  const digest = canonicalReportHash({
    assemblerId: REPORT_ASSEMBLER_ID,
    assemblerVersion: REPORT_ASSEMBLER_VERSION,
    path
  });
  return `block_${digest.slice("sha256:".length, "sha256:".length + 24)}`;
}

function assemblyIndex(input: AssembleReportDocumentInput): AssemblyIndex {
  return {
    executionByRequestId: new Map(input.evidencePackage.executions.map((execution) => [execution.requestId, execution])),
    analysisByRequestId: new Map(input.analysisPackage.results.map((result) => [result.requestId, result])),
    equipmentById: new Map(input.plan.equipment.map((equipment) => [equipment.equipmentId, equipment]))
  };
}

function resultIds(index: AssemblyIndex, requestIds: readonly string[]): string[] {
  return requestIds.flatMap((requestId) => index.executionByRequestId.get(requestId)?.resultIds ?? []);
}

function sameScope(left: ReportScope, right: ReportScope): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "system" && right.kind === "system") return true;
  if (left.kind === "fleet" && right.kind === "fleet") return left.equipmentType === right.equipmentType;
  return left.kind === "equipment"
    && right.kind === "equipment"
    && left.equipmentId === right.equipmentId
    && left.equipmentType === right.equipmentType;
}

function analysisBlocks(
  input: AssembleReportDocumentInput,
  index: AssemblyIndex,
  requests: readonly ReportPlan["analysis"]["requests"][number][],
  path: readonly (string | number)[]
): ReportBlock[] {
  return requests.map((request, requestIndex) => {
    const result = index.analysisByRequestId.get(request.requestId)!;
    return {
      kind: "analysis" as const,
      blockId: blockId([...path, "analysis", requestIndex, request.requestId]),
      title: ANALYSIS_TITLES[request.analysisKind],
      analysisResultId: result.analysisId
    };
  });
}

function textCell(text: string): TableCell {
  return { kind: "text", text };
}

function informationTables(
  input: AssembleReportDocumentInput,
  path: readonly (string | number)[]
): TableBlock[] {
  const complete = input.evidencePackage.executions.filter((execution) => execution.status === "complete").length;
  const total = input.evidencePackage.executions.length;
  const information: TableBlock = {
    kind: "table",
    blockId: blockId([...path, "report-metadata"]),
    title: "Report Information",
    columns: [
      { key: "item", label: "Item", alignment: "left" },
      { key: "value", label: "Value", alignment: "left" }
    ],
    rows: [
      { item: textCell("Project"), value: textCell(input.plan.projectId) },
      {
        item: textCell("Reporting Period"),
        value: textCell(`[${input.plan.period.startAt}, ${input.plan.period.endAt})`)
      },
      { item: textCell("Data Timezone"), value: textCell(input.plan.period.timeZone) },
      { item: textCell("Generation Time"), value: textCell(input.generatedAt) },
      { item: textCell("Data Coverage"), value: textCell(`${complete} of ${total} planned evidence requests completed`) }
    ]
  };
  const inventoryRows: TableBlock["rows"] = input.plan.equipment.length > 0
    ? input.plan.equipment.map((equipment) => ({
        equipment: { kind: "equipment_ref" as const, equipmentId: equipment.equipmentId },
        type: textCell(equipment.equipmentType)
      }))
    : [{ equipment: textCell("No equipment selected"), type: textCell("Not applicable") }];
  const inventory: TableBlock = {
    kind: "table",
    blockId: blockId([...path, "equipment-inventory"]),
    title: "Included Equipment",
    columns: [
      { key: "equipment", label: "Equipment", alignment: "left" },
      { key: "type", label: "Equipment Type", alignment: "left" }
    ],
    rows: inventoryRows
  };
  return [information, inventory];
}

function uniqueDefinitionRows(
  input: AssembleReportDocumentInput
): TableBlock["rows"] {
  const rows: TableBlock["rows"] = [];
  const seen = new Set<string>();
  const notApplicable = "Not applicable";
  const add = (
    registry: "evidence" | "analysis",
    category: string,
    label: string,
    reference: EvidenceDefinitionReference,
    faultRule?: {
      faultCode: string;
      severity: string;
      detectorId: string;
      detectorVersion: string;
    }
  ): void => {
    const ruleKey = faultRule
      ? `${faultRule.faultCode}\u0000${faultRule.severity}\u0000${faultRule.detectorId}\u0000${faultRule.detectorVersion}`
      : "definition";
    const key = `${registry}\u0000${category}\u0000${reference.definitionId}\u0000${reference.definitionVersion}\u0000${ruleKey}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({
      registry: textCell(registry),
      category: textCell(category),
      label: textCell(label),
      definition: textCell(reference.definitionId),
      version: textCell(reference.definitionVersion),
      fault_code: textCell(faultRule?.faultCode ?? notApplicable),
      severity: textCell(faultRule?.severity ?? notApplicable),
      detector: textCell(faultRule?.detectorId ?? notApplicable),
      detector_version: textCell(faultRule?.detectorVersion ?? notApplicable)
    });
  };
  const metricDefinitions = new Map(input.evidenceDefinitions.metrics.map((definition) => (
    [`${definition.definitionId}\u0000${definition.definitionVersion}`, definition]
  )));
  const chartDefinitions = new Map(input.evidenceDefinitions.charts.map((definition) => (
    [`${definition.definitionId}\u0000${definition.definitionVersion}`, definition]
  )));
  const dashboardDefinitions = new Map(input.evidenceDefinitions.dashboards.map((definition) => (
    [`${definition.definitionId}\u0000${definition.definitionVersion}`, definition]
  )));
  const faultDefinitions = new Map(input.evidenceDefinitions.faults.map((definition) => (
    [`${definition.definitionId}\u0000${definition.definitionVersion}`, definition]
  )));
  for (const request of input.plan.evidence.metrics) {
    const definition = metricDefinitions.get(`${request.definition.definitionId}\u0000${request.definition.definitionVersion}`);
    add("evidence", "Metric", definition ? `${definition.label} (${definition.metricKey}; ${definition.unit || "unitless"})` : request.metricKey, request.definition);
  }
  for (const request of input.plan.evidence.charts) {
    const definition = chartDefinitions.get(`${request.definition.definitionId}\u0000${request.definition.definitionVersion}`);
    add("evidence", "Chart", definition?.chartKey ?? request.chartKey, request.definition);
  }
  for (const request of input.plan.evidence.dashboards) {
    const definition = dashboardDefinitions.get(`${request.definition.definitionId}\u0000${request.definition.definitionVersion}`);
    add("evidence", "Dashboard", definition?.rendererKey ?? request.dashboardId, request.definition);
  }
  for (const request of input.plan.evidence.faults) {
    const definition = faultDefinitions.get(`${request.definition.definitionId}\u0000${request.definition.definitionVersion}`);
    if (definition) {
      for (const rule of definition.rules) {
        add("evidence", "Fault Detection", definition.equipmentType, request.definition, rule);
      }
    } else {
      add("evidence", "Fault Detection", request.equipmentType, request.definition);
    }
  }
  for (const request of input.plan.analysis.requests) {
    add("analysis", "Analysis", `${request.analysisKind} (${request.scope.kind})`, request.definition);
  }
  return rows.length > 0
    ? rows
    : [{
        registry: textCell("evidence"),
        category: textCell("Information"),
        label: textCell("No definitions were selected"),
        definition: textCell("Not applicable"),
        version: textCell(notApplicable),
        fault_code: textCell(notApplicable),
        severity: textCell(notApplicable),
        detector: textCell(notApplicable),
        detector_version: textCell(notApplicable)
      }];
}

function sanitizedDataQualityMessage(value: string): string {
  const sanitized = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!sanitized) return "No details provided.";
  return Array.from(sanitized).slice(0, MAX_DATA_QUALITY_MESSAGE_LENGTH).join("");
}

function appendixTables(
  input: AssembleReportDocumentInput,
  path: readonly (string | number)[]
): TableBlock[] {
  const definitions: TableBlock = {
    kind: "table",
    blockId: blockId([...path, "definitions"]),
    title: "Pinned Definitions",
    columns: [
      { key: "registry", label: "Registry", alignment: "left" },
      { key: "category", label: "Category", alignment: "left" },
      { key: "label", label: "Definition", alignment: "left" },
      { key: "definition", label: "Definition ID", alignment: "left" },
      { key: "version", label: "Version", alignment: "left" },
      { key: "fault_code", label: "Fault Code", alignment: "left" },
      { key: "severity", label: "Severity", alignment: "left" },
      { key: "detector", label: "Detector", alignment: "left" },
      { key: "detector_version", label: "Detector Version", alignment: "left" }
    ],
    rows: uniqueDefinitionRows(input)
  };
  const qualityRows: TableBlock["rows"] = input.evidencePackage.dataQuality.length > 0
    ? input.evidencePackage.dataQuality.map((quality) => ({
        issue_id: textCell(quality.issueId),
        severity: textCell(quality.severity),
        code: textCell(quality.code),
        request: textCell(quality.requestId ?? "Report-wide"),
        message: textCell(sanitizedDataQualityMessage(quality.message))
      }))
    : [{
        issue_id: textCell("none"),
        severity: textCell("info"),
        code: textCell("no_reported_issues"),
        request: textCell("Report-wide"),
        message: textCell("No data-quality issues were reported.")
      }];
  const quality: TableBlock = {
    kind: "table",
    blockId: blockId([...path, "data-quality"]),
    title: "Data Quality",
    columns: [
      { key: "issue_id", label: "Issue ID", alignment: "left" },
      { key: "severity", label: "Severity", alignment: "left" },
      { key: "code", label: "Code", alignment: "left" },
      { key: "request", label: "Evidence Request", alignment: "left" },
      { key: "message", label: "Message", alignment: "left" }
    ],
    rows: qualityRows
  };
  return [definitions, quality];
}

function assetInformationTable(
  equipment: EquipmentIdentity,
  path: readonly (string | number)[]
): TableBlock {
  return {
    kind: "table",
    blockId: blockId([...path, "asset-information"]),
    title: "Asset Information",
    columns: [
      { key: "item", label: "Item", alignment: "left" },
      { key: "value", label: "Value", alignment: "left" }
    ],
    rows: [
      { item: textCell("Equipment"), value: { kind: "equipment_ref", equipmentId: equipment.equipmentId } },
      { item: textCell("Equipment Type"), value: textCell(equipment.equipmentType) },
      { item: textCell("Name Source"), value: textCell(equipment.nameSource) }
    ]
  };
}

function sectionBlock(
  path: readonly (string | number)[],
  title: string,
  level: 1 | 2 | 3,
  numbering: SectionBlock["numbering"],
  blocks: ReportBlock[]
): SectionBlock {
  return {
    kind: "section",
    blockId: blockId(path),
    title,
    level,
    numbering,
    blocks
  };
}

function displayLabel(key: string): string {
  return key
    .split(/[_-]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase("en") + part.slice(1))
    .join(" ");
}

function chartCaption(
  input: AssembleReportDocumentInput,
  request: ReportPlan["evidence"]["charts"][number]
): string {
  const label = displayLabel(request.chartKey);
  const scope = request.scope;
  if (scope.kind === "equipment") {
    const equipment = input.plan.equipment.find((candidate) => candidate.equipmentId === scope.equipmentId)!;
    return `${equipment.displayName} — ${label}`;
  }
  if (scope.kind === "fleet") {
    const group = input.plan.equipmentGroups.find((candidate) => candidate.equipmentType === scope.equipmentType)!;
    return `${group.title} — ${label}`;
  }
  return label;
}

function chartBlocks(
  input: AssembleReportDocumentInput,
  index: AssemblyIndex,
  requests: readonly ReportPlan["evidence"]["charts"][number][],
  path: readonly (string | number)[]
): ReportBlock[] {
  return requests.map((request, requestIndex) => {
    const resultId = resultIds(index, [request.requestId])[0]!;
    return {
      kind: "chart" as const,
      blockId: blockId([...path, "chart", requestIndex, request.requestId]),
      chartResultId: resultId,
      caption: chartCaption(input, request)
    };
  });
}

function equipmentGroupBlock(
  input: AssembleReportDocumentInput,
  index: AssemblyIndex,
  plannedSection: Extract<ReportPlanSection, { kind: "equipment_group" }>,
  sectionIndex: number
): SectionBlock {
  const path = ["section", sectionIndex, "equipment-group", plannedSection.profileId] as const;
  const fleetScope: ReportScope = { kind: "fleet", equipmentType: plannedSection.equipmentType };
  const fleetMetricRequests = input.plan.evidence.metrics.filter((request) => sameScope(request.scope, fleetScope));
  const fleetChartRequests = input.plan.evidence.charts.filter((request) => sameScope(request.scope, fleetScope));
  const fleetAnalysisRequests = input.plan.analysis.requests.filter((request) => sameScope(request.scope, fleetScope));
  const fleetPath = [...path, "fleet-overview"] as const;
  const fleetBlocks: ReportBlock[] = [{
    kind: "kpi",
    blockId: blockId([...fleetPath, "fleet-kpis"]),
    title: "Fleet KPIs",
    metricResultIds: resultIds(index, fleetMetricRequests.map((request) => request.requestId))
  }];
  fleetBlocks.push(...chartBlocks(input, index, fleetChartRequests, fleetPath));
  fleetBlocks.push(...analysisBlocks(input, index, fleetAnalysisRequests, fleetPath));
  const blocks: ReportBlock[] = [sectionBlock(fleetPath, "Fleet Overview", 2, "unnumbered", fleetBlocks)];

  for (const [equipmentIndex, equipmentId] of plannedSection.equipmentIds.entries()) {
    const equipment = index.equipmentById.get(equipmentId)!;
    const equipmentPath = [...path, "equipment", equipmentIndex, equipmentId] as const;
    const scope: ReportScope = {
      kind: "equipment",
      equipmentId,
      equipmentType: plannedSection.equipmentType
    };
    const metricRequests = input.plan.evidence.metrics.filter((request) => sameScope(request.scope, scope));
    const chartRequests = input.plan.evidence.charts.filter((request) => sameScope(request.scope, scope));
    const faultRequests = input.plan.evidence.faults.filter((request) => request.equipmentId === equipmentId);
    const scopedAnalysisRequests = input.plan.analysis.requests.filter((request) => sameScope(request.scope, scope));
    const equipmentBlocks: ReportBlock[] = [
      assetInformationTable(equipment, equipmentPath),
      {
        kind: "kpi",
        blockId: blockId([...equipmentPath, "performance-kpis"]),
        title: "Performance KPIs",
        metricResultIds: resultIds(index, metricRequests.map((request) => request.requestId))
      },
      ...chartBlocks(input, index, chartRequests, equipmentPath),
      {
        kind: "fault",
        blockId: blockId([...equipmentPath, "faults"]),
        title: "Detected Faults",
        faultRequestIds: faultRequests.map((request) => request.requestId),
        faultEventIds: resultIds(index, faultRequests.map((request) => request.requestId))
      },
      ...analysisBlocks(input, index, scopedAnalysisRequests, equipmentPath)
    ];
    blocks.push(sectionBlock(equipmentPath, equipment.displayName, 2, "unnumbered", equipmentBlocks));
  }
  return sectionBlock(path, plannedSection.title, 1, "numbered", blocks);
}

function standardSectionBlock(
  input: AssembleReportDocumentInput,
  index: AssemblyIndex,
  plannedSection: Extract<ReportPlanSection, { kind: "standard" }>,
  sectionIndex: number
): SectionBlock {
  const section = plannedSection.section;
  const path = ["section", sectionIndex, "standard", section] as const;
  let blocks: ReportBlock[] = [];
  if (section === "executive_summary" || section === "key_findings") {
    blocks = analysisBlocks(
      input,
      index,
      input.plan.analysis.requests.filter((request) => request.analysisKind === section && request.scope.kind === "system"),
      path
    );
  } else if (section === "system_performance") {
    const metricRequests = input.plan.evidence.metrics.filter((request) => request.scope.kind === "system");
    const chartRequests = input.plan.evidence.charts.filter((request) => request.origin === "system_kpi");
    blocks = [{
      kind: "kpi",
      blockId: blockId([...path, "system-kpis"]),
      title: "Selected KPIs",
      metricResultIds: resultIds(index, metricRequests.map((request) => request.requestId))
    }, ...chartBlocks(input, index, chartRequests, path)];
  } else if (section === "selected_dashboards") {
    blocks = input.plan.evidence.dashboards.map((request, requestIndex) => {
      const resultId = resultIds(index, [request.requestId])[0]!;
      const result = input.evidencePackage.dashboardResults.find((candidate) => candidate.resultId === resultId)!;
      return {
        kind: "dashboard" as const,
        blockId: blockId([...path, "dashboard", requestIndex, request.requestId]),
        dashboardResultId: resultId,
        caption: result.title
      };
    });
  } else if (section === "fault_summary") {
    const summaryFaultRequests = input.plan.evidence.faults;
    const faultCharts = input.plan.evidence.charts.filter((request) => request.origin === "fault_summary");
    const faultAnalysis = input.plan.analysis.requests.filter((request) => (
      request.analysisKind === "fault_summary" && request.scope.kind === "system"
    ));
    blocks = [{
      kind: "fault",
      blockId: blockId([...path, "fault-summary"]),
      title: "Major Fault Events",
      faultRequestIds: summaryFaultRequests.map((request) => request.requestId),
      faultEventIds: input.evidencePackage.faultEvents.map((event) => event.eventId)
    }, ...chartBlocks(input, index, faultCharts, path), ...analysisBlocks(input, index, faultAnalysis, path)];
  } else if (section === "recommended_actions") {
    blocks = analysisBlocks(
      input,
      index,
      input.plan.analysis.requests.filter((request) => (
        request.analysisKind === "recommendations" && request.scope.kind === "system"
      )),
      path
    );
  } else {
    blocks = appendixTables(input, path);
  }
  const numbering: SectionBlock["numbering"] = section === "appendix"
    ? "appendix"
    : section === "executive_summary" || section === "key_findings"
      ? "unnumbered"
      : "numbered";
  return sectionBlock(path, SECTION_TITLES[section], 1, numbering, blocks);
}

function buildBlocks(input: AssembleReportDocumentInput): ReportBlock[] {
  const index = assemblyIndex(input);
  return input.plan.sections.map((plannedSection, sectionIndex): ReportBlock => {
    if (plannedSection.kind === "cover") {
      return {
        kind: "title",
        blockId: blockId(["section", sectionIndex, "cover"]),
        title: input.plan.spec.title,
        subtitle: `[${input.plan.period.startAt}, ${input.plan.period.endAt}) · ${input.plan.period.timeZone}`
      };
    }
    if (plannedSection.kind === "report_information") {
      const path = ["section", sectionIndex, "report-information"] as const;
      return sectionBlock(path, "Report Information", 1, "unnumbered", informationTables(input, path));
    }
    if (plannedSection.kind === "equipment_group") {
      return equipmentGroupBlock(input, index, plannedSection, sectionIndex);
    }
    return standardSectionBlock(input, index, plannedSection, sectionIndex);
  });
}

function documentWithoutRevision(input: AssembleReportDocumentInput): Omit<ReportDocument, "revisionHash"> {
  return {
    schemaVersion: REPORT_DOCUMENT_SCHEMA_VERSION,
    documentId: input.documentId,
    planId: input.plan.planId,
    planRevision: canonicalReportHash(input.plan),
    projectId: input.plan.projectId,
    assetRevision: input.plan.assetRevision,
    period: structuredClone(input.plan.period),
    evidencePackageId: input.evidencePackage.packageId,
    evidencePackageRevision: input.evidencePackage.revisionHash,
    analysisPackageId: input.analysisPackage.packageId,
    analysisPackageRevision: input.analysisPackage.revisionHash,
    definitionsRevision: evidenceDefinitionRegistryRevision(input.evidenceDefinitions),
    generatedAt: input.generatedAt,
    assembler: {
      assemblerId: REPORT_ASSEMBLER_ID,
      assemblerVersion: REPORT_ASSEMBLER_VERSION
    },
    blocks: buildBlocks(input)
  };
}

export function reportDocumentRevision(
  document: Readonly<ReportDocument> | Omit<ReportDocument, "revisionHash">
): string {
  const { revisionHash: _revisionHash, ...withoutRevision } = document as ReportDocument;
  return canonicalReportHash({
    ...withoutRevision,
    documentId: undefined,
    generatedAt: undefined
  });
}

function expectedDocument(input: AssembleReportDocumentInput): ReportDocument {
  const withoutRevision = documentWithoutRevision(input);
  return {
    ...withoutRevision,
    revisionHash: reportDocumentRevision(withoutRevision)
  };
}

function validateJsonGraph(value: unknown): { issues: ReportValidationIssue[]; fatal: boolean } {
  const issues: ReportValidationIssue[] = [];
  const seen = new WeakSet<object>();
  let nodes = 0;
  let stopped = false;
  const stop = (path: string, code: string, message: string): void => {
    if (stopped) return;
    issues.push(issue(path, code, message));
    stopped = true;
  };
  const visit = (candidate: unknown, path: string, depth: number): void => {
    if (stopped) return;
    nodes += 1;
    if (nodes > MAX_JSON_NODES) {
      stop(path, "document_too_large", "Report document exceeds the maximum structural size.");
      return;
    }
    if (candidate === null || typeof candidate === "boolean") return;
    if (typeof candidate === "string") {
      if (candidate.length > MAX_STRING_LENGTH) {
        stop(path, "string_too_long", `Report strings must not exceed ${MAX_STRING_LENGTH} characters.`);
      }
      return;
    }
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) {
        stop(path, "invalid_number", "Report document numbers must be finite.");
      }
      return;
    }
    if (typeof candidate !== "object") {
      stop(path, "invalid_json_value", "Report documents may contain only plain JSON values.");
      return;
    }
    if (depth > 32) {
      stop(path, "document_too_deep", "Report document object graph is too deeply nested.");
      return;
    }
    if (seen.has(candidate)) {
      stop(path, "cyclic_or_shared_reference", "Report document must be a tree without cyclic or shared object references.");
      return;
    }
    seen.add(candidate);
    if (Array.isArray(candidate)) {
      if (Object.getPrototypeOf(candidate) !== Array.prototype) {
        stop(path, "invalid_json_container", "Report arrays must use the built-in Array prototype.");
        return;
      }
      if (candidate.length > MAX_JSON_NODES - nodes) {
        stop(path, "document_too_large", "Report document exceeds the maximum structural size.");
        return;
      }
      const ownKeys = Reflect.ownKeys(candidate);
      if (ownKeys.length !== candidate.length + 1 || ownKeys.some((key) => (
        typeof key !== "string"
        || (key !== "length" && !/^(0|[1-9][0-9]*)$/u.test(key))
      ))) {
        stop(path, "invalid_json_container", "Report arrays may contain only indexed JSON elements.");
        return;
      }
      for (let index = 0; index < candidate.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(candidate, String(index));
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          stop(`${path}[${index}]`, "invalid_json_container", "Report arrays must be dense data-only JSON arrays.");
          return;
        }
        visit(descriptor.value, `${path}[${index}]`, depth + 1);
        if (stopped) break;
      }
    } else {
      const prototype = Object.getPrototypeOf(candidate);
      if (prototype !== Object.prototype && prototype !== null) {
        stop(path, "invalid_json_container", "Report objects must be plain JSON objects.");
        return;
      }
      const ownKeys = Reflect.ownKeys(candidate);
      if (ownKeys.length > MAX_JSON_NODES - nodes) {
        stop(path, "document_too_large", "Report document exceeds the maximum structural size.");
        return;
      }
      for (const key of ownKeys) {
        if (typeof key !== "string") {
          stop(path, "invalid_json_container", "Report objects may not contain symbol properties.");
          break;
        }
        const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          stop(`${path}.${key}`, "invalid_json_container", "Report objects must contain enumerable data properties only.");
          break;
        }
        visit(descriptor.value, `${path}.${key}`, depth + 1);
        if (stopped) break;
      }
    }
  };
  visit(value, "document", 0);
  return { issues, fatal: stopped };
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  issues: ReportValidationIssue[]
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push(issue(`${path}.${key}`, "unknown_field", "Report document contains an unsupported field."));
  }
}

function requiredText(value: unknown, path: string, issues: ReportValidationIssue[], allowEmpty = false): value is string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim()) || value.length > MAX_STRING_LENGTH) {
    issues.push(issue(path, "invalid_text", `Report text must be ${allowEmpty ? "a" : "a non-empty"} bounded string.`));
    return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function increment(counts: Map<string, number>, id: string): void {
  counts.set(id, (counts.get(id) ?? 0) + 1);
}

function validateStringRefs(
  value: unknown,
  path: string,
  allowed: ReadonlySet<string>,
  counts: Map<string, number>,
  issues: ReportValidationIssue[]
): void {
  if (!Array.isArray(value)) {
    issues.push(issue(path, "invalid_type", "Typed report references must be an array."));
    return;
  }
  const local = new Set<string>();
  for (const [index, candidate] of value.entries()) {
    if (!nonEmpty(candidate) || candidate.length > 512) {
      issues.push(issue(`${path}[${index}]`, "invalid_reference", "Typed report reference is invalid."));
      continue;
    }
    if (!allowed.has(candidate)) {
      issues.push(issue(`${path}[${index}]`, "unknown_reference", "Typed report reference is not present in the validated packages."));
    }
    if (local.has(candidate)) {
      issues.push(issue(`${path}[${index}]`, "duplicate_reference", "Typed report reference is duplicated within its block."));
    }
    local.add(candidate);
    increment(counts, candidate);
  }
}

function validateTableCell(
  value: unknown,
  path: string,
  known: {
    metric: ReadonlySet<string>;
    equipment: ReadonlySet<string>;
    fault: ReadonlySet<string>;
  },
  counts: ReferenceCounts,
  issues: ReportValidationIssue[]
): void {
  if (!isRecord(value) || typeof value.kind !== "string") {
    issues.push(issue(path, "invalid_cell", "Table cell must be a typed report cell."));
    return;
  }
  if (value.kind === "text") {
    exactKeys(value, new Set(["kind", "text"]), path, issues);
    requiredText(value.text, `${path}.text`, issues, true);
    return;
  }
  if (value.kind === "metric_ref") {
    exactKeys(value, new Set(["kind", "metricResultId"]), path, issues);
    const id = value.metricResultId;
    if (!nonEmpty(id) || !known.metric.has(id)) issues.push(issue(`${path}.metricResultId`, "unknown_reference", "Metric result reference is unknown."));
    else increment(counts.metric, id);
    return;
  }
  if (value.kind === "equipment_ref") {
    exactKeys(value, new Set(["kind", "equipmentId"]), path, issues);
    if (!nonEmpty(value.equipmentId) || !known.equipment.has(value.equipmentId)) {
      issues.push(issue(`${path}.equipmentId`, "unknown_reference", "Equipment reference is unknown."));
    }
    return;
  }
  if (value.kind === "fault_ref") {
    exactKeys(value, new Set(["kind", "faultEventId"]), path, issues);
    if (!nonEmpty(value.faultEventId) || !known.fault.has(value.faultEventId)) {
      issues.push(issue(`${path}.faultEventId`, "unknown_reference", "Fault event reference is unknown."));
    }
    return;
  }
  issues.push(issue(`${path}.kind`, "unknown_cell_kind", "Table cell kind is unsupported."));
}

function validateBlockGraph(
  document: Readonly<ReportDocument>,
  input: AssembleReportDocumentInput
): { issues: ReportValidationIssue[]; counts: ReferenceCounts; fatal: boolean } {
  const issues: ReportValidationIssue[] = [];
  const counts: ReferenceCounts = {
    metric: new Map(),
    chart: new Map(),
    dashboard: new Map(),
    faultRequest: new Map(),
    analysis: new Map()
  };
  const known = {
    metric: new Set(input.evidencePackage.metricResults.map((result) => result.resultId)),
    chart: new Set(input.evidencePackage.chartResults.map((result) => result.resultId)),
    dashboard: new Set(input.evidencePackage.dashboardResults.map((result) => result.resultId)),
    fault: new Set(input.evidencePackage.faultEvents.map((event) => event.eventId)),
    faultRequest: new Set(input.plan.evidence.faults.map((request) => request.requestId)),
    analysis: new Set(input.analysisPackage.results.map((result) => result.analysisId)),
    equipment: new Set(input.plan.equipment.map((equipment) => equipment.equipmentId))
  };
  const blockIds = new Set<string>();
  let blockCount = 0;
  let tableRows = 0;
  let stopped = false;
  const stop = (path: string, code: string, message: string): void => {
    if (stopped) return;
    issues.push(issue(path, code, message));
    stopped = true;
  };
  const visit = (candidate: unknown, path: string, depth: number): void => {
    if (stopped) return;
    blockCount += 1;
    if (blockCount > MAX_BLOCKS) {
      stop(path, "too_many_blocks", `Report documents must not exceed ${MAX_BLOCKS} blocks.`);
      return;
    }
    if (depth > MAX_BLOCK_DEPTH) {
      stop(path, "block_depth_exceeded", `Report block nesting must not exceed ${MAX_BLOCK_DEPTH}.`);
      return;
    }
    if (!isRecord(candidate) || typeof candidate.kind !== "string") {
      issues.push(issue(path, "invalid_block", "Report block must be a discriminated object."));
      return;
    }
    if (!SAFE_BLOCK_ID.test(String(candidate.blockId ?? ""))) {
      issues.push(issue(`${path}.blockId`, "invalid_block_id", "Report block ID is invalid."));
    } else if (blockIds.has(candidate.blockId as string)) {
      issues.push(issue(`${path}.blockId`, "duplicate_block_id", "Report block IDs must be globally unique."));
    } else {
      blockIds.add(candidate.blockId as string);
    }
    if (candidate.kind === "title") {
      exactKeys(candidate, new Set(["kind", "blockId", "title", "subtitle"]), path, issues);
      requiredText(candidate.title, `${path}.title`, issues);
      if (candidate.subtitle !== undefined) requiredText(candidate.subtitle, `${path}.subtitle`, issues);
    } else if (candidate.kind === "text") {
      exactKeys(candidate, new Set(["kind", "blockId", "source", "text", "format"]), path, issues);
      if (candidate.source !== "deterministic") issues.push(issue(`${path}.source`, "invalid_source", "Text blocks must be deterministic."));
      if (candidate.format !== "plain" && candidate.format !== "markdown") issues.push(issue(`${path}.format`, "invalid_format", "Text block format is unsupported."));
      requiredText(candidate.text, `${path}.text`, issues, true);
    } else if (candidate.kind === "kpi") {
      exactKeys(candidate, new Set(["kind", "blockId", "title", "metricResultIds"]), path, issues);
      requiredText(candidate.title, `${path}.title`, issues);
      validateStringRefs(candidate.metricResultIds, `${path}.metricResultIds`, known.metric, counts.metric, issues);
    } else if (candidate.kind === "chart") {
      exactKeys(candidate, new Set(["kind", "blockId", "chartResultId", "caption"]), path, issues);
      if (!nonEmpty(candidate.chartResultId) || !known.chart.has(candidate.chartResultId)) {
        issues.push(issue(`${path}.chartResultId`, "unknown_reference", "Chart result reference is unknown."));
      } else increment(counts.chart, candidate.chartResultId);
      if (candidate.caption !== undefined) requiredText(candidate.caption, `${path}.caption`, issues);
    } else if (candidate.kind === "dashboard") {
      exactKeys(candidate, new Set(["kind", "blockId", "dashboardResultId", "caption"]), path, issues);
      if (!nonEmpty(candidate.dashboardResultId) || !known.dashboard.has(candidate.dashboardResultId)) {
        issues.push(issue(`${path}.dashboardResultId`, "unknown_reference", "Dashboard result reference is unknown."));
      } else increment(counts.dashboard, candidate.dashboardResultId);
      if (candidate.caption !== undefined) requiredText(candidate.caption, `${path}.caption`, issues);
    } else if (candidate.kind === "fault") {
      exactKeys(candidate, new Set(["kind", "blockId", "title", "faultRequestIds", "faultEventIds"]), path, issues);
      requiredText(candidate.title, `${path}.title`, issues);
      validateStringRefs(candidate.faultRequestIds, `${path}.faultRequestIds`, known.faultRequest, counts.faultRequest, issues);
      const ignoredCounts = new Map<string, number>();
      validateStringRefs(candidate.faultEventIds, `${path}.faultEventIds`, known.fault, ignoredCounts, issues);
    } else if (candidate.kind === "analysis") {
      exactKeys(candidate, new Set(["kind", "blockId", "title", "analysisResultId"]), path, issues);
      requiredText(candidate.title, `${path}.title`, issues);
      if (!nonEmpty(candidate.analysisResultId) || !known.analysis.has(candidate.analysisResultId)) {
        issues.push(issue(`${path}.analysisResultId`, "unknown_reference", "Analysis result reference is unknown."));
      } else increment(counts.analysis, candidate.analysisResultId);
    } else if (candidate.kind === "table") {
      exactKeys(candidate, new Set(["kind", "blockId", "title", "columns", "rows"]), path, issues);
      if (candidate.title !== undefined) requiredText(candidate.title, `${path}.title`, issues);
      if (!Array.isArray(candidate.columns) || candidate.columns.length === 0 || candidate.columns.length > MAX_TABLE_COLUMNS) {
        issues.push(issue(`${path}.columns`, "invalid_columns", `Tables require 1-${MAX_TABLE_COLUMNS} columns.`));
        return;
      }
      if (!Array.isArray(candidate.rows)) {
        issues.push(issue(`${path}.rows`, "invalid_rows", "Table rows must be an array."));
        return;
      }
      if (candidate.rows.length > MAX_TABLE_ROWS - tableRows) {
        stop(`${path}.rows`, "too_many_rows", `Report tables must not exceed ${MAX_TABLE_ROWS} total rows.`);
        return;
      }
      tableRows += candidate.rows.length;
      const columnKeys: string[] = [];
      for (const [columnIndex, column] of candidate.columns.entries()) {
        const columnPath = `${path}.columns[${columnIndex}]`;
        if (!isRecord(column)) {
          issues.push(issue(columnPath, "invalid_column", "Table column must be an object."));
          continue;
        }
        exactKeys(column, new Set(["key", "label", "alignment"]), columnPath, issues);
        if (!requiredText(column.key, `${columnPath}.key`, issues) || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(column.key)) {
          issues.push(issue(`${columnPath}.key`, "invalid_column_key", "Table column key is invalid."));
        } else if (columnKeys.includes(column.key)) {
          issues.push(issue(`${columnPath}.key`, "duplicate_column", "Table column keys must be unique."));
        } else columnKeys.push(column.key);
        requiredText(column.label, `${columnPath}.label`, issues);
        if (column.alignment !== undefined && !["left", "center", "right"].includes(column.alignment as string)) {
          issues.push(issue(`${columnPath}.alignment`, "invalid_alignment", "Table column alignment is invalid."));
        }
      }
      for (const [rowIndex, row] of candidate.rows.entries()) {
        const rowPath = `${path}.rows[${rowIndex}]`;
        if (!isRecord(row)) {
          issues.push(issue(rowPath, "invalid_row", "Table row must be an object."));
          continue;
        }
        const rowKeys = Object.keys(row).sort();
        if (!canonicalEqual(rowKeys, [...columnKeys].sort())) {
          issues.push(issue(rowPath, "column_mismatch", "Table row cells must exactly match the declared columns."));
        }
        for (const key of columnKeys) validateTableCell(row[key], `${rowPath}.${key}`, known, counts, issues);
      }
    } else if (candidate.kind === "section") {
      exactKeys(candidate, new Set(["kind", "blockId", "title", "level", "numbering", "blocks"]), path, issues);
      requiredText(candidate.title, `${path}.title`, issues);
      if (![1, 2, 3].includes(candidate.level as number)) issues.push(issue(`${path}.level`, "invalid_level", "Section level must be 1, 2, or 3."));
      if (!["unnumbered", "numbered", "appendix"].includes(candidate.numbering as string)) {
        issues.push(issue(`${path}.numbering`, "invalid_numbering", "Section numbering mode is invalid."));
      }
      if (!Array.isArray(candidate.blocks)) {
        issues.push(issue(`${path}.blocks`, "invalid_type", "Section blocks must be an array."));
      } else {
        for (const [childIndex, child] of candidate.blocks.entries()) {
          visit(child, `${path}.blocks[${childIndex}]`, depth + 1);
          if (stopped) break;
        }
      }
    } else if (candidate.kind === "page_break") {
      exactKeys(candidate, new Set(["kind", "blockId"]), path, issues);
    } else {
      issues.push(issue(`${path}.kind`, "unknown_block_kind", "Report block kind is unsupported."));
    }
  };
  if (!Array.isArray(document.blocks)) {
    issues.push(issue("document.blocks", "invalid_type", "Report document blocks must be an array."));
  } else {
    for (const [index, block] of document.blocks.entries()) {
      visit(block, `document.blocks[${index}]`, 1);
      if (stopped) break;
    }
  }
  return { issues, counts, fatal: stopped };
}

function validateExactReferences(
  counts: ReferenceCounts,
  input: AssembleReportDocumentInput
): ReportValidationIssue[] {
  const issues: ReportValidationIssue[] = [];
  const cases: Array<[string, Map<string, number>, string[]]> = [
    ["metric", counts.metric, input.evidencePackage.metricResults.map((result) => result.resultId)],
    ["chart", counts.chart, input.evidencePackage.chartResults.map((result) => result.resultId)],
    ["dashboard", counts.dashboard, input.evidencePackage.dashboardResults.map((result) => result.resultId)],
    ["analysis", counts.analysis, input.analysisPackage.results.map((result) => result.analysisId)]
  ];
  for (const [label, actual, expected] of cases) {
    for (const id of expected) {
      const count = actual.get(id) ?? 0;
      if (count !== 1) {
        issues.push(issue(
          "document.blocks",
          "reference_cardinality_mismatch",
          `Every ${label} reference must appear exactly once; ${id} appears ${count} times.`
        ));
      }
    }
  }
  const summaryCount = input.plan.sections.filter((section) => (
    section.kind === "standard" && section.section === "fault_summary"
  )).length;
  for (const request of input.plan.evidence.faults) {
    const equipmentCount = input.plan.sections.filter((section) => (
      section.kind === "equipment_group" && section.equipmentIds.includes(request.equipmentId)
    )).length;
    const expectedCount = summaryCount + equipmentCount;
    const actualCount = counts.faultRequest.get(request.requestId) ?? 0;
    if (actualCount !== expectedCount) {
      issues.push(issue(
        "document.blocks",
        "reference_cardinality_mismatch",
        `Fault scan ${request.requestId} must appear ${expectedCount} times in its planned summary and equipment blocks; it appears ${actualCount} times.`
      ));
    }
  }
  return issues;
}

function validateDocumentEnvelope(
  input: AssembleReportDocumentInput,
  document: Readonly<ReportDocument>
): ReportValidationIssue[] {
  const issues: ReportValidationIssue[] = [];
  if (!isRecord(document)) return [issue("document", "invalid_type", "Report document must be an object.")];
  exactKeys(document as unknown as Record<string, unknown>, new Set([
    "schemaVersion", "documentId", "planId", "planRevision", "projectId", "assetRevision", "period",
    "evidencePackageId", "evidencePackageRevision", "analysisPackageId", "analysisPackageRevision",
    "definitionsRevision", "generatedAt", "assembler", "revisionHash", "blocks"
  ]), "document", issues);
  const expected = expectedDocument(input);
  if (document.schemaVersion !== REPORT_DOCUMENT_SCHEMA_VERSION) issues.push(issue("document.schemaVersion", "unsupported_schema", `Report document schema ${REPORT_DOCUMENT_SCHEMA_VERSION} is required.`));
  for (const key of [
    "documentId", "planId", "planRevision", "projectId", "assetRevision", "evidencePackageId",
    "evidencePackageRevision", "analysisPackageId", "analysisPackageRevision", "definitionsRevision", "generatedAt"
  ] as const) {
    if (document[key] !== expected[key]) issues.push(issue(`document.${key}`, "document_binding_mismatch", `Report document ${key} does not match its validated inputs.`));
  }
  if (!canonicalEqual(document.period, expected.period)) issues.push(issue("document.period", "period_mismatch", "Report document period does not match the plan."));
  if (!canonicalEqual(document.assembler, expected.assembler)) issues.push(issue("document.assembler", "assembler_mismatch", "Report document assembler provenance is invalid."));
  return issues;
}

export function validateReportDocumentForPackages(
  input: ValidateReportDocumentInput
): ReportValidationResult<ReportDocument> {
  try {
    if (!isRecord(input)) {
      return {
        ok: false,
        issues: [issue("input", "invalid_type", "Report document validation input must be an object.")]
      };
    }
    if (!isRecord(input.document)) {
      return {
        ok: false,
        issues: [issue("document", "invalid_type", "Report document must be an object.")]
      };
    }
    const jsonGraph = validateJsonGraph(input.document);
    if (jsonGraph.fatal) {
      return { ok: false, issues: uniqueIssues(jsonGraph.issues) };
    }
    const upstream = upstreamIssues(input);
    if (upstream.length > 0) {
      return { ok: false, issues: uniqueIssues(upstream) };
    }
    const issues = [...jsonGraph.issues];
    issues.push(...validateDocumentEnvelope(input, input.document));
    const graph = validateBlockGraph(input.document, input);
    issues.push(...graph.issues);
    if (graph.fatal) {
      return { ok: false, issues: uniqueIssues(issues) };
    }
    issues.push(...validateExactReferences(graph.counts, input));
    if (Array.isArray(input.document.blocks) && input.document.blocks.length !== input.plan.sections.length) {
      issues.push(issue("document.blocks", "root_section_cardinality_mismatch", "Document must contain exactly one top-level block per planned section."));
    }
    if (issues.length === 0) {
      const expected = expectedDocument(input);
      if (!canonicalEqual(input.document.blocks, expected.blocks)) {
        issues.push(issue("document.blocks", "block_graph_mismatch", "Document block order, scope, content, or code-injected presentation does not match the plan."));
      }
      if (input.document.revisionHash !== reportDocumentRevision(input.document)) {
        issues.push(issue("document.revisionHash", "revision_hash_mismatch", "Report document revision hash is invalid."));
      }
    }
    if (issues.length > 0) return { ok: false, issues: uniqueIssues(issues) };
    return { ok: true, value: structuredClone(input.document) as ReportDocument };
  } catch {
    return {
      ok: false,
      issues: [issue("input", "validation_exception", "Report document validation could not safely inspect the supplied runtime value.")]
    };
  }
}

export function assembleReportDocument(
  input: AssembleReportDocumentInput
): ReportValidationResult<ReportDocument> {
  try {
    const issues = upstreamIssues(input);
    if (issues.length > 0) return { ok: false, issues };
    const document = expectedDocument(input);
    return validateReportDocumentForPackages({ ...input, document });
  } catch {
    return {
      ok: false,
      issues: [issue("input", "assembly_exception", "Report document assembly could not safely inspect the supplied runtime value.")]
    };
  }
}
