import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, unlink, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import type { AgentMemoryStore, MemoryAction, MemoryTarget } from "./memory.js";
import type { SessionSearchIndex } from "../sessionIndex.js";
import {
  looksExecutableMemoryContent,
  type ProjectMemoryProposalBindings
} from "../projectMemoryProposals.js";
import { kbRootForProject, repoRootForProject } from "./knowledgeBase.js";
import { toolCacheManifestRelativePath } from "./toolCacheManifest.js";
import type { ProjectSkillBindings } from "../projectSkills.js";
import type { ProjectGroundingBindings } from "../projectGrounding.js";
import { boundsViolationResult } from "../platformBounds.js";
import { stringArrayArg, type ProjectFeedbackBindings } from "../projectFeedback.js";
import { hasSiteRuleSaveConsent } from "./siteRuleConsent.js";
import type { ChatMessage } from "../seed.js";
import type { AgentSkillRegistry } from "./skills.js";
import { AgentToolRegistry } from "./tools.js";
import type { AgentTool } from "./types.js";
import type { DerivedMetricDependencyInput, DerivedMetricInstance, DerivedMetricStore } from "../derivedMetrics.js";
import type { SchedulerService, ScheduledJob, JobRecurrence } from "../scheduler.js";
import { parseCancelCommand, parseListCommand, parseTimeExpression, nextCronTime } from "../scheduler.js";
import type { ProcessRegistry } from "./processRegistry.js";
import { chartSanityViolation, executeCodeInjectedHeader } from "./chartStyle.js";
import { augmentToolResultForEnvironment } from "./environmentSetup.js";
import { fetchEnteliLiveValue } from "./bmsLiveRead.js";
import { bmsCollectorBaseUrl } from "../bmsCollectorUrl.js";
import { fetchTimeseries, type BmsTimeseriesRow } from "../bmsTimeseries.js";
import {
  alignNumericSeries,
  DEFAULT_DERIVED_METRIC_ALIGNMENT_TOLERANCE_SECONDS,
  normalizeDerivedMetricAlignmentPolicy,
  normalizeDerivedMetricAlignmentToleranceSeconds,
  type DerivedMetricAlignmentPolicy
} from "../derivedMetricAlignment.js";
import { DASHBOARD_GRID_COLUMNS, DASHBOARD_LAYOUT_VERSION, dashboardPath, parseDashboardMutationInput } from "../dashboards.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const MAX_READ_BYTES = 200_000;
const MAX_WRITE_BYTES = 500_000;
const TERMINAL_TIMEOUT_MS = 30_000;
const TERMINAL_MAX_OUTPUT = 100_000;

const TEXT_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".ttl", ".rdf", ".csv", ".json", ".yaml", ".yml", ".xml", ".html", ".htm", ".css", ".js", ".ts", ".tsx", ".jsx", ".py", ".go", ".rs", ".java", ".c", ".h", ".cpp", ".hpp", ".sh", ".bash", ".zsh", ".sql", ".graphql", ".proto", ".toml", ".ini", ".cfg", ".conf", ".env", ".log"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp"]);

function lastUserMessageContent(messages: ChatMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") {
      return message.content ?? "";
    }
  }
  return "";
}

function textArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

function numArg(args: Record<string, unknown>, key: string, fallback: number): number {
  const value = args[key];
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  return fallback;
}

