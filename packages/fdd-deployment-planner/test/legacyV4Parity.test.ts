import { describe, expect, it } from "vitest";
import {
  FDD_DEPLOYABILITY_POLICY_VERSION,
  alignLegacyV4CandidatesToExampleEntity,
  applyLegacyV4FleetPlanToDecision,
  evaluateLegacyV4Deployability,
  legacyV4DecisionHasFleetCoverage,
  planLegacyV4HomogeneousFleet,
  type FddAlgorithmRequirement,
  type FddPointCandidate,
  type FddPointMapping,
  type LegacyV4FleetCandidateEvidence
} from "../src/index.js";

const algorithm: FddAlgorithmRequirement = {
  id: "fddalg_ch01",
  version: "v13",
  equipmentType: "chiller",
  requiredPoints: [
    {
      slot: "command",
      label: "Chiller command",
      semantic: "Start stop command",
      required: true,
      quantityKind: "status",
      unitRoleDescription: "Binary command",
      keywords: ["Start_Stop"],
      historyRequirement: { minDays: 7, preferredDays: 30 }
    },
    {
      slot: "status",
      label: "Chiller status",
      semantic: "Running status",
      required: true,
      quantityKind: "status",
      unitRoleDescription: "Binary run status",
      keywords: ["Run_Status"],
      historyRequirement: { minDays: 7, preferredDays: 30 }
    },
    {
      slot: "power",
      label: "Chiller power",
      semantic: "Instantaneous electric power",
      required: true,
      quantityKind: "power",
      unitRoleDescription: "Real power",
      acceptableUnits: ["kW"],
      keywords: ["TLKW"],
      historyRequirement: { minDays: 7, preferredDays: 30 }
    }
  ]
};

function candidate(
  entityKey: string,
  slot: string,
  suffix: string,
  objectRef: string,
  confidence: number,
  unit?: string
): FddPointCandidate {
  return {
    slot,
    pointName: `${entityKey}-${suffix}`,
    entityKey,
    objectRef,
    ...(unit ? { unit } : {}),
    unitCompatibility: "match",
    dimensionReason: `Verified ${slot} dimension.`,
    confidence,
    reason: `Exact ${slot} family match.`,
    historyDays: 30
  };
}

const wcc1Candidates = [
  candidate("WCC-1", "command", "Start_Stop", "WCC-1.1", 0.875),
  candidate("WCC-1", "status", "Run_Status", "WCC-1.2", 0.875),
  candidate("WCC-1", "power", "TLKW", "WCC-1.3", 0.875, "kW")
];
const wcc2Candidates = [
  candidate("WCC-2", "command", "Start_Stop", "WCC-2.1", 0.75),
  candidate("WCC-2", "status", "Run_Status", "WCC-2.2", 0.75),
  candidate("WCC-2", "power", "TLKW", "WCC-2.3", 0.75, "kW")
];

function evidenceFor(
  candidateValue: FddPointCandidate,
  canonicalEntityKey = candidateValue.entityKey ?? ""
): LegacyV4FleetCandidateEvidence {
  const suffix = candidateValue.pointName.split("-").slice(2).join("-");
  return {
    candidate: candidateValue,
    canonicalEntityKey,
    pointFamilyKey: suffix.toLowerCase()
  };
}

function mappingsFor(candidates: FddPointCandidate[]): FddPointMapping[] {
  return candidates.map((entry) => ({
    slot: entry.slot,
    pointName: entry.pointName,
    ...(entry.objectRef ? { objectRef: entry.objectRef } : {}),
    ...(entry.unit ? { unit: entry.unit } : {})
  }));
}

