import type { SeedStore } from "./seed.js";
import type { ProjectRuleFields, ProjectRuleStatus, RuleErrorType } from "./projectRules.js";
import { composeRuleContent, formatRetrievedRulesPreview, resolveRuleDisplayName } from "./projectRules.js";

export type ProjectGroundingSource = "operator" | "playbook" | "user" | "agent" | "seed";

export interface ProjectGroundingRule {
  id: string;
  projectId: string;
  content: string;
  source: ProjectGroundingSource;
  createdAt: string;
  createdBy?: string;
  ruleKey?: string;
  name?: string;
  scope?: string;
  trigger?: string;
  action?: string;
  exception?: string;
  wrongPattern?: string;
  positiveExample?: string;
  negativeExample?: string;
  triggerTopics?: string[];
  brickClasses?: string[];
  systems?: string[];
  equipment?: string[];
  errorType?: RuleErrorType;
  sourceFeedback?: string;
  confidence?: number;
  status?: ProjectRuleStatus;
}

export interface AddStructuredRuleMeta {
  source?: ProjectGroundingSource;
  createdBy?: string;
}

export interface ProjectGroundingBindingsOptions {
  onRuleSaved?: (rule: ProjectGroundingRule) => void | Promise<void>;
}

function isUserApprovedSiteRule(rule: ProjectGroundingRule): boolean {
  return rule.source === "user" && !isPlaybookRule(rule);
}

function isOperatorRule(rule: ProjectGroundingRule): boolean {
  return (rule.source === "operator" || rule.source === "agent" || rule.source === "seed") && !isPlaybookRule(rule);
}

function isPlaybookRule(rule: ProjectGroundingRule): boolean {
  return rule.source === "playbook" || rule.content.includes("[Playbook:");
}

export function seedProjectGroundingByProject(): Record<string, ProjectGroundingRule[]> {
  return {};
}

export function ensureStoreProjectGrounding(store: SeedStore): void {
  if (!store.projectGroundingByProject) {
    store.projectGroundingByProject = {};
  }
}

export function groundingActivityPayload(
  rules: ProjectGroundingRule[],
  requestId: string
): Record<string, unknown> | null {
  if (rules.length === 0) {
    return null;
  }
  const preview = formatRetrievedRulesPreview(rules);
  const names = rules.map((rule) => resolveRuleDisplayName(rule));
  const label =
    rules.length === 1
      ? `Retrieved site rule: ${names[0]}`
      : `Retrieved site rules (${rules.length}): ${names.slice(0, 3).join(", ")}${names.length > 3 ? ", …" : ""}`;
  return {
    id: `grounding_${requestId}`,
    label,
    kind: "tool",
    tool: "project_grounding",
    status: "done",
    output: preview || `${rules.length} rule(s) injected into system prompt`
  };
}

function formatStructuredUserRule(rule: ProjectGroundingRule): string {
  const lines = [
    `[${rule.id}] ${resolveRuleDisplayName(rule)}`,
    rule.scope ? `  scope: ${rule.scope}` : "",
    rule.trigger ? `  When: ${rule.trigger}` : "",
    rule.action ? `  Do: ${rule.action}` : "",
    rule.exception ? `  Except: ${rule.exception}` : "",
    rule.wrongPattern ? `  Do not: ${rule.wrongPattern}` : ""
  ].filter(Boolean);
  if (lines.length > 1) {
    return lines.join("\n");
  }
  return `- ${rule.content}`;
}

export function groundingPromptBlock(rules: ProjectGroundingRule[]): string {
  if (rules.length === 0) {
    return "";
  }

  const operatorRules = rules.filter((rule) => isOperatorRule(rule));
  const userApprovedRules = rules.filter((rule) => isUserApprovedSiteRule(rule));
  const playbookRules = rules.filter((rule) => isPlaybookRule(rule));

  const sections: string[] = [];
  if (operatorRules.length > 0) {
    sections.push(
      "Operator grounding rules (site-specific, must follow):",
      ...operatorRules.map((rule) => `- ${rule.content}`)
    );
  }
  if (userApprovedRules.length > 0) {
    sections.push(
      "Applicable project rules (approved):",
      ...userApprovedRules.map((rule) => formatStructuredUserRule(rule))
    );
  }
  if (playbookRules.length > 0) {
    sections.push(
      "Script playbooks (user-approved, must follow):",
      ...playbookRules.map((rule) => `- ${rule.content}`)
    );
  }
  return sections.join("\n");
}

export interface ProjectGroundingBindings {
  list(projectId: string): ProjectGroundingRule[];
  add(
    projectId: string,
    content: string,
    meta?: { source?: ProjectGroundingSource; createdBy?: string }
  ): ProjectGroundingRule;
  addStructured(projectId: string, fields: ProjectRuleFields, meta?: AddStructuredRuleMeta): ProjectGroundingRule;
}

let groundingSequence = 0;

