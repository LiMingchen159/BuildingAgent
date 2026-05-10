---
id: T01
parent: S04
milestone: M001
key_files:
  - apps/api/src/providers.ts
  - apps/api/src/server.ts
  - apps/api/src/seed.ts
  - apps/api/src/chat.test.ts
  - apps/api/src/providers.test.ts
key_decisions:
  - Introduced a deep ChatProvider port with deterministic mock fallback and an OpenAI-compatible fetch adapter instead of a vendor SDK.
  - Preserved canonical API error envelopes for non-fallback provider failures and only exposes redaction-safe provider diagnostics in successful fallback responses.
duration: 
verification_result: mixed
completed_at: 2026-05-10T14:50:53.186Z
blocker_discovered: false
---

# T01: Wired provider-backed chat through the API with deterministic fallback and redaction-safe diagnostics.

**Wired provider-backed chat through the API with deterministic fallback and redaction-safe diagnostics.**

## What Happened

Added the provider-backed chat contract at the API boundary. `apps/api/src/providers.ts` now defines the provider port, deterministic local mock fallback, OpenAI-compatible fetch adapter, provider-error normalization, and redaction-safe metadata. `buildServer` now accepts provider/env/fetch injection for deterministic tests while defaulting to process env, and POST /chat now authenticates and authorizes before provider invocation, stores bounded user/assistant turns, rolls back unsafe user writes on non-fallback provider failures, and returns requestId/provider/fallback diagnostics. Tests cover default local fallback, configured real-provider preference, provider HTTP/malformed failures, explicit fallback metadata, denial paths that must not invoke the provider, invalid messages, bounded two-message turns, and secret redaction.

## Verification

Ran the slice verification command successfully: `npm test -- --run apps/api/src/chat.test.ts apps/api/src/providers.test.ts && npm run typecheck --workspace @building-agent/api`. It passed 11 targeted Vitest tests and the API TypeScript typecheck. LSP diagnostics were attempted for `apps/api/src/server.ts`, but no language server is configured in this environment; the TypeScript typecheck is the authoritative diagnostics substitute.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm test -- --run apps/api/src/chat.test.ts apps/api/src/providers.test.ts && npm run typecheck --workspace @building-agent/api` | 0 | ✅ pass | 20536ms |
| 2 | `lsp diagnostics apps/api/src/server.ts` | 1 | ❌ fail — no language server found; covered by TypeScript typecheck | 0ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `apps/api/src/providers.ts`
- `apps/api/src/server.ts`
- `apps/api/src/seed.ts`
- `apps/api/src/chat.test.ts`
- `apps/api/src/providers.test.ts`
