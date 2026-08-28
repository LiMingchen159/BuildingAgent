# Troubleshooting and known contract gaps

[中文](../../zh-CN/development/troubleshooting.md) | [Developer documentation home](../README.md) | [Configuration and local development](configuration.md) | [Testing and verification](testing.md)

> Product code baseline: `main@af44ff15`. Status: this page is a troubleshooting index for implemented paths and known gaps. It records verifiable boundaries; it does not mean M011 fixed business code, external services, or deployment issues.

## 1. Status and code baseline

Before troubleshooting, confirm that the running code, documentation, and data belong to the same baseline. Product `main@af44ff15` has Web, CLI, Fastify, Chat/Agent, Dashboard, and local-storage paths, but similarly named capabilities do not all form complete product loops.

| Responsibility | Status | Boundary that troubleshooting must preserve |
| --- | --- | --- |
| Authentication, project selection, synchronous Chat, and SSE | **Implemented** | `401`, membership, selected-project, permission, and provider failure are different error layers. |
| BMS | **Implemented + Partial + External** | Read-only collector queries, mock/Element bridge, and some source routes exist; seven Web-client routes have no Fastify provider, and the real BMS remains outside the repository. |
| Derived Metrics / Dashboard | **Implemented with isolation gaps** | SQLite metrics and Dashboard batch reads work; some direct-`instanceId` Agent-tool paths do not re-check project ownership. |
| AutoReport / server Reports | **Partial / Planned** | Browser AutoReport and the tested server report library are two unassembled paths; `server.ts` has no report-execution API. |
| FDD | **Product consumption only Partial; candidate unmerged** | `main` has only the Reports `fdd_rule` evidence consumer; M007 catalog, runtime, Task, and `198 / 59 / 111` are fixed candidate snapshots. |
| Scheduler / Realtime / STT | **Implemented + Partial + External** | One-shot reminders and project WebSocket work; recurring behavior, the task panel, and the STT configuration loop are incomplete. |
| Verification automation | **Local commands exist; CI Planned** | The repository has no actual `.github/workflows/**`; a local pass or Web bundle warning is not a hosted-CI result. |

“A route is declared,” “a library test passes,” “a candidate branch implements it,” and “the product works end to end” are four different kinds of evidence. A troubleshooting conclusion must identify whether it relies on product main, a browser client, an external service, or an unmerged candidate commit.

## 2. Purpose and boundaries

This page locates a symptom at the narrowest responsibility layer and gives checks that do not expand the incident surface. Classify in this order:

1. **Client state**: whether the API origin, CLI config, bearer, current page, and local selected project agree.
2. **Server authorization**: which of token, membership, selected-project, and permission rejected the request.
3. **Contract provider**: whether Fastify, the collector, `BMS_API_BASE_URL`, the LLM, or another external service supplies the request.
4. **Data owner**: whether state belongs to `apps/data/store.json`, root `data/**`, an in-process cache, or an external BMS/LLM.
5. **Verification environment**: whether the command ran in a clean worktree, with an isolated data root, and against the correct workspace/source directory.

This page is not a production incident runbook, backup/recovery plan, credential-rotation procedure, or site-BMS operating procedure. It does not authorize bypassing project guards, fabricating FDD results, editing the metric database by hand, or treating a frontend declaration as a server implementation. When sharing evidence, keep only status, stable `error.code`, a redacted `requestId`, route shape, and baseline commit. Never paste a bearer, API key, password, complete `.env`, CLI config, customer point list, message body, or private address.

## 3. User and source entry points

