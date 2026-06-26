import { describe, expect, it } from "vitest";
import { createGenericSkillRegistry } from "./agent/skills.js";
import { createSeedStore } from "./seed.js";
import { createProjectSkillBindings, seedSkillsByProject } from "./projectSkills.js";

describe("projectSkills", () => {
  it("scopes prompt hints to the active project", () => {
    const store = createSeedStore();
    const bindings = createProjectSkillBindings(store);
    const skills = createGenericSkillRegistry();

    const elementHints = skills.promptHintsForProject(bindings.getSkillIds("project_element"));
    const mortarHints = skills.promptHintsForProject(bindings.getSkillIds("project_mortar"));

    expect(elementHints).toContain("BMS DATA ROUTING");
    expect(elementHints).toContain("DERIVED METRICS");
    expect(elementHints).toContain("DASHBOARD GENERATION");
    expect(mortarHints).not.toContain("BMS DATA ROUTING");
    expect(mortarHints).toContain("DERIVED METRICS");
    expect(mortarHints).toContain("DASHBOARD GENERATION");
    expect(mortarHints).toContain("assumptions");
  });

  it("initializes new projects with default runtime skills", () => {
    const store = createSeedStore();
    const bindings = createProjectSkillBindings(store);
    bindings.initProject("project_new");
    expect(bindings.getSkillIds("project_new")).toEqual(
      expect.arrayContaining([
        "skill_project_readiness",
        "skill_feedback_workflow",
        "skill_tool_data_bridge",
        "skill_chart_quality",
        "skill_derived_metrics",
        "skill_dashboard_generation"
      ])
    );
  });

  it("seeds distinct bindings per project", () => {
    const seeded = seedSkillsByProject();
    expect(seeded.project_element).toContain("skill_element_bms_data");
    expect(seeded.project_element).toContain("skill_feedback_workflow");
    expect(seeded.project_mortar).not.toContain("skill_element_bms_data");
  });
});
