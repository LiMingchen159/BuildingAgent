import {
  REPORT_PLAN_SCHEMA_VERSION,
  type EquipmentGroupPlan,
  type EquipmentIdentity,
  type EquipmentProfile,
  type PlannedChartRequest,
  type PlannedDashboardRequest,
  type PlannedFaultRequest,
  type PlannedMetricRequest,
  type PlannedAnalysisRequest,
  type ReportEvidencePlan,
  type ReportPlan,
  type ReportPlanSection,
  type ReportScope,
  type ReportSpec,
  type ResolvedSystemChartConfig,
  type ReportValidationIssue,
  type ReportValidationResult,
  type ResolvedReportPeriod,
  deriveDeterministicEquipmentFullName,
  formatEquipmentDisplayName,
  isRfc3339Instant,
  sectionEnabled
} from "./contracts.js";

export interface BuildReportPlanInput {
  planId: string;
  spec: ReportSpec;
  period: ResolvedReportPeriod;
  plannedAt: string;
  equipment: EquipmentIdentity[];
  profiles: EquipmentProfile[];
  /** Optional chart metadata resolved by deterministic KPI/plot registries. */
  resolvedSystemCharts?: ResolvedSystemChartConfig[];
  /** Revision/hash of the asset metadata used to resolve equipment names. */
  assetRevision: string;
}

const naturalIdOrder = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function compareNaturalIdentifiers(left: string, right: string): number {
  const naturalOrder = naturalIdOrder.compare(left, right);
  if (naturalOrder !== 0) return naturalOrder;
  return left < right ? -1 : left > right ? 1 : 0;
}

function issue(path: string, code: string, message: string): ReportValidationIssue {
  return { path, code, message };
}

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

function validatePeriod(
  period: ResolvedReportPeriod,
  spec: ReportSpec,
  issues: ReportValidationIssue[]
): void {
  if (!isRfc3339Instant(period.startAt)) {
    issues.push(issue("period.startAt", "invalid_datetime", "Resolved period startAt must be an ISO-8601 instant."));
  }
  if (!isRfc3339Instant(period.endAt)) {
    issues.push(issue("period.endAt", "invalid_datetime", "Resolved period endAt must be an ISO-8601 instant."));
  }
  if (isRfc3339Instant(period.startAt) && isRfc3339Instant(period.endAt) && Date.parse(period.startAt) >= Date.parse(period.endAt)) {
    issues.push(issue("period.endAt", "invalid_range", "Resolved period endAt must be after startAt."));
  }
  if (period.timeZone !== spec.timeZone) {
    issues.push(issue("period.timeZone", "timezone_mismatch", "Resolved period timezone must match the report specification."));
  }
  if (
    spec.period.kind === "custom"
    && (
      Date.parse(period.startAt) !== Date.parse(spec.period.startAt)
      || Date.parse(period.endAt) !== Date.parse(spec.period.endAt)
    )
  ) {
    issues.push(issue("period", "custom_period_mismatch", "Resolved custom period must match the report specification."));
  }
}

function validateEquipment(
  equipment: EquipmentIdentity[],
  issues: ReportValidationIssue[]
): void {
  for (const [index, item] of equipment.entries()) {
    if (!nonEmpty(item.equipmentId)) {
      issues.push(issue(`equipment[${index}].equipmentId`, "required", "Equipment ID is required."));
    }
    if (!nonEmpty(item.equipmentType)) {
      issues.push(issue(`equipment[${index}].equipmentType`, "required", "Equipment type is required."));
    }
    if (!nonEmpty(item.fullName)) {
      issues.push(issue(`equipment[${index}].fullName`, "required", "Equipment full name is required."));
    }
    if (!nonEmpty(item.nameSourceRef)) {
      issues.push(issue(`equipment[${index}].nameSourceRef`, "required", "Equipment name source reference is required."));
    }
    if (!["semantic_model", "project_metadata", "bms_metadata", "deterministic_fallback"].includes(item.nameSource)) {
      issues.push(issue(`equipment[${index}].nameSource`, "invalid_value", "Equipment name source is invalid."));
    }
    if (item.nameSource === "deterministic_fallback") {
      const expectedFullName = deriveDeterministicEquipmentFullName(item.equipmentId, item.equipmentType);
      if (item.fullName !== expectedFullName) {
        issues.push(issue(
          `equipment[${index}].fullName`,
          "invalid_fallback_name",
          `Fallback equipment name must be derived as ${expectedFullName}.`
        ));
      }
      const expectedSourceRef = `fallback:${item.equipmentType}:${item.equipmentId}`;
      if (item.nameSourceRef !== expectedSourceRef) {
        issues.push(issue(
          `equipment[${index}].nameSourceRef`,
          "invalid_name_source_ref",
          `Fallback name source reference must be ${expectedSourceRef}.`
        ));
      }
    }
    const expectedDisplayName = formatEquipmentDisplayName(item.equipmentId, item.fullName);
    if (item.displayName !== expectedDisplayName) {
      issues.push(issue(
        `equipment[${index}].displayName`,
        "noncanonical_name",
        `Equipment display name must be derived as ${expectedDisplayName}.`
      ));
    }
  }
  for (const equipmentId of duplicates(equipment.map((item) => item.equipmentId))) {
    issues.push(issue("equipment", "duplicate_equipment", `Equipment ID ${equipmentId} appears more than once.`));
  }
}

