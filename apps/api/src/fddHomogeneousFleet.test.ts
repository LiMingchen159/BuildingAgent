import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DerivedMetricStore } from "./derivedMetrics.js";
import { buildServer } from "./server.js";
import { createSeedStore } from "./seed.js";
import { ensureStoreFddLibrary } from "./fddLibrary.js";
import { createFddFleetTemplateBindings } from "./fdd/fleetTemplates.js";
import { createFddFleetGuardRolloutBindings } from "./fdd/fleetGuardRollout.js";
import type { ChatProvider } from "./providers.js";

const token = "seed-token-ada";
const headers = { authorization: `Bearer ${token}` };

function elementPointNames(): string[] {
  return Array.from({ length: 8 }, (_, index) => index + 1).flatMap((number) => [
    `WCC_${number}_Chiller_Start_Stop`,
    `WCC_${number}_Remote_Start_Contact`,
    `WCC_${number}_Run_Status`,
    `WCC_${number}_COMPSALM`,
    `WCC-L1-${String(number).padStart(2, "0")}-ACB-TALM`,
    `WCC_${number}_Motor_Percent_Kilowatts`,
    `WCC_${number}_TLKW`,
    `WCC_${number}_TLKWH`,
    `WCC_${number}_KVA`,
    `WCC_${number}_CHWST`,
    `WCC_${number}_CHWSTSP`,
    ...(number === 7 ? ["WCC_7_LCW_Setpoint"] : []),
    ...(number === 8 ? ["WCC-L1-08-PWR"] : [])
  ]);
}

function writeElementFleetFixture(dataDir: string, options: { omitWcc8Alarm?: boolean; includeNoisyTemperature?: boolean } = {}): Set<string> {
  const kbDir = path.join(dataDir, "project_element", "kb");
  mkdirSync(kbDir, { recursive: true });
  const rows = Array.from({ length: 8 }, (_, index) => {
    const number = index + 1;
    const padded = String(number).padStart(2, "0");
    return `| \`WCC_${number}\` / \`WCC_${padded}\` | \`WCC_${number}_*\` | \`WCC-L1-${padded}*\` |`;
  });
  writeFileSync(path.join(kbDir, "KB_CATALOG_SUMMARY.md"), [
    "# Full equipment inventory",
    "",
    "| Chiller | HL prefix | Plant prefix |",
    "| --- | --- | --- |",
    ...rows
  ].join("\n"), "utf8");

  const ttl = [
    "@prefix brick: <https://brickschema.org/schema/Brick#> .",
    "@prefix test: <urn:test#> .",
    "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .",
    ...Array.from({ length: 8 }, (_, index) => {
      const number = index + 1;
      const padded = String(number).padStart(2, "0");
      const entity = `WCC_${padded}`;
      const facts = [
        `test:${entity} a brick:Water_Cooled_Chiller ; rdfs:label "WCC ${number}" .`,
        `test:${entity}__command a brick:Start_Stop_Command ; rdfs:label "WCC_${number}_Chiller_Start_Stop" ; brick:isPointOf test:${entity} .`,
        `test:${entity}__remote a brick:Start_Stop_Command ; rdfs:label "WCC_${number}_Remote_Start_Contact" ; brick:isPointOf test:${entity} .`,
        `test:${entity}__status a brick:Run_Status ; rdfs:label "WCC_${number}_Run_Status" ; brick:isPointOf test:${entity} .`,
        ...(options.omitWcc8Alarm && number === 8
          ? []
          : [`test:${entity}__alarm a brick:Alarm ; rdfs:label "WCC_${number}_COMPSALM" ; brick:isPointOf test:${entity} .`]),
        `test:${entity}__trip a brick:Alarm ; rdfs:label "WCC-L1-${padded}-ACB-TALM" ; brick:isPointOf test:${entity} .`,
        `test:${entity}__motor_percent_kw a brick:Electric_Power_Sensor ; rdfs:label "WCC_${number}_Motor_Percent_Kilowatts" ; brick:isPointOf test:${entity} .`,
        `test:${entity}__power a brick:Electric_Power_Sensor ; rdfs:label "WCC_${number}_TLKW" ; brick:isPointOf test:${entity} .`,
        `test:${entity}__energy_competitor a brick:Electric_Power_Sensor ; rdfs:label "WCC_${number}_TLKWH" ; brick:isPointOf test:${entity} .`,
        `test:${entity}__apparent_power_competitor a brick:Electric_Power_Sensor ; rdfs:label "WCC_${number}_KVA" ; brick:isPointOf test:${entity} .`,
        ...(options.includeNoisyTemperature
          ? [
              ...(number === 7
                ? [`test:${entity}__wrong_chwst a brick:Leaving_Chilled_Water_Temperature_Sensor ; rdfs:label "WCC_7_LCW_Setpoint" ; brick:isPointOf test:${entity} .`]
                : [`test:${entity}__chwst a brick:Leaving_Chilled_Water_Temperature_Sensor ; rdfs:label "WCC_${number}_CHWST" ; brick:isPointOf test:${entity} .`]),
              `test:${entity}__chwstsp a brick:Leaving_Chilled_Water_Temperature_Setpoint ; rdfs:label "WCC_${number}_CHWSTSP" ; brick:isPointOf test:${entity} .`
            ]
          : []),
        ...(number === 8
          ? [`test:${entity}__bad_pwr a brick:Run_Status ; rdfs:label "WCC-L1-08-PWR" ; brick:isPointOf test:${entity} .`]
          : [])
      ];
      return facts.join("\n");
    })
  ].join("\n");
  writeFileSync(path.join(kbDir, "brick_model.ttl"), ttl, "utf8");
  const names = new Set(elementPointNames());
  if (options.omitWcc8Alarm) names.delete("WCC_8_COMPSALM");
  return names;
}

type ElementCollectorOptions = {
  includeObjectRefs?: boolean;
  pointUnitOverrides?: Record<string, string>;
  sharedObjectRefPoints?: Set<string>;
  duplicateExactPoints?: Set<string>;
  historyFailurePoints?: Set<string>;
  historyTimeoutPoints?: Set<string>;
};

function elementPointObjectRef(pointName: string, options: ElementCollectorOptions): string | undefined {
  if (!options.includeObjectRefs) return undefined;
  if (options.sharedObjectRefPoints?.has(pointName)) return "//Elements/WCC_8_SHARED";
  return `//Elements/${pointName}`;
}