| Inspection surface | Smallest safe entry | Key source or current documentation |
| --- | --- | --- |
| Process and Chat provider | `GET /health`, then non-secret provider mode/code | [providers.ts](../../../../apps/api/src/providers.ts), [server.ts](../../../../apps/api/src/server.ts), [Chat and Agent Runtime](../features/chat-agent-runtime.md) |
| Identity and selected project | `GET /api/session`, `GET /api/projects`, and the project select route; never print the header | [auth.ts](../../../../apps/api/src/auth.ts), [Authentication, projects, and conversations](../features/auth-projects-conversations.md) |
| Two data roots | Confirm resolved directories and file existence without reading or uploading contents | [persistence.ts](../../../../apps/api/src/persistence.ts), [knowledgeBase.ts](../../../../apps/api/src/agent/knowledgeBase.ts), [Runtime and storage topology](../architecture/runtime-storage.md) |
| BMS | First distinguish Fastify, collector, mock, Element bridge, and external-management modes | [bmsApiClient.ts](../../../../apps/web/src/bmsApiClient.ts), [bmsCollectorProxy.ts](../../../../apps/api/src/bmsCollectorProxy.ts), [BMS integration](../features/bms-integration.md) |
| Metrics, Dashboard, and Reports | Confirm the resource type, project id, and whether the caller is Web or a library component | [derivedMetrics.ts](../../../../apps/api/src/derivedMetrics.ts), [dashboards.ts](../../../../apps/api/src/dashboards.ts), [reports/](../../../../apps/api/src/reports), [Dashboards and Reports](../features/dashboards-reports.md) |
| Scheduler, SSE, WS, and STT | Record the event name, payload JSON type, and error code, not message/audio content | [scheduler.ts](../../../../apps/api/src/scheduler.ts), [api.ts](../../../../apps/web/src/api.ts), [API and event contracts](../architecture/api-events.md) |
| CLI | `config-path` and redacted `session` output | [config.ts](../../../../apps/cli/src/config.ts), [commands.ts](../../../../apps/cli/src/commands.ts), [CLI](../features/cli.md) |
| Verification commands | From the repository root, run tests according to each workspace's actual Vitest configuration, followed by typecheck, build, and smoke diagnostics | [package.json](../../../../package.json), [run-tests.cjs](../../../../scripts/run-tests.cjs), [smoke-local.cjs](../../../../scripts/smoke-local.cjs) |

`/health` proves only that the current HTTP process can respond; it does not prove the token, project, LLM, collector, BMS, STT, or report pipeline is healthy. Browser banners can also normalize several upstream problems into the same wording, so prefer a structured code, HTTP status, and request id for correlating server logs.

## 4. Normal data flow

Use this minimum troubleshooting flow for a reproducible symptom; do not start by mutating data or changing several toggles:

1. Record the current commit, start command, API/Web origins, time, and one redacted `requestId`; confirm that the request reached the intended process.
2. Use `/health` to separate “process unreachable” from “business dependency failed.” If Web opens but API calls fail, check the Web API base URL before changing business data.
3. For a protected request, reconstruct authorization through `session -> projects -> select`; use `error.code` to distinguish token, membership, selected-project, and permission.
4. Follow the call direction to identify the provider: Web/CLI → Fastify route → local service/adapter → external provider. If Fastify has no route, an operational external service cannot fill that contract.
5. Confirm the authoritative location and project scope of the observed state. Do not delete SQLite, copy `store.json`, or rewrite customer files to “test” a hypothesis.
6. Run the narrowest test in an isolated environment; expand to a workspace, build, and smoke only after the reproduction is stable. Keep the command, exit code, and failed-test name while removing secrets and customer content.

| Symptom | Check | Boundary / handling |
| --- | --- | --- |
| Web loads, but Chat returns `provider_error` | After `/health`, inspect `BUILDING_AGENT_LLM_PROVIDER`, API-key presence, and whether fallback was explicitly enabled | This is usually not Web reachability. No key does not select mock automatically; deterministic local use requires an explicit `mock` provider. |
| The same route returns `401` sometimes and `403` at other times | Record `auth_missing/auth_invalid`, `project_forbidden`, or `project_not_selected`, then inspect session and URL project | Do not repeatedly log in or treat a project id as a credential; rebuild context layer by layer as in section 6. |
| The UI displays a capability, but the call returns `404/405/501` | Search `server.ts` for the exact method/path and check whether a collector or external service supplies it | A client method proves only that the consumer can send a request; record a known contract gap when no provider exists. |
| A unit test passes, but the page has no callable entry | Distinguish a pure-library test, Fastify route test, and Web mock | Reports and FDD especially cannot derive a product route from library or candidate tests. |

## 5. Data, state, and persistence

