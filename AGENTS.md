# BuildingAgent Agent Instructions

## Issue Tracking Requirement

Every meaningful enhancement, bug fix, refactor, test addition, documentation change, or implementation slice must be tracked by a GitHub Issue.

Before starting a meaningful task, create or reference an existing GitHub Issue. If GitHub CLI is available and authenticated, use `gh issue create`. If GitHub CLI is unavailable or unauthenticated, update `docs/ISSUE_BACKLOG.md` instead.

Each GitHub Issue or backlog item must include:

- title
- type: feature / bug / refactor / docs / test / chore
- scope
- acceptance criteria
- related milestone or slice
- status

Every commit must reference the issue or backlog item. Use `refs #N` for partial progress and `closes #N` when the issue is completed. If using `docs/ISSUE_BACKLOG.md`, use commit references such as `refs ISSUE-BACKLOG-001` or `closes ISSUE-BACKLOG-001`.

Do not make feature or bug-fix commits without an issue or backlog reference unless it is an emergency checkpoint or WIP commit.

GitHub Issues are the external task-tracking layer. GSD2 milestones and slices are the internal execution layer. Keep both aligned.
