import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type DerivedMetricSourceType = "raw_point" | "metric";

export interface DerivedMetricDependencyInput {
  role: string;
  sourceType?: DerivedMetricSourceType;
  sourceId: string;
  pointName?: string;
  objectRef?: string;
  unit?: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface DerivedMetricRegisterInput {
  projectId: string;
  metricKey: string;
  entityId: string;
  formula: string;
  dependencies: DerivedMetricDependencyInput[];
  entityName?: string;
  displayName?: string;
  unit?: string;
  metricType?: string;
  formulaVersion?: string;
  formulaDescription?: string;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

export interface DerivedMetricRecordSampleInput {
  instanceId: string;
  ts: string;
  valueNum?: number;
  valueText?: string;
  quality?: string;
  status?: string;
  calculationRunId?: string;
  sourceWindowStart?: string;
  sourceWindowEnd?: string;
  metadata?: Record<string, unknown>;
}

export interface DerivedMetricLookupInput {
  projectId: string;
  metricKey?: string;
  entityId?: string;
  query?: string;
  limit?: number;
}

export interface DerivedMetricDependency {
  dependencyId: string;
  instanceId: string;
  role: string;
  sourceType: DerivedMetricSourceType;
  sourceId: string;
  pointName?: string;
  objectRef?: string;
  unit?: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface DerivedMetricInstance {
  instanceId: string;
  projectId: string;
  definitionId: string;
  versionId: string;
  metricKey: string;
  metricType: string;
  entityId: string;
  entityName?: string;
  displayName: string;
  unit?: string;
  formulaVersion: string;
  formula: string;
  formulaDescription?: string;
  status: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
  dependencies: DerivedMetricDependency[];
}

export interface DerivedMetricSample {
  sampleId: string;
  instanceId: string;
  projectId: string;
  ts: string;
  valueNum?: number;
  valueText?: string;
  quality: string;
  status: string;
  formulaVersionId: string;
  calculationRunId?: string;
  sourceWindowStart?: string;
  sourceWindowEnd?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface DerivedMetricRegisterResult {
  created: boolean;
  instance: DerivedMetricInstance;
}

function stableId(prefix: string, parts: string[], length = 20): string {
  const hash = createHash("sha256")
    .update(parts.map((part) => part.trim().toLowerCase()).join("\u001f"))
    .digest("hex")
    .slice(0, length);
  return `${prefix}_${hash}`;
}

function trimRequired(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${name} is required`);
  }
  return trimmed;
}

function optional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function serializeMetadata(value: Record<string, unknown> | undefined): string | null {
  if (!value || Object.keys(value).length === 0) {
    return null;
  }
  return JSON.stringify(value);
}

function parseMetadata(value: string | null): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

interface InstanceRow {
  instance_id: string;
  project_id: string;
  definition_id: string;
  version_id: string;
  metric_key: string;
  metric_type: string;
  entity_id: string;
  entity_name: string | null;
  display_name: string;
  unit: string | null;
  formula_version: string;
  formula: string;
  formula_description: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  metadata_json: string | null;
}

interface DependencyRow {
  dependency_id: string;
  instance_id: string;
  role: string;
  source_type: DerivedMetricSourceType;
  source_id: string;
  point_name: string | null;
  object_ref: string | null;
  unit: string | null;
  label: string | null;
  metadata_json: string | null;
}

interface SampleRow {
  sample_id: string;
  instance_id: string;
  project_id: string;
  ts: string;
  value_num: number | null;
  value_text: string | null;
  quality: string;
  status: string;
  formula_version_id: string;
  calculation_run_id: string | null;
  source_window_start: string | null;
  source_window_end: string | null;
  metadata_json: string | null;
  created_at: string;
}

export class DerivedMetricStore {
  private readonly db: Database.Database;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.db = new Database(path.join(dataDir, "derived_metrics.db"));
    this.db.pragma("journal_mode = WAL");
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metric_definitions (
        definition_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        metric_key TEXT NOT NULL,
        display_name TEXT NOT NULL,
        metric_type TEXT NOT NULL,
        default_unit TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, metric_key)
      );

      CREATE TABLE IF NOT EXISTS metric_versions (
        version_id TEXT PRIMARY KEY,
        definition_id TEXT NOT NULL,
        version TEXT NOT NULL,
        formula TEXT NOT NULL,
        formula_description TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(definition_id, version),
        FOREIGN KEY(definition_id) REFERENCES metric_definitions(definition_id)
      );

      CREATE TABLE IF NOT EXISTS metric_instances (
        instance_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        definition_id TEXT NOT NULL,
        version_id TEXT NOT NULL,
        metric_key TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        entity_name TEXT,
        display_name TEXT NOT NULL,
        unit TEXT,
        formula_version TEXT,
        formula TEXT,
        formula_description TEXT,
        status TEXT NOT NULL,
        created_by TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, entity_id, metric_key),
        FOREIGN KEY(definition_id) REFERENCES metric_definitions(definition_id),
        FOREIGN KEY(version_id) REFERENCES metric_versions(version_id)
      );

      CREATE TABLE IF NOT EXISTS metric_dependencies (
        dependency_id TEXT PRIMARY KEY,
        instance_id TEXT NOT NULL,
        role TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        point_name TEXT,
        object_ref TEXT,
        unit TEXT,
        label TEXT,
        metadata_json TEXT,
        UNIQUE(instance_id, role, source_type, source_id),
        FOREIGN KEY(instance_id) REFERENCES metric_instances(instance_id)
      );

      CREATE TABLE IF NOT EXISTS metric_samples (
        sample_id TEXT PRIMARY KEY,
        instance_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        ts TEXT NOT NULL,
        value_num REAL,
        value_text TEXT,
        quality TEXT NOT NULL,
        status TEXT NOT NULL,
        formula_version_id TEXT NOT NULL,
        calculation_run_id TEXT,
        source_window_start TEXT,
        source_window_end TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(instance_id, ts, calculation_run_id),
        FOREIGN KEY(instance_id) REFERENCES metric_instances(instance_id)
      );

      CREATE TABLE IF NOT EXISTS metric_latest (
        instance_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        ts TEXT NOT NULL,
        value_num REAL,
        value_text TEXT,
        quality TEXT NOT NULL,
        status TEXT NOT NULL,
        formula_version_id TEXT NOT NULL,
        calculation_run_id TEXT,
        metadata_json TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(instance_id) REFERENCES metric_instances(instance_id)
      );

      CREATE INDEX IF NOT EXISTS idx_metric_instances_lookup
        ON metric_instances(project_id, metric_key, entity_id);
      CREATE INDEX IF NOT EXISTS idx_metric_samples_instance_ts
        ON metric_samples(instance_id, ts);
      CREATE INDEX IF NOT EXISTS idx_metric_latest_project
        ON metric_latest(project_id, ts);
    `);
    this.ensureMetricInstanceLineageColumns();
  }

  private ensureMetricInstanceLineageColumns(): void {
    const columns = new Set(
      (this.db.prepare("PRAGMA table_info(metric_instances)").all() as Array<{ name: string }>)
        .map((column) => column.name)
    );
    const requiredColumns: Array<[name: string, type: string]> = [
      ["formula_version", "TEXT"],
      ["formula", "TEXT"],
      ["formula_description", "TEXT"]
    ];
    for (const [name, type] of requiredColumns) {
      if (!columns.has(name)) {
        this.db.prepare(`ALTER TABLE metric_instances ADD COLUMN ${name} ${type}`).run();
      }
    }

    // Existing databases stored formula lineage only on the shared metric version.
    // Snapshot it onto each instance so later entities cannot overwrite it.
    this.db.exec(`
      UPDATE metric_instances
      SET
        formula_version = COALESCE(
          formula_version,
          (SELECT v.version FROM metric_versions v WHERE v.version_id = metric_instances.version_id)
        ),
        formula = COALESCE(
          formula,
          (SELECT v.formula FROM metric_versions v WHERE v.version_id = metric_instances.version_id)
        ),
        formula_description = CASE
          WHEN formula IS NULL THEN COALESCE(
            formula_description,
            (SELECT v.formula_description FROM metric_versions v WHERE v.version_id = metric_instances.version_id)
          )
          ELSE formula_description
        END
      WHERE formula_version IS NULL
         OR formula IS NULL
    `);
  }

  registerMetric(input: DerivedMetricRegisterInput): DerivedMetricRegisterResult {
    const projectId = trimRequired(input.projectId, "projectId");
    const metricKey = trimRequired(input.metricKey, "metricKey").toLowerCase();
    const entityId = trimRequired(input.entityId, "entityId");
    const formula = trimRequired(input.formula, "formula");
    if (!Array.isArray(input.dependencies) || input.dependencies.length === 0) {
      throw new Error("dependencies are required");
    }

    const existing = this.findInstance(projectId, metricKey, entityId);
    if (existing) {
      return { created: false, instance: existing };
    }

    const now = new Date().toISOString();
    let definitionId = stableId("mdef", [projectId, metricKey], 18);
    const version = optional(input.formulaVersion) ?? "v1";
    let versionId = stableId("mver", [definitionId, version], 18);
    const instanceId = stableId("minst", [projectId, entityId, metricKey], 22);
    const metricType = optional(input.metricType) ?? "derived";
    const displayName = optional(input.displayName) ?? `${entityId} ${metricKey}`;
    const metadataJson = serializeMetadata(input.metadata);

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO metric_definitions (
          definition_id, project_id, metric_key, display_name, metric_type, default_unit, metadata_json, created_at, updated_at
        ) VALUES (
          @definition_id, @project_id, @metric_key, @display_name, @metric_type, @default_unit, @metadata_json, @created_at, @updated_at
        )
        ON CONFLICT(project_id, metric_key) DO UPDATE SET
          display_name = excluded.display_name,
          metric_type = excluded.metric_type,
          default_unit = COALESCE(excluded.default_unit, metric_definitions.default_unit),
          metadata_json = COALESCE(excluded.metadata_json, metric_definitions.metadata_json),
          updated_at = excluded.updated_at
      `).run({
        definition_id: definitionId,
        project_id: projectId,
        metric_key: metricKey,
        display_name: displayName,
        metric_type: metricType,
        default_unit: optional(input.unit),
        metadata_json: metadataJson,
        created_at: now,
        updated_at: now
      });
      const definitionRow = this.db.prepare(`
        SELECT definition_id FROM metric_definitions
        WHERE project_id = ? AND metric_key = ?
      `).get(projectId, metricKey) as { definition_id: string } | undefined;
      definitionId = definitionRow?.definition_id ?? definitionId;
      versionId = stableId("mver", [definitionId, version], 18);

      this.db.prepare(`
        INSERT INTO metric_versions (
          version_id, definition_id, version, formula, formula_description, metadata_json, created_at
        ) VALUES (
          @version_id, @definition_id, @version, @formula, @formula_description, @metadata_json, @created_at
        )
        ON CONFLICT(definition_id, version) DO UPDATE SET
          formula = excluded.formula,
          formula_description = COALESCE(excluded.formula_description, metric_versions.formula_description),
          metadata_json = COALESCE(excluded.metadata_json, metric_versions.metadata_json)
      `).run({
        version_id: versionId,
        definition_id: definitionId,
        version,
        formula,
        formula_description: optional(input.formulaDescription),
        metadata_json: metadataJson,
        created_at: now
      });
      const versionRow = this.db.prepare(`
        SELECT version_id FROM metric_versions
        WHERE definition_id = ? AND version = ?
      `).get(definitionId, version) as { version_id: string } | undefined;
      versionId = versionRow?.version_id ?? versionId;

      this.db.prepare(`
        INSERT INTO metric_instances (
          instance_id, project_id, definition_id, version_id, metric_key, entity_id, entity_name,
          display_name, unit, formula_version, formula, formula_description, status, created_by,
          metadata_json, created_at, updated_at
        ) VALUES (
          @instance_id, @project_id, @definition_id, @version_id, @metric_key, @entity_id, @entity_name,
          @display_name, @unit, @formula_version, @formula, @formula_description, @status, @created_by,
          @metadata_json, @created_at, @updated_at
        )
      `).run({
        instance_id: instanceId,
        project_id: projectId,
        definition_id: definitionId,
        version_id: versionId,
        metric_key: metricKey,
        entity_id: entityId,
        entity_name: optional(input.entityName),
        display_name: displayName,
        unit: optional(input.unit),
        formula_version: version,
        formula,
        formula_description: optional(input.formulaDescription),
        status: "active",
        created_by: optional(input.createdBy),
        metadata_json: metadataJson,
        created_at: now,
        updated_at: now
      });

      for (const dependency of input.dependencies) {
        const role = trimRequired(dependency.role, "dependency.role");
        const sourceId = trimRequired(dependency.sourceId, "dependency.sourceId");
        const sourceType = dependency.sourceType ?? "raw_point";
        const dependencyId = stableId("mdep", [instanceId, role, sourceType, sourceId], 22);
        this.db.prepare(`
          INSERT OR IGNORE INTO metric_dependencies (
            dependency_id, instance_id, role, source_type, source_id, point_name, object_ref, unit, label, metadata_json
          ) VALUES (
            @dependency_id, @instance_id, @role, @source_type, @source_id, @point_name, @object_ref, @unit, @label, @metadata_json
          )
        `).run({
          dependency_id: dependencyId,
          instance_id: instanceId,
          role,
          source_type: sourceType,
          source_id: sourceId,
          point_name: optional(dependency.pointName),
          object_ref: optional(dependency.objectRef),
          unit: optional(dependency.unit),
          label: optional(dependency.label),
          metadata_json: serializeMetadata(dependency.metadata)
        });
      }
    });
    tx();

    const instance = this.getInstance(instanceId);
    if (!instance) {
      throw new Error("derived_metric_register_failed");
    }
    return { created: true, instance };
  }

  lookup(input: DerivedMetricLookupInput): DerivedMetricInstance[] {
    const projectId = trimRequired(input.projectId, "projectId");
    const limit = Math.min(Math.max(1, Math.trunc(input.limit ?? 20)), 100);
    const clauses = ["i.project_id = @project_id"];
    const params: Record<string, string | number> = { project_id: projectId, limit };
    if (input.metricKey?.trim()) {
      clauses.push("i.metric_key = @metric_key");
      params.metric_key = input.metricKey.trim().toLowerCase();
    }
    if (input.entityId?.trim()) {
      clauses.push("i.entity_id = @entity_id");
      params.entity_id = input.entityId.trim();
    }
    if (input.query?.trim()) {
      clauses.push("(i.metric_key LIKE @query OR i.entity_id LIKE @query OR i.display_name LIKE @query OR COALESCE(i.entity_name, '') LIKE @query)");
      params.query = `%${input.query.trim()}%`;
    }

    const rows = this.db.prepare(`
      ${this.instanceSelectSql()}
      WHERE ${clauses.join(" AND ")}
      ORDER BY i.updated_at DESC
      LIMIT @limit
    `).all(params) as InstanceRow[];

    return rows.map((row) => this.instanceFromRow(row));
  }

  getInstance(instanceId: string): DerivedMetricInstance | null {
    const row = this.db.prepare(`
      ${this.instanceSelectSql()}
      WHERE i.instance_id = ?
    `).get(instanceId) as InstanceRow | undefined;
    return row ? this.instanceFromRow(row) : null;
  }

  recordSample(input: DerivedMetricRecordSampleInput): DerivedMetricSample {
    const instanceId = trimRequired(input.instanceId, "instanceId");
    const ts = trimRequired(input.ts, "ts");
    const instance = this.getInstance(instanceId);
    if (!instance) {
      throw new Error("derived_metric_instance_not_found");
    }
    const hasNumeric = typeof input.valueNum === "number" && Number.isFinite(input.valueNum);
    const valueText = optional(input.valueText);
    if (!hasNumeric && !valueText) {
      throw new Error("valueNum or valueText is required");
    }
    const calculationRunId = optional(input.calculationRunId) ?? "manual";
    const sampleId = stableId("msamp", [instanceId, ts, calculationRunId], 24);
    const now = new Date().toISOString();
    const sample = {
      sample_id: sampleId,
      instance_id: instanceId,
      project_id: instance.projectId,
      ts,
      value_num: hasNumeric ? input.valueNum! : null,
      value_text: valueText,
      quality: optional(input.quality) ?? "good",
      status: optional(input.status) ?? "ok",
      formula_version_id: instance.versionId,
      calculation_run_id: calculationRunId,
      source_window_start: optional(input.sourceWindowStart),
      source_window_end: optional(input.sourceWindowEnd),
      metadata_json: serializeMetadata(input.metadata),
      created_at: now
    };

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO metric_samples (
          sample_id, instance_id, project_id, ts, value_num, value_text, quality, status,
          formula_version_id, calculation_run_id, source_window_start, source_window_end,
          metadata_json, created_at
        ) VALUES (
          @sample_id, @instance_id, @project_id, @ts, @value_num, @value_text, @quality, @status,
          @formula_version_id, @calculation_run_id, @source_window_start, @source_window_end,
          @metadata_json, @created_at
        )
        ON CONFLICT(instance_id, ts, calculation_run_id) DO UPDATE SET
          value_num = excluded.value_num,
          value_text = excluded.value_text,
          quality = excluded.quality,
          status = excluded.status,
          formula_version_id = excluded.formula_version_id,
          source_window_start = excluded.source_window_start,
          source_window_end = excluded.source_window_end,
          metadata_json = excluded.metadata_json
      `).run(sample);

      this.db.prepare(`
        INSERT INTO metric_latest (
          instance_id, project_id, ts, value_num, value_text, quality, status,
          formula_version_id, calculation_run_id, metadata_json, updated_at
        ) VALUES (
          @instance_id, @project_id, @ts, @value_num, @value_text, @quality, @status,
          @formula_version_id, @calculation_run_id, @metadata_json, @updated_at
        )
        ON CONFLICT(instance_id) DO UPDATE SET
          project_id = excluded.project_id,
          ts = excluded.ts,
          value_num = excluded.value_num,
          value_text = excluded.value_text,
          quality = excluded.quality,
          status = excluded.status,
          formula_version_id = excluded.formula_version_id,
          calculation_run_id = excluded.calculation_run_id,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at
        WHERE excluded.ts >= metric_latest.ts
      `).run({ ...sample, updated_at: now });
    });
    tx();

