# Configuration and local run

[中文](../../zh-CN/development/configuration.md) | [Developer documentation home](../README.md) | [Runtime and storage topology](../architecture/runtime-storage.md)

> Product code baseline: `main@af44ff15`. Status: npm workspaces, local API/Web/CLI entry points, root `.env` loading, and the explicit mock provider are **Implemented**; real LLM, BMS collector/management service, enteliWEB, and STT are **External**; unified configuration validation, production identity/secret management, and multi-instance storage are **Planned**.

## 1. Status and code baseline

The repository is one root npm workspace containing `@building-agent/api`, `@building-agent/web`, and `@building-agent/cli`. Root scripts only orchestrate workspaces. Runtime configuration remains distributed across API environment variables, Vite build variables, and per-user CLI configuration; there is no single configuration schema or complete preflight validation.

| Capability | Status | Baseline fact |
| --- | --- | --- |
| Root dependency installation and workspace build/typecheck/test orchestration | **Implemented** | Root [package.json](../../../../package.json) declares three workspaces; the committed lock is npm lockfile v3. |
| API hot reload and root `.env` loading | **Implemented** | [index.ts](../../../../apps/api/src/index.ts) starts `tsx watch` and reads the first available `.env` with a small `KEY=value` parser. |
| Vite Web dev server and local proxy | **Implemented** | [vite.config.ts](../../../../apps/web/vite.config.ts) proxies `/api`, `/health`, and `/bms` by default. |
| CLI build, local JSON configuration, and redacted diagnostics | **Implemented** | The CLI has no watch/dev script; build it before invoking its generated Node entry point. |
| Deterministic mock Chat | **Implemented and explicitly selected** | `BUILDING_AGENT_LLM_PROVIDER=mock` selects it directly; the absence of a key does not select mock. |
| LLM, embedding, BMS, enteliWEB, and STT | **External / Partial** | This repository implements adapters or proxies; networks, credentials, protocols, and authoritative data belong to external systems. |
| Production configuration and secret management | **Planned** | There is no centralized secrets manager, configuration schema, startup connectivity gate, or per-project provider credential store. |

The main fact sources checked for this page are [.env.example](../../../../.env.example), root and workspace `package.json` files, [providers.ts](../../../../apps/api/src/providers.ts), [server.ts](../../../../apps/api/src/server.ts), [persistence.ts](../../../../apps/api/src/persistence.ts), [knowledgeBase.ts](../../../../apps/api/src/agent/knowledgeBase.ts), and [CLI config.ts](../../../../apps/cli/src/config.ts).

## 2. Purpose and scope

This page gives the smallest trustworthy path from a clean checkout to a local API, Web app, and CLI. It also says which component reads each value, which data root it affects, and whether failure degrades. It is a development and verification guide, not a production deployment guide.

This page does not promise that:

- local SeedStore, SQLite, and JSON files support multiple instances, rolling container updates, or disaster recovery;
- repository seed accounts, tokens, or BMS demo defaults are suitable for a real environment;
- setting one BMS URL fills the client-declared endpoints that Fastify has not implemented;
- the absence of an LLM key silently produces a mock answer;
- a Vite dev proxy, plaintext HTTP, or the local CLI token file meets production networking and secret-management requirements;
- `BUILDING_AGENT_KNOWLEDGE_BASE_DIR` moves every project file, or `BUILDING_AGENT_DATA_DIR` moves `apps/data/store.json`.

A production deployment still needs at least TLS/reverse proxying, separate identity and secret management, persistent volumes/backups, log redaction, source allowlists, health gates, and an explicit CORS policy.

## 3. User and source entry points

### 3.1 Prerequisites and installation

- Node.js **20 or newer**; root `engines.node` is the only hard runtime-version constraint.
- npm with workspace support. The repository commits `package-lock.json`, so prefer `npm ci` in a clean environment.
- Network access needed to install packages and reach optional providers/collectors. If the platform has no prebuilt `better-sqlite3` binary, a native build toolchain is also required.
- Free default ports: API `127.0.0.1:3000`, Vite usually `127.0.0.1:5173`, and optional local BMS collector `127.0.0.1:8765`.

Run from the repository root:

~~~bash
npm ci
~~~

