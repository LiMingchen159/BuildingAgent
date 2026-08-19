import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { dataRoot } from "../agent/knowledgeBase.js";
import {
  createEquipmentIdentity,
  isEquipmentIdentifierOnlyName,
  type EquipmentIdentity,
  type EquipmentProfile,
  type EquipmentSelection,
  type ReportAssetProvenance,
  type ReportAssetSourceKind,
  type ReportValidationIssue,
  type ReportValidationResult
} from "./contracts.js";
import {
  BRICK_NAMESPACE,
  DEFAULT_REPORT_EQUIPMENT_PROFILE_REGISTRY,
  type EquipmentProfileRegistration
} from "./profiles.js";

export const REPORT_ASSET_RESOLVER_VERSION = 1 as const;

export const EQUIPMENT_NAME_SOURCE_PRECEDENCE: readonly ReportAssetSourceKind[] = [
  "semantic_model",
  "project_metadata",
  "bms_metadata"
];

const RDFS_NAMESPACE = "http://www.w3.org/2000/01/rdf-schema#";
const RDF_NAMESPACE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const naturalOrder = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const allowedSourceKinds = new Set<string>(EQUIPMENT_NAME_SOURCE_PRECEDENCE);

/**
 * Brick classes that are equipment-like report assets. A class can be
 * discovered here without having a report profile; that distinction is
 * returned explicitly as an unclassified result.
 */
export const DEFAULT_BRICK_REPORT_ASSET_TYPES: readonly string[] = [
  `${BRICK_NAMESPACE}Water_Cooled_Chiller`,
  `${BRICK_NAMESPACE}Chiller`,
  `${BRICK_NAMESPACE}Chilled_Water_Pump`,
  `${BRICK_NAMESPACE}Water_Pump`,
  `${BRICK_NAMESPACE}Heat_Exchanger`,
  `${BRICK_NAMESPACE}Air_Handler_Unit`,
  `${BRICK_NAMESPACE}Air_Handling_Unit`,
  `${BRICK_NAMESPACE}Boiler`,
  `${BRICK_NAMESPACE}Cooling_Tower`,
  `${BRICK_NAMESPACE}Fan_Coil_Unit`,
  `${BRICK_NAMESPACE}Variable_Air_Volume_Box`
];

export interface ReportAssetRecord {
  /** Canonical project key used for deterministic joins; unique across a project snapshot. */
  equipmentId: string;
  /** Immutable URI, metadata key, or BMS inventory key. */
  sourceRef: string;
  /** Exact semantic/project/BMS types. Empty means the type is unavailable. */
  sourceTypes: string[];
  /** Optional human-facing code, e.g. WCC-01 for semantic key WCC_01. */
  shortIdentifier?: string;
  /** Optional source-supplied descriptive name. Identifier-only values are retained but not promoted. */
  fullName?: string;
}

export interface ReportAssetSnapshot {
  projectId: string;
  sourceKind: ReportAssetSourceKind;
  sourceId: string;
  /** Source-level revision retained for audit; the aggregate revision is computed from content. */
  sourceRevision: string;
  equipment: ReportAssetRecord[];
}

export interface ReportAssetSourceProvenance {
  sourceKind: ReportAssetSourceKind;
  sourceId: string;
  sourceRevision: string;
}

export interface EquipmentSourceProvenance extends ReportAssetRecord {
  sourceKind: ReportAssetSourceKind;
  sourceId: string;
}

export interface ResolvedEquipmentAsset {
  equipmentId: string;
  sources: EquipmentSourceProvenance[];
}

export interface EquipmentSourceTypeRef {
  sourceKind: ReportAssetSourceKind;
  sourceType: string;
}

export type EquipmentClassification =
  | {
      status: "matched";
      equipmentId: string;
      equipmentType: string;
      profileId: string;
      profileVersion: number;
      ruleRefs: string[];
      sourceTypes: EquipmentSourceTypeRef[];
    }
  | {
      status: "unclassified";
      equipmentId: string;
      reason: "missing_type" | "unsupported_type";
      sourceTypes: EquipmentSourceTypeRef[];
    };

export interface ResolvedReportAssets {
  projectId: string;
  /** Content-derived SHA-256 over normalized sources, rules, profiles, and resolver version. */
  assetRevision: string;
  sources: ReportAssetSourceProvenance[];
  assets: ResolvedEquipmentAsset[];
  /** Planner-ready subset retaining source URIs, source revisions, and classification rules. */
  assetProvenance: ReportAssetProvenance;
  /** Only selected, classified identities; ready to pass to buildReportPlan. */
  equipment: EquipmentIdentity[];
  /** Only profiles needed by the selected equipment; ready to pass to buildReportPlan. */
  profiles: EquipmentProfile[];
  /** Covers every discovered asset, including unsupported equipment types. */
  classifications: EquipmentClassification[];
}

export interface ResolveReportAssetsInput {
  projectId: string;
  selection: EquipmentSelection;
  snapshots: ReportAssetSnapshot[];
  registry?: EquipmentProfileRegistration[];
}

export interface ParseBrickEquipmentSnapshotInput {
  projectId: string;
  sourceId: string;
  turtle: string;
  recognizedEquipmentTypes?: readonly string[];
}

export interface DiscoverProjectReportAssetsInput {
  projectId: string;
  selection: EquipmentSelection;
  registry?: EquipmentProfileRegistration[];
  env?: Record<string, string | undefined>;
}

interface NormalizedAssetRecord {
  equipmentId: string;
  sourceRef: string;
  sourceTypes: string[];
  shortIdentifier?: string;
  fullName?: string;
}

interface NormalizedAssetSnapshot {
  projectId: string;
  sourceKind: ReportAssetSourceKind;
  sourceId: string;
  sourceRevision: string;
  equipment: NormalizedAssetRecord[];
}