function validateProfiles(
  profiles: EquipmentProfile[],
  issues: ReportValidationIssue[]
): Map<string, EquipmentProfile> {
  const byType = new Map<string, EquipmentProfile>();
  const profileIds = new Set<string>();
  for (const [index, profile] of profiles.entries()) {
    const path = `profiles[${index}]`;
    if (!nonEmpty(profile.profileId)) {
      issues.push(issue(`${path}.profileId`, "required", "Profile ID is required."));
    } else if (profileIds.has(profile.profileId)) {
      issues.push(issue(`${path}.profileId`, "duplicate_profile_id", `Profile ID ${profile.profileId} is duplicated.`));
    } else {
      profileIds.add(profile.profileId);
    }
    if (!Number.isInteger(profile.version) || profile.version < 1) {
      issues.push(issue(`${path}.version`, "invalid_value", "Profile version must be a positive integer."));
    }
    if (!nonEmpty(profile.equipmentType)) issues.push(issue(`${path}.equipmentType`, "required", "Profile equipment type is required."));
    if (!nonEmpty(profile.groupTitle)) issues.push(issue(`${path}.groupTitle`, "required", "Profile group title is required."));
    if (!Number.isInteger(profile.order) || profile.order < 0) {
      issues.push(issue(`${path}.order`, "invalid_value", "Profile order must be a non-negative integer."));
    }
    for (const [field, keys] of [
      ["fleetMetricKeys", profile.fleetMetricKeys],
      ["fleetChartKeys", profile.fleetChartKeys],
      ["metricKeys", profile.metricKeys],
      ["chartKeys", profile.chartKeys]
    ] as const) {
      for (const [keyIndex, key] of keys.entries()) {
        if (!nonEmpty(key)) issues.push(issue(`${path}.${field}[${keyIndex}]`, "required", `${field} entries must be non-empty.`));
      }
      for (const key of duplicates(keys)) {
        issues.push(issue(`${path}.${field}`, "duplicate", `${field} key ${key} is duplicated.`));
      }
    }
    if (byType.has(profile.equipmentType)) {
      issues.push(issue(`${path}.equipmentType`, "duplicate_profile", `Equipment type ${profile.equipmentType} has multiple profiles.`));
    } else {
      byType.set(profile.equipmentType, profile);
    }
  }
  return byType;
}

