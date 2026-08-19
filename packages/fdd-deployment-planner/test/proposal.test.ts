import { describe, expect, it } from "vitest";
import {
  FDD_BINDING_PROPOSAL_SCHEMA_VERSION,
  parseFddBindingProposalJson,
  validateFddBindingProposal,
  type FddBindingProposalValidationContext
} from "../src/index.js";

const context: FddBindingProposalValidationContext = {
  projectId: "project_element",
  evidenceSnapshotHash: "evidence-element-v1",
  algorithmSignature: "algorithm-ch01-v13",
  requiredRoles: ["chiller_command", "chiller_power", "chiller_status"],
  families: [
    {
      projectId: "project_element",
      pointFamilyKey: "chiller_start_stop"
    },
    {
      projectId: "project_element",
      pointFamilyKey: "run_status"
    },
    {
      projectId: "project_element",
      pointFamilyKey: "tlkw"
    },
    {
      projectId: "project_wkgo",
      pointFamilyKey: "wkgo_private_power"
    }
  ],
  evidenceRefs: [
    { id: "family_001", projectId: "project_element", pointFamilyKey: "chiller_start_stop", kind: "family_fact" },
    { id: "lookup_001", projectId: "project_element", pointFamilyKey: "chiller_start_stop", kind: "found_lookup" },
    { id: "family_002", projectId: "project_element", pointFamilyKey: "run_status", kind: "family_fact" },
    { id: "lookup_002", projectId: "project_element", pointFamilyKey: "run_status", kind: "found_lookup" },
    { id: "family_003", projectId: "project_element", pointFamilyKey: "tlkw", kind: "family_fact" },
    { id: "lookup_003", projectId: "project_element", pointFamilyKey: "tlkw", kind: "found_lookup" },
    { id: "family_999", projectId: "project_wkgo", pointFamilyKey: "wkgo_private_power", kind: "found_lookup" }
  ]
};

function proposed() {
  return {
    schemaVersion: FDD_BINDING_PROPOSAL_SCHEMA_VERSION,
    outcome: "proposed",
    projectId: context.projectId,
    evidenceSnapshotHash: context.evidenceSnapshotHash,
    algorithmSignature: context.algorithmSignature,
    bindings: [
      { role: "chiller_status", pointFamilyKey: "run_status", evidenceRefIds: ["lookup_002", "family_002"] },
      { role: "chiller_power", pointFamilyKey: "tlkw", evidenceRefIds: ["lookup_003", "family_003"] },
      { role: "chiller_command", pointFamilyKey: "chiller_start_stop", evidenceRefIds: ["lookup_001"] }
    ]
  };
}

