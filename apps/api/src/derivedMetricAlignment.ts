export type DerivedMetricAlignmentPolicy = "exact" | "nearest";

export const DEFAULT_DERIVED_METRIC_ALIGNMENT_POLICY: DerivedMetricAlignmentPolicy = "nearest";
export const DEFAULT_DERIVED_METRIC_ALIGNMENT_TOLERANCE_SECONDS = 300;
export const DERIVED_METRIC_ALIGNMENT_POLICIES = new Set<DerivedMetricAlignmentPolicy>(["exact", "nearest"]);

export interface AlignedNumericSample {
  ts: string;
  left: number;
  right: number;
  leftTs: string;
  rightTs: string;
  leftLagSeconds: number;
  rightLagSeconds: number;
}

interface NumericPoint {
  ts: string;
  value: number;
  ms: number;
}

export function normalizeDerivedMetricAlignmentPolicy(value: string | undefined, fallback = DEFAULT_DERIVED_METRIC_ALIGNMENT_POLICY): DerivedMetricAlignmentPolicy {
  const normalized = value?.trim().toLowerCase();
  return normalized && DERIVED_METRIC_ALIGNMENT_POLICIES.has(normalized as DerivedMetricAlignmentPolicy)
    ? normalized as DerivedMetricAlignmentPolicy
    : fallback;
}

export function normalizeDerivedMetricAlignmentToleranceSeconds(value: number | undefined, fallback = DEFAULT_DERIVED_METRIC_ALIGNMENT_TOLERANCE_SECONDS): number {
  const normalized = Number.isFinite(value) ? value! : fallback;
  return Math.min(Math.max(Math.trunc(normalized), 0), 24 * 60 * 60);
}

function sortedPoints(series: Map<string, number>): NumericPoint[] {
  return [...series.entries()]
    .flatMap(([ts, value]) => {
      const ms = Date.parse(ts);
      return Number.isFinite(ms) && Number.isFinite(value)
        ? [{ ts, value, ms }]
        : [];
    })
    .sort((left, right) => left.ms - right.ms);
}

function nearestPoint(points: NumericPoint[], targetMs: number): NumericPoint | null {
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
  const candidates = [points[low], points[low - 1]].filter((point): point is NumericPoint => Boolean(point));
  return candidates.sort((left, right) => Math.abs(left.ms - targetMs) - Math.abs(right.ms - targetMs))[0] ?? null;
}

export function alignNumericSeries(
  leftSeries: Map<string, number>,
  rightSeries: Map<string, number>,
  policy: DerivedMetricAlignmentPolicy = DEFAULT_DERIVED_METRIC_ALIGNMENT_POLICY,
  toleranceSeconds = DEFAULT_DERIVED_METRIC_ALIGNMENT_TOLERANCE_SECONDS
): AlignedNumericSample[] {
  const leftPoints = sortedPoints(leftSeries);
  if (policy === "exact") {
    return leftPoints.flatMap((left) => {
      const right = rightSeries.get(left.ts);
      return typeof right === "number" && Number.isFinite(right)
        ? [{
            ts: left.ts,
            left: left.value,
            right,
            leftTs: left.ts,
            rightTs: left.ts,
            leftLagSeconds: 0,
            rightLagSeconds: 0
          }]
        : [];
    });
  }

  const rightPoints = sortedPoints(rightSeries);
  const toleranceMs = normalizeDerivedMetricAlignmentToleranceSeconds(toleranceSeconds) * 1000;
  return leftPoints.flatMap((left) => {
    const right = nearestPoint(rightPoints, left.ms);
    if (!right || Math.abs(right.ms - left.ms) > toleranceMs) return [];
    return [{
      ts: left.ts,
      left: left.value,
      right: right.value,
      leftTs: left.ts,
      rightTs: right.ts,
      leftLagSeconds: 0,
      rightLagSeconds: Math.round((right.ms - left.ms) / 1000)
    }];
  });
}
