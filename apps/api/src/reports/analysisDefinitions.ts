import { createHash } from "node:crypto";

import type {
  AnalysisDefinitionReference,
  AnalysisKind,
  ReportScope,
  ReportValidationIssue
} from "./contracts.js";
import {
  ANALYSIS_TOOL_DRAFT_SCHEMA_VERSION,
  ANALYSIS_TOOL_INPUT_SCHEMA_VERSION
} from "./contracts.js";
import { REPORT_ANALYSIS_PROMPT_VERSION } from "./analysisPrompt.js";

export const ANALYSIS_DEFINITION_REGISTRY_SCHEMA_VERSION = 1 as const;

export type AnalysisScopeKind = ReportScope["kind"];

/**
 * Declarative prompt/output selection only. Analysis definitions never calculate facts,
 * detect faults, assign equipment names, or contain executable algorithms.
 */
export interface AnalysisDefinition extends AnalysisDefinitionReference {
  analysisKind: AnalysisKind;
  scopeKind: AnalysisScopeKind;
  promptVersion: typeof REPORT_ANALYSIS_PROMPT_VERSION;
  toolInputSchemaVersion: typeof ANALYSIS_TOOL_INPUT_SCHEMA_VERSION;
  toolDraftSchemaVersion: typeof ANALYSIS_TOOL_DRAFT_SCHEMA_VERSION;
}

export interface AnalysisDefinitionRegistry {
  schemaVersion: typeof ANALYSIS_DEFINITION_REGISTRY_SCHEMA_VERSION;
  definitions: readonly AnalysisDefinition[];
}

const analysisKinds = new Set<AnalysisKind>([
  "executive_summary",
  "key_findings",
  "fault_summary",
  "fleet_performance",
  "equipment_performance",
  "fault_diagnosis",
  "recommendations"
]);

const scopeKinds = new Set<AnalysisScopeKind>(["system", "fleet", "equipment"]);

const allowedKindScopePairs = new Set([
  "executive_summary\u0000system",
  "key_findings\u0000system",
  "fault_summary\u0000system",
  "fleet_performance\u0000fleet",
  "equipment_performance\u0000equipment",
  "fault_diagnosis\u0000equipment",
  "recommendations\u0000system",
  "recommendations\u0000equipment"
]);

const defaultDefinitions = [
  ["executive_summary", "system"],
  ["key_findings", "system"],
  ["fault_summary", "system"],
  ["fleet_performance", "fleet"],
  ["equipment_performance", "equipment"],
  ["fault_diagnosis", "equipment"],
  ["recommendations", "system"],
  ["recommendations", "equipment"]
] as const satisfies readonly (readonly [AnalysisKind, AnalysisScopeKind])[];

export const DEFAULT_ANALYSIS_DEFINITION_REGISTRY: AnalysisDefinitionRegistry = Object.freeze({
  schemaVersion: ANALYSIS_DEFINITION_REGISTRY_SCHEMA_VERSION,
  definitions: Object.freeze(defaultDefinitions.map(([analysisKind, scopeKind]) => Object.freeze({
    definitionId: `analysis:${analysisKind}:${scopeKind}`,
    definitionVersion: "1",
    analysisKind,
    scopeKind,
    promptVersion: REPORT_ANALYSIS_PROMPT_VERSION,
    toolInputSchemaVersion: ANALYSIS_TOOL_INPUT_SCHEMA_VERSION,
    toolDraftSchemaVersion: ANALYSIS_TOOL_DRAFT_SCHEMA_VERSION
  })))
});

