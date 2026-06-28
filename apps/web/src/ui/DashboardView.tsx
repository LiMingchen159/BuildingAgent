import { useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from "react";
import { GridLayout, useContainerWidth, type Layout, type LayoutItem } from "react-grid-layout";
import type UPlot from "uplot";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "uplot/dist/uPlot.min.css";
import type { DashboardLayoutItem, DashboardNoteTone, DashboardPointBinding, DashboardRecord, DashboardSection, DashboardVisibility } from "../api";
import { queryBmsDashboardHistoryBatch, queryBmsDashboardLatestBatch, type BmsCollectorPoint, type BmsCollectorTimeseriesRow, type BmsDashboardHistoryBatchQuery, type BmsDashboardLatestBatchQuery } from "../bmsCollectorClient";
import { Badge, EmptyState, Surface } from "./primitives";

type DashboardWidget = DashboardRecord["widgets"][number];

interface DashboardSpecMutation {
  title: string;
  description?: string;
  visibility: DashboardVisibility;
  layoutVersion?: number;
  layout: DashboardLayoutItem[];
  widgets: DashboardWidget[];
  sections?: DashboardSection[];
  sourceConversationId?: string;
}

interface DashboardViewProps {
  token: string;
  dashboard: DashboardRecord;
  dashboards?: DashboardRecord[];
  liveValues: Record<string, BmsCollectorPoint>;
  stale: boolean;
  forceCompactLayout?: boolean;
  onDashboardChange?: (next: DashboardSpecMutation) => Promise<void>;
  onDashboardRename?: () => void;
  onDashboardDuplicate?: () => void;
  onDashboardDelete?: () => void;
  onDashboardMerge?: () => void;
  onCopyWidgetToDashboard?: (widgetId: string, targetDashboardId: string) => Promise<void>;
  onLayoutChange: (layout: DashboardLayoutItem[], sections?: DashboardSection[]) => Promise<void>;
  onVisibilityChange: (visibility: DashboardVisibility) => Promise<void>;
}

interface ChartSeries {
  label: string;
  pointName: string;
  unit: string;
  color: string;
  role?: string;
  dependencyRole?: string;
  defaultVisible?: boolean;
  points: Array<{ ts: string; value: number | null }>;
}

interface WidgetValue {
  key: string;
  label: string;
  unit: string;
  point: BmsCollectorPoint | undefined;
  numeric: number | null;
}

interface ChartHoverPoint {
  label: string;
  unit: string;
  color: string;
  value: number | null;
}

interface ChartHoverState {
  left: number;
  top: number;
  time: string;
  values: ChartHoverPoint[];
}

interface PendingGridLayoutSave {
  layouts: Record<string, Layout>;
  sections: DashboardSection[];
}

interface NoteEditorState {
  mode: "create" | "edit";
  widgetId?: string;
  title: string;
  content: string;
  tone: DashboardNoteTone;
}

interface NoteEditorSubmit {
  title: string;
  content: string;
  tone: DashboardNoteTone;
}

interface WidgetRenameEditorState {
  widgetId: string;
  title: string;
}

type RangeKey = "1h" | "6h" | "24h" | "7d";

const CHART_COLORS = ["#0f766e", "#b45309", "#1d4ed8", "#b91c1c", "#4d7c0f", "#7c3aed"];
const NOTE_TONE_OPTIONS: Array<{ tone: DashboardNoteTone; label: string }> = [
  { tone: "yellow", label: "Yellow" },
  { tone: "blue", label: "Blue" },
  { tone: "green", label: "Green" },
  { tone: "pink", label: "Pink" },
  { tone: "neutral", label: "Neutral" }
];
const DASHBOARD_LAYOUT_VERSION = 2;
const DASHBOARD_GRID_COLUMNS = 12;
const DASHBOARD_TABLET_GRID_COLUMNS = 6;
const DASHBOARD_MOBILE_GRID_COLUMNS = 3;
const DASHBOARD_GRID_MAX_ITEM_HEIGHT = 48;
const DASHBOARD_GRID_ROW_HEIGHT = 118;
const DASHBOARD_GRID_GAP: readonly [number, number] = [14, 14];
const DASHBOARD_TABLET_WIDTH = 1320;
const DASHBOARD_MOBILE_WIDTH = 760;
const DASHBOARD_DESKTOP_FALLBACK_WIDTH = 1440;
const HKT_TIME_ZONE = "Asia/Hong_Kong";
const HKT_OFFSET_SECONDS = 8 * 60 * 60;
const DASHBOARD_HISTORY_TIMEOUT_MS = 60_000;
const DASHBOARD_HISTORY_CACHE_TTL_MS = 5 * 60_000;
const DASHBOARD_HISTORY_CACHE_MAX_ENTRIES = 96;
const DASHBOARD_HISTORY_START_DELAY_MS = 180;
const DASHBOARD_FALLBACK_VALUES_START_DELAY_MS = 260;
const CHART_BRIDGE_GAP_MAX_NULL_SAMPLES = 4;
const CHART_BRIDGE_GAP_MAX_SECONDS = 90 * 60;
const RANGE_OPTIONS: Array<{ key: RangeKey; label: string; hours: number }> = [
  { key: "1h", label: "1h", hours: 1 },
  { key: "6h", label: "6h", hours: 6 },
  { key: "24h", label: "24h", hours: 24 },
  { key: "7d", label: "7d", hours: 24 * 7 }
];

const chartHistoryCache = new Map<string, { savedAt: number; series: ChartSeries[] }>();

function ensureValidNavigatorLocaleForCharts(): void {
  if (typeof navigator === "undefined") return;
  try {
    new Intl.NumberFormat(navigator.language);
    return;
  } catch {
    // uPlot formats numbers from navigator.language during module initialization.
  }

  try {
    Object.defineProperty(navigator, "language", {
      configurable: true,
      get: () => "en-US"
    });
  } catch {
    try {
      Object.defineProperty(Navigator.prototype, "language", {
        configurable: true,
        get: () => "en-US"
      });
    } catch {
      // If the browser refuses the override, the chart component will fall back to its unavailable state.
    }
  }
}

function formatHktDateTime(value: string | number): string {
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: HKT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date).replace(",", "");
}

function hktDateParts(value: number): Record<string, string> {
  const date = new Date(value * 1000);
  return Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: HKT_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date).map((part) => [part.type, part.value]));
}

function formatHktAxisTick(value: number, range: RangeKey): string {
  const parts = hktDateParts(value);
  const time = `${parts.hour ?? "--"}:${parts.minute ?? "--"}`;
  if (range === "7d") return `${parts.day ?? "--"}/${parts.month ?? "--"}`;
  if (range === "24h" && parts.hour === "00" && parts.minute === "00") {
    return `${parts.day ?? "--"}/${parts.month ?? "--"} ${time}`;
  }
  return time;
}

function pointDisplayName(binding: DashboardPointBinding): string {
  return binding.label || binding.pointName || binding.objectRef || [binding.entityId, binding.metricKey].filter(Boolean).join(" ") || binding.metricInstanceId || "Point";
}

function bindingIsDerivedMetric(binding: DashboardPointBinding): boolean {
  return binding.source === "derived_metric" || Boolean(binding.metricInstanceId || binding.metricKey);
}

function pointKey(binding: DashboardPointBinding): string {
  if (bindingIsDerivedMetric(binding)) {
    if (binding.metricInstanceId) return `derived:${binding.metricInstanceId}`;
    if (binding.metricKey && binding.entityId) return `derived:${binding.entityId}:${binding.metricKey}`;
  }
  return binding.pointName || binding.objectRef || "";
}

function emptySeriesForBinding(widget: DashboardWidget, binding: DashboardPointBinding, index: number): ChartSeries {
  const pointName = pointKey(binding);
  return {
    label: pointDisplayName(binding),
    pointName: pointName || `missing-${widget.id}-${index}`,
    unit: binding.unit ?? "",
    color: CHART_COLORS[index % CHART_COLORS.length]!,
    ...(binding.role ? { role: binding.role } : {}),
    ...(binding.dependencyRole ? { dependencyRole: binding.dependencyRole } : {}),
    ...(binding.defaultVisible !== undefined ? { defaultVisible: binding.defaultVisible } : {}),
    points: []
  };
}

function emptySeriesForWidget(widget: DashboardWidget): ChartSeries[] {
  return widget.pointBindings.map((binding, index) => emptySeriesForBinding(widget, binding, index));
}

function cloneChartSeries(series: ChartSeries[]): ChartSeries[] {
  return series.map((entry) => ({
    ...entry,
    points: entry.points.map((point) => ({ ...point }))
  }));
}

function cachedChartSeries(key: string): ChartSeries[] | null {
  const entry = chartHistoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.savedAt > DASHBOARD_HISTORY_CACHE_TTL_MS) {
    chartHistoryCache.delete(key);
    return null;
  }
  return cloneChartSeries(entry.series);
}

function rememberChartSeries(key: string, series: ChartSeries[]): void {
  chartHistoryCache.set(key, { savedAt: Date.now(), series: cloneChartSeries(series) });
  while (chartHistoryCache.size > DASHBOARD_HISTORY_CACHE_MAX_ENTRIES) {
    const oldestKey = chartHistoryCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    chartHistoryCache.delete(oldestKey);
  }
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function pointNumericValue(point: BmsCollectorPoint | undefined): string {
  const raw = point?.last_value ?? "";
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    return numeric.toFixed(1);
  }
  return raw || "--";
}

