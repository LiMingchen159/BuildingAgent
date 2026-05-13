import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";

export interface StructuredLogEntry {
  level: "info" | "warn" | "error" | "debug";
  at: string;
  message: string;
  requestId?: string;
  projectId?: string;
  component?: string;
  duration?: number;
  [key: string]: unknown;
}

export interface LoggingConfig {
  dir: string;
  maxFileBytes?: number;
}

export class StructuredLogger {
  private logPath: string;
  private maxBytes: number;

  constructor(config: LoggingConfig) {
    this.maxBytes = config.maxFileBytes ?? 5 * 1024 * 1024; // 5 MB
    this.logPath = path.join(config.dir, "app.log");
    this.ensureDir();
  }

  private ensureDir(): void {
    try {
      if (!existsSync(path.dirname(this.logPath))) {
        mkdirSync(path.dirname(this.logPath), { recursive: true });
      }
    } catch {
      // best effort
    }
  }

  private rotate(): void {
    try {
      if (!existsSync(this.logPath)) return;
      const stats = statSync(this.logPath);
      if (stats.size < this.maxBytes) return;
      const rotated = this.logPath.replace(/\.log$/, `.${Date.now()}.log`);
      renameSync(this.logPath, rotated);
    } catch {
      // best effort
    }
  }

  log(entry: StructuredLogEntry): void {
    const line = JSON.stringify(entry) + "\n";
    try {
      this.rotate();
      appendFileSync(this.logPath, line, "utf8");
    } catch {
      // fallback: write to stderr if file logging fails
      process.stderr.write(line);
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log({ level: "info", at: new Date().toISOString(), message, ...meta });
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log({ level: "warn", at: new Date().toISOString(), message, ...meta });
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log({ level: "error", at: new Date().toISOString(), message, ...meta });
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log({ level: "debug", at: new Date().toISOString(), message, ...meta });
  }
}

/** Attach structured logging hooks to a Fastify instance. */
export function attachStructuredLogging(app: FastifyInstance, logger: StructuredLogger): void {
  app.addHook("onRequest", (request, _reply, done) => {
    (request as any).__startTime = Date.now();
    logger.info("request_started", {
      requestId: (request as any).id,
      method: request.method,
      url: request.url
    });
    done();
  });

  app.addHook("onResponse", (request, _reply, done) => {
    const startTime = (request as any).__startTime as number | undefined;
    const duration = startTime ? Date.now() - startTime : undefined;
    logger.info("request_completed", {
      requestId: (request as any).id,
      method: request.method,
      url: request.url,
      duration
    });
    done();
  });

  app.addHook("onError", (request, _reply, error, done) => {
    logger.error("request_error", {
      requestId: (request as any).id,
      method: request.method,
      url: request.url,
      error: error instanceof Error ? error.message : String(error)
    });
    done();
  });
}
