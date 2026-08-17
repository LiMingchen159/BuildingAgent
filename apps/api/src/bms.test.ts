import { describe, expect, it, vi } from "vitest";
import { buildServer } from "./server.js";
import { createSeedStore } from "./seed.js";

const adaToken = "seed-token-ada";

function bearer(value = adaToken) {
  return { authorization: `Bearer ${value}` };
}

describe("BMS API contract", () => {
  it("requires auth and selected project access for BMS sources", async () => {
    const app = buildServer();

    const missing = await app.inject({ method: "GET", url: "/api/bms/health" });
    expect(missing.statusCode).toBe(401);

    const unselected = await app.inject({
      method: "GET",
      url: "/api/bms/sources?project_id=project_alpha",
      headers: bearer()
    });
    expect(unselected.statusCode).toBe(403);
  });

  it("returns mock BMS data when mock mode is enabled", async () => {
    const app = buildServer({ env: { USE_MOCK_BMS_CLIENT: "true", BMS_API_BASE_URL: "http://localhost:8100" } });

    await app.inject({ method: "POST", url: "/api/projects/project_alpha/select", headers: bearer() });

    const uploaded = await app.inject({
      method: "POST",
      url: "/api/bms/temp-upload",
      headers: bearer(),
      payload: {
        project_id: "project_alpha",
        file_name: "points.csv",
        mime_type: "text/csv",
        content_base64: Buffer.from("point_name,vendor_point_id\nWCC_1_Control_Mode,//Elements/10101.AV1").toString("base64")
      }
    });
    expect(uploaded.statusCode).toBe(200);
    expect(uploaded.json()).toMatchObject({ project_id: "project_alpha", row_count: 1 });

    const created = await app.inject({
      method: "POST",
      url: "/api/bms/sources",
      headers: bearer(),
      payload: {
        project_id: "project_alpha",
        building_id: "project_alpha",
        name: "Mock BMS Demo",
        vendor_type: "mock",
        protocol_type: "mock",
        base_url: null,
        host: null,
        port: null,
        auth_type: "none",
        read_only: true,
        config: {}
      }
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({ project_id: "project_alpha", vendor_type: "mock" });

    const sourceId = created.json().source_id as string;
    const discovered = await app.inject({
      method: "POST",
      url: `/api/bms/sources/${sourceId}/discover-points`,
      headers: bearer()
    });
    expect(discovered.statusCode).toBe(200);
    expect(discovered.json().count).toBe(10);

    const test = await app.inject({
      method: "POST",
      url: "/api/bms/ingestion/test",
      headers: bearer(),
      payload: { source_id: sourceId, point_ids: ["src_001_pt_001"], sample_count: 5, interval_seconds: 2 }
    });
    expect(test.statusCode).toBe(200);
    expect(test.json()).toMatchObject({ status: "running" });
  });

  it("returns real CSV preview headers and rows from the uploaded file", async () => {
    const app = buildServer({ env: { USE_MOCK_BMS_CLIENT: "true", BMS_API_BASE_URL: "http://localhost:8100" } });

    await app.inject({ method: "POST", url: "/api/projects/project_alpha/select", headers: bearer() });

    const uploaded = await app.inject({
      method: "POST",
      url: "/api/bms/temp-upload",
      headers: bearer(),
      payload: {
        project_id: "project_alpha",
        file_name: "points.csv",
        mime_type: "text/csv",
        content_base64: Buffer.from(
          [
            "point_name,vendor_point_id,equipment_name,api_url",
            "WCC_1_Control_Mode,//Elements/10101.AV1,WCC 1,http://host/api/1",
            "WCC_1_Status,//Elements/10101.BV2,WCC 1,http://host/api/2"
          ].join("\n")
        ).toString("base64")
      }
    });

    expect(uploaded.statusCode).toBe(200);
    expect(uploaded.json()).toMatchObject({
      row_count: 2,
      preview_headers: ["point_name", "vendor_point_id", "equipment_name", "api_url"],
      preview_rows: [
        {
          point_name: "WCC_1_Control_Mode",
          vendor_point_id: "//Elements/10101.AV1",
          equipment_name: "WCC 1",
          api_url: "http://host/api/1"
        },
        {
          point_name: "WCC_1_Status",
          vendor_point_id: "//Elements/10101.BV2",
          equipment_name: "WCC 1",
          api_url: "http://host/api/2"
        }
      ]
    });
  });

  it("batches dashboard history queries and isolates per-point failures", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const href = String(url);
      if (href.includes("Broken_Point")) {
        throw new Error("collector offline");
      }
      if (href.includes("/api/v1/points?")) {
        const name = new URL(href).searchParams.get("q") ?? "Unknown_Point";
        return new Response(JSON.stringify({
          total: 1,
          items: [{ id: 101, name, object_ref: `//${name}` }]
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      const params = new URL(href).searchParams;
      const name = params.get("name") ?? (params.get("point_id") === "101" ? "Supply_Point" : "Unknown_Point");
      return new Response(JSON.stringify({
        total: 2,
        items: [
          { ts: "2026-06-24T01:00:00.000Z", name, value_num: 42.1 },
          { ts: "2026-06-24T02:00:00.000Z", name, value_num: 42.8 }
        ]
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const app = buildServer({
      env: { BMS_DATABASE_API_URL: "http://collector.test" },
      fetch: fetchMock as typeof fetch
    });

    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer() });

    const response = await app.inject({
      method: "POST",
      url: "/api/bms/dashboard/history-batch",
      headers: bearer(),
      payload: {
        queries: [
          { key: "supply", bms_source_id: "src_element_001", name: "Supply_Point", from: "2026-06-24T00:00:00.000Z", to: "2026-06-24T02:00:00.000Z", limit: "100", order: "asc" },
          { key: "return", bms_source_id: "src_element_001", name: "Broken_Point", from: "2026-06-24T00:00:00.000Z", to: "2026-06-24T02:00:00.000Z", limit: "100", order: "asc" }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      results: [
        { key: "supply", ok: true, total: 2, items: expect.arrayContaining([expect.objectContaining({ name: "Supply_Point" })]) },
        { key: "return", ok: false, total: 0, items: [], error: expect.stringContaining("collector offline") }
      ]
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calledUrls.some((url) => url.includes("/api/v1/points?"))).toBe(true);
    expect(calledUrls.some((url) => url.includes("/api/v1/readings?") && url.includes("point_id=101"))).toBe(true);
  });

  it("does not fall back to another BMS source when a dashboard query specifies an unknown source", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ total: 1, items: [{ name: "Supply_Point" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const app = buildServer({
      env: { BMS_DATABASE_API_URL: "http://collector.test" },
      fetch: fetchMock as typeof fetch
    });

    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer() });

    const latest = await app.inject({
      method: "POST",
      url: "/api/bms/dashboard/latest-batch",
      headers: bearer(),
      payload: {
        queries: [{ key: "missing-source-latest", bms_source_id: "src_missing", name: "Supply_Point" }]
      }
    });
    expect(latest.statusCode).toBe(200);
    expect(latest.json().results).toEqual([
      expect.objectContaining({
        key: "missing-source-latest",
        ok: false,
        point: null,
        error: "bms_source_not_configured",
        sourceId: "src_missing"
      })
    ]);

    const history = await app.inject({
      method: "POST",
      url: "/api/bms/dashboard/history-batch",
      headers: bearer(),
      payload: {
        queries: [{ key: "missing-source-history", bms_source_id: "src_missing", name: "Supply_Point", from: "2026-06-24T00:00:00.000Z" }]
      }
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().results).toEqual([
      expect.objectContaining({
        key: "missing-source-history",
        ok: false,
        total: 0,
        items: [],
        error: "bms_source_not_configured",
        sourceId: "src_missing"
      })
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns no-source for raw live BMS routes when the selected project has no BMS source", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ total: 1, items: [{ name: "WCC_3_Chilled_Water_Temp" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const app = buildServer({
      env: { BMS_DATABASE_API_URL: "http://collector.test" },
      fetch: fetchMock as typeof fetch
    });
    const mortarHeaders = bearer("seed-token-mortar-guest");

    await app.inject({ method: "POST", url: "/api/projects/project_mortar/select", headers: mortarHeaders });

    const health = await app.inject({ method: "GET", url: "/api/bms/health", headers: mortarHeaders });
    expect(health.statusCode).toBe(404);
    expect(health.json().error).toMatchObject({ code: "bms_source_not_configured" });

    const collector = await app.inject({ method: "GET", url: "/api/bms/collector/api/v1/points?q=WCC&limit=1", headers: mortarHeaders });
    expect(collector.statusCode).toBe(404);
    expect(collector.json().error).toMatchObject({ code: "bms_source_not_configured" });

    const latest = await app.inject({
      method: "POST",
      url: "/api/bms/dashboard/latest-batch",
      headers: mortarHeaders,
      payload: { queries: [{ key: "wcc", name: "WCC_3_Chilled_Water_Temp" }] }
    });
    expect(latest.statusCode).toBe(200);
    expect(latest.json().results).toEqual([
      expect.objectContaining({ key: "wcc", ok: false, point: null, error: "bms_source_not_configured" })
    ]);

    const history = await app.inject({
      method: "POST",
      url: "/api/bms/dashboard/history-batch",
      headers: mortarHeaders,
      payload: { queries: [{ key: "wcc", name: "WCC_3_Chilled_Water_Temp", from: "2026-06-24T00:00:00.000Z" }] }
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().results).toEqual([
      expect.objectContaining({ key: "wcc", ok: false, total: 0, items: [], error: "bms_source_not_configured" })
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not query the live BMS collector for Mortar FDD deployability", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ total: 1, items: [{ name: "WCC_3_Chilled_Water_Temp" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const app = buildServer({
      store: createSeedStore(),
      env: { BMS_DATABASE_API_URL: "http://collector.test" },
      fetch: fetchMock as typeof fetch
    });
    const mortarHeaders = bearer("seed-token-mortar-guest");

    await app.inject({ method: "POST", url: "/api/projects/project_mortar/select", headers: mortarHeaders });
    const response = await app.inject({
      method: "GET",
      url: "/api/projects/project_mortar/fdd-library",
      headers: mortarHeaders
    });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(response.json().checks)).not.toMatch(/WCC_|Element BMS/i);
    expect(response.json().checks.some((check: { historyIssues?: string[] }) =>
      check.historyIssues?.includes("No BMS source is configured for this project.")
    )).toBe(true);
  });

  it("rejects dashboard history batches over 32 queries", async () => {
    const app = buildServer();

    await app.inject({ method: "POST", url: "/api/projects/project_alpha/select", headers: bearer() });

    const response = await app.inject({
      method: "POST",
      url: "/api/bms/dashboard/history-batch",
      headers: bearer(),
      payload: {
        queries: Array.from({ length: 33 }, (_, index) => ({
          key: `q${index}`,
          name: `Point_${index}`,
          from: "2026-06-24T00:00:00.000Z"
        }))
      }
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error).toMatchObject({ code: "bms_history_batch_too_large" });
  });
});
