import { createHash, randomUUID } from "node:crypto";
import type { FleetGuardPlanInput, FleetGuardRoleFamilyEvidence } from "@building-agent/fdd-deployment-planner";
import type { SeedStore } from "../seed.js";
import type { FddAlgorithm } from "./library.js";
import { isExecutableFddAlgorithm } from "./runtimeRegistry.js";
import {
  fddFleetGuardAlgorithmEvidenceSignature,
  fddFleetGuardEvaluatorEvidenceSignature
} from "./bindingProposerEvidenceAdapter.js";

export const FDD_FLEET_TEMPLATE_SCHEMA_VERSION = 1;

export type FddFleetTemplateState = "draft" | "locked";
export type FddFleetTemplateAction = "create" | "revise" | "lock" | "unlock" | "restore";

export interface FddFleetTemplateRole {
  role: string;
  familyKey: string;
}

export interface FddFleetTemplateCompatibilitySnapshot {
  equipmentType: FddAlgorithm["equipmentType"];
  algorithm: {
    id: string;
    key: string;
    version: string;
    signature: string;
  };
  evaluator: {
    id: string;
    signature: string;
  };
}

export interface FddFleetTemplateVersion {
  schemaVersion: typeof FDD_FLEET_TEMPLATE_SCHEMA_VERSION;
  templateId: string;
  projectId: string;
  version: number;
  state: FddFleetTemplateState;
  compatibility: FddFleetTemplateCompatibilitySnapshot;
  roles: FddFleetTemplateRole[];
  signature: string;
  supersedesVersion?: number;
  restoredFromVersion?: number;
  sourceProposalId?: string;
  reason: string;
  createdAt: string;
  createdBy: string;
}

export interface FddFleetTemplateAuditEvent {
  id: string;
  projectId: string;
  templateId: string;
  action: FddFleetTemplateAction;
  fromVersion?: number;
  fromSignature?: string;
  toVersion: number;
  toSignature: string;
  actorId: string;
  occurredAt: string;
  requestId: string;
  reason: string;
  signature: string;
}

export interface FddFleetTemplateView extends FddFleetTemplateVersion {
  currentCompatibility: {
    compatible: boolean;
    reason?: string;
  };
}

export interface FddFleetTemplateDetail {
  head: FddFleetTemplateView;
  versions: FddFleetTemplateVersion[];
  audit: FddFleetTemplateAuditEvent[];
}

export class FddFleetTemplateError extends Error {
  constructor(
    readonly statusCode: 404 | 409 | 422,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "FddFleetTemplateError";
  }
}

export interface FddFleetTemplateBindingsOptions {
  onChange?: () => void;
  now?: () => string;
  nextId?: () => string;
  evaluatorAvailable?: (algorithm: FddAlgorithm) => boolean;
}

export interface FddFleetTemplateCreateContext {
  projectId: string;
  actorId: string;
  requestId: string;
  input: unknown;
}

export interface FddFleetTemplateUpdateContext extends FddFleetTemplateCreateContext {
  templateId: string;
}

interface ParsedCreateInput {
  algorithmId: string;
  roles: unknown;
  reason: string;
  sourceProposalId?: string;
}

interface ParsedUpdateInput {
  action: Exclude<FddFleetTemplateAction, "create">;
  baseVersion: number;
  baseSignature: string;
  reason: string;
  roles?: unknown;
  restoreVersion?: number;
  sourceProposalId?: string;
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

function canonicalSha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new FddFleetTemplateError(422, "fdd_fleet_template_invalid", "The fleet template request body must be an object.");
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > maxLength) {
    throw new FddFleetTemplateError(422, "fdd_fleet_template_invalid", `${label} must be 1-${maxLength} characters.`);
  }
  return text;
}

function optionalText(value: unknown, label: string, maxLength: number): string | undefined {
  if (typeof value === "undefined") return undefined;
  return requiredText(value, label, maxLength);
}

