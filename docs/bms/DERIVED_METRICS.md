# Derived Metrics Storage And Agent Workflow

This document describes the durable calculated-metrics layer used for reusable building KPIs such as System COP, Delta T, kW/RT, FD scores, and similar values.

## Why This Layer Exists

BMS points and calculated KPIs have different responsibilities:

- BMS data stores raw point facts from the building system, such as `WCC-L1-09_COP`, temperatures, loads, and power.
- Derived metrics store Building GPT calculated values that should be reused across dashboards, reports, alerts, and later conversations.
- Long-term memory stores only a pointer to the reusable metric, not the time-series data itself.

Dashboards should not recalculate reusable KPIs in widgets. A dashboard should bind to data sources:

- `source: "bms"` for raw BMS points.
- `source: "derived_metric"` for calculated values persisted by Building GPT.

## Storage Location

Derived metric data is stored in the project data root as SQLite:

```text
<BUILDING_AGENT_DATA_DIR>/derived_metrics.db
```

If `BUILDING_AGENT_DATA_DIR` is not configured, the API falls back to the repository data directory.

The storage is project scoped. Each metric instance is keyed by:

```text
projectId + entityId + metricKey
```

This prevents duplicate reusable metrics such as multiple `system_cop` instances for the same chiller.

## Data Model

The derived metrics store has six conceptual parts:

- `metric_definitions`: metric identity, display name, type, and default unit, keyed by `projectId + metricKey`.
- `metric_versions`: formula and formula version, so formulas can evolve.
- `metric_instances`: metric bound to an entity/equipment, keyed by `projectId + entityId + metricKey`.
- `metric_dependencies`: source points or other metric instances used in the calculation.
- `metric_samples`: historical calculated values.
- `metric_latest`: current/latest value for fast dashboard reads.

Samples are keyed by:

```text
instanceId + timestamp + calculationRunId
```

For automatic calculations, `calculationRunId` is stable for the metric, formula kind, and source window. Re-running the same calculation window updates the same sample rows instead of creating unnecessary duplicates.

## Long-Term Memory Pointer

When a derived metric is persisted, Building GPT writes a project memory pointer such as:

```text
Derived metric persisted: WCC_09/system_cop; metric_instance_id=minst_...; formula=...; dependencies=...; Use derived_metric_read before recalculating.
```

The memory pointer helps the agent remember that the metric exists. The actual values remain in `derived_metrics.db`.

This split is intentional:

- Memory is used for discovery and routing.
- SQLite is used for metric definitions, latest values, and history.

## Agent Tool Flow

### Reuse First

For any reusable calculated value, the agent should start with:

```text
derived_metric_lookup(metricKey, entityId)
```

If a metric exists, the agent should use:

```text
derived_metric_read(instanceId or metricKey + entityId)
```

The agent should not recalculate an existing latest value unless an explicit forced recalculation is needed.

### Preview Before Persistence

For one-off calculations where the user has not clearly approved persistence, the agent should use:

```text
derived_metric_preview(...)
```

This computes a safe `ratio` or `difference` metric without writing:

- No metric definition.
- No metric instance.
- No samples.
- No latest value.
- No project memory pointer.

The preview returns `persistCandidate.args`. If the user approves saving, the agent can pass those args to `derived_metric_calculate`.

### Persist After Approval

When the user asks for a durable metric or confirms saving a preview, the agent should use:

```text
derived_metric_calculate(...)
```

This tool:

- Looks up the metric first.
- Reuses the existing latest value when available.
- Calculates only when needed.
- Registers the metric when missing.
- Writes history and latest samples.
- Writes the project memory pointer.
- Returns dashboard-ready binding metadata.

## COP Dashboard Flow

When the user asks for a dashboard comparing BMS COP and Building GPT calculated COP:

1. Look up `system_cop` for the chiller entity.
2. If missing and the user asked for a durable dashboard metric, calculate and persist System COP.
3. Build the dashboard with two bindings:

```json
[
  {
    "source": "bms",
    "pointName": "WCC-L1-09_COP",
    "label": "BMS COP",
    "unit": "COP"
  },
  {
    "source": "derived_metric",
    "metricInstanceId": "minst_...",
    "metricKey": "system_cop",
    "entityId": "WCC_09",
    "label": "System COP",
    "unit": "COP"
  }
]
```

The dashboard reads raw BMS data and derived metric data through the same dashboard batch APIs.

## Delta T Preview And Save Flow

When the user asks to calculate Delta T but has not approved saving:

1. Call `derived_metric_lookup(metricKey="delta_t", entityId=...)`.
2. If not found, call `derived_metric_preview(formulaKind="difference", ...)`.
3. Show the preview value.
4. Ask whether to save it.
5. If the user approves, call `derived_metric_calculate` with `persistCandidate.args`.
6. Later questions use `derived_metric_lookup` and `derived_metric_read`; they do not recalculate.

## Dashboard API Behavior

Dashboard bindings support:

- Raw BMS point bindings.
- Derived metric bindings by `metricInstanceId`.
- Derived metric bindings by `metricKey + entityId`.

The dashboard batch endpoints resolve both source types:

- `/api/bms/dashboard/latest-batch`
- `/api/bms/dashboard/history-batch`

Derived metric responses are shaped like BMS timeseries rows so frontend widgets can consume both sources side by side.

## Review Map

Primary implementation files:

- `apps/api/src/derivedMetrics.ts`
- `apps/api/src/agent/genericTools.ts`
- `apps/api/src/agent/skills.ts`
- `apps/api/src/dashboards.ts`
- `apps/api/src/server.ts`
- `apps/web/src/ui/DashboardView.tsx`
- `apps/web/src/api.ts`

Primary verification files:

- `apps/api/src/derivedMetrics.test.ts`
- `apps/api/src/dashboards.test.ts`
- `apps/api/src/chat.test.ts`
- `apps/web/src/App.test.tsx`

Recommended targeted checks:

```bash
npm --workspace @building-agent/api test -- src/derivedMetrics.test.ts src/dashboards.test.ts src/projectSkills.test.ts --reporter=dot
npm --workspace @building-agent/api test -- src/chat.test.ts -t "derived metric COP workflow" --reporter=dot
npm --workspace @building-agent/api test -- src/chat.test.ts -t "previews Delta T" --reporter=dot
npm --workspace @building-agent/api run typecheck
npm --workspace @building-agent/web test -- src/App.test.tsx --reporter=dot
npm --workspace @building-agent/web run typecheck
```
