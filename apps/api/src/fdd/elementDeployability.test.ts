import { describe, expect, it } from "vitest";
import { createSeedStore } from "../seed.js";
import { ensureStoreFddLibrary, type FddAlgorithm, type FddDeployabilityCheck, type FddDeployabilityStatus } from "./library.js";
import {
  applyElementReviewedDeployabilityPolicy,
  ELEMENT_REVIEWED_FDD_DEPLOYABILITY_POLICY_VERSION,
  ELEMENT_REVIEWED_NON_DEPLOYABLE_ALGORITHM_KEYS,
  expectedFddDeployabilityPolicyVersion
} from "./elementDeployability.js";

function check(status: FddDeployabilityStatus, projectId = "project_element"): FddDeployabilityCheck {
  return {
    algorithmVersion: "1.0.0",
    checkPolicyVersion: "v5-evidence-backed-missing-unit",
    projectId,
    status,
    pointCandidates: [],
    deployableEntities: [{
      entityKey: "WCC_1",
      status,
      selectedMappings: [],
      ambiguousInputs: [],
      missingPoints: [],
      historyIssues: [],
      warnings: [{ code: "engineering_unit_missing", message: "warning" }],
      confidence: 0.9
    }],
    ambiguousInputs: [],
    rejectedCandidates: [],
    missingPoints: [],
    historyIssues: [],
    warnings: [{ code: "engineering_unit_missing", message: "warning" }],
    checkedAt: "2026-09-03T00:00:00.000Z",
    source: "manual",
    projectDataSignature: "test"
  };
}

function algorithm(algorithmKey: string): Pick<FddAlgorithm, "algorithmKey"> {
  return { algorithmKey };
}

