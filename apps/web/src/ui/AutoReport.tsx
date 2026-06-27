import { useEffect, useMemo, useState } from "react";
import type { DashboardPointBinding, DashboardRecord } from "../api";
import {
  queryBmsDashboardLatestBatch,
  type BmsCollectorPoint,
  type BmsDashboardLatestBatchQuery
} from "../bmsCollectorClient";
import { Badge, EmptyState, Surface } from "./primitives";

type ReportPeriod = "shift" | "day" | "week" | "month";
type ReportAudience = "operations" | "management" | "vendor";
type ReportFormat = "web" | "pdf";

interface AutoReportProps {
  token: string;
  projectId: string;
  projectName: string;
  dashboards: DashboardRecord[];
  onOpenDashboard?: (dashboardId: string) => void;
}

interface LatestSnapshot {
  byKey: Record<string, BmsCollectorPoint>;
  missingKeys: string[];
  generatedAt: string;
}

const HKT_TIME_ZONE = "Asia/Hong_Kong";
const STALE_VALUE_MS = 2 * 60 * 60 * 1000;

const REPORT_PERIODS: Array<{ key: ReportPeriod; label: string; hours: number }> = [
  { key: "shift", label: "Shift", hours: 8 },
  { key: "day", label: "Daily", hours: 24 },
  { key: "week", label: "Weekly", hours: 24 * 7 },
  { key: "month", label: "Monthly", hours: 24 * 30 }
];

const REPORT_AUDIENCES: Array<{ key: ReportAudience; label: string }> = [
  { key: "operations", label: "Operations" },
  { key: "management", label: "Management" },
  { key: "vendor", label: "Vendor" }
];

const WIDGET_KIND_LABELS: Record<DashboardRecord["widgets"][number]["kind"], string> = {
  live_value_grid: "Live values",
  timeseries_chart: "Trend",
  stat_value: "KPI",
  bar_comparison: "Comparison",
  note: "Operator note"
};

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