function elementCollectorFetch(names: Set<string>, options: ElementCollectorOptions = {}) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/v1/points") {
      const query = url.searchParams.get("q") ?? "";
      if (!names.has(query)) {
        return new Response(JSON.stringify({ total: 0, items: [] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      const description = query.includes("Motor_Percent_Kilowatts")
        ? "Motor Percent Kilowatts"
        : query.endsWith("_TLKW")
          ? "Motor Kilowatts"
          : query.endsWith("_TLKWH")
            ? "Total Kilowatt Hours"
            : query.endsWith("_KVA")
              ? "Apparent Power"
        : query.includes("COMPSALM")
          ? "Alarm Relay"
          : query.includes("ACB-TALM")
            ? "ACB Trip Alarm"
            : query.includes("Chiller_Start_Stop")
              ? "Chiller Start/Stop"
              : query.includes("Remote_Start")
                ? "Remote Start Contact"
                : query === "WCC-L1-08-PWR"
                  ? "WCC-08 Auto/Local Status"
                  : "Run Status";
      const unit = options.pointUnitOverrides?.[query]
        ?? (query.includes("CHWST") || query.includes("LCW_Setpoint")
          ? "C"
          : query.endsWith("_TLKWH")
            ? "kWh"
            : query.endsWith("_KVA")
              ? "kVA"
              : undefined);
      const objectRef = elementPointObjectRef(query, options);
      const items = [{ name: query, description, ...(unit ? { unit } : {}), ...(objectRef ? { object_ref: objectRef } : {}) }];
      if (options.duplicateExactPoints?.has(query)) {
        items.push({
          name: query,
          description,
          ...(unit ? { unit } : {}),
          ...(objectRef ? { object_ref: `${objectRef}_DUPLICATE` } : {})
        });
      }
      return new Response(JSON.stringify({
        total: items.length,
        items
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    if (url.pathname === "/api/v1/readings") {
      const objectRef = url.searchParams.get("object_ref");
      const name = url.searchParams.get("name")
        ?? (objectRef ? [...names].find((candidate) => elementPointObjectRef(candidate, options) === objectRef) : undefined)
        ?? "unknown";
      if (options.historyFailurePoints?.has(name)) {
        return new Response(JSON.stringify({ error: "simulated_history_failure" }), {
          status: 503,
          headers: { "content-type": "application/json" }
        });
      }
      if (options.historyTimeoutPoints?.has(name)) {
        const signal = init?.signal;
        return await new Promise<Response>((_resolve, reject) => {
          const rejectTimeout = () => reject(signal?.reason ?? new Error("simulated_history_timeout"));
          if (signal?.aborted) rejectTimeout();
          else signal?.addEventListener("abort", rejectTimeout, { once: true });
        });
      }
      const boundaryProbe = url.searchParams.has("to");
      return new Response(JSON.stringify({
        total: Number(url.searchParams.get("limit")) === 1 ? 100 : 1,
        items: [{
          ts: boundaryProbe ? "2026-06-01T00:00:00.000Z" : "2026-08-19T00:00:00.000Z",
          name,
          value_num: name.endsWith("_TLKW") ? 120 : 1
        }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ total: 0, items: [] }), { status: 404, headers: { "content-type": "application/json" } });
  });
}

function elementCollectorFetchWithMaterializerReadings(names: Set<string>, options: ElementCollectorOptions = {}) {
  const catalogFetch = elementCollectorFetch(names, options);
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/v1/readings" && url.searchParams.has("from")) {
      const objectRef = url.searchParams.get("object_ref");
      const name = url.searchParams.get("name")
        ?? (objectRef?.startsWith("//Elements/") ? objectRef.slice("//Elements/".length) : undefined)
        ?? "unknown";
      return new Response(JSON.stringify({
        total: 1,
        items: [{
          ts: url.searchParams.get("to") ?? url.searchParams.get("from"),
          name,
          value_num: name.endsWith("_TLKW") ? 120 : 1
        }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return catalogFetch(input, init);
  });
}

function elementStoreWithRunningPowerGrounding() {
  const store = createSeedStore();
  store.projectGroundingByProject = {
    project_element: [{
      id: "ground_element_running_power",
      projectId: "project_element",
      content: "For chiller running-state and FDD checks, cross-check Run_Status with TLKW and do not rely on numeric status codes alone.",
      source: "operator",
      createdAt: "2026-08-19T00:00:00.000Z",
      name: "Chiller running: TLKW cross-check",
      action: "Use WCC_{1-8}_TLKW as stronger running evidence than Run_Status."
    }]
  };
  return store;
}

function enableCh01FleetGuardCanary(store: ReturnType<typeof createSeedStore>) {
  ensureStoreFddLibrary(store);
  const algorithm = store.fddAlgorithms?.find((entry) => entry.algorithmKey === "chiller_ch_01_commanded_fails_to_start");
  if (!algorithm) throw new Error("Missing CH-01 fixture algorithm");
  const templates = createFddFleetTemplateBindings(store, {
    now: () => "2026-08-20T00:00:00.000Z",
    nextId: (() => {
      let id = 0;
      return () => `canary-${++id}`;
    })()
  });
  const draft = templates.create({
    projectId: "project_element",
    actorId: "user_buildinggpt_admin",
    requestId: "test-create-template",
    input: {
      algorithmId: algorithm.id,
      reason: "Freeze Element CH-01 point families for the canary.",
      roles: [
        { role: "chiller_command", familyKey: "chiller_start_stop" },
        { role: "chiller_status", familyKey: "run_status" },
        { role: "chiller_power", familyKey: "tlkw" }
      ]
    }
  });
  const locked = templates.update({
    projectId: "project_element",
    templateId: draft.templateId,
    actorId: "user_buildinggpt_admin",
    requestId: "test-lock-template",
    input: {
      action: "lock",
      baseVersion: draft.version,
      baseSignature: draft.signature,
      reason: "Authorize the confirmed 8x8 Element mapping."
    }
  });
  const rollout = createFddFleetGuardRolloutBindings(store, {
    now: () => "2026-08-20T00:00:01.000Z"
  }).update("project_element", "user_buildinggpt_admin", {
    baseRevision: 0,
    mode: "canary",
    algorithmKeys: [algorithm.algorithmKey]
  });
  return { algorithm, locked, rollout };
}

function frozenFleetPlan(check: Record<string, unknown>) {
  const entities = (check.deployableEntities as Array<{
    entityKey: string;
    status: string;
    selectedMappings: Array<{ slot: string; pointName: string; objectRef?: string; unit?: string }>;
  }>).map((entity) => ({
    entityKey: entity.entityKey,
    status: entity.status,
    selectedMappings: [...entity.selectedMappings]
      .map((mapping) => ({
        slot: mapping.slot,
        pointName: mapping.pointName,
        ...(mapping.objectRef ? { objectRef: mapping.objectRef } : {}),
        ...(mapping.unit ? { unit: mapping.unit } : {})
      }))
      .sort((left, right) => left.slot.localeCompare(right.slot))
  })).sort((left, right) => left.entityKey.localeCompare(right.entityKey));
  return {
    status: check.status,
    mappingStrategy: check.mappingStrategy,
    expectedEntityCount: check.expectedEntityCount,
    requiredRuntimeSlots: check.requiredRuntimeSlots,
    entities
  };
}

describe("FleetGuard CH-01 Element canary", () => {
  it("keeps CH-03 future-only and blocked until its supplemental role contract is versioned in a locked template", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "ba-element-fleetguard-ch03-future-"));
    const names = writeElementFleetFixture(dataDir);
    const store = elementStoreWithRunningPowerGrounding();
    const enabled = enableCh01FleetGuardCanary(store);
    const ch03 = store.fddAlgorithms?.find((entry) => entry.algorithmKey === "chiller_ch_03_abnormal_shutdown");
    if (!ch03) throw new Error("Missing CH-03 fixture algorithm");
    createFddFleetGuardRolloutBindings(store).update("project_element", "user_buildinggpt_admin", {
      baseRevision: enabled.rollout.revision,
      mode: "canary",
      algorithmKeys: [enabled.algorithm.algorithmKey, ch03.algorithmKey]
    });
    const pointUnitOverrides = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [
      `WCC_${index + 1}_TLKW`,
      "kW"
    ]));
    const app = buildServer({
      store,
      fetch: elementCollectorFetch(names, { includeObjectRefs: true, pointUnitOverrides }) as typeof fetch,
      env: {
        BUILDING_AGENT_DATA_DIR: dataDir,
        BMS_DATABASE_API_URL: "http://collector.test",
        BUILDING_AGENT_FLEETGUARD_AUTHORIZATION_MODE: "canary",
        DERIVED_METRIC_MATERIALIZER_DISABLED: "1"
      }
    });
    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers });
    const tested = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${ch03.id}/test`,
      headers
    });
    expect(tested.statusCode).toBe(200);
    expect(tested.json().check.fleetGuard).toMatchObject({ state: "blocked", coverage: { authorized: 0 } });
    expect(tested.json().check.fleetGuard.authorization).toBeUndefined();
    await app.close();
  });

  it("authorizes a prospective plan and atomically deploys one receipt plus all eight exact runtimes", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "ba-element-fleetguard-canary-"));
    const names = writeElementFleetFixture(dataDir);
    const store = elementStoreWithRunningPowerGrounding();
    const { algorithm, locked } = enableCh01FleetGuardCanary(store);
    const pointUnitOverrides = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [
      `WCC_${index + 1}_TLKW`,
      "kW"
    ]));
    const fetchMock = elementCollectorFetch(names, { includeObjectRefs: true, pointUnitOverrides });
    const app = buildServer({
      store,
      fetch: fetchMock as typeof fetch,
      env: {
        BUILDING_AGENT_DATA_DIR: dataDir,
        BMS_DATABASE_API_URL: "http://collector.test",
        BUILDING_AGENT_FLEETGUARD_AUTHORIZATION_MODE: "canary",
        DERIVED_METRIC_MATERIALIZER_DISABLED: "1"
      }
    });
    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers });

    const tested = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithm.id}/test`,
      headers
    });
    expect(tested.statusCode).toBe(200);
    const fleetGuard = tested.json().check.fleetGuard;
    expect(fleetGuard).toMatchObject({
      kind: "fleetguard_v1",
      state: "ready",
      templateRef: { templateId: locked.templateId, version: locked.version, signature: locked.signature },
      coverage: { expected: 8, bound: 8, dataReady: 8, authorized: 8 }
    });
    expect(fleetGuard.authorization.taskId).toBeUndefined();

    const deployed = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithm.id}/deploy`,
      headers,
      payload: { authorization: fleetGuard.authorization }
    });
    expect(deployed.statusCode).toBe(200);
    expect(deployed.json().deployment).toMatchObject({
      expectedEntityCount: 8,
      deployedEntityCount: 8,
      authorizationPolicy: "fleetguard-v1"
    });
    const task = deployed.json().task;
    expect(task).toMatchObject({
      status: "running",
      authorizationPolicy: "fleetguard-v1",
      activeDeploymentReceiptId: deployed.json().deployment.receiptId
    });

    const metrics = new DerivedMetricStore(dataDir);
    const receipts = metrics.listFddDeploymentReceipts("project_element", task.id);
    const instances = metrics.listProjectMetrics("project_element")
      .filter((instance) => instance.metricKey === algorithm.algorithmKey);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      receiptId: task.activeDeploymentReceiptId,
      taskId: task.id,
      templateRef: { templateId: locked.templateId, version: locked.version, signature: locked.signature }
    });
    expect(receipts[0]?.entities).toHaveLength(8);
    expect(instances).toHaveLength(8);
    for (const instance of instances) {
      expect(instance.metadata).toMatchObject({
        fddTaskId: task.id,
        fddAuthorizationPolicy: "fleetguard-v1",
        fddFleetGuardReceiptId: task.activeDeploymentReceiptId
      });
      expect(instance.dependencies).toHaveLength(3);
      for (const dependency of instance.dependencies) {
        expect(dependency.sourceId).toMatch(/^WCC_\d{2}__(?:command|status|power)$/u);
        expect(dependency.pointName).toBeUndefined();
        expect(dependency.objectRef).toMatch(/^\/\/Elements\//u);
        expect(dependency.metadata).toMatchObject({ fddFleetGuardReceiptId: task.activeDeploymentReceiptId });
      }
    }
    await app.close();
  });

  it("blocks the whole fleet when an exact point name resolves to two object references", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "ba-element-fleetguard-duplicate-exact-"));
    const names = writeElementFleetFixture(dataDir);
    const store = elementStoreWithRunningPowerGrounding();
    const { algorithm } = enableCh01FleetGuardCanary(store);
    const pointUnitOverrides = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [
      `WCC_${index + 1}_TLKW`,
      "kW"
    ]));
    const app = buildServer({
      store,
      fetch: elementCollectorFetch(names, {
        includeObjectRefs: true,
        pointUnitOverrides,
        duplicateExactPoints: new Set(["WCC_8_TLKW"])
      }) as typeof fetch,
      env: {
        BUILDING_AGENT_DATA_DIR: dataDir,
        BMS_DATABASE_API_URL: "http://collector.test",
        BUILDING_AGENT_FLEETGUARD_AUTHORIZATION_MODE: "canary",
        DERIVED_METRIC_MATERIALIZER_DISABLED: "1"
      }
    });
    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers });
    const tested = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithm.id}/test`,
      headers
    });
    expect(tested.statusCode).toBe(200);
    expect(tested.json().check.fleetGuard).toMatchObject({
      state: "blocked",
      coverage: { authorized: 0 },
      primaryBlocker: { code: "lookup_conflict", entityKey: "WCC_8", role: "chiller_power" }
    });
    expect(tested.json().check.fleetGuard.authorization).toBeUndefined();
    const metrics = new DerivedMetricStore(dataDir);
    expect(metrics.listProjectMetrics("project_element")).toEqual([]);
    expect(metrics.listFddDeploymentReceipts("project_element")).toEqual([]);
    await app.close();
  });

  it("binds existing-task overrides into the token and rejects a parameter race without any deploy writes", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "ba-element-fleetguard-parameters-"));
    const names = writeElementFleetFixture(dataDir);
    const store = elementStoreWithRunningPowerGrounding();
    const { algorithm } = enableCh01FleetGuardCanary(store);
    const pointUnitOverrides = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [
      `WCC_${index + 1}_TLKW`,
      "kW"
    ]));
    const app = buildServer({
      store,
      fetch: elementCollectorFetch(names, { includeObjectRefs: true, pointUnitOverrides }) as typeof fetch,
      env: {
        BUILDING_AGENT_DATA_DIR: dataDir,
        BMS_DATABASE_API_URL: "http://collector.test",
        BUILDING_AGENT_FLEETGUARD_AUTHORIZATION_MODE: "canary",
        DERIVED_METRIC_MATERIALIZER_DISABLED: "1"
      }
    });
    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers });
    const prospective = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithm.id}/test`,
      headers
    });
    const firstDeploy = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithm.id}/deploy`,
      headers,
      payload: { authorization: prospective.json().check.fleetGuard.authorization }
    });
    expect(firstDeploy.statusCode).toBe(200);
    const taskId = firstDeploy.json().task.id as string;
    const firstReceiptId = firstDeploy.json().deployment.receiptId as string;
    expect(firstDeploy.json().task.parameterValues).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "power_on_threshold_kw", value: 0.1, source: "buildinggpt_recommended" }),
      expect.objectContaining({ key: "window_minutes", value: 5, source: "buildinggpt_recommended" })
    ]));

    const firstOverride = await app.inject({
      method: "PATCH",
      url: `/api/projects/project_element/fdd-tasks/${taskId}/parameters`,
      headers,
      payload: { parameters: [{ key: "power_on_threshold_kw", value: 0.5 }] }
    });
    expect(firstOverride.statusCode).toBe(200);
    const testedExisting = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-tasks/${taskId}/test`,
      headers
    });
    const staleToken = testedExisting.json().task.deployabilityCheck.fleetGuard.authorization;
    expect(staleToken.taskId).toBe(taskId);
    expect(staleToken.parameterSignature).not.toBe(prospective.json().check.fleetGuard.authorization.parameterSignature);

    const racedOverride = await app.inject({
      method: "PATCH",
      url: `/api/projects/project_element/fdd-tasks/${taskId}/parameters`,
      headers,
      payload: { parameters: [{ key: "power_on_threshold_kw", value: 0.7 }] }
    });
    expect(racedOverride.statusCode).toBe(200);
    const storeBeforeRejectedDeploy = JSON.stringify(store);
    const metrics = new DerivedMetricStore(dataDir);
    const metricsBefore = metrics.listProjectMetrics("project_element");
    const receiptsBefore = metrics.listFddDeploymentReceipts("project_element", taskId);
    const rejected = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-tasks/${taskId}/deploy`,
      headers,
      payload: { authorization: staleToken }
    });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error.code).toBe("parameter_signature_mismatch");
    expect(JSON.stringify(store)).toBe(storeBeforeRejectedDeploy);
    expect(metrics.listProjectMetrics("project_element")).toEqual(metricsBefore);
    expect(metrics.listFddDeploymentReceipts("project_element", taskId)).toEqual(receiptsBefore);

    const retested = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-tasks/${taskId}/test`,
      headers
    });
    const currentToken = retested.json().task.deployabilityCheck.fleetGuard.authorization;
    const redeployed = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-tasks/${taskId}/deploy`,
      headers,
      payload: { authorization: currentToken }
    });
    expect(redeployed.statusCode).toBe(200);
    expect(redeployed.json().task.parameterValues).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "power_on_threshold_kw", value: 0.7, source: "user_override" })
    ]));
    const receipts = metrics.listFddDeploymentReceipts("project_element", taskId);
    expect(receipts).toHaveLength(2);
    expect(receipts[0]).toMatchObject({ supersedesReceiptId: firstReceiptId });
    await app.close();
  });

  it.each(["eighth runtime", "receipt insert"] as const)(
    "rolls back every SQLite and SeedStore write when the %s stage fails",
    async (failureStage) => {
      const dataDir = mkdtempSync(path.join(tmpdir(), `ba-element-fleetguard-rollback-${failureStage.replace(/\s/gu, "-")}-`));
      const names = writeElementFleetFixture(dataDir);
      const store = elementStoreWithRunningPowerGrounding();
      const { algorithm } = enableCh01FleetGuardCanary(store);
      const pointUnitOverrides = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [
        `WCC_${index + 1}_TLKW`,
        "kW"
      ]));
      let injectFailure = false;
      const app = buildServer({
        store,
        fetch: elementCollectorFetch(names, { includeObjectRefs: true, pointUnitOverrides }) as typeof fetch,
        env: {
          BUILDING_AGENT_DATA_DIR: dataDir,
          BMS_DATABASE_API_URL: "http://collector.test",
          BUILDING_AGENT_FLEETGUARD_AUTHORIZATION_MODE: "canary",
          DERIVED_METRIC_MATERIALIZER_DISABLED: "1"
        },
        fddTestHooks: {
          beforeRegisterMetric: ({ entityId }) => {
            if (injectFailure && failureStage === "eighth runtime" && entityId === "WCC_8") {
              throw new Error("simulated-eighth-runtime-failure");
            }
          },
          afterInsertFleetGuardReceipt: () => {
            if (injectFailure && failureStage === "receipt insert") {
              throw new Error("simulated-post-receipt-failure");
            }
          }
        }
      });
      await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers });
      const tested = await app.inject({
        method: "POST",
        url: `/api/projects/project_element/fdd-library/${algorithm.id}/test`,
        headers
      });
      const storeBefore = JSON.stringify(store);
      injectFailure = true;
      const rejected = await app.inject({
        method: "POST",
        url: `/api/projects/project_element/fdd-library/${algorithm.id}/deploy`,
        headers,
        payload: { authorization: tested.json().check.fleetGuard.authorization }
      });
      expect(rejected.statusCode).toBe(409);
      expect(rejected.json().error.code).toBe("fdd_fleetguard_atomic_commit_failed");
      expect(JSON.stringify(store)).toBe(storeBefore);
      const metrics = new DerivedMetricStore(dataDir);
      expect(metrics.listProjectMetrics("project_element")).toEqual([]);
      expect(metrics.listMaterializations()).toEqual([]);
      expect(metrics.listFddDeploymentReceipts("project_element")).toEqual([]);
      await app.close();
    }
  );

  it("rejects a missing token before scanning and bypasses cached evidence at the deploy boundary", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "ba-element-fleetguard-fresh-boundary-"));
    const names = writeElementFleetFixture(dataDir);
    const store = elementStoreWithRunningPowerGrounding();
    const { algorithm } = enableCh01FleetGuardCanary(store);
    const pointUnitOverrides = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [
      `WCC_${index + 1}_TLKW`,
      "kW"
    ]));
    const fetchMock = elementCollectorFetch(names, { includeObjectRefs: true, pointUnitOverrides });
    const app = buildServer({
      store,
      fetch: fetchMock as typeof fetch,
      env: {
        BUILDING_AGENT_DATA_DIR: dataDir,
        BMS_DATABASE_API_URL: "http://collector.test",
        BUILDING_AGENT_FLEETGUARD_AUTHORIZATION_MODE: "canary",
        DERIVED_METRIC_MATERIALIZER_DISABLED: "1"
      }
    });
    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers });
    fetchMock.mockClear();
    const storeBeforeMissingToken = JSON.stringify(store);
    const missing = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithm.id}/deploy`,
      headers
    });
    expect(missing.statusCode).toBe(409);
    expect(missing.json().error.code).toBe("fdd_fleetguard_authorization_required");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(store)).toBe(storeBeforeMissingToken);

    const tested = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithm.id}/test`,
      headers
    });
    expect(tested.json().check.fleetGuard.state).toBe("ready");
    // A poisoned cached card must not be consulted by deployment.
    const cached = store.fddChecksByProject?.project_element?.[0];
    if (!cached?.fleetGuard) throw new Error("Missing cached FleetGuard check");
    cached.fleetGuard.state = "blocked";
    cached.fleetGuard.coverage.authorized = 0;
    const deployed = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithm.id}/deploy`,
      headers,
      payload: { authorization: tested.json().check.fleetGuard.authorization }
    });
    expect(deployed.statusCode).toBe(200);
    expect(deployed.json().deployment).toMatchObject({ deployedEntityCount: 8 });
    await app.close();
  });

  it("fails closed with zero writes when the eighth exact point disappears after Test", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "ba-element-fleetguard-point-race-"));
    const names = writeElementFleetFixture(dataDir);
    const store = elementStoreWithRunningPowerGrounding();
    const { algorithm } = enableCh01FleetGuardCanary(store);
    const pointUnitOverrides = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [
      `WCC_${index + 1}_TLKW`,
      "kW"
    ]));
    const app = buildServer({
      store,
      fetch: elementCollectorFetch(names, { includeObjectRefs: true, pointUnitOverrides }) as typeof fetch,
      env: {
        BUILDING_AGENT_DATA_DIR: dataDir,
        BMS_DATABASE_API_URL: "http://collector.test",
        BUILDING_AGENT_FLEETGUARD_AUTHORIZATION_MODE: "canary",
        DERIVED_METRIC_MATERIALIZER_DISABLED: "1"
      }
    });
    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers });
    const tested = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithm.id}/test`,
      headers
    });
    names.delete("WCC_8_TLKW");
    const storeBefore = JSON.stringify(store);
    const rejected = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithm.id}/deploy`,
      headers,
      payload: { authorization: tested.json().check.fleetGuard.authorization }
    });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error.code).toBe("plan_not_ready");
    expect(JSON.stringify(store)).toBe(storeBefore);
    const metrics = new DerivedMetricStore(dataDir);
    expect(metrics.listProjectMetrics("project_element")).toEqual([]);
    expect(metrics.listFddDeploymentReceipts("project_element")).toEqual([]);
    await app.close();
  });

  it("rejects stale rollout, template, and synchronous algorithm races with no partial SQLite commit", async () => {
    const setup = async (suffix: string, beforeInsert?: (algorithm: ReturnType<typeof enableCh01FleetGuardCanary>["algorithm"]) => void) => {
      const dataDir = mkdtempSync(path.join(tmpdir(), `ba-element-fleetguard-stale-${suffix}-`));
      const names = writeElementFleetFixture(dataDir);
      const store = elementStoreWithRunningPowerGrounding();
      const enabled = enableCh01FleetGuardCanary(store);
      const pointUnitOverrides = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [
        `WCC_${index + 1}_TLKW`,
        "kW"
      ]));
      let inject = false;
      const app = buildServer({
        store,
        fetch: elementCollectorFetch(names, { includeObjectRefs: true, pointUnitOverrides }) as typeof fetch,
        env: {
          BUILDING_AGENT_DATA_DIR: dataDir,
          BMS_DATABASE_API_URL: "http://collector.test",
          BUILDING_AGENT_FLEETGUARD_AUTHORIZATION_MODE: "canary",
          DERIVED_METRIC_MATERIALIZER_DISABLED: "1"
        },
        fddTestHooks: {
          beforeInsertFleetGuardReceipt: () => {
            if (inject) beforeInsert?.(enabled.algorithm);
          }
        }
      });
      await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers });
      const tested = await app.inject({
        method: "POST",
        url: `/api/projects/project_element/fdd-library/${enabled.algorithm.id}/test`,
        headers
      });
      inject = true;
      return { app, dataDir, store, ...enabled, token: tested.json().check.fleetGuard.authorization };
    };

    const rolloutRace = await setup("rollout");
    createFddFleetGuardRolloutBindings(rolloutRace.store).update(
      "project_element",
      "user_buildinggpt_admin",
      {
        baseRevision: rolloutRace.rollout.revision,
        mode: "canary",
        algorithmKeys: [rolloutRace.algorithm.algorithmKey]
      }
    );
    const rolloutStoreBefore = JSON.stringify(rolloutRace.store);
    const staleRollout = await rolloutRace.app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${rolloutRace.algorithm.id}/deploy`,
      headers,
      payload: { authorization: rolloutRace.token }
    });
    expect(staleRollout.statusCode).toBe(409);
    expect(staleRollout.json().error.code).toBe("rollout_revision_mismatch");
    expect(JSON.stringify(rolloutRace.store)).toBe(rolloutStoreBefore);
    expect(new DerivedMetricStore(rolloutRace.dataDir).listProjectMetrics("project_element")).toEqual([]);
    await rolloutRace.app.close();

    const templateRace = await setup("template");
    createFddFleetTemplateBindings(templateRace.store).update({
      projectId: "project_element",
      templateId: templateRace.locked.templateId,
      actorId: "user_buildinggpt_admin",
      requestId: "stale-template-after-test",
      input: {
        action: "unlock",
        baseVersion: templateRace.locked.version,
        baseSignature: templateRace.locked.signature,
        reason: "Simulate a template head change after Test."
      }
    });
    const templateStoreBefore = JSON.stringify(templateRace.store);
    const staleTemplate = await templateRace.app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${templateRace.algorithm.id}/deploy`,
      headers,
      payload: { authorization: templateRace.token }
    });
    expect(staleTemplate.statusCode).toBe(409);
    expect(staleTemplate.json().error.code).toBe("template_mismatch");
    expect(JSON.stringify(templateRace.store)).toBe(templateStoreBefore);
    const templateMetrics = new DerivedMetricStore(templateRace.dataDir);
    expect(templateMetrics.listProjectMetrics("project_element")).toEqual([]);
    expect(templateMetrics.listFddDeploymentReceipts("project_element")).toEqual([]);
    await templateRace.app.close();

    const algorithmRace = await setup("algorithm", (algorithm) => {
      algorithm.version = `${algorithm.version}-raced`;
    });
    const originalVersion = algorithmRace.algorithm.version;
    const rejectedAlgorithm = await algorithmRace.app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithmRace.algorithm.id}/deploy`,
      headers,
      payload: { authorization: algorithmRace.token }
    });
    expect(rejectedAlgorithm.statusCode).toBe(409);
    expect(rejectedAlgorithm.json().error.code).toBe("fdd_fleetguard_atomic_commit_failed");
    algorithmRace.algorithm.version = originalVersion.replace(/-raced$/u, "");
    const algorithmMetrics = new DerivedMetricStore(algorithmRace.dataDir);
    expect(algorithmMetrics.listProjectMetrics("project_element")).toEqual([]);
    expect(algorithmMetrics.listFddDeploymentReceipts("project_element")).toEqual([]);
    await algorithmRace.app.close();

    const contractRace = await setup("algorithm-contract", (algorithm) => {
      const parameter = algorithm.parameters[0];
      if (!parameter || typeof parameter.defaultValue !== "number") {
        throw new Error("Missing numeric CH-01 default parameter");
      }
      parameter.defaultValue += 1;
    });
    const rejectedContract = await contractRace.app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${contractRace.algorithm.id}/deploy`,
      headers,
      payload: { authorization: contractRace.token }
    });
    expect(rejectedContract.statusCode).toBe(409);
    expect(rejectedContract.json().error.code).toBe("fdd_fleetguard_atomic_commit_failed");
    const contractMetrics = new DerivedMetricStore(contractRace.dataDir);
    expect(contractMetrics.listProjectMetrics("project_element")).toEqual([]);
    expect(contractMetrics.listFddDeploymentReceipts("project_element")).toEqual([]);
    await contractRace.app.close();
  });

  it("revalidates one historical receipt once per materializer batch and stops all eight on structural corruption", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "ba-element-fleetguard-runtime-"));
    const names = writeElementFleetFixture(dataDir);
    const store = elementStoreWithRunningPowerGrounding();
    const { algorithm, locked } = enableCh01FleetGuardCanary(store);
    const pointUnitOverrides = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [
      `WCC_${index + 1}_TLKW`,
      "kW"
    ]));
    const fetchMock = elementCollectorFetchWithMaterializerReadings(names, { includeObjectRefs: true, pointUnitOverrides });
    let runMaterializer: (() => Promise<void>) | undefined;
    const app = buildServer({
      store,
      fetch: fetchMock as typeof fetch,
      env: {
        BUILDING_AGENT_DATA_DIR: dataDir,
        BMS_DATABASE_API_URL: "http://collector.test",
        BUILDING_AGENT_FLEETGUARD_AUTHORIZATION_MODE: "canary",
        DERIVED_METRIC_MATERIALIZER_DISABLED: "1"
      },
      fddTestHooks: {
        onMaterializerReady: (run) => {
          runMaterializer = run;
        }
      }
    });
    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers });
    const tested = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithm.id}/test`,
      headers
    });
    const deployed = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithm.id}/deploy`,
      headers,
      payload: { authorization: tested.json().check.fleetGuard.authorization }
    });
    expect(deployed.statusCode).toBe(200);
    const taskId = deployed.json().task.id as string;
    const metrics = new DerivedMetricStore(dataDir);
    const instances = metrics.listProjectMetrics("project_element")
      .filter((instance) => instance.metricKey === algorithm.algorithmKey);
    expect(instances).toHaveLength(8);

    // The mutable head may advance; runtime remains pinned to receipt v2.
    createFddFleetTemplateBindings(store).update({
      projectId: "project_element",
      templateId: locked.templateId,
      actorId: "user_buildinggpt_admin",
      requestId: "runtime-unlock-current-head",
      input: {
        action: "unlock",
        baseVersion: locked.version,
        baseSignature: locked.signature,
        reason: "Draft the next template without rebinding the deployed receipt."
      }
    });
    const brickPath = path.join(dataDir, "project_element", "kb", "brick_model.ttl");
    writeFileSync(
      brickPath,
      readFileSync(brickPath, "utf8").replace(
        "test:WCC_08__power a brick:Electric_Power_Sensor",
        "test:WCC_08__power a brick:Temperature_Sensor"
      ),
      "utf8"
    );
    for (const instance of instances) {
      metrics.configureMaterialization({
        instanceId: instance.instanceId,
        enabled: true,
        nextRunAt: "1970-01-01T00:00:00.000Z"
      });
    }
    fetchMock.mockClear();
    expect(runMaterializer).toBeTypeOf("function");
    await runMaterializer?.();
    const commandCatalogScans = fetchMock.mock.calls
      .map(([request]) => new URL(String(request)))
      .filter((url) => url.pathname === "/api/v1/points" && url.searchParams.get("q") === "WCC_1_Chiller_Start_Stop");
    expect(commandCatalogScans).toHaveLength(1);
    expect(instances.map((instance) => metrics.readMaterialization(instance.instanceId)?.lastError))
      .toEqual(Array.from({ length: 8 }, () => undefined));
    expect(instances.map((instance) => metrics.readMaterialization(instance.instanceId)?.enabled))
      .toEqual(Array.from({ length: 8 }, () => true));
    expect(store.fddTasksByProject?.project_element?.find((task) => task.id === taskId)?.status).toBe("running");

    names.delete("WCC_8_TLKW");
    for (const instance of instances) {
      metrics.configureMaterialization({
        instanceId: instance.instanceId,
        enabled: true,
        nextRunAt: "1970-01-01T00:00:00.000Z"
      });
    }
    fetchMock.mockClear();
    await runMaterializer?.();
    expect(instances.map((instance) => metrics.readMaterialization(instance.instanceId))).toEqual(
      Array.from({ length: 8 }, () => expect.objectContaining({
        enabled: false,
        status: "authorization_required"
      }))
    );
    expect(store.fddTasksByProject?.project_element?.find((task) => task.id === taskId)?.status).toBe("cannot_deploy");
    await app.close();
  });

  it.each([
    {
      signal: "objectRef",
      corrupt: (options: ElementCollectorOptions) => options.sharedObjectRefPoints?.add("WCC_8_TLKW")
    },
    {
      signal: "unit",
      corrupt: (options: ElementCollectorOptions) => {
        if (options.pointUnitOverrides) options.pointUnitOverrides.WCC_8_TLKW = "C";
      }
    },
    {
      signal: "history",
      corrupt: (options: ElementCollectorOptions) => options.historyFailurePoints?.add("WCC_8_TLKW")
    }
  ])("stops all eight when one receipt binding's $signal evidence changes", async ({ corrupt }) => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "ba-element-fleetguard-runtime-signal-"));
    const names = writeElementFleetFixture(dataDir);
    const store = elementStoreWithRunningPowerGrounding();
    const { algorithm } = enableCh01FleetGuardCanary(store);
    const options: ElementCollectorOptions = {
      includeObjectRefs: true,
      pointUnitOverrides: Object.fromEntries(Array.from({ length: 8 }, (_, index) => [
        `WCC_${index + 1}_TLKW`,
        "kW"
      ])),
      sharedObjectRefPoints: new Set<string>(),
      historyFailurePoints: new Set<string>()
    };
    const fetchMock = elementCollectorFetchWithMaterializerReadings(names, options);
    let runMaterializer: (() => Promise<void>) | undefined;
    const app = buildServer({
      store,
      fetch: fetchMock as typeof fetch,
      env: {
        BUILDING_AGENT_DATA_DIR: dataDir,
        BMS_DATABASE_API_URL: "http://collector.test",
        BUILDING_AGENT_FLEETGUARD_AUTHORIZATION_MODE: "canary",
        DERIVED_METRIC_MATERIALIZER_DISABLED: "1"
      },
      fddTestHooks: {
        onMaterializerReady: (run) => {
          runMaterializer = run;
        }
      }
    });
    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers });
    const tested = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithm.id}/test`,
      headers
    });
    const deployed = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithm.id}/deploy`,
      headers,
      payload: { authorization: tested.json().check.fleetGuard.authorization }
    });
    expect(deployed.statusCode).toBe(200);
    const taskId = deployed.json().task.id as string;
    const metrics = new DerivedMetricStore(dataDir);
    const instances = metrics.listProjectMetrics("project_element")
      .filter((instance) => instance.metricKey === algorithm.algorithmKey);
    expect(instances).toHaveLength(8);

    corrupt(options);
    for (const instance of instances) {
      metrics.configureMaterialization({
        instanceId: instance.instanceId,
        enabled: true,
        nextRunAt: "1970-01-01T00:00:00.000Z"
      });
    }
    await runMaterializer?.();
    expect(instances.map((instance) => metrics.readMaterialization(instance.instanceId))).toEqual(
      Array.from({ length: 8 }, () => expect.objectContaining({
        enabled: false,
        status: "authorization_required"
      }))
    );
    expect(store.fddTasksByProject?.project_element?.find((task) => task.id === taskId)?.status).toBe("cannot_deploy");
    await app.close();
  });

  it("recovers a committed task pointer on boot but never revives a receipt superseded by v4", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "ba-element-fleetguard-boot-recovery-"));
    const names = writeElementFleetFixture(dataDir);
    const store = elementStoreWithRunningPowerGrounding();
    const { algorithm } = enableCh01FleetGuardCanary(store);
    const pointUnitOverrides = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [
      `WCC_${index + 1}_TLKW`,
      "kW"
    ]));
    const fetchMock = elementCollectorFetch(names, { includeObjectRefs: true, pointUnitOverrides });
    const commonEnv = {
      BUILDING_AGENT_DATA_DIR: dataDir,
      BMS_DATABASE_API_URL: "http://collector.test",
      DERIVED_METRIC_MATERIALIZER_DISABLED: "1"
    };
    const first = buildServer({
      store,
      fetch: fetchMock as typeof fetch,
      env: { ...commonEnv, BUILDING_AGENT_FLEETGUARD_AUTHORIZATION_MODE: "canary" },
      fddTestHooks: {
        beforeFleetGuardStorePersist: () => {
          throw new Error("simulated-seedstore-flush-failure");
        }
      }
    });
    await first.inject({ method: "POST", url: "/api/projects/project_element/select", headers });
    const tested = await first.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithm.id}/test`,
      headers
    });
    const deployed = await first.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithm.id}/deploy`,
      headers,
      payload: { authorization: tested.json().check.fleetGuard.authorization }
    });
    expect(deployed.statusCode).toBe(200);
    const taskId = deployed.json().task.id as string;
    const receiptId = deployed.json().deployment.receiptId as string;
    await first.close();

    // Simulate a crash after SQLite commit but before the SeedStore pointer was
    // durably flushed.
    store.fddTasksByProject!.project_element = [];
    const recoveredServer = buildServer({
      store,
      fetch: fetchMock as typeof fetch,
      env: commonEnv
    });
    const recovered = store.fddTasksByProject?.project_element?.find((task) => task.id === taskId);
    expect(recovered).toMatchObject({
      status: "running",
      authorizationPolicy: "fleetguard-v1",
      activeDeploymentReceiptId: receiptId
    });
    const metrics = new DerivedMetricStore(dataDir);
    expect(metrics.listFddDeploymentReceipts("project_element", taskId)).toHaveLength(1);
    expect(metrics.listProjectMetrics("project_element")
      .filter((instance) => instance.metricKey === algorithm.algorithmKey)
      .map((instance) => metrics.readMaterialization(instance.instanceId)?.enabled))
      .toEqual(Array.from({ length: 8 }, () => true));

    const v4Redeploy = await recoveredServer.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-tasks/${taskId}/deploy`,
      headers
    });
    expect(v4Redeploy.statusCode).toBe(200);
    expect(v4Redeploy.json().task.authorizationPolicy).toBe("v4");
    expect(v4Redeploy.json().task.activeDeploymentReceiptId).toBeUndefined();
    await recoveredServer.close();

    const finalServer = buildServer({ store, fetch: fetchMock as typeof fetch, env: commonEnv });
    const finalTask = store.fddTasksByProject?.project_element?.find((task) => task.id === taskId);
    expect(finalTask?.authorizationPolicy).toBe("v4");
    expect(finalTask?.activeDeploymentReceiptId).toBeUndefined();
    expect(metrics.listFddDeploymentReceipts("project_element", taskId)).toHaveLength(1);
    await finalServer.close();
  });
});

