import { createHash } from "node:crypto";
import type {
  FddBindingProposalEvidenceRef,
  FddBindingProposalValidationContext,
  FleetGuardExactLookupStatus,
  FleetGuardPlanInput
} from "@building-agent/fdd-deployment-planner";

export const FDD_BINDING_PROPOSER_TOOL_VERSION = "fleetguard-binding-tools-v1";

export type FddBindingProposerToolName =
  | "get_algorithm_contract"
  | "get_evaluator_facts"
  | "get_inventory_facts"
  | "list_point_families"
  | "inspect_point_family";

export interface FddBindingProposerToolDefinition {
  name: FddBindingProposerToolName;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
}

export interface FddBindingProposerSafeRole {
  role: string;
  quantityKind: string;
  acceptableUnits: string[];
  minHistoryDays: number | null;
}

export interface FddBindingProposerSafeFamily {
  pointFamilyKey: string;
  evidenceRefIds: string[];
  evidenceRefs: Array<Pick<FddBindingProposalEvidenceRef, "id" | "kind">>;
  lookupStatusCounts: Record<FleetGuardExactLookupStatus, number>;
  quantityKinds: string[];
  quantityFactStatusCounts: Record<string, number>;
  quantityKindCounts: Record<string, number>;
  unitStatuses: string[];
  unitStatusCounts: Record<string, number>;
  units: string[];
  historyStatuses: string[];
  historyStatusCounts: Record<string, number>;
  historyObservedDays: { min: number; max: number } | null;
  historySampleCount: { min: number; max: number } | null;
  ownershipStatuses: string[];
  ownershipStatusCounts: Record<string, number>;
  isPointOfCounts: { true: number; false: number; unknown: number };
  verifiedSources: string[];
}

export interface FddBindingProposerSafeSnapshot {
  projectId: string;
  evidenceSnapshotHash: string;
  algorithmSignature: string;
  algorithm: {
    equipmentType: string;
    requiredRoles: FddBindingProposerSafeRole[];
  };
  evaluator: {
    status: "available" | "missing";
    versionMatches: boolean;
    requiredVersion: string;
    registeredVersion: string | null;
    evaluatorSignature: string;
  };
  inventory: {
    status: "present" | "absent" | "unknown";
    equipmentType: string;
    memberCount: number;
    inventorySignature: string;
  };
  families: FddBindingProposerSafeFamily[];
  evidenceRefs: FddBindingProposalEvidenceRef[];
  evidenceRefTableHash: string;
  validationContext: FddBindingProposalValidationContext;
}

export interface FddBindingProposerSnapshotBuildOptions {
  assertWithinDeadline?: () => void;
}

export class FddBindingProposerToolError extends Error {
  readonly code: "invalid_snapshot" | "unknown_tool" | "invalid_tool_arguments" | "unknown_family";

  constructor(
    code: FddBindingProposerToolError["code"],
    message: string
  ) {
    super(message);
    this.name = "FddBindingProposerToolError";
    this.code = code;
  }
}

const LOOKUP_STATUSES: readonly FleetGuardExactLookupStatus[] = [
  "found",
  "absent",
  "unknown",
  "timeout",
  "failed",
  "conflict"
];
const EQUIPMENT_TYPES = new Set(["ahu", "chiller", "pump", "cooling_tower", "fcu", "vav", "sensor"]);
const QUANTITY_KINDS = new Set([
  "temperature", "flow_rate", "power", "energy", "load", "status", "pressure", "humidity",
  "position", "speed", "current", "level", "concentration", "unknown"
]);
const UNIT_STATUSES = new Set(["match", "mismatch", "unknown", "not_required"]);
const HISTORY_STATUSES = new Set(["sufficient", "insufficient", "unknown", "timeout"]);
const OWNERSHIP_STATUSES = new Set(["verified", "unknown", "conflict"]);
const ROLE_FAMILY_SOURCES = new Set([
  "locked_template", "deterministic_ontology", "llm_proposal", "legacy_v4_proposal", "admin_proposal"
]);
const EVALUATOR_STATUSES = new Set(["available", "missing"]);
const INVENTORY_STATUSES = new Set(["present", "absent", "unknown"]);
const MAX_REQUIRED_ROLES = 64;
const MAX_POINT_FAMILIES = 128;
const MAX_EXACT_LOOKUPS = 8_192;
const MAX_EXACT_OBSERVATIONS = 8_192;
const MAX_INVENTORY_MEMBERS = 10_000;
const MAX_ROLE_FAMILY_FACTS = 4_096;
const MAX_TOOL_RESULT_CHARS = 32_768;

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

