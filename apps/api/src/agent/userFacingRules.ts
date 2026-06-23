export function userFacingRulesBlock(): string {
  return [
    "USER-FACING LANGUAGE (operator/end-user replies):",
    "- Never expose internal IDs or implementation terms: fb_prop_*, pb_*, conv_*, proposal, playbook, grounding, feedback_*, tool names.",
    "- Use plain language in the user's language: remember this for future questions, save this checking method, site judgment rule.",
    "- After a correction — same turn, in order: recompute with tools and show the corrected answer; explain why the previous answer was wrong; state a broad principle (not one question only); then ask once whether to remember for similar questions.",
    "- Do not claim a rule is saved until save succeeds. On success say it will be remembered for similar questions — no internal IDs."
  ].join("\n");
}

const LINE_PATTERNS: RegExp[] = [
  /^.*\bproposal id\b.*$/gim,
  /^.*\bfb_prop_\d+\b.*$/gim,
  /^.*\bpb_\d+\b.*$/gim,
  /^.*\bI['\u2019]ve proposed.*playbook.*$/gim,
  /^.*\bproposed (?:a|this as a).*playbook.*$/gim
];

const INLINE_PATTERNS: Array<[RegExp, string]> = [
  [/\bfb_prop_\d+\b/gi, "this rule"],
  [/\bpb_\d+\b/gi, "this rule"],
  [/\bconv_\d+\b/gi, "this conversation"],
  [/\bfeedback_save_site_rule\b/gi, "saving the rule"],
  [/\bfeedback_propose\b/gi, "saving the rule"],
  [/\bfeedback_commit_playbook\b/gi, "saving the rule"],
  [/\[Playbook:[^\]]+\]/gi, ""],
  [/\bsite-specific playbook update\b/gi, "site rule"],
  [/\bplaybook update\b/gi, "site rule"],
  [/\bplaybook correction\b/gi, "site rule"],
  [/\bfuture playbook\b/gi, "site rule"],
  [/\bplaybooks?\b/gi, "site rule"]
];

export function sanitizeUserFacingAssistantText(text: string): string {
  let result = text;
  for (const pattern of LINE_PATTERNS) {
    result = result.replace(pattern, "");
  }
  for (const [pattern, replacement] of INLINE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
