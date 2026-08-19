import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AnalysisPackage,
  AnalysisResult,
  ChartResult,
  DashboardResult,
  EquipmentIdentity,
  EvidenceExecutionRecord,
  EvidencePackage,
  FaultEvent,
  MetricResult,
  ReportDocument,
  ReportPlan,
  ReportValidationResult,
  ResolvedReportPeriod
} from "./contracts.js";
import type { EvidenceDefinitionRegistry } from "./evidenceDefinitions.js";

vi.mock("./reportAssembler.js", () => ({
  validateReportDocumentForPackages: vi.fn((input: { document: ReportDocument }) => ({
    ok: true,
    value: input.document
  }))
}));

import {
  escapeLatexInline,
  escapeLatexText,
  renderReportLatex,
  type RenderReportLatexInput
} from "./latexRenderer.js";
import { validateReportDocumentForPackages } from "./reportAssembler.js";

const period: ResolvedReportPeriod = {
  startAt: "2026-06-01T00:00:00.000+08:00",
  endAt: "2026-06-08T00:00:00.000+08:00",
  timeZone: "Asia/Hong_Kong"
};

const equipment: EquipmentIdentity = {
  equipmentId: "urn:building:equipment:chiller-01",
  shortIdentifier: "CH-01",
  equipmentType: "chiller",
  fullName: "冷水机组 01",
  displayName: "CH-01 — 冷水机组 01",
  nameSource: "semantic_model",
  nameSourceRef: "urn:brick:chiller-01"
};

function execution(
  requestId: string,
  status: "complete" | "error"
): EvidenceExecutionRecord {
  const base = {
    requestId,
    requestKind: "fault" as const,
    resultIds: [],
    evidence: [],
    provenance: {
      producerKind: "fdd_rule" as const,
      producerId: "fdd",
      producerVersion: "1",
      definition: { definitionId: "fault-chiller", definitionVersion: "1" },
      queryHash: `sha256:${"1".repeat(64)}`,
      inputEvidenceIds: []
    }
  };
  return status === "complete"
    ? { ...base, status }
    : {
        ...base,
        status,
        errorCode: "private_provider_code",
        message: "SECRET_FAULT_PROVIDER_LOG",
        retryable: false
      };
}

function analysisBase(analysisId: string, requestId: string) {
  return {
    analysisId,
    requestId,
    evidencePackageId: "evidence-package-1",
    generatedAt: "2026-06-08T00:10:00.000Z",
    provenance: {
      producerKind: "b_agent" as const,
      producerId: "report-analysis",
      producerVersion: "1",
      definition: { definitionId: "analysis", definitionVersion: "1" },
      evidencePackageRevision: `sha256:${"e".repeat(64)}`,
      inputEvidenceRequestIds: [],
      inputResultIds: [],
      model: null
    }
  };
}

