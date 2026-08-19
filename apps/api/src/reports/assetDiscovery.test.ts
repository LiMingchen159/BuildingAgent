import { describe, expect, it } from "vitest";
import {
  discoverProjectReportAssets,
  parseBrickEquipmentSnapshot,
  resolveReportAssets,
  type ReportAssetRecord,
  type ReportAssetSnapshot
} from "./assetDiscovery.js";
import {
  REPORT_SPEC_SCHEMA_VERSION,
  type EquipmentSelection,
  type ReportSpec
} from "./contracts.js";
import { DEFAULT_ANALYSIS_DEFINITION_REGISTRY } from "./analysisDefinitions.js";
import { buildReportPlan } from "./planner.js";
import { evidenceDefinitionsFixture } from "./evidenceTestFixtures.js";
import {
  BRICK_NAMESPACE,
  type EquipmentProfileRegistration
} from "./profiles.js";

const projectId = "project_element";

function record(
  equipmentId: string,
  sourceType: string,
  overrides: Partial<ReportAssetRecord> = {}
): ReportAssetRecord {
  return {
    equipmentId,
    sourceRef: `urn:test:${equipmentId}`,
    sourceTypes: [sourceType],
    ...overrides
  };
}

function snapshot(
  sourceKind: ReportAssetSnapshot["sourceKind"],
  sourceId: string,
  equipment: ReportAssetRecord[],
  sourceRevision = `sha256:${sourceId}`
): ReportAssetSnapshot {
  return { projectId, sourceKind, sourceId, sourceRevision, equipment };
}

function allEquipment(equipmentTypes: string[] = []): EquipmentSelection {
  return { mode: "all", equipmentTypes };
}

function reportSpec(equipment: EquipmentSelection): ReportSpec {
  return {
    schemaVersion: REPORT_SPEC_SCHEMA_VERSION,
    specId: "element-weekly",
    projectId,
    title: "Element Weekly Building Report",
    timeZone: "Asia/Hong_Kong",
    period: { kind: "weekly", window: "previous_complete", weekStartsOn: "monday" },
    schedule: { enabled: false },
    sections: {
      ordered: [
        { section: "executive_summary", enabled: false },
        { section: "key_findings", enabled: false },
        { section: "system_performance", enabled: false },
        { section: "selected_dashboards", enabled: false },
        { section: "fault_summary", enabled: false },
        { section: "equipment_analysis", enabled: true },
        { section: "recommended_actions", enabled: false },
        { section: "appendix", enabled: false }
      ]
    },
    kpiKeys: [],
    dashboardIds: [],
    equipment
  };
}