interface RegisteredMatch {
  registration: EquipmentProfileRegistration;
  ruleId: string;
}

function issue(pathValue: string, code: string, message: string): ReportValidationIssue {
  return { path: pathValue, code, message };
}

function normalizeText(value: string): string {
  return value.trim().normalize("NFC");
}

function requiredText(
  value: unknown,
  pathValue: string,
  issues: ReportValidationIssue[]
): string {
  if (typeof value !== "string" || !normalizeText(value)) {
    issues.push(issue(pathValue, "required", `${pathValue} must be a non-empty string.`));
    return "";
  }
  return normalizeText(value);
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = normalizeText(value);
  return normalized || undefined;
}

function compareNatural(left: string, right: string): number {
  const result = naturalOrder.compare(left, right);
  if (result !== 0) return result;
  return left < right ? -1 : left > right ? 1 : 0;
}

function sourceKindOrder(kind: ReportAssetSourceKind): number {
  return EQUIPMENT_NAME_SOURCE_PRECEDENCE.indexOf(kind);
}

function sourceRecordOrder(left: EquipmentSourceProvenance, right: EquipmentSourceProvenance): number {
  return sourceKindOrder(left.sourceKind) - sourceKindOrder(right.sourceKind)
    || compareNatural(left.sourceId, right.sourceId)
    || compareNatural(left.sourceRef, right.sourceRef);
}

function sourceTypeOrder(left: EquipmentSourceTypeRef, right: EquipmentSourceTypeRef): number {
  return sourceKindOrder(left.sourceKind) - sourceKindOrder(right.sourceKind)
    || compareNatural(left.sourceType, right.sourceType);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort(compareNatural);
}

function normalizeSnapshots(
  projectId: string,
  snapshots: ReportAssetSnapshot[],
  issues: ReportValidationIssue[]
): NormalizedAssetSnapshot[] {
  const normalized: NormalizedAssetSnapshot[] = [];
  const sourceKeys = new Set<string>();

  for (const [snapshotIndex, snapshot] of snapshots.entries()) {
    const basePath = `snapshots[${snapshotIndex}]`;
    const snapshotProjectId = requiredText(snapshot.projectId, `${basePath}.projectId`, issues);
    if (snapshotProjectId && snapshotProjectId !== projectId) {
      issues.push(issue(
        `${basePath}.projectId`,
        "project_mismatch",
        `Asset snapshot project ${snapshotProjectId} does not match ${projectId}.`
      ));
    }
    if (!allowedSourceKinds.has(snapshot.sourceKind as string)) {
      issues.push(issue(
        `${basePath}.sourceKind`,
        "invalid_source_kind",
        "Asset names may only come from semantic, project, or BMS metadata."
      ));
      continue;
    }
    const sourceKind = snapshot.sourceKind;
    const sourceId = requiredText(snapshot.sourceId, `${basePath}.sourceId`, issues);
    const sourceRevision = requiredText(snapshot.sourceRevision, `${basePath}.sourceRevision`, issues);
    const sourceKey = `${sourceKind}\u0000${sourceId}`;
    if (sourceKeys.has(sourceKey)) {
      issues.push(issue(basePath, "duplicate_source", `Asset source ${sourceKind}:${sourceId} is duplicated.`));
    }
    sourceKeys.add(sourceKey);

    if (!Array.isArray(snapshot.equipment)) {
      issues.push(issue(`${basePath}.equipment`, "invalid_type", "Asset source equipment must be an array."));
      continue;
    }
    const seenEquipment = new Set<string>();
    const equipment: NormalizedAssetRecord[] = [];
    for (const [recordIndex, record] of snapshot.equipment.entries()) {
      const recordPath = `${basePath}.equipment[${recordIndex}]`;
      const equipmentId = requiredText(record.equipmentId, `${recordPath}.equipmentId`, issues);
      const sourceRef = requiredText(record.sourceRef, `${recordPath}.sourceRef`, issues);
      if (seenEquipment.has(equipmentId)) {
        issues.push(issue(recordPath, "duplicate_equipment", `Equipment ${equipmentId} is duplicated in ${sourceId}.`));
      }
      seenEquipment.add(equipmentId);
      const sourceTypes = Array.isArray(record.sourceTypes)
        ? uniqueSorted(record.sourceTypes.map((entry, typeIndex) => (
            requiredText(entry, `${recordPath}.sourceTypes[${typeIndex}]`, issues)
          )).filter(Boolean))
        : [];
      if (!Array.isArray(record.sourceTypes)) {
        issues.push(issue(`${recordPath}.sourceTypes`, "invalid_type", "sourceTypes must be an array."));
      }
      const shortIdentifier = optionalText(record.shortIdentifier);
      const fullName = optionalText(record.fullName);
      equipment.push({
        equipmentId,
        sourceRef,
        sourceTypes,
        ...(shortIdentifier ? { shortIdentifier } : {}),
        ...(fullName ? { fullName } : {})
      });
    }
    equipment.sort((left, right) => compareNatural(left.equipmentId, right.equipmentId)
      || compareNatural(left.sourceRef, right.sourceRef));
    normalized.push({ projectId: snapshotProjectId, sourceKind, sourceId, sourceRevision, equipment });
  }

  return normalized.sort((left, right) => sourceKindOrder(left.sourceKind) - sourceKindOrder(right.sourceKind)
    || compareNatural(left.sourceId, right.sourceId)
    || compareNatural(left.sourceRevision, right.sourceRevision));
}

