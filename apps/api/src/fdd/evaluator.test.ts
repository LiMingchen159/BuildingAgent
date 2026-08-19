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

  it("uses TLKW rather than numeric Run_Status codes for CH-01 and CH-02 running evidence", () => {
    const failsToStart = testInstance("chiller_ch_01_commanded_fails_to_start", {
      window_minutes: 5,
      power_on_threshold_kw: 10
    });
    const commandedOff = new Map<string, MaterializerNumericPoint[]>([
      ["chiller_command", constantSeries(1)],
      // Element Run_Status is a numeric state code; 9 does not mean ON.
      ["chiller_status", constantSeries(9)],
      ["chiller_power", constantSeries(0)]
    ]);
    const startEvaluation = evaluateFddRuleSample(
      failsToStart,
      latestInputs(commandedOff),
      commandedOff,
      baseMs + 10 * 60_000,
      60
    );
    expect(startEvaluation.status).toBe("fault");
    expect(startEvaluation.derivedValues).toMatchObject({
      running: 0,
      runStatus: 9,
      runningPowerKw: 0,
      statusPowerConflict: 1,
      runningEvidenceSourcePower: 1
    });

    const uncommanded = testInstance("chiller_ch_02_uncommanded_operation", {
      window_minutes: 5,
      power_on_threshold_kw: 10
    });
    const offSeries = new Map<string, MaterializerNumericPoint[]>([
      ["chiller_command", constantSeries(0)],
      ["chiller_status", constantSeries(9)],
      ["chiller_power", constantSeries(0)]
    ]);
    const uncommandedEvaluation = evaluateFddRuleSample(
      uncommanded,
      latestInputs(offSeries),
      offSeries,
      baseMs + 10 * 60_000,
      60
    );
    expect(uncommandedEvaluation.status).toBe("ok");
    expect(uncommandedEvaluation.valueText).toBe("normal");
    expect(uncommandedEvaluation.derivedValues).toMatchObject({
      running: 0,
      runStatus: 9,
      runningPowerKw: 0,
      statusPowerConflict: 1
    });
  });

  it("confirms CH-01 and CH-02 level conditions across two 15-minute polls and clears on recovery", () => {
    const cases = [
      {
        key: "chiller_ch_01_commanded_fails_to_start",
        fault: { chiller_command: 1, chiller_status: 9, chiller_power: 0 },
        recovered: { chiller_command: 1, chiller_status: 5, chiller_power: 120 }
      },
      {
        key: "chiller_ch_02_uncommanded_operation",
        fault: { chiller_command: 0, chiller_status: 5, chiller_power: 120 },
        recovered: { chiller_command: 0, chiller_status: 9, chiller_power: 0 }
      }
    ] as const;
    for (const testCase of cases) {
      const instance = testInstance(testCase.key, { window_minutes: 5, power_on_threshold_kw: 10 });
      const series = (values: Record<string, number>, times: number[]) => new Map<string, MaterializerNumericPoint[]>(
        Object.entries(values).map(([role, value]) => [
          role,
          materializerSortedSeries(new Map(times.map((minutes) => [new Date(baseMs + minutes * 60_000).toISOString(), value])))
        ])
      );
      const firstSeries = series(testCase.fault, [0]);
      const first = evaluateFddRuleSample(instance, latestInputs(firstSeries), firstSeries, baseMs, 15 * 60);
      expect(first.status, testCase.key).toBe("ok");
      expect(first.valueNum, testCase.key).toBe(0);
      expect(first.derivedValues).toMatchObject({
        conditionPersistencePending: 1,
        conditionPersistenceLatched: 0,
        conditionPersistenceFaultSampleCount: 1
      });

      const secondSeries = series(testCase.fault, [0, 15]);
      const second = evaluateFddRuleSample(
        instance,
        latestInputs(secondSeries),
        secondSeries,
        baseMs + 15 * 60_000,
        15 * 60,
        { sampleMs: baseMs, status: first.status, ...(first.derivedValues ? { derivedValues: first.derivedValues } : {}) }
      );
      expect(second.status, testCase.key).toBe("fault");
      expect(second.valueNum, testCase.key).toBe(1);
      expect(second.derivedValues).toMatchObject({
        cadenceAwareConditionPersistence: 1,
        conditionPersistencePending: 0,
        conditionPersistenceLatched: 1,
        conditionPersistenceFaultSampleCount: 2,
        conditionPersistenceElapsedMinutes: 15
      });

      const recoveredSeries = series(testCase.recovered, [30]);
      const recovered = evaluateFddRuleSample(
        instance,
        latestInputs(recoveredSeries),
        recoveredSeries,
        baseMs + 30 * 60_000,
        15 * 60,
        {
          sampleMs: baseMs + 15 * 60_000,
          status: second.status,
          ...(second.derivedValues ? { derivedValues: second.derivedValues } : {})
        }
      );
      expect(recovered.status, testCase.key).toBe("ok");
      expect(recovered.valueNum, testCase.key).toBe(0);
      expect(recovered.derivedValues).toMatchObject({ conditionPersistencePending: 0, conditionPersistenceLatched: 0 });
    }
  });

  it("confirms and latches a CH-03 power fall across 15-minute Element polls with a 5-minute persistence window", () => {
    const instance = testInstance("chiller_ch_03_abnormal_shutdown", {
      window_minutes: 5,
      running_power_min_kw: 10
    });
    const pollSeries = (...values: number[]): MaterializerNumericPoint[] => materializerSortedSeries(new Map(
      values.map((value, index) => [new Date(baseMs + index * 15 * 60_000).toISOString(), value])
    ));
    const pendingSeries = new Map<string, MaterializerNumericPoint[]>([
      ["chiller_command", pollSeries(1, 1)],
      ["chiller_status", pollSeries(5, 9)],
      ["chiller_alarm", pollSeries(0, 1)],
      ["chiller_running_power", pollSeries(120, 0)]
    ]);
    const pending = evaluateFddRuleSample(
      instance,
      latestInputs(pendingSeries),
      pendingSeries,
      baseMs + 15 * 60_000,
      15 * 60
    );
    expect(pending.status).toBe("ok");
    expect(pending.valueNum).toBe(0);
    expect(pending.derivedValues).toMatchObject({
      edgeEventPending: 1,
      edgeEventLatched: 0,
      edgeEventLowSampleCount: 1,
      edgeEventElapsedMinutes: 0
    });

    const confirmedSeries = new Map<string, MaterializerNumericPoint[]>([
      ["chiller_command", pollSeries(1, 1, 1)],
      ["chiller_status", pollSeries(5, 9, 9)],
      ["chiller_alarm", pollSeries(0, 1, 1)],
      ["chiller_running_power", pollSeries(120, 0, 0)]
    ]);
    const evaluation = evaluateFddRuleSample(
      instance,
      latestInputs(confirmedSeries),
      confirmedSeries,
      baseMs + 30 * 60_000,
      15 * 60
    );

    expect(evaluation.status).toBe("fault");
    expect(evaluation.valueNum).toBe(1);
    expect(evaluation.quality).toBe("good");
    expect(evaluation.derivedValues).toMatchObject({
      running: 0,
      runStatus: 9,
      runningPowerKw: 0,
      runningPowerFell: 1,
      transitionLookbackMinutes: 30,
      statusPowerConflict: 1,
      persistenceWindowMinutes: 5,
      cadenceAwareEdgePersistence: 1,
      edgeEventPending: 0,
      edgeEventLatched: 1,
      edgeEventLowSampleCount: 2,
      edgeEventElapsedMinutes: 15
    });

    // The event remains faulted after the source edge leaves the raw query
    // window, but it clears safely on command-off.
    const latchedOnlySeries = new Map<string, MaterializerNumericPoint[]>([
      ["chiller_command", pollSeries(1)],
      ["chiller_status", pollSeries(9)],
      ["chiller_alarm", pollSeries(1)],
      ["chiller_running_power", pollSeries(0)]
    ]);
    const latched = evaluateFddRuleSample(
      instance,
      latestInputs(latchedOnlySeries),
      latchedOnlySeries,
      baseMs + 45 * 60_000,
      15 * 60,
      {
        sampleMs: baseMs + 30 * 60_000,
        status: evaluation.status,
        ...(evaluation.derivedValues ? { derivedValues: evaluation.derivedValues } : {})
      }
    );
    expect(latched.status).toBe("fault");
    expect(latched.valueNum).toBe(1);
    expect(latched.derivedValues?.edgeEventLatched).toBe(1);

    const resetSeries = new Map<string, MaterializerNumericPoint[]>([
      ["chiller_command", pollSeries(0)],
      ["chiller_status", pollSeries(9)],
      ["chiller_alarm", pollSeries(0)],
      ["chiller_running_power", pollSeries(0)]
    ]);
    const reset = evaluateFddRuleSample(
      instance,
      latestInputs(resetSeries),
      resetSeries,
      baseMs + 60 * 60_000,
      15 * 60,
      {
        sampleMs: baseMs + 45 * 60_000,
        status: latched.status,
        ...(latched.derivedValues ? { derivedValues: latched.derivedValues } : {})
      }
    );
    expect(reset.status).toBe("ok");
    expect(reset.valueNum).toBe(0);
    expect(reset.derivedValues).toMatchObject({ edgeEventPending: 0, edgeEventLatched: 0 });
  });
});
