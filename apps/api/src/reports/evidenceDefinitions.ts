import { createHash } from "node:crypto";

import type {
  EvidenceDefinitionReference,
  EvidenceProducerKind,
  FaultSeverity,
  MetricAggregation,
  ReportScope
} from "./contracts.js";
import {
  EVIDENCE_PRODUCER_KINDS,
  type ReportValidationIssue
} from "./contracts.js";

export type ReportScopeKind = ReportScope["kind"];

export type MetricEntityStrategy =
  | "system_entity"
  | "scope_members"
  | "scope_equipment";

export interface MetricEvidenceDefinition extends EvidenceDefinitionReference {
  metricKey: string;
  scopeKind: ReportScopeKind;
  label: string;
  unit: string;
  aggregation: MetricAggregation;
  producerKind: Extract<EvidenceProducerKind, "bms_timeseries" | "derived_metric" | "calculation">;
  entityStrategy: MetricEntityStrategy;
  expectedCadenceSeconds: number;
  minimumCoverage: number;
  systemEntityId?: string;
}

export interface ChartEvidenceDefinition extends EvidenceDefinitionReference {
  chartKey: string;
  scopeKind: ReportScopeKind;
  producerKind: Extract<EvidenceProducerKind, "plot_tool">;
  inputKind: "metrics" | "faults";
  requiredMetricKeys: string[];
}

export interface DashboardEvidenceDefinition extends EvidenceDefinitionReference {
  rendererKey: string;
  producerKind: Extract<EvidenceProducerKind, "dashboard_renderer">;
}

export interface FaultRuleDefinition {
  faultCode: string;
  severity: FaultSeverity;
  detectorId: string;
  detectorVersion: string;
}

export interface FaultEvidenceDefinition extends EvidenceDefinitionReference {
  equipmentType: string;
  producerKind: Extract<EvidenceProducerKind, "fdd_rule">;
  rules: FaultRuleDefinition[];
}

export interface EvidenceDefinitionRegistry {
  metrics: MetricEvidenceDefinition[];
  charts: ChartEvidenceDefinition[];
  dashboards: DashboardEvidenceDefinition[];
  faults: FaultEvidenceDefinition[];
}

