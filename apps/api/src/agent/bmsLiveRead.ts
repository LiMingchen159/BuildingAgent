import { fetchTimeseries } from "../bmsTimeseries.js";
import { resolveElementEnteliConfig } from "../elementEnteliConfig.js";

export interface BmsLiveReadInput {
  apiPath?: string;
  pointName?: string;
  objectRef?: string;
  bmsDatabaseApiUrl?: string;
}

export interface BmsLiveReadResult {
  ok: boolean;
  pointName?: string;
  objectRef?: string;
  apiPath: string;
  presentValue?: string;
  valueKind?: string;
  timeOfLastWrite?: string;
  httpStatus?: number;
  error?: string;
  source: "enteliweb_live";
}

interface ResolvedPoint {
  name: string;
  object_ref: string;
  api_path: string;
}

interface CatalogResolution {
  point: ResolvedPoint | null;
  /** How many catalog rows the `q` search returned, for a precise error message. */
  candidateCount: number;
}

/** Catalog lookups are local and indexed; anything slower than this is not worth waiting for. */
const CATALOG_TIMEOUT_MS = 5_000;

/**
 * The readings scan is unindexed and has been measured at ~11 s on production data,
 * so it gets a hard ceiling well below the catalog timeout.
 */
const READINGS_FALLBACK_TIMEOUT_MS = 2_000;

/**
 * Point names are single tokens such as `WCC-L1-01-CHWRT` or `WCC_1_Chilled_Water_Temp`.
 * A phrase with spaces is a description, and scanning readings for it can only ever fail.
 */
function looksLikePointIdentifier(value: string): boolean {
  return /^[\w.:/-]+$/u.test(value);
}

