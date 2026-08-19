import { describe, expect, it, vi } from "vitest";

import {
  REPORT_SPEC_SCHEMA_VERSION,
  createEquipmentIdentity,
  type EquipmentIdentity,
  type EquipmentProfile,
  type ReportAssetProvenance,
  type ReportPlan,
  type ReportSpec
} from "./contracts.js";
import { discoverProjectReportAssets } from "./assetDiscovery.js";
import { evidenceDefinitionRegistryRevision } from "./evidenceDefinitions.js";
import { evidenceDefinitionsFixture } from "./evidenceTestFixtures.js";
import { executeReportEvidence } from "./evidenceExecutor.js";
import type {
  ChartEvidenceTool,
  DashboardEvidenceTool,
  FaultEvidenceTool,
  MetricEvidenceTool,
  MetricToolFact,
  ReportArtifactWriteInput,
  ReportEvidenceTools
} from "./evidenceTools.js";
import { buildReportPlan } from "./planner.js";

const profile: EquipmentProfile = {
  profileId: "profile-chiller",
  version: 1,
  equipmentType: "chiller",
  groupTitle: "Chiller Performance",
  fleetMetricKeys: [],
  fleetChartKeys: [],
  metricKeys: ["average_cop"],
  chartKeys: ["cop_trend"],
  analysis: { performance: true, faultDiagnosis: true },
  order: 10
};

function equipmentIdentity(): EquipmentIdentity {
  const result = createEquipmentIdentity({
    equipmentId: "WCC_01",
    shortIdentifier: "WCC-01",
    equipmentType: "chiller",
    fullName: "West Plant Chiller 01",
    nameSource: "project_metadata",
    nameSourceRef: "project-assets.json#WCC_01"
  });
  if (!result.ok) throw new Error("invalid equipment fixture");
  return result.value;
}

function provenance(equipment: EquipmentIdentity): ReportAssetProvenance {
  return {
    resolverVersion: 1,
    sources: [{
      sourceKind: "project_metadata",
      sourceId: "project-assets.json",
      sourceRevision: "sha256:fixture-assets"
    }],
    equipment: [{
      equipmentId: equipment.equipmentId,
      resolvedIdentity: { ...equipment },
      profileId: profile.profileId,
      profileVersion: profile.version,
      classificationRuleRefs: ["fixture-chiller-v1"],
      sources: [{
        sourceKind: "project_metadata",
        sourceId: "project-assets.json",
        sourceRef: equipment.nameSourceRef,
        sourceTypes: [equipment.equipmentType],
        shortIdentifier: equipment.shortIdentifier,
        fullName: equipment.fullName
      }]
    }]
  };
}

function reportSpec(): ReportSpec {
  return {
    schemaVersion: REPORT_SPEC_SCHEMA_VERSION,
    specId: "weekly-evidence-fixture",
    projectId: "project_element",
    title: "Element Weekly Evidence Fixture",
    timeZone: "Asia/Hong_Kong",
    period: { kind: "weekly", window: "previous_complete", weekStartsOn: "monday" },
    schedule: { enabled: false },
    sections: {
      ordered: [
        { section: "executive_summary", enabled: false },
        { section: "key_findings", enabled: false },
        { section: "system_performance", enabled: true },
        { section: "selected_dashboards", enabled: true },
        { section: "fault_summary", enabled: true },
        { section: "equipment_analysis", enabled: true },
        { section: "recommended_actions", enabled: false },
        { section: "appendix", enabled: false }
      ]
    },
    kpiKeys: ["plant_cop"],
    dashboardIds: ["plant_overview"],
    equipment: { mode: "selected", equipmentIds: ["WCC_01"] }
  };
}

function fixturePlan(): { plan: ReportPlan; definitions: ReturnType<typeof evidenceDefinitionsFixture> } {
  const equipment = equipmentIdentity();
  const definitions = evidenceDefinitionsFixture([profile]);
  const result = buildReportPlan({
    planId: "plan-evidence-fixture",
    spec: reportSpec(),
    period: {
      startAt: "2026-08-09T16:00:00.000Z",
      endAt: "2026-08-16T16:00:00.000Z",
      timeZone: "Asia/Hong_Kong"
    },
    plannedAt: "2026-08-17T00:05:00.000Z",
    equipment: [equipment],
    profiles: [profile],
    evidenceDefinitions: definitions,
    resolvedSystemCharts: [{ chartKey: "system_efficiency", metricKeys: ["plant_cop"] }],
    resolvedDashboards: [{ dashboardId: "plant_overview", dashboardRevision: "dashboard-rev-7" }],
    assetRevision: "sha256:fixture-assets",
    assetProvenance: provenance(equipment)
  });
  if (!result.ok) throw new Error(`invalid plan fixture: ${JSON.stringify(result.issues)}`);
  return { plan: result.value, definitions };
}

