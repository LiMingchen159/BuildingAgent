import { describe, expect, it } from "vitest";
import {
  RequestToolExecutionPolicy,
  canonicalDerivedMetricHistoryPrepareArgs,
  canonicalDerivedMetricReadArgs
} from "./requestToolExecutionPolicy.js";

describe("RequestToolExecutionPolicy", () => {
  it("normalizes key order, defaults, and equivalent ISO-8601 offsets", () => {
    const first = canonicalDerivedMetricReadArgs({
      instanceId: " metric_1 ",
      mode: "history",
      from: "2026-08-01T08:00:00+08:00",
      to: "2026-08-02T08:00:00+08:00",
      limit: 720,
      order: "asc"
    });
    const equivalent = canonicalDerivedMetricReadArgs({
      order: "ASC",
      to: "2026-08-02T00:00:00.000Z",
      from: "2026-08-01T00:00:00.000Z",
      mode: "history",
      instanceId: "metric_1"
    });
    const differentRange = canonicalDerivedMetricReadArgs({
      instanceId: "metric_1",
      mode: "history",
      from: "2026-08-03T00:00:00Z"
    });

    expect(equivalent).toBe(first);
    expect(canonicalDerivedMetricReadArgs({
      from: "2026-08-01T08:00:00+08:00",
      to: "2026-08-02T08:00:00+08:00",
      instanceId: "metric_1",
      mode: "history",
      limit: 720
    })).toBe(first);
    expect(differentRange).not.toBe(first);
  });

  it("shares identical read promises in one batch and across later calls", async () => {
    const dedupe = new RequestToolExecutionPolicy();
    let executions = 0;
    const execute = async () => {
      executions += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { execution: executions };
    };
    const args = { instanceId: "metric_1", mode: "history", from: "2026-08-01T00:00:00Z" };

    const [first, sameBatch] = await Promise.all([
      dedupe.run("derived_metric_read", args, execute),
      dedupe.run("derived_metric_read", { ...args }, execute)
    ]);
    const later = await dedupe.run("derived_metric_read", args, execute);

    expect(executions).toBe(1);
    expect(first.reused).toBe(false);
    expect(sameBatch.reused).toBe(true);
    expect(later.reused).toBe(true);
    expect(sameBatch.value).toBe(first.value);
    expect(later.value).toBe(first.value);
  });

  it("normalizes non-object arguments defensively instead of throwing", async () => {
    const policy = new RequestToolExecutionPolicy();
    let executions = 0;
    const execute = async () => ({ error: `missing_args_${++executions}` });

    const first = await policy.run("derived_metric_read", null, execute);
    const second = await policy.run("derived_metric_read", ["invalid"], execute);

    expect(first.value).toEqual({ error: "missing_args_1" });
    expect(second.value).toEqual({ error: "missing_args_2" });
    expect(executions).toBe(2);
  });

  it("executes different ranges and every mutating call independently", async () => {
    const dedupe = new RequestToolExecutionPolicy();
    let reads = 0;
    let writes = 0;

    await dedupe.run("derived_metric_read", { instanceId: "metric_1", from: "2026-08-01", mode: "history" }, async () => ++reads);
    await dedupe.run("derived_metric_read", { instanceId: "metric_1", from: "2026-08-02", mode: "history" }, async () => ++reads);
    await dedupe.run("derived_metric_record_sample", { instanceId: "metric_1", valueNum: 1 }, async () => ++writes);
    await dedupe.run("derived_metric_record_sample", { instanceId: "metric_1", valueNum: 1 }, async () => ++writes);

    expect(reads).toBe(2);
    expect(writes).toBe(2);
  });

  it("shares a failed read within a batch but permits a later retry", async () => {
    const dedupe = new RequestToolExecutionPolicy();
    let executions = 0;
    const execute = async () => ({ result: { error: `temporary_${++executions}` } });
    const args = { instanceId: "metric_1" };

    const [first, sameBatch] = await Promise.all([
      dedupe.run("derived_metric_read", args, execute),
      dedupe.run("derived_metric_read", args, execute)
    ]);
    const retried = await dedupe.run("derived_metric_read", args, execute);

    expect(executions).toBe(2);
    expect(sameBatch.value).toEqual(first.value);
    expect(retried.value).toEqual({ result: { error: "temporary_2" } });
  });

  it("evicts rejected executions so later calls can retry", async () => {
    const dedupe = new RequestToolExecutionPolicy();
    let executions = 0;
    const execute = async () => {
      executions += 1;
      if (executions === 1) throw new Error("temporary");
      return { ok: true };
    };

    await expect(dedupe.run("derived_metric_read", { instanceId: "metric_1" }, execute)).rejects.toThrow("temporary");
    await expect(dedupe.run("derived_metric_read", { instanceId: "metric_1" }, execute)).resolves.toMatchObject({
      value: { ok: true },
      reused: false
    });
    expect(executions).toBe(2);
  });

  it("reuses reversed prepare ids and blocks a second SQLite read for a different range", async () => {
    const dedupe = new RequestToolExecutionPolicy();
    let executions = 0;
    const firstArgs = {
      instanceIds: ["metric_b", "metric_a", "metric_a"],
      from: "2026-08-01T00:00:00Z",
      to: "2026-08-02T00:00:00Z"
    };
    const reversedArgs = {
      instanceIds: ["metric_a", "metric_b"],
      to: "2026-08-02T00:00:00Z",
      from: "2026-08-01T00:00:00Z"
    };
    expect(canonicalDerivedMetricHistoryPrepareArgs(reversedArgs)).toBe(
      canonicalDerivedMetricHistoryPrepareArgs(firstArgs)
    );

    await dedupe.run("derived_metric_history_prepare", firstArgs, async () => ({
      execution: ++executions,
      data_file: "outputs/.tool_cache/prepared.json",
      cache_manifest: "outputs/.tool_cache/manifest.json"
    }));
    const reversed = await dedupe.run("derived_metric_history_prepare", reversedArgs, async () => ({ execution: ++executions }));
    const differentRange = await dedupe.run(
      "derived_metric_history_prepare",
      { ...reversedArgs, to: "2026-08-03T00:00:00Z" },
      async () => ({ execution: ++executions })
    );

    expect(reversed.reused).toBe(true);
    expect(differentRange.reused).toBe(true);
    expect(differentRange.value).toMatchObject({
      history_prepare_already_completed: true,
      data_file: "outputs/.tool_cache/prepared.json",
      cache_manifest: "outputs/.tool_cache/manifest.json"
    });
    expect(executions).toBe(1);
  });

  it("allows a failed history prepare to be corrected before locking the request", async () => {
    const policy = new RequestToolExecutionPolicy();
    let executions = 0;
    const failed = await policy.run("derived_metric_history_prepare", { instanceIds: [] }, async () => ({
      error: "instanceIds required",
      execution: ++executions
    }));
    const repaired = await policy.run("derived_metric_history_prepare", { instanceIds: ["metric_1"] }, async () => ({
      data_file: "outputs/.tool_cache/prepared.json",
      execution: ++executions
    }));

    expect(failed.reused).toBe(false);
    expect(repaired.reused).toBe(false);
    expect(executions).toBe(2);
  });

  it("serializes different prepare calls in the same batch and returns one completed pointer", async () => {
    const policy = new RequestToolExecutionPolicy();
    let executions = 0;
    const execute = async () => {
      executions += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { data_file: "outputs/.tool_cache/prepared.json" };
    };
    const [first, differentRange] = await Promise.all([
      policy.run("derived_metric_history_prepare", {
        instanceIds: ["metric_1"],
        from: "2026-08-01T00:00:00Z"
      }, execute),
      policy.run("derived_metric_history_prepare", {
        instanceIds: ["metric_1"],
        from: "2026-08-02T00:00:00Z"
      }, execute)
    ]);

    expect(first.reused).toBe(false);
    expect(differentRange.reused).toBe(true);
    expect(differentRange.value).toMatchObject({
      history_prepare_already_completed: true,
      data_file: "outputs/.tool_cache/prepared.json"
    });
    expect(executions).toBe(1);
  });

  it("allows one repaired execute_code retry, then locks after a generated file succeeds", async () => {
    const policy = new RequestToolExecutionPolicy();
    let executions = 0;
    await policy.run("derived_metric_history_prepare", { instanceIds: ["metric_1"] }, async () => ({
      data_file: "outputs/.tool_cache/prepared.json"
    }));
    const first = await policy.run("execute_code", { code: "broken" }, async () => ({
      result: { error: "syntax", exitCode: 1 },
      execution: ++executions
    }));
    const repaired = await policy.run("execute_code", { code: "fixed" }, async () => ({
      result: {
        stdout: "chart saved",
        generatedImages: [{ src: "/outputs/chart.png", alt: "chart" }]
      },
      execution: ++executions
    }));
    const blocked = await policy.run("execute_code", { code: "run again" }, async () => ({ execution: ++executions }));

    expect(first.reused).toBe(false);
    expect(repaired.reused).toBe(false);
    expect(blocked.reused).toBe(true);
    expect(executions).toBe(2);
    expect(blocked.value).toMatchObject({
      result: {
        already_completed: true,
        reused_successful_execution: true,
        generatedImages: [{ src: "/outputs/chart.png", alt: "chart" }]
      }
    });
  });

  it("shares an in-flight execute_code failure without consuming the repair attempt", async () => {
    const policy = new RequestToolExecutionPolicy();
    let executions = 0;
    await policy.run("derived_metric_history_prepare", { instanceIds: ["metric_1"] }, async () => ({
      data_file: "outputs/.tool_cache/prepared.json"
    }));
    const executeFailure = async () => {
      executions += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { result: { error: "syntax", exitCode: 1 } };
    };
    const [first, sameBatch] = await Promise.all([
      policy.run("execute_code", { code: "broken" }, executeFailure),
      policy.run("execute_code", { code: "also broken" }, executeFailure)
    ]);
    await policy.run("execute_code", { code: "fixed" }, async () => ({
      result: { generatedImages: [{ src: "/outputs/chart.png", alt: "chart" }] },
      execution: ++executions
    }));

    expect(first.reused).toBe(false);
    expect(sameBatch.reused).toBe(true);
    expect(executions).toBe(2);
  });

  it("treats a zero-exit analysis with no chart as repairable and locks only after an image", async () => {
    const policy = new RequestToolExecutionPolicy();
    let executions = 0;
    await policy.run("derived_metric_history_prepare", { instanceIds: ["metric_1"] }, async () => ({
      data_file: "outputs/.tool_cache/prepared.json"
    }));
    const noChart = await policy.run("execute_code", { code: "print('debug')" }, async () => ({
      result: { stdout: "debug", exitCode: 0, generatedImages: [] },
      execution: ++executions
    }));
    const chart = await policy.run("execute_code", { code: "save_chart()" }, async () => ({
      result: { stdout: "saved", exitCode: 0, generatedImages: [{ src: "/outputs/chart.png", alt: "chart" }] },
      execution: ++executions
    }));
    const repeated = await policy.run("execute_code", { code: "save_chart_again()" }, async () => ({ execution: ++executions }));

    expect(noChart.reused).toBe(false);
    expect(chart.reused).toBe(false);
    expect(repeated.reused).toBe(true);
    expect(repeated.value).toMatchObject({ result: { already_completed: true } });
    expect(executions).toBe(2);
  });

  it("does not lock unrelated execute_code calls when no history batch was prepared", async () => {
    const policy = new RequestToolExecutionPolicy();
    let executions = 0;
    await policy.run("execute_code", { code: "step one" }, async () => ({ ok: true, execution: ++executions }));
    await policy.run("execute_code", { code: "step two" }, async () => ({ ok: true, execution: ++executions }));
    expect(executions).toBe(2);
  });

  it("bounds execute_code after a compacted direct history read marks the dataset ready", async () => {
    const policy = new RequestToolExecutionPolicy();
    let executions = 0;
    policy.markHistoryDatasetReady();

    await policy.run("execute_code", { code: "no chart" }, async () => ({
      result: { exitCode: 0, generatedImages: [] },
      execution: ++executions
    }));
    await policy.run("execute_code", { code: "chart" }, async () => ({
      result: { exitCode: 0, generatedImages: [{ src: "/outputs/chart.png", alt: "chart" }] },
      execution: ++executions
    }));
    const repeated = await policy.run("execute_code", { code: "again" }, async () => ({ execution: ++executions }));

    expect(executions).toBe(2);
    expect(repeated.reused).toBe(true);
    expect(repeated.value).toMatchObject({ result: { already_completed: true } });
  });

  it("waits for a same-batch prepare even when execute_code is listed first", async () => {
    const policy = new RequestToolExecutionPolicy();
    const order: string[] = [];
    const [executeResult] = await Promise.all([
      policy.run("execute_code", { code: "save_chart()" }, async () => {
        order.push("execute");
        return { generatedImages: [{ src: "/outputs/chart.png", alt: "chart" }] };
      }),
      policy.run("derived_metric_history_prepare", { instanceIds: ["metric_1"] }, async () => {
        order.push("prepare_start");
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push("prepare_done");
        return { data_file: "outputs/.tool_cache/prepared.json" };
      })
    ]);

    expect(order).toEqual(["prepare_start", "prepare_done", "execute"]);
    expect(executeResult.reused).toBe(false);
    const repeated = await policy.run("execute_code", { code: "again" }, async () => ({ error: "must not run" }));
    expect(repeated.reused).toBe(true);
    expect(repeated.value).toMatchObject({ already_completed: true });
  });
});
