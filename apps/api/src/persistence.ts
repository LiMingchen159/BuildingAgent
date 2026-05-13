import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SeedStore } from "./seed.js";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(sourceDir, "../..");
const DATA_DIR = path.join(projectRoot, "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const STORE_BACKUP_FILE = path.join(DATA_DIR, "store.json.bak");
const STORE_TMP_FILE = path.join(DATA_DIR, "store.json.tmp");

export function loadStoreSync(): SeedStore | null {
  try {
    if (!existsSync(STORE_FILE)) return null;
    const raw = readFileSync(STORE_FILE, "utf8");
    return JSON.parse(raw) as SeedStore;
  } catch {
    return null;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

export function scheduleSave(store: SeedStore): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveStoreSync(store);
  }, 500);
}

export function saveStoreSync(store: SeedStore): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    if (existsSync(STORE_FILE)) {
      copyFileSync(STORE_FILE, STORE_BACKUP_FILE);
    }
    writeFileSync(STORE_TMP_FILE, JSON.stringify(store, null, 2), "utf8");
    renameSync(STORE_TMP_FILE, STORE_FILE);
  } catch {
    // best effort; log but don't crash
    console.warn("Failed to persist store to", STORE_FILE);
  }
}