function selectedEquipment(
  spec: ReportSpec,
  discovered: EquipmentIdentity[],
  requireEquipment: boolean,
  issues: ReportValidationIssue[]
): EquipmentIdentity[] {
  const byId = new Map(discovered.map((item) => [item.equipmentId, item]));
  let selected: EquipmentIdentity[];
  if (spec.equipment.mode === "selected") {
    selected = [];
    for (const [index, equipmentId] of spec.equipment.equipmentIds.entries()) {
      const item = byId.get(equipmentId);
      if (!item) {
        issues.push(issue(
          `spec.equipment.equipmentIds[${index}]`,
          "equipment_not_found",
          `Selected equipment ${equipmentId} was not discovered.`
        ));
        continue;
      }
      selected.push(item);
    }
  } else {
    const selectedTypes = new Set(spec.equipment.equipmentTypes);
    selected = discovered.filter((item) => selectedTypes.size === 0 || selectedTypes.has(item.equipmentType));
    for (const [index, equipmentType] of spec.equipment.equipmentTypes.entries()) {
      if (!discovered.some((item) => item.equipmentType === equipmentType)) {
        issues.push(issue(
          `spec.equipment.equipmentTypes[${index}]`,
          "equipment_type_not_found",
          `Selected equipment type ${equipmentType} was not discovered.`
        ));
      }
    }
  }
  if (requireEquipment && selected.length === 0) {
    issues.push(issue("equipment", "no_equipment", "The report plan must include at least one discovered equipment item."));
  }
  return selected.sort((left, right) => compareNaturalIdentifiers(left.equipmentId, right.equipmentId));
}

function buildGroups(
  equipment: EquipmentIdentity[],
  profilesByType: Map<string, EquipmentProfile>,
  requireProfiles: boolean,
  issues: ReportValidationIssue[]
): EquipmentGroupPlan[] {
  const byType = new Map<string, EquipmentIdentity[]>();
  for (const item of equipment) {
    const group = byType.get(item.equipmentType) ?? [];
    group.push(item);
    byType.set(item.equipmentType, group);
  }

  const groups: EquipmentGroupPlan[] = [];
  for (const [equipmentType, items] of byType.entries()) {
    const profile = profilesByType.get(equipmentType);
    if (!profile) {
      if (requireProfiles) {
        issues.push(issue(
          "profiles",
          "profile_not_found",
          `No equipment profile exists for selected type ${equipmentType}.`
        ));
      }
      continue;
    }
    groups.push({
      equipmentType,
      profileId: profile.profileId,
      profileVersion: profile.version,
      title: profile.groupTitle,
      equipment: [...items].sort((left, right) => compareNaturalIdentifiers(left.equipmentId, right.equipmentId))
    });
  }
  return groups.sort((left, right) => {
    const leftProfile = profilesByType.get(left.equipmentType)!;
    const rightProfile = profilesByType.get(right.equipmentType)!;
    return leftProfile.order - rightProfile.order
      || compareNaturalIdentifiers(left.equipmentType, right.equipmentType);
  });
}

function equipmentScope(item: EquipmentIdentity): Extract<ReportScope, { kind: "equipment" }> {
  return { kind: "equipment", equipmentId: item.equipmentId, equipmentType: item.equipmentType };
}

function fleetScope(equipmentType: string): Extract<ReportScope, { kind: "fleet" }> {
  return { kind: "fleet", equipmentType };
}

function encodeRequestPart(value: string): string {
  let encoded = "";
  for (let index = 0; index < value.length; index += 1) {
    encoded += value.charCodeAt(index).toString(16).padStart(4, "0");
  }
  return `${value.length.toString(16)}-${encoded}`;
}

function requestId(kind: string, ...parts: string[]): string {
  return `${kind}:${parts.map(encodeRequestPart).join(":")}`;
}

function planSections(spec: ReportSpec, groups: EquipmentGroupPlan[]): ReportPlanSection[] {
  const sections: ReportPlanSection[] = [{ kind: "cover" }, { kind: "report_information" }];
  for (const selection of spec.sections.ordered) {
    if (!selection.enabled) continue;
    const section = selection.section;
    if (section === "equipment_analysis") {
      for (const group of groups) {
        sections.push({
          kind: "equipment_group",
          equipmentType: group.equipmentType,
          profileId: group.profileId,
          profileVersion: group.profileVersion,
          title: group.title,
          equipmentIds: group.equipment.map((item) => item.equipmentId)
        });
      }
    } else {
      sections.push({ kind: "standard", section });
    }
  }
  return sections;
}

