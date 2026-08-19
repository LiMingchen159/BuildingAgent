import type {
  FddAlgorithmRequirement,
  FddAmbiguousInput,
  FddDeployabilityDecision,
  FddDeployabilityStatus,
  FddEntityDeployability,
  FddPointCandidate,
  FddPointMapping,
  FddRequiredPoint,
  LegacyV4CandidateAlignment,
  LegacyV4CandidateAlignmentInput,
  LegacyV4CoverageInput,
  LegacyV4DeployabilityInput,
  LegacyV4FleetCandidateEvidence,
  LegacyV4FleetDecisionInput,
  LegacyV4FleetPlan,
  LegacyV4FleetPlanInput
} from "./contracts.js";
import { fddCandidateUnitEvidenceRank } from "./units.js";

// Persisted v4 decisions may authorize a deployment. Change this value when
// evidence or authorization semantics change so stale decisions fail closed.
export const FDD_DEPLOYABILITY_POLICY_VERSION = "v4-homogeneous-fleet";

function normalizedIdentity(value: string): string {
  return value.trim().toUpperCase();
}

export function fddPointMappingsAreDistinct(mappings: FddPointMapping[]): boolean {
  const pointNames = mappings.map((mapping) => mapping.pointName.trim().toLowerCase());
  if (pointNames.some((pointName) => !pointName) || new Set(pointNames).size !== pointNames.length) return false;
  const objectRefs = mappings
    .map((mapping) => mapping.objectRef?.trim().toLowerCase())
    .filter((objectRef): objectRef is string => Boolean(objectRef));
  return new Set(objectRefs).size === objectRefs.length;
}

function normalizedFddCandidateText(value: string): string {
  return value.replace(/[^a-z0-9]+/giu, " ").toLowerCase().trim();
}

