import { describe, expect, it } from "vitest";
import {
  FLEET_GUARD_POLICY_VERSION,
  fleetGuardPlanId,
  planFleetGuard,
  type FddQuantityKind,
  type FleetGuardExactLookupEvidence,
  type FleetGuardPlanInput,
  type FleetGuardPointObservation,
  type FleetGuardRoleFamilyEvidence,
  type FleetGuardRoleRequirement
} from "../src/index.js";

interface RoleFixture {
  requirement: FleetGuardRoleRequirement;
  familyKey: string;
  pointSuffix: string;
  unitStatus: FleetGuardPointObservation["unit"]["status"];
  unit?: string;
}

const roleFixtures: Record<"CH01" | "CH02" | "CH03", RoleFixture[]> = {
  CH01: [
    {
      requirement: { role: "chiller_command", label: "Chiller command", quantityKind: "status", minHistoryDays: 7 },
      familyKey: "chiller_start_stop",
      pointSuffix: "Chiller_Start_Stop",
      unitStatus: "not_required"
    },
    {
      requirement: { role: "chiller_status", label: "Chiller run status", quantityKind: "status", minHistoryDays: 7 },
      familyKey: "run_status",
      pointSuffix: "Run_Status",
      unitStatus: "not_required"
    },
    {
      requirement: {
        role: "chiller_power",
        label: "Chiller power",
        quantityKind: "power",
        acceptableUnits: ["kW"],
        minHistoryDays: 7
      },
      familyKey: "tlkw",
      pointSuffix: "TLKW",
      unitStatus: "match",
      unit: "kW"
    }
  ],
  CH02: [
    {
      requirement: { role: "chiller_command", label: "Chiller command", quantityKind: "status", minHistoryDays: 7 },
      familyKey: "chiller_start_stop",
      pointSuffix: "Chiller_Start_Stop",
      unitStatus: "not_required"
    },
    {
      requirement: { role: "chiller_status", label: "Chiller run status", quantityKind: "status", minHistoryDays: 7 },
      familyKey: "run_status",
      pointSuffix: "Run_Status",
      unitStatus: "not_required"
    },
    {
      requirement: {
        role: "chiller_power",
        label: "Chiller power",
        quantityKind: "power",
        acceptableUnits: ["kW"],
        minHistoryDays: 7
      },
      familyKey: "tlkw",
      pointSuffix: "TLKW",
      unitStatus: "match",
      unit: "kW"
    }
  ],
  CH03: [
    {
      requirement: { role: "chiller_command", label: "Chiller command", quantityKind: "status", minHistoryDays: 7 },
      familyKey: "chiller_start_stop",
      pointSuffix: "Chiller_Start_Stop",
      unitStatus: "not_required"
    },
    {
      requirement: { role: "chiller_status", label: "Chiller run status", quantityKind: "status", minHistoryDays: 7 },
      familyKey: "run_status",
      pointSuffix: "Run_Status",
      unitStatus: "not_required"
    },
    {
      requirement: { role: "chiller_alarm", label: "Chiller alarm", quantityKind: "status", minHistoryDays: 7 },
      familyKey: "compsalm",
      pointSuffix: "COMPSALM",
      unitStatus: "not_required"
    },
    {
      requirement: {
        role: "chiller_running_power",
        label: "Chiller running power",
        quantityKind: "power",
        acceptableUnits: ["kW"],
        minHistoryDays: 7
      },
      familyKey: "tlkw",
      pointSuffix: "TLKW",
      unitStatus: "match",
      unit: "kW"
    }
  ]
};

function point(
  entityNumber: number,
  fixture: RoleFixture,
  quantityKind: FddQuantityKind = fixture.requirement.quantityKind
): FleetGuardPointObservation {
  const entityKey = `WCC_${entityNumber}`;
  const pointId = `${entityKey}_${fixture.pointSuffix}`;
  return {
    entityKey,
    familyKey: fixture.familyKey,
    pointId,
    objectRef: `//Elements/${pointId}`,
    ownership: {
      status: "verified",
      ownerEntityKey: entityKey,
      isPointOf: true
    },
    quantity: {
      status: "verified",
      kind: quantityKind
    },
    unit: {
      status: fixture.unitStatus,
      ...(fixture.unit ? { unit: fixture.unit } : {})
    },
    history: {
      status: "sufficient",
      observedDays: 30,
      sampleCount: 9_200
    },
    metadata: {
      description: `${entityKey} ${fixture.requirement.label}`,
      descriptionStatus: "match",
      brickClass: `brick:${fixture.pointSuffix}_Sensor`,
      brickClassStatus: "match"
    }
  };
}

