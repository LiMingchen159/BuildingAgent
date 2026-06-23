import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  buildRetrievalCard,
  isRetrievableUserRule,
  legacyRuleToStructured,
  type ProjectRuleStatus
} from "./projectRules.js";
import type { ProjectGroundingRule } from "./projectGrounding.js";
import type { SeedStore } from "./seed.js";
import {
  cosineSimilarity,
  embeddingFromBlob,
  embeddingToBlob,
  type EmbeddingProvider
} from "./embeddingProvider.js";

export interface GroundingRuleSearchHit {
  ruleId: string;
  projectId: string;
  score: number;
  rank: number;
  source: "fts" | "dense";
}

const FTS_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by", "can", "could", "did", "do", "does",
  "for", "from", "had", "has", "have", "he", "her", "him", "his", "how", "i", "if", "in", "into", "is", "it", "its",
  "just", "me", "more", "most", "my", "no", "nor", "not", "of", "on", "or", "our", "she", "should", "so", "some",
  "than", "that", "the", "their", "them", "then", "there", "these", "they", "this", "those", "to", "too", "was",
  "we", "were", "what", "when", "where", "which", "who", "why", "will", "with", "would", "you", "your"
]);

export function tokenizeForFts(query: string): string[] {
  const tokens = new Set<string>();
  for (const match of query.matchAll(/[\p{L}\p{N}_]+/gu)) {
    const token = match[0]!.toLowerCase();
    if (token.length < 2 || FTS_STOPWORDS.has(token)) {
      continue;
    }
    tokens.add(token);
  }
  return [...tokens];
}

function escapeFtsQuery(query: string): string {
  const tokens = tokenizeForFts(query);
  if (tokens.length === 0) {
    return "";
  }
  return tokens.map((token) => `"${token.replace(/"/g, '""')}"`).join(" OR ");
}

export class GroundingRuleIndex {
  private readonly db: Database.Database;
  private readonly embeddingProvider: EmbeddingProvider;

