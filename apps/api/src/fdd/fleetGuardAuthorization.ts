import {
  createFleetGuardAuthorizationToken,
  fleetGuardCanonicalFingerprint,
  fleetGuardCanonicalPlanSignature,
  type FleetGuardAuthorizationToken,
  type FleetGuardPlan,
  type FleetGuardTemplateRef
} from "@building-agent/fdd-deployment-planner";
import type { FddTaskParameterValue } from "./library.js";

export interface FddFleetGuardCheckSummary {
  kind: "fleetguard_v1";
  policyVersion: "fleetguard-v1";
  state: FleetGuardPlan["state"];
  planId: string;
  planSignature: string;
  rolloutRevision: number;
  templateRef?: FleetGuardTemplateRef;
  parameterSignature: string;
  taskId?: string;
  signatures: FleetGuardPlan["signatures"];
  coverage: FleetGuardPlan["coverage"];
  primaryBlocker?: FleetGuardPlan["primaryBlocker"];
  warnings: FleetGuardPlan["warnings"];
  authorization?: FleetGuardAuthorizationToken;
  checkedAt: string;
}

export interface FddFleetGuardAssessment {
  plan: FleetGuardPlan;
  summary: FddFleetGuardCheckSummary;
  templateRef?: FleetGuardTemplateRef;
}

export function fddFleetGuardAssessment(input: {
  plan: FleetGuardPlan;
  rolloutRevision: number;
  templateRef?: FleetGuardTemplateRef;
  checkedAt: string;
  parameterSignature: string;
  taskId?: string;
}): FddFleetGuardAssessment {
  const planSignature = fleetGuardCanonicalPlanSignature(input.plan);
  const authorization = input.plan.state === "ready" && input.templateRef
    ? createFleetGuardAuthorizationToken({
        plan: input.plan,
        rolloutRevision: input.rolloutRevision,
        templateRef: input.templateRef,
        parameterSignature: input.parameterSignature,
        ...(input.taskId ? { taskId: input.taskId } : {})
      })
    : undefined;
  const summary: FddFleetGuardCheckSummary = {
    kind: "fleetguard_v1",
    policyVersion: "fleetguard-v1",
    state: input.plan.state,
    planId: input.plan.planId,
    planSignature,
    rolloutRevision: input.rolloutRevision,
    parameterSignature: input.parameterSignature,
    ...(input.taskId ? { taskId: input.taskId } : {}),
    ...(input.templateRef ? { templateRef: { ...input.templateRef } } : {}),
    signatures: { ...input.plan.signatures },
    coverage: { ...input.plan.coverage },
    ...(input.plan.primaryBlocker ? { primaryBlocker: { ...input.plan.primaryBlocker } } : {}),
    warnings: input.plan.warnings.map((warning) => ({ ...warning })),
    ...(authorization ? { authorization } : {}),
    checkedAt: input.checkedAt
  };
  return { plan: structuredClone(input.plan), summary, ...(input.templateRef ? { templateRef: { ...input.templateRef } } : {}) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(record: Record<string, unknown>, key: string, maxLength = 10_000): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(`FleetGuard authorization ${key} is invalid.`);
  }
  return value;
}

/** Strict untrusted wire parser; malformed tokens never reach the planner validator. */
export function parseFddFleetGuardAuthorization(body: unknown): FleetGuardAuthorizationToken | undefined {
  if (!isRecord(body) || typeof body.authorization === "undefined") return undefined;
  if (!isRecord(body.authorization)) throw new Error("FleetGuard authorization must be an object.");
  const raw = body.authorization;
  if (raw.policyVersion !== "fleetguard-v1") throw new Error("FleetGuard authorization policyVersion is invalid.");
  if (!Number.isSafeInteger(raw.rolloutRevision) || (raw.rolloutRevision as number) < 1) {
    throw new Error("FleetGuard authorization rolloutRevision is invalid.");
  }
  if (!isRecord(raw.templateRef) || !Number.isSafeInteger(raw.templateRef.version) || (raw.templateRef.version as number) < 1) {
    throw new Error("FleetGuard authorization templateRef is invalid.");
  }
  if (!isRecord(raw.signatures)) throw new Error("FleetGuard authorization signatures are invalid.");
  return {
    policyVersion: "fleetguard-v1",
    planId: requiredText(raw, "planId", 2_000),
    planSignature: requiredText(raw, "planSignature", 128),
    rolloutRevision: raw.rolloutRevision as number,
    parameterSignature: requiredText(raw, "parameterSignature", 128),
    ...(typeof raw.taskId !== "undefined" ? { taskId: requiredText(raw, "taskId", 200) } : {}),
    templateRef: {
      templateId: requiredText(raw.templateRef, "templateId", 200),
      version: raw.templateRef.version as number,
      signature: requiredText(raw.templateRef, "signature", 256)
    },
    signatures: {
      algorithm: requiredText(raw.signatures, "algorithm", 256),
      evaluator: requiredText(raw.signatures, "evaluator", 2_000),
      inventory: requiredText(raw.signatures, "inventory", 256),
      evidence: requiredText(raw.signatures, "evidence", 256),
      ...(typeof raw.signatures.template !== "undefined"
        ? { template: requiredText(raw.signatures, "template", 256) }
        : {})
    }
  };
}

export function fddFleetGuardParameterSignature(values: FddTaskParameterValue[]): string {
  return `fgparams-sha256-v1-${fleetGuardCanonicalFingerprint(values.map((value) => ({
    key: value.key,
    value: value.value,
    unit: value.unit ?? null,
    source: value.source
  })).sort((left, right) => left.key.localeCompare(right.key)))}`;
}
