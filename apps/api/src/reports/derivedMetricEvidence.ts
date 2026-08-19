import { createHash } from "node:crypto";

import type {
  DerivedMetricInstance,
  DerivedMetricLookupInput,
  DerivedMetricSample,
  DerivedMetricStore
} from "../derivedMetrics.js";
import type { EvidenceReference, MetricAggregation } from "./contracts.js";
import type { MetricEvidenceTool, MetricEvidenceToolInput } from "./evidenceTools.js";

export interface DerivedMetricEvidenceReader {
  lookup(input: DerivedMetricLookupInput): DerivedMetricInstance[];
  readHistory(
    instanceId: string,
    options?: { from?: string; to?: string; limit?: number; order?: "asc" | "desc" }
  ): DerivedMetricSample[];
}

export interface DerivedMetricEvidenceToolOptions {
  producerId?: string;
  producerVersion?: string;
}

const HISTORY_LIMIT = 20_000;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return value;
}

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex")}`;
}

function dependencySemantics(instance: DerivedMetricInstance) {
  return instance.dependencies
    .map((dependency) => ({
      role: dependency.role,
      sourceType: dependency.sourceType,
      unit: dependency.unit ?? null
    }))
    .sort((left, right) => (
      compareText(left.role, right.role)
      || compareText(left.sourceType, right.sourceType)
      || compareText(left.unit ?? "", right.unit ?? "")
    ));
}

function instanceSemantics(instance: DerivedMetricInstance) {
  return {
    definitionId: instance.definitionId,
    versionId: instance.versionId,
    metricKey: instance.metricKey,
    metricType: instance.metricType,
    unit: instance.unit ?? "",
    formulaVersion: instance.formulaVersion,
    formula: instance.formula,
    status: instance.status,
    dependencies: dependencySemantics(instance)
  };
}

function instanceRevisionSnapshot(instance: DerivedMetricInstance) {
  return {
    ...instanceSemantics(instance),
    instanceId: instance.instanceId,
    entityId: instance.entityId,
    dependencies: instance.dependencies
      .map((dependency) => ({
        dependencyId: dependency.dependencyId,
        role: dependency.role,
        sourceType: dependency.sourceType,
        sourceId: dependency.sourceId,
        pointName: dependency.pointName ?? null,
        objectRef: dependency.objectRef ?? null,
        unit: dependency.unit ?? null
      }))
      .sort((left, right) => (
        compareText(left.role, right.role)
        || compareText(left.sourceType, right.sourceType)
        || compareText(left.sourceId, right.sourceId)
        || compareText(left.dependencyId, right.dependencyId)
      ))
  };
}

function entityIds(input: MetricEvidenceToolInput): string[] {
  const { definition, request, context } = input;
  if (definition.entityStrategy === "system_entity") {
    return definition.systemEntityId ? [definition.systemEntityId] : [];
  }
  if (definition.entityStrategy === "scope_equipment" && request.scope.kind === "equipment") {
    return [request.scope.equipmentId];
  }
  if (definition.entityStrategy === "scope_members" && request.scope.kind === "fleet") {
    const equipmentType = request.scope.equipmentType;
    return context.equipment
      .filter((equipment) => equipment.equipmentType === equipmentType)
      .map((equipment) => equipment.equipmentId);
  }
  return [];
}

function validSample(sample: DerivedMetricSample): boolean {
  return typeof sample.valueNum === "number"
    && Number.isFinite(sample.valueNum)
    && sample.quality === "good"
    && sample.status === "ok";
}

function selectStableSamples(
  samples: DerivedMetricSample[]
): { ok: true; samples: DerivedMetricSample[] } | { ok: false } {
  const byTimestamp = new Map<string, DerivedMetricSample[]>();
  for (const sample of samples) {
    const entries = byTimestamp.get(sample.ts) ?? [];
    entries.push(sample);
    byTimestamp.set(sample.ts, entries);
  }
  const selected: DerivedMetricSample[] = [];
  for (const timestamp of [...byTimestamp.keys()].sort()) {
    const entries = byTimestamp.get(timestamp)!
      .sort((left, right) => compareText(left.sampleId, right.sampleId));
    const values = new Set(entries.map((sample) => sample.valueNum));
    if (values.size > 1) return { ok: false };
    selected.push(entries[0]!);
  }
  return { ok: true, samples: selected };
}

function aggregate(samples: DerivedMetricSample[], aggregation: MetricAggregation): number | undefined {
  const values = samples.map((sample) => sample.valueNum!);
  if (values.length === 0) return undefined;
  if (aggregation === "average") return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (aggregation === "minimum") return Math.min(...values);
  if (aggregation === "maximum") return Math.max(...values);
  if (aggregation === "sum" || aggregation === "duration") {
    return values.reduce((sum, value) => sum + value, 0);
  }
  if (aggregation === "count") return values.length;
  if (aggregation === "latest") return values[values.length - 1];
  return undefined;
}

