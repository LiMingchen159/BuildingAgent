export type FddEquipmentType = "ahu" | "chiller" | "pump" | "cooling_tower" | "fcu" | "vav" | "sensor";
export type FddDeployabilityStatus = "can_deploy" | "uncertain" | "cannot_deploy";
export type FddApplicability = "applicable" | "no_equipment" | "unknown";
export type FddEquipmentAvailabilityStatus = "available" | "not_available" | "unknown";
export type FddCheckSource = "auto" | "manual";
export type FddQuantityKind = "temperature" | "flow_rate" | "power" | "energy" | "load" | "status" | "pressure" | "humidity" | "position" | "speed" | "current" | "level" | "concentration" | "unknown";
export type FddUnitCompatibility = "match" | "convertible" | "mismatch" | "unknown";
export type FddFleetMappingStrategy = "entity_independent" | "homogeneous_template";

export interface FddEquipmentAvailability {
  equipmentType: FddEquipmentType;
  status: FddEquipmentAvailabilityStatus;
  entityCount: number;
  entityKeys?: string[];
  reason?: string;
  evidenceSources?: string[];
}

export interface FddRequiredPoint {
  slot: string;
  label: string;
  semantic: string;
  required: boolean;
  quantityKind: FddQuantityKind;
  unitRoleDescription: string;
  acceptableUnits?: string[];
  keywords?: string[];
  sourceSymbols?: string[];
  sourceBrickClasses?: string[];
  historyRequirement?: {
    minDays: number;
    preferredDays: number;
  };
}

/** Only fields used by deterministic deployability planning. */
export interface FddAlgorithmRequirement {
  id: string;
  version: string;
  equipmentType: FddEquipmentType;
  requiredPoints: FddRequiredPoint[];
}

export interface FddPointCandidate {
  slot: string;
  pointName: string;
  entityKey?: string;
  objectRef?: string;
  unit?: string;
  unitCompatibility: FddUnitCompatibility;
  dimensionReason: string;
  rejectionReason?: string;
  confidence: number;
  reason: string;
  historyDays?: number;
}

export interface FddPointMapping {
  slot: string;
  pointName: string;
  objectRef?: string;
  unit?: string;
}

export interface FddAmbiguousInput {
  slot: string;
  label: string;
  candidates: FddPointCandidate[];
}

export interface FddEntityDeployability {
  entityKey: string;
  status: FddDeployabilityStatus;
  selectedMappings: FddPointMapping[];
  ambiguousInputs: FddAmbiguousInput[];
  missingPoints: string[];
  historyIssues: string[];
  confidence: number;
}

/** Pure planner decision. API-only workflow and persistence metadata extend this shape outside the package. */
export interface FddDeployabilityDecision {
  algorithmId?: string;
  projectTaskId?: string;
  algorithmVersion: string;
  checkPolicyVersion?: string;
  projectId: string;
  status: FddDeployabilityStatus;
  applicability?: FddApplicability;
  equipmentAvailability?: FddEquipmentAvailability;
  equipmentInventorySignature?: string;
  pointCandidates: FddPointCandidate[];
  exampleEntityKey?: string;
  selectedMappings?: FddPointMapping[];
  deployableEntities?: FddEntityDeployability[];
  mappingStrategy?: FddFleetMappingStrategy;
  templateEntityKey?: string;
  expectedEntityCount?: number;
  requiredRuntimeSlots?: string[];
  ambiguousInputs: FddAmbiguousInput[];
  rejectedCandidates: FddPointCandidate[];
  missingPoints: string[];
  historyIssues: string[];
  checkedAt: string;
  source: FddCheckSource;
  projectDataSignature: string;
}

export interface LegacyV4DeployabilityInput {
  algorithm: FddAlgorithmRequirement;
  projectId: string;
  source: FddCheckSource;
  projectDataSignature: string;
  pointCandidates: FddPointCandidate[];
  exampleEntityKey?: string;
  rejectedCandidates?: FddPointCandidate[];
  deployableEntities?: FddEntityDeployability[];
  historyIssues?: string[];
  applicability?: FddApplicability;
  equipmentAvailability?: FddEquipmentAvailability;
  equipmentInventorySignature?: string;
  checkedAt: string;
  projectTaskId?: string;
}

/** Candidate evidence normalized by the API adapter before entering the pure package. */
export interface LegacyV4FleetCandidateEvidence {
  candidate: FddPointCandidate;
  canonicalEntityKey: string;
  pointFamilyKey?: string;
}

