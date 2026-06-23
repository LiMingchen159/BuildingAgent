import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { repoRootForProject } from "./knowledgeBase.js";
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
    expect(compacted.data_file).toBe(`outputs/.tool_cache/${requestId}_${toolCallId}.json`);
    expect(compacted.cache_manifest).toBe(`outputs/.tool_cache/${requestId}_manifest.json`);

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
    expect(cached.data_file).toBe(`outputs/.tool_cache/${requestId}_${toolCallId}.json`);
    expect((cached.items as unknown[]).length).toBe(78);

    const manifestPath = path.join(repoRootForProject(PROJECT_ID), cached.cache_manifest as string);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      entries: Array<{ label?: string; data_file: string }>;
    };
    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0]?.label).toBe("WCC-L1-06-S");
  });
});
