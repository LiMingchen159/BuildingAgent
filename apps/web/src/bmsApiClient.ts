import { ApiClientError } from "./api";

export type BmsVendorType = "enteliweb" | "custom_rest" | "bacnet" | "haystack";
export type BmsProtocolType = "bacnet_http" | "enteliweb_rest" | "rest" | "bacnet_ip" | "haystack";
export type BmsAuthType = "none" | "basic" | "bearer" | "token";

export interface BmsCapabilitySet {
  test_connection: boolean;
  import_points: boolean;
  read_latest: boolean;
  discover_points: boolean;
  read_history: boolean;
  write_point: boolean;
}

export interface BmsSourceConfig {
  verify_ssl: boolean;
  latest_value_endpoint_template: string;
  history_endpoint_template?: string | null;
  points_endpoint?: string | null;
  test_endpoint?: string | null;
}

export interface BmsSourcePayload {
  project_id: string;
  building_id: string;
  name: string;
  vendor_type: BmsVendorType;
  protocol_type: BmsProtocolType;
  base_url: string | null;
  auth_type: BmsAuthType;
  read_only: boolean;
  config: BmsSourceConfig;
}

export interface BmsSourceSummary extends BmsSourcePayload {
  source_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_connection_test?: BmsConnectionTestResponse;
  last_ingestion_job_id?: string;
}

export interface BmsConnectionTestResponse {
  source_id: string;
  success: boolean;
  message: string;
  capabilities: BmsCapabilitySet;
  tested_at: string;
}

export interface BmsPointSummary {
  id: string;
  point_name: string;
  vendor_point_id: string;
  api_path?: string | null;
  unit: string;
  equipment_name: string;
  system_name: string;
  location: string;
  point_type: string;
  writable: boolean;
  semantic_class: string;
  status: string;
  description?: string;
  warnings?: string[];
  raw_row?: Record<string, string>;
}

export interface BmsDiscoverPointsResponse {
  source_id: string;
  points: BmsPointSummary[];
  count: number;
}

export interface BmsMinimalIngestionRequest {
  source_id: string;
  point_ids: string[];
  sample_count: number;
  interval_seconds: number;
}

export interface BmsIngestionJobStatusResponse {
  job_id: string;
  source_id: string;
  status: "running" | "completed" | "failed";
  sample_count: number;
  interval_seconds: number;
  total_expected_records: number;
  inserted_records: number;
  success_rate: number;
  started_at: string;
  finished_at: string | null;
  errors: string[];
}

export interface BmsIngestionSeriesValue {
  timestamp: string;
  value: number;
  quality: "good" | "bad" | "uncertain";
}

export interface BmsIngestionSeries {
  point_id: string;
  point_name: string;
  unit: string;
  values: BmsIngestionSeriesValue[];
}

export interface BmsIngestionResultsResponse {
  job_id: string;
  series: BmsIngestionSeries[];
}

export interface BmsLiveValueRow {
  point_id: string;
  point_name: string;
  vendor_point_id: string;
  api_path?: string | null;
  value: string | number | boolean | null;
  unit: string;
  quality: string;
  timestamp: string;
  success: boolean;
  error_message?: string;
  raw_payload_keys?: string[];
}

export interface BmsLiveValueTestResponse {
  source_id: string;
  success: boolean;
  message: string;
  tested_at: string;
  rows: BmsLiveValueRow[];
}

export interface BmsSourceCredentialsPayload {
  auth_type: BmsAuthType;
  username?: string;
  password?: string;
  token?: string;
}

export interface BmsPointImportAnalysisResponse {
  source_id?: string;
  rows: BmsPointSummary[];
  warnings?: string[];
}

export interface BmsTempUploadResponse {
  upload_id: string;
  project_id: string;
  file_name: string;
  mime_type: string;
  temp_file_token: string;
  temp_relative_path: string;
  uploaded_at: string;
  row_count: number;
  preview_headers: string[];
  preview_rows: Array<Record<string, string>>;
  points: BmsPointSummary[];
  warnings?: string[];
}

export interface BmsPointImportPayload {
  source_id: string;
  points: BmsPointSummary[];
}

export interface BmsPointUpdateRequest {
  point_name?: string;
  vendor_point_id?: string;
  api_path?: string | null;
  unit?: string;
  equipment_name?: string;
  system_name?: string;
  location?: string;
  point_type?: string;
  writable?: boolean;
  semantic_class?: string;
  description?: string;
}

