import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  COLOR_CYCLE,
  SCIENTIFIC_CHART_CONSTANTS,
  chartSanityViolation,
  dataBridgeSkillHint,
  executeCodeInjectedHeader,
  scientificChartSkillHint
} from "./chartStyle.js";

describe("chartStyle", () => {
  it("exports enterprise chart constants", () => {
    expect(SCIENTIFIC_CHART_CONSTANTS.dpi).toBe(300);
    expect(SCIENTIFIC_CHART_CONSTANTS.palette).toBe("deep");
    expect(SCIENTIFIC_CHART_CONSTANTS.themeStyle).toBe("whitegrid");
    expect(COLOR_CYCLE).toHaveLength(6);
    expect(COLOR_CYCLE[0]).toBe("#2563EB");
  });

  it("data bridge skill forbids load_all_series misuse and promotes build_combined_frame", () => {
    const hint = dataBridgeSkillHint();
    expect(hint).toContain("for label, df in load_all_series().items()");
    expect(hint).toContain("NEVER `for entry in load_all_series()`");
    expect(hint).toContain("build_combined_frame");
    expect(hint).toContain("col_series");
    expect(hint).toContain("fillna(method=");
    expect(hint).toContain("no debug-only");
    expect(hint).toContain("data_coverage");
    expect(hint).toContain("stdout/stderr are always hidden");
    expect(hint).toContain("non-image artifacts are hidden");
    expect(hint).toContain("saved charts only");
  });

  it("chart skill mandates enterprise helpers and format_hkt_axis", () => {
    const hint = scientificChartSkillHint();
    expect(hint).toContain("ENTERPRISE CHARTS");
    expect(hint).toContain("set_chart_title");
    expect(hint).toContain("finalize_legend");
    expect(hint).toContain("plot_series");
    expect(hint).toContain("chart_color");
    expect(hint).toContain("line chart");
    expect(hint).toContain("format_hkt_axis");
    expect(hint).toContain("save_chart");
    expect(hint).toContain("mdates is pre-imported");
    expect(hint).toContain("plt.savefig directly");
    expect(hint).toContain("COLOR_CYCLE[6]");
  });

  it("injected header includes round-2 data and chart APIs", () => {
    const header = executeCodeInjectedHeader();
    expect(header).toContain("import matplotlib.dates as mdates");
    expect(header).toContain("def series_short_label");
    expect(header).toContain("def build_combined_frame");
    expect(header).toContain("def col_series");
    expect(header).toContain("def chart_color");
    expect(header).toContain("def data_coverage");
    expect(header).toContain("def plot_series");
    expect(header).toContain("def plot_status_step");
    expect(header).toContain("def format_hkt_axis");
    expect(header).toContain("AutoDateLocator(tz=HKT, minticks=minticks, maxticks=maxticks)");
    expect(header).toContain("ConciseDateFormatter(locator, tz=HKT)");
    expect(header).toContain("def set_chart_title");
    expect(header).toContain("def finalize_legend");
    expect(header).toContain("def style_chart_axes");
    expect(header).toContain("def load_all_series");
    expect(header).toContain("payload.get('history'");
    expect(header).toContain("'valueNum': 'value_num'");
    expect(header).toContain("format='mixed'");
    expect(header).toContain("errors='coerce'");
    expect(header).toContain("dropna(subset=['ts'])");
    expect(header).toContain("df.index.duplicated(keep='last')");
    expect(header).toContain("def downsample_timeseries");
    expect(header).toContain("def _series_with_gap_breaks");
    expect(header).toContain("NOT a list of entries");
    expect(header).toContain(`dpi=${SCIENTIFIC_CHART_CONSTANTS.dpi}`);
  });

  it("loads eight keyed history series and downsamples locally without losing a spike", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ba-chart-bridge-"));
    const dataFile = path.join(dir, "history.json");
    const manifestFile = path.join(dir, "manifest.json");
    const scriptFile = path.join(dir, "bridge.py");
    const series = Array.from({ length: 8 }, (_, entityIndex) => ({
      instanceId: `metric_${entityIndex + 1}`,
      history: Array.from({ length: 1_200 }, (_, index) => {
        const timestamp = new Date(
          Date.UTC(2026, 5, 1, 0, index + (index >= 600 ? 3 * 24 * 60 : 0))
        ).toISOString();
        return {
          ts: index % 2 === 0 ? timestamp.replace(".000Z", "Z") : timestamp,
          valueNum: index === 617 ? 9_999 : entityIndex + index / 1_000,
          quality: "good",
          status: "ok"
        };
      }).flatMap((row, index) => {
        if (index === 500) return [row, { ...row }];
        if (index === 700) return [row, { ...row, ts: "not-a-timestamp" }];
        return [row];
      })
    }));
    writeFileSync(dataFile, JSON.stringify({ series }), "utf8");
    writeFileSync(manifestFile, JSON.stringify({
      requestId: "req_bridge",
      entries: series.map((_, index) => ({
        tool: "derived_metric_history_prepare",
        toolCallId: "call_bridge",
        data_file: dataFile,
        label: `system_cop:WCC_${String(index + 1).padStart(2, "0")}`,
        data_key: `metric_${index + 1}`
      }))
    }), "utf8");
    writeFileSync(scriptFile, `${executeCodeInjectedHeader()}\n${[
      "loaded = load_all_series()",
      "first = loaded['system_cop:WCC_01']",
      "duplicate_index_count = int(first.index.duplicated().sum())",
      "sampled = downsample_timeseries(first, max_points=1000)",
      "sparse = pd.Series(np.nan, index=pd.date_range('2026-06-01T00:00:00Z', periods=2000, freq='min'), name='sparse')",
      "sparse.iloc[::20] = np.arange(100)",
      "sampled_sparse = downsample_timeseries(sparse, max_points=1000)",
      "plot_ready = _series_with_gap_breaks(first['value_num'], max_points=1000)",
      "fig, ax = new_figure()",
      "line = plot_series(ax, first, 'value_num')",
      "format_hkt_axis(ax)",
      "hkt_label = ax.xaxis.get_major_formatter()(mdates.date2num(pd.Timestamp('2026-06-01T00:00:00Z').to_pydatetime()))",
      "line_values = np.asarray(line.get_ydata(), dtype=float)",
      "valid_line_values = line_values[~np.isnan(line_values)]",
      "plt.close(fig)",
      "long_fig, long_ax = new_figure()",
      "long_index = pd.date_range('2026-06-01T00:00:00Z', periods=60 * 24 + 1, freq='h')",
      "long_ax.plot(long_index, np.arange(len(long_index)))",
      "format_hkt_axis(long_ax)",
      "long_fig.canvas.draw()",
      "long_ticks = long_ax.get_xticks()",
      "long_tick_labels = [label.get_text() for label in long_ax.get_xticklabels()]",
      "long_tick_hkt = [mdates.num2date(value, tz=HKT).strftime('%Y-%m-%d %H:%M %z') for value in long_ticks]",
      "long_offset_text = long_ax.xaxis.get_offset_text().get_text()",
      "plt.close(long_fig)",
      "print(json.dumps({'series_count': len(loaded), 'has_value_num': 'value_num' in first.columns, 'frame_count': len(first), 'duplicate_index_count': duplicate_index_count, 'sampled_count': len(sampled), 'sampled_sparse_count': len(sampled_sparse), 'sampled_sparse_valid': int(sampled_sparse.notna().sum()), 'plot_count': len(plot_ready), 'gap_markers': int(plot_ready.isna().sum()), 'line_gap_markers': int(np.isnan(line_values).sum()), 'first': float(valid_line_values[0]), 'last': float(valid_line_values[-1]), 'spike': float(np.nanmax(line_values)), 'hkt_label': hkt_label, 'long_tick_count': len(long_ticks), 'long_tick_labels': long_tick_labels, 'long_tick_hkt': long_tick_hkt, 'long_offset_text': long_offset_text}))"
    ].join("\n")}\n`, "utf8");

    const output = execFileSync("python3", [scriptFile], {
      env: { ...process.env, TOOL_CACHE_MANIFEST: manifestFile, OUTPUT_DIR: dir },
      encoding: "utf8"
    }).trim();
    const result = JSON.parse(output) as Record<string, unknown>;
    expect(result).toMatchObject({
      series_count: 8,
      has_value_num: true,
      frame_count: 1_200,
      duplicate_index_count: 0,
      gap_markers: 1,
      line_gap_markers: 1,
      first: 0,
      last: 1.199,
      spike: 9_999
    });
    expect(result.sampled_count).toEqual(expect.any(Number));
    expect(result.sampled_count as number).toBeLessThanOrEqual(1_000);
    expect(result.sampled_sparse_count).toBe(100);
    expect(result.sampled_sparse_valid).toBe(100);
    expect(result.plot_count as number).toBeLessThanOrEqual(1_000);
    expect(result.long_tick_count as number).toBeGreaterThanOrEqual(4);
    expect(result.long_tick_count as number).toBeLessThanOrEqual(10);
    expect(result.long_tick_hkt).toEqual(expect.arrayContaining([
      expect.stringMatching(/ 00:00 \+0800$/)
    ]));
    expect(`${(result.long_tick_labels as string[]).join(" ")} ${String(result.long_offset_text)}`)
      .toMatch(/2026|Jun|Jul/);
  });

  describe("chartSanityViolation", () => {
    it("flags chart code without save_chart when no PNG produced", () => {
      const msg = chartSanityViolation("fig, ax = new_figure()\nax.plot([1,2,3])", 0);
      expect(msg).toContain("save_chart");
    });

    it("passes when save_chart is called", () => {
      expect(chartSanityViolation("fig, ax = new_figure()\nsave_chart(fig, 'x.png')", 0)).toBeNull();
    });

    it("passes when PNG was generated even without save_chart in user code", () => {
      expect(chartSanityViolation("fig, ax = plt.subplots()\nax.plot([1])", 1)).toBeNull();
    });

    it("ignores non-chart non-debug code", () => {
      expect(chartSanityViolation("summary = combined.describe()", 0)).toBeNull();
    });

    it("flags print(load_all_series()) probe scripts", () => {
      expect(chartSanityViolation("print(load_all_series())", 0)).toContain("Debug-only");
    });

    it("flags debug-only coverage/columns scripts", () => {
      const msg = chartSanityViolation(
        "combined = build_combined_frame()\nprint('coverage:', data_coverage(combined).to_dict())",
        0
      );
      expect(msg).toContain("Debug-only");
    });

    it("allows coverage print alongside save_chart", () => {
      expect(chartSanityViolation(
        "combined = build_combined_frame()\nprint(data_coverage(combined))\nfig, ax = new_figure()\nplot_series(ax, combined, 'TLKW')\nsave_chart(fig, 'x.png')",
        0
      )).toBeNull();
    });
  });
});
