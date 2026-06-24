export type DashboardVisibility = "private" | "project";
export type DashboardWidgetKind = "live_value_grid" | "timeseries_chart";

export interface DashboardPointBinding {
  id?: string;
  pointName?: string;
  objectRef?: string;
  label?: string;
  role?: "supply" | "return" | "other";
  unit?: string;
}

export interface DashboardWidgetBase {
  id: string;
  kind: DashboardWidgetKind;
  title: string;
  pointBindings: DashboardPointBinding[];
}

export interface LiveValueGridWidget extends DashboardWidgetBase {
  kind: "live_value_grid";
}

export interface TimeseriesChartWidget extends DashboardWidgetBase {
  kind: "timeseries_chart";
  defaultTimeRange?: string;
}

export type DashboardWidget = LiveValueGridWidget | TimeseriesChartWidget;

export interface DashboardLayoutItem {
  widgetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardRecord {
  id: string;
  projectId: string;
  ownerUserId: string;
  visibility: DashboardVisibility;
  title: string;
  description?: string;
  layout: DashboardLayoutItem[];
  widgets: DashboardWidget[];
  createdAt: string;
  updatedAt: string;
  sourceConversationId?: string;
}

export interface DashboardMutationInput {
  title: string;
  description?: string;
  visibility?: DashboardVisibility;
  layout: DashboardLayoutItem[];
  widgets: DashboardWidget[];
  sourceConversationId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function sanitizeBinding(value: unknown): DashboardPointBinding | null {
  if (!isRecord(value)) return null;
  const pointName = asString(value.pointName)?.trim();
  const objectRef = asString(value.objectRef)?.trim();
  if (!pointName && !objectRef) return null;
  const role = asString(value.role);
  const normalizedRole = role === "supply" || role === "return" || role === "other" ? role : undefined;
  return {
    ...(asString(value.id)?.trim() ? { id: asString(value.id)!.trim() } : {}),
    ...(pointName ? { pointName } : {}),
    ...(objectRef ? { objectRef } : {}),
    ...(asString(value.label)?.trim() ? { label: asString(value.label)!.trim() } : {}),
    ...(normalizedRole ? { role: normalizedRole } : {}),
    ...(asString(value.unit)?.trim() ? { unit: asString(value.unit)!.trim() } : {})
  };
}

function sanitizeWidget(value: unknown): DashboardWidget | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id)?.trim();
  const kind = asString(value.kind);
  const title = asString(value.title)?.trim();
  const pointBindings = Array.isArray(value.pointBindings)
    ? value.pointBindings.map((entry) => sanitizeBinding(entry)).filter((entry): entry is DashboardPointBinding => entry !== null)
    : [];

  if (!id || !title || pointBindings.length === 0) return null;
  if (kind === "live_value_grid") {
    return { id, kind, title, pointBindings };
  }
  if (kind === "timeseries_chart") {
    return {
      id,
      kind,
      title,
      pointBindings,
      ...(asString(value.defaultTimeRange)?.trim() ? { defaultTimeRange: asString(value.defaultTimeRange)!.trim() } : {})
    };
  }
  return null;
}

function sanitizeLayoutItem(value: unknown): DashboardLayoutItem | null {
  if (!isRecord(value)) return null;
  const widgetId = asString(value.widgetId)?.trim();
  const x = typeof value.x === "number" ? Math.trunc(value.x) : NaN;
  const y = typeof value.y === "number" ? Math.trunc(value.y) : NaN;
  const w = typeof value.w === "number" ? Math.trunc(value.w) : NaN;
  const h = typeof value.h === "number" ? Math.trunc(value.h) : NaN;
  if (!widgetId || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
  if (x < 0 || y < 0 || w < 1 || h < 1 || w > 3 || h > 3 || x + w > 3) return null;
  return { widgetId, x, y, w, h };
}

export function parseDashboardMutationInput(value: unknown): DashboardMutationInput | { error: string } {
  if (!isRecord(value)) {
    return { error: "Dashboard payload must be an object." };
  }
  const title = asString(value.title)?.trim() ?? "";
  if (!title || title.length > 120) {
    return { error: "Dashboard title must be 1-120 characters." };
  }
  const description = asString(value.description)?.trim();
  if (description && description.length > 1000) {
    return { error: "Dashboard description must be at most 1000 characters." };
  }
  const visibility = asString(value.visibility);
  if (visibility !== undefined && visibility !== "private" && visibility !== "project") {
    return { error: "Dashboard visibility must be private or project." };
  }
  if (!Array.isArray(value.widgets) || value.widgets.length === 0) {
    return { error: "Dashboard widgets must be a non-empty array." };
  }
  if (!Array.isArray(value.layout) || value.layout.length === 0) {
    return { error: "Dashboard layout must be a non-empty array." };
  }

  const widgets = value.widgets.map((entry) => sanitizeWidget(entry)).filter((entry): entry is DashboardWidget => entry !== null);
  const layout = value.layout.map((entry) => sanitizeLayoutItem(entry)).filter((entry): entry is DashboardLayoutItem => entry !== null);

  if (widgets.length !== value.widgets.length) {
    return { error: "Dashboard widgets contain invalid entries." };
  }
  if (layout.length !== value.layout.length) {
    return { error: "Dashboard layout contains invalid entries." };
  }

  const widgetIds = new Set<string>();
  for (const widget of widgets) {
    if (widgetIds.has(widget.id)) {
      return { error: "Dashboard widget ids must be unique." };
    }
    widgetIds.add(widget.id);
  }

  const layoutIds = new Set<string>();
  for (const item of layout) {
    if (!widgetIds.has(item.widgetId)) {
      return { error: `Layout references unknown widget: ${item.widgetId}` };
    }
    if (layoutIds.has(item.widgetId)) {
      return { error: `Layout contains duplicate widget placement: ${item.widgetId}` };
    }
    layoutIds.add(item.widgetId);
  }

  for (const widget of widgets) {
    if (!layoutIds.has(widget.id)) {
      return { error: `Widget missing layout placement: ${widget.id}` };
    }
  }

  return {
    title,
    ...(description ? { description } : {}),
    ...(visibility ? { visibility } : {}),
    layout,
    widgets,
    ...(asString(value.sourceConversationId)?.trim() ? { sourceConversationId: asString(value.sourceConversationId)!.trim() } : {})
  };
}

export function canReadDashboard(dashboard: DashboardRecord, userId: string): boolean {
  return dashboard.ownerUserId === userId || dashboard.visibility === "project";
}

export function canManageDashboard(dashboard: DashboardRecord, userId: string, canConfigure: boolean): boolean {
  if (dashboard.ownerUserId === userId) {
    return true;
  }
  return canConfigure && dashboard.visibility === "project";
}

export function dashboardPath(projectId: string, dashboardId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/dashboards/${encodeURIComponent(dashboardId)}`;
}
