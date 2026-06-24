import { useEffect, useMemo, useRef, useState } from "react";
import type { DashboardLayoutItem, DashboardPointBinding, DashboardRecord, DashboardVisibility } from "../api";
import { getBmsCollectorLastValue, queryBmsCollectorTimeseries, type BmsCollectorPoint, type BmsCollectorTimeseriesRow } from "../bmsCollectorClient";
import { Badge, Button, EmptyState, Surface } from "./primitives";

interface DashboardViewProps {
  token: string;
  dashboard: DashboardRecord;
  liveValues: Record<string, BmsCollectorPoint>;
  stale: boolean;
  onLayoutChange: (layout: DashboardLayoutItem[]) => Promise<void>;
  onVisibilityChange: (visibility: DashboardVisibility) => Promise<void>;
}

interface ChartSeries {
  label: string;
  pointName: string;
  color: string;
  points: Array<{ ts: string; value: number }>;
}

const CHART_COLORS = ["#0f766e", "#b45309", "#1d4ed8", "#b91c1c", "#4d7c0f", "#7c3aed"];
const DASHBOARD_GRID_COLUMNS = 6;
const HKT_TIME_ZONE = "Asia/Hong_Kong";

interface PlotlyModule {
  newPlot: (element: HTMLElement, data: unknown[], layout: Record<string, unknown>, config: Record<string, unknown>) => Promise<unknown>;
  react: (element: HTMLElement, data: unknown[], layout: Record<string, unknown>, config: Record<string, unknown>) => Promise<unknown>;
  purge: (element: HTMLElement) => void;
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

function formatHktHour(value: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: HKT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function pointDisplayName(binding: DashboardPointBinding): string {
  return binding.label || binding.pointName || binding.objectRef || "Point";
}

function pointKey(binding: DashboardPointBinding): string {
  return binding.pointName || binding.objectRef || "";
}

function pointNumericValue(point: BmsCollectorPoint | undefined): string {
  const raw = point?.last_value ?? "";
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    return numeric.toFixed(1);
  }
  return raw || "--";
}

function sortLayout(layout: DashboardLayoutItem[]): DashboardLayoutItem[] {
  return [...layout].sort((left, right) => (left.y - right.y) || (left.x - right.x));
}

function reflowLayout(order: string[], currentLayout: DashboardLayoutItem[]): DashboardLayoutItem[] {
  const layoutById = new Map(currentLayout.map((item) => [item.widgetId, item]));
  const next: DashboardLayoutItem[] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 1;

  for (const widgetId of order) {
    const source = layoutById.get(widgetId);
    if (!source) continue;
    if (x + source.w > DASHBOARD_GRID_COLUMNS) {
      y += rowHeight;
      x = 0;
      rowHeight = 1;
    }
    next.push({ widgetId, x, y, w: source.w, h: source.h });
    x += source.w;
    rowHeight = Math.max(rowHeight, source.h);
    if (x === DASHBOARD_GRID_COLUMNS) {
      y += rowHeight;
      x = 0;
      rowHeight = 1;
    }
  }

  return next;
}

function toChartPoints(rows: BmsCollectorTimeseriesRow[]): Array<{ ts: string; value: number }> {
  return rows
    .map((row) => {
      const numeric = typeof row.value_num === "number" && Number.isFinite(row.value_num)
        ? row.value_num
        : Number(row.value ?? row.value_text ?? "");
      return Number.isFinite(numeric) ? { ts: row.ts, value: numeric } : null;
    })
    .filter((entry): entry is { ts: string; value: number } => entry !== null);
}

function LineChart({ series }: { series: ChartSeries[] }) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [plotlyUnavailable, setPlotlyUnavailable] = useState(false);
  const allValues = series.flatMap((entry) => entry.points.map((point) => point.value));
  const min = allValues.length > 0 ? Math.min(...allValues) : 0;
  const max = allValues.length > 0 ? Math.max(...allValues) : 0;
  const allTimestamps = series.flatMap((entry) => entry.points.map((point) => Date.parse(point.ts))).filter(Number.isFinite);
  const tickStart = allTimestamps.length > 0 ? Math.ceil(Math.min(...allTimestamps) / 3_600_000) * 3_600_000 : 0;
  const tickEnd = allTimestamps.length > 0 ? Math.floor(Math.max(...allTimestamps) / 3_600_000) * 3_600_000 : 0;
  const hourlyTicks: number[] = [];
  for (let ts = tickStart; ts <= tickEnd; ts += 3_600_000) {
    hourlyTicks.push(ts);
  }
  const dataRevision = useMemo(
    () => series.map((entry) => `${entry.pointName}:${entry.points.at(-1)?.ts ?? "empty"}:${entry.points.length}`).join("|"),
    [series]
  );

