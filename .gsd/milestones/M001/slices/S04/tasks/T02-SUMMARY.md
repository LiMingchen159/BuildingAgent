---
id: T02
parent: S04
milestone: M001
key_files:
  - apps/web/src/api.ts
  - apps/web/src/App.tsx
  - apps/web/src/styles.css
  - apps/web/src/App.test.tsx
key_decisions:
  - Fail closed on malformed S04 chat POST payloads, including missing assistant replies or malformed provider metadata, before appending any chat messages.
  - Render provider diagnostics from a strict allowlist of id/mode/model/fallback reason/requestId and ignore extra raw provider fields that could contain secrets.
duration: 
verification_result: mixed
completed_at: 2026-05-10T15:01:01.359Z
blocker_discovered: false
---

# T02: Rendered assistant chat replies with redaction-safe provider diagnostics and fail-closed Web parsing for malformed S04 payloads.

**Rendered assistant chat replies with redaction-safe provider diagnostics and fail-closed Web parsing for malformed S04 payloads.**

## What Happened

Extended the Web API parser to accept user and assistant chat roles, parse the S04 assistantMessage/provider/fallback contract, and throw api_malformed for missing or malformed chat response pieces. Updated the chat workspace to append the user and assistant turns together only after a fully valid POST response, distinguish assistant/user messages with accessible article labels, and display a compact provider diagnostics notice containing only redaction-safe fields. Added styles for assistant replies and the diagnostics notice. Expanded Web tests to cover assistant rendering, fallback/provider notice display, secret-field non-rendering, malformed assistant/provider metadata fail-closed behavior, provider error envelopes with request ids, and existing authenticated workspace/read-only flows.

## Verification

Ran the slice task verification commands: `npm test -- --run apps/web/src/App.test.tsx` passed 12 Web Vitest tests, including new assistant/provider diagnostics and negative cases; `npm run typecheck --workspace @building-agent/web` completed with TypeScript exit code 0. LSP diagnostics were attempted before editing but no language server is configured in this environment, so the workspace typecheck is the authoritative diagnostics substitute.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm test -- --run apps/web/src/App.test.tsx` | 0 | ✅ pass | 60874ms |
| 2 | `npm run typecheck --workspace @building-agent/web` | 0 | ✅ pass | 7306ms |
| 3 | `lsp diagnostics apps/web/src/App.tsx apps/web/src/api.ts apps/web/src/App.test.tsx` | 1 | ❌ fail — no language server found; covered by TypeScript typecheck | 0ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `apps/web/src/api.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/App.test.tsx`
