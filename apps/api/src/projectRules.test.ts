import { describe, expect, it } from "vitest";
import {
  normalizeProjectRuleInput,
  legacyRuleToStructured,
  siteRuleTemplateGuidanceBlock
} from "./projectRules.js";

describe("projectRules", () => {
  it("normalizes legacy rule_summary into structured fields", () => {
    const fields = normalizeProjectRuleInput({
      ruleSummary:
        "Cross-check Run_Status with motor power (TLKW) for chiller running-status questions; do not rely on status codes alone."
    });
    expect(fields.action).toContain("TLKW");
    expect(fields.scope).toContain("chiller");
    expect(fields.triggerTopics.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps LLM-authored fields while resolving stable rule_key", () => {
    const fields = normalizeProjectRuleInput(
      {
        ruleKey: "wrong_running_state",
        name: "My custom running rule label",
        action: "Always cross-check TLKW with Run_Status for any chiller running question.",
        scope: "All chiller plant running-state and on/off count questions",
        trigger: "When the user asks how many chillers are running or which are on",
        triggerTopics: ["chiller running", "how many chillers", "operating status", "run status"]
      },
      {
        conversationId: "conv_test",
        projectId: "project_element",
        userQuestion: "How many chillers are running?",
        modelAnswer: "3 chillers",
        userCorrection: "Wrong, check TLKW",
        errorType: "wrong_running_state",
        capturedAt: "2026-01-01T00:00:00.000Z"
      }
    );
    expect(fields.ruleKey).toBe("wrong_running_state");
    expect(fields.name).toBe("My custom running rule label");
    expect(fields.action).toContain("TLKW");
    expect(fields.scope).toContain("chiller plant");
  });

  it("exposes template key guidance for the LLM prompt", () => {
    const block = siteRuleTemplateGuidanceBlock();
    expect(block).toContain("wrong_running_state");
    expect(block).toContain("rule_key");
    expect(block).toContain("YOU author");
  });

  it("backfills legacy running rule with trigger topics", () => {
    const structured = legacyRuleToStructured({
      id: "ground_000001",
      projectId: "project_element",
      content: "Cross-check Run_Status with TLKW for chiller running questions.",
      source: "user",
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    expect(structured.triggerTopics?.length).toBeGreaterThanOrEqual(4);
    expect(structured.action).toContain("TLKW");
  });
});
