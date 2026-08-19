import type {
  FleetGuardBlocker,
  FleetGuardBlockerCode,
  FleetGuardEntityPlan,
  FleetGuardExactLookupEvidence,
  FleetGuardExactBinding,
  FleetGuardPlan,
  FleetGuardPlanInput,
  FleetGuardPointObservation,
  FleetGuardRoleFamilyEvidence,
  FleetGuardRoleRequirement,
  FleetGuardSelectedRoleFamily,
  FleetGuardSignatures,
  FleetGuardWarning
} from "./contracts.js";

export const FLEET_GUARD_POLICY_VERSION = "fleetguard-v1";

const AUTHORIZING_ROLE_FAMILY_SOURCES = new Set(["locked_template", "deterministic_ontology"]);

const BLOCKER_ORDER: Record<FleetGuardBlockerCode, number> = {
  inventory_absent: 0,
  inventory_unknown: 1,
  inventory_equipment_mismatch: 2,
  inventory_empty: 3,
  inventory_absent_conflict: 4,
  inventory_duplicate_entity: 5,
  inventory_invalid_entity: 6,
  signature_missing: 7,
  algorithm_invalid: 8,
  evaluator_invalid: 9,
  evaluator_missing: 10,
  evaluator_version_mismatch: 11,
  required_roles_empty: 18,
  required_role_invalid: 19,
  required_role_duplicate: 20,
  role_family_missing: 21,
  role_family_unknown: 22,
  role_family_conflict: 23,
  role_family_unauthorized_source: 24,
  role_family_ambiguous: 25,
  template_version_missing: 26,
  template_version_conflict: 27,
  template_signature_missing: 28,
  lookup_unknown: 30,
  lookup_timeout: 31,
  lookup_failed: 32,
  lookup_conflict: 33,
  point_missing: 34,
  point_multiple: 35,
  point_id_missing: 36,
  object_ref_missing: 37,
  ownership_unknown: 38,
  ownership_conflict: 39,
  ownership_mismatch: 40,
  is_point_of_unverified: 41,
  duplicate_point_id: 42,
  duplicate_object_ref: 43,
  quantity_unknown: 44,
  quantity_conflict: 45,
  quantity_mismatch: 46,
  unit_unknown: 47,
  unit_mismatch: 48,
  history_unknown: 49,
  history_insufficient: 50,
  history_timeout: 51
};

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function normalizedIdentity(value: string): string {
  return value.trim().toUpperCase();
}

function normalizedFamily(value: string): string {
  return value.trim().toLowerCase();
}

function normalizedRole(value: string): string {
  return value.trim().toLowerCase();
}

function normalizedUnit(value: string): string {
  return value.trim().toLowerCase();
}

function normalizedSignatures(signatures: FleetGuardSignatures): FleetGuardSignatures {
  return {
    algorithm: signatures.algorithm,
    evaluator: signatures.evaluator,
    inventory: signatures.inventory,
    evidence: signatures.evidence,
    ...(typeof signatures.template !== "undefined" ? { template: signatures.template } : {}),
    ...(typeof signatures.skill !== "undefined" ? { skill: signatures.skill } : {}),
    ...(typeof signatures.model !== "undefined" ? { model: signatures.model } : {}),
    ...(typeof signatures.tool !== "undefined" ? { tool: signatures.tool } : {})
  };
}

function signatureValue(value: string | undefined): string {
  return typeof value === "undefined"
    ? "missing"
    : `value:${encodeURIComponent(value)}`;
}

/**
 * This identifier intentionally contains only caller-supplied snapshot/version
 * signatures. Time, array order, random values, and process state cannot change it.
 */
export function fleetGuardPlanId(signatures: FleetGuardSignatures): string {
  return [
    `policy=${signatureValue(FLEET_GUARD_POLICY_VERSION)}`,
    `algorithm=${signatureValue(signatures.algorithm)}`,
    `evaluator=${signatureValue(signatures.evaluator)}`,
    `inventory=${signatureValue(signatures.inventory)}`,
    `evidence=${signatureValue(signatures.evidence)}`,
    `template=${signatureValue(signatures.template)}`,
    `skill=${signatureValue(signatures.skill)}`,
    `model=${signatureValue(signatures.model)}`,
    `tool=${signatureValue(signatures.tool)}`
  ].join("|");
}