function findExistingUserRule(
  existing: ProjectGroundingRule[],
  fields: ProjectRuleFields
): ProjectGroundingRule | undefined {
  if (fields.ruleKey) {
    const byKey = existing.find((rule) => rule.source === "user" && rule.ruleKey === fields.ruleKey);
    if (byKey) {
      return byKey;
    }
  }
  if (fields.errorType) {
    const byError = existing.find(
      (rule) =>
        rule.source === "user" &&
        (rule.ruleKey === fields.errorType || rule.errorType === fields.errorType)
    );
    if (byError) {
      return byError;
    }
  }
  return existing.find(
    (rule) =>
      rule.source === "user" &&
      rule.action?.toLowerCase() === fields.action.toLowerCase() &&
      rule.scope?.toLowerCase() === fields.scope.toLowerCase()
  );
}

function buildStructuredRule(
  projectId: string,
  fields: ProjectRuleFields,
  meta: AddStructuredRuleMeta | undefined,
  id: string,
  createdAt: string
): ProjectGroundingRule {
  const content = composeRuleContent(fields);
  return {
    id,
    projectId,
    content,
    source: meta?.source ?? "user",
    createdAt,
    ruleKey: fields.ruleKey,
    name: fields.name,
    scope: fields.scope,
    trigger: fields.trigger,
    action: fields.action,
    ...(fields.exception ? { exception: fields.exception } : {}),
    ...(fields.wrongPattern ? { wrongPattern: fields.wrongPattern } : {}),
    ...(fields.positiveExample ? { positiveExample: fields.positiveExample } : {}),
    ...(fields.negativeExample ? { negativeExample: fields.negativeExample } : {}),
    triggerTopics: fields.triggerTopics,
    ...(fields.brickClasses?.length ? { brickClasses: fields.brickClasses } : {}),
    ...(fields.systems?.length ? { systems: fields.systems } : {}),
    ...(fields.equipment?.length ? { equipment: fields.equipment } : {}),
    ...(fields.errorType ? { errorType: fields.errorType } : {}),
    ...(fields.sourceFeedback ? { sourceFeedback: fields.sourceFeedback } : {}),
    confidence: fields.confidence ?? 0.85,
    status: fields.status ?? "approved",
    ...(meta?.createdBy ? { createdBy: meta.createdBy } : {})
  };
}

export function createProjectGroundingBindings(
  store: SeedStore,
  onChange?: () => void,
  options?: ProjectGroundingBindingsOptions
): ProjectGroundingBindings {
  ensureStoreProjectGrounding(store);

  const persistRule = async (rule: ProjectGroundingRule): Promise<void> => {
    await options?.onRuleSaved?.(rule);
  };

  return {
    list(projectId: string): ProjectGroundingRule[] {
      return [...(store.projectGroundingByProject?.[projectId] ?? [])];
    },
    add(projectId: string, content: string, meta?: { source?: ProjectGroundingSource; createdBy?: string }): ProjectGroundingRule {
      const trimmed = content.replace(/\s+/gu, " ").trim();
      if (!trimmed) {
        throw new Error("grounding_content_required");
      }
      if (!store.projectGroundingByProject) {
        store.projectGroundingByProject = {};
      }
      const existing = store.projectGroundingByProject[projectId] ?? [];
      const duplicate = existing.find((rule) => rule.content.toLowerCase() === trimmed.toLowerCase());
      if (duplicate) {
        return duplicate;
      }
      groundingSequence += 1;
      const rule: ProjectGroundingRule = {
        id: `ground_${String(groundingSequence).padStart(6, "0")}`,
        projectId,
        content: trimmed,
        source: meta?.source ?? "operator",
        createdAt: new Date().toISOString(),
        ...(meta?.createdBy ? { createdBy: meta.createdBy } : {})
      };
      store.projectGroundingByProject[projectId] = [...existing, rule].slice(-30);
      onChange?.();
      void persistRule(rule);
      return rule;
    },
    addStructured(projectId: string, fields: ProjectRuleFields, meta?: AddStructuredRuleMeta): ProjectGroundingRule {
      if (!store.projectGroundingByProject) {
        store.projectGroundingByProject = {};
      }
      const existing = store.projectGroundingByProject[projectId] ?? [];
      const duplicate = findExistingUserRule(existing, fields);
      if (duplicate) {
        const updated = buildStructuredRule(projectId, fields, meta, duplicate.id, duplicate.createdAt);
        store.projectGroundingByProject[projectId] = existing.map((rule) =>
          rule.id === duplicate.id ? updated : rule
        );
        onChange?.();
        void persistRule(updated);
        return updated;
      }

      groundingSequence += 1;
      const rule = buildStructuredRule(
        projectId,
        fields,
        meta,
        `ground_${String(groundingSequence).padStart(6, "0")}`,
        new Date().toISOString()
      );
      store.projectGroundingByProject[projectId] = [...existing, rule].slice(-30);
      onChange?.();
      void persistRule(rule);
      return rule;
    }
  };
}

export function restoreGroundingSequence(store: SeedStore): void {
  let max = 0;
  for (const rules of Object.values(store.projectGroundingByProject ?? {})) {
    for (const rule of rules) {
      const match = /^ground_(\d+)$/.exec(rule.id);
      if (match) {
        max = Math.max(max, Number(match[1]!));
      }
    }
  }
  groundingSequence = max;
}
