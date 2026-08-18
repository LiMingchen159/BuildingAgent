import { describe, expect, it } from "vitest";
import type { DerivedMetricInstance } from "../derivedMetrics.js";
import { evaluateFddRuleSample, materializerSortedSeries, type MaterializerNumericPoint } from "./evaluator.js";
import { executableFddAlgorithmKeys } from "./runtimeRegistry.js";

const baseMs = Date.parse("2026-08-11T00:00:00.000Z");

function testInstance(metricKey: string, parameters: Record<string, number>): DerivedMetricInstance {
  return {
    instanceId: `metric_${metricKey}`,
    projectId: "project_alpha",
    definitionId: `def_${metricKey}`,
    versionId: `ver_${metricKey}`,
    metricKey,
    metricType: "fdd_rule",
    entityId: "CH-01",
    displayName: metricKey,
    formulaVersion: "1.0.0",
    formula: "test formula",
    status: "active",
    createdAt: new Date(baseMs).toISOString(),
    updatedAt: new Date(baseMs).toISOString(),
    metadata: {
      fddParameters: Object.entries(parameters).map(([key, value]) => ({
        key,
        value,
        reason: "test"
      }))
    },
    dependencies: []
  };
}

function constantSeries(value: number): MaterializerNumericPoint[] {
  return materializerSortedSeries(new Map(
    [0, 5, 10].map((minutes) => [
      new Date(baseMs + minutes * 60_000).toISOString(),
      value
    ])
  ));
}

function latestInputs(seriesByRole: Map<string, MaterializerNumericPoint[]>): Record<string, number> {
  const inputs: Record<string, number> = {};
  for (const [role, series] of seriesByRole) {
    inputs[role] = series[series.length - 1]!.value;
  }
  return inputs;
}

describe("FDD evaluator", () => {
  it("has a non-fallback evaluator path for every registered runtime algorithm", () => {
    for (const algorithmKey of executableFddAlgorithmKeys()) {
      const evaluation = evaluateFddRuleSample(testInstance(algorithmKey, {}), {}, new Map(), baseMs, 60);
      expect(evaluation.reason, algorithmKey).not.toBe("No executable FDD rule evaluator is available for this algorithm.");
    }
  });

  it("evaluates CH-51 with normalized heat-balance error", () => {
    const instance = testInstance("chiller_ch_51_heat_balance_sensor_consistency", {
      window_minutes: 10,
      heat_balance_epsilon: 0.1
    });
    const seriesByRole = new Map<string, MaterializerNumericPoint[]>([
      ["chw_return_temp", constantSeries(12)],
      ["chw_supply_temp", constantSeries(6)],
      ["chw_flow_rate", constantSeries(100)],
      ["cw_return_temp", constantSeries(25)],
      ["cw_supply_temp", constantSeries(30)],
      ["cw_flow_rate", constantSeries(100)],
      ["chiller_power", constantSeries(200)]
    ]);

    const evaluation = evaluateFddRuleSample(instance, latestInputs(seriesByRole), seriesByRole, baseMs + 10 * 60_000, 60);

    expect(evaluation.status).toBe("fault");
    expect(evaluation.derivedValues?.qEvaporator).toBe(600);
    expect(evaluation.derivedValues?.qCondenser).toBe(500);
    expect(evaluation.derivedValues?.heatBalanceError).toBeCloseTo(0.2);
  });

  it("evaluates CH-39 compressor overload using current quantity evidence", () => {
    const instance = testInstance("chiller_ch_39_compressor_overload", {
      window_minutes: 10,
      current_high_amp: 500,
      power_high_kw: 1000
    });
    const seriesByRole = new Map<string, MaterializerNumericPoint[]>([
      ["compressor_current", constantSeries(650)],
      ["chiller_power", constantSeries(1200)]
    ]);

    const evaluation = evaluateFddRuleSample(instance, latestInputs(seriesByRole), seriesByRole, baseMs + 10 * 60_000, 60);

    expect(evaluation.status).toBe("fault");
    expect(evaluation.derivedValues?.compressorCurrent).toBe(650);
    expect(evaluation.derivedValues?.currentHighAmp).toBe(500);
  });
});
