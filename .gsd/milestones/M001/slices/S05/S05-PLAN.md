# S05: Requirement coverage reconciliation remediation

**Goal:** Reconcile M001’s requirement coverage so the active requirement record matches the evidence already produced by S01–S04, and persist a milestone validation artifact that clearly separates validated behavior from skeleton-only and intentionally deferred boundaries.
**Demo:** After this, M001 artifacts explicitly reconcile requirement coverage: active in-scope requirements are proven, later-milestone/deferred and anti-feature/constraint requirements are marked as intentionally out of scope where applicable, and placeholder gateway/building-domain negative boundaries are evidenced for validation.

## Must-Haves

- The active M001 requirements owned by this slice (R001, R005, R006, R007) are reconciled so their validation language matches the evidence already produced by S01–S04.
- The M001 validation artifact records a verdict and coverage matrix that explicitly distinguishes validated behavior, skeleton-only coverage, and intentionally deferred out-of-scope requirements.
- Placeholder gateway, building-domain, runtime, tool-dispatcher, and skill-invocation language does not overclaim live integrations; it stays bounded to authenticated synthetic listings, project-scoped placeholder management, strict parsing, and smoke-tested local entrypoints.
- Verification commands prove the rendered requirement and validation artifacts exist and contain the key requirement and boundary terms needed for milestone validation.

## Proof Level

- This slice proves: contract: this slice proves documentation/traceability correctness against already-passed S01–S04 tests and smoke evidence; it does not prove new live integrations or runtime execution behavior.

## Integration Closure

Consumes the existing M001 slice summaries, current requirements/decision records, and the validated API/Web/CLI/smoke evidence from S01–S04. This slice does not add runtime wiring; it closes the traceability layer by updating the requirement record and writing the milestone validation artifact, leaving only final M001 milestone completion after validation.

## Verification

- Traceability becomes inspectable through the requirements database/rendered markdown and the milestone validation artifact. Future agents can inspect `.gsd/REQUIREMENTS.md`, `.gsd/milestones/M001/VALIDATION.md`, and `gsd_milestone_status M001` to see which requirements are proven, which are skeleton-only, and which remain deferred.

## Tasks

- [x] **T01: Reconcile active requirement records** `est:1h`
  Update the active requirement records and supporting project notes so R001, R005, R006, and R007 precisely describe the proven local surface area.
  - Files: ``.gsd/REQUIREMENTS.md``, ``.gsd/PROJECT.md``, ``.gsd/DECISIONS.md``
  - Verify: `rg -n "R001|R005|R006|R007" .gsd/REQUIREMENTS.md && rg -n "skeleton|placeholder|deferred|out of scope" .gsd/REQUIREMENTS.md .gsd/PROJECT.md` returns matches; `test -f .gsd/REQUIREMENTS.md && test -f .gsd/PROJECT.md` succeeds.

- [x] **T02: Publish milestone validation and coverage matrix** `est:1h`
  Publish the M001 validation artifact with a coverage matrix that separates validated requirements, skeleton-only surfaces, and intentionally deferred boundaries.
  - Files: ``.gsd/milestones/M001/VALIDATION.md``, ``.gsd/milestones/M001/M001-ROADMAP.md``
  - Verify: `test -f .gsd/milestones/M001/VALIDATION.md && rg -n "validated|skeleton-only|deferred|out of scope|R001|R005|R006|R007|R013|R014" .gsd/milestones/M001/VALIDATION.md` succeeds.

## Files Likely Touched

- `.gsd/REQUIREMENTS.md`
- `.gsd/PROJECT.md`
- `.gsd/DECISIONS.md`
- `.gsd/milestones/M001/VALIDATION.md`
- `.gsd/milestones/M001/M001-ROADMAP.md`
