import { useEffect, useState } from "react";
import { Badge } from "./primitives";

export interface ScheduledTask {
  id: string;
  name: string;
  kind: "scheduled" | "rule" | "report";
  schedule: string;
  status: "active" | "paused" | "draft";
  nextRunAt?: string | undefined;
  countdownSeconds?: number | undefined;
}

const MOCK_TASKS: ReadonlyArray<ScheduledTask> = [
  {
    id: "task_chiller_close",
    name: "Close chiller in 30 minutes",
    kind: "scheduled",
    schedule: "One-shot · in 30 min",
    status: "active",
    countdownSeconds: 30 * 60
  },
  {
    id: "task_temp_rule",
    name: "If outdoor temp < 18°C and chiller on, notify me",
    kind: "rule",
    schedule: "Rule · evaluated every 5 min",
    status: "active"
  },
  {
    id: "task_weekly_energy",
    name: "Weekly energy report every Monday",
    kind: "report",
    schedule: "Recurring · Mon 09:00",
    status: "active",
    nextRunAt: "Mon 09:00"
  },
  {
    id: "task_daily_report",
    name: "Daily report generation",
    kind: "report",
    schedule: "Recurring · daily 18:00",
    status: "paused",
    nextRunAt: "Tomorrow 18:00"
  }
];

const STATUS_TONES: Record<ScheduledTask["status"], "success" | "warning" | "neutral"> = {
  active: "success",
  paused: "warning",
  draft: "neutral"
};

const KIND_LABELS: Record<ScheduledTask["kind"], string> = {
  scheduled: "Scheduled",
  rule: "Rule",
  report: "Report"
};

function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function ScheduledTasks() {
  const initial = MOCK_TASKS.find((task) => typeof task.countdownSeconds === "number")?.countdownSeconds ?? 0;
  const [countdown, setCountdown] = useState(initial);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCountdown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <ul className="rp-card-list" aria-label="Scheduled and rule-based tasks">
      {MOCK_TASKS.map((task) => (
        <li className="rp-card" key={task.id}>
          <div className="rp-card-row">
            <strong>{task.name}</strong>
            <Badge tone={STATUS_TONES[task.status]}>{task.status}</Badge>
          </div>
          <div className="rp-card-meta">
            <span>{KIND_LABELS[task.kind]}</span>
            <span>{task.schedule}</span>
            {typeof task.countdownSeconds === "number" ? (
              <span className="rp-card-countdown" aria-live="polite">⏱ {formatCountdown(countdown)}</span>
            ) : null}
            {task.nextRunAt ? <span>Next: {task.nextRunAt}</span> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
