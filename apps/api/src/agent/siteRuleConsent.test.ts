import { describe, expect, it } from "vitest";
import { hasSiteRuleSaveConsent, siteRuleSaveConsentHintBlock } from "./siteRuleConsent.js";

describe("siteRuleConsent", () => {
  it("accepts explicit save consent phrases", () => {
    expect(hasSiteRuleSaveConsent("Yes, remember this")).toBe(true);
    expect(hasSiteRuleSaveConsent("save site rule: yes")).toBe(true);
    expect(hasSiteRuleSaveConsent("是的，保存")).toBe(true);
    expect(hasSiteRuleSaveConsent("记下来")).toBe(true);
  });

  it("accepts bare yes after a remember offer", () => {
    expect(hasSiteRuleSaveConsent("yes")).toBe(true);
    expect(hasSiteRuleSaveConsent("Yes.")).toBe(true);
  });

  it("rejects ambiguous bare affirmatives without save intent", () => {
    expect(hasSiteRuleSaveConsent("是的")).toBe(false);
    expect(hasSiteRuleSaveConsent("好")).toBe(false);
  });

  it("returns hint block only when consent is present", () => {
    expect(siteRuleSaveConsentHintBlock("是的")).toBe("");
    expect(siteRuleSaveConsentHintBlock("是的，保存")).toContain("feedback_save_site_rule");
  });
});
