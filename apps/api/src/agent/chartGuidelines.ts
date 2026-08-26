import { SCIENTIFIC_CHART_CONSTANTS } from "./chartStyle.js";

/** L0 chart hard rules — detailed workflow lives in skill_chart_quality / skill_tool_data_bridge. */
export function chartPlottingGuidelines(): string {
  const [w, h] = SCIENTIFIC_CHART_CONSTANTS.figsize;
  return [
    "CHART / PLOT RULES (mandatory when generating any figure):",
    "- Use injected helpers: build_combined_frame(), plot_timeseries_default(), data_coverage(), plot_series(), chart_color(i), plot_status_step(), new_figure(), set_chart_title(), format_hkt_axis(), finalize_legend(), save_chart() — do not plt.savefig directly.",
    "- Default compatible-unit analog history = plot_timeseries_default(combined, title=..., ylabel=...). It keeps 1–4 series compatible and renders 5–8 histories spanning at least seven days as small multiples with hourly median and P10–P90 bands.",
    "- Never put incompatible units into one plot_timeseries_default() call; use separate figures.",
    "- Use layout='overlay' only when the user explicitly requests one-axis comparison. Never hand-write a 5–8-series long-history overlay as the default.",
    "- Keep every selected series identity. A no-data series gets a labeled No valid samples panel; never silently remove it.",
    `- Enterprise presentation style (fixed): figsize (${w}, ${h}), dpi ${SCIENTIFIC_CHART_CONSTANTS.dpi}, whitegrid/talk theme, corporate palette, left-aligned title — do not override colors/fonts.`,
    "- ALL text on the figure MUST be English only: title, axis labels, legend, tick labels, annotations.",
    "- Layout: 5–6 long-history series use 2x3 panels; 7–8 use 2x4. Empty hourly bins remain gaps. The helper discloses HKT, hourly aggregation, and shared/independent y-scale mode.",
    "- Data labels on points/bars only when ≤12 points; otherwise use legend.",
    "- After save_chart: cite ![description](outputs/filename.png) with English alt text.",
    "- Never guess cache filenames; use build_combined_frame() or for label, df in load_all_series().items() — never for entry in load_all_series().",
    "TIMEZONE / X-AXIS (mandatory for timeseries charts):",
    "- Tool `ts` fields are UTC ISO; display in Asia/Hong_Kong (HKT). HKT is pre-injected in execute_code.",
    "- NEVER use mdates.timezone(...) or import pytz — zoneinfo only.",
    "- matplotlib/seaborn/pandas are pre-installed — do not pip install mid-turn."
  ].join("\n");
}