function blocker(
  code: FleetGuardBlockerCode,
  reason: string,
  context: { entityKey?: string; role?: string } = {}
): FleetGuardBlocker {
  return {
    code,
    reason,
    ...(context.entityKey ? { entityKey: context.entityKey } : {}),
    ...(context.role ? { role: context.role } : {})
  };
}

function blockerKey(value: FleetGuardBlocker): string {
  return [
    String(BLOCKER_ORDER[value.code]).padStart(3, "0"),
    normalizedIdentity(value.entityKey ?? ""),
    normalizedRole(value.role ?? ""),
    value.code,
    value.reason
  ].join("|");
}

function sortedUniqueBlockers(values: FleetGuardBlocker[]): FleetGuardBlocker[] {
  const byKey = new Map<string, FleetGuardBlocker>();
  for (const value of values) byKey.set(blockerKey(value), value);
  return [...byKey.values()].sort((left, right) => compareText(blockerKey(left), blockerKey(right)));
}

function warningKey(value: FleetGuardWarning): string {
  return [normalizedIdentity(value.entityKey), normalizedRole(value.role), value.code, value.reason].join("|");
}

function sortedUniqueWarnings(values: FleetGuardWarning[]): FleetGuardWarning[] {
  const byKey = new Map<string, FleetGuardWarning>();
  for (const value of values) byKey.set(warningKey(value), value);
  return [...byKey.values()].sort((left, right) => compareText(warningKey(left), warningKey(right)));
}

function selectedFamilyKey(value: FleetGuardSelectedRoleFamily): string {
  return [normalizedRole(value.role), normalizedFamily(value.familyKey), value.source, value.templateVersion ?? ""].join("|");
}

function roleRequirementKey(value: FleetGuardRoleRequirement): string {
  return [
    normalizedRole(value.role),
    value.role.trim(),
    value.label.trim(),
    value.quantityKind,
    (value.acceptableUnits ?? []).map(normalizedUnit).sort(compareText).join(","),
    String(value.minHistoryDays ?? "")
  ].join("|");
}

function canonicalRoleRequirement(value: FleetGuardRoleRequirement): FleetGuardRoleRequirement {
  const acceptableUnits = [...new Set((value.acceptableUnits ?? []).map(normalizedUnit).filter(Boolean))].sort(compareText);
  return {
    role: value.role.trim(),
    label: value.label.trim(),
    quantityKind: value.quantityKind,
    ...(acceptableUnits.length > 0 ? { acceptableUnits } : {}),
    ...(typeof value.minHistoryDays === "number" ? { minHistoryDays: value.minHistoryDays } : {})
  };
}

function familyEvidenceKey(value: FleetGuardRoleFamilyEvidence): string {
  return [
    normalizedRole(value.role),
    normalizedFamily(value.familyKey),
    value.source,
    value.status,
    value.templateVersion?.trim() ?? "",
    value.role.trim(),
    value.familyKey.trim()
  ].join("|");
}

function observationKey(value: FleetGuardPointObservation): string {
  return [
    normalizedIdentity(value.entityKey),
    normalizedFamily(value.familyKey),
    value.pointId.trim().toLowerCase(),
    value.objectRef.trim().toLowerCase(),
    value.entityKey.trim(),
    value.familyKey.trim()
  ].join("|");
}

function lookupKey(value: FleetGuardExactLookupEvidence): string {
  return [
    normalizedIdentity(value.entityKey),
    normalizedFamily(value.familyKey),
    value.status,
    value.entityKey.trim(),
    value.familyKey.trim(),
    value.observations.map(observationKey).sort(compareText).join(";")
  ].join("|");
}

