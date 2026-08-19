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
