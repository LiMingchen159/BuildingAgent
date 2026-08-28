# BuildingAgent

BuildingAgent is a TypeScript/npm-workspaces platform for project-scoped building operations. Its React/Vite Web workspace and Node CLI use a Fastify API to combine conversational agent workflows with knowledge, repository, BMS, FDD, KPI, dashboard, report, scheduling, realtime, and speech capabilities. Some capabilities are complete, some are partial, and some remain target architecture; the developer documentation records those boundaries against a named code baseline.

## Developer documentation

- [中文开发者文档](docs/developer/zh-CN/README.md)
- [English developer documentation](docs/developer/en/README.md)
- [Language selector / 语言选择](docs/developer/README.md)

The repository includes public local-development fixtures, such as `example.test` users, deterministic mock responses, and seeded tokens/passwords. They are examples only—not production credentials. Never commit real API keys, bearer tokens, BMS passwords, private service URLs, or customer data; use environment variables and redacted placeholders.

## Local development

### Seeded users

Production auth and SSO are out of scope for this slice. There are no anonymous Web or API paths beyond `/health`; use one of the local seeded accounts:

| User | Email | Password | Authorized projects |
| --- | --- | --- | --- |
| Ada Lovelace | `ada@example.test` | `local-dev-password` | `Alpha Build` read/write, `Beta Build` read-only |
| Grace Hopper | `grace@example.test` | `local-dev-password` | `Gamma Build` read/write |

Seeded bearer tokens exist only for local fixture behavior and should not be logged or reused for production auth.

### API authentication for integrations

Call `POST /api/login` once with email and password. The response includes a long-lived `token` (`tokenType: "Bearer"`, `expiresAt` or `null`). Reuse that token on every request via `Authorization: Bearer <token>`. Do not call `/api/login` before each API call.

`GET /api/session` is optional for bootstrapping; bearer validation on protected routes is a read-only lookup and does not rewrite session state. Re-login does not clear the selected project. Set `BUILDING_AGENT_TOKEN_TTL_DAYS=0` for non-expiring newly issued `ba_*` tokens (default TTL is 90 days for new API tokens only; seeded `seed-token-*` values never expire).

### Install and run

```bash
npm install
npm run dev:api
npm run dev:web
```

The API runs on `http://127.0.0.1:3000` by default. The Web app runs through Vite and proxies `/api` and `/health` to the local API. To point the browser client at a different API origin, set `VITE_API_BASE_URL` for the Web dev server.

### Chat provider configuration

Project chat does not silently select a mock merely because credentials are absent. For deterministic, no-secret local development, select the mock explicitly:

```bash
BUILDING_AGENT_LLM_PROVIDER=mock npm run dev:api
```

Configure a real OpenAI-compatible provider only in environments that already have provider credentials available:

```bash
BUILDING_AGENT_LLM_PROVIDER=openai-compatible
BUILDING_AGENT_LLM_BASE_URL=https://provider.example/v1
BUILDING_AGENT_LLM_API_KEY=<provider-api-key>
BUILDING_AGENT_LLM_MODEL=<provider-model>
```

`BUILDING_AGENT_LLM_PROVIDER` accepts `mock` or `openai-compatible`. `BUILDING_AGENT_LLM_BASE_URL` defaults to the OpenAI-compatible API base URL when omitted, and `BUILDING_AGENT_LLM_MODEL` defaults to the built-in chat model name when omitted. The `BUILDING_AGENT_LLM_*` names are preferred for new configuration; legacy OpenAI-compatible env names remain supported for local compatibility.

Provider selection and failure semantics are explicit:

- `BUILDING_AGENT_LLM_PROVIDER=mock`: chat succeeds through the deterministic mock provider with `fallbackUsed: true` and `fallbackReason: "local_default"`.
- No usable API key with fallback disabled or unset: chat returns the canonical `provider_error` envelope; the underlying provider state is `provider_not_configured`.
- No usable API key with `BUILDING_AGENT_LLM_ALLOW_FALLBACK=true`: chat falls back to the deterministic mock after the configuration error, with a non-secret fallback reason such as `provider_not_configured`.
- Real provider configured and healthy: chat uses the configured provider with `mode: "real"` and `fallbackUsed: false`.
- Real provider configured and failing: chat returns the canonical API error envelope by default.
- Real provider configured and failing with `BUILDING_AGENT_LLM_ALLOW_FALLBACK=true`: chat falls back to the deterministic mock provider and includes a non-secret `fallbackReason` such as `provider_request_failed`.

