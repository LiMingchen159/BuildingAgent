import { describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
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
    expect(checked.json().task.deployabilityCheck.pointCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ pointName: "VAV_01_Zone_Temperature", historyDays: expect.any(Number) })
    ]));
    expect(checked.json().task.deployabilityCheck.historyIssues).not.toContain(expect.stringContaining("history coverage is unverified"));
    const historyProbeUrls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((href) => href.includes("/api/v1/readings?"));
    expect(historyProbeUrls.length).toBeGreaterThanOrEqual(2);
    expect(historyProbeUrls.every((href) => new URL(href).searchParams.get("order") === "desc")).toBe(true);
    expect(historyProbeUrls.some((href) => new URL(href).searchParams.has("to"))).toBe(true);

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
      checkPolicyVersion: "v2-observed-history"
    });

    const legacyCheck = store.fddChecksByProject?.project_element?.[0];
    expect(legacyCheck).toBeTruthy();
    if (!legacyCheck) return;
    delete legacyCheck.checkPolicyVersion;
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
      checkPolicyVersion: "v2-observed-history"
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

  it("pauses legacy running FDD materializations until policy-v2 revalidation", async () => {
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

  it("keeps a current policy-v2 FDD authorization across source reconstruction", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "ba-fdd-policy-restart-"));
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
    expect(check?.checkPolicyVersion).toBe("v2-observed-history");
    if (!check) return;
    check.status = "can_deploy";
    check.missingPoints = [];
    check.historyIssues = [];
    check.deployableEntities = [{
      entityKey: "CHILLER_01",
      status: "can_deploy",
      selectedMappings: [],
      ambiguousInputs: [],
      missingPoints: [],
      historyIssues: [],
      confidence: 1
    }];
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
      entityId: "CHILLER_01",
      metricType: "fdd",
      formula: algorithm.formula,
      metadata: { fddTaskId: task.id, fddAlgorithmId: algorithm.id },
      dependencies: [{ role: "chiller_status", sourceId: "CHILLER_01_STATUS" }]
    }).instance;
    metrics.configureMaterialization({ instanceId: instance.instanceId, enabled: true, formulaKind: "fdd_rule" });
    await firstApp.close();

    const restartedApp = buildServer({ store, env, fetch: fetchMock as typeof fetch });
    expect(store.fddTasksByProject.project_element?.[0]?.status).toBe("running");
    expect(new DerivedMetricStore(dataDir).readMaterialization(instance.instanceId)?.enabled).toBe(true);
    await restartedApp.close();
  });

  it("defers source-signature invalidation while a post-start source is absent", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "ba-fdd-policy-bootstrap-"));
    const env = {
      BUILDING_AGENT_DATA_DIR: dataDir,
      DERIVED_METRIC_MATERIALIZER_DISABLED: "1"
    };
    const store = createSeedStore();
    ensureStoreFddLibrary(store);
    const algorithm = store.fddAlgorithms?.find((entry) => entry.algorithmKey === "chiller_low_cop_detection");
    expect(algorithm).toBeTruthy();
    if (!algorithm) return;
    const check = evaluateFddDeployability({
      algorithm,
      projectId: "project_alpha",
      source: "auto",
      projectDataSignature: "signature-from-restored-source",
      pointCandidates: [],
      deployableEntities: []
    });
    check.status = "can_deploy";
    check.missingPoints = [];
    check.historyIssues = [];
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
