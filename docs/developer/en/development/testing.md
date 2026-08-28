# Testing and verification

[中文](../../zh-CN/development/testing.md) | [Developer documentation home](../README.md) | [Configuration and local run](configuration.md) | [Troubleshooting and known contract gaps](troubleshooting.md)

> Product code baseline: `main@af44ff15`; S9 documentation-branch baseline: `df2dea95`. Their product code is identical and the branch differs only in documentation/diagrams. Status: workspace-test, typecheck, build, and smoke-runner entry points are **Implemented**, but only Web, typecheck, and build passed the S9 run. API, CLI, and smoke retain reproduced failures, so the overall regression is not green. Test-discovery/fixture isolation is **Partial**; repository-level CI, lint, coverage, browser E2E, and a documentation link checker are **Planned**.

## 1. Status and code baseline

The root [`package.json`](../../../../package.json) organizes the API, CLI, and Web with npm workspaces. All three workspaces provide `test`, `typecheck`, and `build`; root scripts add test dispatch and smoke. `.github` currently contains issue/PR templates only, with no workflow, so these commands are local gates rather than existing CI status checks.

| Gate | Current status | Fact boundary |
| --- | --- | --- |
| API Vitest | **Partial / failed this run** | `--dir src` collected 53 files and 402 tests; 399 passed and 3 failed with controlled fixtures. A raw clean checkout had 2 more failures from hard-coded file assumptions. |
| CLI Vitest | **Partial / failed this run** | A serial run collected 3 files and 9 tests: 8 passed and 1 failed. Parallel execution can also contend on shared SQLite; explicit mock does not remove the failure. |
| Web Vitest | **Implemented / passed this run** | Vite config already limits discovery to `src/**/*.test.ts(x)`; the correct command collected 9 files and all 77 tests passed. Adding `--dir src` produces 0 collected/exit 1. |
| Workspace typecheck / build | **Implemented / passed this run** | All three workspaces passed; the Web build reported an 863.30 kB chunk warning. These commands perform no lint, coverage, or browser acceptance. |
| Local smoke | **Partial / failed this run** | With explicit mock, build, health, login, project, and management stages completed, but the final assistant-text assertion failed. It is neither a production probe nor complete E2E. |
| Test and fixture isolation | **Partial** | API has hard-coded KB/PNG assumptions; `projectFeedback.test.ts` creates/deletes fixtures under default project repositories; parallel CLI can hit a SQLite lock. |
| Documentation, Draw.io, and secret gates | **Partial** | M011 runs read-only commands and manual review; the repository has no reusable link/bilingual/diagram/secret validation script. |
| CI, lint, coverage, browser E2E | **Planned** | `package.json` has no corresponding scripts and the repository has no GitHub Actions workflow. A missing gate is not a pass. |

## 2. Purpose and boundaries

This page defines the minimum reproducible validation sequence for developers and PR reviewers and makes each result attributable to a commit, worktree, and collected test set. It is used to detect whether documentation changes accidentally alter product regression results and to prevent old branches, untracked build backups, or site data from contaminating a run.

This page does not:

- prove every product behavior or its performance, security, accessibility, or site BMS/FDD correctness;
- turn unit/integration tests into real-browser, real-provider, real-collector, or site-commissioning evidence;
- fix failing tests, Vitest include/exclude, fixture isolation, missing CI, or bundle warnings;
- attribute an unmerged M007 candidate's FDD results to product `main`;
- allow a process exit code to hide failures, skips, warnings, collected paths, or the execution environment.

## 3. User and source entry points

Install dependencies from the lockfile in a clean worktree based on the commit being verified, then run these commands from the repository root. The recommended source-directed regression sequence is:

```bash
npm --workspace @building-agent/api exec -- vitest run --dir src
npm --workspace @building-agent/cli exec -- vitest run --dir src --no-file-parallelism
npm --workspace @building-agent/web exec -- vitest run
npm run typecheck
npm run build
BUILDING_AGENT_LLM_PROVIDER=mock npm run smoke
```

