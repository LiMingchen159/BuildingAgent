import { describe, expect, it } from "vitest";
import type { FleetGuardPlanInput } from "@building-agent/fdd-deployment-planner";
import { cloneStore, createSeedStore } from "../seed.js";
import { ensureStoreFddLibrary, type FddAlgorithm } from "./library.js";
import {
  applyCurrentFddFleetTemplateToPlannerInput,
  createFddFleetTemplateBindings,
  ensureStoreFddFleetTemplates,
  fddFleetTemplateVersionByRef,
  FddFleetTemplateError,
  fleetTemplatePlanSignatureIsCurrent
} from "./fleetTemplates.js";

function fixture() {
  const store = createSeedStore();
  ensureStoreFddLibrary(store);
  const algorithm = store.fddAlgorithms!.find((entry) =>
    entry.algorithmKey === "chiller_ch_01_commanded_fails_to_start"
  )!;
  const requiredRoles = algorithm.requiredPoints
    .filter((point) => point.required)
    .map((point, index) => ({ role: point.slot, familyKey: `family_${index + 1}` }));
  let id = 0;
  const bindings = createFddFleetTemplateBindings(store, {
    now: () => "2026-08-20T00:00:00.000Z",
    nextId: () => `fixed_${++id}`
  });
  return { store, algorithm, requiredRoles, bindings };
}

function createDraft(value = fixture()) {
  const draft = value.bindings.create({
    projectId: "project_element",
    actorId: "user_buildinggpt",
    requestId: "req_create",
    input: {
      algorithmId: value.algorithm.id,
      roles: value.requiredRoles,
      reason: "Confirm the fleet role families."
    }
  });
  return { ...value, draft };
}

function plannerInput(algorithm: FddAlgorithm, algorithmSignature: string, evaluatorSignature: string): FleetGuardPlanInput {
  return {
    algorithm: {
      id: algorithm.id,
      version: algorithm.version,
      equipmentType: algorithm.equipmentType,
      requiredRoles: algorithm.requiredPoints.filter((point) => point.required).map((point) => ({
        role: point.slot,
        label: point.label,
        quantityKind: point.quantityKind,
        ...(point.acceptableUnits?.length ? { acceptableUnits: [...point.acceptableUnits] } : {}),
        ...(point.historyRequirement ? { minHistoryDays: point.historyRequirement.minDays } : {})
      }))
    },
    evaluator: {
      id: algorithm.algorithmKey,
      requiredVersion: algorithm.version,
      status: "available"
    },
    inventory: {
      status: "present",
      equipmentType: algorithm.equipmentType,
      members: [{ entityKey: "WCC_1" }]
    },
    roleFamilies: [],
    lookups: [],
    signatures: {
      algorithm: algorithmSignature,
      evaluator: evaluatorSignature,
      inventory: "inventory-v1",
      evidence: "evidence-v1"
    }
  };
}

