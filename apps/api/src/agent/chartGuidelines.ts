/** System-prompt rules for matplotlib/seaborn charts generated via execute_code. */
export function chartPlottingGuidelines(): string {
  return [
    "CHART / PLOT RULES (mandatory when generating any figure):",
    "- Use Python with matplotlib + seaborn (install if missing: pip install matplotlib seaborn). Prefer seaborn whitegrid or ticks style for clean visuals.",
    "- ALL text on the figure MUST be English only: title, axis labels, legend, tick labels, annotations. No Chinese characters on the chart (explain in Chinese in chat text if needed).",
    "- Layout: use figsize large enough (e.g. 10x6 or wider for many series); plt.tight_layout() or fig.subplots_adjust; constrained_layout=True when helpful.",
    "- Avoid label overlap: rotate long x tick labels (e.g. rotation=30, ha='right'); use MaxNLocator / tick spacing; do not crowd annotations.",
    "- Legend: place outside the plot area when more than one series (e.g. bbox_to_anchor=(1.02, 1), loc='upper left') or below (loc='upper center', bbox_to_anchor=(0.5, -0.15)).",
    "- Data labels on points/bars only when ≤12 points; otherwise use a table or legend — never stack numbers on dense series.",
    "- Save with plt.savefig(..., dpi=250, bbox_inches='tight', facecolor='white') to os.environ['OUTPUT_DIR']; single clear filename (e.g. wcc4_chw_temp_12h.png).",
    "- After saving: plt.close(fig). In the chat answer include ![description](outputs/filename.png) with English alt text."
  ].join("\n");
}