  constructor(dataDir: string, embeddingProvider: EmbeddingProvider) {
    mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, "grounding_index.db");
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.embeddingProvider = embeddingProvider;
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS grounding_rules (
        rule_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        status TEXT NOT NULL,
        retrieval_card TEXT NOT NULL,
        systems TEXT,
        equipment TEXT,
        brick_classes TEXT,
        embedding_blob BLOB,
        updated_at TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS grounding_rules_fts USING fts5(
        project_id UNINDEXED,
        rule_id UNINDEXED,
        status UNINDEXED,
        retrieval_card,
        tokenize='unicode61'
      );

      CREATE INDEX IF NOT EXISTS idx_grounding_rules_project
        ON grounding_rules(project_id, status);
    `);
  }

  private upsertRuleSync(rule: ProjectGroundingRule, embeddingBlob: Buffer | null = null): ProjectGroundingRule {
    const normalized = legacyRuleToStructured(rule);
    const retrievalCard = buildRetrievalCard(normalized);
    const updatedAt = new Date().toISOString();

    const upsert = this.db.prepare(`
      INSERT INTO grounding_rules (
        rule_id, project_id, status, retrieval_card, systems, equipment, brick_classes, embedding_blob, updated_at
      ) VALUES (
        @rule_id, @project_id, @status, @retrieval_card, @systems, @equipment, @brick_classes, @embedding_blob, @updated_at
      )
      ON CONFLICT(rule_id) DO UPDATE SET
        project_id = excluded.project_id,
        status = excluded.status,
        retrieval_card = excluded.retrieval_card,
        systems = excluded.systems,
        equipment = excluded.equipment,
        brick_classes = excluded.brick_classes,
        embedding_blob = COALESCE(excluded.embedding_blob, grounding_rules.embedding_blob),
        updated_at = excluded.updated_at
    `);
    const deleteFts = this.db.prepare(`DELETE FROM grounding_rules_fts WHERE rule_id = ?`);
    const insertFts = this.db.prepare(`
      INSERT INTO grounding_rules_fts (project_id, rule_id, status, retrieval_card)
      VALUES (@project_id, @rule_id, @status, @retrieval_card)
    `);

    const transaction = this.db.transaction(() => {
      upsert.run({
        rule_id: normalized.id,
        project_id: normalized.projectId,
        status: normalized.status ?? "approved",
        retrieval_card: retrievalCard,
        systems: (normalized.systems ?? []).join("|"),
        equipment: (normalized.equipment ?? []).join("|"),
        brick_classes: (normalized.brickClasses ?? []).join("|"),
        embedding_blob: embeddingBlob,
        updated_at: updatedAt
      });
      deleteFts.run(normalized.id);
      insertFts.run({
        project_id: normalized.projectId,
        rule_id: normalized.id,
        status: normalized.status ?? "approved",
        retrieval_card: retrievalCard
      });
    });
    transaction();
    return normalized;
  }

  private async refreshEmbedding(rule: ProjectGroundingRule): Promise<void> {
    const normalized = legacyRuleToStructured(rule);
    const retrievalCard = buildRetrievalCard(normalized);
    const embedding = await this.embeddingProvider.embedText(retrievalCard);
    if (!embedding) {
      return;
    }
    this.db
      .prepare(`UPDATE grounding_rules SET embedding_blob = ?, updated_at = ? WHERE rule_id = ?`)
      .run(embeddingToBlob(embedding), new Date().toISOString(), normalized.id);
  }

  async upsertRule(rule: ProjectGroundingRule): Promise<void> {
    const normalized = legacyRuleToStructured(rule);
    if (!isRetrievableUserRule(normalized)) {
      this.removeRule(rule.id);
      return;
    }

    this.upsertRuleSync(normalized);
    await this.refreshEmbedding(normalized);
  }

  removeRule(ruleId: string): void {
    this.db.prepare(`DELETE FROM grounding_rules WHERE rule_id = ?`).run(ruleId);
    this.db.prepare(`DELETE FROM grounding_rules_fts WHERE rule_id = ?`).run(ruleId);
  }

  searchFts(projectId: string, query: string, limit = 10): GroundingRuleSearchHit[] {
    const escaped = escapeFtsQuery(query);
    if (!escaped) {
      return [];
    }
    const rows = this.db
      .prepare(
        `
        SELECT rule_id, project_id, bm25(grounding_rules_fts) AS score
        FROM grounding_rules_fts
        WHERE project_id = @project_id
          AND status = 'approved'
          AND retrieval_card MATCH @query
        ORDER BY score
        LIMIT @limit
      `
      )
      .all({ project_id: projectId, query: escaped, limit }) as Array<{
      rule_id: string;
      project_id: string;
      score: number;
    }>;

    return rows.map((row, index) => ({
      ruleId: row.rule_id,
      projectId: row.project_id,
      score: row.score,
      rank: index + 1,
      source: "fts" as const
    }));
  }

  async searchDense(projectId: string, query: string, limit = 10): Promise<GroundingRuleSearchHit[]> {
    const queryEmbedding = await this.embeddingProvider.embedText(query);
    if (!queryEmbedding) {
      return [];
    }

    const rows = this.db
      .prepare(
        `
        SELECT rule_id, project_id, embedding_blob
        FROM grounding_rules
        WHERE project_id = ? AND status = 'approved' AND embedding_blob IS NOT NULL
      `
      )
      .all(projectId) as Array<{
      rule_id: string;
      project_id: string;
      embedding_blob: Buffer | null;
    }>;

    const scored: GroundingRuleSearchHit[] = [];
    for (const row of rows) {
      const embedding = embeddingFromBlob(row.embedding_blob);
      if (!embedding) {
        continue;
      }
      scored.push({
        ruleId: row.rule_id,
        projectId: row.project_id,
        score: cosineSimilarity(queryEmbedding, embedding),
        rank: 0,
        source: "dense"
      });
    }
    scored.sort((left, right) => right.score - left.score);
    return scored.slice(0, limit).map((row, index) => ({ ...row, rank: index + 1 }));
  }

  getMetadata(ruleId: string): {
    systems: string[];
    equipment: string[];
    brickClasses: string[];
  } | null {
    const row = this.db
      .prepare(`SELECT systems, equipment, brick_classes FROM grounding_rules WHERE rule_id = ?`)
      .get(ruleId) as { systems: string | null; equipment: string | null; brick_classes: string | null } | undefined;
    if (!row) {
      return null;
    }
    const split = (value: string | null): string[] =>
      value
        ? value
            .split("|")
            .map((item) => item.trim())
            .filter(Boolean)
        : [];
    return {
      systems: split(row.systems),
      equipment: split(row.equipment),
      brickClasses: split(row.brick_classes)
    };
  }

  rebuildFromStore(store: SeedStore): void {
    this.db.exec(`DELETE FROM grounding_rules; DELETE FROM grounding_rules_fts;`);
    for (const [projectId, rules] of Object.entries(store.projectGroundingByProject ?? {})) {
      for (const rule of rules) {
        const normalized = legacyRuleToStructured({ ...rule, projectId });
        if (isRetrievableUserRule(normalized)) {
          this.upsertRuleSync(normalized);
          void this.refreshEmbedding(normalized);
        }
      }
    }
  }

  hasRule(ruleId: string): boolean {
    const row = this.db.prepare(`SELECT 1 FROM grounding_rules WHERE rule_id = ?`).get(ruleId);
    return Boolean(row);
  }

  ruleStatus(ruleId: string): ProjectRuleStatus | null {
    const row = this.db.prepare(`SELECT status FROM grounding_rules WHERE rule_id = ?`).get(ruleId) as
      | { status: string }
      | undefined;
    if (!row) {
      return null;
    }
    return row.status as ProjectRuleStatus;
  }
}
