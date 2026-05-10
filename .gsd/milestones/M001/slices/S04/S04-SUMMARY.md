---
id: S04
parent: M001
milestone: M001
provides:
  - Validated R008 provider configuration skeleton and provider-backed chat contract for M001.
  - API/Web/CLI/smoke evidence that default local no-secret chat works deterministically without leaking secrets.
  - README instructions for configuring real-provider mode and understanding fallback behavior.
  - A redaction-safe observability pattern for future provider/runtime integrations.
requires:
  - slice: S01
    provides: Authenticated session/project/chat boundary and Web workspace shell consumed for provider-backed chat.
  - slice: S03
    provides: CLI auth/project/smoke path consumed for provider metadata and fallback smoke proof.
affects:
  - S05
key_files:
  - apps/api/src/providers.ts
  - apps/api/src/server.ts
  - apps/api/src/chat.test.ts
  - apps/api/src/providers.test.ts
  - apps/web/src/api.ts
  - apps/web/src/App.tsx
  - apps/web/src/styles.css
  - apps/web/src/App.test.tsx
  - apps/cli/src/api.ts
  - apps/cli/src/commands.ts
  - apps/cli/src/commands.test.ts
  - scripts/smoke-local.cjs
  - README.md
  - .gsd/PROJECT.md
key_decisions:
  - Chat provider behavior is real-provider-first when BUILDING_AGENT_LLM_* configuration exists, with deterministic mock fallback for no-secret local/CI smoke and explicitly allowed fallback conditions.
  - Provider invocation remains behind existing S01/S03 auth, selected-project, project-membership, and chat permission guards; unauthorized/read-only users cannot trigger provider calls.
  - Provider diagnostics expose only redaction-safe request/provider/fallback metadata and never raw provider config, API keys, bearer tokens, seeded passwords, stack traces, or raw upstream bodies.
  - Live external-provider verification is optional/env-gated; slice proof uses injected/fake provider behavior plus default no-secret smoke fallback to keep local and CI runs safe.
patterns_established:
  - Provider calls belong behind backend auth/project/permission guards, not in Web or CLI clients.
  - Provider selection must be explicit and diagnosable: configured real provider first, deterministic mock fallback only for no-secret/local smoke or allowed fallback conditions.
  - Provider diagnostics should be safe-by-construction and limited to request/provider/fallback metadata.
  - Chat clients must render assistant messages and provider metadata as first-class contract fields.
observability_surfaces:
  - API chat responses and provider errors carry requestId plus provider id/mode/model, fallbackUsed, and reason/status where non-secret.
  - Web chat shows assistant messages and provider/fallback notice so provider selection is visible to local evaluators.
  - CLI chat JSON output includes provider metadata for agent-readable diagnostics while redacting secrets.
  - Smoke emits stage markers, request ids, child process exit codes, and provider fallback assertions for the default no-secret path.
  - Redaction scan covered provider/chat/Web/CLI/smoke/README files and found no unallowed real-looking provider keys, bearer tokens, password/token/API-key literals beyond documented seeded/test fixtures.
drill_down_paths:
  - .gsd/milestones/M001/slices/S04/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S04/tasks/T02-SUMMARY.md
  - .gsd/milestones/M001/slices/S04/tasks/T03-SUMMARY.md
  - .gsd/milestones/M001/slices/S04/tasks/T04-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-05-10T15:36:38.365Z
blocker_discovered: false
---

# S04: Provider-backed chat fallback remediation

**S04 delivered real-provider-first, redaction-safe provider-backed chat with deterministic mock fallback across API, Web, CLI, smoke, and README.**

## What Happened

S04 converted the M001 chat path from a user-message-only local skeleton into an explicit provider-backed contract while preserving the authenticated project boundary established by S01 and the CLI/smoke coherence established by S03. The backend now owns a provider seam that selects an OpenAI-compatible real provider when BUILDING_AGENT_LLM_* configuration is present and otherwise uses a deterministic local mock fallback for no-secret local development, CI, and smoke. The project-scoped POST /api/projects/:projectId/chat path validates input and enforces bearer auth, selected project, project membership, and write permission before invoking any provider. It normalizes provider output, stores assistant messages with user messages, returns bounded chat history, and includes redaction-safe provider diagnostics with request ids.