| Symptom | Check | Boundary / handling |
| --- | --- | --- |
| Users, projects, or conversations still come from the old location after changing `BUILDING_AGENT_DATA_DIR` | Inspect both `apps/data/store.json` and the configured root `data/**`; compare only paths, mtimes, and non-sensitive counts | The environment variable moves the project-file/SQLite/Memory/Scheduler root, not the SeedStore fixed by [persistence.ts](../../../../apps/api/src/persistence.ts). The two roots have no unified transaction or recovery. |
| KB/Repository files exist but cannot be searched, or an index appears “lost” | Confirm the project directory, then distinguish source files from rebuildable `session_index.db`, `grounding_index.db`, and similar indexes | Do not delete source files. Only indexes explicitly marked rebuildable should follow a dedicated rebuild procedure. `derived_metrics.db` is not a generic cache. |
| BMS mock/source/job state, WebSocket subscriptions, or Dashboard point cache disappears after API restart | Inspect the mode and process restart time | All or part of this state is in process memory; the external BMS/collector remains authoritative for site data. Never interpret cache loss as deletion of site data. |
| Scheduler jobs are missing or have unexpected status after restart | Check that `scheduled_jobs.json` under the configured data root parses, recording only job id/status/time | The JSON is best-effort local state, not a multi-instance queue. It can contain project messages and must not be copied into an issue. |
| CLI points to the wrong API/project, or reports `config_parse_failed` | Run the built `config-path` command and use redacted config from `session`; inspect `BUILDING_AGENT_CLI_HOME` | Config is plaintext JSON under the home directory by default; only output is token-redacted. Reproduce with an isolated CLI home and never paste or share the original config. Concurrent writes can also overwrite project selection. |
| A test changes local project files or depends on stale fixtures | Check for a clean worktree, temporary `BUILDING_AGENT_DATA_DIR`, and isolated CLI home | Do not run write-capable tests against real KB, customer output, or an active `store.json`; copy only non-sensitive fixtures into a temporary environment. |

`apps/data/store.json` is the authoritative local snapshot for users, tokens, projects, messages, conversations, Dashboards, and related state. Root `data/<project>/**` contains KB, Repository, outputs, Memory, SQLite, and scheduling files. Falling back to seed after the former is damaged is a local degradation mode, not successful production recovery. Real customer files, BMS exports, transcripts, report artifacts, and connection credentials must follow the deployment's data-classification, retention, and access rules.

## 6. Permissions and project isolation

| Symptom | Check | Boundary / handling |
| --- | --- | --- |
| `401 auth_missing` / `auth_invalid` | Check that the header exists, that the token belongs to the current API store, and that it has not expired; record only code/request id | Obtain a valid token again. Never put it in a URL, log, screenshot, or issue. |
| `403 project_forbidden` | Use the project list to confirm membership, then inspect the required `chat:read/chat:write/project:configure` permission | Selecting a project cannot create membership or permission; do not bypass this in browser state. |
| `403 project_not_selected` | Compare `/api/session` selected project with the URL project, then use the formal select route | Web/CLI `selectedProjectId` is convenience state; the server session is authoritative for REST/Chat guards. Re-login does not clear an existing selection. |
| WebSocket connects to a URL project while REST/SSE reports that the project is not selected | Inspect upgrade membership and `chat:read`, plus the REST session's selected project | This is a current contract difference: WS does not call the selected-project guard, although broadcasts remain bucketed by URL project. WS success does not prove REST authorization. |
| A direct-`instanceId` Derived Metric read/write appears cross-project | Re-resolve the instance through trusted current-project `metricKey + entityId` lookup and Dashboard batch | The direct-id path in `derived_metric_read` and `record_sample` lacks a consistent project re-check. Stop using the suspect id and report the isolation gap; never expose metric values or edit SQLite manually. |
| Collector or STT API responds without a selected project | Inspect the actual route guard instead of applying the general project-route assumption | `/api/bms/collector/*` primarily checks the token; the STT route requires only a session. These are known permission boundaries and do not prove external data is tenant-isolated. |

For any suspected cross-project exposure, stop further reads, reduce evidence to anonymized project/instance identifiers, route, status, code, request id, and commit, then escalate through the security process. Never access another customer project merely to reproduce it.

## 7. Errors, degradation, and external dependencies

### 7.1 Provider and BMS

| Symptom | Check | Boundary / handling |
| --- | --- | --- |
| Chat fails when no LLM is configured | Confirm that there is no key and `BUILDING_AGENT_LLM_PROVIDER` is not explicitly `mock`; synchronous Chat normally returns `502 provider_error`, while SSE emits `error` and closes | This is expected fail-closed behavior. Set `BUILDING_AGENT_LLM_PROVIDER=mock` for offline development; use a trusted OpenAI-compatible endpoint for real calls. Fallback is opt-in and must never be silently represented as a product result. |
| A configured provider times out or returns 429/5xx | Record redacted provider code/status/model and request id, then inspect base URL, model, and network | The API retries some errors; when fallback is allowed, the result identifies mock mode and fallback reason. Do not record the key or a sensitive raw upstream response. |
| The BMS wizard fails while updating config, saving credentials, or importing points | Compare the method/path: `PATCH /sources/:id`, credentials, Excel analyze, point import/update, semantic suggest, and Web live-values have no baseline Fastify routes | Mark these **Planned**, not site incidents. Never temporarily persist credentials in the frontend, fixtures, or logs. See the complete matrix in [BMS integration](../features/bms-integration.md). |
| External source creation/listing succeeds, but details, connection testing, or ingestion later cannot find the source/job | Confirm pure `BMS_API_BASE_URL` mode and whether the local owner map contains the id | External create/list can forward today, but remote sources are not entered in the local owner cache; a later owner lookup can fail before forwarding. This is **Partial**; fabricating a local owner record is not a formal remedy. |
| Collector/enteliWEB/site values are unreachable | Check the Fastify proxy, collector URL, read-only point path, and external-service health separately | Mock validates a contract, not site accuracy or write capability. Treat all baseline BuildingAgent paths as read-only. |