export interface BmsApiClient {
  health(): Promise<{ ok: boolean; service: string; request_id?: string }>;
  uploadTempFile(payload: { project_id: string; file_name: string; content_base64: string; mime_type?: string; row_count?: number; preview_headers?: string[]; preview_rows?: Array<Record<string, string>>; points?: BmsPointSummary[]; warnings?: string[] }): Promise<BmsTempUploadResponse>;
  createSource(payload: BmsSourcePayload): Promise<BmsSourceSummary>;
  updateSource(sourceId: string, payload: Partial<BmsSourcePayload>): Promise<BmsSourceSummary>;
  listSources(projectId: string): Promise<BmsSourceSummary[]>;
  getSource(sourceId: string): Promise<BmsSourceSummary>;
  saveCredentials(sourceId: string, payload: BmsSourceCredentialsPayload): Promise<BmsSourceSummary>;
  testConnection(sourceId: string): Promise<BmsConnectionTestResponse>;
  analyzePointList(file: File, options: { source_id?: string; vendor_type?: BmsVendorType; protocol_type?: BmsProtocolType }): Promise<BmsPointImportAnalysisResponse>;
  importPoints(payload: BmsPointImportPayload): Promise<{ source_id: string; imported: number; points?: BmsPointSummary[] }>;
  listPoints(sourceId: string): Promise<BmsDiscoverPointsResponse>;
  updatePoint(pointId: string, payload: BmsPointUpdateRequest): Promise<BmsPointSummary>;
  suggestSemanticMapping(payload: { source_id?: string; point_ids: string[] }): Promise<{ suggested: BmsPointSummary[] }>;
  testReadValues(payload: { source_id: string; point_ids: string[] }): Promise<BmsLiveValueTestResponse>;
  runMinimalIngestionTest(payload: BmsMinimalIngestionRequest): Promise<{ job_id: string; status: "running"; message: string }>;
  getIngestionJob(jobId: string): Promise<BmsIngestionJobStatusResponse>;
  getIngestionResults(jobId: string): Promise<BmsIngestionResultsResponse>;
}

const REQUEST_TIMEOUT_MS = 8000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function authHeaders(token: string): HeadersInit {
  const headers = new Headers();
  headers.set("authorization", `Bearer ${token}`);
  return headers;
}

function endpointUnavailable(status?: number): ApiClientError {
  return new ApiClientError({ code: "backend_endpoint_not_available", message: "Backend endpoint not available." }, status);
}