The Web client was updated to understand the expanded chat contract instead of silently dropping non-user roles. It renders assistant replies and a provider/fallback notice in the existing protected workspace, so local users can see whether the deterministic fallback or a configured real provider answered. The CLI was aligned with the same API response shape and now prints provider metadata in JSON output while preserving token redaction and canonical backend error/request-id behavior. The smoke script proves the default no-secret path end-to-end through the built CLI and live API/Web services, asserting deterministic fallback metadata without requiring secrets.

Documentation now explains BUILDING_AGENT_LLM_* configuration, the default mock fallback, the explicit fallback policy, and the verification commands. Requirement R008 was validated because the provider abstraction exists, configured real-provider mode is preferred, mock fallback is constrained to local/no-secret or allowed-fallback conditions, and tests/smoke prove the behavior without committing secrets. R013 and R014 were advanced with provider-path launchability and README coverage evidence.

## Verification

Fresh S04 verification passed after the last file change set: `npm test -- --run apps/api/src/chat.test.ts apps/api/src/providers.test.ts apps/web/src/App.test.tsx apps/cli/src/commands.test.ts` passed 29 tests across API/CLI/Web; `npm run typecheck` passed API, CLI, and Web TypeScript checks; `npm run build` passed API, CLI, and Web production build; `npm run smoke` passed live API/Web/CLI no-secret fallback flow. Redaction scan via gsd_exec `360edfe8-f31f-4e09-92be-3ca957f287cb` passed with no unallowed real-looking provider key, bearer token, password, token, or API-key literal beyond documented seeded/test fixtures.

## Requirements Advanced

- R013 — S04 full verification proved provider-path launchability through tests/build/smoke, including no-secret deterministic fallback and fake-provider real-selection coverage.
- R014 — README now documents BUILDING_AGENT_LLM_* configuration, default mock fallback, explicit fallback policy, and verification commands; redaction scan included README.

## Requirements Validated

- R008 — Validated by S04 full verification: API provider/chat tests, Web chat tests, CLI command tests, typecheck, build, smoke, and redaction scan passed; backend prefers configured real-provider mode and uses deterministic mock fallback for no-secret/local smoke.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

None. Live external-provider calls were intentionally not required; the slice proves real-provider selection through injected/fake provider tests and keeps live credentials optional/env-gated for local safety.

## Known Limitations

No live third-party LLM call was performed because default M001 verification must not require secrets or network provider credentials. Provider adapter is OpenAI-compatible skeleton behavior suitable for future live validation, not a production resilience layer with retries, rate-limit budgets, streaming, or advanced telemetry.

## Follow-ups

S05 should reconcile requirement coverage now that R008 is validated and R013/R014 are advanced. Future live-provider acceptance should run with real credentials in a secret-managed environment before claiming production external LLM readiness. Before non-local/shared demos, retain previously noted seeded-auth/CORS hardening and avoid treating seeded local auth as production identity.

## Files Created/Modified

- `apps/api/src/providers.ts` — Provider port, deterministic mock fallback, OpenAI-compatible real-provider adapter/config selection, and redaction-safe provider diagnostics.
- `apps/api/src/server.ts` — Project-scoped chat path now invokes providers after auth/project/permission guards, stores assistant responses, returns bounded history, and emits request-id/provider metadata.
- `apps/api/src/chat.test.ts` — API tests covering provider selection, fallback, assistant message storage, auth/permission regression, and provider failure behavior.
- `apps/api/src/providers.test.ts` — Provider unit tests for configuration, real-provider selection, deterministic fallback, and redaction-safe error/metadata behavior.
- `apps/web/src/api.ts` — Typed Web API contract updated for assistant messages and provider diagnostics.
- `apps/web/src/App.tsx` — Web chat renders assistant messages and provider/fallback notices safely in the authenticated project workspace.
- `apps/web/src/styles.css` — Styling for assistant/provider diagnostic display.
- `apps/web/src/App.test.tsx` — Web tests for assistant rendering, provider/fallback notices, and regression coverage in the main flow.
- `apps/cli/src/api.ts` — CLI API contract updated for provider-backed chat response metadata.
- `apps/cli/src/commands.ts` — CLI chat output now includes assistant/provider metadata without printing secrets.
- `apps/cli/src/commands.test.ts` — CLI command tests for provider metadata, fallback output, and redaction behavior.
- `scripts/smoke-local.cjs` — Smoke path asserts deterministic default no-secret provider fallback through built CLI/live API/Web.
- `README.md` — README documents BUILDING_AGENT_LLM_* configuration, real-provider-first behavior, mock fallback policy, and verification commands.
- `.gsd/PROJECT.md` — Project context refreshed to include S04 current state and provider-backed chat patterns.