Do not put real keys, bearer tokens, seeded passwords, raw provider config, or provider error bodies in docs, issue comments, Web screenshots, CLI logs, smoke output, or test fixtures. API chat responses, Web notices, CLI JSON, and smoke logs may expose only redaction-safe diagnostics: `requestId`, provider `id`, `mode`, `model`, `fallbackUsed`, and provider status or fallback reason.

### Demo flow

1. Open the Vite Web URL.
2. Sign in as `ada@example.test` / `local-dev-password`.
3. Select `Alpha Build` to enter the project-scoped chat workspace.
4. Send a message and verify it appears only in the selected project workspace.
5. Check the chat provider notice for `requestId`, provider mode/model, and fallback status without any secret values.
6. Select/read-only or forbidden projects through the API to see request-id-bearing error banners.

### CLI and smoke path

Build the workspaces before invoking the CLI directly. The CLI persists its local config under your home directory by default; set `BUILDING_AGENT_CLI_HOME` when you want an isolated throwaway config directory.

```bash
npm run build
BUILDING_AGENT_CLI_HOME=/tmp/building-agent-cli \
  node apps/cli/dist/apps/cli/src/index.js login \
  --email ada@example.test \
  --password local-dev-password \
  --api-url http://127.0.0.1:3000
BUILDING_AGENT_CLI_HOME=/tmp/building-agent-cli \
  node apps/cli/dist/apps/cli/src/index.js use project_alpha
BUILDING_AGENT_CLI_HOME=/tmp/building-agent-cli \
  node apps/cli/dist/apps/cli/src/index.js registry
BUILDING_AGENT_CLI_HOME=/tmp/building-agent-cli \
  node apps/cli/dist/apps/cli/src/index.js management
BUILDING_AGENT_CLI_HOME=/tmp/building-agent-cli \
  node apps/cli/dist/apps/cli/src/index.js chat "What should we build first?"
BUILDING_AGENT_CLI_HOME=/tmp/building-agent-cli \
  node apps/cli/dist/apps/cli/src/index.js chat:list
```

CLI output is JSON and includes backend `requestId` values where the API provides them. Chat command output also includes the redaction-safe provider diagnostics described above. Saved bearer tokens are redacted from command output and should not be copied into logs or documentation.

To exercise the local API, Web UI proxy, CLI, and deterministic no-secret chat path, select the mock explicitly:

```bash
BUILDING_AGENT_LLM_PROVIDER=mock npm run smoke
```

The smoke runner inherits provider environment variables; it does not set mock mode itself. It builds all workspaces, probes or starts the API and Web dev servers, invokes the CLI through the workspace-linked built entrypoint, performs login → session → project selection → registry → management → chat checks, and cleans up child processes and the temporary CLI config directory on success, failure, or timeout. Its assertions specifically expect `deterministic-mock` with `fallbackReason: "local_default"`, so it is not a real-provider smoke test. On the documented baseline, the flow reaches a successful Chat response but the runner then fails because it expects the mock answer to echo the input while the mock returns a fixed unavailable message. Treat this command as a known-gap reproducer until that contract is fixed. Logs are prefixed with `[smoke]` stage markers plus child process exit codes without printing auth material.

## Verification commands

Run the source-directed regression from a clean worktree at the repository root:

```bash
npm --workspace @building-agent/api exec -- vitest run --dir src
npm --workspace @building-agent/cli exec -- vitest run --dir src --no-file-parallelism
npm --workspace @building-agent/web exec -- vitest run
npm run typecheck
npm run build
```

Using `--dir src` prevents API/CLI Vitest from collecting local `dist.pre*` backup trees; CLI file parallelism is disabled because its files share SQLite state. Web already limits discovery through Vite's `src/**/*.test.*` include, and adding `--dir src` from the Web workspace currently collects zero tests. The Web tests mock `fetch` only at the network boundary so the React flow still exercises the real API client, guarded screens, error banners, selected-project chat routing, assistant replies, and provider diagnostics.

The current API and CLI suites retain documented failures, and the explicit-mock smoke retains the final text-assertion failure described above. Reproduce smoke separately with:

```bash
BUILDING_AGENT_LLM_PROVIDER=mock npm run smoke
```

See the bilingual [testing guide](docs/developer/en/development/testing.md) for exact counts, fixture cautions, and the complete failing-test names.

Validate a real provider manually through Web or CLI Chat instead; `npm run smoke` intentionally asserts the mock provider contract. Never put provider credentials or raw upstream error bodies in the command transcript.