function validateProfileKeyList(
  value: unknown,
  pathValue: string,
  issues: ReportValidationIssue[]
): void {
  if (!Array.isArray(value)) {
    issues.push(issue(pathValue, "invalid_type", `${pathValue} must be an array.`));
    return;
  }
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const normalized = requiredText(entry, `${pathValue}[${index}]`, issues);
    if (typeof entry === "string" && normalized !== entry) {
      issues.push(issue(`${pathValue}[${index}]`, "noncanonical_value", `${pathValue} entries must be trimmed.`));
    }
    if (seen.has(normalized)) {
      issues.push(issue(`${pathValue}[${index}]`, "duplicate", `${pathValue} contains duplicate key ${normalized}.`));
    }
    seen.add(normalized);
  }
}

function validateRegistry(
  registry: EquipmentProfileRegistration[],
  issues: ReportValidationIssue[]
): Map<string, RegisteredMatch[]> {
  const matcherMap = new Map<string, RegisteredMatch[]>();
  const profileIds = new Set<string>();
  const profileTypes = new Set<string>();
  const ruleIds = new Set<string>();

  for (const [registrationIndex, registration] of registry.entries()) {
    const basePath = `registry[${registrationIndex}]`;
    const { profile } = registration;
    const profileId = requiredText(profile.profileId, `${basePath}.profile.profileId`, issues);
    const equipmentType = requiredText(profile.equipmentType, `${basePath}.profile.equipmentType`, issues);
    const groupTitle = requiredText(profile.groupTitle, `${basePath}.profile.groupTitle`, issues);
    if (profileId !== profile.profileId) {
      issues.push(issue(`${basePath}.profile.profileId`, "noncanonical_value", "Profile ID must be trimmed."));
    }
    if (equipmentType !== profile.equipmentType) {
      issues.push(issue(`${basePath}.profile.equipmentType`, "noncanonical_value", "Profile equipment type must be trimmed."));
    }
    if (groupTitle !== profile.groupTitle) {
      issues.push(issue(`${basePath}.profile.groupTitle`, "noncanonical_value", "Profile group title must be trimmed."));
    }
    if (profileIds.has(profileId)) {
      issues.push(issue(`${basePath}.profile.profileId`, "duplicate_profile_id", `Profile ${profileId} is duplicated.`));
    }
    profileIds.add(profileId);
    if (profileTypes.has(equipmentType)) {
      issues.push(issue(
        `${basePath}.profile.equipmentType`,
        "duplicate_profile",
        `Equipment type ${equipmentType} has multiple profiles.`
      ));
    }
    profileTypes.add(equipmentType);
    if (!Number.isInteger(profile.version) || profile.version < 1) {
      issues.push(issue(`${basePath}.profile.version`, "invalid_value", "Profile version must be a positive integer."));
    }
    if (!Number.isInteger(profile.order) || profile.order < 0) {
      issues.push(issue(`${basePath}.profile.order`, "invalid_value", "Profile order must be a non-negative integer."));
    }
    validateProfileKeyList(profile.fleetMetricKeys, `${basePath}.profile.fleetMetricKeys`, issues);
    validateProfileKeyList(profile.fleetChartKeys, `${basePath}.profile.fleetChartKeys`, issues);
    validateProfileKeyList(profile.metricKeys, `${basePath}.profile.metricKeys`, issues);
    validateProfileKeyList(profile.chartKeys, `${basePath}.profile.chartKeys`, issues);
    if (
      typeof profile.analysis !== "object"
      || profile.analysis === null
      || typeof profile.analysis.performance !== "boolean"
      || typeof profile.analysis.faultDiagnosis !== "boolean"
    ) {
      issues.push(issue(`${basePath}.profile.analysis`, "invalid_type", "Profile analysis flags must be booleans."));
    }
    if (!Array.isArray(registration.matchers) || registration.matchers.length === 0) {
      issues.push(issue(`${basePath}.matchers`, "required", "Each profile registration requires at least one exact matcher."));
      continue;
    }
    for (const [matcherIndex, matcher] of registration.matchers.entries()) {
      const matcherPath = `${basePath}.matchers[${matcherIndex}]`;
      const ruleId = requiredText(matcher.ruleId, `${matcherPath}.ruleId`, issues);
      const sourceType = requiredText(matcher.sourceType, `${matcherPath}.sourceType`, issues);
      if (ruleId !== matcher.ruleId) {
        issues.push(issue(`${matcherPath}.ruleId`, "noncanonical_value", "Classification rule ID must be trimmed."));
      }
      if (sourceType !== matcher.sourceType) {
        issues.push(issue(`${matcherPath}.sourceType`, "noncanonical_value", "Classification source type must be trimmed."));
      }
      if (!allowedSourceKinds.has(matcher.sourceKind as string)) {
        issues.push(issue(`${matcherPath}.sourceKind`, "invalid_source_kind", "Profile matcher source kind is invalid."));
        continue;
      }
      if (ruleIds.has(ruleId)) {
        issues.push(issue(`${matcherPath}.ruleId`, "duplicate_rule", `Classification rule ${ruleId} is duplicated.`));
      }
      ruleIds.add(ruleId);
      const key = `${matcher.sourceKind}\u0000${sourceType}`;
      const matches = matcherMap.get(key) ?? [];
      matches.push({ registration, ruleId });
      matcherMap.set(key, matches);
    }
  }
  return matcherMap;
}

function groupSourceRecords(snapshots: NormalizedAssetSnapshot[]): Map<string, EquipmentSourceProvenance[]> {
  const groups = new Map<string, EquipmentSourceProvenance[]>();
  for (const snapshot of snapshots) {
    for (const record of snapshot.equipment) {
      const existing = groups.get(record.equipmentId) ?? [];
      existing.push({
        ...record,
        sourceKind: snapshot.sourceKind,
        sourceId: snapshot.sourceId
      });
      groups.set(record.equipmentId, existing);
    }
  }
  for (const records of groups.values()) records.sort(sourceRecordOrder);
  return groups;
}