function pointNumericRaw(point: BmsCollectorPoint | undefined): number | null {
  const numeric = Number(point?.last_value ?? "");
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeRange(value: string | undefined): RangeKey {
  if (value === "1h" || value === "6h" || value === "24h" || value === "7d") return value;
  if (value === "12h") return "24h";
  return "24h";
}

function historyRangeForWidget(widget: DashboardWidget, selectedRange?: RangeKey): RangeKey {
  if (widget.kind === "timeseries_chart") {
    return selectedRange ?? normalizeRange(widget.defaultTimeRange);
  }
  return "24h";
}

function hoursForRange(range: RangeKey): number {
  return RANGE_OPTIONS.find((entry) => entry.key === range)?.hours ?? 24;
}

function chartTickIntervalSeconds(range: RangeKey, plotWidth: number): number {
  const spanSeconds = hoursForRange(range) * 60 * 60;
  const targetTickCount = Math.max(3, Math.min(range === "7d" ? 7 : 6, Math.floor(plotWidth / 135)));
  const targetInterval = spanSeconds / Math.max(1, targetTickCount - 1);
  const intervals = [
    5 * 60,
    10 * 60,
    15 * 60,
    30 * 60,
    60 * 60,
    2 * 60 * 60,
    3 * 60 * 60,
    4 * 60 * 60,
    6 * 60 * 60,
    12 * 60 * 60,
    24 * 60 * 60,
    2 * 24 * 60 * 60
  ];
  return intervals.find((interval) => interval >= targetInterval) ?? intervals.at(-1)!;
}

function chartTimeSplits(range: RangeKey, plotWidth: number): UPlot.Axis.Splits {
  return (_plot, _axisIdx, scaleMin, scaleMax) => {
    const min = Number(scaleMin);
    const max = Number(scaleMax);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
    const interval = chartTickIntervalSeconds(range, plotWidth);
    const start = Math.ceil((min + HKT_OFFSET_SECONDS) / interval) * interval - HKT_OFFSET_SECONDS;
    const ticks: number[] = [];
    for (let tick = start; tick <= max + interval * 0.05; tick += interval) {
      if (tick >= min - interval * 0.05) ticks.push(tick);
      if (ticks.length >= 9) break;
    }
    if (ticks.length > 0) return ticks;
    return [min, max];
  };
}

function widgetSubtitle(widget: DashboardWidget, range?: RangeKey): string {
  if (widget.kind === "timeseries_chart") return `${range ?? normalizeRange(widget.defaultTimeRange)} history / HKT`;
  if (widget.kind === "stat_value") return "Latest value / 24h stats";
  if (widget.kind === "bar_comparison") return "Latest comparison";
  if (widget.kind === "note") return "Board note";
  return "Live values";
}

function sortLayout(layout: DashboardLayoutItem[]): DashboardLayoutItem[] {
  return [...layout].sort((left, right) => (left.y - right.y) || (left.x - right.x));
}

function minSizeForWidget(widget: DashboardWidget): Pick<LayoutItem, "minW" | "minH"> {
  if (widget.kind === "timeseries_chart") return { minW: 4, minH: 4 };
  if (widget.kind === "bar_comparison") return { minW: 4, minH: 3 };
  return { minW: 2, minH: 2 };
}

function barComparisonHeight(widget: DashboardWidget): number {
  return Math.max(3, Math.min(6, 3 + Math.ceil(Math.max(0, widget.pointBindings.length - 8) / 4)));
}

function defaultSizeForWidget(widget: DashboardWidget): Pick<LayoutItem, "w" | "h"> {
  if (widget.kind === "timeseries_chart") return { w: 6, h: 4 };
  if (widget.kind === "bar_comparison") return { w: 6, h: barComparisonHeight(widget) };
  if (widget.kind === "live_value_grid") return { w: 3, h: widget.pointBindings.length > 2 ? 3 : 2 };
  if (widget.kind === "note") return { w: 3, h: 2 };
  return { w: 3, h: 2 };
}

function fitSizeForWidget(widget: DashboardWidget, current?: LayoutItem): Pick<LayoutItem, "w" | "h"> {
  const defaults = defaultSizeForWidget(widget);
  if (widget.kind === "timeseries_chart") {
    return {
      w: Math.max(defaults.w, current?.w ?? defaults.w),
      h: defaults.h
    };
  }
  if (widget.kind === "bar_comparison") {
    return {
      w: Math.max(defaults.w, current?.w ?? defaults.w),
      h: defaults.h
    };
  }
  if (widget.kind === "live_value_grid") {
    return {
      w: Math.min(6, Math.max(defaults.w, current?.w ?? defaults.w)),
      h: defaults.h
    };
  }
  return {
    w: Math.min(6, Math.max(defaults.w, current?.w ?? defaults.w)),
    h: defaults.h
  };
}

function dashboardGridColumnsForWidth(width: number, forceCompactLayout: boolean): number {
  if (forceCompactLayout || width < DASHBOARD_MOBILE_WIDTH) return DASHBOARD_MOBILE_GRID_COLUMNS;
  if (width < DASHBOARD_TABLET_WIDTH) return DASHBOARD_TABLET_GRID_COLUMNS;
  return DASHBOARD_GRID_COLUMNS;
}

function dashboardLayoutIsCanonical(dashboard: DashboardRecord): boolean {
  return dashboard.layoutVersion === DASHBOARD_LAYOUT_VERSION;
}

function legacyLayoutItemToCanonical(item: DashboardLayoutItem): DashboardLayoutItem {
  const x = Math.min(DASHBOARD_GRID_COLUMNS - 1, Math.max(0, Math.round(item.x * 2)));
  const w = Math.min(DASHBOARD_GRID_COLUMNS, Math.max(1, Math.round(item.w * 2)));
  return {
    ...item,
    x: Math.min(x, Math.max(0, DASHBOARD_GRID_COLUMNS - w)),
    w,
    y: Math.max(0, Math.round(item.y)),
    h: Math.max(1, Math.round(item.h))
  };
}

function canonicalDashboardLayout(dashboard: DashboardRecord): DashboardLayoutItem[] {
  if (dashboardLayoutIsCanonical(dashboard)) return dashboard.layout;
  return dashboard.layout.map((item) => legacyLayoutItemToCanonical(item));
}

function layoutForDashboard(dashboard: DashboardRecord): Layout {
  const canonicalLayout = canonicalDashboardLayout(dashboard);
  const layoutById = new Map(canonicalLayout.map((item) => [item.widgetId, item]));
  const sorted = sortLayout(canonicalLayout);
  let fallbackY = sorted.reduce((max, item) => Math.max(max, item.y + item.h), 0);

  const layout = dashboard.widgets.map((widget) => {
    const source = layoutById.get(widget.id);
    const minSize = minSizeForWidget(widget);
    const defaults = defaultSizeForWidget(widget);
    const w = Math.min(
      DASHBOARD_GRID_COLUMNS,
      Math.max(minSize.minW ?? 1, source?.w ?? defaults.w)
    );
    const item: LayoutItem = {
      i: widget.id,
      x: Math.min(Math.max(0, source?.x ?? 0), DASHBOARD_GRID_COLUMNS - w),
      y: source?.y ?? fallbackY++,
      w,
      h: defaults.h,
      ...minSize,
      maxW: DASHBOARD_GRID_COLUMNS,
      maxH: defaults.h,
      isBounded: true,
      resizeHandles: ["e"]
    };
    return item;
  });

  return layout;
}

function toDashboardLayout(layout: Layout): DashboardLayoutItem[] {
  return [...layout]
    .map((item) => ({
      widgetId: item.i,
      x: Math.max(0, Math.round(item.x)),
      y: Math.max(0, Math.round(item.y)),
      w: Math.min(DASHBOARD_GRID_COLUMNS, Math.max(1, Math.round(item.w))),
    h: Math.min(DASHBOARD_GRID_MAX_ITEM_HEIGHT, Math.max(1, Math.round(item.h)))
    }))
    .sort((left, right) => (left.y - right.y) || (left.x - right.x));
}

function layoutSignature(layout: DashboardLayoutItem[]): string {
  return sortLayout(layout).map((item) => `${item.widgetId}:${item.x}:${item.y}:${item.w}:${item.h}`).join("|");
}

function repackGridLayout(layout: Layout, columns: number): Layout {
  if (columns >= DASHBOARD_GRID_COLUMNS) {
    return layout.map((item) => ({
      ...item,
      maxW: DASHBOARD_GRID_COLUMNS,
      isBounded: true
    }));
  }

  let x = 0;
  let y = 0;
  let rowHeight = 1;
  const widthForColumns = (item: LayoutItem) => {
    if (columns === DASHBOARD_MOBILE_GRID_COLUMNS && (item.minW ?? 1) >= 4) return columns;
    return Math.min(columns, Math.max(1, Math.ceil((item.w * columns) / DASHBOARD_GRID_COLUMNS)));
  };
  const minWidthForColumns = (item: LayoutItem) => {
    if (columns === DASHBOARD_MOBILE_GRID_COLUMNS && (item.minW ?? 1) >= 4) return columns;
    return Math.min(columns, Math.max(1, Math.ceil(((item.minW ?? 1) * columns) / DASHBOARD_GRID_COLUMNS)));
  };
  return [...layout]
    .sort((left, right) => (left.y - right.y) || (left.x - right.x))
    .map((item) => {
      const minW = minWidthForColumns(item);
      const w = Math.min(columns, Math.max(minW, widthForColumns(item)));
      if (x + w > columns) {
        y += rowHeight;
        x = 0;
        rowHeight = 1;
      }
      const next = {
        ...item,
        x,
        y,
        w,
        maxW: columns,
        isBounded: true
      };
      x += w;
      rowHeight = Math.max(rowHeight, item.h);
      if (x >= columns) {
        y += rowHeight;
        x = 0;
        rowHeight = 1;
      }
      return next;
    });
}

function widgetStructureSignature(widgets: DashboardWidget[]): string {
  return widgets.map((widget) => `${widget.id}:${widget.kind}`).join("|");
}

function chartWidgetIdSignature(widgets: DashboardWidget[]): string {
  return widgets.map((widget) => widget.id).sort((left, right) => left.localeCompare(right)).join("|");
}

function slugForWidgetId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "") || "widget";
}

function uniqueWidgetId(baseId: string, existingIds: Set<string>): string {
  const base = slugForWidgetId(baseId);
  let candidate = `${base}-copy`;
  let index = 2;
  while (existingIds.has(candidate)) {
    candidate = `${base}-copy-${index}`;
    index += 1;
  }
  return candidate;
}

function cloneDashboardWidget(widget: DashboardWidget, existingIds: Set<string>, titleSuffix = " Copy"): DashboardWidget {
  const id = uniqueWidgetId(widget.id, existingIds);
  existingIds.add(id);
  return {
    ...widget,
    id,
    title: `${widget.title}${titleSuffix}`,
    pointBindings: widget.pointBindings.map((binding, index) => ({
      ...binding,
      ...(binding.id ? { id: uniqueWidgetId(`${binding.id}-${index}`, new Set()) } : {})
    }))
  } as DashboardWidget;
}

function sectionForWidgetKind(widget: DashboardWidget): Pick<DashboardSection, "id" | "title" | "kind"> {
  if (widget.kind === "timeseries_chart") return { id: "trends", title: "Trends", kind: "trends" };
  if (widget.kind === "bar_comparison") return { id: "comparison", title: "Comparison", kind: "comparison" };
  if (widget.kind === "note") return { id: "notes", title: "Notes", kind: "custom" };
  return { id: "overview", title: "Overview", kind: "overview" };
}

function sectionsForDashboard(dashboard: DashboardRecord): DashboardSection[] {
  const widgetIds = new Set(dashboard.widgets.map((widget) => widget.id));
  const usedWidgetIds = new Set<string>();
  const sourceSections = dashboard.sections?.length
    ? dashboard.sections.map((section) => ({
      ...section,
      widgetIds: section.widgetIds.filter((widgetId) => widgetIds.has(widgetId))
    })).filter((section) => section.widgetIds.length > 0)
    : [];
  const sections = sourceSections.map((section) => {
    for (const widgetId of section.widgetIds) usedWidgetIds.add(widgetId);
    return section;
  });
  const fallback = new Map<string, DashboardSection>();
  for (const widget of dashboard.widgets) {
    if (usedWidgetIds.has(widget.id)) continue;
    const sectionInfo = sectionForWidgetKind(widget);
    const section = fallback.get(sectionInfo.id) ?? { ...sectionInfo, widgetIds: [] };
    section.widgetIds.push(widget.id);
    fallback.set(sectionInfo.id, section);
  }
  const orderedFallback = ["overview", "comparison", "trends", "notes"]
    .map((id) => fallback.get(id))
    .filter((section): section is DashboardSection => Boolean(section));
  return [...sections, ...orderedFallback];
}

function sectionSignature(sections: DashboardSection[]): string {
  return sections.map((section) => `${section.id}:${section.title}:${section.kind}:${section.collapsed ? "1" : "0"}:${section.widgetIds.join(",")}`).join("|");
}

function normalizeSectionLayout(layout: Layout): Layout {
  const minY = layout.length > 0 ? Math.min(...layout.map((item) => item.y)) : 0;
  return layout.map((item) => ({ ...item, y: Math.max(0, item.y - minY) }));
}

function layoutBySectionForDashboard(dashboard: DashboardRecord, sections: DashboardSection[]): Record<string, Layout> {
  const baseLayout = layoutForDashboard(dashboard);
  const layoutByWidgetId = new Map(baseLayout.map((item) => [item.i, item]));
  return Object.fromEntries(sections.map((section) => [
    section.id,
    normalizeSectionLayout(section.widgetIds.map((widgetId) => layoutByWidgetId.get(widgetId)).filter((item): item is LayoutItem => Boolean(item)))
  ]));
}

function repackLayoutsBySection(layouts: Record<string, Layout>, columns: number): Record<string, Layout> {
  return Object.fromEntries(Object.entries(layouts).map(([sectionId, layout]) => [sectionId, repackGridLayout(layout, columns)]));
}

function toDashboardLayoutFromSections(layouts: Record<string, Layout>, sections: DashboardSection[]): DashboardLayoutItem[] {
  return sections
    .flatMap((section) => toDashboardLayout(layouts[section.id] ?? []))
    .sort((left, right) => left.widgetId.localeCompare(right.widgetId));
}

function nonEmptySections(sections: DashboardSection[], widgets: DashboardWidget[]): DashboardSection[] {
  const widgetIds = new Set(widgets.map((widget) => widget.id));
  return sections
    .map((section) => ({
      ...section,
      widgetIds: section.widgetIds.filter((widgetId) => widgetIds.has(widgetId))
    }))
    .filter((section) => section.widgetIds.length > 0);
}

function createLayoutItemForWidget(widget: DashboardWidget, source?: LayoutItem, y = 0): LayoutItem {
  const defaults = defaultSizeForWidget(widget);
  const minSize = minSizeForWidget(widget);
  const w = Math.min(DASHBOARD_GRID_COLUMNS, Math.max(minSize.minW ?? 1, source?.w ?? defaults.w));
  return {
    i: widget.id,
    x: Math.min(Math.max(0, source?.x ?? 0), DASHBOARD_GRID_COLUMNS - w),
    y,
    w,
    h: defaults.h,
    ...minSize,
    maxW: DASHBOARD_GRID_COLUMNS,
    maxH: defaults.h,
    isBounded: true,
    resizeHandles: ["e"]
  };
}

function chartWidgetSignature(widget: DashboardWidget): string {
  return [
    widget.id,
    widget.title,
    widget.defaultTimeRange ?? "",
    widget.pointBindings.map((binding) => [
      binding.id ?? "",
      binding.source ?? "",
      binding.pointName ?? "",
      binding.objectRef ?? "",
      binding.metricInstanceId ?? "",
      binding.metricKey ?? "",
      binding.entityId ?? "",
      binding.label ?? "",
      binding.role ?? "",
      binding.unit ?? ""
    ].join(",")).join(";")
  ].join(":");
}

function chartWidgetDataSignature(widget: DashboardWidget): string {
  return [
    widget.id,
    widget.pointBindings.map((binding, index) => `${index}:${pointKey(binding) || binding.id || ""}:${binding.source ?? ""}`).join(";")
  ].join(":");
}

function chartQuerySignatureForWidgets(widgets: DashboardWidget[]): string {
  return widgets
    .map((widget) => chartWidgetDataSignature(widget))
    .sort((left, right) => left.localeCompare(right))
    .join("|");
}

function chartHistoryKey(widget: DashboardWidget, range: RangeKey, refreshNonce: number): string {
  return `${chartWidgetDataSignature(widget)}:${range}:${refreshNonce}`;
}

function chartPointNamesSignature(widgets: DashboardWidget[]): string {
  return widgets
    .map((widget) => {
      const pointNames = widget.pointBindings.map((binding) => pointKey(binding)).filter(Boolean).sort((left, right) => left.localeCompare(right));
      return pointNames.length > 0 ? `${widget.id}:${pointNames.join(",")}` : null;
    })
    .filter((entry): entry is string => Boolean(entry))
    .sort((left, right) => left.localeCompare(right))
    .join("|");
}

function seriesWithWidgetMetadata(widget: DashboardWidget, sourceSeries: ChartSeries[]): ChartSeries[] {
  const sourceByPointName = new Map(sourceSeries.map((entry) => [entry.pointName, entry]));
  return widget.pointBindings.map((binding, index) => {
    const base = emptySeriesForBinding(widget, binding, index);
    const indexedSource = sourceSeries[index];
    const source = indexedSource?.pointName === base.pointName
      ? indexedSource
      : sourceByPointName.get(base.pointName) ?? indexedSource;
    return {
      ...base,
      points: source ? source.points.map((point) => ({ ...point })) : []
    };
  });
}

function reorderLayout(layout: Layout, draggedId: string, targetId: string, columns = DASHBOARD_GRID_COLUMNS): Layout {
  if (draggedId === targetId) return layout;
  const ordered = [...layout].sort((left, right) => (left.y - right.y) || (left.x - right.x));
  const fromIndex = ordered.findIndex((item) => item.i === draggedId);
  const toIndex = ordered.findIndex((item) => item.i === targetId);
  if (fromIndex === -1 || toIndex === -1) return layout;
  const [dragged] = ordered.splice(fromIndex, 1);
  if (!dragged) return layout;
  ordered.splice(toIndex, 0, dragged);

  let x = 0;
  let y = 0;
  let rowHeight = 1;
  return ordered.map((item) => {
    if (x + item.w > columns) {
      y += rowHeight;
      x = 0;
      rowHeight = 1;
    }
    const next = { ...item, x, y };
    x += item.w;
    rowHeight = Math.max(rowHeight, item.h);
    if (x >= columns) {
      y += rowHeight;
      x = 0;
      rowHeight = 1;
    }
    return next;
  });
}

function clearBrowserSelection(): void {
  if (typeof window === "undefined") return;
  const selection = window.getSelection?.();
  if (selection && selection.rangeCount > 0) {
    selection.removeAllRanges();
  }
}

