import { describe, expect, it } from "vitest";
import { createEmbeddingProvider } from "./embeddingProvider.js";
import { GroundingRuleIndex } from "./groundingRuleIndex.js";
import { buildRetrievalCard } from "./projectRules.js";
import type { ProjectGroundingRule } from "./projectGrounding.js";
import { createSeedStore } from "./seed.js";
import { tmpdir } from "node:os";
import path from "node:path";

function makeIndex(): GroundingRuleIndex {
  const dataDir = path.join(tmpdir(), `ba-grounding-index-${Date.now()}-${Math.random()}`);
  return new GroundingRuleIndex(dataDir, createEmbeddingProvider({}));
}

describe("groundingRuleIndex", () => {
  it("builds retrieval cards with topics and action", () => {
    const card = buildRetrievalCard({
      id: "ground_000001",
      projectId: "project_element",
      content: "ignored",
      source: "user",
      createdAt: "2026-01-01T00:00:00.000Z",
      scope: "chiller plant / running-state queries",
      action: "Cross-check Run_Status with TLKW",
      triggerTopics: ["chiller running", "冷机运行"]
    });
    expect(card).toContain("[site-rule]");
    expect(card).toContain("chiller running");
    expect(card).toContain("TLKW");
  });

  it("upserts and finds rules via FTS", async () => {
    const index = makeIndex();
    const rule: ProjectGroundingRule = {
      id: "ground_test",
      projectId: "project_element",
      content: "Do TLKW cross-check",
      source: "user",
      createdAt: "2026-01-01T00:00:00.000Z",
      scope: "chiller plant / running-state queries",
      trigger: "running questions",
      action: "Cross-check Run_Status with TLKW",
      triggerTopics: ["chiller running", "chillers running", "how many chillers", "冷机运行"],
      status: "approved"
    };
    await index.upsertRule(rule);
    expect(index.hasRule("ground_test")).toBe(true);
    const hits = index.searchFts("project_element", "how many chillers running", 5);
    expect(hits.some((hit) => hit.ruleId === "ground_test")).toBe(true);
  });

  it("rebuilds from store with legacy rule backfill", async () => {
    const store = createSeedStore();
    store.projectGroundingByProject = {
      project_element: [
        {
          id: "ground_000001",
          projectId: "project_element",
          content:
            "For chiller running-status questions, cross-check Run_Status with TLKW and do not rely on status codes alone.",
          source: "user",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      ]
    };
    const index = makeIndex();
    index.rebuildFromStore(store);
    expect(index.hasRule("ground_000001")).toBe(true);
    const hits = index.searchFts("project_element", "chiller plant 运行状态", 5);
    expect(hits.some((hit) => hit.ruleId === "ground_000001")).toBe(true);
  });
});
