import { fetchTimeseries, numericValue, type BmsTimeseriesRow } from "./bmsTimeseries.js";
import type {
  BmsConnectionTestResponse,
  BmsDiscoverPointsResponse,
  BmsIngestionJobStatusResponse,
  BmsIngestionResultsResponse,
  BmsMinimalIngestionRequest,
  BmsPointSummary,
  BmsSourcePayload,
  BmsSourceSummary
} from "./bmsTypes.js";

export interface BmsDatabaseBridgeOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  enteliBaseUrl?: string;
}

interface DbPointRow {
  id: number;
  object_ref: string;
  name: string;
  description?: string | null;
  api_path?: string | null;
  last_value?: string | null;
}


export class BmsDatabaseBridge {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly enteliBaseUrl: string;
  private readonly sources = new Map<string, { source: BmsSourceSummary; points: BmsPointSummary[] }>();
  private readonly jobs = new Map<string, { job: BmsIngestionJobStatusResponse; results: BmsIngestionResultsResponse }>();
  private sourceSequence = 0;
  private jobSequence = 0;

  constructor(options: BmsDatabaseBridgeOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.enteliBaseUrl = (options.enteliBaseUrl ?? "http://223.197.33.165:20800/enteliweb").replace(/\/+$/, "");
  }

  seedElementSource(projectId: string): BmsSourceSummary {
    const existing = [...this.sources.values()].find((entry) => entry.source.project_id === projectId);
    if (existing) {
      return existing.source;
    }
    this.sourceSequence += 1;
    const sourceId = `src_element_${String(this.sourceSequence).padStart(3, "0")}`;
    const now = new Date().toISOString();
    const source: BmsSourceSummary = {
      source_id: sourceId,
      project_id: projectId,
      building_id: projectId,
      name: "Element_Chiller_enteliWEB",
      vendor_type: "enteliweb",
      protocol_type: "bacnet_http",
      base_url: this.enteliBaseUrl,
      host: null,
      port: null,
      auth_type: "basic",
      read_only: true,
      config: {
        verify_ssl: false,
        latest_value_endpoint_template: "/api/.bacnet/Elements/{element_id}/{object_type},{object_instance}",
        history_endpoint_template: "/history?start={start}&end={end}",
        bms_database_api: this.baseUrl,
        data_source: "BMS-database SQLite poll + enteliWEB live"
      },
      status: "configured",
      created_at: now,
      updated_at: now
    };
    this.sources.set(sourceId, { source, points: [] });
    return source;
  }

  listSources(projectId: string): BmsSourceSummary[] {
    return [...this.sources.values()]
      .map((entry) => entry.source)
      .filter((source) => source.project_id === projectId);
  }

  createSource(payload: BmsSourcePayload): BmsSourceSummary {
    this.sourceSequence += 1;
    const sourceId = `src_${String(this.sourceSequence).padStart(3, "0")}`;
    const now = new Date().toISOString();
    const source: BmsSourceSummary = {
      ...payload,
      source_id: sourceId,
      status: "configured",
      created_at: now,
      updated_at: now
    };
    this.sources.set(sourceId, { source, points: [] });
    return source;
  }

  getSource(sourceId: string): BmsSourceSummary {
    const entry = this.sources.get(sourceId);
    if (!entry) {
      throw new Error("bms_source_not_found");
    }
    return entry.source;
  }

