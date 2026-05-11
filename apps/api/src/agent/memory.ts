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
    return entry;
  }

  list(projectId: string, userId: string): MemoryEntry[] {
    return [...(this.entriesByScope.get(this.scope(projectId, userId)) ?? [])];
  }

  search(projectId: string, userId: string, query: string): MemoryEntry[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return [];
    }
    return this.list(projectId, userId).filter((entry) => entry.content.toLowerCase().includes(normalized));
  }

  syncTurn(projectId: string, userId: string, userContent: string, assistantContent: string): void {
    const normalized = userContent.trim().toLowerCase();
    if (normalized.startsWith("remember ")) {
      this.remember(projectId, userId, userContent.trim().slice("remember ".length));
      return;
    }
    if (normalized.startsWith("remember:")) {
      this.remember(projectId, userId, userContent.trim().slice("remember:".length));
      return;
    }
    if (assistantContent.toLowerCase().includes("mock assistant response")) {
      return;
    }
  }

  private scope(projectId: string, userId: string): string {
    return `${projectId}:${userId}`;
  }
}
