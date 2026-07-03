import { useEffect, useMemo, useState } from "react";
import type { DashboardPointBinding, DashboardRecord } from "../api";
import {
  queryBmsDashboardHistoryBatch,
  queryBmsDashboardLatestBatch,
  type BmsCollectorPoint,
  type BmsCollectorTimeseriesRow,
  type BmsDashboardHistoryBatchQuery,
  type BmsDashboardLatestBatchQuery
} from "../bmsCollectorClient";
import { Badge, EmptyState, Surface } from "./primitives";

type ReportType = "daily_handover" | "management_summary" | "fault_review";
type ReportFormat = "web" | "pdf";
type LanguageMode = "bilingual";

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

interface HistoryEvidence {
  key: string;
  count: number;
  min: number | null;
  max: number | null;
  avg: number | null;
  firstAt?: string;
  lastAt?: string;
}

interface ReportSnapshot {
  latest: LatestSnapshot;
  historyByKey: Record<string, HistoryEvidence>;
}

interface EditableReportFields {
  zhSummary: string;
  enSummary: string;
  operatorNotes: string;
  verificationNotes: string;
}

interface ReportTemplate {
  id: ReportType;
  zhTitle: string;
  enTitle: string;
  zhIntent: string;
  enIntent: string;
  evidenceWindowHours: number;
  zhPrimarySection: string;
  enPrimarySection: string;
  zhExceptionsTitle: string;
  enExceptionsTitle: string;
  zhEvidenceTitle: string;
  enEvidenceTitle: string;
}

const HKT_TIME_ZONE = "Asia/Hong_Kong";
const STALE_VALUE_MS = 2 * 60 * 60 * 1000;

const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: "daily_handover",
    zhTitle: "每日交班报告",
    enTitle: "Daily Handover Report",
    zhIntent: "面向值班工程师，聚焦过去 8-24 小时的异常、缺数、舒适/设备关注点和下一班需要留意的事项。",
    enIntent: "For shift engineers: exceptions, missing data, comfort/equipment watchlist, and next-shift focus.",
    evidenceWindowHours: 24,
    zhPrimarySection: "交班摘要",
    enPrimarySection: "Shift Summary",
    zhExceptionsTitle: "异常、风险与数据质量",
    enExceptionsTitle: "Exceptions, Risks, And Data Quality",
    zhEvidenceTitle: "运维证据",
    enEvidenceTitle: "Operations Evidence"
  },
  {
    id: "management_summary",
    zhTitle: "周/月管理汇报",
    enTitle: "Weekly / Monthly Management Summary",
    zhIntent: "面向物业、业主和管理层，聚焦 KPI 趋势、能效表现、未解决风险和 dashboard 覆盖情况。",
    enIntent: "For managers and owners: KPI trends, energy/performance highlights, unresolved risks, and dashboard coverage.",
    evidenceWindowHours: 24 * 7,
    zhPrimarySection: "管理摘要",
    enPrimarySection: "Management Summary",
    zhExceptionsTitle: "未解决风险与管理关注点",
    enExceptionsTitle: "Open Risks And Management Attention",
    zhEvidenceTitle: "KPI 与趋势证据",
    enEvidenceTitle: "KPI And Trend Evidence"
  },
  {
    id: "fault_review",
    zhTitle: "故障/问题复盘",
    enTitle: "Fault / Issue Review",
    zhIntent: "面向运维团队和维保承包商，聚焦受影响设备、点位证据、观察记录和处置后的验证说明。",
    enIntent: "For operators and contractors: affected equipment, point evidence, observations, and verification notes.",
    evidenceWindowHours: 48,
    zhPrimarySection: "问题复盘摘要",
    enPrimarySection: "Issue Review Summary",
    zhExceptionsTitle: "问题证据与风险",
    enExceptionsTitle: "Issue Evidence And Risk",
    zhEvidenceTitle: "时间窗口证据",
    enEvidenceTitle: "Evidence Window"
  }
];