describe("project report asset discovery", () => {
  it("discovers the real Element equipment model with identities, profiles, and provenance", async () => {
    const result = await discoverProjectReportAssets({
      projectId,
      selection: allEquipment()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.equipment).toHaveLength(18);
    expect(result.value.equipment.filter((item) => item.equipmentType === "chiller")).toHaveLength(8);
    expect(result.value.equipment.filter((item) => item.equipmentType === "chilled_water_pump")).toHaveLength(10);
    expect(result.value.profiles.map((profile) => profile.profileId)).toEqual([
      "profile-chiller",
      "profile-chilled-water-pump"
    ]);
    expect(result.value.sources).toEqual([{
      sourceKind: "semantic_model",
      sourceId: "kb/brick_model.ttl",
      sourceRevision: "sha256:f6b7d42928ccba3944756026ecd93a0cb9da0ba07c91fff9ff4d37b383379b1a"
    }]);
    expect(result.value.assetRevision).toMatch(/^sha256:[a-f0-9]{64}$/);

    expect(result.value.equipment.find((item) => item.equipmentId === "WCC_01")).toEqual({
      equipmentId: "WCC_01",
      shortIdentifier: "WCC-01",
      equipmentType: "chiller",
      fullName: "Chiller 01",
      displayName: "WCC-01 — Chiller 01",
      nameSource: "deterministic_fallback",
      nameSourceRef: "fallback:chiller:WCC_01:short=WCC-01"
    });
    expect(result.value.assets.find((asset) => asset.equipmentId === "WCC_01")?.sources[0]).toMatchObject({
      sourceKind: "semantic_model",
      sourceId: "kb/brick_model.ttl",
      sourceRef: "urn:hensen_chiller_plant#WCC_01",
      shortIdentifier: "WCC-01",
      fullName: "WCC-01"
    });
    expect(result.value.equipment.find((item) => item.equipmentId === "CHP_1P_01")).toEqual({
      equipmentId: "CHP_1P_01",
      shortIdentifier: "CHP-1P-01",
      equipmentType: "chilled_water_pump",
      fullName: "Chilled Water Pump 01",
      displayName: "CHP-1P-01 — Chilled Water Pump 01",
      nameSource: "deterministic_fallback",
      nameSourceRef: "fallback:chilled_water_pump:CHP_1P_01:short=CHP-1P-01"
    });
    expect(result.value.assets.find((asset) => asset.equipmentId === "CHP_1P_01")?.sources[0]).toMatchObject({
      sourceRef: "urn:hensen_chiller_plant#CHP_1P_01",
      shortIdentifier: "CHP-1P-01",
      fullName: "CHP-1P-01"
    });

    const unclassified = result.value.classifications.filter((entry) => entry.status === "unclassified");
    expect(unclassified.map((entry) => entry.equipmentId)).toEqual([
      "HX_BF_Heat_Exchanger_Group",
      "SWP_01",
      "SWP_02",
      "SWP_03",
      "SWP_04",
      "SWP_05"
    ]);
    expect(unclassified.find((entry) => entry.equipmentId === "SWP_01")).toMatchObject({
      status: "unclassified",
      reason: "unsupported_type",
      sourceTypes: [{
        sourceKind: "semantic_model",
        sourceType: `${BRICK_NAMESPACE}Water_Pump`
      }]
    });
  });

  it("feeds a dynamic real-asset selection directly into the existing planner", async () => {
    const equipmentIds = [
      "WCC_04",
      "CHP_1P_06",
      "WCC_01",
      "CHP_1P_02",
      "WCC_03",
      "CHP_1P_01",
      "WCC_02",
      "CHP_1P_05",
      "CHP_1P_04",
      "CHP_1P_03"
    ];
    const selection: EquipmentSelection = { mode: "selected", equipmentIds };
    const assets = await discoverProjectReportAssets({ projectId, selection });
    expect(assets.ok).toBe(true);
    if (!assets.ok) return;

    const plan = buildReportPlan({
      planId: "plan-element-weekly",
      spec: reportSpec(selection),
      period: {
        startAt: "2026-08-09T16:00:00.000Z",
        endAt: "2026-08-16T16:00:00.000Z",
        timeZone: "Asia/Hong_Kong"
      },
      plannedAt: "2026-08-17T00:05:00.000Z",
      equipment: assets.value.equipment,
      profiles: assets.value.profiles,
      evidenceDefinitions: evidenceDefinitionsFixture(assets.value.profiles),
      analysisDefinitions: DEFAULT_ANALYSIS_DEFINITION_REGISTRY,
      assetRevision: assets.value.assetRevision,
      assetProvenance: assets.value.assetProvenance
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.equipmentGroups.map((group) => ({
      type: group.equipmentType,
      ids: group.equipment.map((item) => item.equipmentId)
    }))).toEqual([
      { type: "chiller", ids: ["WCC_01", "WCC_02", "WCC_03", "WCC_04"] },
      {
        type: "chilled_water_pump",
        ids: ["CHP_1P_01", "CHP_1P_02", "CHP_1P_03", "CHP_1P_04", "CHP_1P_05", "CHP_1P_06"]
      }
    ]);
    expect(plan.value.assetRevision).toBe(assets.value.assetRevision);
    expect(plan.value.assetProvenance).toEqual(assets.value.assetProvenance);
    expect(plan.value.assetProvenance.equipment.find((item) => item.equipmentId === "WCC_01")).toMatchObject({
      classificationRuleRefs: ["brick-water-cooled-chiller-v1"],
      sources: [expect.objectContaining({ sourceRef: "urn:hensen_chiller_plant#WCC_01" })]
    });
  });

  it("rejects unsafe project IDs and reports a missing fixed semantic model", async () => {
    const unsafe = await discoverProjectReportAssets({
      projectId: "../project_element",
      selection: allEquipment()
    });
    const missing = await discoverProjectReportAssets({
      projectId: "project_missing",
      selection: allEquipment(),
      env: { BUILDING_AGENT_DATA_DIR: "/tmp/building-agent-m008-no-such-data-root" }
    });

    expect(unsafe).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "invalid_project_id" })]
    });
    expect(missing).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "semantic_model_not_found" })]
    });
  });

  it("extends filesystem discovery from an exact custom semantic profile matcher", async () => {
    const registry: EquipmentProfileRegistration[] = [{
      profile: {
        profileId: "profile-chilled-water-system",
        version: 1,
        equipmentType: "chilled_water_system",
        groupTitle: "Chilled Water System",
        fleetMetricKeys: [],
        fleetChartKeys: [],
        metricKeys: [],
        chartKeys: [],
        analysis: { performance: false, faultDiagnosis: false },
        order: 5
      },
      matchers: [{
        ruleId: "brick-chilled-water-system-v1",
        sourceKind: "semantic_model",
        sourceType: `${BRICK_NAMESPACE}Chilled_Water_System`
      }]
    }];
    const result = await discoverProjectReportAssets({
      projectId,
      selection: { mode: "selected", equipmentIds: ["Ice_Rink_Chiller_Plant"] },
      registry
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        equipment: [expect.objectContaining({
          equipmentId: "Ice_Rink_Chiller_Plant",
          equipmentType: "chilled_water_system",
          shortIdentifier: "Ice Rink Chiller Plant",
          fullName: "Chilled Water System Ice Rink Chiller Plant",
          nameSource: "deterministic_fallback"
        })],
        classifications: expect.arrayContaining([expect.objectContaining({
          status: "matched",
          equipmentId: "Ice_Rink_Chiller_Plant",
          ruleRefs: ["brick-chilled-water-system-v1"]
        })])
      }
    });
  });
});

