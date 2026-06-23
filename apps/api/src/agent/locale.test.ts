import { describe, expect, it } from "vitest";
import { detectUserMessageLanguage, perTurnLanguageBlock, replyLanguageDirective } from "./locale.js";

describe("locale", () => {
  it("instructs mirroring the user language", () => {
    const directive = replyLanguageDirective();
    expect(directive).toContain("latest message");
    expect(directive).toContain("Cantonese");
    expect(directive).toContain("English");
    expect(directive).toContain("not KB language");
  });

  it("detects English-only messages", () => {
    expect(detectUserMessageLanguage("What is COP for chillers?")).toBe("en");
  });

  it("detects Cantonese messages", () => {
    expect(detectUserMessageLanguage("呢部冷機而家係咪開緊？")).toBe("yue");
  });

  it("forces English reply block for English questions", () => {
    const block = perTurnLanguageBlock("What is COP for chillers?");
    expect(block).toContain("English");
    expect(block).toContain("Do not use Cantonese");
  });

  it("forces Cantonese reply block for Cantonese questions", () => {
    const block = perTurnLanguageBlock("呢部冷機而家係咪開緊？");
    expect(block).toContain("粵語");
  });
});
