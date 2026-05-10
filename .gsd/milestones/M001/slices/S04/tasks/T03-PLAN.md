---
estimated_steps: 10
estimated_files: 4
skills_used: []
---

# T03: Prove provider fallback through CLI and smoke

Align CLI chat behavior and the root smoke check with the new provider-backed chat contract while keeping default no-secret runs deterministic.

Skills expected: `api-design`, `observability`, `tdd`, `verify-before-complete`.

Steps:
1. Update `apps/cli/src/api.ts` and/or `apps/cli/src/commands.ts` only as needed so `chat` and `chat:list` preserve assistant messages, provider metadata, fallback flags, request ids, and canonical API errors in JSON output.
2. Update `apps/cli/src/commands.test.ts` to assert chat command output includes user message, assistant message, provider metadata, default fallbackUsed behavior, and no bearer/API-key/password leakage.
3. Extend `scripts/smoke-local.cjs` so `npm run smoke` asserts the built CLI chat command receives default mock fallback metadata and that chat:list includes both the smoke user content and an assistant response.
4. Keep the smoke runner using the verified built CLI artifact path from S03; do not require real provider credentials for the default smoke path.

Failure Modes (Q5): API provider error -> CLI surfaces canonical code/requestId; malformed chat payload -> CLI fails closed where parsing is added; missing selected project/auth remains existing CLI auth/project errors; smoke failure redacts provider/key/token-looking output.

Load Profile (Q6): per CLI chat is one API POST and JSON render; smoke starts live API/Web and invokes the built CLI, so increased provider latency is avoided in default mock mode.

Negative Tests (Q7): command test should cover fallback metadata, malformed/error response if parser is introduced, auth/project missing path preservation, and redaction of secret-like output.

## Inputs

- ``apps/cli/src/api.ts``
- ``apps/cli/src/commands.ts``
- ``apps/cli/src/commands.test.ts``
- ``scripts/smoke-local.cjs``
- ``apps/api/src/providers.ts``
- ``apps/api/src/server.ts``

## Expected Output

- ``apps/cli/src/api.ts``
- ``apps/cli/src/commands.ts``
- ``apps/cli/src/commands.test.ts``
- ``scripts/smoke-local.cjs``

## Verification

`npm test -- --run apps/cli/src/commands.test.ts && npm run smoke`

## Observability Impact

Extends CLI and smoke diagnostics with provider id/mode/fallback/requestId while preserving the existing redaction-safe smoke stage output.