function issue(path: string, code: string, message: string): ReportValidationIssue {
  return { path, code, message };
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function validateAnalysisDefinitionRegistry(
  registry: AnalysisDefinitionRegistry
): ReportValidationIssue[] {
  if (!registry || typeof registry !== "object") {
    return [issue("analysisDefinitions", "invalid_type", "Analysis definitions are required.")];
  }

  const issues: ReportValidationIssue[] = [];
  const registryKeys = new Set(["schemaVersion", "definitions"]);
  for (const key of Object.keys(registry)) {
    if (!registryKeys.has(key)) {
      issues.push(issue(
        `analysisDefinitions.${key}`,
        "unknown_field",
        "Analysis definition registry contains an unsupported field."
      ));
    }
  }
  if (registry.schemaVersion !== ANALYSIS_DEFINITION_REGISTRY_SCHEMA_VERSION) {
    issues.push(issue(
      "analysisDefinitions.schemaVersion",
      "unsupported_schema",
      `Analysis definition registry schema ${ANALYSIS_DEFINITION_REGISTRY_SCHEMA_VERSION} is required.`
    ));
  }
  if (!Array.isArray(registry.definitions)) {
    issues.push(issue(
      "analysisDefinitions.definitions",
      "invalid_type",
      "Analysis definitions must be an array."
    ));
    return issues;
  }

  const definitionIds = new Set<string>();
  const kindScopePairs = new Set<string>();
  const definitionKeys = new Set([
    "definitionId",
    "definitionVersion",
    "analysisKind",
    "scopeKind",
    "promptVersion",
    "toolInputSchemaVersion",
    "toolDraftSchemaVersion"
  ]);
  for (const [index, definition] of registry.definitions.entries()) {
    const path = `analysisDefinitions.definitions[${index}]`;
    if (!definition || typeof definition !== "object") {
      issues.push(issue(path, "invalid_type", "Analysis definition must be an object."));
      continue;
    }
    for (const key of Object.keys(definition)) {
      if (!definitionKeys.has(key)) {
        issues.push(issue(
          `${path}.${key}`,
          "unknown_field",
          "Analysis definitions are declarative and cannot contain unsupported fields."
        ));
      }
    }
    if (!nonEmpty(definition.definitionId)) {
      issues.push(issue(`${path}.definitionId`, "required", "Definition ID is required."));
    } else if (definition.definitionId !== definition.definitionId.trim()) {
      issues.push(issue(`${path}.definitionId`, "noncanonical_value", "Definition ID must be trimmed."));
    } else if (definitionIds.has(definition.definitionId)) {
      issues.push(issue(
        `${path}.definitionId`,
        "duplicate_definition",
        `Definition ID ${definition.definitionId} is duplicated in the active registry snapshot.`
      ));
    } else {
      definitionIds.add(definition.definitionId);
    }
    if (!nonEmpty(definition.definitionVersion)) {
      issues.push(issue(`${path}.definitionVersion`, "required", "Definition version is required."));
    } else if (definition.definitionVersion !== definition.definitionVersion.trim()) {
      issues.push(issue(`${path}.definitionVersion`, "noncanonical_value", "Definition version must be trimmed."));
    }
    if (!analysisKinds.has(definition.analysisKind)) {
      issues.push(issue(`${path}.analysisKind`, "invalid_value", "Analysis kind is invalid."));
    }
    if (!scopeKinds.has(definition.scopeKind)) {
      issues.push(issue(`${path}.scopeKind`, "invalid_value", "Analysis scope kind is invalid."));
    }
    if (definition.promptVersion !== REPORT_ANALYSIS_PROMPT_VERSION) {
      issues.push(issue(
        `${path}.promptVersion`,
        "unsupported_prompt",
        `Prompt version ${REPORT_ANALYSIS_PROMPT_VERSION} is required.`
      ));
    }
    if (definition.toolInputSchemaVersion !== ANALYSIS_TOOL_INPUT_SCHEMA_VERSION) {
      issues.push(issue(
        `${path}.toolInputSchemaVersion`,
        "unsupported_schema",
        `Analysis tool input schema ${ANALYSIS_TOOL_INPUT_SCHEMA_VERSION} is required.`
      ));
    }
    if (definition.toolDraftSchemaVersion !== ANALYSIS_TOOL_DRAFT_SCHEMA_VERSION) {
      issues.push(issue(
        `${path}.toolDraftSchemaVersion`,
        "unsupported_schema",
        `Analysis tool draft schema ${ANALYSIS_TOOL_DRAFT_SCHEMA_VERSION} is required.`
      ));
    }

    const pair = `${definition.analysisKind}\u0000${definition.scopeKind}`;
    if (
      analysisKinds.has(definition.analysisKind)
      && scopeKinds.has(definition.scopeKind)
      && !allowedKindScopePairs.has(pair)
    ) {
      issues.push(issue(path, "scope_mismatch", "Analysis kind cannot use this scope kind."));
    }
    if (kindScopePairs.has(pair)) {
      issues.push(issue(path, "duplicate_analysis_definition", "Analysis kind and scope are duplicated."));
    } else {
      kindScopePairs.add(pair);
    }
  }
  return issues;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return value;
}

function sortedRegistry(registry: AnalysisDefinitionRegistry): AnalysisDefinitionRegistry {
  return {
    schemaVersion: registry.schemaVersion,
    definitions: [...registry.definitions].sort((left, right) => (
      compareText(left.definitionId, right.definitionId)
      || compareText(left.definitionVersion, right.definitionVersion)
      || compareText(left.analysisKind, right.analysisKind)
      || compareText(left.scopeKind, right.scopeKind)
    ))
  };
}

export function analysisDefinitionRegistryRevision(
  registry: AnalysisDefinitionRegistry
): string {
  const encoded = JSON.stringify(canonicalize(sortedRegistry(registry)));
  return `sha256:${createHash("sha256").update(encoded).digest("hex")}`;
}

export function analysisDefinitionReference(
  definition: AnalysisDefinitionReference
): AnalysisDefinitionReference {
  return {
    definitionId: definition.definitionId,
    definitionVersion: definition.definitionVersion
  };
}

export function findAnalysisDefinition(
  registry: AnalysisDefinitionRegistry,
  analysisKind: AnalysisKind,
  scopeKind: AnalysisScopeKind
): AnalysisDefinition | undefined {
  return registry.definitions.find((definition) => (
    definition.analysisKind === analysisKind && definition.scopeKind === scopeKind
  ));
}