describe("Brick equipment snapshot parsing", () => {
  it("supports controlled Turtle prefixes, CRLF, reordered predicates, names, and unsupported types", () => {
    const turtle = [
      "@prefix site: <urn:site-a#> .",
      "@prefix b: <https://brickschema.org/schema/Brick#> .",
      "@prefix rs: <http://www.w3.org/2000/01/rdf-schema#> .",
      "",
      "site:WCC_10 rs:label \"West Wing Chiller No. 10\" ;",
      "    a b:Water_Cooled_Chiller .",
      "",
      "site:AHU_02 a b:Air_Handler_Unit ;",
      "    rs:label \"AHU-02\" ."
    ].join("\r\n");
    const parsed = parseBrickEquipmentSnapshot({ projectId, sourceId: "fixture.ttl", turtle });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.equipment).toEqual([
      {
        equipmentId: "AHU_02",
        sourceRef: "urn:site-a#AHU_02",
        sourceTypes: [`${BRICK_NAMESPACE}Air_Handler_Unit`],
        shortIdentifier: "AHU-02",
        fullName: "AHU-02"
      },
      {
        equipmentId: "WCC_10",
        sourceRef: "urn:site-a#WCC_10",
        sourceTypes: [`${BRICK_NAMESPACE}Water_Cooled_Chiller`],
        fullName: "West Wing Chiller No. 10"
      }
    ]);

    const resolved = resolveReportAssets({
      projectId,
      selection: allEquipment(),
      snapshots: [parsed.value]
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.equipment).toEqual([
      expect.objectContaining({
        equipmentId: "WCC_10",
        shortIdentifier: "WCC_10",
        fullName: "West Wing Chiller No. 10",
        nameSource: "semantic_model",
        nameSourceRef: "urn:site-a#WCC_10"
      })
    ]);
    expect(resolved.value.classifications).toContainEqual(expect.objectContaining({
      status: "unclassified",
      equipmentId: "AHU_02",
      reason: "unsupported_type"
    }));
  });

  it("reports unsupported label literals instead of partially inventing a name", () => {
    const parsed = parseBrickEquipmentSnapshot({
      projectId,
      sourceId: "invalid.ttl",
      turtle: [
        "@prefix site: <urn:site#> .",
        "@prefix brick: <https://brickschema.org/schema/Brick#> .",
        "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .",
        "",
        "site:CH_01 a brick:Chiller ;",
        "    rdfs:label \"bad\\qname\" ."
      ].join("\n")
    });

    expect(parsed).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "invalid_literal", path: "turtle.CH_01.label" })]
    });
  });

  it("allows missing labels and RDFS declarations so code can apply the documented fallback", () => {
    const parsed = parseBrickEquipmentSnapshot({
      projectId,
      sourceId: "no-label.ttl",
      turtle: [
        "@prefix site: <urn:site#> .",
        "@prefix brick: <https://brickschema.org/schema/Brick#> .",
        "",
        "site:CH_12 a brick:Chiller ."
      ].join("\n")
    });
    expect(parsed).toMatchObject({
      ok: true,
      value: {
        equipment: [{
          equipmentId: "CH_12",
          sourceRef: "urn:site#CH_12",
          sourceTypes: [`${BRICK_NAMESPACE}Chiller`]
        }]
      }
    });
    if (!parsed.ok) return;

    const resolved = resolveReportAssets({
      projectId,
      selection: allEquipment(),
      snapshots: [parsed.value]
    });
    expect(resolved).toMatchObject({
      ok: true,
      value: {
        equipment: [expect.objectContaining({
          equipmentId: "CH_12",
          shortIdentifier: "CH_12",
          fullName: "Chiller 12",
          nameSource: "deterministic_fallback"
        })]
      }
    });
  });

  it("merges split statements and retains one short label plus one descriptive Unicode label", () => {
    const turtle = [
      "@prefix site: <urn:site#> .",
      "@prefix brick: <https://brickschema.org/schema/Brick#> .",
      "@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .",
      "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .",
      "",
      "site:CH_11 rdf:type brick:Chiller, brick:Water_Cooled_Chiller .",
      "",
      "site:CH_11 rdfs:label \"CH-11\", \"西翼冷水机 11\"@zh ."
    ].join("\n");
    const parsed = parseBrickEquipmentSnapshot({ projectId, sourceId: "labels.ttl", turtle });
    expect(parsed).toMatchObject({
      ok: true,
      value: {
        equipment: [{
          equipmentId: "CH_11",
          sourceRef: "urn:site#CH_11",
          sourceTypes: [`${BRICK_NAMESPACE}Chiller`, `${BRICK_NAMESPACE}Water_Cooled_Chiller`],
          shortIdentifier: "CH-11",
          fullName: "西翼冷水机 11"
        }]
      }
    });
    if (!parsed.ok) return;
    const resolved = resolveReportAssets({ projectId, selection: allEquipment(), snapshots: [parsed.value] });
    expect(resolved).toMatchObject({
      ok: true,
      value: {
        equipment: [expect.objectContaining({
          shortIdentifier: "CH-11",
          fullName: "西翼冷水机 11",
          displayName: "CH-11 — 西翼冷水机 11",
          nameSource: "semantic_model"
        })]
      }
    });
  });

  it("fails closed for conflicting semantic names and unsupported statement shapes", () => {
    const conflicting = parseBrickEquipmentSnapshot({
      projectId,
      sourceId: "conflict.ttl",
      turtle: [
        "@prefix site: <urn:site#> .",
        "@prefix brick: <https://brickschema.org/schema/Brick#> .",
        "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .",
        "",
        "site:CH_01 a brick:Chiller ;",
        "    rdfs:label \"East Plant Chiller\", \"West Plant Chiller\" ."
      ].join("\n")
    });
    const malformed = parseBrickEquipmentSnapshot({
      projectId,
      sourceId: "malformed.ttl",
      turtle: [
        "@prefix site: <urn:site#> .",
        "@prefix brick: <https://brickschema.org/schema/Brick#> .",
        "",
        "site:CH_01 a brick:Chiller"
      ].join("\n")
    });
    const malformedSegments = [
      "site:CH_01 a brick:Chiller ; rdfs:label \"East Chiller\" garbage .",
      "site:CH_01 a brick:Chiller ; rdfs:label \"East Chiller\"@ .",
      "site:CH_01 a brick:Chiller ; rdfs:label \"East Chiller\", \"broken .",
      "site:CH_01 a brick:Chiller garbage ."
    ].map((statement, index) => parseBrickEquipmentSnapshot({
      projectId,
      sourceId: `malformed-segment-${index}.ttl`,
      turtle: [
        "@prefix site: <urn:site#> .",
        "@prefix brick: <https://brickschema.org/schema/Brick#> .",
        "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .",
        "",
        statement
      ].join("\n")
    }));

    expect(conflicting).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "conflicting_equipment_name" })]
    });
    expect(malformed).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "unsupported_turtle_shape" })])
    });
    for (const result of malformedSegments) {
      expect(result.ok).toBe(false);
    }
  });

  it("rejects colliding local equipment IDs from different semantic namespaces", () => {
    const parsed = parseBrickEquipmentSnapshot({
      projectId,
      sourceId: "namespaces.ttl",
      turtle: [
        "@prefix east: <urn:east#> .",
        "@prefix west: <urn:west#> .",
        "@prefix brick: <https://brickschema.org/schema/Brick#> .",
        "",
        "east:CH_01 a brick:Chiller .",
        "",
        "west:CH_01 a brick:Chiller ."
      ].join("\n")
    });

    expect(parsed).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "ambiguous_equipment_id", path: "turtle.CH_01" })]
    });
  });
});