function fddCandidateRoleScore(point: FddRequiredPoint, candidate: FddPointCandidate): number {
  const pointText = normalizedFddCandidateText(`${point.slot} ${point.label} ${point.semantic} ${point.quantityKind}`);
  const pointNameText = normalizedFddCandidateText(candidate.pointName);
  const candidateText = normalizedFddCandidateText([
    candidate.pointName,
    candidate.reason,
    candidate.dimensionReason,
    candidate.unit
  ].filter(Boolean).join(" "));
  let score = 0;

  const keywordRoleScore = (point.keywords ?? []).reduce((best, keyword, index) => {
    const normalizedKeyword = normalizedFddCandidateText(keyword);
    const keywordTokens = normalizedKeyword.split(" ").filter((token) => token.length >= 3);
    if (keywordTokens.length === 0) return best;
    const pointNameTokens = pointNameText.split(" ").filter(Boolean);
    const phraseMatch = ` ${pointNameText} `.includes(` ${normalizedKeyword} `);
    const tokenMatch = keywordTokens.every((token) => pointNameTokens.includes(token));
    const compactKeyword = normalizedKeyword.replace(/\s+/gu, "");
    const compactName = pointNameText.replace(/\s+/gu, "");
    const compactMatch = compactKeyword.length >= 4 && compactName.endsWith(compactKeyword);
    if (!phraseMatch && !tokenMatch && !compactMatch) return best;
    return Math.max(best, Math.max(2, 18 - index * 2));
  }, 0);
  score += keywordRoleScore;

  if (point.quantityKind === "status") {
    const expectsCommand = /\bcommand\b|\bstart stop\b|\benable command\b/u.test(pointText);
    const expectsAlarm = /\balarm\b|\btrip\b|\bfault status\b/u.test(pointText);
    const expectsRunning = /\b(chiller on|run|running|operating|proof)\b/u.test(pointText);
    if (expectsCommand && /\bstart stop command\b|\bcommand\b/u.test(candidateText)) score += 8;
    if (expectsCommand && /\brun status\b|\balarm\b|\btrip\b|\bmode status\b/u.test(candidateText)) score -= 10;
    if (expectsAlarm && /\balarm\b|\btrip\b|\bfault\b/u.test(candidateText)) score += 8;
    if (expectsAlarm && /\bcommand\b|\brun status\b|\bmode status\b/u.test(candidateText)) score -= 10;
    if (/\brun status\b|\brunning status\b|\boperating status\b/u.test(candidateText)) score += 5;
    if (expectsRunning && /\brun\b|\brunning\b|\boperating\b/u.test(candidateText)) score += 2;
    if (expectsRunning && /\bcommand\b|\balarm\b|\btrip\b|\bmode status\b/u.test(candidateText)) score -= 10;
    if (/\bon off status\b|\bonoff status\b/u.test(candidateText)) score += 1;
    if (/\bflow status\b|\bflow proof\b|\bflow switch\b/u.test(candidateText)) {
      score += /\bflow\b/u.test(pointText) ? 5 : -2;
    }
    if (/\bpower status\b|\bpower proof\b/u.test(candidateText)) {
      score += /\bpower\b/u.test(pointText) ? 5 : -1;
    }
    if (/\bacb\b|\bacbs\b|\bbreaker\b|\btrip\b|\balarm\b|\bfault\b/u.test(candidateText)
      && !/\bbreaker\b|\btrip\b|\balarm\b|\bfault\b/u.test(pointText)) {
      score -= 5;
    }
  }

  if (point.quantityKind === "flow_rate" && /\bflow rate\b|\bflowrate\b|\bchwfwr\b/u.test(candidateText)) score += 4;
  if (point.quantityKind === "temperature") {
    const expectsSupply = /\bsupply\b/u.test(pointText);
    const expectsReturn = /\breturn\b/u.test(pointText);
    const nameLooksSupply = /\bchwst\b|\bsupply\b|\bsup\b/u.test(pointNameText);
    const nameLooksReturn = /\bchwrt\b|\breturn\b|\bret\b/u.test(pointNameText);
    if (expectsSupply && nameLooksSupply) score += 7;
    if (expectsSupply && nameLooksReturn) score -= 6;
    if (expectsReturn && nameLooksReturn) score += 7;
    if (expectsReturn && nameLooksSupply) score -= 6;
    if (expectsSupply && /\bsupply\b|\bchwst\b/u.test(candidateText)) score += 2;
    if (expectsReturn && /\breturn\b|\bchwrt\b/u.test(candidateText)) score += 2;
  }
  if (point.quantityKind === "power") {
    if (/\btlkw\b|\bmotor kilowatts\b|\belectric power\b|\bpower\b/u.test(candidateText)) score += 4;
    if (/\bpercent\b|\bpercentage\b|\bdemand limit\b/u.test(pointNameText)) score -= 10;
    if (/\btlkwh\b|\bkwh\b|\bkilowatt hours?\b|\benergy\b/u.test(pointNameText)) score -= 12;
    if (/\bkva\b|\bapparent power\b/u.test(pointNameText)) score -= 6;
  }
  if (point.quantityKind === "energy" && /\bkwh\b|\benergy\b/u.test(candidateText)) score += 4;

  return score;
}

export function sortFddPointCandidatesForRequiredPoint(
  point: FddRequiredPoint,
  candidates: FddPointCandidate[]
): FddPointCandidate[] {
  return candidates.slice().sort((left, right) => {
    const leftScore = left.confidence + fddCandidateRoleScore(point, left) * 0.03;
    const rightScore = right.confidence + fddCandidateRoleScore(point, right) * 0.03;
    const scoreRank = rightScore - leftScore;
    if (Math.abs(scoreRank) > 0.0001) return scoreRank;
    const confidenceRank = right.confidence - left.confidence;
    if (confidenceRank !== 0) return confidenceRank;
    const unitRank = fddCandidateUnitEvidenceRank(right) - fddCandidateUnitEvidenceRank(left);
    if (unitRank !== 0) return unitRank;
    return left.pointName.localeCompare(right.pointName);
  });
}

