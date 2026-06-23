import { describe, expect, it } from "vitest";
import { createSeedStore } from "./seed.js";
import {
  createProjectGroundingBindings,
  ensureStoreProjectGrounding,
  groundingActivityPayload,
  groundingPromptBlock,
  seedProjectGroundingByProject
} from "./projectGrounding.js";

describe("projectGrounding", () => {
  it("seeds empty project grounding", () => {
    const seeded = seedProjectGroundingByProject();
    expect(seeded).toEqual({});
  });

  it("adds and lists project rules without duplicates", () => {
    const store = createSeedStore();
    const bindings = createProjectGroundingBindings(store);
    const first = bindings.add("project_element", "Always cite TLKW for running state.", { source: "operator" });
    const second = bindings.add("project_element", "Always cite TLKW for running state.", { source: "operator" });
    expect(second.id).toBe(first.id);
    const rules = bindings.list("project_element");
    expect(rules.some((r) => r.content.includes("TLKW"))).toBe(true);
  });

  it("ensureStoreProjectGrounding initializes empty map", () => {
    const store = createSeedStore();
    delete store.projectGroundingByProject;
    ensureStoreProjectGrounding(store);
    expect(store.projectGroundingByProject).toEqual({});
  });

  it("formats grounding prompt block by source", () => {
    const block = groundingPromptBlock([
      {
        id: "g1",
        projectId: "project_element",
        content: "Operator rule",
        source: "operator",
        createdAt: "2026-01-01T00:00:00.000Z"
      },
      {
        id: "g2",
        projectId: "project_element",
        content: "[Playbook:Chiller] Use TLKW — run via feedback_run_playbook(pb_000001)",
        source: "playbook",
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ]);
    expect(block).toContain("Operator grounding rules");
    expect(block).toContain("Script playbooks");
    expect(block).toContain("Operator rule");
    expect(block).toContain("[Playbook:Chiller]");
  });

  it("upserts structured user rules by stable ruleKey", () => {
    const store = createSeedStore();
    const bindings = createProjectGroundingBindings(store);
    const first = bindings.addStructured(
      "project_element",
      {
        ruleKey: "wrong_running_state",
        name: "Chiller running: TLKW cross-check",
        scope: "chiller plant / running-state queries",
        trigger: "When user asks about chiller running state",
        action: "Cross-check Run_Status with TLKW",
        triggerTopics: ["chiller running", "how many chillers", "operating status", "run status"],
        errorType: "wrong_running_state"
      },
      { source: "user" }
    );
    const second = bindings.addStructured(
      "project_element",
      {
        ruleKey: "wrong_running_state",
        name: "Chiller running: TLKW cross-check",
        scope: "chiller plant / running-state queries",
        trigger: "When user asks which chillers are running",
        action: "Cross-check Run_Status with motor power (WCC_{1-8}_TLKW)",
        triggerTopics: ["chiller running", "how many chillers", "operating status", "run status"],
        errorType: "wrong_running_state"
      },
      { source: "user" }
    );
    expect(second.id).toBe(first.id);
    expect(bindings.list("project_element").filter((rule) => rule.source === "user")).toHaveLength(1);
  });

  it("builds a stream activity payload for retrieved site rules", () => {
    const payload = groundingActivityPayload(
      [
        {
          id: "g1",
          projectId: "project_element",
          content: "Cross-check Run_Status with TLKW for running-state questions.",
          name: "Chiller running: TLKW cross-check",
          scope: "chiller plant / running-state queries",
          action: "Cross-check Run_Status with TLKW",
          source: "user",
          createdAt: "2026-01-01T00:00:00.000Z"
        }
      ],
      "req_grounding_test"
    );
    expect(payload).toMatchObject({
      id: "grounding_req_grounding_test",
      label: "Retrieved site rule: Chiller running: TLKW cross-check",
      kind: "tool",
      tool: "project_grounding",
      status: "done"
    });
    expect(payload?.output).toContain("chiller plant");
  });

  it("formats user-approved site rules separately from operator rules", () => {
    const block = groundingPromptBlock([
      {
        id: "g1",
        projectId: "project_element",
        content: "Cross-check ambiguous status codes with load evidence.",
        source: "user",
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ]);
    expect(block).toContain("Applicable project rules");
    expect(block).not.toContain("Operator grounding rules");
  });
});