function planEvidence(
  spec: ReportSpec,
  equipment: EquipmentIdentity[],
  groups: EquipmentGroupPlan[],
  profilesByType: Map<string, EquipmentProfile>,
  resolvedSystemCharts: ResolvedSystemChartConfig[]
): ReportEvidencePlan {
  const metrics: PlannedMetricRequest[] = [];
  const charts: PlannedChartRequest[] = [];
  const dashboards: PlannedDashboardRequest[] = [];
  const faults: PlannedFaultRequest[] = [];

  if (sectionEnabled(spec.sections, "system_performance")) {
    for (const metricKey of spec.kpiKeys) {
      metrics.push({ requestId: requestId("metric", "system", metricKey), metricKey, scope: { kind: "system" } });
    }
    const metricRequestsByKey = new Map(metrics.map((request) => [request.metricKey, request]));
    for (const chart of resolvedSystemCharts) {
      charts.push({
        requestId: requestId("chart", "system", chart.chartKey),
        origin: "system_kpi",
        chartKey: chart.chartKey,
        scope: { kind: "system" },
        metricKeys: [...chart.metricKeys],
        inputMetricRequestIds: chart.metricKeys.map((metricKey) => metricRequestsByKey.get(metricKey)!.requestId)
      });
    }
  }
  if (sectionEnabled(spec.sections, "selected_dashboards")) {
    for (const dashboardId of spec.dashboardIds) {
      dashboards.push({ requestId: requestId("dashboard", dashboardId), dashboardId });
    }
  }
  if (sectionEnabled(spec.sections, "equipment_analysis")) {
    for (const group of groups) {
      const profile = profilesByType.get(group.equipmentType)!;
      for (const metricKey of profile.fleetMetricKeys) {
        metrics.push({
          requestId: requestId("metric", "fleet", group.equipmentType, metricKey),
          metricKey,
          scope: fleetScope(group.equipmentType),
          profileId: profile.profileId
        });
      }
      for (const chartKey of profile.fleetChartKeys) {
        charts.push({
          requestId: requestId("chart", "fleet", group.equipmentType, chartKey),
          origin: "equipment_profile",
          chartKey,
          scope: fleetScope(group.equipmentType),
          profileId: profile.profileId
        });
      }
      for (const item of group.equipment) {
        for (const metricKey of profile.metricKeys) {
          metrics.push({
            requestId: requestId("metric", "equipment", item.equipmentId, metricKey),
            metricKey,
            scope: equipmentScope(item),
            profileId: profile.profileId
          });
        }
        for (const chartKey of profile.chartKeys) {
          charts.push({
            requestId: requestId("chart", "equipment", item.equipmentId, chartKey),
            origin: "equipment_profile",
            chartKey,
            scope: equipmentScope(item),
            profileId: profile.profileId
          });
        }
      }
    }
  }
  if (
    sectionEnabled(spec.sections, "fault_summary")
    || sectionEnabled(spec.sections, "equipment_analysis")
  ) {
    for (const item of equipment) {
      faults.push({
        requestId: requestId("fault", item.equipmentId),
        equipmentId: item.equipmentId,
        equipmentType: item.equipmentType
      });
    }
  }
  if (sectionEnabled(spec.sections, "fault_summary")) {
    charts.push(
      {
        requestId: requestId("chart", "fault_summary", "distribution"),
        origin: "fault_summary",
        chartKey: "fault_distribution",
        scope: { kind: "system" },
        inputFaultRequestIds: faults.map((request) => request.requestId)
      },
      {
        requestId: requestId("chart", "fault_summary", "timeline"),
        origin: "fault_summary",
        chartKey: "fault_timeline",
        scope: { kind: "system" },
        inputFaultRequestIds: faults.map((request) => request.requestId)
      }
    );
  }
  return { metrics, charts, dashboards, faults };
}

function allEvidenceRequestIds(evidence: ReportEvidencePlan): string[] {
  return [
    ...evidence.metrics,
    ...evidence.charts,
    ...evidence.dashboards,
    ...evidence.faults
  ].map((request) => request.requestId);
}

function equipmentEvidenceRequestIds(
  evidence: ReportEvidencePlan,
  equipmentId: string
): string[] {
  return [
    ...evidence.metrics.filter((request) => request.scope.kind === "equipment" && request.scope.equipmentId === equipmentId),
    ...evidence.charts.filter((request) => request.scope.kind === "equipment" && request.scope.equipmentId === equipmentId),
    ...evidence.faults.filter((request) => request.equipmentId === equipmentId)
  ].map((request) => request.requestId);
}

