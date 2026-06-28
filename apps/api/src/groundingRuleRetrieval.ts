import type { GroundingRuleIndex } from "./groundingRuleIndex.js";
import { tokenizeForFts } from "./groundingRuleIndex.js";
import type { ProjectGroundingRule } from "./projectGrounding.js";
import { extractQueryContext, isRetrievableUserRule } from "./projectRules.js";

const RRF_K = 60;
const SCORE_THRESHOLD = 0.012;
const FTS_TOP_K = 20;
const DENSE_TOP_K = 20;
const DEFAULT_MAX_RESULTS = 5;
const MIN_MAX_RESULTS = 3;
const MAX_MAX_RESULTS = 5;

const EXACT_ID_BOOST_PER_HIT = 0.03;
const EXACT_ID_BOOST_CAP = 2;
const METADATA_BOOST_PER_OVERLAP = 0.01;
const METADATA_BOOST_CAP = 3;
const CONFIDENCE_BOOST_MAX = 0.012;
const PRIORITY_BOOST_MAX = 0.012;

const STRONG_FTS_BM25_THRESHOLD = -8;

export interface RuleScoreBreakdown {
  ruleId: string;
  rrf: number;
  exactBoost: number;
  metadataBoost: number;
  confidenceBoost: number;
  priorityBoost: number;
  total: number;
}

export interface GroundingRetrievalDiagnostics {
  mode: "hybrid" | "hybrid_skip_dense" | "topic_fallback" | "skipped_low_signal";
  ftsHitCount: number;
  denseHitCount: number;
  skippedDense: boolean;
  skipReason?: string;
  selectedRuleIds: string[];
  scoreBreakdown: RuleScoreBreakdown[];
}

export interface GroundingRetrievalResult {
  alwaysOn: ProjectGroundingRule[];
  retrieved: ProjectGroundingRule[];
  scores: Record<string, number>;
  diagnostics: GroundingRetrievalDiagnostics;
}

export interface GroundingRetrievalConfig {
  skipDense: boolean;
  maxResults: number;
  debug: boolean;
}

let cachedConfig: GroundingRetrievalConfig | null = null;

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }
  return defaultValue;
}

export function resolveGroundingRetrievalConfig(env: NodeJS.ProcessEnv = process.env): GroundingRetrievalConfig {
  if (cachedConfig) {
    return cachedConfig;
  }
  const maxParsed = Number.parseInt(env.RULE_RETRIEVAL_MAX_RESULTS ?? "", 10);
  const maxResults = Number.isFinite(maxParsed)
    ? Math.min(MAX_MAX_RESULTS, Math.max(MIN_MAX_RESULTS, maxParsed))
    : DEFAULT_MAX_RESULTS;
  cachedConfig = {
    skipDense: parseBooleanEnv(env.RULE_RETRIEVAL_SKIP_DENSE, false),
    maxResults,
    debug: parseBooleanEnv(env.RULE_RETRIEVAL_DEBUG, false)
  };
  return cachedConfig;
}

export function resetGroundingRetrievalConfigForTests(): void {
  cachedConfig = null;
}

function isOperatorRule(rule: ProjectGroundingRule): boolean {
  return (rule.source === "operator" || rule.source === "agent" || rule.source === "seed") && !isPlaybookRule(rule);
}

function isPlaybookRule(rule: ProjectGroundingRule): boolean {
  return rule.source === "playbook" || rule.content.includes("[Playbook:");
}

function emptyDiagnostics(): GroundingRetrievalDiagnostics {
  return {
    mode: "hybrid",
    ftsHitCount: 0,
    denseHitCount: 0,
    skippedDense: false,
    selectedRuleIds: [],
    scoreBreakdown: []
  };
}

const LOW_SIGNAL_CHAT_TOKENS = new Set([
  "hello",
  "hi",
  "hey",
  "yo",
  "thanks",
  "thank",
  "ok",
  "okay",
  "yes",
  "no",
  "sure",
  "bye"
]);

