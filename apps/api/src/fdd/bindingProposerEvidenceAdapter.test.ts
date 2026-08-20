import { describe, expect, it } from "vitest";
import { planFleetGuard, type FddAlgorithmRequirement, type LegacyV4FleetCandidateEvidence } from "@building-agent/fdd-deployment-planner";
import { buildFleetGuardShadowInputFromV4Evidence } from "./bindingProposerEvidenceAdapter.js";

const algorithm: FddAlgorithmRequirement = {
  id: "algorithm_record_id",
  version: "v13",
  equipmentType: "chiller",
  requiredPoints: [
    {
      slot: "chiller_power",
      label: "Chiller power",
      semantic: "instantaneous power",
      required: true,
      quantityKind: "power",
      unitRoleDescription: "real power",
      acceptableUnits: ["kW"],
      historyRequirement: { minDays: 7, preferredDays: 30 }
    }
  ]
};

function candidate(entity: string, slot = "chiller_power"): LegacyV4FleetCandidateEvidence {
  return {
    canonicalEntityKey: entity,
    pointFamilyKey: "tlkw",
    candidate: {
      slot,
      pointName: `${entity}_TLKW`,
      entityKey: entity,
      objectRef: `//Elements/${entity}_TLKW`,
      unit: "kW",
      unitCompatibility: "match",
      dimensionReason: "catalog inference",
      confidence: 0.9,
      reason: "legacy heuristic",
      historyDays: 30
    }
  };
}

function adapterInput(overrides: Partial<Parameters<typeof buildFleetGuardShadowInputFromV4Evidence>[0]> = {}) {
  return {
    projectId: "project_element",
    algorithm,
    evaluatorId: "chiller_ch_01_commanded_fails_to_start",
    evaluatorAvailable: true,
    targetAvailability: {
      equipmentType: "chiller" as const,
      status: "available" as const,
      entityCount: 8,
      entityKeys: Array.from({ length: 8 }, (_unused, index) => `WCC_${index + 1}`)
    },
    authoritativeInventory: true,
    targetEntityKeys: Array.from({ length: 8 }, (_unused, index) => `WCC_${index + 1}`),
    candidates: Array.from({ length: 7 }, (_unused, index) => candidate(`WCC_${index + 1}`)),
    brickPoints: Array.from({ length: 7 }, (_unused, index) => ({
      subjectKey: `WCC_${index + 1}__power`,
      pointName: `WCC_${index + 1}_TLKW`,
      entityKey: `WCC_${index + 1}`,
      brickClass: "Electric_Power_Sensor",
      unit: "kW",
      matchedRoleSlots: ["chiller_power"]
    })),
    sourceDataSignature: "project-data-v1",
    inventorySignature: "inventory-v1",
    ...overrides
  };
}