describe("Element homogeneous chiller FDD deployment", () => {
  it("maps CH-03 by one point-family template and deploys all 8 chillers atomically", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "ba-element-homogeneous-fdd-"));
    const names = writeElementFleetFixture(dataDir);
    const store = elementStoreWithRunningPowerGrounding();
    const fetchMock = elementCollectorFetch(names);
    const app = buildServer({
      store,
      fetch: fetchMock as typeof fetch,
      env: {
        BUILDING_AGENT_DATA_DIR: dataDir,
        BMS_DATABASE_API_URL: "http://collector.test",
        DERIVED_METRIC_MATERIALIZER_DISABLED: "1"
      }
    });
    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers });
    for (const operationKey of [
      "chiller_ch_01_commanded_fails_to_start",
      "chiller_ch_02_uncommanded_operation"
    ]) {
      const operationAlgorithm = store.fddAlgorithms?.find((entry) => entry.algorithmKey === operationKey);
      expect(operationAlgorithm).toBeTruthy();
      if (!operationAlgorithm) continue;
      const operationTest = await app.inject({
        method: "POST",
        url: `/api/projects/project_element/fdd-library/${operationAlgorithm.id}/test`,
        headers
      });
      expect(operationTest.statusCode).toBe(200);
      const operationCheck = operationTest.json().check;
      expect(operationCheck).toMatchObject({
        status: "can_deploy",
        mappingStrategy: "homogeneous_template",
        expectedEntityCount: 8
      });
      expect(operationCheck.ambiguousInputs).toEqual([]);
      expect((operationCheck.rejectedCandidates as Array<{ pointName: string }>).map((candidate) => candidate.pointName)).toEqual(expect.arrayContaining([
        "WCC_1_TLKWH",
        "WCC_1_KVA"
      ]));
      for (const entity of operationCheck.deployableEntities as Array<{ entityKey: string; ambiguousInputs: unknown[]; selectedMappings: Array<{ slot: string; pointName: string; unit?: string }> }>) {
        const number = Number(entity.entityKey.match(/(\d+)$/u)?.[1]);
        const mappings = Object.fromEntries(entity.selectedMappings.map((mapping) => [mapping.slot, mapping]));
        expect(entity.ambiguousInputs).toEqual([]);
        expect(mappings.chiller_command?.pointName).toBe(`WCC_${number}_Chiller_Start_Stop`);
        expect(mappings.chiller_status?.pointName).toBe(`WCC_${number}_Run_Status`);
        expect(mappings.chiller_power).toMatchObject({ pointName: `WCC_${number}_TLKW`, unit: "kW" });
        expect(new Set(entity.selectedMappings.slice(0, 3).map((mapping) => mapping.pointName)).size).toBe(3);
      }
    }
    const algorithm = store.fddAlgorithms?.find((entry) => entry.algorithmKey === "chiller_ch_03_abnormal_shutdown");
    expect(algorithm).toBeTruthy();
    if (!algorithm) return;

    const tested = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithm.id}/test`,
      headers
    });
    expect(tested.statusCode).toBe(200);
    const check = tested.json().check;
    expect(check).toMatchObject({
      status: "can_deploy",
      checkPolicyVersion: "v4-homogeneous-fleet",
      mappingStrategy: "homogeneous_template",
      expectedEntityCount: 8,
      requiredRuntimeSlots: ["chiller_command", "chiller_status", "chiller_alarm", "chiller_running_power"],
      equipmentAvailability: { entityCount: 8 }
    });
    expect(check.deployableEntities).toHaveLength(8);
    expect(check.ambiguousInputs).toEqual([]);
    expect((check.rejectedCandidates as Array<{ pointName: string }>).map((candidate) => candidate.pointName)).toEqual(expect.arrayContaining([
      "WCC_1_TLKWH",
      "WCC_1_KVA"
    ]));
    for (const entity of check.deployableEntities as Array<{ entityKey: string; status: string; ambiguousInputs: unknown[]; selectedMappings: Array<{ slot: string; pointName: string; unit?: string }> }>) {
      const number = Number(entity.entityKey.match(/(\d+)$/u)?.[1]);
      const mappings = Object.fromEntries(entity.selectedMappings.map((mapping) => [mapping.slot, mapping]));
      expect(entity.status).toBe("can_deploy");
      expect(entity.ambiguousInputs).toEqual([]);
      expect(mappings.chiller_command?.pointName).toBe(`WCC_${number}_Chiller_Start_Stop`);
      expect(mappings.chiller_status?.pointName).toBe(`WCC_${number}_Run_Status`);
      expect(mappings.chiller_alarm?.pointName).toBe(`WCC_${number}_COMPSALM`);
      expect(mappings.chiller_running_power).toMatchObject({ pointName: `WCC_${number}_TLKW`, unit: "kW" });
      expect(new Set(entity.selectedMappings.slice(0, 4).map((mapping) => mapping.pointName)).size).toBe(4);
    }
    const catalogQueries = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .filter((url) => url.pathname === "/api/v1/points")
      .map((url) => url.searchParams.get("q"));
    expect(catalogQueries).toEqual(expect.arrayContaining([
      "WCC_1_Motor_Percent_Kilowatts",
      "WCC_1_TLKW",
      "WCC_1_TLKWH",
      "WCC_1_KVA"
    ]));

    // A corrupt but still-fresh cached result cannot authorize Deploy All.
    check.deployableEntities[7].status = "uncertain";
    check.deployableEntities[7].selectedMappings = check.deployableEntities[7].selectedMappings.slice(0, 3);
    const deployed = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithm.id}/deploy`,
      headers
    });
    expect(deployed.statusCode).toBe(200);
    expect(deployed.json().deployment).toMatchObject({ expectedEntityCount: 8, deployedEntityCount: 8 });
    expect(store.fddChecksByProject?.project_element?.[0]).not.toBe(check);
    expect(deployed.json().task.deployabilityCheck.deployableEntities).toHaveLength(8);

    const metrics = new DerivedMetricStore(dataDir)
      .listProjectMetrics("project_element")
      .filter((metric) => metric.metricKey === "chiller_ch_03_abnormal_shutdown");
    expect(metrics).toHaveLength(8);
    for (const metric of metrics) {
      const number = Number(metric.entityId.match(/(\d+)$/u)?.[1]);
      expect(metric.dependencies).toEqual(expect.arrayContaining([
        expect.objectContaining({ role: "chiller_command", pointName: `WCC_${number}_Chiller_Start_Stop` }),
        expect.objectContaining({ role: "chiller_status", pointName: `WCC_${number}_Run_Status` }),
        expect.objectContaining({ role: "chiller_alarm", pointName: `WCC_${number}_COMPSALM` }),
        expect.objectContaining({ role: "chiller_running_power", pointName: `WCC_${number}_TLKW`, unit: "kW" })
      ]));
      expect(metric.dependencies).toHaveLength(4);
    }
    const wcc8 = metrics.find((metric) => metric.entityId === "WCC_8");
    expect(wcc8?.dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "chiller_command", pointName: "WCC_8_Chiller_Start_Stop" }),
      expect.objectContaining({ role: "chiller_status", pointName: "WCC_8_Run_Status" }),
      expect.objectContaining({ role: "chiller_alarm", pointName: "WCC_8_COMPSALM" }),
      expect.objectContaining({ role: "chiller_running_power", pointName: "WCC_8_TLKW", unit: "kW" })
    ]));
    expect(wcc8?.dependencies.map((dependency) => dependency.pointName)).not.toContain("WCC-L1-08-PWR");
    await app.close();
  });

  it("freezes exact CH-01/CH-02/CH-03 8x fleet plans with distinct references across 20 repeated checks", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "ba-element-frozen-contract-fdd-"));
    const names = writeElementFleetFixture(dataDir);
    const store = elementStoreWithRunningPowerGrounding();
    const fetchMock = elementCollectorFetch(names, { includeObjectRefs: true });
    const app = buildServer({
      store,
      fetch: fetchMock as typeof fetch,
      env: {
        BUILDING_AGENT_DATA_DIR: dataDir,
        BMS_DATABASE_API_URL: "http://collector.test",
        DERIVED_METRIC_MATERIALIZER_DISABLED: "1"
      }
    });
    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers });
    const algorithmContracts = [
      {
        algorithmKey: "chiller_ch_01_commanded_fails_to_start",
        pointSuffixBySlot: {
          chiller_command: "Chiller_Start_Stop",
          chiller_status: "Run_Status",
          chiller_power: "TLKW"
        }
      },
      {
        algorithmKey: "chiller_ch_02_uncommanded_operation",
        pointSuffixBySlot: {
          chiller_command: "Chiller_Start_Stop",
          chiller_status: "Run_Status",
          chiller_power: "TLKW"
        }
      },
      {
        algorithmKey: "chiller_ch_03_abnormal_shutdown",
        pointSuffixBySlot: {
          chiller_command: "Chiller_Start_Stop",
          chiller_status: "Run_Status",
          chiller_alarm: "COMPSALM",
          chiller_running_power: "TLKW"
        }
      }
    ] as const;
    let frozenCh03: ReturnType<typeof frozenFleetPlan> | undefined;

    for (const contract of algorithmContracts) {
      const algorithm = store.fddAlgorithms?.find((entry) => entry.algorithmKey === contract.algorithmKey);
      expect(algorithm).toBeTruthy();
      if (!algorithm) continue;
      const tested = await app.inject({
        method: "POST",
        url: `/api/projects/project_element/fdd-library/${algorithm.id}/test`,
        headers
      });
      expect(tested.statusCode).toBe(200);
      const check = tested.json().check as Record<string, unknown>;
      expect(check).toMatchObject({
        status: "can_deploy",
        mappingStrategy: "homogeneous_template",
        expectedEntityCount: 8
      });
      const plan = frozenFleetPlan(check);
      expect(plan.entities).toHaveLength(8);
      const planObjectRefs: string[] = [];
      for (const entity of plan.entities) {
        const number = Number(entity.entityKey.match(/(\d+)$/u)?.[1]);
        expect(entity.status).toBe("can_deploy");
        expect(entity.selectedMappings).toHaveLength(Object.keys(contract.pointSuffixBySlot).length);
        for (const [slot, suffix] of Object.entries(contract.pointSuffixBySlot)) {
          const mapping = entity.selectedMappings.find((entry) => entry.slot === slot);
          expect(mapping).toMatchObject({
            pointName: `WCC_${number}_${suffix}`,
            objectRef: `//Elements/WCC_${number}_${suffix}`
          });
          planObjectRefs.push(mapping!.objectRef!);
        }
        expect(new Set(entity.selectedMappings.map((mapping) => mapping.pointName)).size).toBe(entity.selectedMappings.length);
        expect(new Set(entity.selectedMappings.map((mapping) => mapping.objectRef)).size).toBe(entity.selectedMappings.length);
        expect(entity.selectedMappings.map((mapping) => mapping.pointName)).not.toEqual(expect.arrayContaining([
          `WCC_${number}_Motor_Percent_Kilowatts`,
          `WCC_${number}_TLKWH`,
          `WCC_${number}_KVA`
        ]));
      }
      expect(new Set(planObjectRefs).size).toBe(planObjectRefs.length);
      const rejectedNames = (check.rejectedCandidates as Array<{ pointName: string }>).map((candidate) => candidate.pointName);
      expect(rejectedNames).toEqual(expect.arrayContaining([
        "WCC_1_TLKWH",
        "WCC_1_KVA"
      ]));
      if (contract.algorithmKey === "chiller_ch_03_abnormal_shutdown") frozenCh03 = plan;
    }

    expect(frozenCh03).toBeTruthy();
    const catalogQueries = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .filter((url) => url.pathname === "/api/v1/points")
      .map((url) => url.searchParams.get("q"));
    expect(catalogQueries).toEqual(expect.arrayContaining([
      "WCC_1_Motor_Percent_Kilowatts",
      "WCC_1_TLKW",
      "WCC_1_TLKWH",
      "WCC_1_KVA"
    ]));
    const ch03 = store.fddAlgorithms?.find((entry) => entry.algorithmKey === "chiller_ch_03_abnormal_shutdown");
    expect(ch03).toBeTruthy();
    if (!ch03 || !frozenCh03) return;
    for (let repeat = 0; repeat < 20; repeat += 1) {
      const tested = await app.inject({
        method: "POST",
        url: `/api/projects/project_element/fdd-library/${ch03.id}/test`,
        headers
      });
      expect(tested.statusCode).toBe(200);
      expect(frozenFleetPlan(tested.json().check as Record<string, unknown>)).toEqual(frozenCh03);
    }
    await app.close();
  });

  it.each([
    {
      name: "an incompatible instantaneous-power unit",
      options: { pointUnitOverrides: { WCC_8_TLKW: "kWh" } }
    },
    {
      name: "a duplicate command/status object reference",
      options: {
        includeObjectRefs: true,
        sharedObjectRefPoints: new Set(["WCC_8_Chiller_Start_Stop", "WCC_8_Run_Status"])
      }
    },
    {
      name: "a failed required-history probe",
      options: { historyFailurePoints: new Set(["WCC_8_TLKW"]) }
    },
    {
      name: "a timed-out required-history probe",
      options: { historyTimeoutPoints: new Set(["WCC_8_TLKW"]) }
    }
  ])("fails closed for $name on fleet member 8", async ({ options }) => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "ba-element-corrupt-contract-fdd-"));
    const names = writeElementFleetFixture(dataDir);
    const store = elementStoreWithRunningPowerGrounding();
    const app = buildServer({
      store,
      fetch: elementCollectorFetch(names, options) as typeof fetch,
      env: {
        BUILDING_AGENT_DATA_DIR: dataDir,
        BMS_DATABASE_API_URL: "http://collector.test",
        DERIVED_METRIC_MATERIALIZER_DISABLED: "1"
      }
    });
    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers });
    const algorithm = store.fddAlgorithms?.find((entry) => entry.algorithmKey === "chiller_ch_03_abnormal_shutdown");
    expect(algorithm).toBeTruthy();
    if (!algorithm) return;
    const url = `/api/projects/project_element/fdd-library/${algorithm.id}`;
    const tested = await app.inject({ method: "POST", url: `${url}/test`, headers });
    expect(tested.statusCode).toBe(200);
    const check = tested.json().check as {
      status: string;
      deployableEntities: Array<{
        entityKey: string;
        status: string;
        missingPoints: string[];
        historyIssues: string[];
        ambiguousInputs: unknown[];
      }>;
    };
    expect(check.status).not.toBe("can_deploy");
    const wcc8 = check.deployableEntities.find((entity) => /(?:^|_)0?8$/u.test(entity.entityKey));
    expect(wcc8).toBeTruthy();
    expect(wcc8?.status).not.toBe("can_deploy");
    expect([
      ...(wcc8?.missingPoints ?? []),
      ...(wcc8?.historyIssues ?? []),
      ...(wcc8?.ambiguousInputs ?? [])
    ].length).toBeGreaterThan(0);

    const deployed = await app.inject({ method: "POST", url: `${url}/deploy`, headers });
    expect(deployed.statusCode).toBe(422);
    expect(new DerivedMetricStore(dataDir).listProjectMetrics("project_element")).toHaveLength(0);
    await app.close();
  }, 10_000);

  it("blocks Deploy All when one chiller lacks the template counterpart", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "ba-element-incomplete-fdd-"));
    const names = writeElementFleetFixture(dataDir, { omitWcc8Alarm: true });
    const store = elementStoreWithRunningPowerGrounding();
    const app = buildServer({
      store,
      fetch: elementCollectorFetch(names) as typeof fetch,
      env: {
        BUILDING_AGENT_DATA_DIR: dataDir,
        BMS_DATABASE_API_URL: "http://collector.test",
        DERIVED_METRIC_MATERIALIZER_DISABLED: "1"
      }
    });
    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers });
    const algorithm = store.fddAlgorithms?.find((entry) => entry.algorithmKey === "chiller_ch_03_abnormal_shutdown");
    expect(algorithm).toBeTruthy();
    if (!algorithm) return;
    const tested = await app.inject({ method: "POST", url: `/api/projects/project_element/fdd-library/${algorithm.id}/test`, headers });
    expect(tested.json().check.status).toBe("cannot_deploy");
    expect(tested.json().check.deployableEntities).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityKey: "WCC_8", status: "cannot_deploy", missingPoints: expect.arrayContaining(["Chiller alarm"]) })
    ]));
    const deployed = await app.inject({ method: "POST", url: `/api/projects/project_element/fdd-library/${algorithm.id}/deploy`, headers });
    expect(deployed.statusCode).toBe(422);
    expect(new DerivedMetricStore(dataDir).listProjectMetrics("project_element")).toHaveLength(0);
    await app.close();
  });

  it("uses an exact homogeneous family counterpart even when WCC7 has a noisy high-confidence candidate in the same slot", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "ba-element-noisy-family-fdd-"));
    const names = writeElementFleetFixture(dataDir, { includeNoisyTemperature: true });
    const store = elementStoreWithRunningPowerGrounding();
    const app = buildServer({
      store,
      fetch: elementCollectorFetch(names) as typeof fetch,
      env: {
        BUILDING_AGENT_DATA_DIR: dataDir,
        BMS_DATABASE_API_URL: "http://collector.test",
        DERIVED_METRIC_MATERIALIZER_DISABLED: "1"
      }
    });
    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers });
    const algorithm = store.fddAlgorithms?.find((entry) => entry.algorithmKey === "chiller_ch_08_high_chw_supply_temp");
    expect(algorithm).toBeTruthy();
    if (!algorithm) return;
    const tested = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithm.id}/test`,
      headers
    });
    expect(tested.statusCode).toBe(200);
    expect(tested.json().check.status, JSON.stringify(tested.json().check.deployableEntities)).toBe("can_deploy");
    expect(tested.json().check).toMatchObject({ mappingStrategy: "homogeneous_template", expectedEntityCount: 8 });
    const wcc7 = (tested.json().check.deployableEntities as Array<{
      entityKey: string;
      status: string;
      selectedMappings: Array<{ slot: string; pointName: string }>;
    }>).find((entity) => /(?:^|_)0?7$/u.test(entity.entityKey));
    expect(wcc7?.status).toBe("can_deploy");
    expect(wcc7?.selectedMappings).toEqual(expect.arrayContaining([
      expect.objectContaining({ slot: "chw_supply_temp", pointName: "WCC_7_CHWST" }),
      expect.objectContaining({ slot: "chw_supply_temp_setpoint", pointName: "WCC_7_CHWSTSP" })
    ]));
    expect(wcc7?.selectedMappings.map((mapping) => mapping.pointName)).not.toContain("WCC_7_LCW_Setpoint");
    await app.close();
  });

  it("confirms and clears CH-01/CH-02 level faults across 15-minute production polls", async () => {
    vi.useFakeTimers();
    const rawStartMs = Date.parse("2026-08-19T00:00:00.000Z");
    const rawTimes = [0, 15, 30].map((minutes) => new Date(rawStartMs + minutes * 60_000).toISOString());
    vi.setSystemTime(rawStartMs + 30 * 60_000);
    try {
      for (const scenario of [
        {
          algorithmKey: "chiller_ch_01_commanded_fails_to_start",
          command: [1, 1, 0],
          power: [0, 0, 120]
        },
        {
          algorithmKey: "chiller_ch_02_uncommanded_operation",
          command: [0, 0, 1],
          power: [120, 120, 0]
        }
      ]) {
        const dataDir = mkdtempSync(path.join(tmpdir(), `ba-element-${scenario.algorithmKey}-cadence-fdd-`));
        const names = writeElementFleetFixture(dataDir);
        const store = elementStoreWithRunningPowerGrounding();
        const catalogFetch = elementCollectorFetch(names);
        const fetchMock = vi.fn(async (input: string | URL | Request) => {
          const url = new URL(String(input));
          if (url.pathname === "/api/v1/readings" && Number(url.searchParams.get("limit")) >= 240) {
            const name = url.searchParams.get("name") ?? "";
            const values = name.includes("Chiller_Start_Stop")
              ? scenario.command
              : name.endsWith("_TLKW")
                ? scenario.power
                : [9, 9, 9];
            const fromMs = Date.parse(url.searchParams.get("from") ?? "");
            const toMs = Date.parse(url.searchParams.get("to") ?? "");
            const rows = rawTimes
              .map((ts, index) => ({ ts, name, value_num: values[index] }))
              .filter((row) => Date.parse(row.ts) >= fromMs && Date.parse(row.ts) <= toMs);
            return new Response(JSON.stringify({ total: rows.length, items: rows }), {
              status: 200,
              headers: { "content-type": "application/json" }
            });
          }
          return catalogFetch(input);
        });
        let completed = 0;
        let resolveComplete: (() => void) | undefined;
        const materialized = new Promise<void>((resolve) => {
          resolveComplete = resolve;
        });
        const app = buildServer({
          store,
          fetch: fetchMock as typeof fetch,
          env: { BUILDING_AGENT_DATA_DIR: dataDir, BMS_DATABASE_API_URL: "http://collector.test" },
          fddTestHooks: {
            onFddMaterialized: () => {
              completed += 1;
              if (completed === 8) resolveComplete?.();
            }
          }
        });
        try {
          await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers });
          const algorithm = store.fddAlgorithms?.find((entry) => entry.algorithmKey === scenario.algorithmKey);
          expect(algorithm).toBeTruthy();
          if (!algorithm) continue;
          const tested = await app.inject({
            method: "POST",
            url: `/api/projects/project_element/fdd-library/${algorithm.id}/test`,
            headers
          });
          expect(tested.json().check.status, JSON.stringify(tested.json().check)).toBe("can_deploy");
          const deployed = await app.inject({
            method: "POST",
            url: `/api/projects/project_element/fdd-library/${algorithm.id}/deploy`,
            headers
          });
          expect(deployed.statusCode, deployed.body).toBe(200);
          await vi.advanceTimersByTimeAsync(0);
          await materialized;
          const metrics = new DerivedMetricStore(dataDir);
          const instance = metrics.listProjectMetrics("project_element")
            .find((metric) => metric.metricKey === scenario.algorithmKey && /(?:^|_)0?1$/u.test(metric.entityId));
          expect(instance).toBeTruthy();
          if (!instance) continue;
          const samples = new Map(metrics.readHistory(instance.instanceId, { order: "asc", limit: 20 }).map((sample) => [sample.ts, sample]));
          expect(samples.get(rawTimes[0]!)?.status).toBe("ok");
          expect(samples.get(rawTimes[0]!)?.metadata?.derivedValues).toMatchObject({ conditionPersistencePending: 1 });
          expect(samples.get(rawTimes[1]!)?.status).toBe("fault");
          expect(samples.get(rawTimes[1]!)?.valueNum).toBe(1);
          expect(samples.get(rawTimes[2]!)?.status).toBe("ok");
          expect(samples.get(rawTimes[2]!)?.metadata?.derivedValues).toMatchObject({ conditionPersistencePending: 0, conditionPersistenceLatched: 0 });
        } finally {
          await app.close();
        }
      }
    } finally {
      vi.useRealTimers();
    }
  }, 20_000);

  it("uses a durable watermark for incremental CH-03 materialization, preserves its latch, and singleflight-refreshes authorization", async () => {
    vi.useFakeTimers();
    const initialNow = Date.parse("2026-08-19T00:45:00.000Z");
    vi.setSystemTime(initialNow);
    const dataDir = mkdtempSync(path.join(tmpdir(), "ba-element-materializer-fdd-"));
    const names = writeElementFleetFixture(dataDir);
    const store = elementStoreWithRunningPowerGrounding();
    const catalogFetch = elementCollectorFetch(names);
    const rawStartMs = Date.parse("2026-08-19T00:00:00.000Z");
    const rawTimes = [0, 15, 30, 45].map((minutes) => new Date(rawStartMs + minutes * 60_000).toISOString())
      .concat(Array.from({ length: 300 }, (_, index) => new Date(rawStartMs + 45 * 60_000 + (index + 1) * 3_000).toISOString()));
    const materializerRequests: Array<{ name: string; from: string; to: string; limit: number }> = [];
    let pauseNextMaterializerRead = false;
    let materializerReadPaused = false;
    let resolvePausedRead: (() => void) | undefined;
    let releasePausedRead: (() => void) | undefined;
    const pausedReadStarted = new Promise<void>((resolve) => {
      resolvePausedRead = resolve;
    });
    const pausedReadRelease = new Promise<void>((resolve) => {
      releasePausedRead = resolve;
    });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/v1/readings" && Number(url.searchParams.get("limit")) >= 240) {
        const name = url.searchParams.get("name") ?? "";
        const from = url.searchParams.get("from") ?? "";
        const to = url.searchParams.get("to") ?? "";
        const limit = Number(url.searchParams.get("limit"));
        materializerRequests.push({ name, from, to, limit });
        if (pauseNextMaterializerRead && !materializerReadPaused) {
          materializerReadPaused = true;
          resolvePausedRead?.();
          await pausedReadRelease;
        }
        const fromMs = Date.parse(from);
        const toMs = Date.parse(to);
        const eligible = rawTimes
          .map((ts) => ({
            ts,
            name,
            value_num: name.includes("Chiller_Start_Stop")
              ? 1
              : name.includes("Run_Status")
                ? (ts === rawTimes[0] ? 5 : 9)
                : name.includes("COMPSALM")
                  ? (ts === rawTimes[0] ? 0 : 1)
                  : name.endsWith("_TLKW")
                    ? (ts === rawTimes[0] ? 120 : 0)
                    : 0
          }))
          .filter((row) => Date.parse(row.ts) >= fromMs && Date.parse(row.ts) <= toMs);
        const selected = eligible.slice(0, limit);
        return new Response(JSON.stringify({
          total: eligible.length,
          items: selected
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return catalogFetch(input);
    });
    let materializedCount = 0;
    let resolveInitialMaterialization: (() => void) | undefined;
    const initialMaterialization = new Promise<void>((resolve) => {
      resolveInitialMaterialization = resolve;
    });
    let resolveIncrementalMaterialization: (() => void) | undefined;
    const incrementalMaterialization = new Promise<void>((resolve) => {
      resolveIncrementalMaterialization = resolve;
    });
    let authorizationRefreshCount = 0;
    let runMaterializer: (() => Promise<void>) | undefined;
    const app = buildServer({
      store,
      fetch: fetchMock as typeof fetch,
      env: {
        BUILDING_AGENT_DATA_DIR: dataDir,
        BMS_DATABASE_API_URL: "http://collector.test"
      },
      fddTestHooks: {
        onFddMaterialized: () => {
          materializedCount += 1;
          if (materializedCount === 8) resolveInitialMaterialization?.();
          if (materializedCount === 16) resolveIncrementalMaterialization?.();
        },
        onAuthorizationRefresh: () => {
          authorizationRefreshCount += 1;
        },
        onMaterializerReady: (run) => {
          runMaterializer = run;
        }
      }
    });
    let appClosed = false;
    try {
      await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers });
      const algorithm = store.fddAlgorithms?.find((entry) => entry.algorithmKey === "chiller_ch_03_abnormal_shutdown");
      expect(algorithm).toBeTruthy();
      if (!algorithm) return;
      const deployed = await app.inject({
        method: "POST",
        url: `/api/projects/project_element/fdd-library/${algorithm.id}/deploy`,
        headers
      });
      expect(deployed.statusCode).toBe(200);
      // The deploy path schedules an immediate backfill. Start the periodic
      // scheduler against the same eight due instances before that timer runs;
      // the per-instance lock must collapse both entrances to one execution.
      pauseNextMaterializerRead = true;
      const concurrentSchedulerRun = runMaterializer?.();
      await pausedReadStarted;
      await vi.advanceTimersByTimeAsync(0);
      releasePausedRead?.();
      await Promise.all([initialMaterialization, concurrentSchedulerRun]);
      expect(materializedCount).toBe(8);

      const metrics = new DerivedMetricStore(dataDir);
      const instance = metrics.listProjectMetrics("project_element")
        .find((metric) => metric.metricKey === algorithm.algorithmKey && /(?:^|_)0?1$/u.test(metric.entityId));
      expect(instance).toBeTruthy();
      if (!instance) return;
      const history = metrics.readHistory(instance.instanceId, { order: "asc", limit: 20 });
      const byTs = new Map(history.map((sample) => [sample.ts, sample]));
      expect(byTs.get(rawTimes[1]!)?.status).toBe("ok");
      expect(byTs.get(rawTimes[1]!)?.metadata?.derivedValues).toMatchObject({ edgeEventPending: 1, edgeEventLatched: 0 });
      expect(byTs.get(rawTimes[2]!)?.status).toBe("fault");
      expect(byTs.get(rawTimes[2]!)?.valueNum).toBe(1);
      expect(byTs.get(rawTimes[3]!)?.status).toBe("fault");
      expect(byTs.get(rawTimes[3]!)?.metadata?.derivedValues).toMatchObject({ edgeEventPending: 0, edgeEventLatched: 1 });
      const initialRequests = materializerRequests.slice(0, 8 * 4);
      expect(initialRequests).toHaveLength(32);
      expect(new Set(initialRequests.map((request) => request.from))).toEqual(new Set([
        new Date(initialNow - 30 * 24 * 60 * 60_000).toISOString()
      ]));
      expect(new Set(initialRequests.map((request) => request.to))).toEqual(new Set([new Date(initialNow).toISOString()]));
      expect(new Set(initialRequests.map((request) => request.limit))).toEqual(new Set([20_000]));

      vi.setSystemTime(initialNow + 15 * 60_000);
      await vi.advanceTimersByTimeAsync(5_000);
      await incrementalMaterialization;
      for (let flush = 0; flush < 20; flush += 1) await Promise.resolve();
      const incrementalTo = new Date(initialNow + 15 * 60_000 + 5_000).toISOString();
      const incrementalRequests = materializerRequests.filter((request) => request.to === incrementalTo);
      expect(incrementalRequests).toHaveLength(64);
      expect(incrementalRequests.filter((request) => request.from === new Date(Date.parse(rawTimes[3]!) - 35 * 60_000).toISOString())).toHaveLength(32);
      expect(new Set(incrementalRequests.map((request) => request.to))).toEqual(new Set([
        incrementalTo
      ]));
      expect(new Set(incrementalRequests.map((request) => request.limit))).toEqual(new Set([240]));
      const incrementalHistory = metrics.readHistory(instance.instanceId, { order: "asc", limit: 20_000 });
      const incrementallyMaterialized = metrics.readLatest(instance.instanceId);
      expect(incrementallyMaterialized).toMatchObject({ status: "fault", valueNum: 1 });
      expect(incrementallyMaterialized?.ts).toBe(rawTimes[rawTimes.length - 1]);
      expect(incrementallyMaterialized?.metadata?.derivedValues).toMatchObject({ edgeEventPending: 0, edgeEventLatched: 1 });

      const task = store.fddTasksByProject?.project_element?.find((entry) => entry.algorithmSnapshot.algorithmKey === algorithm.algorithmKey);
      expect(task?.status).toBe("running");
      const previousCheckedAt = task?.deployabilityCheck?.checkedAt;
      vi.setSystemTime(Date.parse(previousCheckedAt ?? "") + 24 * 60 * 60_000 + 60_000);
      expect(runMaterializer).toBeTypeOf("function");
      await runMaterializer?.();
      expect(authorizationRefreshCount).toBe(1);
      expect(materializedCount).toBe(24);
      expect(Date.parse(task?.deployabilityCheck?.checkedAt ?? "")).toBeGreaterThan(Date.parse(previousCheckedAt ?? ""));
      expect(task?.status).toBe("running");
      for (const runtime of metrics.listProjectMetrics("project_element").filter((metric) => metric.metricKey === algorithm.algorithmKey)) {
        expect(metrics.readMaterialization(runtime.instanceId)).toMatchObject({ enabled: true, status: "active" });
      }

      const historyCountBeforeReplay = metrics.readHistory(instance.instanceId, { order: "asc", limit: 20_000 }).length;
      const watermarkBeforeReplay = metrics.readMaterialization(instance.instanceId)?.watermarkTs;
      const replayNowMs = Date.now() + 5 * 60_000;
      await app.close();
      appClosed = true;
      vi.setSystemTime(replayNowMs);
      let replayedCount = 0;
      let resolveReplay: (() => void) | undefined;
      const replayComplete = new Promise<void>((resolve) => {
        resolveReplay = resolve;
      });
      const restarted = buildServer({
        store,
        fetch: fetchMock as typeof fetch,
        env: {
          BUILDING_AGENT_DATA_DIR: dataDir,
          BMS_DATABASE_API_URL: "http://collector.test"
        },
        fddTestHooks: {
          onFddMaterialized: () => {
            replayedCount += 1;
            if (replayedCount === 8) resolveReplay?.();
          }
        }
      });
      try {
        await vi.advanceTimersByTimeAsync(5_000);
        await replayComplete;
        expect(metrics.readHistory(instance.instanceId, { order: "asc", limit: 20_000 })).toHaveLength(historyCountBeforeReplay);
        expect(metrics.readMaterialization(instance.instanceId)?.watermarkTs).toBe(watermarkBeforeReplay);
      } finally {
        await restarted.close();
      }

    } finally {
      if (!appClosed) await app.close();
      vi.useRealTimers();
    }
  }, 20_000);

  it("recovers a CH-03 latch across more than one page of invalid persisted samples", async () => {
    vi.useFakeTimers();
    const rawStartMs = Date.parse("2026-08-19T00:00:00.000Z");
    const initialNow = rawStartMs + 45 * 60_000;
    vi.setSystemTime(initialNow);
    const dataDir = mkdtempSync(path.join(tmpdir(), "ba-element-state-pagination-fdd-"));
    const names = writeElementFleetFixture(dataDir);
    const store = elementStoreWithRunningPowerGrounding();
    const catalogFetch = elementCollectorFetch(names);
    const baseTimes = [0, 15, 30, 45].map((minutes) => new Date(rawStartMs + minutes * 60_000).toISOString());
    const invalidTimes = Array.from({ length: 220 }, (_, index) => new Date(rawStartMs + (61 + index) * 60_000).toISOString());
    const recoveryTs = new Date(rawStartMs + 290 * 60_000).toISOString();
    const resetTs = new Date(rawStartMs + 305 * 60_000).toISOString();
    const anchorTimes = [...baseTimes, ...invalidTimes, recoveryTs, resetTs];
    const powerTimes = [...baseTimes, recoveryTs, resetTs];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/v1/readings" && Number(url.searchParams.get("limit")) >= 240) {
        const name = url.searchParams.get("name") ?? "";
        const fromMs = Date.parse(url.searchParams.get("from") ?? "");
        const toMs = Date.parse(url.searchParams.get("to") ?? "");
        const limit = Number(url.searchParams.get("limit"));
        const times = name.endsWith("_TLKW") ? powerTimes : anchorTimes;
        const eligible = times
          .map((ts) => ({
            ts,
            name,
            value_num: name.includes("Chiller_Start_Stop")
              ? (ts === resetTs ? 0 : 1)
              : name.includes("Run_Status")
                ? (ts === baseTimes[0] ? 5 : 9)
                : name.includes("COMPSALM")
                  ? (ts === baseTimes[0] ? 0 : 1)
                  : name.endsWith("_TLKW")
                    ? (ts === baseTimes[0] || ts === resetTs ? 120 : 0)
                    : 0
          }))
          .filter((row) => Date.parse(row.ts) >= fromMs && Date.parse(row.ts) <= toMs);
        return new Response(JSON.stringify({ total: eligible.length, items: eligible.slice(0, limit) }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      return catalogFetch(input);
    });
    let initialCount = 0;
    let resolveInitial: (() => void) | undefined;
    let runMaterializer: (() => Promise<void>) | undefined;
    const initialComplete = new Promise<void>((resolve) => {
      resolveInitial = resolve;
    });
    const app = buildServer({
      store,
      fetch: fetchMock as typeof fetch,
      env: { BUILDING_AGENT_DATA_DIR: dataDir, BMS_DATABASE_API_URL: "http://collector.test" },
      fddTestHooks: {
        onFddMaterialized: () => {
          initialCount += 1;
          if (initialCount === 8) resolveInitial?.();
        },
        onMaterializerReady: (run) => {
          runMaterializer = run;
        }
      }
    });
    let appClosed = false;
    try {
      await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers });
      const algorithm = store.fddAlgorithms?.find((entry) => entry.algorithmKey === "chiller_ch_03_abnormal_shutdown");
      expect(algorithm).toBeTruthy();
      if (!algorithm) return;
      expect((await app.inject({
        method: "POST",
        url: `/api/projects/project_element/fdd-library/${algorithm.id}/deploy`,
        headers
      })).statusCode).toBe(200);
      await vi.advanceTimersByTimeAsync(0);
      await initialComplete;

      const metrics = new DerivedMetricStore(dataDir);
      const instance = metrics.listProjectMetrics("project_element")
        .find((metric) => metric.metricKey === algorithm.algorithmKey && /(?:^|_)0?1$/u.test(metric.entityId));
      expect(instance).toBeTruthy();
      if (!instance) return;
      expect(metrics.readLatest(instance.instanceId)).toMatchObject({ ts: baseTimes[3], status: "fault", valueNum: 1 });

      vi.setSystemTime(rawStartMs + 280 * 60_000);
      expect(runMaterializer).toBeTypeOf("function");
      await runMaterializer?.();
      const invalidHistory = metrics.readHistory(instance.instanceId, { order: "desc", limit: 400 });
      expect(invalidHistory.filter((sample) => sample.quality === "invalid").length).toBeGreaterThan(200);
      expect(metrics.readMaterialization(instance.instanceId)?.watermarkTs).toBe(invalidTimes[invalidTimes.length - 1]);

      await app.close();
      appClosed = true;
      vi.setSystemTime(rawStartMs + 290 * 60_000);
      let runRestartedMaterializer: (() => Promise<void>) | undefined;
      const restarted = buildServer({
        store,
        fetch: fetchMock as typeof fetch,
        env: { BUILDING_AGENT_DATA_DIR: dataDir, BMS_DATABASE_API_URL: "http://collector.test" },
        fddTestHooks: {
          onMaterializerReady: (run) => {
            runRestartedMaterializer = run;
          }
        }
      });
      try {
        expect(runRestartedMaterializer).toBeTypeOf("function");
        await runRestartedMaterializer?.();
        expect(metrics.readLatest(instance.instanceId)).toMatchObject({ ts: recoveryTs, status: "fault", valueNum: 1 });
        expect(metrics.readLatest(instance.instanceId)?.metadata?.derivedValues).toMatchObject({ edgeEventLatched: 1 });

        vi.setSystemTime(rawStartMs + 305 * 60_000);
        await runRestartedMaterializer?.();
        expect(metrics.readLatest(instance.instanceId)).toMatchObject({ ts: resetTs, status: "ok", valueNum: 0 });
        expect(metrics.readLatest(instance.instanceId)?.metadata?.derivedValues).toMatchObject({ edgeEventLatched: 0 });
      } finally {
        await restarted.close();
      }
    } finally {
      if (!appClosed) await app.close();
      vi.useRealTimers();
    }
  }, 20_000);

  it("preserves the watermark only for an identical runtime plan and clears stale state after a version change", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "ba-element-plan-watermark-fdd-"));
    const names = writeElementFleetFixture(dataDir);
    const store = elementStoreWithRunningPowerGrounding();
    const catalogFetch = elementCollectorFetch(names);
    let pauseOldPlanRead = false;
    let oldPlanReadPaused = false;
    let resolveOldPlanReadStarted: (() => void) | undefined;
    let releaseOldPlanRead: (() => void) | undefined;
    let runMaterializer: (() => Promise<void>) | undefined;
    const oldPlanReadStarted = new Promise<void>((resolve) => {
      resolveOldPlanReadStarted = resolve;
    });
    const oldPlanReadRelease = new Promise<void>((resolve) => {
      releaseOldPlanRead = resolve;
    });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/v1/readings" && Number(url.searchParams.get("limit")) >= 240) {
        if (pauseOldPlanRead && !oldPlanReadPaused) {
          oldPlanReadPaused = true;
          resolveOldPlanReadStarted?.();
          await oldPlanReadRelease;
        }
        const name = url.searchParams.get("name") ?? "";
        return new Response(JSON.stringify({
          total: 1,
          items: [{
            ts: "2026-08-19T01:00:00.000Z",
            name,
            value_num: name.includes("Chiller_Start_Stop") || name.includes("COMPSALM")
              ? 1
              : name.includes("Run_Status")
                ? 9
                : 0
          }]
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return catalogFetch(input);
    });
    const app = buildServer({
      store,
      fetch: fetchMock as typeof fetch,
      env: {
        BUILDING_AGENT_DATA_DIR: dataDir,
        BMS_DATABASE_API_URL: "http://collector.test",
        DERIVED_METRIC_MATERIALIZER_DISABLED: "1"
      },
      fddTestHooks: {
        onMaterializerReady: (run) => {
          runMaterializer = run;
        }
      }
    });
    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers });
    const algorithm = store.fddAlgorithms?.find((entry) => entry.algorithmKey === "chiller_ch_03_abnormal_shutdown");
    expect(algorithm).toBeTruthy();
    if (!algorithm) return;
    const deployUrl = `/api/projects/project_element/fdd-library/${algorithm.id}/deploy`;
    expect((await app.inject({ method: "POST", url: deployUrl, headers })).statusCode).toBe(200);
    const metrics = new DerivedMetricStore(dataDir);
    const instance = metrics.listProjectMetrics("project_element")
      .find((metric) => metric.metricKey === algorithm.algorithmKey && /(?:^|_)0?1$/u.test(metric.entityId));
    expect(instance).toBeTruthy();
    if (!instance) return;
    const watermarkTs = "2026-08-19T00:45:00.000Z";
    metrics.recordSample({
      instanceId: instance.instanceId,
      ts: watermarkTs,
      valueNum: 1,
      status: "fault",
      quality: "good",
      calculationRunId: `fdd-materializer:${instance.instanceId}`,
      metadata: { derivedValues: { edgeEventLatched: 1 } }
    });
    metrics.configureMaterialization({ instanceId: instance.instanceId, enabled: true, watermarkTs });

    expect((await app.inject({ method: "POST", url: deployUrl, headers })).statusCode).toBe(200);
    expect(metrics.readMaterialization(instance.instanceId)?.watermarkTs).toBe(watermarkTs);
    expect(metrics.readLatest(instance.instanceId)?.status).toBe("fault");

    for (const runtime of metrics.listProjectMetrics("project_element")) {
      if (runtime.instanceId === instance.instanceId) continue;
      metrics.configureMaterialization({ instanceId: runtime.instanceId, enabled: false });
    }
    pauseOldPlanRead = true;
    expect(runMaterializer).toBeTypeOf("function");
    const stalePlanRun = runMaterializer?.();
    await oldPlanReadStarted;
    algorithm.version = `${algorithm.version}-mapping-v2`;
    expect((await app.inject({ method: "POST", url: deployUrl, headers })).statusCode).toBe(200);
    expect(metrics.readMaterialization(instance.instanceId)?.watermarkTs).toBeUndefined();
    expect(metrics.readLatest(instance.instanceId)).toBeNull();
    expect(metrics.readHistory(instance.instanceId, { limit: 20 })).toHaveLength(0);
    releaseOldPlanRead?.();
    await stalePlanRun;
    expect(metrics.readMaterialization(instance.instanceId)?.watermarkTs).toBeUndefined();
    expect(metrics.readLatest(instance.instanceId)).toBeNull();
    expect(metrics.readHistory(instance.instanceId, { limit: 20 })).toHaveLength(0);
    await app.close();
  });

  it("rolls back seven existing instances and their materializations when the eighth registration fails", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "ba-element-atomic-fdd-"));
    const names = writeElementFleetFixture(dataDir);
    const store = elementStoreWithRunningPowerGrounding();
    let failWcc8 = false;
    const app = buildServer({
      store,
      fetch: elementCollectorFetch(names) as typeof fetch,
      env: {
        BUILDING_AGENT_DATA_DIR: dataDir,
        BMS_DATABASE_API_URL: "http://collector.test",
        DERIVED_METRIC_MATERIALIZER_DISABLED: "1"
      },
      fddTestHooks: {
        beforeRegisterMetric: ({ entityId }) => {
          if (failWcc8 && /(?:^|_)0?8$/u.test(entityId)) throw new Error("simulated_wcc8_write_failure");
        }
      }
    });
    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers });
    const algorithm = store.fddAlgorithms?.find((entry) => entry.algorithmKey === "chiller_ch_03_abnormal_shutdown");
    expect(algorithm).toBeTruthy();
    if (!algorithm) return;

    const firstDeploy = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithm.id}/deploy`,
      headers
    });
    expect(firstDeploy.statusCode).toBe(200);
    const task = store.fddTasksByProject?.project_element?.find((entry) => entry.algorithmSnapshot.algorithmKey === algorithm.algorithmKey);
    expect(task).toBeTruthy();
    if (!task) return;

    const metrics = new DerivedMetricStore(dataDir);
    const current = metrics.listProjectMetrics("project_element")
      .filter((metric) => metric.metricKey === algorithm.algorithmKey);
    const wcc8 = current.find((metric) => /(?:^|_)0?8$/u.test(metric.entityId));
    expect(wcc8).toBeTruthy();
    if (!wcc8) return;
    metrics.deleteInstance("project_element", wcc8.instanceId);
    for (const metric of current.filter((entry) => entry.instanceId !== wcc8.instanceId)) {
      metrics.registerMetric({
        projectId: "project_element",
        metricKey: algorithm.algorithmKey,
        entityId: metric.entityId,
        ...(metric.entityName ? { entityName: metric.entityName } : {}),
        displayName: "preexisting wrong mapping",
        metricType: "fdd",
        formulaVersion: algorithm.version,
        formula: algorithm.logicSummary,
        dependencies: [{
          role: "wrong_role",
          sourceType: "raw_point",
          sourceId: `${metric.entityId}_WRONG`,
          pointName: `${metric.entityId}_WRONG`,
          label: "wrong_role"
        }],
        ...(metric.createdBy ? { createdBy: metric.createdBy } : {}),
        metadata: { preexistingWrongMapping: true }
      });
      metrics.configureMaterialization({
        instanceId: metric.instanceId,
        enabled: false,
        intervalSeconds: 777,
        lookbackSeconds: 12_345,
        formulaKind: "fdd_rule",
        status: "paused_before_redeploy",
        lastError: "preserve_me"
      });
      metrics.recordSample({
        instanceId: metric.instanceId,
        ts: "2026-08-19T00:00:00.000Z",
        valueNum: 1,
        status: "fault",
        quality: "good",
        calculationRunId: `preexisting:${metric.instanceId}`,
        metadata: { preserveOnRollback: true }
      });
    }
    task.status = "ready";
    const taskBefore = structuredClone(task);
    const existingBefore = metrics.listProjectMetrics("project_element")
      .filter((metric) => metric.metricKey === algorithm.algorithmKey)
      .sort((left, right) => left.entityId.localeCompare(right.entityId));
    const materializationsBefore = existingBefore.map((metric) => metrics.readMaterialization(metric.instanceId));
    const historiesBefore = existingBefore.map((metric) => metrics.readHistory(metric.instanceId, { order: "asc", limit: 20 }));
    expect(existingBefore).toHaveLength(7);

    failWcc8 = true;
    const failedDeploy = await app.inject({
      method: "POST",
      url: `/api/projects/project_element/fdd-library/${algorithm.id}/deploy`,
      headers
    });
    expect(failedDeploy.statusCode).toBe(422);
    expect(JSON.stringify(failedDeploy.json())).toContain("all existing and new runtime instances were left unchanged");

    const existingAfter = metrics.listProjectMetrics("project_element")
      .filter((metric) => metric.metricKey === algorithm.algorithmKey)
      .sort((left, right) => left.entityId.localeCompare(right.entityId));
    const materializationsAfter = existingAfter.map((metric) => metrics.readMaterialization(metric.instanceId));
    const historiesAfter = existingAfter.map((metric) => metrics.readHistory(metric.instanceId, { order: "asc", limit: 20 }));
    expect(existingAfter).toEqual(existingBefore);
    expect(existingAfter).toHaveLength(7);
    expect(existingAfter.some((metric) => /(?:^|_)0?8$/u.test(metric.entityId))).toBe(false);
    expect(materializationsAfter).toEqual(materializationsBefore);
    expect(historiesAfter).toEqual(historiesBefore);
    expect(store.fddTasksByProject?.project_element?.find((entry) => entry.id === task.id)).toEqual(taskBefore);
    await app.close();
  });
});

