---
id: T03
parent: S04
milestone: M001
key_files:
  - apps/cli/src/api.ts
  - apps/cli/src/commands.test.ts
  - scripts/smoke-local.cjs
key_decisions:
  - Added strict CLI-side parsing for chat:list and chat POST so malformed S04 chat payloads fail closed with api_malformed instead of printing incomplete or secret-bearing responses.
  - Changed smoke defaults to isolated API/Web ports and direct Web workspace invocation to avoid stale local dev servers while preserving the built CLI artifact path.
duration: 
verification_result: passed
completed_at: 2026-05-10T15:12:46.820Z
blocker_discovered: false
---

# T03: Proved CLI and smoke chat flows preserve provider fallback diagnostics and assistant responses without leaking secrets.

**Proved CLI and smoke chat flows preserve provider fallback diagnostics and assistant responses without leaking secrets.**

## What Happened

Added typed chat response parsing in the CLI API client for chat:list and chat POST. The parser now preserves user/assistant messages, provider id/mode/model/fallback metadata, requestId, and canonical API error envelopes while failing closed on malformed successful payloads. Expanded CLI command tests to prove default deterministic mock fallback metadata, assistant message preservation, secret redaction, malformed chat payload rejection, provider error requestId preservation, and existing auth/project error paths. Extended local smoke to assert default mock provider fallback diagnostics and to verify chat:list includes both the smoke user message and assistant response. During verification, an existing API server on the legacy default port returned stale pre-S04 chat payloads, so the smoke runner now uses isolated default ports and launches the Web workspace directly with an explicit port while still invoking the built CLI artifact at apps/cli/dist/apps/cli/src/index.js.

## Verification

Ran the task verification command in parts after the final code changes. `npm test -- --run apps/cli/src/commands.test.ts` passed 5 CLI tests, `npm run typecheck --workspace @building-agent/cli` passed with exit code 0, and `npm run smoke` built all workspaces, started isolated API/Web servers, exercised the built CLI artifact, confirmed provider fallback diagnostics on chat, confirmed chat:list user and assistant messages, and exited successfully.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm test -- --run apps/cli/src/commands.test.ts` | 0 | ✅ pass | 12350ms |
| 2 | `npm run typecheck --workspace @building-agent/cli` | 0 | ✅ pass | 0ms |
| 3 | `npm run smoke` | 0 | ✅ pass | 0ms |

## Deviations

Adjusted the smoke runner to use isolated default ports 3130/5174 and to invoke the Web workspace dev script directly so port forwarding is reliable; this preserves the verified built CLI artifact path and avoids stale local dev servers changing the smoke contract.

## Known Issues

None.

## Files Created/Modified

- `apps/cli/src/api.ts`
- `apps/cli/src/commands.test.ts`
- `scripts/smoke-local.cjs`