describe("legacy v4 parity", () => {
  it("freezes every persisted ready-decision field and normalizes mixed-case fleet keys", () => {
    const fleetEvidence = [
      ...wcc2Candidates.map((entry) => evidenceFor(entry, "wcc-2")),
      ...wcc1Candidates.map((entry) => evidenceFor(entry))
    ];
    const plan = planLegacyV4HomogeneousFleet({
      algorithm,
      candidates: fleetEvidence,
      targetEntityKeys: ["WCC-2", "WCC-1"],
      homogeneousTemplateEligible: true
    });
    const aligned = alignLegacyV4CandidatesToExampleEntity({
      algorithm,
      candidates: fleetEvidence,
      preferredEntityKey: plan.templateEntityKey,
      preferredMappings: plan.entities.find((entity) => entity.entityKey === plan.templateEntityKey)?.selectedMappings
    });
    const rejected: FddPointCandidate = {
      ...candidate("WCC-1", "power", "TLKWH", "WCC-1.99", 0.99, "kWh"),
      unitCompatibility: "mismatch",
      rejectionReason: "Energy is not instantaneous power."
    };
    const baseDecision = evaluateLegacyV4Deployability({
      algorithm,
      projectId: "project_element",
      projectTaskId: "fddtask_ch01",
      source: "manual",
      projectDataSignature: "project-signature-v4",
      applicability: "applicable",
      equipmentAvailability: {
        equipmentType: "chiller",
        status: "available",
        entityCount: 2,
        entityKeys: ["WCC-1", "WCC-2"],
        evidenceSources: ["brick_model.ttl"]
      },
      equipmentInventorySignature: "inventory-signature-v4",
      pointCandidates: aligned.candidates,
      exampleEntityKey: aligned.exampleEntityKey,
      rejectedCandidates: [rejected],
      deployableEntities: plan.entities,
      checkedAt: "2026-08-20T00:00:00.000Z"
    });
    const decision = applyLegacyV4FleetPlanToDecision({
      decision: baseDecision,
      plan,
      expectedEntityCount: 2,
      requiredRuntimeSlots: ["command", "status", "power"]
    });

    expect(decision).toEqual({
      algorithmId: "fddalg_ch01",
      projectTaskId: "fddtask_ch01",
      algorithmVersion: "v13",
      checkPolicyVersion: FDD_DEPLOYABILITY_POLICY_VERSION,
      projectId: "project_element",
      status: "can_deploy",
      applicability: "applicable",
      equipmentAvailability: {
        equipmentType: "chiller",
        status: "available",
        entityCount: 2,
        entityKeys: ["WCC-1", "WCC-2"],
        evidenceSources: ["brick_model.ttl"]
      },
      equipmentInventorySignature: "inventory-signature-v4",
      pointCandidates: wcc1Candidates,
      exampleEntityKey: "WCC-1",
      selectedMappings: mappingsFor(wcc1Candidates),
      deployableEntities: [
        {
          entityKey: "WCC-1",
          status: "can_deploy",
          selectedMappings: mappingsFor(wcc1Candidates),
          ambiguousInputs: [],
          missingPoints: [],
          historyIssues: [],
          confidence: 0.875
        },
        {
          entityKey: "WCC-2",
          status: "can_deploy",
          selectedMappings: mappingsFor(wcc2Candidates),
          ambiguousInputs: [],
          missingPoints: [],
          historyIssues: [],
          confidence: 0.75
        }
      ],
      ambiguousInputs: [],
      rejectedCandidates: [rejected],
      missingPoints: [],
      historyIssues: [],
      checkedAt: "2026-08-20T00:00:00.000Z",
      source: "manual",
      projectDataSignature: "project-signature-v4",
      mappingStrategy: "homogeneous_template",
      expectedEntityCount: 2,
      requiredRuntimeSlots: ["command", "status", "power"],
      templateEntityKey: "WCC-1"
    });
    expect(JSON.parse(JSON.stringify(decision))).toEqual(decision);
    for (let iteration = 0; iteration < 20; iteration += 1) {
      expect(planLegacyV4HomogeneousFleet({
        algorithm,
        candidates: fleetEvidence,
        targetEntityKeys: ["WCC-2", "WCC-1"],
        homogeneousTemplateEligible: true
      })).toEqual(plan);
    }
    expect(legacyV4DecisionHasFleetCoverage({
      decision,
      algorithmRequiredSlots: ["command", "status", "power"],
      expectedCanonicalEntityKeys: ["WCC-1", "WCC-2"]
    })).toBe(true);

    const forgedReadyOutsideDecision = {
      ...decision.deployableEntities![0]!,
      entityKey: "WCC-2"
    };
    const blockedDecision = {
      ...decision,
      deployableEntities: [
        decision.deployableEntities![0]!,
        { ...forgedReadyOutsideDecision, status: "cannot_deploy" as const }
      ]
    };
    expect(legacyV4DecisionHasFleetCoverage({
      decision: blockedDecision,
      algorithmRequiredSlots: ["command", "status", "power"],
      expectedCanonicalEntityKeys: ["WCC-1", "WCC-2"]
    })).toBe(false);

    const recalculatedWithoutTemplate = applyLegacyV4FleetPlanToDecision({
      decision,
      plan: {
        entities: plan.entities,
        mappingStrategy: "entity_independent"
      },
      expectedEntityCount: 2,
      requiredRuntimeSlots: ["command", "status", "power"]
    });
    expect(recalculatedWithoutTemplate.mappingStrategy).toBe("entity_independent");
    expect(recalculatedWithoutTemplate).not.toHaveProperty("templateEntityKey");
  });

  it("preserves ambiguity, rejection, missing-input, and history blockers", () => {
    const uncertainCommand = {
      ...wcc1Candidates[0]!,
      unitCompatibility: "unknown" as const,
      historyDays: undefined
    };
    const alternativeCommand = {
      ...uncertainCommand,
      pointName: "WCC-1-Enable_Command",
      objectRef: "WCC-1.4",
      confidence: 0.86
    };
    const rejected = {
      ...wcc1Candidates[2]!,
      unitCompatibility: "mismatch" as const,
      rejectionReason: "Unit mismatch."
    };
    const decision = evaluateLegacyV4Deployability({
      algorithm,
      projectId: "project_element",
      source: "auto",
      projectDataSignature: "sig-blocked",
      pointCandidates: [uncertainCommand, alternativeCommand],
      rejectedCandidates: [rejected],
      checkedAt: "2026-08-20T00:00:00.000Z"
    });

    expect(decision.status).toBe("cannot_deploy");
    expect(decision.ambiguousInputs).toEqual([{
      slot: "command",
      label: "Chiller command",
      candidates: [uncertainCommand]
    }]);
    expect(decision.rejectedCandidates).toEqual([rejected]);
    expect(decision.missingPoints).toEqual(["Chiller status", "Chiller power"]);
    expect(decision.historyIssues).toEqual(["Chiller command history coverage is unverified; requires 7d."]);
  });
});
