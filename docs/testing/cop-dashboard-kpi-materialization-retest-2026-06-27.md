# COP Dashboard KPI Materialization Retest - 2026-06-27

## Prompt

```text
Please create a dashboard to monitor the COP of all chillers, including both the COP values available from the BMS and the COP values calculated by the system, and compare their performance side by side.
```

## Cleanup Before Test

- Deleted prior dashboard `dash_000004`.
- Deleted prior conversation `conv_000132` and its session index rows.
- Removed prior `system_cop` derived metric definition, 8 instances, samples, latest rows, and materialization rows.
- Removed prior tool-call log rows containing `conv_000132` or `dash_000004`.
- Removed older local COP retest records from `docs/testing`.

## New Test Result

- Conversation: `conv_000133`.
- Dashboard: `dash_000005`.
- Dashboard title: `Chiller COP Monitor - BMS vs System COP`.
- Provider request: `req_000516`.
- Provider: `openai-compatible`, model `deepseek-v4-pro`, fallback `false`.
- Result: PASS.

## Dashboard Structure

- Overview: 8 live value widgets, one per chiller.
- Each live widget binds BMS COP, System COP output, cooling output Q input, and TLKW motor power input.
- Comparison: 2 ranking widgets, one for BMS COP and one for System COP.
- Trends: 8 trend widgets, one per chiller.
- Trend widgets bind BMS COP and System COP outputs first, with Q and TLKW audit inputs also present.
- Notes: includes WCC-04 flow meter caveat.

## Derived KPI Materialization

- Metric key: `system_cop`.
- Instances: 8, one per `WCC_01` through `WCC_08`.
- Materialization: all 8 instances have `enabled=1` and `status=active`.
- Materializer cadence: `interval_seconds=300`.
- Background run evidence: all 8 instances have `last_run_at` and `next_run_at`.
- Formula materializer: `ratio`, `cooling_output / motor_power`.
- Invalid value policy observed: `null`.

## History Coverage

- Each instance has about 2811-2812 samples.
- Sample window: `2026-05-28T08:00:00+00:00` to `2026-06-27T07:30:00+00:00`.
- This satisfies the one-month historical backfill expectation for the retest.

## UI Expectation

- API returns 8 `system_cop` instances because calculation is per equipment.
- The right sidebar groups them as one KPI algorithm entry (`System COP`) because metric key and formula version are shared.
- The single KPI toggle controls all 8 materializers together.

## Verification Commands

- `npm --workspace @building-agent/web run typecheck`
- `npm --workspace @building-agent/web test -- App.test.tsx`
- `npm --workspace @building-agent/web run build`
- `npm --workspace @building-agent/api run typecheck`
- `GET /api/projects/project_element/derived-metrics`
- SQLite audit of `data/derived_metrics.db`
