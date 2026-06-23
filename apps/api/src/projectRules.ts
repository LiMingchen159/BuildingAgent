import type { ProjectGroundingRule } from "./projectGrounding.js";

export type RuleErrorType =
  | "wrong_entity"
  | "wrong_relationship"
  | "wrong_brick_class"
  | "wrong_point_selection"
  | "wrong_aggregation"
  | "wrong_time_range"
  | "wrong_project_convention"
  | "wrong_running_state";

export type ProjectRuleStatus = "approved" | "draft" | "rejected";

export interface SiteRuleTemplateGuide {
  ruleKey: string;
  errorType: RuleErrorType;
  nameGuide: string;
  scopeGuide: string;
  triggerGuide: string;
  actionGuide: string;
  wrongPatternGuide?: string;
  exceptionGuide?: string;
  triggerTopicsGuide: string;
  systemsGuide?: string;
  equipmentGuide?: string;
  brickClassesGuide?: string;
}

export const SITE_RULE_TEMPLATE_GUIDES: Partial<Record<RuleErrorType, SiteRuleTemplateGuide>> = {
  wrong_running_state: {
    ruleKey: "wrong_running_state",
    errorType: "wrong_running_state",
    nameGuide: "Short English label summarizing the principle, e.g. Chiller running: TLKW cross-check",
    scopeGuide:
      "Broad scope for chiller plant running-state questions — how many running, which are on, operating status; not one exact user phrasing",
    triggerGuide:
      "When user asks chiller running count, which chillers are on/off, plant operating status, or similar running-state questions",
    actionGuide:
      "State the generalized principle from the correction: cross-check Run_Status with motor power/kW (TLKW); treat meaningful positive kW as stronger running evidence; report conflicts explicitly",
    wrongPatternGuide: "Do not rely on Run_Status numeric codes alone when TLKW is zero or conflicts",
    exceptionGuide: "If motor power/kW is unavailable or stale, lower confidence and say the count is status-only",
    triggerTopicsGuide:
      "At least 4 paraphrases across the chiller-running topic family (English and/or Chinese synonyms — for retrieval only)",
    systemsGuide: "chiller plant, HVAC",
    equipmentGuide: "WCC, TLKW, Run_Status",
    brickClassesGuide: "brick:Chiller, brick:Run_Status, brick:Power_Sensor"
  }
};

export function siteRuleTemplateGuidanceBlock(): string {
  const lines = [
    "SITE RULE TEMPLATE KEYS (for feedback_save_site_rule on save-consent turn):",
    "- rule_key: stable template id — same key reuses the same stored rule id (upsert).",
    "- Pick the matching rule_key, then YOU author name/scope/trigger/action/wrong_pattern/trigger_topics from the correction principle.",
    "- Generalize broadly; do not copy guide text verbatim and do not tie to one question wording.",
    ""
  ];
  for (const guide of Object.values(SITE_RULE_TEMPLATE_GUIDES)) {
    if (!guide) {
      continue;
    }
    lines.push(
      `[${guide.ruleKey}]`,
      `  name: ${guide.nameGuide}`,
      `  scope: ${guide.scopeGuide}`,
      `  trigger: ${guide.triggerGuide}`,
      `  action: ${guide.actionGuide}`,
      ...(guide.wrongPatternGuide ? [`  wrong_pattern: ${guide.wrongPatternGuide}`] : []),
      ...(guide.exceptionGuide ? [`  exception: ${guide.exceptionGuide}`] : []),
      `  trigger_topics: ${guide.triggerTopicsGuide}`,
      ...(guide.systemsGuide ? [`  systems: ${guide.systemsGuide}`] : []),
      ...(guide.equipmentGuide ? [`  equipment: ${guide.equipmentGuide}`] : []),
      ...(guide.brickClassesGuide ? [`  brick_classes: ${guide.brickClassesGuide}`] : []),
      `  error_type: ${guide.errorType}`,
      ""
    );
  }
  return lines.join("\n");
}

export interface ProjectRuleFields {
  ruleKey: string;
  name: string;
  scope: string;
  trigger: string;
  action: string;
  exception?: string;
  wrongPattern?: string;
  positiveExample?: string;
  negativeExample?: string;
  triggerTopics: string[];
  brickClasses?: string[];
  systems?: string[];
  equipment?: string[];
  errorType?: RuleErrorType;
  sourceFeedback?: string;
  confidence?: number;
  status?: ProjectRuleStatus;
}