  useEffect(() => {
    const element = chartRef.current;
    if (!element || series.length === 0) return undefined;
    if (typeof window !== "undefined" && /jsdom/i.test(window.navigator.userAgent)) {
      setPlotlyUnavailable(true);
      return undefined;
    }
    let disposed = false;
    let plotly: PlotlyModule | null = null;

    async function renderChart() {
      try {
        const imported = await import("plotly.js-dist-min") as unknown as { default?: PlotlyModule } & PlotlyModule;
        plotly = imported.default ?? imported;
        if (disposed || !element) return;
        const traces = series.map((entry) => ({
          type: "scatter",
          mode: "lines+markers",
          name: entry.label,
          x: entry.points.map((point) => Date.parse(point.ts)),
          y: entry.points.map((point) => point.value),
          customdata: entry.points.map((point) => formatHktDateTime(point.ts)),
          line: { color: entry.color, width: 2.2, shape: "spline" },
          marker: { color: entry.color, size: 4 },
          hovertemplate: "%{fullData.name}<br>%{customdata} HKT<br>%{y:.2f}<extra></extra>"
        }));
        const layout = {
          autosize: true,
          margin: { l: 42, r: 18, t: 8, b: 36 },
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(0,0,0,0)",
          font: { family: "Inter, ui-sans-serif, system-ui, sans-serif", color: "#334155", size: 11 },
          hovermode: "x unified",
          showlegend: false,
          xaxis: {
            type: "date",
            tickmode: "array",
            tickvals: hourlyTicks,
            ticktext: hourlyTicks.map(formatHktHour),
            showgrid: true,
            gridcolor: "rgba(148, 163, 184, 0.18)",
            zeroline: false,
            title: ""
          },
          yaxis: {
            showgrid: true,
            gridcolor: "rgba(148, 163, 184, 0.18)",
            zeroline: false,
            title: ""
          },
          uirevision: "dashboard-chart"
        };
        const config = { displayModeBar: false, responsive: true, scrollZoom: false };
        await (element.dataset.plotlyReady === "true"
          ? plotly.react(element, traces, layout, config)
          : plotly.newPlot(element, traces, layout, config));
        element.dataset.plotlyReady = "true";
      } catch {
        if (!disposed) setPlotlyUnavailable(true);
      }
    }

    void renderChart();
    return () => {
      disposed = true;
      if (plotly && element) {
        plotly.purge(element);
      }
    };
  }, [dataRevision, hourlyTicks, series]);

