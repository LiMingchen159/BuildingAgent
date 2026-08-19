import { describe, expect, it } from "vitest";

import {
  ANALYSIS_TOOL_DRAFT_SCHEMA_VERSION,
  REPORT_SPEC_SCHEMA_VERSION,
  createEquipmentIdentity,
  type AnalysisPackage,
  type AnalysisToolDraft,
  type AnalysisToolDraftSegment,
  type EquipmentIdentity,
  type EquipmentProfile,
  type EvidencePackage,
  type ReportAssetProvenance,
  type ReportBlock,
  type ReportDocument,
  type ReportPlan,
  type ReportSpec
} from "./contracts.js";
import { DEFAULT_ANALYSIS_DEFINITION_REGISTRY } from "./analysisDefinitions.js";
import { executeReportAnalysis } from "./analysisExecutor.js";
import { discoverProjectReportAssets } from "./assetDiscovery.js";
import { evidenceDefinitionsFixture } from "./evidenceTestFixtures.js";
import { executeReportEvidence } from "./evidenceExecutor.js";
import type {
  ChartEvidenceTool,
  DashboardEvidenceTool,
  FaultEvidenceTool,
  MetricEvidenceTool,
  ReportEvidenceTools
} from "./evidenceTools.js";
import type { ReportAnalysisModel, ReportAnalysisModelRequest } from "./analysisTools.js";
import { renderReportLatex } from "./latexRenderer.js";
import { buildReportPlan } from "./planner.js";
import {
  REPORT_ASSEMBLER_ID,
  REPORT_ASSEMBLER_VERSION,
  assembleReportDocument,
  reportDocumentRevision,
  validateReportDocumentForPackages,
  type AssembleReportDocumentInput
} from "./reportAssembler.js";

const PERIOD = {
  startAt: "2026-08-09T16:00:00.000Z",
  endAt: "2026-08-16T16:00:00.000Z",
  timeZone: "Asia/Hong_Kong"
} as const;

const profile: EquipmentProfile = {
  profileId: "profile-air-handler",
  version: 1,
  equipmentType: "air_handler",
  groupTitle: "Air Handler Performance",
  fleetMetricKeys: ["runtime"],
  fleetChartKeys: ["fleet_runtime"],
  metricKeys: ["runtime"],
  chartKeys: ["runtime_trend"],
  analysis: { performance: true, faultDiagnosis: true },
  order: 30
};

function equipmentIdentity(): EquipmentIdentity {
  const result = createEquipmentIdentity({
    equipmentId: "asset-ahu-north-01",
    shortIdentifier: "AHU-01",
    equipmentType: profile.equipmentType,
    fullName: "North Wing Air Handler 01",
    nameSource: "project_metadata",
    nameSourceRef: "project-assets.json#asset-ahu-north-01"
  });
  if (!result.ok) throw new Error(`invalid equipment fixture: ${JSON.stringify(result.issues)}`);
  return result.value;
}