describe("v4 evidence to FleetGuard shadow projection", () => {
  it("keeps the complete authoritative 8-member fleet and marks missing catalog evidence unknown", () => {
    const projected = buildFleetGuardShadowInputFromV4Evidence(adapterInput());

    expect(projected.inventory).toMatchObject({ status: "present", members: expect.any(Array) });
    expect(projected.inventory.members).toHaveLength(8);
    expect(projected.lookups.find((lookup) => lookup.entityKey === "WCC_8" && lookup.familyKey === "tlkw"))
      .toEqual({ entityKey: "WCC_8", familyKey: "tlkw", status: "unknown", observations: [] });
    expect(projected.roleFamilies).toEqual([{
      role: "chiller_power",
      familyKey: "tlkw",
      status: "unknown",
      source: "legacy_v4_proposal"
    }]);
    expect(planFleetGuard(projected)).toMatchObject({ state: "blocked", coverage: { authorized: 0 } });
  });

  it("never upgrades a non-authoritative available hint into present inventory", () => {
    const projected = buildFleetGuardShadowInputFromV4Evidence(adapterInput({ authoritativeInventory: false }));
    expect(projected.inventory.status).toBe("unknown");
  });

  it("uses the real evaluator registry key while leaving its unavailable version fail-closed", () => {
    const projected = buildFleetGuardShadowInputFromV4Evidence(adapterInput());
    expect(projected.algorithm.id).toBe("algorithm_record_id");
    expect(projected.evaluator).toEqual({
      id: "chiller-commanded-fails-to-start",
      requiredVersion: "ch01-command-state-v1",
      registeredVersion: "ch01-command-state-v1",
      status: "available"
    });
    expect(planFleetGuard(projected).primaryBlocker?.code).toBe("role_family_missing");
  });

  it("emits one exact lookup per entity and family even when two roles propose the same family", () => {
    const duplicateRoleAlgorithm: FddAlgorithmRequirement = {
      ...algorithm,
      requiredPoints: [
        ...algorithm.requiredPoints,
        { ...algorithm.requiredPoints[0]!, slot: "chiller_running_power", label: "Running power" }
      ]
    };
    const projected = buildFleetGuardShadowInputFromV4Evidence(adapterInput({
      algorithm: duplicateRoleAlgorithm,
      targetEntityKeys: ["WCC_1"],
      targetAvailability: { equipmentType: "chiller", status: "available", entityCount: 1, entityKeys: ["WCC_1"] },
      candidates: [candidate("WCC_1"), candidate("WCC_1", "chiller_running_power")],
      brickPoints: [{
        subjectKey: "WCC_1__power",
        pointName: "WCC_1_TLKW",
        entityKey: "WCC_1",
        brickClass: "Electric_Power_Sensor",
        unit: "kW",
        matchedRoleSlots: ["chiller_power", "chiller_running_power"]
      }]
    }));

    expect(projected.lookups).toHaveLength(1);
    expect(projected.lookups[0]).toMatchObject({ entityKey: "WCC_1", familyKey: "tlkw", status: "found" });
    expect(projected.lookups[0]!.observations[0]).toMatchObject({
      pointId: "WCC_1__power",
      ownership: { status: "verified", isPointOf: true },
      quantity: { status: "verified", kind: "power" },
      unit: { status: "match", unit: "kW" },
      history: { status: "sufficient", observedDays: 7 }
    });
  });

  it("uses 7-of-8 structural consensus for one Brick metadata outlier and emits only a warning", () => {
    const candidates = Array.from({ length: 8 }, (_unused, index) => candidate(`WCC_${index + 1}`));
    const brickPoints = Array.from({ length: 8 }, (_unused, index) => ({
      subjectKey: `WCC_${index + 1}__power`,
      pointName: `WCC_${index + 1}_TLKW`,
      entityKey: `WCC_${index + 1}`,
      brickClass: index === 7 ? "Point_With_Wrong_Metadata" : "Electric_Power_Sensor",
      unit: "kW",
      matchedRoleSlots: index === 7 ? [] : ["chiller_power"]
    }));
    const projected = buildFleetGuardShadowInputFromV4Evidence(adapterInput({ candidates, brickPoints }));
    projected.roleFamilies.push({
      role: "chiller_power",
      familyKey: "tlkw",
      status: "verified",
      source: "locked_template",
      templateVersion: "template@2"
    });
    projected.signatures.template = "template-signature";

    const plan = planFleetGuard(projected);
    expect(plan).toMatchObject({
      state: "ready",
      coverage: { expected: 8, bound: 8, dataReady: 8, authorized: 8 }
    });
    expect(plan.warnings).toEqual([expect.objectContaining({
      code: "brick_class_mismatch",
      entityKey: "WCC_8",
      role: "chiller_power"
    })]);
  });

  it("does not use peer consensus to invent the outlier's missing local quantity evidence", () => {
    const candidates = Array.from({ length: 8 }, (_unused, index) => {
      const entry = candidate(`WCC_${index + 1}`);
      if (index === 7) entry.candidate.unitCompatibility = "unknown";
      return entry;
    });
    const brickPoints = Array.from({ length: 8 }, (_unused, index) => ({
      subjectKey: `WCC_${index + 1}__power`,
      pointName: `WCC_${index + 1}_TLKW`,
      entityKey: `WCC_${index + 1}`,
      brickClass: index === 7 ? "Point_With_Wrong_Metadata" : "Electric_Power_Sensor",
      unit: "kW",
      matchedRoleSlots: index === 7 ? [] : ["chiller_power"]
    }));
    const projected = buildFleetGuardShadowInputFromV4Evidence(adapterInput({ candidates, brickPoints }));
    projected.roleFamilies.push({
      role: "chiller_power",
      familyKey: "tlkw",
      status: "verified",
      source: "locked_template",
      templateVersion: "template@2"
    });
    projected.signatures.template = "template-signature";

    expect(planFleetGuard(projected)).toMatchObject({
      state: "blocked",
      primaryBlocker: { code: "quantity_unknown", entityKey: "WCC_8", role: "chiller_power" },
      coverage: { authorized: 0 }
    });
  });

  it("keeps a real outlier unit conflict blocked even when seven peers agree", () => {
    const candidates = Array.from({ length: 8 }, (_unused, index) => {
      const entry = candidate(`WCC_${index + 1}`);
      if (index === 7) {
        entry.candidate.unit = "C";
        entry.candidate.unitEvidenceSource = "catalog";
      }
      return entry;
    });
    const brickPoints = Array.from({ length: 8 }, (_unused, index) => ({
      subjectKey: `WCC_${index + 1}__power`,
      pointName: `WCC_${index + 1}_TLKW`,
      entityKey: `WCC_${index + 1}`,
      brickClass: index === 7 ? "Point_With_Wrong_Metadata" : "Electric_Power_Sensor",
      unit: index === 7 ? "C" : "kW",
      matchedRoleSlots: index === 7 ? [] : ["chiller_power"]
    }));
    const projected = buildFleetGuardShadowInputFromV4Evidence(adapterInput({ candidates, brickPoints }));
    projected.roleFamilies.push({
      role: "chiller_power",
      familyKey: "tlkw",
      status: "verified",
      source: "locked_template",
      templateVersion: "template@2"
    });
    projected.signatures.template = "template-signature";

    expect(planFleetGuard(projected)).toMatchObject({
      state: "blocked",
      primaryBlocker: { code: "unit_mismatch", entityKey: "WCC_8", role: "chiller_power" },
      coverage: { authorized: 0 }
    });
  });
});
