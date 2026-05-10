# BuildingAgent

BuildingAgent is currently a local development vertical slice: a Fastify API plus a React/Vite Web UI that exercise seeded authentication, project membership, and project-scoped chat.

## S01 local run

### Seeded users

Production auth and SSO are out of scope for this slice. There are no anonymous Web or API paths beyond `/health`; use one of the local seeded accounts:

| User | Email | Password | Authorized projects |
| --- | --- | --- | --- |
| Ada Lovelace | `ada@example.test` | `local-dev-password` | `Alpha Build` read/write, `Beta Build` read-only |
| Grace Hopper | `grace@example.test` | `local-dev-password` | `Gamma Build` read/write |

Seeded bearer tokens exist only for local fixture behavior and should not be logged or reused for production auth.

### Install and run

```bash
npm install
npm run dev:api
npm run dev:web
```

The API runs on `http://127.0.0.1:3000` by default. The Web app runs through Vite and proxies `/api` and `/health` to the local API. To point the browser client at a different API origin, set `VITE_API_BASE_URL` for the Web dev server.

### Chat provider configuration

Project chat works without any external credentials. When no provider credentials are configured, or when the provider is explicitly set to `mock`, the API uses a deterministic local mock provider. That default path is what local smoke and CI verification use.

Configure a real OpenAI-compatible provider only in environments that already have provider credentials available:

```bash
BUILDING_AGENT_LLM_PROVIDER=openai-compatible
BUILDING_AGENT_LLM_BASE_URL=https://provider.example/v1
BUILDING_AGENT_LLM_API_KEY=<provider-api-key>
BUILDING_AGENT_LLM_MODEL=<provider-model>
```

`BUILDING_AGENT_LLM_PROVIDER` accepts `mock` or `openai-compatible`. `BUILDING_AGENT_LLM_BASE_URL` defaults to the OpenAI-compatible API base URL when omitted, and `BUILDING_AGENT_LLM_MODEL` defaults to the built-in chat model name when omitted. The `BUILDING_AGENT_LLM_*` names are preferred for new configuration; legacy OpenAI-compatible env names remain supported for local compatibility.

Provider failure semantics are explicit:

- No credentials, or `BUILDING_AGENT_LLM_PROVIDER=mock`: chat succeeds through the deterministic mock provider with `fallbackUsed: true` and `fallbackReason: "local_default"`.
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

To prove the local API, Web UI proxy, CLI, and default no-secret chat provider agree on the same seeded contracts, run:

```bash
npm run smoke
```

The smoke runner builds all workspaces, probes or starts the API and Web dev servers, invokes the CLI through the workspace-linked built entrypoint, performs login → session → project selection → registry → management → chat checks, and cleans up child processes and the temporary CLI config directory on success, failure, or timeout. Its logs are prefixed with `[smoke]` stage markers plus child process exit codes so startup, reachability, CLI, provider fallback, and cleanup failures are easy to localize without printing auth material.

## Verification commands

Default verification never requires provider credentials and must be run from the repository root:

```bash
npm test -- --run apps/api/src/chat.test.ts apps/api/src/providers.test.ts
npm test -- --run apps/web/src/App.test.tsx apps/cli/src/commands.test.ts
npm run typecheck
npm run build
npm run smoke
```

The full S04 gate can also be run as one command:

```bash
npm test -- --run apps/api/src/chat.test.ts apps/api/src/providers.test.ts apps/web/src/App.test.tsx apps/cli/src/commands.test.ts && npm run typecheck && npm run build && npm run smoke
```

The Web tests mock `fetch` only at the network boundary so the React flow still exercises the real API client, guarded screens, error banners, selected-project chat routing, assistant replies, and provider diagnostics.

If real provider env vars are already available in your shell, you may run an optional manual smoke against that provider. This is not required for CI or local default verification, and examples must use placeholders rather than real credentials.

```bash
BUILDING_AGENT_LLM_PROVIDER=openai-compatible \
BUILDING_AGENT_LLM_BASE_URL=https://provider.example/v1 \
BUILDING_AGENT_LLM_API_KEY=<provider-api-key> \
BUILDING_AGENT_LLM_MODEL=<provider-model> \
npm run smoke
```