describe("FDD binding proposer production shadow wiring", () => {
  it("uses the same collected evidence without extra BMS scans or changing the v4 check", async () => {
    async function run(mode: "off" | "shadow", pauseProjection = false) {
      const dataDir = mkdtempSync(path.join(tmpdir(), `ba-fdd-proposer-${mode}-`));
      const names = writeElementFleetFixture(dataDir);
      const store = elementStoreWithRunningPowerGrounding();
      ensureStoreFddLibrary(store);
      const algorithm = store.fddAlgorithms?.find((entry) => entry.algorithmKey === "chiller_ch_01_commanded_fails_to_start");
      if (!algorithm) throw new Error("Missing CH-01 fixture algorithm");
      const fetchMock = elementCollectorFetch(names, { includeObjectRefs: true });
      const providerComplete = vi.fn<ChatProvider["complete"]>(async (request) => {
        const task = JSON.parse(request.messages.find((message) => message.role === "user")?.content ?? "{}") as {
          projectId: string;
          evidenceSnapshotHash: string;
          algorithmSignature: string;
        };
        return {
          text: JSON.stringify({
            schemaVersion: "fleetguard-binding-proposal-v1",
            outcome: "abstain",
            projectId: task.projectId,
            evidenceSnapshotHash: task.evidenceSnapshotHash,
            algorithmSignature: task.algorithmSignature,
            reason: "insufficient_evidence"
          }),
          provider: { id: "test-real", mode: "real", model: "test-proposer" },
          fallbackUsed: false
        };
      });
      const chatProvider: ChatProvider = {
        metadata: { id: "test-real", mode: "real", model: "test-proposer" },
        complete: providerComplete
      };
      let resolveCompleted: ((record: unknown) => void) | undefined;
      const completed = new Promise<unknown>((resolve) => { resolveCompleted = resolve; });
      let releaseProjection: (() => void) | undefined;
      let projectionFinished = false;
      const projectionGate = new Promise<void>((resolve) => { releaseProjection = resolve; });
      const app = buildServer({
        store,
        fetch: fetchMock as typeof fetch,
        chatProvider,
        env: {
          BUILDING_AGENT_DATA_DIR: dataDir,
          BMS_DATABASE_API_URL: "http://collector.test",
          DERIVED_METRIC_MATERIALIZER_DISABLED: "1",
          BUILDING_AGENT_FDD_PROPOSER_MODE: mode,
          BUILDING_AGENT_FDD_PROPOSER_PROJECT_IDS: "project_element",
          BUILDING_AGENT_FDD_PROPOSER_ALGORITHM_IDS: algorithm.id
        },
        fddTestHooks: {
          beforeBindingProposerProjection: async () => {
            if (pauseProjection) await projectionGate;
            projectionFinished = true;
          },
          onBindingProposerCompleted: (record) => resolveCompleted?.(record)
        }
      });
      await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers });
      const response = await app.inject({
        method: "POST",
        url: `/api/projects/project_element/fdd-library/${algorithm.id}/test`,
        headers
      });
      const responseDidNotWaitForProjection = !pauseProjection || !projectionFinished;
      releaseProjection?.();
      const record = mode === "shadow"
        ? await Promise.race([
            completed,
            new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("shadow proposer did not complete")), 1_000))
          ])
        : undefined;
      const result = {
        check: frozenFleetPlan(response.json().check),
        fetchCount: fetchMock.mock.calls.length,
        providerCalls: providerComplete.mock.calls.length,
        responseDidNotWaitForProjection,
        record,
        audits: store.fddBindingProposalAuditsByProject?.project_element ?? []
      };
      await app.close();
      return result;
    }

    const off = await run("off");
    const shadow = await run("shadow");
    const slowShadow = await run("shadow", true);

    expect(shadow.fetchCount).toBe(off.fetchCount);
    expect(shadow.check).toEqual(off.check);
    expect(off.providerCalls).toBe(0);
    expect(off.audits).toEqual([]);
    expect(shadow.providerCalls).toBe(1);
    expect(shadow.record).toMatchObject({
      status: "succeeded",
      projectId: "project_element",
      comparison: { fleetGuardState: "blocked", matchesFleetGuardFamilies: null }
    });
    expect(shadow.audits).toHaveLength(1);
    expect(slowShadow.responseDidNotWaitForProjection).toBe(true);
    expect(slowShadow.check).toEqual(off.check);
    expect(slowShadow.fetchCount).toBe(off.fetchCount);
  });
});
