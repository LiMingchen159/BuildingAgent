"use client";

import type { Project, User } from "./api";

const TOKEN_KEY = "buildingagent.s01.token";
const USER_KEY = "buildingagent.s01.user";
const PROJECT_KEY = "buildingagent.s01.selectedProject";

export type SessionSnapshot = {
  token: string | null;
  user: User | null;
  selectedProject: Project | null;
};

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const probe = "buildingagent.storage.probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string): T | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    store.removeItem(key);
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    clearSession();
  }
}

export function getSession(): SessionSnapshot {
  const store = storage();
  if (!store) return { token: null, user: null, selectedProject: null };
  return {
    token: store.getItem(TOKEN_KEY),
    user: readJson<User>(USER_KEY),
    selectedProject: readJson<Project>(PROJECT_KEY),
  };
}

export function saveLogin(token: string, user: User): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(TOKEN_KEY, token);
    writeJson(USER_KEY, user);
  } catch {
    clearSession();
  }
}

export function saveSelectedProject(project: Project): void {
  writeJson(PROJECT_KEY, project);
}

export function clearSelectedProject(): void {
  try {
    storage()?.removeItem(PROJECT_KEY);
  } catch {
    // Treat storage failures as unauthenticated elsewhere.
  }
}

export function clearSession(): void {
  try {
    const store = storage();
    store?.removeItem(TOKEN_KEY);
    store?.removeItem(USER_KEY);
    store?.removeItem(PROJECT_KEY);
  } catch {
    // No-op: failure to clear browser storage should not expose secrets in UI.
  }
}
