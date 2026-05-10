---
id: T02
parent: S03
milestone: M001
key_files:
  - apps/cli/src/api.ts
  - apps/cli/src/commands.ts
  - apps/cli/src/index.ts
  - apps/cli/src/commands.test.ts
  - apps/cli/src/config.ts
  - apps/cli/tsconfig.json
key_decisions:
  - Preserved backend error code/requestId envelopes by mapping non-2xx API responses into ApiClientError instead of wrapping them in local-only messages.
  - Persisted lastCommand, lastErrorCode, and lastRequestId in the CLI config so `building-agent session` can diagnose whether the last failure came from auth, project selection, or chat validation without exposing tokens.
duration: 
verification_result: mixed
completed_at: 2026-05-10T11:44:30.418Z
blocker_discovered: false
---

# T02: Wired the CLI login, session, project, registry, management, and chat commands to the real seeded API with persisted redaction-safe diagnostics.

**Wired the CLI login, session, project, registry, management, and chat commands to the real seeded API with persisted redaction-safe diagnostics.**

## What Happened

Implemented the real API-backed CLI path with a reusable ApiClient for login, session, projects, project selection, registry, management, chat send, and chat listing. Added command orchestration that stores the API URL and bearer token on login, reuses persisted auth and selected-project state across fresh invocations, redacts token output, records diagnostic failure state, and keeps canonical backend error codes/request ids intact for API failures. Replaced the scaffold entrypoint with the command runner and added integration-style CLI tests against a real Fastify API instance covering happy path, forbidden project selection, missing auth, blank chat input, and placeholder registry/management access.

## Verification

Ran the required focused CLI command test through the root test router; all 4 command tests passed against a real local Fastify API instance. Ran the CLI workspace TypeScript typecheck successfully. Attempted LSP diagnostics for the new API client file, but no TypeScript language server was available in the harness; typecheck covered static verification.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm test -- --run apps/cli/src/commands.test.ts` | 0 | ✅ pass | 16110ms |
| 2 | `npm --workspace @building-agent/cli run typecheck` | 0 | ✅ pass | 7154ms |
| 3 | `lsp diagnostics apps/cli/src/api.ts` | 1 | ❌ fail — no TypeScript language server found; covered by tsc typecheck | 0ms |

## Deviations

Adjusted the CLI tsconfig rootDir/include to allow the CLI command integration test to import the tracked API server fixture directly for realistic local API verification.

## Known Issues

LSP diagnostics could not run because no TypeScript language server is configured in this harness; CLI workspace typecheck passed instead. Existing npm audit findings from prior work were not addressed.

## Files Created/Modified

- `apps/cli/src/api.ts`
- `apps/cli/src/commands.ts`
- `apps/cli/src/index.ts`
- `apps/cli/src/commands.test.ts`
- `apps/cli/src/config.ts`
- `apps/cli/tsconfig.json`