### 7.2 Reports and FDD

| Symptom | Check | Boundary / handling |
| --- | --- | --- |
| Reports unit tests pass, but Web only has AutoReport or an API route is absent | Determine whether the caller uses `AutoReport.tsx`, the `apps/api/src/reports/**` library, or a Fastify route | Browser AutoReport aggregates Dashboards and calls `window.print()`; the server kernel is not assembled with REST, run records, scheduling, artifacts, or downloads. Neither path proves the other is available. |
| FDD catalog, evaluator, Task, or `/api/fdd/**` cannot be found on `main` | Verify the commit and the two baselines in [FDD overview](../fdd/overview.md) | This is the expected product boundary: `main` has only the Reports consumer contract for external `fdd_rule` evidence. Do not report absent M007 files as runtime corruption. |
| `198 / 59 / 111` or “52 FDD tests passed” is cited while current main has no corresponding files | Check whether the evidence is pinned to an unmerged M007 commit and a separate clean worktree | Counts and historical tests prove only a candidate snapshot. They are not a `main` API response, CI result, accuracy figure, or deployment guarantee. |

### 7.3 SSE, WebSocket, Scheduler, and STT

| Symptom | Check | Boundary / handling |
| --- | --- | --- |
| Recurring Chat SSE has a string `done` payload while normal Chat has an object | Record the event name and JSON type, then compare with a one-shot reminder/normal Chat | The recurring fast path stringifies before the common writer stringifies again; this is a known double-encoding gap. Do not mistake it for provider content or make a general client parse without limits. |
| A recurring reminder fires once, is missed during downtime, or disagrees with the right-hand task card | Inspect job recurrence/status, timer/ticker path, and whether the page still uses `MOCK_TASKS` | Recurring advance is only Partial; the task panel is not a Scheduler read model. Do not use it for critical alerts, SLAs, or exactly-once work. |
| WebSocket misses an event or has no history after reconnect | Check URL project, membership, `chat:read`, reconnect, and re-subscription | WS is a best-effort, in-process, single-instance channel without durable replay. Chat polling can recover persisted messages, but generic events are not assumed recoverable. |
| STT returns `stt_unavailable/stt_auth_failed/stt_failed` | Check browser microphone/secure context, WAV contents, body limit, `DASHSCOPE_API_KEY`, and external network in that order | STT has no deterministic mock, local model, or second-provider fallback; the helper currently fixes the Paraformer model. Never upload real recordings to reproduce a public issue. |

## 8. Extension guide

Record a new gap as the smallest executable issue instead of implying here that a compatibility layer exists. A useful evidence packet contains only: product commit, anonymous environment, exact method/path, expected/actual status and `error.code`, one redacted request id, minimum fixture, whether it reproduces in a clean worktree, and the suspected responsibility layer. For SSE/WS, add event name, order, and payload JSON type; for storage, add only directory category and non-sensitive counts.

Fixing a client/server contract requires a route, runtime validator, permission/project ownership checks, stable errors, and integration tests together; adding only a Web-client method is insufficient. A storage change must declare authority, migration, backup, project scope, and secret handling. Provider/BMS/STT adapters must expose the actual provider and fallback explicitly and never label mock as site success. Productizing Reports or FDD requires separate assembly and permission design, not copying unmerged candidate routes.

Documentation can correct a factual statement or status label. Any business-code, API, schema, CI, dependency, or data-migration change is outside M011 and needs a separate issue, branch, PR, and risk-proportionate verification.

## 9. Tests

