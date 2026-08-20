import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  createFleetGuardAuthorizationToken,
  fleetGuardCanonicalPlanSignature,
  fleetGuardCanonicalFingerprint,
  fleetGuardCanonicalJson,
  planFleetGuard,
  validateFleetGuardAuthorization,
  type FleetGuardPlanInput
} from "../src/index.js";

function readyInput(): FleetGuardPlanInput {
  const members = Array.from({ length: 8 }, (_, index) => ({ entityKey: `WCC_${index + 1}` }));
  return {
    algorithm: {
      id: "CH-01",
      version: "v1",
      equipmentType: "chiller",
      requiredRoles: [{ role: "command", label: "Command", quantityKind: "status", minHistoryDays: 7 }]
    },
    evaluator: { id: "ch01", requiredVersion: "ch01-v1", registeredVersion: "ch01-v1", status: "available" },
    inventory: { status: "present", equipmentType: "chiller", members },
    roleFamilies: [{ role: "command", familyKey: "start_stop", status: "verified", source: "locked_template", templateVersion: "ft@2" }],
    lookups: members.map(({ entityKey }, index) => ({
      entityKey,
      familyKey: "start_stop",
      status: "found",
      observations: [{
        entityKey,
        familyKey: "start_stop",
        pointId: `point-${index + 1}`,
        objectRef: `//wcc/${index + 1}/command`,
        ownership: { status: "verified", ownerEntityKey: entityKey, isPointOf: true },
        quantity: { status: "verified", kind: "status" },
        unit: { status: "not_required" },
        history: { status: "sufficient", observedDays: 30 }
      }]
    })),
    signatures: { algorithm: "a", evaluator: "e", inventory: "i", evidence: "d", template: "t" }
  };
}

describe("FleetGuard deployment authorization", () => {
  it("signs canonical full plans and validates every frozen input", () => {
    const plan = planFleetGuard(readyInput());
    const templateRef = { templateId: "ft", version: 2, signature: "t" };
    const token = createFleetGuardAuthorizationToken({ plan, rolloutRevision: 4, templateRef, parameterSignature: "params" });
    expect(plan.state).toBe("ready");
    expect(fleetGuardCanonicalPlanSignature(structuredClone(plan))).toBe(token.planSignature);
    expect(token.planSignature).toMatch(/^fgplan-sha256-v1-[a-f0-9]{64}$/u);
    expect(validateFleetGuardAuthorization({ submitted: token, plan, rolloutRevision: 4, templateRef, parameterSignature: "params" })).toEqual({ valid: true });
  });

  it.each([
    ["policy", (token: ReturnType<typeof createFleetGuardAuthorizationToken>) => { (token as { policyVersion: string }).policyVersion = "fleetguard-v2"; }, "policy_mismatch"],
    ["plan id", (token: ReturnType<typeof createFleetGuardAuthorizationToken>) => { token.planId = "stale"; }, "plan_id_mismatch"],
    ["plan signature", (token: ReturnType<typeof createFleetGuardAuthorizationToken>) => { token.planSignature = "fgplan-sha256-v1-stale"; }, "plan_signature_mismatch"],
    ["rollout revision", (token: ReturnType<typeof createFleetGuardAuthorizationToken>) => { token.rolloutRevision += 1; }, "rollout_revision_mismatch"],
    ["parameters", (token: ReturnType<typeof createFleetGuardAuthorizationToken>) => { token.parameterSignature = "stale"; }, "parameter_signature_mismatch"],
    ["template", (token: ReturnType<typeof createFleetGuardAuthorizationToken>) => { token.templateRef.signature = "stale"; }, "template_mismatch"],
    ["algorithm", (token: ReturnType<typeof createFleetGuardAuthorizationToken>) => { token.signatures.algorithm = "stale"; }, "algorithm_signature_mismatch"],
    ["evaluator", (token: ReturnType<typeof createFleetGuardAuthorizationToken>) => { token.signatures.evaluator = "stale"; }, "evaluator_signature_mismatch"],
    ["inventory", (token: ReturnType<typeof createFleetGuardAuthorizationToken>) => { token.signatures.inventory = "stale"; }, "inventory_signature_mismatch"],
    ["evidence", (token: ReturnType<typeof createFleetGuardAuthorizationToken>) => { token.signatures.evidence = "stale"; }, "evidence_signature_mismatch"]
  ])("rejects stale %s", (_label, mutate, expectedCode) => {
    const plan = planFleetGuard(readyInput());
    const templateRef = { templateId: "ft", version: 2, signature: "t" };
    const token = createFleetGuardAuthorizationToken({ plan, rolloutRevision: 4, templateRef, parameterSignature: "params" });
    mutate(token);
    expect(validateFleetGuardAuthorization({ submitted: token, plan, rolloutRevision: 4, templateRef, parameterSignature: "params" }).code).toBe(expectedCode);
  });

  it("binds a token to the authoritative route task rather than trusting the submitted task id", () => {
    const plan = planFleetGuard(readyInput());
    const templateRef = { templateId: "ft", version: 2, signature: "t" };
    const token = createFleetGuardAuthorizationToken({
      plan,
      rolloutRevision: 4,
      templateRef,
      parameterSignature: "params",
      taskId: "task-a"
    });
    expect(validateFleetGuardAuthorization({
      submitted: token,
      plan,
      rolloutRevision: 4,
      templateRef,
      parameterSignature: "params",
      taskId: "task-b"
    }).code).toBe("task_mismatch");
  });

  it("rejects a plan whose fleet coverage is not completely authorized", () => {
    const plan = planFleetGuard(readyInput());
    const templateRef = { templateId: "ft", version: 2, signature: "t" };
    const token = createFleetGuardAuthorizationToken({ plan, rolloutRevision: 4, templateRef, parameterSignature: "params" });
    plan.coverage.authorized = 7;
    expect(validateFleetGuardAuthorization({ submitted: token, plan, rolloutRevision: 4, templateRef, parameterSignature: "params" }).code)
      .toBe("fleet_coverage_incomplete");
  });

  it("changes the SHA-256 signature when any full-plan binding changes", () => {
    const first = planFleetGuard(readyInput());
    const changed = structuredClone(first);
    changed.entities[7]!.bindings[0]!.objectRef = "//changed";
    expect(fleetGuardCanonicalPlanSignature(changed)).not.toBe(fleetGuardCanonicalPlanSignature(first));
  });

  it.each([
    ["empty", null],
    ["ascii", { hello: "world" }],
    ["unicode", { text: "冷机 WCC-8" }],
    ["multi-block", { text: "x".repeat(130) }],
    ["fleet-plan", planFleetGuard(readyInput())]
  ])("matches Node SHA-256 for %s", (_label, value) => {
    const expected = createHash("sha256").update(fleetGuardCanonicalJson(value)).digest("hex");
    expect(fleetGuardCanonicalFingerprint(value)).toBe(expected);
  });
});
