export const FDD_BINDING_PROPOSAL_SCHEMA_VERSION = "fleetguard-binding-proposal-v1";
export const FDD_BINDING_PROPOSAL_MAX_JSON_CHARS = 16_384;

export const FDD_BINDING_PROPOSAL_ABSTAIN_REASONS = [
  "insufficient_evidence",
  "ambiguous_families",
  "unsupported_equipment",
  "no_matching_family",
  "evidence_unavailable"
] as const;

export type FddBindingProposalAbstainReason = typeof FDD_BINDING_PROPOSAL_ABSTAIN_REASONS[number];

export interface FddBindingProposalBinding {
  role: string;
  pointFamilyKey: string;
  evidenceRefIds: string[];
}

export interface FddBindingProposalProposed {
  schemaVersion: typeof FDD_BINDING_PROPOSAL_SCHEMA_VERSION;
  outcome: "proposed";
  projectId: string;
  evidenceSnapshotHash: string;
  algorithmSignature: string;
  bindings: FddBindingProposalBinding[];
}

export interface FddBindingProposalAbstain {
  schemaVersion: typeof FDD_BINDING_PROPOSAL_SCHEMA_VERSION;
  outcome: "abstain";
  projectId: string;
  evidenceSnapshotHash: string;
  algorithmSignature: string;
  reason: FddBindingProposalAbstainReason;
}

export type FddBindingProposal = FddBindingProposalProposed | FddBindingProposalAbstain;

export interface FddBindingProposalFamilyEvidence {
  projectId: string;
  pointFamilyKey: string;
}

export type FddBindingProposalEvidenceRefKind = "family_fact" | "found_lookup" | "lookup_fact";

/** Typed, project-bound evidence references emitted by the frozen snapshot. */
export interface FddBindingProposalEvidenceRef {
  id: string;
  projectId: string;
  pointFamilyKey: string;
  kind: FddBindingProposalEvidenceRefKind;
}

export interface FddBindingProposalValidationContext {
  projectId: string;
  evidenceSnapshotHash: string;
  algorithmSignature: string;
  requiredRoles: string[];
  families: FddBindingProposalFamilyEvidence[];
  evidenceRefs: FddBindingProposalEvidenceRef[];
}

export type FddBindingProposalValidationErrorCode =
  | "response_too_large"
  | "invalid_json"
  | "invalid_shape"
  | "unexpected_field"
  | "schema_version_mismatch"
  | "invalid_outcome"
  | "project_id_mismatch"
  | "snapshot_hash_mismatch"
  | "algorithm_signature_mismatch"
  | "invalid_role"
  | "duplicate_role"
  | "missing_role"
  | "invalid_family"
  | "cross_project_family"
  | "invalid_evidence_ref"
  | "duplicate_evidence_ref"
  | "found_lookup_evidence_required"
  | "invalid_abstain_reason";

export interface FddBindingProposalValidationFailure {
  ok: false;
  code: FddBindingProposalValidationErrorCode;
  reason: string;
}

export interface FddBindingProposalValidationSuccess {
  ok: true;
  proposal: FddBindingProposal;
}

export type FddBindingProposalValidationResult =
  | FddBindingProposalValidationSuccess
  | FddBindingProposalValidationFailure;

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareText);
  const canonicalExpected = [...expected].sort(compareText);
  return actual.length === canonicalExpected.length
    && actual.every((key, index) => key === canonicalExpected[index]);
}

function unexpectedFieldFailure(): FddBindingProposalValidationFailure {
  return {
    ok: false,
    code: "unexpected_field",
    reason: "Proposal contains a field outside the versioned schema."
  };
}

function validIdentifier(value: string): boolean {
  return value === value.trim()
    && /^[A-Za-z][A-Za-z0-9_]*$/u.test(value);
}

function validPointFamilyKey(value: string): boolean {
  return value === value.trim()
    && /^[a-z0-9][a-z0-9_:-]*$/u.test(value);
}

function validEvidenceRefId(value: string): boolean {
  return value === value.trim()
    && /^[a-z][a-z0-9_-]{0,127}$/u.test(value);
}