export function fddAmbiguousAlternativesForPoint(
  point: FddRequiredPoint,
  best: FddPointCandidate,
  alternatives: FddPointCandidate[]
): FddPointCandidate[] {
  const bestRoleScore = fddCandidateRoleScore(point, best);
  return alternatives.filter((candidate) => {
    if (best.confidence - candidate.confidence > 0.04) return false;
    const candidateRoleScore = fddCandidateRoleScore(point, candidate);
    if (bestRoleScore - candidateRoleScore >= 2) return false;
    if (bestRoleScore >= candidateRoleScore
      && fddCandidateUnitEvidenceRank(best) > fddCandidateUnitEvidenceRank(candidate)) {
      return false;
    }
    return true;
  });
}

function fddPointMappingFromCandidate(candidate: FddPointCandidate): FddPointMapping {
  return {
    slot: candidate.slot,
    pointName: candidate.pointName,
    ...(candidate.objectRef ? { objectRef: candidate.objectRef } : {}),
    ...(candidate.unit ? { unit: candidate.unit } : {})
  };
}

export function evaluateLegacyV4Deployability(input: LegacyV4DeployabilityInput): FddDeployabilityDecision {
  const required = input.algorithm.requiredPoints.filter((point) => point.required);
  const missingPoints: string[] = [];
  const historyIssues: string[] = input.historyIssues ? [...input.historyIssues] : [];
  const selectedMappings: FddPointMapping[] = [];
  const ambiguousInputs: FddAmbiguousInput[] = [];
  let uncertain = false;
  const usedPointKeys = new Set<string>();

  if (input.applicability === "no_equipment" || input.applicability === "unknown") {
    return {
      algorithmId: input.algorithm.id,
      ...(input.projectTaskId ? { projectTaskId: input.projectTaskId } : {}),
      algorithmVersion: input.algorithm.version,
      checkPolicyVersion: FDD_DEPLOYABILITY_POLICY_VERSION,
      projectId: input.projectId,
      status: "cannot_deploy",
      applicability: input.applicability,
      ...(input.equipmentAvailability ? { equipmentAvailability: input.equipmentAvailability } : {}),
      ...(input.equipmentInventorySignature ? { equipmentInventorySignature: input.equipmentInventorySignature } : {}),
      pointCandidates: [],
      deployableEntities: [],
      ambiguousInputs: [],
      rejectedCandidates: [],
      missingPoints: [],
      historyIssues,
      checkedAt: input.checkedAt,
      source: input.source,
      projectDataSignature: input.projectDataSignature
    };
  }

  for (const point of required) {
    const candidates = sortFddPointCandidatesForRequiredPoint(
      point,
      input.pointCandidates.filter((candidate) => {
        if (candidate.slot !== point.slot) return false;
        const pointKey = (candidate.objectRef ?? candidate.pointName).trim().toLowerCase();
        return !usedPointKeys.has(pointKey);
      })
    );
    const best = candidates[0];
    if (!best) {
      missingPoints.push(point.label);
      continue;
    }
    const closeAlternatives = fddAmbiguousAlternativesForPoint(point, best, candidates.slice(1));
    if (closeAlternatives.length > 0 || best.confidence < 0.68 || best.unitCompatibility === "unknown") {
      uncertain = true;
      ambiguousInputs.push({
        slot: point.slot,
        label: point.label,
        candidates: [best, ...closeAlternatives].slice(0, 6)
      });
    }
    const minDays = point.historyRequirement?.minDays ?? 0;
    if (minDays > 0 && typeof best.historyDays !== "number") {
      historyIssues.push(`${point.label} history coverage is unverified; requires ${minDays}d.`);
    } else if (typeof best.historyDays === "number" && best.historyDays < minDays) {
      historyIssues.push(`${point.label} has ${best.historyDays}d history; requires ${minDays}d.`);
    }
    selectedMappings.push(fddPointMappingFromCandidate(best));
    usedPointKeys.add((best.objectRef ?? best.pointName).trim().toLowerCase());
  }

  const status: FddDeployabilityStatus = missingPoints.length > 0 || historyIssues.length > 0
    ? "cannot_deploy"
    : uncertain
      ? "uncertain"
      : "can_deploy";

  return {
    algorithmId: input.algorithm.id,
    ...(input.projectTaskId ? { projectTaskId: input.projectTaskId } : {}),
    algorithmVersion: input.algorithm.version,
    checkPolicyVersion: FDD_DEPLOYABILITY_POLICY_VERSION,
    projectId: input.projectId,
    status,
    ...(input.applicability ? { applicability: input.applicability } : {}),
    ...(input.equipmentAvailability ? { equipmentAvailability: input.equipmentAvailability } : {}),
    ...(input.equipmentInventorySignature ? { equipmentInventorySignature: input.equipmentInventorySignature } : {}),
    pointCandidates: input.pointCandidates,
    ...(input.exampleEntityKey ? { exampleEntityKey: input.exampleEntityKey } : {}),
    ...(selectedMappings.length > 0 ? { selectedMappings } : {}),
    ...(input.deployableEntities ? { deployableEntities: input.deployableEntities } : {}),
    ambiguousInputs,
    rejectedCandidates: input.rejectedCandidates ?? [],
    missingPoints,
    historyIssues,
    checkedAt: input.checkedAt,
    source: input.source,
    projectDataSignature: input.projectDataSignature
  };
}