function fixture(): RenderReportLatexInput {
  const metrics: MetricResult[] = [
    {
      resultId: "metric-available",
      metricKey: "plant_power",
      label: "Cooling & power_%",
      unit: "kW_%",
      scope: { kind: "system" },
      period,
      evidence: [],
      status: "available",
      value: 12.3456,
      aggregation: "average",
      sampleCount: 24,
      coverage: 1
    },
    {
      resultId: "metric-no-data",
      metricKey: "missing_metric",
      label: "Missing metric",
      unit: "°C",
      scope: { kind: "system" },
      period,
      evidence: [],
      status: "no_data",
      reason: "SECRET_METRIC_NO_DATA_REASON"
    },
    {
      resultId: "metric-error",
      metricKey: "failed_metric",
      label: "Failed metric",
      unit: "kWh",
      scope: { kind: "system" },
      period,
      evidence: [],
      status: "error",
      errorCode: "private_metric_code",
      message: "SECRET_METRIC_PROVIDER_LOG"
    }
  ];
  const charts: ChartResult[] = [
    {
      resultId: "chart-ready",
      chartKey: "temperature",
      title: "Temperature trend",
      scope: { kind: "system" },
      period,
      evidence: [],
      status: "ready",
      artifact: {
        artifactId: "artifact-chart-private-id",
        relativePath: "evidence/run/charts/temperature.png",
        mediaType: "image/png",
        checksum: `sha256:${"a".repeat(64)}`
      }
    },
    {
      resultId: "chart-no-data",
      chartKey: "flow",
      title: "Flow trend",
      scope: { kind: "system" },
      period,
      evidence: [],
      status: "no_data",
      reason: "SECRET_CHART_NO_DATA_REASON"
    },
    {
      resultId: "chart-error",
      chartKey: "pressure",
      title: "Pressure trend",
      scope: { kind: "system" },
      period,
      evidence: [],
      status: "error",
      errorCode: "private_chart_code",
      message: "SECRET_CHART_PROVIDER_LOG"
    }
  ];
  const dashboards: DashboardResult[] = [
    {
      resultId: "dashboard-ready",
      dashboardId: "dashboard-plant",
      dashboardRevision: "revision-1",
      title: "Plant overview",
      period,
      evidence: [],
      status: "ready",
      artifact: {
        artifactId: "artifact-dashboard-private-id",
        relativePath: "evidence/run/dashboards/plant.pdf",
        mediaType: "application/pdf",
        checksum: `sha256:${"b".repeat(64)}`
      }
    },
    {
      resultId: "dashboard-no-data",
      dashboardId: "dashboard-energy",
      dashboardRevision: "revision-1",
      title: "Energy dashboard",
      period,
      evidence: [],
      status: "no_data",
      reason: "SECRET_DASHBOARD_NO_DATA_REASON"
    },
    {
      resultId: "dashboard-error",
      dashboardId: "dashboard-faults",
      dashboardRevision: "revision-1",
      title: "Fault dashboard",
      period,
      evidence: [],
      status: "error",
      errorCode: "private_dashboard_code",
      message: "SECRET_DASHBOARD_PROVIDER_LOG"
    }
  ];
  const fault: FaultEvent = {
    eventId: "fault-event-1",
    equipment: { ...equipment, fullName: "Invented event-side name", displayName: "INVENTED EVENT NAME" },
    faultCode: "HIGH_TEMP_%\\input",
    severity: "high",
    status: "resolved",
    startedAt: "2026-06-02T01:00:00.000Z",
    endedAt: "2026-06-02T03:30:00.000Z",
    durationHours: 2.5,
    detectorId: "detector-private",
    detectorVersion: "1",
    evidence: []
  };
  const activeFault: FaultEvent = {
    eventId: "fault-event-2",
    equipment,
    faultCode: "LOW_FLOW",
    severity: "medium",
    status: "active",
    startedAt: "2026-06-07T04:00:00.000Z",
    observedThrough: "2026-06-08T00:00:00.000Z",
    durationHours: 20,
    detectorId: "detector-private",
    detectorVersion: "1",
    evidence: []
  };
  const analyses: AnalysisResult[] = [
    {
      ...analysisBase("analysis-complete", "analysis-request-complete"),
      analysisKind: "fault_diagnosis",
      scope: { kind: "equipment", equipmentId: equipment.equipmentId, equipmentType: equipment.equipmentType },
      status: "complete",
      diagnosisNature: "hypothesis",
      faultEventIds: [fault.eventId],
      segments: [
        { kind: "text", text: "Possible hypothesis: inspect \\input{/etc/passwd} & #1.", evidenceIds: ["evidence-private"] },
        { kind: "equipment_ref", equipmentId: equipment.equipmentId },
        { kind: "metric_ref", metricResultId: "metric-available" },
        { kind: "fault_ref", faultEventId: fault.eventId }
      ],
      evidenceIds: ["evidence-private"]
    } as AnalysisResult,
    {
      ...analysisBase("analysis-insufficient", "analysis-request-insufficient"),
      analysisKind: "executive_summary",
      scope: { kind: "system" },
      status: "insufficient_evidence",
      message: "SECRET_ANALYSIS_MISSING_DETAIL",
      missingEvidence: ["opaque-request-id"]
    },
    {
      ...analysisBase("analysis-skipped", "analysis-request-skipped"),
      analysisKind: "fault_summary",
      scope: { kind: "system" },
      status: "skipped",
      reasonCode: "private_skip_code",
      message: "SECRET_ANALYSIS_SKIP_DETAIL"
    },
    {
      ...analysisBase("analysis-error", "analysis-request-error"),
      analysisKind: "key_findings",
      scope: { kind: "system" },
      status: "error",
      errorCode: "private_analysis_code",
      message: "SECRET_ANALYSIS_PROVIDER_LOG",
      retryable: false
    }
  ];
  const evidencePackage = {
    schemaVersion: 3,
    packageId: "evidence-package-1",
    planId: "plan-1",
    planRevision: `sha256:${"p".repeat(64)}`,
    projectId: "project-element",
    assetRevision: `sha256:${"c".repeat(64)}`,
    equipment: [equipment],
    period,
    generatedAt: "2026-06-08T00:05:00.000Z",
    revisionHash: `sha256:${"e".repeat(64)}`,
    executions: [execution("fault-complete", "complete"), execution("fault-error", "error")],
    metricResults: metrics,
    chartResults: charts,
    dashboardResults: dashboards,
    faultEvents: [fault, activeFault],
    dataQuality: []
  } as EvidencePackage;
  const analysisPackage = {
    schemaVersion: 1,
    packageId: "analysis-package-1",
    planId: "plan-1",
    planRevision: `sha256:${"p".repeat(64)}`,
    projectId: "project-element",
    assetRevision: `sha256:${"c".repeat(64)}`,
    period,
    evidencePackageId: evidencePackage.packageId,
    evidencePackageRevision: evidencePackage.revisionHash,
    definitionsRevision: `sha256:${"d".repeat(64)}`,
    generatedAt: "2026-06-08T00:10:00.000Z",
    revisionHash: `sha256:${"f".repeat(64)}`,
    results: analyses
  } as AnalysisPackage;
  const document: ReportDocument = {
    schemaVersion: 1,
    documentId: "report-document-1",
    planId: "plan-1",
    planRevision: `sha256:${"p".repeat(64)}`,
    projectId: "project-element",
    assetRevision: `sha256:${"c".repeat(64)}`,
    period,
    evidencePackageId: evidencePackage.packageId,
    evidencePackageRevision: evidencePackage.revisionHash,
    analysisPackageId: analysisPackage.packageId,
    analysisPackageRevision: analysisPackage.revisionHash,
    definitionsRevision: analysisPackage.definitionsRevision,
    generatedAt: "2026-06-08T00:12:00.000Z",
    assembler: { assemblerId: "report-assembler", assemblerVersion: "1" },
    revisionHash: `sha256:${"9".repeat(64)}`,
    blocks: [
      {
        kind: "title",
        blockId: "block-title",
        title: "每周 Building & Performance \\end{document} % report",
        subtitle: "Element 项目 _ 运行摘要"
      },
      {
        kind: "text",
        blockId: "block-text",
        source: "deterministic",
        format: "markdown",
        text: "# Markdown stays **plain**; $value & \\write18{bad}.\n第二行"
      },
      {
        kind: "section",
        blockId: "block-section",
        title: "Performance #1",
        level: 1,
        numbering: "numbered",
        blocks: [
          {
            kind: "kpi",
            blockId: "block-kpi",
            title: "KPI overview",
            metricResultIds: metrics.map((metric) => metric.resultId)
          },
          {
            kind: "section",
            blockId: "block-unnumbered",
            title: "Unnumbered context",
            level: 2,
            numbering: "unnumbered",
            blocks: [{
              kind: "text",
              blockId: "block-unnumbered-text",
              source: "deterministic",
              format: "plain",
              text: "Context text."
            }]
          },
          {
            kind: "table",
            blockId: "block-table",
            title: "Typed references",
            columns: [
              { key: "note", label: "Note & text" },
              { key: "metric", label: "Metric", alignment: "right" },
              { key: "equipment", label: "Equipment" },
              { key: "fault", label: "Fault", alignment: "center" }
            ],
            rows: [{
              note: { kind: "text", text: "literal _ % \\input{bad}" },
              metric: { kind: "metric_ref", metricResultId: "metric-available" },
              equipment: { kind: "equipment_ref", equipmentId: equipment.equipmentId },
              fault: { kind: "fault_ref", faultEventId: fault.eventId }
            }]
          },
          ...charts.map((chart) => ({
            kind: "chart" as const,
            blockId: `block-${chart.resultId}`,
            chartResultId: chart.resultId,
            caption: `Chart ${chart.resultId} & caption`
          })),
          ...dashboards.map((dashboard) => ({
            kind: "dashboard" as const,
            blockId: `block-${dashboard.resultId}`,
            dashboardResultId: dashboard.resultId,
            caption: `Dashboard ${dashboard.resultId} # caption`
          })),
          {
            kind: "fault",
            blockId: "block-fault-event",
            title: "Detected faults",
            faultRequestIds: ["fault-complete"],
            faultEventIds: [fault.eventId, activeFault.eventId]
          },
          {
            kind: "fault",
            blockId: "block-fault-zero",
            title: "Zero-fault coverage",
            faultRequestIds: ["fault-complete"],
            faultEventIds: []
          },
          {
            kind: "fault",
            blockId: "block-fault-incomplete",
            title: "Incomplete coverage",
            faultRequestIds: ["fault-error"],
            faultEventIds: []
          },
          ...analyses.map((analysis) => ({
            kind: "analysis" as const,
            blockId: `block-${analysis.analysisId}`,
            title: `Analysis ${analysis.analysisId}`,
            analysisResultId: analysis.analysisId
          })),
          { kind: "page_break", blockId: "block-page-break" }
        ]
      },
      {
        kind: "section",
        blockId: "block-appendix",
        title: "Definitions & provenance",
        level: 1,
        numbering: "appendix",
        blocks: [{
          kind: "text",
          blockId: "block-appendix-text",
          source: "deterministic",
          format: "plain",
          text: "Evidence-backed appendix."
        }]
      }
    ]
  };
  const plan = {
    planId: "plan-1",
    projectId: "project-element",
    period,
    equipment: [equipment]
  } as unknown as ReportPlan;
  const evidenceDefinitions: EvidenceDefinitionRegistry = {
    metrics: [],
    charts: [],
    dashboards: [],
    faults: []
  };
  return { document, plan, evidencePackage, analysisPackage, evidenceDefinitions };
}

