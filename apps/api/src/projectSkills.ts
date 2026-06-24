import type { SeedStore } from "./seed.js";

/** Injected into every project's agent context. */
export const RUNTIME_SKILL_IDS = [
  "skill_runtime_health",
  "environment-setup",
  "skill_tool_data_bridge",
  "skill_chart_quality",
  "skill_dashboard_generation"
] as const;

export const BUILTIN_SKILL_IDS = [
  "skill_building_triage",
  "skill_project_readiness",
  ...RUNTIME_SKILL_IDS,
  "skill_feedback_workflow",
  "skill_element_bms_data"
] as const;

export const DEFAULT_PROJECT_SKILL_IDS = ["skill_project_readiness", "skill_feedback_workflow", ...RUNTIME_SKILL_IDS];

export function seedSkillsByProject(): Record<string, string[]> {
  const runtime = [...RUNTIME_SKILL_IDS];
  return {
    project_alpha: ["skill_building_triage", "skill_project_readiness", ...runtime],
    project_beta: ["skill_building_triage", "skill_project_readiness", ...runtime],
    project_gamma: ["skill_project_readiness", ...runtime],
    project_mortar: ["skill_building_triage", "skill_project_readiness", ...runtime],
    project_element: ["skill_element_bms_data", "skill_feedback_workflow", "skill_building_triage", ...runtime],
    project_demo: ["skill_project_readiness", ...runtime]
  };
}

export function ensureStoreSkillsByProject(store: SeedStore): void {
  if (!store.skillsByProject || Object.keys(store.skillsByProject).length === 0) {
    store.skillsByProject = seedSkillsByProject();
  }
  for (const project of store.projects) {
    if (!store.skillsByProject[project.id]?.length) {
      store.skillsByProject[project.id] = [...DEFAULT_PROJECT_SKILL_IDS];
    }
  }
}

export interface ProjectSkillBindings {
  getSkillIds(projectId: string): string[];
  initProject(projectId: string): void;
  addSkill(projectId: string, skillId: string): void;
  removeSkill(projectId: string, skillId: string): void;
}

export function createProjectSkillBindings(
  store: SeedStore,
  onChange?: () => void
): ProjectSkillBindings {
  ensureStoreSkillsByProject(store);

  return {
    getSkillIds(projectId: string): string[] {
      const ids = store.skillsByProject?.[projectId];
      const base = ids?.length ? [...ids] : [...DEFAULT_PROJECT_SKILL_IDS];
      const merged = new Set([...base, ...RUNTIME_SKILL_IDS]);
      return [...merged];
    },
    initProject(projectId: string): void {
      if (!store.skillsByProject) {
        store.skillsByProject = {};
      }
      store.skillsByProject[projectId] = [...DEFAULT_PROJECT_SKILL_IDS];
      onChange?.();
    },
    addSkill(projectId: string, skillId: string): void {
      if (!store.skillsByProject) {
        store.skillsByProject = {};
      }
      const current = store.skillsByProject[projectId] ?? [...DEFAULT_PROJECT_SKILL_IDS];
      if (!current.includes(skillId)) {
        store.skillsByProject[projectId] = [...current, skillId];
        onChange?.();
      }
    },
    removeSkill(projectId: string, skillId: string): void {
      const current = store.skillsByProject?.[projectId];
      if (!current) {
        return;
      }
      const next = current.filter((id) => id !== skillId);
      store.skillsByProject[projectId] = next.length ? next : [...DEFAULT_PROJECT_SKILL_IDS];
      onChange?.();
    }
  };
}

export function mergeSkillIdsForRegistry(projectIds: string[], bindings: ProjectSkillBindings): string[] {
  const seen = new Set<string>();
  for (const projectId of projectIds) {
    for (const id of bindings.getSkillIds(projectId)) {
      seen.add(id);
    }
  }
  return [...seen].sort();
}
