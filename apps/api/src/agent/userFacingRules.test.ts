import { describe, expect, it } from "vitest";
import { sanitizeUserFacingAssistantText, userFacingRulesBlock } from "./userFacingRules.js";

describe("userFacingRules", () => {
  it("injects plain-language guidance without domain examples", () => {
    const block = userFacingRulesBlock();
    expect(block).toContain("Never expose internal IDs");
    expect(block).not.toMatch(/chiller|TLKW|Run_Status/i);
  });

  it("strips internal jargon from assistant text", () => {
    const raw =
      "Thanks.\n\nI've proposed a site-specific playbook update:\n\n- do x\n\nProposal ID: `fb_prop_000001`\n\nDone.";
    const cleaned = sanitizeUserFacingAssistantText(raw);
    expect(cleaned).not.toContain("fb_prop_000001");
    expect(cleaned).not.toMatch(/playbook/i);
    expect(cleaned).not.toMatch(/proposal id/i);
    expect(cleaned).toContain("Thanks");
    expect(cleaned).toContain("Done.");
  });
});