function assetProvenance(equipment: EquipmentIdentity): ReportAssetProvenance {
  return {
    resolverVersion: 1,
    sources: [{
      sourceKind: "project_metadata",
      sourceId: "project-assets.json",
      sourceRevision: "sha256:assembler-fixture-assets"
    }],
    equipment: [{
      equipmentId: equipment.equipmentId,
      resolvedIdentity: structuredClone(equipment),
      profileId: profile.profileId,
      profileVersion: profile.version,
      classificationRuleRefs: ["fixture-air-handler-v1"],
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
    specId: "weekly-assembler-fixture",
    projectId: "project_element",
    title: "Element Weekly Performance Report",
    timeZone: PERIOD.timeZone,
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
    kpiKeys: ["plant_cop"],
    dashboardIds: ["plant_overview"],
    equipment: { mode: "selected", equipmentIds: ["asset-ahu-north-01"] }
  };
}

function evidenceReference(
  sourceKind: "derived_metric" | "plot_tool" | "dashboard" | "fdd_rule",
  sourceId: string
) {
  return [{ evidenceId: `evidence:${sourceKind}:${sourceId}`, sourceKind, sourceId }];
}

function evidenceTools(
  options: { zeroFaults?: boolean; dirtyMetricMessage?: string; renderableArtifacts?: boolean } = {}
): ReportEvidenceTools {
  const svg = new TextEncoder().encode("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");
  const png = new Uint8Array(Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  ));
  const metric: MetricEvidenceTool = {
    descriptor: {
      producerKind: "derived_metric",
      producerId: "fixture-metric-tool",
      producerVersion: "1"
    },
    async execute({ request, context, definition }) {
      if (options.dirtyMetricMessage && request.scope.kind === "system" && request.metricKey === "plant_cop") {
        return {
          status: "no_data",
          reasonCode: "fixture_no_data",
          message: options.dirtyMetricMessage
        };
      }
      return {
        status: "complete",
        sourceRevision: `metric-revision:${request.requestId}`,
        value: {
          projectId: context.projectId,
          metricKey: request.metricKey,
          scope: structuredClone(request.scope),
          period: structuredClone(context.period),
          definition: structuredClone(request.definition),
          observedUnit: definition.unit,
          value: request.scope.kind === "system" ? 5.25 : 12.5,
          sampleCount: 672,
          coverage: 1,
          evidence: evidenceReference("derived_metric", request.requestId)
        }
      };
    }
  };
  const chart: ChartEvidenceTool = {
    descriptor: {
      producerKind: "plot_tool",
      producerId: "fixture-chart-tool",
      producerVersion: "1"
    },
    async execute({ request, context }) {
      return {
        status: "complete",
        sourceRevision: `chart-revision:${request.requestId}`,
        value: {
          projectId: context.projectId,
          chartKey: request.chartKey,
          scope: structuredClone(request.scope),
          period: structuredClone(context.period),
          definition: structuredClone(request.definition),
          title: `${request.chartKey.replaceAll("_", " ")} chart`,
          artifact: {
            relativePath: `charts/${request.chartKey}.${options.renderableArtifacts ? "png" : "svg"}`,
            mediaType: options.renderableArtifacts ? "image/png" : "image/svg+xml",
            bytes: new Uint8Array(options.renderableArtifacts ? png : svg)
          },
          evidence: evidenceReference("plot_tool", request.requestId)
        }
      };
    }
  };
  const dashboard: DashboardEvidenceTool = {
    descriptor: {
      producerKind: "dashboard_renderer",
      producerId: "fixture-dashboard-tool",
      producerVersion: "1"
    },
    async execute({ request, context }) {
      return {
        status: "complete",
        sourceRevision: request.dashboardRevision,
        value: {
          projectId: context.projectId,
          dashboardId: request.dashboardId,
          dashboardRevision: request.dashboardRevision,
          period: structuredClone(context.period),
          definition: structuredClone(request.definition),
          title: "Plant Overview",
          artifact: {
            relativePath: `dashboards/${request.dashboardId}.${options.renderableArtifacts ? "png" : "svg"}`,
            mediaType: options.renderableArtifacts ? "image/png" : "image/svg+xml",
            bytes: new Uint8Array(options.renderableArtifacts ? png : svg)
          },
          evidence: evidenceReference("dashboard", request.requestId)
        }
      };
    }
  };
  const fault: FaultEvidenceTool = {
    descriptor: {
      producerKind: "fdd_rule",
      producerId: "fixture-fault-tool",
      producerVersion: "1"
    },
    async execute({ request, context }) {
      return {
        status: "complete",
        sourceRevision: `fault-revision:${request.requestId}`,
        evidence: evidenceReference("fdd_rule", `scan:${request.requestId}`),
        value: {
          projectId: context.projectId,
          equipmentId: request.equipmentId,
          equipmentType: request.equipmentType,
          period: structuredClone(context.period),
          definition: structuredClone(request.definition),
          events: options.zeroFaults ? [] : [{
            status: "active",
            faultCode: "TEST_FAULT",
            startedAt: "2026-08-16T04:00:00.000Z",
            observedThrough: context.period.endAt,
            evidence: evidenceReference("fdd_rule", `event:${request.requestId}`)
          }]
        }
      };
    }
  };
  return {
    metrics: { derived_metric: metric },
    chart,
    dashboard,
    fault,
    artifactSink: { async write() {} }
  };
}

function safeDraft(request: ReportAnalysisModelRequest): AnalysisToolDraft {
  const citationAlias = request.evidencePayload.allowedCitationAliases[0];
  if (!citationAlias) throw new Error("fixture analysis requires typed evidence");
  const segments: AnalysisToolDraftSegment[] = [];
  const equipment = request.evidencePayload.equipment[0];
  const metric = request.evidencePayload.metrics[0];
  const fault = request.evidencePayload.faults[0];
  if (equipment) segments.push({ kind: "equipment_ref", equipmentAlias: equipment.equipmentAlias });
  segments.push({
    kind: "text",
    text: "Typed evidence supports a grounded operational interpretation.",
    citationAliases: [citationAlias]
  });
  if (metric) segments.push({ kind: "metric_ref", metricAlias: metric.metricAlias });
  if (fault) segments.push({ kind: "fault_ref", faultAlias: fault.faultAlias });
  return {
    schemaVersion: ANALYSIS_TOOL_DRAFT_SCHEMA_VERSION,
    requestAlias: request.evidencePayload.requestAlias,
    status: "complete",
    segments
  };
}

function analysisModel(): ReportAnalysisModel {
  return {
    metadata: {
      id: "fixture-analysis-provider",
      mode: "mock",
      model: "fixture-analysis-model",
      status: "configured"
    },
    async analyze(request) {
      return safeDraft(request);
    }
  };
}

interface PipelineFixture {
  plan: ReportPlan;
  evidencePackage: EvidencePackage;
  analysisPackage: AnalysisPackage;
  evidenceDefinitions: ReturnType<typeof evidenceDefinitionsFixture>;
}

async function pipelineFixture(
  toolOptions: { zeroFaults?: boolean; dirtyMetricMessage?: string } = {}
): Promise<PipelineFixture> {
  const equipment = equipmentIdentity();
  const evidenceDefinitions = evidenceDefinitionsFixture([profile]);
  const planned = buildReportPlan({
    planId: "plan-assembler-fixture",
    spec: reportSpec(),
    period: structuredClone(PERIOD),
    plannedAt: "2026-08-17T00:05:00.000Z",
    equipment: [equipment],
    profiles: [profile],
    evidenceDefinitions,
    analysisDefinitions: DEFAULT_ANALYSIS_DEFINITION_REGISTRY,
    resolvedSystemCharts: [{ chartKey: "system_efficiency", metricKeys: ["plant_cop"] }],
    resolvedDashboards: [{ dashboardId: "plant_overview", dashboardRevision: "dashboard-revision-1" }],
    assetRevision: "sha256:assembler-fixture-assets",
    assetProvenance: assetProvenance(equipment)
  });
  if (!planned.ok) throw new Error(`invalid plan fixture: ${JSON.stringify(planned.issues)}`);
  const evidence = await executeReportEvidence({
    plan: planned.value,
    packageId: "evidence-assembler-fixture",
    generatedAt: "2026-08-17T00:10:00.000Z"
  }, {
    definitions: evidenceDefinitions,
    tools: evidenceTools(toolOptions)
  });
  if (!evidence.ok) throw new Error(`invalid evidence fixture: ${JSON.stringify(evidence.issues)}`);
  const analysis = await executeReportAnalysis({
    plan: planned.value,
    evidencePackage: evidence.value,
    packageId: "analysis-assembler-fixture",
    generatedAt: "2026-08-17T00:15:00.000Z"
  }, {
    definitions: DEFAULT_ANALYSIS_DEFINITION_REGISTRY,
    model: analysisModel()
  });
  if (!analysis.ok) throw new Error(`invalid analysis fixture: ${JSON.stringify(analysis.issues)}`);
  return {
    plan: planned.value,
    evidencePackage: evidence.value,
    analysisPackage: analysis.value,
    evidenceDefinitions
  };
}

function assemblerInput(fixture: PipelineFixture, overrides: Partial<AssembleReportDocumentInput> = {}): AssembleReportDocumentInput {
  return {
    ...fixture,
    documentId: "document-assembler-fixture",
    generatedAt: "2026-08-17T00:20:00.000Z",
    ...overrides
  };
}

function flattenBlocks(blocks: readonly ReportBlock[]): ReportBlock[] {
  return blocks.flatMap((block) => block.kind === "section"
    ? [block, ...flattenBlocks(block.blocks)]
    : [block]);
}

function refreshRevision(document: ReportDocument): void {
  document.revisionHash = reportDocumentRevision(document);
}

describe("report document assembly", () => {
  it("assembles one generic top-level block per plan section and references every typed result exactly once", async () => {
    const fixture = await pipelineFixture();
    const input = assemblerInput(fixture);
    const original = structuredClone(fixture);

    const assembled = assembleReportDocument(input);

    expect(assembled.ok).toBe(true);
    expect(fixture).toEqual(original);
    if (!assembled.ok) return;
    const document = assembled.value;
    const blocks = flattenBlocks(document.blocks);
    expect(document.blocks).toHaveLength(fixture.plan.sections.length);
    expect(document.assembler).toEqual({
      assemblerId: REPORT_ASSEMBLER_ID,
      assemblerVersion: REPORT_ASSEMBLER_VERSION
    });
    expect(document.blocks.map((block) => (
      block.kind === "section" || block.kind === "title" ? block.title : block.kind
    ))).toEqual([
      "Element Weekly Performance Report",
      "Report Information",
      "Executive Summary",
      "Key Findings",
      "System Performance",
      "Selected Dashboards",
      "Fault Summary",
      "Air Handler Performance",
      "Recommended Actions",
      "Appendix"
    ]);
    expect(blocks).toContainEqual(expect.objectContaining({
      kind: "section",
      title: "AHU-01 — North Wing Air Handler 01"
    }));
    expect(blocks).toContainEqual(expect.objectContaining({
      kind: "chart",
      caption: "AHU-01 — North Wing Air Handler 01 — Runtime Trend"
    }));
    expect(blocks.some((block) => block.kind === "section" && block.title === "asset-ahu-north-01")).toBe(false);

    const metricRefs = blocks.flatMap((block) => block.kind === "kpi" ? block.metricResultIds : []);
    const chartRefs = blocks.flatMap((block) => block.kind === "chart" ? [block.chartResultId] : []);
    const dashboardRefs = blocks.flatMap((block) => block.kind === "dashboard" ? [block.dashboardResultId] : []);
    const faultRequestRefs = blocks.flatMap((block) => block.kind === "fault" ? block.faultRequestIds : []);
    const analysisRefs = blocks.flatMap((block) => block.kind === "analysis" ? [block.analysisResultId] : []);
    expect(metricRefs.sort()).toEqual(fixture.evidencePackage.metricResults.map((result) => result.resultId).sort());
    expect(chartRefs.sort()).toEqual(fixture.evidencePackage.chartResults.map((result) => result.resultId).sort());
    expect(dashboardRefs.sort()).toEqual(fixture.evidencePackage.dashboardResults.map((result) => result.resultId).sort());
    for (const request of fixture.plan.evidence.faults) {
      expect(faultRequestRefs.filter((requestId) => requestId === request.requestId)).toHaveLength(2);
    }
    expect(analysisRefs.sort()).toEqual(fixture.analysisPackage.results.map((result) => result.analysisId).sort());
    expect(new Set(blocks.map((block) => block.blockId)).size).toBe(blocks.length);

    const definitionsTable = blocks.find((block) => block.kind === "table" && block.title === "Pinned Definitions");
    expect(definitionsTable).toMatchObject({
      kind: "table",
      columns: expect.arrayContaining([
        expect.objectContaining({ key: "registry" }),
        expect.objectContaining({ key: "fault_code" }),
        expect.objectContaining({ key: "detector_version" })
      ]),
      rows: expect.arrayContaining([expect.objectContaining({
        registry: { kind: "text", text: "evidence" },
        category: { kind: "text", text: "Fault Detection" },
        fault_code: { kind: "text", text: "TEST_FAULT" },
        severity: { kind: "text", text: "medium" },
        detector: { kind: "text", text: "fixture-detector:air_handler" },
        detector_version: { kind: "text", text: "1" }
      })])
    });
    const dataQualityTable = blocks.find((block) => block.kind === "table" && block.title === "Data Quality");
    expect(dataQualityTable).toMatchObject({
      kind: "table",
      columns: expect.arrayContaining([
        expect.objectContaining({ key: "issue_id" }),
        expect.objectContaining({ key: "message" })
      ]),
      rows: [expect.objectContaining({
        issue_id: { kind: "text", text: "none" },
        message: { kind: "text", text: "No data-quality issues were reported." }
      })]
    });

    const validated = validateReportDocumentForPackages({ ...input, document });
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.value).toEqual(document);
      expect(validated.value).not.toBe(document);
    }
  });

  it("rejects altered names, missing or duplicate references, duplicate block IDs, and stale hashes", async () => {
    const fixture = await pipelineFixture();
    const input = assemblerInput(fixture);
    const assembled = assembleReportDocument(input);
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;

    const cases: Array<{
      name: string;
      mutate(document: ReportDocument): void;
      expectedCode: string;
    }> = [
      {
        name: "invented equipment title",
        mutate(document) {
          const section = flattenBlocks(document.blocks).find((block) => (
            block.kind === "section" && block.title === "AHU-01 — North Wing Air Handler 01"
          ));
          if (!section || section.kind !== "section") throw new Error("missing equipment section");
          section.title = "Invented Equipment Name";
          refreshRevision(document);
        },
        expectedCode: "block_graph_mismatch"
      },
      {
        name: "duplicate metric reference",
        mutate(document) {
          const kpi = flattenBlocks(document.blocks).find((block) => block.kind === "kpi" && block.metricResultIds.length > 0);
          if (!kpi || kpi.kind !== "kpi") throw new Error("missing KPI block");
          kpi.metricResultIds.push(kpi.metricResultIds[0]!);
          refreshRevision(document);
        },
        expectedCode: "duplicate_reference"
      },
      {
        name: "missing dashboard",
        mutate(document) {
          const section = document.blocks.find((block) => block.kind === "section" && block.title === "Selected Dashboards");
          if (!section || section.kind !== "section") throw new Error("missing dashboard section");
          section.blocks = [];
          refreshRevision(document);
        },
        expectedCode: "reference_cardinality_mismatch"
      },
      {
        name: "duplicate block id",
        mutate(document) {
          const blocks = flattenBlocks(document.blocks);
          blocks[1]!.blockId = blocks[0]!.blockId;
          refreshRevision(document);
        },
        expectedCode: "duplicate_block_id"
      },
      {
        name: "stale revision",
        mutate(document) {
          document.revisionHash = "sha256:stale";
        },
        expectedCode: "revision_hash_mismatch"
      }
    ];

    for (const candidate of cases) {
      const document = structuredClone(assembled.value);
      candidate.mutate(document);
      const result = validateReportDocumentForPackages({ ...input, document });
      expect(result.ok, candidate.name).toBe(false);
      if (!result.ok) expect(result.issues.map((entry) => entry.code), candidate.name).toContain(candidate.expectedCode);
    }
  });

  it("fails closed before assembly when document metadata or the pinned evidence registry is invalid", async () => {
    const fixture = await pipelineFixture();
    const changedDefinitions = structuredClone(fixture.evidenceDefinitions);
    changedDefinitions.metrics[0]!.label = "Changed after planning";

    const invalidId = assembleReportDocument(assemblerInput(fixture, { documentId: "../unsafe" }));
    const invalidTime = assembleReportDocument(assemblerInput(fixture, { generatedAt: "not-a-time" }));
    const invalidDefinitions = assembleReportDocument(assemblerInput(fixture, {
      evidenceDefinitions: changedDefinitions
    }));

    expect(invalidId).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "invalid_id" })]) });
    expect(invalidTime).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "invalid_datetime" })]) });
    expect(invalidDefinitions).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "definition_revision_mismatch" })])
    });
  });

  it("includes stable issue IDs and sanitized data-quality messages in the appendix", async () => {
    const fixture = await pipelineFixture({
      dirtyMetricMessage: "  Missing\u0000 data\n\t details  "
    });
    const assembled = assembleReportDocument(assemblerInput(fixture));
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;

    const quality = flattenBlocks(assembled.value.blocks).find((block) => (
      block.kind === "table" && block.title === "Data Quality"
    ));
    expect(quality?.kind).toBe("table");
    if (!quality || quality.kind !== "table") return;
    const row = quality.rows.find((candidate) => (
      candidate.code?.kind === "text" && candidate.code.text === "fixture_no_data"
    ));
    expect(row).toMatchObject({
      issue_id: { kind: "text", text: expect.stringMatching(/^quality_[a-f0-9]{24}$/u) },
      code: { kind: "text", text: "fixture_no_data" },
      message: { kind: "text", text: "Missing data details" }
    });
  });

  it("never throws for non-JSON, cyclic, deeply nested, or otherwise malformed runtime documents", async () => {
    const fixture = await pipelineFixture();
    const input = assemblerInput(fixture);
    const assembled = assembleReportDocument(input);
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;

    const malformed: Array<{ name: string; document: ReportDocument; code: string }> = [];
    const undefinedValue = structuredClone(assembled.value);
    (undefinedValue as unknown as Record<string, unknown>).period = undefined;
    malformed.push({ name: "undefined", document: undefinedValue, code: "invalid_json_value" });

    const bigintValue = structuredClone(assembled.value);
    (bigintValue as unknown as Record<string, unknown>).assembler = 1n;
    malformed.push({ name: "bigint", document: bigintValue, code: "invalid_json_value" });

    const nonFiniteValue = structuredClone(assembled.value);
    (nonFiniteValue as unknown as Record<string, unknown>).schemaVersion = Number.NaN;
    malformed.push({ name: "non-finite number", document: nonFiniteValue, code: "invalid_number" });

    const classValue = structuredClone(assembled.value);
    (classValue as unknown as Record<string, unknown>).period = new Date(PERIOD.startAt);
    malformed.push({ name: "class instance", document: classValue, code: "invalid_json_container" });

    const cyclic = structuredClone(assembled.value);
    (cyclic as unknown as Record<string, unknown>).cycle = cyclic;
    malformed.push({ name: "cycle", document: cyclic, code: "cyclic_or_shared_reference" });

    const deeplyNested = structuredClone(assembled.value);
    const deepRoot: Record<string, unknown> = {};
    let cursor = deepRoot;
    for (let depth = 0; depth < 40; depth += 1) {
      const child: Record<string, unknown> = {};
      cursor.child = child;
      cursor = child;
    }
    (deeplyNested as unknown as Record<string, unknown>).deep = deepRoot;
    malformed.push({ name: "deep object", document: deeplyNested, code: "document_too_deep" });

    for (const candidate of malformed) {
      let result: ReturnType<typeof validateReportDocumentForPackages> | undefined;
      expect(() => {
        result = validateReportDocumentForPackages({ ...input, document: candidate.document });
      }, candidate.name).not.toThrow();
      expect(result?.ok, candidate.name).toBe(false);
      if (result && !result.ok) {
        expect(result.issues.map((entry) => entry.code), candidate.name).toContain(candidate.code);
      }
    }

    expect(() => validateReportDocumentForPackages(null as never)).not.toThrow();
    expect(validateReportDocumentForPackages(null as never)).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "invalid_type" })]
    });
  });

  it("stops immediately when JSON nodes, report blocks, block depth, or table rows exceed their limits", async () => {
    const fixture = await pipelineFixture();
    const input = assemblerInput(fixture);
    const assembled = assembleReportDocument(input);
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;

    const oversizedNodes = structuredClone(assembled.value);
    (oversizedNodes as unknown as Record<string, unknown>).oversized = Array.from({ length: 200_001 }, () => null);

    const oversizedBlocks = structuredClone(assembled.value);
    oversizedBlocks.blocks = Array.from({ length: 10_001 }, (_, index) => ({
      kind: "title" as const,
      blockId: `block_${index.toString(16).padStart(24, "0")}`,
      title: "Bounded block"
    }));

    const oversizedRows = structuredClone(assembled.value);
    const table = flattenBlocks(oversizedRows.blocks).find((block) => block.kind === "table");
    if (!table || table.kind !== "table") throw new Error("missing table fixture");
    table.rows = Array.from({ length: 50_001 }, () => ({}));

    const excessiveDepth = structuredClone(assembled.value);
    let nested: ReportBlock = {
      kind: "title",
      blockId: "block_ffffffffffffffffffffffff",
      title: "Leaf"
    };
    for (let depth = 0; depth < 9; depth += 1) {
      nested = {
        kind: "section",
        blockId: `block_${(depth + 1).toString(16).padStart(24, "0")}`,
        title: "Nested section",
        level: 3,
        numbering: "unnumbered",
        blocks: [nested]
      };
    }
    excessiveDepth.blocks = [nested];

    for (const candidate of [
      { name: "JSON nodes", document: oversizedNodes, code: "document_too_large" },
      { name: "blocks", document: oversizedBlocks, code: "too_many_blocks" },
      { name: "rows", document: oversizedRows, code: "too_many_rows" },
      { name: "block depth", document: excessiveDepth, code: "block_depth_exceeded" }
    ]) {
      let result: ReturnType<typeof validateReportDocumentForPackages> | undefined;
      expect(() => {
        result = validateReportDocumentForPackages({ ...input, document: candidate.document });
      }, candidate.name).not.toThrow();
      expect(result?.ok, candidate.name).toBe(false);
      if (result && !result.ok) {
        expect(result.issues.map((entry) => entry.code), candidate.name).toContain(candidate.code);
      }
    }
  });

  it("keeps block IDs and content revision independent of the caller-provided document ID", async () => {
    const fixture = await pipelineFixture();
    const first = assembleReportDocument(assemblerInput(fixture, { documentId: "document-a" }));
    const second = assembleReportDocument(assemblerInput(fixture, { documentId: "document-b" }));
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.blocks).toEqual(second.value.blocks);
    expect(first.value.revisionHash).toBe(second.value.revisionHash);
  });

  it("assembles the real four-chiller and six-pump plan without hard-coded equipment counts or names", async () => {
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
      specId: "real-element-document-matrix",
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
      planId: "plan-real-element-document-matrix",
      spec,
      period: structuredClone(PERIOD),
      plannedAt: "2026-08-17T00:05:00.000Z",
      equipment: assets.value.equipment,
      profiles: assets.value.profiles,
      evidenceDefinitions: definitions,
      analysisDefinitions: DEFAULT_ANALYSIS_DEFINITION_REGISTRY,
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
    const evidence = await executeReportEvidence({
      plan: planned.value,
      packageId: "evidence-real-element-document-matrix",
      generatedAt: "2026-08-17T00:10:00.000Z"
    }, {
      definitions,
      tools: evidenceTools({ zeroFaults: true, renderableArtifacts: true })
    });
    expect(evidence.ok).toBe(true);
    if (!evidence.ok) return;
    const analysis = await executeReportAnalysis({
      plan: planned.value,
      evidencePackage: evidence.value,
      packageId: "analysis-real-element-document-matrix",
      generatedAt: "2026-08-17T00:15:00.000Z"
    }, {
      definitions: DEFAULT_ANALYSIS_DEFINITION_REGISTRY,
      model: analysisModel()
    });
    expect(analysis.ok).toBe(true);
    if (!analysis.ok) return;
    const assembled = assembleReportDocument({
      plan: planned.value,
      evidencePackage: evidence.value,
      analysisPackage: analysis.value,
      evidenceDefinitions: definitions,
      documentId: "document-real-element-matrix",
      generatedAt: "2026-08-17T00:20:00.000Z"
    });
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;

    const blocks = flattenBlocks(assembled.value.blocks);
    const count = (kind: ReportBlock["kind"]) => blocks.filter((block) => block.kind === kind).length;
    expect(assembled.value.blocks).toHaveLength(11);
    expect(blocks).toHaveLength(148);
    expect(count("title")).toBe(1);
    expect(count("section")).toBe(22);
    expect(count("table")).toBe(14);
    expect(count("kpi")).toBe(13);
    expect(count("chart")).toBe(49);
    expect(count("dashboard")).toBe(2);
    expect(count("fault")).toBe(11);
    expect(count("analysis")).toBe(36);
    expect(assembled.value.blocks.map((block) => (
      block.kind === "section" || block.kind === "title" ? block.title : block.kind
    ))).toEqual([
      "Element Weekly Performance Report",
      "Report Information",
      "Executive Summary",
      "Key Findings",
      "System Performance",
      "Selected Dashboards",
      "Fault Summary",
      "Chiller Performance",
      "Pump Performance",
      "Recommended Actions",
      "Appendix"
    ]);
    const sectionTitles = blocks
      .filter((block): block is Extract<ReportBlock, { kind: "section" }> => block.kind === "section")
      .map((block) => block.title);
    expect(sectionTitles).toEqual(expect.arrayContaining([
      "WCC-01 — Chiller 01",
      "WCC-04 — Chiller 04",
      "CHP-1P-01 — Chilled Water Pump 01",
      "CHP-1P-06 — Chilled Water Pump 06"
    ]));

    const faultSummary = assembled.value.blocks.find((block) => (
      block.kind === "section" && block.title === "Fault Summary"
    ));
    expect(faultSummary?.kind).toBe("section");
    if (!faultSummary || faultSummary.kind !== "section") return;
    const summaryFaultBlock = faultSummary.blocks.find((block) => block.kind === "fault");
    expect(summaryFaultBlock).toMatchObject({
      kind: "fault",
      faultRequestIds: planned.value.evidence.faults.map((request) => request.requestId),
      faultEventIds: []
    });
    const allFaultRequestRefs = blocks.flatMap((block) => block.kind === "fault" ? block.faultRequestIds : []);
    for (const request of planned.value.evidence.faults) {
      expect(allFaultRequestRefs.filter((requestId) => requestId === request.requestId)).toHaveLength(2);
    }

    const rendered = renderReportLatex({
      document: assembled.value,
      plan: planned.value,
      evidencePackage: evidence.value,
      analysisPackage: analysis.value,
      evidenceDefinitions: definitions
    });
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;
    expect(rendered.value.source).toContain("No faults were detected during the report period.");
    expect(rendered.value.source).not.toContain("Fault detection coverage is incomplete for this report period.");
  });
});