Use `npm install` only when intentionally changing the dependency graph or lockfile. `.env.example` is a variable inventory plus public fixtures, not a production configuration to copy unchanged. Put actual local values in the Git-ignored root `.env` or inject them through the process environment.

### 3.2 Workspaces and run entry points

| Command | Actual action | Note |
| --- | --- | --- |
| `npm run dev` / `npm run dev:api` | Runs the API's `tsx watch src/index.ts` | Root `dev` starts **only the API**, not the Web app in parallel. |
| `npm run dev:web` | Starts the Vite dev server | Relative `/api` and `/health` requests proxy to `127.0.0.1:3000` by default. |
| `npm run build` | Builds every workspace that has a build script | Web runs TypeScript checking plus the Vite bundle; CLI/API write their `dist` trees. |
| `npm run typecheck` | Runs `tsc --noEmit` for all three workspaces | It starts no service and proves no external connectivity. |
| `npm test` | Uses [run-tests.cjs](../../../../scripts/run-tests.cjs) to orchestrate workspace Vitest | Extra `dist.pre*` trees in a dirty checkout may be discovered; the trustworthy API, CLI, and Web argument sets differ, as Section 9 explains. |
| `npm run smoke` | Builds, then attempts the main API, Web, and CLI path | It logs in, selects a project, and writes Chat data; a baseline mock-text assertion mismatch prevents it from being a green gate. |

The CLI output entry is `apps/cli/dist/apps/cli/src/index.js` because its TypeScript `rootDir` covers both CLI source and reused API types. See [CLI](../features/cli.md) for commands and local state.

### 3.3 Configuration sources

| Configuration domain | Reader |
| --- | --- |
| API host, port, and root `.env` | [apps/api/src/index.ts](../../../../apps/api/src/index.ts) |
| Chat provider, fallback, retries, and redaction | [apps/api/src/providers.ts](../../../../apps/api/src/providers.ts), [apps/api/src/server.ts](../../../../apps/api/src/server.ts) |
| Embedding adapter | [apps/api/src/embeddingProvider.ts](../../../../apps/api/src/embeddingProvider.ts) |
| Project data root and KB/Repository | [apps/api/src/agent/knowledgeBase.ts](../../../../apps/api/src/agent/knowledgeBase.ts) |
| Fixed SeedStore path | [apps/api/src/persistence.ts](../../../../apps/api/src/persistence.ts) |
| BMS management, collector, and enteliWEB | [apps/api/src/bmsCollectorUrl.ts](../../../../apps/api/src/bmsCollectorUrl.ts), [apps/api/src/elementEnteliConfig.ts](../../../../apps/api/src/elementEnteliConfig.ts), [apps/api/src/server.ts](../../../../apps/api/src/server.ts) |
| Vite API/BMS public prefix | [apps/web/src/api.ts](../../../../apps/web/src/api.ts), [apps/web/src/bmsCollectorClient.ts](../../../../apps/web/src/bmsCollectorClient.ts) |
| CLI home, token, and selected project | [apps/cli/src/config.ts](../../../../apps/cli/src/config.ts) |

## 4. Normal data flow

### 4.1 Local path with an explicit mock

Run from the repository root in two terminals:

~~~bash
# Terminal 1: deterministic local Chat; no external LLM call.
BUILDING_AGENT_LLM_PROVIDER=mock \
BUILDING_AGENT_LLM_ALLOW_FALLBACK=false \
npm run dev:api

# Terminal 2: keep VITE_API_BASE_URL unset to use the committed same-origin dev proxy.
npm run dev:web
~~~

The API listens on `http://127.0.0.1:3000` by default. Open the URL printed by Vite; `GET /health` is an API startup probe. After login, a user must select a project for which they have membership before writing project Chat.

The CLI has no dev script:

~~~bash
npm --workspace @building-agent/cli run build
BUILDING_AGENT_CLI_HOME=/tmp/building-agent-cli-dev \
  node apps/cli/dist/apps/cli/src/index.js help
~~~

`BUILDING_AGENT_CLI_HOME` changes only the CLI configuration path, not API data roots. Do not put a real CLI home containing a bearer token in a shared directory.

### 4.2 `.env` and process-environment precedence