function selectRoleFamily(
  role: FleetGuardRoleRequirement,
  roleFamilies: FleetGuardRoleFamilyEvidence[]
): { selected?: FleetGuardSelectedRoleFamily; blockers: FleetGuardBlocker[] } {
  const entries = roleFamilies
    .filter((entry) => normalizedRole(entry.role) === normalizedRole(role.role))
    .slice()
    .sort((left, right) => compareText(familyEvidenceKey(left), familyEvidenceKey(right)));
  const lockedEntries = entries.filter((entry) => entry.source === "locked_template");
  const verifiedLocked = lockedEntries.filter((entry) => entry.status === "verified" && normalizedFamily(entry.familyKey));
  const verifiedDeterministic = entries.filter((entry) =>
    entry.status === "verified" && entry.source === "deterministic_ontology" && normalizedFamily(entry.familyKey)
  );

  const uniqueFamilies = (values: FleetGuardRoleFamilyEvidence[]): FleetGuardRoleFamilyEvidence[] => {
    const byFamily = new Map<string, FleetGuardRoleFamilyEvidence>();
    for (const value of values) {
      const key = normalizedFamily(value.familyKey);
      if (!byFamily.has(key)) byFamily.set(key, value);
    }
    return [...byFamily.values()];
  };

  if (lockedEntries.some((entry) => entry.status === "conflict")) {
    return {
      blockers: [blocker("role_family_conflict", `${role.label} locked-template evidence conflicts.`, { role: role.role })]
    };
  }
  if (lockedEntries.some((entry) => entry.status === "unknown")) {
    return {
      blockers: [blocker("role_family_unknown", `${role.label} locked-template evidence is not verified.`, { role: role.role })]
    };
  }
  if (verifiedLocked.some((entry) => !entry.templateVersion?.trim())) {
    return {
      blockers: [blocker(
        "template_version_missing",
        `${role.label} locked family has no template version.`,
        { role: role.role }
      )]
    };
  }
  if (lockedEntries.some((entry) => entry.status === "verified" && !normalizedFamily(entry.familyKey))) {
    return {
      blockers: [blocker("role_family_conflict", `${role.label} locked family key is empty.`, { role: role.role })]
    };
  }
  const lockedVersions = [...new Set(verifiedLocked
    .map((entry) => entry.templateVersion?.trim())
    .filter((version): version is string => Boolean(version)))]
    .sort(compareText);
  if (lockedVersions.length > 1) {
    return {
      blockers: [blocker(
        "template_version_conflict",
        `${role.label} locked family has conflicting template versions: ${lockedVersions.join(", ")}.`,
        { role: role.role }
      )]
    };
  }
  const lockedFamilies = uniqueFamilies(verifiedLocked);
  if (lockedFamilies.length > 1) {
    return {
      blockers: [blocker(
        "role_family_ambiguous",
        `${role.label} has multiple verified locked families: ${lockedFamilies.map((entry) => entry.familyKey).join(", ")}.`,
        { role: role.role }
      )]
    };
  }
  if (lockedFamilies[0]) {
    const selected = lockedFamilies[0];
    return {
      selected: {
        role: role.role.trim(),
        familyKey: selected.familyKey.trim(),
        source: "locked_template",
        ...(selected.templateVersion?.trim() ? { templateVersion: selected.templateVersion.trim() } : {})
      },
      blockers: []
    };
  }

  const authoritativeEntries = entries.filter((entry) => AUTHORIZING_ROLE_FAMILY_SOURCES.has(entry.source));
  if (authoritativeEntries.some((entry) => entry.status === "conflict")) {
    return {
      blockers: [blocker("role_family_conflict", `${role.label} family evidence conflicts.`, { role: role.role })]
    };
  }
  if (authoritativeEntries.some((entry) => entry.status === "unknown")) {
    return {
      blockers: [blocker("role_family_unknown", `${role.label} family is not verified.`, { role: role.role })]
    };
  }

  const deterministicFamilies = uniqueFamilies(verifiedDeterministic);
  if (deterministicFamilies.length > 1) {
    return {
      blockers: [blocker(
        "role_family_ambiguous",
        `${role.label} has multiple verified ontology families and no locked template: ${deterministicFamilies.map((entry) => entry.familyKey).join(", ")}.`,
        { role: role.role }
      )]
    };
  }
  if (deterministicFamilies[0]) {
    return {
      selected: {
        role: role.role.trim(),
        familyKey: deterministicFamilies[0].familyKey.trim(),
        source: "deterministic_ontology"
      },
      blockers: []
    };
  }
  if (entries.some((entry) => entry.status === "verified")) {
    return {
      blockers: [blocker(
        "role_family_unauthorized_source",
        `${role.label} is supported only by a proposal; a locked template or deterministic ontology fact is required.`,
        { role: role.role }
      )]
    };
  }
  return {
    blockers: [blocker("role_family_missing", `${role.label} has no role-family evidence.`, { role: role.role })]
  };
}

