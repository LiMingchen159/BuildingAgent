import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmbeddingProvider } from "./embeddingProvider.js";
import { GroundingRuleIndex } from "./groundingRuleIndex.js";
import {
  extractExactIdentifiers,
  resetGroundingRetrievalConfigForTests,
  retrieveGroundingRules
} from "./groundingRuleRetrieval.js";
import type { ProjectGroundingRule } from "./projectGrounding.js";
import { tmpdir } from "node:os";
import path from "node:path";

const runningRule: ProjectGroundingRule = {
  id: "ground_000001",
  projectId: "project_element",
  content: "Cross-check Run_Status with TLKW.",
  source: "user",
  createdAt: "2026-01-01T00:00:00.000Z",
  scope: "chiller plant / running-state queries",
  trigger: "When user asks which chillers are running",
  action: "Cross-check Run_Status with motor power (WCC_{1-8}_TLKW).",
  wrongPattern: "Do not rely on Run_Status alone.",
  triggerTopics: [
    "chiller running",
    "chillers running",
    "how many chillers",
    "which chillers",
    "chiller plant",
    "plant running",
    "operating status",
    "running situation",
    "run status",
    "physically running",
    "冷机运行",
    "哪几台冷机",
    "运行状态",
    "开机"
  ],
  systems: ["chiller plant", "HVAC"],
  equipment: ["WCC", "TLKW"],
  status: "approved"
};

const operatorRule: ProjectGroundingRule = {
  id: "ground_op_1",
  projectId: "project_element",
  content: "Always report timestamps in HKT.",
  source: "operator",
  createdAt: "2026-01-01T00:00:00.000Z"
};

function makeIndex(): GroundingRuleIndex {
  const dataDir = path.join(tmpdir(), `ba-grounding-index-${Date.now()}-${Math.random()}`);
  return new GroundingRuleIndex(dataDir, createEmbeddingProvider({}));
}

function clearRetrievalEnv(): void {
  delete process.env.RULE_RETRIEVAL_SKIP_DENSE;
  delete process.env.RULE_RETRIEVAL_MAX_RESULTS;
  delete process.env.RULE_RETRIEVAL_DEBUG;
  resetGroundingRetrievalConfigForTests();
}

afterEach(() => {
  clearRetrievalEnv();
  vi.restoreAllMocks();
});