The API searches several locations relative to the compiled entry point or current directory for root `.env` and reads the **first file it can open**. Its parser supports only trimmed `KEY=value` lines; it does not implement shell `export`, quote removal, variable expansion, multiline values, or inline comments. A key already present in `process.env` wins and is not overwritten by `.env`.

Consequently:

1. values injected by a shell, container, or service manager override root `.env`;
2. restart the API after changing `.env`; do not assume every module hot-reloads configuration;
3. server-only keys must not use the `VITE_` prefix, because Vite exposes `VITE_*` values to the browser bundle;
4. the default Vite proxy expects relative browser URLs. If `VITE_API_BASE_URL` targets another origin, current Fastify does not enable CORS, so a same-origin reverse proxy or external CORS layer is required;
5. the CLI does not treat root `.env` as account state; it persists API URL, token, and selected project in its own JSON.

### 4.3 Actual Chat-provider selection semantics

| Configuration | Actual behavior |
| --- | --- |
| `BUILDING_AGENT_LLM_PROVIDER=mock` | Selects deterministic mock immediately and ignores a real provider key; response diagnostics include `mode: mock`, `fallbackUsed: true`, and `fallbackReason: local_default`. |
| `openai-compatible` (or no explicit provider) plus a non-empty key | Uses the OpenAI-compatible `/chat/completions` adapter; model/base URL come from configuration or code defaults. |
| No key and fallback disabled | The resolver returns a `provider-not-configured` adapter; Chat fails when invoked and does not auto-mock. The sync route returns `502 provider_error` and the stream emits an error event. |
| No key and `BUILDING_AGENT_LLM_ALLOW_FALLBACK=true` | The first provider call fails with `provider_not_configured`, after which the Chat path explicitly switches to deterministic mock. |
| Real provider failure and fallback disabled | After retries are exhausted, the route surfaces a structured provider failure and does not retain the incomplete user turn. |
| Real provider failure and fallback enabled | It logs redacted diagnostics, then runs mock with the failure code as `fallbackReason`. |

The “leave the key empty to use fallback” comment in [.env.example](../../../../.env.example) holds because the same file explicitly sets `BUILDING_AGENT_LLM_ALLOW_FALLBACK=true`. It is **not** the default behavior of `resolveChatProvider({})`. For deterministic offline development, select `BUILDING_AGENT_LLM_PROVIDER=mock` directly instead of relying on a failed call followed by fallback.

Minimal placeholder configuration for a real provider:

~~~bash
BUILDING_AGENT_LLM_PROVIDER=openai-compatible
BUILDING_AGENT_LLM_BASE_URL=https://provider.example/v1
BUILDING_AGENT_LLM_API_KEY=<provider-api-key>
BUILDING_AGENT_LLM_MODEL=<provider-model>
BUILDING_AGENT_LLM_ALLOW_FALLBACK=false
~~~

Prefer `BUILDING_AGENT_LLM_*` for new configuration; `LLM_*`, `OPENAI_*`, and `CHAT_PROVIDER_*` are compatibility aliases. Embeddings may override with `BUILDING_AGENT_EMBEDDING_API_KEY`, `BUILDING_AGENT_EMBEDDING_BASE_URL`, and `BUILDING_AGENT_EMBEDDING_MODEL`; otherwise they reuse the LLM key/base URL and built-in model name. Without an embedding key, vector calls return `null`. Grounding can still use FTS/keyword paths, but dense retrieval did not run.

## 5. Data, state, and persistence

### 5.1 Two data roots and local state