function sourceTypeRefs(records: EquipmentSourceProvenance[]): EquipmentSourceTypeRef[] {
  const byKey = new Map<string, EquipmentSourceTypeRef>();
  for (const record of records) {
    for (const sourceType of record.sourceTypes) {
      byKey.set(`${record.sourceKind}\u0000${sourceType}`, { sourceKind: record.sourceKind, sourceType });
    }
  }
  return [...byKey.values()].sort(sourceTypeOrder);
}

function classifyEquipment(
  equipmentId: string,
  records: EquipmentSourceProvenance[],
  matcherMap: Map<string, RegisteredMatch[]>,
  issues: ReportValidationIssue[]
): { classification: EquipmentClassification; registration?: EquipmentProfileRegistration } {
  const typeRefs = sourceTypeRefs(records);
  const matches: RegisteredMatch[] = [];
  for (const typeRef of typeRefs) {
    matches.push(...(matcherMap.get(`${typeRef.sourceKind}\u0000${typeRef.sourceType}`) ?? []));
  }
  const byProfile = new Map<string, RegisteredMatch[]>();
  for (const match of matches) {
    const key = `${match.registration.profile.profileId}@${match.registration.profile.version}`;
    const profileMatches = byProfile.get(key) ?? [];
    profileMatches.push(match);
    byProfile.set(key, profileMatches);
  }
  if (byProfile.size === 0) {
    return {
      classification: {
        status: "unclassified",
        equipmentId,
        reason: typeRefs.length === 0 ? "missing_type" : "unsupported_type",
        sourceTypes: typeRefs
      }
    };
  }
  if (byProfile.size > 1) {
    issues.push(issue(
      `equipment.${equipmentId}.sourceTypes`,
      "ambiguous_equipment_type",
      `Equipment ${equipmentId} matches more than one report profile.`
    ));
  }
  const selected = [...byProfile.entries()].sort(([left], [right]) => compareNatural(left, right))[0]!;
  const registration = selected[1][0]!.registration;
  return {
    registration,
    classification: {
      status: "matched",
      equipmentId,
      equipmentType: registration.profile.equipmentType,
      profileId: registration.profile.profileId,
      profileVersion: registration.profile.version,
      ruleRefs: uniqueSorted(selected[1].map((match) => match.ruleId)),
      sourceTypes: typeRefs
    }
  };
}

function resolveShortIdentifier(
  equipmentId: string,
  records: EquipmentSourceProvenance[],
  issues: ReportValidationIssue[]
): string {
  for (const sourceKind of EQUIPMENT_NAME_SOURCE_PRECEDENCE) {
    const candidates = records
      .filter((record) => record.sourceKind === sourceKind && record.shortIdentifier)
      .map((record) => ({ value: record.shortIdentifier!, sourceRef: record.sourceRef }));
    const values = uniqueSorted(candidates.map((candidate) => candidate.value));
    if (values.length > 1) {
      issues.push(issue(
        `equipment.${equipmentId}.shortIdentifier`,
        "conflicting_short_identifier",
        `Equipment ${equipmentId} has conflicting short identifiers in ${sourceKind}.`
      ));
    }
    if (values.length > 0) return values[0]!;
  }
  return equipmentId;
}

function resolveFullName(
  equipmentId: string,
  shortIdentifier: string,
  records: EquipmentSourceProvenance[],
  issues: ReportValidationIssue[]
): { fullName: string; nameSource: ReportAssetSourceKind; nameSourceRef: string } | null {
  for (const sourceKind of EQUIPMENT_NAME_SOURCE_PRECEDENCE) {
    const candidates = records
      .filter((record) => record.sourceKind === sourceKind && record.fullName)
      .filter((record) => !isEquipmentIdentifierOnlyName(record.fullName!, equipmentId, shortIdentifier))
      .filter((record) => (
        record.shortIdentifier === undefined
        || !isEquipmentIdentifierOnlyName(record.fullName!, equipmentId, record.shortIdentifier)
      ))
      .map((record) => ({ fullName: record.fullName!, sourceRef: record.sourceRef }))
      .sort((left, right) => compareNatural(left.sourceRef, right.sourceRef));
    const names = uniqueSorted(candidates.map((candidate) => candidate.fullName));
    if (names.length > 1) {
      issues.push(issue(
        `equipment.${equipmentId}.fullName`,
        "conflicting_equipment_name",
        `Equipment ${equipmentId} has conflicting full names in ${sourceKind}.`
      ));
      return null;
    }
    if (names.length === 1) {
      const selected = candidates.find((candidate) => candidate.fullName === names[0])!;
      return { fullName: selected.fullName, nameSource: sourceKind, nameSourceRef: selected.sourceRef };
    }
  }
  return null;
}

function buildIdentity(
  equipmentId: string,
  equipmentType: string,
  records: EquipmentSourceProvenance[],
  issues: ReportValidationIssue[]
): EquipmentIdentity | null {
  const shortIdentifier = resolveShortIdentifier(equipmentId, records, issues);
  const resolvedName = resolveFullName(equipmentId, shortIdentifier, records, issues);
  const identityResult = resolvedName
    ? createEquipmentIdentity({
        equipmentId,
        shortIdentifier,
        equipmentType,
        fullName: resolvedName.fullName,
        nameSource: resolvedName.nameSource,
        nameSourceRef: resolvedName.nameSourceRef
      })
    : createEquipmentIdentity({
        equipmentId,
        shortIdentifier,
        equipmentType,
        nameSource: "deterministic_fallback"
      });
  if (!identityResult.ok) {
    issues.push(...identityResult.issues.map((entry) => ({
      ...entry,
      path: `equipment.${equipmentId}.${entry.path}`
    })));
    return null;
  }
  return identityResult.value;
}

