import { describe, expect, it } from "vitest";
import {
  fddEngineeringUnitIsAccepted,
  fddInventoryEvidenceSignature,
  fddKbSummaryHasCompleteEquipmentInventory,
  normalizeFddEngineeringUnit,
  parseMinimalBrickFacts
} from "./equipmentEvidence.js";

describe("FDD equipment evidence", () => {
  it("requires an explicit full-inventory marker before absence is authoritative", () => {
    expect(fddKbSummaryHasCompleteEquipmentInventory("## Full point directory")).toBe(true);
    expect(fddKbSummaryHasCompleteEquipmentInventory("## Full-plant Brick model (`brick_model.ttl`)")).toBe(true);
    expect(fddKbSummaryHasCompleteEquipmentInventory("## Full equipment inventory")).toBe(true);
    expect(fddKbSummaryHasCompleteEquipmentInventory("## Chiller point sample\nPartial export only")).toBe(false);
    expect(fddKbSummaryHasCompleteEquipmentInventory("This is not a full equipment inventory.")).toBe(false);
  });

  it("parses terminal-dot equipment statements and preserves point parent evidence", () => {
    const facts = parseMinimalBrickFacts([
      "test:CHILLER_01 a brick:Chiller .",
      "test:POINT_01 a brick:Leaving_Chilled_Water_Temperature_Sensor ;",
      "  rdfs:label \"CHILLER_01_CHWST\" ;",
      "  brick:isPointOf test:CHILLER_01 ;",
      "  test:unitHint \"°C\" ."
    ].join("\n"));
    expect(facts).toEqual([
      { subjectKey: "CHILLER_01", brickClass: "Chiller" },
      {
        subjectKey: "POINT_01",
        brickClass: "Leaving_Chilled_Water_Temperature_Sensor",
        label: "CHILLER_01_CHWST",
        parentEntityKey: "CHILLER_01",
        unit: "°C"
      }
    ]);
  });

  it("accepts unit aliases without treating convertible units as equivalent", () => {
    expect(normalizeFddEngineeringUnit("m³ / h")).toBe("m3/h");
    expect(fddEngineeringUnitIsAccepted("kilowatts", ["kW", "W"])).toBe(true);
    expect(fddEngineeringUnitIsAccepted("°C", ["C", "degC"])).toBe(true);
    expect(fddEngineeringUnitIsAccepted("MW", ["kW", "W"])).toBe(false);
    expect(fddEngineeringUnitIsAccepted("degF", ["degC"])).toBe(false);
  });

  it("changes the signature for normalized point parent, class, and unit evidence", () => {
    const signature = (overrides: Partial<{ parentEntityKey: string; brickClass: string; unit: string }> = {}) =>
      fddInventoryEvidenceSignature({
        authoritativeInventory: true,
        availability: [{ equipmentType: "chiller", status: "available", entityKeys: ["CHILLER_01"] }],
        equipment: [{ entityKey: "CHILLER_01", equipmentType: "chiller", brickClass: "Chiller" }],
        points: [{
          subjectKey: "POINT_01",
          pointName: "CHILLER_01_CHWST",
          parentEntityKey: overrides.parentEntityKey ?? "CHILLER_01",
          brickClass: overrides.brickClass ?? "Temperature_Sensor",
          unit: overrides.unit ?? "degC"
        }]
      });
    const baseline = signature();
    expect(signature({ parentEntityKey: "CHILLER_02" })).not.toBe(baseline);
    expect(signature({ brickClass: "Power_Sensor" })).not.toBe(baseline);
    expect(signature({ unit: "degF" })).not.toBe(baseline);
    expect(signature({ unit: "°C" })).toBe(baseline);
  });
});
