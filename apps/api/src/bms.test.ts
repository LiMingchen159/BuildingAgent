import { describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DerivedMetricStore } from "./derivedMetrics.js";
import { ensureStoreFddLibrary, evaluateFddDeployability, type FddPointCandidate, type ProjectFddTask } from "./fddLibrary.js";
import { buildServer } from "./server.js";
import { createSeedStore } from "./seed.js";

const adaToken = "seed-token-ada";

function bearer(value = adaToken) {
  return { authorization: `Bearer ${value}` };
}

function writeEquipmentInventoryFixture(
  dataDir: string,
  projectId: string,
  equipment: Array<{ prefix: string; brickClass: string; count: number }>
): void {
  const kbDir = path.join(dataDir, projectId, "kb");
  mkdirSync(kbDir, { recursive: true });
  writeFileSync(path.join(kbDir, "KB_CATALOG_SUMMARY.md"), "# Test catalog\n\n## Full equipment inventory\n", "utf8");
  const ttl = [
    "@prefix brick: <https://brickschema.org/schema/Brick#> .",
    "@prefix test: <urn:test#> .",
    "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .",
    ...equipment.flatMap(({ prefix, brickClass, count }) => Array.from({ length: count }, (_, index) => {
      const suffix = String(index + 1).padStart(2, "0");
      return `test:${prefix}_${suffix} a brick:${brickClass} ;\n    rdfs:label \"${prefix} ${index + 1}\" .`;
    }))
  ].join("\n\n");
  writeFileSync(path.join(kbDir, "brick_model.ttl"), ttl, "utf8");
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
    const store = createSeedStore();
    const app = buildServer({
      store,
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
    const firstRunCount = store.fddLibraryCheckRunsByProject?.project_mortar?.length ?? 0;
    const repeated = await app.inject({
      method: "GET",
      url: "/api/projects/project_mortar/fdd-library",
      headers: mortarHeaders
    });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json().checksPending).toBe(false);
    expect(store.fddLibraryCheckRunsByProject?.project_mortar?.length ?? 0).toBe(firstRunCount);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses Brick equipment facts before algorithm matching for WKGO and Element", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "ba-fdd-equipment-inventory-"));
    writeEquipmentInventoryFixture(dataDir, "project_msxh8iar_dfs1hk", [{ prefix: "WKGO_CHILLER", brickClass: "Chiller", count: 6 }]);
    writeEquipmentInventoryFixture(dataDir, "project_element", [
      { prefix: "WCC", brickClass: "Water_Cooled_Chiller", count: 8 },
      { prefix: "CHP", brickClass: "Chilled_Water_Pump", count: 10 },
      { prefix: "SWP", brickClass: "Water_Pump", count: 5 }
    ]);
    const incompleteKbDir = path.join(dataDir, "project_incomplete_inventory", "kb");
    mkdirSync(incompleteKbDir, { recursive: true });
    writeFileSync(path.join(incompleteKbDir, "KB_CATALOG_SUMMARY.md"), "# Test catalog\n\n## Full equipment inventory\n", "utf8");
    const store = createSeedStore();
    const wkgoProjectId = "project_msxh8iar_dfs1hk";
    store.projects.push({ id: wkgoProjectId, name: "WKGO" });
    store.memberships.push({ userId: "user_ada", projectId: wkgoProjectId, permissions: ["chat:read", "chat:write"] });
    store.projects.push({ id: "project_incomplete_inventory", name: "Incomplete Inventory" });
    store.memberships.push({ userId: "user_ada", projectId: "project_incomplete_inventory", permissions: ["chat:read", "chat:write"] });
    store.knowledgeBaseByProject[wkgoProjectId] = [];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ total: 0, items: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    const app = buildServer({
      store,
      fetch: fetchMock as typeof fetch,
      env: {
        BUILDING_AGENT_DATA_DIR: dataDir,
        BMS_DATABASE_API_URL: "http://collector.test",
        DERIVED_METRIC_MATERIALIZER_DISABLED: "1"
      }
    });

    await app.inject({ method: "POST", url: `/api/projects/${wkgoProjectId}/select`, headers: bearer() });
    const wkgoLibrary = await app.inject({ method: "GET", url: `/api/projects/${wkgoProjectId}/fdd-library`, headers: bearer() });
    expect(wkgoLibrary.statusCode).toBe(200);
    expect(wkgoLibrary.json().equipmentAvailability).toEqual([
      expect.objectContaining({ equipmentType: "chiller", status: "available", entityCount: 6 }),
      expect.objectContaining({ equipmentType: "pump", status: "not_available", entityCount: 0 }),
      expect.objectContaining({ equipmentType: "cooling_tower", status: "not_available", entityCount: 0 }),
      expect.objectContaining({ equipmentType: "ahu", status: "not_available", entityCount: 0 }),
      expect.objectContaining({ equipmentType: "fcu", status: "not_available", entityCount: 0 }),
      expect.objectContaining({ equipmentType: "vav", status: "not_available", entityCount: 0 })
    ]);
    const pumpAlgorithm = store.fddAlgorithms?.find((entry) => entry.algorithmKey === "pump_fdd_01");
    expect(pumpAlgorithm).toBeTruthy();
    if (!pumpAlgorithm) return;
    const pumpCheck = await app.inject({
      method: "POST",
      url: `/api/projects/${wkgoProjectId}/fdd-library/${pumpAlgorithm.id}/test`,
      headers: bearer()
    });
    expect(pumpCheck.json().check).toMatchObject({
      status: "cannot_deploy",
      applicability: "no_equipment",
      pointCandidates: [],
      missingPoints: [],
      equipmentAvailability: { equipmentType: "pump", status: "not_available", entityCount: 0 }
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer() });
    const elementLibrary = await app.inject({ method: "GET", url: "/api/projects/project_element/fdd-library", headers: bearer() });
    expect(elementLibrary.json().equipmentAvailability).toEqual(expect.arrayContaining([
      expect.objectContaining({ equipmentType: "chiller", status: "available", entityCount: 8 }),
      expect.objectContaining({ equipmentType: "pump", status: "available", entityCount: 15 })
    ]));
    expect(elementLibrary.json().checksPending).toBe(true);
    await vi.waitFor(() => {
      expect(store.fddLibraryCheckRunsByProject?.project_element?.length ?? 0).toBeGreaterThan(0);
    }, { timeout: 5_000 });
    const elementRunCount = store.fddLibraryCheckRunsByProject?.project_element?.length ?? 0;
    const repeatedElementLibrary = await app.inject({ method: "GET", url: "/api/projects/project_element/fdd-library", headers: bearer() });
    expect(repeatedElementLibrary.statusCode).toBe(200);
    expect(repeatedElementLibrary.json().checksPending).toBe(false);
    expect(store.fddLibraryCheckRunsByProject?.project_element?.length ?? 0).toBe(elementRunCount);

    await app.inject({ method: "POST", url: "/api/projects/project_incomplete_inventory/select", headers: bearer() });
    const incompleteLibrary = await app.inject({ method: "GET", url: "/api/projects/project_incomplete_inventory/fdd-library", headers: bearer() });
    expect(incompleteLibrary.json().equipmentAvailability).toEqual(expect.arrayContaining([
      expect.objectContaining({ equipmentType: "chiller", status: "unknown", entityCount: 0 }),
      expect.objectContaining({ equipmentType: "pump", status: "unknown", entityCount: 0 })
    ]));
    await app.close();
  });

  it("allows catalog checks but rejects deployment for specification-only DOCX algorithms", async () => {
    const store = createSeedStore();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ total: 0, items: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    const app = buildServer({ store, fetch: fetchMock as typeof fetch });
    await app.inject({ method: "POST", url: "/api/projects/project_alpha/select", headers: bearer() });

    const algorithm = store.fddAlgorithms?.find((entry) => entry.algorithmKey === "vav_fdd_01");
    expect(algorithm).toBeTruthy();
    if (!algorithm) return;

    const checked = await app.inject({
      method: "POST",
      url: `/api/projects/project_alpha/fdd-library/${algorithm.id}/test`,
      headers: bearer()
    });
    expect(checked.statusCode).toBe(200);
    expect(checked.json().algorithm).toMatchObject({ algorithmKey: "vav_fdd_01", deployableRuntime: false });

    const beforeTasks = store.fddTasksByProject?.project_alpha?.length ?? 0;
    const deployed = await app.inject({
      method: "POST",
      url: `/api/projects/project_alpha/fdd-library/${algorithm.id}/deploy`,
      headers: bearer()
    });
    expect(deployed.statusCode).toBe(422);
    expect(deployed.json().error).toMatchObject({ code: "fdd_runtime_not_supported" });
    expect(store.fddTasksByProject?.project_alpha?.length ?? 0).toBe(beforeTasks);
  });

  it("keeps uploaded specifications non-runnable through create, test, and deploy", async () => {
    const store = createSeedStore();
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const href = String(url);
      if (href.includes("/api/v1/points?")) {
        return new Response(JSON.stringify({
          total: 1,
          items: [{
            id: 501,
            name: "VAV_01_Zone_Temperature",
            object_ref: "//VAV/01/ZoneTemperature",
            description: "VAV zone air temperature sensor",
            unit: "degC"
          }]
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      const to = new URL(href).searchParams.get("to");
      const ts = to ? "2023-01-01T00:00:00.000Z" : "2023-05-10T00:00:00.000Z";
      return new Response(JSON.stringify({
        total: 100,
        items: [{ ts, name: "VAV_01_Zone_Temperature", object_ref: "//VAV/01/ZoneTemperature", value_num: 23.5 }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const app = buildServer({
      store,
      env: { BMS_DATABASE_API_URL: "http://collector.test" },
      fetch: fetchMock as typeof fetch
    });
    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer() });

    const created = await app.inject({
      method: "POST",
      url: "/api/projects/project_element/fdd-tasks",
      headers: bearer(),
      payload: {
        name: "Uploaded VAV temperature specification",
        equipmentType: "vav",
        faultType: "zone temperature",
        method: "rule_based",
        sharingScope: "project_only",
        formula: "fault = zone_temp > zone_temp_setpoint + threshold",
        logicSummary: "Uploaded specification without a registered evaluator.",
        requiredPoints: [
          { slot: "zone_temp", label: "Zone temperature", semantic: "Zone air temperature", required: true }
        ]
      }
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().task).toMatchObject({ status: "cannot_deploy", algorithmSnapshot: { deployableRuntime: false } });
    const taskId = created.json().task.id as string;

    const checked = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-tasks/${taskId}/test`,
      headers: bearer()
    });
    expect(checked.statusCode).toBe(200);
    expect(checked.json().task.status).toBe("cannot_deploy");
    expect(checked.json().task.deployabilityCheck).toMatchObject({
      applicability: "no_equipment",
      equipmentAvailability: { equipmentType: "vav", status: "not_available", entityCount: 0 },
      pointCandidates: [],
      missingPoints: []
    });
    const historyProbeUrls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((href) => href.includes("/api/v1/readings?"));
    expect(historyProbeUrls).toEqual([]);

    const deployed = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-tasks/${taskId}/deploy`,
      headers: bearer()
    });
    expect(deployed.statusCode).toBe(422);
    expect(deployed.json().error).toMatchObject({ code: "fdd_runtime_not_supported" });
  });

  it("rejects cached deployability checks created before observed-history validation", async () => {
    const store = createSeedStore();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ total: 0, items: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    const app = buildServer({
      store,
      env: { BMS_DATABASE_API_URL: "http://collector.test" },
      fetch: fetchMock as typeof fetch
    });
    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer() });

    const algorithm = store.fddAlgorithms?.find((entry) => entry.algorithmKey === "chiller_low_cop_detection");
    expect(algorithm).toBeTruthy();
    if (!algorithm) return;

    const checked = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithm.id}/test`,
      headers: bearer()
    });
    expect(checked.statusCode).toBe(200);
    expect(checked.json().check).toMatchObject({
      status: "cannot_deploy",
      checkPolicyVersion: "v5-evidence-backed-missing-unit"
    });

    const legacyCheck = store.fddChecksByProject?.project_element?.[0];
    expect(legacyCheck).toBeTruthy();
    if (!legacyCheck) return;
    legacyCheck.checkPolicyVersion = "v4-homogeneous-fleet";
    legacyCheck.status = "can_deploy";
    legacyCheck.missingPoints = [];
    legacyCheck.historyIssues = [];
    legacyCheck.deployableEntities = [];
    legacyCheck.checkedAt = "2026-01-01T00:00:00.000Z";

    const deployed = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithm.id}/deploy`,
      headers: bearer()
    });
    expect(deployed.statusCode).toBe(422);
    expect(store.fddChecksByProject?.project_element?.[0]).not.toBe(legacyCheck);
    expect(store.fddChecksByProject?.project_element?.[0]).toMatchObject({
      status: "cannot_deploy",
      checkPolicyVersion: "v5-evidence-backed-missing-unit"
    });

    const staleCheck = store.fddChecksByProject?.project_element?.[0];
    expect(staleCheck).toBeTruthy();
    if (!staleCheck) return;
    staleCheck.status = "can_deploy";
    staleCheck.checkedAt = "2026-01-01T00:00:00.000Z";
    staleCheck.missingPoints = [];
    staleCheck.historyIssues = [];
    staleCheck.deployableEntities = [];
    const staleDeploy = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithm.id}/deploy`,
      headers: bearer()
    });
    expect(staleDeploy.statusCode).toBe(422);
    expect(store.fddChecksByProject?.project_element?.[0]?.checkedAt).not.toBe("2026-01-01T00:00:00.000Z");
  });

  it("pauses legacy running FDD materializations until equipment-first revalidation", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "ba-fdd-policy-migration-"));
    const env = {
      BUILDING_AGENT_DATA_DIR: dataDir,
      DERIVED_METRIC_MATERIALIZER_DISABLED: "1"
    };
    const store = createSeedStore();
    ensureStoreFddLibrary(store);
    const algorithm = store.fddAlgorithms?.find((entry) => entry.algorithmKey === "chiller_low_cop_detection");
    expect(algorithm).toBeTruthy();
    if (!algorithm) return;

    const candidates = algorithm.requiredPoints.filter((point) => point.required).map((point): FddPointCandidate => ({
      slot: point.slot,
      pointName: `CHILLER_01_${point.slot}`,
      entityKey: "CHILLER_01",
      unitCompatibility: "match",
      dimensionReason: "Legacy fixture dimension match.",
      confidence: 0.95,
      historyDays: 30,
      reason: "Legacy fixture"
    }));
    const check = evaluateFddDeployability({
      algorithm,
      projectId: "project_element",
      source: "auto",
      projectDataSignature: "legacy-signature",
      pointCandidates: candidates,
      exampleEntityKey: "CHILLER_01",
      deployableEntities: [{
        entityKey: "CHILLER_01",
        status: "can_deploy",
        selectedMappings: candidates.map((candidate) => ({ slot: candidate.slot, pointName: candidate.pointName })),
        ambiguousInputs: [],
        missingPoints: [],
        historyIssues: [],
        confidence: 0.95
      }]
    });
    delete check.checkPolicyVersion;
    const task: ProjectFddTask = {
      id: "fddtask_legacy_running",
      projectId: "project_element",
      source: "global_library",
      sharingScope: "global_community",
      globalAlgorithmId: algorithm.id,
      algorithmSnapshot: { ...algorithm },
      status: "running",
      deployabilityCheck: check,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    };
    store.fddTasksByProject ??= {};
    store.fddTasksByProject.project_element = [task];

    const metrics = new DerivedMetricStore(dataDir);
    const instance = metrics.registerMetric({
      projectId: "project_element",
      metricKey: algorithm.algorithmKey,
      entityId: "CHILLER_01",
      displayName: "Legacy running FDD",
      metricType: "fdd",
      formulaVersion: algorithm.version,
      formula: algorithm.formula,
      metadata: { fddTaskId: task.id, fddAlgorithmId: algorithm.id },
      dependencies: [{ role: "chiller_status", sourceId: "CHILLER_01_STATUS", pointName: "CHILLER_01_STATUS" }]
    }).instance;
    metrics.configureMaterialization({
      instanceId: instance.instanceId,
      enabled: true,
      formulaKind: "fdd_rule",
      status: "active"
    });

    const app = buildServer({ store, env });
    expect(store.fddTasksByProject.project_element?.[0]?.status).toBe("checking");
    const migratedMetrics = new DerivedMetricStore(dataDir);
    expect(migratedMetrics.readMaterialization(instance.instanceId)).toMatchObject({
      enabled: false,
      status: "authorization_required",
      lastError: "fdd_deployability_policy_revalidation_required"
    });
    await app.close();
  });

  it("keeps a current authorization across restart but rejects a cached cross-fleet object reference", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "ba-fdd-policy-restart-"));
    writeEquipmentInventoryFixture(dataDir, "project_element", [
      { prefix: "WCC", brickClass: "Water_Cooled_Chiller", count: 2 }
    ]);
    const env = {
      BUILDING_AGENT_DATA_DIR: dataDir,
      DERIVED_METRIC_MATERIALIZER_DISABLED: "1",
      BMS_DATABASE_API_URL: "http://collector.test"
    };
    const store = createSeedStore();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ total: 0, items: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    const firstApp = buildServer({ store, env, fetch: fetchMock as typeof fetch });
    await firstApp.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer() });
    const algorithm = store.fddAlgorithms?.find((entry) => entry.algorithmKey === "chiller_low_cop_detection");
    expect(algorithm).toBeTruthy();
    if (!algorithm) return;
    await firstApp.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithm.id}/test`,
      headers: bearer()
    });
    const check = store.fddChecksByProject?.project_element?.[0];
    expect(check?.checkPolicyVersion).toBe("v5-evidence-backed-missing-unit");
    if (!check) return;
    check.status = "can_deploy";
    check.missingPoints = [];
    check.historyIssues = [];
    const selectedMappings = (entityKey: string) => algorithm.requiredPoints
      .filter((point) => point.required)
      .map((point) => ({
        slot: point.slot,
        pointName: `${entityKey}_${point.slot}`,
        objectRef: `fixture://${entityKey}/${point.slot}`
      }));
    check.deployableEntities = ["WCC_01", "WCC_02"].map((entityKey) => ({
      entityKey,
      status: "can_deploy" as const,
      selectedMappings: selectedMappings(entityKey),
      ambiguousInputs: [],
      missingPoints: [],
      historyIssues: [],
      confidence: 1
    }));
    const task: ProjectFddTask = {
      id: "fddtask_policy_v2_restart",
      projectId: "project_element",
      source: "global_library",
      sharingScope: "global_community",
      globalAlgorithmId: algorithm.id,
      algorithmSnapshot: { ...algorithm },
      status: "running",
      deployabilityCheck: check,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    store.fddTasksByProject ??= {};
    store.fddTasksByProject.project_element = [task];
    const metrics = new DerivedMetricStore(dataDir);
    const instance = metrics.registerMetric({
      projectId: "project_element",
      metricKey: algorithm.algorithmKey,
      entityId: "WCC_01",
      metricType: "fdd",
      formula: algorithm.formula,
      metadata: { fddTaskId: task.id, fddAlgorithmId: algorithm.id },
      dependencies: [{ role: "chiller_status", sourceId: "WCC_01_STATUS" }]
    }).instance;
    metrics.configureMaterialization({ instanceId: instance.instanceId, enabled: true, formulaKind: "fdd_rule" });
    await firstApp.close();

    const restartedApp = buildServer({ store, env, fetch: fetchMock as typeof fetch });
    expect(store.fddTasksByProject.project_element?.[0]?.status).toBe("running");
    expect(new DerivedMetricStore(dataDir).readMaterialization(instance.instanceId)?.enabled).toBe(true);
    await restartedApp.close();

    const cachedEntities = check.deployableEntities;
    expect(cachedEntities).toHaveLength(2);
    cachedEntities![1]!.selectedMappings[0]!.objectRef = cachedEntities![0]!.selectedMappings[0]!.objectRef!;
    const corruptRestart = buildServer({ store, env, fetch: fetchMock as typeof fetch });
    expect(store.fddTasksByProject.project_element?.[0]?.status).toBe("checking");
    expect(new DerivedMetricStore(dataDir).readMaterialization(instance.instanceId)).toMatchObject({
      enabled: false,
      status: "authorization_required"
    });
    await corruptRestart.close();
  });

  it("defers source-signature invalidation while a post-start source is absent", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "ba-fdd-policy-bootstrap-"));
    writeEquipmentInventoryFixture(dataDir, "project_alpha", [
      { prefix: "CHILLER", brickClass: "Chiller", count: 1 }
    ]);
    const env = {
      BUILDING_AGENT_DATA_DIR: dataDir,
      DERIVED_METRIC_MATERIALIZER_DISABLED: "1"
    };
    const store = createSeedStore();
    const fixtureApp = buildServer({ store, env });
    await fixtureApp.inject({ method: "POST", url: "/api/projects/project_alpha/select", headers: bearer() });
    const algorithm = store.fddAlgorithms?.find((entry) => entry.algorithmKey === "chiller_low_cop_detection");
    expect(algorithm).toBeTruthy();
    if (!algorithm) return;
    await fixtureApp.inject({
      method: "POST",
      url: `/api/projects/project_alpha/fdd-library/${algorithm.id}/test`,
      headers: bearer()
    });
    const check = store.fddChecksByProject?.project_alpha?.[0];
    expect(check?.applicability).toBe("applicable");
    expect(check?.equipmentAvailability?.status).toBe("available");
    expect(check?.equipmentInventorySignature).toBeTruthy();
    if (!check) return;
    await fixtureApp.close();
    check.projectDataSignature = "signature-from-restored-source";
    check.status = "can_deploy";
    check.missingPoints = [];
    check.historyIssues = [];
    const selectedMappings = algorithm.requiredPoints
      .filter((point) => point.required)
      .map((point) => ({
        slot: point.slot,
        pointName: `CHILLER_01_${point.slot}`,
        objectRef: `fixture://CHILLER_01/${point.slot}`
      }));
    check.deployableEntities = [{
      entityKey: "CHILLER_01",
      status: "can_deploy",
      selectedMappings,
      ambiguousInputs: [],
      missingPoints: [],
      historyIssues: [],
      confidence: 1
    }];
    const task: ProjectFddTask = {
      id: "fddtask_source_bootstrap",
      projectId: "project_alpha",
      source: "global_library",
      sharingScope: "global_community",
      globalAlgorithmId: algorithm.id,
      algorithmSnapshot: { ...algorithm },
      status: "running",
      deployabilityCheck: check,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    store.fddTasksByProject ??= {};
    store.fddTasksByProject.project_alpha = [task];
    const metrics = new DerivedMetricStore(dataDir);
    const instance = metrics.registerMetric({
      projectId: "project_alpha",
      metricKey: algorithm.algorithmKey,
      entityId: "CHILLER_01",
      metricType: "fdd",
      formula: algorithm.formula,
      metadata: { fddTaskId: task.id, fddAlgorithmId: algorithm.id },
      dependencies: [{ role: "chiller_status", sourceId: "CHILLER_01_STATUS" }]
    }).instance;
    metrics.configureMaterialization({ instanceId: instance.instanceId, enabled: true, formulaKind: "fdd_rule" });

    const app = buildServer({ store, env });
    expect(store.fddTasksByProject.project_alpha?.[0]?.status).toBe("running");
    expect(new DerivedMetricStore(dataDir).readMaterialization(instance.instanceId)?.enabled).toBe(true);
    await app.close();
  });

  it("disables a specification-only FDD materialization after it is manually re-enabled", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "ba-fdd-spec-materializer-"));
    writeEquipmentInventoryFixture(dataDir, "project_element", [
      { prefix: "VAV", brickClass: "VAV", count: 1 }
    ]);
    const disabledEnv = {
      BUILDING_AGENT_DATA_DIR: dataDir,
      DERIVED_METRIC_MATERIALIZER_DISABLED: "1"
    };
    const store = createSeedStore();
    const fixtureApp = buildServer({ store, env: disabledEnv });
    await fixtureApp.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer() });
    const algorithm = store.fddAlgorithms?.find((entry) => entry.algorithmKey === "vav_fdd_01");
    expect(algorithm).toMatchObject({ deployableRuntime: false });
    if (!algorithm) return;
    await fixtureApp.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithm.id}/test`,
      headers: bearer()
    });
    const check = store.fddChecksByProject?.project_element?.find((entry) => entry.algorithmId === algorithm.id);
    expect(check?.applicability).toBe("applicable");
    expect(check?.equipmentAvailability?.status).toBe("available");
    if (!check) return;
    const selectedMappings = algorithm.requiredPoints
      .filter((point) => point.required)
      .map((point) => ({
        slot: point.slot,
        pointName: `VAV_01_${point.slot}`,
        objectRef: `fixture://VAV_01/${point.slot}`
      }));
    check.status = "can_deploy";
    check.missingPoints = [];
    check.historyIssues = [];
    check.ambiguousInputs = [];
    check.exampleEntityKey = "VAV_01";
    check.selectedMappings = selectedMappings;
    check.deployableEntities = [{
      entityKey: "VAV_01",
      status: "can_deploy",
      selectedMappings,
      ambiguousInputs: [],
      missingPoints: [],
      historyIssues: [],
      confidence: 1
    }];
    const task: ProjectFddTask = {
      id: "fddtask_spec_only_materializer",
      projectId: "project_element",
      source: "global_library",
      sharingScope: "global_community",
      globalAlgorithmId: algorithm.id,
      algorithmSnapshot: { ...algorithm },
      status: "cannot_deploy",
      deployabilityCheck: check,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    store.fddTasksByProject ??= {};
    store.fddTasksByProject.project_element = [task];
    const metrics = new DerivedMetricStore(dataDir);
    const instance = metrics.registerMetric({
      projectId: "project_element",
      metricKey: algorithm.algorithmKey,
      entityId: "VAV_01",
      metricType: "fdd",
      formula: algorithm.formula,
      metadata: { fddTaskId: task.id, fddAlgorithmId: algorithm.id },
      dependencies: selectedMappings.map((mapping) => ({
        role: mapping.slot,
        sourceId: mapping.pointName,
        pointName: mapping.pointName
      }))
    }).instance;
    metrics.configureMaterialization({ instanceId: instance.instanceId, enabled: true, formulaKind: "fdd_rule" });
    await fixtureApp.close();

    const app = buildServer({ store, env: { BUILDING_AGENT_DATA_DIR: dataDir } });
    expect(metrics.readMaterialization(instance.instanceId)?.enabled).toBe(false);
    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer() });
    const enabled = await app.inject({
      method: "PATCH",
      url: `/api/projects/project_element/derived-metrics/${instance.instanceId}/materialization`,
      headers: bearer(),
      payload: { enabled: true }
    });
    expect(enabled.statusCode).toBe(200);
    expect(enabled.json().metric.materialization.enabled).toBe(true);

    const deadline = Date.now() + 7_000;
    while (metrics.readMaterialization(instance.instanceId)?.enabled && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(metrics.readMaterialization(instance.instanceId)).toMatchObject({
      enabled: false,
      status: "authorization_required",
      lastError: "fdd_equipment_inventory_revalidation_required"
    });
    await app.close();
  }, 10_000);

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
