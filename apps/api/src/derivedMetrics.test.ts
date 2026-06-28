import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { DerivedMetricStore } from "./derivedMetrics.js";
import { createGenericToolRegistry } from "./agent/genericTools.js";
import { AgentMemoryStore } from "./agent/memory.js";

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "ba-derived-metrics-"));
}

describe("DerivedMetricStore", () => {
  it("registers project-scoped metric instances once and reuses duplicates", () => {
    const store = new DerivedMetricStore(tempDir());
    const first = store.registerMetric({
      projectId: "project_element",
      metricKey: "system_cop",
      entityId: "WCC_01",
      displayName: "WCC_01 System COP",
      unit: "",
      formula: "cooling_load_kw / power_kw",
      dependencies: [
        { role: "cooling_load_kw", sourceId: "WCC-L1-01_Q", pointName: "WCC-L1-01_Q" },
        { role: "power_kw", sourceId: "WCC-L1-01_P", pointName: "WCC-L1-01_P" }
      ]
    });
    const second = store.registerMetric({
      projectId: "project_element",
      metricKey: "system_cop",
      entityId: "WCC_01",
      displayName: "Duplicate should reuse",
      formula: "q / p",
      dependencies: [
        { role: "cooling_load_kw", sourceId: "WCC-L1-01_Q" },
        { role: "power_kw", sourceId: "WCC-L1-01_P" }
      ]
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.instance.instanceId).toBe(first.instance.instanceId);
    expect(store.lookup({ projectId: "project_element", metricKey: "system_cop", entityId: "WCC_01" })).toHaveLength(1);
    expect(first.instance.dependencies.map((dependency) => dependency.sourceId).sort()).toEqual(["WCC-L1-01_P", "WCC-L1-01_Q"]);
  });

  it("preserves formula lineage per equipment instance for shared metric keys", () => {
    const store = new DerivedMetricStore(tempDir());
    const first = store.registerMetric({
      projectId: "project_element",
      metricKey: "system_cop",
      entityId: "WCC_01",
      displayName: "WCC-01 System COP",
      formula: "WCC-L1-01_Q / WCC-L1-01_P",
      formulaDescription: "WCC-01 cooling load divided by WCC-01 chiller power",
      dependencies: [
        { role: "cooling_load_kw", sourceId: "WCC-L1-01_Q" },
        { role: "power_kw", sourceId: "WCC-L1-01_P" }
      ]
    });
    const second = store.registerMetric({
      projectId: "project_element",
      metricKey: "system_cop",
      entityId: "WCC_02",
      displayName: "WCC-02 System COP",
      formula: "WCC-L1-02_Q / WCC-L1-02_P",
      formulaDescription: "WCC-02 cooling load divided by WCC-02 chiller power",
      dependencies: [
        { role: "cooling_load_kw", sourceId: "WCC-L1-02_Q" },
        { role: "power_kw", sourceId: "WCC-L1-02_P" }
      ]
    });

    expect(store.getInstance(first.instance.instanceId)).toMatchObject({
      entityId: "WCC_01",
      formula: "WCC-L1-01_Q / WCC-L1-01_P",
      formulaDescription: "WCC-01 cooling load divided by WCC-01 chiller power"
    });
    expect(store.getInstance(second.instance.instanceId)).toMatchObject({
      entityId: "WCC_02",
      formula: "WCC-L1-02_Q / WCC-L1-02_P",
      formulaDescription: "WCC-02 cooling load divided by WCC-02 chiller power"
    });
  });

  it("migrates older stores by snapshotting shared formula lineage onto instances", () => {
    const dir = tempDir();
    const db = new Database(path.join(dir, "derived_metrics.db"));
    db.exec(`
      CREATE TABLE metric_definitions (
        definition_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        metric_key TEXT NOT NULL,
        display_name TEXT NOT NULL,
        metric_type TEXT NOT NULL,
        default_unit TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, metric_key)
      );

      CREATE TABLE metric_versions (
        version_id TEXT PRIMARY KEY,
        definition_id TEXT NOT NULL,
        version TEXT NOT NULL,
        formula TEXT NOT NULL,
        formula_description TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(definition_id, version)
      );

      CREATE TABLE metric_instances (
        instance_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        definition_id TEXT NOT NULL,
        version_id TEXT NOT NULL,
        metric_key TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        entity_name TEXT,
        display_name TEXT NOT NULL,
        unit TEXT,
        status TEXT NOT NULL,
        created_by TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, entity_id, metric_key)
      );

      INSERT INTO metric_definitions (
        definition_id, project_id, metric_key, display_name, metric_type, default_unit, metadata_json, created_at, updated_at
      ) VALUES (
        'mdef_legacy', 'project_element', 'system_cop', 'System COP', 'derived', 'COP', NULL,
        '2026-06-26T00:00:00.000Z', '2026-06-26T00:00:00.000Z'
      );
      INSERT INTO metric_versions (
        version_id, definition_id, version, formula, formula_description, metadata_json, created_at
      ) VALUES (
        'mver_legacy', 'mdef_legacy', 'v1', 'WCC-L1-01_Q / WCC-L1-01_P',
        'legacy WCC-01 formula', NULL, '2026-06-26T00:00:00.000Z'
      );
      INSERT INTO metric_instances (
        instance_id, project_id, definition_id, version_id, metric_key, entity_id, entity_name,
        display_name, unit, status, created_by, metadata_json, created_at, updated_at
      ) VALUES (
        'minst_legacy_01', 'project_element', 'mdef_legacy', 'mver_legacy', 'system_cop', 'WCC_01',
        NULL, 'WCC-01 System COP', 'COP', 'active', NULL, NULL,
        '2026-06-26T00:00:00.000Z', '2026-06-26T00:00:00.000Z'
      );
    `);
    db.close();

    const store = new DerivedMetricStore(dir);
    expect(store.getInstance("minst_legacy_01")).toMatchObject({
      entityId: "WCC_01",
      formula: "WCC-L1-01_Q / WCC-L1-01_P",
      formulaDescription: "legacy WCC-01 formula"
    });

    store.registerMetric({
      projectId: "project_element",
      metricKey: "system_cop",
      entityId: "WCC_02",
      displayName: "WCC-02 System COP",
      formula: "WCC-L1-02_Q / WCC-L1-02_P",
      formulaDescription: "WCC-02 formula",
      dependencies: [
        { role: "cooling_load_kw", sourceId: "WCC-L1-02_Q" },
        { role: "power_kw", sourceId: "WCC-L1-02_P" }
      ]
    });

    expect(store.getInstance("minst_legacy_01")).toMatchObject({
      entityId: "WCC_01",
      formula: "WCC-L1-01_Q / WCC-L1-01_P",
      formulaDescription: "legacy WCC-01 formula"
    });
  });

  it("records latest and history samples for persisted metrics", () => {
    const store = new DerivedMetricStore(tempDir());
    const metric = store.registerMetric({
      projectId: "project_element",
      metricKey: "delta_t",
      entityId: "WCC_02",
      formula: "return_temp - supply_temp",
      unit: "degC",
      dependencies: [
        { role: "return_temp", sourceId: "WCC-L1-02-CHWRT" },
        { role: "supply_temp", sourceId: "WCC-L1-02-CHWST" }
      ]
    });

    store.recordSample({
      instanceId: metric.instance.instanceId,
      ts: "2026-06-26T10:00:00.000Z",
      valueNum: 4.1
    });
    store.recordSample({
      instanceId: metric.instance.instanceId,
      ts: "2026-06-26T10:15:00.000Z",
      valueNum: 4.4
    });

    expect(store.readLatest(metric.instance.instanceId)).toMatchObject({ valueNum: 4.4 });
    expect(store.readHistory(metric.instance.instanceId, { order: "asc" }).map((sample) => sample.valueNum)).toEqual([4.1, 4.4]);
  });

  it("persists materialization state for reusable derived metrics", () => {
    const dir = tempDir();
    const store = new DerivedMetricStore(dir);
    const metric = store.registerMetric({
      projectId: "project_element",
      metricKey: "system_cop",
      entityId: "WCC_06",
      formula: "cooling_load_kw / power_kw",
      dependencies: [
        { role: "cooling_load_kw", sourceId: "WCC-L1-06_Q", pointName: "WCC-L1-06_Q" },
        { role: "power_kw", sourceId: "WCC-L1-06_TLKW", pointName: "WCC-L1-06_TLKW" }
      ]
    });

    const materialization = store.configureMaterialization({
      instanceId: metric.instance.instanceId,
      enabled: true,
      formulaKind: "ratio",
      leftRole: "cooling_load_kw",
      rightRole: "power_kw",
      invalidValuePolicy: "null"
    });

    expect(materialization).toMatchObject({
      instanceId: metric.instance.instanceId,
      projectId: "project_element",
      enabled: true,
      formulaKind: "ratio",
      leftRole: "cooling_load_kw",
      rightRole: "power_kw",
      invalidValuePolicy: "null",
      status: "active"
    });

    const reopened = new DerivedMetricStore(dir);
    expect(reopened.readMaterialization(metric.instance.instanceId)).toMatchObject({
      enabled: true,
      formulaKind: "ratio",
      leftRole: "cooling_load_kw",
      rightRole: "power_kw"
    });
  });
});

describe("derived metric agent tools", () => {
  it("registers a reusable metric and writes one idempotent project-memory pointer", async () => {
    const dir = tempDir();
    const memory = new AgentMemoryStore(dir);
    const metrics = new DerivedMetricStore(dir);
    const registry = createGenericToolRegistry(
      memory,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      metrics
    );
    const register = registry.list().find((tool) => tool.name === "derived_metric_register");
    const lookup = registry.list().find((tool) => tool.name === "derived_metric_lookup");
    const read = registry.list().find((tool) => tool.name === "derived_metric_read");
    expect(register).toBeDefined();
    expect(lookup).toBeDefined();
    expect(read).toBeDefined();

    const context = {
      projectId: "project_element",
      userId: "user_buildinggpt",
      requestId: "req_metric",
      conversationId: "conv_metric",
      canConfigure: true,
      messages: []
    };
    const args = {
      metricKey: "system_cop",
      entityId: "WCC_03",
      formula: "WCC-L1-03_Q / WCC-L1-03_P",
      dependencies: [
        { role: "cooling_load_kw", sourceId: "WCC-L1-03_Q", pointName: "WCC-L1-03_Q" },
        { role: "power_kw", sourceId: "WCC-L1-03_P", pointName: "WCC-L1-03_P" }
      ]
    };

    const first = await register!.run(args, context);
    const second = await register!.run(args, context);
    const found = await lookup!.run({ metricKey: "system_cop", entityId: "WCC_03" }, context);
    const underspecifiedRead = await read!.run({ metricKey: "system_cop" }, context);
    const projectMemory = memory.readBank("project_element", "user_buildinggpt", "project").entries;

    expect(first).toMatchObject({ created: true });
    expect(second).toMatchObject({ created: false });
    expect(found).toMatchObject({ total: 1 });
    expect(underspecifiedRead).toMatchObject({ error: "instanceId or metricKey+entityId is required" });
    expect(projectMemory.filter((entry) => entry.includes("WCC_03/system_cop"))).toHaveLength(1);
    expect(projectMemory[0]).toContain("Use derived_metric_read before recalculating");
  });

  it("calculates ratio metrics once, persists samples, and reuses existing latest values", async () => {
    const dir = tempDir();
    const memory = new AgentMemoryStore(dir);
    const metrics = new DerivedMetricStore(dir);
    const loadMetric = metrics.registerMetric({
      projectId: "project_element",
      metricKey: "cooling_load_kw",
      entityId: "WCC_09",
      formula: "source cooling load",
      dependencies: [{ role: "source", sourceId: "WCC-L1-09_Q" }]
    });
    const powerMetric = metrics.registerMetric({
      projectId: "project_element",
      metricKey: "power_kw",
      entityId: "WCC_09",
      formula: "source power",
      dependencies: [{ role: "source", sourceId: "WCC-L1-09_P" }]
    });
    for (const [ts, load, power] of [
      ["2026-06-26T00:00:00.000Z", 100, 25],
      ["2026-06-26T00:15:00.000Z", 120, 30]
    ] as const) {
      metrics.recordSample({ instanceId: loadMetric.instance.instanceId, ts, valueNum: load });
      metrics.recordSample({ instanceId: powerMetric.instance.instanceId, ts, valueNum: power });
    }

    const registry = createGenericToolRegistry(
      memory,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      metrics
    );
    const calculate = registry.list().find((tool) => tool.name === "derived_metric_calculate");
    expect(calculate).toBeDefined();
    const context = {
      projectId: "project_element",
      userId: "user_buildinggpt",
      requestId: "req_calc_cop",
      conversationId: "conv_calc_cop",
      canConfigure: true,
      messages: []
    };

    const first = await calculate!.run({
      metricKey: "system_cop",
      entityId: "WCC_09",
      displayName: "WCC-09 System COP",
      formulaKind: "ratio",
      numeratorRole: "cooling_load_kw",
      denominatorRole: "power_kw",
      from: "2026-06-26T00:00:00.000Z",
      to: "2026-06-26T01:00:00.000Z",
      dependencies: [
        { role: "cooling_load_kw", sourceType: "metric", sourceId: loadMetric.instance.instanceId },
        { role: "power_kw", sourceType: "metric", sourceId: powerMetric.instance.instanceId }
      ]
    }, context);

    expect(first).toMatchObject({
      created: true,
      calculated: true,
      reused: false,
      sampleCount: 2,
      latest: { valueNum: 4 },
      dashboardBinding: {
        source: "derived_metric",
        metricKey: "system_cop",
        entityId: "WCC_09",
        label: "WCC-09 System COP",
        role: "output",
        defaultVisible: true
      },
      inputDashboardBindings: [
        expect.objectContaining({
          source: "derived_metric",
          metricInstanceId: loadMetric.instance.instanceId,
          entityId: "WCC_09",
          role: "cooling_load_kw",
          dependencyRole: "input",
          defaultVisible: false
        }),
        expect.objectContaining({
          source: "derived_metric",
          metricInstanceId: powerMetric.instance.instanceId,
          entityId: "WCC_09",
          role: "power_kw",
          dependencyRole: "input",
          defaultVisible: false
        })
      ]
    });

    const second = await calculate!.run({
      metricKey: "system_cop",
      entityId: "WCC_09",
      formulaKind: "ratio",
      from: "2026-06-26T00:00:00.000Z"
    }, context);
    const found = metrics.lookup({ projectId: "project_element", metricKey: "system_cop", entityId: "WCC_09" });
    const history = metrics.readHistory(found[0]!.instanceId, { order: "asc" });
    const projectMemory = memory.readBank("project_element", "user_buildinggpt", "project").entries;

    expect(second).toMatchObject({
      reused: true,
      calculated: false,
      created: false,
      latest: { valueNum: 4 },
      inputDashboardBindings: [
        expect.objectContaining({ dependencyRole: "input", defaultVisible: false }),
        expect.objectContaining({ dependencyRole: "input", defaultVisible: false })
      ]
    });
    expect(found).toHaveLength(1);
    expect(history.map((sample) => sample.valueNum)).toEqual([4, 4]);
    expect(projectMemory.filter((entry) => entry.includes("WCC_09/system_cop"))).toHaveLength(1);
  });

  it("aligns different-frequency dependencies with nearest policy", async () => {
    const dir = tempDir();
    const memory = new AgentMemoryStore(dir);
    const metrics = new DerivedMetricStore(dir);
    const loadMetric = metrics.registerMetric({
      projectId: "project_element",
      metricKey: "cooling_load_kw",
      entityId: "WCC_15",
      formula: "source cooling load",
      dependencies: [{ role: "source", sourceId: "WCC-L1-15_Q" }]
    });
    const powerMetric = metrics.registerMetric({
      projectId: "project_element",
      metricKey: "power_kw",
      entityId: "WCC_15",
      formula: "source power",
      dependencies: [{ role: "source", sourceId: "WCC-L1-15_P" }]
    });
    metrics.recordSample({ instanceId: loadMetric.instance.instanceId, ts: "2026-06-26T00:00:00.000Z", valueNum: 100 });
    metrics.recordSample({ instanceId: loadMetric.instance.instanceId, ts: "2026-06-26T00:15:00.000Z", valueNum: 120 });
    metrics.recordSample({ instanceId: powerMetric.instance.instanceId, ts: "2026-06-26T00:02:00.000Z", valueNum: 25 });
    metrics.recordSample({ instanceId: powerMetric.instance.instanceId, ts: "2026-06-26T00:17:00.000Z", valueNum: 30 });

    const registry = createGenericToolRegistry(
      memory,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      metrics
    );
    const calculate = registry.list().find((tool) => tool.name === "derived_metric_calculate");
    const result = await calculate!.run({
      metricKey: "system_cop",
      entityId: "WCC_15",
      displayName: "WCC-15 System COP",
      formulaKind: "ratio",
      numeratorRole: "cooling_load_kw",
      denominatorRole: "power_kw",
      from: "2026-06-26T00:00:00.000Z",
      to: "2026-06-26T01:00:00.000Z",
      dependencies: [
        { role: "cooling_load_kw", sourceType: "metric", sourceId: loadMetric.instance.instanceId },
        { role: "power_kw", sourceType: "metric", sourceId: powerMetric.instance.instanceId }
      ]
    }, {
      projectId: "project_element",
      userId: "user_buildinggpt",
      requestId: "req_calc_nearest_alignment",
      conversationId: "conv_calc_nearest_alignment",
      canConfigure: true,
      messages: []
    });

    const found = metrics.lookup({ projectId: "project_element", metricKey: "system_cop", entityId: "WCC_15" });
    const history = metrics.readHistory(found[0]!.instanceId, { order: "asc" });
    const materialization = metrics.readMaterialization(found[0]!.instanceId);

    expect(result).toMatchObject({
      calculated: true,
      sampleCount: 2,
      alignmentPolicy: "nearest",
      alignmentToleranceSeconds: 300,
      latest: { valueNum: 4 }
    });
    expect(history.map((sample) => sample.valueNum)).toEqual([4, 4]);
    expect(history[0]).toMatchObject({
      ts: "2026-06-26T00:00:00.000Z",
      metadata: {
        alignmentPolicy: "nearest",
        alignmentToleranceSeconds: 300,
        inputTimestamps: {
          cooling_load_kw: "2026-06-26T00:00:00.000Z",
          power_kw: "2026-06-26T00:02:00.000Z"
        },
        inputLagSeconds: {
          cooling_load_kw: 0,
          power_kw: 120
        }
      }
    });
    expect(materialization).toMatchObject({
      alignmentPolicy: "nearest",
      alignmentToleranceSeconds: 300
    });
  });

  it("adds derived metric inputs to dashboard live values and hidden trend audit series", async () => {
    const dir = tempDir();
    const memory = new AgentMemoryStore(dir);
    const metrics = new DerivedMetricStore(dir);
    const metric = metrics.registerMetric({
      projectId: "project_element",
      metricKey: "system_cop",
      entityId: "WCC_14",
      displayName: "WCC-14 System COP",
      unit: "ratio",
      formula: "cooling_load_kw / power_kw",
      dependencies: [
        { role: "cooling_load_kw", sourceType: "raw_point", sourceId: "1401", pointName: "WCC-L1-14_Q", unit: "kW", label: "Cooling Load" },
        { role: "power_kw", sourceType: "raw_point", sourceId: "1402", pointName: "WCC-L1-14_P", unit: "kW", label: "Power" }
      ]
    });
    const registry = createGenericToolRegistry(
      memory,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      metrics
    );
    const dashboardCreate = registry.list().find((tool) => tool.name === "dashboard_create");
    const context = {
      projectId: "project_element",
      userId: "user_buildinggpt",
      requestId: "req_dashboard_audit_inputs",
      conversationId: "conv_dashboard_audit_inputs",
      canConfigure: true,
      messages: [],
      dashboardOps: {
        create: (input: any) => ({
          id: "dash_audit_inputs",
          projectId: "project_element",
          ownerUserId: "user_buildinggpt",
          visibility: input.visibility ?? "project",
          createdAt: "2026-06-27T00:00:00.000Z",
          updatedAt: "2026-06-27T00:00:00.000Z",
          ...input
        })
      }
    };

    const result = await dashboardCreate!.run({
      title: "Derived audit dashboard",
      widgets: [
        {
          id: "wcc_14_live",
          kind: "live_value_grid",
          title: "WCC-14 Live",
          pointBindings: [
            { pointName: "WCC-L1-14_COP", label: "BMS COP", entityId: "WCC_14" },
            { source: "derived_metric", metricInstanceId: metric.instance.instanceId, label: "System COP" }
          ]
        },
        {
          id: "wcc_14_trend",
          kind: "timeseries_chart",
          title: "WCC-14 Trend",
          pointBindings: [
            { pointName: "WCC-L1-14_COP", label: "BMS COP", entityId: "WCC_14" },
            { source: "derived_metric", metricInstanceId: metric.instance.instanceId, label: "System COP" }
          ]
        }
      ]
    }, context);

    const widgets = (result.dashboard as any).widgets as Array<{ id: string; pointBindings: Array<Record<string, unknown>> }>;
    const live = widgets.find((widget) => widget.id === "wcc_14_live");
    const trend = widgets.find((widget) => widget.id === "wcc_14_trend");
    expect(live?.pointBindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "BMS COP", pointName: "WCC-L1-14_COP" }),
      expect.objectContaining({ source: "derived_metric", metricInstanceId: metric.instance.instanceId, dependencyRole: "output", defaultVisible: true }),
      expect.objectContaining({ source: "bms", pointName: "WCC-L1-14_Q", dependencyRole: "input", defaultVisible: true }),
      expect.objectContaining({ source: "bms", pointName: "WCC-L1-14_P", dependencyRole: "input", defaultVisible: true })
    ]));
    expect(trend?.pointBindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "BMS COP", pointName: "WCC-L1-14_COP" }),
      expect.objectContaining({ source: "derived_metric", metricInstanceId: metric.instance.instanceId, dependencyRole: "output", defaultVisible: true }),
      expect.objectContaining({ source: "bms", pointName: "WCC-L1-14_Q", dependencyRole: "input", defaultVisible: false }),
      expect.objectContaining({ source: "bms", pointName: "WCC-L1-14_P", dependencyRole: "input", defaultVisible: false })
    ]));
  });

  it("splits combined derived dashboard widgets after adding audit inputs", async () => {
    const dir = tempDir();
    const memory = new AgentMemoryStore(dir);
    const metrics = new DerivedMetricStore(dir);
    const metric14 = metrics.registerMetric({
      projectId: "project_element",
      metricKey: "system_cop",
      entityId: "WCC_14",
      displayName: "WCC-14 System COP",
      formula: "cooling_load_kw / power_kw",
      dependencies: [
        { role: "cooling_load_kw", sourceType: "raw_point", sourceId: "1401", pointName: "WCC-L1-14_Q", label: "Cooling Load" },
        { role: "power_kw", sourceType: "raw_point", sourceId: "1402", pointName: "WCC-L1-14_P", label: "Power" }
      ]
    });
    const metric15 = metrics.registerMetric({
      projectId: "project_element",
      metricKey: "system_cop",
      entityId: "WCC_15",
      displayName: "WCC-15 System COP",
      formula: "cooling_load_kw / power_kw",
      dependencies: [
        { role: "cooling_load_kw", sourceType: "raw_point", sourceId: "1501", pointName: "WCC-L1-15_Q", label: "Cooling Load" },
        { role: "power_kw", sourceType: "raw_point", sourceId: "1502", pointName: "WCC-L1-15_P", label: "Power" }
      ]
    });
    const registry = createGenericToolRegistry(
      memory,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      metrics
    );
    const dashboardCreate = registry.list().find((tool) => tool.name === "dashboard_create");
    const context = {
      projectId: "project_element",
      userId: "user_buildinggpt",
      requestId: "req_dashboard_split_inputs",
      conversationId: "conv_dashboard_split_inputs",
      canConfigure: true,
      messages: [],
      dashboardOps: {
        create: (input: any) => ({
          id: "dash_split_inputs",
          projectId: "project_element",
          ownerUserId: "user_buildinggpt",
          visibility: input.visibility ?? "project",
          createdAt: "2026-06-27T00:00:00.000Z",
          updatedAt: "2026-06-27T00:00:00.000Z",
          ...input
        })
      }
    };

    const result = await dashboardCreate!.run({
      title: "Combined derived dashboard",
      widgets: [
        {
          id: "fleet_live",
          kind: "live_value_grid",
          title: "Fleet Live",
          pointBindings: [
            { pointName: "WCC-L1-14_COP", label: "WCC-14 BMS COP", entityId: "WCC_14" },
            { source: "derived_metric", metricInstanceId: metric14.instance.instanceId, label: "WCC-14 System COP", entityId: "WCC_14" },
            { pointName: "WCC-L1-15_COP", label: "WCC-15 BMS COP", entityId: "WCC_15" },
            { source: "derived_metric", metricInstanceId: metric15.instance.instanceId, label: "WCC-15 System COP", entityId: "WCC_15" }
          ]
        },
        {
          id: "fleet_trend",
          kind: "timeseries_chart",
          title: "WCC-14 Trend",
          pointBindings: [
            { pointName: "WCC-L1-14_COP", label: "WCC-14 BMS COP", entityId: "WCC_14" },
            { source: "derived_metric", metricInstanceId: metric14.instance.instanceId, label: "WCC-14 System COP", entityId: "WCC_14" },
            { pointName: "WCC-L1-15_COP", label: "WCC-15 BMS COP", entityId: "WCC_15" },
            { source: "derived_metric", metricInstanceId: metric15.instance.instanceId, label: "WCC-15 System COP", entityId: "WCC_15" }
          ]
        },
        {
          id: "fleet_compare",
          kind: "bar_comparison",
          title: "Fleet Comparison",
          pointBindings: [
            { pointName: "WCC-L1-14_COP", label: "WCC-14 BMS COP", entityId: "WCC_14" },
            { source: "derived_metric", metricInstanceId: metric14.instance.instanceId, label: "WCC-14 System COP", entityId: "WCC_14" }
          ]
        }
      ]
    }, context);

    const widgets = (result.dashboard as any).widgets as Array<{ id: string; kind: string; title: string; pointBindings: Array<Record<string, unknown>> }>;
    const liveWidgets = widgets.filter((widget) => widget.kind === "live_value_grid");
    const trendWidgets = widgets.filter((widget) => widget.kind === "timeseries_chart");
    const comparisonWidgets = widgets.filter((widget) => widget.kind === "bar_comparison");
    expect(liveWidgets).toHaveLength(2);
    expect(trendWidgets).toHaveLength(2);
    expect(comparisonWidgets).toHaveLength(2);
    expect(trendWidgets.map((widget) => widget.title)).toEqual([
      "WCC-14 Trend",
      "WCC-15 Trend"
    ]);
    expect(comparisonWidgets.map((widget) => widget.title)).toEqual([
      "Fleet Comparison — BMS COP",
      "Fleet Comparison — System COP"
    ]);
    for (const widget of comparisonWidgets) {
      expect(widget.pointBindings).toHaveLength(2);
      expect(new Set(widget.pointBindings.map((binding) => binding.entityId))).toEqual(new Set(["WCC_14", "WCC_15"]));
      expect(widget.pointBindings.every((binding) => binding.dependencyRole !== "input")).toBe(true);
    }
    expect(comparisonWidgets[0]?.pointBindings.every((binding) => binding.source !== "derived_metric")).toBe(true);
    expect(comparisonWidgets[1]?.pointBindings.every((binding) => binding.source === "derived_metric")).toBe(true);
    for (const widget of liveWidgets) {
      expect(new Set(widget.pointBindings.map((binding) => binding.entityId))).toHaveProperty("size", 1);
      expect(widget.pointBindings).toHaveLength(4);
      expect(widget.pointBindings.filter((binding) => binding.dependencyRole === "input")).toHaveLength(2);
      expect(widget.pointBindings.filter((binding) => binding.defaultVisible === true)).toHaveLength(3);
    }
    for (const widget of trendWidgets) {
      expect(new Set(widget.pointBindings.map((binding) => binding.entityId))).toHaveProperty("size", 1);
      expect(widget.pointBindings).toHaveLength(4);
      expect(widget.pointBindings.filter((binding) => binding.dependencyRole === "input" && binding.defaultVisible === false)).toHaveLength(2);
    }
  });

  it("expands persisted calculations to at least a 30-day history window", async () => {
    const dir = tempDir();
    const memory = new AgentMemoryStore(dir);
    const metrics = new DerivedMetricStore(dir);
    const loadMetric = metrics.registerMetric({
      projectId: "project_element",
      metricKey: "cooling_load_kw",
      entityId: "WCC_13",
      formula: "source cooling load",
      dependencies: [{ role: "source", sourceId: "WCC-L1-13_Q" }]
    });
    const powerMetric = metrics.registerMetric({
      projectId: "project_element",
      metricKey: "power_kw",
      entityId: "WCC_13",
      formula: "source power",
      dependencies: [{ role: "source", sourceId: "WCC-L1-13_P" }]
    });
    for (const [ts, load, power] of [
      ["2026-06-01T00:00:00.000Z", 100, 25],
      ["2026-06-29T00:00:00.000Z", 120, 30]
    ] as const) {
      metrics.recordSample({ instanceId: loadMetric.instance.instanceId, ts, valueNum: load });
      metrics.recordSample({ instanceId: powerMetric.instance.instanceId, ts, valueNum: power });
    }

    const registry = createGenericToolRegistry(
      memory,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      metrics
    );
    const calculate = registry.list().find((tool) => tool.name === "derived_metric_calculate");
    const context = {
      projectId: "project_element",
      userId: "user_buildinggpt",
      requestId: "req_calc_window",
      conversationId: "conv_calc_window",
      canConfigure: true,
      messages: []
    };

    const result = await calculate!.run({
      metricKey: "system_cop",
      entityId: "WCC_13",
      displayName: "WCC-13 System COP",
      formulaKind: "ratio",
      numeratorRole: "cooling_load_kw",
      denominatorRole: "power_kw",
      from: "2026-06-29T00:00:00.000Z",
      to: "2026-06-30T00:00:00.000Z",
      dependencies: [
        { role: "cooling_load_kw", sourceType: "metric", sourceId: loadMetric.instance.instanceId },
        { role: "power_kw", sourceType: "metric", sourceId: powerMetric.instance.instanceId }
      ]
    }, context);

    const found = metrics.lookup({ projectId: "project_element", metricKey: "system_cop", entityId: "WCC_13" });
    const history = metrics.readHistory(found[0]!.instanceId, { order: "asc" });

    expect(result).toMatchObject({
      calculated: true,
      sampleCount: 2,
      sourceWindow: {
        from: "2026-05-31T00:00:00.000Z",
        to: "2026-06-30T00:00:00.000Z",
        minimumDays: 30,
        expandedFrom: true
      }
    });
    expect(history.map((sample) => sample.valueNum)).toEqual([4, 4]);
  });

  it("defaults non-calculable ratio samples to null-like invalid values", async () => {
    const dir = tempDir();
    const memory = new AgentMemoryStore(dir);
    const metrics = new DerivedMetricStore(dir);
    const loadMetric = metrics.registerMetric({
      projectId: "project_element",
      metricKey: "cooling_load_kw",
      entityId: "WCC_14",
      formula: "source cooling load",
      dependencies: [{ role: "source", sourceId: "WCC-L1-14_Q" }]
    });
    const powerMetric = metrics.registerMetric({
      projectId: "project_element",
      metricKey: "power_kw",
      entityId: "WCC_14",
      formula: "source power",
      dependencies: [{ role: "source", sourceId: "WCC-L1-14_P" }]
    });
    metrics.recordSample({ instanceId: loadMetric.instance.instanceId, ts: "2026-06-26T00:00:00.000Z", valueNum: 100 });
    metrics.recordSample({ instanceId: powerMetric.instance.instanceId, ts: "2026-06-26T00:00:00.000Z", valueNum: 0 });

    const registry = createGenericToolRegistry(
      memory,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      metrics
    );
    const calculate = registry.list().find((tool) => tool.name === "derived_metric_calculate");
    const result = await calculate!.run({
      metricKey: "system_cop",
      entityId: "WCC_14",
      displayName: "WCC-14 System COP",
      formulaKind: "ratio",
      numeratorRole: "cooling_load_kw",
      denominatorRole: "power_kw",
      from: "2026-06-26T00:00:00.000Z",
      to: "2026-06-27T00:00:00.000Z",
      dependencies: [
        { role: "cooling_load_kw", sourceType: "metric", sourceId: loadMetric.instance.instanceId },
        { role: "power_kw", sourceType: "metric", sourceId: powerMetric.instance.instanceId }
      ]
    }, {
      projectId: "project_element",
      userId: "user_buildinggpt",
      requestId: "req_calc_null_fallback",
      conversationId: "conv_calc_null_fallback",
      canConfigure: true,
      messages: []
    });

    const found = metrics.lookup({ projectId: "project_element", metricKey: "system_cop", entityId: "WCC_14" });
    const history = metrics.readHistory(found[0]!.instanceId, { order: "asc" });

    expect(result).toMatchObject({
      created: true,
      calculated: true,
      sampleCount: 1,
      fallbackCount: 1,
      invalidValuePolicy: "null",
      latest: {
        valueText: "N/A",
        quality: "invalid",
        status: "not_calculable"
      }
    });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      valueText: "N/A",
      quality: "invalid",
      status: "not_calculable",
      metadata: {
        invalidValuePolicy: "null",
        invalidReason: "division_by_zero"
      }
    });
    expect(history[0]!.valueNum).toBeUndefined();
  });

  it("persists zero fallback only when the agent selects zero policy", async () => {
    const dir = tempDir();
    const memory = new AgentMemoryStore(dir);
    const metrics = new DerivedMetricStore(dir);
    const loadMetric = metrics.registerMetric({
      projectId: "project_element",
      metricKey: "cooling_load_kw",
      entityId: "WCC_14",
      formula: "source cooling load",
      dependencies: [{ role: "source", sourceId: "WCC-L1-14_Q" }]
    });
    const powerMetric = metrics.registerMetric({
      projectId: "project_element",
      metricKey: "power_kw",
      entityId: "WCC_14",
      formula: "source power",
      dependencies: [{ role: "source", sourceId: "WCC-L1-14_P" }]
    });
    metrics.recordSample({ instanceId: loadMetric.instance.instanceId, ts: "2026-06-26T00:00:00.000Z", valueNum: 100 });
    metrics.recordSample({ instanceId: powerMetric.instance.instanceId, ts: "2026-06-26T00:00:00.000Z", valueNum: 0 });

    const registry = createGenericToolRegistry(
      memory,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      metrics
    );
    const calculate = registry.list().find((tool) => tool.name === "derived_metric_calculate");
    const result = await calculate!.run({
      metricKey: "system_cop",
      entityId: "WCC_14",
      displayName: "WCC-14 System COP",
      formulaKind: "ratio",
      invalidValuePolicy: "zero",
      numeratorRole: "cooling_load_kw",
      denominatorRole: "power_kw",
      from: "2026-06-26T00:00:00.000Z",
      to: "2026-06-27T00:00:00.000Z",
      dependencies: [
        { role: "cooling_load_kw", sourceType: "metric", sourceId: loadMetric.instance.instanceId },
        { role: "power_kw", sourceType: "metric", sourceId: powerMetric.instance.instanceId }
      ]
    }, {
      projectId: "project_element",
      userId: "user_buildinggpt",
      requestId: "req_calc_zero_fallback",
      conversationId: "conv_calc_zero_fallback",
      canConfigure: true,
      messages: []
    });

    const found = metrics.lookup({ projectId: "project_element", metricKey: "system_cop", entityId: "WCC_14" });
    const history = metrics.readHistory(found[0]!.instanceId, { order: "asc" });

    expect(result).toMatchObject({
      created: true,
      calculated: true,
      sampleCount: 1,
      fallbackCount: 1,
      invalidValuePolicy: "zero",
      latest: {
        valueNum: 0,
        quality: "invalid",
        status: "fallback_zero"
      }
    });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      valueNum: 0,
      quality: "invalid",
      status: "fallback_zero",
      metadata: {
        invalidValuePolicy: "zero",
        invalidReason: "division_by_zero",
      }
    });
  });

  it("calculates Delta T style difference metrics", async () => {
    const dir = tempDir();
    const memory = new AgentMemoryStore(dir);
    const metrics = new DerivedMetricStore(dir);
    const returnMetric = metrics.registerMetric({
      projectId: "project_element",
      metricKey: "return_temp",
      entityId: "WCC_10",
      formula: "source return temperature",
      dependencies: [{ role: "source", sourceId: "WCC-L1-10_CHWRT" }]
    });
    const supplyMetric = metrics.registerMetric({
      projectId: "project_element",
      metricKey: "supply_temp",
      entityId: "WCC_10",
      formula: "source supply temperature",
      dependencies: [{ role: "source", sourceId: "WCC-L1-10_CHWST" }]
    });
    metrics.recordSample({ instanceId: returnMetric.instance.instanceId, ts: "2026-06-26T00:00:00.000Z", valueNum: 12.5 });
    metrics.recordSample({ instanceId: supplyMetric.instance.instanceId, ts: "2026-06-26T00:00:00.000Z", valueNum: 7.25 });

    const registry = createGenericToolRegistry(
      memory,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      metrics
    );
    const calculate = registry.list().find((tool) => tool.name === "derived_metric_calculate");
    const result = await calculate!.run({
      metricKey: "delta_t",
      entityId: "WCC_10",
      displayName: "WCC-10 Delta T",
      unit: "degC",
      formulaKind: "difference",
      minuendRole: "return_temp",
      subtrahendRole: "supply_temp",
      from: "2026-06-26T00:00:00.000Z",
      to: "2026-06-26T01:00:00.000Z",
      dependencies: [
        { role: "return_temp", sourceType: "metric", sourceId: returnMetric.instance.instanceId },
        { role: "supply_temp", sourceType: "metric", sourceId: supplyMetric.instance.instanceId }
      ]
    }, {
      projectId: "project_element",
      userId: "user_buildinggpt",
      requestId: "req_calc_delta_t",
      conversationId: "conv_calc_delta_t",
      canConfigure: true,
      messages: []
    });

    expect(result).toMatchObject({
      created: true,
      calculated: true,
      sampleCount: 1,
      latest: { valueNum: 5.25 },
      dashboardBinding: {
        source: "derived_metric",
        metricKey: "delta_t",
        entityId: "WCC_10",
        unit: "degC"
      }
    });
  });

  it("previews Delta T calculations without persistence before approval", async () => {
    const dir = tempDir();
    const memory = new AgentMemoryStore(dir);
    const metrics = new DerivedMetricStore(dir);
    const returnMetric = metrics.registerMetric({
      projectId: "project_element",
      metricKey: "return_temp",
      entityId: "WCC_11",
      formula: "source return temperature",
      dependencies: [{ role: "source", sourceId: "WCC-L1-11_CHWRT" }]
    });
    const supplyMetric = metrics.registerMetric({
      projectId: "project_element",
      metricKey: "supply_temp",
      entityId: "WCC_11",
      formula: "source supply temperature",
      dependencies: [{ role: "source", sourceId: "WCC-L1-11_CHWST" }]
    });
    metrics.recordSample({ instanceId: returnMetric.instance.instanceId, ts: "2026-06-26T00:00:00.000Z", valueNum: 13.25 });
    metrics.recordSample({ instanceId: supplyMetric.instance.instanceId, ts: "2026-06-26T00:00:00.000Z", valueNum: 7 });

    const registry = createGenericToolRegistry(
      memory,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      metrics
    );
    const preview = registry.list().find((tool) => tool.name === "derived_metric_preview");
    const calculate = registry.list().find((tool) => tool.name === "derived_metric_calculate");
    expect(preview).toBeDefined();
    expect(calculate).toBeDefined();
    const context = {
      projectId: "project_element",
      userId: "user_buildinggpt",
      requestId: "req_preview_delta_t",
      conversationId: "conv_preview_delta_t",
      canConfigure: true,
      messages: []
    };

    const previewResult = await preview!.run({
      metricKey: "delta_t",
      entityId: "WCC_11",
      displayName: "WCC-11 Delta T",
      unit: "degC",
      formulaKind: "difference",
      minuendRole: "return_temp",
      subtrahendRole: "supply_temp",
      from: "2026-06-26T00:00:00.000Z",
      to: "2026-06-26T01:00:00.000Z",
      dependencies: [
        { role: "return_temp", sourceType: "metric", sourceId: returnMetric.instance.instanceId },
        { role: "supply_temp", sourceType: "metric", sourceId: supplyMetric.instance.instanceId }
      ]
    }, context);

    expect(previewResult).toMatchObject({
      preview: true,
      persisted: false,
      calculated: true,
      sampleCount: 1,
      latestPreview: { value: 6.25 },
      persistCandidate: {
        tool: "derived_metric_calculate",
        args: {
          metricKey: "delta_t",
          entityId: "WCC_11",
          formulaKind: "difference"
        }
      }
    });
    expect(metrics.lookup({ projectId: "project_element", metricKey: "delta_t", entityId: "WCC_11" })).toHaveLength(0);
    expect(memory.readBank("project_element", "user_buildinggpt", "project").entries).toHaveLength(0);

    const persistArgs = (previewResult as { persistCandidate?: { args?: Record<string, unknown> } }).persistCandidate?.args;
    expect(persistArgs).toBeDefined();
    const saved = await calculate!.run(persistArgs!, context);
    const found = metrics.lookup({ projectId: "project_element", metricKey: "delta_t", entityId: "WCC_11" });

    expect(saved).toMatchObject({
      created: true,
      calculated: true,
      latest: { valueNum: 6.25 }
    });
    expect(found).toHaveLength(1);
    expect(metrics.readHistory(found[0]!.instanceId).map((sample) => sample.valueNum)).toEqual([6.25]);
    expect(memory.readBank("project_element", "user_buildinggpt", "project").entries
      .filter((entry) => entry.includes("WCC_11/delta_t"))).toHaveLength(1);
  });
});
