import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  COLOR_CYCLE,
  LINE_STYLE_CYCLE,
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
    expect(COLOR_CYCLE).toHaveLength(8);
    expect(new Set(COLOR_CYCLE).size).toBe(8);
    expect(LINE_STYLE_CYCLE).toEqual(["-", "--", "-.", ":"]);
    expect(COLOR_CYCLE[0]).toBe("#2563EB");
  });

  it("data bridge skill forbids load_all_series misuse and promotes build_combined_frame", () => {
    const hint = dataBridgeSkillHint();
    expect(hint).toContain("for label, df in load_all_series().items()");
    expect(hint).toContain("NEVER `for entry in load_all_series()`");
    expect(hint).toContain("build_combined_frame");
    expect(hint).toContain("plot_timeseries_default");
    expect(hint).toContain("col_series");
    expect(hint).toContain("fillna(method=");
    expect(hint).toContain("no debug-only");
    expect(hint).toContain("data_coverage");
    expect(hint).toContain("never drop a selected column");
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
    expect(hint).toContain("plot_timeseries_default");
    expect(hint).toContain("small multiples");
    expect(hint).toContain("compatible-unit");
    expect(hint).toContain("incompatible units");
    expect(hint).toContain("layout='overlay'");
    expect(hint).toContain("chart_color");
    expect(hint).toContain("line chart");
    expect(hint).toContain("format_hkt_axis");
    expect(hint).toContain("save_chart");
    expect(hint).toContain("mdates is pre-imported");
    expect(hint).toContain("plt.savefig directly");
    expect(hint).toContain("COLOR_CYCLE[8]");
  });

  it("injected header includes round-2 data and chart APIs", () => {
    const header = executeCodeInjectedHeader();
    expect(header).toContain("import matplotlib.dates as mdates");
    expect(header).toContain("def series_short_label");
    expect(header).toContain("def series_display_label");
    expect(header).toContain("def _natural_sort_key");
    expect(header).toContain("def build_combined_frame");
    expect(header).toContain("def col_series");
    expect(header).toContain("def chart_color");
    expect(header).toContain("def data_coverage");
    expect(header).toContain("def plot_series");
    expect(header).toContain("def plot_series_small_multiples");
    expect(header).toContain("def plot_timeseries_default");
    expect(header).toContain("Hourly median with P10-P90 band");
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
    expect(header).toContain("def _robust_gap_threshold_ns");
    expect(header).toContain("def chart_linestyle");
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
    // The label order mirrors production request req_006993, where every series
    // shares the CHWST suffix and WCC-05 was previously reduced to bare "CHWST".
    const productionFleetOrder = [5, 4, 8, 3, 7, 6, 1, 2];
    writeFileSync(manifestFile, JSON.stringify({
      requestId: "req_bridge",
      entries: productionFleetOrder.map((entityNumber) => ({
        tool: "derived_metric_history_prepare",
        toolCallId: "call_bridge",
        data_file: dataFile,
        label: `WCC-L1-${String(entityNumber).padStart(2, "0")}-CHWST`,
        data_key: `metric_${entityNumber}`
      }))
    }), "utf8");
    writeFileSync(scriptFile, `${executeCodeInjectedHeader()}\n${[
      "loaded = load_all_series()",
      "loaded_labels = list(loaded.keys())",
      "first = loaded['WCC-L1-01-CHWST']",
      "combined = build_combined_frame(loaded)",
      "combined_columns = list(combined.columns)",
      "ambiguous_suffix_count = len(col_series(combined, 'CHWST'))",
      "single_combined = build_combined_frame({'WCC-L1-01-CHWST': first})",
      "unique_suffix = col_series(single_combined, 'CHWST')",
      "unique_suffix_count = len(unique_suffix)",
      "unique_suffix_name = str(unique_suffix.name)",
      "metric_combined = build_combined_frame({'system_cop:WCC_01': first})",
      "entity_alias = col_series(metric_combined, 'WCC_01')",
      "entity_alias_count = len(entity_alias)",
      "entity_alias_name = str(entity_alias.name)",
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
      "fleet_fig, fleet_ax = new_figure()",
      "fleet_lines = [plot_series(fleet_ax, combined, col) for col in combined.columns]",
      "fleet_legend = finalize_legend(fleet_ax)",
      "fleet_styles = [[line.get_color(), line.get_linestyle()] for line in fleet_lines]",
      "fleet_segment_counts = []",
      "for fleet_line in fleet_lines:",
      "    fleet_values = np.asarray(fleet_line.get_ydata(), dtype=float)",
      "    finite = np.isfinite(fleet_values)",
      "    starts = finite & np.concatenate(([True], ~finite[:-1]))",
      "    fleet_segment_counts.append(int(starts.sum()))",
      "fleet_legend_labels = [text.get_text() for text in fleet_legend.get_texts()]",
      "fleet_legend_ncols = int(fleet_legend._ncols)",
      "fleet_legend_bbox = list(fleet_legend.get_bbox_to_anchor()._bbox.bounds)",
      "plt.close(fleet_fig)",
      "small_fig, small_ax = new_figure()",
      "small_ax.plot([0, 1], [0, 1], label='A')",
      "small_ax.plot([0, 1], [1, 0], label='B')",
      "small_legend = finalize_legend(small_ax)",
      "small_legend_loc = int(small_legend._loc)",
      "small_legend_ncols = int(small_legend._ncols)",
      "small_legend_bbox = list(small_legend.get_bbox_to_anchor()._bbox.bounds)",
      "plt.close(small_fig)",
      "single_fig, single_ax = new_figure()",
      "single_ax.plot([0, 1], [0, 1], label='Only')",
      "single_legend = finalize_legend(single_ax)",
      "single_legend_loc = int(single_legend._loc)",
      "single_legend_ncols = int(single_legend._ncols)",
      "single_legend_bbox = list(single_legend.get_bbox_to_anchor()._bbox.bounds)",
      "plt.close(single_fig)",
      "title_fig, title_ax = new_figure()",
      "set_chart_title(title_ax, 'Fleet trend', subtitle='Eight chillers · complete history')",
      "title_fig.canvas.draw()",
      "title_renderer = title_fig.canvas.get_renderer()",
      "title_axes_top = float(title_ax.get_window_extent(title_renderer).y1)",
      "title_box = title_ax.title.get_window_extent(title_renderer)",
      "subtitle_box = title_ax.texts[-1].get_window_extent(title_renderer)",
      "subtitle_layout = [title_axes_top, float(subtitle_box.y0), float(subtitle_box.y1), float(title_box.y0)]",
      "plt.close(title_fig)",
      "plain_title_fig, plain_title_ax = new_figure()",
      "set_chart_title(plain_title_ax, 'Fleet trend')",
      "plain_title_fig.canvas.draw()",
      "plain_title_renderer = plain_title_fig.canvas.get_renderer()",
      "plain_title_gap = float(plain_title_ax.title.get_window_extent(plain_title_renderer).y0 - plain_title_ax.get_window_extent(plain_title_renderer).y1)",
      "plain_title_text_count = len(plain_title_ax.texts)",
      "plt.close(plain_title_fig)",
      "# Synthetic cadence fixture based on req_006993: p50 ~8 min, p95 15 min,",
      "# MAD ~3.5 min, and one genuine 125-minute outage.",
      "cadence_minutes = ([4, 8, 15, 7, 12, 5, 9, 14, 6, 11, 8, 15, 4, 10, 7, 13] * 250)[:3999]",
      "cadence_minutes[2299] = 125",
      "elapsed_minutes = np.concatenate(([0], np.cumsum(cadence_minutes)))",
      "cadence_index = pd.Timestamp('2026-06-25T00:00:00Z') + pd.to_timedelta(elapsed_minutes, unit='min')",
      "cadence_values = np.sin(np.arange(len(cadence_index)) / 17.0)",
      "cadence_values[0] = 111.0",
      "cadence_values[1700] = -7777.0",
      "cadence_values[3100] = 9999.0",
      "cadence_values[-1] = 222.0",
      "cadence_series = pd.Series(cadence_values, index=cadence_index, name='WCC-L1-01-CHWST')",
      "cadence_ready = _series_with_gap_breaks(cadence_series, max_points=1000)",
      "cadence_finite = np.isfinite(cadence_ready.to_numpy(dtype=float))",
      "cadence_starts = cadence_finite & np.concatenate(([True], ~cadence_finite[:-1]))",
      "cadence_threshold_minutes = _robust_gap_threshold_ns(cadence_series.index) / 60_000_000_000",
      "cadence_deltas = np.asarray(cadence_minutes, dtype=float)",
      "old_false_gap_count = int((cadence_deltas > np.median(cadence_deltas) * 1.5).sum())",
      "boundary_results = {}",
      "for boundary_size in [1, 2, 3, 999, 1000]:",
      "    boundary_series = pd.Series(np.arange(boundary_size, dtype=float), index=pd.date_range('2026-06-01T00:00:00Z', periods=boundary_size, freq='min'))",
      "    boundary_ready = _series_with_gap_breaks(boundary_series, max_points=1000)",
      "    boundary_results[str(boundary_size)] = [len(boundary_ready), int(boundary_ready.isna().sum()), float(boundary_ready.iloc[0]), float(boundary_ready.iloc[-1])]",
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
      "print(json.dumps({'series_count': len(loaded), 'loaded_labels': loaded_labels, 'combined_columns': combined_columns, 'ambiguous_suffix_count': ambiguous_suffix_count, 'unique_suffix_count': unique_suffix_count, 'unique_suffix_name': unique_suffix_name, 'entity_alias_count': entity_alias_count, 'entity_alias_name': entity_alias_name, 'has_value_num': 'value_num' in first.columns, 'frame_count': len(first), 'duplicate_index_count': duplicate_index_count, 'sampled_count': len(sampled), 'sampled_sparse_count': len(sampled_sparse), 'sampled_sparse_valid': int(sampled_sparse.notna().sum()), 'plot_count': len(plot_ready), 'gap_markers': int(plot_ready.isna().sum()), 'line_gap_markers': int(np.isnan(line_values).sum()), 'first': float(valid_line_values[0]), 'last': float(valid_line_values[-1]), 'spike': float(np.nanmax(line_values)), 'fleet_styles': fleet_styles, 'fleet_segment_counts': fleet_segment_counts, 'fleet_legend_labels': fleet_legend_labels, 'fleet_legend_ncols': fleet_legend_ncols, 'fleet_legend_bbox': fleet_legend_bbox, 'small_legend_loc': small_legend_loc, 'small_legend_ncols': small_legend_ncols, 'small_legend_bbox': small_legend_bbox, 'single_legend_loc': single_legend_loc, 'single_legend_ncols': single_legend_ncols, 'single_legend_bbox': single_legend_bbox, 'subtitle_layout': subtitle_layout, 'plain_title_gap': plain_title_gap, 'plain_title_text_count': plain_title_text_count, 'cadence_p50_minutes': float(np.median(cadence_deltas)), 'cadence_p95_minutes': float(np.percentile(cadence_deltas, 95)), 'cadence_mad_minutes': float(np.median(np.abs(cadence_deltas - np.median(cadence_deltas)))), 'cadence_threshold_minutes': float(cadence_threshold_minutes), 'old_false_gap_count': old_false_gap_count, 'cadence_plot_count': len(cadence_ready), 'cadence_valid_count': int(cadence_ready.notna().sum()), 'cadence_gap_markers': int(cadence_ready.isna().sum()), 'cadence_segment_count': int(cadence_starts.sum()), 'cadence_first': float(cadence_ready.dropna().iloc[0]), 'cadence_last': float(cadence_ready.dropna().iloc[-1]), 'cadence_min': float(cadence_ready.min()), 'cadence_spike': float(cadence_ready.max()), 'boundary_results': boundary_results, 'hkt_label': hkt_label, 'long_tick_count': len(long_ticks), 'long_tick_labels': long_tick_labels, 'long_tick_hkt': long_tick_hkt, 'long_offset_text': long_offset_text}))"
    ].join("\n")}\n`, "utf8");

    const output = execFileSync("python3", [scriptFile], {
      env: { ...process.env, TOOL_CACHE_MANIFEST: manifestFile, OUTPUT_DIR: dir },
      encoding: "utf8"
    }).trim();
    const result = JSON.parse(output) as Record<string, unknown>;
    expect(result).toMatchObject({
      series_count: 8,
      loaded_labels: [
        "WCC-L1-01-CHWST",
        "WCC-L1-02-CHWST",
        "WCC-L1-03-CHWST",
        "WCC-L1-04-CHWST",
        "WCC-L1-05-CHWST",
        "WCC-L1-06-CHWST",
        "WCC-L1-07-CHWST",
        "WCC-L1-08-CHWST"
      ],
      combined_columns: [
        "WCC-L1-01-CHWST",
        "WCC-L1-02-CHWST",
        "WCC-L1-03-CHWST",
        "WCC-L1-04-CHWST",
        "WCC-L1-05-CHWST",
        "WCC-L1-06-CHWST",
        "WCC-L1-07-CHWST",
        "WCC-L1-08-CHWST"
      ],
      ambiguous_suffix_count: 0,
      unique_suffix_count: 1_200,
      unique_suffix_name: "WCC-L1-01-CHWST",
      entity_alias_count: 1_200,
      entity_alias_name: "system_cop:WCC_01",
      has_value_num: true,
      frame_count: 1_200,
      duplicate_index_count: 0,
      gap_markers: 1,
      line_gap_markers: 1,
      first: 0,
      last: 1.199,
      spike: 9_999
    });
    expect(result.fleet_legend_labels).toEqual(result.combined_columns);
    expect(result.fleet_legend_labels).toContain("WCC-L1-05-CHWST");
    expect(new Set((result.fleet_styles as string[][]).map(([color]) => color)).size).toBe(8);
    expect(new Set((result.fleet_styles as string[][]).map(([color, style]) => `${color}:${style}`)).size).toBe(8);
    expect(result.fleet_segment_counts).toEqual(Array(8).fill(2));
    expect(result.fleet_legend_ncols).toBe(4);
    expect((result.fleet_legend_bbox as number[])[1]).toBeLessThan(0);
    expect(result.small_legend_loc).toBe(0);
    expect(result.small_legend_ncols).toBe(1);
    expect((result.small_legend_bbox as number[])[1]).toBeGreaterThanOrEqual(0);
    expect(result.single_legend_loc).toBe(0);
    expect(result.single_legend_ncols).toBe(1);
    expect((result.single_legend_bbox as number[])[1]).toBeGreaterThanOrEqual(0);
    const subtitleLayout = result.subtitle_layout as number[];
    expect(subtitleLayout).toHaveLength(4);
    const axesTop = subtitleLayout[0]!;
    const subtitleBottom = subtitleLayout[1]!;
    const subtitleTop = subtitleLayout[2]!;
    const titleBottom = subtitleLayout[3]!;
    expect(subtitleBottom).toBeGreaterThanOrEqual(axesTop);
    expect(subtitleTop).toBeLessThan(titleBottom);
    expect(titleBottom - axesTop).toBeGreaterThan(result.plain_title_gap as number);
    expect(result.plain_title_text_count).toBe(0);
    expect(result.cadence_p50_minutes as number).toBeGreaterThanOrEqual(8);
    expect(result.cadence_p50_minutes as number).toBeLessThanOrEqual(9);
    expect(result.cadence_p95_minutes).toBe(15);
    expect(result.cadence_mad_minutes as number).toBeGreaterThanOrEqual(3);
    expect(result.cadence_mad_minutes as number).toBeLessThanOrEqual(4);
    expect(result.cadence_threshold_minutes as number).toBeGreaterThan(34);
    expect(result.cadence_threshold_minutes as number).toBeLessThan(45);
    expect(result.old_false_gap_count as number).toBeGreaterThan(500);
    expect(result.cadence_plot_count as number).toBeLessThanOrEqual(1_000);
    expect(result.cadence_valid_count as number).toBeGreaterThanOrEqual(900);
    expect(result.cadence_gap_markers).toBe(1);
    expect(result.cadence_segment_count).toBe(2);
    expect(result.cadence_first).toBe(111);
    expect(result.cadence_last).toBe(222);
    expect(result.cadence_min).toBe(-7_777);
    expect(result.cadence_spike).toBe(9_999);
    expect(result.boundary_results).toEqual({
      "1": [1, 0, 0, 0],
      "2": [2, 0, 0, 1],
      "3": [3, 0, 0, 2],
      "999": [999, 0, 0, 998],
      "1000": [1000, 0, 0, 999]
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

  it("defaults long eight-series histories to readable small multiples", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ba-chart-small-multiples-"));
    const scriptFile = path.join(dir, "small-multiples.py");
    writeFileSync(scriptFile, `${executeCodeInjectedHeader()}\n${[
      "index = pd.date_range('2026-06-01T00:00:00Z', periods=60 * 24 * 4 + 1, freq='15min').tz_convert(HKT)",
      "fleet = {}",
      "for equipment in [5, 4, 8, 3, 7, 6, 1, 2]:",
      "    values = 10.0 + equipment * 0.45 + np.sin(np.arange(len(index)) / (17.0 + equipment))",
      "    values = values.astype(float)",
      "    values[2200:2212] = np.nan",
      "    fleet[f'WCC-L1-{equipment:02d}-CHWST'] = values",
      "combined = pd.DataFrame(fleet, index=index)",
      "fig, axes = plot_timeseries_default(combined, title='Chilled water temperatures', ylabel='Temperature (degC)')",
      "flat = [ax for ax in axes.flatten() if ax.get_visible()]",
      "fig.canvas.draw()",
      "renderer = fig.canvas.get_renderer()",
      "title_box = fig._suptitle.get_window_extent(renderer)",
      "subtitle = next(text for text in fig.texts if 'Hourly median' in text.get_text())",
      "subtitle_box = subtitle.get_window_extent(renderer)",
      "first_row_title_top = max(ax._left_title.get_window_extent(renderer).y1 for ax in flat[:4])",
      "panel_titles = [ax.get_title(loc='left') for ax in flat]",
      "panel_line_counts = [len(ax.lines) for ax in flat]",
      "panel_band_counts = [len(ax.collections) for ax in flat]",
      "panel_colors = [ax.lines[0].get_color() for ax in flat]",
      "panel_nan_counts = [int(np.isnan(np.asarray(ax.lines[0].get_ydata(), dtype=float)).sum()) for ax in flat]",
      "shared_y = all(flat[0].get_shared_y_axes().joined(flat[0], ax) for ax in flat[1:])",
      "small_path = save_chart(fig, 'small-multiples.png')",
      "extreme = pd.DataFrame({f'cop:WCC_{equipment:02d}': 3.0 + np.sin(np.arange(len(index)) / 21.0) for equipment in range(1, 9)}, index=index)",
      "extreme.loc[index[1000:2600], 'cop:WCC_08'] = 120.0",
      "extreme_fig, extreme_axes = plot_timeseries_default(extreme, title='COP comparison', ylabel='COP')",
      "extreme_flat = [ax for ax in extreme_axes.flatten() if ax.get_visible()]",
      "extreme_shared_y = all(extreme_flat[0].get_shared_y_axes().joined(extreme_flat[0], ax) for ax in extreme_flat[1:])",
      "extreme_scale_note = next(text.get_text() for text in extreme_fig.texts if 'y-scales' in text.get_text())",
      "plt.close(extreme_fig)",
      "constant_scale_split = not _small_multiples_share_y([pd.Series([3.0, 3.0])] * 7 + [pd.Series([120.0, 120.0])])",
      "band_index = pd.date_range('2026-06-01T00:00:00Z', periods=8 * 24 * 10 + 1, freq='6min').tz_convert(HKT)",
      "band_outlier = pd.DataFrame({f'cop:WCC_{equipment:02d}': np.full(len(band_index), 5.0) for equipment in range(1, 9)}, index=band_index)",
      "band_outlier.loc[band_outlier.index.minute >= 48, 'cop:WCC_08'] = 120.0",
      "band_fig, band_axes = plot_timeseries_default(band_outlier, title='COP band comparison', ylabel='COP')",
      "band_flat = [ax for ax in band_axes.flatten() if ax.get_visible()]",
      "band_outlier_scale_split = not all(band_flat[0].get_shared_y_axes().joined(band_flat[0], ax) for ax in band_flat[1:])",
      "plt.close(band_fig)",
      "four_fig, four_ax = plot_timeseries_default(combined.iloc[:, :4], title='Four series')",
      "four_is_overlay = not hasattr(four_ax, 'flatten') and len(four_ax.lines) == 4",
      "plt.close(four_fig)",
      "overlay_fig, overlay_ax = plot_timeseries_default(combined, title='Explicit overlay', layout='overlay')",
      "explicit_overlay = not hasattr(overlay_ax, 'flatten') and len(overlay_ax.lines) == 8",
      "plt.close(overlay_fig)",
      "route_shapes = {}",
      "for route_count in [5, 6, 7, 8]:",
      "    route_fig, route_axes = plot_timeseries_default(combined.iloc[:, :route_count], title=f'{route_count} series')",
      "    route_shapes[str(route_count)] = list(route_axes.shape)",
      "    plt.close(route_fig)",
      "nine = combined.copy()",
      "nine['WCC-L1-09-CHWST'] = combined.iloc[:, 0]",
      "nine_fig, nine_ax = plot_timeseries_default(nine, title='Nine series')",
      "nine_is_overlay = not hasattr(nine_ax, 'flatten') and len(nine_ax.lines) == 9",
      "plt.close(nine_fig)",
      "short_fig, short_ax = plot_timeseries_default(combined.iloc[-6 * 24 * 4:, :5], title='Short five series')",
      "short_is_overlay = not hasattr(short_ax, 'flatten') and len(short_ax.lines) == 5",
      "plt.close(short_fig)",
      "known_index = pd.date_range('2026-06-01T00:00:00Z', periods=10, freq='5min').tz_convert(HKT)",
      "known_profile = _hourly_series_profile(pd.Series(np.arange(10, dtype=float), index=known_index))",
      "empty_sources = {column: pd.DataFrame({'value_num': combined[column]}) for column in combined.columns[:-1]}",
      "empty_sources[combined.columns[-1]] = pd.DataFrame()",
      "empty_combined = build_combined_frame(empty_sources)",
      "empty_fig, empty_axes = plot_timeseries_default(empty_combined, title='Empty series retained', layout='small_multiples')",
      "empty_flat = [ax for ax in empty_axes.flatten() if ax.get_visible()]",
      "empty_panel_retained = len(empty_combined.columns) == 8 and len(empty_flat) == 8 and any(len(ax.lines) == 0 and any('No valid samples' in text.get_text() for text in ax.texts) for ax in empty_flat)",
      "plt.close(empty_fig)",
      "print(json.dumps({'axes_shape': list(axes.shape), 'panel_titles': panel_titles, 'panel_line_counts': panel_line_counts, 'panel_band_counts': panel_band_counts, 'panel_colors': panel_colors, 'panel_nan_counts': panel_nan_counts, 'shared_y': shared_y, 'subtitle': subtitle.get_text(), 'title_subtitle_gap': float(title_box.y0 - subtitle_box.y1), 'subtitle_panel_gap': float(subtitle_box.y0 - first_row_title_top), 'small_path': small_path, 'small_bytes': os.path.getsize(os.path.join(os.environ['OUTPUT_DIR'], 'small-multiples.png')), 'extreme_shared_y': extreme_shared_y, 'extreme_scale_note': extreme_scale_note, 'constant_scale_split': constant_scale_split, 'band_outlier_scale_split': band_outlier_scale_split, 'four_is_overlay': four_is_overlay, 'explicit_overlay': explicit_overlay, 'route_shapes': route_shapes, 'nine_is_overlay': nine_is_overlay, 'short_is_overlay': short_is_overlay, 'known_quantiles': [float(known_profile.iloc[0]['p10']), float(known_profile.iloc[0]['median']), float(known_profile.iloc[0]['p90'])], 'empty_panel_retained': empty_panel_retained}))"
    ].join("\n")}\n`, "utf8");

    const output = execFileSync("python3", [scriptFile], {
      env: { ...process.env, OUTPUT_DIR: dir },
      encoding: "utf8"
    }).trim();
    const result = JSON.parse(output) as Record<string, unknown>;
    expect(result.axes_shape).toEqual([2, 4]);
    expect(result.panel_titles).toEqual([
      "WCC-01",
      "WCC-02",
      "WCC-03",
      "WCC-04",
      "WCC-05",
      "WCC-06",
      "WCC-07",
      "WCC-08"
    ]);
    expect(result.panel_line_counts).toEqual(Array(8).fill(1));
    expect(result.panel_band_counts).toEqual(Array(8).fill(1));
    expect(new Set(result.panel_colors as string[]).size).toBe(8);
    expect((result.panel_nan_counts as number[]).every((count) => count >= 1)).toBe(true);
    expect(result.shared_y).toBe(true);
    expect(result.subtitle).toContain("Hourly median with P10-P90 band");
    expect(result.subtitle).toContain("HKT");
    expect(result.subtitle).toContain("shared y-scale");
    expect(result.title_subtitle_gap as number).toBeGreaterThan(6);
    expect(result.subtitle_panel_gap as number).toBeGreaterThan(8);
    expect(result.small_path).toBe("outputs/small-multiples.png");
    expect(result.small_bytes as number).toBeGreaterThan(10_000);
    expect(result.extreme_shared_y).toBe(false);
    expect(result.extreme_scale_note).toContain("independent y-scales due to range disparity");
    expect(result.constant_scale_split).toBe(true);
    expect(result.band_outlier_scale_split).toBe(true);
    expect(result.four_is_overlay).toBe(true);
    expect(result.explicit_overlay).toBe(true);
    expect(result.route_shapes).toEqual({
      "5": [2, 3],
      "6": [2, 3],
      "7": [2, 4],
      "8": [2, 4]
    });
    expect(result.nine_is_overlay).toBe(true);
    expect(result.short_is_overlay).toBe(true);
    expect(result.known_quantiles).toEqual([0.9, 4.5, 8.1]);
    expect(result.empty_panel_retained).toBe(true);
  }, 20_000);

  describe("chartSanityViolation", () => {
    it("flags chart code without save_chart when no PNG produced", () => {
      const msg = chartSanityViolation("fig, ax = new_figure()\nax.plot([1,2,3])", 0);
      expect(msg).toContain("save_chart");
    });

    it("flags the default history helper without save_chart", () => {
      const msg = chartSanityViolation(
        "fig, axes = plot_timeseries_default(combined, title='Fleet')",
        0
      );
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
