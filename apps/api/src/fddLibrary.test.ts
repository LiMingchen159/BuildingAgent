import { describe, expect, it } from "vitest";
import { createSeedStore } from "./seed.js";
import {
  createFddAlgorithmFromInput,
  ensureStoreFddLibrary,
  evaluateFddDeployability,
  normalizeFddCreateInput,
  seedFddAlgorithms,
  type FddPointCandidate
} from "./fddLibrary.js";

describe("FDD library", () => {
  it("seeds AHU DBN cards and the chiller low COP example into the global library", () => {
    const store = createSeedStore();
    ensureStoreFddLibrary(store);
    const algorithms = store.fddAlgorithms ?? [];

    expect(algorithms.length).toBeGreaterThan(20);
    expect(algorithms.some((algorithm) => algorithm.algorithmKey === "chiller_low_cop_detection")).toBe(true);
    expect(algorithms.every((algorithm) => algorithm.formula.trim().length > 0)).toBe(true);
    expect(algorithms.filter((algorithm) => algorithm.equipmentType === "ahu" && algorithm.method === "bayesian_network").length).toBeGreaterThan(20);
    expect(algorithms.filter((algorithm) => algorithm.equipmentType === "chiller" && algorithm.deployableRuntime).length).toBeGreaterThanOrEqual(5);
    expect(algorithms.every((algorithm) => !/^WCC-0[45]\b/u.test(algorithm.name))).toBe(true);
    expect(algorithms.every((algorithm) => algorithm.requiredPoints.every((point) => point.quantityKind && point.unitRoleDescription))).toBe(true);
    const chillerDocAlgorithms = algorithms.filter((algorithm) => /^chiller_ch_\d{2}_/u.test(algorithm.algorithmKey));
    expect(chillerDocAlgorithms).toHaveLength(51);
    expect(chillerDocAlgorithms.every((algorithm) => algorithm.equipmentType === "chiller")).toBe(true);
    expect(chillerDocAlgorithms.every((algorithm) => algorithm.deployableRuntime)).toBe(true);
    expect(new Set(chillerDocAlgorithms.map((algorithm) => algorithm.categoryKey))).toEqual(new Set([
      "Chiller-Operation",
      "Chiller-ChilledWater",
      "Chiller-CondenserWater",
      "Chiller-RefrigerantCompressor",
      "Chiller-ControlSetpoint",
      "Chiller-Sensor"
    ]));
    expect(chillerDocAlgorithms.some((algorithm) => algorithm.name === "CH-51 Heat Balance Sensor Consistency Fault")).toBe(true);
    const compressorOverload = algorithms.find((algorithm) => algorithm.algorithmKey === "chiller_ch_39_compressor_overload");
    expect(compressorOverload?.requiredPoints.find((point) => point.slot === "compressor_current")?.quantityKind).toBe("current");
    const lowCop = algorithms.find((algorithm) => algorithm.algorithmKey === "chiller_low_cop_detection");
    expect(lowCop?.requiredPoints.filter((point) => point.required).map((point) => point.slot)).toEqual([
      "chiller_status",
      "cooling_load",
      "chiller_power"
    ]);
    expect(lowCop?.requiredPoints.some((point) => point.slot === "chw_supply_temp" || point.slot === "chw_return_temp")).toBe(false);
    const ahuAlgorithms = algorithms.filter((algorithm) => algorithm.equipmentType === "ahu");
    expect(ahuAlgorithms).toHaveLength(28);
    expect(ahuAlgorithms.every((algorithm) => algorithm.categoryKey.startsWith("AHU-"))).toBe(true);
    expect(new Set(ahuAlgorithms.map((algorithm) => algorithm.categoryKey))).toEqual(new Set([
      "AHU-Coil",
      "AHU-Damper",
      "AHU-Duct",
      "AHU-Fan",
      "AHU-Filter",
      "AHU-Sensor",
      "AHU-WaterSide"
    ]));
  });

  it("keeps deployability checks to can_deploy, uncertain, and cannot_deploy", () => {
    const algorithm = seedFddAlgorithms().find((entry) => entry.algorithmKey === "chiller_low_cop_detection");
    expect(algorithm).toBeTruthy();
    const requiredCandidates = algorithm!.requiredPoints
      .filter((point) => point.required)
      .map((point): FddPointCandidate => ({
        slot: point.slot,
        pointName: `${point.slot}_point`,
        entityKey: "CHILLER-01",
        unitCompatibility: "match",
        dimensionReason: `Fixture matches ${point.quantityKind}.`,
        confidence: 0.95,
        historyDays: 90,
        reason: "exact test fixture match"
      }));

    expect(evaluateFddDeployability({
      algorithm: algorithm!,
      projectId: "project_alpha",
      source: "auto",
      projectDataSignature: "sig-1",
      pointCandidates: requiredCandidates,
      exampleEntityKey: "CHILLER-01"
    }).status).toBe("can_deploy");

    const uncertainCheck = evaluateFddDeployability({
      algorithm: algorithm!,
      projectId: "project_alpha",
      source: "manual",
      projectDataSignature: "sig-1",
      pointCandidates: [
        ...requiredCandidates,
        { ...requiredCandidates[0]!, pointName: "semantic_neighbor", confidence: 0.93, reason: "semantic neighbor" }
      ],
      exampleEntityKey: "CHILLER-01"
    });
    expect(uncertainCheck.status).toBe("uncertain");
    expect(uncertainCheck.ambiguousInputs[0]?.slot).toBe(requiredCandidates[0]!.slot);

    expect(evaluateFddDeployability({
      algorithm: algorithm!,
      projectId: "project_alpha",
      source: "manual",
      projectDataSignature: "sig-1",
      pointCandidates: requiredCandidates.slice(1),
      exampleEntityKey: "CHILLER-01"
    }).status).toBe("cannot_deploy");
  });

  it("resolves close running-status candidates by formula role before marking an entity uncertain", () => {
    const algorithm = seedFddAlgorithms().find((entry) => entry.algorithmKey === "chiller_chw_flow_proving_fault");
    expect(algorithm).toBeTruthy();
    if (!algorithm) return;

    const candidates: FddPointCandidate[] = [
      {
        slot: "chiller_status",
        pointName: "CHILLER_01_Run_Status",
        entityKey: "CHILLER_01",
        unitCompatibility: "match",
        dimensionReason: "Formula input expects status; catalog metadata indicates status.",
        confidence: 0.91,
        historyDays: 30,
        reason: "Matched \"run status\" against BMS catalog metadata."
      },
      {
        slot: "chiller_status",
        pointName: "CHILLER-L1-01-S",
        entityKey: "CHILLER_01",
        unitCompatibility: "match",
        dimensionReason: "Formula input expects status; catalog metadata indicates status.",
        confidence: 0.9,
        historyDays: 30,
        reason: "Matched \"On/Off Status\" against BMS catalog metadata."
      },
      {
        slot: "chw_flow_status",
        pointName: "CHILLER-L1-01-CHWFWS",
        entityKey: "CHILLER_01",
        unitCompatibility: "match",
        dimensionReason: "Formula input expects status; catalog metadata indicates status.",
        confidence: 0.94,
        historyDays: 30,
        reason: "Matched \"CHW Flow Status\" against BMS catalog metadata."
      },
      {
        slot: "chw_flow_rate",
        pointName: "CHILLER-L1-01-CHWFWR",
        entityKey: "CHILLER_01",
        unitCompatibility: "match",
        dimensionReason: "Formula input expects flow_rate; catalog metadata indicates flow_rate.",
        confidence: 0.94,
        historyDays: 30,
        reason: "Matched \"CHW Flowrate\" against BMS catalog metadata."
      }
    ];

    const check = evaluateFddDeployability({
      algorithm,
      projectId: "project_alpha",
      source: "manual",
      projectDataSignature: "sig-1",
      pointCandidates: candidates,
      exampleEntityKey: "CHILLER_01"
    });

    expect(check.status).toBe("can_deploy");
    expect(check.ambiguousInputs).toHaveLength(0);
    expect(check.selectedMappings?.find((mapping) => mapping.slot === "chiller_status")?.pointName).toBe("CHILLER_01_Run_Status");
  });

  it("resolves close CHW supply and return temperature candidates by point role", () => {
    const algorithm = seedFddAlgorithms().find((entry) => entry.algorithmKey === "chiller_low_chw_delta_t");
    expect(algorithm).toBeTruthy();
    if (!algorithm) return;

    const candidates: FddPointCandidate[] = [
      {
        slot: "chiller_status",
        pointName: "CHILLER_01_Run_Status",
        entityKey: "CHILLER_01",
        unitCompatibility: "match",
        dimensionReason: "Formula input expects status; catalog metadata indicates status.",
        confidence: 0.95,
        historyDays: 30,
        reason: "Matched \"run status\" against BMS catalog metadata."
      },
      {
        slot: "chw_flow_status",
        pointName: "CHILLER-L1-01-CHWFWS",
        entityKey: "CHILLER_01",
        unitCompatibility: "match",
        dimensionReason: "Formula input expects status; catalog metadata indicates status.",
        confidence: 0.95,
        historyDays: 30,
        reason: "Matched \"CHW Flow Status\" against BMS catalog metadata."
      },
      {
        slot: "chw_supply_temp",
        pointName: "CHILLER-L1-01-CHWST",
        entityKey: "CHILLER_01",
        unitCompatibility: "match",
        dimensionReason: "Formula input expects temperature; catalog metadata indicates temperature.",
        confidence: 0.99,
        historyDays: 30,
        reason: "Matched \"CHW Supply Temperature\" against BMS catalog metadata."
      },
      {
        slot: "chw_supply_temp",
        pointName: "CHILLER-L1-01-CHWRT",
        entityKey: "CHILLER_01",
        unitCompatibility: "match",
        dimensionReason: "Formula input expects temperature; catalog metadata indicates temperature.",
        confidence: 0.99,
        historyDays: 30,
        reason: "Matched \"CHW Supply Temperature\" against BMS catalog metadata."
      },
      {
        slot: "chw_return_temp",
        pointName: "CHILLER-L1-01-CHWRT",
        entityKey: "CHILLER_01",
        unitCompatibility: "match",
        dimensionReason: "Formula input expects temperature; catalog metadata indicates temperature.",
        confidence: 0.99,
        historyDays: 30,
        reason: "Matched \"CHW Return Temperature\" against BMS catalog metadata."
      },
      {
        slot: "chw_return_temp",
        pointName: "CHILLER-L1-01-CHWST",
        entityKey: "CHILLER_01",
        unitCompatibility: "match",
        dimensionReason: "Formula input expects temperature; catalog metadata indicates temperature.",
        confidence: 0.99,
        historyDays: 30,
        reason: "Matched \"CHW Return Temperature\" against BMS catalog metadata."
      }
    ];

    const check = evaluateFddDeployability({
      algorithm,
      projectId: "project_alpha",
      source: "manual",
      projectDataSignature: "sig-1",
      pointCandidates: candidates,
      exampleEntityKey: "CHILLER_01"
    });

    expect(check.status).toBe("can_deploy");
    expect(check.ambiguousInputs).toHaveLength(0);
    expect(check.selectedMappings?.find((mapping) => mapping.slot === "chw_supply_temp")?.pointName).toBe("CHILLER-L1-01-CHWST");
    expect(check.selectedMappings?.find((mapping) => mapping.slot === "chw_return_temp")?.pointName).toBe("CHILLER-L1-01-CHWRT");
  });

  it("normalizes community uploads as global algorithm specs without project mappings", () => {
    const input = normalizeFddCreateInput({
      name: "Community Pump Delta P Check",
      equipmentType: "pump",
      faultType: "efficiency",
      method: "rule_based",
      sharingScope: "global_community",
      logicSummary: "Compare pump command, flow, and differential pressure.",
      requiredPoints: [
        { slot: "pump_status", label: "Pump status", semantic: "Pump running status", required: true }
      ]
    });
    expect("error" in input).toBe(false);
    if ("error" in input) return;

    const algorithm = createFddAlgorithmFromInput(input, "user_ada");
    expect(algorithm.scope).toBe("global_community");
    expect(algorithm.authorUserId).toBe("user_ada");
    expect(algorithm.requiredPoints[0]?.slot).toBe("pump_status");
  });
});
