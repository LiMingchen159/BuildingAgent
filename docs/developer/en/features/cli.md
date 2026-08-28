# CLI

[中文](../../zh-CN/features/cli.md) | [Developer documentation home](../README.md) | [Authentication, projects, and conversations](auth-projects-conversations.md) | [Chat and Agent Runtime](chat-agent-runtime.md)

> Product code baseline: `main@af44ff15`. Status: login, session inspection, project selection, synchronous Chat, and local configuration are **Implemented**; `registry` and `management` expose only `placeholderOnly: true` inventories and are therefore **Partial**. The CLI is a lightweight JSON client for the Fastify REST API. It has no browser UI, SSE, WebSocket, FDD, Dashboard, or report commands.

## 1. Status and code baseline

The CLI is the `@building-agent/cli` npm workspace, with `building-agent` as its compiled entry point. [`index.ts`](../../../../apps/cli/src/index.ts) passes process arguments to [`runCommand`](../../../../apps/cli/src/commands.ts); normal results are formatted JSON, while failures go to stderr with a non-zero exit code.

| Capability | Status | Fact boundary |
| --- | --- | --- |
| `login`, `session`, `projects`, `use` | **Implemented** | Call product REST APIs and persist the token, API URL, and selected project locally. |
| `chat`, `chat:list` | **Implemented** | Use synchronous JSON `POST/GET /chat`; they consume neither SSE streams nor WebSocket updates. |
| `registry`, `management` | **Partial** | Parse and require `placeholderOnly: true`; the provider/tool/skill/gateway/capability rows are placeholders, not callable runtime capabilities. |
| `config-path` and redacted diagnostics | **Implemented** | Show the configuration location; command output replaces the token with `[redacted]`. |
| Interactive shell, token revocation, streaming output, and other domain commands | **Planned** | Command dispatch is a fixed string branch, not a pluggable command registry. |

## 2. Purpose and boundaries

The CLI supplies a minimal control surface for scripts, smoke verification, and browserless environments: log in, enumerate projects, select one project, inspect placeholder registry/management data, and send or list Chat messages. It reuses server authorization and project isolation instead of duplicating business policy in the client.

It does not:

- start the API/Web services, administer databases, or install dependencies;
- let a browser session, cookie, or local project choice replace server authorization;
- consume SSE token/event streams, WebSocket updates, or background-task progress;
- provide BMS, Derived Metrics, Dashboard, Reports, Scheduler, STT, or FDD commands;
- encrypt, refresh, or revoke tokens, or act as an operating-system secret manager;
- promote placeholder registry entries into executable tools.

## 3. User and source entry points

In development, build the CLI first and invoke it through the workspace or the generated binary entry. Every command writes JSON only to stdout/stderr, making output suitable for scripts.

```bash
npm --workspace @building-agent/cli run build
node apps/cli/dist/index.js help
node apps/cli/dist/index.js login --email '<user@example.test>' --password '<password>' --api-url http://127.0.0.1:3000
node apps/cli/dist/index.js projects
node apps/cli/dist/index.js use '<project-id>'
node apps/cli/dist/index.js chat 'summarize the selected project'
```

| Entry | Role | Key source |
| --- | --- | --- |
| `help` / `--help` | Print the fixed command list. | [`commands.ts`](../../../../apps/cli/src/commands.ts) |
| `login --email --password [--api-url]` | Call `/api/login`, save the bearer token, and remove it from output. | [`commands.ts`](../../../../apps/cli/src/commands.ts), [`api.ts`](../../../../apps/cli/src/api.ts) |
| `session` | Read `/api/session` with complete auth config; otherwise return redacted config diagnostics only. | [`commands.ts`](../../../../apps/cli/src/commands.ts) |
| `projects` / `use <project-id>` | List member projects; save `selectedProjectId` after server selection succeeds. | [`api.ts`](../../../../apps/cli/src/api.ts) |
| `registry` / `management` | Validate placeholder registry or current-project management payloads. | [`registry.ts`](../../../../apps/cli/src/registry.ts) |
| `chat` / `chat:list` | Send or read messages synchronously for the selected project. | [`api.ts`](../../../../apps/cli/src/api.ts) |
| `config-path` | Return the CLI home and configuration-file paths. | [`config.ts`](../../../../apps/cli/src/config.ts) |

