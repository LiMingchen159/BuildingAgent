/** BMS-database unified timeseries API helpers (poll+history merged server-side). */

export interface BmsTimeseriesRow {
  point_id?: number;
  name?: string;
  object_ref?: string;
  ts: string;
  value?: string;
  value_num?: number | null;
  value_text?: string | null;
}

export function bmsApiBase(env: Record<string, string | undefined> = process.env): string {
  return (env.BMS_DATABASE_API_URL ?? "http://127.0.0.1:8765").replace(/\/+$/, "");
}

export function buildTimeseriesUrl(baseUrl: string, params: Record<string, string>): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/v1/timeseries?${new URLSearchParams(params).toString()}`;
}

export function numericValue(row: Pick<BmsTimeseriesRow, "value" | "value_num" | "value_text">): number {
  if (typeof row.value_num === "number" && Number.isFinite(row.value_num)) {
    return row.value_num;
  }
  const raw = row.value ?? row.value_text ?? "";
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function fetchTimeseries(
  baseUrl: string,
  params: Record<string, string>,
  fetchImpl: typeof fetch = fetch
): Promise<{ total: number; items: BmsTimeseriesRow[] }> {
  const url = buildTimeseriesUrl(baseUrl, params);
  const response = await fetchImpl(url);
  if (response.ok) {
    const payload = (await response.json()) as { total?: number; items?: BmsTimeseriesRow[] };
    return { total: payload.total ?? 0, items: payload.items ?? [] };
  }

  // Legacy fallback (pre-unified API)
  const legacy = new URLSearchParams({ ...params, source: "poll" });
  const legacyUrl = `${baseUrl.replace(/\/+$/, "")}/api/v1/readings?${legacy.toString()}`;
  const legacyRes = await fetchImpl(legacyUrl);
  if (!legacyRes.ok) {
    throw new Error(`timeseries_fetch_failed:${response.status}`);
  }
  const legacyPayload = (await legacyRes.json()) as { total?: number; items?: BmsTimeseriesRow[] };
  return { total: legacyPayload.total ?? 0, items: legacyPayload.items ?? [] };
}