function exactBinding(
  role: FleetGuardRoleRequirement,
  family: FleetGuardSelectedRoleFamily,
  observation: FleetGuardPointObservation
): FleetGuardExactBinding {
  return {
    role: role.role,
    familyKey: family.familyKey,
    pointId: observation.pointId.trim(),
    objectRef: observation.objectRef.trim(),
    ...(observation.unit.unit?.trim() ? { unit: observation.unit.unit.trim() } : {})
  };
}

interface SelectedObservation {
  entityKey: string;
  role: FleetGuardRoleRequirement;
  family: FleetGuardSelectedRoleFamily;
  observation: FleetGuardPointObservation;
}

interface MutableEntityPlan {
  entityKey: string;
  bindings: FleetGuardExactBinding[];
  blockers: FleetGuardBlocker[];
  warnings: FleetGuardWarning[];
  selected: SelectedObservation[];
  structurallyBound: boolean;
  dataReady: boolean;
}

function metadataWarnings(
  entityKey: string,
  role: FleetGuardRoleRequirement,
  observation: FleetGuardPointObservation
): FleetGuardWarning[] {
  const warnings: FleetGuardWarning[] = [];
  if (observation.metadata?.descriptionStatus === "mismatch") {
    warnings.push({
      code: "description_mismatch",
      entityKey,
      role: role.role,
      reason: `${entityKey} ${role.label} description disagrees with the verified structural binding.`
    });
  }
  if (observation.metadata?.brickClassStatus === "mismatch") {
    warnings.push({
      code: "brick_class_mismatch",
      entityKey,
      role: role.role,
      reason: `${entityKey} ${role.label} Brick class disagrees with the verified structural binding.`
    });
  }
  return warnings;
}

function validateObservation(
  entityKey: string,
  role: FleetGuardRoleRequirement,
  observation: FleetGuardPointObservation
): { structural: FleetGuardBlocker[]; data: FleetGuardBlocker[] } {
  const context = { entityKey, role: role.role };
  const structural: FleetGuardBlocker[] = [];
  const data: FleetGuardBlocker[] = [];
  if (!observation.pointId.trim()) {
    structural.push(blocker("point_id_missing", `${entityKey} ${role.label} has no point ID.`, context));
  }
  if (!observation.objectRef.trim()) {
    structural.push(blocker("object_ref_missing", `${entityKey} ${role.label} has no object reference.`, context));
  }
  if (observation.ownership.status === "unknown") {
    structural.push(blocker("ownership_unknown", `${entityKey} ${role.label} ownership is unknown.`, context));
  } else if (observation.ownership.status === "conflict") {
    structural.push(blocker("ownership_conflict", `${entityKey} ${role.label} ownership evidence conflicts.`, context));
  } else if (normalizedIdentity(observation.ownership.ownerEntityKey ?? "") !== normalizedIdentity(entityKey)) {
    structural.push(blocker("ownership_mismatch", `${entityKey} ${role.label} belongs to another equipment entity.`, context));
  }
  if (observation.ownership.isPointOf !== true) {
    structural.push(blocker("is_point_of_unverified", `${entityKey} ${role.label} isPointOf relation is not verified.`, context));
  }

  if (observation.quantity.status === "unknown" || observation.quantity.kind === "unknown") {
    data.push(blocker("quantity_unknown", `${entityKey} ${role.label} quantity is unknown.`, context));
  } else if (observation.quantity.status === "conflict") {
    data.push(blocker("quantity_conflict", `${entityKey} ${role.label} quantity evidence conflicts.`, context));
  } else if (observation.quantity.kind !== role.quantityKind) {
    data.push(blocker(
      "quantity_mismatch",
      `${entityKey} ${role.label} has quantity ${observation.quantity.kind}; expected ${role.quantityKind}.`,
      context
    ));
  }

  const acceptableUnits = (role.acceptableUnits ?? []).map(normalizedUnit).filter(Boolean);
  if (acceptableUnits.length > 0) {
    if (observation.unit.status === "unknown" || observation.unit.status === "not_required" || !observation.unit.unit?.trim()) {
      data.push(blocker("unit_unknown", `${entityKey} ${role.label} unit is not verified.`, context));
    } else if (
      observation.unit.status === "mismatch"
      || !acceptableUnits.includes(normalizedUnit(observation.unit.unit))
    ) {
      data.push(blocker(
        "unit_mismatch",
        `${entityKey} ${role.label} unit ${observation.unit.unit} is incompatible with ${role.acceptableUnits?.join(", ")}.`,
        context
      ));
    }
  } else if (observation.unit.status === "unknown") {
    data.push(blocker("unit_unknown", `${entityKey} ${role.label} unit applicability is unknown.`, context));
  } else if (observation.unit.status === "mismatch") {
    data.push(blocker("unit_mismatch", `${entityKey} ${role.label} unit evidence conflicts.`, context));
  }

  if (observation.history.status === "timeout") {
    data.push(blocker("history_timeout", `${entityKey} ${role.label} history verification timed out.`, context));
  } else if (observation.history.status === "unknown") {
    data.push(blocker("history_unknown", `${entityKey} ${role.label} history is unverified.`, context));
  } else if (
    observation.history.status === "sufficient"
    && typeof role.minHistoryDays === "number"
    && role.minHistoryDays > 0
    && (
      typeof observation.history.observedDays !== "number"
      || !Number.isFinite(observation.history.observedDays)
    )
  ) {
    data.push(blocker("history_unknown", `${entityKey} ${role.label} history duration is unverified.`, context));
  } else if (
    observation.history.status === "insufficient"
    || (
      typeof role.minHistoryDays === "number"
      && typeof observation.history.observedDays === "number"
      && observation.history.observedDays < role.minHistoryDays
    )
  ) {
    data.push(blocker(
      "history_insufficient",
      `${entityKey} ${role.label} history is insufficient${typeof role.minHistoryDays === "number" ? `; requires ${role.minHistoryDays}d` : ""}.`,
      context
    ));
  }
  return { structural, data };
}