function fddEntityDeployabilityFromCandidates(
  algorithm: FddAlgorithmRequirement,
  entityKey: string,
  candidates: FddPointCandidate[],
  supplementalPoints: FddRequiredPoint[] = []
): FddEntityDeployability {
  const required = [...algorithm.requiredPoints, ...supplementalPoints]
    .filter((point) => point.required)
    .filter((point, index, values) => values.findIndex((entry) => entry.slot === point.slot) === index);
  const selectedMappings: FddPointMapping[] = [];
  const ambiguousInputs: FddAmbiguousInput[] = [];
  const missingPoints: string[] = [];
  const historyIssues: string[] = [];
  const selectedConfidences: number[] = [];
  const usedPointNames = new Set<string>();
  const usedObjectRefs = new Set<string>();
  let uncertain = false;

  for (const point of required) {
    const slotCandidates = sortFddPointCandidatesForRequiredPoint(
      point,
      candidates.filter((candidate) => {
        if (candidate.slot !== point.slot) return false;
        const pointName = candidate.pointName.trim().toLowerCase();
        const objectRef = candidate.objectRef?.trim().toLowerCase();
        return !usedPointNames.has(pointName) && (!objectRef || !usedObjectRefs.has(objectRef));
      })
    );
    const best = slotCandidates[0];
    if (!best) {
      missingPoints.push(point.label);
      continue;
    }
    const closeAlternatives = fddAmbiguousAlternativesForPoint(point, best, slotCandidates.slice(1));
    if (closeAlternatives.length > 0 || best.confidence < 0.68 || best.unitCompatibility === "unknown") {
      uncertain = true;
      ambiguousInputs.push({
        slot: point.slot,
        label: point.label,
        candidates: [best, ...closeAlternatives].slice(0, 6)
      });
    }
    const minDays = point.historyRequirement?.minDays ?? 0;
    if (minDays > 0 && typeof best.historyDays !== "number") {
      historyIssues.push(`${point.label} history coverage is unverified; requires ${minDays}d.`);
    } else if (typeof best.historyDays === "number" && best.historyDays < minDays) {
      historyIssues.push(`${point.label} has ${best.historyDays}d history; requires ${minDays}d.`);
    }
    selectedConfidences.push(best.confidence);
    selectedMappings.push(fddPointMappingFromCandidate(best));
    usedPointNames.add(best.pointName.trim().toLowerCase());
    if (best.objectRef) usedObjectRefs.add(best.objectRef.trim().toLowerCase());
  }

  for (const point of supplementalPoints.filter((entry) => !entry.required)) {
    if (selectedMappings.some((mapping) => mapping.slot === point.slot)) continue;
    const best = candidates
      .filter((candidate) => {
        if (candidate.slot !== point.slot) return false;
        const pointName = candidate.pointName.trim().toLowerCase();
        const objectRef = candidate.objectRef?.trim().toLowerCase();
        return !usedPointNames.has(pointName) && (!objectRef || !usedObjectRefs.has(objectRef));
      })
      .sort((left, right) => right.confidence - left.confidence)[0];
    if (!best || best.confidence < 0.56) continue;
    selectedMappings.push(fddPointMappingFromCandidate(best));
    usedPointNames.add(best.pointName.trim().toLowerCase());
    if (best.objectRef) usedObjectRefs.add(best.objectRef.trim().toLowerCase());
  }

  const status: FddDeployabilityStatus = missingPoints.length > 0 || historyIssues.length > 0
    ? "cannot_deploy"
    : uncertain
      ? "uncertain"
      : "can_deploy";
  const confidence = selectedConfidences.length > 0
    ? selectedConfidences.reduce((total, value) => total + value, 0) / selectedConfidences.length
    : 0;
  return {
    entityKey,
    status,
    selectedMappings,
    ambiguousInputs,
    missingPoints,
    historyIssues,
    confidence
  };
}