describe("groundingRuleRetrieval", () => {
  it("retrieves running-state rule for paraphrased queries", async () => {
    const index = makeIndex();
    await index.upsertRule(runningRule);

    const english = await retrieveGroundingRules(index, "project_element", "how many chillers running", [
      runningRule,
      operatorRule
    ]);
    expect(english.retrieved.map((rule) => rule.id)).toContain("ground_000001");
    expect(english.alwaysOn.map((rule) => rule.id)).toContain("ground_op_1");

    const chinese = await retrieveGroundingRules(index, "project_element", "chiller plant 运行状态", [runningRule, operatorRule]);
    expect(chinese.retrieved.map((rule) => rule.id)).toContain("ground_000001");
  });

  it("does not retrieve running rule for unrelated equipment-list questions", async () => {
    const index = makeIndex();
    await index.upsertRule(runningRule);

    const result = await retrieveGroundingRules(index, "project_element", "BLDG40 设备列表", [runningRule, operatorRule]);
    expect(result.retrieved).toHaveLength(0);
    expect(result.alwaysOn.map((rule) => rule.id)).toContain("ground_op_1");
  });

  it("works in degraded keyword-only mode without embeddings", async () => {
    const index = makeIndex();
    await index.upsertRule(runningRule);

    const result = await retrieveGroundingRules(index, "project_element", "chiller plant operating status", [runningRule]);
    expect(result.retrieved.length).toBeGreaterThan(0);
  });

  it("retrieves running-state rule for natural-language plant situation queries", async () => {
    const index = makeIndex();
    await index.upsertRule(runningRule);

    const result = await retrieveGroundingRules(
      index,
      "project_element",
      "The running situation of this chiller plant.",
      [runningRule, operatorRule]
    );
    expect(result.retrieved.map((rule) => rule.id)).toContain("ground_000001");
  });

  it("defaults to hybrid mode with dense not skipped", async () => {
    const index = makeIndex();
    await index.upsertRule(runningRule);
    const denseSpy = vi.spyOn(index, "searchDense");

    const result = await retrieveGroundingRules(index, "project_element", "how many chillers running", [runningRule]);

    expect(result.diagnostics.mode).toBe("hybrid");
    expect(result.diagnostics.skippedDense).toBe(false);
    expect(result.diagnostics.ftsHitCount).toBeGreaterThan(0);
    expect(denseSpy).toHaveBeenCalledOnce();
  });

  it("includes score breakdown for retrieved rules", async () => {
    const index = makeIndex();
    await index.upsertRule(runningRule);

    const result = await retrieveGroundingRules(index, "project_element", "how many chillers running", [runningRule]);
    expect(result.retrieved.length).toBeGreaterThan(0);
    expect(result.diagnostics.selectedRuleIds).toContain("ground_000001");

    const breakdown = result.diagnostics.scoreBreakdown.find((entry) => entry.ruleId === "ground_000001");
    expect(breakdown).toBeDefined();
    expect(breakdown!.rrf).toBeGreaterThan(0);
    expect(breakdown!.exactBoost).toBeGreaterThanOrEqual(0);
    expect(breakdown!.metadataBoost).toBeGreaterThanOrEqual(0);
    expect(breakdown!.confidenceBoost).toBeGreaterThanOrEqual(0);
    expect(breakdown!.priorityBoost).toBeGreaterThanOrEqual(0);
    expect(breakdown!.total).toBeCloseTo(
      breakdown!.rrf + breakdown!.exactBoost + breakdown!.metadataBoost + breakdown!.confidenceBoost + breakdown!.priorityBoost,
      6
    );
  });

  it("skips dense only when RULE_RETRIEVAL_SKIP_DENSE=true with exact id and strong fts", async () => {
    process.env.RULE_RETRIEVAL_SKIP_DENSE = "true";
    resetGroundingRetrievalConfigForTests();

    const index = makeIndex();
    await index.upsertRule(runningRule);
    vi.spyOn(index, "searchFts").mockReturnValue([
      {
        ruleId: "ground_000001",
        projectId: "project_element",
        score: -12,
        rank: 1,
        source: "fts"
      }
    ]);
    const denseSpy = vi.spyOn(index, "searchDense");

    const result = await retrieveGroundingRules(
      index,
      "project_element",
      "check WCC_1_TLKW for chiller running",
      [runningRule]
    );

    expect(result.diagnostics.mode).toBe("hybrid_skip_dense");
    expect(result.diagnostics.skippedDense).toBe(true);
    expect(result.diagnostics.skipReason).toBe("exact_id_and_strong_fts");
    expect(denseSpy).not.toHaveBeenCalled();
  });

  it("respects RULE_RETRIEVAL_MAX_RESULTS", async () => {
    process.env.RULE_RETRIEVAL_MAX_RESULTS = "3";
    resetGroundingRetrievalConfigForTests();

    const index = makeIndex();
    const extraRules: ProjectGroundingRule[] = Array.from({ length: 5 }, (_, offset) => ({
      id: `ground_extra_${offset}`,
      projectId: "project_element",
      content: `Rule about chiller running status variant ${offset}`,
      source: "user",
      createdAt: "2026-01-01T00:00:00.000Z",
      triggerTopics: ["chiller running", "operating status"],
      status: "approved"
    }));
    for (const rule of [runningRule, ...extraRules]) {
      await index.upsertRule(rule);
    }

    const result = await retrieveGroundingRules(
      index,
      "project_element",
      "how many chillers running operating status",
      [runningRule, ...extraRules]
    );

    expect(result.retrieved.length).toBeLessThanOrEqual(3);
    expect(result.diagnostics.selectedRuleIds.length).toBeLessThanOrEqual(3);
  });

  it("extracts exact identifiers from user message", () => {
    const ids = extractExactIdentifiers("Compare WCC_1_TLKW with Run_Status for ground_000001", ["HVAC"]);
    expect(ids.has("wcc_1_tlkw")).toBe(true);
    expect(ids.has("run_status")).toBe(true);
    expect(ids.has("ground_000001")).toBe(true);
    expect(ids.has("hvac")).toBe(true);
  });
});