function formatAge(value: string | null | undefined, generatedAt: string): string {
  if (!value) return "No latest value";
  const updated = Date.parse(value);
  const generated = Date.parse(generatedAt);
  if (!Number.isFinite(updated) || !Number.isFinite(generated)) return "Unknown age";
  const minutes = Math.max(0, Math.round((generated - updated) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function pointDisplayName(binding: DashboardPointBinding): string {
  return binding.label || binding.pointName || binding.objectRef || [binding.entityId, binding.metricKey].filter(Boolean).join(" ") || binding.metricInstanceId || "Point";
}

function bindingIsDerivedMetric(binding: DashboardPointBinding): boolean {
  return binding.source === "derived_metric" || Boolean(binding.metricInstanceId || binding.metricKey || binding.entityId);
}

function pointKey(binding: DashboardPointBinding): string {
  if (bindingIsDerivedMetric(binding)) {
    if (binding.metricInstanceId) return `derived:${binding.metricInstanceId}`;
    if (binding.metricKey && binding.entityId) return `derived:${binding.entityId}:${binding.metricKey}`;
  }
  return binding.pointName || binding.objectRef || "";
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

function uniquePointBindings(dashboards: DashboardRecord[]): DashboardPointBinding[] {
  const seen = new Set<string>();
  const bindings: DashboardPointBinding[] = [];
  for (const dashboard of dashboards) {
    for (const widget of dashboard.widgets) {
      for (const binding of widget.pointBindings) {
        const key = pointKey(binding);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        bindings.push(binding);
      }
    }
  }
  return bindings;
}

function pointStatus(binding: DashboardPointBinding, snapshot: LatestSnapshot | null): "ready" | "missing" | "stale" {
  if (!snapshot) return "missing";
  const point = snapshot.byKey[pointKey(binding)];
  if (!point?.last_polled_at) return "missing";
  const updatedAt = Date.parse(point.last_polled_at);
  const generatedAt = Date.parse(snapshot.generatedAt);
  if (Number.isFinite(updatedAt) && Number.isFinite(generatedAt) && generatedAt - updatedAt > STALE_VALUE_MS) {
    return "stale";
  }
  return "ready";
}

function pointValue(binding: DashboardPointBinding, snapshot: LatestSnapshot | null): string {
  const point = snapshot?.byKey[pointKey(binding)];
  const raw = point?.last_value ?? "";
  const numeric = Number(raw);
  const value = Number.isFinite(numeric) ? numeric.toFixed(1) : raw;
  if (!value) return "--";
  return `${value}${binding.unit ? ` ${binding.unit}` : ""}`;
}

function reportTitleFor(projectName: string, period: ReportPeriod): string {
  const label = REPORT_PERIODS.find((entry) => entry.key === period)?.label ?? "Operations";
  return `${projectName} ${label} Operations Report`;
}

function selectedDashboardSummary(dashboards: DashboardRecord[]) {
  const pointBindings = uniquePointBindings(dashboards);
  const notes = dashboards.flatMap((dashboard) => dashboard.widgets.filter((widget) => widget.kind === "note"));
  const trendCount = dashboards.flatMap((dashboard) => dashboard.widgets).filter((widget) => widget.kind === "timeseries_chart").length;
  const comparisonCount = dashboards.flatMap((dashboard) => dashboard.widgets).filter((widget) => widget.kind === "bar_comparison").length;
  return {
    pointCount: pointBindings.length,
    notesCount: notes.length,
    trendCount,
    comparisonCount
  };
}

function statusTone(status: ReturnType<typeof pointStatus>) {
  if (status === "ready") return "success";
  if (status === "stale") return "warning";
  return "danger";
}

export function AutoReport({ token, projectId, projectName, dashboards, onOpenDashboard }: AutoReportProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => dashboards.map((dashboard) => dashboard.id));
  const [period, setPeriod] = useState<ReportPeriod>("day");
  const [audience, setAudience] = useState<ReportAudience>("operations");
  const [format, setFormat] = useState<ReportFormat>("web");
  const [operatorNote, setOperatorNote] = useState("");
  const [snapshot, setSnapshot] = useState<LatestSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSelectedIds((current) => {
      const availableIds = new Set(dashboards.map((dashboard) => dashboard.id));
      const kept = current.filter((id) => availableIds.has(id));
      if (kept.length > 0 || dashboards.length === 0) return kept;
      return dashboards.map((dashboard) => dashboard.id);
    });
  }, [dashboards]);

  const selectedDashboards = useMemo(
    () => dashboards.filter((dashboard) => selectedIds.includes(dashboard.id)),
    [dashboards, selectedIds]
  );
  const summary = useMemo(() => selectedDashboardSummary(selectedDashboards), [selectedDashboards]);
  const reportTitle = reportTitleFor(projectName, period);
  const generatedAt = snapshot?.generatedAt ?? new Date().toISOString();
  const missingCount = snapshot ? snapshot.missingKeys.length : summary.pointCount;
  const staleCount = snapshot
    ? uniquePointBindings(selectedDashboards).filter((binding) => pointStatus(binding, snapshot) === "stale").length
    : 0;

  function toggleDashboard(dashboardId: string) {
    setSelectedIds((current) => (
      current.includes(dashboardId)
        ? current.filter((id) => id !== dashboardId)
        : [...current, dashboardId]
    ));
    setSnapshot(null);
  }

  async function generateReport(nextFormat: ReportFormat = format) {
    if (selectedDashboards.length === 0) {
      setError("Select at least one dashboard.");
      return;
    }

    setFormat(nextFormat);
    setLoading(true);
    setError("");
    const bindings = uniquePointBindings(selectedDashboards);
    const queries = bindings
      .map((binding) => latestQueryForBinding(binding, pointKey(binding)))
      .filter((query): query is BmsDashboardLatestBatchQuery => Boolean(query));
    const latestByKey: Record<string, BmsCollectorPoint> = {};
    const missingKeys: string[] = [];

    try {
      for (let index = 0; index < queries.length; index += 64) {
        const batch = await queryBmsDashboardLatestBatch(token, queries.slice(index, index + 64));
        for (const result of batch.results) {
          if (result.ok && result.point) {
            latestByKey[result.key] = { ...result.point, name: result.key };
          } else {
            missingKeys.push(result.key);
          }
        }
      }
      for (const binding of bindings) {
        const key = pointKey(binding);
        if (key && !latestByKey[key] && !missingKeys.includes(key)) {
          missingKeys.push(key);
        }
      }
      setSnapshot({ byKey: latestByKey, missingKeys, generatedAt: new Date().toISOString() });
      if (nextFormat === "pdf") {
        window.setTimeout(() => window.print(), 80);
      }
    } catch {
      setError("Latest values could not be loaded. The report can still be generated from dashboard definitions.");
      setSnapshot({ byKey: {}, missingKeys: bindings.map(pointKey).filter(Boolean), generatedAt: new Date().toISOString() });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="autoreport-page" aria-labelledby="autoreport-title">
      <header className="autoreport-header">
        <div>
          <span className="autoreport-eyebrow">Auto Report</span>
          <h2 id="autoreport-title">{reportTitle}</h2>
          <p>{projectId} · {formatHktDateTime(generatedAt)} HKT</p>
        </div>
        <div className="autoreport-header-actions">
          <button type="button" className="dashboard-widget-icon-button" onClick={() => { void generateReport("web"); }} disabled={loading || selectedDashboards.length === 0}>
            {loading && format === "web" ? "Generating" : "Generate web"}
          </button>
          <button type="button" className="dashboard-widget-icon-button is-primary" onClick={() => { void generateReport("pdf"); }} disabled={loading || selectedDashboards.length === 0}>
            {loading && format === "pdf" ? "Preparing" : "Save PDF"}
          </button>
        </div>
      </header>

      <div className="autoreport-builder-layout">
        <aside className="autoreport-builder" aria-label="Report builder">
          <div className="autoreport-control-group">
            <div className="autoreport-control-head">
              <strong>Period</strong>
              <span>{REPORT_PERIODS.find((entry) => entry.key === period)?.hours}h</span>
            </div>
            <div className="autoreport-segmented" aria-label="Report period">
              {REPORT_PERIODS.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className={period === entry.key ? "is-active" : ""}
                  onClick={() => {
                    setPeriod(entry.key);
                    setSnapshot(null);
                  }}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>

          <label className="autoreport-field">
            <span>Audience</span>
            <select value={audience} onChange={(event) => setAudience(event.target.value as ReportAudience)}>
              {REPORT_AUDIENCES.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
            </select>
          </label>

          <label className="autoreport-field">
            <span>Operator note</span>
            <textarea value={operatorNote} onChange={(event) => setOperatorNote(event.target.value)} rows={5} maxLength={900} />
          </label>

          <div className="autoreport-control-group">
            <div className="autoreport-control-head">
              <strong>Dashboards</strong>
              <span>{selectedDashboards.length}/{dashboards.length}</span>
            </div>
            <div className="autoreport-bulk-actions">
              <button type="button" onClick={() => setSelectedIds(dashboards.map((dashboard) => dashboard.id))}>All</button>
              <button type="button" onClick={() => setSelectedIds([])}>None</button>
            </div>
            {dashboards.length === 0 ? (
              <p className="autoreport-muted">No dashboards available.</p>
            ) : (
              <ul className="autoreport-dashboard-picker" aria-label="Dashboards for report">
                {dashboards.map((dashboard) => (
                  <li key={dashboard.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(dashboard.id)}
                        onChange={() => toggleDashboard(dashboard.id)}
                      />
                      <span>
                        <strong>{dashboard.title}</strong>
                        <small>{dashboard.widgets.length} widgets · {dashboard.visibility === "project" ? "Shared" : "Private"}</small>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <main className="autoreport-preview" aria-label="Generated report preview">
          {error ? <p className="autoreport-error" role="alert">{error}</p> : null}
          {selectedDashboards.length === 0 ? (
            <Surface className="autoreport-empty">
              <EmptyState title="No dashboards selected">Select dashboard rows to build a report.</EmptyState>
            </Surface>
          ) : (
            <article className="autoreport-document">
              <header className="autoreport-document-cover">
                <div>
                  <span>{audience}</span>
                  <h3>{reportTitle}</h3>
                  <p>{formatHktDateTime(generatedAt)} HKT</p>
                </div>
                <Badge tone={snapshot ? "success" : "warning"}>{snapshot ? "Generated" : "Draft"}</Badge>
              </header>

              <section className="autoreport-metrics" aria-label="Report metrics">
                <div><span>Dashboards</span><strong>{selectedDashboards.length}</strong></div>
                <div><span>Points</span><strong>{summary.pointCount}</strong></div>
                <div><span>Trends</span><strong>{summary.trendCount}</strong></div>
                <div><span>Missing latest</span><strong>{missingCount}</strong></div>
                <div><span>Stale values</span><strong>{staleCount}</strong></div>
                <div><span>Notes</span><strong>{summary.notesCount}</strong></div>
              </section>

              <section className="autoreport-section">
                <h4>Operations Summary</h4>
                <ul className="autoreport-priority-list">
                  {missingCount > 0 ? <li>{missingCount} point{missingCount === 1 ? "" : "s"} need latest-value attention.</li> : null}
                  {staleCount > 0 ? <li>{staleCount} point{staleCount === 1 ? "" : "s"} have not refreshed within two hours.</li> : null}
                  {summary.trendCount > 0 ? <li>{summary.trendCount} trend panel{summary.trendCount === 1 ? "" : "s"} are included for operating context.</li> : null}
                  {summary.comparisonCount > 0 ? <li>{summary.comparisonCount} comparison panel{summary.comparisonCount === 1 ? "" : "s"} support equipment-to-equipment review.</li> : null}
                  {missingCount === 0 && staleCount === 0 ? <li>Latest-value coverage is ready for the selected dashboards.</li> : null}
                </ul>
                {operatorNote.trim() ? <p className="autoreport-operator-note">{operatorNote.trim()}</p> : null}
              </section>

              <section className="autoreport-section">
                <h4>Dashboard Review</h4>
                <div className="autoreport-dashboard-review">
                  {selectedDashboards.map((dashboard) => {
                    const bindings = uniquePointBindings([dashboard]);
                    const noteWidgets = dashboard.widgets.filter((widget) => widget.kind === "note");
                    const readyPoints = bindings.filter((binding) => pointStatus(binding, snapshot) === "ready").length;
                    return (
                      <section key={dashboard.id} className="autoreport-dashboard-summary">
                        <div className="autoreport-dashboard-summary-head">
                          <div>
                            <strong>{dashboard.title}</strong>
                            <span>{dashboard.description || "Operations dashboard"}</span>
                          </div>
                          <button type="button" onClick={() => onOpenDashboard?.(dashboard.id)}>Open</button>
                        </div>
                        <div className="autoreport-dashboard-facts">
                          <span>{dashboard.widgets.length} widgets</span>
                          <span>{readyPoints}/{bindings.length} points ready</span>
                          <span>{dashboard.visibility === "project" ? "Shared" : "Private"}</span>
                        </div>
                        <div className="autoreport-widget-kind-list">
                          {dashboard.widgets.map((widget) => (
                            <span key={widget.id}>{WIDGET_KIND_LABELS[widget.kind]} · {widget.title}</span>
                          ))}
                        </div>
                        {noteWidgets.length > 0 ? (
                          <div className="autoreport-note-list">
                            {noteWidgets.map((widget) => (
                              <blockquote key={widget.id}>{widget.content || widget.title}</blockquote>
                            ))}
                          </div>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              </section>

              <section className="autoreport-section">
                <h4>Point Snapshot</h4>
                <div className="autoreport-point-table" role="table" aria-label="Report point snapshot">
                  <div role="row" className="autoreport-point-head">
                    <span role="columnheader">Point</span>
                    <span role="columnheader">Value</span>
                    <span role="columnheader">Updated</span>
                    <span role="columnheader">Status</span>
                  </div>
                  {uniquePointBindings(selectedDashboards).map((binding) => {
                    const key = pointKey(binding);
                    const point = snapshot?.byKey[key];
                    const status = pointStatus(binding, snapshot);
                    return (
                      <div role="row" className="autoreport-point-row" key={key || pointDisplayName(binding)}>
                        <span role="cell">{pointDisplayName(binding)}</span>
                        <span role="cell">{pointValue(binding, snapshot)}</span>
                        <span role="cell">{point?.last_polled_at ? `${formatHktDateTime(point.last_polled_at)} HKT · ${formatAge(point.last_polled_at, generatedAt)}` : "No latest value"}</span>
                        <span role="cell"><Badge tone={statusTone(status)}>{status}</Badge></span>
                      </div>
                    );
                  })}
                </div>
              </section>
            </article>
          )}
        </main>
      </div>
    </section>
  );
}
