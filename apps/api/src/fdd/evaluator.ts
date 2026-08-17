import type { DerivedMetricInstance } from "../derivedMetrics.js";

const FDD_DEFAULT_ALIGNMENT_TOLERANCE_SECONDS = 15 * 60;
const FDD_PERSISTENCE_MIN_GRACE_MS = 60_000;
const FDD_PERSISTENCE_MAX_GRACE_MS = 120_000;

export interface MaterializerNumericPoint {
  ts: string;
  value: number;
  ms: number;
}

export interface FddRuleEvaluation {
  valueNum?: number;
  valueText: string;
  quality: string;
  status: string;
  reason?: string;
  derivedValues?: Record<string, number>;
}

interface FddWindowPredicateResult {
  calculable: boolean;
  fault: boolean;
}

interface FddWindowPersistenceStats {
  validCount: number;
  faultCount: number;
  normalCount: number;
  faultSpanMinutes: number;
  persisted: boolean;
}

interface ChillerDocRuleResult {
  calculable: boolean;
  fault: boolean;
  reason?: string;
  derivedValues?: Record<string, number>;
}

export function materializerSortedSeries(series: Map<string, number>): MaterializerNumericPoint[] {
  return [...series.entries()]
    .flatMap(([ts, value]) => {
      const ms = Date.parse(ts);
      return Number.isFinite(ms) && Number.isFinite(value)
        ? [{ ts, value, ms }]
        : [];
    })
    .sort((left, right) => left.ms - right.ms);
}

export function materializerNearestNumericPoint(points: MaterializerNumericPoint[], targetMs: number, toleranceMs: number): MaterializerNumericPoint | null {
  if (points.length === 0) return null;
  let low = 0;
  let high = points.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (points[mid]!.ms < targetMs) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  const candidates = [points[low], points[low - 1]].filter((point): point is MaterializerNumericPoint => Boolean(point));
  const nearest = candidates.sort((left, right) => Math.abs(left.ms - targetMs) - Math.abs(right.ms - targetMs))[0] ?? null;
  return nearest && Math.abs(nearest.ms - targetMs) <= toleranceMs ? nearest : null;
}

