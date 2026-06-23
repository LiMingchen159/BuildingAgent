import { describe, expect, it } from "vitest";
import { createSeedStore } from "./seed.js";
import {
  ensureTokenMeta,
  getTokenTtlMs,
  issueTokenForUser,
  resolveUserIdForToken,
  tokenExpiresAtIso
} from "./authTokens.js";

describe("authTokens", () => {
  it("reuses the same seed token for a user", () => {
    const store = createSeedStore();
    const first = issueTokenForUser(store, "user_ada");
    const second = issueTokenForUser(store, "user_ada");
    expect(first).toBe("seed-token-ada");
    expect(second).toBe(first);
  });

  it("treats seed tokens without metadata as non-expiring", () => {
    const store = createSeedStore();
    expect(resolveUserIdForToken(store, "seed-token-ada")).toBe("user_ada");
    expect(tokenExpiresAtIso(store, "seed-token-ada")).toBeNull();
  });

  it("rejects expired API tokens", () => {
    const store = createSeedStore();
    store.tokens["ba_expired"] = "user_ada";
    store.tokenMeta = {
      ba_expired: { issuedAt: 0, expiresAt: 1 }
    };
    expect(resolveUserIdForToken(store, "ba_expired")).toBeNull();
  });

  it("honors BUILDING_AGENT_TOKEN_TTL_DAYS=0 as non-expiring API tokens", () => {
    expect(getTokenTtlMs({ BUILDING_AGENT_TOKEN_TTL_DAYS: "0" })).toBeNull();
    const store = createSeedStore();
    ensureTokenMeta(store, "ba_live", null);
    store.tokens["ba_live"] = "user_ada";
    expect(resolveUserIdForToken(store, "ba_live")).toBe("user_ada");
  });
});