function evidence(
  sourceKind: "bms" | "derived_metric" | "calculation" | "plot_tool" | "dashboard" | "fdd_rule",
  id: string
) {
  return [{ evidenceId: `ev-${id}`, sourceKind, sourceId: id }];
}

interface FakeToolOptions {
  metric?: MetricEvidenceTool["execute"];
  chart?: ChartEvidenceTool["execute"];
  dashboard?: DashboardEvidenceTool["execute"];
  fault?: FaultEvidenceTool["execute"];
  artifactSink?: ReportEvidenceTools["artifactSink"];
}

function fakeTools(
  options: FakeToolOptions = {},
  stageEvents: string[] = []
): { tools: ReportEvidenceTools; writes: ReportArtifactWriteInput[] } {
  const writes: ReportArtifactWriteInput[] = [];
  const svg = new TextEncoder().encode("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");
  const metric: MetricEvidenceTool = {
    descriptor: { producerKind: "derived_metric", producerId: "fixture-metric-tool", producerVersion: "1" },
    execute: options.metric ?? (async ({ request, context }) => {
      stageEvents.push(`metric:${request.requestId}`);
      return {
        status: "complete",
        sourceRevision: `metric-rev:${request.metricKey}`,
        value: {
          projectId: context.projectId,
          metricKey: request.metricKey,
          scope: structuredClone(request.scope),
          period: structuredClone(context.period),
          definition: { ...request.definition },
          observedUnit: request.metricKey === "plant_cop" || request.metricKey === "average_cop" ? "" : "kWh",
          value: request.metricKey === "plant_cop" ? 5.2 : 5.1,
          sampleCount: 672,
          coverage: 1,
          evidence: evidence("derived_metric", request.requestId)
        }
      };
    })
  };
  const dashboard: DashboardEvidenceTool = {
    descriptor: {
      producerKind: "dashboard_renderer",
      producerId: "fixture-dashboard-tool",
      producerVersion: "1"
    },
    execute: options.dashboard ?? (async ({ request, context }) => {
      stageEvents.push(`dashboard:${request.requestId}`);
      return {
        status: "complete",
        sourceRevision: request.dashboardRevision,
        value: {
          projectId: context.projectId,
          dashboardId: request.dashboardId,
          dashboardRevision: request.dashboardRevision,
          period: structuredClone(context.period),
          definition: { ...request.definition },
          title: "Plant Overview",
          artifact: { relativePath: "dashboards/plant-overview.svg", mediaType: "image/svg+xml", bytes: svg },
          evidence: evidence("dashboard", request.dashboardId)
        }
      };
    })
  };
  const fault: FaultEvidenceTool = {
    descriptor: { producerKind: "fdd_rule", producerId: "fixture-fdd-tool", producerVersion: "1" },
    execute: options.fault ?? (async ({ request, context }) => {
      stageEvents.push(`fault:${request.requestId}`);
      return {
        status: "complete",
        sourceRevision: `fault-rev:${request.equipmentId}`,
        evidence: evidence("fdd_rule", `scan-${request.equipmentId}`),
        value: {
          projectId: context.projectId,
          equipmentId: request.equipmentId,
          equipmentType: request.equipmentType,
          period: structuredClone(context.period),
          definition: { ...request.definition },
          events: [{
            status: "active",
            faultCode: "LOW_COP",
            startedAt: "2026-08-16T04:00:00.000Z",
            observedThrough: context.period.endAt,
            evidence: evidence("fdd_rule", `LOW_COP:${request.equipmentId}`)
          }]
        }
      };
    })
  };
  const chart: ChartEvidenceTool = {
    descriptor: { producerKind: "plot_tool", producerId: "fixture-chart-tool", producerVersion: "1" },
    execute: options.chart ?? (async ({ request, context }) => {
      stageEvents.push(`chart:${request.requestId}`);
      return {
        status: "complete",
        sourceRevision: `chart-rev:${request.chartKey}`,
        value: {
          projectId: context.projectId,
          chartKey: request.chartKey,
          scope: structuredClone(request.scope),
          period: structuredClone(context.period),
          definition: { ...request.definition },
          title: `${request.chartKey} chart`,
          artifact: { relativePath: `charts/${request.chartKey}.svg`, mediaType: "image/svg+xml", bytes: svg },
          evidence: evidence("plot_tool", request.requestId)
        }
      };
    })
  };
  const artifactSink = options.artifactSink ?? {
    async write(input: ReportArtifactWriteInput) {
      writes.push({ ...input, bytes: new Uint8Array(input.bytes) });
    }
  };
  return { tools: { metrics: { derived_metric: metric }, chart, dashboard, fault, artifactSink }, writes };
}

