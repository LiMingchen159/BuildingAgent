import { describe, expect, it, vi } from "vitest";
import { createParallelToolActivityCoordinator } from "./parallelToolActivity.js";

describe("parallelToolActivity", () => {
  it("reuses the same id for parallel running and done rows", () => {
    const coordinator = createParallelToolActivityCoordinator();
    const emitted: Array<Record<string, unknown>> = [];
    const emit = (payload: Record<string, unknown>): void => {
      emitted.push(payload);
    };
    const label = (_tool: string, state: "running" | "done"): string =>
      state === "running" ? "Using tool" : "Used tool";

    coordinator.onToolStarted(
      { metadata: { iteration: 1, toolCount: 2 } },
      emit,
      label,
      () => undefined,
      "req_test"
    );
    coordinator.onToolStarted(
      { metadata: { iteration: 1, tool: "bms_timeseries_query", toolCallId: "call_a" } },
      emit,
      label,
      () => undefined,
      "req_test"
    );
    coordinator.onToolStarted(
      { metadata: { iteration: 1, tool: "bms_timeseries_query", toolCallId: "call_b" } },
      emit,
      label,
      () => undefined,
      "req_test"
    );

    coordinator.onToolCompleted(
      { metadata: { iteration: 1, tool: "bms_timeseries_query", toolCallId: "call_a", durationMs: 100 } },
      emit,
      label,
      () => undefined,
      "req_test"
    );
    coordinator.onToolCompleted(
      { metadata: { iteration: 1, tool: "bms_timeseries_query", toolCallId: "call_b", durationMs: 200 } },
      emit,
      label,
      () => undefined,
      "req_test"
    );
    coordinator.onToolCompleted(
      { metadata: { iteration: 1, parallel: true, durationMs: 250 } },
      emit,
      label,
      () => undefined,
      "req_test"
    );

    const running = emitted.find((row) => row.status === "running");
    const done = emitted.find((row) => row.status === "done" && String(row.label).includes("parallel"));
    expect(running?.id).toBe("tool_req_test_iter1_bms_timeseries_query_parallel");
    expect(done?.id).toBe(running?.id);
  });
});