function evidenceFor(
  instance: DerivedMetricInstance,
  samples: DerivedMetricSample[]
): EvidenceReference {
  const latest = samples[samples.length - 1]!;
  const checksum = sha256(samples.map((sample) => ({
    sampleId: sample.sampleId,
    ts: sample.ts,
    valueNum: sample.valueNum,
    quality: sample.quality,
    status: sample.status,
    formulaVersionId: sample.formulaVersionId,
    calculationRunId: sample.calculationRunId ?? null,
    sourceWindowStart: sample.sourceWindowStart ?? null,
    sourceWindowEnd: sample.sourceWindowEnd ?? null,
    metadata: sample.metadata ?? null
  })));
  return {
    evidenceId: `derived_${sha256({ instanceId: instance.instanceId, checksum }).slice(7, 31)}`,
    sourceKind: "derived_metric",
    sourceId: instance.instanceId,
    observedAt: latest.ts,
    checksum,
    metadata: {
      entityId: instance.entityId,
      metricKey: instance.metricKey,
      formulaVersion: instance.formulaVersion,
      formulaVersionId: latest.formulaVersionId,
      sampleCount: samples.length
    }
  };
}

/**
 * Read-only adapter over the existing DerivedMetricStore. It never registers,
 * calculates, records, or mutates metrics and never turns invalid text into 0.
 */
