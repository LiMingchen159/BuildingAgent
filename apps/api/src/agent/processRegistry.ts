import { spawn, type ChildProcess } from "node:child_process";
import { knowledgeBaseRoot } from "./knowledgeBase.js";

export interface ProcessInfo {
  processId: string;
  command: string;
  status: "running" | "finished" | "killed" | "error";
  startedAt: string;
  finishedAt: string | null;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export class ProcessRegistry {
  private processes = new Map<string, ChildProcess>();
  private info = new Map<string, ProcessInfo>();
  private sequence = 0;
  private maxOutput = 100_000;

  /** Spawn a background process. Returns the process ID. */
  spawn(command: string, cwd?: string): string {
    this.sequence += 1;
    const processId = `proc_${String(this.sequence).padStart(6, "0")}`;

    const child = spawn(command, {
      cwd: cwd ?? knowledgeBaseRoot(),
      shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      windowsHide: true
    });

    const entry: ProcessInfo = {
      processId,
      command,
      status: "running",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      stdout: "",
      stderr: "",
      exitCode: null
    };

    this.processes.set(processId, child);
    this.info.set(processId, entry);

    child.stdout?.on("data", (chunk: Buffer) => {
      entry.stdout = (entry.stdout + chunk.toString("utf8")).slice(-this.maxOutput);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      entry.stderr = (entry.stderr + chunk.toString("utf8")).slice(-this.maxOutput);
    });

    child.on("close", (code) => {
      entry.status = code === 0 ? "finished" : "error";
      entry.exitCode = code;
      entry.finishedAt = new Date().toISOString();

      // Auto-cleanup after 30 min
      setTimeout(() => {
        this.processes.delete(processId);
        this.info.delete(processId);
      }, 1_800_000);
    });

    child.on("error", () => {
      entry.status = "error";
      entry.finishedAt = new Date().toISOString();
    });

    return processId;
  }

  /** Get status info for a process. */
  status(processId: string): ProcessInfo | null {
    return this.info.get(processId) ?? null;
  }

  /** Kill a running process. */
  kill(processId: string): boolean {
    const child = this.processes.get(processId);
    if (!child || child.killed) return false;

    const entry = this.info.get(processId);
    if (entry) {
      entry.status = "killed";
      entry.finishedAt = new Date().toISOString();
    }

    child.kill("SIGTERM");
    // Force kill after 3s
    setTimeout(() => {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }, 3000);

    return true;
  }

  /** List all processes (newest first). */
  list(): ProcessInfo[] {
    return [...this.info.values()].sort(
      (a, b) => b.startedAt.localeCompare(a.startedAt)
    );
  }

  /** Stop all running processes (for server shutdown). */
  shutdown(): void {
    for (const child of this.processes.values()) {
      try { child.kill("SIGTERM"); } catch { /* ignore */ }
    }
    this.processes.clear();
    this.info.clear();
  }
}
