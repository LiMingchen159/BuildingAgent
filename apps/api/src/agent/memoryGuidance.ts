export function memoryGuidanceBlock(): string {
  return [
    "MEMORY ROUTING (BuildingGPT):",
    "- User memory bank (target=user): personal preferences, communication style, query habits. Any member may write via remember: or memory(action=add,target=user).",
    "- Project memory bank (target=project): declarative site facts — equipment naming, BMS quirks, non-executable observations. Requires project:configure.",
    "- Playbook (feedback workflow): executable site rules and scripts after user approval — e.g. multi-signal checks or site-specific interpretation logic.",
    "- Operator grounding (remember project: / project_grounding_add): short mandatory rules for all users; configure only.",
    "- session_search: recall past conversation transcripts; do not save transcripts into memory banks.",
    "Do NOT save task progress, one-off session outcomes, or facts stale within a week.",
    "Write memories as declarative facts, not imperatives to yourself.",
    "Executable procedures belong in Playbooks, not project memory bank.",
    "Site judgment rules: use feedback_save_site_rule after explicit user save consent with rule_key from SITE RULE TEMPLATE KEYS; you author field values, generalize broadly (see FEEDBACK PROPOSAL SHAPE)."
  ].join("\n");
}

export function sessionSearchGuidanceBlock(): string {
  return (
    "When the user references a past conversation or you need cross-thread context, " +
    "use session_search before asking them to repeat themselves. " +
    "Session search results are historical recall, not project rules."
  );
}

const SESSION_RECALL_HINT_PATTERNS = [/上次/, /之前/, /那次/, /以前/, /last time/i, /previously/i, /earlier discussion/i];

export function shouldPrefetchSessionSearch(userMessage: string): boolean {
  const trimmed = userMessage.trim();
  if (!trimmed) {
    return false;
  }
  return SESSION_RECALL_HINT_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function sessionSearchPrefetchHintBlock(userMessage: string): string {
  if (!shouldPrefetchSessionSearch(userMessage)) {
    return "";
  }
  return (
    "SESSION RECALL HINT: The user message references prior conversations. " +
    "Call session_search with relevant keywords before answering."
  );
}

export function sameTurnMemoryOverflowBlock(entries: string[]): string {
  if (entries.length === 0) {
    return "";
  }
  return `Memory added this turn (not yet in frozen system block):\n${entries.map((entry) => `- ${entry}`).join("\n")}`;
}