function mappingMatchesCandidate(mapping: FddPointMapping, candidate: FddPointCandidate): boolean {
  return mapping.slot === candidate.slot
    && mapping.pointName === candidate.pointName
    && (!mapping.objectRef || mapping.objectRef === candidate.objectRef);
}

export function planLegacyV4HomogeneousFleet(input: LegacyV4FleetPlanInput): LegacyV4FleetPlan {
  const byEntity = new Map<string, { entityKey: string; evidence: LegacyV4FleetCandidateEvidence[] }>();
  for (const evidence of input.candidates) {
    const identity = normalizedIdentity(evidence.canonicalEntityKey);
    const existing = byEntity.get(identity);
    byEntity.set(identity, {
      entityKey: existing?.entityKey ?? evidence.canonicalEntityKey,
      evidence: [...(existing?.evidence ?? []), evidence]
    });
  }
  const sourceEntityKeys = input.targetEntityKeys.length > 0
    ? input.targetEntityKeys
    : [...byEntity.values()].map((entry) => entry.entityKey);
  const entityKeys = sourceEntityKeys
    .filter((entityKey, index, values) => values.findIndex((value) => normalizedIdentity(value) === normalizedIdentity(entityKey)) === index)
    .sort((left, right) => left.localeCompare(right));
  const provisional = entityKeys.map((entityKey) =>
    fddEntityDeployabilityFromCandidates(
      input.algorithm,
      entityKey,
      (byEntity.get(normalizedIdentity(entityKey))?.evidence ?? []).map((evidence) => evidence.candidate),
      input.supplementalPoints
    )
  );
  const template = provisional.find((entity) => entity.status === "can_deploy");
  const requiredSlots = input.algorithm.requiredPoints.filter((point) => point.required).map((point) => point.slot);
  const familyBySlot = new Map<string, string>();
  if (template) {
    const templateEvidence = byEntity.get(normalizedIdentity(template.entityKey))?.evidence ?? [];
    for (const mapping of template.selectedMappings) {
      const family = templateEvidence.find((entry) => mappingMatchesCandidate(mapping, entry.candidate))?.pointFamilyKey;
      if (family) familyBySlot.set(mapping.slot, family);
    }
  }
  const hasCompleteTemplate = input.homogeneousTemplateEligible
    && entityKeys.length > 1
    && Boolean(template)
    && requiredSlots.every((slot) => familyBySlot.has(slot));
  const resolved = hasCompleteTemplate
    ? entityKeys.map((entityKey) => {
        const familyCandidates = (byEntity.get(normalizedIdentity(entityKey))?.evidence ?? []).filter((entry) => {
          const expectedFamily = familyBySlot.get(entry.candidate.slot);
          return expectedFamily ? entry.pointFamilyKey === expectedFamily : true;
        });
        return fddEntityDeployabilityFromCandidates(
          input.algorithm,
          entityKey,
          familyCandidates.map((entry) => entry.candidate),
          input.supplementalPoints
        );
      })
    : provisional;
  const statusRank: Record<FddDeployabilityStatus, number> = {
    can_deploy: 0,
    uncertain: 1,
    cannot_deploy: 2
  };
  const entities = resolved.sort((left, right) => {
    const rank = statusRank[left.status] - statusRank[right.status];
    if (rank !== 0) return rank;
    const confidenceRank = right.confidence - left.confidence;
    if (confidenceRank !== 0) return confidenceRank;
    return left.entityKey.localeCompare(right.entityKey);
  });
  return {
    entities,
    mappingStrategy: hasCompleteTemplate ? "homogeneous_template" : "entity_independent",
    ...(hasCompleteTemplate && template ? { templateEntityKey: template.entityKey } : {})
  };
}

