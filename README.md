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

### Demo flow

1. Open the Vite Web URL.
2. Sign in as `ada@example.test` / `local-dev-password`.
3. Select `Alpha Build` to enter the project-scoped chat workspace.
4. Send a message and verify it appears only in the selected project workspace.
5. Select/read-only or forbidden projects through the API to see request-id-bearing error banners.

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
  node apps/cli/dist/apps/cli/src/index.js session
```

CLI output is JSON and includes backend `requestId` values where the API provides them. Saved bearer tokens are redacted from command output and should not be copied into logs or documentation.

To prove the local API, Web UI proxy, and CLI agree on the same seeded contracts, run:

```bash
npm run smoke
```

The smoke runner builds all workspaces, probes or starts the API and Web dev servers, invokes the CLI through the workspace-linked built entrypoint, performs login → session → project selection → registry → management → chat checks, and cleans up child processes and the temporary CLI config directory on success, failure, or timeout. Its logs are prefixed with `[smoke]` stage markers plus child process exit codes so startup, reachability, CLI, and cleanup failures are easy to localize without printing auth material.

## Verification commands

```bash
npm test -- --run apps/api/src/auth.test.ts apps/api/src/chat.test.ts
npm test -- --run apps/web/src/App.test.tsx
npm run typecheck
npm run build
```

The Web tests mock `fetch` only at the network boundary so the React flow still exercises the real API client, guarded screens, error banners, and selected-project chat routing.