function contentHash(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
}

function serializeToolResult(value: unknown): string {
  const result = JSON.stringify(value);
  if (result.length > MAX_TOOL_RESULT_CHARS) {
    throw new FddBindingProposerToolError("invalid_snapshot", "Frozen tool result exceeds the bounded context size.");
  }
  return result;
}

function canonicalIdentifier(value: string): string {
  const canonical = value.trim();
  if (!/^[A-Za-z][A-Za-z0-9_]*$/u.test(canonical)) {
    throw new FddBindingProposerToolError("invalid_snapshot", "Snapshot contains a non-canonical role identifier.");
  }
  return canonical;
}

function canonicalFamilyKey(value: string): string {
  const canonical = value.trim();
  if (!/^[a-z0-9][a-z0-9_:-]*$/u.test(canonical)) {
    throw new FddBindingProposerToolError("invalid_snapshot", "Snapshot contains a non-canonical point-family key.");
  }
  return canonical;
}

function safeUnit(value: string): string | undefined {
  const canonical = value.trim();
  return /^[A-Za-z0-9%°/_*.-]{1,24}$/u.test(canonical) ? canonical : undefined;
}

function safeOpaqueToken(value: unknown, label: string): string {
  const canonical = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9._:@/-]{1,256}$/u.test(canonical)) {
    throw new FddBindingProposerToolError("invalid_snapshot", `Snapshot contains an invalid ${label}.`);
  }
  return canonical;
}

function safeVersion(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const canonical = value.trim();
  return /^[A-Za-z0-9._:@/-]{1,64}$/u.test(canonical) ? canonical : null;
}

function stableLookupKey(lookup: FleetGuardPlanInput["lookups"][number]): string {
  return [
    lookup.entityKey.trim().toUpperCase(),
    canonicalFamilyKey(lookup.familyKey),
    lookup.status,
    contentHash(lookup)
  ].join("|");
}

function emptyLookupCounts(): Record<FleetGuardExactLookupStatus, number> {
  return {
    found: 0,
    absent: 0,
    unknown: 0,
    timeout: 0,
    failed: 0,
    conflict: 0
  };
}

function incrementCount(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function sortedCounts(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => compareText(left, right)));
}

function numericRange(values: number[]): { min: number; max: number } | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!Number.isFinite(value) || value < 0) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return Number.isFinite(min) ? { min, max } : null;
}

function refId(prefix: "family" | "lookup", fact: unknown): string {
  return `${prefix}_${contentHash(fact).slice(0, 24)}`;
}