  return (
    <div className="dashboard-chart-shell">
      <div ref={chartRef} className="dashboard-chart" role="img" aria-label="Historical trend chart">
        {series.length === 0 ? <span className="dashboard-chart-empty">Loading trend</span> : null}
        {plotlyUnavailable ? <span className="dashboard-chart-empty">Trend unavailable</span> : null}
      </div>
      <div className="dashboard-chart-meta">
        <span>Min {Number.isFinite(min) ? min.toFixed(1) : "--"}</span>
        <span>Max {Number.isFinite(max) ? max.toFixed(1) : "--"}</span>
        <span>HKT hourly ticks</span>
      </div>
      <div className="dashboard-chart-legend">
        {series.map((entry) => (
          <span key={entry.pointName} className="dashboard-chart-legend-item">
            <span className="dashboard-chart-legend-swatch" style={{ backgroundColor: entry.color }} />
            {entry.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DashboardView({ token, dashboard, liveValues, stale, onLayoutChange, onVisibilityChange }: DashboardViewProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [chartSeriesByWidget, setChartSeriesByWidget] = useState<Record<string, ChartSeries[]>>({});
  const [fallbackLiveValues, setFallbackLiveValues] = useState<Record<string, BmsCollectorPoint>>({});
  const [savingLayout, setSavingLayout] = useState(false);
  const [sharing, setSharing] = useState(false);

  const sortedLayout = sortLayout(dashboard.layout);
  const widgetsById = new Map(dashboard.widgets.map((widget) => [widget.id, widget]));
  const orderedWidgets = sortedLayout
    .map((item) => ({ layout: item, widget: widgetsById.get(item.widgetId) }))
    .filter((entry): entry is { layout: DashboardLayoutItem; widget: DashboardRecord["widgets"][number] } => Boolean(entry.widget));

  useEffect(() => {
    let cancelled = false;

    async function loadCharts() {
      const entries = await Promise.all(
        dashboard.widgets
          .filter((widget) => widget.kind === "timeseries_chart")
          .map(async (widget) => {
            const to = new Date();
            const hours = Number((widget.defaultTimeRange ?? "24h").replace(/h$/u, "")) || 24;
            const from = new Date(to.getTime() - hours * 60 * 60 * 1000);
            const series = await Promise.all(
              widget.pointBindings.map(async (binding, index) => {
                const pointName = pointKey(binding);
                const response = await queryBmsCollectorTimeseries(token, {
                  name: pointName,
                  from: from.toISOString(),
                  to: to.toISOString(),
                  limit: "720",
                  order: "asc"
                });
                return {
                  label: pointDisplayName(binding),
                  pointName,
                  color: CHART_COLORS[index % CHART_COLORS.length]!,
                  points: toChartPoints(response.items)
                };
              })
            );
            return [widget.id, series] as const;
          })
      );
      if (cancelled) return;
      setChartSeriesByWidget(Object.fromEntries(entries));
    }

    void loadCharts();
    return () => {
      cancelled = true;
    };
  }, [dashboard.id, dashboard.widgets, token]);

  useEffect(() => {
    let cancelled = false;

    async function pollFallbackValues() {
      const pointNames = new Set(
        dashboard.widgets.flatMap((widget) => widget.pointBindings.map((binding) => binding.pointName).filter((entry): entry is string => Boolean(entry)))
      );
      if (pointNames.size === 0) return;
      const values = await Promise.all([...pointNames].map(async (pointName) => [pointName, await getBmsCollectorLastValue(token, pointName)] as const));
      if (cancelled) return;
      setFallbackLiveValues(Object.fromEntries(values.filter((entry): entry is [string, BmsCollectorPoint] => Boolean(entry[1]))));
    }

    void pollFallbackValues();
    const interval = setInterval(() => {
      void pollFallbackValues();
    }, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [dashboard.id, dashboard.widgets, token]);

  useEffect(() => {
    setChartSeriesByWidget((current) => {
      let changed = false;
      const next: Record<string, ChartSeries[]> = {};
      for (const [widgetId, series] of Object.entries(current)) {
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
            points: [...entry.points.slice(-239), { ts, value: numeric }]
          };
        });
      }
      return changed ? next : current;
    });
  }, [liveValues, fallbackLiveValues]);

  async function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId || savingLayout) return;
    const order = orderedWidgets.map((entry) => entry.widget.id);
    const fromIndex = order.indexOf(draggingId);
    const toIndex = order.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const reordered = [...order];
    reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, draggingId);
    const nextLayout = reflowLayout(reordered, dashboard.layout);
    setSavingLayout(true);
    try {
      await onLayoutChange(nextLayout);
    } finally {
      setSavingLayout(false);
      setDraggingId(null);
    }
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

  return (
    <section className="dashboard-page" aria-labelledby="dashboard-title">
      <div className="dashboard-page-header">
        <div>
          <p className="eyebrow">Dashboards</p>
          <h2 id="dashboard-title">{dashboard.title}</h2>
          {dashboard.description ? <p className="dashboard-page-description">{dashboard.description}</p> : null}
        </div>
        <div className="dashboard-page-actions">
          <Badge tone={dashboard.visibility === "project" ? "success" : "neutral"}>
            {dashboard.visibility === "project" ? "Shared" : "Private"}
          </Badge>
          {stale ? <Badge tone="warning">Stale</Badge> : <Badge tone="info">Live</Badge>}
          <Button type="button" variant="secondary" onClick={() => void handleVisibilityToggle()} disabled={sharing}>
            {dashboard.visibility === "project" ? "Make Private" : "Share to Project"}
          </Button>
        </div>
      </div>

      {orderedWidgets.length === 0 ? (
        <Surface className="dashboard-empty-surface">
          <EmptyState title="No widgets yet">BuildingGPT can generate a dashboard spec here when you ask to monitor equipment.</EmptyState>
        </Surface>
      ) : (
        <div className="dashboard-grid">
          {orderedWidgets.map(({ layout, widget }) => {
            const gridStyle = {
              gridColumn: `span ${layout.w}`,
              gridRow: `span ${layout.h}`
            };
            return (
              <article
                key={widget.id}
                className={`dashboard-card dashboard-card-${widget.kind}${draggingId === widget.id ? " is-dragging" : ""}`}
                style={gridStyle}
                draggable
                onDragStart={() => setDraggingId(widget.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => void handleDrop(widget.id)}
              >
                <div className="dashboard-card-header">
                  <div>
                    <strong>{widget.title}</strong>
                    <span>{widget.kind === "live_value_grid" ? "Live values" : `${widget.defaultTimeRange ?? "24h"} trend · HKT`}</span>
                  </div>
                  <Badge tone="neutral">{layout.w}:{layout.h}</Badge>
                </div>

                {widget.kind === "live_value_grid" ? (
                  <div className="dashboard-live-grid">
                    {widget.pointBindings.map((binding) => {
                      const key = pointKey(binding);
                      const point = liveValues[key] ?? fallbackLiveValues[key];
                      return (
                        <div className="dashboard-live-row" key={key}>
                          <span>
                            <span>{pointDisplayName(binding)}</span>
                            {point?.last_polled_at ? <small>{formatHktDateTime(point.last_polled_at)} HKT</small> : null}
                          </span>
                          <strong>{pointNumericValue(point)}{binding.unit ? ` ${binding.unit}` : ""}</strong>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <LineChart series={chartSeriesByWidget[widget.id] ?? []} />
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
