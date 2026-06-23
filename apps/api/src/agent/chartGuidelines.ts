import { SCIENTIFIC_CHART_CONSTANTS } from "./chartStyle.js";

/** L0 chart hard rules — detailed workflow lives in skill_chart_quality / skill_tool_data_bridge. */
export function chartPlottingGuidelines(): string {
  const [w, h] = SCIENTIFIC_CHART_CONSTANTS.figsize;
  return [
    "CHART / PLOT RULES (mandatory when generating any figure):",
    "- Use injected helpers: build_combined_frame(), data_coverage(), plot_series(), chart_color(i), plot_status_step(), new_figure(), set_chart_title(ax, title, ylabel=...), format_hkt_axis(ax), finalize_legend(ax), save_chart(fig, filename) — do not plt.savefig directly.",
    "- Default timeseries = line chart via plot_series (dropna, gaps break lines). No interpolate/fill_between on analog signals unless user asks.",
    `- Enterprise presentation style (fixed): figsize (${w}, ${h}), dpi ${SCIENTIFIC_CHART_CONSTANTS.dpi}, whitegrid/talk theme, corporate palette, left-aligned title — do not override colors/fonts.`,
    "- ALL text on the figure MUST be English only: title, axis labels, legend, tick labels, annotations.",
    "- Layout: rotate crowded x tick labels (rotation=30, ha='right'); legend outside when >1 series.",
    "- Data labels on points/bars only when ≤12 points; otherwise use legend.",
    "- After save_chart: cite ![description](outputs/filename.png) with English alt text.",
    "- Never guess cache filenames; use build_combined_frame() or for label, df in load_all_series().items() — never for entry in load_all_series().",
    "TIMEZONE / X-AXIS (mandatory for timeseries charts):",
    "- Tool `ts` fields are UTC ISO; display in Asia/Hong_Kong (HKT). HKT is pre-injected in execute_code.",
    "- NEVER use mdates.timezone(...) or import pytz — zoneinfo only.",
    "- matplotlib/seaborn/pandas are pre-installed — do not pip install mid-turn."
  ].join("\n");
}