The `login` flag parser accepts both `--key value` and `--key=value`. It is not a general CLI framework: unknown positional arguments are usually ignored, except that `chat` joins every remaining argument with spaces into the message.

## 4. Normal data flow

1. `login` connects to `http://127.0.0.1:3000` by default or to an explicit `--api-url`; a successful server response must contain a non-empty token.
2. The CLI writes the API URL, token, and `lastCommand` to configuration, but removes the token from login output and redacts it in diagnostics.
3. `projects` reads member projects with the bearer token. `use` sends the target id to the server and updates local `selectedProjectId` only after selection succeeds.
4. `management`, `chat`, and `chat:list` first require a local token and selected project, then put the encoded project id into the URL. This only provides fast failure; the server still performs real authorization.
5. `chat` issues one synchronous JSON request. The CLI strictly validates the user/assistant messages, provider diagnostics, fallback flag, optional lifecycle, and request id before printing the response.
6. `login` and successful authenticated business commands update `lastCommand`; `help`, `config-path`, and the unauthenticated diagnostic form of `session` do not. Other failures best-effort record `lastCommand`, `lastErrorCode`, and optional `lastRequestId`; a diagnostics-write failure never replaces the original error.
7. The shell uses the exit code for success/failure. Callers should parse `error.code` instead of depending on English error text.

## 5. Data, state, and persistence

Configuration defaults to `.building-agent/config.json` under the user's home. `BUILDING_AGENT_CLI_HOME` can point the CLI home at an isolated directory; `config-path` returns the resolved absolute locations. Initial saves request mode `0700` for the directory and `0600` for the file.

| Field | Purpose | Sensitivity / lifecycle |
| --- | --- | --- |
| `apiUrl` | API origin; the saved value is not automatically checked for protocol or trusted host. | Persistent configuration; never point it at an untrusted service. |
| `token` | Bearer token for each protected request. | Plaintext local JSON; redacted from output, but not encrypted or keychain-backed. |
| `selectedProjectId` | Default project for project-scoped CLI commands. | Client convenience state, not an authorization credential. |
| `lastCommand` | Most recently run/attempted command. | Diagnostic state. |
| `lastErrorCode` / `lastRequestId` | Stable code and correlation id from the most recent failure. | Diagnostic state; a later success does not explicitly clear old error fields. |

The CLI does not store messages, registry results, or management results; the API and its stores remain authoritative. Configuration writes do not use atomic rename or a cross-process lock, so concurrent invocations can overwrite diagnostic state or project selection with the last writer.

## 6. Permissions and project isolation

`projects` and `registry` require a locally stored API URL/token. `management`, `chat`, and `chat:list` also require `selectedProjectId`. These are client preconditions only. The real boundary is the API's token, membership, and selected-project validation, described in [Authentication, projects, and conversations](auth-projects-conversations.md).

Do not interpolate a project id, token, or API URL from untrusted output into a shell command. Project ids are encoded in URL paths, but `apiUrl` only has trailing slashes removed; operators must trust the target and use protected transport outside local development. Copying the config file copies bearer authority and must be treated as sharing a secret.

`registry` is an authenticated global placeholder catalog; `management` uses the current-project URL. Both validate `placeholderOnly: true` and enum fields so callers cannot treat arbitrary server JSON as a formal capability, but this is not a fine-grained tool-permission model.

## 7. Errors, degradation, and external dependencies