export interface LegacyV4FleetPlanInput {
  algorithm: FddAlgorithmRequirement;
  candidates: LegacyV4FleetCandidateEvidence[];
  targetEntityKeys: string[];
  supplementalPoints?: FddRequiredPoint[];
  homogeneousTemplateEligible: boolean;
}

export interface LegacyV4FleetPlan {
  entities: FddEntityDeployability[];
  mappingStrategy: FddFleetMappingStrategy;
  templateEntityKey?: string;
}

export interface LegacyV4FleetDecisionInput {
  decision: FddDeployabilityDecision;
  plan: LegacyV4FleetPlan;
  expectedEntityCount: number;
  requiredRuntimeSlots: string[];
}

export interface LegacyV4CandidateAlignmentInput {
  algorithm: FddAlgorithmRequirement;
  candidates: LegacyV4FleetCandidateEvidence[];
  preferredEntityKey?: string;
  preferredMappings?: FddPointMapping[];
}

export interface LegacyV4CandidateAlignment {
  candidates: FddPointCandidate[];
  exampleEntityKey?: string;
  alignmentIssue?: string;
}

export interface LegacyV4CoverageInput {
  decision: FddDeployabilityDecision;
  algorithmRequiredSlots: string[];
  expectedCanonicalEntityKeys: string[];
}

export type FleetGuardState = "ready" | "blocked" | "not_applicable";
export type FleetGuardInventoryStatus = "present" | "absent" | "unknown";
export type FleetGuardRoleFamilyStatus = "verified" | "unknown" | "conflict";
export type FleetGuardRoleFamilySource =
  | "locked_template"
  | "deterministic_ontology"
  | "llm_proposal"
  | "legacy_v4_proposal"
  | "admin_proposal";
export type FleetGuardFactStatus = "verified" | "unknown" | "conflict";
export type FleetGuardUnitStatus = "match" | "mismatch" | "unknown" | "not_required";
export type FleetGuardHistoryStatus = "sufficient" | "insufficient" | "unknown" | "timeout";
export type FleetGuardMetadataStatus = "match" | "mismatch" | "unknown";

export interface FleetGuardRoleRequirement {
  role: string;
  label: string;
  quantityKind: FddQuantityKind;
  acceptableUnits?: string[];
  minHistoryDays?: number;
}

export interface FleetGuardAlgorithmRequirement {
  id: string;
  version: string;
  equipmentType: FddEquipmentType;
  requiredRoles: FleetGuardRoleRequirement[];
}

export interface FleetGuardEvaluatorRequirement {
  id: string;
  requiredVersion: string;
  status: "available" | "missing";
  registeredVersion?: string;
}

export interface FleetGuardInventoryMember {
  entityKey: string;
}

export interface FleetGuardAuthoritativeInventory {
  status: FleetGuardInventoryStatus;
  equipmentType: FddEquipmentType;
  members: FleetGuardInventoryMember[];
}

/**
 * A role-family candidate may be proposed by an LLM or legacy planner, but only
 * a verified locked template or deterministic ontology fact may authorize it.
 */
export interface FleetGuardRoleFamilyEvidence {
  role: string;
  familyKey: string;
  status: FleetGuardRoleFamilyStatus;
  source: FleetGuardRoleFamilySource;
  templateVersion?: string;
}

export interface FleetGuardOwnershipEvidence {
  status: FleetGuardFactStatus;
  ownerEntityKey?: string;
  isPointOf: boolean | null;
}

export interface FleetGuardQuantityEvidence {
  status: FleetGuardFactStatus;
  kind: FddQuantityKind;
}

export interface FleetGuardUnitEvidence {
  status: FleetGuardUnitStatus;
  unit?: string;
}

export interface FleetGuardHistoryEvidence {
  status: FleetGuardHistoryStatus;
  observedDays?: number;
  sampleCount?: number;
}

export interface FleetGuardMetadataEvidence {
  description?: string;
  descriptionStatus?: FleetGuardMetadataStatus;
  brickClass?: string;
  brickClassStatus?: FleetGuardMetadataStatus;
}

/** Exact point evidence collected by read-only adapters before planning. */
export interface FleetGuardPointObservation {
  entityKey: string;
  familyKey: string;
  pointId: string;
  objectRef: string;
  ownership: FleetGuardOwnershipEvidence;
  quantity: FleetGuardQuantityEvidence;
  unit: FleetGuardUnitEvidence;
  history: FleetGuardHistoryEvidence;
  metadata?: FleetGuardMetadataEvidence;
}