function numericFddParameter(instance: DerivedMetricInstance, key: string, fallback: number): number {
  const parameters = instance.metadata?.fddParameters;
  if (!Array.isArray(parameters)) return fallback;
  for (const parameter of parameters) {
    if (!isRecordValue(parameter) || parameter.key !== key) continue;
    const value = typeof parameter.value === "number"
      ? parameter.value
      : typeof parameter.value === "string"
        ? Number(parameter.value)
        : NaN;
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fddInput(inputs: Record<string, number>, role: string): number | undefined {
  const value = inputs[role];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function fddInputBoolean(inputs: Record<string, number>, role: string): boolean | undefined {
  const value = fddInput(inputs, role);
  return typeof value === "number" ? value > 0.5 : undefined;
}

function fddChillerRunningEvidence(
  instance: DerivedMetricInstance,
  inputs: Record<string, number>
): { running?: boolean; reason?: string; derivedValues: Record<string, number> } {
  const runStatus = fddInput(inputs, "chiller_status");
  const runStatusBoolean = fddInputBoolean(inputs, "chiller_status");
  const power = fddInput(inputs, "chiller_running_power") ?? fddInput(inputs, "chiller_power");
  const minPower = numericFddParameter(instance, "running_power_min_kw", 10);
  const derivedValues: Record<string, number> = {
    ...(typeof runStatus === "number" ? { runStatus } : {}),
    ...(typeof power === "number" ? { runningPowerKw: power, runningPowerMinKw: minPower } : {})
  };
  if (typeof power === "number") {
    return {
      running: power > minPower,
      reason: power > minPower
        ? "Chiller running state follows project grounding: grounded running-power evidence is meaningfully positive."
        : "Chiller is treated as not running by project grounding because grounded running-power evidence is not meaningfully positive.",
      derivedValues
    };
  }
  if (runStatusBoolean !== undefined) {
    return {
      running: runStatusBoolean,
      reason: "Chiller running state fell back to status-only evidence because grounded running-power evidence was unavailable.",
      derivedValues
    };
  }
  return {
    derivedValues
  };
}

function fddFaultSample(fault: boolean, reason: string, derivedValues?: Record<string, number>): FddRuleEvaluation {
  return {
    valueNum: fault ? 1 : 0,
    valueText: fault ? "fault" : "normal",
    quality: "good",
    status: fault ? "fault" : "ok",
    reason,
    ...(derivedValues ? { derivedValues } : {})
  };
}

function fddInvalidSample(reason: string): FddRuleEvaluation {
  return {
    valueText: "no_data",
    quality: "invalid",
    status: "not_calculable",
    reason
  };
}

function fddInactiveSample(reason: string): FddRuleEvaluation {
  return {
    valueText: "inactive",
    quality: "invalid",
    status: "inactive",
    reason
  };
}

function rollingStd(points: MaterializerNumericPoint[], targetMs: number, windowMs: number): { std: number; count: number } | null {
  const values = points
    .filter((point) => point.ms <= targetMs && point.ms >= targetMs - windowMs)
    .map((point) => point.value);
  if (values.length < 3) return null;
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return { std: Math.sqrt(variance), count: values.length };
}

export function fddPersistenceWindowGraceMs(windowMinutes: number): number {
  const windowMs = Math.max(0, windowMinutes) * 60 * 1000;
  if (windowMs <= 0) return 0;
  return Math.max(
    FDD_PERSISTENCE_MIN_GRACE_MS,
    Math.min(FDD_PERSISTENCE_MAX_GRACE_MS, windowMs * 0.1)
  );
}

function fddAlignedInputsAtTimestamp(
  roles: string[],
  seriesByRole: Map<string, MaterializerNumericPoint[]>,
  targetMs: number,
  toleranceMs: number
): Record<string, number> | null {
  const inputs: Record<string, number> = {};
  for (const role of roles) {
    const point = materializerNearestNumericPoint(seriesByRole.get(role) ?? [], targetMs, toleranceMs);
    if (!point) return null;
    inputs[role] = point.value;
  }
  return inputs;
}

function fddWindowPersistenceStats({
  roles,
  seriesByRole,
  targetMs,
  toleranceMs,
  windowMinutes,
  preferredAnchorRole,
  predicate
}: {
  roles: string[];
  seriesByRole: Map<string, MaterializerNumericPoint[]>;
  targetMs: number;
  toleranceMs: number;
  windowMinutes: number;
  preferredAnchorRole?: string;
  predicate: (inputs: Record<string, number>, sampleMs: number) => FddWindowPredicateResult;
}): FddWindowPersistenceStats {
  const windowMs = Math.max(0, windowMinutes) * 60 * 1000;
  const windowStartMs = targetMs - windowMs;
  const anchors = roles
    .map((role) => ({ role, points: seriesByRole.get(role) ?? [] }))
    .filter((entry) => entry.points.length > 0)
    .sort((left, right) => {
      if (left.role === preferredAnchorRole && right.role !== preferredAnchorRole) return -1;
      if (right.role === preferredAnchorRole && left.role !== preferredAnchorRole) return 1;
      return right.points.length - left.points.length;
    });
  const anchor = anchors[0];
  const candidateTimes = new Set<number>([targetMs]);
  if (anchor) {
    for (const point of anchor.points) {
      if (point.ms >= windowStartMs && point.ms <= targetMs) {
        candidateTimes.add(point.ms);
      }
    }
  }

  let validCount = 0;
  let faultCount = 0;
  let normalCount = 0;
  let firstFaultMs: number | null = null;
  let latestFaultMs: number | null = null;
  for (const sampleMs of [...candidateTimes].sort((left, right) => left - right)) {
    const alignedInputs = fddAlignedInputsAtTimestamp(roles, seriesByRole, sampleMs, toleranceMs);
    if (!alignedInputs) continue;
    const result = predicate(alignedInputs, sampleMs);
    if (!result.calculable) continue;
    validCount += 1;
    if (result.fault) {
      faultCount += 1;
      firstFaultMs ??= sampleMs;
      latestFaultMs = sampleMs;
    } else {
      normalCount += 1;
    }
  }

  const faultSpanMs = firstFaultMs !== null && latestFaultMs !== null ? latestFaultMs - firstFaultMs : 0;
  const recentEnough = latestFaultMs !== null && targetMs - latestFaultMs <= toleranceMs;
  const coversWindow = windowMs <= 0 || faultSpanMs >= Math.max(0, windowMs - fddPersistenceWindowGraceMs(windowMinutes));
  return {
    validCount,
    faultCount,
    normalCount,
    faultSpanMinutes: Number((faultSpanMs / 60_000).toFixed(2)),
    persisted: faultCount >= 2 && normalCount === 0 && faultCount === validCount && recentEnough && coversWindow
  };
}

function fddWindowedFaultSample({
  ruleLabel,
  currentFault,
  derivedValues,
  roles,
  seriesByRole,
  targetMs,
  toleranceMs,
  windowMinutes,
  preferredAnchorRole,
  predicate
}: {
  ruleLabel: string;
  currentFault: boolean;
  derivedValues?: Record<string, number>;
  roles: string[];
  seriesByRole: Map<string, MaterializerNumericPoint[]>;
  targetMs: number;
  toleranceMs: number;
  windowMinutes: number;
  preferredAnchorRole?: string;
  predicate: (inputs: Record<string, number>, sampleMs: number) => FddWindowPredicateResult;
}): FddRuleEvaluation {
  const baseDerivedValues = {
    ...(derivedValues ?? {}),
    persistenceWindowMinutes: windowMinutes
  };
  if (!currentFault) {
    return fddFaultSample(
      false,
      `${ruleLabel} condition is not present at the current sample; the configured ${windowMinutes} min persistence window is not faulted.`,
      baseDerivedValues
    );
  }

  const persistence = fddWindowPersistenceStats({
    roles,
    seriesByRole,
    targetMs,
    toleranceMs,
    windowMinutes,
    ...(preferredAnchorRole ? { preferredAnchorRole } : {}),
    predicate
  });
  const persistenceDerivedValues = {
    ...baseDerivedValues,
    persistenceValidSamples: persistence.validCount,
    persistenceFaultSamples: persistence.faultCount,
    persistenceNormalSamples: persistence.normalCount,
    persistenceSpanMinutes: persistence.faultSpanMinutes
  };
  if (persistence.persisted) {
    return fddFaultSample(
      true,
      `${ruleLabel} condition persisted across the configured ${windowMinutes} min FDD window.`,
      persistenceDerivedValues
    );
  }
  return fddFaultSample(
    false,
    `${ruleLabel} condition is present at the current sample, but it is not confirmed across the configured ${windowMinutes} min FDD window (${persistence.faultCount}/${persistence.validCount} valid samples faulted, ${persistence.faultSpanMinutes} min fault span).`,
    persistenceDerivedValues
  );
}

function missingInputResult(roles: string[]): ChillerDocRuleResult {
  return {
    calculable: false,
    fault: false,
    reason: `Missing required FDD input(s): ${roles.join(", ")}.`
  };
}

function requiredValues(inputs: Record<string, number>, roles: string[]): Record<string, number> | null {
  const values: Record<string, number> = {};
  for (const role of roles) {
    const value = fddInput(inputs, role);
    if (value === undefined) return null;
    values[role] = value;
  }
  return values;
}

function valueFor(values: Record<string, number>, role: string): number {
  return values[role]!;
}

function chillerDocWindowedRule({
  ruleLabel,
  roles,
  instance,
  inputs,
  seriesByRole,
  targetMs,
  toleranceMs,
  windowMinutes,
  preferredAnchorRole,
  evaluate
}: {
  ruleLabel: string;
  roles: string[];
  instance: DerivedMetricInstance;
  inputs: Record<string, number>;
  seriesByRole: Map<string, MaterializerNumericPoint[]>;
  targetMs: number;
  toleranceMs: number;
  windowMinutes: number;
  preferredAnchorRole?: string;
  evaluate: (inputs: Record<string, number>, sampleMs: number) => ChillerDocRuleResult;
}): FddRuleEvaluation {
  const current = evaluate(inputs, targetMs);
  if (!current.calculable) return fddInvalidSample(current.reason ?? `Missing required FDD input(s): ${roles.join(", ")}.`);
  return fddWindowedFaultSample({
    ruleLabel,
    currentFault: current.fault,
    ...(current.derivedValues ? { derivedValues: current.derivedValues } : {}),
    roles,
    seriesByRole,
    targetMs,
    toleranceMs,
    windowMinutes,
    ...(preferredAnchorRole ? { preferredAnchorRole } : {}),
    predicate: (sampleInputs, sampleMs) => {
      const result = evaluate(sampleInputs, sampleMs);
      return { calculable: result.calculable, fault: result.fault };
    }
  });
}

function fddSeriesWindow(points: MaterializerNumericPoint[], targetMs: number, windowMinutes: number): MaterializerNumericPoint[] {
  const windowStartMs = targetMs - Math.max(0, windowMinutes) * 60 * 1000;
  return points.filter((point) => point.ms >= windowStartMs && point.ms <= targetMs);
}

function fddSeriesDelta(points: MaterializerNumericPoint[], targetMs: number, windowMinutes: number): { delta: number; minutes: number; count: number } | null {
  const window = fddSeriesWindow(points, targetMs, windowMinutes);
  const first = window[0];
  const last = window[window.length - 1];
  if (!first || !last || first.ms === last.ms) return null;
  return {
    delta: last.value - first.value,
    minutes: (last.ms - first.ms) / 60_000,
    count: window.length
  };
}

function fddBooleanFall(points: MaterializerNumericPoint[], targetMs: number, windowMinutes: number): boolean | null {
  const window = fddSeriesWindow(points, targetMs, windowMinutes);
  if (window.length < 2) return null;
  for (let index = 1; index < window.length; index += 1) {
    if (window[index - 1]!.value > 0.5 && window[index]!.value <= 0.5) return true;
  }
  return false;
}

function fddStuckEvidence(
  seriesByRole: Map<string, MaterializerNumericPoint[]>,
  role: string,
  targetMs: number,
  windowMinutes: number,
  epsilon: number
): { stuck: boolean; samples: number; delta: number; spanMinutes: number } | null {
  const delta = fddSeriesDelta(seriesByRole.get(role) ?? [], targetMs, windowMinutes);
  if (!delta) return null;
  return {
    stuck: Math.abs(delta.delta) <= epsilon,
    samples: delta.count,
    delta: delta.delta,
    spanMinutes: delta.minutes
  };
}

function fddCrossingCount(
  seriesByRole: Map<string, MaterializerNumericPoint[]>,
  signalRole: string,
  setpointRole: string,
  targetMs: number,
  toleranceMs: number,
  windowMinutes: number
): number | null {
  const signal = fddSeriesWindow(seriesByRole.get(signalRole) ?? [], targetMs, windowMinutes);
  if (signal.length < 2) return null;
  let previousSign: number | null = null;
  let crossings = 0;
  for (const point of signal) {
    const setpoint = materializerNearestNumericPoint(seriesByRole.get(setpointRole) ?? [], point.ms, toleranceMs);
    if (!setpoint) continue;
    const diff = point.value - setpoint.value;
    const sign = diff > 0 ? 1 : diff < 0 ? -1 : 0;
    if (sign === 0) continue;
    if (previousSign !== null && sign !== previousSign) crossings += 1;
    previousSign = sign;
  }
  return previousSign === null ? null : crossings;
}

function flowWithin(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

function rangeFault(value: number, min: number, max: number): boolean {
  return value < min || value > max;
}

function compareRule(
  instance: DerivedMetricInstance,
  inputs: Record<string, number>,
  roles: string[],
  derivedRole: string,
  parameterKey: string,
  fallback: number,
  fault: (left: number, threshold: number, values: Record<string, number>) => boolean,
  extraDerived?: (values: Record<string, number>, threshold: number) => Record<string, number>
): ChillerDocRuleResult {
  const values = requiredValues(inputs, roles);
  if (!values) return missingInputResult(roles);
  const threshold = numericFddParameter(instance, parameterKey, fallback);
  const left = valueFor(values, derivedRole);
  return {
    calculable: true,
    fault: fault(left, threshold, values),
    derivedValues: {
      [derivedRole]: left,
      [parameterKey]: threshold,
      ...(extraDerived?.(values, threshold) ?? {})
    }
  };
}

function evaluateImportedChillerDocRule(
  instance: DerivedMetricInstance,
  inputs: Record<string, number>,
  seriesByRole: Map<string, MaterializerNumericPoint[]>,
  targetMs: number,
  toleranceMs: number,
  windowMinutes: number
): FddRuleEvaluation | null {
  const key = instance.metricKey;

  const windowed = (
    ruleLabel: string,
    roles: string[],
    evaluate: (inputs: Record<string, number>, sampleMs: number) => ChillerDocRuleResult,
    preferredAnchorRole = roles[roles.length - 1] ?? roles[0] ?? "chiller_status"
  ): FddRuleEvaluation => chillerDocWindowedRule({
    ruleLabel,
    roles,
    instance,
    inputs,
    seriesByRole,
    targetMs,
    toleranceMs,
    windowMinutes,
    ...(preferredAnchorRole ? { preferredAnchorRole } : {}),
    evaluate
  });

  switch (key) {
    case "chiller_ch_01_commanded_fails_to_start":
      return windowed("CH-01 Commanded chiller fails to start", ["chiller_command", "chiller_status", "chiller_power"], (sample) => {
        const values = requiredValues(sample, ["chiller_command", "chiller_status", "chiller_power"]);
        if (!values) return missingInputResult(["chiller_command", "chiller_status", "chiller_power"]);
        const powerOnThresholdKw = numericFddParameter(instance, "power_on_threshold_kw", 10);
        const commandOn = valueFor(values, "chiller_command") > 0.5;
        const statusOn = valueFor(values, "chiller_status") > 0.5;
        const chillerPower = valueFor(values, "chiller_power");
        return {
          calculable: true,
          fault: commandOn && !statusOn && chillerPower < powerOnThresholdKw,
          derivedValues: { commandOn: commandOn ? 1 : 0, statusOn: statusOn ? 1 : 0, chillerPower, powerOnThresholdKw }
        };
      }, "chiller_power");

    case "chiller_ch_02_uncommanded_operation":
      return windowed("CH-02 Uncommanded chiller operation", ["chiller_command", "chiller_status", "chiller_power"], (sample) => {
        const values = requiredValues(sample, ["chiller_command", "chiller_status", "chiller_power"]);
        if (!values) return missingInputResult(["chiller_command", "chiller_status", "chiller_power"]);
        const powerOnThresholdKw = numericFddParameter(instance, "power_on_threshold_kw", 10);
        const commandOn = valueFor(values, "chiller_command") > 0.5;
        const statusOn = valueFor(values, "chiller_status") > 0.5;
        const chillerPower = valueFor(values, "chiller_power");
        return {
          calculable: true,
          fault: !commandOn && (statusOn || chillerPower > powerOnThresholdKw),
          derivedValues: { commandOn: commandOn ? 1 : 0, statusOn: statusOn ? 1 : 0, chillerPower, powerOnThresholdKw }
        };
      }, "chiller_power");

    case "chiller_ch_03_abnormal_shutdown":
      return windowed("CH-03 Abnormal chiller shutdown", ["chiller_command", "chiller_status", "chiller_alarm"], (sample, sampleMs) => {
        const values = requiredValues(sample, ["chiller_command", "chiller_status", "chiller_alarm"]);
        if (!values) return missingInputResult(["chiller_command", "chiller_status", "chiller_alarm"]);
        const commandOn = valueFor(values, "chiller_command") > 0.5;
        const statusOn = valueFor(values, "chiller_status") > 0.5;
        const alarmOn = valueFor(values, "chiller_alarm") > 0.5;
        const fell = fddBooleanFall(seriesByRole.get("chiller_status") ?? [], sampleMs, windowMinutes);
        if (fell === null) return { calculable: false, fault: false, reason: "Not enough chiller status history to detect shutdown." };
        return {
          calculable: true,
          fault: commandOn && !statusOn && fell,
          derivedValues: { commandOn: commandOn ? 1 : 0, statusOn: statusOn ? 1 : 0, alarmOn: alarmOn ? 1 : 0, statusFell: fell ? 1 : 0 }
        };
      }, "chiller_status");

    case "chiller_ch_04_running_no_cooling_output":
      return windowed("CH-04 Chiller running with no cooling output", ["chiller_status", "chiller_power", "chw_supply_temp", "chw_return_temp"], (sample) => {
        const values = requiredValues(sample, ["chiller_status", "chiller_power", "chw_supply_temp", "chw_return_temp"]);
        if (!values) return missingInputResult(["chiller_status", "chiller_power", "chw_supply_temp", "chw_return_temp"]);
        const powerOnThresholdKw = numericFddParameter(instance, "power_on_threshold_kw", 10);
        const deltaTMin = numericFddParameter(instance, "delta_t_min", 1.7);
        const deltaT = valueFor(values, "chw_return_temp") - valueFor(values, "chw_supply_temp");
        const statusOn = valueFor(values, "chiller_status") > 0.5;
        const chillerPower = valueFor(values, "chiller_power");
        return {
          calculable: true,
          fault: statusOn && chillerPower > powerOnThresholdKw && deltaT < deltaTMin,
          derivedValues: { statusOn: statusOn ? 1 : 0, chillerPower, powerOnThresholdKw, deltaT, deltaTMin }
        };
      }, "chw_return_temp");

    case "chiller_ch_05_prolonged_low_load":
      return windowed("CH-05 Prolonged low load operation", ["chiller_status", "part_load_ratio"], (sample) => {
        const values = requiredValues(sample, ["chiller_status", "part_load_ratio"]);
        if (!values) return missingInputResult(["chiller_status", "part_load_ratio"]);
        const plrMin = numericFddParameter(instance, "plr_min", 0.3);
        const statusOn = valueFor(values, "chiller_status") > 0.5;
        const partLoadRatio = valueFor(values, "part_load_ratio");
        return {
          calculable: true,
          fault: statusOn && partLoadRatio < plrMin,
          derivedValues: { statusOn: statusOn ? 1 : 0, partLoadRatio, plrMin }
        };
      }, "part_load_ratio");

    case "chiller_ch_06_loading_response_fault":
      return windowed("CH-06 Loading command response", ["load_command", "load_actual", "chiller_power"], (_sample, sampleMs) => {
        const command = fddSeriesDelta(seriesByRole.get("load_command") ?? [], sampleMs, windowMinutes);
        const actual = fddSeriesDelta(seriesByRole.get("load_actual") ?? [], sampleMs, windowMinutes);
        const power = fddSeriesDelta(seriesByRole.get("chiller_power") ?? [], sampleMs, windowMinutes);
        if (!command || !actual || !power) return { calculable: false, fault: false, reason: "Not enough load command, load actual, or power history to detect response." };
        const responseDeadbandPercent = numericFddParameter(instance, "response_deadband_percent", 5);
        return {
          calculable: true,
          fault: command.delta > responseDeadbandPercent && actual.delta <= responseDeadbandPercent && power.delta <= responseDeadbandPercent,
          derivedValues: {
            loadCommandDelta: command.delta,
            loadActualDelta: actual.delta,
            chillerPowerDelta: power.delta,
            responseDeadbandPercent
          }
        };
      }, "load_command");

    case "chiller_ch_07_unloading_failure":
      return windowed("CH-07 Unloading failure", ["load_command", "load_actual", "chiller_power", "chw_supply_temp", "chw_supply_temp_setpoint"], (sample, sampleMs) => {
        const values = requiredValues(sample, ["chw_supply_temp", "chw_supply_temp_setpoint"]);
        if (!values) return missingInputResult(["chw_supply_temp", "chw_supply_temp_setpoint"]);
        const command = fddSeriesDelta(seriesByRole.get("load_command") ?? [], sampleMs, windowMinutes);
        const actual = fddSeriesDelta(seriesByRole.get("load_actual") ?? [], sampleMs, windowMinutes);
        const power = fddSeriesDelta(seriesByRole.get("chiller_power") ?? [], sampleMs, windowMinutes);
        if (!command || !actual || !power) return { calculable: false, fault: false, reason: "Not enough unload command, load actual, or power history to detect response." };
        const responseDeadbandPercent = numericFddParameter(instance, "response_deadband_percent", 5);
        const setpointDeadband = numericFddParameter(instance, "setpoint_deadband", 0.1);
        const supplyBelowSetpoint = valueFor(values, "chw_supply_temp") < valueFor(values, "chw_supply_temp_setpoint") - setpointDeadband;
        return {
          calculable: true,
          fault: command.delta < -responseDeadbandPercent && (actual.delta >= -responseDeadbandPercent || power.delta >= -responseDeadbandPercent) && supplyBelowSetpoint,
          derivedValues: {
            loadCommandDelta: command.delta,
            loadActualDelta: actual.delta,
            chillerPowerDelta: power.delta,
            chwSupplyTemp: valueFor(values, "chw_supply_temp"),
            chwSupplyTempSetpoint: valueFor(values, "chw_supply_temp_setpoint"),
            responseDeadbandPercent,
            setpointDeadband
          }
        };
      }, "load_command");

    case "chiller_ch_08_high_chw_supply_temp":
      return windowed("CH-08 High chilled water supply temperature", ["chw_supply_temp", "chw_supply_temp_setpoint"], (sample) => {
        const values = requiredValues(sample, ["chw_supply_temp", "chw_supply_temp_setpoint"]);
        if (!values) return missingInputResult(["chw_supply_temp", "chw_supply_temp_setpoint"]);
        const chwSupplyHighDelta = numericFddParameter(instance, "chw_supply_high_delta", 1.1);
        const supplyDelta = valueFor(values, "chw_supply_temp") - valueFor(values, "chw_supply_temp_setpoint");
        return { calculable: true, fault: supplyDelta > chwSupplyHighDelta, derivedValues: { supplyDelta, chwSupplyHighDelta } };
      }, "chw_supply_temp");

    case "chiller_ch_09_low_chw_supply_temp":
      return windowed("CH-09 Low chilled water supply temperature", ["chw_supply_temp", "chw_supply_temp_setpoint"], (sample) => {
        const values = requiredValues(sample, ["chw_supply_temp", "chw_supply_temp_setpoint"]);
        if (!values) return missingInputResult(["chw_supply_temp", "chw_supply_temp_setpoint"]);
        const chwSupplyLowDelta = numericFddParameter(instance, "chw_supply_low_delta", 1.1);
        const supplyDelta = valueFor(values, "chw_supply_temp_setpoint") - valueFor(values, "chw_supply_temp");
        return { calculable: true, fault: supplyDelta > chwSupplyLowDelta, derivedValues: { supplyDelta, chwSupplyLowDelta } };
      }, "chw_supply_temp");

    case "chiller_ch_10_insufficient_capacity":
      return windowed("CH-10 Insufficient cooling capacity", ["chw_supply_temp", "chw_supply_temp_setpoint", "load_actual"], (sample) => {
        const values = requiredValues(sample, ["chw_supply_temp", "chw_supply_temp_setpoint", "load_actual"]);
        if (!values) return missingInputResult(["chw_supply_temp", "chw_supply_temp_setpoint", "load_actual"]);
        const chwSupplyLoadDelta = numericFddParameter(instance, "chw_supply_load_delta", 1.1);
        const loadHighPercent = numericFddParameter(instance, "load_high_percent", 95);
        const supplyDelta = valueFor(values, "chw_supply_temp") - valueFor(values, "chw_supply_temp_setpoint");
        const loadActual = valueFor(values, "load_actual");
        return { calculable: true, fault: supplyDelta > chwSupplyLoadDelta && loadActual >= loadHighPercent, derivedValues: { supplyDelta, loadActual, chwSupplyLoadDelta, loadHighPercent } };
      }, "chw_supply_temp");

    case "chiller_ch_11_chw_supply_temp_hunting":
      return windowed("CH-11 Chilled water supply temperature hunting", ["chw_supply_temp", "chw_supply_temp_setpoint"], (_sample, sampleMs) => {
        const supplySeries = seriesByRole.get("chw_supply_temp") ?? [];
        const std = rollingStd(supplySeries, sampleMs, windowMinutes * 60 * 1000);
        const crossings = fddCrossingCount(seriesByRole, "chw_supply_temp", "chw_supply_temp_setpoint", sampleMs, toleranceMs, windowMinutes);
        if (!std || crossings === null) return { calculable: false, fault: false, reason: "Not enough CHW supply temperature history to detect hunting." };
        const supplyTempStdThreshold = numericFddParameter(instance, "supply_temp_std_threshold", 1);
        const crossingCountMin = numericFddParameter(instance, "crossing_count_min", 2);
        return {
          calculable: true,
          fault: crossings >= crossingCountMin && std.std > supplyTempStdThreshold,
          derivedValues: { rollingStd: std.std, sampleCount: std.count, crossings, supplyTempStdThreshold, crossingCountMin }
        };
      }, "chw_supply_temp");

    case "chiller_ch_12_insufficient_chw_flow":
      return windowed("CH-12 Insufficient chilled water flow", ["chw_flow_rate"], (sample) => compareRule(instance, sample, ["chw_flow_rate"], "chw_flow_rate", "flow_min", 10, (value, threshold) => value < threshold), "chw_flow_rate");

    case "chiller_ch_13_excessive_chw_flow":
      return windowed("CH-13 Excessive chilled water flow", ["chw_flow_rate"], (sample) => compareRule(instance, sample, ["chw_flow_rate"], "chw_flow_rate", "flow_max", 10000, (value, threshold) => value > threshold), "chw_flow_rate");

    case "chiller_ch_14_low_chw_delta_t":
      return windowed("CH-14 Low chilled water Delta-T", ["chw_supply_temp", "chw_return_temp", "chw_flow_rate"], (sample) => {
        const values = requiredValues(sample, ["chw_supply_temp", "chw_return_temp", "chw_flow_rate"]);
        if (!values) return missingInputResult(["chw_supply_temp", "chw_return_temp", "chw_flow_rate"]);
        const deltaTLow = numericFddParameter(instance, "delta_t_low", 2);
        const flowMin = numericFddParameter(instance, "flow_min", 10);
        const flowMax = numericFddParameter(instance, "flow_max", 10000);
        const deltaT = valueFor(values, "chw_return_temp") - valueFor(values, "chw_supply_temp");
        const flow = valueFor(values, "chw_flow_rate");
        return { calculable: true, fault: flowWithin(flow, flowMin, flowMax) && deltaT < deltaTLow, derivedValues: { deltaT, flow, flowMin, flowMax, deltaTLow } };
      }, "chw_return_temp");

    case "chiller_ch_15_high_chw_delta_t":
      return windowed("CH-15 High chilled water Delta-T", ["chw_supply_temp", "chw_return_temp", "chw_flow_rate"], (sample) => {
        const values = requiredValues(sample, ["chw_supply_temp", "chw_return_temp", "chw_flow_rate"]);
        if (!values) return missingInputResult(["chw_supply_temp", "chw_return_temp", "chw_flow_rate"]);
        const deltaTHigh = numericFddParameter(instance, "delta_t_high", 7);
        const flowMin = numericFddParameter(instance, "flow_min", 10);
        const flowMax = numericFddParameter(instance, "flow_max", 10000);
        const deltaT = valueFor(values, "chw_return_temp") - valueFor(values, "chw_supply_temp");
        const flow = valueFor(values, "chw_flow_rate");
        return { calculable: true, fault: flowWithin(flow, flowMin, flowMax) && deltaT > deltaTHigh, derivedValues: { deltaT, flow, flowMin, flowMax, deltaTHigh } };
      }, "chw_return_temp");

    case "chiller_ch_16_high_evaporator_pressure":
      return windowed("CH-16 High evaporator pressure", ["evaporator_pressure"], (sample) => compareRule(instance, sample, ["evaporator_pressure"], "evaporator_pressure", "evaporator_pressure_high", 900, (value, threshold) => value > threshold), "evaporator_pressure");

    case "chiller_ch_17_low_evaporator_pressure":
      return windowed("CH-17 Low evaporator pressure", ["evaporator_pressure"], (sample) => compareRule(instance, sample, ["evaporator_pressure"], "evaporator_pressure", "evaporator_pressure_low", 200, (value, threshold) => value < threshold), "evaporator_pressure");

    case "chiller_ch_18_evaporator_heat_transfer_degradation":
      return windowed("CH-18 Evaporator heat transfer degradation", ["chw_supply_temp", "evaporator_saturation_temp"], (sample) => {
        const values = requiredValues(sample, ["chw_supply_temp", "evaporator_saturation_temp"]);
        if (!values) return missingInputResult(["chw_supply_temp", "evaporator_saturation_temp"]);
        const evaporatorApproachHigh = numericFddParameter(instance, "evaporator_approach_high", 1.7);
        const evaporatorApproach = valueFor(values, "chw_supply_temp") - valueFor(values, "evaporator_saturation_temp");
        return { calculable: true, fault: evaporatorApproach > evaporatorApproachHigh, derivedValues: { evaporatorApproach, evaporatorApproachHigh } };
      }, "chw_supply_temp");

    case "chiller_ch_19_chw_freezing_risk":
      return windowed("CH-19 Chilled water freezing risk", ["chw_supply_temp"], (sample) => compareRule(instance, sample, ["chw_supply_temp"], "chw_supply_temp", "freeze_temp_limit", 2, (value, threshold) => value < threshold), "chw_supply_temp");

    case "chiller_ch_20_chw_flow_while_off":
      return windowed("CH-20 Chilled water flow while off", ["chiller_status", "chw_valve_command", "chw_flow_rate"], (sample) => {
        const values = requiredValues(sample, ["chiller_status", "chw_valve_command", "chw_flow_rate"]);
        if (!values) return missingInputResult(["chiller_status", "chw_valve_command", "chw_flow_rate"]);
        const flowOffThreshold = numericFddParameter(instance, "flow_off_threshold", 0);
        const statusOn = valueFor(values, "chiller_status") > 0.5;
        const valveOpen = valueFor(values, "chw_valve_command") > 0.5;
        const flow = valueFor(values, "chw_flow_rate");
        return { calculable: true, fault: !statusOn && !valveOpen && flow > flowOffThreshold, derivedValues: { statusOn: statusOn ? 1 : 0, valveOpen: valveOpen ? 1 : 0, flow, flowOffThreshold } };
      }, "chw_flow_rate");

    case "chiller_ch_21_reversed_chw_delta_t":
      return windowed("CH-21 Reversed chilled water Delta-T", ["chw_supply_temp", "chw_return_temp"], (sample) => {
        const values = requiredValues(sample, ["chw_supply_temp", "chw_return_temp"]);
        if (!values) return missingInputResult(["chw_supply_temp", "chw_return_temp"]);
        const deltaT = valueFor(values, "chw_return_temp") - valueFor(values, "chw_supply_temp");
        return { calculable: true, fault: deltaT < 0, derivedValues: { deltaT } };
      }, "chw_return_temp");

    case "chiller_ch_22_high_condenser_entering_water_temp":
      return windowed("CH-22 High condenser entering water temperature", ["cw_return_temp", "cw_return_temp_setpoint"], (sample) => {
        const values = requiredValues(sample, ["cw_return_temp", "cw_return_temp_setpoint"]);
        if (!values) return missingInputResult(["cw_return_temp", "cw_return_temp_setpoint"]);
        const cwReturnHighDelta = numericFddParameter(instance, "cw_return_high_delta", 1.1);
        const enteringDelta = valueFor(values, "cw_return_temp") - valueFor(values, "cw_return_temp_setpoint");
        return { calculable: true, fault: enteringDelta > cwReturnHighDelta, derivedValues: { enteringDelta, cwReturnHighDelta } };
      }, "cw_return_temp");

    case "chiller_ch_23_low_condenser_entering_water_temp":
      return windowed("CH-23 Low condenser entering water temperature", ["cw_return_temp", "cw_return_temp_setpoint"], (sample) => {
        const values = requiredValues(sample, ["cw_return_temp", "cw_return_temp_setpoint"]);
        if (!values) return missingInputResult(["cw_return_temp", "cw_return_temp_setpoint"]);
        const cwReturnLowDelta = numericFddParameter(instance, "cw_return_low_delta", 1.1);
        const enteringDelta = valueFor(values, "cw_return_temp_setpoint") - valueFor(values, "cw_return_temp");
        return { calculable: true, fault: enteringDelta > cwReturnLowDelta, derivedValues: { enteringDelta, cwReturnLowDelta } };
      }, "cw_return_temp");

    case "chiller_ch_24_insufficient_cw_flow":
      return windowed("CH-24 Insufficient condenser water flow", ["cw_flow_rate"], (sample) => compareRule(instance, sample, ["cw_flow_rate"], "cw_flow_rate", "cw_flow_min", 10, (value, threshold) => value < threshold), "cw_flow_rate");

    case "chiller_ch_25_excessive_cw_flow":
      return windowed("CH-25 Excessive condenser water flow", ["cw_flow_rate"], (sample) => compareRule(instance, sample, ["cw_flow_rate"], "cw_flow_rate", "cw_flow_max", 10000, (value, threshold) => value > threshold), "cw_flow_rate");

    case "chiller_ch_26_condenser_heat_transfer_degradation":
      return windowed("CH-26 Condenser heat transfer degradation", ["condenser_saturation_temp", "cw_supply_temp"], (sample) => {
        const values = requiredValues(sample, ["condenser_saturation_temp", "cw_supply_temp"]);
        if (!values) return missingInputResult(["condenser_saturation_temp", "cw_supply_temp"]);
        const condenserApproachHigh = numericFddParameter(instance, "condenser_approach_high", 2.2);
        const condenserApproach = valueFor(values, "condenser_saturation_temp") - valueFor(values, "cw_supply_temp");
        return { calculable: true, fault: condenserApproach > condenserApproachHigh, derivedValues: { condenserApproach, condenserApproachHigh } };
      }, "condenser_saturation_temp");

    case "chiller_ch_27_high_condensing_pressure":
      return windowed("CH-27 High condensing pressure", ["condenser_pressure"], (sample) => compareRule(instance, sample, ["condenser_pressure"], "condenser_pressure", "condenser_pressure_high", 1800, (value, threshold) => value > threshold), "condenser_pressure");

    case "chiller_ch_28_low_condensing_pressure":
      return windowed("CH-28 Low condensing pressure", ["condenser_pressure"], (sample) => compareRule(instance, sample, ["condenser_pressure"], "condenser_pressure", "condenser_pressure_low", 400, (value, threshold) => value < threshold), "condenser_pressure");

    case "chiller_ch_29_low_condenser_water_delta_t":
      return windowed("CH-29 Low condenser water Delta-T", ["cw_return_temp", "cw_supply_temp"], (sample) => {
        const values = requiredValues(sample, ["cw_return_temp", "cw_supply_temp"]);
        if (!values) return missingInputResult(["cw_return_temp", "cw_supply_temp"]);
        const cwDeltaTLow = numericFddParameter(instance, "cw_delta_t_low", 2);
        const deltaT = valueFor(values, "cw_supply_temp") - valueFor(values, "cw_return_temp");
        return { calculable: true, fault: deltaT < cwDeltaTLow, derivedValues: { deltaT, cwDeltaTLow } };
      }, "cw_supply_temp");

    case "chiller_ch_30_high_condenser_water_delta_t":
      return windowed("CH-30 High condenser water Delta-T", ["cw_return_temp", "cw_supply_temp"], (sample) => {
        const values = requiredValues(sample, ["cw_return_temp", "cw_supply_temp"]);
        if (!values) return missingInputResult(["cw_return_temp", "cw_supply_temp"]);
        const cwDeltaTHigh = numericFddParameter(instance, "cw_delta_t_high", 7);
        const deltaT = valueFor(values, "cw_supply_temp") - valueFor(values, "cw_return_temp");
        return { calculable: true, fault: deltaT > cwDeltaTHigh, derivedValues: { deltaT, cwDeltaTHigh } };
      }, "cw_supply_temp");

    case "chiller_ch_31_low_suction_pressure":
      return windowed("CH-31 Low suction pressure", ["suction_pressure"], (sample) => compareRule(instance, sample, ["suction_pressure"], "suction_pressure", "suction_pressure_low", 200, (value, threshold) => value < threshold), "suction_pressure");

    case "chiller_ch_32_high_suction_pressure":
      return windowed("CH-32 High suction pressure", ["suction_pressure"], (sample) => compareRule(instance, sample, ["suction_pressure"], "suction_pressure", "suction_pressure_high", 900, (value, threshold) => value > threshold), "suction_pressure");

    case "chiller_ch_33_high_discharge_pressure":
      return windowed("CH-33 High discharge pressure", ["discharge_pressure"], (sample) => compareRule(instance, sample, ["discharge_pressure"], "discharge_pressure", "discharge_pressure_high", 1800, (value, threshold) => value > threshold), "discharge_pressure");

    case "chiller_ch_34_low_discharge_pressure":
      return windowed("CH-34 Low discharge pressure", ["discharge_pressure"], (sample) => compareRule(instance, sample, ["discharge_pressure"], "discharge_pressure", "discharge_pressure_low", 400, (value, threshold) => value < threshold), "discharge_pressure");

    case "chiller_ch_35_refrigerant_undercharge_or_leak":
      return windowed("CH-35 Possible refrigerant undercharge or leakage", ["suction_pressure", "superheat_temp", "subcooling_temp"], (sample) => {
        const values = requiredValues(sample, ["suction_pressure", "superheat_temp", "subcooling_temp"]);
        if (!values) return missingInputResult(["suction_pressure", "superheat_temp", "subcooling_temp"]);
        const suctionPressureLow = numericFddParameter(instance, "suction_pressure_low", 200);
        const superheatHigh = numericFddParameter(instance, "superheat_high", 10);
        const subcoolingLow = numericFddParameter(instance, "subcooling_low", 2);
        const suctionPressure = valueFor(values, "suction_pressure");
        const superheatTemp = valueFor(values, "superheat_temp");
        const subcoolingTemp = valueFor(values, "subcooling_temp");
        return {
          calculable: true,
          fault: suctionPressure < suctionPressureLow && superheatTemp > superheatHigh && subcoolingTemp < subcoolingLow,
          derivedValues: { suctionPressure, superheatTemp, subcoolingTemp, suctionPressureLow, superheatHigh, subcoolingLow }
        };
      }, "suction_pressure");

    case "chiller_ch_36_refrigerant_overcharge":
      return windowed("CH-36 Possible refrigerant overcharge", ["discharge_pressure", "subcooling_temp", "chiller_power"], (sample) => {
        const values = requiredValues(sample, ["discharge_pressure", "subcooling_temp", "chiller_power"]);
        if (!values) return missingInputResult(["discharge_pressure", "subcooling_temp", "chiller_power"]);
        const dischargePressureHigh = numericFddParameter(instance, "discharge_pressure_high", 1800);
        const subcoolingHigh = numericFddParameter(instance, "subcooling_high", 10);
        const powerHighKw = numericFddParameter(instance, "power_high_kw", 1000);
        const dischargePressure = valueFor(values, "discharge_pressure");
        const subcoolingTemp = valueFor(values, "subcooling_temp");
        const chillerPower = valueFor(values, "chiller_power");
        return {
          calculable: true,
          fault: dischargePressure > dischargePressureHigh && subcoolingTemp > subcoolingHigh && chillerPower > powerHighKw,
          derivedValues: { dischargePressure, subcoolingTemp, chillerPower, dischargePressureHigh, subcoolingHigh, powerHighKw }
        };
      }, "discharge_pressure");

    case "chiller_ch_37_exv_underfeeding_or_stuck_closed":
      return windowed("CH-37 EXV underfeeding or stuck closed", ["exv_position", "superheat_temp", "suction_pressure"], (sample) => {
        const values = requiredValues(sample, ["exv_position", "superheat_temp", "suction_pressure"]);
        if (!values) return missingInputResult(["exv_position", "superheat_temp", "suction_pressure"]);
        const exvPositionLow = numericFddParameter(instance, "exv_position_low", 5);
        const superheatHigh = numericFddParameter(instance, "superheat_high", 10);
        const suctionPressureLow = numericFddParameter(instance, "suction_pressure_low", 200);
        const exvPosition = valueFor(values, "exv_position");
        const superheatTemp = valueFor(values, "superheat_temp");
        const suctionPressure = valueFor(values, "suction_pressure");
        return {
          calculable: true,
          fault: exvPosition < exvPositionLow && superheatTemp > superheatHigh && suctionPressure < suctionPressureLow,
          derivedValues: { exvPosition, superheatTemp, suctionPressure, exvPositionLow, superheatHigh, suctionPressureLow }
        };
      }, "exv_position");

    case "chiller_ch_38_exv_overfeeding_or_stuck_open":
      return windowed("CH-38 EXV overfeeding or stuck open", ["exv_position", "superheat_temp", "suction_pressure"], (sample) => {
        const values = requiredValues(sample, ["exv_position", "superheat_temp", "suction_pressure"]);
        if (!values) return missingInputResult(["exv_position", "superheat_temp", "suction_pressure"]);
        const exvPositionHigh = numericFddParameter(instance, "exv_position_high", 95);
        const superheatLow = numericFddParameter(instance, "superheat_low", 2);
        const suctionPressureHigh = numericFddParameter(instance, "suction_pressure_high", 900);
        const exvPosition = valueFor(values, "exv_position");
        const superheatTemp = valueFor(values, "superheat_temp");
        const suctionPressure = valueFor(values, "suction_pressure");
        return {
          calculable: true,
          fault: exvPosition > exvPositionHigh && superheatTemp < superheatLow && suctionPressure > suctionPressureHigh,
          derivedValues: { exvPosition, superheatTemp, suctionPressure, exvPositionHigh, superheatLow, suctionPressureHigh }
        };
      }, "exv_position");

    case "chiller_ch_39_compressor_overload":
      return windowed("CH-39 Compressor overload", ["compressor_current", "chiller_power"], (sample) => {
        const values = requiredValues(sample, ["compressor_current", "chiller_power"]);
        if (!values) return missingInputResult(["compressor_current", "chiller_power"]);
        const currentHighAmp = numericFddParameter(instance, "current_high_amp", 500);
        const powerHighKw = numericFddParameter(instance, "power_high_kw", 1000);
        const compressorCurrent = valueFor(values, "compressor_current");
        const chillerPower = valueFor(values, "chiller_power");
        return {
          calculable: true,
          fault: compressorCurrent > currentHighAmp && chillerPower > powerHighKw,
          derivedValues: { compressorCurrent, chillerPower, currentHighAmp, powerHighKw }
        };
      }, "compressor_current");

    case "chiller_ch_40_low_chw_setpoint":
      return windowed("CH-40 Low CHW supply temperature setpoint", ["chw_supply_temp_setpoint"], (sample) => compareRule(instance, sample, ["chw_supply_temp_setpoint"], "chw_supply_temp_setpoint", "chw_setpoint_low", 5, (value, threshold) => value < threshold), "chw_supply_temp_setpoint");

    case "chiller_ch_41_high_chw_setpoint":
      return windowed("CH-41 High CHW supply temperature setpoint", ["chw_supply_temp_setpoint"], (sample) => compareRule(instance, sample, ["chw_supply_temp_setpoint"], "chw_supply_temp_setpoint", "chw_setpoint_high", 15.6, (value, threshold) => value > threshold), "chw_supply_temp_setpoint");

    case "chiller_ch_42_chw_setpoint_reset_failure":
      return windowed("CH-42 CHW setpoint reset failure", ["chw_supply_temp_setpoint", "outside_air_temp"], (_sample, sampleMs) => {
        const setpointDelta = fddSeriesDelta(seriesByRole.get("chw_supply_temp_setpoint") ?? [], sampleMs, windowMinutes);
        const oatDelta = fddSeriesDelta(seriesByRole.get("outside_air_temp") ?? [], sampleMs, windowMinutes);
        if (!setpointDelta || !oatDelta) return { calculable: false, fault: false, reason: "Not enough setpoint or outside air temperature history to detect reset behavior." };
        const outsideAirChangeThreshold = numericFddParameter(instance, "outside_air_change_threshold", 5);
        const setpointChangeEpsilon = numericFddParameter(instance, "setpoint_change_epsilon", 0.1);
        return {
          calculable: true,
          fault: Math.abs(oatDelta.delta) > outsideAirChangeThreshold && Math.abs(setpointDelta.delta) <= setpointChangeEpsilon,
          derivedValues: {
            outsideAirTempDelta: oatDelta.delta,
            chwSupplyTempSetpointDelta: setpointDelta.delta,
            outsideAirChangeThreshold,
            setpointChangeEpsilon
          }
        };
      }, "outside_air_temp");

    case "chiller_ch_43_chw_supply_temp_sensor_fault":
      return windowed("CH-43 CHW supply temperature sensor fault", ["chw_supply_temp", "chw_return_temp"], (sample, sampleMs) => {
        const values = requiredValues(sample, ["chw_supply_temp", "chw_return_temp"]);
        if (!values) return missingInputResult(["chw_supply_temp", "chw_return_temp"]);
        const min = numericFddParameter(instance, "chw_supply_temp_min", 0);
        const max = numericFddParameter(instance, "chw_supply_temp_max", 30);
        const epsilon = numericFddParameter(instance, "temp_slope_epsilon", 0.01);
        const consistencyDeadband = numericFddParameter(instance, "temp_consistency_deadband", 0.1);
        const supply = valueFor(values, "chw_supply_temp");
        const returnTemp = valueFor(values, "chw_return_temp");
        const stuck = fddStuckEvidence(seriesByRole, "chw_supply_temp", sampleMs, windowMinutes, epsilon);
        const inconsistent = supply > returnTemp + consistencyDeadband;
        return {
          calculable: true,
          fault: rangeFault(supply, min, max) || Boolean(stuck?.stuck) || inconsistent,
          derivedValues: { chwSupplyTemp: supply, chwReturnTemp: returnTemp, min, max, epsilon, inconsistent: inconsistent ? 1 : 0, stuck: stuck?.stuck ? 1 : 0, sensorDelta: stuck?.delta ?? 0 }
        };
      }, "chw_supply_temp");

    case "chiller_ch_44_chw_return_temp_sensor_fault":
      return windowed("CH-44 CHW return temperature sensor fault", ["chw_return_temp", "chw_supply_temp"], (sample, sampleMs) => {
        const values = requiredValues(sample, ["chw_return_temp", "chw_supply_temp"]);
        if (!values) return missingInputResult(["chw_return_temp", "chw_supply_temp"]);
        const min = numericFddParameter(instance, "chw_return_temp_min", 0);
        const max = numericFddParameter(instance, "chw_return_temp_max", 30);
        const epsilon = numericFddParameter(instance, "temp_slope_epsilon", 0.01);
        const consistencyDeadband = numericFddParameter(instance, "temp_consistency_deadband", 0.1);
        const returnTemp = valueFor(values, "chw_return_temp");
        const supply = valueFor(values, "chw_supply_temp");
        const stuck = fddStuckEvidence(seriesByRole, "chw_return_temp", sampleMs, windowMinutes, epsilon);
        const inconsistent = returnTemp < supply - consistencyDeadband;
        return {
          calculable: true,
          fault: rangeFault(returnTemp, min, max) || Boolean(stuck?.stuck) || inconsistent,
          derivedValues: { chwReturnTemp: returnTemp, chwSupplyTemp: supply, min, max, epsilon, inconsistent: inconsistent ? 1 : 0, stuck: stuck?.stuck ? 1 : 0, sensorDelta: stuck?.delta ?? 0 }
        };
      }, "chw_return_temp");

    case "chiller_ch_45_chw_flow_sensor_fault":
      return windowed("CH-45 CHW flow sensor fault", ["chw_flow_rate"], (sample, sampleMs) => {
        const values = requiredValues(sample, ["chw_flow_rate"]);
        if (!values) return missingInputResult(["chw_flow_rate"]);
        const min = numericFddParameter(instance, "flow_min", 10);
        const max = numericFddParameter(instance, "flow_max", 10000);
        const epsilon = numericFddParameter(instance, "flow_slope_epsilon", 0.02);
        const flow = valueFor(values, "chw_flow_rate");
        const stuck = fddStuckEvidence(seriesByRole, "chw_flow_rate", sampleMs, windowMinutes, epsilon);
        return {
          calculable: true,
          fault: rangeFault(flow, min, max) || Boolean(stuck?.stuck) || flow <= 0,
          derivedValues: { flow, min, max, epsilon, stuck: stuck?.stuck ? 1 : 0, sensorDelta: stuck?.delta ?? 0 }
        };
      }, "chw_flow_rate");

    case "chiller_ch_46_cw_supply_temp_sensor_fault":
      return windowed("CH-46 Condenser water supply temperature sensor fault", ["cw_supply_temp", "cw_return_temp"], (sample, sampleMs) => {
        const values = requiredValues(sample, ["cw_supply_temp", "cw_return_temp"]);
        if (!values) return missingInputResult(["cw_supply_temp", "cw_return_temp"]);
        const min = numericFddParameter(instance, "cw_supply_temp_min", 0);
        const max = numericFddParameter(instance, "cw_supply_temp_max", 45);
        const epsilon = numericFddParameter(instance, "temp_slope_epsilon", 0.01);
        const consistencyDeadband = numericFddParameter(instance, "temp_consistency_deadband", 0.1);
        const supply = valueFor(values, "cw_supply_temp");
        const returnTemp = valueFor(values, "cw_return_temp");
        const stuck = fddStuckEvidence(seriesByRole, "cw_supply_temp", sampleMs, windowMinutes, epsilon);
        const inconsistent = supply < returnTemp - consistencyDeadband;
        return {
          calculable: true,
          fault: rangeFault(supply, min, max) || Boolean(stuck?.stuck) || inconsistent,
          derivedValues: { cwSupplyTemp: supply, cwReturnTemp: returnTemp, min, max, epsilon, inconsistent: inconsistent ? 1 : 0, stuck: stuck?.stuck ? 1 : 0, sensorDelta: stuck?.delta ?? 0 }
        };
      }, "cw_supply_temp");

    case "chiller_ch_47_cw_return_temp_sensor_fault":
      return windowed("CH-47 Condenser water return temperature sensor fault", ["cw_return_temp", "cw_supply_temp"], (sample, sampleMs) => {
        const values = requiredValues(sample, ["cw_return_temp", "cw_supply_temp"]);
        if (!values) return missingInputResult(["cw_return_temp", "cw_supply_temp"]);
        const min = numericFddParameter(instance, "cw_return_temp_min", 0);
        const max = numericFddParameter(instance, "cw_return_temp_max", 45);
        const epsilon = numericFddParameter(instance, "temp_slope_epsilon", 0.01);
        const consistencyDeadband = numericFddParameter(instance, "temp_consistency_deadband", 0.1);
        const returnTemp = valueFor(values, "cw_return_temp");
        const supply = valueFor(values, "cw_supply_temp");
        const stuck = fddStuckEvidence(seriesByRole, "cw_return_temp", sampleMs, windowMinutes, epsilon);
        const inconsistent = returnTemp > supply + consistencyDeadband;
        return {
          calculable: true,
          fault: rangeFault(returnTemp, min, max) || Boolean(stuck?.stuck) || inconsistent,
          derivedValues: { cwReturnTemp: returnTemp, cwSupplyTemp: supply, min, max, epsilon, inconsistent: inconsistent ? 1 : 0, stuck: stuck?.stuck ? 1 : 0, sensorDelta: stuck?.delta ?? 0 }
        };
      }, "cw_return_temp");

    case "chiller_ch_48_cw_flow_sensor_fault":
      return windowed("CH-48 Condenser water flow sensor fault", ["cw_flow_rate"], (sample, sampleMs) => {
        const values = requiredValues(sample, ["cw_flow_rate"]);
        if (!values) return missingInputResult(["cw_flow_rate"]);
        const min = numericFddParameter(instance, "cw_flow_min", 10);
        const max = numericFddParameter(instance, "cw_flow_max", 10000);
        const epsilon = numericFddParameter(instance, "flow_slope_epsilon", 0.02);
        const flow = valueFor(values, "cw_flow_rate");
        const stuck = fddStuckEvidence(seriesByRole, "cw_flow_rate", sampleMs, windowMinutes, epsilon);
        return {
          calculable: true,
          fault: rangeFault(flow, min, max) || Boolean(stuck?.stuck) || flow <= 0,
          derivedValues: { flow, min, max, epsilon, stuck: stuck?.stuck ? 1 : 0, sensorDelta: stuck?.delta ?? 0 }
        };
      }, "cw_flow_rate");

    case "chiller_ch_49_chw_differential_pressure_sensor_fault":
      return windowed("CH-49 CHW differential pressure sensor fault", ["chw_flow_rate", "chw_differential_pressure"], (sample, sampleMs) => {
        const values = requiredValues(sample, ["chw_flow_rate", "chw_differential_pressure"]);
        if (!values) return missingInputResult(["chw_flow_rate", "chw_differential_pressure"]);
        const min = numericFddParameter(instance, "chw_dp_min", 0);
        const max = numericFddParameter(instance, "chw_dp_max", 1000);
        const epsilon = numericFddParameter(instance, "dp_slope_epsilon", 0.05);
        const flow = valueFor(values, "chw_flow_rate");
        const dp = valueFor(values, "chw_differential_pressure");
        const stuck = fddStuckEvidence(seriesByRole, "chw_differential_pressure", sampleMs, windowMinutes, epsilon);
        return {
          calculable: true,
          fault: flow > 0 && (rangeFault(dp, min, max) || Boolean(stuck?.stuck) || dp <= 0),
          derivedValues: { flow, dp, min, max, epsilon, stuck: stuck?.stuck ? 1 : 0, sensorDelta: stuck?.delta ?? 0 }
        };
      }, "chw_differential_pressure");

    case "chiller_ch_50_cw_differential_pressure_sensor_fault":
      return windowed("CH-50 Condenser water differential pressure sensor fault", ["cw_flow_rate", "cw_differential_pressure"], (sample, sampleMs) => {
        const values = requiredValues(sample, ["cw_flow_rate", "cw_differential_pressure"]);
        if (!values) return missingInputResult(["cw_flow_rate", "cw_differential_pressure"]);
        const min = numericFddParameter(instance, "cw_dp_min", 0);
        const max = numericFddParameter(instance, "cw_dp_max", 1000);
        const epsilon = numericFddParameter(instance, "dp_slope_epsilon", 0.05);
        const flow = valueFor(values, "cw_flow_rate");
        const dp = valueFor(values, "cw_differential_pressure");
        const stuck = fddStuckEvidence(seriesByRole, "cw_differential_pressure", sampleMs, windowMinutes, epsilon);
        return {
          calculable: true,
          fault: flow > 0 && (rangeFault(dp, min, max) || Boolean(stuck?.stuck) || dp <= 0),
          derivedValues: { flow, dp, min, max, epsilon, stuck: stuck?.stuck ? 1 : 0, sensorDelta: stuck?.delta ?? 0 }
        };
      }, "cw_differential_pressure");

    case "chiller_ch_51_heat_balance_sensor_consistency":
      return windowed("CH-51 Heat balance sensor consistency", ["chw_return_temp", "chw_supply_temp", "chw_flow_rate", "cw_return_temp", "cw_supply_temp", "cw_flow_rate", "chiller_power"], (sample) => {
        const values = requiredValues(sample, ["chw_return_temp", "chw_supply_temp", "chw_flow_rate", "cw_return_temp", "cw_supply_temp", "cw_flow_rate", "chiller_power"]);
        if (!values) return missingInputResult(["chw_return_temp", "chw_supply_temp", "chw_flow_rate", "cw_return_temp", "cw_supply_temp", "cw_flow_rate", "chiller_power"]);
        const heatBalanceEpsilon = numericFddParameter(instance, "heat_balance_epsilon", 0.1);
        const qEvaporator = valueFor(values, "chw_flow_rate") * (valueFor(values, "chw_return_temp") - valueFor(values, "chw_supply_temp"));
        const qCondenser = valueFor(values, "cw_flow_rate") * (valueFor(values, "cw_supply_temp") - valueFor(values, "cw_return_temp"));
        const chillerPower = valueFor(values, "chiller_power");
        if (qCondenser === 0) {
          return { calculable: false, fault: false, reason: "Condenser heat proxy is zero, so normalized heat-balance error cannot be calculated." };
        }
        const heatBalanceError = Math.abs(qCondenser - qEvaporator + chillerPower) / Math.abs(qCondenser);
        return {
          calculable: true,
          fault: heatBalanceError > heatBalanceEpsilon,
          derivedValues: { qEvaporator, qCondenser, chillerPower, heatBalanceError, heatBalanceEpsilon }
        };
      }, "chiller_power");

    default:
      return null;
  }
}

export function evaluateFddRuleSample(
  instance: DerivedMetricInstance,
  inputs: Record<string, number>,
  seriesByRole: Map<string, MaterializerNumericPoint[]>,
  targetMs: number,
  alignmentToleranceSeconds = FDD_DEFAULT_ALIGNMENT_TOLERANCE_SECONDS
): FddRuleEvaluation {
  const key = instance.metricKey;
  const windowMinutes = numericFddParameter(instance, "window_minutes", 30);
  const toleranceMs = alignmentToleranceSeconds * 1000;
  const importedChillerRule = evaluateImportedChillerDocRule(instance, inputs, seriesByRole, targetMs, toleranceMs, windowMinutes);
  if (importedChillerRule) return importedChillerRule;

  if (key === "chiller_low_cop_detection") {
    const runningEvidence = fddChillerRunningEvidence(instance, inputs);
    const chillerOn = runningEvidence.running;
    const coolingLoad = fddInput(inputs, "cooling_load");
    const chillerPower = fddInput(inputs, "chiller_power");
    if (chillerOn === undefined || coolingLoad === undefined || chillerPower === undefined) {
      return fddInvalidSample("Missing chiller status, cooling load, or chiller power.");
    }
    const minLoad = numericFddParameter(instance, "min_load", 200);
    const copThreshold = numericFddParameter(instance, "cop_threshold", 4);
    if (!chillerOn) return fddInactiveSample(runningEvidence.reason ?? "Chiller is not running.");
    if (coolingLoad <= minLoad) return fddInactiveSample("Cooling load is below the minimum load for COP detection.");
    if (chillerPower <= 0) return fddInvalidSample("Chiller power is zero or negative, so COP cannot be calculated.");
    const cop = coolingLoad / chillerPower;
    return fddWindowedFaultSample({
      ruleLabel: "Low COP",
      currentFault: cop < copThreshold,
      derivedValues: { ...runningEvidence.derivedValues, cop, coolingLoad, chillerPower, minLoad, copThreshold },
      roles: ["chiller_status", "cooling_load", "chiller_power"],
      seriesByRole,
      targetMs,
      toleranceMs,
      windowMinutes,
      preferredAnchorRole: "chiller_power",
      predicate: (sampleInputs) => {
        const sampleRunning = fddChillerRunningEvidence(instance, sampleInputs).running;
        const sampleCoolingLoad = fddInput(sampleInputs, "cooling_load");
        const sampleChillerPower = fddInput(sampleInputs, "chiller_power");
        if (sampleRunning === undefined || sampleCoolingLoad === undefined || sampleChillerPower === undefined || sampleChillerPower <= 0) {
          return { calculable: false, fault: false };
        }
        if (!sampleRunning || sampleCoolingLoad <= minLoad) return { calculable: true, fault: false };
        return { calculable: true, fault: sampleCoolingLoad / sampleChillerPower < copThreshold };
      }
    });
  }

  if (key === "chiller_chw_flow_proving_fault") {
    const runningEvidence = fddChillerRunningEvidence(instance, inputs);
    const chillerOn = runningEvidence.running;
    const flowProven = fddInputBoolean(inputs, "chw_flow_status");
    const flow = fddInput(inputs, "chw_flow_rate");
    if (chillerOn === undefined || flowProven === undefined || flow === undefined) {
      return fddInvalidSample("Missing chiller status, flow proof, or CHW flow rate.");
    }
    const minFlow = numericFddParameter(instance, "min_flow", 10);
    if (!chillerOn) return fddInactiveSample(runningEvidence.reason ?? "Chiller is not running.");
    return fddWindowedFaultSample({
      ruleLabel: "Flow proving",
      currentFault: !flowProven || flow < minFlow,
      derivedValues: { ...runningEvidence.derivedValues, flow, minFlow },
      roles: ["chiller_status", "chw_flow_status", "chw_flow_rate"],
      seriesByRole,
      targetMs,
      toleranceMs,
      windowMinutes,
      preferredAnchorRole: "chw_flow_rate",
      predicate: (sampleInputs) => {
        const sampleRunning = fddChillerRunningEvidence(instance, sampleInputs).running;
        const sampleFlowProven = fddInputBoolean(sampleInputs, "chw_flow_status");
        const sampleFlow = fddInput(sampleInputs, "chw_flow_rate");
        if (sampleRunning === undefined || sampleFlowProven === undefined || sampleFlow === undefined) {
          return { calculable: false, fault: false };
        }
        if (!sampleRunning) return { calculable: true, fault: false };
        return { calculable: true, fault: !sampleFlowProven || sampleFlow < minFlow };
      }
    });
  }

  if (key === "chiller_low_chw_delta_t") {
    const runningEvidence = fddChillerRunningEvidence(instance, inputs);
    const chillerOn = runningEvidence.running;
    const flowProven = fddInputBoolean(inputs, "chw_flow_status");
    const supply = fddInput(inputs, "chw_supply_temp");
    const returnTemp = fddInput(inputs, "chw_return_temp");
    if (chillerOn === undefined || flowProven === undefined || supply === undefined || returnTemp === undefined) {
      return fddInvalidSample("Missing chiller status, flow proof, CHW supply temperature, or CHW return temperature.");
    }
    if (!chillerOn) return fddInactiveSample(runningEvidence.reason ?? "Chiller is not running.");
    if (!flowProven) return fddInactiveSample("CHW flow is not proven.");
    const deltaT = returnTemp - supply;
    const deltaTMin = numericFddParameter(instance, "delta_t_min", 2);
    return fddWindowedFaultSample({
      ruleLabel: "Low Delta-T",
      currentFault: deltaT < deltaTMin,
      derivedValues: { ...runningEvidence.derivedValues, deltaT, deltaTMin },
      roles: ["chiller_status", "chw_flow_status", "chw_supply_temp", "chw_return_temp"],
      seriesByRole,
      targetMs,
      toleranceMs,
      windowMinutes,
      preferredAnchorRole: "chw_return_temp",
      predicate: (sampleInputs) => {
        const sampleRunning = fddChillerRunningEvidence(instance, sampleInputs).running;
        const sampleFlowProven = fddInputBoolean(sampleInputs, "chw_flow_status");
        const sampleSupply = fddInput(sampleInputs, "chw_supply_temp");
        const sampleReturnTemp = fddInput(sampleInputs, "chw_return_temp");
        if (sampleRunning === undefined || sampleFlowProven === undefined || sampleSupply === undefined || sampleReturnTemp === undefined) {
          return { calculable: false, fault: false };
        }
        if (!sampleRunning || !sampleFlowProven) return { calculable: true, fault: false };
        return { calculable: true, fault: sampleReturnTemp - sampleSupply < deltaTMin };
      }
    });
  }

  if (key === "chiller_status_consistency") {
    const chillerOn = fddInputBoolean(inputs, "chiller_status");
    const powerOn = fddInputBoolean(inputs, "power_status");
    if (chillerOn === undefined || powerOn === undefined) {
      return fddInvalidSample("Missing chiller status or power status.");
    }
    return fddWindowedFaultSample({
      ruleLabel: "Status consistency",
      currentFault: chillerOn !== powerOn,
      roles: ["chiller_status", "power_status"],
      seriesByRole,
      targetMs,
      toleranceMs,
      windowMinutes,
      preferredAnchorRole: "power_status",
      predicate: (sampleInputs) => {
        const sampleChillerOn = fddInputBoolean(sampleInputs, "chiller_status");
        const samplePowerOn = fddInputBoolean(sampleInputs, "power_status");
        if (sampleChillerOn === undefined || samplePowerOn === undefined) return { calculable: false, fault: false };
        return { calculable: true, fault: sampleChillerOn !== samplePowerOn };
      }
    });
  }

  if (key === "chiller_cooling_load_plausibility") {
    const runningEvidence = fddChillerRunningEvidence(instance, inputs);
    const chillerOn = runningEvidence.running;
    const flow = fddInput(inputs, "chw_flow_rate");
    const supply = fddInput(inputs, "chw_supply_temp");
    const returnTemp = fddInput(inputs, "chw_return_temp");
    const coolingLoad = fddInput(inputs, "cooling_load");
    if (chillerOn === undefined || flow === undefined || supply === undefined || returnTemp === undefined || coolingLoad === undefined) {
      return fddInvalidSample("Missing chiller status, flow, CHW temperatures, or BMS cooling load.");
    }
    if (!chillerOn) return fddInactiveSample(runningEvidence.reason ?? "Chiller is not running.");
    const deltaT = returnTemp - supply;
    const loadProxy = flow * deltaT;
    if (loadProxy <= 0 || coolingLoad <= 0) return fddInvalidSample("Calculated load proxy or BMS cooling load is non-positive.");
    const tolerancePercent = numericFddParameter(instance, "tolerance_percent", 10);
    const mismatchPercent = Math.abs(coolingLoad - loadProxy) / Math.max(Math.abs(coolingLoad), Math.abs(loadProxy)) * 100;
    return fddWindowedFaultSample({
      ruleLabel: "Cooling-load plausibility",
      currentFault: mismatchPercent > tolerancePercent,
      derivedValues: { ...runningEvidence.derivedValues, deltaT, loadProxy, coolingLoad, mismatchPercent, tolerancePercent },
      roles: ["chiller_status", "chw_flow_rate", "chw_supply_temp", "chw_return_temp", "cooling_load"],
      seriesByRole,
      targetMs,
      toleranceMs,
      windowMinutes,
      preferredAnchorRole: "cooling_load",
      predicate: (sampleInputs) => {
        const sampleRunning = fddChillerRunningEvidence(instance, sampleInputs).running;
        const sampleFlow = fddInput(sampleInputs, "chw_flow_rate");
        const sampleSupply = fddInput(sampleInputs, "chw_supply_temp");
        const sampleReturnTemp = fddInput(sampleInputs, "chw_return_temp");
        const sampleCoolingLoad = fddInput(sampleInputs, "cooling_load");
        if (sampleRunning === undefined || sampleFlow === undefined || sampleSupply === undefined || sampleReturnTemp === undefined || sampleCoolingLoad === undefined) {
          return { calculable: false, fault: false };
        }
        if (!sampleRunning) return { calculable: true, fault: false };
        const sampleLoadProxy = sampleFlow * (sampleReturnTemp - sampleSupply);
        if (sampleLoadProxy <= 0 || sampleCoolingLoad <= 0) return { calculable: false, fault: false };
        const sampleMismatchPercent = Math.abs(sampleCoolingLoad - sampleLoadProxy) / Math.max(Math.abs(sampleCoolingLoad), Math.abs(sampleLoadProxy)) * 100;
        return { calculable: true, fault: sampleMismatchPercent > tolerancePercent };
      }
    });
  }

  if (key === "sensor_chw_supply_temp_flatline" || key === "sensor_chw_return_temp_flatline" || key === "sensor_chw_flow_flatline") {
    const statusRole = key === "sensor_chw_flow_flatline" ? "chw_flow_status" : "chiller_status";
    const signalRole = key === "sensor_chw_supply_temp_flatline"
      ? "chw_supply_temp"
      : key === "sensor_chw_return_temp_flatline"
        ? "chw_return_temp"
        : "chw_flow_rate";
    const enabled = fddInputBoolean(inputs, statusRole);
    const signal = fddInput(inputs, signalRole);
    const signalSeries = seriesByRole.get(signalRole) ?? [];
    if (enabled === undefined || signal === undefined || signalSeries.length === 0) {
      return fddInvalidSample("Missing status/proof signal or sensor value.");
    }
    if (!enabled) return fddInactiveSample("Equipment or flow proof is not active.");
    const freezeWindowMinutes = numericFddParameter(instance, "freeze_window", 60);
    const epsilon = numericFddParameter(instance, signalRole === "chw_flow_rate" ? "epsilon_flow" : "epsilon_temp", signalRole === "chw_flow_rate" ? 1 : 0.1);
    const stats = rollingStd(signalSeries, targetMs, freezeWindowMinutes * 60 * 1000);
    if (!stats) return fddInvalidSample("Not enough samples in the flatline detection window.");
    return fddWindowedFaultSample({
      ruleLabel: "Flatline",
      currentFault: stats.std < epsilon,
      derivedValues: { signal, rollingStd: stats.std, sampleCount: stats.count, epsilon, freezeWindowMinutes },
      roles: [statusRole, signalRole],
      seriesByRole,
      targetMs,
      toleranceMs,
      windowMinutes,
      preferredAnchorRole: signalRole,
      predicate: (sampleInputs, sampleMs) => {
        const sampleEnabled = fddInputBoolean(sampleInputs, statusRole);
        if (sampleEnabled === undefined) return { calculable: false, fault: false };
        if (!sampleEnabled) return { calculable: true, fault: false };
        const sampleStats = rollingStd(signalSeries, sampleMs, freezeWindowMinutes * 60 * 1000);
        if (!sampleStats) return { calculable: false, fault: false };
        return { calculable: true, fault: sampleStats.std < epsilon };
      }
    });
  }

  return fddInvalidSample("No executable FDD rule evaluator is available for this algorithm.");
}