export interface SaveProjectRuleInput {
  ruleSummary?: string;
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
  createdBy?: string;
  proposalId?: string;
}

export interface FeedbackEpisode {
  conversationId: string;
  projectId: string;
  userQuestion: string;
  modelAnswer: string;
  userCorrection: string;
  acceptedAnswer?: string;
  errorType?: RuleErrorType;
  relatedEntities?: string[];
  relatedBrickClasses?: string[];
  relatedSystems?: string[];
  capturedAt: string;
}

const RULE_ERROR_TYPES = new Set<RuleErrorType>([
  "wrong_entity",
  "wrong_relationship",
  "wrong_brick_class",
  "wrong_point_selection",
  "wrong_aggregation",
  "wrong_time_range",
  "wrong_project_convention",
  "wrong_running_state"
]);

export function isRuleErrorType(value: string): value is RuleErrorType {
  return RULE_ERROR_TYPES.has(value as RuleErrorType);
}

export function composeRuleContent(fields: ProjectRuleFields): string {
  const parts = [
    fields.name?.trim() ? `Name: ${fields.name.trim()}` : "",
    `When: ${fields.trigger.trim()}`,
    `Do: ${fields.action.trim()}`,
    fields.exception ? `Except: ${fields.exception.trim()}` : "",
    fields.wrongPattern ? `Do not: ${fields.wrongPattern.trim()}` : "",
    fields.positiveExample ? `Example (good): ${fields.positiveExample.trim()}` : "",
    fields.negativeExample ? `Example (bad): ${fields.negativeExample.trim()}` : "",
    `Scope: ${fields.scope.trim()}`
  ].filter(Boolean);
  return parts.join("\n");
}

export function buildRetrievalCard(rule: ProjectGroundingRule): string {
  const topics = (rule.triggerTopics ?? []).join("; ");
  const brick = (rule.brickClasses ?? []).join(", ");
  const systems = (rule.systems ?? []).join(", ");
  const equipment = (rule.equipment ?? []).join(", ");
  const signals = extractSignals(rule);
  const lines = [
    "[site-rule]",
    rule.name ? `name: ${rule.name}` : "",
    topics ? `topics: ${topics}` : "",
    rule.scope ? `scope: ${rule.scope}` : "",
    signals ? `signals: ${signals}` : "",
    brick ? `brick: ${brick}` : "",
    systems ? `systems: ${systems}` : "",
    equipment ? `equipment: ${equipment}` : "",
    rule.action ? `action: ${rule.action}` : "",
    rule.wrongPattern ? `anti: ${rule.wrongPattern}` : "",
    rule.trigger ? `when: ${rule.trigger}` : ""
  ].filter(Boolean);
  return lines.join("\n").slice(0, 800);
}

function extractSignals(rule: ProjectGroundingRule): string {
  const haystack = [rule.action, rule.content, rule.wrongPattern].filter(Boolean).join(" ");
  const tokens = new Set<string>();
  for (const match of haystack.matchAll(/\b(WCC(?:_\d+)?|TLKW|Run_Status|AHU|VAV|CHWST?)\b/gi)) {
    tokens.add(match[1]!.toUpperCase().replace(/^WCC$/i, "WCC"));
  }
  return [...tokens].join(", ");
}

export function resolveRuleDisplayName(
  rule: Pick<ProjectGroundingRule, "name" | "scope" | "action" | "id">
): string {
  if (rule.name?.trim()) {
    return rule.name.trim();
  }
  if (rule.scope?.trim()) {
    return rule.scope.trim().slice(0, 80);
  }
  if (rule.action?.trim()) {
    return rule.action.trim().slice(0, 80);
  }
  return rule.id;
}

export function formatRetrievedRulesPreview(rules: ProjectGroundingRule[]): string {
  return rules.map((rule) => resolveRuleDisplayName(rule)).join(" • ").slice(0, 400);
}

function slugifyRuleKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function stableRuleKey(scope: string, action: string, errorType?: RuleErrorType): string {
  if (errorType) {
    return errorType;
  }
  return slugifyRuleKey(`${scope}::${action}`) || "site_rule";
}

