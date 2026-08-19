import { createHash } from "node:crypto";
import type {
  FddAlgorithmRequirement,
  FddEquipmentAvailability,
  FddPointCandidate,
  FleetGuardPlanInput,
  LegacyV4FleetCandidateEvidence
} from "@building-agent/fdd-deployment-planner";
import { fddEngineeringUnitIsAccepted } from "./equipmentEvidence.js";

export const FDD_BINDING_PROPOSER_EVIDENCE_ADAPTER_VERSION = "fleetguard-v4-shadow-adapter-v1";

export interface FddBindingProposerBrickPointFact {
  subjectKey: string;
  pointName: string;
  entityKey: string;
  brickClass: string;
  unit?: string;
  /** Required roles matched by the existing deterministic Brick matcher. */
  matchedRoleSlots: string[];
}

export interface FddBindingProposerEvidenceAdapterInput {
  projectId: string;
  algorithm: FddAlgorithmRequirement;
  evaluatorId: string;
  evaluatorAvailable: boolean;
  targetAvailability: FddEquipmentAvailability;
  authoritativeInventory: boolean;
  targetEntityKeys: string[];
  candidates: LegacyV4FleetCandidateEvidence[];
  brickPoints: FddBindingProposerBrickPointFact[];
  sourceDataSignature: string;
  inventorySignature: string;
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => typeof record[key] !== "undefined")
    .sort(compareText)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function hash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function fddFleetGuardAlgorithmEvidenceSignature(input: {
  projectId: string;
  algorithm: FddAlgorithmRequirement;
}): string {
  const requiredPoints = input.algorithm.requiredPoints
    .filter((point) => point.required)
    .slice()
    .sort((left, right) => compareText(left.slot.trim(), right.slot.trim()));
  return hash([input.projectId.trim(), input.algorithm.id, input.algorithm.version, requiredPoints]);
}

export function fddFleetGuardEvaluatorEvidenceSignature(input: {
  projectId: string;
  evaluatorId: string;
  evaluatorAvailable: boolean;
}): string {
  return hash([
    input.projectId.trim(),
    input.evaluatorId.trim(),
    input.evaluatorAvailable,
    "unversioned_registry"
  ]);
}

function entityKey(value: string): string {
  return value.trim().toUpperCase();
}

function familyKey(value: string | undefined): string | undefined {
  const key = value?.trim().toLowerCase();
  return key && /^[a-z0-9][a-z0-9_:-]*$/u.test(key) ? key : undefined;
}

function candidateKey(candidate: LegacyV4FleetCandidateEvidence): string {
  return [
    entityKey(candidate.canonicalEntityKey),
    candidate.candidate.slot.trim(),
    familyKey(candidate.pointFamilyKey) ?? "",
    candidate.candidate.pointName.trim(),
    candidate.candidate.objectRef?.trim() ?? ""
  ].join("|");
}

function observationFor(input: {
  candidate: FddPointCandidate;
  entityKey: string;
  familyKey: string;
  requirements: FddAlgorithmRequirement["requiredPoints"];
  minHistoryDays: number;
  exactBrickFacts: FddBindingProposerBrickPointFact[];
}): FleetGuardPlanInput["lookups"][number]["observations"][number] {
  const exactBrickFacts = input.exactBrickFacts;
  const exactBrickFact = exactBrickFacts.length === 1 ? exactBrickFacts[0] : undefined;
  const requiredKinds = [...new Set(input.requirements.map((requirement) => requirement.quantityKind))];
  const quantityVerified = Boolean(
    exactBrickFact
    && requiredKinds.length === 1
    && requiredKinds[0] !== "unknown"
    && input.requirements.every((requirement) => exactBrickFact.matchedRoleSlots.includes(requirement.slot.trim()))
  );
  const acceptableUnitSets = input.requirements.map((requirement) => requirement.acceptableUnits ?? []);
  const unitNotRequired = acceptableUnitSets.every((units) => units.length === 0);
  const directBrickUnit = exactBrickFact?.unit?.trim();
  const historyDays = input.candidate.historyDays;
  return {
    entityKey: input.entityKey,
    familyKey: input.familyKey,
    pointId: exactBrickFact?.subjectKey.trim() ?? "",
    objectRef: input.candidate.objectRef?.trim() ?? "",
    ownership: exactBrickFacts.length === 1
      ? { status: "verified", ownerEntityKey: input.entityKey, isPointOf: true }
      : exactBrickFacts.length > 1
        ? { status: "conflict", isPointOf: null }
        : { status: "unknown", isPointOf: null },
    quantity: {
      status: quantityVerified ? "verified" : "unknown",
      kind: requiredKinds.length === 1 ? requiredKinds[0]! : "unknown"
    },
    unit: unitNotRequired
      ? { status: "not_required" }
      : directBrickUnit
        ? {
            status: acceptableUnitSets.every((units) => units.length > 0 && fddEngineeringUnitIsAccepted(directBrickUnit, units))
              ? "match"
              : "mismatch",
            unit: directBrickUnit
          }
        : { status: "unknown" },
    history: input.minHistoryDays <= 0
      ? { status: "sufficient", observedDays: 0 }
      : typeof historyDays === "number" && Number.isFinite(historyDays)
        ? {
            status: historyDays >= input.minHistoryDays ? "sufficient" : "insufficient",
            observedDays: historyDays
          }
        : { status: "unknown" }
  };
}