function parseCreateInput(value: unknown): ParsedCreateInput {
  const input = asRecord(value);
  const sourceProposalId = optionalText(input.sourceProposalId, "sourceProposalId", 200);
  return {
    algorithmId: requiredText(input.algorithmId, "algorithmId", 200),
    roles: input.roles,
    reason: requiredText(input.reason, "reason", 500),
    ...(sourceProposalId ? { sourceProposalId } : {})
  };
}

function parseUpdateInput(value: unknown): ParsedUpdateInput {
  const input = asRecord(value);
  const action = input.action;
  if (action !== "revise" && action !== "lock" && action !== "unlock" && action !== "restore") {
    throw new FddFleetTemplateError(422, "fdd_fleet_template_invalid", "action must be revise, lock, unlock, or restore.");
  }
  if (!Number.isSafeInteger(input.baseVersion) || (input.baseVersion as number) < 1) {
    throw new FddFleetTemplateError(422, "fdd_fleet_template_invalid", "baseVersion must be a positive integer.");
  }
  const restoreVersion = action === "restore"
    ? input.restoreVersion
    : undefined;
  if (action === "restore" && (!Number.isSafeInteger(restoreVersion) || (restoreVersion as number) < 1)) {
    throw new FddFleetTemplateError(422, "fdd_fleet_template_invalid", "restoreVersion must be a positive integer.");
  }
  const sourceProposalId = optionalText(input.sourceProposalId, "sourceProposalId", 200);
  return {
    action,
    baseVersion: input.baseVersion as number,
    baseSignature: requiredText(input.baseSignature, "baseSignature", 100),
    reason: requiredText(input.reason, "reason", 500),
    ...(action === "revise" ? { roles: input.roles } : {}),
    ...(typeof restoreVersion === "number" ? { restoreVersion } : {}),
    ...(sourceProposalId ? { sourceProposalId } : {})
  };
}

function requiredRoleNames(algorithm: FddAlgorithm): string[] {
  const roles = algorithm.requiredPoints
    .filter((point) => point.required)
    .map((point) => point.slot.trim())
    .filter(Boolean)
    .sort(compareText);
  if (roles.length === 0 || new Set(roles).size !== roles.length) {
    throw new FddFleetTemplateError(
      422,
      "fdd_fleet_template_incompatible",
      "The algorithm must expose a non-empty, unique set of required roles."
    );
  }
  return roles;
}

function normalizeRoles(value: unknown, algorithm: FddAlgorithm): FddFleetTemplateRole[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) {
    throw new FddFleetTemplateError(422, "fdd_fleet_template_invalid", "roles must contain 1-64 role-family mappings.");
  }
  const roles = value.map((entry) => {
    const record = asRecord(entry);
    const role = requiredText(record.role, "role", 128);
    const familyKey = requiredText(record.familyKey, "familyKey", 128).toLowerCase();
    if (!/^[a-z0-9][a-z0-9_.:-]*$/u.test(familyKey)) {
      throw new FddFleetTemplateError(422, "fdd_fleet_template_invalid", "familyKey contains unsupported characters.");
    }
    return { role, familyKey };
  }).sort((left, right) => compareText(left.role, right.role));

  const expectedRoles = requiredRoleNames(algorithm);
  const actualRoles = roles.map((entry) => entry.role);
  if (new Set(actualRoles).size !== actualRoles.length || canonicalJson(actualRoles) !== canonicalJson(expectedRoles)) {
    throw new FddFleetTemplateError(
      422,
      "fdd_fleet_template_roles_mismatch",
      "roles must map every required algorithm role exactly once and may not include extra roles."
    );
  }
  if (new Set(roles.map((entry) => entry.familyKey)).size !== roles.length) {
    throw new FddFleetTemplateError(
      422,
      "fdd_fleet_template_roles_mismatch",
      "Each required role must map to a distinct point family."
    );
  }
  return roles;
}

