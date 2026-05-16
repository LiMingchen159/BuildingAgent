import { describe, expect, it } from "vitest";
import { parseActivityLabel, stripThinkingFromAnswer } from "./ui/activityThinking";

describe("parseActivityLabel", () => {
  it("extracts think blocks and keeps visible narration separate", () => {
    const label = "<think>Plan the TTL scan.</think>\n\nI will verify the device list.";
    const parsed = parseActivityLabel(label);
    expect(parsed.thinkingBlocks).toEqual(["Plan the TTL scan."]);
    expect(parsed.visibleText).toBe("I will verify the device list.");
  });

  it("strips think wrappers from final assistant answers", () => {
    const content = "<think>Reasoning here.</think>\n\n## Summary\n\nTwo AHUs.";
    const stripped = stripThinkingFromAnswer(content);
    expect(stripped).toBe("## Summary\n\nTwo AHUs.");
    expect(stripped).not.toMatch(/think>/i);
  });
});