  async health(): Promise<{ ok: boolean; service: string; request_id: string; database?: unknown }> {
    const response = await this.fetchImpl(`${this.baseUrl}/health`);
    const payload = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      service: "bms-database-bridge",
      request_id: "req_bms_db",
      database: payload
    };
  }

  async testConnection(sourceId: string): Promise<BmsConnectionTestResponse> {
    const entry = this.requireSource(sourceId);
    const response = await this.fetchImpl(`${this.baseUrl}/health`);
    const statsResponse = await this.fetchImpl(`${this.baseUrl}/api/v1/stats`);
    const statsOk = statsResponse.ok;
    const testedAt = new Date().toISOString();
    const result: BmsConnectionTestResponse = {
      source_id: sourceId,
      success: response.ok && statsOk,
      message: response.ok && statsOk
        ? `Connected to BMS-database API (${this.baseUrl}) with live enteliWEB base ${entry.source.base_url}.`
        : "BMS-database API is unreachable. Ensure bms-api service is running on port 8765.",
      capabilities: {
        discover_points: true,
        read_latest: true,
        read_history: true,
        write_point: false
      },
      tested_at: testedAt
    };
    entry.source = {
      ...entry.source,
      status: result.success ? "connected" : "error",
      last_connection_test: result,
      updated_at: testedAt
    };
    return result;
  }

  async discoverPoints(sourceId: string): Promise<BmsDiscoverPointsResponse> {
    const entry = this.requireSource(sourceId);
    const points: BmsPointSummary[] = [];
    const pageSize = 200;
    let offset = 0;
    let total = Number.POSITIVE_INFINITY;

    while (offset < total && points.length < 500) {
      const url = `${this.baseUrl}/api/v1/points?limit=${pageSize}&offset=${offset}`;
      const response = await this.fetchImpl(url);
      if (!response.ok) {
        break;
      }
      const payload = await response.json() as { total?: number; items?: DbPointRow[] };
      const items = payload.items ?? [];
      total = typeof payload.total === "number" ? payload.total : items.length;
      for (const row of items) {
        points.push(this.mapDbPoint(sourceId, row));
      }
      if (items.length < pageSize) {
        break;
      }
      offset += pageSize;
    }

    entry.points = points;
    entry.source = { ...entry.source, status: points.length > 0 ? "ready" : "configured", updated_at: new Date().toISOString() };
    return { source_id: sourceId, points, count: points.length };
  }

  getPoints(sourceId: string): { source_id: string; points: BmsPointSummary[]; count: number } {
    const entry = this.requireSource(sourceId);
    return { source_id: sourceId, points: entry.points, count: entry.points.length };
  }

  async startIngestionTest(payload: BmsMinimalIngestionRequest): Promise<{ job_id: string; status: string; message: string }> {
    const entry = this.requireSource(payload.source_id);
    const selected = entry.points.filter((point) => payload.point_ids.includes(point.id));
    const jobId = this.nextJobId();
    const startedAt = new Date().toISOString();
    const series = await Promise.all(
      selected.map(async (point) => this.loadReadingSeries(point, payload.sample_count))
    );
    const job: BmsIngestionJobStatusResponse = {
      job_id: jobId,
      source_id: payload.source_id,
      status: "completed",
      sample_count: payload.sample_count,
      interval_seconds: payload.interval_seconds,
      total_expected_records: series.reduce((sum, item) => sum + item.values.length, 0),
      inserted_records: series.reduce((sum, item) => sum + item.values.length, 0),
      success_rate: 1,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      errors: []
    };
    const results: BmsIngestionResultsResponse = { job_id: jobId, series };
    this.jobs.set(jobId, { job, results });
    entry.source = { ...entry.source, status: "ready", last_ingestion_job_id: jobId, updated_at: job.finished_at ?? startedAt };
    return { job_id: jobId, status: job.status, message: "Historical readings loaded from BMS-database." };
  }

  getJob(jobId: string): BmsIngestionJobStatusResponse {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error("bms_job_not_found");
    }
    return job.job;
  }

  getJobResults(jobId: string): BmsIngestionResultsResponse {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error("bms_job_not_found");
    }
    return job.results;
  }

  private nextJobId(): string {
    this.jobSequence += 1;
    return `job_element_${String(this.jobSequence).padStart(3, "0")}`;
  }

  private requireSource(sourceId: string): { source: BmsSourceSummary; points: BmsPointSummary[] } {
    const entry = this.sources.get(sourceId);
    if (!entry) {
      throw new Error("bms_source_not_found");
    }
    return entry;
  }

  private mapDbPoint(sourceId: string, row: DbPointRow): BmsPointSummary {
    const parts = row.name.split(/[/.]/).filter(Boolean);
    return {
      id: `${sourceId}_db_${row.id}`,
      point_name: row.name,
      vendor_point_id: row.object_ref,
      api_path: row.api_path ?? null,
      unit: "",
      equipment_name: parts[0] ?? "Element",
      system_name: "Element Chiller",
      location: "Plant",
      point_type: row.object_ref.includes("/BV,") ? "binary" : "sensor",
      writable: false,
      semantic_class: row.description?.trim() || row.object_ref,
      status: "discovered",
      ...(row.description ? { description: row.description } : {}),
      raw_row: {
        db_id: String(row.id),
        last_value: row.last_value ?? ""
      }
    };
  }

  private async loadReadingSeries(
    point: BmsPointSummary,
    sampleCount: number
  ): Promise<BmsIngestionResultsResponse["series"][number]> {
    const dbId = point.raw_row?.db_id;
    if (!dbId) {
      return { point_id: point.id, point_name: point.point_name, unit: point.unit, values: [] };
    }
    const limit = Math.min(Math.max(sampleCount, 1), 500);
    let items: BmsTimeseriesRow[] = [];
    try {
      const tsUrl = `${this.baseUrl}/api/v1/points/${dbId}/timeseries?limit=${limit}&order=desc`;
      const tsRes = await this.fetchImpl(tsUrl);
      if (tsRes.ok) {
        const payload = (await tsRes.json()) as { items?: BmsTimeseriesRow[] };
        items = payload.items ?? [];
      } else {
        const { items: legacy } = await fetchTimeseries(this.baseUrl, { point_id: dbId, limit: String(limit) }, this.fetchImpl);
        items = legacy;
      }
    } catch {
      return { point_id: point.id, point_name: point.point_name, unit: point.unit, values: [] };
    }
    const ordered = items.slice(-limit);
    return {
      point_id: point.id,
      point_name: point.point_name,
      unit: point.unit,
      values: ordered.map((row) => ({
        timestamp: row.ts,
        value: numericValue(row),
        quality: "good" as const
      }))
    };
  }
}
