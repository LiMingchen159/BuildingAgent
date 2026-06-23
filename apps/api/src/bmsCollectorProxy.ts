import { bmsCollectorBaseUrl, bmsCollectorPath } from "./bmsCollectorUrl.js";
import type { FetchLike } from "./providers.js";

export interface BmsCollectorProxyResult {
  statusCode: number;
  payload: unknown;
  contentType: string | null;
}

export async function proxyBmsCollector(
  env: Record<string, string | undefined>,
  fetchImpl: FetchLike,
  pathname: string,
  search: string,
  init: RequestInit = {}
): Promise<BmsCollectorProxyResult> {
  const base = bmsCollectorBaseUrl(env);
  const url = bmsCollectorPath(base, pathname, search);
  const response = await fetchImpl(url, init);
  const contentType = response.headers.get("content-type");

  if (contentType?.includes("application/json")) {
    try {
      return { statusCode: response.status, payload: await response.json(), contentType };
    } catch {
      return { statusCode: response.status, payload: await response.text(), contentType };
    }
  }

  try {
    return { statusCode: response.status, payload: await response.text(), contentType };
  } catch {
    return { statusCode: response.status, payload: null, contentType };
  }
}