export type FleetGuardExactLookupStatus = "found" | "absent" | "unknown" | "timeout" | "failed" | "conflict";

/**
 * Authoritative outcome of one exact entity + point-family lookup. A missing
 * row is unknown, never proof that the point is absent.
 */
export interface FleetGuardExactLookupEvidence {
  entityKey: string;
  familyKey: string;
  status: FleetGuardExactLookupStatus;
  observations: FleetGuardPointObservation[];
}

export interface FleetGuardSignatures {
  algorithm: string;
  evaluator: string;
  inventory: string;
  evidence: string;
  template?: string;
  skill?: string;
  model?: string;
  tool?: string;
}

export interface FleetGuardPlanInput {
  algorithm: FleetGuardAlgorithmRequirement;
  evaluator: FleetGuardEvaluatorRequirement;
  inventory: FleetGuardAuthoritativeInventory;
  roleFamilies: FleetGuardRoleFamilyEvidence[];
  lookups: FleetGuardExactLookupEvidence[];
  signatures: FleetGuardSignatures;
}

export type FleetGuardBlockerCode =
  | "inventory_absent"
  | "inventory_unknown"
  | "inventory_equipment_mismatch"
  | "inventory_empty"
  | "inventory_absent_conflict"
  | "inventory_duplicate_entity"
  | "inventory_invalid_entity"
  | "signature_missing"
  | "algorithm_invalid"
  | "evaluator_invalid"
  | "evaluator_missing"
  | "evaluator_version_mismatch"
  | "required_roles_empty"
  | "required_role_invalid"
  | "required_role_duplicate"
  | "role_family_missing"
  | "role_family_unknown"
  | "role_family_conflict"
  | "role_family_unauthorized_source"
  | "role_family_ambiguous"
  | "template_version_missing"
  | "template_version_conflict"
  | "template_signature_missing"
  | "lookup_unknown"
  | "lookup_timeout"
  | "lookup_failed"
  | "lookup_conflict"
  | "point_missing"
  | "point_multiple"
  | "point_id_missing"
  | "object_ref_missing"
  | "ownership_unknown"
  | "ownership_conflict"
  | "ownership_mismatch"
  | "is_point_of_unverified"
  | "quantity_unknown"
  | "quantity_conflict"
  | "quantity_mismatch"
  | "unit_unknown"
  | "unit_mismatch"
  | "history_unknown"
  | "history_insufficient"
  | "history_timeout"
  | "duplicate_point_id"
  | "duplicate_object_ref";

export interface FleetGuardBlocker {
  code: FleetGuardBlockerCode;
  reason: string;
  entityKey?: string;
  role?: string;
}

export type FleetGuardWarningCode = "description_mismatch" | "brick_class_mismatch";

export interface FleetGuardWarning {
  code: FleetGuardWarningCode;
  reason: string;
  entityKey: string;
  role: string;
}

export interface FleetGuardSelectedRoleFamily {
  role: string;
  familyKey: string;
  source: "locked_template" | "deterministic_ontology";
  templateVersion?: string;
}

export interface FleetGuardExactBinding {
  role: string;
  familyKey: string;
  pointId: string;
  objectRef: string;
  unit?: string;
}

export interface FleetGuardEntityPlan {
  entityKey: string;
  state: "ready" | "blocked";
  bindings: FleetGuardExactBinding[];
  blockers: FleetGuardBlocker[];
  warnings: FleetGuardWarning[];
  bound: boolean;
  dataReady: boolean;
}

export interface FleetGuardCoverage {
  expected: number;
  bound: number;
  dataReady: number;
  authorized: number;
}

export interface FleetGuardPlan {
  state: FleetGuardState;
  planId: string;
  policyVersion: string;
  algorithm: {
    id: string;
    version: string;
    equipmentType: FddEquipmentType;
  };
  evaluator: {
    id: string;
    requiredVersion: string;
    registeredVersion?: string;
  };
  signatures: FleetGuardSignatures;
  inventory: {
    status: FleetGuardInventoryStatus;
    equipmentType: FddEquipmentType;
    entityKeys: string[];
  };
  roleFamilies: FleetGuardSelectedRoleFamily[];
  entities: FleetGuardEntityPlan[];
  coverage: FleetGuardCoverage;
  warnings: FleetGuardWarning[];
  blockers: FleetGuardBlocker[];
  primaryBlocker?: FleetGuardBlocker;
}
