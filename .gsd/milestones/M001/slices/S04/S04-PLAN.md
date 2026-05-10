# S04: Provider-backed chat fallback remediation

**Goal:** Remediate chat so the authenticated project-scoped chat path prefers a configured real model provider, falls back deterministically for local/no-secret smoke runs, and exposes redaction-safe provider diagnostics consistently through API, Web, CLI, smoke, and README.
**Demo:** After this, chat has explicit provider-selection behavior: it prefers a configured real provider when credentials/configuration exist, retains a deterministic local/mock fallback for smoke and no-credential runs, and Web/CLI/API tests prove both paths without leaking secrets.

## Must-Haves

- Must-haves:
- R008 is directly advanced: backend chat has an extensible provider configuration skeleton, prefers configured real provider mode, and uses mock fallback only for no-credential/local-smoke or explicitly allowed fallback conditions.
- Existing S01/S03 auth, project membership, selected-project, and chat permission guards run before any provider invocation; unauthorized/read-only users cannot trigger provider calls.
- Chat messages support assistant responses; POST /api/projects/:projectId/chat stores and returns both user and assistant messages with bounded history.
- Provider metadata is redaction-safe and includes requestId, provider id/mode/model where non-secret, fallbackUsed, and reason/status without exposing tokens, passwords, API keys, or raw env.
- Web chat renders assistant messages and provider/fallback notice instead of silently dropping non-user roles.
- CLI chat output and smoke assertions prove provider metadata and deterministic fallback in default no-secret runs.
- README documents BUILDING_AGENT_LLM_* configuration, default mock fallback, optional real-provider mode, explicit fallback policy, and verification commands.
- Threat Surface:
- Abuse: forged project ids, selected-project mismatch, read-only users, malformed/oversized messages, configured-provider outage, and retry/fallback confusion must not bypass existing S01 guards or hide real-provider failure without explicit fallback.
- Data exposure: bearer tokens, seeded passwords, API keys, raw provider env, stack traces, and broad user/project objects must never enter provider prompts, responses, CLI output, Web notices, logs, README examples, or tests.
- Input trust: user chat content is untrusted and reaches the provider adapter only after validation and authorization; adapter responses are untrusted and must be normalized before storage/rendering.
- Requirement Impact:
- Requirements touched: R008 owned by this slice; R013 and R014 supported; R002/R004/R009 are regression-sensitive because chat, project isolation, and Web workspace behavior change.
- Re-verify: API chat/auth/project-denial tests, Web app chat tests, CLI command tests, typecheck, build, and smoke.
- Decisions honored/revisited: D005 real-provider-first with mock fallback; D006 seeded local auth; D009 vertical-slice priority; D010 placeholder registry remains separate from live chat runtime; D011 provider contract.
- Verification:
- `npm test -- --run apps/api/src/chat.test.ts apps/api/src/providers.test.ts`
- `npm test -- --run apps/web/src/App.test.tsx apps/cli/src/commands.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm run smoke`
- A redaction scan over `apps/api/src/providers.ts`, `apps/api/src/chat.test.ts`, `apps/web/src/App.test.tsx`, `apps/cli/src/commands.test.ts`, `scripts/smoke-local.cjs`, and `README.md` finds no committed real-looking provider key, bearer token, or password beyond documented seeded fixtures.
- Observability / Diagnostics:
- Runtime signals: requestId on chat responses/errors, provider id/mode/model, fallbackUsed, and fallback reason/status.
- Inspection surfaces: API POST/GET chat payloads, Web chat provider notice, CLI JSON output, and smoke stage assertions.
- Failure visibility: provider configuration errors and upstream failures either return canonical request-id-bearing provider error envelopes or explicit mock fallback metadata when fallback is allowed.
- Redaction constraints: never expose BUILDING_AGENT_LLM_API_KEY, Authorization headers, seeded passwords, or raw provider error bodies that may contain secret material.

## Proof Level

- This slice proves: Integration contract proof across API, Web, CLI, and smoke. Tests use injected/fake provider behavior to prove real-provider selection and deterministic fallback without live network credentials; npm run smoke proves the no-secret local path through the built CLI and live API/Web services.

## Integration Closure

Consumes S01/S03 authenticated chat, selected-project, CLI, and smoke contracts and wires a new backend provider seam into the existing POST /api/projects/:projectId/chat runtime path. This slice delivers contract/integration proof with injected fake providers and default smoke fallback; live external-provider proof remains optional/env-gated because default CI and local smoke must not require secrets.

## Verification

- Chat POST responses and clients should expose requestId plus non-secret provider id/mode/model/fallback reason so failures can be localized without logging API keys, bearer tokens, seeded passwords, or raw provider config. Provider failure handling must preserve canonical API error envelopes when fallback is not allowed and explicit fallback metadata when it is used.

## Tasks

- [x] **T01: Wire provider-backed chat contract into the API** `est:2h`
  Introduce the backend provider port, deterministic mock fallback, OpenAI-compatible real-provider adapter selection, and the extended chat response contract.
  - Files: ``apps/api/src/providers.ts``, ``apps/api/src/server.ts``, ``apps/api/src/seed.ts``, ``apps/api/src/chat.test.ts``, ``apps/api/src/providers.test.ts``
  - Verify: `npm test -- --run apps/api/src/chat.test.ts apps/api/src/providers.test.ts && npm run typecheck --workspace @building-agent/api`

- [x] **T02: Render assistant replies and provider diagnostics in Web chat** `est:1.5h`
  Update the React/Vite Web client and chat workspace so assistant messages and provider fallback diagnostics are parsed and displayed safely.
  - Files: ``apps/web/src/api.ts``, ``apps/web/src/App.tsx``, ``apps/web/src/styles.css``, ``apps/web/src/App.test.tsx``
  - Verify: `npm test -- --run apps/web/src/App.test.tsx && npm run typecheck --workspace @building-agent/web`

- [x] **T03: Prove provider fallback through CLI and smoke** `est:1h`
  Align CLI chat behavior and the root smoke check with the new provider-backed chat contract while keeping default no-secret runs deterministic.
  - Files: ``apps/cli/src/api.ts``, ``apps/cli/src/commands.ts``, ``apps/cli/src/commands.test.ts``, ``scripts/smoke-local.cjs``
  - Verify: `npm test -- --run apps/cli/src/commands.test.ts && npm run smoke`

- [x] **T04: Document provider configuration and run full verification** `est:45m`
  Document the provider configuration/fallback contract and run the full S04 verification suite before marking the slice complete.
  - Files: ``README.md``
  - Verify: `npm test -- --run apps/api/src/chat.test.ts apps/api/src/providers.test.ts apps/web/src/App.test.tsx apps/cli/src/commands.test.ts && npm run typecheck && npm run build && npm run smoke`

## Files Likely Touched

- `apps/api/src/providers.ts`
- `apps/api/src/server.ts`
- `apps/api/src/seed.ts`
- `apps/api/src/chat.test.ts`
- `apps/api/src/providers.test.ts`
- `apps/web/src/api.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/App.test.tsx`
- `apps/cli/src/api.ts`
- `apps/cli/src/commands.ts`
- `apps/cli/src/commands.test.ts`
- `scripts/smoke-local.cjs`
- `README.md`
