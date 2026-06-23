const BLOCKED_PATTERNS: RegExp[] = [
  /<\s*system\s*>/i,
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /you\s+are\s+now\s+/i,
  /<\s*memory-context\s*>/i
];

export function scanMemoryEntry(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return pattern.source;
    }
  }
  return null;
}

export function sanitizeEntryForSnapshot(content: string, label: string): string {
  const threat = scanMemoryEntry(content);
  if (!threat) {
    return content;
  }
  return `[BLOCKED: ${label} entry contained a disallowed pattern. Removed from system prompt.]`;
}
