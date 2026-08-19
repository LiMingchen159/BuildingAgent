import { describe, expect, it, vi } from "vitest";

import type {
  DerivedMetricDependency,
  DerivedMetricInstance,
  DerivedMetricLookupInput,
  DerivedMetricSample
} from "../derivedMetrics.js";
import type { EquipmentIdentity, ReportScope, ResolvedReportPeriod } from "./contracts.js";
import {
  createDerivedMetricEvidenceTool,
  type DerivedMetricEvidenceReader
} from "./derivedMetricEvidence.js";
import type { MetricEvidenceDefinition } from "./evidenceDefinitions.js";
import type {
  EvidenceToolContext,
  MetricEvidenceToolInput
} from "./evidenceTools.js";

const PROJECT_ID = "project_element";
const METRIC_KEY = "average_cop";
const START_AT = "2026-08-10T00:00:00.000Z";
const END_AT = "2026-08-17T00:00:00.000Z";

const period: ResolvedReportPeriod = {
  startAt: START_AT,
  endAt: END_AT,
  timeZone: "Asia/Hong_Kong"
};

type TestedScope = Extract<ReportScope, { kind: "fleet" | "equipment" }>;

function equipment(equipmentId: string): EquipmentIdentity {
  const shortIdentifier = equipmentId.replace("_", "-");
  const fullName = `Chiller ${equipmentId.slice(-2)}`;
  return {
    equipmentId,
    shortIdentifier,
    equipmentType: "chiller",
    fullName,
    displayName: `${shortIdentifier} — ${fullName}`,
    nameSource: "project_metadata",
    nameSourceRef: `project-assets.json#${equipmentId}`
  };
}

function dependencies(instanceId: string, equipmentId: string): DerivedMetricDependency[] {
  return [
    {
      dependencyId: `${instanceId}:cooling-load`,
      instanceId,
      role: "cooling_load_kw",
      sourceType: "raw_point",
      sourceId: `${equipmentId}:cooling-load`,
      pointName: `${equipmentId}_Q`,
      unit: "kW"
    },
    {
      dependencyId: `${instanceId}:power`,
      instanceId,
      role: "power_kw",
      sourceType: "raw_point",
      sourceId: `${equipmentId}:power`,
      pointName: `${equipmentId}_P`,
      unit: "kW"
    }
  ];
}

function metricInstance(
  equipmentId: string,
  overrides: Partial<DerivedMetricInstance> = {}
): DerivedMetricInstance {
  const instanceId = `instance:${equipmentId}`;
  return {
    instanceId,
    projectId: PROJECT_ID,
    definitionId: "store-definition:average-cop",
    versionId: "store-version:average-cop:v1",
    metricKey: METRIC_KEY,
    metricType: "ratio",
    entityId: equipmentId,
    displayName: `${equipmentId} average COP`,
    unit: "",
    formulaVersion: "v1",
    formula: "cooling_load_kw / power_kw",
    status: "active",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    dependencies: dependencies(instanceId, equipmentId),
    ...overrides
  };
}

interface SampleFixtureInput {
  sampleId: string;
  ts: string;
  valueNum?: number;
  valueText?: string;
  projectId?: string;
  instanceId?: string;
  formulaVersionId?: string;
  calculationRunId?: string;
  sourceWindowStart?: string;
  sourceWindowEnd?: string;
  metadata?: Record<string, unknown>;
}