describe("zero-shot binding proposal contract", () => {
  it("accepts and canonicalizes one snapshot-backed family per required role", () => {
    const result = validateFddBindingProposal(proposed(), context);

    expect(result).toEqual({
      ok: true,
      proposal: {
        schemaVersion: FDD_BINDING_PROPOSAL_SCHEMA_VERSION,
        outcome: "proposed",
        projectId: context.projectId,
        evidenceSnapshotHash: context.evidenceSnapshotHash,
        algorithmSignature: context.algorithmSignature,
        bindings: [
          { role: "chiller_command", pointFamilyKey: "chiller_start_stop", evidenceRefIds: ["lookup_001"] },
          { role: "chiller_power", pointFamilyKey: "tlkw", evidenceRefIds: ["family_003", "lookup_003"] },
          { role: "chiller_status", pointFamilyKey: "run_status", evidenceRefIds: ["family_002", "lookup_002"] }
        ]
      }
    });
  });

  it("accepts only versioned abstain reasons", () => {
    const result = validateFddBindingProposal({
      schemaVersion: FDD_BINDING_PROPOSAL_SCHEMA_VERSION,
      outcome: "abstain",
      projectId: context.projectId,
      evidenceSnapshotHash: context.evidenceSnapshotHash,
      algorithmSignature: context.algorithmSignature,
      reason: "ambiguous_families"
    }, context);

    expect(result).toEqual({
      ok: true,
      proposal: {
        schemaVersion: FDD_BINDING_PROPOSAL_SCHEMA_VERSION,
        outcome: "abstain",
        projectId: context.projectId,
        evidenceSnapshotHash: context.evidenceSnapshotHash,
        algorithmSignature: context.algorithmSignature,
        reason: "ambiguous_families"
      }
    });
  });

  it.each([
    ["confidence", (value: ReturnType<typeof proposed>) => Object.assign(value, { confidence: 0.99 }), "unexpected_field"],
    ["deploy state", (value: ReturnType<typeof proposed>) => Object.assign(value, { state: "ready" }), "unexpected_field"],
    ["binding confidence", (value: ReturnType<typeof proposed>) => Object.assign(value.bindings[0]!, { confidence: 0.99 }), "unexpected_field"],
    ["entity binding", (value: ReturnType<typeof proposed>) => Object.assign(value.bindings[0]!, { entityKey: "WCC_1", pointId: "secret" }), "unexpected_field"],
    ["snapshot forgery", (value: ReturnType<typeof proposed>) => { value.evidenceSnapshotHash = "other-snapshot"; }, "snapshot_hash_mismatch"],
    ["algorithm forgery", (value: ReturnType<typeof proposed>) => { value.algorithmSignature = "other-algorithm"; }, "algorithm_signature_mismatch"],
    ["project forgery", (value: ReturnType<typeof proposed>) => { value.projectId = "project_wkgo"; }, "project_id_mismatch"],
    ["unknown role", (value: ReturnType<typeof proposed>) => { value.bindings[0]!.role = "invented_role"; }, "invalid_role"],
    ["missing role", (value: ReturnType<typeof proposed>) => { value.bindings.pop(); }, "missing_role"],
    ["duplicate role", (value: ReturnType<typeof proposed>) => { value.bindings[0]!.role = "chiller_power"; }, "duplicate_role"],
    ["unknown family", (value: ReturnType<typeof proposed>) => { value.bindings[0]!.pointFamilyKey = "invented_family"; }, "invalid_family"],
    ["cross-project family", (value: ReturnType<typeof proposed>) => { value.bindings[0]!.pointFamilyKey = "wkgo_private_power"; value.bindings[0]!.evidenceRefIds = ["family_999"]; }, "cross_project_family"],
    ["forged evidence", (value: ReturnType<typeof proposed>) => { value.bindings[0]!.evidenceRefIds = ["lookup_003"]; }, "invalid_evidence_ref"],
    ["duplicate evidence", (value: ReturnType<typeof proposed>) => { value.bindings[0]!.evidenceRefIds = ["lookup_002", "lookup_002"]; }, "duplicate_evidence_ref"],
    ["family-only evidence", (value: ReturnType<typeof proposed>) => { value.bindings[0]!.evidenceRefIds = ["family_002"]; }, "found_lookup_evidence_required"]
  ])("rejects malicious or invalid %s output", (_label, mutate, code) => {
    const value = proposed();
    mutate(value);

    expect(validateFddBindingProposal(value, context)).toEqual(expect.objectContaining({ ok: false, code }));
  });

  it("rejects invalid abstain extensions and reasons", () => {
    expect(validateFddBindingProposal({
      schemaVersion: FDD_BINDING_PROPOSAL_SCHEMA_VERSION,
      outcome: "abstain",
      projectId: context.projectId,
      evidenceSnapshotHash: context.evidenceSnapshotHash,
      algorithmSignature: context.algorithmSignature,
      reason: "model_says_no",
      confidence: 1
    }, context)).toEqual(expect.objectContaining({ ok: false, code: "unexpected_field" }));

    expect(validateFddBindingProposal({
      schemaVersion: FDD_BINDING_PROPOSAL_SCHEMA_VERSION,
      outcome: "abstain",
      projectId: context.projectId,
      evidenceSnapshotHash: context.evidenceSnapshotHash,
      algorithmSignature: context.algorithmSignature,
      reason: "model_says_no"
    }, context)).toEqual(expect.objectContaining({ ok: false, code: "invalid_abstain_reason" }));
  });

  it("parses strict JSON only and enforces the output bound", () => {
    expect(parseFddBindingProposalJson(JSON.stringify(proposed()), context).ok).toBe(true);
    expect(parseFddBindingProposalJson(`\`\`\`json\n${JSON.stringify(proposed())}\n\`\`\``, context))
      .toEqual(expect.objectContaining({ ok: false, code: "invalid_json" }));
    expect(parseFddBindingProposalJson("x".repeat(16_385), context))
      .toEqual(expect.objectContaining({ ok: false, code: "response_too_large" }));
  });

  it("returns a plain JSON-serializable contract", () => {
    const result = validateFddBindingProposal(proposed(), context);
    expect(result.ok).toBe(true);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
