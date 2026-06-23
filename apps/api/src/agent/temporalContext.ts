export type RelativeRange = "yesterday" | "today" | "last_7d";

export interface ResolvedRelativeRange {
  label: RelativeRange;
  from: string;
  to: string;
  timezone: string;
  calendarDate?: string;
}

const TEMPORAL_HINT_PATTERNS = [
  /\byesterday\b/i,
  /\btoday\b/i,
  /\btomorrow\b/i,
  /\blast\s+week\b/i,
  /\blast\s+\d+\s+days?\b/i,
  /昨天/,
  /今日/,
  /今天/,
  /明天/,
  /上周/,
  /近\s*\d+\s*天/
];

export function defaultTimezone(env: Record<string, string | undefined> = process.env): string {
  const configured = env.BUILDING_AGENT_TIMEZONE?.trim();
  return configured || "Asia/Hong_Kong";
}

export function calendarDateInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function parseCalendarDate(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error(`invalid_calendar_date:${dateStr}`);
  }
  return { year, month, day };
}

export function addCalendarDays(dateStr: string, days: number): string {
  const { year, month, day } = parseCalendarDate(dateStr);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function formatHmsInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${pick("hour")}:${pick("minute")}:${pick("second")}`;
}

export function startOfCalendarDayUtc(dateStr: string, timeZone: string): string {
  const { year, month, day } = parseCalendarDate(dateStr);
  const searchStart = Date.UTC(year, month - 1, day - 1, 0, 0, 0);
  const searchEnd = Date.UTC(year, month - 1, day + 1, 0, 0, 0);
  for (let timestamp = searchStart; timestamp < searchEnd; timestamp += 60_000) {
    const candidate = new Date(timestamp);
    if (calendarDateInZone(candidate, timeZone) === dateStr && formatHmsInZone(candidate, timeZone) === "00:00:00") {
      return candidate.toISOString();
    }
  }
  throw new Error(`start_of_day_not_found:${dateStr}:${timeZone}`);
}

export function endOfCalendarDayUtc(dateStr: string, timeZone: string): string {
  const { year, month, day } = parseCalendarDate(dateStr);
  const searchStart = Date.UTC(year, month - 1, day, 0, 0, 0);
  const searchEnd = Date.UTC(year, month - 1, day + 2, 0, 0, 0);
  let lastMatch: Date | null = null;
  for (let timestamp = searchStart; timestamp < searchEnd; timestamp += 60_000) {
    const candidate = new Date(timestamp);
    if (calendarDateInZone(candidate, timeZone) === dateStr) {
      lastMatch = candidate;
    }
  }
  if (!lastMatch) {
    throw new Error(`end_of_day_not_found:${dateStr}:${timeZone}`);
  }
  return new Date(lastMatch.getTime() + 59_999).toISOString();
}

export function resolveRelativeRange(
  relative: RelativeRange,
  timeZone: string = defaultTimezone(),
  now: Date = new Date()
): ResolvedRelativeRange {
  const today = calendarDateInZone(now, timeZone);
  if (relative === "today") {
    return {
      label: "today",
      from: startOfCalendarDayUtc(today, timeZone),
      to: now.toISOString(),
      timezone: timeZone,
      calendarDate: today
    };
  }
  if (relative === "yesterday") {
    const yesterday = addCalendarDays(today, -1);
    return {
      label: "yesterday",
      from: startOfCalendarDayUtc(yesterday, timeZone),
      to: endOfCalendarDayUtc(yesterday, timeZone),
      timezone: timeZone,
      calendarDate: yesterday
    };
  }
  const weekStart = addCalendarDays(today, -7);
  return {
    label: "last_7d",
    from: startOfCalendarDayUtc(weekStart, timeZone),
    to: now.toISOString(),
    timezone: timeZone
  };
}

export function resolvedRangesReferenceBlock(
  now: Date = new Date(),
  timeZone: string = defaultTimezone()
): string {
  const yesterday = resolveRelativeRange("yesterday", timeZone, now);
  const today = resolveRelativeRange("today", timeZone, now);
  const last7d = resolveRelativeRange("last_7d", timeZone, now);

  return [
    "CALENDAR RANGES (wall clock — copy into bms_timeseries_query as from/to, UTC ISO):",
    `Yesterday (${yesterday.calendarDate} ${timeZone}): from=${yesterday.from} to=${yesterday.to}`,
    `Today (${today.calendarDate} ${timeZone}): from=${today.from} to=${today.to}`,
    `Last 7 days (${timeZone}): from=${last7d.from} to=${last7d.to}`
  ].join("\n");
}

export function wallClockContextBlock(now: Date = new Date(), timeZone: string = defaultTimezone()): string {
  const conversationDate = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(now);
  const localDisplay = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(now);

  return [
    "CURRENT TIME (authoritative wall clock):",
    `Conversation date: ${conversationDate} (${timeZone})`,
    `UTC now: ${now.toISOString()}`,
    `Local now: ${localDisplay} (${timeZone})`,
    resolvedRangesReferenceBlock(now, timeZone),
    "Relative terms (yesterday / today / 昨天 / 今天) map to CALENDAR RANGES above — never to BMS backfill dates or earlier-turn ranges.",
    "For BMS history: pass the matching from/to into bms_timeseries_query and re-fetch; do not replay a prior answer."
  ].join("\n");
}

export function shouldInjectTemporalHint(userMessage: string): boolean {
  const trimmed = userMessage.trim();
  if (!trimmed) {
    return false;
  }
  return TEMPORAL_HINT_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function temporalQueryHintBlock(userMessage: string): string {
  if (!shouldInjectTemporalHint(userMessage)) {
    return "";
  }
  return [
    "TEMPORAL QUERY: The user used a relative time word.",
    "Pick the matching line from CALENDAR RANGES in CURRENT TIME and pass those exact from/to values to bms_timeseries_query.",
    "Re-fetch with tools — never reuse a prior answer or dates from earlier turns.",
    "State the resolved calendar date in the reply (e.g. Yesterday = 2026-06-06 HKT)."
  ].join(" ");
}
