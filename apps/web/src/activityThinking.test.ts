import { describe, expect, it } from "vitest";
import { parseActivityLabel } from "./ui/activityThinking";

describe("parseActivityLabel", () => {
  it("extracts think blocks and keeps visible narration", () => {
    const label = "<think>Plan the TTL scan.</think>\n\nI will verify the device list.";
    const parsed = parseActivityLabel(label);
    expect(parsed.thinkingBlocks).toEqual(["Plan the TTL scan."]);
    expect(parsed.visibleText).toBe("I will verify the device list.");
  });

  it("extracts redacted_thinking blocks when providers emit that wrapper", () => {
    const label = "<think>Only reasoning here.</think>";
    const parsed = parseActivityLabel(label);
    expect(parsed.thinkingBlocks).toEqual(["Only reasoning here."]);
    expect(parsed.visibleText).toBe("");
  });
});
