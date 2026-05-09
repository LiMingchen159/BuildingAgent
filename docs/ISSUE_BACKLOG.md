# Issue Backlog

This backlog is the fallback task-tracking layer when GitHub CLI is unavailable or unauthenticated. GitHub Issues are preferred when available.

## Rule

Every meaningful enhancement, bug fix, refactor, test addition, documentation change, or implementation slice must be tracked by a GitHub Issue.

Before starting a meaningful task, create or reference an existing GitHub Issue. If GitHub CLI is available and authenticated, use `gh issue create`. If GitHub CLI is unavailable or unauthenticated, add an item to this backlog instead.

GitHub Issues are the external task-tracking layer. GSD2 milestones and slices are the internal execution layer. Keep both aligned.

## Required Item Fields

Each GitHub Issue or backlog item must include:

- title
- type: feature / bug / refactor / docs / test / chore
- scope
- acceptance criteria
- related milestone or slice
- status

Every commit must reference the issue or backlog item. Use `refs #N` for partial progress and `closes #N` when the issue is completed. If using this backlog, use commit messages like `refs ISSUE-BACKLOG-001` or `closes ISSUE-BACKLOG-001`.

Do not make feature or bug-fix commits without an issue or backlog reference unless it is an emergency checkpoint or WIP commit.

## Items

### ISSUE-BACKLOG-001 — Persist issue tracking workflow

- type: docs
- scope: Project workflow documentation for GitHub Issue and fallback backlog tracking.
- acceptance criteria:
  - Agent instructions document the issue-tracking rule.
  - Development plan documents the issue-tracking rule.
  - This backlog exists and documents the fallback workflow.
  - Commit references this backlog item.
- related milestone or slice: M002 / workflow alignment before continuing M002 feature development
- status: in-progress