function compatibilitySnapshot(
  projectId: string,
  algorithm: FddAlgorithm,
  evaluatorAvailable: boolean
): FddFleetTemplateCompatibilitySnapshot {
  if (!evaluatorAvailable) {
    throw new FddFleetTemplateError(
      422,
      "fdd_fleet_template_incompatible",
      "The algorithm does not have a compatible executable evaluator."
    );
  }
  return {
    equipmentType: algorithm.equipmentType,
    algorithm: {
      id: algorithm.id,
      key: algorithm.algorithmKey,
      version: algorithm.version,
      signature: fddFleetGuardAlgorithmEvidenceSignature({ projectId, algorithm })
    },
    evaluator: {
      id: algorithm.algorithmKey,
      signature: fddFleetGuardEvaluatorEvidenceSignature({
        projectId,
        evaluatorId: algorithm.algorithmKey,
        evaluatorAvailable
      })
    }
  };
}

function templateSignature(version: Omit<FddFleetTemplateVersion, "signature">): string {
  return canonicalSha256({
    schemaVersion: version.schemaVersion,
    templateId: version.templateId,
    projectId: version.projectId,
    version: version.version,
    state: version.state,
    compatibility: version.compatibility,
    roles: version.roles
  });
}

function auditSignature(event: Omit<FddFleetTemplateAuditEvent, "signature">): string {
  return canonicalSha256(event);
}

function versionsForProject(store: SeedStore, projectId: string): FddFleetTemplateVersion[] {
  store.fddFleetTemplateVersionsByProject ??= {};
  store.fddFleetTemplateVersionsByProject[projectId] ??= [];
  return store.fddFleetTemplateVersionsByProject[projectId]!;
}

function auditsForProject(store: SeedStore, projectId: string): FddFleetTemplateAuditEvent[] {
  store.fddFleetTemplateAuditByProject ??= {};
  store.fddFleetTemplateAuditByProject[projectId] ??= [];
  return store.fddFleetTemplateAuditByProject[projectId]!;
}

function headForTemplate(versions: FddFleetTemplateVersion[], templateId: string): FddFleetTemplateVersion | undefined {
  return versions
    .filter((version) => version.templateId === templateId)
    .sort((left, right) => right.version - left.version)[0];
}

function compatibilityWithCurrent(
  projectId: string,
  version: FddFleetTemplateVersion,
  algorithm: FddAlgorithm | undefined,
  evaluatorAvailable: (algorithm: FddAlgorithm) => boolean
): FddFleetTemplateView["currentCompatibility"] {
  if (!algorithm) {
    return { compatible: false, reason: "algorithm_missing" };
  }
  if (!evaluatorAvailable(algorithm)) {
    return { compatible: false, reason: "evaluator_missing" };
  }
  let current: FddFleetTemplateCompatibilitySnapshot;
  try {
    current = compatibilitySnapshot(projectId, algorithm, true);
  } catch {
    return { compatible: false, reason: "evaluator_missing" };
  }
  return canonicalJson(current) === canonicalJson(version.compatibility)
    ? { compatible: true }
    : { compatible: false, reason: "algorithm_or_evaluator_changed" };
}

function makeVersion(input: {
  projectId: string;
  templateId: string;
  version: number;
  state: FddFleetTemplateState;
  compatibility: FddFleetTemplateCompatibilitySnapshot;
  roles: FddFleetTemplateRole[];
  supersedesVersion?: number;
  restoredFromVersion?: number;
  sourceProposalId?: string;
  reason: string;
  createdAt: string;
  createdBy: string;
}): FddFleetTemplateVersion {
  const unsigned: Omit<FddFleetTemplateVersion, "signature"> = {
    schemaVersion: FDD_FLEET_TEMPLATE_SCHEMA_VERSION,
    ...input,
    compatibility: clone(input.compatibility),
    roles: clone(input.roles)
  };
  return { ...unsigned, signature: templateSignature(unsigned) };
}

function makeAuditEvent(input: Omit<FddFleetTemplateAuditEvent, "id" | "signature"> & { id: string }): FddFleetTemplateAuditEvent {
  return { ...input, signature: auditSignature(input) };
}

export function ensureStoreFddFleetTemplates(store: SeedStore): boolean {
  let changed = false;
  if (!store.fddFleetTemplateVersionsByProject) {
    store.fddFleetTemplateVersionsByProject = {};
    changed = true;
  }
  if (!store.fddFleetTemplateAuditByProject) {
    store.fddFleetTemplateAuditByProject = {};
    changed = true;
  }
  return changed;
}

