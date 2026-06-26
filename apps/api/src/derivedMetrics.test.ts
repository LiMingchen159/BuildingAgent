import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
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
});
