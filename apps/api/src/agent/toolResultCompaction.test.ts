import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { repoRootForProject } from "./knowledgeBase.js";
import { toolCacheDataRelativePath, toolCacheManifestRelativePath } from "./toolCacheManifest.js";
import {
  TOOL_RESULT_MAX_INLINE_ROWS,
  compactToolResult,
  downsampleItems
} from "./toolResultCompaction.js";
import type { AgentToolContext } from "./types.js";

const PROJECT_ID = "project_compaction_test";

function makeContext(requestId: string, toolCallId: string): AgentToolContext {
  return {
    projectId: PROJECT_ID,
    userId: "user_test",
    requestId,
    conversationId: "conv_test",
    canConfigure: false,
    messages: [],
    toolCallId
  };
}

function makeItems(count: number): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, index) => ({
    ts: `2026-06-11T${String(index % 24).padStart(2, "0")}:00:00Z`,
    value_num: index * 1.5
  }));
}

afterEach(() => {
  vi.unstubAllEnvs();
  const cacheDir = path.join(repoRootForProject(PROJECT_ID), "outputs", ".tool_cache");
  if (existsSync(cacheDir)) {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

describe("toolResultCompaction", () => {
  it("downsamples long item arrays uniformly", () => {
    const items = makeItems(200);
    const { sampled, truncated } = downsampleItems(items, 96);
    expect(truncated).toBe(true);
    expect(sampled.length).toBe(96);
    expect(sampled[0]).toEqual(items[0]);
    expect(sampled[sampled.length - 1]).toEqual(items[items.length - 1]);
  });

  it("compacts large results to data_file with summary", () => {
    const requestId = "req_compact_001";
    const toolCallId = "call_abc";
    const context = makeContext(requestId, toolCallId);
    const items = makeItems(200);
    const raw = { items, source: "mock_tool" };

    const compacted = compactToolResult(raw, context, "bms_timeseries_query", { name: "WCC-L1-06-CHWST" });
    expect(compacted.compacted).toBe(true);
    expect(compacted.data_file).toBe(toolCacheDataRelativePath(requestId, toolCallId));
    expect(compacted.cache_manifest).toBe(toolCacheManifestRelativePath(requestId));

    const manifestPath = path.join(repoRootForProject(PROJECT_ID), compacted.cache_manifest as string);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      entries: Array<{ label?: string; data_file: string }>;
    };
    expect(manifest.entries[0]?.label).toBe("WCC-L1-06-CHWST");
    expect(Array.isArray(compacted.items)).toBe(true);
    expect((compacted.items as unknown[]).length).toBe(TOOL_RESULT_MAX_INLINE_ROWS);

    const summary = compacted.summary as Record<string, unknown>;
    expect(summary.row_count).toBe(200);
    expect(summary.truncated).toBe(true);
    expect(summary.numeric_min).toBe(0);
    expect(summary.numeric_max).toBe(199 * 1.5);

    const absolutePath = path.join(repoRootForProject(PROJECT_ID), compacted.data_file as string);
    expect(existsSync(absolutePath)).toBe(true);
    const stored = JSON.parse(readFileSync(absolutePath, "utf8")) as { items: unknown[] };
    expect(stored.items.length).toBe(200);
  });

  it("keeps large derived metric history out of the inline result", () => {
    const requestId = "req_history_001";
    const toolCallId = "call_history";
    const context = makeContext(requestId, toolCallId);
    const history = Array.from({ length: 10_000 }, (_, index) => ({
      sampleId: `sample_${index}`,
      instanceId: "metric_wcc_01",
      projectId: PROJECT_ID,
      ts: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      valueNum: 4 + index / 10_000,
      ...(index === 123 ? { valueText: "RAW_HISTORY_SENTINEL" } : {}),
      quality: index % 100 === 0 ? "invalid" : "good",
      status: "ok",
      formulaVersionId: "v1",
      createdAt: "2026-01-01T00:00:00.000Z"
    }));

    const compacted = compactToolResult({
      instance: { instanceId: "metric_wcc_01", metricKey: "system_cop", entityId: "WCC_01", unit: "" },
      history
    }, context, "derived_metric_read", { instanceId: "metric_wcc_01", mode: "history" });

    expect(compacted.history).toBeUndefined();
    expect(JSON.stringify(compacted)).not.toContain("RAW_HISTORY_SENTINEL");
    expect(Buffer.byteLength(JSON.stringify(compacted), "utf8")).toBeLessThanOrEqual(32_768);
    expect(compacted.summary).toMatchObject({
      row_count: 10_000,
      time_start: history[0]!.ts,
      truncated: false,
      cached_complete: true,
      inline_rows: 0
    });

    const absolutePath = path.join(repoRootForProject(PROJECT_ID), compacted.data_file as string);
    const stored = JSON.parse(readFileSync(absolutePath, "utf8")) as { history: Array<Record<string, unknown>> };
    expect(stored.history).toHaveLength(10_000);
    expect(JSON.stringify(stored.history)).toContain("RAW_HISTORY_SENTINEL");
    expect(Object.keys(stored.history[0]!).sort()).toEqual(["quality", "status", "ts", "value_num"]);

    const manifestPath = path.join(repoRootForProject(PROJECT_ID), compacted.cache_manifest as string);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      entries: Array<{ label?: string; data_key?: string }>;
    };
    expect(manifest.entries[0]).toMatchObject({ label: "system_cop:WCC_01", data_key: "metric_wcc_01" });
  });

  it("profiles cadence from positive intervals when batch history has duplicate timestamps", () => {
    const compacted = compactToolResult({
      series: [{
        instanceId: "metric_duplicate_ts",
        metricKey: "system_cop",
        entityId: "WCC_DUP",
        history: [
          { ts: "2026-01-01T00:00:00.000Z", valueNum: 4, quality: "good", status: "ok" },
          { ts: "2026-01-01T00:00:00.000Z", valueNum: 4.1, quality: "good", status: "ok" },
          { ts: "2026-01-01T00:15:00.000Z", valueNum: 4.2, quality: "good", status: "ok" }
        ]
      }]
    }, makeContext("req_duplicate_ts", "call_duplicate_ts"), "derived_metric_history_prepare");

    expect((compacted.series as Array<Record<string, unknown>>)[0]).toMatchObject({
      median_interval_seconds: 900,
      max_interval_seconds: 900,
      gap_count: 0,
      duplicate_timestamp_count: 1
    });
  });

  it("bounds corrupt quality/status labels in provider-visible batch profiles", () => {
    const longSentinel = "CORRUPT_STATUS_SENTINEL".repeat(20);
    const compacted = compactToolResult({
      series: [{
        instanceId: "metric_corrupt_labels",
        metricKey: "system_cop",
        entityId: "WCC_CORRUPT",
        history: Array.from({ length: 1_000 }, (_, index) => ({
          ts: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
          valueNum: 4,
          quality: `quality_${String(index).padStart(4, "0")}_${longSentinel}`,
          status: `status_${String(index).padStart(4, "0")}_${longSentinel}`
        }))
      }]
    }, makeContext("req_corrupt_labels", "call_corrupt_labels"), "derived_metric_history_prepare");

    const inline = JSON.stringify(compacted);
    expect(Buffer.byteLength(inline, "utf8")).toBeLessThanOrEqual(32_768);
    expect(inline).not.toContain(longSentinel);
    const profile = (compacted.series as Array<Record<string, unknown>>)[0]!;
    for (const counts of [profile.quality_counts, profile.status_counts] as Array<Record<string, number>>) {
      expect(Object.keys(counts).length).toBeLessThanOrEqual(33);
      expect(Object.keys(counts).every((label) => label.length <= 64)).toBe(true);
      expect(counts.__other__).toBe(968);
    }
  });

  it("rejects the final normalized batch payload before writing any oversized cache file", () => {
    vi.stubEnv("TOOL_RESULT_DERIVED_HISTORY_MAX_BYTES", "600");
    const requestId = "req_escaped_payload_limit";
    const toolCallId = "call_escaped_payload_limit";
    const compacted = compactToolResult({
      dataset_format: "derived_metric_history_v1",
      series: [{
        instanceId: "metric_escaped_payload",
        metricKey: "system_cop",
        entityId: "WCC_ESCAPED",
        history: [{
          ts: "2026-01-01T00:00:00.000Z",
          valueText: "\\\"\n".repeat(400),
          quality: "good",
          status: "ok"
        }]
      }]
    }, makeContext(requestId, toolCallId), "derived_metric_history_prepare");

    expect(compacted).toMatchObject({
      error: "derived_metric_history_too_large",
      totalRows: 1,
      maxBytes: 600
    });
    expect(compacted.actualBytes).toEqual(expect.any(Number));
    expect(compacted.data_file).toBeUndefined();
    expect(existsSync(path.join(
      repoRootForProject(PROJECT_ID),
      toolCacheDataRelativePath(requestId, toolCallId)
    ))).toBe(false);
    expect(existsSync(path.join(
      repoRootForProject(PROJECT_ID),
      toolCacheManifestRelativePath(requestId)
    ))).toBe(false);
  });

  it("leaves small generic results unchanged", () => {
    const raw = { items: makeItems(10), ok: true };
    const compacted = compactToolResult(raw, makeContext("req_small", "call_1"));
    expect(compacted.compacted).toBeUndefined();
    expect(compacted.data_file).toBeUndefined();
    expect((compacted.items as unknown[]).length).toBe(10);
  });

  it("always caches small bms_timeseries_query results with label", () => {
    const requestId = "req_timeseries_small";
    const toolCallId = "call_status";
    const context = makeContext(requestId, toolCallId);
    const raw = { items: makeItems(78), name: "WCC-L1-06-S" };

    const cached = compactToolResult(raw, context, "bms_timeseries_query", { name: "WCC-L1-06-S" });
    expect(cached.compacted).toBeUndefined();
    expect(cached.data_file).toBe(toolCacheDataRelativePath(requestId, toolCallId));
    expect((cached.items as unknown[]).length).toBe(78);

    const manifestPath = path.join(repoRootForProject(PROJECT_ID), cached.cache_manifest as string);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      entries: Array<{ label?: string; data_file: string }>;
    };
    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0]?.label).toBe("WCC-L1-06-S");
  });
});
