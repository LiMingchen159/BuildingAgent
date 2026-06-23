import { describe, expect, it } from "vitest";
import { validateAssistantAgainstRules } from "./projectRuleValidator.js";
import type { ProjectGroundingRule } from "./projectGrounding.js";

const tlkwRule: ProjectGroundingRule = {
  id: "ground_000001",
  projectId: "project_element",
  content: "Cross-check TLKW",
  source: "user",
  createdAt: "2026-01-01T00:00:00.000Z",
  action: "Cross-check Run_Status with TLKW",
  errorType: "wrong_running_state"
};

describe("projectRuleValidator", () => {
  it("flags answers that only cite Run_Status when TLKW rule was retrieved", () => {
    const warnings = validateAssistantAgainstRules(
      "Four chillers show Run_Status=1, so four are running.",
      [tlkwRule]
    );
    expect(warnings.some((warning) => warning.code === "tlkw_rule_not_applied")).toBe(true);
  });

  it("passes when TLKW evidence is included", () => {
    const warnings = validateAssistantAgainstRules(
      "Run_Status and TLKW agree — WCC_1 shows 120 kW, so it is running.",
      [tlkwRule]
    );
    expect(warnings.some((warning) => warning.code === "tlkw_rule_not_applied")).toBe(false);
  });
});
