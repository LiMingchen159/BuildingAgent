import type { SeedStore } from "./seed.js";

export const BOUNDS_VIOLATION_CODE = "bounds_violation";

export interface PlatformBoundsLayer {
  mutable: boolean;
  description: string;
}

export interface PlatformBoundsResponse {
  layers: {
    platform: PlatformBoundsLayer;
    operator: PlatformBoundsLayer;
    playbook: PlatformBoundsLayer;
    userMemory: PlatformBoundsLayer;
    projectMemory: PlatformBoundsLayer;
    /** @deprecated Use userMemory */
    personalMemory: PlatformBoundsLayer;
  };
  currentUser: {
    canConfigure: boolean;
  };
}

export function boundsViolationResult(message: string): Record<string, unknown> {
  return {
    error: BOUNDS_VIOLATION_CODE,
    message
  };
}

export function hasConfigurePermission(store: SeedStore, userId: string, projectId: string): boolean {
  const membership = store.memberships.find(
    (entry) => entry.userId === userId && entry.projectId === projectId
  );
  return membership?.permissions.includes("project:configure") ?? false;
}

export function platformBoundsPayload(canConfigure: boolean): PlatformBoundsResponse {
  return {
    layers: {
      platform: {
        mutable: false,
        description: "System prompt and builtin skills (deploy only)"
      },
      operator: {
        mutable: canConfigure,
        description: "Requires project:configure permission"
      },
      playbook: {
        mutable: canConfigure,
        description: "Site judgment rules via feedback_save_site_rule (requires project:configure and explicit user consent)"
      },
      userMemory: {
        mutable: true,
        description: "remember: / memory(target=user) for your preferences"
      },
      projectMemory: {
        mutable: canConfigure,
        description: "remember project note: / memory(target=project) for declarative site facts"
      },
      personalMemory: {
        mutable: true,
        description: "remember: / memory(target=user) for your preferences (alias of userMemory)"
      }
    },
    currentUser: { canConfigure }
  };
}
