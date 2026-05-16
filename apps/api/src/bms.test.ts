import { describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

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
});
