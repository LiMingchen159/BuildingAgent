import { describe, expect, it } from "vitest";
import {
  REPORT_SPEC_SCHEMA_VERSION,
  createEquipmentIdentity,
  type EquipmentIdentity,
  type EquipmentProfile,
  type ReportSpec
} from "./contracts.js";
import { buildReportPlan } from "./planner.js";

const profiles: EquipmentProfile[] = [
  {
    profileId: "profile-chiller",
    version: 1,
    equipmentType: "chiller",
    groupTitle: "Chiller Performance",
    fleetMetricKeys: ["cooling_energy", "electricity", "average_cop", "average_plr"],
    fleetChartKeys: ["fleet_cop_comparison", "fleet_load_comparison"],
    metricKeys: ["runtime", "cooling_energy", "electricity", "average_cop", "average_plr", "starts"],
    chartKeys: ["cooling_load_and_power", "cop_trend", "plr_trend", "temperature_trend"],
    analysis: { performance: true, faultDiagnosis: true },
    order: 10
  },
  {
    profileId: "profile-chilled-water-pump",
    version: 1,
    equipmentType: "chilled_water_pump",
    groupTitle: "Pump Performance",
    fleetMetricKeys: ["runtime", "electricity", "average_power"],
    fleetChartKeys: ["fleet_power_comparison"],
    metricKeys: ["runtime", "electricity", "average_power", "average_speed", "flow", "differential_pressure"],
    chartKeys: ["power_trend", "speed_trend", "flow_trend", "differential_pressure_trend"],
    analysis: { performance: true, faultDiagnosis: true },
    order: 20
  }
];

function identity(equipmentId: string, equipmentType: string, fullName: string): EquipmentIdentity {
  const result = createEquipmentIdentity({
    equipmentId,
    equipmentType,
    fullName,
    nameSource: "project_metadata",
    nameSourceRef: `project-assets.json#${equipmentId}`
  });
  if (!result.ok) throw new Error(`Invalid fixture: ${equipmentId}`);
  return result.value;
}

function reportSpec(equipment: ReportSpec["equipment"] = { mode: "all", equipmentTypes: [] }): ReportSpec {
  return {
    schemaVersion: REPORT_SPEC_SCHEMA_VERSION,
    specId: "weekly-building-a",
    projectId: "project_element",
    title: "Building A Weekly Performance Report",
    timeZone: "Asia/Hong_Kong",
    period: { kind: "weekly", window: "previous_complete", weekStartsOn: "monday" },
    schedule: { enabled: true, frequency: "weekly", weekday: "monday", time: "08:00" },
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
    equipment
  };
}

function plan(equipment: EquipmentIdentity[], spec = reportSpec(), profileSet = profiles) {
  return buildReportPlan({
    planId: "plan-2026-w23",
    spec,
    period: {
      startAt: "2026-05-31T16:00:00.000Z",
      endAt: "2026-06-07T16:00:00.000Z",
      timeZone: "Asia/Hong_Kong"
    },
    plannedAt: "2026-06-08T00:05:00.000Z",
    assetRevision: "brick-model-sha256",
    equipment,
    profiles: profileSet,
    resolvedSystemCharts: [
      { chartKey: "cooling_demand", metricKeys: ["cooling_energy"] },
      { chartKey: "energy_consumption", metricKeys: ["electricity"] },
      { chartKey: "system_efficiency", metricKeys: ["plant_cop"] },
      { chartKey: "plant_efficiency", metricKeys: ["kw_per_rt"] }
    ]
  });
}