export function alignLegacyV4CandidatesToExampleEntity(
  input: LegacyV4CandidateAlignmentInput
): LegacyV4CandidateAlignment {
  const requiredSlots = input.algorithm.requiredPoints.filter((point) => point.required).map((point) => point.slot);
  if (requiredSlots.length === 0) return { candidates: input.candidates.map((entry) => entry.candidate) };
  const scores = new Map<string, { entityKey: string; slots: Set<string>; confidenceBySlot: Map<string, number> }>();
  for (const evidence of input.candidates) {
    if (!requiredSlots.includes(evidence.candidate.slot)) continue;
    const identity = normalizedIdentity(evidence.canonicalEntityKey);
    const score = scores.get(identity) ?? {
      entityKey: evidence.canonicalEntityKey,
      slots: new Set<string>(),
      confidenceBySlot: new Map<string, number>()
    };
    score.slots.add(evidence.candidate.slot);
    const previousConfidence = score.confidenceBySlot.get(evidence.candidate.slot) ?? 0;
    if (evidence.candidate.confidence > previousConfidence) {
      score.confidenceBySlot.set(evidence.candidate.slot, evidence.candidate.confidence);
    }
    scores.set(identity, score);
  }
  const completeEntities = [...scores.entries()]
    .filter(([, score]) => requiredSlots.every((slot) => score.slots.has(slot)))
    .sort((left, right) => {
      const leftConfidence = requiredSlots.reduce((total, slot) => total + (left[1].confidenceBySlot.get(slot) ?? 0), 0);
      const rightConfidence = requiredSlots.reduce((total, slot) => total + (right[1].confidenceBySlot.get(slot) ?? 0), 0);
      const confidenceRank = rightConfidence - leftConfidence;
      if (confidenceRank !== 0) return confidenceRank;
      return left[1].entityKey.localeCompare(right[1].entityKey);
    });
  const preferredCanonical = input.preferredEntityKey ? normalizedIdentity(input.preferredEntityKey) : "";
  const preferredCompleteEntity = preferredCanonical
    ? completeEntities.find(([identity]) => identity === preferredCanonical)?.[1].entityKey
    : undefined;
  const exampleEntityKey = preferredCompleteEntity ?? completeEntities[0]?.[1].entityKey;
  if (!exampleEntityKey) {
    const observedEntities = [...scores.values()].map((entry) => entry.entityKey).sort();
    return {
      candidates: [],
      alignmentIssue: observedEntities.length > 0
        ? `No single entity has candidates for all required inputs. Candidate entities found: ${observedEntities.slice(0, 8).join(", ")}.`
        : "No entity-level point candidates were found for the required inputs."
    };
  }
  const preferredPointBySlot = new Map((input.preferredMappings ?? []).map((mapping) => [mapping.slot, mapping]));
  const candidates = input.candidates
    .filter((entry) => {
      if (normalizedIdentity(entry.canonicalEntityKey) !== normalizedIdentity(exampleEntityKey)) return false;
      if (preferredPointBySlot.size === 0) return true;
      const mapping = preferredPointBySlot.get(entry.candidate.slot);
      if (!mapping) return true;
      return mappingMatchesCandidate(mapping, entry.candidate);
    })
    .map((entry) => entry.candidate)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 120);
  return { candidates, exampleEntityKey };
}

