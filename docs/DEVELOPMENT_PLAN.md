# Development Plan

## Issue Tracking Workflow

Every meaningful enhancement, bug fix, refactor, test addition, documentation change, or implementation slice must be tracked by a GitHub Issue.

Before starting a meaningful task, create or reference an existing GitHub Issue. If GitHub CLI is available and authenticated, use `gh issue create`. If GitHub CLI is unavailable or unauthenticated, update `docs/ISSUE_BACKLOG.md` instead.

Each GitHub Issue or backlog item must include:

- title
- type: feature / bug / refactor / docs / test / chore
- scope
- acceptance criteria
- related milestone or slice
- status

Every commit must reference the issue or backlog item. Use `refs #N` for partial progress and `closes #N` when the issue is completed. If using `docs/ISSUE_BACKLOG.md`, use commit messages like `refs ISSUE-BACKLOG-001` or `closes ISSUE-BACKLOG-001`.

Do not make feature or bug-fix commits without an issue or backlog reference unless it is an emergency checkpoint or WIP commit.

GitHub Issues are the external task-tracking layer. GSD2 milestones and slices are the internal execution layer. Keep both aligned.

## M001 — Hermes-first Platform Planning Scaffold

Create repository structure, documentation, placeholder building-domain tool files, placeholder building-domain skill files, and license attribution plan. Do not implement functional code. End with git status, add, commit, and push.

## M002 — Authenticated Foundation Skeleton

Implement:

- Authenticated Web UI skeleton
- Authenticated CLI skeleton
- Backend auth/project model skeleton
- Hermes-like runtime skeleton
- Memory skeleton
- Tool registry skeleton
- Skill registry skeleton
- Model configuration skeleton

End with git status, add, commit, and push.

## M003 — Permission-aware Runtime Integration

Wire request context, RBAC checks, dispatcher authorization, audit log surfaces, and project-scoped memory behavior across Web UI and CLI. End with git status, add, commit, and push.

## M004 — Gateway Adapter Specifications and Stubs

Add authenticated Email and WhatsApp gateway adapter skeletons that resolve verified identity and project context. Real providers remain deferred unless explicitly scoped. End with git status, add, commit, and push.

## M005 — Building-domain Expansion Planning

Turn BIM/IFC, Brick/RDF/SPARQL, time-series, cross-source linking, visualization, and HHW analysis placeholders into scoped implementation milestones. End with git status, add, commit, and push.
