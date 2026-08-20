import {
  alignLegacyV4CandidatesToExampleEntity,
  applyLegacyV4FleetPlanToDecision,
  evaluateLegacyV4Deployability,
  legacyV4DecisionHasFleetCoverage,
  planLegacyV4HomogeneousFleet,
  type FddDeployabilityDecision,
  type FddPointCandidate,
  type LegacyV4CandidateAlignment,
  type LegacyV4CandidateAlignmentInput,
  type LegacyV4CoverageInput,
  type LegacyV4DeployabilityInput,
  type LegacyV4FleetPlan,
  type LegacyV4FleetDecisionInput,
  type LegacyV4FleetCandidateEvidence,
  type LegacyV4FleetPlanInput
} from "@building-agent/fdd-deployment-planner";
import type { FddFleetGuardCheckSummary } from "./fleetGuardAuthorization.js";

export interface FddCheckAgentWorkflow {
  agentId: "buildinggpt";
  skillId: string;
  skillName: string;
  mode: "deterministic_core" | "llm_deep_inference";
  kbDocuments: string[];
  skillIds?: string[];
  memory?: {
    userEntries: number;
    projectEntries: number;
  };
  groundingRules?: Array<{
    id: string;
    name?: string;
    source?: string;
    content?: string;
  }>;
  steps: string[];
}

/** API wire shape extends the pure decision only with API-owned workflow evidence. */
export interface FddDeployabilityCheck extends FddDeployabilityDecision {
  agentWorkflow?: FddCheckAgentWorkflow;
  fleetGuard?: FddFleetGuardCheckSummary;
}

/**
 * Project-task status is only a coarse UI/API projection. When FleetGuard
 * evidence is present it is authoritative; a contradictory legacy v4 status
 * must not make the task look ready (or blocked) in the opposite direction.
 */
export function fddDeployabilityCheckIsTaskReady(check: {
  status: FddDeployabilityCheck["status"];
  fleetGuard?: {
    state: FddFleetGuardCheckSummary["state"];
    authorization?: unknown;
  };
}): boolean {
  if (check.fleetGuard) {
    return check.fleetGuard.state === "ready"
      && typeof check.fleetGuard.authorization === "object"
      && check.fleetGuard.authorization !== null;
  }
  return check.status === "can_deploy";
}

export type EvaluateFddDeployabilityInput = Omit<LegacyV4DeployabilityInput, "checkedAt"> & {
  checkedAt?: string;
};

export function evaluateFddDeployability(input: EvaluateFddDeployabilityInput): FddDeployabilityCheck {
  return evaluateLegacyV4Deployability({
    ...input,
    checkedAt: input.checkedAt ?? new Date().toISOString()
  });
}

export function planFddHomogeneousV4Fleet(input: LegacyV4FleetPlanInput): LegacyV4FleetPlan {
  return planLegacyV4HomogeneousFleet(input);
}

export function projectFddV4FleetCandidateEvidence(
  candidates: FddPointCandidate[],
  projection: {
    canonicalEntityKey: (entityKey: string) => string;
    pointFamilyKey: (pointName: string) => string | null;
  }
): LegacyV4FleetCandidateEvidence[] {
  return candidates.flatMap((candidate) => {
    if (!candidate.entityKey) return [];
    const pointFamilyKey = projection.pointFamilyKey(candidate.pointName);
    return [{
      candidate,
      canonicalEntityKey: projection.canonicalEntityKey(candidate.entityKey),
      ...(pointFamilyKey ? { pointFamilyKey } : {})
    }];
  });
}

export function alignFddV4CandidatesToExampleEntity(
  input: LegacyV4CandidateAlignmentInput
): LegacyV4CandidateAlignment {
  return alignLegacyV4CandidatesToExampleEntity(input);
}

export function applyFddHomogeneousV4FleetDecision(
  input: LegacyV4FleetDecisionInput
): FddDeployabilityCheck {
  return applyLegacyV4FleetPlanToDecision(input);
}

export function fddV4DecisionHasFleetCoverage(input: LegacyV4CoverageInput): boolean {
  return legacyV4DecisionHasFleetCoverage(input);
}
