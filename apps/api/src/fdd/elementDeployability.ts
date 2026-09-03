import type { FddAlgorithm, FddDeployabilityCheck, FddEntityDeployability } from "./library.js";

export const ELEMENT_FDD_PROJECT_ID = "project_element";
export const ELEMENT_REVIEWED_FDD_DEPLOYABILITY_POLICY_VERSION = "v6-element-reviewed-deployability";

// Source: the owner-reviewed "actual deployment" column for Element CH-01
// through CH-51. CH-05's former "further calculation required" disposition is
// intentionally treated as unused/non-deployable.
export const ELEMENT_REVIEWED_NON_DEPLOYABLE_ALGORITHM_KEYS = [
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
] as const;

export type ElementReviewedDeployabilityDisposition = "reviewed_not_used" | "uncertainty_blocked";

const reviewedNonDeployableKeys = new Set<string>(ELEMENT_REVIEWED_NON_DEPLOYABLE_ALGORITHM_KEYS);
const reviewedElementChillerKey = /^chiller_ch_(?:0[1-9]|[1-4][0-9]|5[01])_/u;

export function isElementReviewedFddAlgorithm(
  projectId: string,
  algorithm: Pick<FddAlgorithm, "algorithmKey">
): boolean {
  return projectId === ELEMENT_FDD_PROJECT_ID && reviewedElementChillerKey.test(algorithm.algorithmKey);
}

export function expectedFddDeployabilityPolicyVersion(
  projectId: string,
  algorithm: Pick<FddAlgorithm, "algorithmKey">,
  defaultPolicyVersion: string
): string {
  return isElementReviewedFddAlgorithm(projectId, algorithm)
    ? ELEMENT_REVIEWED_FDD_DEPLOYABILITY_POLICY_VERSION
    : defaultPolicyVersion;
}

function blockEntity(entity: FddEntityDeployability): FddEntityDeployability {
  const { warnings: _warnings, ...rest } = entity;
  return { ...rest, status: "cannot_deploy" };
}

function blockUncertainEntity(entity: FddEntityDeployability): FddEntityDeployability {
  return entity.status === "uncertain" ? blockEntity(entity) : entity;
}

export function applyElementReviewedDeployabilityPolicy(input: {
  projectId: string;
  algorithm: Pick<FddAlgorithm, "algorithmKey">;
  check: FddDeployabilityCheck;
}): {
  check: FddDeployabilityCheck;
  disposition?: ElementReviewedDeployabilityDisposition;
} {
  if (!isElementReviewedFddAlgorithm(input.projectId, input.algorithm)) {
    return { check: input.check };
  }

  const disposition: ElementReviewedDeployabilityDisposition | undefined = reviewedNonDeployableKeys.has(input.algorithm.algorithmKey)
    ? "reviewed_not_used"
    : input.check.status === "uncertain" || input.check.deployableEntities?.some((entity) => entity.status === "uncertain")
      ? "uncertainty_blocked"
      : undefined;
  if (!disposition) {
    return {
      check: {
        ...input.check,
        checkPolicyVersion: ELEMENT_REVIEWED_FDD_DEPLOYABILITY_POLICY_VERSION
      }
    };
  }

  const { warnings: _warnings, ...rest } = input.check;
  return {
    check: {
      ...rest,
      checkPolicyVersion: ELEMENT_REVIEWED_FDD_DEPLOYABILITY_POLICY_VERSION,
      status: "cannot_deploy",
      ...(input.check.deployableEntities
        ? {
            deployableEntities: input.check.deployableEntities.map(
              disposition === "reviewed_not_used" ? blockEntity : blockUncertainEntity
            )
          }
        : {})
    },
    disposition
  };
}
