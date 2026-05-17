/** Maps UI project ids to on-disk message/KB/repo storage (shared mortar data). */
const PROJECT_STORAGE_ALIASES: Record<string, string> = {
  // Mortar conversations and files stay on project_mortar; no alias needed unless added later.
};

export function resolveProjectStorageId(projectId: string): string {
  return PROJECT_STORAGE_ALIASES[projectId] ?? projectId;
}

export function resolveStoreProjectKey<T>(store: Record<string, T>, projectId: string): T | undefined {
  return store[resolveProjectStorageId(projectId)];
}

export function assignStoreProjectKey<T>(store: Record<string, T>, projectId: string, value: T): void {
  store[resolveProjectStorageId(projectId)] = value;
}