const LOW_SIGNAL_CHAT_PATTERNS = [
  /^(hi|hello|hey|yo|thanks?|thank you|ok|okay|yes|no|sure|bye)[\s!.?]*$/i,
  /^(你好|您好|嗨|哈喽|谢谢|多谢|好的|好|行|嗯|拜拜)[！。,.，\s]*$/u
];

export function alwaysOnGroundingRules(allRules: ProjectGroundingRule[]): ProjectGroundingRule[] {
  return allRules.filter((rule) => isOperatorRule(rule) || isPlaybookRule(rule));
}

export function shouldAttemptGroundingRuleRetrieval(userMessage: string): boolean {
  const trimmed = userMessage.trim();
  if (!trimmed) {
    return false;
  }
  if (LOW_SIGNAL_CHAT_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return false;
  }
  const context = extractQueryContext(trimmed);
  const exactIds = extractExactIdentifiers(trimmed, context.entities);
  if (context.intent !== "other" || context.entities.length > 0 || exactIds.size > 0) {
    return true;
  }
  const tokens = tokenizeForFts(trimmed);
  if (tokens.length === 0) {
    return false;
  }
  if (tokens.every((token) => LOW_SIGNAL_CHAT_TOKENS.has(token))) {
    return false;
  }
  return tokens.length >= 2;
}

function lowSignalDiagnostics(): GroundingRetrievalDiagnostics {
  return {
    mode: "skipped_low_signal",
    ftsHitCount: 0,
    denseHitCount: 0,
    skippedDense: true,
    skipReason: "low_signal_message",
    selectedRuleIds: [],
    scoreBreakdown: []
  };
}

function metadataOverlapCount(
  entities: string[],
  metadata: { systems: string[]; equipment: string[]; brickClasses: string[] } | null
): number {
  if (!metadata || entities.length === 0) {
    return 0;
  }
  const normalizedEntities = entities.map((entity) => entity.toLowerCase());
  const haystack = [...metadata.systems, ...metadata.equipment, ...metadata.brickClasses]
    .map((item) => item.toLowerCase())
    .flatMap((item) => item.split(/[\s/_-]+/))
    .filter(Boolean);
  let overlap = 0;
  for (const entity of normalizedEntities) {
    if (haystack.some((token) => token.includes(entity) || entity.includes(token))) {
      overlap += 1;
    }
  }
  return overlap;
}

function buildRetrievalQuery(userMessage: string): string {
  const context = extractQueryContext(userMessage);
  const intentHints: Record<string, string> = {
    running_status: "chiller running operating status run_status TLKW plant situation",
    point_query: "point sensor reading value",
    trend: "trend history time range",
    fault: "fault alarm abnormal",
    other: ""
  };
  return [
    ...tokenizeForFts(userMessage),
    ...context.entities.map((entity) => entity.toLowerCase()),
    ...tokenizeForFts(intentHints[context.intent] ?? "")
  ]
    .filter(Boolean)
    .join(" ");
}

export function extractExactIdentifiers(userMessage: string, entities: string[]): Set<string> {
  const identifiers = new Set<string>();
  const patterns = [
    /\bWCC[_-]?\{?\d+[_-]?\d*\}?[_-]?TLKW\b/gi,
    /\bWCC[_-]?\{?\d+[_-]?\d*\}?\b/gi,
    /\bTLKW\b/gi,
    /\bRun[_-]?Status\b/gi,
    /\bground_\d+\b/gi
  ];
  for (const pattern of patterns) {
    for (const match of userMessage.matchAll(pattern)) {
      identifiers.add(match[0]!.toLowerCase());
    }
  }
  for (const entity of entities) {
    const normalized = entity.trim().toLowerCase();
    if (normalized.length >= 2) {
      identifiers.add(normalized);
    }
  }
  return identifiers;
}