describe("versioned FDD fleet templates", () => {
  it("creates a canonical v1 draft and rejects non-bijective role maps", () => {
    const value = createDraft();
    expect(value.draft).toMatchObject({
      version: 1,
      state: "draft",
      signature: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      currentCompatibility: { compatible: true }
    });
    expect(value.draft.roles.map((entry) => entry.role)).toEqual(
      [...value.requiredRoles.map((entry) => entry.role)].sort()
    );
    expect(value.store.fddFleetTemplateAuditByProject?.project_element).toHaveLength(1);

    const second = fixture();
    expect(() => second.bindings.create({
      projectId: "project_element",
      actorId: "user_buildinggpt",
      requestId: "req_invalid",
      input: {
        algorithmId: second.algorithm.id,
        roles: second.requiredRoles.map((entry) => ({ ...entry, familyKey: "same_family" })),
        reason: "This mapping is invalid."
      }
    })).toThrowError(FddFleetTemplateError);
    expect(second.store.fddFleetTemplateVersionsByProject?.project_element).toEqual([]);
  });

  it("produces the same SHA-256 for the same canonical content regardless of role order", () => {
    const left = fixture();
    const right = fixture();
    const leftDraft = left.bindings.create({
      projectId: "project_element",
      actorId: "user_buildinggpt",
      requestId: "req_left",
      input: { algorithmId: left.algorithm.id, roles: left.requiredRoles, reason: "left" }
    });
    const rightDraft = right.bindings.create({
      projectId: "project_element",
      actorId: "another_user",
      requestId: "req_right",
      input: { algorithmId: right.algorithm.id, roles: [...right.requiredRoles].reverse(), reason: "right" }
    });

    expect(leftDraft.signature).toBe(rightDraft.signature);
  });

  it("appends revise, lock, unlock, and restore versions without mutating history", () => {
    const value = createDraft();
    const original = structuredClone(value.draft);
    const revisedRoles = value.requiredRoles.map((entry, index) => ({
      ...entry,
      familyKey: `revised_${index + 1}`
    }));
    const revised = value.bindings.update({
      projectId: "project_element",
      templateId: value.draft.templateId,
      actorId: "user_buildinggpt",
      requestId: "req_revise",
      input: {
        action: "revise",
        baseVersion: value.draft.version,
        baseSignature: value.draft.signature,
        roles: revisedRoles,
        reason: "Use the corrected point families."
      }
    });
    const locked = value.bindings.update({
      projectId: "project_element",
      templateId: value.draft.templateId,
      actorId: "user_buildinggpt",
      requestId: "req_lock",
      input: {
        action: "lock",
        baseVersion: revised.version,
        baseSignature: revised.signature,
        reason: "Approve the reviewed mapping."
      }
    });
    const unlocked = value.bindings.update({
      projectId: "project_element",
      templateId: value.draft.templateId,
      actorId: "user_buildinggpt",
      requestId: "req_unlock",
      input: {
        action: "unlock",
        baseVersion: locked.version,
        baseSignature: locked.signature,
        reason: "Temporarily revoke future authorization."
      }
    });
    const restored = value.bindings.update({
      projectId: "project_element",
      templateId: value.draft.templateId,
      actorId: "user_buildinggpt",
      requestId: "req_restore",
      input: {
        action: "restore",
        baseVersion: unlocked.version,
        baseSignature: unlocked.signature,
        restoreVersion: locked.version,
        reason: "Restore the last approved mapping."
      }
    });

    expect([revised.version, locked.version, unlocked.version, restored.version]).toEqual([2, 3, 4, 5]);
    expect(restored).toMatchObject({ state: "locked", restoredFromVersion: 3, supersedesVersion: 4 });
    expect(value.bindings.get("project_element", value.draft.templateId)?.versions).toHaveLength(5);
    expect(value.bindings.get("project_element", value.draft.templateId)?.audit.map((event) => event.action))
      .toEqual(["create", "revise", "lock", "unlock", "restore"]);
    const { currentCompatibility: _currentCompatibility, ...originalVersion } = original;
    expect(value.store.fddFleetTemplateVersionsByProject?.project_element?.[0]).toEqual(originalVersion);
    expect(fddFleetTemplateVersionByRef(value.store, "project_element", value.draft.templateId, 1)).toEqual(originalVersion);
    expect(fddFleetTemplateVersionByRef(value.store, "project_mortar", value.draft.templateId, 1)).toBeUndefined();
  });

  it("uses CAS so two writers cannot both append from the same head", () => {
    const value = createDraft();
    const first = value.bindings.update({
      projectId: "project_element",
      templateId: value.draft.templateId,
      actorId: "writer_a",
      requestId: "req_a",
      input: {
        action: "lock",
        baseVersion: 1,
        baseSignature: value.draft.signature,
        reason: "Writer A approves."
      }
    });
    expect(first.version).toBe(2);
    expect(() => value.bindings.update({
      projectId: "project_element",
      templateId: value.draft.templateId,
      actorId: "writer_b",
      requestId: "req_b",
      input: {
        action: "lock",
        baseVersion: 1,
        baseSignature: value.draft.signature,
        reason: "Writer B races."
      }
    })).toThrowError(expect.objectContaining({ code: "fdd_fleet_template_stale" }));
    expect(value.store.fddFleetTemplateVersionsByProject?.project_element).toHaveLength(2);
  });

  it("lets only a compatible locked head contribute verified template evidence", () => {
    const value = createDraft();
    const input = plannerInput(
      value.algorithm,
      value.draft.compatibility.algorithm.signature,
      value.draft.compatibility.evaluator.signature
    );
    const pristine = structuredClone(input);
    const withDraft = applyCurrentFddFleetTemplateToPlannerInput(value.store, "project_element", input);
    expect(withDraft.signatures.template).toBe(value.draft.signature);
    expect(withDraft.roleFamilies).toEqual([]);
    expect(input).toEqual(pristine);

    const locked = value.bindings.update({
      projectId: "project_element",
      templateId: value.draft.templateId,
      actorId: "user_buildinggpt",
      requestId: "req_lock",
      input: {
        action: "lock",
        baseVersion: value.draft.version,
        baseSignature: value.draft.signature,
        reason: "Approve for future planning snapshots."
      }
    });
    const withLocked = applyCurrentFddFleetTemplateToPlannerInput(value.store, "project_element", input);
    expect(withLocked.signatures.template).toBe(locked.signature);
    expect(withLocked.roleFamilies).toEqual(value.requiredRoles.map((role) => ({
      ...role,
      status: "verified",
      source: "locked_template",
      templateVersion: `${locked.templateId}@2`
    })).sort((left, right) => left.role.localeCompare(right.role)));
    expect(fleetTemplatePlanSignatureIsCurrent(value.store, "project_element", value.algorithm.id, value.draft.signature)).toBe(false);
    expect(fleetTemplatePlanSignatureIsCurrent(value.store, "project_element", value.algorithm.id, locked.signature)).toBe(true);

    const incompatibleInput = structuredClone(input);
    incompatibleInput.signatures.evaluator = "changed-evaluator";
    expect(applyCurrentFddFleetTemplateToPlannerInput(value.store, "project_element", incompatibleInput).roleFamilies).toEqual([]);
  });

  it("fails closed on direct lock after contract drift but permits a current-contract draft repair", () => {
    const value = createDraft();
    value.algorithm.version = "v-next";
    expect(value.bindings.list("project_element")[0]?.currentCompatibility).toEqual({
      compatible: false,
      reason: "algorithm_or_evaluator_changed"
    });
    expect(() => value.bindings.update({
      projectId: "project_element",
      templateId: value.draft.templateId,
      actorId: "user_buildinggpt",
      requestId: "req_lock",
      input: {
        action: "lock",
        baseVersion: value.draft.version,
        baseSignature: value.draft.signature,
        reason: "This must not lock after evaluator drift."
      }
    })).toThrowError(expect.objectContaining({ code: "fdd_fleet_template_incompatible" }));
    const repaired = value.bindings.update({
      projectId: "project_element",
      templateId: value.draft.templateId,
      actorId: "user_buildinggpt",
      requestId: "req_repair",
      input: {
        action: "revise",
        baseVersion: value.draft.version,
        baseSignature: value.draft.signature,
        roles: value.requiredRoles,
        reason: "Revalidate every role against the current algorithm contract."
      }
    });
    expect(repaired).toMatchObject({ version: 2, state: "draft", currentCompatibility: { compatible: true } });
    expect(repaired.compatibility.algorithm.version).toBe("v-next");
    const relocked = value.bindings.update({
      projectId: "project_element",
      templateId: value.draft.templateId,
      actorId: "user_buildinggpt",
      requestId: "req_relock",
      input: {
        action: "lock",
        baseVersion: repaired.version,
        baseSignature: repaired.signature,
        reason: "Approve the repaired current-contract draft."
      }
    });
    expect(relocked).toMatchObject({ version: 3, state: "locked" });
  });

  it("does not let unlock silently repair a stale draft or locked template", () => {
    const staleDraftValue = createDraft();
    staleDraftValue.algorithm.version = "v-next";
    expect(() => staleDraftValue.bindings.update({
      projectId: "project_element",
      templateId: staleDraftValue.draft.templateId,
      actorId: "user_buildinggpt",
      requestId: "req_unlock_stale_draft",
      input: {
        action: "unlock",
        baseVersion: staleDraftValue.draft.version,
        baseSignature: staleDraftValue.draft.signature,
        reason: "A stale draft must be revised explicitly."
      }
    })).toThrowError(expect.objectContaining({ code: "fdd_fleet_template_incompatible" }));

    const staleLockedValue = createDraft();
    const locked = staleLockedValue.bindings.update({
      projectId: "project_element",
      templateId: staleLockedValue.draft.templateId,
      actorId: "user_buildinggpt",
      requestId: "req_lock_before_drift",
      input: {
        action: "lock",
        baseVersion: staleLockedValue.draft.version,
        baseSignature: staleLockedValue.draft.signature,
        reason: "Approve before the contract changes."
      }
    });
    staleLockedValue.algorithm.version = "v-next";
    expect(() => staleLockedValue.bindings.update({
      projectId: "project_element",
      templateId: staleLockedValue.draft.templateId,
      actorId: "user_buildinggpt",
      requestId: "req_unlock_stale_locked",
      input: {
        action: "unlock",
        baseVersion: locked.version,
        baseSignature: locked.signature,
        reason: "Unlock must not rebase compatibility implicitly."
      }
    })).toThrowError(expect.objectContaining({ code: "fdd_fleet_template_incompatible" }));
    expect(staleLockedValue.bindings.get("project_element", staleLockedValue.draft.templateId)?.head).toMatchObject({
      version: locked.version,
      state: "locked",
      signature: locked.signature,
      currentCompatibility: { compatible: false }
    });
  });

  it("marks a missing evaluator incompatible and requires it to return before revision", () => {
    const store = createSeedStore();
    ensureStoreFddLibrary(store);
    const algorithm = store.fddAlgorithms!.find((entry) =>
      entry.algorithmKey === "chiller_ch_01_commanded_fails_to_start"
    )!;
    const roles = algorithm.requiredPoints.filter((point) => point.required).map((point, index) => ({
      role: point.slot,
      familyKey: `family_${index + 1}`
    }));
    let evaluatorAvailable = true;
    const bindings = createFddFleetTemplateBindings(store, {
      evaluatorAvailable: () => evaluatorAvailable,
      nextId: () => "fixed",
      now: () => "2026-08-20T00:00:00.000Z"
    });
    const draft = bindings.create({
      projectId: "project_element",
      actorId: "admin",
      requestId: "req_create",
      input: { algorithmId: algorithm.id, roles, reason: "Initial evaluator contract." }
    });
    evaluatorAvailable = false;
    expect(bindings.list("project_element")[0]?.currentCompatibility).toEqual({
      compatible: false,
      reason: "evaluator_missing"
    });
    expect(() => bindings.update({
      projectId: "project_element",
      templateId: draft.templateId,
      actorId: "admin",
      requestId: "req_revise",
      input: {
        action: "revise",
        baseVersion: draft.version,
        baseSignature: draft.signature,
        roles,
        reason: "Cannot revise without an evaluator."
      }
    })).toThrowError(expect.objectContaining({ code: "fdd_fleet_template_incompatible" }));
    evaluatorAvailable = true;
    expect(bindings.list("project_element")[0]?.currentCompatibility).toEqual({ compatible: true });
  });

  it("restores a historically locked but incompatible version as draft before it can authorize again", () => {
    const value = createDraft();
    const locked = value.bindings.update({
      projectId: "project_element",
      templateId: value.draft.templateId,
      actorId: "user_buildinggpt",
      requestId: "req_lock_old",
      input: {
        action: "lock",
        baseVersion: value.draft.version,
        baseSignature: value.draft.signature,
        reason: "Approve the original contract."
      }
    });
    value.algorithm.version = "v-next";
    const repaired = value.bindings.update({
      projectId: "project_element",
      templateId: value.draft.templateId,
      actorId: "user_buildinggpt",
      requestId: "req_revise_new",
      input: {
        action: "revise",
        baseVersion: locked.version,
        baseSignature: locked.signature,
        roles: value.requiredRoles.map((entry, index) => ({ ...entry, familyKey: `new_${index + 1}` })),
        reason: "Repair for the new contract."
      }
    });
    const restored = value.bindings.update({
      projectId: "project_element",
      templateId: value.draft.templateId,
      actorId: "user_buildinggpt",
      requestId: "req_restore_old",
      input: {
        action: "restore",
        baseVersion: repaired.version,
        baseSignature: repaired.signature,
        restoreVersion: locked.version,
        reason: "Restore the old mapping for review under the new contract."
      }
    });
    expect(restored).toMatchObject({
      version: 4,
      state: "draft",
      restoredFromVersion: 2,
      currentCompatibility: { compatible: true }
    });
  });

  it("survives JSON restart and cloneStore without sharing nested mutable values", () => {
    const value = createDraft();
    const restarted = JSON.parse(JSON.stringify(value.store)) as ReturnType<typeof createSeedStore>;
    expect(ensureStoreFddFleetTemplates(restarted)).toBe(false);
    const restartedBindings = createFddFleetTemplateBindings(restarted);
    expect(restartedBindings.get("project_element", value.draft.templateId)?.head.signature).toBe(value.draft.signature);

    const cloned = cloneStore(value.store);
    cloned.fddFleetTemplateVersionsByProject!.project_element![0]!.roles[0]!.familyKey = "mutated_clone";
    cloned.fddFleetTemplateAuditByProject!.project_element![0]!.reason = "mutated clone";
    expect(value.store.fddFleetTemplateVersionsByProject!.project_element![0]!.roles[0]!.familyKey).not.toBe("mutated_clone");
    expect(value.store.fddFleetTemplateAuditByProject!.project_element![0]!.reason).not.toBe("mutated clone");
  });

  it("never finds a template through a different project scope", () => {
    const value = createDraft();
    expect(value.bindings.get("project_mortar", value.draft.templateId)).toBeUndefined();
    expect(value.bindings.list("project_mortar")).toEqual([]);
  });
});