export function buildFddBindingProposerSafeSnapshot(
  projectId: string,
  input: FleetGuardPlanInput,
  options: FddBindingProposerSnapshotBuildOptions = {}
): FddBindingProposerSafeSnapshot {
  const deadline = options.assertWithinDeadline ?? (() => undefined);
  deadline();
  const canonicalProjectId = projectId.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(canonicalProjectId)) {
    throw new FddBindingProposerToolError("invalid_snapshot", "Project and required signatures must be non-empty.");
  }
  const sourceEvidenceSignature = safeOpaqueToken(input.signatures.evidence, "evidence snapshot hash");
  const sourceAlgorithmSignature = safeOpaqueToken(input.signatures.algorithm, "algorithm signature");
  const evaluatorSignature = contentHash([canonicalProjectId, "evaluator", safeOpaqueToken(input.signatures.evaluator, "evaluator signature")]);
  const inventorySignature = contentHash([canonicalProjectId, "inventory", safeOpaqueToken(input.signatures.inventory, "inventory signature")]);
  const algorithmSignature = contentHash([canonicalProjectId, "algorithm", sourceAlgorithmSignature]);
  safeOpaqueToken(input.algorithm.id, "algorithm id");
  safeOpaqueToken(input.algorithm.version, "algorithm version");
  safeOpaqueToken(input.evaluator.id, "evaluator id");
  if (!safeVersion(input.evaluator.requiredVersion)) {
    throw new FddBindingProposerToolError("invalid_snapshot", "Snapshot contains an invalid evaluator version.");
  }
  if (!EQUIPMENT_TYPES.has(input.algorithm.equipmentType) || !EQUIPMENT_TYPES.has(input.inventory.equipmentType)) {
    throw new FddBindingProposerToolError("invalid_snapshot", "Snapshot contains an invalid equipment type.");
  }
  if (!EVALUATOR_STATUSES.has(input.evaluator.status) || !INVENTORY_STATUSES.has(input.inventory.status)) {
    throw new FddBindingProposerToolError("invalid_snapshot", "Snapshot contains an invalid evaluator or inventory status.");
  }
  const observationCount = input.lookups.reduce((total, lookup) => total + lookup.observations.length, 0);
  if (
    input.algorithm.requiredRoles.length > MAX_REQUIRED_ROLES
    || input.lookups.length > MAX_EXACT_LOOKUPS
    || observationCount > MAX_EXACT_OBSERVATIONS
    || input.inventory.members.length > MAX_INVENTORY_MEMBERS
    || input.roleFamilies.length > MAX_ROLE_FAMILY_FACTS
  ) {
    throw new FddBindingProposerToolError("invalid_snapshot", "Snapshot exceeds the bounded proposal evidence size.");
  }
  if (input.lookups.some((lookup) => !LOOKUP_STATUSES.includes(lookup.status))) {
    throw new FddBindingProposerToolError("invalid_snapshot", "Snapshot contains an invalid exact-lookup status.");
  }
  if (input.roleFamilies.some((family) => !ROLE_FAMILY_SOURCES.has(family.source))) {
    throw new FddBindingProposerToolError("invalid_snapshot", "Snapshot contains an invalid role-family source.");
  }
  const requiredRoles = input.algorithm.requiredRoles.map((role) => ({
    role: canonicalIdentifier(role.role),
    quantityKind: QUANTITY_KINDS.has(role.quantityKind) ? role.quantityKind : "unknown",
    acceptableUnits: (role.acceptableUnits ?? [])
      .map(safeUnit)
      .filter((unit): unit is string => Boolean(unit))
      .sort(compareText),
    minHistoryDays: typeof role.minHistoryDays === "number" && Number.isFinite(role.minHistoryDays)
      ? role.minHistoryDays
      : null
  })).sort((left, right) => compareText(left.role, right.role));
  deadline();
  if (requiredRoles.length === 0 || new Set(requiredRoles.map((role) => role.role)).size !== requiredRoles.length) {
    throw new FddBindingProposerToolError("invalid_snapshot", "Snapshot required-role contract is empty or duplicated.");
  }

  const familyKeys = [...new Set([
    ...input.roleFamilies.map((family) => canonicalFamilyKey(family.familyKey)),
    ...input.lookups.map((lookup) => canonicalFamilyKey(lookup.familyKey))
  ])].sort(compareText);
  if (familyKeys.length > MAX_POINT_FAMILIES) {
    throw new FddBindingProposerToolError("invalid_snapshot", "Snapshot exceeds the bounded point-family count.");
  }
  const sortedLookups = input.lookups.slice().sort((left, right) => compareText(stableLookupKey(left), stableLookupKey(right)));
  const lookupsByFamily = new Map<string, FleetGuardPlanInput["lookups"]>();
  for (const lookup of sortedLookups) {
    const familyKey = canonicalFamilyKey(lookup.familyKey);
    const entries = lookupsByFamily.get(familyKey);
    if (entries) entries.push(lookup);
    else lookupsByFamily.set(familyKey, [lookup]);
  }
  const roleFamiliesByFamily = new Map<string, FleetGuardPlanInput["roleFamilies"]>();
  for (const roleFamily of input.roleFamilies) {
    const familyKey = canonicalFamilyKey(roleFamily.familyKey);
    const entries = roleFamiliesByFamily.get(familyKey);
    if (entries) entries.push(roleFamily);
    else roleFamiliesByFamily.set(familyKey, [roleFamily]);
  }
  const evidenceRefs: FddBindingProposalEvidenceRef[] = [];
  const lookupMultiplicity = new Map<string, number>();
  for (const lookup of sortedLookups) {
    const key = `${lookup.entityKey.trim().toUpperCase()}|${canonicalFamilyKey(lookup.familyKey)}`;
    lookupMultiplicity.set(key, (lookupMultiplicity.get(key) ?? 0) + 1);
  }
  const families = familyKeys.map((pointFamilyKey): FddBindingProposerSafeFamily => {
    deadline();
    const familyLookups = lookupsByFamily.get(pointFamilyKey) ?? [];
    const lookupStatusCounts = emptyLookupCounts();
    const quantityKinds = new Set<string>();
    const quantityFactStatusCounts: Record<string, number> = {};
    const quantityKindCounts: Record<string, number> = {};
    const unitStatuses = new Set<string>();
    const unitStatusCounts: Record<string, number> = {};
    const units = new Set<string>();
    const historyStatuses = new Set<string>();
    const historyStatusCounts: Record<string, number> = {};
    const historyObservedDays: number[] = [];
    const historySampleCounts: number[] = [];
    const ownershipStatuses = new Set<string>();
    const ownershipStatusCounts: Record<string, number> = {};
    const isPointOfCounts = { true: 0, false: 0, unknown: 0 };
    const familyRef: FddBindingProposalEvidenceRef = {
      id: refId("family", {
        schemaVersion: "fleetguard-binding-evidence-ref-v1",
        projectId: canonicalProjectId,
        pointFamilyKey,
        kind: "family_fact"
      }),
      projectId: canonicalProjectId,
      pointFamilyKey,
      kind: "family_fact"
    };
    evidenceRefs.push(familyRef);
    const familyEvidenceRefs: FddBindingProposalEvidenceRef[] = [familyRef];
    for (const lookup of familyLookups) {
      deadline();
      lookupStatusCounts[lookup.status] += 1;
      const exactLookupKey = `${lookup.entityKey.trim().toUpperCase()}|${pointFamilyKey}`;
      const kind = lookup.status === "found"
        && lookup.observations.length === 1
        && lookupMultiplicity.get(exactLookupKey) === 1
        ? "found_lookup"
        : "lookup_fact";
      const lookupRef: FddBindingProposalEvidenceRef = {
        id: refId("lookup", {
          schemaVersion: "fleetguard-binding-evidence-ref-v1",
          projectId: canonicalProjectId,
          pointFamilyKey,
          kind,
          lookup
        }),
        projectId: canonicalProjectId,
        pointFamilyKey,
        kind
      };
      evidenceRefs.push(lookupRef);
      familyEvidenceRefs.push(lookupRef);
      for (const observation of lookup.observations) {
        const quantityKind = QUANTITY_KINDS.has(observation.quantity.kind) ? observation.quantity.kind : "unknown";
        const quantityFactStatus = OWNERSHIP_STATUSES.has(observation.quantity.status)
          ? observation.quantity.status
          : "unknown";
        const unitStatus = UNIT_STATUSES.has(observation.unit.status) ? observation.unit.status : "unknown";
        const historyStatus = HISTORY_STATUSES.has(observation.history.status) ? observation.history.status : "unknown";
        const ownershipStatus = OWNERSHIP_STATUSES.has(observation.ownership.status)
          ? observation.ownership.status
          : "unknown";
        quantityKinds.add(quantityKind);
        incrementCount(quantityKindCounts, quantityKind);
        incrementCount(quantityFactStatusCounts, quantityFactStatus);
        unitStatuses.add(unitStatus);
        incrementCount(unitStatusCounts, unitStatus);
        const unit = observation.unit.unit ? safeUnit(observation.unit.unit) : undefined;
        if (unit) units.add(unit);
        historyStatuses.add(historyStatus);
        incrementCount(historyStatusCounts, historyStatus);
        if (typeof observation.history.observedDays === "number") historyObservedDays.push(observation.history.observedDays);
        if (typeof observation.history.sampleCount === "number") historySampleCounts.push(observation.history.sampleCount);
        ownershipStatuses.add(ownershipStatus);
        incrementCount(ownershipStatusCounts, ownershipStatus);
        if (observation.ownership.isPointOf === true) isPointOfCounts.true += 1;
        else if (observation.ownership.isPointOf === false) isPointOfCounts.false += 1;
        else isPointOfCounts.unknown += 1;
      }
    }
    const verifiedSources = [...new Set((roleFamiliesByFamily.get(pointFamilyKey) ?? [])
      .filter((family) => family.status === "verified")
      .map((family) => family.source))]
      .sort(compareText);
    return {
      pointFamilyKey,
      evidenceRefIds: familyEvidenceRefs.map((reference) => reference.id),
      evidenceRefs: familyEvidenceRefs.map(({ id, kind }) => ({ id, kind })),
      lookupStatusCounts,
      quantityKinds: [...quantityKinds].sort(compareText),
      quantityFactStatusCounts: sortedCounts(quantityFactStatusCounts),
      quantityKindCounts: sortedCounts(quantityKindCounts),
      unitStatuses: [...unitStatuses].sort(compareText),
      unitStatusCounts: sortedCounts(unitStatusCounts),
      units: [...units].sort(compareText),
      historyStatuses: [...historyStatuses].sort(compareText),
      historyStatusCounts: sortedCounts(historyStatusCounts),
      historyObservedDays: numericRange(historyObservedDays),
      historySampleCount: numericRange(historySampleCounts),
      ownershipStatuses: [...ownershipStatuses].sort(compareText),
      ownershipStatusCounts: sortedCounts(ownershipStatusCounts),
      isPointOfCounts,
      verifiedSources
    };
  });

  const evidenceRefTableHash = contentHash(evidenceRefs);
  const evidenceSnapshotHash = contentHash({
    schemaVersion: "fleetguard-binding-safe-snapshot-v2",
    projectId: canonicalProjectId,
    sourceEvidenceSignatureHash: contentHash(sourceEvidenceSignature),
    algorithmSignature,
    evaluatorSignature,
    inventorySignature,
    algorithm: { equipmentType: input.algorithm.equipmentType, requiredRoles },
    evaluator: {
      status: input.evaluator.status,
      requiredVersion: safeVersion(input.evaluator.requiredVersion),
      registeredVersion: safeVersion(input.evaluator.registeredVersion)
    },
    inventory: {
      status: input.inventory.status,
      equipmentType: input.inventory.equipmentType,
      memberCount: new Set(input.inventory.members.map((member) => member.entityKey.trim().toUpperCase()).filter(Boolean)).size
    },
    families,
    evidenceRefTableHash
  });
  deadline();

  return {
    projectId: canonicalProjectId,
    evidenceSnapshotHash,
    algorithmSignature,
    algorithm: {
      equipmentType: input.algorithm.equipmentType,
      requiredRoles
    },
    evaluator: {
      status: input.evaluator.status,
      versionMatches: input.evaluator.status === "available"
        && safeVersion(input.evaluator.registeredVersion) === safeVersion(input.evaluator.requiredVersion),
      requiredVersion: safeVersion(input.evaluator.requiredVersion) ?? "invalid",
      registeredVersion: safeVersion(input.evaluator.registeredVersion),
      evaluatorSignature
    },
    inventory: {
      status: input.inventory.status,
      equipmentType: input.inventory.equipmentType,
      memberCount: new Set(input.inventory.members.map((member) => member.entityKey.trim().toUpperCase()).filter(Boolean)).size,
      inventorySignature
    },
    families,
    evidenceRefs,
    evidenceRefTableHash,
    validationContext: {
      projectId: canonicalProjectId,
      evidenceSnapshotHash,
      algorithmSignature,
      requiredRoles: requiredRoles.map((role) => role.role),
      families: families.map((family) => ({
        projectId: canonicalProjectId,
        pointFamilyKey: family.pointFamilyKey
      })),
      evidenceRefs: evidenceRefs.map((reference) => ({ ...reference }))
    }
  };
}

