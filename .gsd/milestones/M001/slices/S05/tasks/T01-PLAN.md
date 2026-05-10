---
estimated_steps: 15
estimated_files: 3
skills_used:
  - verify-before-complete
  - write-docs
---

# T01: Reconcile active requirement records

Update the active requirement records and supporting project notes so R001, R005, R006, and R007 precisely describe the proven local surface area.

Steps:
1. Review the existing rendered requirement text and the S01–S04 summaries listed in Inputs; do not re-litigate D003–D011.
2. Use `gsd_requirement_update` for R001, R005, R006, and R007 rather than hand-editing the rendered requirements file when possible, so the DB remains the source of truth.
3. Mark or describe R001 as validated by authenticated Web, CLI, registry/management, provider-backed chat, and smoke paths, while explicitly noting gateway surfaces are placeholder inspections only.
4. Mark or describe R005/R006/R007 as M001 skeleton/contract coverage unless the exact existing evidence supports stronger wording; state that full planning/execution loop, real tool dispatch, and real skill invocation remain future work.
5. Refresh `.gsd/PROJECT.md` only if it is stale relative to the reconciled coverage.

Must-haves:
- R001, R005, R006, and R007 each have validation/notes that cite S01–S04 evidence at the correct proof level.
- The wording preserves D009’s priority for the coherent vertical slice and MEM017/D010’s placeholder boundary: globally authenticated registry, project-scoped management, no accidental live integrations.
- Deferred/anti-feature boundaries for enterprise identity, production deployment, real building integrations, Streamlit, anonymous interaction, real customer data, blind Hermes vendoring, and v1 building analytics are not pulled into M001 as implementation work.

Quality gates:
- Q4 Requirement Impact: touches R001/R005/R006/R007 directly and supports R013/R014 through traceability; re-verify rendered requirements and project notes after updates.
- Q5 Failure Modes: stale DB/render mismatch is the main risk; prefer GSD requirement tools over direct file edits.
- Q7 Negative Tests: verify the output contains both positive coverage terms and boundary terms such as skeleton/placeholder/deferred/out of scope so overclaiming is visible.

## Inputs

- ``.gsd/milestones/M001/slices/S01/S01-SUMMARY.md``
- ``.gsd/milestones/M001/slices/S02/S02-SUMMARY.md``
- ``.gsd/milestones/M001/slices/S03/S03-SUMMARY.md``
- ``.gsd/milestones/M001/slices/S04/S04-SUMMARY.md``
- ``.gsd/REQUIREMENTS.md``
- ``.gsd/DECISIONS.md``

## Expected Output

- ``.gsd/REQUIREMENTS.md``
- ``.gsd/PROJECT.md``

## Verification

`rg -n "R001|R005|R006|R007" .gsd/REQUIREMENTS.md && rg -n "skeleton|placeholder|deferred|out of scope" .gsd/REQUIREMENTS.md .gsd/PROJECT.md` returns matches; `test -f .gsd/REQUIREMENTS.md && test -f .gsd/PROJECT.md` succeeds.

## Observability Impact

The updated requirement text becomes the primary inspection surface for later agents; any mismatch will show up as stale validation notes or inconsistent requirement ownership in the rendered requirements file.
