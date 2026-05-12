import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface JobRecurrence {
  type: "interval" | "cron";
  intervalSeconds?: number;    // for interval type
  cronExpression?: string;     // 5-field cron: "minute hour dom month dow"
}

export interface ScheduledJob {
  jobId: string;
  projectId: string;
  conversationId: string;
  userId: string;
  message: string;
  triggerAt: number;
  createdAt: number;
  status: "pending" | "fired" | "cancelled" | "paused";
  recurrence?: JobRecurrence;
  nextRunAt?: number;           // Next scheduled run for recurring jobs
  runCount?: number;            // How many times this job has fired
}

export type JobFiredCallback = (job: ScheduledJob) => void;

/** Parse a 5-field cron expression. Returns null if invalid. */
function parseCronExpression(expr: string): { minute: number[]; hour: number[]; dom: number[]; month: number[]; dow: number[] } | null {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return null;

  function parseField(field: string, min: number, max: number): number[] | null {
    if (field === "*") {
      const result: number[] = [];
      for (let i = min; i <= max; i++) result.push(i);
      return result;
    }
    // Comma-separated values
    const values: number[] = [];
    const parts = field.split(",");
    for (const part of parts) {
      // Step syntax: */N or 1-5/2
      const stepMatch = /^(\*|(\d+)(?:-(\d+))?)\/(\d+)$/.exec(part);
      if (stepMatch) {
        const rangeStart = stepMatch[1] === "*" ? min : parseInt(stepMatch[2]!, 10);
        const rangeEnd = stepMatch[3] ? parseInt(stepMatch[3], 10) : max;
        const step = parseInt(stepMatch[4]!, 10);
        for (let i = rangeStart; i <= rangeEnd; i += step) values.push(i);
        continue;
      }
      // Range syntax: N-M
      const rangeMatch = /^(\d+)-(\d+)$/.exec(part);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1]!, 10);
        const end = parseInt(rangeMatch[2]!, 10);
        for (let i = start; i <= end; i++) {
          if (i >= min && i <= max) values.push(i);
        }
        continue;
      }
      // Single value
      const val = parseInt(part, 10);
      if (isNaN(val) || val < min || val > max) return null;
      values.push(val);
    }
    return [...new Set(values)].sort((a, b) => a - b);
  }

  const minute = parseField(fields[0]!, 0, 59);
  const hour = parseField(fields[1]!, 0, 23);
  const dom = parseField(fields[2]!, 1, 31);
  const month = parseField(fields[3]!, 1, 12);
  const dow = parseField(fields[4]!, 0, 7); // 0 and 7 both = Sunday

  if (!minute || !hour || !dom || !month || !dow) return null;
  return { minute, hour, dom, month, dow };
}