function metricSample(
  instance: DerivedMetricInstance,
  input: SampleFixtureInput
): DerivedMetricSample {
  return {
    sampleId: input.sampleId,
    instanceId: input.instanceId ?? instance.instanceId,
    projectId: input.projectId ?? instance.projectId,
    ts: input.ts,
    ...(input.valueNum !== undefined ? { valueNum: input.valueNum } : {}),
    ...(input.valueText !== undefined ? { valueText: input.valueText } : {}),
    quality: "good",
    status: "ok",
    formulaVersionId: input.formulaVersionId ?? instance.versionId,
    ...(input.calculationRunId !== undefined ? { calculationRunId: input.calculationRunId } : {}),
    ...(input.sourceWindowStart !== undefined ? { sourceWindowStart: input.sourceWindowStart } : {}),
    ...(input.sourceWindowEnd !== undefined ? { sourceWindowEnd: input.sourceWindowEnd } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    createdAt: input.ts
  };
}

interface HistoryOptions {
  from?: string;
  to?: string;
  limit?: number;
  order?: "asc" | "desc";
}

function readerFixture(
  instances: DerivedMetricInstance[],
  historyByInstance: Record<string, DerivedMetricSample[]>
): {
  reader: DerivedMetricEvidenceReader;
  lookup: ReturnType<typeof vi.fn<(input: DerivedMetricLookupInput) => DerivedMetricInstance[]>>;
  readHistory: ReturnType<typeof vi.fn<(instanceId: string, options?: HistoryOptions) => DerivedMetricSample[]>>;
} {
  const lookup = vi.fn((input: DerivedMetricLookupInput): DerivedMetricInstance[] => (
    instances.filter((instance) => (
      instance.projectId === input.projectId
      && (input.metricKey === undefined || instance.metricKey === input.metricKey)
      && (input.entityId === undefined || instance.entityId === input.entityId)
    )).slice(0, input.limit)
  ));
  const readHistory = vi.fn((instanceId: string, _options?: HistoryOptions): DerivedMetricSample[] => (
    [...(historyByInstance[instanceId] ?? [])]
  ));
  return { reader: { lookup, readHistory }, lookup, readHistory };
}

function metricDefinition(scope: TestedScope): MetricEvidenceDefinition {
  return {
    definitionId: `report-definition:${scope.kind}:average-cop`,
    definitionVersion: "1",
    metricKey: METRIC_KEY,
    scopeKind: scope.kind,
    label: "Average COP",
    unit: "",
    aggregation: "average",
    producerKind: "derived_metric",
    entityStrategy: scope.kind === "fleet" ? "scope_members" : "scope_equipment",
    expectedCadenceSeconds: 900,
    minimumCoverage: 0
  };
}

function toolInput(
  scope: TestedScope,
  selectedEquipment: EquipmentIdentity[]
): MetricEvidenceToolInput {
  const definition = metricDefinition(scope);
  const context: EvidenceToolContext = {
    packageId: "package-derived-metric-test",
    planId: "plan-derived-metric-test",
    planRevision: "sha256:plan-fixture",
    projectId: PROJECT_ID,
    assetRevision: "sha256:asset-fixture",
    period: structuredClone(period),
    equipment: structuredClone(selectedEquipment),
    requestTimeoutMs: 5_000
  };
  return {
    signal: new AbortController().signal,
    context,
    request: {
      requestId: `metric:${scope.kind}:average-cop`,
      metricKey: METRIC_KEY,
      scope: structuredClone(scope),
      definition: {
        definitionId: definition.definitionId,
        definitionVersion: definition.definitionVersion
      }
    },
    definition
  };
}

describe("createDerivedMetricEvidenceTool", () => {
  it("uses a half-open [start, end) period and excludes a sample exactly at endAt", async () => {
    const selectedEquipment = equipment("CH_01");
    const instance = metricInstance(selectedEquipment.equipmentId);
    const { reader } = readerFixture([instance], {
      [instance.instanceId]: [
        metricSample(instance, { sampleId: "sample-start", ts: START_AT, valueNum: 4 }),
        metricSample(instance, {
          sampleId: "sample-before-end",
          ts: "2026-08-16T23:59:59.999Z",
          valueNum: 6
        }),
        metricSample(instance, {
          sampleId: "sample-at-end",
          ts: END_AT,
          valueNum: 100,
          projectId: "next_period_project",
          formulaVersionId: "next-period-version"
        })
      ]
    });

    const outcome = await createDerivedMetricEvidenceTool(reader).execute(toolInput({
      kind: "equipment",
      equipmentId: selectedEquipment.equipmentId,
      equipmentType: selectedEquipment.equipmentType
    }, [selectedEquipment]));

    expect(outcome.status).toBe("complete");
    if (outcome.status !== "complete") throw new Error(`unexpected outcome: ${outcome.status}`);
    expect(outcome.value).toMatchObject({ value: 5, sampleCount: 2 });
    expect(outcome.value.evidence).toEqual([
      expect.objectContaining({ observedAt: "2026-08-16T23:59:59.999Z" })
    ]);
    const withoutBoundary = await createDerivedMetricEvidenceTool(readerFixture([instance], {
      [instance.instanceId]: [
        metricSample(instance, { sampleId: "sample-start", ts: START_AT, valueNum: 4 }),
        metricSample(instance, {
          sampleId: "sample-before-end",
          ts: "2026-08-16T23:59:59.999Z",
          valueNum: 6
        })
      ]
    }).reader).execute(toolInput({
      kind: "equipment",
      equipmentId: selectedEquipment.equipmentId,
      equipmentType: selectedEquipment.equipmentType
    }, [selectedEquipment]));
    expect(withoutBoundary.status).toBe("complete");
    expect(withoutBoundary.sourceRevision).toBe(outcome.sourceRevision);
  });

  it("reads history with the 20,000-sample safety limit and exact report bounds", async () => {
    const selectedEquipment = equipment("CH_01");
    const instance = metricInstance(selectedEquipment.equipmentId);
    const { reader, readHistory } = readerFixture([instance], {
      [instance.instanceId]: [
        metricSample(instance, { sampleId: "sample-1", ts: START_AT, valueNum: 4 })
      ]
    });

    await createDerivedMetricEvidenceTool(reader).execute(toolInput({
      kind: "equipment",
      equipmentId: selectedEquipment.equipmentId,
      equipmentType: selectedEquipment.equipmentType
    }, [selectedEquipment]));

    expect(readHistory).toHaveBeenCalledOnce();
    expect(readHistory).toHaveBeenCalledWith(instance.instanceId, {
      from: START_AT,
      to: END_AT,
      limit: 20_000,
      order: "asc"
    });
  });

  it("does not coerce invalid numeric text or non-finite values to zero", async () => {
    const selectedEquipment = equipment("CH_01");
    const instance = metricInstance(selectedEquipment.equipmentId);
    const { reader } = readerFixture([instance], {
      [instance.instanceId]: [
        metricSample(instance, {
          sampleId: "sample-invalid-text",
          ts: "2026-08-10T00:15:00.000Z",
          valueText: "not-a-number"
        }),
        metricSample(instance, {
          sampleId: "sample-nan",
          ts: "2026-08-10T00:30:00.000Z",
          valueNum: Number.NaN
        })
      ]
    });

    const outcome = await createDerivedMetricEvidenceTool(reader).execute(toolInput({
      kind: "equipment",
      equipmentId: selectedEquipment.equipmentId,
      equipmentType: selectedEquipment.equipmentType
    }, [selectedEquipment]));

    expect(outcome).toMatchObject({
      status: "no_data",
      reasonCode: "all_samples_invalid"
    });
    expect(outcome).not.toHaveProperty("value");
  });

  describe("sample lineage", () => {
    const cases: Array<[
      label: string,
      mismatch: (instance: DerivedMetricInstance) => Partial<SampleFixtureInput>
    ]> = [
      ["project", () => ({ projectId: "another_project" })],
      ["instance", () => ({ instanceId: "instance:CH_99" })],
      ["formula version", () => ({ formulaVersionId: "store-version:average-cop:v2" })]
    ];

    it.each(cases)("rejects a sample from a different %s lineage", async (_label, mismatch) => {
      const selectedEquipment = equipment("CH_01");
      const instance = metricInstance(selectedEquipment.equipmentId);
      const { reader } = readerFixture([instance], {
        [instance.instanceId]: [
          metricSample(instance, {
            sampleId: "sample-lineage-mismatch",
            ts: "2026-08-10T00:15:00.000Z",
            valueNum: 4,
            ...mismatch(instance)
          })
        ]
      });

      const outcome = await createDerivedMetricEvidenceTool(reader).execute(toolInput({
        kind: "equipment",
        equipmentId: selectedEquipment.equipmentId,
        equipmentType: selectedEquipment.equipmentType
      }, [selectedEquipment]));

      expect(outcome).toMatchObject({
        status: "error",
        errorCode: "sample_lineage_mismatch",
        retryable: false
      });
    });
  });

  it("rejects conflicting values for one instance and timestamp", async () => {
    const selectedEquipment = equipment("CH_01");
    const instance = metricInstance(selectedEquipment.equipmentId);
    const timestamp = "2026-08-10T00:15:00.000Z";
    const { reader } = readerFixture([instance], {
      [instance.instanceId]: [
        metricSample(instance, { sampleId: "sample-a", ts: timestamp, valueNum: 4 }),
        metricSample(instance, { sampleId: "sample-b", ts: timestamp, valueNum: 5 })
      ]
    });

    const outcome = await createDerivedMetricEvidenceTool(reader).execute(toolInput({
      kind: "equipment",
      equipmentId: selectedEquipment.equipmentId,
      equipmentType: selectedEquipment.equipmentType
    }, [selectedEquipment]));

    expect(outcome).toMatchObject({
      status: "error",
      errorCode: "duplicate_timestamp_conflict",
      retryable: false
    });
  });

  it("allows fleet instances to use different source IDs when their semantic signatures match", async () => {
    const selectedEquipment = [equipment("CH_01"), equipment("CH_02")];
    const instances = selectedEquipment.map((item) => metricInstance(item.equipmentId));
    const { reader } = readerFixture(instances, Object.fromEntries(instances.map((instance, index) => [
      instance.instanceId,
      [metricSample(instance, {
        sampleId: `sample-${index + 1}`,
        ts: "2026-08-10T00:15:00.000Z",
        valueNum: 4 + index
      })]
    ])));

    const outcome = await createDerivedMetricEvidenceTool(reader).execute(toolInput({
      kind: "fleet",
      equipmentType: "chiller"
    }, selectedEquipment));

    expect(outcome.status).toBe("complete");
    if (outcome.status !== "complete") throw new Error(`unexpected outcome: ${outcome.status}`);
    expect(outcome.value).toMatchObject({ value: 4.5, sampleCount: 2 });
  });

  it("rejects fleet aggregation when persisted formula semantics differ", async () => {
    const selectedEquipment = [equipment("CH_01"), equipment("CH_02")];
    const first = metricInstance(selectedEquipment[0]!.equipmentId);
    const second = metricInstance(selectedEquipment[1]!.equipmentId, {
      formula: "power_kw / cooling_load_kw"
    });
    const { reader } = readerFixture([first, second], {
      [first.instanceId]: [
        metricSample(first, { sampleId: "sample-1", ts: "2026-08-10T00:15:00.000Z", valueNum: 4 })
      ],
      [second.instanceId]: [
        metricSample(second, { sampleId: "sample-2", ts: "2026-08-10T00:15:00.000Z", valueNum: 5 })
      ]
    });

    const outcome = await createDerivedMetricEvidenceTool(reader).execute(toolInput({
      kind: "fleet",
      equipmentType: "chiller"
    }, selectedEquipment));

    expect(outcome).toMatchObject({
      status: "error",
      errorCode: "metric_semantics_mismatch",
      retryable: false
    });
  });

  it("derives sourceRevision deterministically from canonical instances and samples", async () => {
    const selectedEquipment = [equipment("CH_01"), equipment("CH_02")];
    const instances = selectedEquipment.map((item) => metricInstance(item.equipmentId));
    const firstHistory = Object.fromEntries(instances.map((instance, index) => [
      instance.instanceId,
      [
        metricSample(instance, {
          sampleId: `sample-${index + 1}-later`,
          ts: "2026-08-10T00:30:00.000Z",
          valueNum: 5 + index
        }),
        metricSample(instance, {
          sampleId: `sample-${index + 1}-earlier`,
          ts: "2026-08-10T00:15:00.000Z",
          valueNum: 4 + index
        })
      ]
    ]));
    const secondHistory = Object.fromEntries(Object.entries(firstHistory).map(([instanceId, samples]) => [
      instanceId,
      [...samples].reverse()
    ]));

    const firstOutcome = await createDerivedMetricEvidenceTool(
      readerFixture(instances, firstHistory).reader
    ).execute(toolInput({ kind: "fleet", equipmentType: "chiller" }, selectedEquipment));
    const reorderedOutcome = await createDerivedMetricEvidenceTool(
      readerFixture([...instances].reverse(), secondHistory).reader
    ).execute(toolInput({ kind: "fleet", equipmentType: "chiller" }, [...selectedEquipment].reverse()));

    expect(firstOutcome.status).toBe("complete");
    expect(reorderedOutcome.status).toBe("complete");
    expect(firstOutcome.sourceRevision).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(reorderedOutcome.sourceRevision).toBe(firstOutcome.sourceRevision);

    const changedHistory = {
      ...firstHistory,
      [instances[0]!.instanceId]: [
        metricSample(instances[0]!, {
          sampleId: "sample-1-later",
          ts: "2026-08-10T00:30:00.000Z",
          valueNum: 50
        }),
        firstHistory[instances[0]!.instanceId]![1]!
      ]
    };
    const changedOutcome = await createDerivedMetricEvidenceTool(
      readerFixture(instances, changedHistory).reader
    ).execute(toolInput({ kind: "fleet", equipmentType: "chiller" }, selectedEquipment));

    expect(changedOutcome.status).toBe("complete");
    expect(changedOutcome.sourceRevision).not.toBe(firstOutcome.sourceRevision);

    const changedLineageHistory = structuredClone(firstHistory);
    changedLineageHistory[instances[0]!.instanceId]![0]!.sourceWindowStart = "2026-08-09T23:45:00.000Z";
    changedLineageHistory[instances[0]!.instanceId]![0]!.calculationRunId = "run-recomputed";
    changedLineageHistory[instances[0]!.instanceId]![0]!.metadata = { inputRevision: "sha256:changed" };
    const changedLineageOutcome = await createDerivedMetricEvidenceTool(
      readerFixture(instances, changedLineageHistory).reader
    ).execute(toolInput({ kind: "fleet", equipmentType: "chiller" }, selectedEquipment));
    expect(changedLineageOutcome.status).toBe("complete");
    expect(changedLineageOutcome.sourceRevision).not.toBe(firstOutcome.sourceRevision);
  });
});