describe("deterministic report asset resolution", () => {
  it("uses semantic, project, BMS, then fallback name precedence without accepting code-only labels", () => {
    const semantic = snapshot("semantic_model", "model.ttl", [record(
      "CH_01",
      `${BRICK_NAMESPACE}Water_Cooled_Chiller`,
      {
        sourceRef: "urn:site#CH_01",
        shortIdentifier: "CH-01",
        fullName: "CH-01"
      }
    )]);
    const project = snapshot("project_metadata", "assets.json", [record("CH_01", "chiller", {
      sourceRef: "assets.json#CH_01",
      fullName: "Main Plant Chiller No. 1"
    })]);
    const bms = snapshot("bms_metadata", "bms-source", [record("CH_01", "chiller", {
      sourceRef: "bms-source#CH_01",
      fullName: "BMS Chiller One"
    })]);

    const projectName = resolveReportAssets({
      projectId,
      selection: allEquipment(),
      snapshots: [bms, project, semantic]
    });
    expect(projectName.ok).toBe(true);
    if (!projectName.ok) return;
    expect(projectName.value.equipment[0]).toMatchObject({
      equipmentId: "CH_01",
      shortIdentifier: "CH-01",
      fullName: "Main Plant Chiller No. 1",
      displayName: "CH-01 — Main Plant Chiller No. 1",
      nameSource: "project_metadata",
      nameSourceRef: "assets.json#CH_01"
    });

    const semanticName = resolveReportAssets({
      projectId,
      selection: allEquipment(),
      snapshots: [{
        ...semantic,
        equipment: [{ ...semantic.equipment[0]!, fullName: "West Wing Chiller No. 1" }]
      }, project, bms]
    });
    expect(semanticName).toMatchObject({
      ok: true,
      value: {
        equipment: [expect.objectContaining({
          fullName: "West Wing Chiller No. 1",
          nameSource: "semantic_model",
          nameSourceRef: "urn:site#CH_01"
        })]
      }
    });

    const fallback = resolveReportAssets({
      projectId,
      selection: allEquipment(),
      snapshots: [semantic]
    });
    expect(fallback).toMatchObject({
      ok: true,
      value: {
        equipment: [expect.objectContaining({
          fullName: "Chiller 01",
          nameSource: "deterministic_fallback",
          nameSourceRef: "fallback:chiller:CH_01:short=CH-01"
        })]
      }
    });

    const sourceLocalCode = resolveReportAssets({
      projectId,
      selection: allEquipment(),
      snapshots: [semantic, snapshot("project_metadata", "coded-assets.json", [record("CH_01", "chiller", {
        shortIdentifier: "PLANT-01",
        fullName: "PLANT-01"
      })])]
    });
    expect(sourceLocalCode).toMatchObject({
      ok: true,
      value: {
        equipment: [expect.objectContaining({
          fullName: "Chiller 01",
          nameSource: "deterministic_fallback"
        })]
      }
    });

    const bmsName = resolveReportAssets({
      projectId,
      selection: allEquipment(),
      snapshots: [bms]
    });
    expect(bmsName).toMatchObject({
      ok: true,
      value: {
        equipment: [expect.objectContaining({
          fullName: "BMS Chiller One",
          nameSource: "bms_metadata",
          nameSourceRef: "bms-source#CH_01"
        })]
      }
    });
  });

  it("naturally orders selections, applies exact type filters, and reports missing IDs and types", () => {
    const assets = snapshot("project_metadata", "assets.json", [
      record("CH_10", "chiller", { fullName: "Chiller Ten" }),
      record("CH_2", "chiller", { fullName: "Chiller Two" }),
      record("CH_1", "chiller", { fullName: "Chiller One" })
    ]);
    const selected = resolveReportAssets({
      projectId,
      selection: { mode: "selected", equipmentIds: ["CH_10", "CH_1", "CH_2"] },
      snapshots: [assets]
    });
    const typeFiltered = resolveReportAssets({
      projectId,
      selection: allEquipment(["chiller"]),
      snapshots: [assets]
    });
    const missing = resolveReportAssets({
      projectId,
      selection: { mode: "selected", equipmentIds: ["CH_99"] },
      snapshots: [assets]
    });
    const missingType = resolveReportAssets({
      projectId,
      selection: allEquipment(["boiler"]),
      snapshots: [assets]
    });

    expect(selected).toMatchObject({
      ok: true,
      value: { equipment: [{ equipmentId: "CH_1" }, { equipmentId: "CH_2" }, { equipmentId: "CH_10" }] }
    });
    expect(typeFiltered).toMatchObject({ ok: true, value: { equipment: expect.any(Array) } });
    if (typeFiltered.ok) expect(typeFiltered.value.equipment).toHaveLength(3);
    expect(missing).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "equipment_not_found" })]
    });
    expect(missingType).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "equipment_type_not_found" })]
    });
  });

  it("keeps unknown equipment explicit and rejects it when explicitly selected", () => {
    const assets = snapshot("semantic_model", "model.ttl", [
      record("SWP_01", `${BRICK_NAMESPACE}Water_Pump`, { shortIdentifier: "SWP-01" })
    ]);
    const all = resolveReportAssets({ projectId, selection: allEquipment(), snapshots: [assets] });
    const selected = resolveReportAssets({
      projectId,
      selection: { mode: "selected", equipmentIds: ["SWP_01"] },
      snapshots: [assets]
    });

    expect(all).toMatchObject({
      ok: true,
      value: {
        equipment: [],
        profiles: [],
        classifications: [expect.objectContaining({
          status: "unclassified",
          equipmentId: "SWP_01",
          reason: "unsupported_type"
        })]
      }
    });
    expect(selected).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "equipment_unclassified" })]
    });
  });

  it("fails closed for LLM sources, same-tier name conflicts, duplicate assets, and missing sources", () => {
    const invalidSource = resolveReportAssets({
      projectId,
      selection: allEquipment(),
      snapshots: [{
        ...snapshot("semantic_model", "model.ttl", []),
        sourceKind: "llm"
      } as never]
    });
    const conflicts = resolveReportAssets({
      projectId,
      selection: allEquipment(),
      snapshots: [
        snapshot("semantic_model", "model-a.ttl", [record(
          "CH_01",
          `${BRICK_NAMESPACE}Water_Cooled_Chiller`,
          { fullName: "East Plant Chiller" }
        )]),
        snapshot("semantic_model", "model-b.ttl", [record(
          "CH_01",
          `${BRICK_NAMESPACE}Water_Cooled_Chiller`,
          { fullName: "West Plant Chiller" }
        )])
      ]
    });
    const duplicateRecord = record("CH_01", "chiller");
    const duplicate = resolveReportAssets({
      projectId,
      selection: allEquipment(),
      snapshots: [snapshot("project_metadata", "assets.json", [duplicateRecord, duplicateRecord])]
    });
    const empty = resolveReportAssets({ projectId, selection: allEquipment(), snapshots: [] });
    const invalidSelection = resolveReportAssets({
      projectId,
      selection: { mode: "llm" } as never,
      snapshots: [snapshot("project_metadata", "assets.json", [])]
    });

    expect(invalidSource).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "invalid_source_kind" })]
    });
    expect(conflicts).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "conflicting_equipment_name" })]
    });
    expect(duplicate).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "duplicate_equipment" })]
    });
    expect(empty).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "asset_source_required" })]
    });
    expect(invalidSelection).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "invalid_value", path: "selection.mode" })]
    });
  });

  it("derives a stable revision from normalized content rather than caller ordering", () => {
    const first = snapshot("project_metadata", "assets.json", [
      record("CH_02", "chiller", { fullName: "Chiller Two" }),
      record("CH_01", "chiller", { fullName: "Chiller One" })
    ]);
    const second = snapshot("bms_metadata", "bms", [
      record("CH_01", "chiller", { fullName: "BMS Chiller One" })
    ]);
    const ordered = resolveReportAssets({
      projectId,
      selection: allEquipment(),
      snapshots: [first, second]
    });
    const reordered = resolveReportAssets({
      projectId,
      selection: allEquipment(),
      snapshots: [second, { ...first, equipment: [...first.equipment].reverse() }]
    });
    const changed = resolveReportAssets({
      projectId,
      selection: allEquipment(),
      snapshots: [{
        ...first,
        equipment: first.equipment.map((item) => item.equipmentId === "CH_01"
          ? { ...item, fullName: "Renamed Chiller One" }
          : item)
      }, second]
    });

    expect(ordered.ok && reordered.ok && changed.ok).toBe(true);
    if (!ordered.ok || !reordered.ok || !changed.ok) return;
    expect(reordered.value.assetRevision).toBe(ordered.value.assetRevision);
    expect(changed.value.assetRevision).not.toBe(ordered.value.assetRevision);
    expect(Object.isFrozen(ordered.value.profiles[0])).toBe(true);
    expect(Object.isFrozen(ordered.value.profiles[0]?.metricKeys)).toBe(true);
  });
});
