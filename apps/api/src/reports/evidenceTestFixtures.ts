import type { EquipmentProfile, MetricAggregation } from "./contracts.js";
import type {
  ChartEvidenceDefinition,
  EvidenceDefinitionRegistry,
  FaultEvidenceDefinition,
  MetricEvidenceDefinition,
  ReportScopeKind
} from "./evidenceDefinitions.js";

const SYSTEM_METRICS: Array<[string, string, MetricAggregation]> = [
  ["cooling_energy", "kWh", "sum"],
  ["electricity", "kWh", "sum"],
  ["plant_cop", "", "average"],
  ["kw_per_rt", "kW/RT", "average"]
];

function aggregationFor(metricKey: string): MetricAggregation {
  if (["runtime", "cooling_energy", "electricity"].includes(metricKey)) return "sum";
  if (metricKey === "starts") return "count";
  return "average";
}

function unitFor(metricKey: string): string {
  if (metricKey === "runtime") return "h";
  if (["cooling_energy", "electricity"].includes(metricKey)) return "kWh";
  if (metricKey === "starts") return "count";
  if (metricKey === "average_power") return "kW";
  if (["average_plr", "average_speed"].includes(metricKey)) return "%";
  if (metricKey === "flow") return "L/s";
  if (metricKey === "differential_pressure") return "kPa";
  return "";
}

function metric(
  scopeKind: ReportScopeKind,
  metricKey: string,
  unit = unitFor(metricKey),
  aggregation = aggregationFor(metricKey)
): MetricEvidenceDefinition {
  return {
    definitionId: `fixture-metric:${scopeKind}:${metricKey}`,
    definitionVersion: "1",
    metricKey,
    scopeKind,
    label: metricKey.replaceAll("_", " "),
    unit,
    aggregation,
    producerKind: "derived_metric",
    entityStrategy: scopeKind === "system"
      ? "system_entity"
      : scopeKind === "fleet"
        ? "scope_members"
        : "scope_equipment",
    expectedCadenceSeconds: 900,
    minimumCoverage: 0,
    ...(scopeKind === "system" ? { systemEntityId: "system" } : {})
  };
}

function chart(
  scopeKind: ReportScopeKind,
  chartKey: string,
  requiredMetricKeys: string[] = []
): ChartEvidenceDefinition {
  return {
    definitionId: `fixture-chart:${scopeKind}:${chartKey}`,
    definitionVersion: "1",
    chartKey,
    scopeKind,
    producerKind: "plot_tool",
    inputKind: chartKey.startsWith("fault_") ? "faults" : "metrics",
    requiredMetricKeys
  };
}

function fault(profile: EquipmentProfile): FaultEvidenceDefinition {
  const faultCode = profile.equipmentType === "chiller" ? "LOW_COP" : "TEST_FAULT";
  return {
    definitionId: `fixture-fdd:${profile.equipmentType}`,
    definitionVersion: "1",
    equipmentType: profile.equipmentType,
    producerKind: "fdd_rule",
    rules: [{
      faultCode,
      severity: profile.equipmentType === "chiller" ? "high" : "medium",
      detectorId: `fixture-detector:${profile.equipmentType}`,
      detectorVersion: "1"
    }]
  };
}

export function evidenceDefinitionsFixture(profiles: EquipmentProfile[]): EvidenceDefinitionRegistry {
  const fleetMetricKeys = [...new Set(profiles.flatMap((profile) => profile.fleetMetricKeys))];
  const equipmentMetricKeys = [...new Set(profiles.flatMap((profile) => profile.metricKeys))];
  return {
    metrics: [
      ...SYSTEM_METRICS.map(([metricKey, unit, aggregation]) => metric("system", metricKey, unit, aggregation)),
      ...fleetMetricKeys.map((metricKey) => metric("fleet", metricKey)),
      ...equipmentMetricKeys.map((metricKey) => metric("equipment", metricKey))
    ],
    charts: [
      chart("system", "cooling_demand", ["cooling_energy"]),
      chart("system", "energy_consumption", ["electricity"]),
      chart("system", "system_efficiency", ["plant_cop"]),
      chart("system", "plant_efficiency", ["kw_per_rt"]),
      chart("system", "fault_distribution"),
      chart("system", "fault_timeline"),
      ...profiles.flatMap((profile) => profile.fleetChartKeys.map((chartKey) => (
        chart("fleet", chartKey, [...profile.fleetMetricKeys])
      ))).filter((definition, index, values) => values.findIndex((candidate) => (
        candidate.scopeKind === definition.scopeKind && candidate.chartKey === definition.chartKey
      )) === index),
      ...profiles.flatMap((profile) => profile.chartKeys.map((chartKey) => (
        chart("equipment", chartKey, [...profile.metricKeys])
      ))).filter((definition, index, values) => values.findIndex((candidate) => (
        candidate.scopeKind === definition.scopeKind && candidate.chartKey === definition.chartKey
      )) === index)
    ],
    dashboards: [{
      definitionId: "fixture-dashboard-renderer",
      definitionVersion: "1",
      rendererKey: "default",
      producerKind: "dashboard_renderer"
    }],
    faults: profiles.map((profile) => fault(profile))
  };
}
