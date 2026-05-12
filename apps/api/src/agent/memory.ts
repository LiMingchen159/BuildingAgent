import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface MemoryEntry {
  id: string;
  projectId: string;
  userId: string;
  content: string;
  createdAt: string;
}

export class AgentMemoryStore {
  private readonly entriesByScope = new Map<string, MemoryEntry[]>();
  private sequence = 0;
  private dataDir: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? path.join(process.cwd(), "data");
  }

  /** Load persisted memories from disk. Call on server start. */
  start(): void {
    try {
      const filePath = this.memoryPath();
      if (existsSync(filePath)) {
        const raw = readFileSync(filePath, "utf8");
        const stored: MemoryEntry[] = JSON.parse(raw);
        let maxSeq = 0;
        for (const entry of stored) {
          const scope = this.scope(entry.projectId, entry.userId);
          const existing = this.entriesByScope.get(scope) ?? [];
          existing.push(entry);
          this.entriesByScope.set(scope, existing);
          const match = /^mem_(\d+)$/.exec(entry.id);
          if (match) maxSeq = Math.max(maxSeq, Number(match[1]!));
        }
        this.sequence = maxSeq;
      }
    } catch {
      // best effort — memory lost on corruption
    }
  }

  remember(projectId: string, userId: string, content: string): MemoryEntry {
    const trimmed = content.replace(/\s+/gu, " ").trim();
    this.sequence += 1;
    const entry: MemoryEntry = {
      id: `mem_${String(this.sequence).padStart(6, "0")}`,
      projectId,
      userId,
      content: trimmed,
      createdAt: new Date().toISOString()
    };
    const scope = this.scope(projectId, userId);
    this.entriesByScope.set(scope, [...(this.entriesByScope.get(scope) ?? []), entry].slice(-50));
    this.persist();
    return entry;
  }

  list(projectId: string, userId: string): MemoryEntry[] {
    return [...(this.entriesByScope.get(this.scope(projectId, userId)) ?? [])];
  }

  clear(projectId: string, userId: string): number {
    const scope = this.scope(projectId, userId);
    const existing = this.entriesByScope.get(scope)?.length ?? 0;
    this.entriesByScope.delete(scope);
    this.persist();
    return existing;
  }

  search(projectId: string, userId: string, query: string): MemoryEntry[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return [];
    }
    return this.list(projectId, userId).filter((entry) => entry.content.toLowerCase().includes(normalized));
  }

  syncTurn(projectId: string, userId: string, userContent: string, assistantContent: string): void {
    if (assistantContent.toLowerCase().includes("mock assistant response")) {
      return;
    }
  }

  private scope(projectId: string, userId: string): string {
    return `${projectId}:${userId}`;
  }

  private persist(): void {
    try {
      if (!existsSync(this.dataDir)) {
        mkdirSync(this.dataDir, { recursive: true });
      }
      const all: MemoryEntry[] = [];
      for (const entries of this.entriesByScope.values()) {
        all.push(...entries);
      }
      writeFileSync(this.memoryPath(), JSON.stringify(all, null, 2), "utf8");
    } catch {
      // best effort
    }
  }

  private memoryPath(): string {
    return path.join(this.dataDir, "agent_memory.json");
  }
}