function toChartPoints(rows: BmsCollectorTimeseriesRow[]): Array<{ ts: string; value: number | null }> {
  return rows.map((row) => {
    const numeric = typeof row.value_num === "number" && Number.isFinite(row.value_num)
      ? row.value_num
      : Number(row.value ?? row.value_text ?? "");
    return { ts: row.ts, value: Number.isFinite(numeric) ? numeric : null };
  });
}

function historyQueryForBinding(
  binding: DashboardPointBinding,
  key: string,
  from: string,
  to: string,
  range: RangeKey,
  limit: string
): BmsDashboardHistoryBatchQuery | null {
  if (bindingIsDerivedMetric(binding)) {
    if (!binding.metricInstanceId && (!binding.metricKey || !binding.entityId)) return null;
    return {
      key,
      source: "derived_metric",
      ...(binding.metricInstanceId ? { metric_instance_id: binding.metricInstanceId } : {}),
      ...(binding.metricKey ? { metric_key: binding.metricKey } : {}),
      ...(binding.entityId ? { entity_id: binding.entityId } : {}),
      from,
      to,
      range,
      limit,
      order: "asc"
    };
  }
  if (!binding.pointName && !binding.objectRef) return null;
  return {
    key,
    source: "bms",
    ...(binding.pointName ? { name: binding.pointName } : {}),
    ...(binding.objectRef ? { object_ref: binding.objectRef } : {}),
    from,
    to,
    range,
    limit,
    order: "asc"
  };
}

function latestQueryForBinding(binding: DashboardPointBinding, key: string): BmsDashboardLatestBatchQuery | null {
  if (bindingIsDerivedMetric(binding)) {
    if (!binding.metricInstanceId && (!binding.metricKey || !binding.entityId)) return null;
    return {
      key,
      source: "derived_metric",
      ...(binding.metricInstanceId ? { metric_instance_id: binding.metricInstanceId } : {}),
      ...(binding.metricKey ? { metric_key: binding.metricKey } : {}),
      ...(binding.entityId ? { entity_id: binding.entityId } : {})
    };
  }
  if (!binding.pointName && !binding.objectRef) return null;
  return {
    key,
    source: "bms",
    ...(binding.pointName ? { name: binding.pointName } : {}),
    ...(binding.objectRef ? { object_ref: binding.objectRef } : {})
  };
}

function widgetValues(
  bindings: DashboardPointBinding[],
  liveValues: Record<string, BmsCollectorPoint>,
  fallbackLiveValues: Record<string, BmsCollectorPoint>
): WidgetValue[] {
  return bindings.map((binding, index) => {
    const key = pointKey(binding);
    const point = liveValues[key] ?? fallbackLiveValues[key];
    return {
      key: key || `binding-${index}`,
      label: pointDisplayName(binding),
      unit: binding.unit ?? "",
      point,
      numeric: pointNumericRaw(point)
    };
  });
}

