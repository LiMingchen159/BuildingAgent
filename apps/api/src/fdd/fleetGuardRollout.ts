import type { SeedStore } from "../seed.js";

export type FddFleetGuardAuthorizationMode = "off" | "canary";

export interface FddFleetGuardRollout {
  mode: FddFleetGuardAuthorizationMode;
  algorithmKeys: string[];
  revision: number;
  updatedAt: string;
  updatedBy: string;
}

export interface FddFleetGuardGlobalConfig {
  mode: FddFleetGuardAuthorizationMode;
}

export class FddFleetGuardRolloutError extends Error {
  constructor(
    readonly statusCode: 409 | 422,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "FddFleetGuardRolloutError";
  }
}

const DEFAULT_ROLLOUT: FddFleetGuardRollout = {
  mode: "off",
  algorithmKeys: [],
  revision: 0,
  updatedAt: "",
  updatedBy: ""
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function parseMode(value: unknown): FddFleetGuardAuthorizationMode {
  if (value !== "off" && value !== "canary") {
    throw new FddFleetGuardRolloutError(422, "fdd_fleetguard_rollout_invalid", "mode must be off or canary.");
  }
  return value;
}

function parseAlgorithmKeys(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 64 || value.some((entry) => typeof entry !== "string")) {
    throw new FddFleetGuardRolloutError(422, "fdd_fleetguard_rollout_invalid", "algorithmKeys must be an array of at most 64 strings.");
  }
  const values = value.map((entry) => entry.trim()).filter(Boolean);
  if (values.length !== value.length || new Set(values).size !== values.length || values.some((entry) => entry.length > 200)) {
    throw new FddFleetGuardRolloutError(422, "fdd_fleetguard_rollout_invalid", "algorithmKeys must contain unique non-empty identifiers.");
  }
  return values.sort();
}

export function fddFleetGuardGlobalConfigFromEnv(env: Record<string, string | undefined>): FddFleetGuardGlobalConfig {
  return {
    mode: env.BUILDING_AGENT_FLEETGUARD_AUTHORIZATION_MODE?.trim().toLowerCase() === "canary"
      ? "canary"
      : "off"
  };
}

export function ensureStoreFddFleetGuardRollouts(store: SeedStore): boolean {
  if (store.fddFleetGuardRolloutByProject) return false;
  store.fddFleetGuardRolloutByProject = {};
  return true;
}

export function currentFddFleetGuardRollout(store: SeedStore, projectId: string): FddFleetGuardRollout {
  return clone(store.fddFleetGuardRolloutByProject?.[projectId] ?? DEFAULT_ROLLOUT);
}

/** Selection depends only on the two explicit rollout gates. Missing evidence then blocks; it never falls back to v4. */
export function isFddFleetGuardCanarySelected(input: {
  global: FddFleetGuardGlobalConfig;
  rollout: FddFleetGuardRollout;
  algorithmKey: string;
}): boolean {
  return input.global.mode === "canary"
    && input.rollout.mode === "canary"
    && input.rollout.algorithmKeys.includes(input.algorithmKey);
}

export function createFddFleetGuardRolloutBindings(
  store: SeedStore,
  options: { onChange?: () => void; now?: () => string } = {}
) {
  ensureStoreFddFleetGuardRollouts(store);
  const now = options.now ?? (() => new Date().toISOString());
  return {
    get(projectId: string): FddFleetGuardRollout {
      return currentFddFleetGuardRollout(store, projectId);
    },
    update(projectId: string, actorId: string, rawInput: unknown): FddFleetGuardRollout {
      if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
        throw new FddFleetGuardRolloutError(422, "fdd_fleetguard_rollout_invalid", "The rollout request body must be an object.");
      }
      const input = rawInput as Record<string, unknown>;
      if (!Number.isSafeInteger(input.baseRevision) || (input.baseRevision as number) < 0) {
        throw new FddFleetGuardRolloutError(422, "fdd_fleetguard_rollout_invalid", "baseRevision must be a non-negative integer.");
      }
      const current = currentFddFleetGuardRollout(store, projectId);
      if (input.baseRevision !== current.revision) {
        throw new FddFleetGuardRolloutError(409, "fdd_fleetguard_rollout_stale", "The FleetGuard rollout changed; reload and retry.");
      }
      const mode = parseMode(input.mode);
      const algorithmKeys = parseAlgorithmKeys(input.algorithmKeys);
      const next: FddFleetGuardRollout = {
        mode,
        algorithmKeys,
        revision: current.revision + 1,
        updatedAt: now(),
        updatedBy: actorId
      };
      store.fddFleetGuardRolloutByProject![projectId] = next;
      options.onChange?.();
      return clone(next);
    }
  };
}
