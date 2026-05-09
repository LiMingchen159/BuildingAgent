# Issue Backlog

This backlog is the fallback task-tracking layer only when GitHub issue creation fails or is unavailable. GitHub Issues are preferred and should be used whenever GitHub CLI is available and authenticated.

## Rule

Every meaningful enhancement, bug fix, refactor, test addition, documentation change, or implementation slice must be tracked by a GitHub Issue when possible.

Before starting a meaningful task, create or reference an existing GitHub Issue. If GitHub issue creation fails, add or update an item in this backlog instead.

GitHub Issues are the external task-tracking layer. GSD2 milestones and slices are the internal execution layer. Keep both aligned.

## Required Item Fields

Each fallback backlog item must include:

- title
- type: feature / bug / refactor / docs / test / chore
- scope
- acceptance criteria
- related milestone or slice
- status

Every commit must reference the issue or fallback backlog item. Use `refs #N` for partial GitHub Issue progress and `closes #N` only when completed and validated. If using this backlog, use commit messages like `refs ISSUE-BACKLOG-001` or `closes ISSUE-BACKLOG-001`.

Do not make feature or bug-fix commits without issue or backlog traceability unless it is an emergency WIP checkpoint.

## Items

### ISSUE-BACKLOG-001 — Persist issue tracking workflow

- type: docs
- scope: Project workflow documentation for GitHub Issue and fallback backlog tracking.
- acceptance criteria:
  - Agent instructions document the issue-tracking rule.
  - Development plan documents the issue-tracking rule.
  - Fallback backlog exists and documents when it should be used.
  - Commit references this backlog item.
- related milestone or slice: M002 / workflow alignment before continuing M002 feature development
- status: done