| Entry | Behavior | Key definition |
| --- | --- | --- |
| API `vitest run --dir src` | Bound discovery to `src` for the API, which has no local Vitest config. Formal reproduction should also use a one-time `BUILDING_AGENT_DATA_DIR`. | [API package](../../../../apps/api/package.json) |
| CLI `vitest run --dir src --no-file-parallelism` | Bound discovery and run files serially to avoid the shared-SQLite `database is locked` observed in this run. Serialization improves reproducibility; it does not waive assertion failures. | [CLI package](../../../../apps/cli/package.json) |
| Web `vitest run` | Use the existing `src/**/*.test.ts(x)` include from Vite config. **Do not** add `--dir src`; that combination produced 0 collected/exit 1. | [Web package](../../../../apps/web/package.json), [Vite configuration](../../../../apps/web/vite.config.ts) |
| `npm test` | With no targeted path, [`run-tests.cjs`](../../../../scripts/run-tests.cjs) invokes every workspace's default `vitest run` in sequence. | [Root package](../../../../package.json), [test dispatcher](../../../../scripts/run-tests.cjs) |
| `npm test -- apps/api/src/<file>.test.ts` | The root dispatcher uses the path prefix to run only that file in its workspace, which is useful for reproducing a failure. | [Test dispatcher](../../../../scripts/run-tests.cjs) |
| `npm run typecheck` | Run `tsc --noEmit` in every workspace that defines the script. | The three workspace packages and their `tsconfig.json` files |
| `npm run build` | Compile API/CLI; Web type-checks, then bundles with Vite and adjusts artifact read permissions. | The three workspace packages and [Vite configuration](../../../../apps/web/vite.config.ts) |
| `BUILDING_AGENT_LLM_PROVIDER=mock npm run smoke` | Select mock explicitly, build, probe or start local API/Web, then execute a cross-surface flow with an isolated CLI home. The current run still fails its final text assertion. | [`smoke-local.cjs`](../../../../scripts/smoke-local.cjs) |

The Web [`vite.config.ts`](../../../../apps/web/vite.config.ts) explicitly limits tests to `src/**/*.test.ts(x)` and uses `jsdom` plus the jest-dom setup. API and CLI have no repository Vitest configuration, so they use `--dir src`; Web must retain its config-driven discovery. CLI adds serialization because parallel execution hit a SQLite lock in this run, not to alter test semantics.

Run root `npm test` only in a clean environment that has both no real local KB/repository data and no `dist.predeploy-*` / `dist.prehotfix-*` backup directory. It also does not add the CLI serialization flag automatically. Use the three workspace-specific commands above for routine and milestone regression; root `npm test` is not a substitute for this baseline.

## 4. Normal verification flow

1. Create a dedicated worktree at the complete SHA under verification. Record `git rev-parse HEAD`, Node/npm versions, operating system, and time zone; confirm that it does not reuse another business worktree's changes, real KB/repository data, or `dist.pre*` backup directories.
2. Install locked dependencies and record `git status --short` before testing. Ignored files do not appear in ordinary status output, so inspect local data roots and backup build directories separately.
3. Run the recommended command for API → CLI → Web: API/CLI use `--dir src`, CLI also uses `--no-file-parallelism`, and Web uses the default Vite-config include. Save each collected count, pass/fail/skip count, full failing-test name, and exit code rather than retaining one aggregate number.
4. Run root `typecheck` and `build`. Record build warnings independently; an exit code of zero does not mean there were no warnings.
5. Run smoke on dedicated local ports. Confirm the target URLs identify temporary/local instances, not shared or production services, and record whether the script reused running services or spawned children.
6. Check mirrored bilingual file lists, language switches, relative links/images/source paths, two-click reachability, Draw.io re-export, embedded XML, readability, secrets, `git diff --check`, and allowed change scope.
7. Compare with clean `main` at the same product-code baseline. `df2dea95` differs from `main@af44ff15` only in documentation/diagrams. The 3 API failures, 1 CLI failure, and final smoke-stage failure are reproduced baseline results: do not describe them as M011 regressions, but do not describe them as passes either. Record full names plus fixture/provider conditions.
8. Inspect the diff again so regression-generated `dist`, `apps/data`, project repositories, logs, or temporary credentials never enter the commit.

M011 adds no documentation-validation script, so its documentation checks remain one-off read-only checks plus manual review in this PR. Future automation should encode the same decisions in versioned scripts and CI rather than depending on one PR log.

## 5. Data, state, and persistence