function countExactIdentifierHits(rule: ProjectGroundingRule, exactIds: Set<string>): number {
  if (exactIds.size === 0) {
    return 0;
  }
  const haystack = [
    rule.content,
    rule.name,
    rule.scope,
    rule.trigger,
    rule.action,
    rule.wrongPattern,
    ...(rule.equipment ?? []),
    ...(rule.systems ?? []),
    ...(rule.brickClasses ?? []),
    ...(rule.triggerTopics ?? [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  let hits = 0;
  for (const id of exactIds) {
    if (haystack.includes(id)) {
      hits += 1;
    }
  }
  return hits;
}

function computeExactBoost(rule: ProjectGroundingRule, exactIds: Set<string>): number {
  const hits = Math.min(EXACT_ID_BOOST_CAP, countExactIdentifierHits(rule, exactIds));
  return hits * EXACT_ID_BOOST_PER_HIT;
}

function computeMetadataBoost(
  ruleId: string,
  entities: string[],
  index: GroundingRuleIndex
): number {
  const metadata = index.getMetadata(ruleId);
  const overlap = Math.min(METADATA_BOOST_CAP, metadataOverlapCount(entities, metadata));
  return overlap * METADATA_BOOST_PER_OVERLAP;
}

function computeConfidenceBoost(rule: ProjectGroundingRule | undefined): number {
  if (!rule) {
    return 0;
  }
  const confidence = rule.confidence ?? 0.5;
  return Math.min(CONFIDENCE_BOOST_MAX, Math.max(0, confidence - 0.5) * 0.02);
}

function computePriorityBoost(rule: ProjectGroundingRule | undefined): number {
  if (!rule) {
    return 0;
  }
  const priority = (rule as ProjectGroundingRule & { priority?: number }).priority ?? 50;
  return Math.min(PRIORITY_BOOST_MAX, (priority / 100) * 0.01);
}

function topicKeywordScore(rule: ProjectGroundingRule, message: string): number {
  const lowered = message.toLowerCase();
  const topics = rule.triggerTopics ?? [];
  let score = 0;
  for (const topic of topics) {
    const normalized = topic.toLowerCase().trim();
    if (!normalized) {
      continue;
    }
    if (normalized.length >= 4 && lowered.includes(normalized)) {
      score += 3;
      continue;
    }
    for (const word of tokenizeForFts(normalized)) {
      if (word.length >= 4 && lowered.includes(word)) {
        score += 1;
      }
    }
  }
  return score;
}

function addRrf(fusedScores: Map<string, number>, ruleId: string, rank: number): void {
  const increment = 1 / (RRF_K + rank);
  fusedScores.set(ruleId, (fusedScores.get(ruleId) ?? 0) + increment);
}

function shouldSkipDense(
  skipDenseEnabled: boolean,
  ftsHits: Array<{ score: number }>,
  exactIds: Set<string>
): { skip: boolean; reason?: string } {
  if (!skipDenseEnabled) {
    return { skip: false };
  }
  const strongFts = ftsHits.length > 0 && ftsHits[0]!.score <= STRONG_FTS_BM25_THRESHOLD;
  if (exactIds.size > 0 && strongFts) {
    return { skip: true, reason: "exact_id_and_strong_fts" };
  }
  return { skip: false };
}

function logDiagnostics(diagnostics: GroundingRetrievalDiagnostics, debug: boolean): void {
  if (!debug) {
    return;
  }
  console.error("[rule-retrieval]", JSON.stringify(diagnostics));
}

export async function retrieveGroundingRules(
  index: GroundingRuleIndex,
  projectId: string,
  userMessage: string,
  allRules: ProjectGroundingRule[]
): Promise<GroundingRetrievalResult> {
  const config = resolveGroundingRetrievalConfig();
  const alwaysOn = alwaysOnGroundingRules(allRules);
  if (!shouldAttemptGroundingRuleRetrieval(userMessage)) {
    const diagnostics = lowSignalDiagnostics();
    logDiagnostics(diagnostics, config.debug);
    return { alwaysOn, retrieved: [], scores: {}, diagnostics };
  }
  const retrievable = allRules.filter((rule) => isRetrievableUserRule(rule));
  if (retrievable.length === 0) {
    const diagnostics = emptyDiagnostics();
    logDiagnostics(diagnostics, config.debug);
    return { alwaysOn, retrieved: [], scores: {}, diagnostics };
  }

  const query = buildRetrievalQuery(userMessage);
  const context = extractQueryContext(userMessage);
  const exactIds = extractExactIdentifiers(userMessage, context.entities);
  const ruleById = new Map(retrievable.map((rule) => [rule.id, rule]));

  const ftsHits = index.searchFts(projectId, query, FTS_TOP_K);
  const skipDecision = shouldSkipDense(config.skipDense, ftsHits, exactIds);
  let denseHits: Awaited<ReturnType<GroundingRuleIndex["searchDense"]>> = [];
  if (!skipDecision.skip) {
    denseHits = await index.searchDense(projectId, query, DENSE_TOP_K);
  }

  const fusedScores = new Map<string, number>();
  for (const hit of ftsHits) {
    addRrf(fusedScores, hit.ruleId, hit.rank);
  }
  for (const hit of denseHits) {
    addRrf(fusedScores, hit.ruleId, hit.rank);
  }

  let mode: GroundingRetrievalDiagnostics["mode"] = skipDecision.skip ? "hybrid_skip_dense" : "hybrid";

  if (fusedScores.size === 0) {
    mode = "topic_fallback";
    for (const rule of retrievable) {
      const keywordScore = topicKeywordScore(rule, userMessage);
      if (keywordScore > 0) {
        fusedScores.set(rule.id, keywordScore / 100);
      }
    }
  }

  const scored = [...fusedScores.entries()]
    .map(([ruleId, rrfScore]) => {
      const rule = ruleById.get(ruleId);
      const exactBoost = computeExactBoost(rule ?? { id: ruleId, projectId, content: "", source: "user", createdAt: "" }, exactIds);
      const metadataBoost = computeMetadataBoost(ruleId, context.entities, index);
      const confidenceBoost = computeConfidenceBoost(rule);
      const priorityBoost = computePriorityBoost(rule);
      const total = rrfScore + exactBoost + metadataBoost + confidenceBoost + priorityBoost;
      const breakdown: RuleScoreBreakdown = {
        ruleId,
        rrf: rrfScore,
        exactBoost,
        metadataBoost,
        confidenceBoost,
        priorityBoost,
        total
      };
      return { ruleId, score: total, breakdown };
    })
    .filter((entry) => entry.score >= SCORE_THRESHOLD)
    .sort((left, right) => right.score - left.score)
    .slice(0, config.maxResults);

  const retrieved = scored
    .map((entry) => ruleById.get(entry.ruleId))
    .filter((rule): rule is ProjectGroundingRule => rule !== undefined);

  const scores = Object.fromEntries(scored.map((entry) => [entry.ruleId, entry.score]));
  const diagnostics: GroundingRetrievalDiagnostics = {
    mode,
    ftsHitCount: ftsHits.length,
    denseHitCount: denseHits.length,
    skippedDense: skipDecision.skip,
    selectedRuleIds: scored.map((entry) => entry.ruleId),
    scoreBreakdown: scored.map((entry) => entry.breakdown),
    ...(skipDecision.reason ? { skipReason: skipDecision.reason } : {})
  };

  logDiagnostics(diagnostics, config.debug);
  return { alwaysOn, retrieved, scores, diagnostics };
}

export function selectGroundingForTurn(
  allRules: ProjectGroundingRule[],
  retrieval: GroundingRetrievalResult
): ProjectGroundingRule[] {
  return [...retrieval.alwaysOn, ...retrieval.retrieved];
}