function normalizedRegistryManifest(registry: EquipmentProfileRegistration[]): unknown[] {
  return registry.map((registration) => ({
    profile: {
      profileId: registration.profile.profileId,
      version: registration.profile.version,
      equipmentType: registration.profile.equipmentType,
      groupTitle: registration.profile.groupTitle,
      fleetMetricKeys: [...registration.profile.fleetMetricKeys],
      fleetChartKeys: [...registration.profile.fleetChartKeys],
      metricKeys: [...registration.profile.metricKeys],
      chartKeys: [...registration.profile.chartKeys],
      analysis: { ...registration.profile.analysis },
      order: registration.profile.order
    },
    matchers: registration.matchers.map((matcher) => ({ ...matcher })).sort((left, right) => (
      sourceKindOrder(left.sourceKind) - sourceKindOrder(right.sourceKind)
      || compareNatural(left.sourceType, right.sourceType)
      || compareNatural(left.ruleId, right.ruleId)
    ))
  })).sort((left, right) => compareNatural(left.profile.profileId, right.profile.profileId)
    || left.profile.version - right.profile.version);
}

function computeAssetRevision(
  snapshots: NormalizedAssetSnapshot[],
  registry: EquipmentProfileRegistration[]
): string {
  const manifest = {
    resolverVersion: REPORT_ASSET_RESOLVER_VERSION,
    namePrecedence: EQUIPMENT_NAME_SOURCE_PRECEDENCE,
    snapshots: snapshots.map((snapshot) => ({
      projectId: snapshot.projectId,
      sourceKind: snapshot.sourceKind,
      sourceId: snapshot.sourceId,
      sourceRevision: snapshot.sourceRevision,
      equipment: snapshot.equipment.map((record) => ({
        equipmentId: record.equipmentId,
        sourceRef: record.sourceRef,
        sourceTypes: record.sourceTypes,
        shortIdentifier: record.shortIdentifier ?? null,
        fullName: record.fullName ?? null
      }))
    })),
    registry: normalizedRegistryManifest(registry)
  };
  const digest = createHash("sha256").update(JSON.stringify(manifest), "utf8").digest("hex");
  return `sha256:${digest}`;
}

function cloneEquipmentProfile(profile: EquipmentProfile): EquipmentProfile {
  const cloned: EquipmentProfile = {
    ...profile,
    fleetMetricKeys: [...profile.fleetMetricKeys],
    fleetChartKeys: [...profile.fleetChartKeys],
    metricKeys: [...profile.metricKeys],
    chartKeys: [...profile.chartKeys],
    analysis: { ...profile.analysis }
  };
  Object.freeze(cloned.fleetMetricKeys);
  Object.freeze(cloned.fleetChartKeys);
  Object.freeze(cloned.metricKeys);
  Object.freeze(cloned.chartKeys);
  Object.freeze(cloned.analysis);
  return Object.freeze(cloned);
}

function normalizeSelection(
  value: unknown,
  issues: ReportValidationIssue[]
): EquipmentSelection | null {
  if (typeof value !== "object" || value === null || !("mode" in value)) {
    issues.push(issue("selection", "invalid_type", "Equipment selection must be an object."));
    return null;
  }
  const selection = value as Record<string, unknown>;
  if (selection.mode === "selected") {
    if (!Array.isArray(selection.equipmentIds)) {
      issues.push(issue("selection.equipmentIds", "invalid_type", "Selected equipment IDs must be an array."));
      return null;
    }
    return {
      mode: "selected",
      equipmentIds: selection.equipmentIds.map((entry, index) => (
        requiredText(entry, `selection.equipmentIds[${index}]`, issues)
      )).filter(Boolean)
    };
  }
  if (selection.mode === "all") {
    if (!Array.isArray(selection.equipmentTypes)) {
      issues.push(issue("selection.equipmentTypes", "invalid_type", "Selected equipment types must be an array."));
      return null;
    }
    return {
      mode: "all",
      equipmentTypes: selection.equipmentTypes.map((entry, index) => (
        requiredText(entry, `selection.equipmentTypes[${index}]`, issues)
      )).filter(Boolean)
    };
  }
  issues.push(issue("selection.mode", "invalid_value", "Equipment selection mode must be all or selected."));
  return null;
}

function selectedEquipment(
  selection: EquipmentSelection,
  groups: Map<string, EquipmentSourceProvenance[]>,
  identities: Map<string, EquipmentIdentity>,
  classifications: EquipmentClassification[],
  issues: ReportValidationIssue[]
): EquipmentIdentity[] {
  const classificationById = new Map(classifications.map((classification) => [classification.equipmentId, classification]));
  if (selection.mode === "selected") {
    const result: EquipmentIdentity[] = [];
    const seen = new Set<string>();
    for (const [index, rawEquipmentId] of selection.equipmentIds.entries()) {
      const equipmentId = normalizeText(rawEquipmentId);
      if (seen.has(equipmentId)) {
        issues.push(issue(
          `selection.equipmentIds[${index}]`,
          "duplicate_equipment",
          `Equipment ${equipmentId} is selected more than once.`
        ));
        continue;
      }
      seen.add(equipmentId);
      if (!groups.has(equipmentId)) {
        issues.push(issue(
          `selection.equipmentIds[${index}]`,
          "equipment_not_found",
          `Selected equipment ${equipmentId} was not discovered.`
        ));
        continue;
      }
      if (classificationById.get(equipmentId)?.status === "unclassified") {
        issues.push(issue(
          `selection.equipmentIds[${index}]`,
          "equipment_unclassified",
          `Selected equipment ${equipmentId} has no supported report profile.`
        ));
        continue;
      }
      const identity = identities.get(equipmentId);
      if (identity) result.push(identity);
    }
    return result.sort((left, right) => compareNatural(left.equipmentId, right.equipmentId));
  }

  const requestedTypes = uniqueSorted(selection.equipmentTypes.map(normalizeText).filter(Boolean));
  for (const [index, requestedType] of selection.equipmentTypes.entries()) {
    if (!identities.size || ![...identities.values()].some((identity) => identity.equipmentType === normalizeText(requestedType))) {
      issues.push(issue(
        `selection.equipmentTypes[${index}]`,
        "equipment_type_not_found",
        `Selected equipment type ${normalizeText(requestedType)} was not discovered.`
      ));
    }
  }
  return [...identities.values()]
    .filter((identity) => requestedTypes.length === 0 || requestedTypes.includes(identity.equipmentType))
    .sort((left, right) => compareNatural(left.equipmentId, right.equipmentId));
}

