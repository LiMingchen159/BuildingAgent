# S05: Requirement coverage reconciliation remediation — UAT

**Milestone:** M001
**Written:** 2026-05-10T16:31:13.555Z

# S05: Requirement coverage reconciliation remediation — UAT

**Milestone:** M001
**Written:** 2026-05-10

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: This slice only reconciles requirement coverage and publishes milestone validation artifacts; it does not add new runtime behavior, so document and matrix verification is the correct acceptance signal.

## Preconditions

- M001 already has completed evidence from S01-S04.
- The rendered requirement and validation artifacts exist in the `.gsd` workspace.
- No new runtime services need to be started for this slice.

## Smoke Test

Confirm that the requirement record and validation artifact both explicitly separate validated behavior from skeleton-only and deferred boundaries.

## Test Cases

### 1. Requirement coverage reconciliation is rendered correctly

1. Open `.gsd/REQUIREMENTS.md`.
2. Verify that R001, R005, R006, and R007 are present.
3. Verify that the wording includes the local skeleton boundaries: validated, skeleton, placeholder, deferred, and out of scope.
4. **Expected:** The requirement record reflects the proven local Web, CLI, registry/management, provider-backed chat, and smoke surface area without claiming live integrations.

### 2. Milestone validation matrix records the closure boundary

1. Open `.gsd/milestones/M001/M001-VALIDATION.md`.
2. Verify that the artifact includes a verdict of pass.
3. Verify that the matrix distinguishes validated, skeleton-only, deferred, and out-of-scope entries.
4. Verify that the placeholder gateway and building-domain boundaries are described as synthetic or bounded rather than real integrations.
5. **Expected:** The milestone validation artifact can be used as the canonical closure record for M001.

## Edge Cases

### Overclaim check

1. Look for any wording that implies real tool execution, real skill invocation, or live gateway/building-domain integrations.
2. **Expected:** None of those claims appear; the artifact stays bounded to placeholder and contract-level language.

## Failure Signals

- Missing R001/R005/R006/R007 entries in `.gsd/REQUIREMENTS.md`.
- Missing validation verdict, boundary matrix, or placeholder/deferred wording in `.gsd/milestones/M001/M001-VALIDATION.md`.
- Any statement that overclaims live integration or runtime execution beyond S01-S04 evidence.

## Not Proven By This UAT

- Live integration with external providers, tools, skills, gateways, or building-domain systems.
- Runtime performance, load behavior, or operational resilience.
- Any functionality beyond traceability and requirement/validation reconciliation.

## Notes for Tester

This slice should be judged as a documentation and traceability closure step. The acceptance target is consistency between the requirement record, the validation matrix, and the already-completed S01-S04 evidence.
