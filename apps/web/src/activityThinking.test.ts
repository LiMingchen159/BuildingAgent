import { describe, expect, it } from "vitest";
import {
  parseActivityLabel,
  parseAssistantContent,
  sanitizeConversationTitle,
  stripThinkingFromAnswer
} from "./ui/activityThinking";

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

describe("parseAssistantContent", () => {
  it("exposes streaming think before the closing tag arrives", () => {
    const content = "<think>**Using tools effectively** to scan.";
    const parsed = parseAssistantContent(content);
    expect(parsed.thinkingBlocks).toEqual([]);
    expect(parsed.streamingThinking).toBe("**Using tools effectively** to scan.");
    expect(parsed.visibleText).toBe("");
  });

  it("keeps visible answer outside completed think blocks", () => {
    const content = "<think>Plan.</think>\n\n## Result\n\nDone.";
    const parsed = parseAssistantContent(content);
    expect(parsed.thinkingBlocks).toEqual(["Plan."]);
    expect(parsed.streamingThinking).toBeNull();
    expect(parsed.visibleText).toBe("## Result\n\nDone.");
  });
});

describe("sanitizeConversationTitle", () => {
  it("removes think markup and markdown from titles", () => {
    const title = sanitizeConversationTitle(
      "<think>Long reasoning</think> **BLDG40** device list"
    );
    expect(title).toBe("BLDG40 device list");
    expect(title).not.toMatch(/think/i);
  });
});