export function resolveSiteRuleKey(
  input: SaveProjectRuleInput,
  episode?: FeedbackEpisode | null,
  scope?: string,
  action?: string
): string {
  const explicit = input.ruleKey?.trim();
  if (explicit) {
    return explicit;
  }

  const errorType = input.errorType ?? episode?.errorType;
  if (errorType && SITE_RULE_TEMPLATE_GUIDES[errorType]) {
    return errorType;
  }

  const haystack = [
    input.action,
    input.scope,
    input.ruleSummary,
    action,
    scope,
    episode?.userQuestion,
    episode?.userCorrection
  ]
    .filter(Boolean)
    .join(" ");
  if (/chiller|running|tlkw|run_status|冷机|运行/i.test(haystack)) {
    return "wrong_running_state";
  }

  const intent = episode?.userQuestion ? extractQueryContext(episode.userQuestion).intent : "other";
  if (intent === "running_status") {
    return "wrong_running_state";
  }

  if (scope && action) {
    return stableRuleKey(scope, action, errorType);
  }

  return "site_rule";
}

function inferRuleName(scope: string, action: string): string {
  if (/chiller|running|tlkw|run_status|冷机|运行/i.test(`${scope} ${action}`)) {
    return "Chiller running: TLKW cross-check";
  }
  const shortScope = scope.split(/[/.]/)[0]?.trim();
  if (shortScope && shortScope.length >= 8) {
    return shortScope.slice(0, 60);
  }
  return action.slice(0, 60) || "Site judgment rule";
}

function inferScopeFromAction(action: string, episode?: FeedbackEpisode | null): string {
  if (/chiller|running|tlkw|run_status|冷机|运行/i.test(action)) {
    return "chiller plant / running-state queries";
  }
  if (episode?.relatedSystems?.length) {
    return `${episode.relatedSystems.join(", ")} queries`;
  }
  return "site judgment queries matching the saved principle";
}

function inferTriggerFromEpisode(episode?: FeedbackEpisode | null): string {
  if (episode?.userQuestion?.trim()) {
    return `When user asks questions like: ${episode.userQuestion.trim().slice(0, 160)}`;
  }
  return "When user asks a related site question covered by this rule";
}

function expandTriggerTopics(
  seedTopics: string[],
  action: string,
  scope: string,
  episode?: FeedbackEpisode | null
): string[] {
  const topics = new Set(seedTopics);
  const haystack = `${action} ${scope} ${episode?.userCorrection ?? ""} ${episode?.userQuestion ?? ""}`;
  const defaults = [
    "chiller running",
    "chillers running",
    "how many chillers",
    "which chillers",
    "chiller plant",
    "plant running",
    "operating status",
    "running situation",
    "run status",
    "physically running",
    "冷机运行",
    "哪几台冷机",
    "运行状态",
    "开机"
  ];
  if (/chiller|running|tlkw|run_status|冷机|运行/i.test(haystack)) {
    for (const topic of defaults) {
      topics.add(topic);
    }
  }
  for (const entity of episode?.relatedEntities ?? []) {
    topics.add(entity.toLowerCase());
  }
  return [...topics].map((topic) => topic.trim()).filter((topic) => topic.length >= 2);
}

export function normalizeProjectRuleInput(
  input: SaveProjectRuleInput,
  episode?: FeedbackEpisode | null
): ProjectRuleFields {
  const action = (input.action ?? input.ruleSummary ?? "").trim();
  if (!action) {
    throw new Error("action_required");
  }

  const scope = (input.scope ?? "").trim() || inferScopeFromAction(action, episode);
  const trigger = (input.trigger ?? "").trim() || inferTriggerFromEpisode(episode);
  const triggerTopics = expandTriggerTopics(
    [...new Set((input.triggerTopics ?? []).map((t) => t.trim()).filter((t) => t.length >= 2))],
    action,
    scope,
    episode
  );
  if (triggerTopics.length < 4) {
    throw new Error("trigger_topics_min_4");
  }

  const errorType = input.errorType ?? episode?.errorType;
  const name = (input.name ?? "").trim() || inferRuleName(scope, action);
  const ruleKey = resolveSiteRuleKey(input, episode, scope, action);
  return {
    ruleKey,
    name,
    scope,
    trigger,
    action,
    ...(input.exception?.trim() ? { exception: input.exception.trim() } : {}),
    ...(input.wrongPattern?.trim() ? { wrongPattern: input.wrongPattern.trim() } : {}),
    ...(input.positiveExample?.trim() ? { positiveExample: input.positiveExample.trim() } : {}),
    ...(input.negativeExample?.trim() ? { negativeExample: input.negativeExample.trim() } : {}),
    triggerTopics,
    ...(input.brickClasses?.length ? { brickClasses: input.brickClasses } : episode?.relatedBrickClasses?.length ? { brickClasses: episode.relatedBrickClasses } : {}),
    ...(input.systems?.length ? { systems: input.systems } : episode?.relatedSystems?.length ? { systems: episode.relatedSystems } : {}),
    ...(input.equipment?.length ? { equipment: input.equipment } : episode?.relatedEntities?.length ? { equipment: episode.relatedEntities } : {}),
    ...(errorType ? { errorType } : {}),
    ...(input.sourceFeedback?.trim()
      ? { sourceFeedback: input.sourceFeedback.trim() }
      : episode
        ? { sourceFeedback: `${episode.userCorrection.slice(0, 200)}` }
        : {}),
    confidence: input.confidence ?? 0.85,
    status: input.status ?? "approved"
  };
}