| Failure | CLI behavior |
| --- | --- |
| Missing login or project selection | Return `auth_missing` or `project_not_selected` without a network request. |
| Missing arguments, blank Chat, or unknown command | Return `cli_usage`, `chat_invalid`, or `cli_unknown_command`. |
| Non-success HTTP response | Preserve server `error.code/message/requestId`; fall back to `api_error` when fields are missing. |
| Non-JSON or contract-invalid payload | Return `api_invalid_json` or `api_malformed` and fail closed. |
| Malformed config JSON or read/write failure | Raise `CliConfigError` with path diagnostics but no token. |
| Unavailable Chat provider | Preserve the server's `provider_error`; the CLI does not switch providers automatically. |

The current client has no explicit timeout, AbortSignal, retry, backoff, or offline queue; network hangs follow the underlying `fetch`/runtime. External dependencies are a reachable Fastify API and, for Chat, the provider selected by that API. Placeholder registry/management entries are not external-service health checks.

## 8. Extension guide

Add a command across four layers: place the narrowest HTTP operation on [`ApiClient`](../../../../apps/cli/src/api.ts); define and execute runtime shape validation for the response; add explicit auth/project preconditions in `execute`; then test success, server rejection, malformed payloads, and secret non-disclosure.

Keep stdout machine-readable JSON, send progress/debug output to stderr, and keep error codes stable. No command may print tokens, passwords, provider keys, or complete authentication headers. Adding SSE/WS requires dedicated parsers, cancellation/timeout, terminal-interrupt, and partial-output semantics rather than reuse of the current one-shot JSON reader.

Configuration-schema changes must continue rejecting non-string values for known fields, use an explicit allowlist for new sensitive fields, and consider atomic writes, cross-process locking, logout/revocation, and an OS keychain. The current parser ignores unknown fields; that compatibility behavior is not secret validation. Opening real registry tool invocation requires replacing the `placeholderOnly` server contract and permission model first; never merely loosen the client parser.

## 9. Tests

- [`commands.test.ts`](../../../../apps/cli/src/commands.test.ts): login, project, synchronous Chat/list, session, error-code/request-id, malformed-payload, provider-error, and secret non-disclosure checks against a real Fastify test server.
- [`config.test.ts`](../../../../apps/cli/src/config.test.ts): isolated home, read/write, shape validation, error diagnostics, and token redaction.
- [`registry.test.ts`](../../../../apps/cli/src/registry.test.ts): registry/management placeholder shapes, auth requirements, and malformed-payload fail-closed behavior.

There are 9 CLI tests under `src`. The uniform source-only command is:

```bash
npm --workspace @building-agent/cli exec -- vitest run --dir src
```

See [Testing and verification](../development/testing.md) for final milestone results. CLI tests start an API test server and write configuration under a temporary directory; new tests must preserve that isolation and never touch real user configuration.

## 10. Known limitations and related documentation

- The CLI has only nine fixed entry types (excluding help as a business operation), with no subcommand framework, interactive prompt, shell completion, or plugin discovery.
- Chat uses only the synchronous JSON endpoint; it cannot show incremental SSE token/tool/lifecycle events or receive WebSocket project updates.
- The local token is plaintext JSON with mode `0600`; there is no refresh, logout/revoke, keychain, or multi-profile support.
- Configuration save has no atomic rename/lock; concurrent commands may overwrite `selectedProjectId` or recent diagnostics.
- The HTTP client has no timeout/retry, and `apiUrl` has no TLS enforcement or allowlist.
- Registry/management are explicitly `placeholderOnly` and cannot prove provider, gateway, tool, or capability availability.
- There is no CLI control plane for BMS, Dashboards, Reports, Scheduler, STT, Derived Metrics, or FDD.

Continue with [REST, SSE, and WebSocket contracts](../architecture/api-events.md), [Chat and Agent Runtime](chat-agent-runtime.md), [Web workspace](web-workspace.md), and [Configuration and local development](../development/configuration.md).