function validationIssue(path: string, code: string, message: string): ReportValidationIssue {
  return { path, code, message };
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function validateEvidenceDefinitionRegistry(
  registry: EvidenceDefinitionRegistry
): ReportValidationIssue[] {
  const issues: ReportValidationIssue[] = [];
  if (!registry || typeof registry !== "object") {
    return [validationIssue("evidenceDefinitions", "invalid_type", "Evidence definitions are required.")];
  }
  for (const key of ["metrics", "charts", "dashboards", "faults"] as const) {
    if (!Array.isArray(registry[key])) {
      issues.push(validationIssue(
        `evidenceDefinitions.${key}`,
        "invalid_type",
        `${key} definitions must be an array.`
      ));
    }
  }
  if (issues.length > 0) return issues;

  const definitionIds = new Set<string>();
  const registerReference = (definition: EvidenceDefinitionReference, path: string): void => {
    if (!nonEmpty(definition.definitionId)) {
      issues.push(validationIssue(`${path}.definitionId`, "required", "Definition ID is required."));
    } else if (definitionIds.has(definition.definitionId)) {
      issues.push(validationIssue(
        `${path}.definitionId`,
        "duplicate_definition",
        `Definition ID ${definition.definitionId} is duplicated in the active registry snapshot.`
      ));
    } else {
      definitionIds.add(definition.definitionId);
    }
    if (!nonEmpty(definition.definitionVersion)) {
      issues.push(validationIssue(`${path}.definitionVersion`, "required", "Definition version is required."));
    }
  };

  const metricKeys = new Set<string>();
  for (const [index, definition] of registry.metrics.entries()) {
    const path = `evidenceDefinitions.metrics[${index}]`;
    registerReference(definition, path);
    if (!nonEmpty(definition.metricKey)) {
      issues.push(validationIssue(`${path}.metricKey`, "required", "Metric key is required."));
    }
    if (!["system", "fleet", "equipment"].includes(definition.scopeKind)) {
      issues.push(validationIssue(`${path}.scopeKind`, "invalid_value", "Metric scope kind is invalid."));
    }
    const metricKey = `${definition.scopeKind}\u0000${definition.metricKey}`;
    if (metricKeys.has(metricKey)) {
      issues.push(validationIssue(path, "duplicate_metric_definition", "Metric key and scope are duplicated."));
    }
    metricKeys.add(metricKey);
    if (!nonEmpty(definition.label)) {
      issues.push(validationIssue(`${path}.label`, "required", "Metric label is required."));
    }
    if (typeof definition.unit !== "string") {
      issues.push(validationIssue(`${path}.unit`, "invalid_type", "Metric unit must be a string."));
    }
    if (!["average", "minimum", "maximum", "sum", "count", "duration", "latest", "custom"].includes(definition.aggregation)) {
      issues.push(validationIssue(`${path}.aggregation`, "invalid_value", "Metric aggregation is invalid."));
    }
    if (!["bms_timeseries", "derived_metric", "calculation"].includes(definition.producerKind)) {
      issues.push(validationIssue(`${path}.producerKind`, "invalid_producer", "Metric producer is not deterministic."));
    }
    if (!["system_entity", "scope_members", "scope_equipment"].includes(definition.entityStrategy)) {
      issues.push(validationIssue(`${path}.entityStrategy`, "invalid_value", "Metric entity strategy is invalid."));
    }
    const expectedEntityStrategy = definition.scopeKind === "system"
      ? "system_entity"
      : definition.scopeKind === "fleet"
        ? "scope_members"
        : "scope_equipment";
    if (definition.entityStrategy !== expectedEntityStrategy) {
      issues.push(validationIssue(
        `${path}.entityStrategy`,
        "scope_mismatch",
        `Metric ${definition.scopeKind} scope requires ${expectedEntityStrategy}.`
      ));
    }
    if (!Number.isInteger(definition.expectedCadenceSeconds) || definition.expectedCadenceSeconds < 1) {
      issues.push(validationIssue(
        `${path}.expectedCadenceSeconds`,
        "invalid_value",
        "Expected cadence must be a positive integer."
      ));
    }
    if (!Number.isFinite(definition.minimumCoverage) || definition.minimumCoverage < 0 || definition.minimumCoverage > 1) {
      issues.push(validationIssue(
        `${path}.minimumCoverage`,
        "invalid_value",
        "Minimum coverage must be between 0 and 1."
      ));
    }
    if (definition.entityStrategy === "system_entity" && !nonEmpty(definition.systemEntityId)) {
      issues.push(validationIssue(`${path}.systemEntityId`, "required", "System entity ID is required."));
    }
  }

  const chartKeys = new Set<string>();
  for (const [index, definition] of registry.charts.entries()) {
    const path = `evidenceDefinitions.charts[${index}]`;
    registerReference(definition, path);
    if (!nonEmpty(definition.chartKey)) {
      issues.push(validationIssue(`${path}.chartKey`, "required", "Chart key is required."));
    }
    if (!["system", "fleet", "equipment"].includes(definition.scopeKind)) {
      issues.push(validationIssue(`${path}.scopeKind`, "invalid_value", "Chart scope kind is invalid."));
    }
    const chartKey = `${definition.scopeKind}\u0000${definition.chartKey}`;
    if (chartKeys.has(chartKey)) {
      issues.push(validationIssue(path, "duplicate_chart_definition", "Chart key and scope are duplicated."));
    }
    chartKeys.add(chartKey);
    if (definition.producerKind !== "plot_tool") {
      issues.push(validationIssue(`${path}.producerKind`, "invalid_producer", "Chart producer must be plot_tool."));
    }
    if (!["metrics", "faults"].includes(definition.inputKind)) {
      issues.push(validationIssue(`${path}.inputKind`, "invalid_value", "Chart input kind is invalid."));
    }
    if (!Array.isArray(definition.requiredMetricKeys)) {
      issues.push(validationIssue(`${path}.requiredMetricKeys`, "invalid_type", "Required metric keys must be an array."));
    } else {
      const uniqueMetricKeys = new Set(definition.requiredMetricKeys);
      if (uniqueMetricKeys.size !== definition.requiredMetricKeys.length) {
        issues.push(validationIssue(`${path}.requiredMetricKeys`, "duplicate", "Required metric keys are duplicated."));
      }
      if (definition.inputKind === "metrics" && definition.requiredMetricKeys.length === 0) {
        issues.push(validationIssue(`${path}.requiredMetricKeys`, "required", "Metric charts require explicit metric keys."));
      }
      if (definition.inputKind === "faults" && definition.requiredMetricKeys.length > 0) {
        issues.push(validationIssue(
          `${path}.requiredMetricKeys`,
          "invalid_value",
          "Fault charts cannot declare metric dependencies."
        ));
      }
    }
  }

  const rendererKeys = new Set<string>();
  for (const [index, definition] of registry.dashboards.entries()) {
    const path = `evidenceDefinitions.dashboards[${index}]`;
    registerReference(definition, path);
    if (!nonEmpty(definition.rendererKey)) {
      issues.push(validationIssue(`${path}.rendererKey`, "required", "Dashboard renderer key is required."));
    } else if (rendererKeys.has(definition.rendererKey)) {
      issues.push(validationIssue(path, "duplicate_dashboard_definition", "Dashboard renderer key is duplicated."));
    } else {
      rendererKeys.add(definition.rendererKey);
    }
    if (definition.producerKind !== "dashboard_renderer") {
      issues.push(validationIssue(
        `${path}.producerKind`,
        "invalid_producer",
        "Dashboard producer must be dashboard_renderer."
      ));
    }
  }

  const equipmentTypes = new Set<string>();
  for (const [index, definition] of registry.faults.entries()) {
    const path = `evidenceDefinitions.faults[${index}]`;
    registerReference(definition, path);
    if (!nonEmpty(definition.equipmentType)) {
      issues.push(validationIssue(`${path}.equipmentType`, "required", "Fault equipment type is required."));
    } else if (equipmentTypes.has(definition.equipmentType)) {
      issues.push(validationIssue(path, "duplicate_fault_definition", "Fault equipment type is duplicated."));
    } else {
      equipmentTypes.add(definition.equipmentType);
    }
    if (definition.producerKind !== "fdd_rule") {
      issues.push(validationIssue(`${path}.producerKind`, "invalid_producer", "Fault producer must be fdd_rule."));
    }
    if (!Array.isArray(definition.rules) || definition.rules.length === 0) {
      issues.push(validationIssue(`${path}.rules`, "required", "At least one versioned fault rule is required."));
      continue;
    }
    const faultCodes = new Set<string>();
    for (const [ruleIndex, rule] of definition.rules.entries()) {
      const rulePath = `${path}.rules[${ruleIndex}]`;
      if (!nonEmpty(rule.faultCode)) {
        issues.push(validationIssue(`${rulePath}.faultCode`, "required", "Fault code is required."));
      } else if (faultCodes.has(rule.faultCode)) {
        issues.push(validationIssue(rulePath, "duplicate_fault_rule", "Fault code is duplicated."));
      } else {
        faultCodes.add(rule.faultCode);
      }
      if (!["low", "medium", "high", "critical"].includes(rule.severity)) {
        issues.push(validationIssue(`${rulePath}.severity`, "invalid_value", "Fault severity is invalid."));
      }
      if (!nonEmpty(rule.detectorId)) {
        issues.push(validationIssue(`${rulePath}.detectorId`, "required", "Detector ID is required."));
      }
      if (!nonEmpty(rule.detectorVersion)) {
        issues.push(validationIssue(`${rulePath}.detectorVersion`, "required", "Detector version is required."));
      }
    }
  }
  const allowedProducerKinds = new Set<string>(EVIDENCE_PRODUCER_KINDS);
  for (const definition of [
    ...registry.metrics,
    ...registry.charts,
    ...registry.dashboards,
    ...registry.faults
  ]) {
    if (!allowedProducerKinds.has(definition.producerKind)) {
      issues.push(validationIssue(
        `evidenceDefinitions.${definition.definitionId}.producerKind`,
        "invalid_producer",
        "Evidence definitions may not use an unknown or LLM producer."
      ));
    }
  }
  return issues;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return value;
}

function sortedRegistry(registry: EvidenceDefinitionRegistry): EvidenceDefinitionRegistry {
  const definitionOrder = <T extends EvidenceDefinitionReference>(left: T, right: T): number => (
    compareText(left.definitionId, right.definitionId)
    || compareText(left.definitionVersion, right.definitionVersion)
  );
  return {
    metrics: [...registry.metrics].sort(definitionOrder),
    charts: [...registry.charts].sort(definitionOrder),
    dashboards: [...registry.dashboards].sort(definitionOrder),
    faults: [...registry.faults]
      .map((definition) => ({
        ...definition,
        rules: [...definition.rules].sort((left, right) => (
          compareText(left.faultCode, right.faultCode)
          || compareText(left.detectorId, right.detectorId)
        ))
      }))
      .sort(definitionOrder)
  };
}

export function evidenceDefinitionRegistryRevision(registry: EvidenceDefinitionRegistry): string {
  const encoded = JSON.stringify(canonicalize(sortedRegistry(registry)));
  return `sha256:${createHash("sha256").update(encoded).digest("hex")}`;
}

export function definitionReference(
  definition: EvidenceDefinitionReference
): EvidenceDefinitionReference {
  return {
    definitionId: definition.definitionId,
    definitionVersion: definition.definitionVersion
  };
}

export function findMetricDefinition(
  registry: EvidenceDefinitionRegistry,
  metricKey: string,
  scopeKind: ReportScopeKind
): MetricEvidenceDefinition | undefined {
  return registry.metrics.find((definition) => (
    definition.metricKey === metricKey && definition.scopeKind === scopeKind
  ));
}

export function findChartDefinition(
  registry: EvidenceDefinitionRegistry,
  chartKey: string,
  scopeKind: ReportScopeKind
): ChartEvidenceDefinition | undefined {
  return registry.charts.find((definition) => (
    definition.chartKey === chartKey && definition.scopeKind === scopeKind
  ));
}

export function findDashboardDefinition(
  registry: EvidenceDefinitionRegistry,
  rendererKey = "default"
): DashboardEvidenceDefinition | undefined {
  return registry.dashboards.find((definition) => definition.rendererKey === rendererKey);
}

export function findFaultDefinition(
  registry: EvidenceDefinitionRegistry,
  equipmentType: string
): FaultEvidenceDefinition | undefined {
  return registry.faults.find((definition) => definition.equipmentType === equipmentType);
}