function inputFor(algorithmCode: "CH01" | "CH02" | "CH03" = "CH01"): FleetGuardPlanInput {
  const fixtures = roleFixtures[algorithmCode];
  return {
    algorithm: {
      id: `fddalg_${algorithmCode.toLowerCase()}`,
      version: "v13",
      equipmentType: "chiller",
      requiredRoles: fixtures.map((fixture) => ({
        ...fixture.requirement,
        ...(fixture.requirement.acceptableUnits
          ? { acceptableUnits: [...fixture.requirement.acceptableUnits] }
          : {})
      }))
    },
    evaluator: {
      id: `evaluator_${algorithmCode.toLowerCase()}`,
      requiredVersion: "v13",
      status: "available",
      registeredVersion: "v13"
    },
    inventory: {
      status: "present",
      equipmentType: "chiller",
      members: Array.from({ length: 8 }, (_, index) => ({ entityKey: `WCC_${index + 1}` }))
    },
    roleFamilies: fixtures.map((fixture): FleetGuardRoleFamilyEvidence => ({
      role: fixture.requirement.role,
      familyKey: fixture.familyKey,
      status: "verified",
      source: "deterministic_ontology"
    })),
    lookups: Array.from({ length: 8 }, (_, index) =>
      fixtures.map((fixture): FleetGuardExactLookupEvidence => ({
        entityKey: `WCC_${index + 1}`,
        familyKey: fixture.familyKey,
        status: "found",
        observations: [point(index + 1, fixture)]
      }))
    ).flat(),
    signatures: {
      algorithm: `${algorithmCode}-algorithm-v13`,
      evaluator: `${algorithmCode}-evaluator-v13`,
      inventory: "element-wcc-inventory-v1",
      evidence: `${algorithmCode}-element-evidence-v1`,
      template: "element-chiller-template-v1",
      skill: "fleetguard-skill-v1",
      model: "zero-shot-proposer-v1",
      tool: "inventory-tools-v1"
    }
  };
}

function cloneInput(input: FleetGuardPlanInput): FleetGuardPlanInput {
  return JSON.parse(JSON.stringify(input)) as FleetGuardPlanInput;
}

function observationFor(input: FleetGuardPlanInput, entityKey: string, familyKey: string): FleetGuardPointObservation {
  const observation = input.lookups
    .find((entry) => entry.entityKey === entityKey && entry.familyKey === familyKey)
    ?.observations[0];
  if (!observation) throw new Error(`Missing fixture ${entityKey} ${familyKey}`);
  return observation;
}

function lookupFor(input: FleetGuardPlanInput, entityKey: string, familyKey: string): FleetGuardExactLookupEvidence {
  const lookup = input.lookups.find((entry) => entry.entityKey === entityKey && entry.familyKey === familyKey);
  if (!lookup) throw new Error(`Missing lookup fixture ${entityKey} ${familyKey}`);
  return lookup;
}

