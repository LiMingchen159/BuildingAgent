import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchEnteliLiveValue } from "./bmsLiveRead.js";
import { applyElementEnteliEnv } from "../elementEnteliConfig.js";

const CATALOG_BASE = "http://127.0.0.1:8765";

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchEnteliLiveValue", () => {
  it("reads WCC_1_Chilled_Water_Temp when catalog and enteliWEB are reachable", async () => {
    applyElementEnteliEnv();
    const result = await fetchEnteliLiveValue({ pointName: "WCC_1_Chilled_Water_Temp" });
    if (!result.ok) {
      console.warn("bms live read skipped:", result.error);
      return;
    }
    expect(result.presentValue).toBeTruthy();
    expect(result.apiPath).toContain("AV,5");
  }, 60_000);

  it("fails fast on a free-text point name without scanning readings", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ total: 0, items: [] }));
    vi.stubGlobal("fetch", fetchImpl);

    const result = await fetchEnteliLiveValue({
      pointName: "Chiller 1 return water temperature",
      bmsDatabaseApiUrl: CATALOG_BASE
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("No catalog point matches");
    expect(result.error).toContain("bms_points_query");
    // Only the catalog lookup runs: the readings scan is skipped for phrases.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const calledUrls = (fetchImpl.mock.calls as unknown as Array<[string]>).map(([url]) => String(url));
    expect(calledUrls.some((url) => url.includes("/api/v1/readings"))).toBe(false);
    expect(calledUrls.some((url) => url.includes("/api/v1/timeseries"))).toBe(false);
  });

  it("still falls back to readings for an identifier-shaped name the catalog does not index", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/api/v1/points?")) {
        return jsonResponse({ total: 0, items: [] });
      }
      if (url.includes("/api/v1/timeseries?")) {
        return jsonResponse({
          total: 1,
          items: [{ point_id: 2263, name: "WCC-L1-01-CHWRT", object_ref: "//Elements/10102.AI2204", ts: "2026-08-20T03:43:00Z" }]
        });
      }
      if (url.includes("/api/v1/points/2263")) {
        return jsonResponse({
          name: "WCC-L1-01-CHWRT",
          object_ref: "//Elements/10102.AI2204",
          api_path: "http://enteli.example/api/.bacnet/Elements/10102/AI2204"
        });
      }
      return new Response('<Real name="present-value" value="14.917" /><Str name="time-of-last-write" value="2026-08-20T03:43:00" />', {
        status: 200,
        headers: { "content-type": "application/xml" }
      });
    });
    vi.stubGlobal("fetch", fetchImpl);

    const result = await fetchEnteliLiveValue({
      pointName: "WCC-L1-01-CHWRT",
      bmsDatabaseApiUrl: CATALOG_BASE
    });

    expect(result.ok).toBe(true);
    expect(result.pointName).toBe("WCC-L1-01-CHWRT");
    expect(result.presentValue).toBe("14.917");
    const calledUrls = (fetchImpl.mock.calls as unknown as Array<[string]>).map(([url]) => String(url));
    expect(calledUrls.some((url) => url.includes("/api/v1/timeseries"))).toBe(true);
  });

  it("reports when the catalog returned candidates but none had an api_path", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/api/v1/points?")) {
        return jsonResponse({
          total: 1,
          items: [{ name: "WCC-L1-01-CHWRT", object_ref: "//Elements/10102.AI2204", api_path: null }]
        });
      }
      return jsonResponse({ total: 0, items: [] });
    });
    vi.stubGlobal("fetch", fetchImpl);

    const result = await fetchEnteliLiveValue({
      pointName: "WCC-L1-01-CHWRT",
      bmsDatabaseApiUrl: CATALOG_BASE
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("1 catalog candidate(s)");
  });

  it("returns a structured error instead of throwing when the catalog is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));

    const result = await fetchEnteliLiveValue({
      pointName: "WCC-L1-01-CHWRT",
      bmsDatabaseApiUrl: CATALOG_BASE
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("No catalog point matches");
  });
});