function bmsUnavailable(): ApiClientError {
  return new ApiClientError({ code: "bms_service_unavailable", message: "BMS service unavailable." });
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorDetail(payload: unknown): { code: string; message: string } | null {
  if (!isRecord(payload) || !isRecord(payload.error)) return null;
  const code = typeof payload.error.code === "string" ? payload.error.code : null;
  const message = typeof payload.error.message === "string" ? payload.error.message : null;
  return code && message ? { code, message } : null;
}

function isUnavailableStatus(status: number): boolean {
  return status === 404 || status === 405 || status === 501;
}

async function requestJson(token: string, path: string, options: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers = new Headers(authHeaders(token));
    if (options.headers) {
      new Headers(options.headers).forEach((value, key) => headers.set(key, value));
    }
    if (options.body !== undefined && !headers.has("content-type") && !(options.body instanceof FormData)) {
      headers.set("content-type", "application/json");
    }
    const response = await fetch(path, { ...options, headers, signal: controller.signal });
    const payload = await readPayload(response);
    if (!response.ok) {
      const detail = extractErrorDetail(payload);
      if (isUnavailableStatus(response.status) && !detail) {
        throw endpointUnavailable(response.status);
      }
      if (detail) {
        throw new ApiClientError(detail, response.status);
      }
      throw endpointUnavailable(response.status);
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw bmsUnavailable();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function normalizeSource(payload: unknown): BmsSourceSummary {
  if (!isRecord(payload) || typeof payload.source_id !== "string") {
    throw new ApiClientError({ code: "bms_malformed", message: "BMS returned an unexpected source." });
  }
  return payload as unknown as BmsSourceSummary;
}

function normalizeSources(payload: unknown): BmsSourceSummary[] {
  if (!Array.isArray(payload)) {
    throw new ApiClientError({ code: "bms_malformed", message: "BMS returned an unexpected source list." });
  }
  return payload.map(normalizeSource);
}

function normalizeHealth(payload: unknown): { ok: boolean; service: string; request_id?: string } {
  if (!isRecord(payload) || typeof payload.ok !== "boolean" || typeof payload.service !== "string") {
    throw new ApiClientError({ code: "bms_malformed", message: "BMS returned an unexpected health response." });
  }
  return {
    ok: payload.ok,
    service: payload.service,
    ...(typeof payload.request_id === "string" ? { request_id: payload.request_id } : {})
  };
}

function normalizeConnectionTest(payload: unknown): BmsConnectionTestResponse {
  if (!isRecord(payload) || typeof payload.source_id !== "string" || typeof payload.success !== "boolean" || typeof payload.message !== "string" || !isRecord(payload.capabilities) || typeof payload.tested_at !== "string") {
    throw new ApiClientError({ code: "bms_malformed", message: "BMS returned an unexpected connection test response." });
  }
  return payload as unknown as BmsConnectionTestResponse;
}

function normalizePoints(payload: unknown): BmsDiscoverPointsResponse {
  if (!isRecord(payload) || typeof payload.source_id !== "string" || !Array.isArray(payload.points) || typeof payload.count !== "number") {
    throw new ApiClientError({ code: "bms_malformed", message: "BMS returned an unexpected points response." });
  }
  return payload as unknown as BmsDiscoverPointsResponse;
}

function normalizeJob(payload: unknown): BmsIngestionJobStatusResponse {
  if (!isRecord(payload) || typeof payload.job_id !== "string" || typeof payload.source_id !== "string" || typeof payload.status !== "string") {
    throw new ApiClientError({ code: "bms_malformed", message: "BMS returned an unexpected job response." });
  }
  return payload as unknown as BmsIngestionJobStatusResponse;
}

function normalizeResults(payload: unknown): BmsIngestionResultsResponse {
  if (!isRecord(payload) || typeof payload.job_id !== "string" || !Array.isArray(payload.series)) {
    throw new ApiClientError({ code: "bms_malformed", message: "BMS returned an unexpected results response." });
  }
  return payload as unknown as BmsIngestionResultsResponse;
}

function normalizeLiveValues(payload: unknown, sourceId: string): BmsLiveValueTestResponse {
  if (!isRecord(payload)) {
    throw new ApiClientError({ code: "bms_malformed", message: "BMS returned an unexpected live read response." });
  }
  if (typeof payload.source_id === "string" && Array.isArray(payload.rows)) {
    return {
      source_id: payload.source_id,
      success: payload.success !== false,
      message: typeof payload.message === "string" ? payload.message : "Live read completed.",
      tested_at: typeof payload.tested_at === "string" ? payload.tested_at : new Date().toISOString(),
      rows: payload.rows as BmsLiveValueRow[]
    };
  }
  if (typeof payload.job_id === "string" && Array.isArray(payload.series)) {
    const rows: BmsLiveValueRow[] = [];
    for (const series of payload.series as BmsIngestionSeries[]) {
      const latest = series.values[series.values.length - 1];
      if (!latest) continue;
      rows.push({
        point_id: series.point_id,
        point_name: series.point_name,
        vendor_point_id: series.point_id,
        value: latest.value,
        unit: series.unit,
        quality: latest.quality,
        timestamp: latest.timestamp,
        success: true,
        raw_payload_keys: ["job_id", "series"]
      });
    }
    return {
      source_id: sourceId,
      success: true,
      message: "Live read completed via ingestion fallback.",
      tested_at: new Date().toISOString(),
      rows
    };
  }
  throw new ApiClientError({ code: "bms_malformed", message: "BMS returned an unexpected live read response." });
}

function normalizePoint(payload: unknown): BmsPointSummary {
  if (!isRecord(payload) || typeof payload.id !== "string" || typeof payload.point_name !== "string" || typeof payload.vendor_point_id !== "string") {
    throw new ApiClientError({ code: "bms_malformed", message: "BMS returned an unexpected point response." });
  }
  return payload as unknown as BmsPointSummary;
}

function normalizeTempUpload(payload: unknown): BmsTempUploadResponse {
  if (!isRecord(payload) || typeof payload.upload_id !== "string" || typeof payload.project_id !== "string" || typeof payload.file_name !== "string" || typeof payload.temp_relative_path !== "string" || !Array.isArray(payload.preview_headers) || !Array.isArray(payload.preview_rows) || !Array.isArray(payload.points)) {
    throw new ApiClientError({ code: "bms_malformed", message: "BMS returned an unexpected temp upload response." });
  }
  return payload as unknown as BmsTempUploadResponse;
}

async function analyzePointList(token: string, file: File, options: { source_id?: string; vendor_type?: BmsVendorType; protocol_type?: BmsProtocolType }): Promise<BmsPointImportAnalysisResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (options.source_id) formData.append("source_id", options.source_id);
  if (options.vendor_type) formData.append("vendor_type", options.vendor_type);
  if (options.protocol_type) formData.append("protocol_type", options.protocol_type);
  const payload = await requestJson(token, "/api/bms/import/excel/analyze", { method: "POST", body: formData });
  if (!isRecord(payload) || !Array.isArray(payload.rows)) {
    throw new ApiClientError({ code: "bms_malformed", message: "BMS returned an unexpected analyze response." });
  }
  return {
    ...(typeof payload.source_id === "string" ? { source_id: payload.source_id } : {}),
    rows: payload.rows as BmsPointSummary[],
    ...(Array.isArray(payload.warnings) ? { warnings: payload.warnings.filter((warning): warning is string => typeof warning === "string") } : {})
  };
}

function createClient(token: string): BmsApiClient {
  return {
    async health() {
      return normalizeHealth(await requestJson(token, "/api/bms/health"));
    },
    async uploadTempFile(payload) {
      return normalizeTempUpload(await requestJson(token, "/api/bms/temp-upload", { method: "POST", body: JSON.stringify(payload) }));
    },
    async createSource(payload) {
      return normalizeSource(await requestJson(token, "/api/bms/sources", { method: "POST", body: JSON.stringify(payload) }));
    },
    async updateSource(sourceId, payload) {
      return normalizeSource(await requestJson(token, `/api/bms/sources/${encodeURIComponent(sourceId)}`, { method: "PATCH", body: JSON.stringify(payload) }));
    },
    async listSources(projectId) {
      return normalizeSources(await requestJson(token, `/api/bms/sources?project_id=${encodeURIComponent(projectId)}`));
    },
    async getSource(sourceId) {
      return normalizeSource(await requestJson(token, `/api/bms/sources/${encodeURIComponent(sourceId)}`));
    },
    async saveCredentials(sourceId, payload) {
      return normalizeSource(await requestJson(token, `/api/bms/sources/${encodeURIComponent(sourceId)}/credentials`, { method: "POST", body: JSON.stringify(payload) }));
    },
    async testConnection(sourceId) {
      return normalizeConnectionTest(await requestJson(token, `/api/bms/sources/${encodeURIComponent(sourceId)}/test-connection`, { method: "POST" }));
    },
    async analyzePointList(file, options) {
      return analyzePointList(token, file, options);
    },
    async importPoints(payload) {
      const response = await requestJson(token, "/api/bms/points/import", { method: "POST", body: JSON.stringify(payload) });
      if (!isRecord(response) || typeof response.source_id !== "string" || typeof response.imported !== "number") {
        throw new ApiClientError({ code: "bms_malformed", message: "BMS returned an unexpected import response." });
      }
      return {
        source_id: response.source_id,
        imported: response.imported,
        ...(Array.isArray(response.points) ? { points: response.points as BmsPointSummary[] } : {})
      };
    },
    async listPoints(sourceId) {
      return normalizePoints(await requestJson(token, `/api/bms/sources/${encodeURIComponent(sourceId)}/points`));
    },
    async updatePoint(pointId, payload) {
      return normalizePoint(await requestJson(token, `/api/bms/points/${encodeURIComponent(pointId)}`, { method: "PATCH", body: JSON.stringify(payload) }));
    },
    async suggestSemanticMapping(payload) {
      const response = await requestJson(token, "/api/bms/semantic/suggest", { method: "POST", body: JSON.stringify(payload) });
      if (!isRecord(response) || !Array.isArray(response.suggested)) {
        throw new ApiClientError({ code: "bms_malformed", message: "BMS returned an unexpected semantic suggestion response." });
      }
      return { suggested: response.suggested as BmsPointSummary[] };
    },
    async testReadValues(payload) {
      const response = await requestJson(token, "/api/bms/points/test-live-values", { method: "POST", body: JSON.stringify(payload) });
      return normalizeLiveValues(response, payload.source_id);
    },
    async runMinimalIngestionTest(payload) {
      const response = await requestJson(token, "/api/bms/ingestion/test", { method: "POST", body: JSON.stringify(payload) });
      if (!isRecord(response) || typeof response.job_id !== "string" || typeof response.status !== "string" || typeof response.message !== "string") {
        throw new ApiClientError({ code: "bms_malformed", message: "BMS returned an unexpected ingestion start response." });
      }
      return { job_id: response.job_id, status: "running" as const, message: response.message };
    },
    async getIngestionJob(jobId) {
      return normalizeJob(await requestJson(token, `/api/bms/ingestion/jobs/${encodeURIComponent(jobId)}`));
    },
    async getIngestionResults(jobId) {
      return normalizeResults(await requestJson(token, `/api/bms/ingestion/jobs/${encodeURIComponent(jobId)}/results`));
    }
  };
}

export function createBmsApiClient(token: string): BmsApiClient {
  return createClient(token);
}
