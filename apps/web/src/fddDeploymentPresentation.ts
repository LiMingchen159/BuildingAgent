import type {
  FddDeployabilityCheck,
  FddEquipmentAvailability,
  FddFleetGuardAuthorization,
  FddFleetGuardTemplateRef
} from "./api";

export type FddDeploymentPresentationState = "ready" | "blocked" | "not_applicable";

export interface FddLegacyCoverageInput {
  inventoryEntityKeys: string[];
  deployableEntityKeys: string[];
  inventoryCount: number;
  boundCount: number;
  deployableCount: number;
  hasFullDeployableCoverage: boolean;
  primaryBlocker?: {
    entityKey?: string;
    role?: string;
    reason: string;
  };
}

export interface FddDeploymentEvidencePresentation {
  policy: "v4" | "fleetguard-v1";
  state: FddDeploymentPresentationState;
  stateLabel: "Ready" | "Blocked" | "Not applicable";
  expectedCount: number;
  boundCount: number;
  dataReadyCount: number;
  deployedCount: number;
  primaryBlocker?: {
    entityKey?: string;
    role?: string;
    reason: string;
    text: string;
  };
  warningCount: number;
  canDeploy: boolean;
  authorization?: FddFleetGuardAuthorization;
}

function uniqueEntityKeys(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function stateLabel(state: FddDeploymentPresentationState): FddDeploymentEvidencePresentation["stateLabel"] {
  if (state === "ready") return "Ready";
  if (state === "not_applicable") return "Not applicable";
  return "Blocked";
}

function blocker(input: {
  entityKey?: string;
  role?: string;
  reason: string;
} | undefined): FddDeploymentEvidencePresentation["primaryBlocker"] {
  if (!input) return undefined;
  return {
    ...input,
    text: [input.entityKey ?? "Fleet", input.role ?? "general", input.reason].join(" · ")
  };
}

/**
 * The only Web presentation policy for v4 and FleetGuard deployment evidence.
 * FleetGuard presence is authoritative: invalid or blocked FleetGuard evidence
 * can never fall back to a permissive legacy v4 result.
 */
export function normalizeFddDeploymentEvidence(input: {
  check: FddDeployabilityCheck | undefined;
  equipmentAvailability: FddEquipmentAvailability | undefined;
  legacyCoverage: FddLegacyCoverageInput;
  deployedEntityIds?: string[];
  runtimeImplemented: boolean;
  fleetGuardSelected?: boolean;
  fleetGuardRolloutRevision?: number;
  fleetGuardTemplateRequired?: boolean;
  fleetGuardTemplateRef?: FddFleetGuardTemplateRef;
  authorizationTargetTaskId?: string;
}): FddDeploymentEvidencePresentation {
  const { check, equipmentAvailability, legacyCoverage } = input;
  const fleetGuardSelected = input.fleetGuardSelected
    ?? Boolean(check?.fleetGuard || check?.fleetGuardMalformed);
  const rawFleetGuard = fleetGuardSelected ? check?.fleetGuard : undefined;
  const fleetGuardRevisionStale = fleetGuardSelected
    && input.fleetGuardRolloutRevision !== undefined
    && rawFleetGuard?.rolloutRevision !== input.fleetGuardRolloutRevision;
  const fleetGuardTemplateStale = fleetGuardSelected
    && input.fleetGuardTemplateRequired === true
    && (!input.fleetGuardTemplateRef
      || !rawFleetGuard?.templateRef
      || rawFleetGuard.templateRef.templateId !== input.fleetGuardTemplateRef.templateId
      || rawFleetGuard.templateRef.version !== input.fleetGuardTemplateRef.version
      || rawFleetGuard.templateRef.signature !== input.fleetGuardTemplateRef.signature);
  const fleetGuard = fleetGuardSelected && !fleetGuardRevisionStale && !fleetGuardTemplateStale
    ? rawFleetGuard
    : undefined;
  const policy = fleetGuardSelected ? "fleetguard-v1" : "v4";
  const expectedCount = fleetGuard?.coverage.expected
    ?? Math.max(legacyCoverage.inventoryCount, equipmentAvailability?.entityCount ?? 0);
  const inventoryKeys = uniqueEntityKeys([
    ...(check?.equipmentAvailability?.entityKeys ?? []),
    ...(equipmentAvailability?.entityKeys ?? []),
    ...legacyCoverage.inventoryEntityKeys
  ]);
  const authoritativeInventory = new Set(inventoryKeys);
  const deployedCount = uniqueEntityKeys(input.deployedEntityIds ?? [])
    .filter((entityKey) => authoritativeInventory.has(entityKey))
    .length;
  const equipmentNotApplicable = equipmentAvailability?.status === "not_available"
    || check?.applicability === "no_equipment"
    || fleetGuard?.state === "not_applicable";

  let state: FddDeploymentPresentationState;
  let primaryBlocker: FddDeploymentEvidencePresentation["primaryBlocker"];
  if (equipmentNotApplicable) {
    state = "not_applicable";
  } else if (fleetGuardSelected && check?.fleetGuardMalformed) {
    state = "blocked";
    primaryBlocker = blocker({ reason: "FleetGuard evidence is malformed. Run Test again." });
  } else if (fleetGuardRevisionStale) {
    state = "blocked";
    primaryBlocker = blocker({ reason: "The FleetGuard rollout changed. Run Test again." });
  } else if (fleetGuardTemplateStale) {
    state = "blocked";
    primaryBlocker = blocker({ reason: "The FleetGuard fleet template changed or is unavailable. Run Test again." });
  } else if (fleetGuardSelected && !fleetGuard) {
    state = "blocked";
    primaryBlocker = blocker({ reason: "Current FleetGuard evidence is unavailable or stale. Run Test again." });
  } else if (fleetGuard) {
    state = fleetGuard.state === "ready"
      ? fleetGuard.authorization ? "ready" : "blocked"
      : fleetGuard.state;
    if (state === "blocked") {
      primaryBlocker = blocker(fleetGuard.primaryBlocker ?? {
        reason: "FleetGuard authorization is unavailable. Run Test again."
      });
    }
  } else if (check?.status === "can_deploy" && legacyCoverage.hasFullDeployableCoverage) {
    state = "ready";
  } else {
    state = "blocked";
    primaryBlocker = blocker(legacyCoverage.primaryBlocker ?? {
      reason: check
        ? "The fleet does not have complete equipment and data evidence."
        : "Current project evidence is unavailable or stale. Run Test again."
    });
  }

  if (state === "ready" && !input.runtimeImplemented) {
    state = "blocked";
    primaryBlocker = blocker({ reason: "The executable evaluator is not implemented." });
  }
  if (state === "ready"
    && policy === "fleetguard-v1"
    && fleetGuard?.authorization?.taskId !== input.authorizationTargetTaskId) {
    state = "blocked";
    primaryBlocker = blocker({ reason: "The authorization targets a different FDD task. Run Test again." });
  }

  const boundCount = fleetGuard?.coverage.bound ?? (policy === "fleetguard-v1" ? 0 : legacyCoverage.boundCount);
  const dataReadyCount = fleetGuard?.coverage.dataReady ?? (policy === "fleetguard-v1" ? 0 : legacyCoverage.deployableCount);
  const canDeploy = input.runtimeImplemented
    && state === "ready"
    && (policy === "v4" || Boolean(fleetGuard?.authorization));
  return {
    policy,
    state,
    stateLabel: stateLabel(state),
    expectedCount,
    boundCount,
    dataReadyCount,
    deployedCount,
    ...(primaryBlocker ? { primaryBlocker } : {}),
    warningCount: fleetGuard?.warnings.length ?? 0,
    canDeploy,
    ...(policy === "fleetguard-v1" && state === "ready" && fleetGuard?.authorization
      ? { authorization: fleetGuard.authorization }
      : {})
  };
}