const TOOL_DEFINITIONS: readonly FddBindingProposerToolDefinition[] = [
  {
    name: "get_algorithm_contract",
    description: "Read the required FDD roles and their quantity/history constraints from the frozen snapshot.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "get_evaluator_facts",
    description: "Read evaluator registry availability and version facts from the same frozen snapshot.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "get_inventory_facts",
    description: "Read authoritative equipment availability and fleet size from the same frozen snapshot.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "list_point_families",
    description: "List canonical point-family keys and aggregate exact-lookup evidence from the frozen snapshot.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "inspect_point_family",
    description: "Inspect one canonical point family from the same frozen snapshot.",
    inputSchema: {
      type: "object",
      properties: { pointFamilyKey: { type: "string" } },
      required: ["pointFamilyKey"],
      additionalProperties: false
    }
  }
];

export function fddBindingProposerToolDefinitions(): FddBindingProposerToolDefinition[] {
  return TOOL_DEFINITIONS.map((definition) => structuredClone(definition));
}

function parseArguments(argumentsJson: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(argumentsJson) as unknown;
  } catch {
    throw new FddBindingProposerToolError("invalid_tool_arguments", "Tool arguments must be strict JSON.");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new FddBindingProposerToolError("invalid_tool_arguments", "Tool arguments must be an object.");
  }
  return value as Record<string, unknown>;
}