| Artifact or state | Lifecycle and risk |
| --- | --- |
| Vitest stdout/stderr | Exists only in the terminal or an external log; the repository has no coverage reporter or test-result archive. A record needs its command, SHA, and environment. |
| `apps/*/dist` | Rebuildable output from `npm run build`, normally ignored by `.gitignore`. It is not source and should not be a test-discovery root. |
| `dist.predeploy-*` / `dist.prehotfix-*` | Local untracked backups. M011 preliminary analysis observed root `npm test` collecting tests from them. Formal gates use workspace-specific discovery: `--dir src` for API/CLI and the Vite include for Web. |
| API-test project data | Writes were isolated under a one-time `BUILDING_AGENT_DATA_DIR`. A raw clean checkout lacked the hard-coded `project_mortar` `bldg40.ttl` and repository PNG, yielding 397/402. Copying repository-tracked public Turtle/PNG fixtures to the expected names made those 2 targeted tests pass 2/2 and the full suite 399/402. This is test-environment adaptation, not product data. |
| API feedback fixture | [`projectFeedback.test.ts`](../../../../apps/api/src/projectFeedback.test.ts) uses fixed `project_element` / `project_demo` ids and [`repoRootForProject`](../../../../apps/api/src/agent/knowledgeBase.ts). It creates scripts and recursively removes `project_demo/repository/feedback_tools`; never let it resolve to real data. |
| CLI SQLite state | When several test files started servers in parallel, this run observed `database is locked`. The formal result uses `--no-file-parallelism` to reproduce 8/9 consistently instead of treating a lock as a business-assertion result. |
| Smoke CLI state | Smoke stores token/project selection in a temporary `BUILDING_AGENT_CLI_HOME` and removes it on exit. Output redacts the fixture password and Bearer tokens. |
| Smoke API state | A newly started API can write local `apps/data/store.json`. If the health probe finds a running service, smoke reuses it and performs login, project selection, and Chat writes. Never target an instance containing real user data. |
| Documentation and diagram results | Markdown, `.drawio`, and `.drawio.svg` are this milestone's only authoritative deliverables. Temporary PNGs, re-export copies, and validation logs are not committed. |

A “clean worktree” means more than an empty tracked diff: the test target must have no real local KB/repository data and no old build backups. If that cannot be guaranteed, stop and use an isolated worktree/data root. Never manufacture a clean state by deleting real directories.

## 6. Permissions and project isolation

Seed tokens, example email addresses, and project ids in tests are fixtures only and must never be replaced with production credentials. Test logs, failure snapshots, and PR text must not contain real API keys, Bearer tokens, BMS passwords, private collector addresses, or user-document content.

API tests must point persistence at a temporary root or run in a dedicated worktree known to contain no real project data. In particular, do not run the current `projectFeedback` fixture when `data/project_demo/repository/feedback_tools` contains real files because it deletes that directory. New tests must use a unique temporary directory and clean only the boundary they created.

Smoke accepts `SMOKE_API_URL` and `SMOKE_WEB_URL` and reuses healthy existing services. Those variables broaden the target but grant no new authority. The operator must verify host, ports, and data set and may point them only at a local instance prepared for testing. The server still enforces real membership/project selection during smoke, but that does not authorize fixture Chat writes to a shared environment.

Documentation verification may read source and controlled attachment summaries only. If a secret scan matches, first distinguish a public fixture from a credential. A real secret must be removed from the worktree and history through the approved security process, never printed in documentation.

## 7. Errors, degradation, and external dependencies

| Situation | Decision and response |
| --- | --- |
| Vitest does not collect expected files | Fail. Check workspace cwd, filenames, and config; never report “0 passed.” Adding `--dir src` to Web produced 0 collected/exit 1; remove that argument for the correct run. |
| API lacks hard-coded fixtures | A raw clean checkout adds 2 Chat failures. Only copy tracked public fixtures into the one-time isolated root and demonstrate those cases separately as 2/2. Never copy real KB/user files or count a fixture gap as a product pass. |
| API retains 3 failures | Record the exact full names below. The docs branch changes no business code, so M011 does not fix them, but “399 passed” must not hide them. |
| Parallel CLI hits a SQLite lock | Use `--no-file-parallelism` for stable reproduction. This is a shared-state isolation gap; retain the 1 Chat failure that remains when serial. |
| CLI provider differs | With no provider, the same Chat case receives 502. With explicit mock, the suite remains 8/9 because the response has `fallbackUsed: true` while the test expects `false`. Neither mode is a green baseline. |
| Web/typecheck/build | All passed in this run. The Web build's 863.30 kB chunk is a warning and must not be reported as warning-free. |
| Final smoke assertion | Explicit mock completed build/health/login/session/projects/use/registry/management/chat, but fixed unavailable text did not echo the input; the final assistant-text assertion failed with exit 1. Passing earlier stages does not make smoke pass. |
| Smoke port is occupied | The script probes first and may reuse a service. If that service is not an isolated fixture, abort; reachability does not establish the correct target. |
| Provider, collector, network, or system tool is unavailable | Unit tests should mock/stub it. An explicit mock must still satisfy test/smoke contracts; local-provider status does not waive assertions. An unavailable real dependency cannot be rewritten as a pass either. |
| Draw.io re-export differs | Separate nondeterministic tool ids from content changes, then check with the agreed draw.io 31.1.8 export/canonicalization process. Merely finding an SVG is insufficient. |
| Documentation link, mirror, secret, or scope gate fails | Fail the PR and rerun after correcting documentation. M011 does not modify business code to bypass a documentation gate. |