function duplicateIdentityBlockers(
  entities: MutableEntityPlan[],
  identity: "pointId" | "objectRef"
): FleetGuardBlocker[] {
  const selected = entities.flatMap((entity) => entity.selected);
  const byIdentity = new Map<string, SelectedObservation[]>();
  for (const value of selected) {
    const rawIdentity = value.observation[identity].trim();
    if (!rawIdentity) continue;
    const key = rawIdentity.toLowerCase();
    byIdentity.set(key, [...(byIdentity.get(key) ?? []), value]);
  }
  const blockers: FleetGuardBlocker[] = [];
  for (const values of byIdentity.values()) {
    if (values.length < 2) continue;
    for (const value of values) {
      const code = identity === "pointId" ? "duplicate_point_id" : "duplicate_object_ref";
      const label = identity === "pointId" ? "point ID" : "object reference";
      blockers.push(blocker(
        code,
        `${value.entityKey} ${value.role.label} reuses ${label} ${value.observation[identity]}.`,
        { entityKey: value.entityKey, role: value.role.role }
      ));
    }
  }
  return blockers;
}

function resultBase(input: FleetGuardPlanInput, entityKeys: string[]) {
  return {
    planId: fleetGuardPlanId(input.signatures),
    policyVersion: FLEET_GUARD_POLICY_VERSION,
    algorithm: {
      id: input.algorithm.id.trim(),
      version: input.algorithm.version.trim(),
      equipmentType: input.algorithm.equipmentType
    },
    evaluator: {
      id: input.evaluator.id.trim(),
      requiredVersion: input.evaluator.requiredVersion.trim(),
      ...(input.evaluator.registeredVersion?.trim() ? { registeredVersion: input.evaluator.registeredVersion.trim() } : {})
    },
    signatures: normalizedSignatures(input.signatures),
    inventory: {
      status: input.inventory.status,
      equipmentType: input.inventory.equipmentType,
      entityKeys
    }
  };
}

/**
 * Produces a deterministic, fail-closed, all-or-nothing fleet authorization.
 * It never performs I/O and never treats proposal confidence as evidence.
 */