export function resolveReportAssets(
  input: ResolveReportAssetsInput
): ReportValidationResult<ResolvedReportAssets> {
  const issues: ReportValidationIssue[] = [];
  const projectId = requiredText(input.projectId, "projectId", issues);
  if (!Array.isArray(input.snapshots)) {
    return { ok: false, issues: [issue("snapshots", "invalid_type", "snapshots must be an array.")] };
  }
  if (input.snapshots.length === 0) {
    issues.push(issue("snapshots", "asset_source_required", "At least one authoritative asset source is required."));
  }
  const registry = input.registry ?? DEFAULT_REPORT_EQUIPMENT_PROFILE_REGISTRY;
  const snapshots = normalizeSnapshots(projectId, input.snapshots, issues);
  const selection = normalizeSelection(input.selection, issues);
  const matcherMap = validateRegistry(registry, issues);
  const groups = groupSourceRecords(snapshots);
  const classifications: EquipmentClassification[] = [];
  const identities = new Map<string, EquipmentIdentity>();
  const registrationByEquipment = new Map<string, EquipmentProfileRegistration>();

  for (const equipmentId of [...groups.keys()].sort(compareNatural)) {
    const records = groups.get(equipmentId)!;
    const { classification, registration } = classifyEquipment(equipmentId, records, matcherMap, issues);
    classifications.push(classification);
    if (!registration) continue;
    registrationByEquipment.set(equipmentId, registration);
    const identity = buildIdentity(equipmentId, registration.profile.equipmentType, records, issues);
    if (identity) identities.set(equipmentId, identity);
  }

  const equipment = selection
    ? selectedEquipment(selection, groups, identities, classifications, issues)
    : [];
  const selectedProfileKeys = new Set(equipment.map((identity) => {
    const profile = registrationByEquipment.get(identity.equipmentId)!.profile;
    return `${profile.profileId}@${profile.version}`;
  }));
  const profiles = registry
    .map((registration) => registration.profile)
    .filter((profile) => selectedProfileKeys.has(`${profile.profileId}@${profile.version}`))
    .sort((left, right) => left.order - right.order || compareNatural(left.equipmentType, right.equipmentType))
    .map(cloneEquipmentProfile);

  if (issues.length > 0) return { ok: false, issues };
  const sourceManifest = snapshots.map((snapshot) => ({
    sourceKind: snapshot.sourceKind,
    sourceId: snapshot.sourceId,
    sourceRevision: snapshot.sourceRevision
  }));
  const classificationById = new Map(classifications.map((classification) => [classification.equipmentId, classification]));
  const assetProvenance: ReportAssetProvenance = {
    resolverVersion: REPORT_ASSET_RESOLVER_VERSION,
    sources: sourceManifest.map((source) => ({ ...source })),
    equipment: equipment.map((identity) => {
      const classification = classificationById.get(identity.equipmentId)!;
      if (classification.status !== "matched") {
        throw new Error(`Invariant violation: selected equipment ${identity.equipmentId} is unclassified.`);
      }
      return {
        equipmentId: identity.equipmentId,
        resolvedIdentity: { ...identity },
        profileId: classification.profileId,
        profileVersion: classification.profileVersion,
        classificationRuleRefs: [...classification.ruleRefs],
        sources: groups.get(identity.equipmentId)!.map((source) => ({
          sourceKind: source.sourceKind,
          sourceId: source.sourceId,
          sourceRef: source.sourceRef,
          sourceTypes: [...source.sourceTypes],
          ...(source.shortIdentifier ? { shortIdentifier: source.shortIdentifier } : {}),
          ...(source.fullName ? { fullName: source.fullName } : {})
        }))
      };
    })
  };
  return {
    ok: true,
    value: {
      projectId,
      assetRevision: computeAssetRevision(snapshots, registry),
      sources: sourceManifest,
      assets: [...groups.entries()].sort(([left], [right]) => compareNatural(left, right)).map(([equipmentId, sources]) => ({
        equipmentId,
        sources
      })),
      assetProvenance,
      equipment,
      profiles,
      classifications
    }
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeTurtleString(value: string): string | null {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return null;
  }
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

interface TurtleSubjectFacts {
  equipmentId: string;
  sourceRef: string;
  sourceTypes: Set<string>;
  labels: Set<string>;
}

function looksLikeEquipmentShortIdentifier(value: string, equipmentId: string): boolean {
  if (isEquipmentIdentifierOnlyName(value, equipmentId)) return true;
  return /\p{N}/u.test(value)
    && /^[\p{L}\p{N}]+(?:[-_./][\p{L}\p{N}]+)+$/u.test(value);
}

function labelValues(
  segment: string,
  equipmentId: string,
  issues: ReportValidationIssue[]
): string[] {
  const values: string[] = [];
  const literalPattern = `"(?:\\\\.|[^"\\\\])*"(?:@[A-Za-z]+(?:-[A-Za-z0-9]+)*)?`;
  const literalListPattern = new RegExp(`^\\s*${literalPattern}(?:\\s*,\\s*${literalPattern})*\\s*$`);
  if (!literalListPattern.test(segment)) {
    issues.push(issue(
      `turtle.${equipmentId}.label`,
      "invalid_literal",
      `Equipment ${equipmentId} has an unsupported rdfs:label literal list.`
    ));
    return values;
  }
  const literalMatches = [...segment.matchAll(/"((?:\\.|[^"\\])*)"(?:@[A-Za-z0-9-]+|\^\^[^\s,]+)?/g)];
  if (literalMatches.length === 0) {
    issues.push(issue(
      `turtle.${equipmentId}.label`,
      "invalid_literal",
      `Equipment ${equipmentId} has an unsupported rdfs:label literal.`
    ));
    return values;
  }
  for (const literalMatch of literalMatches) {
    const decoded = decodeTurtleString(literalMatch[1]!);
    if (decoded === null) {
      issues.push(issue(
        `turtle.${equipmentId}.label`,
        "invalid_literal",
        `Equipment ${equipmentId} has an unsupported rdfs:label literal.`
      ));
      continue;
    }
    const normalized = normalizeText(decoded);
    if (normalized) values.push(normalized);
  }
  return values;
}

/**
 * Extract equipment from the repository's controlled, generated Turtle shape.
 * This is deliberately not a general RDF reasoner: only prefixed subjects,
 * rdf:type (`a`), and simple quoted rdfs:label values are consumed.
 */
export function parseBrickEquipmentSnapshot(
  input: ParseBrickEquipmentSnapshotInput
): ReportValidationResult<ReportAssetSnapshot> {
  const issues: ReportValidationIssue[] = [];
  const projectId = requiredText(input.projectId, "projectId", issues);
  const sourceId = requiredText(input.sourceId, "sourceId", issues);
  if (typeof input.turtle !== "string" || !input.turtle.trim()) {
    issues.push(issue("turtle", "required", "Turtle source must be a non-empty string."));
    return { ok: false, issues };
  }
  const turtle = input.turtle.replace(/\r\n?/g, "\n");
  const prefixes = new Map<string, string>();
  for (const match of turtle.matchAll(/^@prefix\s+([A-Za-z][\w-]*):\s*<([^>]+)>\s*\.\s*$/gm)) {
    prefixes.set(match[1]!, match[2]!);
  }
  const rdfsPrefixes = [...prefixes.entries()]
    .filter(([, uri]) => uri === RDFS_NAMESPACE)
    .map(([prefix]) => prefix);
  const rdfPrefixes = [...prefixes.entries()]
    .filter(([, uri]) => uri === RDF_NAMESPACE)
    .map(([prefix]) => prefix);
  if (![...prefixes.values()].includes(BRICK_NAMESPACE)) {
    issues.push(issue("turtle", "missing_brick_prefix", "Turtle source must declare the Brick namespace."));
  }
  const recognizedTypes = new Set(input.recognizedEquipmentTypes ?? DEFAULT_BRICK_REPORT_ASSET_TYPES);
  const factsByRef = new Map<string, TurtleSubjectFacts>();
  const documentBody = turtle
    .replace(/^@prefix\s+[A-Za-z][\w-]*:\s*<[^>]+>\s*\.\s*$/gm, "")
    .replace(/^[ \t]*#.*$/gm, "");
  const blocks = documentBody.split(/\n[ \t]*\n/);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const topLevelSubjects = trimmed.match(/^[A-Za-z][\w-]*:[^\s;,]+\s+/gm) ?? [];
    if (topLevelSubjects.length > 1) {
      issues.push(issue(
        "turtle",
        "unsupported_turtle_shape",
        "Controlled semantic-model statements must be separated by a blank line."
      ));
      continue;
    }
    const statement = /^([A-Za-z][\w-]*):([^\s;,]+)\s+([\s\S]+?)\s*\.\s*$/.exec(trimmed);
    if (!statement) {
      issues.push(issue(
        "turtle",
        "unsupported_turtle_shape",
        "Semantic-model statements must use a declared prefixed subject and end with a period."
      ));
      continue;
    }
    const subjectPrefix = statement[1]!;
    const sourceEquipmentId = statement[2]!;
    const body = statement[3]!;
    const subjectNamespace = prefixes.get(subjectPrefix);
    if (!subjectNamespace) {
      issues.push(issue(
        `turtle.${sourceEquipmentId}`,
        "unknown_prefix",
        `Equipment ${sourceEquipmentId} uses undeclared prefix ${subjectPrefix}.`
      ));
      continue;
    }
    const sourceRef = `${subjectNamespace}${sourceEquipmentId}`;
    const facts = factsByRef.get(sourceRef) ?? {
      equipmentId: sourceEquipmentId,
      sourceRef,
      sourceTypes: new Set<string>(),
      labels: new Set<string>()
    };
    const typePredicate = [
      "a",
      ...rdfPrefixes.map((prefix) => `${escapeRegExp(prefix)}:type`)
    ].join("|");
    const typeSegments = [...body.matchAll(new RegExp(`(?:^|;)\\s*(?:${typePredicate})\\s+([^;]+)`, "g"))];
    for (const typeSegment of typeSegments) {
      const typeObjects = typeSegment[1]!;
      const prefixedNamePattern = `[A-Za-z][\\w-]*:[A-Za-z0-9_][A-Za-z0-9_.-]*`;
      const typeListPattern = new RegExp(`^\\s*${prefixedNamePattern}(?:\\s*,\\s*${prefixedNamePattern})*\\s*$`);
      if (!typeListPattern.test(typeObjects)) {
        issues.push(issue(
          `turtle.${sourceEquipmentId}.type`,
          "unsupported_turtle_shape",
          `Equipment ${sourceEquipmentId} has an unsupported rdf:type object list.`
        ));
        continue;
      }
      for (const typeMatch of typeObjects.matchAll(/([A-Za-z][\w-]*):([A-Za-z0-9_][A-Za-z0-9_.-]*)/g)) {
        const typeNamespace = prefixes.get(typeMatch[1]!);
        if (!typeNamespace) {
          issues.push(issue(
            `turtle.${sourceEquipmentId}.type`,
            "unknown_prefix",
            `Equipment ${sourceEquipmentId} type uses undeclared prefix ${typeMatch[1]!}.`
          ));
          continue;
        }
        facts.sourceTypes.add(`${typeNamespace}${typeMatch[2]!}`);
      }
    }
    for (const rdfsPrefix of rdfsPrefixes) {
      const labelSegments = [...body.matchAll(new RegExp(
        `(?:^|;)\\s*${escapeRegExp(rdfsPrefix)}:label\\s+([^;]+)`,
        "g"
      ))];
      for (const labelSegment of labelSegments) {
        for (const label of labelValues(labelSegment[1]!, sourceEquipmentId, issues)) {
          facts.labels.add(label);
        }
      }
    }
    factsByRef.set(sourceRef, facts);
  }

  const equipment: ReportAssetRecord[] = [];
  const equipmentRefsById = new Map<string, string>();
  for (const facts of [...factsByRef.values()].sort((left, right) => compareNatural(left.sourceRef, right.sourceRef))) {
    const matchedTypes = uniqueSorted([...facts.sourceTypes].filter((sourceType) => recognizedTypes.has(sourceType)));
    if (matchedTypes.length === 0) continue;
    const existingRef = equipmentRefsById.get(facts.equipmentId);
    if (existingRef && existingRef !== facts.sourceRef) {
      issues.push(issue(
        `turtle.${facts.equipmentId}`,
        "ambiguous_equipment_id",
        `Equipment local ID ${facts.equipmentId} occurs in more than one semantic namespace.`
      ));
      continue;
    }
    equipmentRefsById.set(facts.equipmentId, facts.sourceRef);
    const labels = uniqueSorted([...facts.labels]);
    const identifierLabels = labels.filter((label) => looksLikeEquipmentShortIdentifier(label, facts.equipmentId));
    const descriptiveLabels = labels.filter((label) => !looksLikeEquipmentShortIdentifier(label, facts.equipmentId));
    if (
      identifierLabels.length > 1
      && !identifierLabels.every((label) => isEquipmentIdentifierOnlyName(label, facts.equipmentId))
    ) {
      issues.push(issue(
        `turtle.${facts.equipmentId}.label`,
        "conflicting_short_identifier",
        `Equipment ${facts.equipmentId} has conflicting semantic short identifiers.`
      ));
    }
    if (descriptiveLabels.length > 1) {
      issues.push(issue(
        `turtle.${facts.equipmentId}.label`,
        "conflicting_equipment_name",
        `Equipment ${facts.equipmentId} has multiple descriptive semantic labels.`
      ));
    }
    const shortIdentifier = identifierLabels[0];
    const fullName = descriptiveLabels[0] ?? shortIdentifier;
    equipment.push({
      equipmentId: facts.equipmentId,
      sourceRef: facts.sourceRef,
      sourceTypes: uniqueSorted([...facts.sourceTypes]),
      ...(shortIdentifier ? { shortIdentifier } : {}),
      ...(fullName ? { fullName } : {})
    });
  }

  if (equipment.length === 0) {
    issues.push(issue("turtle", "no_report_assets", "Semantic model contains no recognized report equipment assets."));
  }
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: {
      projectId,
      sourceKind: "semantic_model",
      sourceId,
      sourceRevision: sha256(input.turtle),
      equipment
    }
  };
}