/** Calculate the next fire time from a cron expression, after `from` (ms). Returns ms or null. */
export function nextCronTime(expr: string, from: number): number | null {
  const parsed = parseCronExpression(expr);
  if (!parsed) return null;

  const fromDate = new Date(from + 60_000); // Start looking 1 minute ahead
  fromDate.setSeconds(0, 0);

  // Search up to 2 years ahead
  const maxDate = new Date(from);
  maxDate.setFullYear(maxDate.getFullYear() + 2);

  const cursor = new Date(fromDate);
  while (cursor <= maxDate) {
    const hour = cursor.getHours();
    const minute = cursor.getMinutes();
    const dom = cursor.getDate();
    const month = cursor.getMonth() + 1;
    const dow = cursor.getDay();

    if (
      parsed.minute.includes(minute) &&
      parsed.hour.includes(hour) &&
      parsed.dom.includes(dom) &&
      parsed.month.includes(month) &&
      (parsed.dow.includes(dow) || parsed.dow.includes(7))
    ) {
      return cursor.getTime();
    }

    // Advance by 1 minute
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  return null; // No match within 2 years
}

export class SchedulerService {
  private jobs: Map<string, ScheduledJob> = new Map();
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private jobSequence = 0;
  private onFired: JobFiredCallback | null = null;
  private dataDir: string;
  private tickerTimer: ReturnType<typeof setInterval> | null = null;
  private tickerIntervalMs: number;

  constructor(dataDir: string, tickerIntervalMs = 60_000) {
    this.dataDir = dataDir;
    this.tickerIntervalMs = tickerIntervalMs;
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
          if (job.status === "cancelled" || job.status === "fired") continue;

          this.jobs.set(job.jobId, job);

          if (job.status === "pending") {
            const now = Date.now();
            if (job.triggerAt <= now) {
              this.fireJob(job);
            } else {
              this.scheduleTimer(job);
            }
          }
          // Paused jobs stay paused until resumed

          const match = /^job_(\d+)$/.exec(job.jobId);
          if (match) maxSeq = Math.max(maxSeq, Number(match[1]!));
        }
        this.jobSequence = maxSeq;
      }
    } catch {
      // best effort — jobs lost on corruption
    }

    // Start background ticker for recurring jobs
    this.startTicker();
  }

  /** Schedule a new job (one-shot or recurring). Returns the job. */
  schedule(params: {
    projectId: string;
    conversationId: string;
    userId: string;
    message: string;
    triggerAt: number;
    recurrence?: JobRecurrence;
  }): ScheduledJob {
    this.jobSequence += 1;
    const jobId = `job_${String(this.jobSequence).padStart(6, "0")}`;

    let nextRunAt: number | undefined;
    if (params.recurrence) {
      if (params.recurrence.type === "interval" && params.recurrence.intervalSeconds) {
        nextRunAt = params.triggerAt + params.recurrence.intervalSeconds * 1000;
      } else if (params.recurrence.type === "cron" && params.recurrence.cronExpression) {
        nextRunAt = nextCronTime(params.recurrence.cronExpression, params.triggerAt) ?? undefined;
      }
    }

    const job: ScheduledJob = {
      jobId,
      projectId: params.projectId,
      conversationId: params.conversationId,
      userId: params.userId,
      message: params.message,
      triggerAt: params.triggerAt,
      createdAt: Date.now(),
      status: "pending",
      runCount: 0,
      ...(params.recurrence ? { recurrence: params.recurrence } : {}),
      ...(nextRunAt !== undefined ? { nextRunAt } : {})
    };

    this.jobs.set(jobId, job);
    this.scheduleTimer(job);
    this.persist();
    return job;
  }

  /** Cancel a pending job by ID. Returns true if cancelled. */
  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || (job.status !== "pending" && job.status !== "paused")) return false;

    job.status = "cancelled";
    this.clearTimer(jobId);
    this.persist();
    return true;
  }

  /** Pause a recurring job. */
  pause(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "pending") return false;
    if (!job.recurrence) return false; // Can only pause recurring jobs

    job.status = "paused";
    this.clearTimer(jobId);
    this.persist();
    return true;
  }

  /** Resume a paused recurring job. */
  resume(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "paused") return false;

    job.status = "pending";
    job.triggerAt = Date.now() + 5000; // Fire in 5s to re-sync
    this.scheduleTimer(job);
    this.persist();
    return true;
  }

  /** Cancel the most recent pending job for a project. */
  cancelMostRecent(projectId: string): ScheduledJob | null {
    let mostRecent: ScheduledJob | null = null;
    for (const job of this.jobs.values()) {
      if (job.projectId !== projectId || (job.status !== "pending" && job.status !== "paused")) continue;
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
      if (job.projectId === projectId && (job.status === "pending" || job.status === "paused")) {
        if (this.cancel(job.jobId)) count += 1;
      }
    }
    return count;
  }

  /** List all jobs for a project. */
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
    this.stopTicker();
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  // ---- internal ticker ----

  private startTicker(): void {
    if (this.tickerTimer) return;
    this.tickerTimer = setInterval(() => {
      this.tick();
    }, this.tickerIntervalMs);
  }

  private stopTicker(): void {
    if (this.tickerTimer) {
      clearInterval(this.tickerTimer);
      this.tickerTimer = null;
    }
  }

  /** Check for recurring jobs that are due and advance them. */
  private tick(): void {
    const now = Date.now();
    for (const job of this.jobs.values()) {
      if (job.status !== "pending") continue;
      if (!job.recurrence) continue;

      // Check if the current trigger has passed
      if (job.triggerAt > now) continue;

      // Fire the job (advance to next recurrence)
      this.advanceRecurringJob(job);
    }
  }

  /** Fire a recurring job and schedule its next run. */
  private advanceRecurringJob(job: ScheduledJob): void {
    if (!job.recurrence) return;

    // Fire the current iteration
    this.clearTimer(job.jobId);
    this.fireJob(job);

    // Calculate next run
    let nextAt: number | null = null;
    if (job.recurrence.type === "interval" && job.recurrence.intervalSeconds) {
      nextAt = Date.now() + job.recurrence.intervalSeconds * 1000;
    } else if (job.recurrence.type === "cron" && job.recurrence.cronExpression) {
      nextAt = nextCronTime(job.recurrence.cronExpression, Date.now());
    }

    if (nextAt) {
      // Create a new "pending" instance for the next run
      const base: Omit<ScheduledJob, "recurrence" | "nextRunAt"> & { recurrence?: JobRecurrence; nextRunAt?: number } = {
        ...job,
        jobId: `${job.jobId}_r${(job.runCount ?? 0) + 1}`,
        triggerAt: nextAt,
        status: "pending" as const,
        createdAt: Date.now(),
        runCount: (job.runCount ?? 0) + 1
      };
      // Compute nextRunAt for the new instance
      let nextNextRunAt: number | undefined;
      if (job.recurrence.type === "interval" && job.recurrence.intervalSeconds) {
        nextNextRunAt = nextAt + job.recurrence.intervalSeconds * 1000;
      } else if (job.recurrence.type === "cron" && job.recurrence.cronExpression) {
        nextNextRunAt = nextCronTime(job.recurrence.cronExpression, nextAt) ?? undefined;
      }

      const nextJob: ScheduledJob = {
        ...base,
        ...(job.recurrence ? { recurrence: job.recurrence } : {}),
        ...(nextNextRunAt !== undefined ? { nextRunAt: nextNextRunAt } : {})
      };

      this.jobs.set(nextJob.jobId, nextJob);
      this.scheduleTimer(nextJob);
    }

    this.persist();
  }

  // ---- internal timers ----

  private scheduleTimer(job: ScheduledJob): void {
    if (job.status !== "pending") return;
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

    // For recurring jobs, mark as fired (the advanceRecurringJob creates the next one)
    if (job.recurrence) {
      job.status = "fired";
    } else {
      job.status = "fired";
    }

    this.jobs.set(job.jobId, job);
    this.persist();
    this.onFired?.(job);
  }

  // ---- persistence ----

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

