import { describe, expect, it } from "vitest";
import type {
  FddDeployabilityCheck,
  FddEquipmentAvailability,
  FddFleetGuardCheckSummary
} from "./api";
import { normalizeFddDeploymentEvidence } from "./fddDeploymentPresentation";

const entityKeys = Array.from({ length: 8 }, (_, index) => `WCC_${index + 1}`);
const availability: FddEquipmentAvailability = {
  equipmentType: "chiller",
  status: "available",
  entityCount: 8,
  entityKeys
};
const templateRef = { templateId: "template_ch01", version: 3, signature: "template-signature" };
const signatures = {
  algorithm: "algorithm-signature",
  evaluator: "evaluator-signature",
  inventory: "inventory-signature",
  evidence: "evidence-signature",
  template: templateRef.signature
};

function fleetGuard(state: "ready" | "blocked" = "ready", taskId?: string): FddFleetGuardCheckSummary {
  const authorization = state === "ready" ? {
    policyVersion: "fleetguard-v1" as const,
    planId: "plan-1",
    planSignature: "plan-signature",
    rolloutRevision: 2,
    parameterSignature: "parameter-signature",
    ...(taskId ? { taskId } : {}),
    templateRef,
    signatures
  } : undefined;
  return {
    kind: "fleetguard_v1",
    policyVersion: "fleetguard-v1",
    state,
    planId: "plan-1",
    planSignature: "plan-signature",
    rolloutRevision: 2,
    templateRef,
    parameterSignature: "parameter-signature",
    ...(taskId ? { taskId } : {}),
    signatures,
    coverage: state === "ready"
      ? { expected: 8, bound: 8, dataReady: 8, authorized: 8 }
      : { expected: 8, bound: 7, dataReady: 7, authorized: 0 },
    ...(state === "blocked" ? {
      primaryBlocker: { code: "point_missing", entityKey: "WCC_8", role: "power", reason: "Exact running power point is missing." }
    } : {}),
    warnings: [],
    ...(authorization ? { authorization } : {}),
    checkedAt: "2026-08-20T00:00:00.000Z"
  };
}

function check(status: "can_deploy" | "uncertain" = "can_deploy", summary?: FddFleetGuardCheckSummary): FddDeployabilityCheck {
  return {
    algorithmId: "algorithm-1",
    algorithmVersion: "1.0.0",
    checkPolicyVersion: "v4-homogeneous-fleet",
    projectId: "project_element",
    status,
    applicability: "applicable",
    equipmentAvailability: availability,
    equipmentInventorySignature: "inventory-signature",
    expectedEntityCount: 8,
    pointCandidates: [],
    deployableEntities: [],
    ambiguousInputs: [],
    rejectedCandidates: [],
    missingPoints: [],
    historyIssues: [],
    checkedAt: "2026-08-20T00:00:00.000Z",
    source: "auto",
    projectDataSignature: "project-signature",
    ...(summary ? { fleetGuard: summary } : {})
  };
}

const readyLegacyCoverage = {
  inventoryEntityKeys: entityKeys,
  deployableEntityKeys: entityKeys,
  inventoryCount: 8,
  boundCount: 8,
  deployableCount: 8,
  hasFullDeployableCoverage: true
};