export function currentFddFleetTemplateHead(
  store: SeedStore,
  projectId: string,
  algorithmId: string
): FddFleetTemplateVersion | undefined {
  const versions = (store.fddFleetTemplateVersionsByProject?.[projectId] ?? [])
    .filter((version) => version.projectId === projectId);
  const templateIds = [...new Set(versions
    .filter((version) => version.compatibility.algorithm.id === algorithmId)
    .map((version) => version.templateId))];
  if (templateIds.length !== 1) return undefined;
  const head = headForTemplate(versions, templateIds[0]!);
  return head ? clone(head) : undefined;
}

export function fddFleetTemplateVersionByRef(
  store: SeedStore,
  projectId: string,
  templateId: string,
  version: number
): FddFleetTemplateVersion | undefined {
  const match = (store.fddFleetTemplateVersionsByProject?.[projectId] ?? []).find((entry) =>
    entry.projectId === projectId
    && entry.templateId === templateId
    && entry.version === version
  );
  return match ? clone(match) : undefined;
}

export function fleetTemplatePlanSignatureIsCurrent(
  store: SeedStore,
  projectId: string,
  algorithmId: string,
  planTemplateSignature: string | undefined
): boolean {
  const head = currentFddFleetTemplateHead(store, projectId, algorithmId);
  return head ? planTemplateSignature === head.signature : typeof planTemplateSignature === "undefined";
}

function templateMatchesPlannerInput(version: FddFleetTemplateVersion, input: FleetGuardPlanInput): boolean {
  return version.compatibility.algorithm.id === input.algorithm.id
    && version.compatibility.algorithm.version === input.algorithm.version
    && version.compatibility.algorithm.signature === input.signatures.algorithm
    && version.compatibility.evaluator.id === input.evaluator.id
    && version.compatibility.evaluator.signature === input.signatures.evaluator
    && version.compatibility.equipmentType === input.algorithm.equipmentType;
}

/**
 * Pure future-snapshot adapter. It never writes the store or mutates its input,
 * and it cannot alter existing v4 checks, tasks, metrics, or materializations.
 */
export function applyCurrentFddFleetTemplateToPlannerInput(
  store: SeedStore,
  projectId: string,
  input: FleetGuardPlanInput
): FleetGuardPlanInput {
  const next = clone(input);
  next.roleFamilies = next.roleFamilies.filter((entry) => entry.source !== "locked_template");
  const head = currentFddFleetTemplateHead(store, projectId, input.algorithm.id);
  if (!head) return next;

  next.signatures = { ...next.signatures, template: head.signature };
  if (head.state !== "locked" || !templateMatchesPlannerInput(head, next)) return next;

  const templateVersion = `${head.templateId}@${head.version}`;
  const evidence: FleetGuardRoleFamilyEvidence[] = head.roles.map((role) => ({
    role: role.role,
    familyKey: role.familyKey,
    status: "verified",
    source: "locked_template",
    templateVersion
  }));
  next.roleFamilies = [...next.roleFamilies, ...evidence];
  return next;
}