function boolArg(args: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = args[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1", "on"].includes(normalized)) return true;
    if (["false", "no", "0", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function stringValueFrom(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value) return value;
  }
  return "";
}

function optionalBoolValueFrom(record: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    if (typeof record[key] === "boolean") return record[key];
  }
  return undefined;
}

function normalizeDashboardId(value: string, fallback: string): string {
  const source = value || fallback;
  const normalized = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return normalized || fallback;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripEquipmentTitlePrefix(title: string, equipmentLabels: string[]): string {
  const candidates = [...new Set(equipmentLabels.flatMap((label) => [
    label,
    label.replace(/-/g, "_"),
    label.replace(/_/g, "-")
  ]).map((label) => label.trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length);
  let next = title.trim();
  for (const label of candidates) {
    const escaped = escapeRegExp(label);
    if (new RegExp(`^${escaped}$`, "iu").test(next)) return "";
    const stripped = next
      .replace(new RegExp(`^${escaped}(?:\\s*(?:-|:|\\||—|–)\\s*|\\s+)`, "iu"), "")
      .trim();
    if (stripped !== next) {
      next = stripped;
      break;
    }
  }
  return next;
}

function normalizeDashboardBinding(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    const pointName = value.trim();
    return pointName ? { pointName } : null;
  }
  if (!isPlainRecord(value)) return null;

  const pointName = stringValueFrom(value, ["pointName", "point_name", "name", "point"]);
  const objectRef = stringValueFrom(value, ["objectRef", "object_ref", "ref"]);
  const metricInstanceId = stringValueFrom(value, ["metricInstanceId", "metric_instance_id", "instanceId", "instance_id"]);
  const metricKey = stringValueFrom(value, ["metricKey", "metric_key"]);
  const entityId = stringValueFrom(value, ["entityId", "entity_id", "equipmentId", "equipment_id"]);
  const sourceRaw = stringValueFrom(value, ["source", "sourceType", "source_type", "type"]);
  const source = sourceRaw === "derived_metric" || sourceRaw === "derived" || sourceRaw === "metric" || metricInstanceId || metricKey
    ? "derived_metric"
    : sourceRaw === "bms" || sourceRaw === "raw_point" || sourceRaw === "point"
      ? "bms"
      : undefined;
  if (source === "derived_metric" && !metricInstanceId && (!metricKey || !entityId)) return null;
  if (source !== "derived_metric" && !pointName && !objectRef) return null;

  const label = stringValueFrom(value, ["label", "title", "name"]);
  const role = stringValue(value.role);
  const dependencyRole = stringValueFrom(value, ["dependencyRole", "dependency_role", "inputRole", "input_role"]);
  const defaultVisible = optionalBoolValueFrom(value, ["defaultVisible", "default_visible"]);
  const groupId = stringValueFrom(value, ["groupId", "group_id"]);
  const unit = stringValue(value.unit);
  return {
    ...(source ? { source } : {}),
    ...(pointName ? { pointName } : {}),
    ...(objectRef ? { objectRef } : {}),
    ...(metricInstanceId ? { metricInstanceId } : {}),
    ...(metricKey ? { metricKey } : {}),
    ...(entityId ? { entityId } : {}),
    ...(label && label !== pointName ? { label } : {}),
    ...(role ? { role } : {}),
    ...(dependencyRole ? { dependencyRole } : {}),
    ...(defaultVisible !== undefined ? { defaultVisible } : {}),
    ...(groupId ? { groupId } : {}),
    ...(unit ? { unit } : {})
  };
}

function normalizeDashboardWidget(value: unknown, index: number): Record<string, unknown> | null {
  if (!isPlainRecord(value)) return null;
  const kind = stringValue(value.kind);
  const title = stringValueFrom(value, ["title", "name"])
    || (kind === "timeseries_chart"
      ? "Historical trend"
      : kind === "stat_value"
        ? "Current value"
        : kind === "bar_comparison"
          ? "Current comparison"
          : kind === "note"
            ? "Note"
            : "Live values");
  const id = stringValue(value.id) || normalizeDashboardId(title, `widget_${index + 1}`);

  const pointSources: unknown[] = [];
  const directBindings = value.pointBindings ?? value.point_bindings ?? value.bindings;
  if (Array.isArray(directBindings)) {
    pointSources.push(...directBindings);
  }
  for (const key of ["points", "pointNames", "point_names", "names"]) {
    const entries = value[key];
    if (Array.isArray(entries)) pointSources.push(...entries);
  }
  for (const key of ["objectRefs", "object_refs"]) {
    const entries = value[key];
    if (Array.isArray(entries)) {
      pointSources.push(...entries.map((entry) => ({ objectRef: entry })));
    }
  }
  const values = value.values;
  if (Array.isArray(values)) {
    pointSources.push(...values);
  }
  if (isPlainRecord(value.config) && Array.isArray(value.config.points)) {
    pointSources.push(...value.config.points);
  }

  const pointBindings = pointSources
    .map((entry) => normalizeDashboardBinding(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null);

  const defaultTimeRange = stringValueFrom(value, ["defaultTimeRange", "default_time_range", "timeRange", "range"]);
  const tone = stringValue(value.tone);

  return {
    id,
    kind,
    title,
    pointBindings,
    ...(defaultTimeRange ? { defaultTimeRange } : {}),
    ...(kind === "note" ? { content: stringValue(value.content), ...(tone ? { tone } : {}) } : {})
  };
}

function equipmentLabelFromBinding(binding: Record<string, unknown>): string | null {
  const explicit = stringValue(binding.groupId) || stringValue(binding.entityId);
  if (explicit) {
    const normalized = explicit
      .replace(/[_\s]+/g, "-")
      .trim();
    const match = normalized.match(/\b([A-Za-z]{2,8})(?:-?L\d+)?-?0?(\d{1,3})(?=\D|$)/i);
    if (match) {
      const prefix = match[1]?.toUpperCase() ?? "EQ";
      const number = String(Number(match[2])).padStart(2, "0");
      return `${prefix}-${number}`;
    }
    return normalized;
  }
  const source = [
    stringValue(binding.pointName),
    stringValue(binding.label),
    stringValue(binding.objectRef)
  ].find(Boolean) ?? "";
  const match = source.match(/\b([A-Za-z]{2,8})(?:[-_]?L\d+)?[-_]?0?(\d{1,3})(?=\D|$)/i);
  if (!match) return null;
  const prefix = match[1]?.toUpperCase() ?? "EQ";
  const number = String(Number(match[2])).padStart(2, "0");
  return `${prefix}-${number}`;
}

function explicitEquipmentLabelFromWidget(widget: Record<string, unknown>): string | null {
  const bindings = dashboardWidgetBindings(widget);
  for (const binding of bindings) {
    const equipment = equipmentLabelFromBinding(binding);
    if (equipment) return equipment;
  }
  return null;
}

function equipmentLabelFromWidget(widget: Record<string, unknown>): string {
  const equipment = explicitEquipmentLabelFromWidget(widget);
  if (equipment) return equipment;
  return stringValue(widget.title) || stringValue(widget.id);
}

function dashboardWidgetKindRank(widget: Record<string, unknown>): number {
  const kind = stringValue(widget.kind);
  if (kind === "live_value_grid" || kind === "stat_value") return 0;
  if (kind === "bar_comparison") return 1;
  if (kind === "timeseries_chart") return 2;
  return 3;
}

function dashboardWidgetSectionInfo(widget: Record<string, unknown>): Record<string, unknown> {
  const kind = stringValue(widget.kind);
  if (kind === "timeseries_chart") return { id: "trends", title: "Trends", kind: "trends" };
  if (kind === "bar_comparison") return { id: "comparison", title: "Comparison", kind: "comparison" };
  if (kind === "note") return { id: "notes", title: "Notes", kind: "custom" };
  return { id: "overview", title: "Overview", kind: "overview" };
}

function dashboardWidgetBindings(widget: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(widget.pointBindings)
    ? widget.pointBindings.filter((entry): entry is Record<string, unknown> => isPlainRecord(entry))
    : [];
}

function cloneDashboardBindings(bindings: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return bindings.map((binding) => ({ ...binding }));
}

function uniqueDashboardWidgetId(value: string, fallback: string, existingIds: Set<string>): string {
  const base = normalizeDashboardId(value, fallback);
  let candidate = base;
  let index = 2;
  while (existingIds.has(candidate)) {
    candidate = normalizeDashboardId(`${base}_${index}`, `${fallback}_${index}`);
    index += 1;
  }
  existingIds.add(candidate);
  return candidate;
}

function ensureUniqueDashboardWidgetIds(widgets: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const existingIds = new Set<string>();
  return widgets.map((widget, index) => {
    const id = uniqueDashboardWidgetId(stringValue(widget.id), `widget_${index + 1}`, existingIds);
    return { ...widget, id };
  });
}

function sortDashboardWidgets(widgets: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return [...widgets].sort((left, right) => {
    const rankDelta = dashboardWidgetKindRank(left) - dashboardWidgetKindRank(right);
    if (rankDelta !== 0) return rankDelta;
    return equipmentLabelFromWidget(left).localeCompare(equipmentLabelFromWidget(right), undefined, { numeric: true, sensitivity: "base" });
  });
}

function groupedDashboardWidgets(widgets: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const next: Array<Record<string, unknown>> = [];
  let splitAny = false;

  for (const widget of widgets) {
    const kind = stringValue(widget.kind);
    if (kind !== "live_value_grid" && kind !== "stat_value" && kind !== "timeseries_chart") {
      next.push(widget);
      continue;
    }

    const bindings = dashboardWidgetBindings(widget);
    const groups = new Map<string, Array<Record<string, unknown>>>();
    const ungrouped: Array<Record<string, unknown>> = [];

    for (const binding of bindings) {
      const equipment = equipmentLabelFromBinding(binding);
      if (!equipment) {
        ungrouped.push(binding);
        continue;
      }
      groups.set(equipment, [...(groups.get(equipment) ?? []), binding]);
    }

    if (groups.size <= 1) {
      next.push(widget);
      continue;
    }

    splitAny = true;
    const baseTitle = stringValue(widget.title) || (stringValue(widget.kind) === "timeseries_chart" ? "Trend" : "Live");
    const equipmentLabels = [...groups.keys()];
    for (const [equipment, equipmentBindings] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const titlePrefix = stripEquipmentTitlePrefix(
        baseTitle
          .replace(/\ball\s+chillers?\b/iu, "")
          .replace(/所有\s*(chiller|冷机|机组)/iu, "")
          .trim(),
        equipmentLabels
      );
      next.push({
        ...widget,
        id: normalizeDashboardId(`${stringValue(widget.id)}_${equipment}`, `widget_${next.length + 1}`),
        title: `${equipment} ${titlePrefix || (stringValue(widget.kind) === "timeseries_chart" ? "Trend" : "Live")}`,
        pointBindings: equipmentBindings
      });
    }
    if (ungrouped.length > 0) {
      next.push({
        ...widget,
        id: normalizeDashboardId(`${stringValue(widget.id)}_other`, `widget_${next.length + 1}`),
        title: `${baseTitle} Other`,
        pointBindings: ungrouped
      });
    }
  }

  return splitAny ? next : widgets;
}

function dashboardBindingSourceIdentity(binding: Record<string, unknown>): string {
  const source = stringValue(binding.source) || (stringValue(binding.pointName) || stringValue(binding.objectRef) ? "bms" : "");
  return [
    source,
    stringValue(binding.metricInstanceId),
    stringValue(binding.metricKey),
    stringValue(binding.entityId),
    stringValue(binding.pointName),
    stringValue(binding.objectRef)
  ].join("|");
}

function humanizeDashboardIdentifier(value: string): string {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_./-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words
    .map((word) => {
      const upper = word.toUpperCase();
      if (upper.length <= 4) return upper;
      return `${upper.slice(0, 1)}${upper.slice(1).toLowerCase()}`;
    })
    .join(" ");
}

function removeDashboardEquipmentPrefix(value: string): string {
  return value
    .replace(/^\s*[A-Za-z]{2,8}(?:[-_\s]?L\d+)?[-_\s]?0?\d{1,3}\s*(?:[-_:|/]|—)?\s*/iu, "")
    .trim();
}

function semanticSuffixFromDashboardPoint(value: string): string {
  const withoutEquipment = removeDashboardEquipmentPrefix(value)
    .replace(/^[A-Za-z]{2,8}(?:[-_]?L\d+)?[-_]?0?\d{1,3}/iu, "")
    .replace(/^[-_:|/\s]+/u, "")
    .trim();
  return withoutEquipment || value.trim();
}

function dashboardComparisonFamily(binding: Record<string, unknown>): { key: string; label: string; rank: number } {
  const source = stringValue(binding.source);
  const dependencyRole = stringValue(binding.dependencyRole);
  const label = removeDashboardEquipmentPrefix(stringValue(binding.label));
  const role = stringValue(binding.role);
  if (source === "derived_metric" || (dependencyRole === "output" && stringValue(binding.metricKey))) {
    const metricKey = stringValue(binding.metricKey);
    const rawLabel = label || metricKey || role || "system metric";
    return {
      key: `derived:${normalizeDashboardId(metricKey || rawLabel, "derived_output")}`,
      label: humanizeDashboardIdentifier(rawLabel),
      rank: 1
    };
  }

  const pointSuffix = semanticSuffixFromDashboardPoint(stringValue(binding.pointName) || stringValue(binding.objectRef));
  const rawLabel = label || role || pointSuffix || "BMS output";
  return {
    key: `raw:${normalizeDashboardId(role || pointSuffix || rawLabel, "raw_output")}`,
    label: humanizeDashboardIdentifier(rawLabel),
    rank: 0
  };
}

function derivedMetricInstanceForDashboardBinding(
  binding: Record<string, unknown>,
  derivedMetrics: DerivedMetricStore | undefined,
  projectId: string
): DerivedMetricInstance | null {
  if (!derivedMetrics || stringValue(binding.source) !== "derived_metric") return null;
  const instanceId = stringValue(binding.metricInstanceId);
  if (instanceId) return derivedMetrics.getInstance(instanceId);
  const metricKey = stringValue(binding.metricKey);
  const entityId = stringValue(binding.entityId);
  if (!metricKey || !entityId) return null;
  return derivedMetrics.lookup({ projectId, metricKey, entityId, limit: 1 })[0] ?? null;
}

function annotateDerivedMetricOutputBinding(
  binding: Record<string, unknown>,
  instance: DerivedMetricInstance
): Record<string, unknown> {
  return {
    ...binding,
    source: "derived_metric",
    metricInstanceId: stringValue(binding.metricInstanceId) || instance.instanceId,
    metricKey: stringValue(binding.metricKey) || instance.metricKey,
    entityId: stringValue(binding.entityId) || instance.entityId,
    groupId: stringValue(binding.groupId) || instance.entityId,
    label: stringValue(binding.label) || instance.displayName,
    role: stringValue(binding.role) || "output",
    dependencyRole: stringValue(binding.dependencyRole) || "output",
    defaultVisible: typeof binding.defaultVisible === "boolean" ? binding.defaultVisible : true,
    unit: stringValue(binding.unit) || instance.unit
  };
}

function enrichWidgetDerivedMetricBindings(
  widget: Record<string, unknown>,
  derivedMetrics: DerivedMetricStore | undefined,
  projectId: string
): Record<string, unknown> {
  if (!derivedMetrics) return widget;
  const kind = stringValue(widget.kind);
  const includeAuditInputs = kind === "live_value_grid" || kind === "timeseries_chart";
  const bindings = dashboardWidgetBindings(widget);
  if (bindings.length === 0) return widget;

  const nextBindings: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const binding of bindings) {
    const instance = derivedMetricInstanceForDashboardBinding(binding, derivedMetrics, projectId);
    if (!instance) {
      const key = dashboardBindingSourceIdentity(binding);
      if (!seen.has(key)) {
        seen.add(key);
        nextBindings.push(binding);
      }
      continue;
    }

    const outputBinding = annotateDerivedMetricOutputBinding(binding, instance);
    const outputKey = dashboardBindingSourceIdentity(outputBinding);
    if (!seen.has(outputKey)) {
      seen.add(outputKey);
      nextBindings.push(outputBinding);
    }
    if (!includeAuditInputs) continue;

    for (const inputBinding of derivedMetricInputDashboardBindings(instance.entityId, derivedMetricInstanceDependencyInputs(instance))) {
      const enrichedInput = {
        ...inputBinding,
        defaultVisible: kind === "timeseries_chart" ? false : true
      };
      const inputKey = dashboardBindingSourceIdentity(enrichedInput);
      if (seen.has(inputKey)) continue;
      seen.add(inputKey);
      nextBindings.push(enrichedInput);
    }
  }

  return { ...widget, pointBindings: nextBindings };
}

function enrichDashboardDerivedMetricBindings(
  widgets: Array<Record<string, unknown>>,
  derivedMetrics: DerivedMetricStore | undefined,
  projectId: string
): Array<Record<string, unknown>> {
  return widgets.map((widget) => enrichWidgetDerivedMetricBindings(widget, derivedMetrics, projectId));
}

function mergeEquipmentOverviewWidgets(widgets: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const overviewGroups = new Map<string, Array<Record<string, unknown>>>();
  for (const widget of widgets) {
    const kind = stringValue(widget.kind);
    if (kind !== "live_value_grid" && kind !== "stat_value") continue;
    const equipment = explicitEquipmentLabelFromWidget(widget);
    if (!equipment) continue;
    overviewGroups.set(equipment, [...(overviewGroups.get(equipment) ?? []), widget]);
  }

  const mergedEquipment = new Set(
    [...overviewGroups.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([equipment]) => equipment)
  );
  if (mergedEquipment.size === 0) return widgets;

  const emitted = new Set<string>();
  return widgets.flatMap((widget) => {
    const kind = stringValue(widget.kind);
    if (kind !== "live_value_grid" && kind !== "stat_value") return [widget];
    const equipment = explicitEquipmentLabelFromWidget(widget);
    if (!equipment || !mergedEquipment.has(equipment)) return [widget];
    if (emitted.has(equipment)) return [];
    emitted.add(equipment);

    const seen = new Set<string>();
    const pointBindings = (overviewGroups.get(equipment) ?? [])
      .flatMap((entry) => dashboardWidgetBindings(entry))
      .filter((binding) => {
        const key = dashboardBindingSourceIdentity(binding);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((binding) => ({ ...binding }));

    return [{
      ...widget,
      id: normalizeDashboardId(`${equipment}_overview`, `${stringValue(widget.id)}_overview`),
      kind: "live_value_grid",
      title: `${equipment} Overview`,
      pointBindings
    }];
  });
}

function mergeEquipmentTrendWidgets(widgets: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const trendGroups = new Map<string, Array<Record<string, unknown>>>();
  for (const widget of widgets) {
    if (stringValue(widget.kind) !== "timeseries_chart") continue;
    const equipment = explicitEquipmentLabelFromWidget(widget);
    if (!equipment) continue;
    trendGroups.set(equipment, [...(trendGroups.get(equipment) ?? []), widget]);
  }

  const mergedEquipment = new Set(
    [...trendGroups.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([equipment]) => equipment)
  );
  if (mergedEquipment.size === 0) return widgets;

  const emitted = new Set<string>();
  return widgets.flatMap((widget) => {
    if (stringValue(widget.kind) !== "timeseries_chart") return [widget];
    const equipment = explicitEquipmentLabelFromWidget(widget);
    if (!equipment || !mergedEquipment.has(equipment)) return [widget];
    if (emitted.has(equipment)) return [];
    emitted.add(equipment);

    const seen = new Set<string>();
    const pointBindings = (trendGroups.get(equipment) ?? [])
      .flatMap((entry) => dashboardWidgetBindings(entry))
      .filter((binding) => {
        const key = dashboardBindingSourceIdentity(binding);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((binding) => ({ ...binding }));

    return [{
      ...widget,
      id: normalizeDashboardId(`${equipment}_trend`, `${stringValue(widget.id)}_trend`),
      kind: "timeseries_chart",
      title: `${equipment} Trends`,
      pointBindings,
      defaultTimeRange: stringValue(widget.defaultTimeRange) || "24h"
    }];
  });
}

function expandDerivedComparisonWidgets(widgets: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const outputGroups = new Map<string, Array<Record<string, unknown>>>();
  for (const widget of widgets) {
    const kind = stringValue(widget.kind);
    if (kind !== "live_value_grid" && kind !== "stat_value") continue;
    const equipment = explicitEquipmentLabelFromWidget(widget);
    if (!equipment) continue;
    const outputs = dashboardWidgetBindings(widget).filter((binding) => stringValue(binding.dependencyRole) !== "input");
    if (!outputs.some((binding) => stringValue(binding.source) === "derived_metric" || stringValue(binding.dependencyRole) === "output")) continue;
    outputGroups.set(equipment, outputs.map((binding) => ({ ...binding })));
  }
  if (outputGroups.size <= 1) return widgets;

  const families = new Map<string, {
    key: string;
    label: string;
    rank: number;
    bindings: Array<Record<string, unknown>>;
  }>();
  for (const [, bindings] of [...outputGroups.entries()].sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }))) {
    for (const binding of bindings) {
      const family = dashboardComparisonFamily(binding);
      const existing = families.get(family.key) ?? { ...family, bindings: [] };
      if (!existing.bindings.some((candidate) => dashboardBindingSourceIdentity(candidate) === dashboardBindingSourceIdentity(binding))) {
        existing.bindings.push({ ...binding });
      }
      families.set(family.key, existing);
    }
  }
  if (families.size === 0) return widgets;

  const sortedFamilies = [...families.values()]
    .filter((family) => family.bindings.length > 0)
    .sort((left, right) => left.rank - right.rank || left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: "base" }));
  const titleBaseFor = (widget: Record<string, unknown>) => {
    const title = stringValue(widget.title) || "Latest comparison";
    return title
      .replace(/\s+[—-]\s+.*\bvs\b.*$/iu, "")
      .replace(/\s+\bvs\b.*$/iu, "")
      .trim() || title;
  };

  return widgets.flatMap((widget) => {
    if (stringValue(widget.kind) !== "bar_comparison") return [widget];
    const bindings = dashboardWidgetBindings(widget);
    if (!bindings.some((binding) => stringValue(binding.source) === "derived_metric" || stringValue(binding.dependencyRole) === "output")) {
      return [widget];
    }
    const requestedFamilyKeys = new Set(bindings.map((binding) => dashboardComparisonFamily(binding).key));
    const selectedFamilies = sortedFamilies.filter((family) => requestedFamilyKeys.has(family.key));
    const familiesToRender = selectedFamilies.length > 0 ? selectedFamilies : sortedFamilies;
    const hasMixedFamilies = familiesToRender.length > 1;
    const baseTitle = titleBaseFor(widget);

    return familiesToRender.map((family, index) => ({
      ...widget,
      id: index === 0
        ? stringValue(widget.id)
        : normalizeDashboardId(`${stringValue(widget.id)}_${family.key}`, `comparison_${index + 1}`),
      title: hasMixedFamilies ? `${baseTitle} — ${family.label}` : stringValue(widget.title),
      pointBindings: family.bindings.map((binding) => ({ ...binding }))
    }));
  });
}

function widgetsByEquipment(widgets: Array<Record<string, unknown>>): Map<string, Array<Record<string, unknown>>> {
  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const widget of widgets) {
    const kind = stringValue(widget.kind);
    if (kind === "note") continue;
    const equipment = explicitEquipmentLabelFromWidget(widget);
    if (!equipment) continue;
    groups.set(equipment, [...(groups.get(equipment) ?? []), widget]);
  }
  return groups;
}

function synthesizeDashboardWidget(
  kind: "live_value_grid" | "timeseries_chart",
  equipment: string,
  sourceWidget: Record<string, unknown>,
  existingIds: Set<string>
): Record<string, unknown> | null {
  const bindings = dashboardWidgetBindings(sourceWidget);
  if (bindings.length === 0) return null;
  const titleBase = equipment || stringValue(sourceWidget.title) || "Equipment";
  if (kind === "timeseries_chart") {
    return {
      id: uniqueDashboardWidgetId(`${titleBase}_trend`, `trend_${existingIds.size + 1}`, existingIds),
      kind,
      title: `${titleBase} Trends`,
      pointBindings: cloneDashboardBindings(bindings),
      defaultTimeRange: "24h"
    };
  }
  return {
    id: uniqueDashboardWidgetId(`${titleBase}_overview`, `overview_${existingIds.size + 1}`, existingIds),
    kind,
    title: `${titleBase} Overview`,
    pointBindings: cloneDashboardBindings(bindings)
  };
}

function ensureDefaultDashboardWidgets(
  widgets: Array<Record<string, unknown>>,
  args: Record<string, unknown>
): Array<Record<string, unknown>> {
  const includeOverview = args.includeOverview !== false;
  const includeTrends = args.includeTrends !== false;
  const next = widgets.map((widget) => ({ ...widget }));
  const existingIds = new Set(next.map((widget) => stringValue(widget.id)).filter(Boolean));

  if (includeOverview) {
    const equipmentGroups = widgetsByEquipment(next);
    for (const [equipment, equipmentWidgets] of equipmentGroups) {
      const hasOverview = equipmentWidgets.some((widget) => {
        const kind = stringValue(widget.kind);
        return kind === "live_value_grid" || kind === "stat_value";
      });
      if (hasOverview) continue;
      const source = equipmentWidgets.find((widget) => stringValue(widget.kind) === "timeseries_chart")
        ?? equipmentWidgets.find((widget) => stringValue(widget.kind) === "bar_comparison");
      if (!source) continue;
      const overviewWidget = synthesizeDashboardWidget("live_value_grid", equipment, source, existingIds);
      if (overviewWidget) next.push(overviewWidget);
    }
  }

  if (includeTrends) {
    const equipmentGroups = widgetsByEquipment(next);
    for (const [equipment, equipmentWidgets] of equipmentGroups) {
      const hasTrend = equipmentWidgets.some((widget) => stringValue(widget.kind) === "timeseries_chart");
      if (hasTrend) continue;
      const source = equipmentWidgets.find((widget) => {
        const kind = stringValue(widget.kind);
        return kind === "live_value_grid" || kind === "stat_value";
      }) ?? equipmentWidgets.find((widget) => stringValue(widget.kind) === "bar_comparison");
      if (!source) continue;
      const trendWidget = synthesizeDashboardWidget("timeseries_chart", equipment, source, existingIds);
      if (trendWidget) next.push(trendWidget);
    }
  }

  return next;
}

function preferredDashboardLayoutSize(widget: Record<string, unknown>): { w: number; h: number } {
  const kind = stringValue(widget.kind);
  const bindingCount = Array.isArray(widget.pointBindings) ? widget.pointBindings.length : 0;
  if (kind === "timeseries_chart") return { w: 6, h: 4 };
  if (kind === "bar_comparison") return { w: 6, h: Math.max(3, Math.min(6, 3 + Math.ceil(Math.max(0, bindingCount - 8) / 4))) };
  if (kind === "live_value_grid") return { w: 3, h: bindingCount > 2 ? 3 : 2 };
  return { w: 3, h: 2 };
}

function fallbackDashboardLayout(widgets: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const fallback: Array<Record<string, unknown>> = [];
  let x = 0;
  let y = 0;
  let rowHeight = 1;
  let currentRank: number | null = null;

  for (const widget of widgets) {
    const widgetId = stringValue(widget.id);
    if (!widgetId) continue;
    const rank = dashboardWidgetKindRank(widget);
    if (currentRank !== null && rank !== currentRank && x > 0) {
      y += rowHeight;
      x = 0;
      rowHeight = 1;
    }
    currentRank = rank;

    const preferred = preferredDashboardLayoutSize(widget);
    const w = Math.min(DASHBOARD_GRID_COLUMNS, preferred.w);
    const h = preferred.h;
    if (x + w > DASHBOARD_GRID_COLUMNS) {
      y += rowHeight;
      x = 0;
      rowHeight = 1;
    }
    fallback.push({ widgetId, x, y, w, h });
    x += w;
    rowHeight = Math.max(rowHeight, h);
    if (x >= DASHBOARD_GRID_COLUMNS) {
      x = 0;
      y += rowHeight;
      rowHeight = 1;
    }
  }
  return fallback;
}

function normalizedDashboardSectionKind(id: string, value: string): string {
  if (value === "overview" || value === "comparison" || value === "trends" || value === "custom") return value;
  if (id === "overview") return "overview";
  if (id === "comparison") return "comparison";
  if (id === "trends") return "trends";
  return "custom";
}

function normalizeDashboardSections(
  widgets: Array<Record<string, unknown>>,
  args: Record<string, unknown>
): Array<Record<string, unknown>> {
  const widgetIds = new Set(widgets.map((widget) => stringValue(widget.id)).filter(Boolean));
  const usedWidgetIds = new Set<string>();
  const sections: Array<Record<string, unknown>> = [];

  if (Array.isArray(args.sections)) {
    const usedSectionIds = new Set<string>();
    for (const sectionValue of args.sections) {
      if (!isPlainRecord(sectionValue)) continue;
      const rawId = stringValue(sectionValue.id) || stringValue(sectionValue.title);
      const id = normalizeDashboardId(rawId, `section_${sections.length + 1}`);
      if (!id || usedSectionIds.has(id)) continue;
      const title = stringValue(sectionValue.title) || (id === "overview"
        ? "Overview"
        : id === "comparison"
          ? "Comparison"
          : id === "trends"
            ? "Trends"
            : "Notes");
      const kind = normalizedDashboardSectionKind(id, stringValue(sectionValue.kind));
      const widgetIdsForSection = Array.isArray(sectionValue.widgetIds)
        ? sectionValue.widgetIds
          .map((entry) => stringValue(entry))
          .filter((entry) => entry && widgetIds.has(entry) && !usedWidgetIds.has(entry))
        : [];
      if (widgetIdsForSection.length === 0) continue;
      for (const widgetId of widgetIdsForSection) usedWidgetIds.add(widgetId);
      usedSectionIds.add(id);
      sections.push({
        id,
        title,
        kind,
        widgetIds: widgetIdsForSection,
        ...(typeof sectionValue.collapsed === "boolean" ? { collapsed: sectionValue.collapsed } : {})
      });
    }
  }

  for (const widget of widgets) {
    const widgetId = stringValue(widget.id);
    if (!widgetId || usedWidgetIds.has(widgetId)) continue;
    const info = dashboardWidgetSectionInfo(widget);
    const sectionId = stringValue(info.id);
    let section = sections.find((candidate) => stringValue(candidate.id) === sectionId);
    if (!section) {
      section = { ...info, widgetIds: [] };
      sections.push(section);
    }
    (section.widgetIds as string[]).push(widgetId);
    usedWidgetIds.add(widgetId);
  }

  const sectionRank = (section: Record<string, unknown>) => {
    const id = stringValue(section.id);
    if (id === "overview") return 0;
    if (id === "comparison") return 1;
    if (id === "trends") return 2;
    if (id === "notes") return 3;
    return 4;
  };

  return sections
    .filter((section) => Array.isArray(section.widgetIds) && section.widgetIds.length > 0)
    .sort((left, right) => sectionRank(left) - sectionRank(right) || stringValue(left.title).localeCompare(stringValue(right.title)));
}

function normalizeDashboardCreateArgs(
  args: Record<string, unknown>,
  derivedMetrics?: DerivedMetricStore,
  projectId = ""
): Record<string, unknown> {
  const normalizedWidgets = Array.isArray(args.widgets)
    ? args.widgets
      .map((entry, index) => normalizeDashboardWidget(entry, index))
      .filter((entry): entry is Record<string, unknown> => entry !== null)
    : [];
  const groupedWidgets = groupedDashboardWidgets(ensureUniqueDashboardWidgetIds(normalizedWidgets));
  const overviewMergedWidgets = ensureUniqueDashboardWidgetIds(mergeEquipmentOverviewWidgets(groupedWidgets));
  const defaultedWidgets = ensureDefaultDashboardWidgets(overviewMergedWidgets, args);
  const enrichedWidgets = enrichDashboardDerivedMetricBindings(defaultedWidgets, derivedMetrics, projectId);
  const regroupedWidgets = groupedDashboardWidgets(ensureUniqueDashboardWidgetIds(enrichedWidgets));
  const remergedOverviewWidgets = ensureUniqueDashboardWidgetIds(mergeEquipmentOverviewWidgets(regroupedWidgets));
  const remergedWidgets = ensureUniqueDashboardWidgetIds(mergeEquipmentTrendWidgets(remergedOverviewWidgets));
  const comparisonExpandedWidgets = ensureUniqueDashboardWidgetIds(expandDerivedComparisonWidgets(remergedWidgets));
  const widgets = sortDashboardWidgets(comparisonExpandedWidgets);
  return {
    ...args,
    layoutVersion: DASHBOARD_LAYOUT_VERSION,
    widgets,
    layout: fallbackDashboardLayout(widgets),
    sections: normalizeDashboardSections(widgets, args)
  };
}

function resolveSafePath(baseRoot: string, requested: string): string | null {
  const resolved = path.resolve(baseRoot, requested);
  const normalized = path.normalize(resolved);
  if (!normalized.startsWith(baseRoot + path.sep) && normalized !== baseRoot) {
    return null;
  }
  return normalized;
}

function pythonExecutable(): string {
  const configured = process.env.PYTHON?.trim();
  if (configured) {
    return configured;
  }
  return process.platform === "win32" ? "python" : "python3";
}

function projectFileRoots(projectId: string): { kbRoot: string; repoRoot: string } {
  return {
    kbRoot: kbRootForProject(projectId),
    repoRoot: repoRootForProject(projectId)
  };
}

type ScopedRoot = "kb" | "repo";

interface ResolvedProjectPath {
  root: ScopedRoot;
  relativePath: string;
  absolutePath: string;
}

function normalizeRelativePath(requested: string): string {
  return requested.replace(/\\/g, "/").replace(/^\/+/, "");
}

function parseScopedPath(requested: string): { scope: ScopedRoot | null; relativePath: string } {
  const trimmed = requested.trim();
  if (/^kb:\//i.test(trimmed)) {
    return { scope: "kb", relativePath: normalizeRelativePath(trimmed.replace(/^kb:\//i, "")) };
  }
  if (/^repo:\//i.test(trimmed)) {
    return { scope: "repo", relativePath: normalizeRelativePath(trimmed.replace(/^repo:\//i, "")) };
  }
  return { scope: null, relativePath: normalizeRelativePath(trimmed) };
}

function formatScopedPath(root: ScopedRoot, relativePath: string): string {
  return `${root}:/${relativePath}`;
}

function resolveReadPath(projectId: string, requested: string): ResolvedProjectPath | null {
  const { kbRoot, repoRoot } = projectFileRoots(projectId);
  const parsed = parseScopedPath(requested);
  const candidates: Array<{ root: ScopedRoot; base: string }> =
    parsed.scope === "kb" ? [{ root: "kb", base: kbRoot }]
      : parsed.scope === "repo" ? [{ root: "repo", base: repoRoot }]
        : [{ root: "kb", base: kbRoot }, { root: "repo", base: repoRoot }];

  for (const candidate of candidates) {
    if (!existsSync(candidate.base)) continue;
    const safe = resolveSafePath(candidate.base, parsed.relativePath);
    if (safe && existsSync(safe)) {
      return {
        root: candidate.root,
        relativePath: parsed.relativePath,
        absolutePath: safe
      };
    }
  }
  return null;
}

function resolveRepoWritePath(projectId: string, requested: string): ResolvedProjectPath | null {
  const { repoRoot } = projectFileRoots(projectId);
  const parsed = parseScopedPath(requested);
  if (parsed.scope === "kb") {
    return null;
  }
  const safe = resolveSafePath(repoRoot, parsed.relativePath);
  if (!safe) {
    return null;
  }
  return {
    root: "repo",
    relativePath: parsed.relativePath,
    absolutePath: safe
  };
}

function terminalCommandGuard(command: string): { error: string } | null {
  const normalized = command.replace(/\r\n/g, "\n");
  if (/python\s+-\s+<<['"]?PY['"]?/i.test(normalized)) {
    return {
      error: "Bash heredoc syntax (`python - <<'PY'`) is not supported in this Windows PowerShell environment. Use the execute_code tool for Python snippets, or run Python with a real script file."
    };
  }
  if (/\/mnt\/data|\/workspace|\/app/.test(normalized)) {
    return {
      error: "This command is probing Linux/container paths (`/mnt/data`, `/workspace`, `/app`) that do not match this local project runtime. Use `os.environ['KB_DIR']` for source data and `os.environ['OUTPUT_DIR']` for generated outputs."
    };
  }
  return null;
}

function collectGeneratedImages(outputFiles: Array<{ path: string; name: string; sizeBytes: number }>, source: string): Array<Record<string, string>> {
  return outputFiles
    .filter((file) => IMAGE_EXTENSIONS.has(path.extname(file.name).toLowerCase()))
    .map((file) => ({
      src: file.path,
      alt: path.parse(file.name).name,
      filename: file.name,
      capturedAt: new Date().toISOString(),
      source
    }));
}

async function syncAndListOutputFiles(outputDir: string, kbRoot: string): Promise<{ files: Array<{ path: string; name: string; sizeBytes: number; modifiedAtMs: number }>; synced: string[] }> {
  // 1. Ensure outputs/ exists
  await mkdir(outputDir, { recursive: true });

  // 2. Migrate any files wrongly written to kb/outputs/ → repository/outputs/
  const synced: string[] = [];
  const kbOutputsDir = path.join(kbRoot, "outputs");
  try {
    const kbFiles = await readdir(kbOutputsDir, { withFileTypes: true });
    for (const c of kbFiles) {
      if (!c.isFile()) continue;
      const src = path.join(kbOutputsDir, c.name);
      const dst = path.join(outputDir, c.name);
      try {
        await copyFile(src, dst);
        synced.push(c.name);
      } catch { /* skip */ }
    }
  } catch { /* kb/outputs may not exist */ }

  // 3. List all files now in repository/outputs/
  const files: Array<{ path: string; name: string; sizeBytes: number; modifiedAtMs: number }> = [];
  try {
    const children = await readdir(outputDir, { withFileTypes: true });
    for (const c of children) {
      if (!c.isFile()) continue;
      try {
        const info = await stat(path.join(outputDir, c.name));
        files.push({ path: `outputs/${c.name}`, name: c.name, sizeBytes: info.size, modifiedAtMs: info.mtimeMs });
      } catch { /* skip */ }
    }
  } catch { /* output dir may not exist */ }

  return { files, synced };
}

function collectFreshGeneratedImages(
  outputFiles: Array<{ path: string; name: string; sizeBytes: number; modifiedAtMs: number }>,
  source: string,
  startedAtMs: number
): Array<Record<string, string>> {
  return collectGeneratedImages(
    outputFiles.filter((file) => file.modifiedAtMs >= startedAtMs - 1000),
    source
  );
}

function collectFreshGeneratedDownloads(
  outputFiles: Array<{ path: string; name: string; sizeBytes: number; modifiedAtMs: number }>,
  startedAtMs: number
): Array<{ path: string; filename: string }> {
  return outputFiles
    .filter((file) => file.modifiedAtMs >= startedAtMs - 1000)
    .filter((file) => !IMAGE_EXTENSIONS.has(path.extname(file.name).toLowerCase()))
    .map((file) => ({ path: file.path, filename: file.name }));
}

function appendGeneratedOutputHints(
  base: string,
  generatedImages: Array<Record<string, string>>,
  downloadLinks: Array<{ path: string; filename: string }>,
  synced: string[]
): string {
  if (generatedImages.length === 0 && downloadLinks.length === 0) {
    return base;
  }
  let augmented = `${base}\n\n=== OUTPUT FILES (copy these EXACT lines into your answer — do not edit paths or labels) ===`;
  if (generatedImages.length > 0) {
    augmented += `\n${generatedImages.map((file) => `![${file.filename}](${file.src})`).join("\n")}`;
  }
  if (downloadLinks.length > 0) {
    augmented += `\n${downloadLinks.map((file) => `[${file.filename}](${file.path})`).join("\n")}`;
  }
  if (synced.length > 0) {
    augmented += `\n(synced from kb/outputs/: ${synced.join(", ")})\nWARNING: writing to kb/outputs is invalid; files were copied into repository/outputs for compatibility.`;
  }
  return augmented;
}

const MEMORY_ACTIONS = new Set<MemoryAction>(["add", "replace", "remove", "read", "clear"]);
const MEMORY_TARGETS = new Set<MemoryTarget>(["user", "project"]);
const DERIVED_METRIC_SOURCE_TYPES = new Set(["raw_point", "metric"]);
const DERIVED_METRIC_FORMULA_KINDS = new Set(["ratio", "difference"]);
const DERIVED_METRIC_INVALID_VALUE_POLICIES = new Set(["null", "zero"]);
const DERIVED_METRIC_MIN_HISTORY_DAYS = 30;
const DERIVED_METRIC_MIN_HISTORY_MS = DERIVED_METRIC_MIN_HISTORY_DAYS * 24 * 60 * 60 * 1000;
const DERIVED_METRIC_SOURCE_LIMIT = 20_000;

type DerivedMetricFormulaKind = "ratio" | "difference";
type DerivedMetricInvalidValuePolicy = "null" | "zero";

interface DerivedMetricCalculationSample {
  ts: string;
  value?: number;
  valueText?: string;
  inputs: Record<string, number>;
  inputTimestamps?: Record<string, string>;
  inputLagSeconds?: Record<string, number>;
  alignmentPolicy?: DerivedMetricAlignmentPolicy;
  alignmentToleranceSeconds?: number;
  quality?: string;
  status?: string;
  invalidReason?: string;
}

interface DerivedMetricCalculationWindow {
  from: string;
  to: string;
  defaultedFrom: boolean;
  expandedFrom: boolean;
}

function normalizeDerivedMetricDependency(value: unknown): DerivedMetricDependencyInput | null {
  if (!isPlainRecord(value)) return null;
  const role = stringValue(value.role);
  const sourceId = stringValueFrom(value, ["sourceId", "source_id", "pointName", "point_name", "name", "metricInstanceId", "metric_instance_id"]);
  if (!role || !sourceId) return null;
  const sourceTypeRaw = stringValueFrom(value, ["sourceType", "source_type"]);
  const sourceType = DERIVED_METRIC_SOURCE_TYPES.has(sourceTypeRaw) ? sourceTypeRaw as DerivedMetricDependencyInput["sourceType"] : undefined;
  const dependency: DerivedMetricDependencyInput = { role, sourceId };
  if (sourceType) dependency.sourceType = sourceType;
  const pointName = stringValueFrom(value, ["pointName", "point_name", "name"]);
  if (pointName) dependency.pointName = pointName;
  const objectRef = stringValueFrom(value, ["objectRef", "object_ref"]);
  if (objectRef) dependency.objectRef = objectRef;
  const unit = stringValue(value.unit);
  if (unit) dependency.unit = unit;
  const label = stringValue(value.label);
  if (label) dependency.label = label;
  if (isPlainRecord(value.metadata)) dependency.metadata = value.metadata;
  return dependency;
}

function normalizeDerivedMetricFormulaKind(value: string): DerivedMetricFormulaKind | null {
  const normalized = value.trim().toLowerCase();
  return DERIVED_METRIC_FORMULA_KINDS.has(normalized) ? normalized as DerivedMetricFormulaKind : null;
}

function normalizeDerivedMetricInvalidValuePolicy(value: string): DerivedMetricInvalidValuePolicy {
  const normalized = value.trim().toLowerCase();
  return DERIVED_METRIC_INVALID_VALUE_POLICIES.has(normalized)
    ? normalized as DerivedMetricInvalidValuePolicy
    : "null";
}

function roleOrFallback(args: Record<string, unknown>, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = textArg(args, key);
    if (value) return value;
  }
  return fallback;
}

function dependencyForRole(
  dependencies: DerivedMetricDependencyInput[],
  role: string,
  fallbackIndex: number
): DerivedMetricDependencyInput | null {
  return dependencies.find((dependency) => dependency.role === role)
    ?? dependencies[fallbackIndex]
    ?? null;
}

function formulaForDerivedMetric(kind: DerivedMetricFormulaKind, leftRole: string, rightRole: string): string {
  return kind === "ratio" ? `${leftRole} / ${rightRole}` : `${leftRole} - ${rightRole}`;
}

function inferDerivedMetricFormulaKind(formula: string): DerivedMetricFormulaKind | null {
  const normalized = formula.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("/") || normalized.includes("ratio")) return "ratio";
  if (normalized.includes("-") || normalized.includes("difference") || normalized.includes("delta")) return "difference";
  return null;
}

function configureDerivedMetricMaterialization(
  derivedMetrics: DerivedMetricStore,
  instance: DerivedMetricInstance,
  input: {
    enabled: boolean;
    formulaKind?: DerivedMetricFormulaKind;
    leftRole?: string;
    rightRole?: string;
    invalidValuePolicy?: DerivedMetricInvalidValuePolicy;
    alignmentPolicy?: DerivedMetricAlignmentPolicy;
    alignmentToleranceSeconds?: number;
    status?: string;
  }
) {
  try {
    return derivedMetrics.configureMaterialization({
      instanceId: instance.instanceId,
      enabled: input.enabled,
      intervalSeconds: 300,
      lookbackSeconds: 3_600,
      ...(input.formulaKind ? { formulaKind: input.formulaKind } : {}),
      ...(input.leftRole ? { leftRole: input.leftRole } : {}),
      ...(input.rightRole ? { rightRole: input.rightRole } : {}),
      ...(input.invalidValuePolicy ? { invalidValuePolicy: input.invalidValuePolicy } : {}),
      ...(input.alignmentPolicy ? { alignmentPolicy: input.alignmentPolicy } : {}),
      ...(typeof input.alignmentToleranceSeconds === "number" ? { alignmentToleranceSeconds: input.alignmentToleranceSeconds } : {}),
      ...(input.status ? { status: input.status } : {})
    });
  } catch {
    return null;
  }
}

function derivedMetricOutputDashboardBinding(
  instance: { instanceId: string; metricKey: string; entityId: string; displayName: string; unit?: string },
  unitFallback = ""
): Record<string, unknown> {
  return {
    source: "derived_metric",
    metricInstanceId: instance.instanceId,
    metricKey: instance.metricKey,
    entityId: instance.entityId,
    groupId: instance.entityId,
    label: instance.displayName,
    role: "output",
    dependencyRole: "output",
    defaultVisible: true,
    unit: instance.unit ?? unitFallback
  };
}

function derivedMetricInputDashboardBindings(entityId: string, dependencies: DerivedMetricDependencyInput[]): Array<Record<string, unknown>> {
  return dependencies.map((dependency) => {
    const base = {
      entityId,
      groupId: entityId,
      label: dependency.label || dependency.role,
      role: dependency.role,
      dependencyRole: "input",
      defaultVisible: false,
      ...(dependency.unit ? { unit: dependency.unit } : {})
    };
    if (dependency.sourceType === "metric") {
      return {
        ...base,
        source: "derived_metric",
        metricInstanceId: dependency.sourceId
      };
    }
    return {
      ...base,
      source: "bms",
      ...(dependency.pointName ? { pointName: dependency.pointName } : dependency.objectRef ? {} : { pointName: dependency.sourceId }),
      ...(dependency.objectRef ? { objectRef: dependency.objectRef } : {})
    };
  });
}

function derivedMetricInstanceDependencyInputs(instance: {
  dependencies?: Array<{
    role: string;
    sourceType?: DerivedMetricDependencyInput["sourceType"];
    sourceId: string;
    pointName?: string;
    objectRef?: string;
    unit?: string;
    label?: string;
    metadata?: Record<string, unknown>;
  }>;
}): DerivedMetricDependencyInput[] {
  return (instance.dependencies ?? []).map((dependency) => ({
    role: dependency.role,
    sourceId: dependency.sourceId,
    ...(dependency.sourceType ? { sourceType: dependency.sourceType } : {}),
    ...(dependency.pointName ? { pointName: dependency.pointName } : {}),
    ...(dependency.objectRef ? { objectRef: dependency.objectRef } : {}),
    ...(dependency.unit ? { unit: dependency.unit } : {}),
    ...(dependency.label ? { label: dependency.label } : {}),
    ...(dependency.metadata ? { metadata: dependency.metadata } : {})
  }));
}

function timestampMs(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDerivedMetricCalculationWindow(args: Record<string, unknown>): DerivedMetricCalculationWindow {
  const toInput = textArg(args, "to");
  const toMs = timestampMs(toInput) ?? Date.now();
  const to = new Date(toMs).toISOString();
  const requestedFrom = textArg(args, "from");
  const requestedFromMs = timestampMs(requestedFrom);
  let fromMs = requestedFromMs ?? toMs - DERIVED_METRIC_MIN_HISTORY_MS;
  let defaultedFrom = requestedFromMs === null;
  let expandedFrom = false;

  if (fromMs > toMs) {
    fromMs = toMs - DERIVED_METRIC_MIN_HISTORY_MS;
    defaultedFrom = true;
  } else if (toMs - fromMs < DERIVED_METRIC_MIN_HISTORY_MS) {
    fromMs = toMs - DERIVED_METRIC_MIN_HISTORY_MS;
    expandedFrom = true;
  }

  return {
    from: new Date(fromMs).toISOString(),
    to,
    defaultedFrom,
    expandedFrom
  };
}

function fallbackDerivedMetricSample(
  ts: string,
  leftRole: string,
  rightRole: string,
  reason: string,
  policy: DerivedMetricInvalidValuePolicy,
  inputs: Record<string, number> = {}
): DerivedMetricCalculationSample {
  return {
    ts,
    ...(policy === "zero" ? { value: 0 } : { valueText: "N/A" }),
    inputs,
    quality: "invalid",
    status: policy === "zero" ? "fallback_zero" : "not_calculable",
    invalidReason: reason || "not_calculable"
  };
}

function numericSeriesFromRows(rows: BmsTimeseriesRow[]): Map<string, number> {
  const series = new Map<string, number>();
  for (const row of rows) {
    const value = typeof row.value_num === "number" && Number.isFinite(row.value_num)
      ? row.value_num
      : Number(row.value ?? row.value_text ?? "");
    if (Number.isFinite(value)) {
      series.set(row.ts, value);
    }
  }
  return series;
}

async function readDerivedMetricDependencySeries(
  derivedMetrics: DerivedMetricStore,
  dependency: DerivedMetricDependencyInput,
  from: string,
  to: string,
  limit: number
): Promise<Map<string, number>> {
  if (dependency.sourceType === "metric") {
    const instance = derivedMetrics.getInstance(dependency.sourceId);
    if (!instance) return new Map();
    const samples = derivedMetrics.readHistory(instance.instanceId, { from, to, limit, order: "asc" });
    return new Map(samples.flatMap((sample) =>
      typeof sample.valueNum === "number" && Number.isFinite(sample.valueNum)
        ? [[sample.ts, sample.valueNum] as const]
        : []
    ));
  }

  const params: Record<string, string> = {
    from,
    to,
    limit: String(Math.min(Math.max(1, limit), 20_000)),
    order: "asc"
  };
  if (dependency.pointName) {
    params.name = dependency.pointName;
  } else if (dependency.objectRef) {
    params.object_ref = dependency.objectRef;
  } else {
    params.name = dependency.sourceId;
  }
  const result = await fetchTimeseries(bmsCollectorBaseUrl(), params);
  return numericSeriesFromRows(result.items);
}

function calculateAlignedDerivedMetricSamples(
  kind: DerivedMetricFormulaKind,
  leftRole: string,
  rightRole: string,
  leftSeries: Map<string, number>,
  rightSeries: Map<string, number>,
  invalidValuePolicy: DerivedMetricInvalidValuePolicy,
  alignmentPolicy: DerivedMetricAlignmentPolicy,
  alignmentToleranceSeconds: number
): { samples: DerivedMetricCalculationSample[]; skipped: number; fallbackCount: number } {
  const alignedSamples = alignNumericSeries(leftSeries, rightSeries, alignmentPolicy, alignmentToleranceSeconds);
  const samples: DerivedMetricCalculationSample[] = [];
  let skipped = 0;
  let fallbackCount = 0;
  for (const aligned of alignedSamples) {
    const { ts, left, right } = aligned;
    const alignmentMetadata = {
      inputTimestamps: { [leftRole]: aligned.leftTs, [rightRole]: aligned.rightTs },
      inputLagSeconds: { [leftRole]: aligned.leftLagSeconds, [rightRole]: aligned.rightLagSeconds },
      alignmentPolicy,
      alignmentToleranceSeconds
    };
    if (typeof left !== "number" || typeof right !== "number" || !Number.isFinite(left) || !Number.isFinite(right)) {
      skipped += 1;
      fallbackCount += 1;
      samples.push({
        ...fallbackDerivedMetricSample(ts, leftRole, rightRole, "non_numeric_input", invalidValuePolicy),
        ...alignmentMetadata
      });
      continue;
    }
    if (kind === "ratio" && right === 0) {
      skipped += 1;
      fallbackCount += 1;
      samples.push({
        ...fallbackDerivedMetricSample(ts, leftRole, rightRole, "division_by_zero", invalidValuePolicy, {
          [leftRole]: left,
          [rightRole]: right
        }),
        ...alignmentMetadata
      });
      continue;
    }
    const value = kind === "ratio" ? left / right : left - right;
    if (!Number.isFinite(value)) {
      skipped += 1;
      fallbackCount += 1;
      samples.push({
        ...fallbackDerivedMetricSample(ts, leftRole, rightRole, "non_finite_result", invalidValuePolicy, {
          [leftRole]: left,
          [rightRole]: right
        }),
        ...alignmentMetadata
      });
      continue;
    }
    samples.push({
      ts,
      value,
      inputs: { [leftRole]: left, [rightRole]: right },
      ...alignmentMetadata
    });
  }
  return { samples, skipped, fallbackCount };
}

function latestDerivedMetricPreview(samples: DerivedMetricCalculationSample[]): DerivedMetricCalculationSample | null {
  return samples.at(-1) ?? null;
}

function limitedDerivedMetricPreviewSamples(
  samples: DerivedMetricCalculationSample[],
  limit = 50
): DerivedMetricCalculationSample[] {
  return samples.slice(-Math.max(1, limit));
}

function derivedMetricPointerContent(instance: {
  instanceId: string;
  metricKey: string;
  entityId: string;
  formulaVersion: string;
  formula: string;
  dependencies: Array<{ role: string; sourceId: string }>;
}): string {
  const dependencies = instance.dependencies.map((dependency) => `${dependency.role}=${dependency.sourceId}`).join(", ");
  return [
    `Derived metric persisted: ${instance.entityId}/${instance.metricKey}`,
    `metric_instance_id=${instance.instanceId}`,
    `formula=${instance.formulaVersion}: ${instance.formula}`,
    dependencies ? `dependencies=${dependencies}` : "",
    "Use derived_metric_read before recalculating."
  ].filter(Boolean).join("; ");
}

function writeDerivedMetricMemoryPointer(
  memory: AgentMemoryStore,
  context: { projectId: string; userId: string; conversationId: string; canConfigure: boolean },
  instance: {
    instanceId: string;
    metricKey: string;
    entityId: string;
    formulaVersion: string;
    formula: string;
    dependencies: Array<{ role: string; sourceId: string }>;
  }
): { content: string; result: ReturnType<AgentMemoryStore["runAction"]> } {
  const pointer = derivedMetricPointerContent(instance);
  const result = memory.runAction(
    context.projectId,
    context.userId,
    context.conversationId,
    "add",
    "project",
    { content: pointer, canConfigure: context.canConfigure }
  );
  return { content: pointer, result };
}

export function createGenericToolRegistry(
  memory: AgentMemoryStore,
  scheduler?: SchedulerService,
  processRegistry?: ProcessRegistry,
  skills?: AgentSkillRegistry,
  projectSkillBindings?: ProjectSkillBindings,
  projectGroundingBindings?: ProjectGroundingBindings,
  projectFeedbackBindings?: ProjectFeedbackBindings,
  sessionIndex?: SessionSearchIndex,
  projectMemoryProposalBindings?: ProjectMemoryProposalBindings,
  derivedMetrics?: DerivedMetricStore
): AgentToolRegistry {
  const registry = new AgentToolRegistry();
  const tools: AgentTool[] = [
    {
      name: "memory",
      category: "memory",
      description: "Manage curated memory banks: user preferences (target=user) or declarative project facts (target=project, configure only).",
      schema: {
        name: "memory",
        description:
          "Curated memory tool. action: add|replace|remove|read|clear. target: user|project. Project writes require project:configure.",
        parameters: {
          type: "object",
          properties: {
            action: { type: "string", description: "add, replace, remove, read, or clear." },
            target: { type: "string", description: "user (preferences) or project (declarative site facts)." },
            content: { type: "string", description: "Text for add/replace." },
            match: { type: "string", description: "Substring to match for replace/remove." }
          },
          required: ["action", "target"]
        }
      },
      async run(args, context) {
        const action = textArg(args, "action") as MemoryAction;
        const target = textArg(args, "target") as MemoryTarget;
        if (!MEMORY_ACTIONS.has(action)) {
          return { error: `Invalid action: ${action}` };
        }
        if (!MEMORY_TARGETS.has(target)) {
          return { error: `Invalid target: ${target}` };
        }
        const result = memory.runAction(
          context.projectId,
          context.userId,
          context.conversationId,
          action,
          target,
          {
            content: textArg(args, "content"),
            match: textArg(args, "match"),
            canConfigure: context.canConfigure
          }
        );
        return { ...result };
      }
    },
    {
      name: "memory_remember",
      category: "memory",
      description: "Shortcut: save a user preference to the user memory bank (alias for memory add/user).",
      schema: {
        name: "memory_remember",
        description: "Save a user preference to the user memory bank.",
        parameters: {
          type: "object",
          properties: { content: { type: "string", description: "Memory text to save." } },
          required: ["content"]
        }
      },
      async run(args, context) {
        const content = textArg(args, "content");
        if (!content) {
          return { error: "content is required" };
        }
        const result = memory.runAction(context.projectId, context.userId, context.conversationId, "add", "user", {
          content
        });
        return { memory: result };
      }
    },
    {
      name: "memory_search",
      category: "memory",
      description: "Search memories saved for the current project and user.",
      schema: {
        name: "memory_search",
        description: "Search memories saved for the current project and user.",
        parameters: {
          type: "object",
          properties: { query: { type: "string", description: "Search text." } },
          required: ["query"]
        }
      },
      async run(args, context) {
        return { memories: memory.search(context.projectId, context.userId, textArg(args, "query")) };
      }
    },
    ...(projectMemoryProposalBindings
      ? [
          {
            name: "memory_propose",
            category: "memory" as const,
            description:
              "Propose a declarative memory entry for user approval. Does not write until user confirms. Route executable rules to feedback_propose.",
            schema: {
              name: "memory_propose",
              description: "Propose memory for user confirmation. target: user|project.",
              parameters: {
                type: "object",
                properties: {
                  target: { type: "string", description: "user or project." },
                  content: { type: "string", description: "Declarative memory text." },
                  reason: { type: "string", description: "Why this should be saved." }
                },
                required: ["target", "content", "reason"]
              }
            },
            async run(args, context) {
              const target = textArg(args, "target") as MemoryTarget;
              const content = textArg(args, "content");
              const reason = textArg(args, "reason");
              if (!MEMORY_TARGETS.has(target)) {
                return { error: `Invalid target: ${target}` };
              }
              if (!content || !reason) {
                return { error: "content and reason are required" };
              }
              if (looksExecutableMemoryContent(content)) {
                return {
                  error: "executable_content",
                  message: "This looks executable. Use feedback_propose instead of memory_propose."
                };
              }
              if (target === "project" && !context.canConfigure) {
                return boundsViolationResult("Project memory proposals require project:configure.");
              }
              const proposal = projectMemoryProposalBindings.propose(
                context.projectId,
                context.conversationId,
                context.userId,
                target,
                content,
                reason
              );
              return { proposal, message: "Ask the user to confirm with save memory: yes before writing." };
            }
          } satisfies AgentTool,
          {
            name: "memory_commit_proposal",
            category: "memory" as const,
            description: "Commit the latest proposed memory (or a specific proposal_id) after user approval.",
            schema: {
              name: "memory_commit_proposal",
              description: "Commit a pending memory proposal into the curated bank.",
              parameters: {
                type: "object",
                properties: {
                  proposal_id: { type: "string", description: "Optional proposal id; defaults to latest in conversation." }
                }
              }
            },
            async run(args, context) {
              const proposalId = textArg(args, "proposal_id");
              const pending = proposalId
                ? projectMemoryProposalBindings
                    .list(context.projectId, context.userId)
                    .find((entry) => entry.id === proposalId && entry.status === "proposed")
                : projectMemoryProposalBindings.findLatestProposed(
                    context.projectId,
                    context.conversationId,
                    context.userId
                  );
              if (!pending) {
                return { error: "No pending memory proposal found." };
              }
              if (pending.target === "project" && !context.canConfigure) {
                return boundsViolationResult("Project memory writes require project:configure.");
              }
              const writeResult = memory.runAction(
                context.projectId,
                context.userId,
                context.conversationId,
                "add",
                pending.target,
                { content: pending.content, canConfigure: context.canConfigure }
              );
              if (!writeResult.success) {
                return { error: writeResult.error ?? "Failed to write memory." };
              }
              projectMemoryProposalBindings.commit(pending.id, context.projectId);
              return { proposal: pending, memory: writeResult };
            }
          } satisfies AgentTool
        ]
      : []),
    {
      name: "derived_metric_lookup",
      category: "building",
      description: "Look up persisted derived metrics before calculating new KPI/COP/Delta T values.",
      schema: {
        name: "derived_metric_lookup",
        description:
          "Search project-scoped derived metric instances. Use before recalculating System COP, Delta T, FD scores, or KPIs.",
        parameters: {
          type: "object",
          properties: {
            metricKey: { type: "string", description: "Metric key, e.g. system_cop or delta_t." },
            entityId: { type: "string", description: "Entity/equipment id, e.g. WCC_01." },
            query: { type: "string", description: "Optional fuzzy query across metric/entity/display name." },
            limit: { type: "number", description: "Max rows, default 20." }
          }
        }
      },
      async run(args, context) {
        if (!derivedMetrics) {
          return { error: "derived_metrics_unavailable" };
        }
        const metrics = derivedMetrics.lookup({
          projectId: context.projectId,
          ...(textArg(args, "metricKey") ? { metricKey: textArg(args, "metricKey") } : {}),
          ...(textArg(args, "entityId") ? { entityId: textArg(args, "entityId") } : {}),
          ...(textArg(args, "query") ? { query: textArg(args, "query") } : {}),
          limit: numArg(args, "limit", 20)
        });
        return {
          total: metrics.length,
          metrics,
          reuseHint: metrics.length > 0
            ? "Reuse an existing metric_instance_id with derived_metric_read instead of recalculating/registering a duplicate."
            : "No persisted derived metric matched; calculate only if needed, then ask whether to persist/register it."
        };
      }
    },
    {
      name: "derived_metric_preview",
      category: "building",
      description: "Calculate a safe ratio/difference derived metric without persisting it, then return save-ready arguments.",
      schema: {
        name: "derived_metric_preview",
        description:
          "Preview a one-off derived metric calculation without writing metric definitions, samples, latest values, or memory. Use before asking the user whether to persist Delta T, COP, kW/RT, or similar reusable metrics.",
        parameters: {
          type: "object",
          properties: {
            metricKey: { type: "string", description: "Optional stable metric key if this preview might be saved, e.g. delta_t." },
            entityId: { type: "string", description: "Optional entity/equipment id if this preview might be saved." },
            entityName: { type: "string", description: "Human-readable entity name." },
            displayName: { type: "string", description: "Metric display name." },
            unit: { type: "string", description: "Metric unit." },
            metricType: { type: "string", description: "Asset type: kpi for performance/efficiency, fdd/fd_score for detection, derived for neutral intermediate values." },
            formulaKind: { type: "string", enum: ["ratio", "difference"], description: "ratio computes left/right; difference computes left-right." },
            formulaVersion: { type: "string", description: "Formula version, default v1." },
            formula: { type: "string", description: "Optional formula string stored if the user later saves this metric." },
            formulaDescription: { type: "string", description: "Plain-language formula description." },
            leftRole: { type: "string", description: "Role for left/numerator/minuend dependency." },
            rightRole: { type: "string", description: "Role for right/denominator/subtrahend dependency." },
            numeratorRole: { type: "string", description: "Alias for leftRole in ratio formulas." },
            denominatorRole: { type: "string", description: "Alias for rightRole in ratio formulas." },
            minuendRole: { type: "string", description: "Alias for leftRole in difference formulas." },
            subtrahendRole: { type: "string", description: "Alias for rightRole in difference formulas." },
            dependencies: {
              type: "array",
              description:
                "Dependencies [{role, sourceType: raw_point|metric, sourceId, pointName?, objectRef?, unit?, label?}]. Required unless metricKey+entityId resolves an existing metric with dependencies."
            },
            from: { type: "string", description: "Source window start UTC ISO8601." },
            to: { type: "string", description: "Source window end UTC ISO8601; defaults to now." },
            limit: { type: "number", description: "Max source samples per dependency, default 2000." },
            previewLimit: { type: "number", description: "Max preview samples returned, default 50." },
            invalidValuePolicy: {
              type: "string",
              enum: ["null", "zero"],
              description: "How to represent non-calculable samples. The agent should choose by metric semantics; default null records valueText=N/A with invalid quality, zero records numeric 0 with invalid quality."
            },
            alignmentPolicy: {
              type: "string",
              enum: ["exact", "nearest"],
              description: "Input alignment: exact requires identical timestamps; nearest pairs closest samples within tolerance."
            },
            alignmentToleranceSeconds: { type: "number", description: "Tolerance for nearest alignment, default 300 seconds." },
            metadata: { type: "object", description: "Optional metadata copied into persistCandidate args." }
          },
          required: ["formulaKind", "from"]
        }
      },
      async run(args, context) {
        if (!derivedMetrics) {
          return { error: "derived_metrics_unavailable" };
        }

        const metricKey = textArg(args, "metricKey");
        const entityId = textArg(args, "entityId");
        const kind = normalizeDerivedMetricFormulaKind(textArg(args, "formulaKind"));
        const invalidValuePolicy = normalizeDerivedMetricInvalidValuePolicy(textArg(args, "invalidValuePolicy"));
        const alignmentPolicy = normalizeDerivedMetricAlignmentPolicy(textArg(args, "alignmentPolicy"));
        const alignmentToleranceSeconds = normalizeDerivedMetricAlignmentToleranceSeconds(numArg(args, "alignmentToleranceSeconds", DEFAULT_DERIVED_METRIC_ALIGNMENT_TOLERANCE_SECONDS));
        const from = textArg(args, "from");
        const to = textArg(args, "to") || new Date().toISOString();
        if (!kind) {
          return { error: "formulaKind must be ratio or difference" };
        }
        if (!from) {
          return { error: "from is required" };
        }

        const existing = metricKey && entityId
          ? derivedMetrics.lookup({
              projectId: context.projectId,
              metricKey,
              entityId,
              limit: 1
            })[0] ?? null
          : null;
        const existingLatest = existing ? derivedMetrics.readLatest(existing.instanceId) : null;
        const dashboardBinding = (instance: { instanceId: string; metricKey: string; entityId: string; displayName: string; unit?: string }) =>
          derivedMetricOutputDashboardBinding(instance, textArg(args, "unit"));

        if (existing && existingLatest) {
          return {
            reused: true,
            preview: false,
            persisted: true,
            calculated: false,
            instance: existing,
            latest: existingLatest,
            dashboardBinding: dashboardBinding(existing),
            inputDashboardBindings: derivedMetricInputDashboardBindings(existing.entityId, derivedMetricInstanceDependencyInputs(existing)),
            reuseHint: "A persisted derived metric already exists. Use derived_metric_read/dashboard binding instead of recalculating or saving a duplicate."
          };
        }

        const inputDependencies = Array.isArray(args.dependencies)
          ? args.dependencies.map((entry) => normalizeDerivedMetricDependency(entry)).filter((entry): entry is DerivedMetricDependencyInput => entry !== null)
          : [];
        const existingDependencies: DerivedMetricDependencyInput[] = existing?.dependencies.map((dependency) => ({
          role: dependency.role,
          sourceType: dependency.sourceType,
          sourceId: dependency.sourceId,
          ...(dependency.pointName ? { pointName: dependency.pointName } : {}),
          ...(dependency.objectRef ? { objectRef: dependency.objectRef } : {}),
          ...(dependency.unit ? { unit: dependency.unit } : {}),
          ...(dependency.label ? { label: dependency.label } : {}),
          ...(dependency.metadata ? { metadata: dependency.metadata } : {})
        })) ?? [];
        const dependencies = inputDependencies.length > 0 ? inputDependencies : existingDependencies;
        if (dependencies.length < 2) {
          return { error: "At least two dependencies are required to preview a derived metric." };
        }

        const leftRole = roleOrFallback(
          args,
          kind === "ratio" ? ["leftRole", "numeratorRole"] : ["leftRole", "minuendRole"],
          dependencies[0]?.role ?? "left"
        );
        const rightRole = roleOrFallback(
          args,
          kind === "ratio" ? ["rightRole", "denominatorRole"] : ["rightRole", "subtrahendRole"],
          dependencies[1]?.role ?? "right"
        );
        const leftDependency = dependencyForRole(dependencies, leftRole, 0);
        const rightDependency = dependencyForRole(dependencies, rightRole, 1);
        if (!leftDependency || !rightDependency) {
          return { error: "Unable to resolve left/right dependencies for preview." };
        }

        try {
          const limit = Math.min(Math.max(1, numArg(args, "limit", 2000)), DERIVED_METRIC_SOURCE_LIMIT);
          const [leftSeries, rightSeries] = await Promise.all([
            readDerivedMetricDependencySeries(derivedMetrics, leftDependency, from, to, limit),
            readDerivedMetricDependencySeries(derivedMetrics, rightDependency, from, to, limit)
          ]);
          const calculated = calculateAlignedDerivedMetricSamples(
            kind,
            leftRole,
            rightRole,
            leftSeries,
            rightSeries,
            invalidValuePolicy,
            alignmentPolicy,
            alignmentToleranceSeconds
          );
          if (calculated.samples.length === 0) {
            calculated.samples.push(fallbackDerivedMetricSample(to, leftRole, rightRole, "no_aligned_samples", invalidValuePolicy));
            calculated.fallbackCount += 1;
          }

          const metadata = isPlainRecord(args.metadata) ? args.metadata : undefined;
          const formula = textArg(args, "formula") || formulaForDerivedMetric(kind, leftRole, rightRole);
          const persistArgs = {
            ...(metricKey ? { metricKey } : {}),
            ...(entityId ? { entityId } : {}),
            formulaKind: kind,
            leftRole,
            rightRole,
            from,
            to,
            dependencies,
            formula,
            invalidValuePolicy,
            alignmentPolicy,
            alignmentToleranceSeconds,
            ...(textArg(args, "entityName") ? { entityName: textArg(args, "entityName") } : {}),
            ...(textArg(args, "displayName") ? { displayName: textArg(args, "displayName") } : {}),
            ...(textArg(args, "unit") ? { unit: textArg(args, "unit") } : {}),
            ...(textArg(args, "metricType") ? { metricType: textArg(args, "metricType") } : {}),
            ...(textArg(args, "formulaVersion") ? { formulaVersion: textArg(args, "formulaVersion") } : {}),
            ...(textArg(args, "formulaDescription") ? { formulaDescription: textArg(args, "formulaDescription") } : {}),
            ...(metadata ? { metadata } : {})
          };
          return {
            reused: false,
            preview: true,
            persisted: false,
            calculated: true,
            formulaKind: kind,
            alignmentPolicy,
            alignmentToleranceSeconds,
            formula,
            latestPreview: latestDerivedMetricPreview(calculated.samples),
            samples: limitedDerivedMetricPreviewSamples(calculated.samples, numArg(args, "previewLimit", 50)),
            sampleCount: calculated.samples.length,
            skipped: calculated.skipped,
            fallbackCount: calculated.fallbackCount,
            inputCounts: { [leftRole]: leftSeries.size, [rightRole]: rightSeries.size },
            inputDashboardBindings: entityId ? derivedMetricInputDashboardBindings(entityId, dependencies) : [],
            persistCandidate: metricKey && entityId
              ? { tool: "derived_metric_calculate", args: persistArgs }
              : null,
            savePrompt: metricKey && entityId
              ? "Ask the user whether to save this calculated metric. If they approve, call derived_metric_calculate with persistCandidate.args."
              : "Ask the user for a stable metricKey and entityId before saving this preview as a reusable derived metric."
          };
        } catch (error) {
          return { error: error instanceof Error ? error.message : "derived_metric_preview_failed" };
        }
      }
    },
    {
      name: "derived_metric_calculate",
      category: "building",
      description: "Calculate and persist a reusable ratio/difference derived metric from source BMS or metric dependencies.",
      schema: {
        name: "derived_metric_calculate",
        description:
          "Lookup first, then calculate and persist a reusable derived metric when needed. Supports safe formulaKind values: ratio (left/right) and difference (left-right). Defaults/expands persisted calculations to at least 30 days of history. The agent chooses invalidValuePolicy by metric semantics instead of the tool guessing whether unavailable samples should be null or zero. Returns dashboard-ready binding metadata.",
        parameters: {
          type: "object",
          properties: {
            metricKey: { type: "string", description: "Stable metric key, e.g. system_cop or delta_t." },
            entityId: { type: "string", description: "Entity/equipment id, e.g. WCC_04." },
            entityName: { type: "string", description: "Human-readable entity name." },
            displayName: { type: "string", description: "Metric display name." },
            unit: { type: "string", description: "Metric unit." },
            metricType: { type: "string", description: "Asset type: kpi for performance/efficiency, fdd/fd_score for detection, derived for neutral intermediate values." },
            formulaKind: { type: "string", enum: ["ratio", "difference"], description: "ratio computes left/right; difference computes left-right." },
            formulaVersion: { type: "string", description: "Formula version, default v1." },
            formula: { type: "string", description: "Optional formula string stored with the metric definition." },
            formulaDescription: { type: "string", description: "Plain-language formula description." },
            leftRole: { type: "string", description: "Role for left/numerator/minuend dependency." },
            rightRole: { type: "string", description: "Role for right/denominator/subtrahend dependency." },
            numeratorRole: { type: "string", description: "Alias for leftRole in ratio formulas." },
            denominatorRole: { type: "string", description: "Alias for rightRole in ratio formulas." },
            minuendRole: { type: "string", description: "Alias for leftRole in difference formulas." },
            subtrahendRole: { type: "string", description: "Alias for rightRole in difference formulas." },
            dependencies: {
              type: "array",
              description:
                "Dependencies [{role, sourceType: raw_point|metric, sourceId, pointName?, objectRef?, unit?, label?}]. Required unless reusing an existing metric with latest value."
            },
            from: { type: "string", description: "Source window start UTC ISO8601; if omitted or shorter than 30 days, the tool expands to a 30-day window." },
            to: { type: "string", description: "Source window end UTC ISO8601; defaults to now." },
            limit: { type: "number", description: "Max source samples per dependency, default/minimum 20000 for persisted metrics." },
            invalidValuePolicy: {
              type: "string",
              enum: ["null", "zero"],
              description: "How to persist non-calculable samples. Choose null for unknown/not applicable/ambiguous states; choose zero only when numeric zero is semantically valid for this metric or explicitly requested."
            },
            alignmentPolicy: {
              type: "string",
              enum: ["exact", "nearest"],
              description: "Input alignment: exact requires identical timestamps; nearest pairs closest samples within tolerance."
            },
            alignmentToleranceSeconds: { type: "number", description: "Tolerance for nearest alignment, default 300 seconds." },
            forceRecalculate: { type: "boolean", description: "If false and latest exists, reuse without recalculating." },
            calculationRunId: { type: "string", description: "Optional deterministic calculation run id." },
            metadata: { type: "object", description: "Optional metadata stored with the metric definition and samples." }
          },
          required: ["metricKey", "entityId", "formulaKind"]
        }
      },
      async run(args, context) {
        if (!derivedMetrics) {
          return { error: "derived_metrics_unavailable" };
        }
        if (!context.canConfigure) {
          return boundsViolationResult("derived_metric_calculate requires project:configure.");
        }

        const metricKey = textArg(args, "metricKey");
        const entityId = textArg(args, "entityId");
        const kind = normalizeDerivedMetricFormulaKind(textArg(args, "formulaKind"));
        const invalidValuePolicy = normalizeDerivedMetricInvalidValuePolicy(textArg(args, "invalidValuePolicy"));
        const alignmentPolicy = normalizeDerivedMetricAlignmentPolicy(textArg(args, "alignmentPolicy"));
        const alignmentToleranceSeconds = normalizeDerivedMetricAlignmentToleranceSeconds(numArg(args, "alignmentToleranceSeconds", DEFAULT_DERIVED_METRIC_ALIGNMENT_TOLERANCE_SECONDS));
        const window = normalizeDerivedMetricCalculationWindow(args);
        const { from, to } = window;
        if (!metricKey || !entityId) {
          return { error: "metricKey and entityId are required" };
        }
        if (!kind) {
          return { error: "formulaKind must be ratio or difference" };
        }

        const existing = derivedMetrics.lookup({
          projectId: context.projectId,
          metricKey,
          entityId,
          limit: 1
        })[0] ?? null;
        const existingLatest = existing ? derivedMetrics.readLatest(existing.instanceId) : null;
        const forceRecalculate = boolArg(args, "forceRecalculate");
        const dashboardBinding = (instance: { instanceId: string; metricKey: string; entityId: string; displayName: string; unit?: string }) =>
          derivedMetricOutputDashboardBinding(instance, textArg(args, "unit"));

        if (existing && existingLatest && !forceRecalculate) {
          const existingDependencies = derivedMetricInstanceDependencyInputs(existing);
          const leftRole = roleOrFallback(
            args,
            kind === "ratio" ? ["leftRole", "numeratorRole"] : ["leftRole", "minuendRole"],
            existingDependencies[0]?.role ?? "left"
          );
          const rightRole = roleOrFallback(
            args,
            kind === "ratio" ? ["rightRole", "denominatorRole"] : ["rightRole", "subtrahendRole"],
            existingDependencies[1]?.role ?? "right"
          );
          const materialization = configureDerivedMetricMaterialization(derivedMetrics, existing, {
            enabled: true,
            formulaKind: kind,
            leftRole,
            rightRole,
            invalidValuePolicy,
            alignmentPolicy,
            alignmentToleranceSeconds,
            status: "active"
          });
          const memoryPointer = writeDerivedMetricMemoryPointer(memory, context, existing);
          return {
            reused: true,
            calculated: false,
            created: false,
            instance: existing,
            latest: existingLatest,
            materialization,
            dashboardBinding: dashboardBinding(existing),
            inputDashboardBindings: derivedMetricInputDashboardBindings(existing.entityId, existingDependencies),
            memoryPointer,
            reuseHint: "Existing latest value reused; no BMS dependency reads or recalculation were performed."
          };
        }

        const inputDependencies = Array.isArray(args.dependencies)
          ? args.dependencies.map((entry) => normalizeDerivedMetricDependency(entry)).filter((entry): entry is DerivedMetricDependencyInput => entry !== null)
          : [];
        const existingDependencies: DerivedMetricDependencyInput[] = existing?.dependencies.map((dependency) => ({
          role: dependency.role,
          sourceType: dependency.sourceType,
          sourceId: dependency.sourceId,
          ...(dependency.pointName ? { pointName: dependency.pointName } : {}),
          ...(dependency.objectRef ? { objectRef: dependency.objectRef } : {}),
          ...(dependency.unit ? { unit: dependency.unit } : {}),
          ...(dependency.label ? { label: dependency.label } : {}),
          ...(dependency.metadata ? { metadata: dependency.metadata } : {})
        })) ?? [];
        const dependencies = inputDependencies.length > 0 ? inputDependencies : existingDependencies;
        if (dependencies.length < 2) {
          return { error: "At least two dependencies are required to calculate a missing or forced derived metric." };
        }

        const leftRole = roleOrFallback(
          args,
          kind === "ratio" ? ["leftRole", "numeratorRole"] : ["leftRole", "minuendRole"],
          dependencies[0]?.role ?? "left"
        );
        const rightRole = roleOrFallback(
          args,
          kind === "ratio" ? ["rightRole", "denominatorRole"] : ["rightRole", "subtrahendRole"],
          dependencies[1]?.role ?? "right"
        );
        const leftDependency = dependencyForRole(dependencies, leftRole, 0);
        const rightDependency = dependencyForRole(dependencies, rightRole, 1);
        if (!leftDependency || !rightDependency) {
          return { error: "Unable to resolve left/right dependencies for calculation." };
        }

        try {
          const limit = DERIVED_METRIC_SOURCE_LIMIT;
          const [leftSeries, rightSeries] = await Promise.all([
            readDerivedMetricDependencySeries(derivedMetrics, leftDependency, from, to, limit),
            readDerivedMetricDependencySeries(derivedMetrics, rightDependency, from, to, limit)
          ]);
          const calculated = calculateAlignedDerivedMetricSamples(
            kind,
            leftRole,
            rightRole,
            leftSeries,
            rightSeries,
            invalidValuePolicy,
            alignmentPolicy,
            alignmentToleranceSeconds
          );
          if (calculated.samples.length === 0) {
            calculated.samples.push(fallbackDerivedMetricSample(to, leftRole, rightRole, "no_aligned_samples", invalidValuePolicy));
            calculated.fallbackCount += 1;
          }

          const metadata = isPlainRecord(args.metadata) ? args.metadata : undefined;
          const formula = textArg(args, "formula") || formulaForDerivedMetric(kind, leftRole, rightRole);
          const registerResult = existing
            ? { created: false, instance: existing }
            : derivedMetrics.registerMetric({
                projectId: context.projectId,
                metricKey,
                entityId,
                formula,
                dependencies,
                ...(textArg(args, "entityName") ? { entityName: textArg(args, "entityName") } : {}),
                ...(textArg(args, "displayName") ? { displayName: textArg(args, "displayName") } : {}),
                ...(textArg(args, "unit") ? { unit: textArg(args, "unit") } : {}),
                ...(textArg(args, "metricType") ? { metricType: textArg(args, "metricType") } : {}),
                ...(textArg(args, "formulaVersion") ? { formulaVersion: textArg(args, "formulaVersion") } : {}),
                ...(textArg(args, "formulaDescription") ? { formulaDescription: textArg(args, "formulaDescription") } : {}),
                createdBy: context.userId,
                ...(metadata ? { metadata } : {})
              });

          const calculationRunId = textArg(args, "calculationRunId")
            || `derived_metric_calculate:${metricKey}:${entityId}:${kind}:${from}:${to}`;
          for (const sample of calculated.samples) {
            derivedMetrics.recordSample({
              instanceId: registerResult.instance.instanceId,
              ts: sample.ts,
              ...(typeof sample.value === "number" && Number.isFinite(sample.value) ? { valueNum: sample.value } : {}),
              ...(sample.valueText ? { valueText: sample.valueText } : {}),
              calculationRunId,
              sourceWindowStart: from,
              sourceWindowEnd: to,
              ...(sample.quality ? { quality: sample.quality } : {}),
              ...(sample.status ? { status: sample.status } : {}),
              metadata: {
                ...(metadata ?? {}),
                formulaKind: kind,
                inputs: sample.inputs,
                invalidValuePolicy,
                alignmentPolicy,
                alignmentToleranceSeconds,
                ...(sample.inputTimestamps ? { inputTimestamps: sample.inputTimestamps } : {}),
                ...(sample.inputLagSeconds ? { inputLagSeconds: sample.inputLagSeconds } : {}),
                ...(sample.invalidReason ? { invalidReason: sample.invalidReason } : {})
              }
            });
          }
          const latest = derivedMetrics.readLatest(registerResult.instance.instanceId);
          const materialization = configureDerivedMetricMaterialization(derivedMetrics, registerResult.instance, {
            enabled: true,
            formulaKind: kind,
            leftRole,
            rightRole,
            invalidValuePolicy,
            alignmentPolicy,
            alignmentToleranceSeconds,
            status: "active"
          });
          const memoryPointer = writeDerivedMetricMemoryPointer(memory, context, registerResult.instance);
          return {
            reused: false,
            calculated: true,
            created: registerResult.created,
            instance: registerResult.instance,
            latest,
            materialization,
            sampleCount: calculated.samples.length,
            skipped: calculated.skipped,
            fallbackCount: calculated.fallbackCount,
            inputCounts: { [leftRole]: leftSeries.size, [rightRole]: rightSeries.size },
            sourceWindow: {
              from,
              to,
              minimumDays: DERIVED_METRIC_MIN_HISTORY_DAYS,
              defaultedFrom: window.defaultedFrom,
              expandedFrom: window.expandedFrom,
              limit
            },
            invalidValuePolicy,
            alignmentPolicy,
            alignmentToleranceSeconds,
            formulaKind: kind,
            dashboardBinding: dashboardBinding(registerResult.instance),
            inputDashboardBindings: derivedMetricInputDashboardBindings(registerResult.instance.entityId, dependencies),
            memoryPointer,
            reuseHint: "Metric samples persisted. Future requests should call derived_metric_lookup/read before recalculating."
          };
        } catch (error) {
          return { error: error instanceof Error ? error.message : "derived_metric_calculate_failed" };
        }
      }
    },
    {
      name: "derived_metric_register",
      category: "building",
      description: "Persist a reusable calculated metric definition/instance and write a project-memory pointer.",
      schema: {
        name: "derived_metric_register",
        description:
          "Register a durable derived metric after the user agrees to persist it. Duplicate project/entity/metricKey registrations return the existing metric.",
        parameters: {
          type: "object",
          properties: {
            metricKey: { type: "string", description: "Stable metric key, e.g. system_cop, delta_t." },
            entityId: { type: "string", description: "Entity/equipment id, e.g. WCC_01." },
            entityName: { type: "string", description: "Human readable entity name." },
            displayName: { type: "string", description: "Metric display name." },
            unit: { type: "string", description: "Metric unit." },
            metricType: { type: "string", description: "Asset type: kpi for performance/efficiency, fdd/fd_score for detection, derived for neutral intermediate values." },
            formulaVersion: { type: "string", description: "Formula version, default v1." },
            formula: { type: "string", description: "Formula expression or concise calculation rule." },
            formulaDescription: { type: "string", description: "Plain-language formula description." },
            formulaKind: { type: "string", enum: ["ratio", "difference"], description: "Optional executable kind for background materialization." },
            leftRole: { type: "string", description: "Optional left/numerator/minuend role for background materialization." },
            rightRole: { type: "string", description: "Optional right/denominator/subtrahend role for background materialization." },
            invalidValuePolicy: { type: "string", enum: ["null", "zero"], description: "Optional non-calculable sample policy for background materialization." },
            alignmentPolicy: { type: "string", enum: ["exact", "nearest"], description: "Optional input alignment policy for background materialization." },
            alignmentToleranceSeconds: { type: "number", description: "Tolerance for nearest alignment, default 300 seconds." },
            dependencies: {
              type: "array",
              description:
                "Dependencies [{role, sourceType: raw_point|metric, sourceId, pointName?, objectRef?, unit?, label?}]."
            },
            metadata: { type: "object", description: "Optional metadata." }
          },
          required: ["metricKey", "entityId", "formula", "dependencies"]
        }
      },
      async run(args, context) {
        if (!derivedMetrics) {
          return { error: "derived_metrics_unavailable" };
        }
        if (!context.canConfigure) {
          return boundsViolationResult("derived_metric_register requires project:configure.");
        }
        const dependencies = Array.isArray(args.dependencies)
          ? args.dependencies.map((entry) => normalizeDerivedMetricDependency(entry)).filter((entry): entry is DerivedMetricDependencyInput => entry !== null)
          : [];
        if (dependencies.length === 0) {
          return { error: "dependencies are required" };
        }
        const metadata = isPlainRecord(args.metadata) ? args.metadata : undefined;
        try {
          const formula = textArg(args, "formula");
          const formulaKind = normalizeDerivedMetricFormulaKind(textArg(args, "formulaKind"))
            ?? inferDerivedMetricFormulaKind(formula);
          const leftRole = roleOrFallback(args, ["leftRole", "numeratorRole", "minuendRole"], dependencies[0]?.role ?? "left");
          const rightRole = roleOrFallback(args, ["rightRole", "denominatorRole", "subtrahendRole"], dependencies[1]?.role ?? "right");
          const invalidValuePolicy = normalizeDerivedMetricInvalidValuePolicy(textArg(args, "invalidValuePolicy"));
          const alignmentPolicy = normalizeDerivedMetricAlignmentPolicy(textArg(args, "alignmentPolicy"));
          const alignmentToleranceSeconds = normalizeDerivedMetricAlignmentToleranceSeconds(numArg(args, "alignmentToleranceSeconds", DEFAULT_DERIVED_METRIC_ALIGNMENT_TOLERANCE_SECONDS));
          const result = derivedMetrics.registerMetric({
            projectId: context.projectId,
            metricKey: textArg(args, "metricKey"),
            entityId: textArg(args, "entityId"),
            formula,
            dependencies,
            ...(textArg(args, "entityName") ? { entityName: textArg(args, "entityName") } : {}),
            ...(textArg(args, "displayName") ? { displayName: textArg(args, "displayName") } : {}),
            ...(textArg(args, "unit") ? { unit: textArg(args, "unit") } : {}),
            ...(textArg(args, "metricType") ? { metricType: textArg(args, "metricType") } : {}),
            ...(textArg(args, "formulaVersion") ? { formulaVersion: textArg(args, "formulaVersion") } : {}),
            ...(textArg(args, "formulaDescription") ? { formulaDescription: textArg(args, "formulaDescription") } : {}),
            createdBy: context.userId,
            ...(metadata ? { metadata } : {})
          });
          const materialization = configureDerivedMetricMaterialization(derivedMetrics, result.instance, formulaKind
            ? {
                enabled: true,
                formulaKind,
                leftRole,
                rightRole,
                invalidValuePolicy,
                alignmentPolicy,
                alignmentToleranceSeconds,
                status: "active"
              }
            : {
                enabled: false,
                status: "unsupported"
              });
          const memoryPointer = writeDerivedMetricMemoryPointer(memory, context, result.instance);
          return {
            ...result,
            materialization,
            memoryPointer,
            reuseHint: result.created
              ? "Metric persisted. Future requests should call derived_metric_lookup/read first."
              : "Existing metric reused; do not recalculate or register a duplicate."
          };
        } catch (error) {
          return { error: error instanceof Error ? error.message : "derived_metric_register_failed" };
        }
      }
    },
    {
      name: "derived_metric_record_sample",
      category: "building",
      description: "Record a calculated derived metric value into metric_samples and metric_latest.",
      schema: {
        name: "derived_metric_record_sample",
        description: "Persist a calculated derived metric sample. Use after registering/finding a metric instance.",
        parameters: {
          type: "object",
          properties: {
            instanceId: { type: "string", description: "Derived metric instance id." },
            ts: { type: "string", description: "Timestamp ISO8601." },
            valueNum: { type: "number", description: "Numeric value." },
            valueText: { type: "string", description: "Text value if not numeric." },
            quality: { type: "string", description: "Quality, default good." },
            status: { type: "string", description: "Status, default ok." },
            calculationRunId: { type: "string", description: "Optional calculation run id." },
            sourceWindowStart: { type: "string", description: "Source data window start." },
            sourceWindowEnd: { type: "string", description: "Source data window end." },
            metadata: { type: "object", description: "Optional metadata." }
          },
          required: ["instanceId", "ts"]
        }
      },
      async run(args, context) {
        if (!derivedMetrics) {
          return { error: "derived_metrics_unavailable" };
        }
        if (!context.canConfigure) {
          return boundsViolationResult("derived_metric_record_sample requires project:configure.");
        }
        try {
          const value = args.valueNum;
          const sample = derivedMetrics.recordSample({
            instanceId: textArg(args, "instanceId"),
            ts: textArg(args, "ts"),
            ...(typeof value === "number" && Number.isFinite(value) ? { valueNum: value } : {}),
            ...(textArg(args, "valueText") ? { valueText: textArg(args, "valueText") } : {}),
            ...(textArg(args, "quality") ? { quality: textArg(args, "quality") } : {}),
            ...(textArg(args, "status") ? { status: textArg(args, "status") } : {}),
            ...(textArg(args, "calculationRunId") ? { calculationRunId: textArg(args, "calculationRunId") } : {}),
            ...(textArg(args, "sourceWindowStart") ? { sourceWindowStart: textArg(args, "sourceWindowStart") } : {}),
            ...(textArg(args, "sourceWindowEnd") ? { sourceWindowEnd: textArg(args, "sourceWindowEnd") } : {}),
            ...(isPlainRecord(args.metadata) ? { metadata: args.metadata } : {})
          });
          return { sample };
        } catch (error) {
          return { error: error instanceof Error ? error.message : "derived_metric_record_sample_failed" };
        }
      }
    },
    {
      name: "derived_metric_read",
      category: "building",
      description: "Read a persisted derived metric instance with latest/history samples.",
      schema: {
        name: "derived_metric_read",
        description:
          "Read a derived metric by instanceId or by metricKey+entityId. Supports latest and history.",
        parameters: {
          type: "object",
          properties: {
            instanceId: { type: "string", description: "Metric instance id." },
            metricKey: { type: "string", description: "Metric key if instanceId is unknown." },
            entityId: { type: "string", description: "Entity id if instanceId is unknown." },
            mode: { type: "string", enum: ["latest", "history", "both"], description: "Default latest." },
            from: { type: "string", description: "History start ISO8601." },
            to: { type: "string", description: "History end ISO8601." },
            limit: { type: "number", description: "History limit." },
            order: { type: "string", enum: ["asc", "desc"], description: "History order." }
          }
        }
      },
      async run(args, context) {
        if (!derivedMetrics) {
          return { error: "derived_metrics_unavailable" };
        }
        const instanceId = textArg(args, "instanceId");
        const metricKey = textArg(args, "metricKey");
        const entityId = textArg(args, "entityId");
        if (!instanceId && (!metricKey || !entityId)) {
          return { error: "instanceId or metricKey+entityId is required" };
        }
        const instance = instanceId
          ? derivedMetrics.getInstance(instanceId)
          : derivedMetrics.lookup({
              projectId: context.projectId,
              metricKey,
              entityId,
              limit: 1
            })[0] ?? null;
        if (!instance) {
          return { error: "derived_metric_not_found" };
        }
        const mode = textArg(args, "mode") || "latest";
        const includeHistory = mode === "history" || mode === "both";
        const includeLatest = mode !== "history";
        return {
          instance,
          dashboardBinding: derivedMetricOutputDashboardBinding(instance),
          inputDashboardBindings: derivedMetricInputDashboardBindings(instance.entityId, derivedMetricInstanceDependencyInputs(instance)),
          ...(includeLatest ? { latest: derivedMetrics.readLatest(instance.instanceId) } : {}),
          ...(includeHistory
            ? {
                history: derivedMetrics.readHistory(instance.instanceId, {
                  ...(textArg(args, "from") ? { from: textArg(args, "from") } : {}),
                  ...(textArg(args, "to") ? { to: textArg(args, "to") } : {}),
                  limit: numArg(args, "limit", 720),
                  order: textArg(args, "order") === "desc" ? "desc" : "asc"
                })
              }
            : {})
        };
      }
    },
    {
      name: "session_summary",
      category: "session",
      description: "Return a compact summary of the current chat session.",
      schema: {
        name: "session_summary",
        description: "Return a compact summary of the current chat session.",
        parameters: { type: "object", properties: {} }
      },
      async run(_args, context) {
        return {
          projectId: context.projectId,
          userId: context.userId,
          messageCount: context.messages.length,
          lastRole: context.messages.at(-1)?.role ?? null
        };
      }
    },
    {
      name: "session_reset",
      category: "session",
      description: "Clear conversation context only; user and project memory banks persist.",
      schema: {
        name: "session_reset",
        description: "Clear conversation context only; user and project memory banks persist.",
        parameters: { type: "object", properties: {} }
      },
      async run() {
        return {
          clearedMemories: 0,
          note: "User/project memory banks unchanged. Use memory(action=clear) to clear a bank explicitly."
        };
      }
    },
    ...(sessionIndex
      ? [
          {
            name: "session_search",
            category: "memory" as const,
            description: "Search past conversation transcripts (discovery), browse recent threads, or scroll around a message.",
            schema: {
              name: "session_search",
              description:
                "Recall past conversations. Modes: discovery (query), browse (no query), scroll (conversation_id + optional around_message_id).",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string", description: "FTS query for discovery mode." },
                  limit: { type: "number", description: "Max results (default 8)." },
                  conversation_id: { type: "string", description: "Conversation id for scroll mode." },
                  around_message_id: { type: "string", description: "Anchor message for scroll mode." },
                  window: { type: "number", description: "Messages before/after anchor (default 4)." }
                }
              }
            },
            async run(args, context) {
              const query = textArg(args, "query");
              const conversationId = textArg(args, "conversation_id");
              const limit = numArg(args, "limit", 8);
              const window = numArg(args, "window", 4);
              const aroundMessageId = textArg(args, "around_message_id") || undefined;

              if (conversationId) {
                return {
                  mode: "scroll",
                  messages: sessionIndex.scroll(
                    context.projectId,
                    conversationId,
                    aroundMessageId,
                    window
                  )
                };
              }
              if (query) {
                return {
                  mode: "discovery",
                  hits: sessionIndex.search(context.projectId, query, limit)
                };
              }
              return {
                mode: "browse",
                conversations: sessionIndex.browse(context.projectId, limit)
              };
            }
          } satisfies AgentTool
        ]
      : []),
    {
      name: "read_file",
      category: "file",
      description: "Read a file from the project Knowledge Base or Repository. Returns text content with line numbers.",
      schema: {
        name: "read_file",
        description: "Read a file from the project Knowledge Base. Use this to inspect TTL, CSV, Markdown, and other text files in the knowledge base.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path to the file, relative to the project Knowledge Base or Repository directory." },
            offset: { type: "number", description: "Line number to start reading from (1-indexed, default 1)." },
            limit: { type: "number", description: "Maximum number of lines to read (default 200, max 500)." }
          },
          required: ["path"]
        }
      },
      async run(args, context) {
        const requestedPath = textArg(args, "path");
        if (!requestedPath) {
          return { error: "path is required" };
        }
        const resolved = resolveReadPath(context.projectId, requestedPath);
        if (!resolved || !existsSync(resolved.absolutePath)) {
          return { error: "Path not found in project Knowledge Base or Repository." };
        }
        try {
          const info = await stat(resolved.absolutePath);
          if (!info.isFile()) {
            return { error: "Not a file." };
          }
          const ext = path.extname(resolved.absolutePath).toLowerCase();
          if (!TEXT_EXTENSIONS.has(ext) && ext !== "") {
            return { error: `Cannot read binary files (extension: ${ext}).` };
          }
          if (info.size > MAX_READ_BYTES) {
            return { error: `File too large (${info.size} bytes). Maximum is ${MAX_READ_BYTES} bytes.` };
          }
          const content = await readFile(resolved.absolutePath, "utf8");
          const lines = content.split("\n");
          const offset = numArg(args, "offset", 1);
          const limit = Math.min(numArg(args, "limit", 200), 500);
          const start = Math.max(0, offset - 1);
          const slice = lines.slice(start, start + limit);
          const result = slice.map((line, i) => `${String(start + i + 1).padStart(6, " ")}\t${line}`).join("\n");
          return {
            path: requestedPath,
            resolvedPath: formatScopedPath(resolved.root, resolved.relativePath),
            source: resolved.root === "repo" ? "repository" : "kb",
            totalLines: lines.length,
            offset: start + 1,
            lines: slice.length,
            content: result
          };
        } catch (error) {
          return { error: error instanceof Error ? error.message : "Could not read file." };
        }
      }
    },
    {
      name: "search_files",
      category: "file",
      description: "Search for files in the project Knowledge Base or Repository by glob pattern or find text in file contents.",
      schema: {
        name: "search_files",
        description: "Search for files in the project Knowledge Base or Repository. Use mode='files' to find files by name pattern (glob). Use mode='content' to grep for text inside files.",
        parameters: {
          type: "object",
          properties: {
            pattern: { type: "string", description: "Glob pattern for file names (mode=files) or text to search for (mode=content)." },
            mode: { type: "string", description: "Search mode: 'files' (glob by name) or 'content' (grep in file contents). Default: 'files'." },
            glob: { type: "string", description: "Optional glob filter to narrow file matches (e.g. '*.ttl', '**/*.md')." }
          },
          required: ["pattern"]
        }
      },
      async run(args, context) {
        const pattern = textArg(args, "pattern");
        if (!pattern) {
          return { error: "pattern is required" };
        }
        const mode = textArg(args, "mode") || "files";
        const { kbRoot, repoRoot } = projectFileRoots(context.projectId);
        const results: Array<{ path: string; source: "kb" | "repository"; preview?: string }> = [];
        const MAX_RESULTS = 50;

        async function visit(dir: string, root: string): Promise<void> {
          if (results.length >= MAX_RESULTS) return;
          let children;
          try {
            children = await readdir(dir, { withFileTypes: true });
          } catch {
            return;
          }
          for (const child of children) {
            if (results.length >= MAX_RESULTS) return;
            if (child.name.startsWith(".")) continue;
            const absolute = path.join(dir, child.name);
            if (child.isDirectory()) {
              await visit(absolute, root);
              continue;
            }
            const relative = path.relative(root, absolute).split(path.sep).join("/");
            if (mode === "files") {
              // Simple glob matching
              const regex = new RegExp(pattern.replace(/\*\*/g, "___GLOBSTAR___").replace(/\*/g, "[^/]*").replace(/\?/g, ".").replace(/___GLOBSTAR___/g, ".*"));
              if (regex.test(relative)) {
                results.push({
                  path: `${root === repoRoot ? "repo" : "kb"}:/${relative}`,
                  source: root === repoRoot ? "repository" : "kb"
                });
              }
            } else {
              // Content search
              const ext = path.extname(child.name).toLowerCase();
              if (!TEXT_EXTENSIONS.has(ext)) continue;
              const fileStat = await stat(absolute).catch(() => null);
              if (!fileStat || fileStat.size > MAX_READ_BYTES) continue;
              try {
                const content = await readFile(absolute, "utf8");
                if (content.includes(pattern)) {
                  const firstLine = content.split("\n").find((line) => line.includes(pattern))?.trim().slice(0, 120) ?? "";
                  results.push({
                    path: `${root === repoRoot ? "repo" : "kb"}:/${relative}`,
                    source: root === repoRoot ? "repository" : "kb",
                    preview: firstLine
                  });
                }
              } catch {
                // skip unreadable
              }
            }
          }
        }

        // Search both project KB and repo
        const globFilter = textArg(args, "glob");
        for (const root of [kbRoot, repoRoot]) {
          if (existsSync(root)) await visit(root, root);
        }

        let filtered = results;
        if (globFilter) {
          const globRegex = new RegExp(globFilter.replace(/\*\*/g, "___GLOBSTAR___").replace(/\*/g, "[^/]*").replace(/\?/g, ".").replace(/___GLOBSTAR___/g, ".*"));
          // Strip kb:/repo: prefix before testing glob
          filtered = results.filter((r) => {
            const pathPart = r.path.slice(r.path.indexOf(":/") + 2);
            return globRegex.test(pathPart);
          });
        }

        return {
          mode,
          pattern,
          matches: filtered.slice(0, MAX_RESULTS),
          count: filtered.length
        };
      }
    },

    {
      name: "bms_live_read",
      category: "utility",
      description:
        "Read current present-value from enteliWEB for Element chiller points (demo server has credentials pre-configured). Prefer this over curl for live BACnet values.",
      schema: {
        name: "bms_live_read",
        description:
          "Fetch live BACnet present-value via enteliWEB. Provide point_name (e.g. WCC_1_Chilled_Water_Temp), object_ref, or full api_path. Resolves api_path from local BMS catalog (server BMS_DATABASE_API_URL, default 127.0.0.1:8765) when needed.",
        parameters: {
          type: "object",
          properties: {
            point_name: { type: "string", description: "Point name in BMS-database catalog, e.g. WCC_1_Chilled_Water_Temp" },
            object_ref: { type: "string", description: "BACnet object ref, e.g. //Elements/10101.AV5" },
            api_path: { type: "string", description: "Full enteliWEB URL if already known" }
          },
          required: []
        }
      },
      async run(args) {
        const result = await fetchEnteliLiveValue({
          pointName: textArg(args, "point_name"),
          objectRef: textArg(args, "object_ref"),
          apiPath: textArg(args, "api_path")
        });
        return { ...result };
      }
    },

    {
      name: "bms_points_query",
      category: "building",
      description:
        "Fast BMS catalog lookup (local collector API). Returns point names, object_ref, api_path, last_value (~5min). Prefer over terminal/curl.",
      schema: {
        name: "bms_points_query",
        description:
          "Search the local BMS-database point catalog. Server-only http://127.0.0.1:8765. Use before bms_live_read when api_path is unknown.",
        parameters: {
          type: "object",
          properties: {
            q: { type: "string", description: "Search keyword, e.g. WCC_3 or WCC_3_Chilled_Water_Temp" },
            limit: { type: "number", description: "Max rows (default 50, max 200)" }
          },
          required: ["q"]
        }
      },
      async run(args) {
        const q = textArg(args, "q");
        if (!q) {
          return { error: "q is required" };
        }
        const limit = Math.min(Math.max(1, Math.floor(numArg(args, "limit", 50))), 200);
        const base = bmsCollectorBaseUrl();
        const url = `${base}/api/v1/points?${new URLSearchParams({ q, limit: String(limit) }).toString()}`;
        try {
          const response = await fetch(url, { headers: { accept: "application/json" } });
          if (!response.ok) {
            return { error: `bms_points_query_failed:${response.status}`, url };
          }
          const payload = (await response.json()) as { total?: number; items?: unknown[] };
          const total = payload.total ?? 0;
          const items = payload.items ?? [];
          return {
            total,
            items,
            base_url: base,
            ...(total === 0
              ? {
                  hint:
                    "No catalog matches for this query. Reuse exact `name` values from a prior successful bms_points_query in this turn; do not retry with aliases (TLKW, kW, human labels)."
                }
              : {})
          };
        } catch (error) {
          return { error: error instanceof Error ? error.message : "bms_points_query_failed", base_url: base };
        }
      }
    },

    {
      name: "bms_timeseries_query",
      category: "building",
      description:
        "Fast historical BMS series (merged poll+history/readings). Prefer over terminal/curl. Times in UTC; display to users as HKT / Asia_Hong_Kong.",
      schema: {
        name: "bms_timeseries_query",
        description:
          "Fetch historical readings from local BMS-database GET /api/v1/timeseries with /api/v1/readings fallback. Provide name OR point_id OR object_ref, plus from (UTC ISO). For yesterday/today use from/to from CURRENT TIME CALENDAR RANGES in the system prompt.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Point name, e.g. WCC_3_Chilled_Water_Temp" },
            point_id: { type: "string", description: "Numeric point id from catalog" },
            object_ref: { type: "string", description: "BACnet object ref" },
            from: { type: "string", description: "Start time UTC ISO8601, e.g. 2026-05-17T00:00:00Z" },
            to: { type: "string", description: "End time UTC ISO8601 (optional)" },
            limit: { type: "number", description: "Max points (default 2000, max 20000)" },
            order: { type: "string", enum: ["asc", "desc"], description: "Sort order (default asc)" }
          },
          required: ["from"]
        }
      },
      async run(args) {
        const from = textArg(args, "from");
        if (!from) {
          return { error: "from is required (UTC ISO8601)" };
        }
        const name = textArg(args, "name");
        const pointId = textArg(args, "point_id");
        const objectRef = textArg(args, "object_ref");
        if (!name && !pointId && !objectRef) {
          return { error: "Provide name, point_id, or object_ref" };
        }
        const params: Record<string, string> = {
          from,
          limit: String(Math.min(Math.max(1, Math.floor(numArg(args, "limit", 2000))), 20000)),
          order: textArg(args, "order") === "desc" ? "desc" : "asc"
        };
        if (name) params.name = name;
        if (pointId) params.point_id = pointId;
        if (objectRef) params.object_ref = objectRef;
        const to = textArg(args, "to");
        if (to) params.to = to;
        const base = bmsCollectorBaseUrl();
        try {
          const result = await fetchTimeseries(base, params);
          return {
            total: result.total,
            items: result.items.slice(0, Number(params.limit)),
            base_url: base,
            query: params
          };
        } catch (error) {
          return { error: error instanceof Error ? error.message : "bms_timeseries_query_failed", base_url: base };
        }
      }
    },

    {
      name: "dashboard_create",
      category: "building",
      description:
        "Create a structured dashboard resource from a validated JSON spec. Use this when the user asks to monitor equipment or generate a dashboard.",
      schema: {
        name: "dashboard_create",
        description:
          "Create a dashboard with typed widgets. Provide title and widgets; layout and sections are optional because this tool normalizes them into a canonical 12-column layout. Never generate raw HTML/JS. Supported widgets: live_value_grid for compact live tables, stat_value for one prominent current/latest value, timeseries_chart for history, bar_comparison for comparing latest numeric values across equipment or points, and note for operator annotations without point bindings. For multi-equipment monitoring, group live/stat widgets by equipment; one focused trend per equipment/asset is added when trends are not explicitly disabled. This tool repairs missing/invalid sections into Overview, Comparison, Trends, and conditional Notes. Preferred widget fields are id, kind, title, pointBindings; note widgets should use content and optional tone. The tool accepts raw BMS bindings ({pointName,label,unit}) and derived metric bindings ({source:\"derived_metric\",metricInstanceId} or {source:\"derived_metric\",metricKey,entityId,label,unit}). Bindings may include entityId/groupId, dependencyRole, and defaultVisible=false for audit/input trend series.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Dashboard title." },
            description: { type: "string", description: "Optional operator-facing description." },
            visibility: { type: "string", enum: ["private", "project"], description: "Optional visibility; monitoring dashboards should usually default to project unless the user asks for private." },
            sourceConversationId: { type: "string", description: "Optional source conversation id." },
            widgets: {
              type: "array",
              description:
                "Widget definitions. Supported kinds: live_value_grid, stat_value, timeseries_chart, bar_comparison, note. Use pointBindings with raw BMS bindings [{pointName,label,role,unit}] or derived metric bindings [{source:\"derived_metric\",metricInstanceId,metricKey,entityId,label,unit}]. Optional binding fields: entityId/groupId, dependencyRole, defaultVisible. Use stat_value for one key current value; use bar_comparison for latest-value comparisons; use note with content/tone for board annotations."
            },
            layout: {
              type: "array",
              description:
                "Optional placements in the canonical 12-column layout. If omitted or invalid, the tool generates stable type-based placements."
            },
            sections: {
              type: "array",
              description:
                "Optional section hints. If omitted or invalid, the tool generates Overview, Trends, Comparison when needed, and Notes only when note widgets exist."
            },
            includeOverview: {
              type: "boolean",
              description: "Optional. Leave true/default unless the user explicitly asks for no overview/current-value section."
            },
            includeTrends: {
              type: "boolean",
              description: "Optional. Leave true/default unless the user explicitly asks for no trends."
            }
          },
          required: ["title", "widgets"]
        }
      },
      async run(args, context) {
        if (!context.dashboardOps) {
          return { error: "dashboard_create_unavailable" };
        }
        const parsed = parseDashboardMutationInput({
          ...normalizeDashboardCreateArgs(args, derivedMetrics, context.projectId),
          ...(textArg(args, "visibility") ? {} : { visibility: "project" }),
          sourceConversationId: textArg(args, "sourceConversationId") || context.conversationId
        });
        if ("error" in parsed) {
          return { error: parsed.error };
        }
        const dashboard = context.dashboardOps.create(parsed);
        return {
          ok: true,
          dashboard,
          path: dashboardPath(context.projectId, dashboard.id),
          message: `Dashboard created: ${dashboard.title}`
        };
      }
    },

    // --- Terminal / execute_code tool ---
    {
      name: "terminal",
      category: "utility",
      description: "Execute a shell command for installs, Python scripts, SPARQL, and CLIs. If a command fails due to missing packages or binaries, install them here first (pip/npm/apt), verify, then retry — do not workaround. Working directory is the Repository; outputs go to $OUTPUT_DIR.",
      schema: {
        name: "terminal",
        description: "Execute a shell command with timeout. Use to install dependencies (e.g. pip install matplotlib seaborn pandas) and run scripts/CLIs. On missing-library errors, install and retry before answering. cwd=Repository; outputs in $OUTPUT_DIR.",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string", description: "The shell command to execute (e.g. 'python -c \"print(1+1)\"', 'ls -la', 'sparql --query ...')." },
            timeout: { type: "number", description: "Timeout in seconds (default 30, max 120)." }
          },
          required: ["command"]
        }
      },
      async run(args, context) {
        const command = textArg(args, "command");
        if (!command) {
          return { error: "command is required" };
        }
        const guard = terminalCommandGuard(command);
        if (guard) {
          return guard;
        }
        const timeout = Math.min(numArg(args, "timeout", 30), 120) * 1000;
        const { kbRoot, repoRoot } = projectFileRoots(context.projectId);
        const outputDir = path.join(repoRoot, "outputs");
        const startedAtMs = Date.now();

        let result: string;
        try {
          await mkdir(outputDir, { recursive: true });

          // Force correct output path — replace ../kb/outputs with the actual OUTPUT_DIR
          const outputDirForward = outputDir.replace(/\\/g, "/");
          const patchedCommand = command.replace(/\.\.\/kb\/outputs/g, outputDirForward);

          result = await new Promise<string>((resolve, reject) => {
            const child = exec(patchedCommand, {
              cwd: repoRoot,
              timeout,
              maxBuffer: TERMINAL_MAX_OUTPUT,
              shell: process.env.SHELL ?? (process.platform === "win32" ? "cmd.exe" : "/bin/bash"),
              env: { ...process.env, PYTHONUNBUFFERED: "1", MPLBACKEND: "Agg", REPO_DIR: repoRoot, KB_DIR: kbRoot, OUTPUT_DIR: outputDir }
            }, (error, stdout, stderr) => {
              if (error && !stdout && !stderr) {
                reject(error);
                return;
              }
              const out = [stdout, stderr].filter(Boolean).join("\n").slice(0, TERMINAL_MAX_OUTPUT);
              resolve(out || error?.message || "(no output)");
            });
          });
        } catch (error) {
          result = error instanceof Error ? error.message : "Command failed";
        }

        const { files: outputFiles, synced } = await syncAndListOutputFiles(outputDir, kbRoot);
        const generatedImages = collectFreshGeneratedImages(outputFiles, "terminal", startedAtMs);
        const generatedDownloads = collectFreshGeneratedDownloads(outputFiles, startedAtMs);
        const augmentedOutput = appendGeneratedOutputHints(result.slice(0, TERMINAL_MAX_OUTPUT), generatedImages, generatedDownloads, synced);

        return augmentToolResultForEnvironment({
          command,
          cwd: repoRoot,
          outputDir,
          output: augmentedOutput,
          truncated: result.length > TERMINAL_MAX_OUTPUT,
          outputFiles,
          synced,
          generatedImages,
          generatedDownloads
        }, `${result}\n${augmentedOutput}`);
      }
    },

    // --- execute_code tool (dedicated Python execution) ---
    {
      name: "execute_code",
      category: "utility",
      description: "Run Python for analysis and charts. Data: build_combined_frame, data_coverage, col_series, load_all_series. Charts: new_figure, set_chart_title, plot_series, chart_color, format_hkt_axis, finalize_legend, save_chart (fixed enterprise style). matplotlib/seaborn/pandas pre-installed — do not pip install mid-turn.",
      schema: {
        name: "execute_code",
        description: "Execute Python for analysis/charts. Data: build_combined_frame() + data_coverage(); charts: new_figure() + set_chart_title() + plot_series() + format_hkt_axis + finalize_legend + save_chart. Fixed enterprise presentation style. Must end chart scripts with save_chart(fig, 'name.png'). English on-chart text only.",
        parameters: {
          type: "object",
          properties: {
            code: { type: "string", description: "Python source code to execute." },
            timeout: { type: "number", description: "Timeout in seconds (default 30, max 120)." }
          },
          required: ["code"]
        }
      },
      async run(args, context) {
        const code = textArg(args, "code");
        if (!code) {
          return { error: "code is required" };
        }
        const timeout = Math.min(numArg(args, "timeout", 30), 120) * 1000;
        const { kbRoot, repoRoot } = projectFileRoots(context.projectId);
        const outputDir = path.join(repoRoot, "outputs");
        const cacheDir = path.join(outputDir, ".tool_cache");
        const manifestPath = path.join(repoRoot, toolCacheManifestRelativePath(context.requestId));
        const tempPath = path.join(repoRoot, "_hermes_tmp.py");
        const startedAtMs = Date.now();

        let stdout = "";
        let stderr = "";
        let exitCode = 0;
        try {
          await mkdir(cacheDir, { recursive: true });
          await mkdir(outputDir, { recursive: true });

          // Force the correct output directory — replace any ../kb/outputs paths
          const patchedCode = executeCodeInjectedHeader() + code
            .replace(/Path\(['"]\.\.\/kb\/outputs['"]\)/g, `Path(os.environ['OUTPUT_DIR'])`)
            .replace(/['"]\.\.\/kb\/outputs\//g, `os.environ['OUTPUT_DIR'] + "/`)
            .replace(/['"]\.\.\/kb\/outputs['"]/g, `os.environ['OUTPUT_DIR']`);

          await writeFile(tempPath, patchedCode, "utf8");
          await new Promise<string>((resolve, reject) => {
            const child = exec(
              `${pythonExecutable()} "${tempPath}"`,
              {
                cwd: repoRoot,
                timeout,
                maxBuffer: TERMINAL_MAX_OUTPUT,
                shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
                env: {
                  ...process.env,
                  PYTHONUNBUFFERED: "1",
                  MPLBACKEND: "Agg",
                  REPO_DIR: repoRoot,
                  KB_DIR: kbRoot,
                  OUTPUT_DIR: outputDir,
                  REQUEST_ID: context.requestId,
                  TOOL_CACHE_MANIFEST: manifestPath
                }
              },
              (error, out, err) => {
                if (error && !out && !err) {
                  reject(error);
                  return;
                }
                stdout = (out || "").slice(0, TERMINAL_MAX_OUTPUT);
                stderr = (err || "").slice(0, TERMINAL_MAX_OUTPUT);
                if (error?.code != null) {
                  const code = typeof error.code === "number" ? error.code : Number(error.code);
                  if (Number.isFinite(code)) {
                    exitCode = code;
                  }
                }
                resolve(stdout || stderr || "(no output)");
              }
            );
          });
          if (/Traceback|SyntaxError|ModuleNotFoundError|FileNotFoundError/i.test(stderr)) {
            exitCode = exitCode || 1;
          }
          const { files: outputFiles, synced } = await syncAndListOutputFiles(outputDir, kbRoot);
          const generatedImages = collectFreshGeneratedImages(outputFiles, "execute_code", startedAtMs);
          const generatedDownloads = collectFreshGeneratedDownloads(outputFiles, startedAtMs);
          const sanityMessage = chartSanityViolation(code, generatedImages.length);
          if (sanityMessage && exitCode === 0) {
            exitCode = 1;
            stderr = stderr ? `${stderr}\n${sanityMessage}` : sanityMessage;
          }
          const augmentedStdout = appendGeneratedOutputHints(stdout.slice(0, TERMINAL_MAX_OUTPUT), generatedImages, generatedDownloads, synced);

          return augmentToolResultForEnvironment({
            stdout: augmentedStdout,
            stderr: stderr.slice(0, TERMINAL_MAX_OUTPUT),
            repoRoot,
            outputDir,
            truncated: stdout.length > TERMINAL_MAX_OUTPUT || stderr.length > TERMINAL_MAX_OUTPUT,
            outputFiles,
            synced,
            generatedImages,
            generatedDownloads,
            ...(exitCode !== 0 ? { exitCode, error: stderr.trim().split("\n").pop() ?? "Python execution failed" } : {})
          }, `${stdout}\n${stderr}`);
        } catch (error) {
          const failureText = stderr.slice(0, TERMINAL_MAX_OUTPUT) || (error instanceof Error ? error.message : "Execution failed");
          return augmentToolResultForEnvironment({
            stdout: stdout.slice(0, TERMINAL_MAX_OUTPUT),
            stderr: failureText,
            error: error instanceof Error ? error.message : "Execution failed",
            exitCode: 1,
            outputDir
          }, failureText);
        } finally {
          try { await unlink(tempPath); } catch { /* best effort cleanup */ }
        }
      }
    },

    // --- write_file tool ---
    {
      name: "write_file",
      category: "file",
      description: "Create or overwrite a file in the project Repository. All model-generated outputs should go to Repository.",
      schema: {
        name: "write_file",
        description: "Create or overwrite a text file in the project Repository. Creates parent directories automatically. Use outputs/ for user-facing generated artifacts.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path to the file, relative to the project Repository directory." },
            content: { type: "string", description: "File content to write." }
          },
          required: ["path", "content"]
        }
      },
      async run(args, context) {
        const requestedPath = textArg(args, "path");
        const content = textArg(args, "content");
        if (!requestedPath) {
          return { error: "path is required" };
        }
        if (!content) {
          return { error: "content is required" };
        }
        if (content.length > MAX_WRITE_BYTES) {
          return { error: `Content too large (${content.length} bytes). Maximum is ${MAX_WRITE_BYTES} bytes.` };
        }
        const resolved = resolveRepoWritePath(context.projectId, requestedPath);
        if (!resolved) {
          return { error: "Writes are only allowed inside the project Repository." };
        }
        try {
          await mkdir(path.dirname(resolved.absolutePath), { recursive: true });
          await writeFile(resolved.absolutePath, content, "utf8");
          const written = await stat(resolved.absolutePath);
          const normalizedPath = resolved.relativePath.replace(/\\/g, "/");
          const downloadHint =
            normalizedPath.startsWith("outputs/") && !IMAGE_EXTENSIONS.has(path.extname(normalizedPath).toLowerCase())
              ? ` Include in your answer: [${path.basename(normalizedPath)}](${normalizedPath})`
              : normalizedPath.startsWith("outputs/") && IMAGE_EXTENSIONS.has(path.extname(normalizedPath).toLowerCase())
                ? ` Include in your answer: ![${path.basename(normalizedPath)}](${normalizedPath})`
                : "";
          return {
            path: resolved.relativePath,
            resolvedPath: formatScopedPath("repo", resolved.relativePath),
            size: written.size,
            message: `File written to repository successfully (${written.size} bytes).${downloadHint}`
          };
        } catch (error) {
          return { error: error instanceof Error ? error.message : "Could not write file." };
        }
      }
    },

    // --- patch / edit_file tool ---
    {
      name: "patch",
      category: "file",
      description: "Replace a string in a project Repository file. Provide the exact old string and the new string. Only the first match is replaced. Use read_file first to see the current content.",
      schema: {
        name: "patch",
        description: "Make a targeted edit to a text file in the project Repository. Provide the exact old_string to find and the new_string to replace it with. Only the first occurrence is replaced.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path to the file, relative to the project Knowledge Base or Repository directory." },
            old_string: { type: "string", description: "Exact text to replace." },
            new_string: { type: "string", description: "Replacement text." }
          },
          required: ["path", "old_string", "new_string"]
        }
      },
      async run(args, context) {
        const requestedPath = textArg(args, "path");
        const oldStr = textArg(args, "old_string");
        const newStr = textArg(args, "new_string");
        if (!requestedPath) return { error: "path is required" };
        if (!oldStr) return { error: "old_string is required" };
        const resolved = resolveRepoWritePath(context.projectId, requestedPath);
        if (!resolved || !existsSync(resolved.absolutePath)) return { error: "Path not found in project Repository." };
        try {
          const info = await stat(resolved.absolutePath);
          if (!info.isFile()) return { error: "Not a file." };
          if (info.size > MAX_READ_BYTES) return { error: `File too large (${info.size} bytes).` };
          const content = await readFile(resolved.absolutePath, "utf8");
          const idx = content.indexOf(oldStr);
          if (idx === -1) return { error: "old_string not found in file. Use read_file to verify the exact content." };
          const patched = content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
          await writeFile(resolved.absolutePath, patched, "utf8");
          return {
            path: resolved.relativePath,
            resolvedPath: formatScopedPath("repo", resolved.relativePath),
            replaced: oldStr.length > 80 ? oldStr.slice(0, 80) + "..." : oldStr,
            message: `Replaced 1 occurrence. File now ${patched.length} chars.`
          };
        } catch (error) {
          return { error: error instanceof Error ? error.message : "Could not patch file." };
        }
      }
    },

    // --- Scheduler / Reminder tools ---
    {
      name: "schedule_reminder",
      category: "utility",
      description: "Schedule a timed reminder message. Supports delays from seconds to 30 days. Returns a job_id for cancellation.",
      schema: {
        name: "schedule_reminder",
        description: "Schedule a timed reminder message. Use when the user asks to be reminded about something after a time delay.",
        parameters: {
          type: "object",
          properties: {
            delay_seconds: { type: "number", description: "Delay in seconds before the reminder fires." },
            message: { type: "string", description: "The reminder message to send." }
          },
          required: ["delay_seconds", "message"]
        }
      },
      async run(args, context) {
        if (!scheduler) {
          return { error: "Scheduler service is not available." };
        }
        const delay = typeof args.delay_seconds === "number" ? args.delay_seconds : 0;
        const message = typeof args.message === "string" ? args.message.trim() : "";
        if (delay <= 0 || delay > 86400 * 30) {
          return { error: "delay_seconds must be between 1 and 2592000 (30 days)." };
        }
        if (!message) {
          return { error: "message is required." };
        }
        const job = scheduler.schedule({
          projectId: context.projectId,
          conversationId: context.conversationId,
          userId: context.userId,
          message,
          triggerAt: Date.now() + delay * 1000
        });
        return {
          jobId: job.jobId,
          message: job.message,
          triggerAt: new Date(job.triggerAt).toISOString(),
          delay_seconds: delay
        };
      }
    },
    {
      name: "cancel_reminder",
      category: "utility",
      description: "Cancel pending reminders. 'cancel_recent' cancels the most recent reminder; 'cancel_all' cancels all pending reminders for the project.",
      schema: {
        name: "cancel_reminder",
        description: "Cancel one or all pending reminders.",
        parameters: {
          type: "object",
          properties: {
            action: { type: "string", description: "'cancel_recent' or 'cancel_all'." }
          },
          required: ["action"]
        }
      },
      async run(args, context) {
        if (!scheduler) {
          return { error: "Scheduler service is not available." };
        }
        const action = typeof args.action === "string" ? args.action : "";
        if (action === "cancel_recent") {
          const cancelled = scheduler.cancelMostRecent(context.projectId);
          return cancelled
            ? { cancelled: true, jobId: cancelled.jobId, message: cancelled.message }
            : { cancelled: false, reason: "No pending reminders to cancel." };
        }
        if (action === "cancel_all") {
          const count = scheduler.cancelAll(context.projectId);
          return { cancelled: true, count };
        }
        return { error: "action must be 'cancel_recent' or 'cancel_all'." };
      }
    },
    {
      name: "list_reminders",
      category: "utility",
      description: "List all reminders for the current project.",
      schema: {
        name: "list_reminders",
        description: "List all reminder jobs for the current project.",
        parameters: { type: "object", properties: {} }
      },
      async run(_args, context) {
        if (!scheduler) {
          return { error: "Scheduler service is not available." };
        }
        const jobs = scheduler.list(context.projectId);
        return {
          reminders: jobs.map((j: ScheduledJob) => ({
            jobId: j.jobId,
            message: j.message,
            status: j.status,
            triggerAt: new Date(j.triggerAt).toISOString(),
            createdAt: new Date(j.createdAt).toISOString()
          })),
          count: jobs.length
        };
      }
    },
    {
      name: "cronjob",
      category: "utility",
      description: "Manage cron jobs: list, get, create, update, pause, resume, remove, trigger. Supports one-shot, interval, and cron-expression schedules.",
      schema: {
        name: "cronjob",
        description: "Manage scheduled and recurring jobs. Use 'list' to see all jobs, 'create' to schedule a new job (supports interval seconds, cron expressions), 'pause'/'resume' for recurring jobs, 'remove' to cancel.",
        parameters: {
          type: "object",
          properties: {
            action: {
              type: "string",
              description: "Action: 'list', 'get', 'create', 'update', 'pause', 'resume', 'remove', 'trigger'."
            },
            job_id: { type: "string", description: "Job ID for get/pause/resume/remove/trigger actions." },
            name: { type: "string", description: "Display name for the job (create/update)." },
            message: { type: "string", description: "Message to deliver when the job fires (create/update)." },
            schedule: { type: "string", description: "Cron expression (5-field: 'min hour dom month dow') or interval in seconds (create/update)." },
            is_interval: { type: "boolean", description: "If true, schedule is treated as interval seconds. If false or omitted, treated as cron expression." }
          },
          required: ["action"]
        }
      },
      async run(args, context) {
        if (!scheduler) {
          return { error: "Scheduler service is not available." };
        }
        const action = typeof args.action === "string" ? args.action : "";

        switch (action) {
          case "list": {
            const jobs = scheduler.list(context.projectId);
            return {
              jobs: jobs.map((j: ScheduledJob) => ({
                jobId: j.jobId,
                message: j.message,
                status: j.status,
                triggerAt: new Date(j.triggerAt).toISOString(),
                createdAt: new Date(j.createdAt).toISOString(),
                recurrence: j.recurrence ?? null,
                runCount: j.runCount ?? 0
              })),
              count: jobs.length
            };
          }

          case "get": {
            const jobId = typeof args.job_id === "string" ? args.job_id : "";
            if (!jobId) return { error: "job_id is required for 'get' action." };
            const jobs = scheduler.list(context.projectId);
            const job = jobs.find((j) => j.jobId === jobId);
            if (!job) return { error: `Job not found: ${jobId}` };
            return {
              job: {
                jobId: job.jobId,
                message: job.message,
                status: job.status,
                triggerAt: new Date(job.triggerAt).toISOString(),
                createdAt: new Date(job.createdAt).toISOString(),
                recurrence: job.recurrence ?? null,
                runCount: job.runCount ?? 0
              }
            };
          }

          case "create": {
            const message = typeof args.message === "string" ? args.message.trim() : "";
            if (!message) return { error: "message is required for 'create'." };

            const scheduleRaw = typeof args.schedule === "string" ? args.schedule.trim() : "";
            const isInterval = args.is_interval === true;

            let triggerAt = Date.now() + 60_000;
            let recurrence: JobRecurrence | undefined;

            if (isInterval && scheduleRaw) {
              const seconds = parseInt(scheduleRaw, 10);
              if (isNaN(seconds) || seconds <= 0) return { error: "schedule must be a positive number of seconds for interval type." };
              triggerAt = Date.now() + seconds * 1000;
              recurrence = { type: "interval", intervalSeconds: seconds };
            } else if (!isInterval && scheduleRaw) {
              recurrence = { type: "cron", cronExpression: scheduleRaw };
              triggerAt = nextCronTime(scheduleRaw, Date.now()) ?? Date.now() + 60_000;
            } else {
              // One-shot with default 60s delay
              triggerAt = Date.now() + 60_000;
            }

            const job = scheduler.schedule({
              projectId: context.projectId,
              conversationId: context.conversationId,
              userId: context.userId,
              message,
              triggerAt,
              ...(recurrence ? { recurrence } : {})
            });

            return {
              created: true,
              jobId: job.jobId,
              message: job.message,
              triggerAt: new Date(job.triggerAt).toISOString(),
              recurrence: job.recurrence ?? null
            };
          }

          case "pause": {
            const jobId = typeof args.job_id === "string" ? args.job_id : "";
            if (!jobId) return { error: "job_id is required." };
            const ok = scheduler.pause(jobId);
            return ok ? { paused: true, jobId } : { error: "Could not pause job. Is it a pending recurring job?" };
          }

          case "resume": {
            const jobId = typeof args.job_id === "string" ? args.job_id : "";
            if (!jobId) return { error: "job_id is required." };
            const ok = scheduler.resume(jobId);
            return ok ? { resumed: true, jobId } : { error: "Could not resume job. Is it a paused job?" };
          }

          case "remove": {
            const jobId = typeof args.job_id === "string" ? args.job_id : "";
            if (!jobId) return { error: "job_id is required." };
            const ok = scheduler.cancel(jobId);
            return ok ? { removed: true, jobId } : { error: "Could not remove job." };
          }

          case "trigger": {
            const jobId = typeof args.job_id === "string" ? args.job_id : "";
            if (!jobId) return { error: "job_id is required." };
            // Trigger by scheduling immediately
            const triggered = scheduler.schedule({
              projectId: context.projectId,
              conversationId: context.conversationId,
              userId: context.userId,
              message: `[Triggered] job ${jobId}`,
              triggerAt: Date.now() + 1000
            });
            return { triggered: true, jobId: triggered.jobId, message: "Job triggered for immediate execution." };
          }

          case "update": {
            const jobId = typeof args.job_id === "string" ? args.job_id : "";
            if (!jobId) return { error: "job_id is required." };
            // Cancel old, create new with same ID
            scheduler.cancel(jobId);
            const message = typeof args.message === "string" ? args.message.trim() : "Updated reminder";
            const updated = scheduler.schedule({
              projectId: context.projectId,
              conversationId: context.conversationId,
              userId: context.userId,
              message,
              triggerAt: Date.now() + 60_000
            });
            return { updated: true, jobId: updated.jobId, message: updated.message };
          }

          default:
            return { error: `Unknown action: ${action}. Supported: list, get, create, update, pause, resume, remove, trigger.` };
        }
      }
    },

    // --- Web search tools ---
    {
      name: "web_search",
      category: "web",
      description: "Search the web using DuckDuckGo Instant Answer API. Returns abstracts, related topics, and source URLs. Free, no API key required.",
      schema: {
        name: "web_search",
        description: "Search the web for information. Returns abstract, related topics, and source links. Use for looking up current information, documentation, or general knowledge.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query." }
          },
          required: ["query"]
        }
      },
      async run(args, context) {
        const query = textArg(args, "query");
        if (!query) return { error: "query is required." };
        try {
          const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 10_000);
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timer);
          if (!response.ok) {
            return { error: `Search returned HTTP ${response.status}.` };
          }
          const data = (await response.json()) as Record<string, unknown>;
          const results: Array<{ title: string; snippet: string; url?: string }> = [];

          // Abstract
          if (typeof data.AbstractText === "string" && data.AbstractText.trim()) {
            const abstractUrl = typeof data.AbstractURL === "string" ? data.AbstractURL : null;
            results.push({
              title: (typeof data.Heading === "string" ? data.Heading : "Abstract"),
              snippet: data.AbstractText as string,
              ...(abstractUrl ? { url: abstractUrl } : {})
            } as { title: string; snippet: string; url?: string });
          }

          // Related topics
          const relatedTopics = data.RelatedTopics as Array<Record<string, unknown>> | undefined;
          if (Array.isArray(relatedTopics)) {
            for (const topic of relatedTopics) {
              if (typeof topic.Text === "string") {
                const topicUrl = typeof topic.FirstURL === "string" ? topic.FirstURL : null;
                results.push({
                  title: typeof topic.FirstURL === "string"
                    ? decodeURIComponent((topic.FirstURL as string).split("/").pop() ?? "").replace(/_/g, " ")
                    : "",
                  snippet: topic.Text,
                  ...(topicUrl ? { url: topicUrl } : {})
                } as { title: string; snippet: string; url?: string });
              }
            }
          }

          // Answer
          if (typeof data.Answer === "string" && data.Answer.trim()) {
            results.unshift({
              title: "Answer",
              snippet: data.Answer
            });
          }

          return {
            query,
            results: results.slice(0, 20),
            resultCount: results.length,
            source: "DuckDuckGo"
          };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : "Web search failed.",
            query
          };
        }
      }
    },
    {
      name: "web_extract",
      category: "web",
      description: "Fetch and extract readable text content from a URL. Strips HTML tags, scripts, and styles.",
      schema: {
        name: "web_extract",
        description: "Fetch a URL and extract its readable text content. Use to read documentation pages, articles, or any web content.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL to fetch and extract text from." },
            max_length: { type: "number", description: "Maximum characters to return (default 10,000, max 50,000)." }
          },
          required: ["url"]
        }
      },
      async run(args, context) {
        const url = textArg(args, "url");
        if (!url) return { error: "url is required." };
        const maxLen = Math.min(numArg(args, "max_length", 10_000), 50_000);

        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 15_000);
          const response = await fetch(url, {
            signal: controller.signal,
            headers: {
              "User-Agent": "BuildingGPT/1.0 (web-extract-bot)",
              "Accept": "text/html,text/plain"
            }
          });
          clearTimeout(timer);

          if (!response.ok) {
            return { error: `HTTP ${response.status} from ${url}.` };
          }

          const contentType = response.headers.get("content-type") ?? "";
          if (!contentType.includes("text/") && !contentType.includes("application/json")) {
            return { error: `Unsupported content type: ${contentType}. Only text content is supported.` };
          }

          const html = await response.text();
          // Simple HTML-to-text: remove scripts, styles, tags
          const text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#x27;/g, "'")
            .replace(/&nbsp;/g, " ")
            .replace(/\s+/g, " ")
            .trim();

          const truncated = text.length > maxLen ? text.slice(0, maxLen) + "..." : text;

          return {
            url,
            text: truncated,
            length: truncated.length,
            truncated: text.length > maxLen
          };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : "Web extract failed.",
            url
          };
        }
      }
    },

    // --- Background process management tools ---
    {
      name: "process_start",
      category: "utility",
      description: "Start a command in the background. Returns a process_id for status checking and control.",
      schema: {
        name: "process_start",
        description: "Run a shell command in the background. Use for long-running tasks. Returns a process_id for use with process_status/process_kill.",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string", description: "Shell command to run in the background." }
          },
          required: ["command"]
        }
      },
      async run(args, context) {
        if (!processRegistry) {
          return { error: "Process registry is not available." };
        }
        const command = textArg(args, "command");
        if (!command) return { error: "command is required." };
        const processId = processRegistry.spawn(command);
        const info = processRegistry.status(processId);
        return {
          processId,
          command,
          status: info?.status ?? "running",
          startedAt: info?.startedAt ?? new Date().toISOString()
        };
      }
    },
    {
      name: "process_status",
      category: "utility",
      description: "Get the current status and output of a background process.",
      schema: {
        name: "process_status",
        description: "Check the status of a background process. Returns stdout, stderr, exit code, and status.",
        parameters: {
          type: "object",
          properties: {
            process_id: { type: "string", description: "Process ID from process_start." }
          },
          required: ["process_id"]
        }
      },
      async run(args, context) {
        if (!processRegistry) {
          return { error: "Process registry is not available." };
        }
        const processId = typeof args.process_id === "string" ? args.process_id : "";
        if (!processId) return { error: "process_id is required." };
        const info = processRegistry.status(processId);
        if (!info) return { error: `Process not found: ${processId}` };
        return {
          processId: info.processId,
          status: info.status,
          command: info.command,
          stdout: info.stdout.slice(-5000),
          stderr: info.stderr.slice(-5000),
          exitCode: info.exitCode,
          startedAt: info.startedAt,
          finishedAt: info.finishedAt
        };
      }
    },
    {
      name: "process_kill",
      category: "utility",
      description: "Terminate a running background process.",
      schema: {
        name: "process_kill",
        description: "Kill a background process by its process_id.",
        parameters: {
          type: "object",
          properties: {
            process_id: { type: "string", description: "Process ID from process_start." }
          },
          required: ["process_id"]
        }
      },
      async run(args, context) {
        if (!processRegistry) {
          return { error: "Process registry is not available." };
        }
        const processId = typeof args.process_id === "string" ? args.process_id : "";
        if (!processId) return { error: "process_id is required." };
        const ok = processRegistry.kill(processId);
        return ok
          ? { killed: true, processId }
          : { error: `Could not kill process: ${processId}. It may have already finished.` };
      }
    },
    {
      name: "process_list",
      category: "utility",
      description: "List all background processes (newest first).",
      schema: {
        name: "process_list",
        description: "List all background processes and their statuses.",
        parameters: { type: "object", properties: {} }
      },
      async run(_args, context) {
        if (!processRegistry) {
          return { error: "Process registry is not available." };
        }
        const processes = processRegistry.list();
        return {
          processes: processes.map((p) => ({
            processId: p.processId,
            command: p.command.slice(0, 100),
            status: p.status,
            exitCode: p.exitCode,
            startedAt: p.startedAt,
            finishedAt: p.finishedAt
          })),
          count: processes.length
        };
      }
    }
  ];

  for (const tool of tools) {
    registry.register(tool);
  }

  // Register skill CRUD tools if a skill registry is available
  if (skills) {
    for (const tool of skills.buildCrudToolDefs(projectSkillBindings)) {
      registry.register(tool);
    }
  }

  if (projectGroundingBindings) {
    registry.register({
      name: "project_grounding_add",
      category: "memory",
      description:
        "Save a site-specific project grounding rule (shared by all users). Use for explicit site facts; prefer feedback_commit_playbook after a correction workflow.",
      schema: {
        name: "project_grounding_add",
        description: "Add a project grounding rule that must be followed in future turns.",
        parameters: {
          type: "object",
          properties: {
            content: { type: "string", description: "Rule text to persist for this project." }
          },
          required: ["content"]
        }
      },
      async run(args, context) {
        if (!context.canConfigure) {
          return boundsViolationResult(
            "project_grounding_add requires project:configure. Use feedback_commit_playbook after the correction workflow."
          );
        }
        const content = textArg(args, "content");
        if (!content) {
          return { error: "content is required" };
        }
        const rule = projectGroundingBindings.add(context.projectId, content, {
          source: "operator",
          createdBy: context.userId
        });
        return { rule };
      }
    });
    registry.register({
      name: "project_grounding_list",
      category: "memory",
      description: "List project grounding rules for the current project.",
      schema: {
        name: "project_grounding_list",
        description: "List site-specific grounding rules.",
        parameters: { type: "object", properties: {}, required: [] }
      },
      async run(_args, context) {
        const rules = projectGroundingBindings.list(context.projectId);
        return { rules, count: rules.length, projectId: context.projectId };
      }
    });
  }

  if (projectFeedbackBindings) {
    registry.register({
      name: "feedback_propose",
      category: "memory",
      description:
        "Record a correction proposal ONLY after the user explicitly agrees to save it as a project rule. Never call in the same turn as the initial fix unless they asked to save.",
      schema: {
        name: "feedback_propose",
        description:
          "Record user correction and proposed fix plan; status=proposed. Requires prior user consent to save as a site rule.",
        parameters: {
          type: "object",
          properties: {
            user_correction: { type: "string", description: "What the user said was wrong (English)." },
            proposed_fix: {
              type: "string",
              description:
                "Broad site rule in English: underlying principle, evidence or signals, ambiguity handling, and scope of question types — not one exact phrasing or single data point."
            },
            trigger_topics: {
              type: "array",
              items: { type: "string" },
              description:
                "Keywords for the whole topic family, synonyms, and paraphrases users might use. Non-English phrases OK for matching only."
            }
          },
          required: ["user_correction", "proposed_fix", "trigger_topics"]
        }
      },
      async run(args, context) {
        const userCorrection = textArg(args, "user_correction");
        const proposedFix = textArg(args, "proposed_fix");
        const triggerTopics = stringArrayArg(args, "trigger_topics");
        if (!userCorrection || !proposedFix || triggerTopics.length === 0) {
          return { error: "user_correction, proposed_fix, and trigger_topics are required" };
        }
        const latestUser = lastUserMessageContent(context.messages);
        if (!hasSiteRuleSaveConsent(latestUser)) {
          return {
            error: "consent_required",
            message: "Ask the user in plain language first whether to remember. Do not mention proposal IDs."
          };
        }
        const proposal = projectFeedbackBindings.propose(context.projectId, context.conversationId, {
          userCorrection,
          proposedFix,
          triggerTopics
        });
        return {
          proposal,
          message:
            "Draft recorded (not active). Prefer feedback_save_site_rule to persist. Do not mention internal IDs to the user."
        };
      }
    });

    registry.register({
      name: "feedback_save_site_rule",
      category: "memory",
      description:
        "After explicit user consent, save a broad site judgment rule to project grounding. Preferred over feedback_propose for text rules.",
      schema: {
        name: "feedback_save_site_rule",
        description:
          "Persist an approved site rule (grounding only, no script). Requires prior user save consent. Pick rule_key from SITE RULE TEMPLATE KEYS; author field values from the correction principle.",
        parameters: {
          type: "object",
          properties: {
            rule_key: {
              type: "string",
              description:
                "Stable template key from SITE RULE TEMPLATE KEYS. Same key upserts the same stored rule id, e.g. wrong_running_state for chiller running-state corrections.",
              enum: ["wrong_running_state"]
            },
            name: {
              type: "string",
              description: "Short display name you author in English (see template guide for the rule_key)."
            },
            scope: {
              type: "string",
              description: "Broad rule scope you author in English (generalized, not one question wording)."
            },
            trigger: {
              type: "string",
              description: "When the rule applies — one sentence you author in English."
            },
            action: {
              type: "string",
              description: "Main judgment principle you author in English — injected into prompts."
            },
            exception: { type: "string", description: "Optional exception clause." },
            wrong_pattern: { type: "string", description: "What not to do (anti-pattern)." },
            trigger_topics: {
              type: "array",
              items: { type: "string" },
              description: "At least 4 topic paraphrases (English and/or Chinese) for retrieval."
            },
            systems: { type: "array", items: { type: "string" }, description: "Related systems, e.g. chiller plant." },
            equipment: { type: "array", items: { type: "string" }, description: "Related equipment, e.g. WCC." },
            brick_classes: { type: "array", items: { type: "string" }, description: "Related Brick classes." },
            error_type: { type: "string", description: "RuleErrorType metadata, e.g. wrong_running_state." },
            rule_summary: {
              type: "string",
              description: "Legacy fallback — prefer structured action/trigger/scope fields."
            },
            proposal_id: { type: "string", description: "Optional draft proposal id to mark committed." }
          },
          required: ["rule_key", "name", "action", "trigger", "scope", "trigger_topics"]
        }
      },
      async run(args, context) {
        const latestUser = lastUserMessageContent(context.messages);
        if (!hasSiteRuleSaveConsent(latestUser)) {
          return {
            error: "consent_required",
            message: "Ask the user in plain language first whether to remember for similar questions."
          };
        }
        if (!context.canConfigure) {
          return boundsViolationResult("feedback_save_site_rule requires project:configure.");
        }
        const ruleSummary = textArg(args, "rule_summary");
        const proposalId = textArg(args, "proposal_id");
        const triggerTopics = stringArrayArg(args, "trigger_topics");
        const ruleKey = textArg(args, "rule_key");
        const name = textArg(args, "name");
        const action = textArg(args, "action") ?? ruleSummary;
        const scope = textArg(args, "scope");
        const trigger = textArg(args, "trigger");
        const exception = textArg(args, "exception");
        const wrongPattern = textArg(args, "wrong_pattern");
        const systems = stringArrayArg(args, "systems");
        const equipment = stringArrayArg(args, "equipment");
        const brickClasses = stringArrayArg(args, "brick_classes");
        const errorType = textArg(args, "error_type");
        if (!action) {
          return { error: "action is required" };
        }
        try {
          const result = projectFeedbackBindings.saveSiteRule(context.projectId, context.conversationId, {
            ...(ruleKey ? { ruleKey } : {}),
            ...(name ? { name } : {}),
            ...(action ? { action } : {}),
            ...(scope ? { scope } : {}),
            ...(trigger ? { trigger } : {}),
            ...(exception ? { exception } : {}),
            ...(wrongPattern ? { wrongPattern } : {}),
            ...(triggerTopics.length > 0 ? { triggerTopics } : {}),
            ...(systems.length > 0 ? { systems } : {}),
            ...(equipment.length > 0 ? { equipment } : {}),
            ...(brickClasses.length > 0 ? { brickClasses } : {}),
            ...(errorType ? { errorType: errorType as import("../projectRules.js").RuleErrorType } : {}),
            ...(ruleSummary ? { ruleSummary } : {}),
            ...(proposalId ? { proposalId } : {}),
            createdBy: context.userId
          });
          return {
            ...result,
            saved: true,
            message:
              "Saved. Tell the user you will remember this for similar questions. Do not mention internal IDs."
          };
        } catch (error) {
          return { error: error instanceof Error ? error.message : "feedback_save_site_rule_failed" };
        }
      }
    });

    registry.register({
      name: "feedback_implement",
      category: "utility",
      description:
        "After user approval, write a feedback_tools Python script, execute it, and mark the proposal implemented.",
      schema: {
        name: "feedback_implement",
        description: "Implement an approved correction proposal as a repository script.",
        parameters: {
          type: "object",
          properties: {
            proposal_id: { type: "string", description: "Proposal id from feedback_propose." },
            script_content: { type: "string", description: "Full Python script source." },
            script_filename: { type: "string", description: "Filename only, e.g. chiller_running_status.py" }
          },
          required: ["proposal_id", "script_content", "script_filename"]
        }
      },
      async run(args, context) {
        const proposalId = textArg(args, "proposal_id");
        const scriptContent = textArg(args, "script_content");
        const scriptFilename = textArg(args, "script_filename");
        if (!proposalId || !scriptContent || !scriptFilename) {
          return { error: "proposal_id, script_content, and script_filename are required" };
        }
        try {
          const result = await projectFeedbackBindings.implement(context.projectId, proposalId, {
            scriptContent,
            scriptFilename
          });
          return result as unknown as Record<string, unknown>;
        } catch (error) {
          return { error: error instanceof Error ? error.message : "feedback_implement_failed" };
        }
      }
    });

    registry.register({
      name: "feedback_commit_playbook",
      category: "memory",
      description:
        "After user confirms, persist an implemented correction as an active playbook and project grounding rule.",
      schema: {
        name: "feedback_commit_playbook",
        description: "Commit implemented proposal to playbook + grounding.",
        parameters: {
          type: "object",
          properties: {
            proposal_id: { type: "string", description: "Implemented proposal id." },
            title: { type: "string", description: "Short playbook title." },
            grounding_summary: { type: "string", description: "Rule summary for future turns." }
          },
          required: ["proposal_id", "title", "grounding_summary"]
        }
      },
      async run(args, context) {
        const proposalId = textArg(args, "proposal_id");
        const title = textArg(args, "title");
        const groundingSummary = textArg(args, "grounding_summary");
        if (!proposalId || !title || !groundingSummary) {
          return { error: "proposal_id, title, and grounding_summary are required" };
        }
        try {
          const result = projectFeedbackBindings.commit(context.projectId, proposalId, {
            title,
            groundingSummary,
            createdBy: context.userId
          });
          return result as unknown as Record<string, unknown>;
        } catch (error) {
          return { error: error instanceof Error ? error.message : "feedback_commit_playbook_failed" };
        }
      }
    });

    registry.register({
      name: "feedback_list_playbooks",
      category: "memory",
      description: "List active project playbooks for correction reuse.",
      schema: {
        name: "feedback_list_playbooks",
        description: "List active playbooks.",
        parameters: { type: "object", properties: {}, required: [] }
      },
      async run(_args, context) {
        const playbooks = projectFeedbackBindings.listPlaybooks(context.projectId);
        return { playbooks, count: playbooks.length, projectId: context.projectId };
      }
    });

    registry.register({
      name: "feedback_run_playbook",
      category: "utility",
      description:
        "Run an active playbook script. Prefer this for topics that match a committed correction before ad-hoc analysis.",
      schema: {
        name: "feedback_run_playbook",
        description: "Execute playbook by id or topic keyword match.",
        parameters: {
          type: "object",
          properties: {
            playbook_id: { type: "string", description: "Playbook id, e.g. pb_000001." },
            topic: { type: "string", description: "User question topic for fuzzy match." }
          },
          required: []
        }
      },
      async run(args, context) {
        const playbookId = textArg(args, "playbook_id");
        const topic = textArg(args, "topic");
        if (!playbookId && !topic) {
          return { error: "playbook_id or topic is required" };
        }
        const input: { playbookId?: string; topic?: string } = {};
        if (playbookId) {
          input.playbookId = playbookId;
        }
        if (topic) {
          input.topic = topic;
        }
        return projectFeedbackBindings.runPlaybook(context.projectId, input);
      }
    });
  }

  return registry;
}