| State | Default location | Configuration and recovery semantics |
| --- | --- | --- |
| SeedStore | `apps/data/store.json` (plus `.bak`/`.tmp`) | The path is fixed by `persistence.ts`; `BUILDING_AGENT_DATA_DIR` **does not change it**. Saves are single-process and best effort. |
| Project data root | `data/**` | `BUILDING_AGENT_DATA_DIR` takes precedence, with `DATA_DIR` compatibility; relative paths resolve against the repository root. |
| Project KB/Repository | `data/<projectId>/kb/**` and `repository/**` | The API creates project directories; index results enter SeedStore, but the files remain source material. |
| SQLite and runtime records | `data/{session_index,grounding_index,derived_metrics}.db`, `scheduled_jobs.json`, Memory, and logs | Only databases explicitly identified as indexes are rebuildable; Derived Metrics/Memory/schedules are not generally disposable. |
| Legacy/general KB root | `Knowledge Base` by default | `BUILDING_AGENT_KNOWLEDGE_BASE_DIR` (or `KNOWLEDGE_BASE_DIR`) primarily controls the general KB resolver/default child-process cwd; project KB APIs still use `<dataRoot>/<projectId>/kb`. |
| BMS temporary uploads | `.temp/bms-config/<projectId>/**` | There is no TTL/cleanup job and project data-root overrides do not control it. |
| CLI configuration | `<home>/.building-agent/config.json` | `BUILDING_AGENT_CLI_HOME` isolates it; it contains a plaintext bearer token and requests `0600` on write. |

See [runtime and storage topology](../architecture/runtime-storage.md) for authoritative, index, and cache classifications.

### 5.2 Runtime and external-service variables

| Variable | Owner | Purpose and boundary |
| --- | --- | --- |
| `HOST` / `PORT` | API | Defaults to `127.0.0.1` / `3000`. Using `0.0.0.0` expands network exposure and requires firewall/TLS/proxy controls. |
| `VITE_API_BASE_URL` | Web build/dev | Browser API base; empty by default for same-origin use. It is not a server secret. |
| `VITE_BMS_PUBLIC_BASE` | Web build/dev | Optional external `/bms` prefix without BuildingAgent auth; Fastify does not implement this public route. |
| `BUILDING_AGENT_TOKEN_TTL_DAYS` | API auth | New tokens default to 90 days; `0` disables automatic expiry. Seed-token lifecycle differs. |
| `BUILDING_AGENT_TIMEZONE` | Agent temporal context | Defaults to `Asia/Hong_Kong`; Scheduler still follows server-local date/time semantics. |
| `BUILDING_AGENT_LLM_*` | API | Chat provider, key, base URL, model, and opt-in fallback. Values apply to the API instance, not per project. |
| `BUILDING_AGENT_EMBEDDING_*` | API | Optional OpenAI-compatible embedding adapter for Grounding dense retrieval. |
| `BMS_API_BASE_URL` | API | External BMS source/ingestion **management service**; this is not the collector. |
| `USE_MOCK_BMS_CLIENT` | API | `true`/`1`/`yes` enables the in-process BMS-management mock; it is not site data. |
| `BMS_DATABASE_API_URL` | API | Base URL for the read-only collector and Element bridge; some collector helpers default to local `:8765` when unset. |
| `ELEMENT_ENTELI_BASE_URL` / `ELEMENT_ENTELI_USERNAME` / `ELEMENT_ENTELI_PASSWORD` | API | enteliWEB live read; compatibility aliases exist. Code defaults are public demo fixtures, not production credentials. |
| `DASHSCOPE_API_KEY` | API STT | Without it, `POST /api/stt/transcribe` returns `503 stt_unavailable`. Never send it to the browser. |
| `ALIYUN_STT_MODEL` | API STT | The route reads this value, but the baseline helper still fixes the realtime model; it is not effective model selection yet. |

### 5.3 Public fixtures versus real secrets

Committed `example.test` users, seed passwords/tokens, deterministic mock text, `data/project_*` examples, and code-level BMS demo defaults are **public local fixtures**. They support reproducible tests; they prove neither identity security, site connectivity, nor production authorization.

Real LLM/embedding/STT keys, BuildingAgent bearer tokens, BMS/enteliWEB passwords, private service addresses, customer point catalogs, KB files, and exports are secrets or customer data. Inject them only through a controlled server-side environment/secret store. Never commit them to `.env`, `.env.example`, documentation, issues, screenshots, browser variables, CLI output, or test fixtures. `.env` is Git-ignored but remains a plaintext file, not a secret manager.

## 6. Authorization and project isolation

Local startup does not disable authorization. `/health` is a health probe and `/api/login` bootstraps identity; protected resources still require a bearer token. Most project resources then check membership, the selected project, and `chat:read`/`chat:write`/`project:configure`. Seed accounts are local fixtures only; see [authentication, projects, and conversations](../features/auth-projects-conversations.md).