function safeProjectId(projectId: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(projectId);
}

/** Load the fixed project semantic model without accepting a caller-controlled path. */
export async function discoverProjectReportAssets(
  input: DiscoverProjectReportAssetsInput
): Promise<ReportValidationResult<ResolvedReportAssets>> {
  const projectId = normalizeText(input.projectId);
  if (!projectId || !safeProjectId(projectId)) {
    return {
      ok: false,
      issues: [issue("projectId", "invalid_project_id", "Project ID must be a safe repository project identifier.")]
    };
  }
  const root = path.resolve(dataRoot(input.env));
  const projectRoot = path.resolve(root, projectId);
  if (projectRoot !== root && !projectRoot.startsWith(`${root}${path.sep}`)) {
    return {
      ok: false,
      issues: [issue("projectId", "invalid_project_id", "Project asset path must remain inside the data root.")]
    };
  }
  const semanticModelPath = path.join(projectRoot, "kb", "brick_model.ttl");
  let turtle: string;
  try {
    turtle = await readFile(semanticModelPath, "utf8");
  } catch {
    return {
      ok: false,
      issues: [issue(
        "semanticModel",
        "semantic_model_not_found",
        `No authoritative semantic model exists for project ${projectId}.`
      )]
    };
  }
  const registry = input.registry ?? DEFAULT_REPORT_EQUIPMENT_PROFILE_REGISTRY;
  const recognizedEquipmentTypes = uniqueSorted([
    ...DEFAULT_BRICK_REPORT_ASSET_TYPES,
    ...registry.flatMap((registration) => registration.matchers
      .filter((matcher) => matcher.sourceKind === "semantic_model")
      .map((matcher) => normalizeText(matcher.sourceType))
      .filter(Boolean))
  ]);
  const snapshot = parseBrickEquipmentSnapshot({
    projectId,
    sourceId: "kb/brick_model.ttl",
    turtle,
    recognizedEquipmentTypes
  });
  if (!snapshot.ok) return snapshot;
  return resolveReportAssets({
    projectId,
    selection: input.selection,
    snapshots: [snapshot.value],
    registry
  });
}