describe("buildReportPlan", () => {
  it("groups and orders the four-chiller/six-pump case without hard-coded counts", () => {
    const equipment = [
      ...Array.from({ length: 6 }, (_, index) => identity(
        `CHWP-${String(index + 1).padStart(2, "0")}`,
        "chilled_water_pump",
        `Chilled Water Pump ${String(index + 1).padStart(2, "0")}`
      )),
      ...Array.from({ length: 4 }, (_, index) => identity(
        `CH-${String(index + 1).padStart(2, "0")}`,
        "chiller",
        index === 0 ? "Main Plant Chiller No. 1" : `Chiller ${String(index + 1).padStart(2, "0")}`
      ))
    ].reverse();

    const result = plan(equipment);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.equipmentGroups.map((group) => ({
      type: group.equipmentType,
      ids: group.equipment.map((item) => item.equipmentId)
    }))).toEqual([
      { type: "chiller", ids: ["CH-01", "CH-02", "CH-03", "CH-04"] },
      { type: "chilled_water_pump", ids: ["CHWP-01", "CHWP-02", "CHWP-03", "CHWP-04", "CHWP-05", "CHWP-06"] }
    ]);
    expect(result.value.equipment.find((item) => item.equipmentId === "CH-01")).toMatchObject({
      fullName: "Main Plant Chiller No. 1",
      displayName: "CH-01 — Main Plant Chiller No. 1"
    });
    expect(result.value.sections).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "equipment_group", equipmentType: "chiller" }),
      expect.objectContaining({ kind: "equipment_group", equipmentType: "chilled_water_pump" })
    ]));
    expect(result.value.evidence.metrics).toHaveLength(4 + 4 + 3 + (4 * 6) + (6 * 6));
    expect(result.value.evidence.charts).toHaveLength(4 + 2 + 2 + 1 + (4 * 4) + (6 * 4));
    expect(result.value.evidence.faults).toHaveLength(10);
    expect(result.value.evidence.dashboards.map((request) => request.dashboardId)).toEqual([
      "plant_overview",
      "energy_dashboard"
    ]);
    expect(result.value.analysis.requests).toHaveLength(36);
    expect(result.value.analysis.requests.every((request) => request.evidenceRequestIds.length > 0)).toBe(true);
    expect(result.value.analysis.requests).toContainEqual(expect.objectContaining({
      analysisKind: "fault_summary",
      scope: { kind: "system" }
    }));
    expect(result.value.analysis.requests).toContainEqual(expect.objectContaining({
      analysisKind: "fault_diagnosis",
      condition: "when_fault_detected"
    }));
    expect(result.value.analysis.requests).toContainEqual(expect.objectContaining({
      analysisKind: "recommendations",
      scope: { kind: "equipment", equipmentId: "CH-01", equipmentType: "chiller" },
      condition: "when_actionable_evidence"
    }));
    expect(result.value.evidence.charts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        origin: "system_kpi",
        chartKey: "system_efficiency",
        inputMetricRequestIds: [expect.stringContaining("metric:")]
      }),
      expect.objectContaining({ origin: "fault_summary", chartKey: "fault_distribution" }),
      expect.objectContaining({ origin: "fault_summary", chartKey: "fault_timeline" })
    ]));
    const faultRequestIds = result.value.evidence.faults.map((request) => request.requestId);
    expect(result.value.evidence.charts).toContainEqual(expect.objectContaining({
      origin: "fault_summary",
      inputFaultRequestIds: faultRequestIds
    }));
  });

  it("remains additive for a future equipment type and different asset counts", () => {
    const ahuProfile: EquipmentProfile = {
      profileId: "profile-ahu",
      version: 1,
      equipmentType: "ahu",
      groupTitle: "AHU Performance",
      fleetMetricKeys: ["runtime"],
      fleetChartKeys: ["fleet_temperature_comparison"],
      metricKeys: ["runtime", "supply_air_temperature"],
      chartKeys: ["temperature_trend"],
      analysis: { performance: true, faultDiagnosis: false },
      order: 30
    };
    const equipment = [
      identity("CH-01", "chiller", "Chiller 01"),
      identity("CHWP-01", "chilled_water_pump", "Chilled Water Pump 01"),
      identity("AHU-01", "ahu", "Lobby Air Handling Unit")
    ];

    const result = plan(equipment, reportSpec(), [...profiles, ahuProfile]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.equipmentGroups.map((group) => group.equipmentType)).toEqual([
      "chiller",
      "chilled_water_pump",
      "ahu"
    ]);
    expect(result.value.sections).toContainEqual(expect.objectContaining({
      kind: "equipment_group",
      equipmentType: "ahu",
      equipmentIds: ["AHU-01"]
    }));
  });

  it("honors explicit equipment selection and section order", () => {
    const spec = reportSpec({ mode: "selected", equipmentIds: ["CHWP-02", "CH-01"] });
    spec.sections.ordered = [
      { section: "system_performance", enabled: true },
      { section: "equipment_analysis", enabled: true },
      { section: "fault_summary", enabled: true },
      { section: "executive_summary", enabled: true },
      { section: "key_findings", enabled: true },
      { section: "selected_dashboards", enabled: true },
      { section: "recommended_actions", enabled: true },
      { section: "appendix", enabled: true }
    ];
    const result = plan([
      identity("CH-01", "chiller", "Chiller 01"),
      identity("CH-02", "chiller", "Chiller 02"),
      identity("CHWP-02", "chilled_water_pump", "Chilled Water Pump 02")
    ], spec);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.equipment.map((item) => item.equipmentId)).toEqual(["CH-01", "CHWP-02"]);
    expect(result.value.sections.slice(0, 5)).toEqual([
      { kind: "cover" },
      { kind: "report_information" },
      { kind: "standard", section: "system_performance" },
      expect.objectContaining({ kind: "equipment_group", equipmentType: "chiller" }),
      expect.objectContaining({ kind: "equipment_group", equipmentType: "chilled_water_pump" })
    ]);
  });

  it("rejects missing assets, noncanonical names, and period mismatches", () => {
    const invalidName = {
      ...identity("CH-01", "chiller", "Chiller 01"),
      displayName: "Invented Chiller Name"
    };
    const result = buildReportPlan({
      planId: "plan-invalid",
      spec: reportSpec({ mode: "selected", equipmentIds: ["CH-01", "CHWP-99"] }),
      period: {
        startAt: "2026-06-08T00:00:00.000Z",
        endAt: "2026-06-01T00:00:00.000Z",
        timeZone: "UTC"
      },
      plannedAt: "not-a-date",
      assetRevision: "brick-model-sha256",
      equipment: [invalidName, identity("AHU-01", "ahu", "Air Handling Unit 01")],
      profiles
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "invalid_datetime",
      "invalid_range",
      "timezone_mismatch",
      "noncanonical_name",
      "equipment_not_found"
    ]));
  });

  it("requires a profile for every selected equipment type when equipment analysis is enabled", () => {
    const result = plan([
      identity("CH-01", "chiller", "Chiller 01"),
      identity("AHU-01", "ahu", "Air Handling Unit 01")
    ]);

    expect(result).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "profile_not_found" })])
    });
  });

  it("rejects a manually altered deterministic fallback name", () => {
    const fallbackResult = createEquipmentIdentity({
      equipmentId: "CH-01",
      equipmentType: "chiller",
      nameSource: "deterministic_fallback"
    });
    if (!fallbackResult.ok) throw new Error("fixture equipment must be valid");
    const alteredFallback: EquipmentIdentity = {
      ...fallbackResult.value,
      fullName: "LLM Invented Chiller",
      displayName: "CH-01 — LLM Invented Chiller"
    };

    const result = plan([alteredFallback]);

    expect(result).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: "equipment[0].fullName", code: "invalid_fallback_name" })
      ])
    });
  });

  it("plans deterministic fault detection independently from optional diagnosis", () => {
    const spec = reportSpec();
    spec.sections.ordered = spec.sections.ordered.map((selection) => (
      selection.section === "fault_summary"
        ? { ...selection, enabled: false }
        : selection
    ));
    const noDiagnosisProfile: EquipmentProfile = {
      ...profiles[0]!,
      analysis: { performance: true, faultDiagnosis: false }
    };

    const result = plan(
      [identity("CH-01", "chiller", "Chiller 01")],
      spec,
      [noDiagnosisProfile]
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.evidence.faults).toEqual([
      expect.objectContaining({ equipmentId: "CH-01" })
    ]);
    expect(result.value.analysis.requests).not.toContainEqual(
      expect.objectContaining({ analysisKind: "fault_diagnosis" })
    );
  });

  it("keeps fault-summary interpretation at system scope when equipment pages are disabled", () => {
    const spec = reportSpec();
    spec.sections.ordered = spec.sections.ordered.map((selection) => ({
      ...selection,
      enabled: selection.section === "fault_summary"
    }));
    spec.kpiKeys = [];
    spec.dashboardIds = [];

    const result = plan([identity("CH-01", "chiller", "Chiller 01")], spec);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.analysis.requests).toEqual([
      expect.objectContaining({ analysisKind: "fault_summary", scope: { kind: "system" } })
    ]);
    expect(result.value.analysis.requests).not.toContainEqual(
      expect.objectContaining({ analysisKind: "fault_diagnosis" })
    );
  });

  it("uses an exact tie-breaker when natural equipment IDs compare equally", () => {
    const first = plan([
      identity("CH-1", "chiller", "Chiller 1"),
      identity("CH-01", "chiller", "Chiller 01")
    ]);
    const second = plan([
      identity("CH-01", "chiller", "Chiller 01"),
      identity("CH-1", "chiller", "Chiller 1")
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.equipment.map((item) => item.equipmentId)).toEqual(["CH-01", "CH-1"]);
    expect(second.value.equipment.map((item) => item.equipmentId)).toEqual(["CH-01", "CH-1"]);
  });

  it("keeps encoded evidence request IDs unique for delimiter-bearing IDs and keys", () => {
    const collisionProfile: EquipmentProfile = {
      ...profiles[0]!,
      fleetMetricKeys: [],
      fleetChartKeys: [],
      metricKeys: ["c", "b:c", "\ud800"],
      chartKeys: []
    };
    const result = plan([
      identity("a:b", "chiller", "Chiller A-B"),
      identity("a", "chiller", "Chiller A"),
      identity("\ud800", "chiller", "Unicode Edge Chiller")
    ], reportSpec(), [collisionProfile]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const requestIds = [
      ...result.value.evidence.metrics,
      ...result.value.evidence.charts,
      ...result.value.evidence.dashboards,
      ...result.value.evidence.faults
    ].map((request) => request.requestId);
    expect(new Set(requestIds).size).toBe(requestIds.length);
  });

  it("rejects impossible resolved and planning calendar dates", () => {
    const result = buildReportPlan({
      planId: "plan-invalid-calendar",
      spec: reportSpec(),
      period: {
        startAt: "2026-02-30T00:00:00.000Z",
        endAt: "2026-03-08T00:00:00.000Z",
        timeZone: "Asia/Hong_Kong"
      },
      plannedAt: "2026-02-30T08:00:00.000Z",
      assetRevision: "brick-model-sha256",
      equipment: [identity("CH-01", "chiller", "Chiller 01")],
      profiles
    });

    expect(result).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: "period.startAt", code: "invalid_datetime" }),
        expect.objectContaining({ path: "plannedAt", code: "invalid_datetime" })
      ])
    });
  });

  it("plans a system-only report without requiring discovered equipment", () => {
    const spec = reportSpec({ mode: "selected", equipmentIds: [] });
    spec.dashboardIds = [];
    spec.sections.ordered = spec.sections.ordered.map((selection) => ({
      ...selection,
      enabled: selection.section === "executive_summary"
        || selection.section === "system_performance"
    }));

    const result = plan([], spec, []);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.equipment).toEqual([]);
    expect(result.value.equipmentGroups).toEqual([]);
    expect(result.value.evidence.metrics).toHaveLength(4);
    expect(result.value.evidence.charts).toHaveLength(4);
    expect(result.value.analysis.requests).toEqual([
      expect.objectContaining({
        analysisKind: "executive_summary",
        evidenceRequestIds: expect.arrayContaining([
          expect.stringContaining("metric:"),
          expect.stringContaining("chart:")
        ])
      })
    ]);
  });

  it("rejects an unconditional analysis section with no deterministic evidence", () => {
    const spec = reportSpec({ mode: "selected", equipmentIds: [] });
    spec.kpiKeys = [];
    spec.dashboardIds = [];
    spec.sections.ordered = spec.sections.ordered.map((selection) => ({
      ...selection,
      enabled: selection.section === "executive_summary"
    }));

    const result = plan([], spec, []);

    expect(result).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "analysis_without_evidence" })
      ])
    });
  });
});