Environment configuration is **process-scoped**, not project-scoped: one API instance's LLM, embedding, STT, and BMS credentials are shared by every project that can reach the corresponding route/tool. A future per-project provider must add encrypted server storage, authorization, audit, and selection rules. A browser-supplied arbitrary key/base URL must never become active directly.

Preserve these current boundaries as well:

- `VITE_*` values are visible to anyone who can download the bundle and must never contain a server credential;
- the CLI token is plaintext in user configuration; copying that file copies bearer capability;
- `/api/bms/collector/*` currently checks a token but is not fully project-isolated;
- the STT route requires a valid session but has no project id or equivalent `chat:write` API guard;
- physical project-id directories for BMS/KB files do not replace server membership, permission, and safe-path checks.

## 7. Errors, degradation, and external dependencies

| Failure | Current behavior | Operator action |
| --- | --- | --- |
| Root `.env` not found | API reports that it will use host environment only and can still listen. | Gate each required external capability explicitly; listening does not mean a provider is configured. |
| Unsupported LLM provider | Server construction throws `provider_unsupported` and the API may fail to start. | Use only `mock` or `openai-compatible`; implement and test an adapter before adding another id. |
| Missing LLM key | Provider invocation raises `provider_not_configured`; only the fallback flag permits mock. | Select mock explicitly for offline development and disable fallback for real verification to prevent false success. |
| LLM HTTP/network/response failure | Retriable failures receive the initial request plus up to four retries, then an error or opt-in mock. | Troubleshoot with redacted code/requestId/provider diagnostics, never key/header data. |
| No embedding key or embedding failure | `embedText` returns `null` without crashing the API. | Treat dense retrieval as unavailable; do not substitute a zero vector as success. |
| No BMS management URL | Management paths return `503 bms_unavailable`, while collector helpers may still try the local default port. | Check management and collector health separately. |
| No STT key | Returns `503 stt_unavailable`; there is no local/mock fallback. | Disable/hide voice entry or configure the external service. |
| Missing/corrupt SeedStore JSON | A persistent startup falls back to the seed store. | This can conceal damage; back up and inspect the file rather than treating seed fallback as recovery. |
| SeedStore write failure | Best-effort warning; a request does not necessarily fail. | Monitor logs/disk and do not equate HTTP success with a durable commit. |
| Web targets cross-origin API | Current Fastify CORS is disabled, so the browser may block the call. | Use the Vite same-origin proxy locally and a controlled reverse proxy/CORS layer in production. |
| Corrupt/unwritable CLI configuration | Returns a `CliConfigError` with paths but no token. | Repair through an isolated home; do not paste real configuration content into logs. |

See [BMS integration](../features/bms-integration.md) and [Scheduler, Realtime, and STT](../features/scheduler-realtime-stt.md) for deeper degradation semantics.

## 8. Extension points

Before adding configuration, define its owner (API/Web/CLI), scope (instance/project/user), sensitivity, default, required/optional status, failure mode, reload semantics, and test-injection path. A server secret belongs in an environment or secret provider without a `VITE_` prefix; the browser receives only public base paths/feature flags. Update [.env.example](../../../../.env.example) and this page with blank/safe examples, never real values.

Prefer a pure resolver/validator for each domain and inject its result from the composition root; do not keep reading the same env key independently in routes, tools, and UI. A new LLM/STT/BMS adapter needs timeout, cancellation, redacted errors, health checks, and a deterministic fake, with fallback explicitly opt-in or opt-out. Provider reachability and permission for a project to use it are separate checks.

New persistent configuration must reuse one of the two existing data roots and declare authority, migration, backup, and concurrency semantics; do not introduce another implicit cwd-relative root. To make the SeedStore path configurable, first change the fixed path in `persistence.ts` with migration/conflict detection. Do not assume `BUILDING_AGENT_DATA_DIR` already covers it.

## 9. Tests

Direct configuration tests include:

