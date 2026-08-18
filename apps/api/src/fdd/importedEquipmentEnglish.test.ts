import { describe, expect, it } from "vitest";
import { IMPORTED_EQUIPMENT_FDD_CATALOG } from "./importedEquipmentCatalog.js";
import {
  IMPORTED_EQUIPMENT_RULE_DISPLAY_NAMES,
  importedEquipmentCategoryDisplayLabel,
  importedEquipmentRuleDisplayName,
  importedEquipmentSourceDescription
} from "./importedEquipmentEnglish.js";
import { importedEquipmentFddAlgorithms } from "./importedEquipmentLibrary.js";

const CJK_TEXT = /[\u3400-\u9fff\uf900-\ufaff]/u;

describe("imported equipment English display metadata", () => {
  it("covers all 111 imported rules with non-CJK English display names and categories", () => {
    expect(IMPORTED_EQUIPMENT_FDD_CATALOG.rules).toHaveLength(111);
    expect(Object.keys(IMPORTED_EQUIPMENT_RULE_DISPLAY_NAMES)).toHaveLength(111);

    for (const rule of IMPORTED_EQUIPMENT_FDD_CATALOG.rules) {
      const displayName = importedEquipmentRuleDisplayName(rule.id);
      const categoryLabel = importedEquipmentCategoryDisplayLabel(rule);
      expect(displayName, rule.id).toBeTruthy();
      expect(categoryLabel, rule.id).toBeTruthy();
      expect(CJK_TEXT.test(displayName), rule.id).toBe(false);
      expect(CJK_TEXT.test(categoryLabel), rule.id).toBe(false);
    }
  });

  it("covers every source variable description with non-CJK English text", () => {
    for (const source of IMPORTED_EQUIPMENT_FDD_CATALOG.sources) {
      for (const variable of source.variables) {
        const description = importedEquipmentSourceDescription(source.equipmentType, variable.symbol);
        expect(description, `${source.equipmentType}:${variable.symbol}`).toBeTruthy();
        expect(CJK_TEXT.test(description ?? ""), `${source.equipmentType}:${variable.symbol}`).toBe(false);
      }
    }
  });

  it("keeps every deployment-facing field in the imported library in English", () => {
    const algorithms = importedEquipmentFddAlgorithms();
    expect(algorithms).toHaveLength(111);

    for (const algorithm of algorithms) {
      const visibleText = [
        algorithm.name,
        algorithm.faultType,
        algorithm.categoryLabel,
        algorithm.formula,
        algorithm.logicSummary,
        ...(algorithm.definitionIssues ?? []),
        ...algorithm.requiredPoints.flatMap((point) => [
          point.label,
          point.semantic,
          point.unitRoleDescription,
          ...(point.keywords ?? [])
        ])
      ].join(" ");
      expect(CJK_TEXT.test(visibleText), algorithm.algorithmKey).toBe(false);
    }
  });
});