function numericChartValues(series: ChartSeries): number[] {
  return series.points
    .map((point) => point.value)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function chartSeriesHasMissingSamples(series: ChartSeries): boolean {
  return series.points.some((point) => point.value === null) && numericChartValues(series).length > 0;
}

function chartTimestampSeconds(value: string): number | null {
  const seconds = Math.round(Date.parse(value) / 1000);
  return Number.isFinite(seconds) ? seconds : null;
}

function shouldBridgeMissingRun(timestamps: number[], values: Array<number | null>, start: number, end: number): boolean {
  const runLength = end - start + 1;
  if (runLength > CHART_BRIDGE_GAP_MAX_NULL_SAMPLES) return false;

  const previousIndex = start - 1;
  const nextIndex = end + 1;
  const previousValue = values[previousIndex];
  const nextValue = values[nextIndex];
  if (typeof previousValue !== "number" || !Number.isFinite(previousValue)) return false;
  if (typeof nextValue !== "number" || !Number.isFinite(nextValue)) return false;

  const previousTimestamp = timestamps[previousIndex];
  const nextTimestamp = timestamps[nextIndex];
  if (typeof previousTimestamp !== "number" || !Number.isFinite(previousTimestamp)) return false;
  if (typeof nextTimestamp !== "number" || !Number.isFinite(nextTimestamp)) return false;
  return nextTimestamp - previousTimestamp <= CHART_BRIDGE_GAP_MAX_SECONDS;
}

function bridgeShortMissingRuns(timestamps: number[], values: Array<number | null>): Array<number | null | undefined> {
  const bridged: Array<number | null | undefined> = [...values];
  let index = 0;
  while (index < values.length) {
    if (values[index] !== null) {
      index += 1;
      continue;
    }

    const start = index;
    while (index < values.length && values[index] === null) {
      index += 1;
    }
    const end = index - 1;
    if (shouldBridgeMissingRun(timestamps, values, start, end)) {
      for (let missingIndex = start; missingIndex <= end; missingIndex += 1) {
        bridged[missingIndex] = undefined;
      }
    }
  }
  return bridged;
}

function lastNumericChartPoint(series: ChartSeries): { ts: string; value: number | null } | undefined {
  for (let index = series.points.length - 1; index >= 0; index -= 1) {
    const point = series.points[index];
    if (point && typeof point.value === "number" && Number.isFinite(point.value)) {
      return point;
    }
  }
  return undefined;
}

function seriesStats(series: ChartSeries): { last: number | null; min: number | null; max: number | null; avg: number | null; count: number; updatedAt?: string } {
  const values = numericChartValues(series);
  if (values.length === 0) {
    return { last: null, min: null, max: null, avg: null, count: 0 };
  }
  const sum = values.reduce((total, value) => total + value, 0);
  const stats: { last: number | null; min: number | null; max: number | null; avg: number | null; count: number; updatedAt?: string } = {
    last: values.at(-1) ?? null,
    min: Math.min(...values),
    max: Math.max(...values),
    avg: sum / values.length,
    count: values.length
  };
  const updatedAt = lastNumericChartPoint(series)?.ts;
  if (updatedAt) {
    stats.updatedAt = updatedAt;
  }
  return stats;
}

function formatNumber(value: number | null, unit = ""): string {
  if (value === null || !Number.isFinite(value)) return "--";
  return `${value.toFixed(1)}${unit ? ` ${unit}` : ""}`;
}

function alignedChartData(series: ChartSeries[]): UPlot.AlignedData {
  const timestamps = [...new Set(series.flatMap((entry) => entry.points.map((point) => chartTimestampSeconds(point.ts)).filter((ts): ts is number => ts !== null)))].sort((a, b) => a - b);
  const valuesBySeries = series.map((entry) => {
    const valueByTs = new Map(
      entry.points
        .map((point) => {
          const timestamp = chartTimestampSeconds(point.ts);
          return timestamp === null ? null : [timestamp, point.value] as const;
        })
        .filter((point): point is readonly [number, number | null] => point !== null)
    );
    const rawValues = timestamps.map((ts) => valueByTs.has(ts) ? valueByTs.get(ts) ?? null : null);
    return bridgeShortMissingRuns(timestamps, rawValues);
  });
  return [timestamps, ...valuesBySeries];
}

function TimeSeriesWidget({
  series,
  range,
  loading,
  onRangeChange,
  onRefresh
}: {
  series: ChartSeries[];
  range: RangeKey;
  loading: boolean;
  onRangeChange: (range: RangeKey) => void;
  onRefresh: () => void;
}) {
  const chartHostRef = useRef<HTMLDivElement | null>(null);
  const chartPlotRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<UPlot | null>(null);
  const plotSeriesSignatureRef = useRef("");
  const hoverArmedRef = useRef(false);
  const [plotSize, setPlotSize] = useState({ width: 0, height: 0 });
  const [plotReady, setPlotReady] = useState(false);
  const [plotUnavailable, setPlotUnavailable] = useState(false);
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({});
  const [hover, setHover] = useState<ChartHoverState | null>(null);

  const visibleSeries = useMemo(
    () => series.filter((entry) => !hiddenSeries[entry.pointName]),
    [hiddenSeries, series]
  );
  const chartData = useMemo(() => alignedChartData(visibleSeries), [visibleSeries]);
  const visibleSeriesSignature = useMemo(
    () => visibleSeries.map((entry) => `${entry.pointName}:${entry.label}:${entry.unit}:${entry.color}:${entry.defaultVisible === false ? "default-hidden" : "default-visible"}:${chartSeriesHasMissingSamples(entry) ? "gapped" : "solid"}`).join("|"),
    [visibleSeries]
  );
  const visibleSeriesRef = useRef(visibleSeries);
  const chartDataRef = useRef(chartData);
  const hasVisibleData = visibleSeries.some((entry) => numericChartValues(entry).length > 0);
  const allSeriesHidden = series.length > 0 && visibleSeries.length === 0;
  const canRenderPlot = hasVisibleData && plotSize.width > 0 && plotSize.height > 0;
  const awaitingFirstPaint = hasVisibleData && (!canRenderPlot || !plotReady) && !plotUnavailable;
  const showPlot = hasVisibleData && plotReady && !plotUnavailable;
  const chartStatusText = plotUnavailable
    ? "Trend unavailable"
    : loading && !hasVisibleData
      ? "Loading trend"
      : awaitingFirstPaint
        ? "Drawing trend"
        : !loading && allSeriesHidden
          ? "All series hidden"
          : !loading && !allSeriesHidden && series.length > 0 && !hasVisibleData
            ? "No local history yet"
            : !loading && series.length === 0
              ? "Waiting for series"
              : null;

  useEffect(() => {
    visibleSeriesRef.current = visibleSeries;
  }, [visibleSeries]);

  useEffect(() => {
    chartDataRef.current = chartData;
    if (hasVisibleData && plotRef.current && plotSeriesSignatureRef.current === visibleSeriesSignature) {
      try {
        plotRef.current.setData(chartData);
      } catch {
        setPlotUnavailable(true);
      }
    }
  }, [chartData, hasVisibleData, visibleSeriesSignature]);

  useEffect(() => {
    setHiddenSeries((current) => {
      const validNames = new Set(series.map((entry) => entry.pointName));
      const next = Object.fromEntries(Object.entries(current).filter(([pointName]) => validNames.has(pointName)));
      for (const entry of series) {
        if (!(entry.pointName in next) && entry.defaultVisible === false) {
          next[entry.pointName] = true;
        }
      }
      return next;
    });
  }, [series]);

  useEffect(() => {
    const element = chartHostRef.current;
    if (!element) return undefined;
    const updateSize = (rect: DOMRectReadOnly) => {
      setPlotSize({
        width: Math.max(240, Math.floor(rect.width)),
        height: Math.max(190, Math.floor(rect.height))
      });
    };
    updateSize(element.getBoundingClientRect());
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const rect = entry?.contentRect;
      if (!rect) return;
      updateSize(rect);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const plotElement = chartPlotRef.current;
    if (!plotElement || !canRenderPlot) {
      hoverArmedRef.current = false;
      setHover(null);
      setPlotReady(false);
      plotRef.current?.destroy();
      plotRef.current = null;
      plotSeriesSignatureRef.current = "";
      plotElement?.replaceChildren();
      return undefined;
    }
    const plotTarget: HTMLDivElement = plotElement;
    if (typeof window !== "undefined" && /jsdom/i.test(window.navigator.userAgent)) {
      setPlotUnavailable(true);
      return undefined;
    }
    let disposed = false;
    let removeHoverListeners: (() => void) | undefined;

    async function renderPlot() {
      hoverArmedRef.current = false;
      setPlotReady(false);
      plotRef.current?.destroy();
      plotRef.current = null;
      plotSeriesSignatureRef.current = "";
      plotTarget.replaceChildren();

      try {
        if (disposed) return;
        ensureValidNavigatorLocaleForCharts();
        const UPlotModule = await import("uplot");
        if (disposed) return;
        const UPlotConstructor = UPlotModule.default;
        const currentSeries = visibleSeriesRef.current;
        const options: UPlot.Options = {
          width: plotSize.width,
          height: plotSize.height,
          legend: { show: false },
          scales: {
            x: { time: true }
          },
          cursor: {
            show: true,
            x: true,
            y: false,
            drag: { x: true, y: false, setScale: true },
            focus: { prox: 24 },
            hover: { prox: null, skip: [undefined] },
            points: { show: true, size: 6, width: 1.5 }
          },
          axes: [
            {
              stroke: "#64748b",
              size: 42,
              gap: 8,
              space: (_plot, _axisIdx, _scaleMin, _scaleMax, plotDim) => Math.max(86, Math.min(140, plotDim / 4.8)),
              splits: chartTimeSplits(range, plotSize.width),
              grid: { stroke: "rgba(148, 163, 184, 0.22)", width: 1 },
              values: (_plot, ticks) => ticks.map((tick) => formatHktAxisTick(Number(tick), range))
            },
            {
              stroke: "#64748b",
              grid: { stroke: "rgba(148, 163, 184, 0.18)", width: 1 },
              values: (_plot, ticks) => ticks.map((tick) => Number(tick).toFixed(1))
            }
          ],
          series: [
            {},
            ...currentSeries.map((entry) => ({
              label: entry.label,
              stroke: entry.color,
              width: 2.2,
              spanGaps: false,
              points: { show: false }
            }))
          ],
          hooks: {
            setCursor: [
              (plot) => {
                if (disposed) return;
                if (!hoverArmedRef.current) {
                  setHover(null);
                  return;
                }
                const cursorLeft = plot.cursor.left ?? 0;
                const cursorTop = plot.cursor.top ?? 0;
                const idx = plot.cursor.idx ?? (Number.isFinite(cursorLeft) ? plot.posToIdx(cursorLeft) : null);
                if (idx === null || idx === undefined || idx < 0) {
                  setHover(null);
                  return;
                }
                const xValue = Number((plot.data[0] as ArrayLike<number | null | undefined>)[idx]);
                if (!Number.isFinite(xValue)) {
                  setHover(null);
                  return;
                }
                const values = visibleSeriesRef.current.map((entry, seriesIndex) => {
                  const rawValue = (plot.data[seriesIndex + 1] as ArrayLike<number | null | undefined>)[idx];
                  const value = typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : null;
                  return {
                    label: entry.label,
                    unit: entry.unit,
                    color: entry.color,
                    value
                  };
                });
                const tooltipWidth = 230;
                const tooltipHeight = Math.min(160, 54 + values.length * 24);
                const plotLeft = plot.over.offsetLeft;
                const plotTop = plot.over.offsetTop;
                const hostWidth = chartHostRef.current?.clientWidth ?? plotSize.width;
                const hostHeight = chartHostRef.current?.clientHeight ?? plotSize.height;
                setHover({
                  left: Math.max(8, Math.min(hostWidth - tooltipWidth - 8, plotLeft + cursorLeft + 14)),
                  top: Math.max(8, Math.min(hostHeight - tooltipHeight - 8, plotTop + cursorTop + 14)),
                  time: formatHktDateTime(xValue * 1000),
                  values
                });
              }
            ]
          }
        };
        plotRef.current = new UPlotConstructor(options, chartDataRef.current, plotTarget);
        plotSeriesSignatureRef.current = visibleSeriesSignature;
        setPlotReady(true);
        const handleMouseActivity = (event: MouseEvent | PointerEvent) => {
          hoverArmedRef.current = true;
          const plot = plotRef.current;
          if (!plot) return;
          const rect = plot.over.getBoundingClientRect();
          const left = event.clientX - rect.left;
          const top = event.clientY - rect.top;
          if (left < 0 || top < 0 || left > rect.width || top > rect.height) return;
          plot.setCursor({ left, top });
        };
        const handleMouseLeave = () => {
          hoverArmedRef.current = false;
          setHover(null);
        };
        plotTarget.addEventListener("pointerenter", handleMouseActivity, true);
        plotTarget.addEventListener("pointerover", handleMouseActivity, true);
        plotTarget.addEventListener("pointermove", handleMouseActivity, true);
        plotTarget.addEventListener("mouseover", handleMouseActivity, true);
        plotTarget.addEventListener("mousemove", handleMouseActivity, true);
        plotTarget.addEventListener("pointerleave", handleMouseLeave, true);
        plotTarget.addEventListener("mouseleave", handleMouseLeave, true);
        removeHoverListeners = () => {
          plotTarget.removeEventListener("pointerenter", handleMouseActivity, true);
          plotTarget.removeEventListener("pointerover", handleMouseActivity, true);
          plotTarget.removeEventListener("pointermove", handleMouseActivity, true);
          plotTarget.removeEventListener("mouseover", handleMouseActivity, true);
          plotTarget.removeEventListener("mousemove", handleMouseActivity, true);
          plotTarget.removeEventListener("pointerleave", handleMouseLeave, true);
          plotTarget.removeEventListener("mouseleave", handleMouseLeave, true);
        };
        setPlotUnavailable(false);
      } catch {
        if (!disposed) {
          setPlotReady(false);
          setPlotUnavailable(true);
        }
      }
    }

    void renderPlot();

    return () => {
      disposed = true;
      hoverArmedRef.current = false;
      setHover(null);
      removeHoverListeners?.();
      plotRef.current?.destroy();
      plotRef.current = null;
      plotSeriesSignatureRef.current = "";
      setPlotReady(false);
      plotTarget.replaceChildren();
    };
  }, [canRenderPlot, plotSize.height, plotSize.width, range, visibleSeriesSignature]);

  const combinedStats = visibleSeries.flatMap((entry) => numericChartValues(entry));
  const min = combinedStats.length > 0 ? Math.min(...combinedStats) : null;
  const max = combinedStats.length > 0 ? Math.max(...combinedStats) : null;

  return (
    <div className="dashboard-timeseries-widget">
      <div className="dashboard-widget-toolbar dashboard-drag-cancel">
        <div className="dashboard-range-toggle" aria-label="Time range">
          {RANGE_OPTIONS.map((option) => (
            <button
              className={option.key === range ? "is-active" : ""}
              key={option.key}
              onClick={() => onRangeChange(option.key)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <button className="dashboard-widget-icon-button" onClick={onRefresh} title="Refresh history" type="button">
          Refresh
        </button>
      </div>
      <div className="dashboard-chart-frame">
        <div ref={chartHostRef} className="dashboard-uplot-host" role="img" aria-label="Historical trend chart" aria-busy={Boolean(chartStatusText && (loading || awaitingFirstPaint))}>
          <div ref={chartPlotRef} className={`dashboard-uplot-plot dashboard-drag-cancel${showPlot ? "" : " is-hidden"}`} />
          {chartStatusText ? <span className="dashboard-chart-empty">{chartStatusText}</span> : null}
          {loading && hasVisibleData && plotReady ? <span className="dashboard-chart-refreshing">Updating</span> : null}
          {hover ? (
            <div className="dashboard-chart-tooltip" style={{ left: hover.left, top: hover.top }}>
              <strong>{hover.time} HKT</strong>
              {hover.values.map((entry) => (
                <span key={entry.label}>
                  <i style={{ backgroundColor: entry.color }} />
                  <em>{entry.label}</em>
                  <b>{formatNumber(entry.value, entry.unit)}</b>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="dashboard-chart-meta">
        <span>Min {formatNumber(min)}</span>
        <span>Max {formatNumber(max)}</span>
        <span>{range} / HKT</span>
      </div>
      <div className="dashboard-legend-table dashboard-drag-cancel">
        <div className="dashboard-legend-head">
          <span>Series</span>
          <span>Last</span>
          <span>Min</span>
          <span>Max</span>
          <span>Avg</span>
        </div>
        {series.map((entry) => {
          const stats = seriesStats(entry);
          const hidden = Boolean(hiddenSeries[entry.pointName]);
          return (
            <button
              className={`dashboard-legend-row${hidden ? " is-hidden" : ""}`}
              key={entry.pointName}
              onClick={() => setHiddenSeries((current) => ({ ...current, [entry.pointName]: !current[entry.pointName] }))}
              title={hidden ? "Show series" : "Hide series"}
              type="button"
            >
              <span>
                <i style={{ backgroundColor: entry.color }} />
                <strong>{entry.label}</strong>
                {entry.dependencyRole ? <small className="dashboard-legend-role">{entry.dependencyRole}</small> : null}
              </span>
              <span>{formatNumber(stats.last, entry.unit)}</span>
              <span>{formatNumber(stats.min, entry.unit)}</span>
              <span>{formatNumber(stats.max, entry.unit)}</span>
              <span>{formatNumber(stats.avg, entry.unit)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatValueWidget({ values, historySeries = [] }: { values: WidgetValue[]; historySeries?: ChartSeries[] }) {
  const primary = values[0];
  const updatedAt = primary?.point?.last_polled_at;
  const secondary = values.slice(1, 5);
  const primaryHistory = historySeries[0];
  const historyStats = primaryHistory ? seriesStats(primaryHistory) : null;
  const min = historyStats?.min ?? null;
  const max = historyStats?.max ?? null;
  const avg = historyStats?.avg ?? null;

  return (
    <div className="dashboard-stat-widget">
      <div className="dashboard-stat-main">
        <span>{primary?.label ?? "Current value"}</span>
        <strong>{primary ? pointNumericValue(primary.point) : "--"}{primary?.unit ? ` ${primary.unit}` : ""}</strong>
        {updatedAt ? <small>{formatHktDateTime(updatedAt)} HKT</small> : <small>No latest value yet</small>}
      </div>
      <div className="dashboard-stat-strip">
        <span>
          <small>24h Min</small>
          <strong>{formatNumber(min, primary?.unit)}</strong>
        </span>
        <span>
          <small>24h Max</small>
          <strong>{formatNumber(max, primary?.unit)}</strong>
        </span>
        <span>
          <small>24h Avg</small>
          <strong>{formatNumber(avg, primary?.unit)}</strong>
        </span>
      </div>
      {secondary.length > 0 ? (
        <div className="dashboard-stat-secondary">
          {secondary.map((entry) => (
            <span key={entry.key}>
              <span>{entry.label}</span>
              <strong>{pointNumericValue(entry.point)}{entry.unit ? ` ${entry.unit}` : ""}</strong>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BarComparisonWidget({ values }: { values: WidgetValue[] }) {
  const sortedValues = [...values].sort((left, right) => (right.numeric ?? Number.NEGATIVE_INFINITY) - (left.numeric ?? Number.NEGATIVE_INFINITY));
  const numericValues = sortedValues.filter((entry) => entry.numeric !== null);
  const max = numericValues.length > 0 ? Math.max(...numericValues.map((entry) => Math.abs(entry.numeric ?? 0))) : 0;
  const avg = numericValues.length > 0 ? numericValues.reduce((total, entry) => total + (entry.numeric ?? 0), 0) / numericValues.length : null;

  return (
    <div className="dashboard-bar-widget">
      <div className="dashboard-bar-summary">
        <span>
          <small>Series</small>
          <strong>{values.length}</strong>
        </span>
        <span>
          <small>Average</small>
          <strong>{formatNumber(avg, numericValues[0]?.unit)}</strong>
        </span>
      </div>
      <div className="dashboard-bar-list">
        {sortedValues.map((entry, index) => {
          const width = max > 0 && entry.numeric !== null ? Math.max(5, Math.min(100, (Math.abs(entry.numeric) / max) * 100)) : 0;
          return (
            <div className="dashboard-bar-row" key={entry.key}>
              <span className="dashboard-bar-label">
                <small>{String(index + 1).padStart(2, "0")}</small>
                {entry.label}
              </span>
              <span className="dashboard-bar-track">
                <span className="dashboard-bar-fill" style={{ width: `${width}%` }} />
              </span>
              <strong>{pointNumericValue(entry.point)}{entry.unit ? ` ${entry.unit}` : ""}</strong>
            </div>
          );
        })}
      </div>
      {values.length === 0 || numericValues.length === 0 ? <span className="dashboard-chart-empty">No numeric latest values yet</span> : null}
    </div>
  );
}

function LiveValueGridWidget({ values }: { values: WidgetValue[] }) {
  return (
    <div className="dashboard-live-grid">
      {values.map((entry) => (
        <div className="dashboard-live-row" key={entry.key}>
          <span>
            <span>{entry.label}</span>
            {entry.point?.last_polled_at ? <small>{formatHktDateTime(entry.point.last_polled_at)} HKT</small> : null}
          </span>
          <strong>{pointNumericValue(entry.point)}{entry.unit ? ` ${entry.unit}` : ""}</strong>
        </div>
      ))}
    </div>
  );
}

function InlineEditableText({
  value,
  placeholder,
  className,
  multiline = false,
  disabled = false,
  onCommit
}: {
  value: string;
  placeholder: string;
  className: string;
  multiline?: boolean;
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  function commit() {
    if (disabled) return;
    const nextValue = draft.trim();
    if (nextValue !== value.trim()) {
      onCommit(nextValue);
    }
  }

  function reset() {
    setDraft(value);
  }

  if (multiline) {
    return (
      <textarea
        className={`${className} dashboard-drag-cancel dashboard-inline-edit-control`}
        disabled={disabled}
        maxLength={1000}
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            reset();
            event.currentTarget.blur();
          }
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        placeholder={placeholder}
        value={draft}
      />
    );
  }

  return (
    <input
      className={`${className} dashboard-drag-cancel dashboard-inline-edit-control`}
      disabled={disabled}
      maxLength={100}
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          reset();
          event.currentTarget.blur();
        }
      }}
      placeholder={placeholder}
      type="text"
      value={draft}
    />
  );
}

function NoteWidget({
  widget,
  saving,
  placementMode,
  onContentCommit
}: {
  widget: DashboardWidget;
  saving?: boolean;
  placementMode?: boolean;
  onContentCommit?: (widgetId: string, content: string) => void;
}) {
  return (
    <div className={`dashboard-note-widget dashboard-note-${widget.tone ?? "yellow"}`}>
      {placementMode ? (
        <p>{widget.content?.trim() || "New note"}</p>
      ) : (
        <InlineEditableText
          className="dashboard-note-inline-content"
          disabled={Boolean(saving)}
          multiline
          onCommit={(content) => {
            onContentCommit?.(widget.id, content);
          }}
          placeholder="Click to add a note"
          value={widget.content ?? ""}
        />
      )}
    </div>
  );
}

function DashboardNoteEditorTray({
  editor,
  saving,
  onCancel,
  onSubmit
}: {
  editor: NoteEditorState;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (value: NoteEditorSubmit) => void;
}) {
  const [title, setTitle] = useState(editor.title);
  const [content, setContent] = useState(editor.content);
  const [tone, setTone] = useState<DashboardNoteTone>(editor.tone);

  useEffect(() => {
    setTitle(editor.title);
    setContent(editor.content);
    setTone(editor.tone);
  }, [editor]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      title: title.trim() || "Note",
      content: content.trim(),
      tone
    });
  }

  return (
    <form className="dashboard-note-editor-tray" onSubmit={handleSubmit} aria-label={editor.mode === "create" ? "Add note editor" : "Edit note editor"}>
      <div className="dashboard-note-editor-heading">
        <strong>{editor.mode === "create" ? "Add note" : "Edit note"}</strong>
        <span>{editor.mode === "create" ? "Create an annotation on this dashboard." : "Update this dashboard annotation."}</span>
      </div>
      <label className="dashboard-note-editor-field">
        <span>Title</span>
        <input
          autoFocus
          disabled={saving}
          maxLength={80}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Note title"
          type="text"
          value={title}
        />
      </label>
      <label className="dashboard-note-editor-field dashboard-note-editor-content">
        <span>Note</span>
        <textarea
          disabled={saving}
          maxLength={1000}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Write a short annotation..."
          rows={4}
          value={content}
        />
      </label>
      <div className="dashboard-note-editor-tone" aria-label="Note color">
        {NOTE_TONE_OPTIONS.map((option) => (
          <button
            className={`dashboard-note-tone-swatch dashboard-note-tone-${option.tone}${tone === option.tone ? " is-active" : ""}`}
            key={option.tone}
            type="button"
            disabled={saving}
            onClick={() => setTone(option.tone)}
            aria-label={option.label}
            aria-pressed={tone === option.tone}
          />
        ))}
      </div>
      <div className="dashboard-note-editor-actions">
        <button type="button" className="dashboard-widget-icon-button" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="dashboard-widget-icon-button is-primary" disabled={saving}>
          {saving ? "Saving..." : "Save note"}
        </button>
      </div>
    </form>
  );
}

function DashboardWidgetRenameTray({
  editor,
  saving,
  onCancel,
  onSubmit
}: {
  editor: WidgetRenameEditorState;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (title: string) => void;
}) {
  const [title, setTitle] = useState(editor.title);

  useEffect(() => {
    setTitle(editor.title);
  }, [editor]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (nextTitle) onSubmit(nextTitle);
  }

  return (
    <form className="dashboard-note-editor-tray dashboard-title-editor-tray" onSubmit={handleSubmit} aria-label="Rename widget editor">
      <div className="dashboard-note-editor-heading">
        <strong>Rename widget</strong>
        <span>Update the card title.</span>
      </div>
      <label className="dashboard-note-editor-field">
        <span>Name</span>
        <input
          autoFocus
          disabled={saving}
          maxLength={100}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Widget name"
          type="text"
          value={title}
        />
      </label>
      <div className="dashboard-note-editor-actions">
        <button type="button" className="dashboard-widget-icon-button" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="dashboard-widget-icon-button is-primary" disabled={saving}>
          {saving ? "Saving..." : "Save name"}
        </button>
      </div>
    </form>
  );
}

function DashboardPanel({
  widget,
  subtitle,
  loading,
  saving,
  layoutEditing,
  placementMode,
  sizeLabel,
  children,
  onNativeDragStart,
  onNativeDragOver,
  onNativeDrop,
  onNativeDragEnd,
  onDragInteractionStart,
  onPlacementSettled,
  onRename,
  onInlineRename,
  onDuplicate,
  onEditNote,
  onMoveToSection,
  onCopyToDashboard,
  onResetSize,
  onFitToContent,
  onRemove
}: {
  widget: DashboardWidget;
  subtitle: string;
  loading?: boolean;
  saving?: boolean;
  layoutEditing?: boolean;
  placementMode?: boolean;
  sizeLabel?: string;
  children: React.ReactNode;
  onNativeDragStart: (widgetId: string, event: React.DragEvent<HTMLElement>) => void;
  onNativeDragOver: (widgetId: string, event: React.DragEvent<HTMLElement>) => void;
  onNativeDrop: (widgetId: string) => void;
  onNativeDragEnd: () => void;
  onPlacementSettled?: (widgetId: string) => void;
  onRename?: (widgetId: string) => void;
  onInlineRename?: (widgetId: string, title: string) => void;
  onDuplicate?: (widgetId: string) => void;
  onEditNote?: (widgetId: string) => void;
  onMoveToSection?: (widgetId: string) => void;
  onCopyToDashboard?: (widgetId: string) => void;
  onResetSize?: (widgetId: string) => void;
  onFitToContent?: (widgetId: string) => void;
  onRemove?: (widgetId: string) => void;
  onDragInteractionStart?: () => void;
}) {
  function runMenuAction(event: React.MouseEvent<HTMLButtonElement>, action?: (widgetId: string) => void) {
    event.currentTarget.closest("details")?.removeAttribute("open");
    action?.(widget.id);
  }

  return (
    <article
      className={`dashboard-panel dashboard-card-${widget.kind}${saving ? " is-saving" : ""}${layoutEditing ? " is-editing" : ""}${placementMode ? " is-placement-target dashboard-panel-placement-drag-surface" : ""}`}
      onDragOver={(event) => {
        if (layoutEditing) onNativeDragOver(widget.id, event);
      }}
      onDrop={() => {
        if (layoutEditing) onNativeDrop(widget.id);
      }}
    >
      <div className="dashboard-panel-header">
        <button
          className="dashboard-panel-drag-handle"
          draggable={Boolean(layoutEditing)}
          onMouseDown={layoutEditing ? onDragInteractionStart : undefined}
          onDragEnd={layoutEditing ? onNativeDragEnd : undefined}
          onDragStart={(event) => {
            if (!layoutEditing) {
              event.preventDefault();
              return;
            }
            onNativeDragStart(widget.id, event);
          }}
          title={layoutEditing ? "Drag panel" : "Enable Edit layout to drag"}
          type="button"
          aria-label={`Drag ${widget.title}`}
          aria-disabled={!layoutEditing}
        >
          <span />
        </button>
        <div className="dashboard-panel-title">
          {widget.kind === "note" && !placementMode ? (
            <InlineEditableText
              className="dashboard-inline-title-input"
              disabled={Boolean(saving)}
              onCommit={(title) => {
                onInlineRename?.(widget.id, title || "Note");
              }}
              placeholder="Note title"
              value={widget.title}
            />
          ) : (
            <strong>{widget.title}</strong>
          )}
          <span>{subtitle}</span>
        </div>
        <div className="dashboard-panel-status">
          {sizeLabel ? <span className="dashboard-layout-size-badge">{sizeLabel}</span> : null}
          {loading ? <span className="dashboard-panel-loading" aria-label="Loading" /> : null}
          <details className="dashboard-panel-menu dashboard-drag-cancel">
            <summary aria-label={`${widget.title} menu`}>...</summary>
            <ul>
              <li><button type="button" onClick={(event) => runMenuAction(event, onRename)}>Rename</button></li>
              {widget.kind === "note" ? <li><button type="button" onClick={(event) => runMenuAction(event, onEditNote)}>Edit note</button></li> : null}
              <li><button type="button" onClick={(event) => runMenuAction(event, onDuplicate)}>Duplicate</button></li>
              <li><button type="button" onClick={(event) => runMenuAction(event, onMoveToSection)}>Move to section</button></li>
              <li><button type="button" onClick={(event) => runMenuAction(event, onCopyToDashboard)}>Copy to dashboard</button></li>
              <li><button type="button" onClick={(event) => runMenuAction(event, onResetSize)}>Reset width</button></li>
              <li><button type="button" onClick={(event) => runMenuAction(event, onFitToContent)}>Fit width</button></li>
              <li><button type="button" className="is-danger" onClick={(event) => runMenuAction(event, onRemove)}>Remove</button></li>
            </ul>
          </details>
        </div>
      </div>
      <div className="dashboard-panel-body">{children}</div>
      {placementMode ? (
        <span
          aria-hidden="true"
          className="dashboard-placement-drag-layer"
          onMouseDown={layoutEditing ? onDragInteractionStart : undefined}
          onMouseUp={() => {
            window.setTimeout(() => onPlacementSettled?.(widget.id), 0);
          }}
        />
      ) : null}
    </article>
  );
}

function DashboardNoteSectionPickerTray({
  sections,
  onCancel,
  onSelect
}: {
  sections: DashboardSection[];
  onCancel: () => void;
  onSelect: (sectionId: string) => void;
}) {
  return (
    <div className="dashboard-note-editor-tray dashboard-note-section-picker" aria-label="Choose note section">
      <div className="dashboard-note-editor-heading">
        <strong>Choose section</strong>
        <span>Select where the new note should appear.</span>
      </div>
      <div className="dashboard-note-section-options" role="list" aria-label="Dashboard sections">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            className="dashboard-widget-icon-button"
            onClick={() => onSelect(section.id)}
          >
            {section.title}
          </button>
        ))}
      </div>
      <div className="dashboard-note-editor-actions">
        <button type="button" className="dashboard-widget-icon-button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function DashboardFloatingTray({
  children,
  onDismiss
}: {
  children: React.ReactNode;
  onDismiss: () => void;
}) {
  return (
    <div className="dashboard-floating-tray-backdrop" onClick={onDismiss} role="presentation">
      <div
        className="dashboard-floating-tray-shell"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}

export function DashboardView({
  token,
  dashboard,
  dashboards = [],
  liveValues,
  stale,
  forceCompactLayout = false,
  onDashboardChange,
  onDashboardRename,
  onDashboardDuplicate,
  onDashboardDelete,
  onDashboardMerge,
  onCopyWidgetToDashboard,
  onLayoutChange,
  onVisibilityChange
}: DashboardViewProps) {
  const {
    containerRef,
    width: containerWidth,
    mounted,
    measureWidth
  } = useContainerWidth({
    measureBeforeMount: true,
    initialWidth: DASHBOARD_DESKTOP_FALLBACK_WIDTH
  });
  const initialSections = sectionsForDashboard(dashboard);
  const [dashboardSections, setDashboardSections] = useState<DashboardSection[]>(initialSections);
  const [gridLayoutBySection, setGridLayoutBySection] = useState<Record<string, Layout>>(() => layoutBySectionForDashboard(dashboard, initialSections));
  const [compactGridLayoutBySection, setCompactGridLayoutBySection] = useState<Record<string, Layout>>(() => repackLayoutsBySection(layoutBySectionForDashboard(dashboard, initialSections), DASHBOARD_TABLET_GRID_COLUMNS));
  const [chartSeriesByWidget, setChartSeriesByWidget] = useState<Record<string, ChartSeries[]>>({});
  const [loadingWidgets, setLoadingWidgets] = useState<Record<string, boolean>>({});
  const [fallbackLiveValues, setFallbackLiveValues] = useState<Record<string, BmsCollectorPoint>>({});
  const [rangeByWidget, setRangeByWidget] = useState<Record<string, RangeKey>>({});
  const [refreshByWidget, setRefreshByWidget] = useState<Record<string, number>>({});
  const [savingLayout, setSavingLayout] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [layoutEditing, setLayoutEditing] = useState(false);
  const [nativeDraggingId, setNativeDraggingId] = useState<string | null>(null);
  const [placementWidgetId, setPlacementWidgetId] = useState<string | null>(null);
  const [noteSectionPickerOpen, setNoteSectionPickerOpen] = useState(false);
  const [noteEditor, setNoteEditor] = useState<NoteEditorState | null>(null);
  const [noteEditorSaving, setNoteEditorSaving] = useState(false);
  const [renameEditor, setRenameEditor] = useState<WidgetRenameEditorState | null>(null);
  const [renameEditorSaving, setRenameEditorSaving] = useState(false);
  const chartHistoryKeysRef = useRef<Record<string, string>>({});
  const savingLayoutRef = useRef(false);
  const pendingGridLayoutSaveRef = useRef<PendingGridLayoutSave | null>(null);
  const gridLayoutSaveTimerRef = useRef<number | null>(null);
  const persistedLayoutSignatureRef = useRef("");

  const effectiveContainerWidth = containerWidth > 0 ? containerWidth : DASHBOARD_DESKTOP_FALLBACK_WIDTH;
  const gridWidth = Math.max(320, Math.round(effectiveContainerWidth));
  const activeGridColumns = dashboardGridColumnsForWidth(effectiveContainerWidth, forceCompactLayout);
  const usingCompactGrid = activeGridColumns < DASHBOARD_GRID_COLUMNS;
  const canEditCanonicalLayout = layoutEditing && !usingCompactGrid;
  const activeGridLayoutBySection = usingCompactGrid ? compactGridLayoutBySection : gridLayoutBySection;
  const widgetsById = useMemo(() => new Map(dashboard.widgets.map((widget) => [widget.id, widget])), [dashboard.widgets]);
  const historyWidgets = useMemo(
    () => dashboard.widgets.filter((widget) => widget.kind === "timeseries_chart" || widget.kind === "stat_value"),
    [dashboard.widgets]
  );
  const sectionViewModels = useMemo(
    () => dashboardSections.map((section) => ({
      section,
      layout: activeGridLayoutBySection[section.id] ?? [],
      widgets: [...(activeGridLayoutBySection[section.id] ?? [])]
        .sort((left, right) => (left.y - right.y) || (left.x - right.x))
        .map((item) => widgetsById.get(item.i))
        .filter((entry): entry is DashboardWidget => Boolean(entry))
    })).filter((entry) => entry.widgets.length > 0),
    [activeGridLayoutBySection, dashboardSections, widgetsById]
  );
  const noteTargetSections = useMemo(() => {
    const targets: DashboardSection[] = [];
    const seen = new Set<string>();
    const push = (section: DashboardSection) => {
      if (seen.has(section.id)) return;
      seen.add(section.id);
      targets.push(section);
    };
    if (!dashboardSections.some((section) => section.id === "overview" || section.kind === "overview")) {
      push(standardSection("overview"));
    }
    for (const section of dashboardSections) {
      push(section);
    }
    if (targets.length === 0) {
      push(standardSection("overview"));
    }
    return targets;
  }, [dashboardSections]);
  const dashboardLayoutSignature = layoutSignature(dashboard.layout);
  const dashboardWidgetStructureSignature = widgetStructureSignature(dashboard.widgets);
  const dashboardSectionSignature = sectionSignature(sectionsForDashboard(dashboard));
  const dashboardSaveSignature = `${dashboardLayoutSignature}::${dashboardSectionSignature}`;
  const chartWidgetIdsSignature = chartWidgetIdSignature(historyWidgets);
  const chartQuerySignature = chartQuerySignatureForWidgets(historyWidgets);
  const chartRangesSignature = historyWidgets
    .map((widget) => `${widget.id}:${historyRangeForWidget(widget, rangeByWidget[widget.id])}`)
    .join("|");
  const chartRefreshSignature = historyWidgets.map((widget) => `${widget.id}:${refreshByWidget[widget.id] ?? 0}`).join("|");
  const fallbackPointNamesSignature = chartPointNamesSignature(dashboard.widgets);

  useEffect(() => {
    persistedLayoutSignatureRef.current = dashboardSaveSignature;
  }, [dashboardSaveSignature]);

  useEffect(() => () => {
    if (gridLayoutSaveTimerRef.current !== null) {
      window.clearTimeout(gridLayoutSaveTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (usingCompactGrid && layoutEditing) {
      setLayoutEditing(false);
      setPlacementWidgetId(null);
    }
  }, [layoutEditing, usingCompactGrid]);

  useEffect(() => {
    if (!usingCompactGrid) return;
    setCompactGridLayoutBySection(repackLayoutsBySection(gridLayoutBySection, activeGridColumns));
  }, [activeGridColumns, dashboard.id, gridLayoutBySection, usingCompactGrid]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      measureWidth();
    });
    const transitionFrame = window.setTimeout(() => {
      measureWidth();
    }, 340);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(transitionFrame);
    };
  }, [dashboard.id, forceCompactLayout, measureWidth]);

  useEffect(() => {
    setNoteEditor(null);
    setNoteEditorSaving(false);
    setNoteSectionPickerOpen(false);
    setRenameEditor(null);
    setRenameEditorSaving(false);
    setPlacementWidgetId(null);
  }, [dashboard.id]);

  useEffect(() => {
    const nextSections = sectionsForDashboard(dashboard);
    const nextLayouts = layoutBySectionForDashboard(dashboard, nextSections);
    setDashboardSections(nextSections);
    setGridLayoutBySection(nextLayouts);
    setCompactGridLayoutBySection(repackLayoutsBySection(nextLayouts, activeGridColumns < DASHBOARD_GRID_COLUMNS ? activeGridColumns : DASHBOARD_TABLET_GRID_COLUMNS));
  }, [dashboard.id, dashboardLayoutSignature, dashboardWidgetStructureSignature, dashboardSectionSignature]);

  useEffect(() => {
    const chartWidgetIds = new Set(historyWidgets.map((widget) => widget.id));

    setChartSeriesByWidget((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([widgetId]) => chartWidgetIds.has(widgetId)));
      for (const widget of historyWidgets) {
        if (!next[widget.id]) {
          const range = historyRangeForWidget(widget, rangeByWidget[widget.id]);
          const refreshNonce = refreshByWidget[widget.id] ?? 0;
          next[widget.id] = seriesWithWidgetMetadata(widget, cachedChartSeries(chartHistoryKey(widget, range, refreshNonce)) ?? []);
        }
      }
      return next;
    });
    setLoadingWidgets((current) => Object.fromEntries(Object.entries(current).filter(([widgetId]) => chartWidgetIds.has(widgetId))));
    chartHistoryKeysRef.current = Object.fromEntries(Object.entries(chartHistoryKeysRef.current).filter(([widgetId]) => chartWidgetIds.has(widgetId)));
  }, [chartWidgetIdsSignature, historyWidgets, rangeByWidget, refreshByWidget]);

  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();

    const requestedJobs = historyWidgets.map((widget) => {
      const range = historyRangeForWidget(widget, rangeByWidget[widget.id]);
      const refreshNonce = refreshByWidget[widget.id] ?? 0;
      return { widget, range, key: chartHistoryKey(widget, range, refreshNonce) };
    }).filter((job) => chartHistoryKeysRef.current[job.widget.id] !== job.key);

    const cachedUpdates: Record<string, ChartSeries[]> = {};
    const nextLoadedKeys: Record<string, string> = {};
    const jobs = requestedJobs.filter((job) => {
      const cached = cachedChartSeries(job.key);
      if (!cached) return true;
      cachedUpdates[job.widget.id] = seriesWithWidgetMetadata(job.widget, cached);
      nextLoadedKeys[job.widget.id] = job.key;
      return false;
    });

    if (Object.keys(cachedUpdates).length > 0) {
      setChartSeriesByWidget((current) => ({ ...current, ...cachedUpdates }));
      setLoadingWidgets((current) => {
        const next = { ...current };
        for (const widgetId of Object.keys(cachedUpdates)) {
          next[widgetId] = false;
        }
        return next;
      });
      chartHistoryKeysRef.current = { ...chartHistoryKeysRef.current, ...nextLoadedKeys };
    }

    if (jobs.length === 0) {
      return () => {
        cancelled = true;
        abortController.abort();
      };
    }

    async function loadCharts(): Promise<void> {
      setLoadingWidgets((current) => {
        const next = { ...current };
        for (const job of jobs) {
          next[job.widget.id] = true;
        }
        return next;
      });
      const now = new Date();
      const queries = jobs.flatMap((job) => {
        const from = new Date(now.getTime() - hoursForRange(job.range) * 60 * 60 * 1000);
        const limit = job.range === "7d" ? "1400" : "720";
        return job.widget.pointBindings.map((binding, index) => {
          return historyQueryForBinding(binding, `${job.widget.id}:${index}`, from.toISOString(), now.toISOString(), job.range, limit);
        }).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
      });
      const resultByKey = new Map<string, BmsCollectorTimeseriesRow[]>();
      if (queries.length > 0) {
        const timeoutId = window.setTimeout(() => abortController.abort(), DASHBOARD_HISTORY_TIMEOUT_MS);
        try {
          const queryChunks: typeof queries[] = [];
          for (let index = 0; index < queries.length; index += 32) {
            queryChunks.push(queries.slice(index, index + 32));
          }
          const batches = await Promise.all(queryChunks.map((chunk) => queryBmsDashboardHistoryBatch(token, chunk, { signal: abortController.signal })));
          for (const batch of batches) {
            for (const result of batch.results) {
              if (!result.ok) continue;
              resultByKey.set(
                result.key,
                [...result.items].sort((left, right) => Date.parse(left.ts) - Date.parse(right.ts))
              );
            }
          }
        } catch (error) {
          if (cancelled || abortController.signal.aborted || isAbortLikeError(error)) {
            return;
          }
          setLoadingWidgets((current) => {
            const next = { ...current };
            for (const job of jobs) {
              next[job.widget.id] = false;
            }
            return next;
          });
          return;
        } finally {
          window.clearTimeout(timeoutId);
        }
      }

      if (cancelled || abortController.signal.aborted) return;
      const seriesUpdates: Record<string, ChartSeries[]> = {};
      const loadedKeys: Record<string, string> = {};
      for (const job of jobs) {
        const { widget } = job;
        const nextSeries = widget.pointBindings.map((binding, index) => {
          const base = emptySeriesForBinding(widget, binding, index);
          const rows = resultByKey.get(`${widget.id}:${index}`) ?? [];
          return { ...base, points: toChartPoints(rows) };
        });
        rememberChartSeries(job.key, nextSeries);
        seriesUpdates[widget.id] = nextSeries;
        loadedKeys[widget.id] = job.key;
      }
      setChartSeriesByWidget((current) => ({ ...current, ...seriesUpdates }));
      setLoadingWidgets((current) => {
        const next = { ...current };
        for (const job of jobs) {
          next[job.widget.id] = false;
        }
        return next;
      });
      chartHistoryKeysRef.current = { ...chartHistoryKeysRef.current, ...loadedKeys };
    }

    const startTimer = window.setTimeout(() => {
      if (!cancelled) {
        void loadCharts();
      }
    }, DASHBOARD_HISTORY_START_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      abortController.abort();
    };
  }, [dashboard.id, chartQuerySignature, chartRangesSignature, chartRefreshSignature, historyWidgets, rangeByWidget, refreshByWidget, token]);

  useEffect(() => {
    let cancelled = false;
    let polling = false;
    const abortController = new AbortController();

    async function pollFallbackValues() {
      if (polling || abortController.signal.aborted) return;
      polling = true;
      const queryByKey = new Map<string, BmsDashboardLatestBatchQuery>();
      for (const widget of dashboard.widgets) {
        for (const binding of widget.pointBindings) {
          const key = pointKey(binding);
          if (!key || queryByKey.has(key)) continue;
          const query = latestQueryForBinding(binding, key);
          if (query) queryByKey.set(key, query);
        }
      }
      const queries = [...queryByKey.values()];
      if (queries.length === 0) {
        polling = false;
        return;
      }
      try {
        const batches = await Promise.all(
          Array.from({ length: Math.ceil(queries.length / 64) }, (_value, index) =>
            queryBmsDashboardLatestBatch(token, queries.slice(index * 64, index * 64 + 64), { signal: abortController.signal })
          )
        );
        if (cancelled || abortController.signal.aborted) return;
        const values = new Map<string, BmsCollectorPoint>();
        for (const batch of batches) {
          for (const result of batch.results) {
            if (!result.ok || !result.point) continue;
            values.set(result.key, {
              ...result.point,
              name: result.key
            });
          }
        }
        setFallbackLiveValues(Object.fromEntries(values));
      } catch (error) {
        if (!cancelled && !abortController.signal.aborted && !isAbortLikeError(error)) {
          setFallbackLiveValues({});
        }
      } finally {
        polling = false;
      }
    }

    const firstPollTimer = window.setTimeout(() => {
      void pollFallbackValues();
    }, DASHBOARD_FALLBACK_VALUES_START_DELAY_MS);
    const interval = setInterval(() => {
      void pollFallbackValues();
    }, 60_000);
    return () => {
      cancelled = true;
      window.clearTimeout(firstPollTimer);
      clearInterval(interval);
      abortController.abort();
    };
  }, [dashboard.id, fallbackPointNamesSignature, token]);

  useEffect(() => {
    setChartSeriesByWidget((current) => {
      let changed = false;
      const next: Record<string, ChartSeries[]> = {};
      for (const [widgetId, series] of Object.entries(current)) {
        if (!chartHistoryKeysRef.current[widgetId]) {
          next[widgetId] = series;
          continue;
        }
        next[widgetId] = series.map((entry) => {
          const live = liveValues[entry.pointName] ?? fallbackLiveValues[entry.pointName];
          const numeric = Number(live?.last_value ?? "");
          const ts = live?.last_polled_at;
          if (!Number.isFinite(numeric) || !ts) {
            return entry;
          }
          const lastPoint = entry.points.at(-1);
          if (lastPoint?.ts === ts && lastPoint.value === numeric) {
            return entry;
          }
          changed = true;
          return {
            ...entry,
            points: [...entry.points.slice(-1399), { ts, value: numeric }]
          };
        });
      }
      return changed ? next : current;
    });
  }, [liveValues, fallbackLiveValues]);

  function nextLayoutsBySection(sectionId: string, layout: Layout, source: Record<string, Layout>): Record<string, Layout> {
    return { ...source, [sectionId]: [...layout] };
  }

  function cloneLayoutsBySection(layouts: Record<string, Layout>): Record<string, Layout> {
    return Object.fromEntries(
      Object.entries(layouts).map(([sectionId, layout]) => [
        sectionId,
        layout.map((item) => ({ ...item }))
      ])
    );
  }

  function dashboardChoiceLines(dashboards: DashboardRecord[]): string {
    return dashboards.map((entry, index) => {
      const visibility = entry.visibility === "project" ? "Shared" : "Private";
      return `${index + 1}. ${entry.title} - ${entry.widgets.length} widgets - ${visibility}`;
    }).join("\n");
  }

  function findDashboardChoice(dashboards: DashboardRecord[], requested: string): DashboardRecord | undefined {
    const trimmed = requested.trim();
    const index = Number(trimmed);
    if (Number.isInteger(index) && index >= 1 && index <= dashboards.length) {
      return dashboards[index - 1];
    }
    const normalized = trimmed.toLowerCase();
    return dashboards.find((entry) => entry.title.toLowerCase() === normalized || entry.id === trimmed);
  }

  function gridLayoutSaveSignature(layouts: Record<string, Layout>, sections: DashboardSection[]) {
    const nextLayout = toDashboardLayoutFromSections(layouts, sections);
    return {
      layout: nextLayout,
      signature: `${layoutSignature(nextLayout)}::${sectionSignature(sections)}`
    };
  }

  function prepareGridLayoutSave(layouts: Record<string, Layout>, sections: DashboardSection[]): PendingGridLayoutSave {
    return {
      layouts: cloneLayoutsBySection(layouts),
      sections: sections.map((section) => ({ ...section, widgetIds: [...section.widgetIds] }))
    };
  }

  async function flushGridLayoutSave(nextLayouts: Record<string, Layout>, nextSections: DashboardSection[]) {
    if (usingCompactGrid) return;
    const { layout: nextDashboardLayout, signature } = gridLayoutSaveSignature(nextLayouts, nextSections);
    if (signature === (persistedLayoutSignatureRef.current || dashboardSaveSignature)) return;
    savingLayoutRef.current = true;
    setSavingLayout(true);
    let saved = false;
    try {
      await onLayoutChange(nextDashboardLayout, nextSections);
      saved = true;
      persistedLayoutSignatureRef.current = signature;
    } finally {
      if (!saved) {
        pendingGridLayoutSaveRef.current = null;
        savingLayoutRef.current = false;
        setSavingLayout(false);
        const rollbackSections = sectionsForDashboard(dashboard);
        const rollbackLayouts = layoutBySectionForDashboard(dashboard, rollbackSections);
        setDashboardSections(rollbackSections);
        setGridLayoutBySection(rollbackLayouts);
        setCompactGridLayoutBySection(repackLayoutsBySection(rollbackLayouts, activeGridColumns < DASHBOARD_GRID_COLUMNS ? activeGridColumns : DASHBOARD_TABLET_GRID_COLUMNS));
        return;
      }
      const pendingSave = pendingGridLayoutSaveRef.current;
      pendingGridLayoutSaveRef.current = null;
      if (pendingSave) {
        void flushGridLayoutSave(pendingSave.layouts, pendingSave.sections).catch(() => undefined);
      } else {
        savingLayoutRef.current = false;
        setSavingLayout(false);
      }
    }
  }

  async function saveGridLayouts(nextLayouts: Record<string, Layout>, nextSections = dashboardSections) {
    if (usingCompactGrid) return;
    const pendingSave = prepareGridLayoutSave(nextLayouts, nextSections);
    const { signature } = gridLayoutSaveSignature(pendingSave.layouts, pendingSave.sections);
    if (signature === (persistedLayoutSignatureRef.current || dashboardSaveSignature)) return;
    pendingGridLayoutSaveRef.current = pendingSave;
    if (gridLayoutSaveTimerRef.current !== null) {
      window.clearTimeout(gridLayoutSaveTimerRef.current);
    }
    gridLayoutSaveTimerRef.current = window.setTimeout(() => {
      gridLayoutSaveTimerRef.current = null;
      const queuedSave = pendingGridLayoutSaveRef.current;
      if (!queuedSave) return;
      if (savingLayoutRef.current) return;
      pendingGridLayoutSaveRef.current = null;
      void flushGridLayoutSave(queuedSave.layouts, queuedSave.sections).catch(() => {
        // The parent handler already surfaces the API error banner.
      });
    }, 260);
  }

  function handleNativeDragStart(widgetId: string, event: React.DragEvent<HTMLElement>) {
    if (!canEditCanonicalLayout) {
      event.preventDefault();
      return;
    }
    clearBrowserSelection();
    setNativeDraggingId(widgetId);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", widgetId);
    }
  }

  function handleNativeDragOver(_widgetId: string, event: React.DragEvent<HTMLElement>) {
    if (!canEditCanonicalLayout) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }

  function handleNativeDrop(sectionId: string, targetId: string) {
    if (!canEditCanonicalLayout) return;
    if (!nativeDraggingId || nativeDraggingId === targetId) return;
    clearBrowserSelection();
    const sectionLayout = activeGridLayoutBySection[sectionId] ?? [];
    const nextLayout = reorderLayout(sectionLayout, nativeDraggingId, targetId, activeGridColumns);
    setNativeDraggingId(null);
    if (usingCompactGrid) {
      setCompactGridLayoutBySection((current) => nextLayoutsBySection(sectionId, nextLayout, current));
    } else {
      const nextLayouts = nextLayoutsBySection(sectionId, nextLayout, gridLayoutBySection);
      setGridLayoutBySection(nextLayouts);
      void saveGridLayouts(nextLayouts);
    }
    if (nativeDraggingId === placementWidgetId) {
      setPlacementWidgetId(null);
    }
  }

  function handleNativeDragEnd() {
    clearBrowserSelection();
    setNativeDraggingId(null);
  }

  function handleDragInteractionStart() {
    clearBrowserSelection();
  }

  async function handleVisibilityToggle() {
    if (sharing) return;
    setSharing(true);
    try {
      await onVisibilityChange(dashboard.visibility === "private" ? "project" : "private");
    } finally {
      setSharing(false);
    }
  }

  function mutationPayload(
    widgets: DashboardWidget[],
    layouts: Record<string, Layout>,
    sections: DashboardSection[]
  ): DashboardSpecMutation {
    const cleanedSections = nonEmptySections(sections, widgets);
    const widgetIds = new Set(widgets.map((widget) => widget.id));
    const layout = toDashboardLayoutFromSections(layouts, cleanedSections).filter((item) => widgetIds.has(item.widgetId));
    return {
      title: dashboard.title,
      ...(dashboard.description ? { description: dashboard.description } : {}),
      visibility: dashboard.visibility,
      layoutVersion: DASHBOARD_LAYOUT_VERSION,
      layout,
      widgets,
      sections: cleanedSections,
      ...(dashboard.sourceConversationId ? { sourceConversationId: dashboard.sourceConversationId } : {})
    };
  }

  async function persistDashboardSpec(
    widgets: DashboardWidget[],
    layouts: Record<string, Layout>,
    sections: DashboardSection[]
  ) {
    if (!onDashboardChange || savingLayoutRef.current) return;
    const cleanedSections = nonEmptySections(sections, widgets);
    const cleanedLayouts = Object.fromEntries(
      cleanedSections.map((section) => [
        section.id,
        (layouts[section.id] ?? []).filter((item) => section.widgetIds.includes(item.i))
      ])
    );
    setDashboardSections(cleanedSections);
    setGridLayoutBySection(cleanedLayouts);
    setCompactGridLayoutBySection(repackLayoutsBySection(cleanedLayouts, activeGridColumns < DASHBOARD_GRID_COLUMNS ? activeGridColumns : DASHBOARD_TABLET_GRID_COLUMNS));
    savingLayoutRef.current = true;
    setSavingLayout(true);
    try {
      await onDashboardChange(mutationPayload(widgets, cleanedLayouts, cleanedSections));
      persistedLayoutSignatureRef.current = gridLayoutSaveSignature(cleanedLayouts, cleanedSections).signature;
    } finally {
      savingLayoutRef.current = false;
      setSavingLayout(false);
    }
  }

  function findSectionForWidget(widgetId: string): DashboardSection | undefined {
    return dashboardSections.find((section) => section.widgetIds.includes(widgetId));
  }

  function standardSection(id: DashboardSection["kind"]): DashboardSection {
    if (id === "comparison") return { id: "comparison", title: "Comparison", kind: "comparison", widgetIds: [] };
    if (id === "trends") return { id: "trends", title: "Trends", kind: "trends", widgetIds: [] };
    if (id === "custom") return { id: "custom", title: "Custom", kind: "custom", widgetIds: [] };
    return { id: "overview", title: "Overview", kind: "overview", widgetIds: [] };
  }

  function layoutAppendY(layout: Layout): number {
    return layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);
  }

  function sectionChoices(): string {
    return dashboardSections.map((section) => `${section.id} (${section.title})`).join(", ");
  }

  async function handleToggleSectionCollapsed(sectionId: string) {
    const nextSections = dashboardSections.map((section) => (
      section.id === sectionId ? { ...section, collapsed: !section.collapsed } : section
    ));
    setDashboardSections(nextSections);
    if (!onDashboardChange || usingCompactGrid || savingLayoutRef.current) return;
    savingLayoutRef.current = true;
    setSavingLayout(true);
    try {
      await onDashboardChange(mutationPayload(dashboard.widgets, gridLayoutBySection, nextSections));
      persistedLayoutSignatureRef.current = gridLayoutSaveSignature(gridLayoutBySection, nextSections).signature;
    } finally {
      savingLayoutRef.current = false;
      setSavingLayout(false);
    }
  }

  function handleRenameWidget(widgetId: string) {
    const widget = widgetsById.get(widgetId);
    if (!widget) return;
    setNoteEditor(null);
    setRenameEditor({ widgetId, title: widget.title });
  }

  async function handleSubmitWidgetRename(title: string) {
    if (!renameEditor || renameEditorSaving) return;
    const widget = widgetsById.get(renameEditor.widgetId);
    if (!widget || title === widget.title) {
      setRenameEditor(null);
      return;
    }
    setRenameEditorSaving(true);
    try {
      const nextWidgets = dashboard.widgets.map((entry) => (
        entry.id === renameEditor.widgetId ? { ...entry, title } as DashboardWidget : entry
      ));
      await persistDashboardSpec(nextWidgets, gridLayoutBySection, dashboardSections);
      setRenameEditor(null);
    } catch {
      // The parent save handler shows the diagnostic banner; keep the editor open.
    } finally {
      setRenameEditorSaving(false);
    }
  }

  async function handleInlineWidgetTitle(widgetId: string, title: string) {
    const widget = widgetsById.get(widgetId);
    const nextTitle = title.trim() || "Note";
    if (!widget || nextTitle === widget.title) return;
    const nextWidgets = dashboard.widgets.map((entry) => (
      entry.id === widgetId ? { ...entry, title: nextTitle } as DashboardWidget : entry
    ));
    await persistDashboardSpec(nextWidgets, gridLayoutBySection, dashboardSections);
  }

  async function handleInlineNoteContent(widgetId: string, content: string) {
    const widget = widgetsById.get(widgetId);
    if (!widget || widget.kind !== "note") return;
    const nextContent = content.trim();
    if (nextContent === (widget.content ?? "").trim()) return;
    const nextWidgets = dashboard.widgets.map((entry) => (
      entry.id === widgetId ? { ...entry, content: nextContent } as DashboardWidget : entry
    ));
    await persistDashboardSpec(nextWidgets, gridLayoutBySection, dashboardSections);
  }

  async function handleCreateNotePlacement(targetSectionId = "overview") {
    if (!onDashboardChange || savingLayoutRef.current) return;
    setNoteSectionPickerOpen(false);
    setNoteEditor(null);
    setRenameEditor(null);
    const nextNote = createNoteWidget({
      title: "New note",
      content: "",
      tone: "yellow"
    }, targetSectionId);
    setLayoutEditing(true);
    setPlacementWidgetId(nextNote.widgetId);
    try {
      await persistDashboardSpec(nextNote.widgets, nextNote.layouts, nextNote.sections);
    } catch {
      setPlacementWidgetId(null);
    }
  }

  function openNoteSectionPicker() {
    setNoteEditor(null);
    setRenameEditor(null);
    setNoteSectionPickerOpen(true);
  }

  function openEditNoteEditor(widgetId: string) {
    const widget = widgetsById.get(widgetId);
    if (!widget || widget.kind !== "note") return;
    setRenameEditor(null);
    setNoteEditor({
      mode: "edit",
      widgetId,
      title: widget.title,
      content: widget.content ?? "",
      tone: widget.tone ?? "yellow"
    });
  }

  async function handleSubmitNoteEditor(value: NoteEditorSubmit) {
    if (!onDashboardChange || !noteEditor || noteEditorSaving) return;
    setNoteEditorSaving(true);
    try {
      if (noteEditor.mode === "edit") {
        const nextWidgets = dashboard.widgets.map((entry) => (
          entry.id === noteEditor.widgetId
            ? { ...entry, title: value.title, content: value.content, tone: value.tone } as DashboardWidget
            : entry
        ));
        await persistDashboardSpec(nextWidgets, gridLayoutBySection, dashboardSections);
        setNoteEditor(null);
        return;
      }

      const nextWidgets = createNoteWidget(value);
      await persistDashboardSpec(nextWidgets.widgets, nextWidgets.layouts, nextWidgets.sections);
      setNoteEditor(null);
    } catch {
      // The parent save handler shows the diagnostic banner; keep the editor open.
    } finally {
      setNoteEditorSaving(false);
    }
  }

  function createNoteWidget(value: NoteEditorSubmit, targetSectionId = "overview"): {
    widgetId: string;
    widgets: DashboardWidget[];
    layouts: Record<string, Layout>;
    sections: DashboardSection[];
  } {
    const existingIds = new Set(dashboard.widgets.map((entry) => entry.id));
    const id = uniqueWidgetId("note", existingIds);
    const noteWidget = {
      id,
      kind: "note",
      title: value.title,
      content: value.content,
      tone: value.tone,
      pointBindings: []
    } as DashboardWidget;
    const targetSection = dashboardSections.find((section) => section.id === targetSectionId)
      ?? (targetSectionId === "comparison" || targetSectionId === "trends" || targetSectionId === "overview"
        ? standardSection(targetSectionId)
        : targetSectionId === "notes"
          ? { id: "notes", title: "Notes", kind: "custom" as const, widgetIds: [] }
          : { id: targetSectionId, title: "Custom", kind: "custom" as const, widgetIds: [] });
    const targetLayout = gridLayoutBySection[targetSection.id] ?? [];
    const nextItem = createLayoutItemForWidget(noteWidget, undefined, layoutAppendY(targetLayout));
    const nextSections = dashboardSections.some((section) => section.id === targetSection.id)
      ? dashboardSections.map((section) => section.id === targetSection.id ? { ...section, collapsed: false, widgetIds: [...section.widgetIds, id] } : section)
      : [...dashboardSections, { ...targetSection, collapsed: false, widgetIds: [id] }];
    const nextLayouts = {
      ...gridLayoutBySection,
      [targetSection.id]: [...targetLayout, nextItem]
    };
    return {
      widgetId: id,
      widgets: [...dashboard.widgets, noteWidget],
      layouts: nextLayouts,
      sections: nextSections
    };
  }

  async function handleDuplicateWidget(widgetId: string) {
    const widget = widgetsById.get(widgetId);
    const section = findSectionForWidget(widgetId);
    if (!widget || !section) return;
    const existingIds = new Set(dashboard.widgets.map((entry) => entry.id));
    const clone = cloneDashboardWidget(widget, existingIds);
    const sourceLayout = gridLayoutBySection[section.id] ?? [];
    const sourceItem = sourceLayout.find((item) => item.i === widgetId);
    const nextItem = createLayoutItemForWidget(clone, sourceItem, layoutAppendY(sourceLayout));
    const nextLayouts = {
      ...gridLayoutBySection,
      [section.id]: [...sourceLayout, nextItem]
    };
    const nextSections = dashboardSections.map((entry) => (
      entry.id === section.id ? { ...entry, widgetIds: [...entry.widgetIds, clone.id] } : entry
    ));
    await persistDashboardSpec([...dashboard.widgets, clone], nextLayouts, nextSections);
  }

  async function handleRemoveWidget(widgetId: string) {
    if (dashboard.widgets.length <= 1) {
      window.alert("Keep at least one widget in a dashboard.");
      return;
    }
    const widget = widgetsById.get(widgetId);
    if (!widget || !window.confirm(`Remove "${widget.title}" from this dashboard? BMS data will not be deleted.`)) return;
    const nextWidgets = dashboard.widgets.filter((entry) => entry.id !== widgetId);
    const nextSections = dashboardSections.map((section) => ({
      ...section,
      widgetIds: section.widgetIds.filter((entry) => entry !== widgetId)
    }));
    const nextLayouts = Object.fromEntries(
      Object.entries(gridLayoutBySection).map(([sectionId, layout]) => [
        sectionId,
        layout.filter((item) => item.i !== widgetId)
      ])
    );
    await persistDashboardSpec(nextWidgets, nextLayouts, nextSections);
  }

  async function handleMoveWidgetToSection(widgetId: string) {
    const widget = widgetsById.get(widgetId);
    const sourceSection = findSectionForWidget(widgetId);
    if (!widget || !sourceSection) return;
    const requested = window.prompt(`Move to section: ${sectionChoices()}`, sourceSection.id)?.trim().toLowerCase();
    if (!requested || requested === sourceSection.id || requested === sourceSection.title.toLowerCase()) return;
    const existingTarget = dashboardSections.find((section) => section.id.toLowerCase() === requested || section.title.toLowerCase() === requested);
    const standardKind = requested === "overview" || requested === "comparison" || requested === "trends" || requested === "custom" ? requested : null;
    const targetSection = existingTarget ?? (standardKind ? standardSection(standardKind) : null);
    if (!targetSection) {
      window.alert("Use an existing section id/title, or overview, comparison, trends, custom.");
      return;
    }

    const sourceLayout = gridLayoutBySection[sourceSection.id] ?? [];
    const sourceItem = sourceLayout.find((item) => item.i === widgetId);
    const targetLayout = gridLayoutBySection[targetSection.id] ?? [];
    const movedItem = createLayoutItemForWidget(widget, sourceItem, layoutAppendY(targetLayout));
    const targetExists = dashboardSections.some((section) => section.id === targetSection.id);
    const nextSections = [
      ...dashboardSections.map((section) => {
        if (section.id === sourceSection.id) {
          return { ...section, widgetIds: section.widgetIds.filter((entry) => entry !== widgetId) };
        }
        if (section.id === targetSection.id) {
          return { ...section, widgetIds: [...section.widgetIds, widgetId], collapsed: false };
        }
        return section;
      }),
      ...(targetExists ? [] : [{ ...targetSection, widgetIds: [widgetId], collapsed: false }])
    ];
    const nextLayouts = {
      ...gridLayoutBySection,
      [sourceSection.id]: sourceLayout.filter((item) => item.i !== widgetId),
      [targetSection.id]: [...targetLayout, movedItem]
    };
    await persistDashboardSpec(dashboard.widgets, nextLayouts, nextSections);
  }

  async function handleWidgetSizeAction(widgetId: string, mode: "reset" | "fit") {
    const widget = widgetsById.get(widgetId);
    const section = findSectionForWidget(widgetId);
    if (!widget || !section) return;
    if (usingCompactGrid) {
      window.alert("Switch to the wide desktop layout before saving widget sizes.");
      return;
    }
    const sectionLayout = gridLayoutBySection[section.id] ?? [];
    const sourceItem = sectionLayout.find((item) => item.i === widgetId);
    const minSize = minSizeForWidget(widget);
    const preferredSize = mode === "fit" ? fitSizeForWidget(widget, sourceItem) : defaultSizeForWidget(widget);
    const w = Math.min(DASHBOARD_GRID_COLUMNS, Math.max(minSize.minW ?? 1, preferredSize.w));
    const h = Math.min(DASHBOARD_GRID_MAX_ITEM_HEIGHT, Math.max(minSize.minH ?? 1, preferredSize.h));
    const nextItem: LayoutItem = {
      ...(sourceItem ?? createLayoutItemForWidget(widget, undefined, layoutAppendY(sectionLayout))),
      w,
      h,
      x: Math.min(Math.max(0, sourceItem?.x ?? 0), DASHBOARD_GRID_COLUMNS - w),
      ...minSize,
      maxW: DASHBOARD_GRID_COLUMNS,
      maxH: h,
      isBounded: true,
      resizeHandles: ["e"]
    };
    const nextSectionLayout = sourceItem
      ? sectionLayout.map((item) => item.i === widgetId ? nextItem : item)
      : [...sectionLayout, nextItem];
    const nextLayouts = nextLayoutsBySection(section.id, nextSectionLayout, gridLayoutBySection);
    setGridLayoutBySection(nextLayouts);
    setCompactGridLayoutBySection(repackLayoutsBySection(nextLayouts, activeGridColumns < DASHBOARD_GRID_COLUMNS ? activeGridColumns : DASHBOARD_TABLET_GRID_COLUMNS));
    await saveGridLayouts(nextLayouts);
  }

  async function handleCopyWidgetToDashboard(widgetId: string) {
    if (!onCopyWidgetToDashboard) return;
    const candidates = dashboards.filter((entry) => entry.id !== dashboard.id);
    if (candidates.length === 0) {
      window.alert("Create another dashboard before copying widgets.");
      return;
    }
    const requested = window.prompt(
      `Copy to dashboard:\n${dashboardChoiceLines(candidates)}\n\nType a dashboard name or number.`,
      candidates[0]?.title
    )?.trim();
    if (!requested) return;
    const target = findDashboardChoice(candidates, requested);
    if (!target) {
      window.alert("Dashboard not found.");
      return;
    }
    await onCopyWidgetToDashboard(widgetId, target.id);
  }

  return (
    <section className={`dashboard-page${layoutEditing ? " is-editing-layout" : ""}${usingCompactGrid ? " is-derived-layout" : ""}`} aria-labelledby="dashboard-title">
      <div className="dashboard-page-header">
        <div>
          <h2 id="dashboard-title">{dashboard.title}</h2>
          {dashboard.description ? <p className="dashboard-page-description">{dashboard.description}</p> : null}
        </div>
        <div className="dashboard-page-actions">
          {onDashboardChange ? (
            <details className="dashboard-panel-menu dashboard-add-widget-menu">
              <summary aria-label="Add widget">+ Add widget</summary>
              <ul>
                <li>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.currentTarget.closest("details")?.removeAttribute("open");
                      openNoteSectionPicker();
                    }}
                  >
                    Note
                  </button>
                </li>
              </ul>
            </details>
          ) : null}
          <button
            className={`dashboard-widget-icon-button${layoutEditing ? " is-active" : ""}`}
            type="button"
            onClick={() => setLayoutEditing((current) => !current)}
            disabled={usingCompactGrid}
            title={usingCompactGrid ? "Expand the workspace to edit the canonical 12-column layout" : undefined}
          >
            {layoutEditing ? "View mode" : "Edit layout"}
          </button>
          <Badge tone={dashboard.visibility === "project" ? "success" : "neutral"}>
            {dashboard.visibility === "project" ? "Shared" : "Private"}
          </Badge>
          {stale ? <Badge tone="warning">Stale</Badge> : <Badge tone="info">Live</Badge>}
          <details className="dashboard-panel-menu dashboard-page-menu">
            <summary aria-label={`${dashboard.title} dashboard actions`}>...</summary>
            <ul>
              {onDashboardChange ? <li><button type="button" onClick={openNoteSectionPicker}>Add note</button></li> : null}
              {onDashboardRename ? <li><button type="button" onClick={onDashboardRename}>Rename</button></li> : null}
              {onDashboardDuplicate ? <li><button type="button" onClick={onDashboardDuplicate}>Duplicate</button></li> : null}
              {onDashboardMerge ? <li><button type="button" onClick={onDashboardMerge}>Merge into...</button></li> : null}
              <li>
                <button type="button" onClick={() => void handleVisibilityToggle()} disabled={sharing}>
                  {dashboard.visibility === "project" ? "Make Private" : "Share to Project"}
                </button>
              </li>
              {onDashboardDelete ? <li><button type="button" className="is-danger" onClick={onDashboardDelete}>Delete</button></li> : null}
            </ul>
          </details>
        </div>
      </div>

      {noteSectionPickerOpen ? (
        <DashboardFloatingTray onDismiss={() => setNoteSectionPickerOpen(false)}>
          <DashboardNoteSectionPickerTray
            sections={noteTargetSections}
            onCancel={() => setNoteSectionPickerOpen(false)}
            onSelect={(sectionId) => { void handleCreateNotePlacement(sectionId); }}
          />
        </DashboardFloatingTray>
      ) : noteEditor ? (
        <DashboardFloatingTray onDismiss={() => {
          if (!noteEditorSaving) setNoteEditor(null);
        }}>
          <DashboardNoteEditorTray
            editor={noteEditor}
            saving={noteEditorSaving}
            onCancel={() => setNoteEditor(null)}
            onSubmit={(value) => { void handleSubmitNoteEditor(value); }}
          />
        </DashboardFloatingTray>
      ) : renameEditor ? (
        <DashboardWidgetRenameTray
          editor={renameEditor}
          saving={renameEditorSaving}
          onCancel={() => setRenameEditor(null)}
          onSubmit={(title) => { void handleSubmitWidgetRename(title); }}
        />
      ) : null}

      {sectionViewModels.length === 0 ? (
        <Surface className="dashboard-empty-surface">
          <EmptyState title="No widgets yet">BuildingGPT can generate a dashboard spec here when you ask to monitor equipment.</EmptyState>
        </Surface>
      ) : (
        <div ref={containerRef as RefObject<HTMLDivElement>} className="dashboard-sections-shell">
          {mounted ? (
            sectionViewModels.map(({ section, layout, widgets }) => (
              <section className={`dashboard-section${section.collapsed ? " is-collapsed" : ""}`} key={`${dashboard.id}:${section.id}`}>
                <div className="dashboard-section-header">
                  <div className="dashboard-section-title">
                    <strong>{section.title}</strong>
                    <span>{widgets.length} widgets</span>
                  </div>
                  <div className="dashboard-section-actions">
                    <Badge tone="neutral">{section.kind}</Badge>
                    {onDashboardChange && canEditCanonicalLayout ? (
                      <button
                        className="dashboard-widget-icon-button dashboard-drag-cancel"
                        type="button"
                        aria-label={`Add note to ${section.title}`}
                        onClick={() => { void handleCreateNotePlacement(section.id); }}
                      >
                        + Note
                      </button>
                    ) : null}
                    <button
                      className="dashboard-widget-icon-button dashboard-drag-cancel"
                      type="button"
                      onClick={() => void handleToggleSectionCollapsed(section.id)}
                    >
                      {section.collapsed ? "Expand" : "Collapse"}
                    </button>
                  </div>
                </div>
                {section.collapsed ? null : (
                  <div className="dashboard-grid-shell">
                    <GridLayout
                      key={`${dashboard.id}:${section.id}:${activeGridColumns}`}
                      className={`dashboard-grid${canEditCanonicalLayout ? " is-editable" : ""}`}
                      width={gridWidth}
                      layout={layout}
                      gridConfig={{
                        cols: activeGridColumns,
                        rowHeight: DASHBOARD_GRID_ROW_HEIGHT,
                        margin: DASHBOARD_GRID_GAP,
                        containerPadding: [0, 0],
                        maxRows: Infinity
                      }}
	                      dragConfig={{
	                        enabled: canEditCanonicalLayout,
	                        bounded: true,
                        handle: ".dashboard-panel-drag-handle, .dashboard-panel-placement-drag-surface, .dashboard-placement-drag-layer",
	                        cancel: ".dashboard-drag-cancel, .dashboard-inline-edit-control",
	                        threshold: 4
	                      }}
                      resizeConfig={{
                        enabled: canEditCanonicalLayout,
                        handles: ["e"]
                      }}
                      onDrag={(nextLayout) => {
                        if (usingCompactGrid) {
                          setCompactGridLayoutBySection((current) => nextLayoutsBySection(section.id, nextLayout, current));
                        } else {
                          setGridLayoutBySection((current) => nextLayoutsBySection(section.id, nextLayout, current));
                        }
                      }}
                      onDragStop={(nextLayout) => {
                        if (usingCompactGrid) {
                          setCompactGridLayoutBySection((current) => nextLayoutsBySection(section.id, nextLayout, current));
                        } else {
                          const nextLayouts = nextLayoutsBySection(section.id, nextLayout, gridLayoutBySection);
                          setGridLayoutBySection(nextLayouts);
                          void saveGridLayouts(nextLayouts);
                        }
                        if (placementWidgetId && nextLayout.some((item) => item.i === placementWidgetId)) {
                          setPlacementWidgetId(null);
                        }
                      }}
                      onLayoutChange={(nextLayout) => {
                        if (usingCompactGrid) {
                          setCompactGridLayoutBySection((current) => nextLayoutsBySection(section.id, nextLayout, current));
                        } else {
                          setGridLayoutBySection((current) => nextLayoutsBySection(section.id, nextLayout, current));
                        }
                      }}
                      onResize={(nextLayout) => {
                        if (usingCompactGrid) {
                          setCompactGridLayoutBySection((current) => nextLayoutsBySection(section.id, nextLayout, current));
                        } else {
                          setGridLayoutBySection((current) => nextLayoutsBySection(section.id, nextLayout, current));
                        }
                      }}
                      onResizeStop={(nextLayout) => {
                        if (usingCompactGrid) {
                          setCompactGridLayoutBySection((current) => nextLayoutsBySection(section.id, nextLayout, current));
                        } else {
                          const nextLayouts = nextLayoutsBySection(section.id, nextLayout, gridLayoutBySection);
                          setGridLayoutBySection(nextLayouts);
                          void saveGridLayouts(nextLayouts);
                        }
                      }}
                    >
                      {widgets.map((widget) => {
                        const range = rangeByWidget[widget.id] ?? normalizeRange(widget.defaultTimeRange);
	                        const values = widgetValues(widget.pointBindings, liveValues, fallbackLiveValues);
	                        const loading = Boolean(loadingWidgets[widget.id]);
	                        const layoutItem = layout.find((item) => item.i === widget.id);
	                        const placementMode = placementWidgetId === widget.id && canEditCanonicalLayout;
	                        return (
	                          <div key={widget.id}>
	                            <DashboardPanel
	                              widget={widget}
	                              subtitle={widgetSubtitle(widget, range)}
	                              loading={loading}
                              saving={savingLayout}
                              layoutEditing={canEditCanonicalLayout}
                              placementMode={placementMode}
                              {...(canEditCanonicalLayout && layoutItem ? { sizeLabel: `${layoutItem.w} x ${layoutItem.h}` } : {})}
                              onNativeDragStart={handleNativeDragStart}
                              onNativeDragOver={handleNativeDragOver}
                              onNativeDrop={(targetId) => handleNativeDrop(section.id, targetId)}
                              onNativeDragEnd={handleNativeDragEnd}
                              onDragInteractionStart={handleDragInteractionStart}
                              onPlacementSettled={(targetId) => {
                                setPlacementWidgetId((current) => (current === targetId ? null : current));
                              }}
                              onRename={(targetId) => { handleRenameWidget(targetId); }}
	                              onInlineRename={(targetId, title) => { void handleInlineWidgetTitle(targetId, title); }}
	                              onEditNote={(targetId) => { openEditNoteEditor(targetId); }}
                              onDuplicate={(targetId) => { void handleDuplicateWidget(targetId); }}
                              onMoveToSection={(targetId) => { void handleMoveWidgetToSection(targetId); }}
                              onCopyToDashboard={(targetId) => { void handleCopyWidgetToDashboard(targetId); }}
                              onResetSize={(targetId) => { void handleWidgetSizeAction(targetId, "reset"); }}
                              onFitToContent={(targetId) => { void handleWidgetSizeAction(targetId, "fit"); }}
                              onRemove={(targetId) => { void handleRemoveWidget(targetId); }}
	                            >
                              {widget.kind === "note" ? (
	                                <NoteWidget
	                                  widget={widget}
	                                  saving={savingLayout}
	                                  placementMode={placementMode}
	                                  onContentCommit={(targetId, content) => { void handleInlineNoteContent(targetId, content); }}
	                                />
                              ) : widget.kind === "live_value_grid" ? (
                                <LiveValueGridWidget values={values} />
                              ) : widget.kind === "stat_value" ? (
                                <StatValueWidget values={values} historySeries={chartSeriesByWidget[widget.id] ?? []} />
                              ) : widget.kind === "bar_comparison" ? (
                                <BarComparisonWidget values={values} />
                              ) : (
                                <TimeSeriesWidget
                                  series={chartSeriesByWidget[widget.id] ?? []}
                                  range={range}
                                  loading={loading}
                                  onRangeChange={(nextRange) => setRangeByWidget((current) => ({ ...current, [widget.id]: nextRange }))}
                                  onRefresh={() => setRefreshByWidget((current) => ({ ...current, [widget.id]: (current[widget.id] ?? 0) + 1 }))}
                                />
                              )}
                            </DashboardPanel>
                          </div>
                        );
                      })}
                    </GridLayout>
                  </div>
                )}
              </section>
            ))
          ) : null}
        </div>
      )}
    </section>
  );
}