- Chat provider selection, retries, and redaction: [apps/api/src/providers.test.ts](../../../../apps/api/src/providers.test.ts)
- Embedding overrides/fallback: [apps/api/src/embeddingProvider.test.ts](../../../../apps/api/src/embeddingProvider.test.ts)
- Token TTL: [apps/api/src/authTokens.test.ts](../../../../apps/api/src/authTokens.test.ts)
- BMS adapter/proxy: [apps/api/src/bms.test.ts](../../../../apps/api/src/bms.test.ts), [apps/api/src/bmsCollectorProxy.test.ts](../../../../apps/api/src/bmsCollectorProxy.test.ts)
- CLI home, intended file permissions, and redaction: [apps/cli/src/config.test.ts](../../../../apps/cli/src/config.test.ts)

Use the following workspace-specific arguments from the repository root; do not apply one `--dir src` pattern to all three. Run smoke separately to reproduce its known gap:

~~~bash
npm --workspace @building-agent/api exec -- vitest run --dir src
npm --workspace @building-agent/cli exec -- vitest run --dir src --no-file-parallelism
npm --workspace @building-agent/web exec -- vitest run
npm run typecheck
npm run build
# Known baseline failure; run separately to capture the exact stage.
BUILDING_AGENT_LLM_PROVIDER=mock npm run smoke
~~~

The API uses `--dir src` to bound discovery. The CLI also needs `--no-file-parallelism` to avoid concurrent shared state, but the latest runs under both provider configurations are **8/9**, so it is not currently a green gate; see [testing and verification](testing.md) for the complete failing name, environment, and results. Web already limits discovery to `src/**/*.test.ts(x)` in Vite configuration and should use workspace-default Vitest. Adding `--dir src` collects **0** tests, and “0 collected” is not a pass.

`npm run smoke` does not set mock itself. It inherits provider environment from the calling shell and expects Chat to report deterministic mock. The baseline script also asserts that the mock assistant text contains `Smoke check from CLI`, while `createDeterministicMockProvider("local_default")` returns a fixed provider-unavailable message without echoing the input. Even with explicit mock, smoke therefore fails at the Chat-text assertion. Record this inconsistency as a later engineering issue; this documentation milestone changes neither script nor provider.

If services are already reachable on `3130`/`5174`, the runner reuses them, so their existing configuration and state affect the result. Smoke also writes Chat/project state; use a clean worktree or disposable instance. `BUILDING_AGENT_DATA_DIR` isolates only the project data root, not fixed `apps/data/store.json`.

Root `npm test` lets each workspace use default Vitest discovery; untracked `dist.predeploy-*`/`dist.prehotfix-*` trees or real local KB data can be swept in. Formal records must use each workspace's arguments above and report collected counts, complete failing names, and exit codes. See [testing and verification](testing.md) for actual results, the allowed historical failure set, and documentation gates.

## 10. Known limitations and related documentation

- There is no centralized configuration schema, startup required-value gate, dynamic reload, or configuration-source diagnostics endpoint; parsing is distributed across modules.
- The `.env` parser is not a dotenv/shell parser, silently skips missing files, and uses only the first readable candidate.
- The empty-key comment in [.env.example](../../../../.env.example) depends on enabling fallback in the same file; a keyless resolver does not default to mock.
- Root `npm run dev` starts only the API; Web requires a second process and CLI requires a build.
- Current Fastify CORS is disabled; cross-origin `VITE_API_BASE_URL` use needs an external network layer.
- Neither `BUILDING_AGENT_DATA_DIR` nor `BUILDING_AGENT_KNOWLEDGE_BASE_DIR` moves SeedStore, and BMS temporary uploads have another fixed path.
- The repository contains public seed credentials and BMS demo defaults. They are not secrets, but a production deployment must not inherit them.
- STT key/model variables are absent from [.env.example](../../../../.env.example), and `ALIYUN_STT_MODEL` does not yet control the helper model.
- Provider/BMS/STT credentials are API-instance global, without project-scoped secrets, rotation, or an audit loop.
- CLI currently runs 8/9 under both provider configurations; adding `--dir src` to Web collects zero tests, so neither case may be reported as a green gate.
- Smoke requires deterministic mock to echo the input, but the current mock returns fixed text and cannot satisfy that assertion, so it is not a green baseline.

Continue with [current implementation](../architecture/current-architecture.md), [runtime and storage topology](../architecture/runtime-storage.md), [CLI](../features/cli.md), [BMS integration](../features/bms-integration.md), [testing and verification](testing.md), and [troubleshooting and known contract gaps](troubleshooting.md).