export function isRetrievableUserRule(rule: ProjectGroundingRule): boolean {
  return rule.source === "user" && (rule.status ?? "approved") === "approved" && !rule.content.includes("[Playbook:");
}

export function extractQueryContext(message: string): {
  entities: string[];
  intent: "running_status" | "point_query" | "trend" | "fault" | "other";
} {
  const lowered = message.toLowerCase();
  const entities = new Set<string>();
  for (const match of message.matchAll(/\b(WCC[_-]?\d+|AHU[_-]?\d*|VAV[_-]?\d*|CHWST?|chiller\s*plant)\b/gi)) {
    entities.add(match[1]!.toUpperCase().replace(/\s+/g, "_"));
  }
  if (/冷机|chiller/i.test(message)) {
    entities.add("WCC");
    entities.add("CHILLER_PLANT");
  }

  let intent: "running_status" | "point_query" | "trend" | "fault" | "other" = "other";
  if (/running|on\/off|operating|situation|运行|开机|哪几台|how many.*chiller/i.test(lowered)) {
    intent = "running_status";
  } else if (/trend|history|历史|过去|last \d+ (hour|day)/i.test(lowered)) {
    intent = "trend";
  } else if (/fault|alarm|故障|异常/i.test(lowered)) {
    intent = "fault";
  } else if (/temperature|temp|point|点位|sensor|supply air/i.test(lowered)) {
    intent = "point_query";
  }

  return { entities: [...entities], intent };
}

function inferRuleKeyFromStoredRule(rule: ProjectGroundingRule): string {
  if (rule.ruleKey?.trim()) {
    return rule.ruleKey.trim();
  }
  if (rule.errorType && SITE_RULE_TEMPLATE_GUIDES[rule.errorType]) {
    return rule.errorType;
  }
  const haystack = `${rule.content} ${rule.scope ?? ""} ${rule.action ?? ""}`;
  if (/chiller|running|TLKW|Run_Status|冷机|运行/i.test(haystack)) {
    return "wrong_running_state";
  }
  if (rule.scope && rule.action) {
    return stableRuleKey(rule.scope, rule.action, rule.errorType);
  }
  return rule.id;
}

export function legacyRuleToStructured(rule: ProjectGroundingRule): ProjectGroundingRule {
  if (rule.scope && rule.action && rule.triggerTopics?.length) {
    return {
      ...rule,
      name: rule.name?.trim() ? rule.name : inferRuleName(rule.scope, rule.action),
      ruleKey: inferRuleKeyFromStoredRule(rule)
    };
  }

  const scope = rule.scope ?? "general site judgment";
  const action = rule.action ?? rule.content;
  const isRunningRule = /chiller|running|TLKW|Run_Status|冷机|运行/i.test(`${rule.content} ${scope} ${action}`);
  return {
    ...rule,
    name: rule.name ?? inferRuleName(scope, action),
    ruleKey: inferRuleKeyFromStoredRule(rule),
    scope: rule.scope ?? (isRunningRule ? "chiller plant / running-state queries" : scope),
    trigger: rule.trigger ?? "When user asks a related site question",
    action,
    triggerTopics: rule.triggerTopics ?? [],
    ...(isRunningRule && !rule.errorType ? { errorType: "wrong_running_state" as const } : {}),
    status: rule.status ?? "approved",
    confidence: rule.confidence ?? 0.85
  };
}