export function createFddFleetTemplateBindings(
  store: SeedStore,
  options: FddFleetTemplateBindingsOptions = {}
) {
  ensureStoreFddFleetTemplates(store);
  const now = options.now ?? (() => new Date().toISOString());
  const nextId = options.nextId ?? (() => randomUUID());
  const evaluatorAvailable = options.evaluatorAvailable ?? isExecutableFddAlgorithm;
  const algorithmById = (algorithmId: string): FddAlgorithm | undefined =>
    (store.fddAlgorithms ?? []).find((algorithm) => algorithm.id === algorithmId);
  const algorithmForVersion = (version: FddFleetTemplateVersion): FddAlgorithm | undefined =>
    algorithmById(version.compatibility.algorithm.id)
    ?? (store.fddAlgorithms ?? []).find((algorithm) => algorithm.algorithmKey === version.compatibility.algorithm.key);

  const view = (projectId: string, version: FddFleetTemplateVersion): FddFleetTemplateView => ({
    ...clone(version),
    currentCompatibility: compatibilityWithCurrent(projectId, version, algorithmForVersion(version), evaluatorAvailable)
  });

  const list = (projectId: string): FddFleetTemplateView[] => {
    const versions = (store.fddFleetTemplateVersionsByProject?.[projectId] ?? [])
      .filter((version) => version.projectId === projectId);
    return [...new Set(versions.map((version) => version.templateId))]
      .map((templateId) => headForTemplate(versions, templateId))
      .filter((version): version is FddFleetTemplateVersion => Boolean(version))
      .sort((left, right) => compareText(left.compatibility.algorithm.key, right.compatibility.algorithm.key))
      .map((version) => view(projectId, version));
  };

  const get = (projectId: string, templateId: string): FddFleetTemplateDetail | undefined => {
    const versions = (store.fddFleetTemplateVersionsByProject?.[projectId] ?? [])
      .filter((version) => version.projectId === projectId && version.templateId === templateId)
      .sort((left, right) => left.version - right.version);
    const head = versions[versions.length - 1];
    if (!head) return undefined;
    const audit = (store.fddFleetTemplateAuditByProject?.[projectId] ?? [])
      .filter((event) => event.projectId === projectId && event.templateId === templateId)
      .sort((left, right) => left.toVersion - right.toVersion);
    return { head: view(projectId, head), versions: clone(versions), audit: clone(audit) };
  };

  const append = (version: FddFleetTemplateVersion, audit: FddFleetTemplateAuditEvent): FddFleetTemplateView => {
    versionsForProject(store, version.projectId).push(version);
    auditsForProject(store, version.projectId).push(audit);
    options.onChange?.();
    return view(version.projectId, version);
  };

  const create = (context: FddFleetTemplateCreateContext): FddFleetTemplateView => {
    const input = parseCreateInput(context.input);
    const algorithm = algorithmById(input.algorithmId);
    if (!algorithm) {
      throw new FddFleetTemplateError(404, "fdd_algorithm_not_found", "The requested FDD algorithm does not exist.");
    }
    if (!evaluatorAvailable(algorithm)) {
      throw new FddFleetTemplateError(422, "fdd_fleet_template_incompatible", "The algorithm does not have a compatible executable evaluator.");
    }
    if ((store.fddFleetTemplateVersionsByProject?.[context.projectId] ?? [])
      .some((version) => version.projectId === context.projectId && version.compatibility.algorithm.key === algorithm.algorithmKey)) {
      throw new FddFleetTemplateError(409, "fdd_fleet_template_exists", "A fleet template already exists for this algorithm.");
    }
    const compatibility = compatibilitySnapshot(context.projectId, algorithm, evaluatorAvailable(algorithm));
    const createdAt = now();
    const templateId = `fddft_${nextId()}`;
    const version = makeVersion({
      projectId: context.projectId,
      templateId,
      version: 1,
      state: "draft",
      compatibility,
      roles: normalizeRoles(input.roles, algorithm),
      ...(input.sourceProposalId ? { sourceProposalId: input.sourceProposalId } : {}),
      reason: input.reason,
      createdAt,
      createdBy: context.actorId
    });
    const audit = makeAuditEvent({
      id: `fddfta_${nextId()}`,
      projectId: context.projectId,
      templateId,
      action: "create",
      toVersion: version.version,
      toSignature: version.signature,
      actorId: context.actorId,
      occurredAt: createdAt,
      requestId: context.requestId,
      reason: input.reason
    });
    return append(version, audit);
  };

  const update = (context: FddFleetTemplateUpdateContext): FddFleetTemplateView => {
    const input = parseUpdateInput(context.input);
    const projectVersions = (store.fddFleetTemplateVersionsByProject?.[context.projectId] ?? [])
      .filter((version) => version.projectId === context.projectId);
    const head = headForTemplate(projectVersions, context.templateId);
    if (!head) {
      throw new FddFleetTemplateError(404, "fdd_fleet_template_not_found", "The requested fleet template does not exist in this project.");
    }
    if (input.baseVersion !== head.version || input.baseSignature !== head.signature) {
      throw new FddFleetTemplateError(409, "fdd_fleet_template_stale", "The fleet template changed; reload it and retry with the current version and signature.");
    }
    const algorithm = algorithmForVersion(head);
    if (!algorithm || !evaluatorAvailable(algorithm)) {
      throw new FddFleetTemplateError(422, "fdd_fleet_template_incompatible", "The algorithm or evaluator is no longer compatible with this template.");
    }
    const compatibility = compatibilitySnapshot(context.projectId, algorithm, true);
    const headIsCompatible = canonicalJson(compatibility) === canonicalJson(head.compatibility);

    let state: FddFleetTemplateState;
    let roles: FddFleetTemplateRole[];
    let restoredFromVersion: number | undefined;
    if (input.action === "revise") {
      state = "draft";
      roles = normalizeRoles(input.roles, algorithm);
      if (headIsCompatible && head.state === state && canonicalJson(head.roles) === canonicalJson(roles)) {
        throw new FddFleetTemplateError(422, "fdd_fleet_template_noop", "The revision does not change the current template.");
      }
    } else if (input.action === "lock") {
      if (!headIsCompatible) {
        throw new FddFleetTemplateError(
          422,
          "fdd_fleet_template_incompatible",
          "The algorithm or evaluator changed; revise the template against the current contract before locking it."
        );
      }
      if (head.state === "locked") {
        throw new FddFleetTemplateError(422, "fdd_fleet_template_noop", "The current template is already locked.");
      }
      state = "locked";
      roles = normalizeRoles(head.roles, algorithm);
    } else if (input.action === "unlock") {
      if (!headIsCompatible) {
        throw new FddFleetTemplateError(
          422,
          "fdd_fleet_template_incompatible",
          "The algorithm or evaluator changed; revise the template against the current contract before unlocking it."
        );
      }
      if (head.state === "draft") {
        throw new FddFleetTemplateError(422, "fdd_fleet_template_noop", "The current template is already a draft.");
      }
      state = "draft";
      roles = normalizeRoles(head.roles, algorithm);
    } else {
      const restored = projectVersions.find((version) =>
        version.templateId === context.templateId && version.version === input.restoreVersion
      );
      if (!restored) {
        throw new FddFleetTemplateError(404, "fdd_fleet_template_version_not_found", "The requested historical fleet template version does not exist.");
      }
      const restoredIsCompatible = canonicalJson(restored.compatibility) === canonicalJson(compatibility);
      // Restoring an old locked mapping after contract drift must not silently
      // re-authorize it. It becomes a current-contract draft and needs a new lock.
      state = restored.state === "locked" && !restoredIsCompatible ? "draft" : restored.state;
      roles = normalizeRoles(restored.roles, algorithm);
      restoredFromVersion = restored.version;
      if (head.state === state && canonicalJson(head.roles) === canonicalJson(roles)) {
        throw new FddFleetTemplateError(422, "fdd_fleet_template_noop", "The restored version is identical to the current template.");
      }
    }

    const createdAt = now();
    const version = makeVersion({
      projectId: context.projectId,
      templateId: context.templateId,
      version: head.version + 1,
      state,
      compatibility,
      roles,
      supersedesVersion: head.version,
      ...(typeof restoredFromVersion === "number" ? { restoredFromVersion } : {}),
      ...(input.sourceProposalId ? { sourceProposalId: input.sourceProposalId } : {}),
      reason: input.reason,
      createdAt,
      createdBy: context.actorId
    });
    const audit = makeAuditEvent({
      id: `fddfta_${nextId()}`,
      projectId: context.projectId,
      templateId: context.templateId,
      action: input.action,
      fromVersion: head.version,
      fromSignature: head.signature,
      toVersion: version.version,
      toSignature: version.signature,
      actorId: context.actorId,
      occurredAt: createdAt,
      requestId: context.requestId,
      reason: input.reason
    });
    return append(version, audit);
  };

  return { list, get, create, update };
}