The controlled-fixture full API run consistently reproduced these 3 failures among 53 files and 402 tests:

- `projectGrounding > builds a stream activity payload for retrieved site rules`
- `projectRules > backfills legacy running rule with trigger topics`
- `fetchEnteliLiveValue > reads WCC_1_Chilled_Water_Temp when catalog and enteliWEB are reachable`

They match the three failure classes seen on the preliminary M011 working line; the important new evidence is the exact set reproduced against code equivalent to product `main@af44ff15`. This set is a known baseline, not a permanent allowlist. Once business fixes land, later validation must require green instead of continuing to permit failures.

The complete remaining serial CLI test name is `authenticated cli commands > logs in, persists auth, selects a project, and reuses it for chat in fresh invocations`: with no provider, Chat exits early on 502; with explicit mock, it reaches the metadata assertion and fails on `fallbackUsed`. Smoke's final failure is the runner assertion “Chat command did not include the assistant response.”

## 8. Extension guide

Add tests beside the corresponding `src` module using `.test.ts` / `.test.tsx`, covering success, rejection, cross-project access, malformed input, external-dependency failure, and secret non-disclosure. Web tests must match the existing Vite include without layering `--dir` on top. A future API/CLI issue should add explicit include/exclude so callers no longer need `--dir src`; that change is outside M011.

Every file-writing fixture should use `mkdtemp` or an equivalent temporary root, pass its environment explicitly to the server/store under test, and delete only the exact directory the test created. Replace today's hard-coded `bldg40.ttl`/PNG prerequisites with fixtures created by the tests, and avoid fixed `project_demo` paths under the default repository root. CLI servers/stores should isolate SQLite per file rather than permanently depending on serial execution. Report cleanup failure without expanding deletion scope.

Keep new root gates composable: test, typecheck, build, smoke, lint, coverage, E2E, and documentation validation should run independently before CI orchestrates them. CI should pin Node/npm, installation method, and timeouts and upload structured results while redacting tokens, environment variables, and logs. A new workflow, dependency, script, or business fix requires a separate issue; it is not part of M011.

Minimize a failing run to one file first, for example:

```bash
npm --workspace @building-agent/api exec -- vitest run src/projectFeedback.test.ts
```

Then rerun the complete corresponding workspace gate in the same environment so a single-file pass cannot hide ordering, shared-state, or collection-scope problems. Smoke/provider fixes should also cover no-provider, explicit-mock, and allowed-fallback contracts so runner assertions match actual assistant text and metadata.

## 9. Tests and results for this milestone

API tests cover Fastify routes, authentication, Chat/Agent, BMS, Derived Metrics, Dashboards, Memory/Grounding, Repository, and Reports. CLI tests cover configuration, commands, and the placeholder registry. Web uses jsdom to cover the API client, workspace interactions, and major page components. Trace specific entry points through each workspace's `src/**/*.test.*` files.

The S9 measurement environment was Node.js `v20.20.2`, npm `10.8.2`, Linux `6.8.0-53-generic` x86_64, `Asia/Shanghai` (CST), on `2026-08-28`. The clean worktree HEAD at the start of code regression was `df2dea95e0eb79f467d506c7f9866a56a83fccad`.

<!-- M011-S9-REGRESSION-RESULTS:START -->
<!-- Root-run code regression is filled below. Before final commit, fill only the final three documentation gates; never rewrite existing API/CLI/smoke failures as passes. -->

