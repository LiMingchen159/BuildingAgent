import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DerivedMetricStore } from "./derivedMetrics.js";
import { buildServer } from "./server.js";
import { createSeedStore } from "./seed.js";

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
      return new Response(JSON.stringify({
        total: 1,
        items: [{ name: query, description, ...(unit ? { unit } : {}), ...(objectRef ? { object_ref: objectRef } : {}) }]
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
