import { describe, expect, it } from "vitest";
import { evaluateLegacyV4Deployability, type FddPointCandidate } from "@building-agent/fdd-deployment-planner";
import { evaluateFddDeployability, seedFddAlgorithms, type FddCheckAgentWorkflow } from "./fddLibrary.js";

describe("FDD deployment planner adapter", () => {
  it("preserves the legacy v4 decision wire shape and keeps agent workflow API-owned", () => {
    const algorithm = seedFddAlgorithms().find((entry) => entry.algorithmKey === "chiller_low_cop_detection")!;
    const pointCandidates = algorithm.requiredPoints
      .filter((point) => point.required)
      .map((point): FddPointCandidate => ({
        slot: point.slot,
        pointName: `WCC-1-${point.slot}`,
        entityKey: "WCC-1",
        objectRef: `WCC-1.${point.slot}`,
        unitCompatibility: "match",
        dimensionReason: `Verified ${point.quantityKind}.`,
        confidence: 0.875,
        reason: "Exact fixture match.",
        historyDays: 30
      }));
    const input = {
      algorithm,
      projectId: "project_element",
      source: "manual" as const,
      projectDataSignature: "project-signature",
      pointCandidates,
      exampleEntityKey: "WCC-1",
      checkedAt: "2026-08-20T00:00:00.000Z"
    };

    const packageDecision = evaluateLegacyV4Deployability(input);
    const apiDecision = evaluateFddDeployability(input);
    expect(apiDecision).toEqual(packageDecision);
    expect("agentWorkflow" in packageDecision).toBe(false);

    const agentWorkflow: FddCheckAgentWorkflow = {
      agentId: "buildinggpt",
      skillId: "skill_fdd_deployability_check",
      skillName: "BuildingGPT FDD deployability check",
      mode: "deterministic_core",
      kbDocuments: ["brick_model.ttl"],
      steps: ["Read project evidence."]
    };
    apiDecision.agentWorkflow = agentWorkflow;
    expect(apiDecision.agentWorkflow).toEqual(agentWorkflow);
  });
});
