import {
  closeSync,
  existsSync,
  ftruncateSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { repoRootForProject } from "./knowledgeBase.js";
import { AgentToolRegistry } from "./tools.js";
import type { AgentToolContext } from "./types.js";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), "buildingagent-tool-log-"));
  temporaryDirectories.push(directory);
  return directory;
}

function context(call: number): AgentToolContext {
  return {
    projectId: "project_audit",
    userId: "user_audit",
    requestId: "req_audit",
    conversationId: "conv_audit",
    canConfigure: false,
    messages: [],
    toolCallId: `call_${call}`
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
  rmSync(path.dirname(repoRootForProject("project_audit")), { recursive: true, force: true });
});

describe("bounded tool audit persistence", () => {
  it("batches compact atomic logs without persisting raw arguments or results", async () => {
    const directory = temporaryDirectory();
    const sentinel = "RAW_HISTORY_SENTINEL_DO_NOT_LOG";
    const registry = new AgentToolRegistry();
    registry.enableLogging(directory);
    registry.register({
      name: "audit_read",
      category: "building",
      description: "audit",
      schema: { name: "audit_read", description: "audit", parameters: { type: "object", properties: {} } },
      async run() {
        return {
          history: Array.from({ length: 50 }, (_, index) => ({ ts: index, value: sentinel })),
          data_file: "outputs/.tool_cache/history.json",
          summary: {
            row_count: 50,
            numeric_min: 1,
            numeric_max: 9,
            time_start: "2026-08-01T00:00:00Z",
            time_end: "2026-08-02T00:00:00Z",
            quality_counts: { good: 49, invalid: 1 }
          }
        };
      }
    });

    for (let index = 0; index < 16; index += 1) {
      await registry.dispatch("audit_read", {
        instanceId: "metric_system_cop_wcc01",
        from: "2026-08-01T00:00:00Z",
        to: "2026-08-02T00:00:00Z",
        limit: 720,
        secretPayload: sentinel,
        index
      }, context(index));
    }
    await registry.flushLogs();

    const logPath = path.join(directory, "tool_call_logs.json");
    const stored = readFileSync(logPath, "utf8");
    expect(stored).not.toContain(sentinel);
    expect(Buffer.byteLength(stored)).toBeLessThan(10 * 1024 * 1024);
    expect(readdirSync(directory).some((name) => name.endsWith(".tmp"))).toBe(false);
    const parsed = JSON.parse(stored) as Array<Record<string, unknown>>;
    expect(parsed).toHaveLength(16);
    expect(parsed[0]).toMatchObject({ argsByteCount: expect.any(Number), resultByteCount: expect.any(Number) });
    expect(parsed[0]?.args).toMatchObject({
      values: {
        instanceId: "metric_system_cop_wcc01",
        from: "2026-08-01T00:00:00Z",
        to: "2026-08-02T00:00:00Z",
        limit: 720
      },
      redacted_keys: ["secretPayload"]
    });
    expect(parsed[0]?.result).toMatchObject({
      kind: "result_summary",
      row_count: 50,
      pointers: { data_file: "outputs/.tool_cache/history.json" },
      summary: {
        numeric_min: 1,
        numeric_max: 9,
        quality_counts: { good: 49, invalid: 1 }
      }
    });
  });

  it("round-trips safe summaries across restart and redacts credentials in errors", async () => {
    const directory = temporaryDirectory();
    const registry = new AgentToolRegistry();
    registry.enableLogging(directory);
    registry.register({
      name: "failing_read",
      category: "building",
      description: "failure",
      schema: { name: "failing_read", description: "failure", parameters: { type: "object", properties: {} } },
      async run() {
        throw new Error(
          "provider failed Authorization: Bearer sk-bearer, api_key=super-secret; token:raw-token "
          + "https://admin:password@example.test/path?token=query-secret"
        );
      }
    });
    await registry.dispatch("failing_read", {
      instanceId: "metric_1",
      from: "2026-08-01T00:00:00Z",
      password: "do-not-store"
    }, context(1));
    await registry.flushLogs();
    const beforeRestart = registry.queryLogs()[0];

    const restarted = new AgentToolRegistry();
    restarted.enableLogging(directory);
    const afterRestart = restarted.queryLogs()[0];

    expect(afterRestart?.args).toEqual(beforeRestart?.args);
    expect(afterRestart?.result).toEqual(beforeRestart?.result);
    expect(afterRestart?.error).toContain("api_key=[redacted]");
    expect(afterRestart?.error).toContain("token:[redacted]");
    expect(afterRestart?.error).toContain("Authorization: [redacted]");
    expect(afterRestart?.error).toContain("https://[redacted]@example.test/path");
    expect(JSON.stringify(afterRestart)).not.toMatch(/sk-bearer|super-secret|raw-token|query-secret|do-not-store|admin:password/);
  });

  it("redacts double- and single-quoted JSON credentials in the persisted audit file", async () => {
    const directory = temporaryDirectory();
    const registry = new AgentToolRegistry();
    registry.enableLogging(directory);
    registry.register({
      name: "quoted_credential_failure",
      category: "utility",
      description: "quoted credentials",
      schema: { name: "quoted_credential_failure", description: "quoted", parameters: { type: "object", properties: {} } },
      async run() {
        throw new Error(
          `provider payload {"Authorization":"Bearer sk-json-secret", "api_key" : "quoted-secret", "ToKeN":"quoted-token"} `
          + `legacy {'password':'single-secret'}`
        );
      }
    });

    await registry.dispatch("quoted_credential_failure", {}, context(1));
    await registry.flushLogs();
    const stored = readFileSync(path.join(directory, "tool_call_logs.json"), "utf8");
    const parsed = JSON.parse(stored) as Array<{ error: string }>;

    expect(stored).not.toMatch(/sk-json-secret|quoted-secret|quoted-token|single-secret/);
    expect(parsed[0]?.error).toContain('"Authorization":"[redacted]"');
    expect(parsed[0]?.error).toContain('"api_key":"[redacted]"');
    expect(parsed[0]?.error).toContain('"ToKeN":"[redacted]"');
    expect(parsed[0]?.error).toContain("'password':'[redacted]'");
  });

  it("keeps bounded batch-series audit statistics without raw history", async () => {
    const directory = temporaryDirectory();
    const sentinel = "RAW_BATCH_HISTORY_SENTINEL";
    const registry = new AgentToolRegistry();
    registry.enableLogging(directory);
    registry.register({
      name: "derived_metric_history_prepare",
      category: "building",
      description: "prepare",
      schema: { name: "derived_metric_history_prepare", description: "prepare", parameters: { type: "object", properties: {} } },
      async run() {
        const history = (count: number, start: string, end: string, invalidLast = false) => {
          const startMs = Date.parse(start);
          const endMs = Date.parse(end);
          return Array.from({ length: count }, (_, index) => ({
            ts: new Date(startMs + (endMs - startMs) * index / Math.max(1, count - 1)).toISOString(),
            valueNum: index,
            ...(index === 0 ? { valueText: sentinel } : {}),
            quality: invalidLast && index === count - 1 ? "invalid" : "good",
            status: invalidLast && index === count - 1 ? "degraded" : "ok"
          }));
        };
        return {
          series_count: 2,
          series: [
            {
              instanceId: "metric_1",
              metricKey: "system_cop",
              entityId: "WCC_01",
              history: history(100, "2026-06-01T00:00:00Z", "2026-08-01T00:00:00Z", true)
            },
            {
              instanceId: "metric_2",
              metricKey: "system_cop",
              entityId: "WCC_02",
              history: history(80, "2026-06-02T00:00:00Z", "2026-07-31T00:00:00Z")
            }
          ]
        };
      }
    });

    await registry.dispatch("derived_metric_history_prepare", {
      instanceIds: ["metric_2", "metric_1"],
      from: "2026-06-01T00:00:00Z",
      to: "2026-08-01T00:00:00Z"
    }, context(1));
    await registry.flushLogs();
    const stored = readFileSync(path.join(directory, "tool_call_logs.json"), "utf8");
    const result = (registry.queryLogs()[0]?.result ?? {}) as Record<string, unknown>;

    expect(stored).not.toContain(sentinel);
    expect(registry.queryLogs()[0]?.args).toMatchObject({
      values: { instanceIds: ["metric_2", "metric_1"] }
    });
    expect(result.batch).toMatchObject({
      series_count: 2,
      row_count: 180,
      time_start: "2026-06-01T00:00:00.000Z",
      time_end: "2026-08-01T00:00:00.000Z",
      quality_counts: { good: 179, invalid: 1 },
      status_counts: { ok: 179, degraded: 1 },
      series: [
        { label: "system_cop:WCC_01", row_count: 100, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
        { label: "system_cop:WCC_02", row_count: 80, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }
      ]
    });
  });

  it("archives a sparse 500 MB legacy log without loading it", () => {
    const directory = temporaryDirectory();
    const logPath = path.join(directory, "tool_call_logs.json");
    const descriptor = openSync(logPath, "w");
    ftruncateSync(descriptor, 500 * 1024 * 1024);
    closeSync(descriptor);

    const registry = new AgentToolRegistry();
    registry.enableLogging(directory);

    expect(registry.logCount()).toBe(0);
    expect(existsSync(logPath)).toBe(false);
    expect(readdirSync(directory).some((name) => name.startsWith("tool_call_logs.json.oversized-") && name.endsWith(".bak"))).toBe(true);
  });

  it("keeps only the configured number of newest entries", async () => {
    const directory = temporaryDirectory();
    const registry = new AgentToolRegistry();
    registry.enableLogging(directory, 3);
    registry.register({
      name: "small_read",
      category: "utility",
      description: "small",
      schema: { name: "small_read", description: "small", parameters: { type: "object", properties: {} } },
      async run(args) { return { index: args.index }; }
    });
    for (let index = 0; index < 5; index += 1) {
      await registry.dispatch("small_read", { index }, context(index));
    }
    await registry.flushLogs();
    expect(registry.logCount()).toBe(3);
    expect(registry.queryLogs().map((entry) => entry.id)).toEqual(["tclog_00000005", "tclog_00000004", "tclog_00000003"]);
  });

  it("enforces the configured serialized-byte ceiling", async () => {
    const directory = temporaryDirectory();
    const registry = new AgentToolRegistry();
    registry.enableLogging(directory, 2_000, 2_048);
    registry.register({
      name: "bounded_read",
      category: "utility",
      description: "bounded",
      schema: { name: "bounded_read", description: "bounded", parameters: { type: "object", properties: {} } },
      async run() { return { ok: true }; }
    });
    for (let index = 0; index < 30; index += 1) {
      await registry.dispatch("bounded_read", { index }, context(index));
    }
    await registry.flushLogs();

    const stored = readFileSync(path.join(directory, "tool_call_logs.json"));
    expect(stored.byteLength).toBeLessThanOrEqual(2_048);
    expect(registry.logCount()).toBeLessThan(30);
  });

  it("downgrades one oversized identifier entry so a 1 KiB audit file remains within the hard limit", async () => {
    const directory = temporaryDirectory();
    const registry = new AgentToolRegistry();
    registry.enableLogging(directory, 2_000, 1_024);
    const longToolName = `oversized_${"x".repeat(5_000)}`;
    registry.register({
      name: longToolName,
      category: "utility",
      description: "oversized identifier regression",
      schema: { name: longToolName, description: "oversized", parameters: { type: "object", properties: {} } },
      async run() { return { ok: true }; }
    });
    await registry.dispatch(longToolName, {}, {
      ...context(1),
      projectId: `token=must-not-survive-${"p".repeat(5_000)}`,
      conversationId: "c".repeat(5_000),
      requestId: "r".repeat(5_000),
      userId: "u".repeat(5_000)
    });
    await registry.flushLogs();

    const stored = readFileSync(path.join(directory, "tool_call_logs.json"), "utf8");
    expect(Buffer.byteLength(stored)).toBeLessThanOrEqual(1_024);
    expect(stored).not.toContain("must-not-survive");
    expect(JSON.parse(stored)).toMatchObject([{ tool: "[oversized]", result: { oversized: true } }]);
  });
});