function validateEnvelope(
  value: Record<string, unknown>,
  context: FddBindingProposalValidationContext
): FddBindingProposalValidationFailure | undefined {
  if (value.schemaVersion !== FDD_BINDING_PROPOSAL_SCHEMA_VERSION) {
    return {
      ok: false,
      code: "schema_version_mismatch",
      reason: "Proposal schema version does not match the supported version."
    };
  }
  if (value.projectId !== context.projectId) {
    return {
      ok: false,
      code: "project_id_mismatch",
      reason: "Proposal does not reference the project that owns the frozen evidence snapshot."
    };
  }
  if (value.evidenceSnapshotHash !== context.evidenceSnapshotHash) {
    return {
      ok: false,
      code: "snapshot_hash_mismatch",
      reason: "Proposal does not reference the frozen evidence snapshot."
    };
  }
  if (value.algorithmSignature !== context.algorithmSignature) {
    return {
      ok: false,
      code: "algorithm_signature_mismatch",
      reason: "Proposal does not reference the requested algorithm contract."
    };
  }
  return undefined;
}

function validateProposed(
  value: Record<string, unknown>,
  context: FddBindingProposalValidationContext
): FddBindingProposalValidationResult {
  if (!exactKeys(value, ["schemaVersion", "outcome", "projectId", "evidenceSnapshotHash", "algorithmSignature", "bindings"])) {
    return unexpectedFieldFailure();
  }
  if (!Array.isArray(value.bindings)) {
    return { ok: false, code: "invalid_shape", reason: "Proposed outcome requires a bindings array." };
  }
  const requiredRoles = context.requiredRoles.slice().sort(compareText);
  if (new Set(requiredRoles).size !== requiredRoles.length || requiredRoles.some((role) => !validIdentifier(role))) {
    return { ok: false, code: "invalid_role", reason: "Validation context contains an invalid required role." };
  }
  const bindings: FddBindingProposalBinding[] = [];
  const seenRoles = new Set<string>();
  for (const rawBinding of value.bindings) {
    if (!isRecord(rawBinding)) {
      return { ok: false, code: "invalid_shape", reason: "Each binding must be an object." };
    }
    if (!exactKeys(rawBinding, ["role", "pointFamilyKey", "evidenceRefIds"])) {
      return unexpectedFieldFailure();
    }
    if (typeof rawBinding.role !== "string" || !validIdentifier(rawBinding.role) || !requiredRoles.includes(rawBinding.role)) {
      return { ok: false, code: "invalid_role", reason: "Proposal contains a role outside the algorithm contract." };
    }
    if (seenRoles.has(rawBinding.role)) {
      return { ok: false, code: "duplicate_role", reason: "Proposal binds a required role more than once." };
    }
    seenRoles.add(rawBinding.role);
    if (typeof rawBinding.pointFamilyKey !== "string" || !validPointFamilyKey(rawBinding.pointFamilyKey)) {
      return { ok: false, code: "invalid_family", reason: "Proposal contains a non-canonical point family key." };
    }
    const allFamilyEvidence = context.families.filter((family) => family.pointFamilyKey === rawBinding.pointFamilyKey);
    if (allFamilyEvidence.length === 0) {
      return { ok: false, code: "invalid_family", reason: "Proposed point family is absent from the frozen snapshot." };
    }
    const projectFamilyEvidence = allFamilyEvidence.filter((family) => family.projectId === context.projectId);
    if (projectFamilyEvidence.length === 0) {
      return { ok: false, code: "cross_project_family", reason: "Proposed point family belongs to another project." };
    }
    if (!Array.isArray(rawBinding.evidenceRefIds) || rawBinding.evidenceRefIds.length === 0) {
      return { ok: false, code: "invalid_evidence_ref", reason: "Each binding must cite snapshot evidence." };
    }
    const evidenceRefIds: string[] = [];
    const allowedRefs = context.evidenceRefs.filter((reference) =>
      reference.projectId === context.projectId
      && reference.pointFamilyKey === rawBinding.pointFamilyKey
    );
    const allowedRefsById = new Map(allowedRefs.map((reference) => [reference.id, reference]));
    for (const rawEvidenceRef of rawBinding.evidenceRefIds) {
      if (typeof rawEvidenceRef !== "string" || !validEvidenceRefId(rawEvidenceRef) || !allowedRefsById.has(rawEvidenceRef)) {
        return { ok: false, code: "invalid_evidence_ref", reason: "Binding cites evidence outside its project and family." };
      }
      if (evidenceRefIds.includes(rawEvidenceRef)) {
        return { ok: false, code: "duplicate_evidence_ref", reason: "Binding repeats an evidence reference." };
      }
      evidenceRefIds.push(rawEvidenceRef);
    }
    if (!evidenceRefIds.some((referenceId) => allowedRefsById.get(referenceId)?.kind === "found_lookup")) {
      return {
        ok: false,
        code: "found_lookup_evidence_required",
        reason: "Each proposed binding must cite a real found exact-lookup fact."
      };
    }
    bindings.push({
      role: rawBinding.role,
      pointFamilyKey: rawBinding.pointFamilyKey,
      evidenceRefIds: evidenceRefIds.sort(compareText)
    });
  }
  const proposedRoles = [...seenRoles].sort(compareText);
  if (proposedRoles.length !== requiredRoles.length
    || requiredRoles.some((role, index) => role !== proposedRoles[index])) {
    return { ok: false, code: "missing_role", reason: "Proposed outcome must bind every required role exactly once." };
  }
  return {
    ok: true,
    proposal: {
      schemaVersion: FDD_BINDING_PROPOSAL_SCHEMA_VERSION,
      outcome: "proposed",
      projectId: context.projectId,
      evidenceSnapshotHash: context.evidenceSnapshotHash,
      algorithmSignature: context.algorithmSignature,
      bindings: bindings.sort((left, right) => compareText(left.role, right.role))
    }
  };
}

