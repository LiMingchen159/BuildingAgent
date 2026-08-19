import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DerivedMetricStore } from "./derivedMetrics.js";
import { buildServer } from "./server.js";
import { createSeedStore } from "./seed.js";
import { ensureStoreFddLibrary, type ProjectFddTask } from "./fddLibrary.js";

const adaToken = "seed-token-ada";
const adminToken = "seed-token-buildinggpt";

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

function templateInput(store: ReturnType<typeof createSeedStore>) {
  const algorithm = store.fddAlgorithms!.find((entry) =>
    entry.algorithmKey === "chiller_ch_01_commanded_fails_to_start"
  )!;
  return {
    algorithm,
    payload: {
      algorithmId: algorithm.id,
      roles: algorithm.requiredPoints.filter((point) => point.required).map((point, index) => ({
        role: point.slot,
        familyKey: `wcc_family_${index + 1}`
      })),
      reason: "Administrator-reviewed Element fleet mapping."
    }
  };
}

describe("FDD fleet template project APIs", () => {
  it("enforces selected membership/read/configure permissions, CAS, and project isolation", async () => {
    const store = createSeedStore();
    const app = buildServer({ store });
    const input = templateInput(store);

    const notSelected = await app.inject({
      method: "GET",
      url: "/api/projects/project_element/fdd-fleet-templates",
      headers: bearer(adminToken)
    });
    expect(notSelected.statusCode).toBe(403);
    expect(notSelected.json().error.code).toBe("project_not_selected");

    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer(adaToken) });
    const forbidden = await app.inject({
      method: "POST",
      url: "/api/projects/project_element/fdd-fleet-templates",
      headers: bearer(adaToken),
      payload: input.payload
    });
    expect(forbidden.statusCode).toBe(403);

    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer(adminToken) });
    const created = await app.inject({
      method: "POST",
      url: "/api/projects/project_element/fdd-fleet-templates",
      headers: bearer(adminToken),
      payload: input.payload
    });
    expect(created.statusCode).toBe(201);
    const draft = created.json().template as { templateId: string; version: number; signature: string; state: string };
    expect(draft).toMatchObject({ version: 1, state: "draft" });

    const readable = await app.inject({
      method: "GET",
      url: "/api/projects/project_element/fdd-fleet-templates",
      headers: bearer(adaToken)
    });
    expect(readable.statusCode).toBe(200);
    expect(readable.json()).toMatchObject({ totalCount: 1, templates: [{ templateId: draft.templateId }] });

    const locked = await app.inject({
      method: "PATCH",
      url: `/api/projects/project_element/fdd-fleet-templates/${draft.templateId}`,
      headers: bearer(adminToken),
      payload: {
        action: "lock",
        baseVersion: draft.version,
        baseSignature: draft.signature,
        reason: "Approve this mapping for future FleetGuard plans."
      }
    });
    expect(locked.statusCode).toBe(200);
    expect(locked.json().template).toMatchObject({ version: 2, state: "locked" });

    const stale = await app.inject({
      method: "PATCH",
      url: `/api/projects/project_element/fdd-fleet-templates/${draft.templateId}`,
      headers: bearer(adminToken),
      payload: {
        action: "lock",
        baseVersion: draft.version,
        baseSignature: draft.signature,
        reason: "A stale concurrent request must fail."
      }
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe("fdd_fleet_template_stale");

    const detail = await app.inject({
      method: "GET",
      url: `/api/projects/project_element/fdd-fleet-templates/${draft.templateId}`,
      headers: bearer(adaToken)
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().template).toMatchObject({
      head: { version: 2, state: "locked" },
      versions: [{ version: 1 }, { version: 2 }],
      audit: [{ action: "create" }, { action: "lock" }]
    });

    await app.inject({ method: "POST", url: "/api/projects/project_mortar/select", headers: bearer(adminToken) });
    const crossProject = await app.inject({
      method: "GET",
      url: `/api/projects/project_mortar/fdd-fleet-templates/${draft.templateId}`,
      headers: bearer(adminToken)
    });
    expect(crossProject.statusCode).toBe(404);
    expect(crossProject.json().error.code).toBe("fdd_fleet_template_not_found");
    await app.close();
  });

  it("does not mutate running tasks, checks, runs, dashboards, or messages and deletes only project-scoped template data", async () => {
    const store = createSeedStore();
    const dataDir = mkdtempSync(path.join(tmpdir(), "ba-fdd-fleet-template-"));
    ensureStoreFddLibrary(store);
    const { algorithm, payload } = templateInput(store);
    const runningTask: ProjectFddTask = {
      id: "fddtask_running_unchanged",
      projectId: "project_element",
      source: "global_library",
      sharingScope: "global_community",
      globalAlgorithmId: algorithm.id,
      algorithmSnapshot: structuredClone(algorithm),
      status: "running",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z"
    };
    store.fddTasksByProject!.project_element = [runningTask];
    store.fddChecksByProject!.project_element = [];
    store.fddLibraryCheckRunsByProject!.project_element = [{
      id: "run_unchanged",
      projectId: "project_element",
      algorithmIds: [algorithm.id],
      projectDataSignature: "project-signature-without-template",
      createdAt: "2026-08-01T00:00:00.000Z"
    }];
    const app = buildServer({
      store,
      env: {
        BUILDING_AGENT_DATA_DIR: dataDir,
        DERIVED_METRIC_MATERIALIZER_DISABLED: "1"
      }
    });
    const metrics = new DerivedMetricStore(dataDir);
    const runtime = metrics.registerMetric({
      projectId: "project_element",
      metricKey: algorithm.algorithmKey,
      metricType: "fdd",
      entityId: "WCC_01",
      displayName: "Existing WCC-01 FDD runtime",
      formula: "existing evaluator",
      formulaVersion: algorithm.version,
      dependencies: [{ role: "command", sourceId: "WCC_1_Start_Stop" }]
    }).instance;
    metrics.recordSample({
      instanceId: runtime.instanceId,
      ts: "2026-08-01T01:00:00.000Z",
      valueNum: 1,
      status: "fault",
      quality: "good",
      calculationRunId: "existing-fdd-run"
    });
    metrics.configureMaterialization({
      instanceId: runtime.instanceId,
      enabled: false,
      watermarkTs: "2026-08-01T01:00:00.000Z",
      status: "paused"
    });
    const before = JSON.stringify({
      tasks: store.fddTasksByProject,
      checks: store.fddChecksByProject,
      runs: store.fddLibraryCheckRunsByProject,
      dashboards: store.dashboardsByProject,
      messages: store.messagesByProject
    });
    const runtimeBefore = JSON.stringify({
      instance: metrics.getInstance(runtime.instanceId),
      latest: metrics.readLatest(runtime.instanceId),
      history: metrics.readHistory(runtime.instanceId),
      materialization: metrics.readMaterialization(runtime.instanceId)
    });
    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer(adminToken) });
    const created = await app.inject({
      method: "POST",
      url: "/api/projects/project_element/fdd-fleet-templates",
      headers: bearer(adminToken),
      payload
    });
    expect(created.statusCode).toBe(201);
    const draft = created.json().template as { templateId: string; version: number; signature: string };
    const locked = await app.inject({
      method: "PATCH",
      url: `/api/projects/project_element/fdd-fleet-templates/${draft.templateId}`,
      headers: bearer(adminToken),
      payload: {
        action: "lock",
        baseVersion: draft.version,
        baseSignature: draft.signature,
        reason: "Future plans only."
      }
    });
    expect(locked.statusCode).toBe(200);
    expect(JSON.stringify({
      tasks: store.fddTasksByProject,
      checks: store.fddChecksByProject,
      runs: store.fddLibraryCheckRunsByProject,
      dashboards: store.dashboardsByProject,
      messages: store.messagesByProject
    })).toBe(before);
    expect(JSON.stringify({
      instance: metrics.getInstance(runtime.instanceId),
      latest: metrics.readLatest(runtime.instanceId),
      history: metrics.readHistory(runtime.instanceId),
      materialization: metrics.readMaterialization(runtime.instanceId)
    })).toBe(runtimeBefore);

    const deleted = await app.inject({
      method: "DELETE",
      url: "/api/projects/project_element",
      headers: bearer(adminToken)
    });
    expect(deleted.statusCode).toBe(200);
    expect(store.fddFleetTemplateVersionsByProject?.project_element).toBeUndefined();
    expect(store.fddFleetTemplateAuditByProject?.project_element).toBeUndefined();
    await app.close();
  });
});