/**
 * Pure projection of already-collected v4/Brick evidence. It performs no I/O,
 * never upgrades heuristic v4 families into authorizing facts, and uses
 * `unknown` instead of claiming absence when the catalog did not prove it.
 */
export function buildFleetGuardShadowInputFromV4Evidence(
  input: FddBindingProposerEvidenceAdapterInput
): FleetGuardPlanInput {
  const projectId = input.projectId.trim();
  const members = [...new Set(input.targetEntityKeys.map(entityKey).filter(Boolean))].sort(compareText);
  const requiredPoints = input.algorithm.requiredPoints
    .filter((point) => point.required)
    .slice()
    .sort((left, right) => compareText(left.slot.trim(), right.slot.trim()));
  if (
    members.length > 10_000
    || requiredPoints.length > 64
    || input.candidates.length > 8_192
    || input.brickPoints.length > 8_192
  ) {
    throw new Error("FDD proposer evidence exceeds bounded projection limits.");
  }
  const candidates = input.candidates
    .filter((entry) => Boolean(familyKey(entry.pointFamilyKey)))
    .slice()
    .sort((left, right) => compareText(candidateKey(left), candidateKey(right)));
  const candidateGroups = new Map<string, LegacyV4FleetCandidateEvidence[]>();
  const familiesByRole = new Map<string, Set<string>>();
  const rolesByFamily = new Map<string, Set<string>>();
  for (const entry of candidates) {
    const family = familyKey(entry.pointFamilyKey)!;
    const role = entry.candidate.slot.trim();
    const key = `${entityKey(entry.canonicalEntityKey)}|${family}`;
    const grouped = candidateGroups.get(key);
    if (grouped) grouped.push(entry);
    else candidateGroups.set(key, [entry]);
    const roleFamilies = familiesByRole.get(role) ?? new Set<string>();
    roleFamilies.add(family);
    familiesByRole.set(role, roleFamilies);
    const familyRoles = rolesByFamily.get(family) ?? new Set<string>();
    familyRoles.add(role);
    rolesByFamily.set(family, familyRoles);
  }
  const roleFamilies: FleetGuardPlanInput["roleFamilies"] = [];
  for (const point of requiredPoints) {
    const families = [...(familiesByRole.get(point.slot.trim()) ?? [])].sort(compareText);
    for (const family of families) {
      roleFamilies.push({
        role: point.slot.trim(),
        familyKey: family,
        status: families.length === 1 ? "unknown" : "conflict",
        source: "legacy_v4_proposal"
      });
    }
  }
  const brickFacts = input.brickPoints.slice().sort((left, right) => compareText(
    `${entityKey(left.entityKey)}|${left.pointName.trim().toLowerCase()}|${left.brickClass.trim()}`,
    `${entityKey(right.entityKey)}|${right.pointName.trim().toLowerCase()}|${right.brickClass.trim()}`
  ));
  const brickFactsByEntityPoint = new Map<string, FddBindingProposerBrickPointFact[]>();
  for (const fact of brickFacts) {
    const key = `${entityKey(fact.entityKey)}|${fact.pointName.trim().toLowerCase()}`;
    const facts = brickFactsByEntityPoint.get(key);
    if (facts) facts.push(fact);
    else brickFactsByEntityPoint.set(key, [fact]);
  }
  const lookups: FleetGuardPlanInput["lookups"] = [];
  const allFamilies = [...rolesByFamily.keys()].sort(compareText);
  if (allFamilies.length > 128 || members.length * allFamilies.length > 8_192) {
    throw new Error("FDD proposer exact-lookup projection exceeds bounded limits.");
  }
  const requirementsByFamily = new Map(allFamilies.map((family) => [
    family,
    requiredPoints.filter((point) => rolesByFamily.get(family)?.has(point.slot.trim()))
  ]));
  for (const member of members) {
    for (const family of allFamilies) {
        const rawMatches = candidateGroups.get(`${member}|${family}`) ?? [];
        const uniqueMatches = new Map<string, LegacyV4FleetCandidateEvidence>();
        for (const match of rawMatches) {
          const key = [match.candidate.pointName.trim(), match.candidate.objectRef?.trim() ?? ""].join("|");
          if (!uniqueMatches.has(key)) uniqueMatches.set(key, match);
        }
        const matches = [...uniqueMatches.values()];
        if (matches.length === 0) {
          lookups.push({ entityKey: member, familyKey: family, status: "unknown", observations: [] });
          continue;
        }
        if (matches.length !== 1) {
          lookups.push({ entityKey: member, familyKey: family, status: "conflict", observations: [] });
          continue;
        }
        const requirements = requirementsByFamily.get(family) ?? [];
        const exactBrickFacts = brickFactsByEntityPoint.get(
          `${member}|${matches[0]!.candidate.pointName.trim().toLowerCase()}`
        ) ?? [];
        lookups.push({
          entityKey: member,
          familyKey: family,
          status: "found",
          observations: [observationFor({
            candidate: matches[0]!.candidate,
            entityKey: member,
            familyKey: family,
            requirements,
            minHistoryDays: Math.max(0, ...requirements.map((point) => point.historyRequirement?.minDays ?? 0)),
            exactBrickFacts
          })]
        });
    }
  }
  const inventoryStatus = input.authoritativeInventory && input.targetAvailability.status === "available"
    ? "present"
    : input.authoritativeInventory
      && input.targetAvailability.status === "not_available"
      && members.length === 0
        ? "absent"
        : "unknown";
  const signatures = {
    algorithm: fddFleetGuardAlgorithmEvidenceSignature({ projectId, algorithm: input.algorithm }),
    evaluator: fddFleetGuardEvaluatorEvidenceSignature({
      projectId,
      evaluatorId: input.evaluatorId,
      evaluatorAvailable: input.evaluatorAvailable
    }),
    inventory: hash([projectId, input.inventorySignature, inventoryStatus, members]),
    evidence: hash([
      projectId,
      input.sourceDataSignature,
      FDD_BINDING_PROPOSER_EVIDENCE_ADAPTER_VERSION,
      candidates.map((entry) => ({
        entityKey: entityKey(entry.canonicalEntityKey),
        role: entry.candidate.slot.trim(),
        familyKey: familyKey(entry.pointFamilyKey),
        pointName: entry.candidate.pointName.trim(),
        objectRef: entry.candidate.objectRef?.trim(),
        unit: entry.candidate.unit?.trim(),
        unitCompatibility: entry.candidate.unitCompatibility,
        historyDays: entry.candidate.historyDays
      })),
      { brickFacts: brickFacts.map((fact) => ({
        subjectKey: fact.subjectKey,
        pointName: fact.pointName,
        entityKey: fact.entityKey,
        brickClass: fact.brickClass,
        unit: fact.unit,
        matchedRoleSlots: fact.matchedRoleSlots
      })) }
    ])
  };
  return {
    algorithm: {
      id: input.algorithm.id,
      version: input.algorithm.version,
      equipmentType: input.targetAvailability.equipmentType,
      requiredRoles: requiredPoints.map((point) => ({
        role: point.slot,
        label: point.label,
        quantityKind: point.quantityKind,
        ...(point.acceptableUnits?.length ? { acceptableUnits: [...point.acceptableUnits] } : {}),
        ...(point.historyRequirement ? { minHistoryDays: point.historyRequirement.minDays } : {})
      }))
    },
    evaluator: {
      id: input.evaluatorId,
      requiredVersion: input.algorithm.version,
      status: input.evaluatorAvailable ? "available" : "missing",
      // The current runtime registry is boolean-only. Leaving the registered
      // version absent is intentionally fail-closed until a versioned registry exists.
    },
    inventory: {
      status: inventoryStatus,
      equipmentType: input.targetAvailability.equipmentType,
      members: members.map((member) => ({ entityKey: member }))
    },
    roleFamilies,
    lookups,
    signatures
  };
}
