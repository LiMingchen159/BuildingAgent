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
    expect(header).toContain("def set_chart_title");
    expect(header).toContain("def finalize_legend");
    expect(header).toContain("def style_chart_axes");
    expect(header).toContain("def load_all_series");
    expect(header).toContain("NOT a list of entries");
    expect(header).toContain(`dpi=${SCIENTIFIC_CHART_CONSTANTS.dpi}`);
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