export function applyLegacyV4FleetPlanToDecision(
  input: LegacyV4FleetDecisionInput
): FddDeployabilityDecision {
  const allExpectedEntitiesPresent = input.plan.entities.length === input.expectedEntityCount;
  const hasCannotDeployEntity = input.plan.entities.some((entity) => entity.status === "cannot_deploy");
  const hasUncertainEntity = input.plan.entities.some((entity) => entity.status === "uncertain");
  const status = !allExpectedEntitiesPresent || hasCannotDeployEntity
    ? "cannot_deploy"
    : hasUncertainEntity
      ? "uncertain"
      : input.decision.status;
  const decisionWithoutStaleTemplate = { ...input.decision };
  delete decisionWithoutStaleTemplate.templateEntityKey;
  return {
    ...decisionWithoutStaleTemplate,
    status,
    mappingStrategy: input.plan.mappingStrategy,
    expectedEntityCount: input.expectedEntityCount,
    requiredRuntimeSlots: input.requiredRuntimeSlots,
    ...(input.plan.templateEntityKey ? { templateEntityKey: input.plan.templateEntityKey } : {})
  };
}

export function legacyV4DecisionHasFleetCoverage(input: LegacyV4CoverageInput): boolean {
  const check = input.decision;
  if (!check.applicability || !check.equipmentAvailability || !check.equipmentInventorySignature) return false;
  if (check.status !== "can_deploy") return false;
  if (check.applicability !== "applicable" || check.equipmentAvailability.status !== "available") return false;
  if (!Array.isArray(check.deployableEntities)) return false;
  const requiredSlots = check.requiredRuntimeSlots?.length
    ? [...new Set(check.requiredRuntimeSlots)]
    : input.algorithmRequiredSlots;
  if (!input.algorithmRequiredSlots.every((slot) => requiredSlots.includes(slot))) return false;
  const expectedEntityKeys = input.expectedCanonicalEntityKeys.map(normalizedIdentity);
  const expectedEntityCount = expectedEntityKeys.length > 0
    ? expectedEntityKeys.length
    : check.equipmentAvailability.entityCount;
  if (expectedEntityCount <= 0 || check.deployableEntities.length !== expectedEntityCount) return false;
  if (typeof check.expectedEntityCount === "number" && check.expectedEntityCount !== expectedEntityCount) return false;
  const entitiesByKey = new Map(check.deployableEntities.map((entity) => [normalizedIdentity(entity.entityKey), entity]));
  if (entitiesByKey.size !== expectedEntityCount) return false;
  const entities = expectedEntityKeys.length > 0
    ? expectedEntityKeys.map((entityKey) => entitiesByKey.get(entityKey))
    : [...entitiesByKey.values()];
  return entities.every((entity) => {
    if (!entity || entity.status !== "can_deploy") return false;
    const requiredMappings = entity.selectedMappings.filter((mapping) => requiredSlots.includes(mapping.slot));
    if (requiredMappings.length !== requiredSlots.length) return false;
    const mappedSlots = new Set(requiredMappings.map((mapping) => mapping.slot));
    return mappedSlots.size === requiredSlots.length
      && fddPointMappingsAreDistinct(requiredMappings)
      && requiredSlots.every((slot) => mappedSlots.has(slot));
  });
}
