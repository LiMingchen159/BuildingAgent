import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface ScheduledJob {
  jobId: string;
  projectId: string;
  conversationId: string;
  userId: string;
  message: string;
  triggerAt: number;
  createdAt: number;
  status: "pending" | "fired" | "cancelled";
}

export type JobFiredCallback = (job: ScheduledJob) => void;

export class SchedulerService {
  private jobs: Map<string, ScheduledJob> = new Map();
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private jobSequence = 0;
  private onFired: JobFiredCallback | null = null;
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  /** Set the callback invoked when a job fires. */
  setOnFired(callback: JobFiredCallback): void {
    this.onFired = callback;
  }

  /** Load persisted jobs and re-schedule timers. Call on server start. */
  start(): void {
    try {
      const filePath = this.jobsPath();
      if (existsSync(filePath)) {
        const raw = readFileSync(filePath, "utf8");
        const stored: ScheduledJob[] = JSON.parse(raw);
        let maxSeq = 0;
        for (const job of stored) {
          if (job.status !== "pending") continue;
          const now = Date.now();
          if (job.triggerAt <= now) {
            // Already past — fire immediately
            this.fireJob(job);
          } else {
            this.jobs.set(job.jobId, job);
            this.scheduleTimer(job);
          }
          const match = /^job_(\d+)$/.exec(job.jobId);
          if (match) maxSeq = Math.max(maxSeq, Number(match[1]!));
        }
        this.jobSequence = maxSeq;
      }
    } catch {
      // best effort — jobs lost on corruption
    }
  }

  /** Schedule a new reminder job. Returns the job_id. */
  schedule(params: {
    projectId: string;
    conversationId: string;
    userId: string;
    message: string;
    triggerAt: number;
  }): ScheduledJob {
    this.jobSequence += 1;
    const jobId = `job_${String(this.jobSequence).padStart(6, "0")}`;
    const job: ScheduledJob = {
      jobId,
      projectId: params.projectId,
      conversationId: params.conversationId,
      userId: params.userId,
      message: params.message,
      triggerAt: params.triggerAt,
      createdAt: Date.now(),
      status: "pending"
    };

    this.jobs.set(jobId, job);
    this.scheduleTimer(job);
    this.persist();
    return job;
  }

  /** Cancel a pending job by ID. Returns true if cancelled. */
  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "pending") return false;

    job.status = "cancelled";
    this.clearTimer(jobId);
    this.persist();
    return true;
  }

  /** Cancel the most recent pending job for a project. Returns the cancelled job or null. */
  cancelMostRecent(projectId: string): ScheduledJob | null {
    let mostRecent: ScheduledJob | null = null;
    for (const job of this.jobs.values()) {
      if (job.projectId !== projectId || job.status !== "pending") continue;
      if (!mostRecent || job.createdAt > mostRecent.createdAt) {
        mostRecent = job;
      }
    }
    if (mostRecent) {
      this.cancel(mostRecent.jobId);
    }
    return mostRecent;
  }

  /** Cancel all pending jobs for a project. */
  cancelAll(projectId: string): number {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job.projectId === projectId && job.status === "pending") {
        if (this.cancel(job.jobId)) count += 1;
      }
    }
    return count;
  }

  /** List all jobs for a project (pending + recently fired/cancelled). */
  list(projectId: string): ScheduledJob[] {
    const result: ScheduledJob[] = [];
    for (const job of this.jobs.values()) {
      if (job.projectId === projectId) result.push(job);
    }
    result.sort((a, b) => b.createdAt - a.createdAt);
    return result;
  }

  /** Stop all timers. Call on server shutdown. */
  stop(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  // ---- internal ----

  private scheduleTimer(job: ScheduledJob): void {
    const delay = Math.max(0, job.triggerAt - Date.now());
    const timer = setTimeout(() => {
      this.timers.delete(job.jobId);
      this.fireJob(job);
    }, delay);
    this.timers.set(job.jobId, timer);
  }

  private clearTimer(jobId: string): void {
    const timer = this.timers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(jobId);
    }
  }

  private fireJob(job: ScheduledJob): void {
    if (job.status !== "pending") return;
    job.status = "fired";
    this.jobs.set(job.jobId, job);
    this.persist();
    this.onFired?.(job);
  }

  private persist(): void {
    try {
      const dir = path.join(this.dataDir);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      const all = Array.from(this.jobs.values());
      writeFileSync(this.jobsPath(), JSON.stringify(all, null, 2), "utf8");
    } catch {
      // best effort
    }
  }

  private jobsPath(): string {
    return path.join(this.dataDir, "scheduled_jobs.json");
  }
}

/** Parse natural-language Chinese time expressions from a chat message.
 *  Returns trigger timestamp in ms, or null if none detected. */
export function parseTimeExpression(message: string): { triggerAt: number; reminderText: string } | null {
  const trimmed = message.trim();

  // Pattern: "N秒后提醒我XXX" / "N秒后提醒XXX"
  let match = /(\d+)\s*秒后提醒(?:我)?(.+)/i.exec(trimmed);
  if (match) {
    const seconds = parseInt(match[1]!, 10);
    const text = match[2]!.trim();
    return { triggerAt: Date.now() + seconds * 1000, reminderText: text };
  }

  // Pattern: "N分钟后提醒我XXX" / "N分钟后提醒XXX"
  match = /(\d+)\s*分钟后提醒(?:我)?(.+)/i.exec(trimmed);
  if (match) {
    const minutes = parseInt(match[1]!, 10);
    const text = match[2]!.trim();
    return { triggerAt: Date.now() + minutes * 60 * 1000, reminderText: text };
  }

  // Pattern: "N小时后提醒我XXX"
  match = /(\d+)\s*小时后提醒(?:我)?(.+)/i.exec(trimmed);
  if (match) {
    const hours = parseInt(match[1]!, 10);
    const text = match[2]!.trim();
    return { triggerAt: Date.now() + hours * 3600 * 1000, reminderText: text };
  }

  // Pattern: "提醒我XXX" (default to short delay)
  match = /^提醒(?:我)?(.+)/i.exec(trimmed);
  if (match) {
    const text = match[1]!.trim();
    return { triggerAt: Date.now() + 10 * 1000, reminderText: text };
  }

  return null;
}

/** Parse cancel commands from chat messages. */
export function parseCancelCommand(message: string): { action: "cancel_recent" | "cancel_all" } | null {
  const trimmed = message.trim();
  if (/^取消(刚才的?|这个)提醒/.test(trimmed)) return { action: "cancel_recent" };
  if (/^取消(所有|全部)提醒/.test(trimmed)) return { action: "cancel_all" };
  return null;
}

/** Parse list command from chat messages. */
export function parseListCommand(message: string): boolean {
  return /^(列出?提醒|查看提醒|有哪些提醒|我的提醒)/.test(message.trim());
}
