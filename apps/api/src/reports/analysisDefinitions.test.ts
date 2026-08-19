import { describe, expect, it } from "vitest";

import {
  ANALYSIS_TOOL_DRAFT_SCHEMA_VERSION,
  ANALYSIS_TOOL_INPUT_SCHEMA_VERSION
} from "./contracts.js";
import { REPORT_ANALYSIS_PROMPT_VERSION } from "./analysisPrompt.js";
import {
  ANALYSIS_DEFINITION_REGISTRY_SCHEMA_VERSION,
  DEFAULT_ANALYSIS_DEFINITION_REGISTRY,
  analysisDefinitionReference,
  analysisDefinitionRegistryRevision,
  findAnalysisDefinition,
  validateAnalysisDefinitionRegistry,
  type AnalysisDefinitionRegistry
} from "./analysisDefinitions.js";

describe("analysis definition registry", () => {
  it("publishes a fixed, purely declarative v1 registry for every planned kind/scope pair", () => {
    expect(validateAnalysisDefinitionRegistry(DEFAULT_ANALYSIS_DEFINITION_REGISTRY)).toEqual([]);
    expect(DEFAULT_ANALYSIS_DEFINITION_REGISTRY.schemaVersion).toBe(
      ANALYSIS_DEFINITION_REGISTRY_SCHEMA_VERSION
    );
    expect(DEFAULT_ANALYSIS_DEFINITION_REGISTRY.definitions).toHaveLength(8);
    expect(Object.isFrozen(DEFAULT_ANALYSIS_DEFINITION_REGISTRY)).toBe(true);
    expect(Object.isFrozen(DEFAULT_ANALYSIS_DEFINITION_REGISTRY.definitions)).toBe(true);
    expect(DEFAULT_ANALYSIS_DEFINITION_REGISTRY.definitions.every((definition) => (
      definition.definitionVersion === "1"
      && definition.promptVersion === REPORT_ANALYSIS_PROMPT_VERSION
      && definition.toolInputSchemaVersion === ANALYSIS_TOOL_INPUT_SCHEMA_VERSION
      && definition.toolDraftSchemaVersion === ANALYSIS_TOOL_DRAFT_SCHEMA_VERSION
      && !Object.hasOwn(definition, "algorithm")
      && !Object.hasOwn(definition, "facts")
    ))).toBe(true);
    expect(DEFAULT_ANALYSIS_DEFINITION_REGISTRY.definitions.map((definition) => (
      `${definition.analysisKind}:${definition.scopeKind}`
    ))).toEqual([
      "executive_summary:system",
      "key_findings:system",
      "fault_summary:system",
      "fleet_performance:fleet",
      "equipment_performance:equipment",
      "fault_diagnosis:equipment",
      "recommendations:system",
      "recommendations:equipment"
    ]);
  });

  it("hashes canonical registry content independently of definition order", () => {
    const reversed: AnalysisDefinitionRegistry = {
      schemaVersion: ANALYSIS_DEFINITION_REGISTRY_SCHEMA_VERSION,
      definitions: [...DEFAULT_ANALYSIS_DEFINITION_REGISTRY.definitions].reverse()
    };
    const changed: AnalysisDefinitionRegistry = {
      schemaVersion: ANALYSIS_DEFINITION_REGISTRY_SCHEMA_VERSION,
      definitions: DEFAULT_ANALYSIS_DEFINITION_REGISTRY.definitions.map((definition, index) => (
        index === 0 ? { ...definition, definitionVersion: "2" } : { ...definition }
      ))
    };

    const revision = analysisDefinitionRegistryRevision(DEFAULT_ANALYSIS_DEFINITION_REGISTRY);
    expect(revision).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(analysisDefinitionRegistryRevision(reversed)).toBe(revision);
    expect(analysisDefinitionRegistryRevision(changed)).not.toBe(revision);
  });

  it("rejects duplicate, mismatched, noncanonical, and unsupported declarations", () => {
    const base = DEFAULT_ANALYSIS_DEFINITION_REGISTRY.definitions[0]!;
    const invalid = {
      schemaVersion: 2,
      definitions: [
        { ...base, definitionId: ` ${base.definitionId}` },
        { ...base },
        {
          ...base,
          definitionId: "analysis:fleet_performance:system",
          analysisKind: "fleet_performance",
          scopeKind: "system",
          promptVersion: "future-prompt",
          toolInputSchemaVersion: 2,
          toolDraftSchemaVersion: 2,
          algorithm: "invent-facts"
        },
        { ...base }
      ]
    } as unknown as AnalysisDefinitionRegistry;

    expect(validateAnalysisDefinitionRegistry(invalid)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "analysisDefinitions.schemaVersion", code: "unsupported_schema" }),
      expect.objectContaining({ path: "analysisDefinitions.definitions[0].definitionId", code: "noncanonical_value" }),
      expect.objectContaining({ code: "duplicate_definition" }),
      expect.objectContaining({ code: "duplicate_analysis_definition" }),
      expect.objectContaining({ code: "scope_mismatch" }),
      expect.objectContaining({ path: expect.stringContaining("algorithm"), code: "unknown_field" }),
      expect.objectContaining({ path: expect.stringContaining("promptVersion"), code: "unsupported_prompt" }),
      expect.objectContaining({ path: expect.stringContaining("toolInputSchemaVersion"), code: "unsupported_schema" }),
      expect.objectContaining({ path: expect.stringContaining("toolDraftSchemaVersion"), code: "unsupported_schema" })
    ]));
  });

  it("finds a kind/scope declaration and returns a minimal immutable-plan reference", () => {
    const definition = findAnalysisDefinition(
      DEFAULT_ANALYSIS_DEFINITION_REGISTRY,
      "fault_diagnosis",
      "equipment"
    );
    expect(definition).toMatchObject({
      definitionId: "analysis:fault_diagnosis:equipment",
      definitionVersion: "1",
      analysisKind: "fault_diagnosis",
      scopeKind: "equipment"
    });
    expect(analysisDefinitionReference(definition!)).toEqual({
      definitionId: "analysis:fault_diagnosis:equipment",
      definitionVersion: "1"
    });
    expect(findAnalysisDefinition(
      DEFAULT_ANALYSIS_DEFINITION_REGISTRY,
      "fault_diagnosis",
      "system"
    )).toBeUndefined();
  });
});
