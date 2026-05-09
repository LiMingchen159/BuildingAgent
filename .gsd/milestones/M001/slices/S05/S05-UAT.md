# S05: Finalize plan, verify, and commit — UAT

**Milestone:** M001
**Written:** 2026-05-09T10:14:38.082Z

# S05 UAT — Finalize plan, verify, and commit

## Purpose
Confirm the M001 scaffold is understandable and stays within planning-only scope.

## Checks

1. Open `README.md` and confirm it points to the main docs and states the key constraints.
2. Open `docs/HERMES_REPLICATION_STRATEGY.md` and confirm it names `/mnt/d/Git_project/references/hermes-agent` as read-only.
3. Open `docs/DEVELOPMENT_PLAN.md` and confirm M002 focuses on authenticated foundation skeleton implementation.
4. Inspect `buildingagent/tools/building/*.py` and confirm files contain only docstrings/TODO notes, no imports, functions, classes, or implementation.
5. Inspect `skills/building/*.md` and confirm files are placeholder-only and do not claim implementation.
6. Confirm the latest git commit is `Add Hermes-first BuildingAgent architecture plan` and has been pushed.

## Expected Result
A reader can understand what M001 produced, what is deferred, and what M002 should implement next.