export class FddBindingProposerTools {
  readonly version = FDD_BINDING_PROPOSER_TOOL_VERSION;
  readonly definitions = TOOL_DEFINITIONS;

  constructor(readonly snapshot: FddBindingProposerSafeSnapshot) {}

  execute(name: string, argumentsJson: string): string {
    const args = parseArguments(argumentsJson);
    if (name === "get_algorithm_contract") {
      if (Object.keys(args).length !== 0) {
        throw new FddBindingProposerToolError("invalid_tool_arguments", "Algorithm tool accepts no arguments.");
      }
      return serializeToolResult({
        projectId: this.snapshot.projectId,
        evidenceSnapshotHash: this.snapshot.evidenceSnapshotHash,
        algorithmSignature: this.snapshot.algorithmSignature,
        equipmentType: this.snapshot.algorithm.equipmentType,
        requiredRoles: this.snapshot.algorithm.requiredRoles
      });
    }
    if (name === "list_point_families") {
      if (Object.keys(args).length !== 0) {
        throw new FddBindingProposerToolError("invalid_tool_arguments", "Family list tool accepts no arguments.");
      }
      return serializeToolResult({
        projectId: this.snapshot.projectId,
        evidenceSnapshotHash: this.snapshot.evidenceSnapshotHash,
        evidenceRefTableHash: this.snapshot.evidenceRefTableHash,
        families: this.snapshot.families.map((family) => ({
          pointFamilyKey: family.pointFamilyKey,
          evidenceRefs: family.evidenceRefs,
          lookupStatusCounts: family.lookupStatusCounts
        }))
      });
    }
    if (name === "get_evaluator_facts") {
      if (Object.keys(args).length !== 0) {
        throw new FddBindingProposerToolError("invalid_tool_arguments", "Evaluator tool accepts no arguments.");
      }
      return serializeToolResult({
        projectId: this.snapshot.projectId,
        evidenceSnapshotHash: this.snapshot.evidenceSnapshotHash,
        evaluator: this.snapshot.evaluator
      });
    }
    if (name === "get_inventory_facts") {
      if (Object.keys(args).length !== 0) {
        throw new FddBindingProposerToolError("invalid_tool_arguments", "Inventory tool accepts no arguments.");
      }
      return serializeToolResult({
        projectId: this.snapshot.projectId,
        evidenceSnapshotHash: this.snapshot.evidenceSnapshotHash,
        inventory: this.snapshot.inventory
      });
    }
    if (name === "inspect_point_family") {
      if (Object.keys(args).length !== 1 || typeof args.pointFamilyKey !== "string") {
        throw new FddBindingProposerToolError("invalid_tool_arguments", "Family inspection requires only pointFamilyKey.");
      }
      const family = this.snapshot.families.find((entry) => entry.pointFamilyKey === args.pointFamilyKey);
      if (!family) throw new FddBindingProposerToolError("unknown_family", "Requested family is outside this snapshot.");
      return serializeToolResult({
        projectId: this.snapshot.projectId,
        evidenceSnapshotHash: this.snapshot.evidenceSnapshotHash,
        evidenceRefTableHash: this.snapshot.evidenceRefTableHash,
        family
      });
    }
    throw new FddBindingProposerToolError("unknown_tool", "Only the dedicated read-only proposal tools are available.");
  }
}
