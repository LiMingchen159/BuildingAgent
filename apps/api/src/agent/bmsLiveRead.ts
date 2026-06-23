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

async function resolvePointByExactName(
  baseUrl: string,
  pointName: string
): Promise<{ name: string; object_ref: string; api_path: string } | null> {
  let reading: { point_id: number; name: string; object_ref: string } | undefined;
  try {
    const { items } = await fetchTimeseries(baseUrl, { name: pointName, limit: "1" });
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
  const pointRes = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/v1/points/${reading.point_id}`);
  if (!pointRes.ok) {
    return null;
  }
  const point = (await pointRes.json()) as { name: string; object_ref: string; api_path?: string | null };
  if (!point.api_path) {
    return null;
  }
  return { name: point.name, object_ref: point.object_ref, api_path: point.api_path };
}

async function resolvePointFromCatalog(
  baseUrl: string,
  input: Pick<BmsLiveReadInput, "pointName" | "objectRef">
): Promise<{ name: string; object_ref: string; api_path: string } | null> {
  const params = new URLSearchParams({ limit: "5" });
  if (input.pointName?.trim()) {
    params.set("q", input.pointName.trim());
  }
  const listUrl = `${baseUrl.replace(/\/+$/, "")}/api/v1/points?${params.toString()}`;
  const listRes = await fetch(listUrl);
  if (!listRes.ok) {
    return null;
  }
  const payload = (await listRes.json()) as { items?: Array<{ name: string; object_ref: string; api_path?: string | null }> };
  const items = payload.items ?? [];
  if (input.objectRef?.trim() && items.length) {
    const match = items.find((item) => item.object_ref === input.objectRef?.trim());
    if (match?.api_path) {
      return { name: match.name, object_ref: match.object_ref, api_path: match.api_path };
    }
  }
  const pointNameQuery = input.pointName?.trim();
  if (pointNameQuery && items.length) {
    const exact = items.find((item) => item.name === pointNameQuery);
    const row = exact ?? items[0];
    if (row?.api_path) {
      return { name: row.name, object_ref: row.object_ref, api_path: row.api_path };
    }
  } else {
    const first = items.find((item) => item.api_path);
    if (first?.api_path) {
      return { name: first.name, object_ref: first.object_ref, api_path: first.api_path };
    }
  }
  const exactName = input.pointName?.trim();
  if (exactName) {
    return resolvePointByExactName(baseUrl, exactName);
  }
  return null;
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
    const resolved = await resolvePointFromCatalog(catalogBase, catalogQuery);
    if (!resolved) {
      return liveResult({
        ok: false,
        apiPath: "",
        error: `Point not found in catalog (${catalogBase}).`,
        source: "enteliweb_live"
      });
    }
    apiPath = resolved.api_path;
    pointName = resolved.name;
    objectRef = resolved.object_ref;
  }

  if (!apiPath.startsWith("http")) {
    apiPath = `${enteli.baseUrl}${apiPath.startsWith("/") ? "" : "/"}${apiPath}`;
  }

  const auth = Buffer.from(`${enteli.username}:${enteli.password}`).toString("base64");
  const response = await fetch(apiPath, {
    headers: {
      Accept: "application/xml",
      Authorization: `Basic ${auth}`
    },
    signal: AbortSignal.timeout(30_000)
  });

  const body = await response.text();
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