    return this.sampleFromRow(sample);
  }

  readLatest(instanceId: string): DerivedMetricSample | null {
    const row = this.db.prepare(`
      SELECT
        'latest_' || instance_id AS sample_id,
        instance_id, project_id, ts, value_num, value_text, quality, status,
        formula_version_id, calculation_run_id, NULL AS source_window_start, NULL AS source_window_end,
        metadata_json, updated_at AS created_at
      FROM metric_latest
      WHERE instance_id = ?
    `).get(instanceId) as SampleRow | undefined;
    return row ? this.sampleFromRow(row) : null;
  }

  readHistory(instanceId: string, options: { from?: string; to?: string; limit?: number; order?: "asc" | "desc" } = {}): DerivedMetricSample[] {
    const clauses = ["instance_id = @instance_id"];
    const params: Record<string, string | number> = {
      instance_id: instanceId,
      limit: Math.min(Math.max(1, Math.trunc(options.limit ?? 720)), 20_000)
    };
    if (options.from?.trim()) {
      clauses.push("ts >= @from");
      params.from = options.from.trim();
    }
    if (options.to?.trim()) {
      clauses.push("ts <= @to");
      params.to = options.to.trim();
    }
    const order = options.order === "desc" ? "DESC" : "ASC";
    const rows = this.db.prepare(`
      SELECT * FROM metric_samples
      WHERE ${clauses.join(" AND ")}
      ORDER BY ts ${order}
      LIMIT @limit
    `).all(params) as SampleRow[];
    return rows.map((row) => this.sampleFromRow(row));
  }

  private findInstance(projectId: string, metricKey: string, entityId: string): DerivedMetricInstance | null {
    const row = this.db.prepare(`
      ${this.instanceSelectSql()}
      WHERE i.project_id = @project_id AND i.metric_key = @metric_key AND i.entity_id = @entity_id
    `).get({ project_id: projectId, metric_key: metricKey, entity_id: entityId }) as InstanceRow | undefined;
    return row ? this.instanceFromRow(row) : null;
  }

  private instanceSelectSql(): string {
    return `
      SELECT
        i.instance_id, i.project_id, i.definition_id, i.version_id, i.metric_key,
        d.metric_type, i.entity_id, i.entity_name, i.display_name, i.unit,
        COALESCE(i.formula_version, v.version) AS formula_version,
        COALESCE(i.formula, v.formula) AS formula,
        COALESCE(i.formula_description, v.formula_description) AS formula_description,
        i.status, i.created_by, i.created_at, i.updated_at, i.metadata_json
      FROM metric_instances i
      JOIN metric_definitions d ON d.definition_id = i.definition_id
      JOIN metric_versions v ON v.version_id = i.version_id
    `;
  }

  private dependenciesForInstance(instanceId: string): DerivedMetricDependency[] {
    const rows = this.db.prepare(`
      SELECT * FROM metric_dependencies
      WHERE instance_id = ?
      ORDER BY role, source_id
    `).all(instanceId) as DependencyRow[];
    return rows.map((row) => {
      const dependency: DerivedMetricDependency = {
        dependencyId: row.dependency_id,
        instanceId: row.instance_id,
        role: row.role,
        sourceType: row.source_type,
        sourceId: row.source_id
      };
      if (row.point_name) dependency.pointName = row.point_name;
      if (row.object_ref) dependency.objectRef = row.object_ref;
      if (row.unit) dependency.unit = row.unit;
      if (row.label) dependency.label = row.label;
      const metadata = parseMetadata(row.metadata_json);
      if (metadata) dependency.metadata = metadata;
      return dependency;
    });
  }

  private instanceFromRow(row: InstanceRow): DerivedMetricInstance {
    const instance: DerivedMetricInstance = {
      instanceId: row.instance_id,
      projectId: row.project_id,
      definitionId: row.definition_id,
      versionId: row.version_id,
      metricKey: row.metric_key,
      metricType: row.metric_type,
      entityId: row.entity_id,
      displayName: row.display_name,
      formulaVersion: row.formula_version,
      formula: row.formula,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      dependencies: this.dependenciesForInstance(row.instance_id)
    };
    if (row.entity_name) instance.entityName = row.entity_name;
    if (row.unit) instance.unit = row.unit;
    if (row.formula_description) instance.formulaDescription = row.formula_description;
    if (row.created_by) instance.createdBy = row.created_by;
    const metadata = parseMetadata(row.metadata_json);
    if (metadata) instance.metadata = metadata;
    return instance;
  }

  private sampleFromRow(row: SampleRow): DerivedMetricSample {
    const sample: DerivedMetricSample = {
      sampleId: row.sample_id,
      instanceId: row.instance_id,
      projectId: row.project_id,
      ts: row.ts,
      quality: row.quality,
      status: row.status,
      formulaVersionId: row.formula_version_id,
      createdAt: row.created_at
    };
    if (typeof row.value_num === "number") sample.valueNum = row.value_num;
    if (row.value_text) sample.valueText = row.value_text;
    if (row.calculation_run_id) sample.calculationRunId = row.calculation_run_id;
    if (row.source_window_start) sample.sourceWindowStart = row.source_window_start;
    if (row.source_window_end) sample.sourceWindowEnd = row.source_window_end;
    const metadata = parseMetadata(row.metadata_json);
    if (metadata) sample.metadata = metadata;
    return sample;
  }
}
