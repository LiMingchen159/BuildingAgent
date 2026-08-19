# Repository Workflow and Implementation Governance

Use the lightweight GitHub workflow below for all repository work:

Request -> Plan -> Milestone -> Slice -> Issue -> Branch -> Commit -> PR -> Merge.

One issue = one branch = one PR.

PR bodies must include `Closes #<issue-number>` so GitHub auto-closes the issue after merge.

## Milestones, slices, and issues

- Milestone = major project phase, e.g. `M002`.
- Slice = vertical deliverable inside a milestone, e.g. `slice-3`.
- Issue = smallest executable task.

Issue title format:

```text
[M<3-digit milestone>-S<slice number>] <imperative task title>
```

Example: `[M002-S4] Add chat message layout`

Each issue must have:

- one milestone label: `M001`, `M002`, ...
- one slice label: `slice-1`, `slice-2`, ...
- one type label: `enhancement`, `bug`, `documentation`, `verification`, `refactor`, or `chore`

Infer optional domain labels from the task, but do not over-label. Usually 4-7 labels per issue is enough.

## Branches, commits, and pull requests

Branch format: `m002-s4-short-slug`

Use conventional commit messages that describe the active issue, for example:

```text
feat(reports): define report planning contracts
```

PR titles must match their issue titles. PR bodies must include:

```markdown
## Summary

## Linked Issue

Closes #<issue-number>

## Verification
```

Push the issue branch after committing. Open a linked PR when the issue has a GitHub number. Do not merge without explicit authorization and passing required checks.

## Planning and implementation scope

Before coding complex tasks:

1. Plan first.
2. Reuse an existing milestone if appropriate.
3. Split work into slices and issues.
4. Implement only one issue per branch.
5. Before large architectural changes, explain why they are necessary.

Business-code changes are allowed only when the repository owner has explicitly authorized the active milestone, issue, branch, and implementation scope. Naming those identifiers without an authorized scope is not sufficient. All changed files must be directly related to that active issue.

For `M008 - Generic recurring building performance reports`, issue branches may change the files required by their explicitly planned issue scope under:

- `apps/api/**`
- `apps/web/**`
- relevant shared schemas and types
- relevant tests
- report templates and report assets, if introduced

This permission is scoped to M008 report work; it is not permission for unrelated cleanup or refactoring.

The active authorization for this branch is:

- Milestone: `M008 - Generic recurring building performance reports`
- Issue: `[M008-S1] Define report specification and planning contracts`
- GitHub issue: `#195`
- Branch: `m008-s1-define-report-contracts`
- Scope: `AGENTS.md`, report contracts and pure planning modules under `apps/api/src/reports/**`, and their directly corresponding tests

UI integration, persistence, scheduling, deterministic data adapters, B-Agent calls, LaTeX/PDF rendering, and deployment changes are outside M008-S1 and require later issues and branches.

For every implementation issue:

1. Do not modify unrelated business logic.
2. Preserve unrelated existing worktree changes. Use a separate clean worktree when the current worktree is dirty; never stash, reset, copy, or commit unrelated changes into the issue branch.
3. Do not modify secrets, credentials, deployment configuration, or unrelated infrastructure.
4. Reuse existing architecture and infrastructure where possible.
5. Add or update tests for changed behavior.
6. Run relevant tests and type checks before opening or merging a PR.
7. Follow existing repository conventions.
8. Code and deterministic tools are the source of numerical facts. An LLM must not calculate, invent, or silently alter equipment names, numerical facts, or detected faults; its claims must cite supplied typed evidence and provenance.
9. Keep fault detection and fault diagnosis as separate concepts: deterministic FDD tools detect faults, while B-Agent may only diagnose or interpret the supplied fault evidence.

## Workflow maintenance

Workflow-only changes may update only:

- `AGENTS.md`
- `docs/workflow.md`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/ISSUE_TEMPLATE/feature_request.md`
- `.github/ISSUE_TEMPLATE/bug_report.md`
- `scripts/setup-github-labels.sh`

The labels script should create only these core labels:

- `M001`, `M002`, `M003`
- `slice-1` through `slice-10`
- `enhancement`, `bug`, `documentation`, `verification`, `refactor`, `chore`

Do not pre-create many domain labels. Create them later only when needed. Milestone labels beyond `M003`, including `M008`, should be created when that milestone begins rather than added to the core setup script.

## Reference source checkout

- For large public GitHub reference repositories, prefer an archive snapshot instead of a Git clone when history is not needed.
- If the server has slow or broken proxy environment variables, bypass them explicitly with `--noproxy '*'`.
- Fast tested pattern for Grafana:
  `curl --noproxy '*' -L --retry 3 --connect-timeout 10 --speed-time 30 --speed-limit 10240 -o /tmp/grafana-ref-download/grafana-main.tar.gz 'https://gh-proxy.com/https://github.com/grafana/grafana/archive/refs/heads/main.tar.gz'`
- Extract into a temporary directory first, verify expected files, then move the extracted folder into `.ref_Grafana`.
- This creates a complete source snapshot without `.git` history, suitable for learning frontend architecture and widget implementation.
