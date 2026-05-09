# GSD2 Workflow

## GitHub Issue Sync

GSD2 GitHub sync is enabled for this project. GitHub Issues are the external task-tracking layer, while GSD2 milestones, slices, and tasks are the internal execution layer. Keep the two aligned.

Use `/github-sync bootstrap` to initialize the mapping between GSD2 work units and GitHub Issues. Use `/github-sync status` to inspect the current mapping and identify drift before continuing work.

## Capturing New Work

Use `/gsd capture` for new bugs, enhancements, refactors, tests, or documentation work discovered during auto mode. Captured work should become either a GitHub Issue or, only if GitHub issue creation fails, a fallback item in `docs/ISSUE_BACKLOG.md`.

Before starting meaningful work, identify or create/reference the corresponding GitHub Issue. If issue creation is unavailable, update the fallback backlog instead.

## Commit Traceability

Every commit must reference a GitHub Issue or fallback backlog item. Commits must reference the issue or backlog item using the forms below.

- Use `refs #N` for partial progress on a GitHub Issue.
- Use `closes #N` only when the issue is completed and validated.
- Use `refs ISSUE-BACKLOG-001` or `closes ISSUE-BACKLOG-001` when the fallback backlog is used.

Do not make feature or bug-fix commits without issue or backlog traceability unless it is an emergency WIP checkpoint.

## Planning File Dependency Hygiene

When planning tasks, any file that will be newly created by a task must be declared as an expected output of that same task. Do not reference non-existing files only as inputs; this breaks pre-execution dependency analysis and stalls auto-mode.

For trivial scaffold, index, or placeholder files that are clearly within the current milestone scope, self-heal by creating the placeholder and updating the plan instead of pausing. Do not self-heal by creating secrets, production configuration, customer data, dependency artifacts, or real building-domain implementation files.

## Fallback Backlog

`docs/ISSUE_BACKLOG.md` is only a fallback when GitHub issue creation fails or is unavailable. Prefer GitHub Issues whenever the GitHub CLI is available and authenticated.
