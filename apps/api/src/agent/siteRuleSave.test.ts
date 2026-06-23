import { describe, expect, it } from "vitest";
import { createGenericToolRegistry } from "./genericTools.js";
import { AgentMemoryStore } from "./memory.js";
import { createProjectGroundingBindings } from "../projectGrounding.js";
import { createProjectFeedbackBindings } from "../projectFeedback.js";
import { createSeedStore } from "../seed.js";
import { BOUNDS_VIOLATION_CODE } from "../platformBounds.js";

describe("feedback_save_site_rule", () => {
  it("requires project:configure even when user consents", async () => {
    const store = createSeedStore();
    const grounding = createProjectGroundingBindings(store);
    const feedback = createProjectFeedbackBindings(store, grounding);
    const registry = createGenericToolRegistry(
      new AgentMemoryStore("/tmp/ba-site-rule-save"),
      undefined,
      undefined,
      undefined,
      undefined,
      grounding,
      feedback
    );
    const tool = registry.list().find((candidate) => candidate.name === "feedback_save_site_rule");
    expect(tool).toBeDefined();

    const result = await tool!.run(
      { rule_summary: "Cross-check status with load evidence for running-state questions." },
      {
        projectId: "project_element",
        userId: "user_buildinggpt",
        requestId: "req_site_rule",
        conversationId: "conv_site_rule_save",
        canConfigure: false,
        messages: [
          {
            id: "msg_user_yes",
            projectId: "project_element",
            userId: "user_buildinggpt",
            role: "user",
            content: "yes"
          }
        ]
      }
    );

    expect(result).toMatchObject({
      error: BOUNDS_VIOLATION_CODE,
      message: "feedback_save_site_rule requires project:configure."
    });
  });

  it("saves when user consents and has project:configure", async () => {
    const store = createSeedStore();
    const grounding = createProjectGroundingBindings(store);
    const feedback = createProjectFeedbackBindings(store, grounding);
    const registry = createGenericToolRegistry(
      new AgentMemoryStore("/tmp/ba-site-rule-save"),
      undefined,
      undefined,
      undefined,
      undefined,
      grounding,
      feedback
    );
    const tool = registry.list().find((candidate) => candidate.name === "feedback_save_site_rule");
    expect(tool).toBeDefined();

    const result = await tool!.run(
      {
        rule_key: "wrong_running_state",
        name: "Chiller running: motor kW cross-check",
        action:
          "Cross-check Run_Status with motor kW (TLKW); treat meaningful positive TLKW as stronger running evidence when they disagree.",
        scope: "chiller plant / running-state queries",
        trigger: "When user asks which chillers are running or about chiller operating status",
        trigger_topics: [
          "chiller running",
          "how many chillers",
          "operating status",
          "running situation",
          "冷机运行",
          "运行状态"
        ]
      },
      {
        projectId: "project_element",
        userId: "user_buildinggpt",
        requestId: "req_site_rule",
        conversationId: "conv_site_rule_save",
        canConfigure: true,
        messages: [
          {
            id: "msg_user_yes",
            projectId: "project_element",
            userId: "user_buildinggpt",
            role: "user",
            content: "yes"
          }
        ]
      }
    );

    expect(result).toMatchObject({ saved: true });
    const saved = grounding.list("project_element").find((rule) => rule.source === "user");
    expect(saved?.content.includes("TLKW")).toBe(true);
    expect((saved?.triggerTopics?.length ?? 0) >= 4).toBe(true);
    expect(saved?.action).toContain("TLKW");
    expect(saved?.name).toBe("Chiller running: motor kW cross-check");
    expect(saved?.ruleKey).toBe("wrong_running_state");
  });
});
