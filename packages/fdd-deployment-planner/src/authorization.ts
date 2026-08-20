import type { FleetGuardPlan, FleetGuardSignatures } from "./contracts.js";

export interface FleetGuardTemplateRef {
  templateId: string;
  version: number;
  signature: string;
}

export interface FleetGuardAuthorizationToken {
  policyVersion: "fleetguard-v1";
  planId: string;
  planSignature: string;
  rolloutRevision: number;
  parameterSignature: string;
  taskId?: string;
  templateRef: FleetGuardTemplateRef;
  signatures: Pick<FleetGuardSignatures, "algorithm" | "evaluator" | "inventory" | "evidence" | "template">;
}

export type FleetGuardAuthorizationFailureCode =
  | "plan_not_ready"
  | "fleet_coverage_incomplete"
  | "authorization_missing"
  | "policy_mismatch"
  | "plan_id_mismatch"
  | "plan_signature_mismatch"
  | "rollout_revision_mismatch"
  | "parameter_signature_mismatch"
  | "task_mismatch"
  | "template_mismatch"
  | "algorithm_signature_mismatch"
  | "evaluator_signature_mismatch"
  | "inventory_signature_mismatch"
  | "evidence_signature_mismatch";

export interface FleetGuardAuthorizationValidation {
  valid: boolean;
  code?: FleetGuardAuthorizationFailureCode;
  reason?: string;
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** Stable JSON used only for deterministic integrity fingerprints. */
export function fleetGuardCanonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(fleetGuardCanonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => typeof record[key] !== "undefined")
    .sort(compareText)
    .map((key) => `${JSON.stringify(key)}:${fleetGuardCanonicalJson(record[key])}`)
    .join(",")}}`;
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
] as const;

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/** Dependency-free, synchronous SHA-256 over the canonical UTF-8 document. */
export function fleetGuardCanonicalFingerprint(value: unknown): string {
  const input = new TextEncoder().encode(fleetGuardCanonicalJson(value));
  const bitLength = input.length * 8;
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[input.length] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  const state = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const left = words[index - 15]!;
      const right = words[index - 2]!;
      const s0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3);
      const s1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10);
      words[index] = (words[index - 16]! + s0 + words[index - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const upper = rotateRight(e!, 6) ^ rotateRight(e!, 11) ^ rotateRight(e!, 25);
      const choose = (e! & f!) ^ (~e! & g!);
      const temp1 = (h! + upper + choose + SHA256_K[index]! + words[index]!) >>> 0;
      const lower = rotateRight(a!, 2) ^ rotateRight(a!, 13) ^ rotateRight(a!, 22);
      const majority = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const temp2 = (lower + majority) >>> 0;
      h = g; g = f; f = e; e = (d! + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    state[0] = (state[0]! + a!) >>> 0;
    state[1] = (state[1]! + b!) >>> 0;
    state[2] = (state[2]! + c!) >>> 0;
    state[3] = (state[3]! + d!) >>> 0;
    state[4] = (state[4]! + e!) >>> 0;
    state[5] = (state[5]! + f!) >>> 0;
    state[6] = (state[6]! + g!) >>> 0;
    state[7] = (state[7]! + h!) >>> 0;
  }
  return state.map((word) => word.toString(16).padStart(8, "0")).join("");
}

export function fleetGuardCanonicalPlanSignature(plan: FleetGuardPlan): string {
  return `fgplan-sha256-v1-${fleetGuardCanonicalFingerprint(plan)}`;
}

/**
 * Runtime authorization digest. Audit-only metadata and warnings are
 * intentionally excluded: a corrected description/Brick label must not stop
 * an otherwise identical deployed fleet. Exact bindings, structural blockers,
 * readiness, inventory, evaluator and historical template remain covered.
 */
export function fleetGuardStructuralPlanSignature(plan: FleetGuardPlan): string {
  return `fgstruct-sha256-v1-${fleetGuardCanonicalFingerprint({
    policyVersion: plan.policyVersion,
    state: plan.state,
    algorithm: plan.algorithm,
    evaluator: plan.evaluator,
    inventory: plan.inventory,
    roleFamilies: plan.roleFamilies,
    entities: plan.entities.map((entity) => ({
      entityKey: entity.entityKey,
      state: entity.state,
      bindings: entity.bindings,
      blockers: entity.blockers,
      bound: entity.bound,
      dataReady: entity.dataReady
    })),
    coverage: plan.coverage,
    signatures: {
      algorithm: plan.signatures.algorithm,
      evaluator: plan.signatures.evaluator,
      template: plan.signatures.template
    }
  })}`;
}

export function createFleetGuardAuthorizationToken(input: {
  plan: FleetGuardPlan;
  rolloutRevision: number;
  templateRef: FleetGuardTemplateRef;
  parameterSignature: string;
  taskId?: string;
}): FleetGuardAuthorizationToken {
  return {
    policyVersion: "fleetguard-v1",
    planId: input.plan.planId,
    planSignature: fleetGuardCanonicalPlanSignature(input.plan),
    rolloutRevision: input.rolloutRevision,
    parameterSignature: input.parameterSignature,
    ...(input.taskId ? { taskId: input.taskId } : {}),
    templateRef: { ...input.templateRef },
    signatures: {
      algorithm: input.plan.signatures.algorithm,
      evaluator: input.plan.signatures.evaluator,
      inventory: input.plan.signatures.inventory,
      evidence: input.plan.signatures.evidence,
      ...(input.plan.signatures.template ? { template: input.plan.signatures.template } : {})
    }
  };
}

function invalid(code: FleetGuardAuthorizationFailureCode, reason: string): FleetGuardAuthorizationValidation {
  return { valid: false, code, reason };
}

export function validateFleetGuardAuthorization(input: {
  submitted?: FleetGuardAuthorizationToken;
  plan: FleetGuardPlan;
  rolloutRevision: number;
  templateRef: FleetGuardTemplateRef;
  parameterSignature: string;
  taskId?: string;
}): FleetGuardAuthorizationValidation {
  const { plan } = input;
  const expected = plan.coverage.expected;
  if (plan.state !== "ready") return invalid("plan_not_ready", "The fresh FleetGuard plan is not Ready.");
  if (
    expected <= 0
    || plan.inventory.entityKeys.length !== expected
    || plan.coverage.bound !== expected
    || plan.coverage.dataReady !== expected
    || plan.coverage.authorized !== expected
    || plan.entities.length !== expected
    || plan.entities.some((entity) => entity.state !== "ready" || !entity.bound || !entity.dataReady)
  ) {
    return invalid("fleet_coverage_incomplete", "FleetGuard requires complete all-or-nothing fleet coverage.");
  }
  const submitted = input.submitted;
  if (!submitted) return invalid("authorization_missing", "A FleetGuard authorization token from the latest test is required.");
  if (submitted.policyVersion !== plan.policyVersion) return invalid("policy_mismatch", "The authorization policy changed.");
  if (submitted.planId !== plan.planId) return invalid("plan_id_mismatch", "The plan identifier changed.");
  if (submitted.planSignature !== fleetGuardCanonicalPlanSignature(plan)) {
    return invalid("plan_signature_mismatch", "The canonical FleetGuard plan changed.");
  }
  if (submitted.rolloutRevision !== input.rolloutRevision) {
    return invalid("rollout_revision_mismatch", "The project rollout revision changed.");
  }
  if (submitted.parameterSignature !== input.parameterSignature) {
    return invalid("parameter_signature_mismatch", "The FDD parameters changed.");
  }
  if ((submitted.taskId ?? undefined) !== (input.taskId ?? undefined)) {
    return invalid("task_mismatch", "The target FDD task changed.");
  }
  if (
    submitted.templateRef.templateId !== input.templateRef.templateId
    || submitted.templateRef.version !== input.templateRef.version
    || submitted.templateRef.signature !== input.templateRef.signature
    || plan.signatures.template !== input.templateRef.signature
  ) {
    return invalid("template_mismatch", "The locked fleet template changed.");
  }
  const signatureChecks: Array<{
    key: "algorithm" | "evaluator" | "inventory" | "evidence";
    code: FleetGuardAuthorizationFailureCode;
  }> = [
    { key: "algorithm", code: "algorithm_signature_mismatch" },
    { key: "evaluator", code: "evaluator_signature_mismatch" },
    { key: "inventory", code: "inventory_signature_mismatch" },
    { key: "evidence", code: "evidence_signature_mismatch" }
  ];
  for (const check of signatureChecks) {
    if (submitted.signatures[check.key] !== plan.signatures[check.key]) {
      return invalid(check.code, `The ${check.key} evidence signature changed.`);
    }
  }
  if (submitted.signatures.template !== plan.signatures.template) {
    return invalid("template_mismatch", "The plan template signature changed.");
  }
  return { valid: true };
}
