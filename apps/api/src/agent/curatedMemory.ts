import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sanitizeEntryForSnapshot, scanMemoryEntry } from "./memoryThreatScan.js";

export const ENTRY_DELIMITER = "\n§\n";

export type MemoryTarget = "user" | "project";
export type MemoryAction = "add" | "replace" | "remove" | "read" | "clear";

export interface MemoryActionResult {
  success: boolean;
  target: MemoryTarget;
  action: MemoryAction;
  message?: string;
  error?: string;
  entries?: string[];
  usage?: string;
}

export interface MemoryPromptBlocks {
  userBlock: string;
  projectBlock: string;
  userEntryCount: number;
  projectEntryCount: number;
  sameTurnUserOverflow?: string[];
}

export interface MemoryBankInfo {
  target: MemoryTarget;
  entries: string[];
  usage: string;
  charLimit: number;
}

interface SnapshotKey {
  projectId: string;
  userId: string;
  conversationId: string;
}

const DEFAULT_USER_CHAR_LIMIT = 1375;
const DEFAULT_PROJECT_CHAR_LIMIT = 2200;

function snapshotKey(projectId: string, userId: string, conversationId: string): string {
  return `${projectId}:${userId}:${conversationId}`;
}

function dedupeEntries(entries: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of entries) {
    const normalized = entry.trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function parseFile(content: string): string[] {
  if (!content.trim()) {
    return [];
  }
  return dedupeEntries(content.split(ENTRY_DELIMITER));
}

function serializeEntries(entries: string[]): string {
  if (entries.length === 0) {
    return "";
  }
  return `${entries.join(ENTRY_DELIMITER)}\n`;
}

function renderBlock(title: string, entries: string[]): string {
  if (entries.length === 0) {
    return "";
  }
  return `${title}:\n${entries.map((entry) => `- ${entry}`).join("\n")}`;
}

export class CuratedMemoryStore {
  private readonly dataDir: string;
  private readonly userCharLimit: number;
  private readonly projectCharLimit: number;

  private userEntries = new Map<string, string[]>();
  private projectEntries = new Map<string, string[]>();
  private frozenSnapshots = new Map<string, MemoryPromptBlocks>();
  private sameTurnUserOverflow = new Map<string, string[]>();

  constructor(dataDir?: string, options?: { userCharLimit?: number; projectCharLimit?: number }) {
    this.dataDir = dataDir ?? path.join(process.cwd(), "data");
    this.userCharLimit = options?.userCharLimit ?? DEFAULT_USER_CHAR_LIMIT;
    this.projectCharLimit = options?.projectCharLimit ?? DEFAULT_PROJECT_CHAR_LIMIT;
  }

  start(): void {
    this.migrateLegacyJson();
  }

  private memoriesRoot(projectId: string): string {
    return path.join(this.dataDir, projectId, "memories");
  }

  private userFilePath(projectId: string, userId: string): string {
    return path.join(this.memoriesRoot(projectId), "users", userId, "USER.md");
  }

  private globalUserFilePath(userId: string): string {
    return path.join(this.dataDir, "global", "memories", "users", userId, "USER.md");
  }

  private readGlobalUserEntries(userId: string): string[] {
    const filePath = this.globalUserFilePath(userId);
    if (!existsSync(filePath)) {
      return [];
    }
    try {
      return parseFile(readFileSync(filePath, "utf8"));
    } catch {
      return [];
    }
  }

  private writeGlobalUserEntries(userId: string, entries: string[]): void {
    const filePath = this.globalUserFilePath(userId);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, serializeEntries(entries), "utf8");
  }

  private mergeUserEntries(globalEntries: string[], projectEntries: string[]): string[] {
    const merged = new Map<string, string>();
    for (const entry of globalEntries) {
      merged.set(entry.toLowerCase(), entry);
    }
    for (const entry of projectEntries) {
      merged.set(entry.toLowerCase(), entry);
    }
    return [...merged.values()];
  }

  private projectFilePath(projectId: string): string {
    return path.join(this.memoriesRoot(projectId), "PROJECT.md");
  }

  private legacyJsonPath(): string {
    return path.join(this.dataDir, "agent_memory.json");
  }

  private charLimit(target: MemoryTarget): number {
    return target === "user" ? this.userCharLimit : this.projectCharLimit;
  }

  private readEntriesFromDisk(projectId: string, userId: string, target: MemoryTarget): string[] {
    const filePath = target === "user" ? this.userFilePath(projectId, userId) : this.projectFilePath(projectId);
    if (!existsSync(filePath)) {
      return [];
    }
    try {
      return parseFile(readFileSync(filePath, "utf8"));
    } catch {
      return [];
    }
  }

  private writeEntriesToDisk(projectId: string, userId: string, target: MemoryTarget, entries: string[]): void {
    const filePath = target === "user" ? this.userFilePath(projectId, userId) : this.projectFilePath(projectId);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, serializeEntries(entries), "utf8");
  }

  private liveUserKey(projectId: string, userId: string): string {
    return `${projectId}:${userId}`;
  }

  private liveProjectKey(projectId: string): string {
    return projectId;
  }

  loadLive(projectId: string, userId: string): void {
    this.userEntries.set(
      this.liveUserKey(projectId, userId),
      this.readEntriesFromDisk(projectId, userId, "user")
    );
    this.projectEntries.set(this.liveProjectKey(projectId), this.readEntriesFromDisk(projectId, userId, "project"));
  }

  private getLiveEntries(projectId: string, userId: string, target: MemoryTarget): string[] {
    this.loadLive(projectId, userId);
    if (target === "user") {
      return [...(this.userEntries.get(this.liveUserKey(projectId, userId)) ?? [])];
    }
    return [...(this.projectEntries.get(this.liveProjectKey(projectId)) ?? [])];
  }

  private setLiveEntries(projectId: string, userId: string, target: MemoryTarget, entries: string[]): void {
    const normalized = dedupeEntries(entries);
    if (target === "user") {
      this.userEntries.set(this.liveUserKey(projectId, userId), normalized);
    } else {
      this.projectEntries.set(this.liveProjectKey(projectId), normalized);
    }
    this.writeEntriesToDisk(projectId, userId, target, normalized);
  }

  ensureSnapshot(projectId: string, userId: string, conversationId: string): MemoryPromptBlocks {
    const key = snapshotKey(projectId, userId, conversationId);
    const existing = this.frozenSnapshots.get(key);
    if (existing) {
      return existing;
    }
    this.sameTurnUserOverflow.delete(key);
    this.loadLive(projectId, userId);
    const userLive = this.mergeUserEntries(this.readGlobalUserEntries(userId), this.getLiveEntries(projectId, userId, "user"));
    const projectLive = this.getLiveEntries(projectId, userId, "project");
    const overflow = this.sameTurnUserOverflow.get(snapshotKey(projectId, userId, conversationId)) ?? [];
    const userForSnapshot = overflow.length > 0 ? dedupeEntries([...userLive, ...overflow]) : userLive;
    const userSanitized = userForSnapshot.map((entry) => sanitizeEntryForSnapshot(entry, "USER"));
    const projectSanitized = projectLive.map((entry) => sanitizeEntryForSnapshot(entry, "PROJECT"));
    const blocks: MemoryPromptBlocks = {
      userBlock: renderBlock("User memory (your preferences)", userSanitized),
      projectBlock: renderBlock("Project memory (declarative site facts)", projectSanitized),
      userEntryCount: userSanitized.length,
      projectEntryCount: projectSanitized.length
    };
    this.frozenSnapshots.set(key, blocks);
    return blocks;
  }

  invalidateSnapshot(projectId: string, userId: string, conversationId: string): void {
    this.frozenSnapshots.delete(snapshotKey(projectId, userId, conversationId));
  }

  getPromptBlocks(projectId: string, userId: string, conversationId: string): MemoryPromptBlocks {
    return this.ensureSnapshot(projectId, userId, conversationId);
  }

  readBank(projectId: string, userId: string, target: MemoryTarget): MemoryBankInfo {
    const entries =
      target === "project"
        ? this.getLiveEntries(projectId, userId, "project")
        : this.mergeUserEntries(this.readGlobalUserEntries(userId), this.getLiveEntries(projectId, userId, "user"));
    const limit = this.charLimit(target);
    return {
      target,
      entries,
      usage: this.usageString(entries, limit),
      charLimit: limit
    };
  }

  readProjectUserBank(projectId: string, userId: string): MemoryBankInfo {
    const entries = this.getLiveEntries(projectId, userId, "user");
    const limit = this.charLimit("user");
    return { target: "user", entries, usage: this.usageString(entries, limit), charLimit: limit };
  }

  readGlobalUserBank(userId: string): MemoryBankInfo {
    const entries = this.readGlobalUserEntries(userId);
    const limit = this.charLimit("user");
    return { target: "user", entries, usage: this.usageString(entries, limit), charLimit: limit };
  }

  setEntries(
    projectId: string,
    userId: string,
    target: MemoryTarget,
    entries: string[],
    conversationId = ""
  ): MemoryActionResult {
    const normalized = dedupeEntries(entries.map((entry) => entry.trim()).filter(Boolean));
    for (const entry of normalized) {
      if (scanMemoryEntry(entry)) {
        return { success: false, target, action: "replace", error: "Content blocked by memory safety scan." };
      }
    }
    const limit = this.charLimit(target);
    if (serializeEntries(normalized).length > limit) {
      return { success: false, target, action: "replace", error: `Entries exceed char limit (${limit}).` };
    }
    this.setLiveEntries(projectId, userId, target, normalized);
    this.invalidateSnapshotsForProject(projectId, userId);
    if (conversationId) {
      this.invalidateSnapshot(projectId, userId, conversationId);
    }
    return {
      success: true,
      target,
      action: "replace",
      message: "Memory bank updated.",
      entries: normalized,
      usage: this.usageString(normalized, limit)
    };
  }

  setGlobalUserEntries(userId: string, entries: string[]): MemoryActionResult {
    const normalized = dedupeEntries(entries.map((entry) => entry.trim()).filter(Boolean));
    for (const entry of normalized) {
      if (scanMemoryEntry(entry)) {
        return { success: false, target: "user", action: "replace", error: "Content blocked by memory safety scan." };
      }
    }
    const limit = this.charLimit("user");
    if (serializeEntries(normalized).length > limit) {
      return { success: false, target: "user", action: "replace", error: `Entries exceed char limit (${limit}).` };
    }
    this.writeGlobalUserEntries(userId, normalized);
    this.invalidateAllSnapshotsForUser(userId);
    return {
      success: true,
      target: "user",
      action: "replace",
      message: "Global user memory updated.",
      entries: normalized,
      usage: this.usageString(normalized, limit)
    };
  }

  trackSameTurnOverflow(projectId: string, userId: string, conversationId: string, content: string): void {
    const key = snapshotKey(projectId, userId, conversationId);
    const existing = this.frozenSnapshots.get(key);
    if (!existing) {
      return;
    }
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }
    const overflow = this.sameTurnUserOverflow.get(key) ?? [];
    if (!overflow.some((entry) => entry.toLowerCase() === trimmed.toLowerCase())) {
      this.sameTurnUserOverflow.set(key, [...overflow, trimmed]);
    }
  }

  getSameTurnOverflow(projectId: string, userId: string, conversationId: string): string[] {
    return [...(this.sameTurnUserOverflow.get(snapshotKey(projectId, userId, conversationId)) ?? [])];
  }

  invalidateSnapshotsForProject(projectId: string, userId?: string): void {
    for (const key of [...this.frozenSnapshots.keys()]) {
      if (!key.startsWith(`${projectId}:`)) {
        continue;
      }
      if (userId && !key.startsWith(`${projectId}:${userId}:`)) {
        continue;
      }
      this.frozenSnapshots.delete(key);
      this.sameTurnUserOverflow.delete(key);
    }
  }

  invalidateAllSnapshotsForUser(userId: string): void {
    for (const key of [...this.frozenSnapshots.keys()]) {
      if (key.includes(`:${userId}:`)) {
        this.frozenSnapshots.delete(key);
        this.sameTurnUserOverflow.delete(key);
      }
    }
  }

  private usageString(entries: string[], limit: number): string {
    const count = entries.length === 0 ? 0 : serializeEntries(entries).length - 1;
    return `${count}/${limit} chars`;
  }

  runAction(
    projectId: string,
    userId: string,
    conversationId: string,
    action: MemoryAction,
    target: MemoryTarget,
    options?: { content?: string; match?: string; canConfigure?: boolean }
  ): MemoryActionResult {
    if (target === "project" && action !== "read" && !options?.canConfigure) {
      return {
        success: false,
        target,
        action,
        error: "Project memory bank writes require project:configure. Use feedback_commit_playbook for executable site rules."
      };
    }

    const entries = this.getLiveEntries(projectId, userId, target);
    const limit = this.charLimit(target);

    if (action === "read") {
      return {
        success: true,
        target,
        action,
        entries,
        usage: this.usageString(entries, limit)
      };
    }

    if (action === "clear") {
      this.setLiveEntries(projectId, userId, target, []);
      this.invalidateSnapshot(projectId, userId, conversationId);
      return { success: true, target, action, message: "Memory bank cleared.", entries: [] };
    }

    if (action === "add") {
      const content = options?.content?.trim() ?? "";
      if (!content) {
        return { success: false, target, action, error: "content is required" };
      }
      if (scanMemoryEntry(content)) {
        return { success: false, target, action, error: "Content blocked by memory safety scan." };
      }
      if (entries.some((entry) => entry.toLowerCase() === content.toLowerCase())) {
        return {
          success: true,
          target,
          action,
          message: "Entry already exists.",
          entries,
          usage: this.usageString(entries, limit)
        };
      }
      const next = [...entries, content];
      const total = serializeEntries(next).length;
      if (total > limit) {
        return {
          success: false,
          target,
          action,
          error: `Memory at ${this.usageString(entries, limit)}. Adding would exceed limit.`,
          entries,
          usage: this.usageString(entries, limit)
        };
      }
      this.setLiveEntries(projectId, userId, target, next);
      if (target === "user" && conversationId) {
        this.trackSameTurnOverflow(projectId, userId, conversationId, content);
      }
      return {
        success: true,
        target,
        action,
        message: "Entry added.",
        entries: next,
        usage: this.usageString(next, limit)
      };
    }

    if (action === "replace") {
      const match = options?.match?.trim() ?? "";
      const content = options?.content?.trim() ?? "";
      if (!match || !content) {
        return { success: false, target, action, error: "match and content are required" };
      }
      if (scanMemoryEntry(content)) {
        return { success: false, target, action, error: "Content blocked by memory safety scan." };
      }
      const index = entries.findIndex((entry) => entry.includes(match));
      if (index < 0) {
        return { success: false, target, action, error: `No entry contains match: ${match}` };
      }
      const next = [...entries];
      next[index] = content;
      if (serializeEntries(next).length > limit) {
        return { success: false, target, action, error: "Replacement would exceed char limit." };
      }
      this.setLiveEntries(projectId, userId, target, next);
      return { success: true, target, action, message: "Entry replaced.", entries: next };
    }

    if (action === "remove") {
      const match = options?.match?.trim() ?? "";
      if (!match) {
        return { success: false, target, action, error: "match is required" };
      }
      const next = entries.filter((entry) => !entry.includes(match));
      if (next.length === entries.length) {
        return { success: false, target, action, error: `No entry contains match: ${match}` };
      }
      this.setLiveEntries(projectId, userId, target, next);
      return { success: true, target, action, message: "Entry removed.", entries: next };
    }

    return { success: false, target, action, error: `Unsupported action: ${action}` };
  }

  /** Legacy API: add to user bank */
  remember(projectId: string, userId: string, content: string, conversationId = ""): { id: string; content: string } {
    const result = this.runAction(projectId, userId, conversationId, "add", "user", { content });
    return { id: `mem_user_${Date.now()}`, content: content.trim() };
  }

  list(projectId: string, userId: string): Array<{ id: string; content: string }> {
    return this.getLiveEntries(projectId, userId, "user").map((content, index) => ({
      id: `mem_${String(index + 1).padStart(3, "0")}`,
      content
    }));
  }

  search(projectId: string, userId: string, query: string): Array<{ id: string; content: string; target: MemoryTarget }> {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return [];
    }
    const results: Array<{ id: string; content: string; target: MemoryTarget }> = [];
    for (const [index, content] of this.getLiveEntries(projectId, userId, "user").entries()) {
      if (content.toLowerCase().includes(normalized)) {
        results.push({ id: `user_${index}`, content, target: "user" });
      }
    }
    for (const [index, content] of this.getLiveEntries(projectId, userId, "project").entries()) {
      if (content.toLowerCase().includes(normalized)) {
        results.push({ id: `project_${index}`, content, target: "project" });
      }
    }
    return results;
  }

  clearUserBank(projectId: string, userId: string, conversationId: string): number {
    const before = this.getLiveEntries(projectId, userId, "user").length;
    this.runAction(projectId, userId, conversationId, "clear", "user");
    return before;
  }

  /** Chat reset: do not clear memory banks */
  clear(_projectId: string, _userId: string): number {
    return 0;
  }

  syncTurn(_projectId: string, _userId: string, _userContent: string, assistantContent: string): void {
    if (assistantContent.toLowerCase().includes("mock assistant response")) {
      return;
    }
  }

  private migrateLegacyJson(): void {
    const legacyPath = this.legacyJsonPath();
    if (!existsSync(legacyPath)) {
      return;
    }
    try {
      const raw = readFileSync(legacyPath, "utf8");
      const stored = JSON.parse(raw) as Array<{
        projectId: string;
        userId: string;
        content: string;
      }>;
      for (const entry of stored) {
        if (!entry.projectId || !entry.userId || !entry.content?.trim()) {
          continue;
        }
        const existing = this.readEntriesFromDisk(entry.projectId, entry.userId, "user");
        if (existing.some((item) => item.toLowerCase() === entry.content.trim().toLowerCase())) {
          continue;
        }
        this.setLiveEntries(entry.projectId, entry.userId, "user", [...existing, entry.content.trim()]);
      }
    } catch {
      // best effort
    }
  }
}

/** @deprecated Use CuratedMemoryStore — kept as alias for gradual migration */
export type AgentMemoryStore = CuratedMemoryStore;
export { CuratedMemoryStore as AgentMemoryStoreImpl };
