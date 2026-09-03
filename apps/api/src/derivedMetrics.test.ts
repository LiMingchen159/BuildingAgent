import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DerivedMetricHistoryTooLargeError, DerivedMetricStore } from "./derivedMetrics.js";
import { createGenericToolRegistry } from "./agent/genericTools.js";
import { AgentMemoryStore } from "./agent/memory.js";
import { indexRepository, repoRootForProject } from "./agent/knowledgeBase.js";
import { toolCacheDataRelativePath, toolCacheManifestRelativePath } from "./agent/toolCacheManifest.js";
import { RequestToolExecutionPolicy } from "./agent/requestToolExecutionPolicy.js";

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "ba-derived-metrics-"));
}

afterEach(() => {
  for (const projectId of ["project_batch_history", "project_batch_bounds", "project_cache_symlink"]) {
    rmSync(path.dirname(repoRootForProject(projectId)), { recursive: true, force: true });
  }
});

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

  it("refreshes dependencies when an existing metric is registered again", () => {
    const store = new DerivedMetricStore(tempDir());
    const first = store.registerMetric({
      projectId: "project_element",
      metricKey: "chiller_low_cop_detection",
      entityId: "WCC_01",
      displayName: "Chiller Low COP Detection",
      formula: "old low cop spec",
      formulaVersion: "v1",
      dependencies: [
        { role: "chiller_status", sourceId: "WCC_1_Run_Status", pointName: "WCC_1_Run_Status" },
        { role: "chw_supply_temp", sourceId: "WCC-L1-01-CHWST", pointName: "WCC-L1-01-CHWST" },
        { role: "chw_return_temp", sourceId: "WCC-L1-01-CHWRT", pointName: "WCC-L1-01-CHWRT" },
        { role: "cooling_load", sourceId: "WCC-L1-01_Q", pointName: "WCC-L1-01_Q" },
        { role: "chiller_power", sourceId: "WCC_1_TLKW", pointName: "WCC_1_TLKW" }
      ]
    });

    const second = store.registerMetric({
      projectId: "project_element",
      metricKey: "chiller_low_cop_detection",
      entityId: "WCC_01",
      displayName: "Chiller Low COP Detection",
      formula: "direct cooling load low cop spec",
      formulaVersion: "v2",
      dependencies: [
        { role: "chiller_status", sourceId: "WCC_1_Run_Status", pointName: "WCC_1_Run_Status" },
        { role: "cooling_load", sourceId: "WCC-L1-01_Q", pointName: "WCC-L1-01_Q" },
        { role: "chiller_power", sourceId: "WCC_1_TLKW", pointName: "WCC_1_TLKW" }
      ]
    });

    expect(second.created).toBe(false);
    expect(second.instance.instanceId).toBe(first.instance.instanceId);
    expect(second.instance.formulaVersion).toBe("v2");
    expect(second.instance.dependencies.map((dependency) => dependency.role).sort()).toEqual([
      "chiller_power",
      "chiller_status",
      "cooling_load"
    ]);
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

  it("batch-reads more than the legacy 20k per-series limit without truncation", () => {
    const dir = tempDir();
    const store = new DerivedMetricStore(dir);
    const metric = store.registerMetric({
      projectId: "project_element",
      metricKey: "system_cop",
      entityId: "WCC_20K",
      formula: "cooling_load_kw / power_kw",
      dependencies: [{ role: "source", sourceId: "WCC_20K_COP" }]
    }).instance;
    const db = new Database(path.join(dir, "derived_metrics.db"));
    const insert = db.prepare(`
      INSERT INTO metric_samples (
        sample_id, instance_id, project_id, ts, value_num, value_text, quality, status,
        formula_version_id, calculation_run_id, source_window_start, source_window_end,
        metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, NULL, 'good', 'ok', ?, 'batch_test', NULL, NULL, NULL, ?)
    `);
    const insertAll = db.transaction(() => {
      for (let index = 0; index < 20_001; index += 1) {
        const ts = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
        insert.run(`sample_${index}`, metric.instanceId, metric.projectId, ts, index / 100, metric.versionId, ts);
      }
    });
    insertAll();
    db.close();

    const batch = store.readHistoryBatch([metric.instanceId], {
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-02T00:00:00.000Z"
    });
    expect(batch.complete).toBe(true);
    expect(batch.totalRows).toBe(20_001);
    expect(batch.histories.get(metric.instanceId)).toHaveLength(20_001);
    expect(Object.keys(batch.histories.get(metric.instanceId)![0]!).sort()).toEqual([
      "quality",
      "status",
      "ts",
      "valueNum"
    ]);
    expect(() => store.readHistoryBatch([metric.instanceId], { maxRows: 20_000 }))
      .toThrowError(DerivedMetricHistoryTooLargeError);
  });

  it("counts UTF-8 bytes conservatively for the batch byte gate", () => {
    const store = new DerivedMetricStore(tempDir());
    const metric = store.registerMetric({
      projectId: "project_element",
      metricKey: "system_cop",
      entityId: "WCC_UTF8",
      formula: "cooling_load_kw / power_kw",
      dependencies: [{ role: "source", sourceId: "WCC_UTF8_COP" }]
    }).instance;
    store.recordSample({
      instanceId: metric.instanceId,
      ts: "2026-06-01T00:00:00.000Z",
      valueText: "冷".repeat(100)
    });

    expect(() => store.readHistoryBatch([metric.instanceId], { maxBytes: 300 }))
      .toThrowError(DerivedMetricHistoryTooLargeError);
  });

  it("enforces the batch byte gate against actual JSON escaping", () => {
    const store = new DerivedMetricStore(tempDir());
    const metric = store.registerMetric({
      projectId: "project_element",
      metricKey: "system_cop",
      entityId: "WCC_ESCAPED_JSON",
      formula: "cooling_load_kw / power_kw",
      dependencies: [{ role: "source", sourceId: "WCC_ESCAPED_JSON_COP" }]
    }).instance;
    store.recordSample({
      instanceId: metric.instanceId,
      ts: "2026-06-01T00:00:00.000Z",
      valueText: "\\".repeat(200)
    });

    try {
      store.readHistoryBatch([metric.instanceId], { maxBytes: 450 });
      throw new Error("expected actual JSON byte gate to reject escaped data");
    } catch (error) {
      expect(error).toBeInstanceOf(DerivedMetricHistoryTooLargeError);
      expect((error as DerivedMetricHistoryTooLargeError).estimatedBytes).toBeGreaterThan(450);
    }
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
  it("prepares multiple histories as one local dataset with unique series labels", async () => {
    const dir = tempDir();
    const memory = new AgentMemoryStore(dir);
    const metrics = new DerivedMetricStore(dir);
    const instances = Array.from({ length: 8 }, (_, index) => `WCC_${String(index + 1).padStart(2, "0")}`).map((entityId) => metrics.registerMetric({
      projectId: "project_batch_history",
      metricKey: "system_cop",
      entityId,
      displayName: `${entityId} System COP`,
      unit: "ratio",
      formula: "cooling_load_kw / power_kw",
      dependencies: [{ role: "source", sourceId: `${entityId}_COP` }]
    }).instance);
    for (const [instanceIndex, instance] of instances.entries()) {
      for (let index = 0; index < 120; index += 1) {
        metrics.recordSample({
          instanceId: instance.instanceId,
          ts: new Date(Date.UTC(2026, 5, 1, 0, index * 15)).toISOString(),
          ...(instanceIndex === 0 && index === 119
            ? { valueText: "SHORT_RAW_VALUE_SENTINEL" }
            : { valueNum: 4 + instanceIndex + index / 100 }),
          quality: index === 10 ? "invalid" : "good"
        });
      }
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
    const batchSpy = vi.spyOn(metrics, "readHistoryBatch");
    const legacyReadSpy = vi.spyOn(metrics, "readHistory");
    const context = {
      projectId: "project_batch_history",
      userId: "user_buildinggpt",
      requestId: "req_batch_history",
      conversationId: "conv_batch_history",
      canConfigure: false,
      messages: [],
      toolCallId: "call_batch_history"
    };

    const dispatched = await registry.dispatch("derived_metric_history_prepare", {
      instanceIds: instances.map((instance) => instance.instanceId),
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-06-03T00:00:00.000Z"
    }, context);

    expect(dispatched.result.error).toBeUndefined();
    expect(dispatched.result.compacted).toBe(true);
    expect(JSON.stringify(dispatched.result)).not.toContain('"history"');
    const profiles = dispatched.result.series as Array<Record<string, unknown>>;
    expect(profiles).toHaveLength(8);
    expect(profiles.map((profile) => profile.label)).toEqual(
      Array.from({ length: 8 }, (_, index) => `system_cop:WCC_${String(index + 1).padStart(2, "0")}`)
    );
    expect(profiles[0]).toMatchObject({
      row_count: 120,
      median_interval_seconds: 900,
      numeric_min: 4,
      quality_counts: { good: 119, invalid: 1 }
    });

    const manifestPath = path.join(
      repoRootForProject(context.projectId),
      dispatched.result.cache_manifest as string
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      requestId: string;
      entries: Array<{ label: string; data_key: string }>;
    };
    expect(manifest.entries.map((entry) => entry.label)).toEqual(
      Array.from({ length: 8 }, (_, index) => `system_cop:WCC_${String(index + 1).padStart(2, "0")}`)
    );
    expect(manifest.entries).toHaveLength(8);
    expect(new Set(manifest.entries.map((entry) => entry.data_key)).size).toBe(8);
    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(batchSpy).toHaveBeenCalledWith(instances.map((instance) => instance.instanceId), {
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-06-03T00:00:00.000Z"
    });
    expect(legacyReadSpy).not.toHaveBeenCalled();
    const protectedContext = {
      ...context,
      localHistoryMode: true as const,
      localHistoryDatasetReady: true as const
    };

    const projectRepoRoot = repoRootForProject(context.projectId);
    const publicOutputDir = path.join(projectRepoRoot, "outputs");
    const preexistingSiblingPath = path.join(publicOutputDir, "preexisting-fresh-sibling.png");
    mkdirSync(publicOutputDir, { recursive: true });
    writeFileSync(preexistingSiblingPath, "PREEXISTING_SIBLING", "utf8");

    const cachedDataRelativePath = dispatched.result.data_file as string;
    const cachedDataAbsolutePath = path.join(projectRepoRoot, cachedDataRelativePath);
    const cacheAliasPath = path.join(publicOutputDir, "cache-alias.json");
    symlinkSync(cachedDataAbsolutePath, cacheAliasPath);
    const unprotectedReadContext = {
      ...context,
      requestId: "req_permanent_cache_read_guard",
      toolCallId: "call_permanent_cache_read_guard"
    };
    const protectedReadPaths = [
      `repo:/${cachedDataRelativePath}`,
      `repo:/outputs/not-a-directory/../.tool_cache/${path.basename(cachedDataRelativePath)}`,
      cachedDataAbsolutePath,
      "repo:/outputs/cache-alias.json"
    ];
    for (const protectedPath of protectedReadPaths) {
      const readAttempt = await registry.dispatch("read_file", { path: protectedPath }, unprotectedReadContext);
      expect(readAttempt.result.error).toBe("read_file_protected_repository_data");
      expect(JSON.stringify(readAttempt.result)).not.toContain("SHORT_RAW_VALUE_SENTINEL");
    }
    const cacheSearchAttempt = await registry.dispatch("search_files", {
      mode: "content",
      pattern: "SHORT_RAW_VALUE_SENTINEL"
    }, { ...unprotectedReadContext, toolCallId: "call_cache_search_guard" });
    expect(JSON.stringify(cacheSearchAttempt.result.matches)).not.toContain("SHORT_RAW_VALUE_SENTINEL");
    expect(cacheSearchAttempt.result).toMatchObject({ count: 0, matches: [] });

    const invalidManifestCases = [
      {
        requestId: "req_manifest_mismatch",
        setup(manifestFile: string) {
          writeFileSync(manifestFile, JSON.stringify(manifest), "utf8");
        }
      },
      {
        requestId: "req_manifest_symlink",
        setup(manifestFile: string) {
          symlinkSync(manifestPath, manifestFile);
        }
      },
      {
        requestId: "req_manifest_cross_cache",
        setup(manifestFile: string) {
          writeFileSync(manifestFile, JSON.stringify({
            ...manifest,
            requestId: "req_manifest_cross_cache",
            entries: manifest.entries.map((entry) => ({ ...entry, data_file: "outputs/not-cache.json" }))
          }), "utf8");
        }
      },
      {
        requestId: "req_manifest_other_request_data",
        setup(manifestFile: string) {
          writeFileSync(manifestFile, JSON.stringify({
            ...manifest,
            requestId: "req_manifest_other_request_data"
          }), "utf8");
        }
      }
    ];
    for (const invalidCase of invalidManifestCases) {
      const invalidManifestPath = path.join(projectRepoRoot, toolCacheManifestRelativePath(invalidCase.requestId));
      invalidCase.setup(invalidManifestPath);
      const invalidExecution = await registry.dispatch("execute_code", {
        code: "print('INVALID_MANIFEST_CODE_MUST_NOT_RUN')"
      }, {
        ...context,
        requestId: invalidCase.requestId,
        toolCallId: `call_${invalidCase.requestId}`,
        localHistoryMode: true,
        localHistoryDatasetReady: true
      });
      expect(invalidExecution.result).toMatchObject({ error: "history_dataset_not_prepared", exitCode: 1 });
      expect(invalidExecution.result.repoRoot).toBeUndefined();
      expect(invalidExecution.result.outputDir).toBeUndefined();
      expect(JSON.stringify(invalidExecution.result)).not.toContain("INVALID_MANIFEST_CODE_MUST_NOT_RUN");
    }

    for (const [tool, args] of [
      ["read_file", { path: `repo:/${cachedDataRelativePath}` }],
      ["search_files", { mode: "content", pattern: "SHORT_RAW_VALUE_SENTINEL" }],
      ["terminal", { command: `node -e "process.stdout.write('bypass')"` }],
      ["process_start", { command: "node -e \"process.stdout.write('bypass')\"" }],
      ["process_status", { process_id: "proc_000001" }],
      ["derived_metric_history_prepare", {
        instanceIds: [instances[0]!.instanceId],
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-06-03T00:00:00.000Z"
      }],
      ["derived_metric_read", {
        instanceId: instances[0]!.instanceId,
        mode: "history",
        limit: 10
      }]
    ] as const) {
      const bypassAttempt = await registry.dispatch(tool, args, {
        ...protectedContext,
        toolCallId: `call_block_${tool}`
      });
      expect(bypassAttempt.result.error).toBe("tool_blocked_during_local_history_analysis");
      expect(JSON.stringify(bypassAttempt.result)).not.toContain("SHORT_RAW_VALUE_SENTINEL");
    }

    const protectedExecution = await registry.dispatch("execute_code", {
      code: [
        "output_path = os.path.join(os.environ['OUTPUT_DIR'], 'protected-history-chart.png')",
        "with open(output_path, 'wb') as output_file: output_file.write(b'PNG')",
        "print('X' * 250000)"
      ].join("\n")
    }, { ...protectedContext, toolCallId: "call_protected_execute" });
    expect(protectedExecution.result).toMatchObject({
      stdoutSuppressed: true,
      truncated: true,
      exitCode: 1
    });
    expect(protectedExecution.result.error).toEqual(expect.any(String));
    expect(protectedExecution.result.repoRoot).toBeUndefined();
    expect(protectedExecution.result.outputDir).toBeUndefined();
    expect(String(protectedExecution.result.stdout)).toContain("execute_code_stdout_suppressed");
    expect(JSON.stringify(protectedExecution.result.generatedImages)).not.toContain("protected-history-chart.png");
    expect(protectedExecution.result.generatedImages).toEqual([
      expect.objectContaining({ filename: expect.stringMatching(/^chart_[0-9a-f]{12}_001\.png$/) })
    ]);
    expect(readFileSync(preexistingSiblingPath, "utf8")).toBe("PREEXISTING_SIBLING");

    const protectedStderrExecution = await registry.dispatch("execute_code", {
      code: [
        "import sys",
        "output_path = os.path.join(os.environ['OUTPUT_DIR'], 'protected-stderr-chart.png')",
        "with open(output_path, 'wb') as output_file: output_file.write(b'PNG')",
        "print('Y' * 250000, file=sys.stderr)"
      ].join("\n")
    }, { ...protectedContext, toolCallId: "call_protected_stderr_execute" });
    expect(protectedStderrExecution.result).toMatchObject({
      stderrSuppressed: true,
      truncated: true,
      exitCode: 1
    });
    expect(protectedStderrExecution.result.error).toEqual(expect.any(String));
    expect(String(protectedStderrExecution.result.stderr)).toContain("execute_code_stderr_suppressed");
    expect(JSON.stringify(protectedStderrExecution.result.generatedImages)).not.toContain("protected-stderr-chart.png");
    expect(protectedStderrExecution.result.generatedImages).toEqual([
      expect.objectContaining({ filename: expect.stringMatching(/^chart_[0-9a-f]{12}_001\.png$/) })
    ]);

    const shortRawStdout = await registry.dispatch("execute_code", {
      code: "print(load_series_by_label('system_cop:WCC_01')['value_text'].dropna().head().tolist())"
    }, { ...protectedContext, toolCallId: "call_short_raw_stdout" });
    expect(JSON.stringify(shortRawStdout.result)).not.toContain("SHORT_RAW_VALUE_SENTINEL");
    expect(shortRawStdout.result).toMatchObject({ stdoutSuppressed: true, truncated: true });
    expect(String(shortRawStdout.result.stdout)).toContain("execute_code_stdout_suppressed");

    const shortRawStderr = await registry.dispatch("execute_code", {
      code: [
        "import sys",
        "print(load_series_by_label('system_cop:WCC_01')['value_text'].dropna().head().tolist(), file=sys.stderr)"
      ].join("\n")
    }, { ...protectedContext, toolCallId: "call_short_raw_stderr" });
    expect(JSON.stringify(shortRawStderr.result)).not.toContain("SHORT_RAW_VALUE_SENTINEL");
    expect(shortRawStderr.result).toMatchObject({ stderrSuppressed: true, truncated: true });
    expect(String(shortRawStderr.result.stderr)).toContain("execute_code_stderr_suppressed");
    expect(JSON.stringify(registry.queryLogs({ tool: "execute_code", limit: 100 })))
      .not.toContain("SHORT_RAW_VALUE_SENTINEL");

    const secondRequestId = "req_batch_history_parallel";
    const secondPrepared = await registry.dispatch("derived_metric_history_prepare", {
      instanceIds: instances.map((instance) => instance.instanceId),
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-06-03T00:00:00.000Z"
    }, {
      ...context,
      requestId: secondRequestId,
      toolCallId: "call_batch_history_parallel_prepare"
    });
    expect(secondPrepared.result).toMatchObject({ compacted: true, series_count: 8 });
    const structureCode = [
      "output_path = os.path.join(os.environ['OUTPUT_DIR'], 'execution-layout.png')",
      "with open(output_path, 'wb') as output_file:",
      "    output_file.write((__file__ + '\\n' + os.environ['OUTPUT_DIR']).encode('utf-8'))"
    ].join("\n");
    const [firstParallelExecution, secondParallelExecution] = await Promise.all([
      registry.dispatch("execute_code", { code: structureCode }, {
        ...protectedContext,
        toolCallId: "call_parallel_execute_one"
      }),
      registry.dispatch("execute_code", { code: structureCode }, {
        ...protectedContext,
        requestId: secondRequestId,
        toolCallId: "call_parallel_execute_two"
      })
    ]);
    const parallelImages = [firstParallelExecution, secondParallelExecution].map((execution) => {
      const images = execution.result.generatedImages as Array<{ src: string; filename: string }>;
      expect(images).toEqual([
        expect.objectContaining({
          filename: expect.stringMatching(/^chart_[0-9a-f]{12}_001\.png$/),
          src: expect.stringMatching(/^outputs\/chart_[0-9a-f]{12}_001\.png$/)
        })
      ]);
      expect(execution.result.generatedDownloads).toEqual([]);
      return images[0]!;
    });
    const firstParallelImage = parallelImages[0]!;
    const secondParallelImage = parallelImages[1]!;
    expect(firstParallelImage.src).not.toBe(secondParallelImage.src);
    const executionLayouts = parallelImages.map((entry) =>
      readFileSync(path.join(projectRepoRoot, entry.src), "utf8").split("\n")
    );
    const firstExecutionLayout = executionLayouts[0]!;
    const secondExecutionLayout = executionLayouts[1]!;
    expect(firstExecutionLayout).toHaveLength(2);
    expect(secondExecutionLayout).toHaveLength(2);
    expect(firstExecutionLayout[0]).not.toBe(secondExecutionLayout[0]);
    expect(firstExecutionLayout[1]).not.toBe(secondExecutionLayout[1]);
    for (const layout of executionLayouts) {
      const scriptPath = layout[0]!;
      const privateOutputDir = layout[1]!;
      expect(path.dirname(scriptPath)).toBe(path.dirname(privateOutputDir));
      expect(path.basename(privateOutputDir)).toBe("outputs");
      expect(privateOutputDir).not.toBe(publicOutputDir);
      expect(scriptPath.startsWith(projectRepoRoot)).toBe(false);
      expect(privateOutputDir.startsWith(projectRepoRoot)).toBe(false);
    }
    expect(existsSync(preexistingSiblingPath)).toBe(true);
    expect(readFileSync(preexistingSiblingPath, "utf8")).toBe("PREEXISTING_SIBLING");
    const protectedTextArtifact = await registry.dispatch("execute_code", {
      code: [
        "secret = load_series_by_label('system_cop:WCC_01')['value_text'].dropna().head().tolist()[0]",
        "output_path = os.path.join(os.environ['OUTPUT_DIR'], f'{secret}.txt')",
        "with open(output_path, 'w', encoding='utf-8') as output_file: output_file.write(secret)"
      ].join("\n")
    }, { ...protectedContext, toolCallId: "call_protected_text_artifact" });
    expect(protectedTextArtifact.result.generatedDownloads).toEqual([]);
    expect(JSON.stringify(protectedTextArtifact.result)).not.toContain("SHORT_RAW_VALUE_SENTINEL");
    const indexedAfterHistoryOutputs = await indexRepository(context.projectId, projectRepoRoot);
    expect(JSON.stringify(indexedAfterHistoryOutputs)).not.toContain("execute_code/run-");
    expect(JSON.stringify(indexedAfterHistoryOutputs)).not.toContain("SHORT_RAW_VALUE_SENTINEL");

    const protectedPathSentinel = "PROTECTED_RELATIVE_PATH_SENTINEL";
    const protectedPathIsolation = await registry.dispatch("execute_code", {
      code: [
        "assert 'REPO_DIR' not in os.environ",
        "assert 'KB_DIR' not in os.environ",
        "assert 'PYTHONPATH' not in os.environ",
        `with open('${protectedPathSentinel}.txt', 'w', encoding='utf-8') as output_file: output_file.write('${protectedPathSentinel}')`,
        "for key in ('REPO_DIR', 'KB_DIR'):",
        "    target = os.environ.get(key)",
        "    if target:",
        `        with open(os.path.join(target, '${protectedPathSentinel}.txt'), 'w', encoding='utf-8') as output_file: output_file.write('${protectedPathSentinel}')`
      ].join("\n")
    }, { ...protectedContext, toolCallId: "call_protected_path_isolation" });
    expect(protectedPathIsolation.result.error).toBeUndefined();
    expect(protectedPathIsolation.result.generatedDownloads).toEqual([]);
    expect(existsSync(path.join(projectRepoRoot, `${protectedPathSentinel}.txt`))).toBe(false);
    expect(JSON.stringify(await indexRepository(context.projectId, projectRepoRoot)))
      .not.toContain(protectedPathSentinel);

    const [protectedSiblingExecution, ordinarySiblingExecution] = await Promise.all([
      registry.dispatch("execute_code", {
        code: [
          "output_path = os.path.join(os.environ['OUTPUT_DIR'], 'same-request-name.png')",
          "with open(output_path, 'wb') as output_file: output_file.write(b'PROTECTED')"
        ].join("\n")
      }, { ...protectedContext, toolCallId: "call_protected_sibling_execute" }),
      registry.dispatch("execute_code", {
        code: [
          "output_path = os.path.join(os.environ['OUTPUT_DIR'], 'same-request-name.png')",
          "with open(output_path, 'wb') as output_file: output_file.write(b'ORDINARY')"
        ].join("\n")
      }, {
        ...context,
        requestId: "req_ordinary_sibling_execute",
        toolCallId: "call_ordinary_sibling_execute"
      })
    ]);
    expect(protectedSiblingExecution.result.generatedImages).toEqual([
      expect.objectContaining({ filename: expect.stringMatching(/^chart_[0-9a-f]{12}_001\.png$/) })
    ]);
    expect(ordinarySiblingExecution.result.generatedImages).toEqual([
      expect.objectContaining({ filename: "same-request-name.png", src: "outputs/same-request-name.png" })
    ]);
    expect(JSON.stringify(ordinarySiblingExecution.result.generatedImages)).not.toContain("chart_");

    const ordinaryCollisionName = "ordinary-concurrent-collision.png";
    const [ordinaryCollisionA, ordinaryCollisionB] = await Promise.all([
      registry.dispatch("execute_code", {
        code: `with open(os.path.join(os.environ['OUTPUT_DIR'], '${ordinaryCollisionName}'), 'wb') as output_file: output_file.write(b'ORDINARY_A')`
      }, {
        ...context,
        requestId: "req_ordinary_collision_a",
        toolCallId: "call_ordinary_collision_a"
      }),
      registry.dispatch("execute_code", {
        code: `with open(os.path.join(os.environ['OUTPUT_DIR'], '${ordinaryCollisionName}'), 'wb') as output_file: output_file.write(b'ORDINARY_B')`
      }, {
        ...context,
        requestId: "req_ordinary_collision_b",
        toolCallId: "call_ordinary_collision_b"
      })
    ]);
    const collisionImages = [ordinaryCollisionA, ordinaryCollisionB].map((execution) => {
      const images = execution.result.generatedImages as Array<{ src: string; filename: string }>;
      expect(images).toHaveLength(1);
      return images[0]!;
    });
    expect(collisionImages[0]!.src).not.toBe(collisionImages[1]!.src);
    expect(new Set(collisionImages.map((entry) =>
      readFileSync(path.join(projectRepoRoot, entry.src), "utf8")
    ))).toEqual(new Set(["ORDINARY_A", "ORDINARY_B"]));

    const toctouExecution = await registry.dispatch("execute_code", {
      code: [
        "import sys",
        "secret = load_series_by_label('system_cop:WCC_01')['value_text'].dropna().head().tolist()[0]",
        "os.remove(os.environ['TOOL_CACHE_MANIFEST'])",
        "output_path = os.path.join(os.environ['OUTPUT_DIR'], f'{secret}.png')",
        "with open(output_path, 'wb') as output_file: output_file.write(b'PNG')",
        "print(secret)",
        "print(secret, file=sys.stderr)"
      ].join("\n")
    }, { ...protectedContext, toolCallId: "call_manifest_toctou_execute" });
    expect(JSON.stringify(toctouExecution.result)).not.toContain("SHORT_RAW_VALUE_SENTINEL");
    expect(toctouExecution.result).toMatchObject({
      stdoutSuppressed: true,
      stderrSuppressed: true,
      truncated: true
    });
    expect(toctouExecution.result.generatedImages).toEqual([
      expect.objectContaining({ filename: expect.stringMatching(/^chart_[0-9a-f]{12}_001\.png$/) })
    ]);
    expect(JSON.stringify(toctouExecution.result.generatedImages)).not.toContain("SHORT_RAW_VALUE_SENTINEL");
    expect(existsSync(preexistingSiblingPath)).toBe(true);
    expect(readFileSync(preexistingSiblingPath, "utf8")).toBe("PREEXISTING_SIBLING");
    expect(JSON.stringify(registry.queryLogs({ tool: "execute_code", limit: 100 })))
      .not.toContain("SHORT_RAW_VALUE_SENTINEL");

    const postManifestDeletionExecution = await registry.dispatch("execute_code", {
      code: [
        "import sys",
        "secret = load_series_by_label('system_cop:WCC_01')['value_text'].dropna().head().tolist()[0]",
        "output_path = os.path.join(os.environ['OUTPUT_DIR'], f'{secret}-repair.png')",
        "with open(output_path, 'wb') as output_file: output_file.write(b'PNG')",
        "print(secret)",
        "print(secret, file=sys.stderr)"
      ].join("\n")
    }, { ...protectedContext, toolCallId: "call_post_manifest_deletion_execute" });
    expect(JSON.stringify(postManifestDeletionExecution.result)).not.toContain("SHORT_RAW_VALUE_SENTINEL");
    expect(postManifestDeletionExecution.result).toMatchObject({
      stdoutSuppressed: true,
      stderrSuppressed: true,
      truncated: true
    });
    expect(postManifestDeletionExecution.result.generatedImages).toEqual([
      expect.objectContaining({ filename: expect.stringMatching(/^chart_[0-9a-f]{12}_001\.png$/) })
    ]);
    expect(JSON.stringify(registry.queryLogs({ tool: "execute_code", limit: 100 })))
      .not.toContain("SHORT_RAW_VALUE_SENTINEL");

    const localModulePath = path.join(projectRepoRoot, "execute_code_local_module.py");
    writeFileSync(localModulePath, "VALUE = 'repository module imported'\n", "utf8");
    const ordinaryExecution = await registry.dispatch("execute_code", {
      code: "import execute_code_local_module\nprint(execute_code_local_module.VALUE)"
    }, {
      ...context,
      requestId: "req_ordinary_execute",
      toolCallId: "call_ordinary_execute"
    });
    expect(String(ordinaryExecution.result.stdout)).toContain("repository module imported");
    expect(ordinaryExecution.result.stdoutSuppressed).toBeUndefined();
    expect(ordinaryExecution.result.repoRoot).toBe(projectRepoRoot);
    expect(ordinaryExecution.result.outputDir).toBe(publicOutputDir);
    rmSync(localModulePath, { force: true });

    const smallHistoryContext = {
      ...context,
      requestId: "req_small_history_compatible",
      toolCallId: "call_small_history_read"
    };
    const smallHistoryRead = await registry.dispatch("derived_metric_read", {
      instanceId: instances[0]!.instanceId,
      mode: "history",
      limit: 10,
      order: "asc"
    }, smallHistoryContext);
    expect(smallHistoryRead.result.compacted).toBeUndefined();
    expect(smallHistoryRead.result.history).toHaveLength(10);
    const smallHistoryTerminal = await registry.dispatch("terminal", {
      command: `node -e "process.stdout.write('small-history-terminal-ok')"`
    }, { ...smallHistoryContext, toolCallId: "call_small_history_terminal" });
    expect(smallHistoryTerminal.result.error).toBeUndefined();
    expect(String(smallHistoryTerminal.result.output)).toContain("small-history-terminal-ok");

    const directHistoryContext = {
      ...context,
      requestId: "req_direct_large_history",
      toolCallId: "call_direct_large_history"
    };
    const directLargeHistory = await registry.dispatch("derived_metric_read", {
      instanceId: instances[0]!.instanceId,
      mode: "history",
      limit: 120,
      order: "asc"
    }, directHistoryContext);
    expect(directLargeHistory.result).toMatchObject({ compacted: true });
    expect(JSON.stringify(directLargeHistory.result)).not.toContain("SHORT_RAW_VALUE_SENTINEL");
    const protectedDirectHistoryContext = {
      ...directHistoryContext,
      localHistoryMode: true as const,
      localHistoryDatasetReady: true as const
    };
    const freshRegistry = createGenericToolRegistry(
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
    const directHistoryExecution = await freshRegistry.dispatch("execute_code", {
      code: "print(load_series_by_label('system_cop:WCC_01')['value_text'].dropna().head().tolist())"
    }, { ...protectedDirectHistoryContext, toolCallId: "call_direct_large_execute" });
    expect(directHistoryExecution.result).toMatchObject({ stdoutSuppressed: true, truncated: true });
    expect(JSON.stringify(directHistoryExecution.result)).not.toContain("SHORT_RAW_VALUE_SENTINEL");
    expect(JSON.stringify(freshRegistry.queryLogs({ limit: 100 }))).not.toContain("SHORT_RAW_VALUE_SENTINEL");
    const directHistoryTerminal = await freshRegistry.dispatch("terminal", {
      command: `node -e "process.stdout.write('should-not-run')"`
    }, { ...protectedDirectHistoryContext, toolCallId: "call_direct_large_terminal" });
    expect(directHistoryTerminal.result.error).toBe("tool_blocked_during_local_history_analysis");
  }, 30_000);

  it("rejects a symlinked tool-cache root without writing outside the project", async () => {
    const metricsDir = tempDir();
    const externalDir = tempDir();
    const externalMarker = path.join(externalDir, "marker.txt");
    writeFileSync(externalMarker, "UNCHANGED", "utf8");
    const metrics = new DerivedMetricStore(metricsDir);
    const instance = metrics.registerMetric({
      projectId: "project_cache_symlink",
      metricKey: "system_cop",
      entityId: "WCC_01",
      formula: "cooling_load_kw / power_kw",
      dependencies: [{ role: "source", sourceId: "WCC_01_COP" }]
    }).instance;
    metrics.recordSample({
      instanceId: instance.instanceId,
      ts: "2026-06-01T00:00:00.000Z",
      valueText: "SYMLINK_CACHE_RAW_SENTINEL"
    });
    const repoRoot = repoRootForProject("project_cache_symlink");
    const outputDir = path.join(repoRoot, "outputs");
    mkdirSync(outputDir, { recursive: true });
    const externalRunDir = path.join(externalDir, "execute_code", "run-stale-external");
    const externalRunMarker = path.join(externalRunDir, "keep.txt");
    mkdirSync(externalRunDir, { recursive: true });
    writeFileSync(externalRunMarker, "DO_NOT_DELETE", "utf8");
    utimesSync(externalRunDir, new Date(0), new Date(0));
    symlinkSync(externalDir, path.join(outputDir, ".tool_cache"), "dir");
    const registry = createGenericToolRegistry(
      new AgentMemoryStore(metricsDir),
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
    const result = await registry.dispatch("derived_metric_history_prepare", {
      instanceIds: [instance.instanceId],
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-06-02T00:00:00.000Z"
    }, {
      projectId: "project_cache_symlink",
      userId: "user_buildinggpt",
      requestId: "req_cache_symlink",
      conversationId: "conv_cache_symlink",
      canConfigure: false,
      messages: [],
      toolCallId: "call_cache_symlink"
    });
    expect(result.result.error).toBe("tool_cache_unsafe_root");
    expect(JSON.stringify(result.result)).not.toContain("SYMLINK_CACHE_RAW_SENTINEL");
    const ordinaryExecution = await registry.dispatch("execute_code", {
      code: "print('ordinary execute must not follow a cache symlink')"
    }, {
      projectId: "project_cache_symlink",
      userId: "user_buildinggpt",
      requestId: "req_cache_symlink_execute",
      conversationId: "conv_cache_symlink",
      canConfigure: false,
      messages: [],
      toolCallId: "call_cache_symlink_execute"
    });
    expect(ordinaryExecution.result).toMatchObject({ error: "tool_cache_unsafe_root", exitCode: 1 });
    expect(readFileSync(externalRunMarker, "utf8")).toBe("DO_NOT_DELETE");
    expect(readFileSync(externalMarker, "utf8")).toBe("UNCHANGED");
    rmSync(metricsDir, { recursive: true, force: true });
    rmSync(externalDir, { recursive: true, force: true });
  });

  it("accepts 1 and 32 batch ids and rejects 33 or cross-project ids", async () => {
    const dir = tempDir();
    const memory = new AgentMemoryStore(dir);
    const metrics = new DerivedMetricStore(dir);
    const instances = Array.from({ length: 33 }, (_, index) => metrics.registerMetric({
      projectId: "project_batch_bounds",
      metricKey: "system_cop",
      entityId: `WCC_${String(index + 1).padStart(2, "0")}`,
      formula: "cooling_load_kw / power_kw",
      dependencies: [{ role: "source", sourceId: `COP_${index + 1}` }]
    }).instance);
    const outsider = metrics.registerMetric({
      projectId: "project_outside",
      metricKey: "system_cop",
      entityId: "OUTSIDE_01",
      formula: "cooling_load_kw / power_kw",
      dependencies: [{ role: "source", sourceId: "OUTSIDE_COP" }]
    }).instance;
    metrics.recordSample({
      instanceId: outsider.instanceId,
      ts: "2026-06-01T00:00:00.000Z",
      valueText: "CROSS_PROJECT_RAW_SENTINEL"
    });
    const readLatestSpy = vi.spyOn(metrics, "readLatest");
    const readHistorySpy = vi.spyOn(metrics, "readHistory");
    const registry = createGenericToolRegistry(
      memory, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, metrics
    );
    const executeCode = registry.list().find((tool) => tool.name === "execute_code");
    expect(executeCode?.schema.description).toContain("stdout/stderr are hidden");
    expect(JSON.stringify(executeCode?.schema.parameters.properties.code)).toContain("Do not print local-history data");
    const makeContext = (requestId: string) => ({
      projectId: "project_batch_bounds",
      userId: "user_buildinggpt",
      requestId,
      conversationId: "conv_batch_bounds",
      canConfigure: false,
      messages: [],
      toolCallId: `call_${requestId}`
    });
    const range = { from: "2026-06-01T00:00:00.000Z", to: "2026-06-03T00:00:00.000Z" };

    const one = await registry.dispatch("derived_metric_history_prepare", {
      ...range,
      instanceIds: [instances[0]!.instanceId]
    }, makeContext("req_batch_one"));
    const thirtyTwo = await registry.dispatch("derived_metric_history_prepare", {
      ...range,
      instanceIds: instances.slice(0, 32).map((instance) => instance.instanceId)
    }, makeContext("req_batch_32"));
    const thirtyThree = await registry.dispatch("derived_metric_history_prepare", {
      ...range,
      instanceIds: instances.map((instance) => instance.instanceId)
    }, makeContext("req_batch_33"));
    const crossProject = await registry.dispatch("derived_metric_history_prepare", {
      ...range,
      instanceIds: [outsider.instanceId]
    }, makeContext("req_batch_cross"));
    const crossProjectLatest = await registry.dispatch("derived_metric_read", {
      instanceId: outsider.instanceId,
      mode: "latest"
    }, makeContext("req_direct_cross_latest"));
    const crossProjectHistory = await registry.dispatch("derived_metric_read", {
      instanceId: outsider.instanceId,
      mode: "history",
      limit: 10
    }, makeContext("req_direct_cross_history"));

    expect(one.result).toMatchObject({ series_count: 1, cached_complete: true });
    expect(thirtyTwo.result).toMatchObject({ series_count: 32, cached_complete: true });
    expect(thirtyThree.result).toMatchObject({ error: "instanceIds must contain 1-32 unique metric instance ids" });
    expect(crossProject.result).toMatchObject({ error: "derived_metric_not_found", invalidInstanceIds: [outsider.instanceId] });
    expect(crossProjectLatest.result).toEqual({ error: "derived_metric_not_found" });
    expect(crossProjectHistory.result).toEqual({ error: "derived_metric_not_found" });
    expect(JSON.stringify([crossProjectLatest.result, crossProjectHistory.result]))
      .not.toContain("CROSS_PROJECT_RAW_SENTINEL");
    expect(readLatestSpy).not.toHaveBeenCalled();
    expect(readHistorySpy).not.toHaveBeenCalled();
    for (const requestId of ["req_direct_cross_latest", "req_direct_cross_history"]) {
      const toolCallId = `call_${requestId}`;
      expect(existsSync(path.join(
        repoRootForProject("project_batch_bounds"),
        toolCacheDataRelativePath(requestId, toolCallId)
      ))).toBe(false);
    }
  });

  it("freezes equivalent timezone ranges before SQLite and deduplicates the normalized read", async () => {
    const dir = tempDir();
    const memory = new AgentMemoryStore(dir);
    const metrics = new DerivedMetricStore(dir);
    const metric = metrics.registerMetric({
      projectId: "project_element",
      metricKey: "system_cop",
      entityId: "WCC_01",
      formula: "cooling_load_kw / power_kw",
      dependencies: [
        { role: "cooling_load_kw", sourceId: "WCC-L1-01_Q" },
        { role: "power_kw", sourceId: "WCC-L1-01_P" }
      ]
    });
    for (const [ts, valueNum] of [
      ["2026-07-31T23:59:59.000Z", 1],
      ["2026-08-01T00:00:00.000Z", 2],
      ["2026-08-01T00:15:00.000Z", 3]
    ] as const) {
      metrics.recordSample({ instanceId: metric.instance.instanceId, ts, valueNum });
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
    const read = registry.list().find((tool) => tool.name === "derived_metric_read")!;
    const context = {
      projectId: "project_element",
      userId: "user_buildinggpt",
      requestId: "req_timezone_range",
      conversationId: "conv_timezone_range",
      canConfigure: false,
      messages: []
    };
    const offsetArgs = {
      instanceId: metric.instance.instanceId,
      mode: "history",
      from: "2026-08-01T08:00:00+08:00",
      to: "2026-08-01T08:15:00+08:00",
      order: "asc"
    };
    const utcArgs = {
      instanceId: metric.instance.instanceId,
      mode: "history",
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-01T00:15:00.000Z",
      order: "asc"
    };

    const directOffset = await read.run(offsetArgs, context);
    const directUtc = await read.run(utcArgs, context);
    expect((directOffset.history as Array<{ valueNum: number }>).map((sample) => sample.valueNum)).toEqual([2, 3]);
    expect(directOffset.history).toEqual(directUtc.history);

    const readHistory = vi.spyOn(metrics, "readHistory");
    const policy = new RequestToolExecutionPolicy();
    const first = await policy.run("derived_metric_read", offsetArgs, () => read.run(offsetArgs, context));
    const equivalent = await policy.run("derived_metric_read", utcArgs, () => read.run(utcArgs, context));
    expect(equivalent.reused).toBe(true);
    expect(equivalent.value).toEqual(first.value);
    expect(readHistory).toHaveBeenCalledTimes(1);
  });

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

  it("normalizes FDD comparison widgets into 7-day fault-cause analysis with input evidence", async () => {
    const dir = tempDir();
    const memory = new AgentMemoryStore(dir);
    const metrics = new DerivedMetricStore(dir);
    const metric = metrics.registerMetric({
      projectId: "project_element",
      metricKey: "chiller_low_cop_detection",
      entityId: "WCC_04",
      displayName: "WCC-04 Low COP Detection",
      unit: "boolean",
      formula: "FDD low COP rule",
      dependencies: [
        { role: "chiller_status", sourceType: "raw_point", sourceId: "WCC_4_Run_Status", pointName: "WCC_4_Run_Status", label: "Chiller status" },
        { role: "chw_supply_temp", sourceType: "raw_point", sourceId: "WCC-L1-04_CHWST", pointName: "WCC-L1-04_CHWST", label: "CHW supply temp" },
        { role: "chiller_power", sourceType: "raw_point", sourceId: "WCC_4_TLKW", pointName: "WCC_4_TLKW", label: "Chiller power" }
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
      requestId: "req_fdd_attribution",
      conversationId: "conv_fdd_attribution",
      canConfigure: true,
      messages: [],
      dashboardOps: {
        create: (input: any) => ({
          id: "dash_fdd_attribution",
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
      title: "FDD attribution dashboard",
      widgets: [
        {
          id: "fdd_fault_status_comparison",
          kind: "fdd_fault_rate_comparison",
          title: "Fault Rate Comparison",
          pointBindings: [{ source: "derived_metric", metricInstanceId: metric.instance.instanceId, label: "Fault status" }]
        },
        {
          id: "operator_note",
          kind: "note",
          title: "Detection Logic",
          content: "Low COP while running.",
          pointBindings: []
        }
      ],
      sections: [
        { id: "attribution", title: "Attribution", kind: "analysis", widgetIds: ["fdd_fault_status_comparison", "operator_note"] }
      ]
    }, context);

    const dashboard = result.dashboard as any;
    const widget = dashboard.widgets.find((entry: { id: string }) => entry.id === "fdd_fault_status_comparison");
    expect(widget).toMatchObject({
      kind: "fdd_attribution_analysis",
      title: "Fault Cause Analysis",
      defaultTimeRange: "7d"
    });
    expect(widget.pointBindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "derived_metric", metricInstanceId: metric.instance.instanceId, dependencyRole: "output", defaultVisible: true }),
      expect.objectContaining({ source: "bms", pointName: "WCC_4_Run_Status", role: "chiller_status", dependencyRole: "input", defaultVisible: false }),
      expect.objectContaining({ source: "bms", pointName: "WCC-L1-04_CHWST", role: "chw_supply_temp", dependencyRole: "input", defaultVisible: false }),
      expect.objectContaining({ source: "bms", pointName: "WCC_4_TLKW", role: "chiller_power", dependencyRole: "input", defaultVisible: false })
    ]));
    expect(dashboard.sections).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "analysis", title: "Fault Cause Analysis", kind: "analysis", widgetIds: [widget.id] }),
      expect.objectContaining({ id: "notes", title: "Notes", kind: "custom", widgetIds: ["operator_note"] })
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

  it("keeps a comparison widget bound to its own metric when no per-equipment widget shares that metric", async () => {
    const dir = tempDir();
    const memory = new AgentMemoryStore(dir);
    const metrics = new DerivedMetricStore(dir);

    const registerPair = (entityId: string) => ({
      deltaT: metrics.registerMetric({
        projectId: "project_element",
        metricKey: "chw_delta_t",
        entityId,
        displayName: `${entityId} CHW Delta T`,
        formula: "return_temp - supply_temp",
        dependencies: [
          { role: "return_temp", sourceType: "raw_point", sourceId: `${entityId}-CHWRT`, pointName: `${entityId}-CHWRT` },
          { role: "supply_temp", sourceType: "raw_point", sourceId: `${entityId}-CHWST`, pointName: `${entityId}-CHWST` }
        ]
      }),
      cop: metrics.registerMetric({
        projectId: "project_element",
        metricKey: "system_cop",
        entityId,
        displayName: `${entityId} System COP`,
        formula: "cooling_load_kw / power_kw",
        dependencies: [
          { role: "cooling_load_kw", sourceType: "raw_point", sourceId: `${entityId}_Q`, pointName: `${entityId}_Q` },
          { role: "power_kw", sourceType: "raw_point", sourceId: `${entityId}_P`, pointName: `${entityId}_P` }
        ]
      })
    });
    const wcc01 = registerPair("WCC_01");
    const wcc02 = registerPair("WCC_02");

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
      requestId: "req_comparison_family",
      conversationId: "conv_comparison_family",
      canConfigure: true,
      messages: [],
      dashboardOps: {
        create: (input: any) => ({
          id: "dash_comparison_family",
          projectId: "project_element",
          ownerUserId: "user_buildinggpt",
          visibility: input.visibility ?? "project",
          createdAt: "2026-08-20T00:00:00.000Z",
          updatedAt: "2026-08-20T00:00:00.000Z",
          ...input
        })
      }
    };

    // Mirrors the real "monitor CHW delta-T for all chillers and compare performance" request:
    // every per-chiller widget carries only delta-T, while the comparison asks for COP.
    const result = await dashboardCreate!.run({
      title: "Chiller CHW delta-T monitoring",
      widgets: [
        {
          id: "wcc01_delta_t",
          kind: "stat_value",
          title: "Chiller 1 Delta T",
          pointBindings: [
            { source: "derived_metric", metricInstanceId: wcc01.deltaT.instance.instanceId, label: "WCC-01 CHW Delta T", entityId: "WCC_01" }
          ]
        },
        {
          id: "wcc02_delta_t",
          kind: "stat_value",
          title: "Chiller 2 Delta T",
          pointBindings: [
            { source: "derived_metric", metricInstanceId: wcc02.deltaT.instance.instanceId, label: "WCC-02 CHW Delta T", entityId: "WCC_02" }
          ]
        },
        {
          id: "cop_comparison",
          kind: "bar_comparison",
          title: "COP Comparison (Latest)",
          pointBindings: [
            { source: "derived_metric", metricInstanceId: wcc01.cop.instance.instanceId, label: "WCC-01 System COP", entityId: "WCC_01" },
            { source: "derived_metric", metricInstanceId: wcc02.cop.instance.instanceId, label: "WCC-02 System COP", entityId: "WCC_02" }
          ]
        }
      ]
    }, context);

    const widgets = (result.dashboard as any).widgets as Array<{ id: string; kind: string; title: string; pointBindings: Array<Record<string, unknown>> }>;
    const comparisonWidgets = widgets.filter((widget) => widget.kind === "bar_comparison");
    expect(comparisonWidgets).toHaveLength(1);

    const copInstanceIds = new Set([wcc01.cop.instance.instanceId, wcc02.cop.instance.instanceId]);
    const deltaTInstanceIds = new Set([wcc01.deltaT.instance.instanceId, wcc02.deltaT.instance.instanceId]);
    const boundInstanceIds = comparisonWidgets[0]!.pointBindings.map((binding) => binding.metricInstanceId);

    expect(new Set(boundInstanceIds)).toEqual(copInstanceIds);
    expect(boundInstanceIds.some((instanceId) => deltaTInstanceIds.has(String(instanceId)))).toBe(false);
    expect(comparisonWidgets[0]!.title).toBe("COP Comparison (Latest)");
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