async function execute(
  plan: ReportPlan,
  definitions: ReturnType<typeof evidenceDefinitionsFixture>,
  tools: ReportEvidenceTools,
  overrides: { packageId?: string; generatedAt?: string; requestTimeoutMs?: number; maxConcurrency?: number } = {}
) {
  return executeReportEvidence({
    plan,
    packageId: overrides.packageId ?? "package-evidence-fixture",
    generatedAt: overrides.generatedAt ?? "2026-08-17T00:10:00.000Z"
  }, {
    definitions,
    tools,
    ...(overrides.requestTimeoutMs !== undefined ? { requestTimeoutMs: overrides.requestTimeoutMs } : {}),
    ...(overrides.maxConcurrency !== undefined ? { maxConcurrency: overrides.maxConcurrency } : {})
  });
}

describe("executeReportEvidence", () => {
  it("executes deterministic tools in dependency phases and assembles a traceable mixed-scope package", async () => {
    const { plan, definitions } = fixturePlan();
    const originalPlan = structuredClone(plan);
    const stages: string[] = [];
    const { tools, writes } = fakeTools({}, stages);

    const result = await execute(plan, definitions, tools);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(plan).toEqual(originalPlan);
    expect(result.value.metricResults).toHaveLength(2);
    expect(result.value.chartResults).toHaveLength(4);
    expect(result.value.dashboardResults).toHaveLength(1);
    expect(result.value.faultEvents).toHaveLength(1);
    expect(result.value.executions).toHaveLength(8);
    expect(result.value.executions.map((execution) => execution.requestId)).toEqual([
      ...plan.evidence.metrics,
      ...plan.evidence.charts,
      ...plan.evidence.dashboards,
      ...plan.evidence.faults
    ].map((request) => request.requestId));
    expect(result.value.executions.every((execution) => (
      execution.requestKind === "fault" || execution.resultIds.length === 1
    ))).toBe(true);
    expect(result.value.faultEvents[0]?.equipment).toEqual(plan.equipment[0]);
    expect(result.value.faultEvents[0]).toMatchObject({
      durationHours: 12,
      detectorId: "fixture-detector:chiller",
      detectorVersion: "1"
    });
    const firstChart = stages.findIndex((event) => event.startsWith("chart:"));
    expect(firstChart).toBeGreaterThan(-1);
    expect(stages.slice(0, firstChart).filter((event) => !event.startsWith("chart:"))).toHaveLength(4);
    expect(writes).toHaveLength(5);
    expect(writes.every((write) => (
      write.projectId === plan.projectId
      && write.planId === plan.planId
      && write.packageId === result.value.packageId
      && /^run_[a-f0-9]{32}$/.test(write.storageNamespace)
      && write.relativePath.startsWith("evidence/")
      && /^sha256:[a-f0-9]{64}$/.test(write.checksum)
    ))).toBe(true);
    expect(result.value.revisionHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.value.planRevision).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("keeps ordering and revision stable across completion order, package IDs, and generation times", async () => {
    const { plan, definitions } = fixturePlan();
    const delayedTools = (reverse: boolean) => fakeTools({
      metric: async ({ request, context }) => {
        await new Promise((resolve) => setTimeout(resolve, reverse === (request.metricKey === "plant_cop") ? 8 : 1));
        return {
          status: "complete" as const,
          sourceRevision: `metric-rev:${request.metricKey}`,
          value: {
            projectId: context.projectId,
            metricKey: request.metricKey,
            scope: structuredClone(request.scope),
            period: structuredClone(context.period),
            definition: { ...request.definition },
            observedUnit: "",
            value: request.metricKey === "plant_cop" ? 5.2 : 5.1,
            sampleCount: 672,
            coverage: 1,
            evidence: evidence("derived_metric", request.requestId)
          }
        };
      }
    }).tools;

    const first = await execute(plan, definitions, delayedTools(false), {
      packageId: "package-a",
      generatedAt: "2026-08-17T00:10:00.000Z"
    });
    const second = await execute(plan, definitions, delayedTools(true), {
      packageId: "package-b",
      generatedAt: "2026-08-17T01:10:00.000Z"
    });
    const changed = await execute(plan, definitions, fakeTools({
      metric: async ({ request, context }) => ({
        status: "complete",
        sourceRevision: `metric-rev:${request.metricKey}`,
        value: {
          projectId: context.projectId,
          metricKey: request.metricKey,
          scope: structuredClone(request.scope),
          period: structuredClone(context.period),
          definition: { ...request.definition },
          observedUnit: "",
          value: request.metricKey === "plant_cop" ? 6.2 : 5.1,
          sampleCount: 672,
          coverage: 1,
          evidence: evidence("derived_metric", request.requestId)
        }
      })
    }).tools);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(changed.ok).toBe(true);
    if (!first.ok || !second.ok || !changed.ok) return;
    expect(first.value.revisionHash).toBe(second.value.revisionHash);
    expect(changed.value.revisionHash).not.toBe(first.value.revisionHash);
    expect(first.value.executions.map((entry) => entry.requestId)).toEqual(
      second.value.executions.map((entry) => entry.requestId)
    );
  });

  it("rejects altered/LLM equipment identities before invoking any tool", async () => {
    const { plan, definitions } = fixturePlan();
    const altered = structuredClone(plan);
    altered.equipment[0]!.nameSource = "llm" as never;
    altered.equipment[0]!.fullName = "LLM Invented Chiller";
    altered.equipment[0]!.displayName = "WCC-01 — LLM Invented Chiller";
    altered.assetProvenance.equipment[0]!.resolvedIdentity = { ...altered.equipment[0]! };
    const { tools } = fakeTools();
    const metricSpy = vi.spyOn(tools.metrics.derived_metric!, "execute");

    const result = await execute(altered, definitions, tools);

    expect(result).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "invalid_name_source" })])
    });
    expect(metricSpy).not.toHaveBeenCalled();
  });

  it("turns invalid numbers and thrown providers into request errors and skips dependent metric charts", async () => {
    const { plan, definitions } = fixturePlan();
    const chartSpy = vi.fn<ChartEvidenceTool["execute"]>(async () => ({
      status: "error",
      errorCode: "unexpected_chart_call",
      message: "unexpected",
      retryable: false
    }));
    const { tools } = fakeTools({
      metric: async ({ request, context }) => {
        if (request.metricKey === "average_cop") throw new Error("provider secret");
        return {
          status: "complete",
          value: {
            projectId: context.projectId,
            metricKey: request.metricKey,
            scope: structuredClone(request.scope),
            period: structuredClone(context.period),
            definition: { ...request.definition },
            observedUnit: "",
            value: Number.NaN,
            sampleCount: 1,
            coverage: 1,
            evidence: evidence("derived_metric", request.requestId)
          }
        };
      },
      chart: chartSpy
    });

    const result = await execute(plan, definitions, tools);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.metricResults).toEqual([
      expect.objectContaining({ status: "error", errorCode: "invalid_tool_output" }),
      expect.objectContaining({ status: "error", errorCode: "provider_exception" })
    ]);
    expect(result.value.chartResults.filter((chart) => chart.chartKey !== "fault_distribution" && chart.chartKey !== "fault_timeline"))
      .toEqual(expect.arrayContaining([expect.objectContaining({ status: "error", errorCode: "upstream_error" })]));
    expect(chartSpy).toHaveBeenCalledTimes(2);
  });

  it.each(["unit", "period", "scope"] as const)(
    "rejects metric facts with a mismatched %s",
    async (mismatch) => {
      const { plan, definitions } = fixturePlan();
      const { tools } = fakeTools({
        metric: async ({ request, context, definition }) => {
          const fact: MetricToolFact = {
            projectId: context.projectId,
            metricKey: request.metricKey,
            scope: structuredClone(request.scope),
            period: structuredClone(context.period),
            definition: { ...request.definition },
            observedUnit: definition.unit,
            value: 5,
            sampleCount: 1,
            coverage: 1,
            evidence: evidence("derived_metric", request.requestId)
          };
          if (mismatch === "unit") fact.observedUnit = `${definition.unit}:wrong`;
          if (mismatch === "period") {
            fact.period.endAt = "2026-08-16T15:59:59.000Z";
          }
          if (mismatch === "scope") {
            fact.scope = request.scope.kind === "system"
              ? { kind: "equipment", equipmentId: "WCC_01", equipmentType: "chiller" }
              : { kind: "system" };
          }
          return { status: "complete", value: fact };
        }
      });

      const result = await execute(plan, definitions, tools);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.metricResults.every((metric) => (
        metric.status === "error" && metric.errorCode === "invalid_tool_output"
      ))).toBe(true);
    }
  );

  it("distinguishes zero detected faults, no source data, and provider errors", async () => {
    const { plan, definitions } = fixturePlan();
    const zero = fakeTools({
      fault: async ({ request, context }) => ({
        status: "complete",
        evidence: evidence("fdd_rule", "zero-fault-scan"),
        value: {
          projectId: context.projectId,
          equipmentId: request.equipmentId,
          equipmentType: request.equipmentType,
          period: structuredClone(context.period),
          definition: { ...request.definition },
          events: []
        }
      })
    });
    const noData = fakeTools({
      fault: async () => ({ status: "no_data", reasonCode: "no_samples", message: "No FDD samples." })
    });
    const failed = fakeTools({
      fault: async () => ({
        status: "error",
        errorCode: "provider_unavailable",
        message: "FDD unavailable.",
        retryable: true
      })
    });

    const zeroResult = await execute(plan, definitions, zero.tools);
    const noDataResult = await execute(plan, definitions, noData.tools);
    const failedResult = await execute(plan, definitions, failed.tools);

    expect(zeroResult.ok).toBe(true);
    expect(noDataResult.ok).toBe(true);
    expect(failedResult.ok).toBe(true);
    if (!zeroResult.ok || !noDataResult.ok || !failedResult.ok) return;
    const faultExecution = (result: typeof zeroResult.value) => result.executions.find((item) => item.requestKind === "fault");
    expect(faultExecution(zeroResult.value)).toMatchObject({ status: "complete", resultIds: [] });
    expect(zeroResult.value.chartResults.filter((chart) => chart.chartKey.startsWith("fault_")))
      .toEqual([expect.objectContaining({ status: "ready" }), expect.objectContaining({ status: "ready" })]);
    expect(faultExecution(noDataResult.value)).toMatchObject({ status: "no_data", reasonCode: "no_samples", resultIds: [] });
    expect(faultExecution(failedResult.value)).toMatchObject({ status: "error", errorCode: "provider_unavailable", resultIds: [] });
  });

  it("fails unsafe artifacts closed and never writes them", async () => {
    const { plan, definitions } = fixturePlan();
    const sink = { write: vi.fn(async () => undefined) };
    const { tools } = fakeTools({
      chart: async ({ request, context }) => ({
        status: "complete",
        value: {
          projectId: context.projectId,
          chartKey: request.chartKey,
          scope: structuredClone(request.scope),
          period: structuredClone(context.period),
          definition: { ...request.definition },
          title: request.chartKey,
          artifact: {
            relativePath: "../escape.svg",
            mediaType: "image/svg+xml",
            bytes: new Uint8Array([1, 2, 3])
          },
          evidence: evidence("plot_tool", request.requestId)
        }
      }),
      artifactSink: sink
    });

    const result = await execute(plan, definitions, tools);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.chartResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "error", errorCode: "invalid_tool_output" })
    ]));
    expect(sink.write).toHaveBeenCalledTimes(1);
  });

  it("bounds concurrency and converts a never-resolving provider into a timeout", async () => {
    const { plan, definitions } = fixturePlan();
    let active = 0;
    let peak = 0;
    const { tools } = fakeTools({
      metric: ({ signal }) => new Promise((_, reject) => {
        active += 1;
        peak = Math.max(peak, active);
        signal.addEventListener("abort", () => {
          active -= 1;
          reject(new Error("aborted"));
        }, { once: true });
      })
    });

    const result = await execute(plan, definitions, tools, { requestTimeoutMs: 15, maxConcurrency: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(peak).toBe(1);
    expect(result.value.metricResults).toEqual([
      expect.objectContaining({ status: "error", errorCode: "timeout" }),
      expect.objectContaining({ status: "error", errorCode: "timeout" })
    ]);
  });

  it("rejects malformed outcome envelopes instead of hashing empty error fields", async () => {
    const { plan, definitions } = fixturePlan();
    const { tools } = fakeTools({
      metric: async () => ({
        status: "error",
        errorCode: "",
        message: "",
        retryable: "yes"
      } as never)
    });

    const result = await execute(plan, definitions, tools);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.metricResults.every((metric) => (
      metric.status === "error" && metric.errorCode === "invalid_tool_output"
    ))).toBe(true);
  });

  it("routes mixed metric definitions to the exact pinned producer", async () => {
    const { plan, definitions } = fixturePlan();
    const calculationDefinition = definitions.metrics.find((definition) => definition.metricKey === "plant_cop")!;
    calculationDefinition.producerKind = "calculation";
    plan.evidence.definitionsRevision = evidenceDefinitionRegistryRevision(definitions);
    const { tools } = fakeTools();
    const derivedSpy = vi.spyOn(tools.metrics.derived_metric!, "execute");
    const calculationExecute = vi.fn<MetricEvidenceTool["execute"]>(async ({ request, context }) => ({
      status: "complete",
      sourceRevision: "calculation-revision:plant-cop",
      value: {
        projectId: context.projectId,
        metricKey: request.metricKey,
        scope: structuredClone(request.scope),
        period: structuredClone(context.period),
        definition: { ...request.definition },
        observedUnit: "",
        value: 5.25,
        sampleCount: 672,
        coverage: 1,
        evidence: evidence("calculation", request.requestId)
      }
    }));
    tools.metrics.calculation = {
      descriptor: {
        producerKind: "calculation",
        producerId: "fixture-calculation-tool",
        producerVersion: "1"
      },
      execute: calculationExecute
    };

    const result = await execute(plan, definitions, tools);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(calculationExecute).toHaveBeenCalledTimes(1);
    expect(derivedSpy).toHaveBeenCalledTimes(1);
    const plantRequest = plan.evidence.metrics.find((request) => request.metricKey === "plant_cop")!;
    expect(result.value.executions.find((execution) => execution.requestId === plantRequest.requestId))
      .toMatchObject({ provenance: { producerKind: "calculation" } });
  });

  it("canonicalizes evidence sets and retains zero-fault scan evidence for downstream charts", async () => {
    const { plan, definitions } = fixturePlan();
    const toolsForOrder = (reverse: boolean) => fakeTools({
      fault: async ({ request, context }) => ({
        status: "complete",
        evidence: reverse
          ? [
              { evidenceId: "fault-scan-b", sourceKind: "fdd_rule", sourceId: "scan-b" },
              { evidenceId: "fault-scan-a", sourceKind: "fdd_rule", sourceId: "scan-a" }
            ]
          : [
              { evidenceId: "fault-scan-a", sourceKind: "fdd_rule", sourceId: "scan-a" },
              { evidenceId: "fault-scan-b", sourceKind: "fdd_rule", sourceId: "scan-b" }
            ],
        value: {
          projectId: context.projectId,
          equipmentId: request.equipmentId,
          equipmentType: request.equipmentType,
          period: structuredClone(context.period),
          definition: { ...request.definition },
          events: []
        }
      })
    }).tools;

    const first = await execute(plan, definitions, toolsForOrder(false));
    const second = await execute(plan, definitions, toolsForOrder(true));

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.revisionHash).toBe(second.value.revisionHash);
    const faultExecution = first.value.executions.find((execution) => execution.requestKind === "fault")!;
    expect(faultExecution.evidence.map((reference) => reference.evidenceId)).toEqual([
      "fault-scan-a",
      "fault-scan-b"
    ]);
    expect(faultExecution.provenance.inputEvidenceIds).toEqual(["fault-scan-a", "fault-scan-b"]);
    expect(first.value.executions.filter((execution) => execution.requestKind === "chart"))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          status: "complete",
          evidence: expect.arrayContaining([expect.objectContaining({ evidenceId: "fault-scan-a" })])
        })
      ]));
  });

  it("rejects conflicting package-wide evidence IDs", async () => {
    const { plan, definitions } = fixturePlan();
    const originalMetric = plan.evidence.metrics.find((request) => request.metricKey === "average_cop")!;
    const originalDefinition = definitions.metrics.find((definition) => (
      definition.metricKey === "average_cop" && definition.scopeKind === "equipment"
    ))!;
    const secondDefinition = {
      ...structuredClone(originalDefinition),
      definitionId: "fixture-metric:equipment:secondary_cop",
      metricKey: "secondary_cop",
      label: "secondary cop"
    };
    definitions.metrics.push(secondDefinition);
    const secondRequest = {
      ...structuredClone(originalMetric),
      requestId: "metric:equipment:WCC_01:secondary_cop",
      metricKey: "secondary_cop",
      definition: {
        definitionId: secondDefinition.definitionId,
        definitionVersion: secondDefinition.definitionVersion
      }
    };
    plan.evidence.metrics.push(secondRequest);
    const equipmentChart = plan.evidence.charts.find((request) => (
      request.origin === "equipment_profile" && request.chartKey === "cop_trend"
    ));
    if (!equipmentChart || equipmentChart.origin !== "equipment_profile") throw new Error("missing chart fixture");
    equipmentChart.inputMetricRequestIds = [originalMetric.requestId, secondRequest.requestId];
    const chartDefinition = definitions.charts.find((definition) => (
      definition.chartKey === "cop_trend" && definition.scopeKind === "equipment"
    ))!;
    chartDefinition.requiredMetricKeys = ["average_cop", "secondary_cop"];
    plan.evidence.definitionsRevision = evidenceDefinitionRegistryRevision(definitions);
    const { tools } = fakeTools({
      metric: async ({ request, context }) => ({
        status: "complete",
        value: {
          projectId: context.projectId,
          metricKey: request.metricKey,
          scope: structuredClone(request.scope),
          period: structuredClone(context.period),
          definition: { ...request.definition },
          observedUnit: "",
          value: 5,
          sampleCount: 1,
          coverage: 1,
          evidence: [{
            evidenceId: "shared-evidence-id",
            sourceKind: "derived_metric",
            sourceId: request.metricKey
          }]
        }
      })
    });

    const result = await execute(plan, definitions, tools);

    expect(result).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "conflicting_evidence_reference" })])
    });
  });

  it("rejects unauditable complete metric and zero-fault facts", async () => {
    const { plan, definitions } = fixturePlan();
    const { tools } = fakeTools({
      metric: async ({ request, context }) => ({
        status: "complete",
        value: {
          projectId: context.projectId,
          metricKey: request.metricKey,
          scope: structuredClone(request.scope),
          period: structuredClone(context.period),
          definition: { ...request.definition },
          observedUnit: "",
          value: 5,
          sampleCount: 1,
          coverage: 1,
          evidence: []
        }
      }),
      fault: async ({ request, context }) => ({
        status: "complete",
        value: {
          projectId: context.projectId,
          equipmentId: request.equipmentId,
          equipmentType: request.equipmentType,
          period: structuredClone(context.period),
          definition: { ...request.definition },
          events: []
        }
      })
    });

    const result = await execute(plan, definitions, tools);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.metricResults.every((metric) => (
      metric.status === "error" && metric.errorCode === "invalid_tool_output"
    ))).toBe(true);
    expect(result.value.executions.find((execution) => execution.requestKind === "fault"))
      .toMatchObject({ status: "error", errorCode: "invalid_tool_output" });
  });

  it("rejects cross-equipment chart dependencies and duplicate fault coverage before execution", async () => {
    const { plan, definitions } = fixturePlan();
    const secondIdentityResult = createEquipmentIdentity({
      equipmentId: "WCC_02",
      shortIdentifier: "WCC-02",
      equipmentType: "chiller",
      fullName: "West Plant Chiller 02",
      nameSource: "project_metadata",
      nameSourceRef: "project-assets.json#WCC_02"
    });
    if (!secondIdentityResult.ok) throw new Error("invalid second equipment fixture");
    const secondIdentity = secondIdentityResult.value;
    plan.equipment.push(secondIdentity);
    plan.assetProvenance.equipment.push({
      equipmentId: secondIdentity.equipmentId,
      resolvedIdentity: { ...secondIdentity },
      profileId: profile.profileId,
      profileVersion: profile.version,
      classificationRuleRefs: ["fixture-chiller-v1"],
      sources: [{
        sourceKind: "project_metadata",
        sourceId: "project-assets.json",
        sourceRef: secondIdentity.nameSourceRef,
        sourceTypes: [secondIdentity.equipmentType],
        shortIdentifier: secondIdentity.shortIdentifier,
        fullName: secondIdentity.fullName
      }]
    });
    const firstMetric = plan.evidence.metrics.find((request) => request.metricKey === "average_cop")!;
    const foreignMetric = {
      ...structuredClone(firstMetric),
      requestId: "metric:equipment:WCC_02:average_cop",
      scope: { kind: "equipment" as const, equipmentId: "WCC_02", equipmentType: "chiller" }
    };
    plan.evidence.metrics.push(foreignMetric);
    const equipmentChart = plan.evidence.charts.find((request) => request.origin === "equipment_profile");
    if (!equipmentChart || equipmentChart.origin !== "equipment_profile") throw new Error("missing chart fixture");
    equipmentChart.inputMetricRequestIds = [foreignMetric.requestId];
    const faultChart = plan.evidence.charts.find((request) => request.origin === "fault_summary");
    if (!faultChart || faultChart.origin !== "fault_summary") throw new Error("missing fault chart fixture");
    faultChart.inputFaultRequestIds = [plan.evidence.faults[0]!.requestId, plan.evidence.faults[0]!.requestId];
    plan.evidence.faults.push({
      ...structuredClone(plan.evidence.faults[0]!),
      requestId: "fault:WCC_01:duplicate"
    });
    const { tools } = fakeTools();
    const metricSpy = vi.spyOn(tools.metrics.derived_metric!, "execute");

    const result = await execute(plan, definitions, tools);

    expect(result).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "dependency_scope_mismatch" }),
        expect.objectContaining({ code: "duplicate_dependency" }),
        expect.objectContaining({ code: "fault_dependency_mismatch" }),
        expect.objectContaining({ code: "duplicate_fault_request" })
      ])
    });
    expect(metricSpy).not.toHaveBeenCalled();
  });

  it("times out an unresponsive artifact sink without hanging the package", async () => {
    const { plan, definitions } = fixturePlan();
    const { tools } = fakeTools({
      artifactSink: {
        write: ({ signal }) => new Promise<void>((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        })
      }
    });

    const result = await execute(plan, definitions, tools, { requestTimeoutMs: 15 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.chartResults.every((chart) => chart.status === "error" && chart.errorCode === "timeout"))
      .toBe(true);
    expect(result.value.dashboardResults).toEqual([
      expect.objectContaining({ status: "error", errorCode: "timeout" })
    ]);
    expect(result.value.executions.filter((execution) => (
      execution.requestKind === "chart" || execution.requestKind === "dashboard"
    )).every((execution) => (
      execution.evidence.length > 0 && typeof execution.provenance.sourceRevision === "string"
    ))).toBe(true);
  });

  it("executes one ledger entry per request for the real four-chiller/six-pump plan", async () => {
    const equipmentIds = [
      "WCC_01", "WCC_02", "WCC_03", "WCC_04",
      "CHP_1P_01", "CHP_1P_02", "CHP_1P_03", "CHP_1P_04", "CHP_1P_05", "CHP_1P_06"
    ];
    const selection: ReportSpec["equipment"] = { mode: "selected", equipmentIds };
    const assets = await discoverProjectReportAssets({ projectId: "project_element", selection });
    expect(assets.ok).toBe(true);
    if (!assets.ok) return;
    const spec: ReportSpec = {
      schemaVersion: REPORT_SPEC_SCHEMA_VERSION,
      specId: "real-element-evidence-matrix",
      projectId: "project_element",
      title: "Element Weekly Performance Report",
      timeZone: "Asia/Hong_Kong",
      period: { kind: "weekly", window: "previous_complete", weekStartsOn: "monday" },
      schedule: { enabled: false },
      sections: {
        ordered: [
          { section: "executive_summary", enabled: true },
          { section: "key_findings", enabled: true },
          { section: "system_performance", enabled: true },
          { section: "selected_dashboards", enabled: true },
          { section: "fault_summary", enabled: true },
          { section: "equipment_analysis", enabled: true },
          { section: "recommended_actions", enabled: true },
          { section: "appendix", enabled: true }
        ]
      },
      kpiKeys: ["cooling_energy", "electricity", "plant_cop", "kw_per_rt"],
      dashboardIds: ["plant_overview", "energy_dashboard"],
      equipment: selection
    };
    const definitions = evidenceDefinitionsFixture(assets.value.profiles);
    const planned = buildReportPlan({
      planId: "plan-real-element-evidence-matrix",
      spec,
      period: {
        startAt: "2026-08-09T16:00:00.000Z",
        endAt: "2026-08-16T16:00:00.000Z",
        timeZone: "Asia/Hong_Kong"
      },
      plannedAt: "2026-08-17T00:05:00.000Z",
      equipment: assets.value.equipment,
      profiles: assets.value.profiles,
      evidenceDefinitions: definitions,
      resolvedSystemCharts: [
        { chartKey: "cooling_demand", metricKeys: ["cooling_energy"] },
        { chartKey: "energy_consumption", metricKeys: ["electricity"] },
        { chartKey: "system_efficiency", metricKeys: ["plant_cop"] },
        { chartKey: "plant_efficiency", metricKeys: ["kw_per_rt"] }
      ],
      resolvedDashboards: spec.dashboardIds.map((dashboardId) => ({
        dashboardId,
        dashboardRevision: `fixture-revision:${dashboardId}`
      })),
      assetRevision: assets.value.assetRevision,
      assetProvenance: assets.value.assetProvenance
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.value.evidence.metrics).toHaveLength(71);
    expect(planned.value.evidence.charts).toHaveLength(49);
    expect(planned.value.evidence.dashboards).toHaveLength(2);
    expect(planned.value.evidence.faults).toHaveLength(10);
    expect(planned.value.analysis.requests).toHaveLength(36);

    const metricExecute = vi.fn<MetricEvidenceTool["execute"]>(async () => ({
      status: "no_data",
      reasonCode: "metric_instance_not_found",
      message: "No deterministic source adapter is configured for this fixture metric."
    }));
    const dashboardExecute = vi.fn<DashboardEvidenceTool["execute"]>(async () => ({
      status: "no_data",
      reasonCode: "dashboard_unavailable",
      message: "No snapshot renderer is configured."
    }));
    const faultExecute = vi.fn<FaultEvidenceTool["execute"]>(async ({ request, context }) => ({
      status: "complete",
      evidence: evidence("fdd_rule", `scan-${request.equipmentId}`),
      value: {
        projectId: context.projectId,
        equipmentId: request.equipmentId,
        equipmentType: request.equipmentType,
        period: structuredClone(context.period),
        definition: { ...request.definition },
        events: []
      }
    }));
    const fixture = fakeTools({ metric: metricExecute, dashboard: dashboardExecute, fault: faultExecute });
    const chartExecute = vi.spyOn(fixture.tools.chart, "execute");

    const result = await execute(planned.value, definitions, fixture.tools, {
      packageId: "package-real-element-evidence-matrix"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.executions).toHaveLength(132);
    expect(new Set(result.value.executions.map((execution) => execution.requestId)).size).toBe(132);
    expect(metricExecute).toHaveBeenCalledTimes(71);
    expect(dashboardExecute).toHaveBeenCalledTimes(2);
    expect(faultExecute).toHaveBeenCalledTimes(10);
    expect(chartExecute).toHaveBeenCalledTimes(2);
    expect(result.value.chartResults.filter((chart) => chart.status === "ready")).toHaveLength(2);
  });
});
