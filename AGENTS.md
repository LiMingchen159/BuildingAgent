Create a lightweight GitHub workflow for this repo. Do not modify business code except on an exact branch and issue scope explicitly authorized below.

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

The following owner-approved exceptions are active only when the current branch exactly matches the listed branch. They do not authorize changes on `main`, release branches, production state, or any unrelated branch:

- Issue #239, branch `m003-s8-bound-provider-requests`: provider payload limits, deadlines, cancellation propagation, retry ownership, durable chat failure handling, and directly corresponding tests. Authorized paths: `AGENTS.md`, `apps/api/src/providers.ts`, `apps/api/src/providers.test.ts`, `apps/api/src/agent/runtime.ts`, `apps/api/src/agent/runtime.streamPhase.test.ts`, `apps/api/src/server.ts`, `apps/api/src/chat.test.ts`.

- Issue #242, branch `m003-s10-local-history-data-bridge`: request-scoped derived-metric history caching, metadata profiling, the local Python data bridge/chart preparation, and directly corresponding tests. Authorized paths: `AGENTS.md`, `apps/api/src/agent/**`, `apps/api/src/derivedMetrics.ts`, `apps/api/src/derivedMetrics.test.ts`.

- Issue #243, branch `m003-s11-bound-tool-results`: request-scoped read-only tool deduplication, bounded and redacted tool audit persistence, request-cache retention, and directly corresponding tests. Authorized paths: `AGENTS.md`, `apps/api/src/agent/**`, `apps/api/src/derivedMetrics.test.ts`.

- Issue #247, branch `m003-s11-parse-mixed-history-timestamps`: parse mixed-precision ISO-8601 timestamps in the request-local chart bridge and add directly corresponding tests. Authorized paths: `AGENTS.md`, `apps/api/src/agent/chartStyle.ts`, `apps/api/src/agent/chartStyle.test.ts`.

- Issue #251, branch `m003-s13-chart-layout-selection`: default long-history charts with five to eight compatible series to deterministic small multiples, preserve stable series identity, labels, extrema, and true gaps, and add directly corresponding tests and chart guidance. Authorized paths: `AGENTS.md`, `apps/api/src/agent/chartStyle.ts`, `apps/api/src/agent/chartStyle.test.ts`, `apps/api/src/agent/chartGuidelines.ts`.

For these exceptions:
- Work only in separate clean worktrees and preserve unrelated changes.
- Do not change COP/FDD formulas, persisted metric values, production data, secrets, deployment configuration, reverse proxy, Web/Dashboard behavior, or unrelated M007/M010 code.
- Deterministic code is the source of numerical facts; the LLM must not invent or silently alter measured values.
- Preserve latest-value and small non-history compatibility.
- Never deduplicate mutating tools or calls with materially different normalized arguments, and preserve one protocol response for every provider tool-call id.
- Run focused tests, API typecheck, and independent review before commit or PR.
- Do not merge or deploy without separate explicit authorization.

The following owner-approved FDD exception is active only on its exact issue branch:

- Issue #281, branch `m007-s12-align-element-deployability`: align the Element CH-01 through CH-51 library with the reviewed `actual deployment` matrix, classify `Yes (further calculation required)` as unused/non-deployable, collapse Element uncertainty to `cannot_deploy`, preserve backend deployment authorization and frontend status consistency, and add directly corresponding tests. Authorized paths: `AGENTS.md`, `apps/api/src/fdd/**`, `apps/api/src/server.ts`, `apps/api/src/bms.test.ts`, `apps/api/src/fddHomogeneousFleet.test.ts`, `apps/web/src/App.tsx`, `apps/web/src/App.test.tsx`.

For Issue #281:
- Do not change FDD detection formulas, persisted metric values, production data, secrets, deployment configuration, reverse proxy, or unrelated project behavior.
- The reviewed matrix is a fail-closed Element deployment policy: it may block reviewed-unused rules and convert uncertainty to `cannot_deploy`, but it must not override missing runtime evidence to force a rule deployable.
- Run focused API and Web tests, API and Web typechecks, and independent review before commit or PR.
- Do not merge or deploy without separate explicit authorization.

The following owner-approved FDD UI exception is active only on its exact issue branch:

- Issue #283, branch `m007-s13-remove-fdd-definition-column`: remove the ambiguous `Definition` column from the FDD Algorithm Library table while preserving evaluator metadata, project deployability checks, runtime status, deployment status, and directly corresponding frontend tests. Authorized paths: `AGENTS.md`, `apps/web/src/App.tsx`, `apps/web/src/App.test.tsx`.

For Issue #283:
- Do not change backend behavior, FDD formulas, evaluator registration, deployability policy, persisted data, production configuration, or the algorithm details dialog.
- Remove the table header and matching row cell together so the remaining accessible column structure stays aligned.
- Run the focused Web test, Web typecheck, Web build, and independent review before commit or PR.
- Do not merge or deploy without separate explicit authorization.

The labels script should only create core labels:
M001, M002, M003
slice-1 to slice-10
enhancement, bug, documentation, verification, refactor, chore

Do not pre-create many domain labels. Create them later only when needed.

Commit with:
chore(workflow): add lightweight GitHub workflow

Push after commit.

Reference source checkout:
- For large public GitHub reference repositories, prefer an archive snapshot instead of a Git clone when history is not needed.
- If the server has slow or broken proxy environment variables, bypass them explicitly with `--noproxy '*'`.
- Fast tested pattern for Grafana:
  `curl --noproxy '*' -L --retry 3 --connect-timeout 10 --speed-time 30 --speed-limit 10240 -o /tmp/grafana-ref-download/grafana-main.tar.gz 'https://gh-proxy.com/https://github.com/grafana/grafana/archive/refs/heads/main.tar.gz'`
- Extract into a temporary directory first, verify expected files, then move the extracted folder into `.ref_Grafana`.
- This creates a complete source snapshot without `.git` history, suitable for learning frontend architecture and widget implementation.