function validateAbstain(
  value: Record<string, unknown>,
  context: FddBindingProposalValidationContext
): FddBindingProposalValidationResult {
  if (!exactKeys(value, ["schemaVersion", "outcome", "projectId", "evidenceSnapshotHash", "algorithmSignature", "reason"])) {
    return unexpectedFieldFailure();
  }
  if (typeof value.reason !== "string"
    || !(FDD_BINDING_PROPOSAL_ABSTAIN_REASONS as readonly string[]).includes(value.reason)) {
    return { ok: false, code: "invalid_abstain_reason", reason: "Abstain reason is outside the versioned enum." };
  }
  return {
    ok: true,
    proposal: {
      schemaVersion: FDD_BINDING_PROPOSAL_SCHEMA_VERSION,
      outcome: "abstain",
      projectId: context.projectId,
      evidenceSnapshotHash: context.evidenceSnapshotHash,
      algorithmSignature: context.algorithmSignature,
      reason: value.reason as FddBindingProposalAbstainReason
    }
  };
}

export function validateFddBindingProposal(
  value: unknown,
  context: FddBindingProposalValidationContext
): FddBindingProposalValidationResult {
  if (!isRecord(value)) {
    return { ok: false, code: "invalid_shape", reason: "Proposal must be a JSON object." };
  }
  if (value.outcome !== "proposed" && value.outcome !== "abstain") {
    return { ok: false, code: "invalid_outcome", reason: "Proposal outcome must be proposed or abstain." };
  }
  const envelopeFailure = validateEnvelope(value, context);
  if (envelopeFailure) return envelopeFailure;
  return value.outcome === "proposed"
    ? validateProposed(value, context)
    : validateAbstain(value, context);
}

export function parseFddBindingProposalJson(
  text: string,
  context: FddBindingProposalValidationContext
): FddBindingProposalValidationResult {
  if (text.length > FDD_BINDING_PROPOSAL_MAX_JSON_CHARS) {
    return { ok: false, code: "response_too_large", reason: "Proposal response exceeds the bounded JSON size." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.trim()) as unknown;
  } catch {
    return { ok: false, code: "invalid_json", reason: "Proposal response is not strict JSON." };
  }
  return validateFddBindingProposal(parsed, context);
}
