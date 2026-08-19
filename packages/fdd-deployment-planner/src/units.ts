import type { FddPointCandidate } from "./contracts.js";

export function fddCandidateUnitEvidenceRank(candidate: FddPointCandidate): number {
  if (candidate.unitCompatibility === "match") return 3;
  if (candidate.unitCompatibility === "convertible") return 2;
  if (candidate.unitCompatibility === "unknown") return 1;
  return 0;
}
