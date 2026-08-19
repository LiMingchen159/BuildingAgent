import { describe, expect, it } from "vitest";
import {
  ANALYSIS_PACKAGE_SCHEMA_VERSION,
  ANALYSIS_TOOL_DRAFT_SCHEMA_VERSION,
  ANALYSIS_TOOL_INPUT_SCHEMA_VERSION,
  EVIDENCE_PACKAGE_SCHEMA_VERSION,
  REPORT_DOCUMENT_SCHEMA_VERSION,
  REPORT_PLAN_SCHEMA_VERSION,
  REPORT_SPEC_SCHEMA_VERSION,
  createEquipmentIdentity,
  parseReportSpec,
  type AnalysisResult,
  type AnalysisPackage,
  type AnalysisToolDraft,
  type AnalysisToolInput,
  type ChartResult,
  type EvidencePackage,
  type EvidenceReference,
  type FaultEvent,
  type MetricResult,
  type ReportBlock,
  type ReportSectionConfig,
  type ResolvedReportPeriod
} from "./contracts.js";

const allSections: ReportSectionConfig = {
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
};

function weeklySpec(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: REPORT_SPEC_SCHEMA_VERSION,
    specId: " weekly-building-a ",
    projectId: " project_element ",
    title: " Building A Weekly Performance Report ",
    timeZone: "Asia/Hong_Kong",
    period: { kind: "weekly", window: "previous_complete", weekStartsOn: "monday" },
    schedule: { enabled: true, frequency: "weekly", weekday: "monday", time: "08:00" },
    sections: allSections,
    kpiKeys: [" cooling_energy ", "electricity", "plant_cop", "kw_per_rt"],
    dashboardIds: [" plant_overview ", "energy_dashboard"],
    equipment: { mode: "selected", equipmentIds: [" CH-01 ", "CHWP-01"] },
    ...overrides
  };
}

