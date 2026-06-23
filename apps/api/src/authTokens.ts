import { randomBytes } from "node:crypto";
import type { SeedStore } from "./seed.js";

export interface TokenMeta {
  issuedAt: number;
  /** Unix ms; null means the token does not expire. */
  expiresAt: number | null;
}

export function getTokenTtlMs(env: NodeJS.ProcessEnv = process.env): number | null {
  const raw = env.BUILDING_AGENT_TOKEN_TTL_DAYS?.trim();
  if (raw === undefined || raw === "") {
    return 90 * 24 * 60 * 60 * 1000;
  }
  const days = Number(raw);
  if (!Number.isFinite(days) || days < 0) {
    return 90 * 24 * 60 * 60 * 1000;
  }
  if (days === 0) {
    return null;
  }
  return days * 24 * 60 * 60 * 1000;
}

export function findTokenForUser(store: SeedStore, userId: string): string | undefined {
  return Object.entries(store.tokens).find(([, id]) => id === userId)?.[0];
}

export function issueTokenForUser(store: SeedStore, userId: string): string {
  const existing = findTokenForUser(store, userId);
  if (existing) {
    return existing;
  }
  const token = `ba_${randomBytes(24).toString("hex")}`;
  store.tokens[token] = userId;
  return token;
}

export function ensureTokenMeta(store: SeedStore, token: string, ttlMs: number | null): boolean {
  if (!store.tokenMeta) {
    store.tokenMeta = {};
  }
  if (store.tokenMeta[token]) {
    return false;
  }
  const issuedAt = Date.now();
  store.tokenMeta[token] = {
    issuedAt,
    expiresAt: ttlMs === null ? null : issuedAt + ttlMs
  };
  return true;
}

export function tokenExpiresAtIso(store: SeedStore, token: string): string | null {
  const meta = store.tokenMeta?.[token];
  if (!meta || meta.expiresAt === null) {
    return null;
  }
  return new Date(meta.expiresAt).toISOString();
}

export function resolveUserIdForToken(store: SeedStore, token: string): string | null {
  const userId = store.tokens[token];
  if (!userId) {
    return null;
  }
  const meta = store.tokenMeta?.[token];
  if (meta?.expiresAt !== null && meta?.expiresAt !== undefined && Date.now() > meta.expiresAt) {
    return null;
  }
  return userId;
}