const WIDGET_KIND_LABELS: Record<DashboardRecord["widgets"][number]["kind"], { zh: string; en: string }> = {
  live_value_grid: { zh: "实时值", en: "Live values" },
  timeseries_chart: { zh: "趋势", en: "Trend" },
  stat_value: { zh: "KPI", en: "KPI" },
  bar_comparison: { zh: "对比", en: "Comparison" },
  note: { zh: "运维备注", en: "Operator note" }
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

function pointSourceLabel(binding: DashboardPointBinding): string {
  return bindingIsDerivedMetric(binding) ? "Derived metric" : "BMS";
}

function pointTechnicalName(binding: DashboardPointBinding): string {
  if (bindingIsDerivedMetric(binding)) {
    if (binding.metricInstanceId) return binding.metricInstanceId;
    return [binding.entityId, binding.metricKey].filter(Boolean).join(" / ") || "derived metric";
  }
  return [binding.pointName, binding.objectRef].filter((value, index, values) => value && values.indexOf(value) === index).join(" · ") || "BMS point";
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

function historyQueryForBinding(binding: DashboardPointBinding, key: string, from: string, to: string, limit: string): BmsDashboardHistoryBatchQuery | null {
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
    limit,
    order: "asc"
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

function numericRows(rows: BmsCollectorTimeseriesRow[]): Array<{ ts: string; value: number }> {
  return rows
    .map((row) => {
      const numeric = typeof row.value_num === "number" && Number.isFinite(row.value_num)
        ? row.value_num
        : Number(row.value ?? row.value_text ?? "");
      return Number.isFinite(numeric) ? { ts: row.ts, value: numeric } : null;
    })
    .filter((entry): entry is { ts: string; value: number } => entry !== null);
}

function evidenceFromRows(key: string, rows: BmsCollectorTimeseriesRow[]): HistoryEvidence {
  const values = numericRows(rows);
  if (values.length === 0) {
    return { key, count: 0, min: null, max: null, avg: null };
  }
  const sum = values.reduce((total, row) => total + row.value, 0);
  return {
    key,
    count: values.length,
    min: Math.min(...values.map((row) => row.value)),
    max: Math.max(...values.map((row) => row.value)),
    avg: sum / values.length,
    ...(values[0]?.ts ? { firstAt: values[0].ts } : {}),
    ...(values.at(-1)?.ts ? { lastAt: values.at(-1)!.ts } : {})
  };
}

function pointStatus(binding: DashboardPointBinding, snapshot: ReportSnapshot | null): "ready" | "missing" | "stale" {
  if (!snapshot) return "missing";
  const point = snapshot.latest.byKey[pointKey(binding)];
  if (!point?.last_polled_at) return "missing";
  const updatedAt = Date.parse(point.last_polled_at);
  const generatedAt = Date.parse(snapshot.latest.generatedAt);
  if (Number.isFinite(updatedAt) && Number.isFinite(generatedAt) && generatedAt - updatedAt > STALE_VALUE_MS) {
    return "stale";
  }
  return "ready";
}

function pointValue(binding: DashboardPointBinding, snapshot: ReportSnapshot | null): string {
  const point = snapshot?.latest.byKey[pointKey(binding)];
  const raw = point?.last_value ?? "";
  const numeric = Number(raw);
  const value = Number.isFinite(numeric) ? numeric.toFixed(1) : raw;
  if (!value) return "--";
  return `${value}${binding.unit ? ` ${binding.unit}` : ""}`;
}

function formatNumber(value: number | null, unit = ""): string {
  if (value === null || !Number.isFinite(value)) return "--";
  return `${value.toFixed(1)}${unit ? ` ${unit}` : ""}`;
}

function selectedDashboardSummary(dashboards: DashboardRecord[]) {
  const pointBindings = uniquePointBindings(dashboards);
  const widgets = dashboards.flatMap((dashboard) => dashboard.widgets);
  return {
    pointCount: pointBindings.length,
    noteCount: widgets.filter((widget) => widget.kind === "note").length,
    trendCount: widgets.filter((widget) => widget.kind === "timeseries_chart").length,
    comparisonCount: widgets.filter((widget) => widget.kind === "bar_comparison").length,
    kpiCount: widgets.filter((widget) => widget.kind === "stat_value").length
  };
}

function statusTone(status: ReturnType<typeof pointStatus>) {
  if (status === "ready") return "success";
  if (status === "stale") return "warning";
  return "danger";
}

function statusLabel(status: ReturnType<typeof pointStatus>): string {
  if (status === "ready") return "正常 / ready";
  if (status === "stale") return "过期 / stale";
  return "缺失 / missing";
}

function templateFor(reportType: ReportType): ReportTemplate {
  return REPORT_TEMPLATES.find((template) => template.id === reportType) ?? REPORT_TEMPLATES[0]!;
}

function defaultFields(template: ReportTemplate, projectName: string, dashboards: DashboardRecord[]): EditableReportFields {
  const dashboardNames = dashboards.map((dashboard) => dashboard.title).join(", ") || "selected dashboards";
  if (template.id === "management_summary") {
    return {
      zhSummary: `${projectName} 本期管理汇报基于 ${dashboardNames}。请结合 KPI 趋势、数据质量和未解决风险判断后续资源投入。`,
      enSummary: `${projectName} management summary is based on ${dashboardNames}. Review KPI trends, data quality, and unresolved risks before assigning resources.`,
      operatorNotes: "",
      verificationNotes: ""
    };
  }
  if (template.id === "fault_review") {
    return {
      zhSummary: `${projectName} 本次问题复盘基于 ${dashboardNames}。以下内容仅使用 dashboard 与 BMS/derived metric 证据，不代表已创建工单或报警记录。`,
      enSummary: `${projectName} issue review is based on ${dashboardNames}. Evidence comes only from dashboards and BMS/derived metrics; no work order or alarm record is implied.`,
      operatorNotes: "",
      verificationNotes: ""
    };
  }
  return {
    zhSummary: `${projectName} 今日交班报告基于 ${dashboardNames}。重点检查异常读数、过期/缺失数据、趋势证据和下一班需要关注的事项。`,
    enSummary: `${projectName} daily handover is based on ${dashboardNames}. Focus on abnormal readings, stale/missing data, trend evidence, and next-shift attention.`,
    operatorNotes: "",
    verificationNotes: ""
  };
}

function reportTitle(projectName: string, template: ReportTemplate): string {
  return `${projectName} ${template.zhTitle} / ${template.enTitle}`;
}

function dataQualityLines(bindings: DashboardPointBinding[], snapshot: ReportSnapshot | null): string[] {
  if (!snapshot) {
    return ["尚未读取 latest/history 证据；生成后会显示缺失或过期点位 / Latest/history evidence has not been loaded yet; generate the report to surface missing or stale points."];
  }
  const missing = bindings.filter((binding) => pointStatus(binding, snapshot) === "missing");
  const stale = bindings.filter((binding) => pointStatus(binding, snapshot) === "stale");
  const lines: string[] = [];
  if (missing.length > 0) {
    lines.push(`${missing.length} 个点位没有最新值 / ${missing.length} point${missing.length === 1 ? "" : "s"} have no latest value.`);
  }
  if (stale.length > 0) {
    lines.push(`${stale.length} 个点位超过 2 小时未刷新 / ${stale.length} point${stale.length === 1 ? "" : "s"} are stale for more than 2 hours.`);
  }
  if (lines.length === 0) {
    lines.push("所选 dashboard 的最新值覆盖正常 / Latest-value coverage is ready for the selected dashboards.");
  }
  return lines;
}

export function AutoReport({ token, projectId, projectName, dashboards, onOpenDashboard }: AutoReportProps) {
  const [reportType, setReportType] = useState<ReportType>("daily_handover");
  const [languageMode] = useState<LanguageMode>("bilingual");
  const [selectedIds, setSelectedIds] = useState<string[]>(() => dashboards.map((dashboard) => dashboard.id));
  const selectedDashboards = useMemo(
    () => dashboards.filter((dashboard) => selectedIds.includes(dashboard.id)),
    [dashboards, selectedIds]
  );
  const template = templateFor(reportType);
  const [format, setFormat] = useState<ReportFormat>("web");
  const [fields, setFields] = useState<EditableReportFields>(() => defaultFields(template, projectName, selectedDashboards));
  const [snapshot, setSnapshot] = useState<ReportSnapshot | null>(null);
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

  useEffect(() => {
    setFields((current) => ({
      ...defaultFields(template, projectName, selectedDashboards),
      operatorNotes: current.operatorNotes,
      verificationNotes: current.verificationNotes
    }));
    setSnapshot(null);
  }, [projectName, selectedDashboards, template]);

  const summary = useMemo(() => selectedDashboardSummary(selectedDashboards), [selectedDashboards]);
  const selectedBindings = useMemo(() => uniquePointBindings(selectedDashboards), [selectedDashboards]);
  const generatedAt = snapshot?.latest.generatedAt ?? new Date().toISOString();
  const missingCount = snapshot ? selectedBindings.filter((binding) => pointStatus(binding, snapshot) === "missing").length : 0;
  const staleCount = snapshot ? selectedBindings.filter((binding) => pointStatus(binding, snapshot) === "stale").length : 0;
  const readyCount = snapshot ? Math.max(0, selectedBindings.length - missingCount - staleCount) : 0;
  const historyEvidence = selectedBindings
    .map((binding) => ({ binding, evidence: snapshot?.historyByKey[pointKey(binding)] }))
    .filter((entry): entry is { binding: DashboardPointBinding; evidence: HistoryEvidence } => Boolean(entry.evidence));

  function toggleDashboard(dashboardId: string) {
    setSelectedIds((current) => (
      current.includes(dashboardId)
        ? current.filter((id) => id !== dashboardId)
        : [...current, dashboardId]
    ));
    setSnapshot(null);
  }

  function selectReportType(nextType: ReportType) {
    setReportType(nextType);
  }

  async function generateReport(nextFormat: ReportFormat = format) {
    if (selectedDashboards.length === 0) {
      setError("请至少选择一个 dashboard / Select at least one dashboard.");
      return;
    }

    setFormat(nextFormat);
    setLoading(true);
    setError("");
    const now = new Date();
    const from = new Date(now.getTime() - template.evidenceWindowHours * 60 * 60 * 1000);
    const latestQueries = selectedBindings
      .map((binding) => latestQueryForBinding(binding, pointKey(binding)))
      .filter((query): query is BmsDashboardLatestBatchQuery => Boolean(query));
    const historyQueries = selectedBindings
      .map((binding) => historyQueryForBinding(binding, pointKey(binding), from.toISOString(), now.toISOString(), template.evidenceWindowHours >= 24 * 7 ? "1200" : "720"))
      .filter((query): query is BmsDashboardHistoryBatchQuery => Boolean(query));
    const latestByKey: Record<string, BmsCollectorPoint> = {};
    const missingKeys: string[] = [];
    const historyByKey: Record<string, HistoryEvidence> = {};

    try {
      for (let index = 0; index < latestQueries.length; index += 64) {
        const batch = await queryBmsDashboardLatestBatch(token, latestQueries.slice(index, index + 64));
        for (const result of batch.results) {
          if (result.ok && result.point) {
            latestByKey[result.key] = { ...result.point, name: result.key };
          } else {
            missingKeys.push(result.key);
          }
        }
      }

      for (let index = 0; index < historyQueries.length; index += 32) {
        const batch = await queryBmsDashboardHistoryBatch(token, historyQueries.slice(index, index + 32));
        for (const result of batch.results) {
          if (!result.ok) continue;
          historyByKey[result.key] = evidenceFromRows(result.key, result.items);
        }
      }

      for (const binding of selectedBindings) {
        const key = pointKey(binding);
        if (key && !latestByKey[key] && !missingKeys.includes(key)) {
          missingKeys.push(key);
        }
      }
      setSnapshot({
        latest: { byKey: latestByKey, missingKeys, generatedAt: new Date().toISOString() },
        historyByKey
      });
      if (nextFormat === "pdf") {
        window.setTimeout(() => window.print(), 80);
      }
    } catch {
      setError("数据读取失败，报告将只显示 dashboard 定义和可编辑说明 / Evidence loading failed; the report shows dashboard definitions and editable notes only.");
      setSnapshot({
        latest: { byKey: {}, missingKeys: selectedBindings.map(pointKey).filter(Boolean), generatedAt: new Date().toISOString() },
        historyByKey: {}
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="autoreport-page" aria-labelledby="autoreport-title">
      <header className="autoreport-header">
        <div>
          <span className="autoreport-eyebrow">Auto Report · 双语运维报告工作台</span>
          <h2 id="autoreport-title">{reportTitle(projectName, template)}</h2>
          <p>{projectId} · {formatHktDateTime(generatedAt)} HKT · Evidence only, no fake alarm/work-order data</p>
        </div>
        <div className="autoreport-header-actions">
          <button type="button" className="dashboard-widget-icon-button" onClick={() => { void generateReport("web"); }} disabled={loading || selectedDashboards.length === 0}>
            {loading && format === "web" ? "生成中 / Generating" : "生成网页 / Generate web"}
          </button>
          <button type="button" className="dashboard-widget-icon-button is-primary" onClick={() => { void generateReport("pdf"); }} disabled={loading || selectedDashboards.length === 0}>
            {loading && format === "pdf" ? "准备中 / Preparing" : "保存 PDF / Save PDF"}
          </button>
        </div>
      </header>

      <div className="autoreport-builder-layout">
        <aside className="autoreport-builder" aria-label="Report workbench">
          <div className="autoreport-control-group">
            <div className="autoreport-control-head">
              <strong>1. 报告意图 / Report intent</strong>
              <span>固定双语 / {languageMode}</span>
            </div>
            <div className="autoreport-intent-grid" aria-label="Report type">
              {REPORT_TEMPLATES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={reportType === entry.id ? "is-active" : ""}
                  onClick={() => selectReportType(entry.id)}
                >
                  <strong>{entry.zhTitle}</strong>
                  <span>{entry.enTitle}</span>
                  <small lang="zh-Hans">{entry.zhIntent}</small>
                  <small lang="en">{entry.enIntent}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="autoreport-control-group">
            <div className="autoreport-control-head">
              <strong>2. Dashboards</strong>
              <span>{selectedDashboards.length}/{dashboards.length}</span>
            </div>
            <div className="autoreport-bulk-actions">
              <button type="button" onClick={() => { setSelectedIds(dashboards.map((dashboard) => dashboard.id)); setSnapshot(null); }}>全选 / All</button>
              <button type="button" onClick={() => { setSelectedIds([]); setSnapshot(null); }}>清空 / None</button>
            </div>
            {dashboards.length === 0 ? (
              <p className="autoreport-muted">当前项目没有 dashboard / No dashboards available.</p>
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

          <div className="autoreport-control-group">
            <div className="autoreport-control-head">
              <strong>3. 编辑摘要 / Edit narrative</strong>
              <span>可交班 / editable</span>
            </div>
            <label className="autoreport-field">
              <span>中文摘要</span>
              <textarea value={fields.zhSummary} onChange={(event) => setFields((current) => ({ ...current, zhSummary: event.target.value }))} rows={5} maxLength={1200} />
            </label>
            <label className="autoreport-field">
              <span>English summary</span>
              <textarea value={fields.enSummary} onChange={(event) => setFields((current) => ({ ...current, enSummary: event.target.value }))} rows={5} maxLength={1200} />
            </label>
            <label className="autoreport-field">
              <span>跟进备注 / Follow-up notes</span>
              <textarea value={fields.operatorNotes} onChange={(event) => setFields((current) => ({ ...current, operatorNotes: event.target.value }))} rows={4} maxLength={900} />
            </label>
            <label className="autoreport-field">
              <span>验证说明 / Verification notes</span>
              <textarea value={fields.verificationNotes} onChange={(event) => setFields((current) => ({ ...current, verificationNotes: event.target.value }))} rows={4} maxLength={900} />
            </label>
          </div>
        </aside>

        <main className="autoreport-preview" aria-label="Generated report preview">
          {error ? <p className="autoreport-error" role="alert">{error}</p> : null}
          {selectedDashboards.length === 0 ? (
            <Surface className="autoreport-empty">
              <EmptyState title="No dashboards selected">选择 dashboard 后才能生成报告 / Select dashboard rows to build a report.</EmptyState>
            </Surface>
          ) : (
            <article className="autoreport-document">
              <header className="autoreport-document-cover">
                <div>
                  <span>双语 / bilingual · {template.zhTitle}</span>
                  <h3>{reportTitle(projectName, template)}</h3>
                  <p>{formatHktDateTime(generatedAt)} HKT · {template.evidenceWindowHours}h evidence window</p>
                </div>
                <Badge tone={snapshot ? "success" : "warning"}>{snapshot ? "已生成 / Generated" : "草稿 / Draft"}</Badge>
              </header>

              <section className="autoreport-metrics" aria-label="Report metrics">
                <div><span>Dashboards</span><strong>{selectedDashboards.length}</strong></div>
                <div><span>Points</span><strong>{summary.pointCount}</strong></div>
                <div><span>Ready</span><strong>{readyCount}</strong></div>
                <div><span>Missing latest</span><strong>{missingCount}</strong></div>
                <div><span>Stale values</span><strong>{staleCount}</strong></div>
                <div><span>Trends / KPI</span><strong>{summary.trendCount + summary.kpiCount}</strong></div>
              </section>

              <section className="autoreport-section">
                <h4>{template.zhPrimarySection} / {template.enPrimarySection}</h4>
                <div className="autoreport-bilingual-summary">
                  <p lang="zh-Hans">{fields.zhSummary}</p>
                  <p lang="en">{fields.enSummary}</p>
                </div>
                <p className="autoreport-source-note">
                  本报告只使用 dashboard、BMS latest/history 和 derived metric 证据；当前版本不代表已创建报警、工单或 CMMS 记录。
                  Evidence comes only from dashboards, BMS latest/history, and derived metrics. This version does not imply alarm, work-order, or CMMS records.
                </p>
              </section>

              <section className="autoreport-section">
                <h4>{template.zhExceptionsTitle} / {template.enExceptionsTitle}</h4>
                <ul className="autoreport-priority-list">
                  {dataQualityLines(selectedBindings, snapshot).map((line) => <li key={line}>{line}</li>)}
                  {summary.noteCount > 0 ? <li>{summary.noteCount} 条 dashboard note 可作为现场交接背景 / {summary.noteCount} dashboard note{summary.noteCount === 1 ? "" : "s"} are available as handover context.</li> : null}
                  {reportType === "fault_review" ? <li>请在验证说明中记录现场检查和复测结果 / Record site checks and retest results in verification notes.</li> : null}
                </ul>
                {fields.operatorNotes.trim() ? <p className="autoreport-operator-note">{fields.operatorNotes.trim()}</p> : null}
                {fields.verificationNotes.trim() ? <p className="autoreport-verification-note">{fields.verificationNotes.trim()}</p> : null}
              </section>

              <section className="autoreport-section">
                <h4>{template.zhEvidenceTitle} / {template.enEvidenceTitle}</h4>
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
                            <span key={widget.id}>{WIDGET_KIND_LABELS[widget.kind].zh} / {WIDGET_KIND_LABELS[widget.kind].en} · {widget.title}</span>
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

                {historyEvidence.length > 0 ? (
                  <div className="autoreport-trend-evidence" aria-label="Trend evidence">
                    {historyEvidence.slice(0, 12).map(({ binding, evidence }) => (
                      <div key={evidence.key}>
                        <strong>{pointDisplayName(binding)}</strong>
                        <small>{pointSourceLabel(binding)} · {pointTechnicalName(binding)}</small>
                        <span>Samples {evidence.count}</span>
                        <span>Min {formatNumber(evidence.min, binding.unit)}</span>
                        <span>Max {formatNumber(evidence.max, binding.unit)}</span>
                        <span>Avg {formatNumber(evidence.avg, binding.unit)}</span>
                        {evidence.firstAt && evidence.lastAt ? <small>{formatHktDateTime(evidence.firstAt)} - {formatHktDateTime(evidence.lastAt)} HKT</small> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>

              <section className="autoreport-section">
                <h4>原始点位快照 / Raw Point Snapshot</h4>
                <div className="autoreport-point-table" role="table" aria-label="Report point snapshot">
                  <div role="row" className="autoreport-point-head">
                    <span role="columnheader">Point</span>
                    <span role="columnheader">Value</span>
                    <span role="columnheader">Updated</span>
                    <span role="columnheader">Status</span>
                  </div>
                  {selectedBindings.map((binding) => {
                    const key = pointKey(binding);
                    const point = snapshot?.latest.byKey[key];
                    const status = pointStatus(binding, snapshot);
                    return (
                      <div role="row" className="autoreport-point-row" key={key || pointDisplayName(binding)}>
                        <span role="cell" className="autoreport-point-name">
                          <strong>{pointDisplayName(binding)}</strong>
                          <small>{pointSourceLabel(binding)} · {pointTechnicalName(binding)}</small>
                        </span>
                        <span role="cell">{pointValue(binding, snapshot)}</span>
                        <span role="cell">{point?.last_polled_at ? `${formatHktDateTime(point.last_polled_at)} HKT · ${formatAge(point.last_polled_at, generatedAt)}` : "No latest value"}</span>
                        <span role="cell"><Badge tone={statusTone(status)}>{statusLabel(status)}</Badge></span>
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
