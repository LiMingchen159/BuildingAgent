const CONSENT_PATTERNS: RegExp[] = [
  /^yes\.?$/i,
  /^save\s+site\s+rule\s*:\s*yes$/i,
  /^save\s+site\s+rule\s+yes$/i,
  /^save\s+this\s+as\s+a\s+project\s+rule$/i,
  /^yes,?\s*save\b/i,
  /^yes,?\s*remember\b/i,
  /^yes,?\s*save\s+this\b/i,
  /^save\s+memory\s*:\s*yes$/i,
  /^save\s+memory\s+yes$/i,
  /^记下来$/,
  /^是的[，,]\s*保存/,
  /^是的[，,]\s*记下来/,
  /^保存[吧吗]?$/,
  /^保存这个规则/,
  /^好[，,]\s*保存/,
  /^可以[，,]\s*保存/,
  /^可以[，,]\s*记下来/
];

const BARE_YES_ONLY = /^(是的|对|好|可以|ok|okay)\.?$/i;

export function siteRuleSaveConsentHintBlock(userMessage: string): string {
  if (!hasSiteRuleSaveConsent(userMessage)) {
    return "";
  }
  return (
    "SITE RULE SAVE HINT: User consented to save a site rule. " +
    "Call feedback_save_site_rule with rule_key from SITE RULE TEMPLATE KEYS and LLM-authored name, scope, trigger, action, wrong_pattern, trigger_topics (≥4) from the recent correction principle. " +
    "rule_key picks the stable template; field content must come from your generalized principle — not copied guide text. " +
    "Do not mention internal IDs."
  );
}

export function hasSiteRuleSaveConsent(userMessage: string): boolean {
  const trimmed = userMessage.trim();
  if (!trimmed) {
    return false;
  }
  if (BARE_YES_ONLY.test(trimmed)) {
    return false;
  }
  return CONSENT_PATTERNS.some((pattern) => pattern.test(trimmed));
}