describe("FleetGuard fleet-consensus planning", () => {
  it.each(["CH01", "CH02", "CH03"] as const)(
    "authorizes the frozen Element %s mapping for all eight chillers",
    (algorithmCode) => {
      const plan = planFleetGuard(inputFor(algorithmCode));

      expect(plan.state).toBe("ready");
      expect(plan.policyVersion).toBe(FLEET_GUARD_POLICY_VERSION);
      expect(plan.coverage).toEqual({ expected: 8, bound: 8, dataReady: 8, authorized: 8 });
      expect(plan.entities).toHaveLength(8);
      expect(plan.entities.every((entity) => entity.state === "ready")).toBe(true);
      expect(plan.entities.every((entity) => entity.bindings.length === roleFixtures[algorithmCode].length)).toBe(true);
      for (let number = 1; number <= 8; number += 1) {
        const entity = plan.entities.find((entry) => entry.entityKey === `WCC_${number}`);
        expect(entity).toBeTruthy();
        for (const fixture of roleFixtures[algorithmCode]) {
          const pointId = `WCC_${number}_${fixture.pointSuffix}`;
          expect(entity?.bindings).toContainEqual({
            role: fixture.requirement.role,
            familyKey: fixture.familyKey,
            pointId,
            objectRef: `//Elements/${pointId}`,
            ...(fixture.unit ? { unit: fixture.unit } : {})
          });
        }
        expect(new Set(entity?.bindings.map((binding) => binding.pointId)).size).toBe(roleFixtures[algorithmCode].length);
        expect(new Set(entity?.bindings.map((binding) => binding.objectRef)).size).toBe(roleFixtures[algorithmCode].length);
      }
      expect(plan.blockers).toEqual([]);
      expect(plan).not.toHaveProperty("confidence");
      expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
    }
  );

  it("keeps a one-of-eight description error as a metadata warning", () => {
    const input = inputFor();
    const power = observationFor(input, "WCC_8", "tlkw");
    power.metadata = {
      ...power.metadata,
      description: "Incorrectly described energy accumulator",
      descriptionStatus: "mismatch"
    };

    const plan = planFleetGuard(input);

    expect(plan.state).toBe("ready");
    expect(plan.coverage.authorized).toBe(8);
    expect(plan.warnings).toEqual([expect.objectContaining({
      code: "description_mismatch",
      entityKey: "WCC_8",
      role: "chiller_power"
    })]);
  });

  it("keeps a one-of-eight Brick class error as a metadata warning", () => {
    const input = inputFor();
    const power = observationFor(input, "WCC_8", "tlkw");
    power.metadata = {
      ...power.metadata,
      brickClass: "brick:Energy_Sensor",
      brickClassStatus: "mismatch"
    };

    const plan = planFleetGuard(input);

    expect(plan.state).toBe("ready");
    expect(plan.coverage.authorized).toBe(8);
    expect(plan.warnings).toEqual([expect.objectContaining({
      code: "brick_class_mismatch",
      entityKey: "WCC_8",
      role: "chiller_power"
    })]);
  });

  it("blocks the whole fleet when WCC_8 is missing one exact point", () => {
    const input = inputFor();
    const lookup = lookupFor(input, "WCC_8", "tlkw");
    lookup.status = "absent";
    lookup.observations = [];

    const plan = planFleetGuard(input);

    expect(plan.state).toBe("blocked");
    expect(plan.coverage).toEqual({ expected: 8, bound: 7, dataReady: 7, authorized: 0 });
    expect(plan.primaryBlocker).toEqual(expect.objectContaining({
      code: "point_missing",
      entityKey: "WCC_8",
      role: "chiller_power"
    }));
  });

  it("treats a missing lookup row as unknown rather than claiming the point is absent", () => {
    const input = inputFor();
    input.lookups = input.lookups.filter((entry) => !(entry.entityKey === "WCC_8" && entry.familyKey === "tlkw"));

    const plan = planFleetGuard(input);

    expect(plan.state).toBe("blocked");
    expect(plan.coverage).toEqual({ expected: 8, bound: 7, dataReady: 7, authorized: 0 });
    expect(plan.primaryBlocker).toEqual(expect.objectContaining({
      code: "lookup_unknown",
      entityKey: "WCC_8",
      role: "chiller_power"
    }));
    expect(plan.blockers.some((entry) => entry.code === "point_missing")).toBe(false);
  });

  it.each([
    ["unknown", "lookup_unknown"],
    ["timeout", "lookup_timeout"],
    ["failed", "lookup_failed"],
    ["conflict", "lookup_conflict"]
  ] as const)("fails closed on an exact lookup %s result", (status, code) => {
    const input = inputFor();
    const lookup = lookupFor(input, "WCC_8", "tlkw");
    lookup.status = status;
    lookup.observations = [];

    const plan = planFleetGuard(input);

    expect(plan.state).toBe("blocked");
    expect(plan.coverage.authorized).toBe(0);
    expect(plan.blockers).toContainEqual(expect.objectContaining({ code, entityKey: "WCC_8", role: "chiller_power" }));
  });

  it.each(["absent", "unknown", "timeout", "failed", "conflict"] as const)(
    "treats a non-found %s lookup carrying observations as conflicting evidence",
    (status) => {
      const input = inputFor();
      lookupFor(input, "WCC_8", "tlkw").status = status;

      const plan = planFleetGuard(input);

      expect(plan.state).toBe("blocked");
      expect(plan.blockers).toContainEqual(expect.objectContaining({
        code: "lookup_conflict",
        entityKey: "WCC_8",
        role: "chiller_power"
      }));
    }
  );

  it.each([
    ["a found lookup with no observation", (input: FleetGuardPlanInput) => {
      lookupFor(input, "WCC_8", "tlkw").observations = [];
    }],
    ["duplicate lookup rows", (input: FleetGuardPlanInput) => {
      input.lookups.push(cloneInput(input).lookups.find((entry) =>
        entry.entityKey === "WCC_8" && entry.familyKey === "tlkw"
      )!);
    }]
  ] as const)("blocks %s as conflicting lookup evidence", (_label, mutate) => {
    const input = inputFor();
    mutate(input);

    const plan = planFleetGuard(input);

    expect(plan.state).toBe("blocked");
    expect(plan.coverage.authorized).toBe(0);
    expect(plan.blockers).toContainEqual(expect.objectContaining({
      code: "lookup_conflict",
      entityKey: "WCC_8",
      role: "chiller_power"
    }));
  });

  it.each([
    ["owner mismatch", (observation: FleetGuardPointObservation) => {
      observation.ownership.ownerEntityKey = "WCC_7";
    }, "ownership_mismatch", 7, 7],
    ["unknown owner", (observation: FleetGuardPointObservation) => {
      observation.ownership.status = "unknown";
      observation.ownership.isPointOf = null;
    }, "ownership_unknown", 7, 7],
    ["unverified isPointOf relation", (observation: FleetGuardPointObservation) => {
      observation.ownership.isPointOf = false;
    }, "is_point_of_unverified", 7, 7],
    ["quantity mismatch", (observation: FleetGuardPointObservation) => {
      observation.quantity.kind = "energy";
    }, "quantity_mismatch", 8, 7],
    ["quantity conflict", (observation: FleetGuardPointObservation) => {
      observation.quantity.status = "conflict";
    }, "quantity_conflict", 8, 7],
    ["unknown quantity kind", (observation: FleetGuardPointObservation) => {
      observation.quantity.kind = "unknown";
    }, "quantity_unknown", 8, 7],
    ["unit mismatch", (observation: FleetGuardPointObservation) => {
      observation.unit.status = "mismatch";
      observation.unit.unit = "kWh";
    }, "unit_mismatch", 8, 7],
    ["unknown unit", (observation: FleetGuardPointObservation) => {
      observation.unit.status = "unknown";
      delete observation.unit.unit;
    }, "unit_unknown", 8, 7],
    ["insufficient history", (observation: FleetGuardPointObservation) => {
      observation.history.status = "insufficient";
      observation.history.observedDays = 2;
    }, "history_insufficient", 8, 7],
    ["unknown history", (observation: FleetGuardPointObservation) => {
      observation.history.status = "unknown";
    }, "history_unknown", 8, 7],
    ["history without measured duration", (observation: FleetGuardPointObservation) => {
      observation.history.status = "sufficient";
      delete observation.history.observedDays;
    }, "history_unknown", 8, 7],
    ["history timeout", (observation: FleetGuardPointObservation) => {
      observation.history.status = "timeout";
    }, "history_timeout", 8, 7]
  ] as const)("fails closed on WCC_8 %s", (_label, mutate, code, bound, dataReady) => {
    const input = inputFor();
    mutate(observationFor(input, "WCC_8", "tlkw"));

    const plan = planFleetGuard(input);

    expect(plan.state).toBe("blocked");
    expect(plan.coverage).toEqual({ expected: 8, bound, dataReady, authorized: 0 });
    expect(plan.blockers).toContainEqual(expect.objectContaining({ code, entityKey: "WCC_8", role: "chiller_power" }));
  });

  it("blocks multiple exact points instead of choosing one", () => {
    const input = inputFor();
    const duplicate = cloneInput(input).lookups
      .find((entry) => entry.entityKey === "WCC_8" && entry.familyKey === "tlkw")
      ?.observations[0];
    if (!duplicate) throw new Error("Missing duplicate fixture");
    duplicate.pointId = "WCC_8_TLKW_SECOND";
    duplicate.objectRef = "//Elements/WCC_8_TLKW_SECOND";
    lookupFor(input, "WCC_8", "tlkw").observations.push(duplicate);

    const plan = planFleetGuard(input);

    expect(plan.state).toBe("blocked");
    expect(plan.coverage).toEqual({ expected: 8, bound: 7, dataReady: 7, authorized: 0 });
    expect(plan.blockers).toContainEqual(expect.objectContaining({ code: "point_multiple", entityKey: "WCC_8" }));
  });

  it.each(["pointId", "objectRef"] as const)("blocks a reused %s across the fleet", (identity) => {
    const input = inputFor();
    const seventh = observationFor(input, "WCC_7", "tlkw");
    const eighth = observationFor(input, "WCC_8", "tlkw");
    eighth[identity] = seventh[identity];

    const plan = planFleetGuard(input);

    expect(plan.state).toBe("blocked");
    expect(plan.coverage).toEqual({ expected: 8, bound: 6, dataReady: 6, authorized: 0 });
    expect(plan.blockers.filter((entry) => entry.code === (identity === "pointId" ? "duplicate_point_id" : "duplicate_object_ref"))).toHaveLength(2);
  });

  it("keeps fleet-wide duplicate-reference corruption handling bounded", () => {
    const input = inputFor();
    const fixture = roleFixtures.CH01[0]!;
    const memberCount = 8_192;
    input.algorithm.requiredRoles = [{ ...fixture.requirement }];
    input.roleFamilies = [{
      role: fixture.requirement.role,
      familyKey: fixture.familyKey,
      status: "verified",
      source: "deterministic_ontology"
    }];
    input.inventory.members = Array.from({ length: memberCount }, (_, index) => ({
      entityKey: `WCC_${index + 1}`
    }));
    input.lookups = Array.from({ length: memberCount }, (_, index): FleetGuardExactLookupEvidence => {
      const observation = point(index + 1, fixture);
      observation.objectRef = "//Elements/SHARED_CORRUPT_REF";
      return {
        entityKey: observation.entityKey,
        familyKey: fixture.familyKey,
        status: "found",
        observations: [observation]
      };
    });
    const startedAt = performance.now();

    const plan = planFleetGuard(input);
    const elapsedMs = performance.now() - startedAt;

    expect(plan.state).toBe("blocked");
    expect(plan.coverage).toEqual({ expected: memberCount, bound: 0, dataReady: 0, authorized: 0 });
    expect(plan.blockers.filter((entry) => entry.code === "duplicate_object_ref")).toHaveLength(memberCount);
    expect(elapsedMs).toBeLessThan(3_000);
  });

  it.each([
    ["tlkwh", "TLKWH", "energy", "kWh"],
    ["kva", "KVA", "power", "kVA"],
    ["motor_percent_kilowatts", "Motor_Percent_Kilowatts", "load", "%"]
  ] as const)("does not substitute %s for the verified TLKW family", (familyKey, pointSuffix, quantityKind, unit) => {
    const input = inputFor();
    const exact = lookupFor(input, "WCC_8", "tlkw");
    const wrong = exact.observations[0];
    if (!wrong) throw new Error("Missing power fixture");
    exact.status = "absent";
    exact.observations = [];
    wrong.familyKey = familyKey;
    wrong.pointId = `WCC_8_${pointSuffix}`;
    wrong.objectRef = `//Elements/WCC_8_${pointSuffix}`;
    wrong.quantity.kind = quantityKind;
    wrong.unit.unit = unit;
    input.lookups.push({
      entityKey: "WCC_8",
      familyKey,
      status: "found",
      observations: [wrong]
    });

    const plan = planFleetGuard(input);

    expect(plan.state).toBe("blocked");
    expect(plan.coverage.authorized).toBe(0);
    expect(plan.blockers).toContainEqual(expect.objectContaining({ code: "point_missing", entityKey: "WCC_8", role: "chiller_power" }));
  });

  it("does not authorize an LLM-only family", () => {
    const input = inputFor();
    const power = input.roleFamilies.find((entry) => entry.role === "chiller_power");
    if (!power) throw new Error("Missing family fixture");
    power.source = "llm_proposal";

    const plan = planFleetGuard(input);

    expect(plan.state).toBe("blocked");
    expect(plan.coverage.authorized).toBe(0);
    expect(plan.primaryBlocker).toEqual(expect.objectContaining({
      code: "role_family_unauthorized_source",
      role: "chiller_power"
    }));
  });

  it("blocks two verified ontology families when no template is locked", () => {
    const input = inputFor();
    input.roleFamilies.push({
      role: "chiller_power",
      familyKey: "motor_kw",
      status: "verified",
      source: "deterministic_ontology"
    });

    const plan = planFleetGuard(input);

    expect(plan.state).toBe("blocked");
    expect(plan.coverage.authorized).toBe(0);
    expect(plan.primaryBlocker).toEqual(expect.objectContaining({ code: "role_family_ambiguous", role: "chiller_power" }));
  });

  it.each(["unknown", "conflict"] as const)("fails closed on %s ontology family evidence", (status) => {
    const input = inputFor();
    input.roleFamilies.push({
      role: "chiller_power",
      familyKey: "motor_kw",
      status,
      source: "deterministic_ontology"
    });

    const plan = planFleetGuard(input);

    expect(plan.state).toBe("blocked");
    expect(plan.coverage.authorized).toBe(0);
    expect(plan.primaryBlocker).toEqual(expect.objectContaining({ code: `role_family_${status}`, role: "chiller_power" }));
  });

  it("lets a locked template resolve competing ontology families", () => {
    const input = inputFor();
    input.roleFamilies.push(
      { role: "chiller_power", familyKey: "motor_kw", status: "verified", source: "deterministic_ontology" },
      { role: "chiller_power", familyKey: "tlkw", status: "verified", source: "locked_template", templateVersion: "v2" }
    );

    const plan = planFleetGuard(input);

    expect(plan.state).toBe("ready");
    expect(plan.roleFamilies).toContainEqual({
      role: "chiller_power",
      familyKey: "tlkw",
      source: "locked_template",
      templateVersion: "v2"
    });
  });

  it.each([
    ["missing template version", (input: FleetGuardPlanInput) => {
      input.roleFamilies.push({ role: "chiller_power", familyKey: "tlkw", status: "verified", source: "locked_template" });
    }, "template_version_missing"],
    ["missing template signature", (input: FleetGuardPlanInput) => {
      input.roleFamilies.push({
        role: "chiller_power",
        familyKey: "tlkw",
        status: "verified",
        source: "locked_template",
        templateVersion: "element-chiller@v2"
      });
      delete input.signatures.template;
    }, "template_signature_missing"],
    ["conflicting locked status", (input: FleetGuardPlanInput) => {
      input.roleFamilies.push(
        {
          role: "chiller_power",
          familyKey: "tlkw",
          status: "verified",
          source: "locked_template",
          templateVersion: "element-chiller@v2"
        },
        {
          role: "chiller_power",
          familyKey: "tlkw",
          status: "conflict",
          source: "locked_template",
          templateVersion: "element-chiller@v2"
        }
      );
    }, "role_family_conflict"],
    ["unknown locked status", (input: FleetGuardPlanInput) => {
      input.roleFamilies.push(
        {
          role: "chiller_power",
          familyKey: "tlkw",
          status: "verified",
          source: "locked_template",
          templateVersion: "element-chiller@v2"
        },
        {
          role: "chiller_power",
          familyKey: "tlkw",
          status: "unknown",
          source: "locked_template",
          templateVersion: "element-chiller@v2"
        }
      );
    }, "role_family_unknown"],
    ["conflicting locked versions", (input: FleetGuardPlanInput) => {
      input.roleFamilies.push(
        {
          role: "chiller_power",
          familyKey: "tlkw",
          status: "verified",
          source: "locked_template",
          templateVersion: "element-chiller@v2"
        },
        {
          role: "chiller_power",
          familyKey: "tlkw",
          status: "verified",
          source: "locked_template",
          templateVersion: "element-chiller@v3"
        }
      );
    }, "template_version_conflict"]
  ] as const)("blocks a locked template with %s", (_label, mutate, code) => {
    const input = inputFor();
    mutate(input);

    const plan = planFleetGuard(input);

    expect(plan.state).toBe("blocked");
    expect(plan.coverage.authorized).toBe(0);
    expect(plan.blockers).toContainEqual(expect.objectContaining({ code, role: "chiller_power" }));
  });

  it("canonicalizes equivalent duplicate role-family evidence independent of order", () => {
    const first = inputFor();
    first.roleFamilies.push({
      role: " chiller_power ",
      familyKey: "tlkw",
      status: "verified",
      source: "deterministic_ontology"
    });
    const reversed = cloneInput(first);
    reversed.roleFamilies.reverse();

    const firstPlan = planFleetGuard(first);
    const reversedPlan = planFleetGuard(reversed);

    expect(firstPlan).toEqual(reversedPlan);
    expect(firstPlan.state).toBe("ready");
    expect(firstPlan.roleFamilies).toContainEqual({
      role: "chiller_power",
      familyKey: "tlkw",
      source: "deterministic_ontology"
    });
  });

  it("returns not applicable only for authoritative absence", () => {
    const absentInput = inputFor();
    absentInput.inventory.status = "absent";
    absentInput.inventory.members = [];
    absentInput.lookups = [];
    absentInput.evaluator.status = "missing";
    const absent = planFleetGuard(absentInput);

    const unknownInput = inputFor();
    unknownInput.inventory.status = "unknown";
    const unknown = planFleetGuard(unknownInput);

    expect(absent.state).toBe("not_applicable");
    expect(absent.coverage).toEqual({ expected: 0, bound: 0, dataReady: 0, authorized: 0 });
    expect(absent.primaryBlocker?.code).toBe("inventory_absent");
    expect(unknown.state).toBe("blocked");
    expect(unknown.primaryBlocker?.code).toBe("inventory_unknown");
  });

  it.each([
    ["non-empty members", (input: FleetGuardPlanInput) => {
      input.lookups = [];
    }, "inventory_absent_conflict"],
    ["stale lookup evidence", (input: FleetGuardPlanInput) => {
      input.inventory.members = [];
    }, "inventory_absent_conflict"],
    ["equipment-type mismatch", (input: FleetGuardPlanInput) => {
      input.inventory.members = [];
      input.lookups = [];
      input.inventory.equipmentType = "pump";
    }, "inventory_equipment_mismatch"],
    ["missing inventory signature", (input: FleetGuardPlanInput) => {
      input.inventory.members = [];
      input.lookups = [];
      input.signatures.inventory = " ";
    }, "signature_missing"]
  ] as const)("blocks a contradictory absent inventory with %s", (_label, mutate, code) => {
    const input = inputFor();
    input.inventory.status = "absent";
    mutate(input);

    const plan = planFleetGuard(input);

    expect(plan.state).toBe("blocked");
    expect(plan.coverage.authorized).toBe(0);
    expect(plan.blockers).toContainEqual(expect.objectContaining({ code }));
  });

  it.each([
    ["missing evaluator", (input: FleetGuardPlanInput) => {
      input.evaluator.status = "missing";
      delete input.evaluator.registeredVersion;
    }, "evaluator_missing"],
    ["version mismatch", (input: FleetGuardPlanInput) => {
      input.evaluator.registeredVersion = "v12";
    }, "evaluator_version_mismatch"]
  ] as const)("blocks %s", (_label, mutate, code) => {
    const input = inputFor();
    mutate(input);

    const plan = planFleetGuard(input);

    expect(plan.state).toBe("blocked");
    expect(plan.coverage).toEqual({ expected: 8, bound: 8, dataReady: 8, authorized: 0 });
    expect(plan.primaryBlocker?.code).toBe(code);
  });

  it.each([
    ["empty required-role list", (input: FleetGuardPlanInput) => {
      input.algorithm.requiredRoles = [];
    }, "required_roles_empty"],
    ["missing evidence signature", (input: FleetGuardPlanInput) => {
      input.signatures.evidence = "";
    }, "signature_missing"],
    ["blank inventory member", (input: FleetGuardPlanInput) => {
      input.inventory.members.push({ entityKey: " " });
    }, "inventory_invalid_entity"],
    ["unknown required quantity", (input: FleetGuardPlanInput) => {
      input.algorithm.requiredRoles[0]!.quantityKind = "unknown";
    }, "required_role_invalid"],
    ["empty algorithm ID", (input: FleetGuardPlanInput) => {
      input.algorithm.id = " ";
    }, "algorithm_invalid"],
    ["empty algorithm version", (input: FleetGuardPlanInput) => {
      input.algorithm.version = "";
    }, "algorithm_invalid"],
    ["empty evaluator ID", (input: FleetGuardPlanInput) => {
      input.evaluator.id = " ";
    }, "evaluator_invalid"],
    ["empty evaluator versions", (input: FleetGuardPlanInput) => {
      input.evaluator.requiredVersion = " ";
      input.evaluator.registeredVersion = " ";
    }, "evaluator_invalid"]
  ] as const)("does not false-ready on %s", (_label, mutate, code) => {
    const input = inputFor();
    mutate(input);

    const plan = planFleetGuard(input);

    expect(plan.state).toBe("blocked");
    expect(plan.coverage.authorized).toBe(0);
    expect(plan.blockers).toContainEqual(expect.objectContaining({ code }));
  });

  it("canonicalizes required role whitespace before exact planning", () => {
    const input = inputFor();
    const power = input.algorithm.requiredRoles.find((role) => role.role === "chiller_power");
    if (!power) throw new Error("Missing power requirement");
    power.role = " chiller_power ";
    power.label = " Chiller power ";

    const plan = planFleetGuard(input);

    expect(plan.state).toBe("ready");
    expect(plan.roleFamilies).toContainEqual({
      role: "chiller_power",
      familyKey: "tlkw",
      source: "deterministic_ontology"
    });
    expect(plan.entities[0]?.bindings).toContainEqual(expect.objectContaining({ role: "chiller_power" }));
  });

  it("trims exact binding identifiers and units before runtime handoff", () => {
    const input = inputFor();
    const observation = observationFor(input, "WCC_8", "tlkw");
    observation.pointId = ` ${observation.pointId} `;
    observation.objectRef = ` ${observation.objectRef} `;
    observation.unit.unit = " kW ";

    const plan = planFleetGuard(input);
    const binding = plan.entities
      .find((entity) => entity.entityKey === "WCC_8")
      ?.bindings.find((entry) => entry.role === "chiller_power");

    expect(plan.state).toBe("ready");
    expect(binding).toEqual({
      role: "chiller_power",
      familyKey: "tlkw",
      pointId: "WCC_8_TLKW",
      objectRef: "//Elements/WCC_8_TLKW",
      unit: "kW"
    });
  });

  it("canonicalizes equivalent duplicate role units before reorder-safe blocking", () => {
    const input = inputFor();
    const power = input.algorithm.requiredRoles.find((role) => role.role === "chiller_power");
    if (!power) throw new Error("Missing power requirement");
    input.algorithm.requiredRoles.push({ ...power, acceptableUnits: ["KW"] });
    const observation = observationFor(input, "WCC_8", "tlkw");
    observation.unit.status = "mismatch";
    observation.unit.unit = "kWh";
    const reversed = cloneInput(input);
    reversed.algorithm.requiredRoles.reverse();

    const firstPlan = planFleetGuard(input);
    const reversedPlan = planFleetGuard(reversed);

    expect(firstPlan.state).toBe("blocked");
    expect(firstPlan.blockers).toContainEqual(expect.objectContaining({ code: "required_role_duplicate" }));
    expect(reversedPlan).toEqual(firstPlan);
  });

  it("is invariant to evidence order across twenty repeated plans", () => {
    const baselineInput = inputFor();
    const baseline = planFleetGuard(baselineInput);
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const shuffled = cloneInput(baselineInput);
      const offset = iteration % shuffled.lookups.length;
      shuffled.lookups = [
        ...shuffled.lookups.slice(offset),
        ...shuffled.lookups.slice(0, offset)
      ].reverse();
      for (const lookup of shuffled.lookups) lookup.observations.reverse();
      shuffled.roleFamilies.reverse();
      shuffled.inventory.members.reverse();
      shuffled.algorithm.requiredRoles.reverse();
      expect(planFleetGuard(shuffled)).toEqual(baseline);
    }
  });

  it("indexes exact lookups once instead of rescanning the table for every entity and role", () => {
    const input = inputFor("CH03");
    const slicedLookups = input.lookups.slice();
    Object.defineProperty(slicedLookups, "filter", {
      value: () => { throw new Error("exact lookup table was rescanned"); }
    });
    Object.defineProperty(input.lookups, "slice", {
      value: () => slicedLookups
    });

    const plan = planFleetGuard(input);

    expect(plan.state).toBe("ready");
    expect(plan.coverage.authorized).toBe(8);
  });

  it("changes planId only when an input signature changes", () => {
    const input = inputFor();
    const baseline = planFleetGuard(input);
    const changedInput = cloneInput(input);
    changedInput.signatures.evidence = "CH01-element-evidence-v2";
    const changed = planFleetGuard(changedInput);

    expect(changed.planId).not.toBe(baseline.planId);
    expect(planFleetGuard(cloneInput(input)).planId).toBe(baseline.planId);
    expect(baseline.planId).not.toContain("2026-");
  });

  it.each(["template", "skill", "model", "tool"] as const)(
    "presence-tags an optional %s signature so missing cannot collide with a literal sentinel",
    (signatureKey) => {
      const input = inputFor();
      delete input.signatures[signatureKey];
      const missingId = fleetGuardPlanId(input.signatures);
      input.signatures[signatureKey] = "-";
      const literalId = fleetGuardPlanId(input.signatures);

      expect(literalId).not.toBe(missingId);
      expect(missingId).toContain(`${signatureKey}=missing`);
      expect(literalId).toContain(`${signatureKey}=value:-`);
    }
  );

  it("gives blocked missing-template and signed locked-template plans different IDs", () => {
    const missing = inputFor();
    missing.roleFamilies.push({
      role: "chiller_power",
      familyKey: "tlkw",
      status: "verified",
      source: "locked_template",
      templateVersion: "element-chiller@v2"
    });
    delete missing.signatures.template;
    const signed = cloneInput(missing);
    signed.signatures.template = "-";

    const missingPlan = planFleetGuard(missing);
    const signedPlan = planFleetGuard(signed);

    expect(missingPlan.state).toBe("blocked");
    expect(signedPlan.state).toBe("ready");
    expect(missingPlan.planId).not.toBe(signedPlan.planId);
  });

  it("preserves optional signature presence so the emitted planId is reproducible", () => {
    const input = inputFor();
    input.signatures.skill = "";

    const plan = planFleetGuard(input);

    expect(plan.signatures).toHaveProperty("skill", "");
    expect(fleetGuardPlanId(plan.signatures)).toBe(plan.planId);
  });
});
