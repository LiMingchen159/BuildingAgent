import { describe, expect, it } from "vitest";
import { platformBoundsNotice } from "./agent/systemPrompt.js";
import { hasConfigurePermission, platformBoundsPayload } from "./platformBounds.js";
import { createSeedStore } from "./seed.js";

describe("platformBounds", () => {
  it("detects project:configure permission", () => {
    const store = createSeedStore();
    expect(hasConfigurePermission(store, "user_ada", "project_element")).toBe(false);
    expect(hasConfigurePermission(store, "user_buildinggpt", "project_element")).toBe(true);
  });

  it("returns bounds payload with layer mutability", () => {
    const payload = platformBoundsPayload(false);
    expect(payload.layers.platform.mutable).toBe(false);
    expect(payload.layers.operator.mutable).toBe(false);
    expect(payload.layers.playbook.mutable).toBe(false);
    expect(payload.currentUser.canConfigure).toBe(false);

    const operator = platformBoundsPayload(true);
    expect(operator.layers.operator.mutable).toBe(true);
    expect(operator.layers.playbook.mutable).toBe(true);
    expect(operator.currentUser.canConfigure).toBe(true);
  });

  it("includes platform bounds notice in kernel", () => {
    expect(platformBoundsNotice()).toContain("PLATFORM BOUNDS");
    expect(platformBoundsNotice()).toContain("feedback_commit_playbook");
  });
});