// ---- Natural language time expression parsing ----

/** Parse natural-language Chinese time expressions from a chat message. */
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

/** Parse recurring time expressions from chat messages. */
export function parseRecurringExpression(message: string): {
  triggerAt: number;
  reminderText: string;
  recurrence: JobRecurrence;
} | null {
  const trimmed = message.trim();

  // Pattern: "每N分钟提醒我XXX" / "每N分钟提醒XXX"
  let match = /^每\s*(\d+)\s*分钟提醒(?:我)?(.+)/i.exec(trimmed);
  if (match) {
    const minutes = parseInt(match[1]!, 10);
    const text = match[2]!.trim();
    return {
      triggerAt: Date.now() + minutes * 60 * 1000,
      reminderText: text,
      recurrence: { type: "interval", intervalSeconds: minutes * 60 }
    };
  }

  // Pattern: "每N小时提醒我XXX"
  match = /^每\s*(\d+)\s*小时提醒(?:我)?(.+)/i.exec(trimmed);
  if (match) {
    const hours = parseInt(match[1]!, 10);
    const text = match[2]!.trim();
    return {
      triggerAt: Date.now() + hours * 3600 * 1000,
      reminderText: text,
      recurrence: { type: "interval", intervalSeconds: hours * 3600 }
    };
  }

  // Pattern: "每N秒提醒我XXX"
  match = /^每\s*(\d+)\s*秒提醒(?:我)?(.+)/i.exec(trimmed);
  if (match) {
    const seconds = parseInt(match[1]!, 10);
    const text = match[2]!.trim();
    return {
      triggerAt: Date.now() + seconds * 1000,
      reminderText: text,
      recurrence: { type: "interval", intervalSeconds: seconds }
    };
  }

  // Pattern: "每天H点提醒我XXX" → cron: 0 H * * *
  match = /^每天\s*(\d{1,2})\s*点提醒(?:我)?(.+)/i.exec(trimmed);
  if (match) {
    const hour = parseInt(match[1]!, 10);
    const text = match[2]!.trim();
    if (hour >= 0 && hour <= 23) {
      const cronExpr = `0 ${hour} * * *`;
      const nextAt = nextCronTime(cronExpr, Date.now());
      return {
        triggerAt: nextAt ?? Date.now() + 3600_000,
        reminderText: text,
        recurrence: { type: "cron", cronExpression: cronExpr }
      };
    }
  }

  // Pattern: "每天早上H点提醒我XXX" → same as above
  match = /^每天早上\s*(\d{1,2})\s*点提醒(?:我)?(.+)/i.exec(trimmed);
  if (match) {
    const hour = parseInt(match[1]!, 10);
    const text = match[2]!.trim();
    if (hour >= 0 && hour <= 23) {
      const cronExpr = `0 ${hour} * * *`;
      return {
        triggerAt: nextCronTime(cronExpr, Date.now()) ?? Date.now() + 3600_000,
        reminderText: text,
        recurrence: { type: "cron", cronExpression: cronExpr }
      };
    }
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
