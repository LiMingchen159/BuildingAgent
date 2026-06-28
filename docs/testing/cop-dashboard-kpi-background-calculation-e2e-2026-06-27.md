# COP Dashboard + KPI Background Calculation E2E Retest

Date: 2026-06-27
Project: `project_element`
Prompt:

```text
Please create a dashboard to monitor the COP of all chillers, including both the COP values available from the BMS and the COP values calculated by the system, and compare their performance side by side.
```

## Scope

- Clean previous COP test dashboards, COP conversations, and `system_cop` derived metric records before each generation round.
- Verify BuildingGPT creates dashboard widgets, registers one reusable KPI algorithm across all chiller entities, enables Background Calculation, and links the KPI page back to the generated dashboard.
- Verify the KPI/FDD detail page uses the fixed standardized asset paradigm, not a customizable dashboard-like page.

## Rounds

| Round | Result | Notes |
| --- | --- | --- |
| 1 | Pass after UI fix | Generated 8 `system_cop` instances and a COP dashboard. Found entity rows displayed vague names like `Chiller 01`; fixed UI to show `Chiller 01 (WCC-01)`. |
| 2 | Pass | Generated `conv_000135` / `dash_000007`. Verified 8 active Background Calculation entries, 2 comparison widgets, hidden trend audit inputs, and real KPI page DOM. Strengthened real page test to assert one right-sidebar KPI row and one group toggle. |
| 3 | Pass with dashboard-title issue found | Generated `conv_000136` / `dash_000008`. KPI and page passed. Found generic split-widget title issue like `WCC-02 WCC-01 Trends`. |
| 4 | Pass with metricType drift found | After dashboard title normalization, generated `conv_000137` / `dash_000009`. Trend titles no longer duplicated. Found Agent registered `system_cop` as `derived` instead of `kpi`; UI still rendered as KPI. |
| 5 | Pass final | After tightening metricType guidance, generated `conv_000138` / `dash_000010`. All 8 `system_cop` instances registered as `kpi`, all Background Calculation entries active, and real KPI page test passed. |

## Final Retained Artifacts

- Dashboard: `dash_000010`
- Conversation: `conv_000138`
- KPI group: `kpi:system_cop:v1`
- Entity coverage: `WCC_01` through `WCC_08`
- Background Calculation: 8/8 enabled, status `active`

## Final Dashboard Shape

- Overview: 8 live value grids, one per chiller.
- Comparison: 2 bar comparison widgets, split as BMS COP and System COP.
- Trends: 8 timeseries widgets, each with BMS COP and System COP visible.
- Trend audit inputs: Q and TLKW included with `defaultVisible:false`.
- Notes: 1 note widget for data quality/context.

## Verification Commands

```bash
npm --workspace @building-agent/api run typecheck
npm --workspace @building-agent/api test -- derivedMetrics.test.ts
npm --workspace @building-agent/web run typecheck
npm --workspace @building-agent/web test -- App.test.tsx
npm --workspace @building-agent/api run build
npm --workspace @building-agent/web run build
REAL_METRIC_INSTANCE_ID=<round metric id> REAL_PROJECT_ID=project_element REAL_TOKEN=seed-token-buildinggpt REAL_API_BASE=http://127.0.0.1:3000 npm --workspace @building-agent/web exec vitest run src/test/generatedKpiPage.real.test.tsx
```

## Final Status

The final generated KPI page shows one `System COP` KPI asset in the right sidebar with one group-level Background Calculation toggle. The detail page shows Formula, Inputs / Outputs, Background Calculation, Covered Entities, and Linked Dashboards. Covered Entities include individual Background Calculation toggles for all 8 chillers.