| Symptom | Check | Boundary / handling |
| --- | --- | --- |
| Root `npm test` runs duplicate/stale tests or discovers `dist.predeploy-*` / `dist.prehotfix-*` | Inspect workspace directories for untracked `dist.pre*` backups and compare API, CLI, and Web collection separately | A root run in a dirty worktree is not a trustworthy baseline. Do not delete user backups for a test; use a clean worktree and the exact per-workspace commands below. |
| Tests touch real KB, project feedback, or local config | Inspect `BUILDING_AGENT_DATA_DIR`, SeedStore fixtures, CLI home, and working directory | Use temporary data/config roots. Do not point tests at customer material or active local state. Consider root `npm test` only in a clean environment without real local KB or backup dist directories. |
| The API gate has two bldg40-related failures on a clean checkout | Check whether each failure comes from a hard-coded KB Turtle/PNG fixture reference whose file is absent from the clean checkout | Those two cases pass 2/2 in a targeted rerun after controlled fixture setup; the complete API gate still retains 3 existing failures. Use only repository-public or one-off generated minimum fixtures, never customer KB, images, or outputs from the original worktree, and record the raw clean-checkout and controlled-fixture results separately. |
| The CLI gate passes only 8/9 | Use `--no-file-parallelism` for a stable result and inspect the authenticated-Chat test's provider contract | One current failure comes from the product failing closed with no provider/key while the test still expects successful Chat. Record it as an existing baseline failure; do not make the run appear green by changing the environment, test, or business code. |
| Web reports 0 collected with `--dir src` | Inspect the `include` in [vite.config.ts](../../../../apps/web/vite.config.ts) and use the workspace's plain `vitest run` | Web already limits include to `src/**/*.test.ts(x)`. Adding `--dir src` changes the Vitest root and was measured to collect no files; 0 collected is not a pass. |
| `npm run build` reports a Web chunk larger than 500 kB | Check the exit code, all three workspace builds, and completed artifacts first | This is a Vite bundle-size warning, not the current build failure. Performance work needs its own issue; the warning is not a passed performance acceptance. |
| Everything passes locally but the repository page shows no checks | Verify whether a GitHub Actions workflow actually exists | The baseline has no CI workflow. Report “local verification,” never “CI passed.” |
| Smoke Chat fails without credentials and still fails its Chat assertion with explicit mock | First ensure the script did not reuse an old API on the port, then compare provider metadata, fixed assistant text, and the prompt echo required by smoke | Product main fails closed without provider/key. Explicit mock reaches Chat and returns deterministic-mock metadata, but its `local_default` text is the fixed provider-unavailable message and does not echo the smoke prompt, so the final content assertion still fails. Record both outcomes honestly; explicit mock is not a smoke-pass recipe. |

Run the recommended set from the repository root in a clean worktree:

```bash
npm --workspace @building-agent/api exec -- vitest run --dir src
npm --workspace @building-agent/cli exec -- vitest run --dir src --no-file-parallelism
npm --workspace @building-agent/web exec -- vitest run
npm run typecheck
npm run build
npm run smoke
BUILDING_AGENT_LLM_PROVIDER=mock npm run smoke
```

The two smoke commands distinguish the “provider not configured” and “explicit-mock fixed reply” failure stages; neither is listed as an expected passing gate. Treat [Testing and verification](testing.md) as authoritative for command results, the existing baseline-failure set, and interpretation of candidate FDD tests. On failure, retain the test file/name, exit code, and redacted error; never upload `store.json`, SQLite, CLI config, `.env`, recordings, or customer fixtures. A passing test also cannot fill gaps in recurring behavior, STT, real WebSocket, external BMS, or the unassembled Reports API.

## 10. Known limitations and related documentation

- Contract/guard/runtime gaps on this page are not business-code fixes in M011. Their status can change after the baseline commit and must be rechecked.
- No provider key does not automatically select mock; explicit mock and opt-in fallback are different modes.
- The two data roots have no unified migration, transaction, or backup; CLI config, scheduler JSON, and caches also have separate lifecycles.
- Missing seven BMS client routes, the external-source owner cache, and Derived Metric direct-instance project checks are known gaps.
- Web AutoReport is not the server Reports kernel, and product-main FDD consumption is not the unmerged M007 producer/runtime.
- Recurring Scheduler behavior, SSE `done`, WS selected-project semantics, the static task panel, and STT provider/model behavior all have explicit limitations.
- The Web bundle-size warning is not yet a performance gate, and the repository has no actual CI workflow.

Continue with [Current implementation architecture](../architecture/current-architecture.md), [Runtime and storage topology](../architecture/runtime-storage.md), [REST, SSE, and WebSocket contracts](../architecture/api-events.md), [BMS integration](../features/bms-integration.md), [Derived Metrics and KPI](../features/derived-metrics-kpi.md), [Dashboards and Reports](../features/dashboards-reports.md), [Scheduler, Realtime, and STT](../features/scheduler-realtime-stt.md), and [FDD verification and sample provenance](../fdd/verification-provenance.md).