function fleetEvidenceRequestIds(
  evidence: ReportEvidencePlan,
  equipmentType: string
): string[] {
  return [
    ...evidence.metrics.filter((request) => (
      request.scope.kind === "fleet" && request.scope.equipmentType === equipmentType
    )),
    ...evidence.charts.filter((request) => (
      request.scope.kind === "fleet" && request.scope.equipmentType === equipmentType
    )),
    ...evidence.faults.filter((request) => request.equipmentType === equipmentType)
  ].map((request) => request.requestId);
}

function addAnalysisRequest(
  requests: PlannedAnalysisRequest[],
  issues: ReportValidationIssue[],
  request: Omit<PlannedAnalysisRequest, "evidenceRequestIds">,
  evidenceRequestIds: string[]
): void {
  const uniqueEvidenceRequestIds = [...new Set(evidenceRequestIds)];
  if (uniqueEvidenceRequestIds.length === 0) {
    issues.push(issue(
      `analysis.${request.analysisKind}`,
      "analysis_without_evidence",
      `${request.analysisKind} analysis requires at least one deterministic evidence request.`
    ));
    return;
  }
  requests.push({ ...request, evidenceRequestIds: uniqueEvidenceRequestIds });
}

function planAnalysis(
  spec: ReportSpec,
  groups: EquipmentGroupPlan[],
  profilesByType: Map<string, EquipmentProfile>,
  evidence: ReportEvidencePlan,
  issues: ReportValidationIssue[]
): PlannedAnalysisRequest[] {
  const requests: PlannedAnalysisRequest[] = [];
  const systemEvidenceRequestIds = allEvidenceRequestIds(evidence);
  if (sectionEnabled(spec.sections, "executive_summary")) {
    addAnalysisRequest(requests, issues, {
      requestId: requestId("analysis", "executive_summary", "system"),
      analysisKind: "executive_summary",
      scope: { kind: "system" },
      condition: "always"
    }, systemEvidenceRequestIds);
  }
  if (sectionEnabled(spec.sections, "key_findings")) {
    addAnalysisRequest(requests, issues, {
      requestId: requestId("analysis", "key_findings", "system"),
      analysisKind: "key_findings",
      scope: { kind: "system" },
      condition: "always"
    }, systemEvidenceRequestIds);
  }
  if (sectionEnabled(spec.sections, "equipment_analysis")) {
    for (const group of groups) {
      const profile = profilesByType.get(group.equipmentType)!;
      if (profile.analysis.performance) {
        addAnalysisRequest(requests, issues, {
          requestId: requestId("analysis", "fleet_performance", group.equipmentType),
          analysisKind: "fleet_performance",
          scope: fleetScope(group.equipmentType),
          condition: "always"
        }, fleetEvidenceRequestIds(evidence, group.equipmentType));
        for (const item of group.equipment) {
          addAnalysisRequest(requests, issues, {
            requestId: requestId("analysis", "equipment_performance", item.equipmentId),
            analysisKind: "equipment_performance",
            scope: equipmentScope(item),
            condition: "always"
          }, equipmentEvidenceRequestIds(evidence, item.equipmentId));
        }
      }
    }
  }
  if (sectionEnabled(spec.sections, "fault_summary")) {
    addAnalysisRequest(requests, issues, {
      requestId: requestId("analysis", "fault_summary", "system"),
      analysisKind: "fault_summary",
      scope: { kind: "system" },
      condition: "always"
    }, [
      ...evidence.charts.filter((request) => request.origin === "fault_summary"),
      ...evidence.faults
    ].map((request) => request.requestId));
  }
  if (sectionEnabled(spec.sections, "equipment_analysis")) {
    for (const group of groups) {
      const profile = profilesByType.get(group.equipmentType)!;
      if (!profile.analysis.faultDiagnosis) continue;
      for (const item of group.equipment) {
        addAnalysisRequest(requests, issues, {
          requestId: requestId("analysis", "fault_diagnosis", item.equipmentId),
          analysisKind: "fault_diagnosis",
          scope: equipmentScope(item),
          condition: "when_fault_detected"
        }, evidence.faults
          .filter((request) => request.equipmentId === item.equipmentId)
          .map((request) => request.requestId));
      }
    }
  }
  if (sectionEnabled(spec.sections, "recommended_actions")) {
    addAnalysisRequest(requests, issues, {
      requestId: requestId("analysis", "recommendations", "system"),
      analysisKind: "recommendations",
      scope: { kind: "system" },
      condition: "always"
    }, systemEvidenceRequestIds);
    if (sectionEnabled(spec.sections, "equipment_analysis")) {
      for (const group of groups) {
        for (const item of group.equipment) {
          addAnalysisRequest(requests, issues, {
            requestId: requestId("analysis", "recommendations", item.equipmentId),
            analysisKind: "recommendations",
            scope: equipmentScope(item),
            condition: "when_actionable_evidence"
          }, equipmentEvidenceRequestIds(evidence, item.equipmentId));
        }
      }
    }
  }
  return requests;
}