export function createDerivedMetricEvidenceTool(
  reader: Pick<DerivedMetricStore, "lookup" | "readHistory"> | DerivedMetricEvidenceReader,
  options: DerivedMetricEvidenceToolOptions = {}
): MetricEvidenceTool {
  return {
    descriptor: {
      producerKind: "derived_metric",
      producerId: options.producerId?.trim() || "derived-metric-store",
      producerVersion: options.producerVersion?.trim() || "1"
    },
    async execute(input) {
      if (input.definition.producerKind !== "derived_metric") {
        return {
          status: "error",
          errorCode: "definition_producer_mismatch",
          message: "Metric definition is not backed by DerivedMetricStore.",
          retryable: false
        };
      }
      const requestedEntityIds = entityIds(input);
      if (requestedEntityIds.length === 0) {
        return {
          status: "error",
          errorCode: "invalid_entity_strategy",
          message: "Metric definition entity strategy does not match its report scope.",
          retryable: false
        };
      }
      try {
        const instances: DerivedMetricInstance[] = [];
        for (const entityId of requestedEntityIds) {
          const matches = reader.lookup({
            projectId: input.context.projectId,
            metricKey: input.request.metricKey,
            entityId,
            limit: 2
          });
          if (matches.length !== 1) {
            return {
              status: "no_data",
              reasonCode: matches.length === 0 ? "metric_instance_not_found" : "ambiguous_metric_instance",
              message: matches.length === 0
                ? `No persisted metric exists for ${entityId}.`
                : `Multiple persisted metrics matched ${entityId}.`
            };
          }
          const instance = matches[0]!;
          if (
            instance.projectId !== input.context.projectId
            || instance.metricKey !== input.request.metricKey
            || instance.entityId !== entityId
          ) {
            return {
              status: "error",
              errorCode: "invalid_store_result",
              message: "Derived metric lookup returned a mismatched instance.",
              retryable: false
            };
          }
          if ((instance.unit ?? "") !== input.definition.unit) {
            return {
              status: "error",
              errorCode: "unit_mismatch",
              message: `Persisted metric unit does not match ${input.definition.unit || "dimensionless"}.`,
              retryable: false
            };
          }
          if (instance.status !== "active") {
            return {
              status: "error",
              errorCode: "inactive_metric_instance",
              message: `Persisted metric ${instance.instanceId} is not active.`,
              retryable: false
            };
          }
          instances.push(instance);
        }

        const expectedSemantics = JSON.stringify(canonicalize(instanceSemantics(instances[0]!)));
        if (instances.some((instance) => (
          JSON.stringify(canonicalize(instanceSemantics(instance))) !== expectedSemantics
        ))) {
          return {
            status: "error",
            errorCode: "metric_semantics_mismatch",
            message: "Fleet metric instances do not share the same definition, formula, unit, and dependency semantics.",
            retryable: false
          };
        }

        const periodStart = Date.parse(input.context.period.startAt);
        const periodEnd = Date.parse(input.context.period.endAt);
        const selectedSamples: DerivedMetricSample[] = [];
        const evidence: EvidenceReference[] = [];
        const revisionEntries: Array<{
          instance: ReturnType<typeof instanceRevisionSnapshot>;
          samples: unknown[];
        }> = [];
        let rawSampleCount = 0;
        for (const instance of instances) {
          const history = reader.readHistory(instance.instanceId, {
            from: input.context.period.startAt,
            to: input.context.period.endAt,
            limit: HISTORY_LIMIT,
            order: "asc"
          });
          if (!Array.isArray(history)) {
            return {
              status: "error",
              errorCode: "invalid_store_result",
              message: "Derived metric history is not an array.",
              retryable: false
            };
          }
          const inWindow = history.filter((sample) => {
            const timestamp = Date.parse(sample.ts);
            return Number.isFinite(timestamp) && timestamp >= periodStart && timestamp < periodEnd;
          });
          if (inWindow.some((sample) => (
            sample.instanceId !== instance.instanceId
            || sample.projectId !== input.context.projectId
            || sample.formulaVersionId !== instance.versionId
          ))) {
            return {
              status: "error",
              errorCode: "sample_lineage_mismatch",
              message: `Metric history lineage does not match ${instance.instanceId}.`,
              retryable: false
            };
          }
          if (inWindow.length >= HISTORY_LIMIT) {
            return {
              status: "error",
              errorCode: "sample_limit_exceeded",
              message: "Metric history reached the 20,000-sample safety limit and may be truncated.",
              retryable: false
            };
          }
          rawSampleCount += inWindow.length;
          const stable = selectStableSamples(inWindow.filter((sample) => validSample(sample)));
          if (!stable.ok) {
            return {
              status: "error",
              errorCode: "duplicate_timestamp_conflict",
              message: `Conflicting metric samples share a timestamp for ${instance.entityId}.`,
              retryable: false
            };
          }
          if (stable.samples.length > 0) {
            selectedSamples.push(...stable.samples);
            evidence.push(evidenceFor(instance, stable.samples));
          }
          revisionEntries.push({
            instance: instanceRevisionSnapshot(instance),
            samples: [...inWindow].sort((left, right) => (
              compareText(left.ts, right.ts)
              || compareText(left.sampleId, right.sampleId)
            )).map((sample) => ({
              sampleId: sample.sampleId,
              ts: sample.ts,
              valueNum: sample.valueNum,
              valueText: sample.valueText ?? null,
              quality: sample.quality,
              status: sample.status,
              formulaVersionId: sample.formulaVersionId,
              calculationRunId: sample.calculationRunId ?? null,
              sourceWindowStart: sample.sourceWindowStart ?? null,
              sourceWindowEnd: sample.sourceWindowEnd ?? null,
              metadata: sample.metadata ?? null
            }))
          });
        }
        if (selectedSamples.length === 0) {
          return {
            status: "no_data",
            reasonCode: rawSampleCount === 0 ? "no_samples" : "all_samples_invalid",
            message: rawSampleCount === 0
              ? "No persisted metric samples overlap the report period."
              : "All persisted metric samples in the report period are invalid.",
            evidence,
            sourceRevision: sha256([...revisionEntries].sort((left, right) => (
              compareText(left.instance.instanceId, right.instance.instanceId)
            )))
          };
        }
        selectedSamples.sort((left, right) => (
          Date.parse(left.ts) - Date.parse(right.ts)
          || compareText(left.instanceId, right.instanceId)
          || compareText(left.sampleId, right.sampleId)
        ));
        const value = aggregate(selectedSamples, input.definition.aggregation);
        if (value === undefined || !Number.isFinite(value)) {
          return {
            status: "error",
            errorCode: "unsupported_aggregation",
            message: `Aggregation ${input.definition.aggregation} is not supported by the read adapter.`,
            retryable: false,
            evidence,
            sourceRevision: sha256([...revisionEntries].sort((left, right) => (
              compareText(left.instance.instanceId, right.instance.instanceId)
            )))
          };
        }
        const periodSeconds = (periodEnd - periodStart) / 1000;
        const expectedSamplesPerInstance = Math.max(
          1,
          Math.ceil(periodSeconds / input.definition.expectedCadenceSeconds)
        );
        const coverage = Math.min(
          1,
          selectedSamples.length / (expectedSamplesPerInstance * instances.length)
        );
        return {
          status: "complete",
          sourceRevision: sha256([...revisionEntries].sort((left, right) => (
            compareText(left.instance.instanceId, right.instance.instanceId)
          ))),
          value: {
            projectId: input.context.projectId,
            metricKey: input.request.metricKey,
            scope: structuredClone(input.request.scope),
            period: structuredClone(input.context.period),
            definition: { ...input.request.definition },
            observedUnit: input.definition.unit,
            value,
            sampleCount: selectedSamples.length,
            coverage,
            evidence
          }
        };
      } catch {
        return {
          status: "error",
          errorCode: "provider_unavailable",
          message: "Derived metric storage is unavailable.",
          retryable: true
        };
      }
    }
  };
}
