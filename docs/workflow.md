# BuildingAgent GitHub Workflow

## Overview

Request → Plan → Milestone → Slice → Issue → Branch → Commit → PR → Merge

One issue = one branch = one PR.

## Conventions

### Milestones
- Format: `M001`, `M002`, `M003`, ...
- A major project phase containing multiple slices.

### Slices
- Format: `slice-1`, `slice-2`, ..., `slice-10`
- A vertical deliverable inside a milestone.

### Issues
- Title format: `[M<NNN>-S<N>] <imperative task title>`
- Example: `[M002-S4] Add chat message layout`
- Each issue must have:
  - milestone label (e.g. `M001`)
  - slice label (e.g. `slice-1`)
  - one type label: `enhancement` / `bug` / `documentation` / `verification` / `refactor` / `chore`

### Branches
- Format: `m<N>-s<N>-short-slug`
- Example: `m002-s4-chat-message-layout`

### Commits
- Conventional commit format: `type(scope): description`
- Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`

### Pull Requests
- Title must match the issue title.
- Body must include:
  - `## Summary`
  - `## Linked Issue` with `Closes #<issue-number>`
  - `## Verification`
- GitHub auto-closes the linked issue on merge.

## Labels

Core labels managed by `scripts/setup-github-labels.sh`:
- Milestone: `M001`, `M002`, `M003`
- Slice: `slice-1` through `slice-10`
- Type: `enhancement`, `bug`, `documentation`, `verification`, `refactor`, `chore`

Domain labels are created ad-hoc as needed.
