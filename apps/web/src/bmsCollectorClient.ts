import { ApiClientError } from "./api";

/**
 * BMS SQLite collector API (poll/history). Always use same-origin paths:
 * - In production: nginx serves the SPA and proxies `/api` → :3000; collector routes proxy to :8765 on the server.
 * - Optional public path `/bms` exists for integrations without BuildingGPT auth (see nginx).
 *
 * Do not use `127.0.0.1:8765` or `:8765` in browser code — that targets the user's laptop or a firewalled port.
 */
export const BMS_COLLECTOR_API_PREFIX = "/api/bms/collector";

/** Unauthenticated read API via nginx (same host). Use only when you do not have a BuildingGPT token. */
export const BMS_PUBLIC_COLLECTOR_PREFIX =
  (import.meta.env.VITE_BMS_PUBLIC_BASE as string | undefined)?.replace(/\/+$/u, "") || "/bms";

export interface BmsCollectorPoint {
  id: number;
  name: string;
  object_ref?: string;
  last_value?: string | null;
  last_polled_at?: string | null;
}

export interface BmsCollectorPointsResponse {
  total: number;
  items: BmsCollectorPoint[];
}

export interface BmsCollectorTimeseriesRow {
  point_id?: number;
  name?: string;
  object_ref?: string;
  ts: string;
  value?: string;
  value_num?: number | null;
  value_text?: string | null;
}

export interface BmsCollectorTimeseriesResponse {
  total: number;
  items: BmsCollectorTimeseriesRow[];
}

function collectorUrl(prefix: string, path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${prefix}${normalized}`;
}

function authHeaders(token: string): HeadersInit {
  return { authorization: `Bearer ${token}`, accept: "application/json" };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiClientError({ code: "api_invalid_json", message: "BMS collector returned non-JSON." }, response.status);
  }
}

export async function fetchBmsCollector(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<unknown> {
  const headers = new Headers(authHeaders(token));
  if (init.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }
  const response = await fetch(collectorUrl(BMS_COLLECTOR_API_PREFIX, path), { ...init, headers });
  const payload = await readJson(response);
  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error?: { message?: string } }).error?.message ?? "BMS collector request failed.")
        : "BMS collector request failed.";
    throw new ApiClientError({ code: "bms_collector_error", message: detail }, response.status);
  }
  return payload;
}

export async function fetchBmsCollectorPublic(path: string, init: RequestInit = {}): Promise<unknown> {
  const headers = new Headers({ accept: "application/json" });
  if (init.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }
  const response = await fetch(collectorUrl(BMS_PUBLIC_COLLECTOR_PREFIX, path), { ...init, headers });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new ApiClientError({ code: "bms_collector_error", message: "BMS collector request failed." }, response.status);
  }
  return payload;
}

export async function getBmsCollectorHealth(token: string): Promise<{ status: string }> {
  const payload = await fetchBmsCollector(token, "/health");
  if (!payload || typeof payload !== "object" || !("status" in payload)) {
    throw new ApiClientError({ code: "api_malformed", message: "Unexpected BMS collector health response." }, 200);
  }
  return { status: String((payload as { status: unknown }).status) };
}

export async function queryBmsCollectorPoints(
  token: string,
  query: string,
  limit = 50
): Promise<BmsCollectorPointsResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const payload = await fetchBmsCollector(token, `/api/v1/points?${params.toString()}`);
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as BmsCollectorPointsResponse).items)) {
    throw new ApiClientError({ code: "api_malformed", message: "Unexpected BMS points response." }, 200);
  }
  return payload as BmsCollectorPointsResponse;
}

export async function getBmsCollectorLastValue(
  token: string,
  pointName: string
): Promise<BmsCollectorPoint | null> {
  const { items } = await queryBmsCollectorPoints(token, pointName, 1);
  return items.find((item) => item.name === pointName) ?? items[0] ?? null;
}

export async function queryBmsCollectorTimeseries(
  token: string,
  params: Record<string, string>
): Promise<BmsCollectorTimeseriesResponse> {
  const payload = await fetchBmsCollector(token, `/api/v1/timeseries?${new URLSearchParams(params).toString()}`);
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as BmsCollectorTimeseriesResponse).items)) {
    throw new ApiClientError({ code: "api_malformed", message: "Unexpected BMS timeseries response." }, 200);
  }
  return payload as BmsCollectorTimeseriesResponse;
}

export async function queryBmsCollectorReadings(
  token: string,
  params: Record<string, string>
): Promise<BmsCollectorTimeseriesResponse> {
  const payload = await fetchBmsCollector(token, `/api/v1/readings?${new URLSearchParams(params).toString()}`);
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as BmsCollectorTimeseriesResponse).items)) {
    throw new ApiClientError({ code: "api_malformed", message: "Unexpected BMS readings response." }, 200);
  }
  return payload as BmsCollectorTimeseriesResponse;
}