/**
 * Build a deterministic plan from already-resolved assets and time boundaries.
 * Period resolution, asset discovery, KPI computation, FDD/B-Agent execution, and rendering are out of scope.
 */
export function buildReportPlan(input: BuildReportPlanInput): ReportValidationResult<ReportPlan> {
  const issues: ReportValidationIssue[] = [];
  if (!nonEmpty(input.planId)) issues.push(issue("planId", "required", "Plan ID is required."));
  if (!isRfc3339Instant(input.plannedAt)) {
    issues.push(issue("plannedAt", "invalid_datetime", "plannedAt must be an ISO-8601 instant."));
  }
  if (!nonEmpty(input.assetRevision)) {
    issues.push(issue("assetRevision", "required", "Asset metadata revision is required."));
  }
  validatePeriod(input.period, input.spec, issues);
  validateEquipment(input.equipment, issues);
  const profilesByType = validateProfiles(input.profiles, issues);
  const resolvedSystemCharts = input.resolvedSystemCharts ?? [];
  if (sectionEnabled(input.spec.sections, "system_performance")) {
    const selectedMetricKeys = new Set(input.spec.kpiKeys);
    for (const [index, chart] of resolvedSystemCharts.entries()) {
      if (!nonEmpty(chart.chartKey)) {
        issues.push(issue(`resolvedSystemCharts[${index}].chartKey`, "required", "System chart key is required."));
      }
      if (chart.metricKeys.length === 0) {
        issues.push(issue(`resolvedSystemCharts[${index}].metricKeys`, "required", "System charts require at least one metric key."));
      }
      for (const [metricIndex, metricKey] of chart.metricKeys.entries()) {
        if (!selectedMetricKeys.has(metricKey)) {
          issues.push(issue(
            `resolvedSystemCharts[${index}].metricKeys[${metricIndex}]`,
            "metric_not_selected",
            `System chart metric ${metricKey} is not selected by the report specification.`
          ));
        }
      }
    }
    for (const chartKey of duplicates(resolvedSystemCharts.map((chart) => chart.chartKey))) {
      issues.push(issue("resolvedSystemCharts", "duplicate", `System chart key ${chartKey} is duplicated.`));
    }
  }
  const requireEquipment = sectionEnabled(input.spec.sections, "equipment_analysis")
    || sectionEnabled(input.spec.sections, "fault_summary");
  const equipment = selectedEquipment(input.spec, input.equipment, requireEquipment, issues);
  const groups = buildGroups(
    equipment,
    profilesByType,
    sectionEnabled(input.spec.sections, "equipment_analysis"),
    issues
  );

  if (issues.length > 0) return { ok: false, issues };

  const sections = planSections(input.spec, groups);
  const evidence = planEvidence(input.spec, equipment, groups, profilesByType, resolvedSystemCharts);
  const analysis = {
    requests: planAnalysis(input.spec, groups, profilesByType, evidence, issues)
  };
  if (issues.length > 0) return { ok: false, issues };
  const plan: ReportPlan = {
    schemaVersion: REPORT_PLAN_SCHEMA_VERSION,
    planId: input.planId.trim(),
    spec: structuredClone(input.spec),
    projectId: input.spec.projectId,
    plannedAt: input.plannedAt,
    period: { ...input.period },
    equipment: equipment.map((item) => ({ ...item })),
    equipmentGroups: groups.map((group) => ({
      ...group,
      equipment: group.equipment.map((item) => ({ ...item }))
    })),
    sections,
    evidence,
    analysis,
    assetRevision: input.assetRevision.trim()
  };
  return { ok: true, value: plan };
}
