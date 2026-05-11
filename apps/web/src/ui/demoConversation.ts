import type { ChatMessage } from "../api";

export function buildDemoConversation(projectId: string, userId: string): ChatMessage[] {
  return [
    {
      id: "demo-msg-1",
      projectId,
      userId,
      role: "user",
      content: "Show me the energy baseline for last week and flag anomalies."
    },
    {
      id: "demo-msg-2",
      projectId,
      userId,
      role: "assistant",
      content: [
        "## Energy baseline — last 7 days",
        "",
        "Pulled from **mock** point readings on the campus chiller plant. Comparing measured kWh against the rolling 30-day baseline:",
        "",
        "| Day | Measured kWh | Baseline kWh | Δ% |",
        "| --- | --- | --- | --- |",
        "| Mon | 12,310 | 12,580 | -2.1% |",
        "| Tue | 12,850 | 12,720 | +1.0% |",
        "| Wed | **15,400** | 12,790 | **+20.4%** |",
        "| Thu | 12,640 | 12,810 | -1.3% |",
        "| Fri | 12,950 | 12,780 | +1.3% |",
        "| Sat | 8,120 | 8,940 | -9.2% |",
        "| Sun | 7,940 | 8,910 | -10.9% |",
        "",
        "### Anomaly",
        "- **Wed +20.4%** consumption spike on chiller `CH-02`. Source point: `point_chiller_02_kw` over `bms-bacnet-001` gateway.",
        "- Cross-checked with the [Anomaly Detection skill](#skill_anomaly_detection) — confidence 0.84.",
        "",
        "> Recommended next step: open the chiller dashboard and inspect the supply-water setpoint history.",
        "",
        "```ts",
        "// Equivalent query via the Time-Series Plotter tool",
        "await plotTimeSeries({",
        "  pointId: \"point_chiller_02_kw\",",
        "  start: \"2026-05-04T00:00:00Z\",",
        "  end: \"2026-05-11T00:00:00Z\",",
        "  resolution: \"1h\"",
        "});",
        "```",
        "",
        "_Sources: mock placeholder readings only — no live BMS gateway is connected from this build._"
      ].join("\n")
    },
    {
      id: "demo-msg-3",
      projectId,
      userId,
      role: "user",
      content: "Plot Wednesday's chiller load and compare to the baseline."
    },
    {
      id: "demo-msg-4",
      projectId,
      userId,
      role: "assistant",
      content: [
        "Generated a placeholder chart for **CH-02** on Wednesday and stored it in the project repository.",
        "",
        "- File: `wed-ch02-load-vs-baseline.png`",
        "- Source task: `task_032`",
        "- Captured: 2026-05-07 18:14 local",
        "",
        "Open the **Repository** tab to download or share — every action will require explicit user approval before leaving the local API session boundary."
      ].join("\n"),
      images: [
        {
          src: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 180'><rect width='320' height='180' fill='%23eef5ff'/><polyline points='10,140 50,120 90,90 130,40 170,30 210,60 250,80 290,70' stroke='%231746b7' stroke-width='3' fill='none'/><polyline points='10,135 50,128 90,118 130,108 170,104 210,108 250,118 290,124' stroke='%23a73525' stroke-width='2' stroke-dasharray='4 4' fill='none'/><text x='12' y='20' font-family='monospace' font-size='12' fill='%23172033'>CH-02 kW vs baseline</text></svg>",
          alt: "Wednesday chiller CH-02 kW load with baseline reference",
          filename: "wed-ch02-load-vs-baseline.png",
          capturedAt: "2026-05-07 18:14",
          source: "task_032"
        }
      ]
    }
  ];
}