describe("ReportSpec contracts", () => {
  it("parses and normalizes a weekly scheduled report", () => {
    const parsed = parseReportSpec(weeklySpec());

    expect(parsed).toEqual({
      ok: true,
      value: expect.objectContaining({
        specId: "weekly-building-a",
        projectId: "project_element",
        title: "Building A Weekly Performance Report",
        kpiKeys: ["cooling_energy", "electricity", "plant_cop", "kw_per_rt"],
        dashboardIds: ["plant_overview", "energy_dashboard"],
        equipment: { mode: "selected", equipmentIds: ["CH-01", "CHWP-01"] }
      })
    });
  });

  it("supports monthly schedules and fixed custom one-off periods", () => {
    const monthly = parseReportSpec(weeklySpec({
      period: { kind: "monthly", window: "previous_complete" },
      schedule: { enabled: true, frequency: "monthly", dayOfMonth: 31, time: "08:30" }
    }));
    expect(monthly).toMatchObject({
      ok: true,
      value: {
        schedule: {
          enabled: true,
          frequency: "monthly",
          dayOfMonth: 31,
          shortMonthPolicy: "last_day"
        }
      }
    });

    const custom = parseReportSpec(weeklySpec({
      period: {
        kind: "custom",
        startAt: "2026-06-01T00:00:00.000Z",
        endAt: "2026-07-01T00:00:00.000Z"
      },
      schedule: { enabled: false }
    }));
    expect(custom).toMatchObject({ ok: true, value: { period: { kind: "custom" } } });
  });

  it("reports multiple path-aware validation issues", () => {
    const parsed = parseReportSpec(weeklySpec({
      timeZone: "Moon/Sea_of_Tranquility",
      schedule: { enabled: true, frequency: "monthly", dayOfMonth: 40, time: "25:70" },
      kpiKeys: ["plant_cop", "plant_cop"],
      sections: {
        ordered: [
          { section: "executive_summary", enabled: true },
          { section: "executive_summary", enabled: true },
          { section: "system_performance", enabled: true },
          { section: "selected_dashboards", enabled: true },
          { section: "fault_summary", enabled: true },
          { section: "equipment_analysis", enabled: true },
          { section: "recommended_actions", enabled: true },
          { section: "appendix", enabled: true }
        ]
      }
    }));

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "invalid_timezone",
      "invalid_time",
      "invalid_value",
      "duplicate",
      "missing_section"
    ]));
    expect(parsed.issues).toContainEqual(expect.objectContaining({ path: "timeZone" }));
    expect(parsed.issues).toContainEqual(expect.objectContaining({ path: "kpiKeys[1]" }));
  });

  it("rejects recurring schedules for fixed custom ranges", () => {
    const parsed = parseReportSpec(weeklySpec({
      period: {
        kind: "custom",
        startAt: "2026-06-01T00:00:00.000Z",
        endAt: "2026-06-08T00:00:00.000Z"
      }
    }));

    expect(parsed).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "incompatible", path: "schedule.enabled" })])
    });
  });

  it("rejects impossible calendar dates instead of accepting Date.parse normalization", () => {
    const parsed = parseReportSpec(weeklySpec({
      period: {
        kind: "custom",
        startAt: "2026-02-30T00:00:00.000Z",
        endAt: "2026-03-03T00:00:00.000Z"
      },
      schedule: { enabled: false }
    }));

    expect(parsed).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: "period.startAt", code: "invalid_datetime" })
      ])
    });
  });

  it("allows an empty explicit equipment selection for a system-only report", () => {
    const systemOnlySections: ReportSectionConfig = {
      ordered: allSections.ordered.map((selection) => ({
        ...selection,
        enabled: selection.section === "system_performance"
      }))
    };
    const parsed = parseReportSpec(weeklySpec({
      sections: systemOnlySections,
      dashboardIds: [],
      equipment: { mode: "selected", equipmentIds: [] }
    }));

    expect(parsed).toMatchObject({
      ok: true,
      value: { equipment: { mode: "selected", equipmentIds: [] } }
    });
  });

  it("requires KPI keys when system performance is enabled", () => {
    const parsed = parseReportSpec(weeklySpec({ kpiKeys: [] }));

    expect(parsed).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: "kpiKeys", code: "required" })
      ])
    });
  });
});

describe("equipment naming contracts", () => {
  it("retains the identifier and authoritative full name in a code-derived display name", () => {
    const chiller = createEquipmentIdentity({
      equipmentId: " CH-01 ",
      equipmentType: "chiller",
      fullName: " Main Plant Chiller No. 1 ",
      nameSource: "semantic_model",
      nameSourceRef: "urn:brick:Main_Plant_Chiller_1"
    });
    const pump = createEquipmentIdentity({
      equipmentId: "CHWP-01",
      equipmentType: "chilled_water_pump",
      nameSource: "deterministic_fallback"
    });

    expect(chiller).toEqual({
      ok: true,
      value: {
        equipmentId: "CH-01",
        shortIdentifier: "CH-01",
        equipmentType: "chiller",
        fullName: "Main Plant Chiller No. 1",
        displayName: "CH-01 — Main Plant Chiller No. 1",
        nameSource: "semantic_model",
        nameSourceRef: "urn:brick:Main_Plant_Chiller_1"
      }
    });
    expect(pump).toMatchObject({
      ok: true,
      value: {
        shortIdentifier: "CHWP-01",
        displayName: "CHWP-01 — Chilled Water Pump 01"
      }
    });
  });

  it("keeps a semantic join key separate from the human-facing short identifier", () => {
    const result = createEquipmentIdentity({
      equipmentId: "WCC_01",
      shortIdentifier: "WCC-01",
      equipmentType: "chiller",
      nameSource: "deterministic_fallback"
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        equipmentId: "WCC_01",
        shortIdentifier: "WCC-01",
        fullName: "Chiller 01",
        displayName: "WCC-01 — Chiller 01",
        nameSourceRef: "fallback:chiller:WCC_01:short=WCC-01"
      }
    });
  });

  it("rejects identifier-only metadata names while retaining descriptive Unicode names", () => {
    const codeOnly = createEquipmentIdentity({
      equipmentId: "CH_01",
      shortIdentifier: "CH-01",
      equipmentType: "chiller",
      fullName: "CH-01",
      nameSource: "semantic_model",
      nameSourceRef: "urn:site#CH_01"
    });
    const chinese = createEquipmentIdentity({
      equipmentId: "CH_01",
      shortIdentifier: "冷机-01",
      equipmentType: "chiller",
      fullName: "西翼冷水机 01",
      nameSource: "project_metadata",
      nameSourceRef: "assets.json#CH_01"
    });

    expect(codeOnly).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ path: "fullName", code: "identifier_only_name" })]
    });
    expect(chinese).toMatchObject({
      ok: true,
      value: {
        shortIdentifier: "冷机-01",
        fullName: "西翼冷水机 01",
        displayName: "冷机-01 — 西翼冷水机 01"
      }
    });
  });

  it("does not admit an LLM as an equipment-name source", () => {
    const result = createEquipmentIdentity({
      equipmentId: "AHU-01",
      equipmentType: "ahu",
      fullName: "Air Handling Unit 01",
      nameSource: "llm",
      nameSourceRef: "model-output"
    } as never);

    expect(result).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ path: "nameSource", code: "invalid_value" })]
    });
  });
});

