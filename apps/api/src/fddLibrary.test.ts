import { describe, expect, it } from "vitest";
import { createSeedStore } from "./seed.js";
import {
  createFddAlgorithmFromInput,
  ensureStoreFddLibrary,
  evaluateFddDeployability,
  FDD_DEPLOYABILITY_POLICY_VERSION,
  normalizeFddCreateInput,
  seedFddAlgorithms,
  type FddPointCandidate,
  type ProjectFddTask
} from "./fddLibrary.js";
import { executableFddAlgorithmKeys } from "./fdd/runtimeRegistry.js";

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
    const ahuAlgorithms = algorithms.filter((algorithm) => algorithm.equipmentType === "ahu" && !algorithm.sourcePaperId?.startsWith("docx:"));
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

  it("migrates legacy community algorithms and task snapshots to specification-only", () => {
    const store = createSeedStore();
    const base = seedFddAlgorithms().find((algorithm) => algorithm.algorithmKey === "chiller_low_cop_detection")!;
    const legacyCommunity = {
      ...base,
      id: "fddalg_legacy_custom",
      scope: "global_community" as const,
      algorithmKey: "legacy_custom_rule",
      deployableRuntime: true
    };
    const task: ProjectFddTask = {
      id: "fddtask_legacy_custom",
      projectId: "project_alpha",
      source: "project_upload",
      sharingScope: "project_only",
      algorithmSnapshot: { ...legacyCommunity },
      status: "ready",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    };
    store.fddAlgorithms = [legacyCommunity];
    store.fddTasksByProject = { project_alpha: [task] };

    expect(ensureStoreFddLibrary(store)).toBe(true);
    expect(store.fddAlgorithms?.find((algorithm) => algorithm.id === legacyCommunity.id)?.deployableRuntime).toBe(false);
    expect(store.fddTasksByProject.project_alpha?.[0]?.algorithmSnapshot.deployableRuntime).toBe(false);
    expect(store.fddTasksByProject.project_alpha?.[0]?.status).toBe("cannot_deploy");
  });

  it("imports and classifies all 111 equipment DOCX rules without claiming runtime support", () => {
    const algorithms = seedFddAlgorithms();
    const imported = algorithms.filter((algorithm) => algorithm.sourcePaperId?.startsWith("docx:"));

    expect(imported).toHaveLength(111);
    expect(new Set(imported.map((algorithm) => algorithm.id)).size).toBe(111);
    expect(new Set(imported.map((algorithm) => algorithm.algorithmKey)).size).toBe(111);
    expect(imported.every((algorithm) => algorithm.scope === "global_builtin")).toBe(true);
    expect(imported.every((algorithm) => algorithm.method === "rule_based")).toBe(true);
    expect(imported.every((algorithm) => algorithm.deployableRuntime === false)).toBe(true);
    expect(imported.every((algorithm) => algorithm.categoryKey && algorithm.categoryLabel)).toBe(true);
    expect(imported.every((algorithm) => algorithm.requiredPoints.length > 0)).toBe(true);
    expect(imported.every((algorithm) => algorithm.requiredPoints.every((point) => point.slot && point.label && point.semantic))).toBe(true);
    expect(imported.every((algorithm) => algorithm.parameters.some((parameter) => parameter.key === "window_minutes"))).toBe(true);
    expect(new Set(imported.map((algorithm) => algorithm.sourcePaperId))).toEqual(new Set([
      "docx:VAV_Box_FDD_Library.docx:9577d893a39e221f7f28f4a887e438d6cd30b890d2d719244b6883c10bedff45",
      "docx:Pump_FDD_Library.docx:25f225a288ab584dfe30742ff4ad01d41bf5faec9a530fad428785b32eb015e0",
      "docx:FCU_FDD_Library.docx:a390869597d82a840695cbae7f0abe8316a1eb615922bb54718c4d2f2e656dd8",
      "docx:Cooling_Tower_FDD_Library.docx:2b4a1b6f9cbcbcbea8c2ae77721f8212ebbec15f1e90b074a4f1e83e8bf5e619",
      "docx:AHU_FDD_Library.docx:027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    ]));

    expect(Object.fromEntries(["ahu", "fcu", "pump", "cooling_tower", "vav"].map((equipmentType) => [
      equipmentType,
      imported.filter((algorithm) => algorithm.equipmentType === equipmentType).length
    ]))).toEqual({ ahu: 44, fcu: 20, pump: 18, cooling_tower: 12, vav: 17 });

    expect(Object.fromEntries(["implementation_ready", "requires_configuration", "requires_review"].map((status) => [
      status,
      imported.filter((algorithm) => algorithm.definitionStatus === status).length
    ]))).toEqual({ implementation_ready: 43, requires_configuration: 46, requires_review: 22 });

    expect(imported.every((algorithm) => algorithm.sourceDefinition?.sha256 && algorithm.version.includes(algorithm.sourceDefinition.sha256.slice(0, 8)))).toBe(true);
    expect(imported.every((algorithm) => algorithm.requiredPoints.every((point) =>
      point.sourceSymbols?.length
      && point.sourceBrickClasses?.length === point.sourceSymbols.length
      && !point.semantic.includes("source point")
    ))).toBe(true);
    expect(imported.flatMap((algorithm) => algorithm.requiredPoints).flatMap((point) => point.sourceSymbols ?? [])).toHaveLength(262);
    expect(imported.filter((algorithm) => algorithm.definitionStatus === "requires_configuration").every((algorithm) =>
      algorithm.definitionParameters?.some((parameter) => parameter.resolution === "site_required")
    )).toBe(true);

    const vavCoolingCapacity = imported.find((algorithm) => algorithm.name.startsWith("VAV-03 "));
    expect(vavCoolingCapacity?.requiredPoints.some((point) => point.slot === "dam_cmd_or_dam_fb")).toBe(true);
    const fcuSimultaneousHeatingCooling = imported.find((algorithm) => algorithm.name.startsWith("FCU-12 "));
    expect(fcuSimultaneousHeatingCooling?.requiredPoints.map((point) => point.slot)).toEqual([
      "ccv_cmd_or_ccv_fb",
      "hcv_cmd_or_hcv_fb"
    ]);
    const basinLevel = imported.find((algorithm) => algorithm.name.startsWith("CT-07 "));
    expect(basinLevel?.requiredPoints[0]?.quantityKind).toBe("level");
    const uncategorizedPumpRule = imported.find((algorithm) => algorithm.name.startsWith("PMP-17 "));
    expect(uncategorizedPumpRule?.categoryKey).toBe("Pump-Sensor");
    expect(uncategorizedPumpRule?.definitionStatus).toBe("requires_review");
    expect(imported.find((algorithm) => algorithm.name.startsWith("PMP-11 "))?.definitionStatus).toBe("requires_review");
    expect(imported.find((algorithm) => algorithm.name.startsWith("AHU-06 "))?.definitionIssues?.[0]).toContain("fan enable");
    expect(imported.find((algorithm) => algorithm.name.startsWith("AHU-41 "))?.definitionIssues?.join(" ")).toContain("humidity symbol");
    expect(imported.find((algorithm) => algorithm.name.startsWith("VAV-06 "))?.formula).toContain("|DAM_{cmd}-DAM_{fb}|");
    expect(imported.find((algorithm) => algorithm.name.startsWith("PMP-18 "))?.formula).toContain("(P_{out}-P_{in})/(DP)");
    expect(imported.find((algorithm) => algorithm.name.startsWith("AHU-32 "))?.formula).toContain("(T_{ma}-T_{ra})/(T_{oa}-T_{ra})");
    expect(imported.find((algorithm) => algorithm.name.startsWith("PMP-06 "))?.definitionParameters?.map((parameter) => parameter.symbol)).toContain("σ_DP");
    expect(imported.find((algorithm) => algorithm.name.startsWith("PMP-18 "))?.definitionParameters?.map((parameter) => parameter.symbol)).toContain("σ_dp");
    expect(imported.find((algorithm) => algorithm.name.startsWith("FCU-12 "))).toMatchObject({
      definitionStatus: "requires_review",
      definitionIssues: [expect.stringContaining("one-of groups")]
    });
    expect(imported.filter((algorithm) => /\bMODE\s*=/iu.test(algorithm.formula)).every((algorithm) =>
      algorithm.definitionStatus !== "implementation_ready"
      && algorithm.definitionParameters?.some((parameter) => parameter.symbol === "MODE_encoding" && parameter.resolution === "site_required")
    )).toBe(true);
  });

  it("keeps runtime metadata exactly aligned with the executable evaluator registry", () => {
    const runtimeKeys = seedFddAlgorithms()
      .filter((algorithm) => algorithm.deployableRuntime)
      .map((algorithm) => algorithm.algorithmKey)
      .sort();
    expect(runtimeKeys).toEqual(executableFddAlgorithmKeys());
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

    const deployableCheck = evaluateFddDeployability({
      algorithm: algorithm!,
      projectId: "project_alpha",
      source: "auto",
      projectDataSignature: "sig-1",
      pointCandidates: requiredCandidates,
      exampleEntityKey: "CHILLER-01"
    });
    expect(deployableCheck.status).toBe("can_deploy");
    expect(deployableCheck.checkPolicyVersion).toBe(FDD_DEPLOYABILITY_POLICY_VERSION);

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

    const unverifiedHistory = requiredCandidates.map(({ historyDays: _historyDays, ...candidate }) => candidate);
    const unverifiedCheck = evaluateFddDeployability({
      algorithm: algorithm!,
      projectId: "project_alpha",
      source: "manual",
      projectDataSignature: "sig-1",
      pointCandidates: unverifiedHistory,
      exampleEntityKey: "CHILLER-01"
    });
    expect(unverifiedCheck.status).toBe("cannot_deploy");
    expect(unverifiedCheck.historyIssues).toHaveLength(requiredCandidates.length);
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
    expect(algorithm.deployableRuntime).toBe(false);
  });

  it("accepts VAV community specifications without pretending they have an evaluator", () => {
    const input = normalizeFddCreateInput({
      name: "VAV-Community-01 Zone temperature check",
      equipmentType: "vav",
      faultType: "zone temperature",
      method: "rule_based",
      formula: "fault = zone_temp > zone_temp_setpoint + threshold",
      logicSummary: "Community VAV specification.",
      sharingScope: "global_community",
      requiredPoints: [
        { slot: "zone_temp", label: "Zone temperature", semantic: "Zone air temperature", required: true, quantityKind: "temperature" }
      ]
    });
    expect("error" in input).toBe(false);
    if ("error" in input) return;

    const algorithm = createFddAlgorithmFromInput(input, "user_ada");
    expect(algorithm.equipmentType).toBe("vav");
    expect(algorithm.deployableRuntime).toBe(false);
  });
});