describe("Element reviewed FDD deployability policy", () => {
  it("encodes the exact 37 deployable / 14 non-deployable CH-01 through CH-51 matrix", () => {
    const store = createSeedStore();
    ensureStoreFddLibrary(store);
    const reviewedAlgorithms = (store.fddAlgorithms ?? []).filter((entry) =>
      /^chiller_ch_(?:0[1-9]|[1-4][0-9]|5[01])_/u.test(entry.algorithmKey)
    );
    const reviewedResults = reviewedAlgorithms.map((entry) => applyElementReviewedDeployabilityPolicy({
      projectId: "project_element",
      algorithm: entry,
      check: check("can_deploy")
    }).check);
    const statuses = reviewedResults.reduce<Record<FddDeployabilityStatus, number>>((counts, result) => {
      counts[result.status] += 1;
      return counts;
    }, { can_deploy: 0, cannot_deploy: 0, uncertain: 0 });

    expect(reviewedAlgorithms).toHaveLength(51);
    expect(statuses).toEqual({ can_deploy: 37, cannot_deploy: 14, uncertain: 0 });
    expect(new Set(reviewedResults.map((result) => result.checkPolicyVersion))).toEqual(
      new Set([ELEMENT_REVIEWED_FDD_DEPLOYABILITY_POLICY_VERSION])
    );
    expect(ELEMENT_REVIEWED_NON_DEPLOYABLE_ALGORITHM_KEYS).toEqual([
      "chiller_ch_05_prolonged_low_load",
      "chiller_ch_06_loading_response_fault",
      "chiller_ch_07_unloading_failure",
      "chiller_ch_16_high_evaporator_pressure",
      "chiller_ch_17_low_evaporator_pressure",
      "chiller_ch_27_high_condensing_pressure",
      "chiller_ch_28_low_condensing_pressure",
      "chiller_ch_35_refrigerant_undercharge_or_leak",
      "chiller_ch_36_refrigerant_overcharge",
      "chiller_ch_37_exv_underfeeding_or_stuck_closed",
      "chiller_ch_38_exv_overfeeding_or_stuck_open",
      "chiller_ch_42_chw_setpoint_reset_failure",
      "chiller_ch_49_chw_differential_pressure_sensor_fault",
      "chiller_ch_50_cw_differential_pressure_sensor_fault"
    ]);
  });

  it("blocks reviewed-unused rules and removes deployable fleet coverage", () => {
    const result = applyElementReviewedDeployabilityPolicy({
      projectId: "project_element",
      algorithm: algorithm("chiller_ch_05_prolonged_low_load"),
      check: check("can_deploy")
    });

    expect(result.disposition).toBe("reviewed_not_used");
    expect(result.check.status).toBe("cannot_deploy");
    expect(result.check.deployableEntities).toEqual([
      expect.objectContaining({ entityKey: "WCC_1", status: "cannot_deploy" })
    ]);
    expect(result.check.warnings).toBeUndefined();
    expect(result.check.deployableEntities?.[0]?.warnings).toBeUndefined();
  });

  it("collapses uncertainty to cannot_deploy only for the reviewed Element matrix", () => {
    const element = applyElementReviewedDeployabilityPolicy({
      projectId: "project_element",
      algorithm: algorithm("chiller_ch_20_chw_flow_while_off"),
      check: check("uncertain")
    });
    const otherProject = applyElementReviewedDeployabilityPolicy({
      projectId: "project_alpha",
      algorithm: algorithm("chiller_ch_20_chw_flow_while_off"),
      check: check("uncertain", "project_alpha")
    });
    const outsideMatrix = applyElementReviewedDeployabilityPolicy({
      projectId: "project_element",
      algorithm: algorithm("chiller_low_cop_detection"),
      check: check("uncertain")
    });

    expect(element).toMatchObject({
      disposition: "uncertainty_blocked",
      check: { status: "cannot_deploy", deployableEntities: [{ status: "cannot_deploy" }] }
    });
    expect(otherProject.disposition).toBeUndefined();
    expect(otherProject.check.status).toBe("uncertain");
    expect(otherProject.check.checkPolicyVersion).toBe("v5-evidence-backed-missing-unit");
    expect(outsideMatrix.disposition).toBeUndefined();
    expect(outsideMatrix.check.status).toBe("uncertain");
  });

  it("does not force a reviewed deployable rule past deterministic evidence", () => {
    const canDeploy = check("can_deploy");
    const cannotDeploy = check("cannot_deploy");

    expect(applyElementReviewedDeployabilityPolicy({
      projectId: "project_element",
      algorithm: algorithm("chiller_ch_20_chw_flow_while_off"),
      check: canDeploy
    }).check).toMatchObject({
      status: "can_deploy",
      checkPolicyVersion: ELEMENT_REVIEWED_FDD_DEPLOYABILITY_POLICY_VERSION
    });
    expect(applyElementReviewedDeployabilityPolicy({
      projectId: "project_element",
      algorithm: algorithm("chiller_ch_20_chw_flow_while_off"),
      check: cannotDeploy
    }).check).toMatchObject({
      status: "cannot_deploy",
      checkPolicyVersion: ELEMENT_REVIEWED_FDD_DEPLOYABILITY_POLICY_VERSION
    });
  });

  it("keeps the existing policy current outside the reviewed Element matrix", () => {
    expect(expectedFddDeployabilityPolicyVersion(
      "project_element",
      algorithm("chiller_ch_20_chw_flow_while_off"),
      "v5-evidence-backed-missing-unit"
    )).toBe(ELEMENT_REVIEWED_FDD_DEPLOYABILITY_POLICY_VERSION);
    expect(expectedFddDeployabilityPolicyVersion(
      "project_alpha",
      algorithm("chiller_ch_20_chw_flow_while_off"),
      "v5-evidence-backed-missing-unit"
    )).toBe("v5-evidence-backed-missing-unit");
    expect(expectedFddDeployabilityPolicyVersion(
      "project_element",
      algorithm("chiller_low_cop_detection"),
      "v5-evidence-backed-missing-unit"
    )).toBe("v5-evidence-backed-missing-unit");
  });
});