const validateMock = vi.mocked(validateReportDocumentForPackages);

beforeEach(() => {
  validateMock.mockReset();
  validateMock.mockImplementation((input) => ({ ok: true, value: input.document as ReportDocument }));
});

describe("LaTeX text safety", () => {
  it("escapes every LaTeX control character while retaining Unicode", () => {
    expect(escapeLatexInline("冷机 \\ { } $ & # _ % ~ ^\tX\u0000")).toBe(
      String.raw`冷机 \textbackslash{} \{ \} \$ \& \# \_ \% \textasciitilde{} \textasciicircum{}\quad{}X�`
    );
    expect(escapeLatexText("line_1\n第二行%"))
      .toBe("line\\_1\\par\n第二行\\%");
  });
});

describe("renderReportLatex", () => {
  it("renders every block kind, typed reference, artifact, and stable failure state", () => {
    const result = renderReportLatex(fixture());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.source).toContain(String.raw`\documentclass[11pt,a4paper]{article}`);
    expect(result.value.source).toContain(String.raw`\usepackage{fontspec}`);
    expect(result.value.source).toContain(String.raw`\usepackage{xeCJK}`);
    expect(result.value.source).toContain(String.raw`\setCJKmainfont{Noto Serif CJK SC}`);
    expect(result.value.source).toContain(String.raw`{\sffamily\large\color{BAMuted}Element 项目 \_ 运行摘要\par}`);
    expect(result.value.source).toContain("CH-01 — 冷水机组 01");
    expect(result.value.source).toContain(String.raw`12.3456 kW\_\%`);
    expect(result.value.source).toContain("No data");
    expect(result.value.source).toContain("Unavailable");
    expect(result.value.source).toContain("No faults were detected during the report period.");
    expect(result.value.source).toContain("Fault detection coverage is incomplete for this report period.");
    expect(result.value.source).toContain("Insufficient evidence is available for this analysis.");
    expect(result.value.source).toContain("This analysis was not required for the report period.");
    expect(result.value.source).toContain("This analysis is unavailable.");
    expect(result.value.source).toContain("Fault diagnosis is a possible hypothesis over detected fault evidence.");
    expect(result.value.source).toContain("Observed through: 2026-06-08T00:00:00.000Z");
    expect(result.value.source).toContain("Ended: 2026-06-02T03:30:00.000Z");
    expect(result.value.source).toContain(String.raw`\begin{tabularx}{\textwidth}{@{}LRLC@{}}`);
    expect(result.value.source).toContain(String.raw`\subsection*{Unnumbered context}`);
    expect(result.value.source).toContain(String.raw`\clearpage`);
    expect(result.value.source).toContain(String.raw`\appendix`);
    expect(result.value.assets).toHaveLength(2);
    expect(result.value.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ mediaType: "image/png", fileName: expect.stringMatching(/^asset-[a-f0-9]{32}\.png$/u) }),
      expect.objectContaining({ mediaType: "application/pdf", fileName: expect.stringMatching(/^asset-[a-f0-9]{32}\.pdf$/u) })
    ]));
    for (const asset of result.value.assets) {
      expect(result.value.source).toContain(asset.fileName);
      expect(result.value.source).not.toContain(asset.artifactId);
      expect(result.value.source).not.toContain(asset.relativePath);
    }
    for (const secret of [
      "SECRET_METRIC_NO_DATA_REASON",
      "SECRET_METRIC_PROVIDER_LOG",
      "SECRET_CHART_NO_DATA_REASON",
      "SECRET_CHART_PROVIDER_LOG",
      "SECRET_DASHBOARD_NO_DATA_REASON",
      "SECRET_DASHBOARD_PROVIDER_LOG",
      "SECRET_FAULT_PROVIDER_LOG",
      "SECRET_ANALYSIS_MISSING_DETAIL",
      "SECRET_ANALYSIS_SKIP_DETAIL",
      "SECRET_ANALYSIS_PROVIDER_LOG",
      "private_metric_code",
      "private_chart_code",
      "private_dashboard_code",
      "private_analysis_code",
      "evidence-private",
      "opaque-request-id",
      "detector-private",
      "INVENTED EVENT NAME",
      "urn:building:equipment:chiller-01"
    ]) {
      expect(result.value.source).not.toContain(secret);
    }
  });

  it("treats Markdown and hostile LaTeX as plain escaped text without ending the document", () => {
    const result = renderReportLatex(fixture());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.source.match(/\\end\{document\}/gu)).toHaveLength(1);
    expect(result.value.source).not.toContain(String.raw`\input{/etc/passwd}`);
    expect(result.value.source).not.toContain(String.raw`\write18{bad}`);
    expect(result.value.source).toContain(String.raw`\textbackslash{}end\{document\}`);
    expect(result.value.source).toContain(String.raw`\textbackslash{}input\{/etc/passwd\}`);
    expect(result.value.source).toContain(String.raw`\# Markdown stays **plain**; \$value \&`);
    expect(result.value.source).toContain("第二行");
  });

  it("is byte-deterministic, immutable, and hashes the exact UTF-8 source", () => {
    const input = fixture();
    const before = structuredClone(input);

    const first = renderReportLatex(input);
    const second = renderReportLatex(structuredClone(input));

    expect(first).toEqual(second);
    expect(input).toEqual(before);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.sourceHash).toBe(
      `sha256:${createHash("sha256").update(first.value.source, "utf8").digest("hex")}`
    );
    expect(first.value.documentId).toBe(input.document.documentId);
    expect(first.value.documentRevision).toBe(input.document.revisionHash);
    expect(first.value.templateId).toBe("building-performance-default");
    expect(first.value.templateVersion).toBe("1.0.0");
  });

  it("propagates package/document validation issues before rendering", () => {
    const rejected: ReportValidationResult<ReportDocument> = {
      ok: false,
      issues: [{ path: "document.revisionHash", code: "revision_mismatch", message: "Document mismatch." }]
    };
    validateMock.mockReturnValueOnce(rejected);

    expect(renderReportLatex(fixture())).toEqual(rejected);
    expect(validateMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed for SVG, unsafe paths, and unresolved typed references", () => {
    const svg = fixture();
    const readyChart = svg.evidencePackage.chartResults.find((result) => result.resultId === "chart-ready");
    if (!readyChart || readyChart.status !== "ready") throw new Error("fixture chart missing");
    readyChart.artifact.mediaType = "image/svg+xml";
    readyChart.artifact.relativePath = "evidence/run/charts/temperature.svg";
    expect(renderReportLatex(svg)).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "unsupported_asset_media_type" })]
    });

    const unsafe = fixture();
    const unsafeChart = unsafe.evidencePackage.chartResults.find((result) => result.resultId === "chart-ready");
    if (!unsafeChart || unsafeChart.status !== "ready") throw new Error("fixture chart missing");
    unsafeChart.artifact.relativePath = "../escape.png";
    expect(renderReportLatex(unsafe)).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "unsafe_asset_path" })]
    });

    const unresolved = fixture();
    const section = unresolved.document.blocks.find((block) => block.kind === "section");
    if (!section || section.kind !== "section") throw new Error("fixture section missing");
    const kpi = section.blocks.find((block) => block.kind === "kpi");
    if (!kpi || kpi.kind !== "kpi") throw new Error("fixture KPI missing");
    kpi.metricResultIds = ["unknown-metric"];
    expect(renderReportLatex(unresolved)).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "unresolved_metric" })]
    });
  });

  it("deduplicates immutable artifacts while retaining repeated figure placements", () => {
    const input = fixture();
    input.document.blocks.push({
      kind: "chart",
      blockId: "block-chart-ready-again",
      chartResultId: "chart-ready",
      caption: "Repeated chart"
    });

    const result = renderReportLatex(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.assets.filter((asset) => asset.mediaType === "image/png")).toHaveLength(1);
    const png = result.value.assets.find((asset) => asset.mediaType === "image/png");
    expect(png).toBeDefined();
    expect(result.value.source.split(png?.fileName ?? "missing-asset").length - 1).toBe(2);
  });
});
