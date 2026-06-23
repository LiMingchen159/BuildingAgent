import type { ProjectGroundingRule } from "./projectGrounding.js";

export interface RuleValidationWarning {
  ruleId: string;
  code: string;
  message: string;
}

export function validateAssistantAgainstRules(
  assistantText: string,
  retrievedRules: ProjectGroundingRule[]
): RuleValidationWarning[] {
  const warnings: RuleValidationWarning[] = [];
  const lowered = assistantText.toLowerCase();

  for (const rule of retrievedRules) {
    const isTlkwRule =
      /tlkw/i.test(rule.action ?? "") ||
      /tlkw/i.test(rule.content) ||
      /tlkw/i.test(rule.wrongPattern ?? "") ||
      rule.errorType === "wrong_running_state";
    if (!isTlkwRule) {
      continue;
    }

    const mentionsRunStatus = /run[_\s-]?status/i.test(assistantText);
    const mentionsTlkw = /tlkw|motor power|kilowatt|\bkW\b/i.test(assistantText);
    if (mentionsRunStatus && !mentionsTlkw) {
      warnings.push({
        ruleId: rule.id,
        code: "tlkw_rule_not_applied",
        message:
          "Retrieved running-state rule expects TLKW cross-check, but the answer appears to rely on Run_Status alone."
      });
    }

    const conflictsIgnored = /disagree|conflict|mismatch|不一致|冲突/i.test(rule.action ?? rule.content);
    if (conflictsIgnored && mentionsRunStatus && mentionsTlkw && !/conflict|disagree|mismatch|不一致|冲突/i.test(lowered)) {
      warnings.push({
        ruleId: rule.id,
        code: "signal_conflict_not_reported",
        message: "Running-state rule expects explicit conflict reporting when signals disagree."
      });
    }
  }

  return warnings;
}
