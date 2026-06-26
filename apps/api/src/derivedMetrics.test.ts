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
        label: "WCC-09 System COP"
      }
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
      latest: { valueNum: 4 }
    });
    expect(found).toHaveLength(1);
    expect(history.map((sample) => sample.valueNum)).toEqual([4, 4]);
    expect(projectMemory.filter((entry) => entry.includes("WCC_09/system_cop"))).toHaveLength(1);
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