export function planFleetGuard(input: FleetGuardPlanInput): FleetGuardPlan {
  const rawMembers = input.inventory.members.map((member) => member.entityKey.trim());
  const sortedMembers = rawMembers
    .filter(Boolean)
    .sort(compareText);
  const uniqueMembersByIdentity = new Map<string, string>();
  for (const entityKey of sortedMembers) {
    const identity = normalizedIdentity(entityKey);
    if (!uniqueMembersByIdentity.has(identity)) uniqueMembersByIdentity.set(identity, entityKey);
  }
  const entityKeys = [...uniqueMembersByIdentity.values()].sort(compareText);
  const base = resultBase(input, entityKeys);
  const globalBlockers: FleetGuardBlocker[] = [];
  if (input.inventory.equipmentType !== input.algorithm.equipmentType) {
    globalBlockers.push(blocker(
      "inventory_equipment_mismatch",
      `Inventory contains ${input.inventory.equipmentType}; algorithm requires ${input.algorithm.equipmentType}.`
    ));
  }
  if (sortedMembers.length !== entityKeys.length) {
    globalBlockers.push(blocker("inventory_duplicate_entity", "Authoritative inventory contains duplicate equipment entities."));
  }
  if (rawMembers.some((entityKey) => !entityKey)) {
    globalBlockers.push(blocker("inventory_invalid_entity", "Authoritative inventory contains an empty equipment identity."));
  }
  const requiredSignatureKeys = ["algorithm", "evaluator", "inventory", "evidence"] as const;
  for (const signatureKey of requiredSignatureKeys) {
    if (!input.signatures[signatureKey].trim()) {
      globalBlockers.push(blocker("signature_missing", `Required ${signatureKey} signature is missing.`));
    }
  }
  if (!input.algorithm.id.trim() || !input.algorithm.version.trim()) {
    globalBlockers.push(blocker("algorithm_invalid", "Algorithm ID and version must be non-empty."));
  }

  const sortedRoles = input.algorithm.requiredRoles.slice().sort((left, right) => compareText(
    roleRequirementKey(left),
    roleRequirementKey(right)
  ));
  if (sortedRoles.length === 0) {
    globalBlockers.push(blocker("required_roles_empty", "Algorithm declares no required roles."));
  }
  const uniqueRoles = new Map<string, FleetGuardRoleRequirement>();
  for (const rawRole of sortedRoles) {
    const role = canonicalRoleRequirement(rawRole);
    const identity = normalizedRole(role.role);
    if (
      !identity
      || !role.label
      || role.quantityKind === "unknown"
      || (typeof role.minHistoryDays === "number" && (!Number.isFinite(role.minHistoryDays) || role.minHistoryDays < 0))
    ) {
      globalBlockers.push(blocker(
        "required_role_invalid",
        "Algorithm contains a required role without a stable role, label, quantity, or history requirement.",
        role.role ? { role: role.role } : {}
      ));
      continue;
    }
    if (uniqueRoles.has(identity)) {
      globalBlockers.push(blocker(
        "required_role_duplicate",
        `Algorithm declares role ${role.role} more than once.`,
        { role: role.role }
      ));
      continue;
    }
    uniqueRoles.set(identity, role);
  }

  if (input.inventory.status === "absent") {
    if (rawMembers.some(Boolean) || input.lookups.length > 0) {
      globalBlockers.push(blocker(
        "inventory_absent_conflict",
        "Inventory is marked absent but equipment members or point lookup evidence are present."
      ));
    }
    const contradictions = sortedUniqueBlockers(globalBlockers);
    if (contradictions.length > 0) {
      return {
        state: "blocked",
        ...base,
        roleFamilies: [],
        entities: [],
        coverage: { expected: 0, bound: 0, dataReady: 0, authorized: 0 },
        warnings: [],
        blockers: contradictions,
        primaryBlocker: contradictions[0]!
      };
    }
    const absent = blocker(
      "inventory_absent",
      `Authoritative inventory confirms there is no ${input.algorithm.equipmentType} equipment.`
    );
    return {
      state: "not_applicable",
      ...base,
      roleFamilies: [],
      entities: [],
      coverage: { expected: 0, bound: 0, dataReady: 0, authorized: 0 },
      warnings: [],
      blockers: [absent],
      primaryBlocker: absent
    };
  }

  if (input.inventory.status === "unknown") {
    globalBlockers.push(blocker("inventory_unknown", "Authoritative equipment availability is unknown."));
  }
  if (input.inventory.status === "present" && entityKeys.length === 0) {
    globalBlockers.push(blocker("inventory_empty", "Inventory is marked present but has no equipment members."));
  }
  if (!input.evaluator.id.trim() || !input.evaluator.requiredVersion.trim()) {
    globalBlockers.push(blocker("evaluator_invalid", "Evaluator ID and required version must be non-empty."));
  } else if (input.evaluator.status === "missing") {
    globalBlockers.push(blocker("evaluator_missing", `Evaluator ${input.evaluator.id.trim()} is not registered.`));
  } else if (
    !input.evaluator.registeredVersion?.trim()
    || input.evaluator.registeredVersion.trim() !== input.evaluator.requiredVersion.trim()
  ) {
    globalBlockers.push(blocker(
      "evaluator_version_mismatch",
      `Evaluator ${input.evaluator.id.trim()} requires ${input.evaluator.requiredVersion.trim()}; registered ${input.evaluator.registeredVersion?.trim() || "unknown"}.`
    ));
  }

  const selectedRoleFamilies: FleetGuardSelectedRoleFamily[] = [];
  for (const role of uniqueRoles.values()) {
    const selection = selectRoleFamily(role, input.roleFamilies);
    globalBlockers.push(...selection.blockers);
    if (selection.selected) selectedRoleFamilies.push(selection.selected);
  }
  selectedRoleFamilies.sort((left, right) => compareText(selectedFamilyKey(left), selectedFamilyKey(right)));
  const selectedLockedVersions = [...new Set(selectedRoleFamilies
    .filter((family) => family.source === "locked_template")
    .map((family) => family.templateVersion)
    .filter((version): version is string => Boolean(version)))]
    .sort(compareText);
  if (selectedLockedVersions.length > 1) {
    globalBlockers.push(blocker(
      "template_version_conflict",
      `Selected locked role families span multiple template versions: ${selectedLockedVersions.join(", ")}.`
    ));
  }
  if (selectedLockedVersions.length > 0 && !input.signatures.template?.trim()) {
    const firstLockedRole = selectedRoleFamilies.find((family) => family.source === "locked_template")?.role;
    globalBlockers.push(blocker(
      "template_signature_missing",
      "A locked role-family template requires a non-empty template content signature.",
      firstLockedRole ? { role: firstLockedRole } : {}
    ));
  }
  const selectedFamilyByRole = new Map(selectedRoleFamilies.map((family) => [normalizedRole(family.role), family]));

  const lookups = input.lookups.slice().sort((left, right) => compareText(lookupKey(left), lookupKey(right)));

  const mutableEntities: MutableEntityPlan[] = entityKeys.map((entityKey) => {
    const entityBlockers: FleetGuardBlocker[] = [];
    const entityWarnings: FleetGuardWarning[] = [];
    const bindings: FleetGuardExactBinding[] = [];
    const selected: SelectedObservation[] = [];
    let structurallyBound = selectedRoleFamilies.length === uniqueRoles.size;
    let dataReady = structurallyBound;
    for (const role of uniqueRoles.values()) {
      const family = selectedFamilyByRole.get(normalizedRole(role.role));
      if (!family) {
        structurallyBound = false;
        dataReady = false;
        continue;
      }
      const matchingLookups = lookups.filter((lookup) =>
        normalizedIdentity(lookup.entityKey) === normalizedIdentity(entityKey)
        && normalizedFamily(lookup.familyKey) === normalizedFamily(family.familyKey)
      );
      if (matchingLookups.length === 0) {
        entityBlockers.push(blocker(
          "lookup_unknown",
          `${entityKey} ${role.label} exact lookup has no evidence row.`,
          { entityKey, role: role.role }
        ));
        structurallyBound = false;
        dataReady = false;
        continue;
      }
      if (matchingLookups.length > 1) {
        entityBlockers.push(blocker(
          "lookup_conflict",
          `${entityKey} ${role.label} has ${matchingLookups.length} exact lookup rows.`,
          { entityKey, role: role.role }
        ));
        structurallyBound = false;
        dataReady = false;
        continue;
      }
      const lookup = matchingLookups[0];
      if (!lookup) continue;
      if (lookup.status !== "found") {
        const lookupBlocker = lookup.observations.length > 0
          ? blocker(
            "lookup_conflict",
            `${entityKey} ${role.label} lookup says ${lookup.status} but returned observations.`,
            { entityKey, role: role.role }
          )
          : lookup.status === "absent"
            ? blocker(
              "point_missing",
              `${entityKey} is explicitly missing exact ${role.label} family ${family.familyKey}.`,
              { entityKey, role: role.role }
            )
            : lookup.status === "unknown"
            ? blocker("lookup_unknown", `${entityKey} ${role.label} exact lookup is unknown.`, { entityKey, role: role.role })
            : lookup.status === "timeout"
              ? blocker("lookup_timeout", `${entityKey} ${role.label} exact lookup timed out.`, { entityKey, role: role.role })
              : lookup.status === "failed"
                ? blocker("lookup_failed", `${entityKey} ${role.label} exact lookup failed.`, { entityKey, role: role.role })
                : blocker("lookup_conflict", `${entityKey} ${role.label} exact lookup evidence conflicts.`, { entityKey, role: role.role });
        entityBlockers.push(lookupBlocker);
        structurallyBound = false;
        dataReady = false;
        continue;
      }
      if (lookup.observations.length !== 1) {
        entityBlockers.push(blocker(
          lookup.observations.length > 1 ? "point_multiple" : "lookup_conflict",
          lookup.observations.length > 1
            ? `${entityKey} has ${lookup.observations.length} exact points for ${role.label} family ${family.familyKey}.`
            : `${entityKey} ${role.label} lookup says found but returned no observation.`,
          { entityKey, role: role.role }
        ));
        structurallyBound = false;
        dataReady = false;
        continue;
      }
      const observation = lookup.observations[0];
      if (!observation) continue;
      if (
        normalizedIdentity(observation.entityKey) !== normalizedIdentity(entityKey)
        || normalizedFamily(observation.familyKey) !== normalizedFamily(family.familyKey)
      ) {
        entityBlockers.push(blocker(
          "lookup_conflict",
          `${entityKey} ${role.label} lookup returned an observation outside the exact entity-family key.`,
          { entityKey, role: role.role }
        ));
        structurallyBound = false;
        dataReady = false;
        continue;
      }
      const validation = validateObservation(entityKey, role, observation);
      entityBlockers.push(...validation.structural, ...validation.data);
      entityWarnings.push(...metadataWarnings(entityKey, role, observation));
      if (validation.structural.length > 0) structurallyBound = false;
      if (validation.structural.length > 0 || validation.data.length > 0) dataReady = false;
      if (observation.pointId.trim() && observation.objectRef.trim()) {
        bindings.push(exactBinding(role, family, observation));
      }
      selected.push({ entityKey, role, family, observation });
    }
    bindings.sort((left, right) => compareText(normalizedRole(left.role), normalizedRole(right.role)));
    return {
      entityKey,
      bindings,
      blockers: entityBlockers,
      warnings: entityWarnings,
      selected,
      structurallyBound,
      dataReady
    };
  });

  const duplicateBlockers = [
    ...duplicateIdentityBlockers(mutableEntities, "pointId"),
    ...duplicateIdentityBlockers(mutableEntities, "objectRef")
  ];
  for (const duplicate of duplicateBlockers) {
    const entity = mutableEntities.find((entry) =>
      normalizedIdentity(entry.entityKey) === normalizedIdentity(duplicate.entityKey ?? "")
    );
    if (!entity) continue;
    entity.blockers.push(duplicate);
    entity.structurallyBound = false;
    entity.dataReady = false;
  }

  const entities: FleetGuardEntityPlan[] = mutableEntities.map((entity) => {
    const entityBlockers = sortedUniqueBlockers(entity.blockers);
    const warnings = sortedUniqueWarnings(entity.warnings);
    return {
      entityKey: entity.entityKey,
      state: entityBlockers.length === 0 && entity.dataReady ? "ready" : "blocked",
      bindings: entity.bindings,
      blockers: entityBlockers,
      warnings,
      bound: entity.structurallyBound,
      dataReady: entity.structurallyBound && entity.dataReady
    };
  });
  const warnings = sortedUniqueWarnings(entities.flatMap((entity) => entity.warnings));
  const blockers = sortedUniqueBlockers([
    ...globalBlockers,
    ...entities.flatMap((entity) => entity.blockers)
  ]);
  const coverage = {
    expected: entityKeys.length,
    bound: entities.filter((entity) => entity.bound).length,
    dataReady: entities.filter((entity) => entity.dataReady).length,
    authorized: 0
  };
  const state = blockers.length === 0 ? "ready" : "blocked";
  if (state === "ready") coverage.authorized = coverage.expected;
  return {
    state,
    ...base,
    roleFamilies: selectedRoleFamilies,
    entities,
    coverage,
    warnings,
    blockers,
    ...(blockers[0] ? { primaryBlocker: blockers[0] } : {})
  };
}