describe("evidence and renderer-neutral contracts", () => {
  it("keeps facts, detected faults, analysis, and blocks linked by typed references", () => {
    const period: ResolvedReportPeriod = {
      startAt: "2026-06-01T00:00:00.000Z",
      endAt: "2026-06-08T00:00:00.000Z",
      timeZone: "Asia/Hong_Kong"
    };
    const evidence: EvidenceReference = {
      evidenceId: "ev-cop-01",
      sourceKind: "derived_metric",
      sourceId: "plant_cop:CH-01"
    };
    const equipmentScope = {
      kind: "equipment" as const,
      equipmentId: "CH-01",
      equipmentType: "chiller"
    };
    const equipmentResult = createEquipmentIdentity({
      equipmentId: "CH-01",
      equipmentType: "chiller",
      fullName: "Chiller 01",
      nameSource: "project_metadata",
      nameSourceRef: "project-assets.json#CH-01"
    });
    if (!equipmentResult.ok) throw new Error("fixture equipment must be valid");

    const metric: MetricResult = {
      status: "available",
      resultId: "metric-cop-01",
      metricKey: "plant_cop",
      label: "Average COP",
      unit: "COP",
      scope: equipmentScope,
      period,
      evidence: [evidence],
      value: 5.12,
      aggregation: "average",
      sampleCount: 672,
      coverage: 1
    };
    const chart: ChartResult = {
      status: "no_data",
      resultId: "chart-cop-01",
      chartKey: "cop_trend",
      title: "CH-01 — Chiller 01 COP Trend",
      scope: equipmentScope,
      period,
      evidence: [evidence],
      reason: "No samples in the selected period."
    };
    const fault: FaultEvent = {
      status: "active",
      eventId: "fault-low-cop-01",
      equipment: equipmentResult.value,
      faultCode: "LOW_COP",
      severity: "high",
      startedAt: "2026-06-07T12:00:00.000Z",
      observedThrough: "2026-06-08T00:00:00.000Z",
      durationHours: 12,
      detectorId: "fdd-low-cop",
      detectorVersion: "1",
      evidence: [{ ...evidence, sourceKind: "fdd_rule", sourceId: "fdd-low-cop" }]
    };
    const evidencePackage: EvidencePackage = {
      schemaVersion: EVIDENCE_PACKAGE_SCHEMA_VERSION,
      packageId: "evidence-equipment-ch-01",
      planId: "plan-week-23",
      planRevision: "sha256:plan-fixture",
      projectId: "project_element",
      assetRevision: "sha256:asset-fixture",
      equipment: [equipmentResult.value],
      period,
      generatedAt: "2026-06-08T00:05:00.000Z",
      revisionHash: "sha256:fixture",
      executions: [
        {
          requestId: "request-metric-cop-01",
          requestKind: "metric",
          status: "complete",
          resultIds: [metric.resultId],
          evidence: [evidence],
          provenance: {
            producerKind: "derived_metric",
            producerId: "fixture-metric-tool",
            producerVersion: "1",
            definition: { definitionId: "metric:plant_cop", definitionVersion: "1" },
            queryHash: "sha256:metric-query",
            inputEvidenceIds: []
          }
        },
        {
          requestId: "request-chart-cop-01",
          requestKind: "chart",
          status: "no_data",
          resultIds: [chart.resultId],
          reasonCode: "no_samples",
          message: "No samples in the selected period.",
          evidence: [evidence],
          provenance: {
            producerKind: "plot_tool",
            producerId: "fixture-plot-tool",
            producerVersion: "1",
            definition: { definitionId: "chart:cop_trend", definitionVersion: "1" },
            queryHash: "sha256:chart-query",
            inputEvidenceIds: [evidence.evidenceId]
          }
        },
        {
          requestId: "request-fault-ch-01",
          requestKind: "fault",
          status: "complete",
          resultIds: [fault.eventId],
          evidence: fault.evidence,
          provenance: {
            producerKind: "fdd_rule",
            producerId: "fixture-fdd-tool",
            producerVersion: "1",
            definition: { definitionId: "fdd:chiller", definitionVersion: "1" },
            queryHash: "sha256:fault-query",
            inputEvidenceIds: []
          }
        }
      ],
      metricResults: [metric],
      chartResults: [chart],
      dashboardResults: [],
      faultEvents: [fault],
      dataQuality: []
    };
    const analysis: AnalysisResult = {
      status: "complete",
      analysisId: "analysis-ch-01",
      requestId: "analysis:equipment_performance:CH-01",
      analysisKind: "equipment_performance",
      scope: equipmentScope,
      evidencePackageId: evidencePackage.packageId,
      generatedAt: "2026-06-08T00:06:00.000Z",
      provenance: {
        producerKind: "b_agent",
        producerId: "report-analysis-executor",
        producerVersion: "1",
        definition: {
          definitionId: "analysis:equipment_performance:equipment",
          definitionVersion: "1"
        },
        evidencePackageRevision: evidencePackage.revisionHash,
        inputEvidenceRequestIds: ["request-metric-cop-01"],
        inputResultIds: [metric.resultId],
        model: {
          adapterId: "chat-provider-report-analysis",
          adapterVersion: "1",
          providerId: "fixture-provider",
          modelId: "fixture-model",
          requestAlias: "REQ_A",
          inputHash: "sha256:analysis-input",
          promptVersion: "grounded-report-analysis-v1",
          promptHash: "sha256:analysis-prompt",
          responseHash: "sha256:analysis-response"
        }
      },
      evidenceIds: [evidence.evidenceId],
      segments: [
        { kind: "equipment_ref", equipmentId: "CH-01" },
        { kind: "text", text: "operated with an average COP of", evidenceIds: [evidence.evidenceId] },
        { kind: "metric_ref", metricResultId: metric.resultId }
      ]
    };
    const block: ReportBlock = {
      kind: "section",
      blockId: "section-ch-01",
      title: equipmentResult.value.displayName,
      level: 2,
      numbering: "numbered",
      blocks: [
        { kind: "kpi", blockId: "kpi-ch-01", title: "Performance KPIs", metricResultIds: [metric.resultId] },
        { kind: "analysis", blockId: "analysis-block-ch-01", title: "Performance Analysis", analysisResultId: analysis.analysisId }
      ]
    };

    expect(evidencePackage.faultEvents[0]).not.toHaveProperty("diagnosis");
    expect(EVIDENCE_PACKAGE_SCHEMA_VERSION).toBe(3);
    expect(REPORT_PLAN_SCHEMA_VERSION).toBe(4);
    expect(REPORT_DOCUMENT_SCHEMA_VERSION).toBe(1);
    expect(analysis.status).toBe("complete");
    if (analysis.status === "complete") {
      expect(analysis.segments).toContainEqual({ kind: "metric_ref", metricResultId: "metric-cop-01" });
    }
    expect(block).toMatchObject({ kind: "section", title: "CH-01 — Chiller 01" });
  });

  it("keeps v1 model I/O alias-only and represents a skipped planned request explicitly", () => {
    const input: AnalysisToolInput = {
      schemaVersion: ANALYSIS_TOOL_INPUT_SCHEMA_VERSION,
      requestAlias: "REQ_A",
      analysisKind: "equipment_performance",
      scope: { kind: "equipment", equipmentAlias: "EQ_A", equipmentType: "chiller" },
      definition: {
        definitionId: "analysis:equipment_performance:equipment",
        definitionVersion: "1"
      },
      period: {
        startAt: "2026-05-31T16:00:00.000Z",
        endAt: "2026-06-07T16:00:00.000Z",
        timeZone: "Asia/Hong_Kong"
      },
      allowedCitationAliases: ["EV_A"],
      equipment: [{ equipmentAlias: "EQ_A", equipmentType: "chiller" }],
      metrics: [{
        metricAlias: "MET_A",
        metricKey: "plant_cop",
        scope: { kind: "equipment", equipmentAlias: "EQ_A", equipmentType: "chiller" },
        unit: "1",
        aggregation: "average",
        value: 5.25,
        sampleCount: 672,
        coverage: 1,
        evidenceAliases: ["EV_A"]
      }],
      charts: [],
      dashboards: [],
      faults: [],
      dataQuality: []
    };
    const draft: AnalysisToolDraft = {
      schemaVersion: ANALYSIS_TOOL_DRAFT_SCHEMA_VERSION,
      requestAlias: "REQ_A",
      status: "complete",
      segments: [
        { kind: "equipment_ref", equipmentAlias: "EQ_A" },
        { kind: "text", text: "Performance remained stable.", citationAliases: ["EV_A"] },
        { kind: "metric_ref", metricAlias: "MET_A" }
      ]
    };
    const analysisPackage: AnalysisPackage = {
      schemaVersion: ANALYSIS_PACKAGE_SCHEMA_VERSION,
      packageId: "analysis-package-week-23",
      planId: "plan-week-23",
      planRevision: "sha256:plan-fixture",
      projectId: "project_element",
      assetRevision: "sha256:asset-fixture",
      period: input.period,
      evidencePackageId: "evidence-week-23",
      evidencePackageRevision: "sha256:evidence-fixture",
      definitionsRevision: "sha256:analysis-definitions",
      generatedAt: "2026-06-08T00:06:00.000Z",
      revisionHash: "sha256:analysis-package",
      results: [{
        status: "skipped",
        analysisId: "analysis-fault-diagnosis-ch-01",
        requestId: "analysis:fault_diagnosis:CH-01",
        analysisKind: "fault_diagnosis",
        scope: { kind: "equipment", equipmentId: "CH-01", equipmentType: "chiller" },
        evidencePackageId: "evidence-week-23",
        generatedAt: "2026-06-08T00:06:00.000Z",
        reasonCode: "no_fault_detected",
        message: "No detected fault requires diagnosis.",
        provenance: {
          producerKind: "b_agent",
          producerId: "report-analysis-executor",
          producerVersion: "1",
          definition: {
            definitionId: "analysis:fault_diagnosis:equipment",
            definitionVersion: "1"
          },
          evidencePackageRevision: "sha256:evidence-fixture",
          inputEvidenceRequestIds: ["fault:CH-01"],
          inputResultIds: [],
          model: null
        }
      }]
    };

    expect(JSON.stringify(input)).not.toContain("CH-01");
    expect(JSON.stringify(input)).not.toContain("Chiller 01");
    expect(draft.status).toBe("complete");
    expect(analysisPackage.results).toHaveLength(1);
    expect(analysisPackage.results[0]?.status).toBe("skipped");
  });
});
