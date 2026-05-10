---
estimated_steps: 17
estimated_files: 2
skills_used:
  - verify-before-complete
  - write-docs
---

# T02: Publish milestone validation and coverage matrix

Publish the M001 validation artifact with a coverage matrix that separates validated requirements, skeleton-only surfaces, and intentionally deferred boundaries.

Steps:
1. Build the validation from the reconciled requirements and the S01–S04 summaries; do not add new runtime scope.
2. Use `gsd_validate_milestone` so `.gsd/milestones/M001/VALIDATION.md` is generated from canonical validation state.
3. In `successCriteriaChecklist`, map each M001 success criterion to evidence: S01 Web/auth/project chat, S02 registry/management placeholders, S03 CLI/smoke, S04 provider fallback, S05 reconciliation.
4. In `sliceDeliveryAudit`, list S01–S05 claimed vs delivered outputs and explicitly state S05 is traceability/validation remediation.
5. In `requirementCoverage`, include a compact matrix with at least these categories: validated, skeleton-only/contract-level, supported/launchability, deferred/out-of-scope, anti-feature/constraint.
6. In `verificationClasses`, state that proof is existing tests/typecheck/build/smoke plus documentation traceability; no live external provider, real gateway, BIM/Brick/RDF/SPARQL/time-series analytics, or real skill/tool execution is claimed.

Must-haves:
- Validation artifact includes R001, R005, R006, R007 and also acknowledges supported launchability/docs requirements R013/R014.
- It names placeholder gateways and building-domain surfaces as synthetic bounded contracts, not live integrations.
- It identifies deferred/anti-feature requirements by category so milestone completion does not accidentally imply they are implemented.
- Verdict should be `pass` if the only remaining gaps are intentionally scoped future work; use `needs-attention` only if the executor finds an actual contradiction in the artifacts.

Quality gates:
- Q4 Requirement Impact: re-verifies all M001 requirement claims and prior decisions D003–D011 for overclaim risk.
- Q5 Failure Modes: validation can fail by overstating proof level or omitting deferred boundaries; mitigate with explicit matrix categories.
- Q7 Negative Tests: search the validation artifact for required boundary terms and requirement ids.

## Inputs

- ``.gsd/milestones/M001/slices/S01/S01-SUMMARY.md``
- ``.gsd/milestones/M001/slices/S02/S02-SUMMARY.md``
- ``.gsd/milestones/M001/slices/S03/S03-SUMMARY.md``
- ``.gsd/milestones/M001/slices/S04/S04-SUMMARY.md``
- ``.gsd/REQUIREMENTS.md``
- ``.gsd/PROJECT.md``
- ``.gsd/DECISIONS.md``

## Expected Output

- ``.gsd/milestones/M001/VALIDATION.md``

## Verification

`test -f .gsd/milestones/M001/VALIDATION.md && rg -n "validated|skeleton-only|deferred|out of scope|R001|R005|R006|R007|R013|R014" .gsd/milestones/M001/VALIDATION.md` succeeds.

## Observability Impact

The validation artifact should make it obvious which claims are backed by tests, smoke checks, or contract evidence so a future agent can localize gaps without re-deriving the slice history.