describe("FDD deployment evidence presentation", () => {
  it("keeps v4 Ready and counts only distinct deployed entities from the authoritative fleet", () => {
    const result = normalizeFddDeploymentEvidence({
      check: check(),
      equipmentAvailability: availability,
      legacyCoverage: readyLegacyCoverage,
      deployedEntityIds: ["WCC_1", "WCC_1", "WCC_2", "OTHER"],
      runtimeImplemented: true,
      fleetGuardSelected: false
    });

    expect(result).toMatchObject({
      policy: "v4",
      stateLabel: "Ready",
      boundCount: 8,
      dataReadyCount: 8,
      deployedCount: 2,
      canDeploy: true
    });
  });

  it("uses a current FleetGuard Ready summary even when the legacy decision is uncertain", () => {
    const result = normalizeFddDeploymentEvidence({
      check: check("uncertain", fleetGuard()),
      equipmentAvailability: availability,
      legacyCoverage: { ...readyLegacyCoverage, deployableCount: 0, hasFullDeployableCoverage: false },
      runtimeImplemented: true,
      fleetGuardSelected: true,
      fleetGuardRolloutRevision: 2,
      fleetGuardTemplateRequired: true,
      fleetGuardTemplateRef: templateRef
    });

    expect(result).toMatchObject({
      policy: "fleetguard-v1",
      stateLabel: "Ready",
      boundCount: 8,
      dataReadyCount: 8,
      deployedCount: 0,
      canDeploy: true
    });
    expect(result.authorization).toEqual(fleetGuard().authorization);
  });

  it("never falls back to v4 when FleetGuard is blocked", () => {
    const result = normalizeFddDeploymentEvidence({
      check: check("can_deploy", fleetGuard("blocked")),
      equipmentAvailability: availability,
      legacyCoverage: readyLegacyCoverage,
      runtimeImplemented: true,
      fleetGuardSelected: true,
      fleetGuardRolloutRevision: 2,
      fleetGuardTemplateRequired: true,
      fleetGuardTemplateRef: templateRef
    });

    expect(result).toMatchObject({
      stateLabel: "Blocked",
      canDeploy: false,
      primaryBlocker: {
        entityKey: "WCC_8",
        role: "power",
        reason: "Exact running power point is missing."
      }
    });
  });

  it("fails closed when rollout, template, or target task binding changes", () => {
    const taskSummary = fleetGuard("ready", "task-1");
    for (const scenario of [
      { fleetGuardRolloutRevision: 3, fleetGuardTemplateRef: templateRef, authorizationTargetTaskId: "task-1" },
      { fleetGuardRolloutRevision: 2, fleetGuardTemplateRef: { ...templateRef, version: 4 }, authorizationTargetTaskId: "task-1" },
      { fleetGuardRolloutRevision: 2, fleetGuardTemplateRef: templateRef, authorizationTargetTaskId: "task-2" }
    ]) {
      const result = normalizeFddDeploymentEvidence({
        check: check("can_deploy", taskSummary),
        equipmentAvailability: availability,
        legacyCoverage: readyLegacyCoverage,
        runtimeImplemented: true,
        fleetGuardSelected: true,
        fleetGuardTemplateRequired: true,
        ...scenario
      });
      expect(result.stateLabel).toBe("Blocked");
      expect(result.canDeploy).toBe(false);
    }
  });

  it("uses v4 after rollout is disabled even if an old FleetGuard summary remains", () => {
    const result = normalizeFddDeploymentEvidence({
      check: check("can_deploy", fleetGuard("blocked")),
      equipmentAvailability: availability,
      legacyCoverage: readyLegacyCoverage,
      runtimeImplemented: true,
      fleetGuardSelected: false,
      fleetGuardRolloutRevision: 3
    });
    expect(result).toMatchObject({ policy: "v4", stateLabel: "Ready", canDeploy: true });
  });

  it("presents absent equipment only as Not applicable", () => {
    const absent: FddEquipmentAvailability = { equipmentType: "chiller", status: "not_available", entityCount: 0 };
    const result = normalizeFddDeploymentEvidence({
      check: undefined,
      equipmentAvailability: absent,
      legacyCoverage: { ...readyLegacyCoverage, inventoryEntityKeys: [], deployableEntityKeys: [], inventoryCount: 0, boundCount: 0, deployableCount: 0, hasFullDeployableCoverage: false },
      runtimeImplemented: true,
      fleetGuardSelected: false
    });
    expect(result).toMatchObject({ stateLabel: "Not applicable", canDeploy: false, deployedCount: 0 });
  });
});
