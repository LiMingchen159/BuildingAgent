Create a lightweight GitHub workflow for this repo. Do not modify business code.

Core workflow:
Request -> Plan -> Milestone -> Slice -> Issue -> Branch -> Commit -> PR -> Merge.
One issue = one branch = one PR.
PR body must include `Closes #<issue-number>` so GitHub auto-closes the issue after merge.

Use my milestone/slice style:
- Milestone = major project phase, e.g. M002
- Slice = vertical deliverable inside a milestone, e.g. slice-3
- Issue = smallest executable task

Issue title format:
[M<3-digit milestone>-S<slice number>] <imperative task title>

Example:
[M002-S4] Add chat message layout

Labels:
Each issue must have:
- milestone label: M001, M002, ...
- slice label: slice-1, slice-2, ...
- one type label: enhancement / bug / documentation / verification / refactor / chore

Infer optional domain labels from the task, but do not over-label.
Usually 4-7 labels per issue is enough.

Branch format:
m002-s4-short-slug

PR format:
Title should match the issue title.
Body must include:
## Summary
## Linked Issue
Closes #<issue-number>
## Verification

Before coding complex tasks:
1. Plan first.
2. Reuse existing milestone if appropriate.
3. Split work into slices and issues.
4. Only then implement one issue per branch.

Create/update only:
- AGENTS.md
- docs/workflow.md
- .github/PULL_REQUEST_TEMPLATE.md
- .github/ISSUE_TEMPLATE/feature_request.md
- .github/ISSUE_TEMPLATE/bug_report.md
- scripts/setup-github-labels.sh

The labels script should only create core labels:
M001, M002, M003
slice-1 to slice-10
enhancement, bug, documentation, verification, refactor, chore

Do not pre-create many domain labels. Create them later only when needed.

Commit with:
chore(workflow): add lightweight GitHub workflow

Push after commit.