| Gate | Execution entry | Result | Notes |
| --- | --- | --- | --- |
| API source-only | `npm --workspace @building-agent/api exec -- vitest run --dir src` | **Failed: 399/402 passed** | 53 files: 50 passed, 3 failed, using a one-time isolated data root and controlled public fixtures. Raw clean checkout was 397/402 with 5 failures; the additional 2 passed 2/2 in a targeted run after fixture setup. See section 7 for the exact retained 3. |
| CLI source-only (serial) | `npm --workspace @building-agent/cli exec -- vitest run --dir src --no-file-parallelism` | **Failed: 8/9 passed** | 3 files. With no provider Chat received 502. Explicit mock remained 8/9 because the response had `fallbackUsed: true` while the test expected `false`; the initial parallel run also hit a SQLite lock. |
| Web source-only | `npm --workspace @building-agent/web exec -- vitest run` | **Passed: 77/77** | All 9 files passed; jsdom is not browser E2E. Adding `--dir src` produced 0 collected/exit 1 and must not be used. |
| Typecheck | `npm run typecheck` | **Passed** | API, CLI, and Web all passed. |
| Build | `npm run build` | **Passed with warning** | All three workspaces built; Web reported an 863.30 kB chunk above 500 kB. |
| Local smoke | `BUILDING_AGENT_LLM_PROVIDER=mock npm run smoke` | **Failed: exit 1** | build/health/login/session/projects/use/registry/management/chat completed; fixed mock unavailable text did not echo the input, so the final assistant-text assertion failed. |
| Bilingual, links, reachability, and source paths | One-off read-only PR checks | **Passed** | 25 pages per language with identical relative file lists; across 51 Markdown files there were 0 broken links, 0 missing reciprocal switches, and 0 unreachable or over-two-click pages. All 22 candidate-commit source objects exist. |
| Draw.io source/embedded XML/re-export/readability | draw.io 31.1.8 + manual review | **Passed: 6/6** | All 6 source/SVG pairs contain embedded XML; re-export was byte-identical after generated-id canonicalization, and slice review covered readability. |
| Secrets, diff, and file scope | Read-only scan + `git diff --check` | **Passed** | Credential-pattern scan had 0 matches; `git diff --check` passed; S9 changes only README, 6 development pages, and verification commands in 6 feature pages, with no business-code diff. |

<!-- M011-S9-REGRESSION-RESULTS:END -->

The controlled API fixture run used a one-time `BUILDING_AGENT_DATA_DIR` and copied repository-tracked public fixtures to the hard-coded expected names `bldg40.ttl` and `bldg40_RM1013_zone_air_temp_last_year.png`. This explains the two extra raw-checkout failures but does not change the three product assertion failures that remain above. CLI's stable result is serial; the parallel lock and the remaining serial Chat assertion are different problems. Completing earlier smoke stages likewise cannot override its final non-zero exit.

M011 preliminary analysis ran six FDD-targeted files on an unmerged M007 candidate working line, historically recording **52 passing tests**. Product `main@af44ff15` has no `apps/api/src/fdd/**` producer, catalog/evaluator/deployability/Task code, or corresponding dedicated tests; it only has Reports consumer-contract tests for external `fdd_rule` evidence. S9 therefore neither invents an FDD “skip/pass” on `main` nor adds the candidate number to the product totals above. See [Verification and sample provenance](../fdd/verification-provenance.md) for the complete evidence boundary.

## 10. Known limitations and related documentation

- The repository has no GitHub Actions workflow, so the commands on this page do not automatically become required checks.
- There is no unified lint, coverage, browser E2E, performance, accessibility, documentation-link, or secret-scanning script. An unrun dimension must remain unverified.
- Default API/CLI Vitest discovery is not bounded in repository configuration; they depend on explicit `--dir src`, while Web must use its existing Vite include. Root `npm test` is untrustworthy with `dist.pre*` and adds no CLI serialization protection.
- A clean API checkout lacks the hard-coded `bldg40.ttl`/PNG prerequisites; after controlled setup, 3 assertion failures still remain. The `projectFeedback` fixture can also write/delete the default project repository.
- CLI has no green baseline: serial is 8/9, while parallel can also hit a SQLite lock. No-provider and explicit-mock modes expose different contract failures in the same Chat case.
- Smoke is a local cross-surface check that writes test Chat state and may reuse a running healthy service. This explicit-mock run failed its final assistant-text assertion and must not be listed as passing.
- jsdom Web tests do not validate real-browser layout, SSE/WS networking, downloads, microphone access, or screen-reader behavior.
- The 52 FDD tests are unmerged-candidate history only; product main still has no FDD producer/runtime.
- Build passed with an observed 863.30 kB Web chunk warning. M011 records it but does not change chunking or dependencies.

Continue with [Configuration and local run](configuration.md), [Troubleshooting and known contract gaps](troubleshooting.md), [Current implementation architecture](../architecture/current-architecture.md), [CLI](../features/cli.md), and [Verification and sample provenance](../fdd/verification-provenance.md).