async function resolvePointByExactName(
  baseUrl: string,
  pointName: string
): Promise<ResolvedPoint | null> {
  let reading: { point_id: number; name: string; object_ref: string } | undefined;
  try {
    const { items } = await fetchTimeseries(baseUrl, { name: pointName, limit: "1" }, fetch, {
      signal: AbortSignal.timeout(READINGS_FALLBACK_TIMEOUT_MS)
    });
    const row = items[0];
    if (row?.point_id && row.name && row.object_ref) {
      reading = { point_id: row.point_id, name: row.name, object_ref: row.object_ref };
    }
  } catch {
    return null;
  }
  if (!reading?.point_id) {
    return null;
  }
  try {
    const pointRes = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/v1/points/${reading.point_id}`, {
      signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS)
    });
    if (!pointRes.ok) {
      return null;
    }
    const point = (await pointRes.json()) as { name: string; object_ref: string; api_path?: string | null };
    if (!point.api_path) {
      return null;
    }
    return { name: point.name, object_ref: point.object_ref, api_path: point.api_path };
  } catch {
    return null;
  }
}

async function resolvePointFromCatalog(
  baseUrl: string,
  input: Pick<BmsLiveReadInput, "pointName" | "objectRef">
): Promise<CatalogResolution> {
  const params = new URLSearchParams({ limit: "5" });
  if (input.pointName?.trim()) {
    params.set("q", input.pointName.trim());
  }
  const listUrl = `${baseUrl.replace(/\/+$/, "")}/api/v1/points?${params.toString()}`;
  let items: Array<{ name: string; object_ref: string; api_path?: string | null }> = [];
  try {
    const listRes = await fetch(listUrl, { signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS) });
    if (!listRes.ok) {
      return { point: null, candidateCount: 0 };
    }
    const payload = (await listRes.json()) as { items?: Array<{ name: string; object_ref: string; api_path?: string | null }> };
    items = payload.items ?? [];
  } catch {
    return { point: null, candidateCount: 0 };
  }
  if (input.objectRef?.trim() && items.length) {
    const match = items.find((item) => item.object_ref === input.objectRef?.trim());
    if (match?.api_path) {
      return { point: { name: match.name, object_ref: match.object_ref, api_path: match.api_path }, candidateCount: items.length };
    }
  }
  const pointNameQuery = input.pointName?.trim();
  if (pointNameQuery && items.length) {
    const exact = items.find((item) => item.name === pointNameQuery);
    const row = exact ?? items[0];
    if (row?.api_path) {
      return { point: { name: row.name, object_ref: row.object_ref, api_path: row.api_path }, candidateCount: items.length };
    }
  } else if (!pointNameQuery) {
    const first = items.find((item) => item.api_path);
    if (first?.api_path) {
      return { point: { name: first.name, object_ref: first.object_ref, api_path: first.api_path }, candidateCount: items.length };
    }
  }
  // Readings can carry names the catalog no longer indexes, but only for real point
  // identifiers — scanning them for a free-text phrase just burns seconds before failing.
  const exactName = input.pointName?.trim();
  if (exactName && looksLikePointIdentifier(exactName)) {
    return { point: await resolvePointByExactName(baseUrl, exactName), candidateCount: items.length };
  }
  return { point: null, candidateCount: items.length };
}

function parsePresentValue(xml: string): { presentValue?: string; valueKind?: string; timeOfLastWrite?: string } {
  const presentMatch = xml.match(/name="present-value"[^>]*value="([^"]*)"/);
  const kindMatch = xml.match(/<(\w+)\s+name="present-value"/);
  const timeMatch = xml.match(/name="time-of-last-write"[^>]*value="([^"]*)"/);
  const out: { presentValue?: string; valueKind?: string; timeOfLastWrite?: string } = {};
  if (presentMatch?.[1] !== undefined) out.presentValue = presentMatch[1];
  if (kindMatch?.[1] !== undefined) out.valueKind = kindMatch[1];
  if (timeMatch?.[1] !== undefined) out.timeOfLastWrite = timeMatch[1];
  return out;
}

function liveResult(base: {
  ok: boolean;
  apiPath: string;
  source: "enteliweb_live";
  pointName?: string | undefined;
  objectRef?: string | undefined;
  presentValue?: string | undefined;
  valueKind?: string | undefined;
  timeOfLastWrite?: string | undefined;
  httpStatus?: number | undefined;
  error?: string | undefined;
}): BmsLiveReadResult {
  const out: BmsLiveReadResult = { ok: base.ok, apiPath: base.apiPath, source: base.source };
  if (base.pointName !== undefined) out.pointName = base.pointName;
  if (base.objectRef !== undefined) out.objectRef = base.objectRef;
  if (base.presentValue !== undefined) out.presentValue = base.presentValue;
  if (base.valueKind !== undefined) out.valueKind = base.valueKind;
  if (base.timeOfLastWrite !== undefined) out.timeOfLastWrite = base.timeOfLastWrite;
  if (base.httpStatus !== undefined) out.httpStatus = base.httpStatus;
  if (base.error !== undefined) out.error = base.error;
  return out;
}

export async function fetchEnteliLiveValue(input: BmsLiveReadInput): Promise<BmsLiveReadResult> {
  const enteli = resolveElementEnteliConfig();
  const catalogBase = (
    input.bmsDatabaseApiUrl ??
    process.env.BMS_DATABASE_API_URL ??
    "http://127.0.0.1:8765"
  ).replace(/\/+$/, "");

  let apiPath = input.apiPath?.trim() ?? "";
  let pointName = input.pointName?.trim();
  let objectRef = input.objectRef?.trim();

  if (!apiPath) {
    if (!pointName && !objectRef) {
      return liveResult({
        ok: false,
        apiPath: "",
        error: "Provide api_path, point_name, or object_ref.",
        source: "enteliweb_live"
      });
    }
    const catalogQuery: Pick<BmsLiveReadInput, "pointName" | "objectRef"> = {};
    if (pointName) catalogQuery.pointName = pointName;
    if (objectRef) catalogQuery.objectRef = objectRef;
    const resolution = await resolvePointFromCatalog(catalogBase, catalogQuery);
    if (!resolution.point) {
      const searched = pointName ?? objectRef ?? "";
      return liveResult({
        ok: false,
        apiPath: "",
        error: resolution.candidateCount === 0
          ? `No catalog point matches "${searched}" (${catalogBase}). Use bms_points_query to find the exact point name first.`
          : `Found ${resolution.candidateCount} catalog candidate(s) for "${searched}" but none exposed an api_path (${catalogBase}).`,
        source: "enteliweb_live"
      });
    }
    apiPath = resolution.point.api_path;
    pointName = resolution.point.name;
    objectRef = resolution.point.object_ref;
  }

  if (!apiPath.startsWith("http")) {
    apiPath = `${enteli.baseUrl}${apiPath.startsWith("/") ? "" : "/"}${apiPath}`;
  }

  const auth = Buffer.from(`${enteli.username}:${enteli.password}`).toString("base64");
  let response: Response;
  let body: string;
  try {
    response = await fetch(apiPath, {
      headers: {
        Accept: "application/xml",
        Authorization: `Basic ${auth}`
      },
      signal: AbortSignal.timeout(30_000)
    });
    body = await response.text();
  } catch (error) {
    return liveResult({
      ok: false,
      pointName,
      objectRef,
      apiPath,
      error: `enteliWEB request failed: ${error instanceof Error ? error.message : String(error)}`,
      source: "enteliweb_live"
    });
  }

  if (!response.ok) {
    return liveResult({
      ok: false,
      pointName,
      objectRef,
      apiPath,
      httpStatus: response.status,
      error: response.status === 401 ? "enteliWEB authentication failed." : `HTTP ${response.status}`,
      source: "enteliweb_live"
    });
  }

  const parsed = parsePresentValue(body);
  if (!parsed.presentValue) {
    return liveResult({
      ok: false,
      pointName,
      objectRef,
      apiPath,
      httpStatus: response.status,
      error: "Could not parse present-value from CSML XML.",
      source: "enteliweb_live"
    });
  }

  return liveResult({
    ok: true,
    pointName,
    objectRef,
    apiPath,
    presentValue: parsed.presentValue,
    valueKind: parsed.valueKind,
    timeOfLastWrite: parsed.timeOfLastWrite,
    httpStatus: response.status,
    source: "enteliweb_live"
  });
}
