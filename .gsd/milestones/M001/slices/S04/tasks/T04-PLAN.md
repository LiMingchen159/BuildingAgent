---
estimated_steps: 8
estimated_files: 1
skills_used: []
---

# T04: Document provider configuration and run full verification

Document the provider configuration/fallback contract and run the full S04 verification suite before marking the slice complete.

Skills expected: `write-docs`, `verify-before-complete`.

Steps:
1. Update `README.md` with the S04 provider env contract: `BUILDING_AGENT_LLM_PROVIDER=mock|openai-compatible`, `BUILDING_AGENT_LLM_BASE_URL`, `BUILDING_AGENT_LLM_API_KEY`, `BUILDING_AGENT_LLM_MODEL`, and optional `BUILDING_AGENT_LLM_ALLOW_FALLBACK=true` if implemented.
2. Explain default no-secret behavior, real-provider-first behavior when credentials are configured, explicit fallback/error semantics, and the no-secret policy for Web/CLI/API/smoke output using placeholder values only.
3. Add verification instructions for focused API/Web/CLI tests, typecheck, build, smoke, and optional manual real-provider smoke when env vars are present; do not require credentials for default CI/local verification.
4. Run the full slice verification commands and a simple redaction scan over touched source/docs; fix any failures before completion.

Negative Tests (Q7): documentation examples must not contain real-looking API keys or bearer tokens; verification commands must be executable from the repo root; optional provider instructions must be clearly env-gated and not required for default smoke.

## Inputs

- ``README.md``
- ``apps/api/src/providers.ts``
- ``apps/api/src/server.ts``
- ``scripts/smoke-local.cjs``

## Expected Output

- ``README.md``

## Verification

`npm test -- --run apps/api/src/chat.test.ts apps/api/src/providers.test.ts apps/web/src/App.test.tsx apps/cli/src/commands.test.ts && npm run typecheck && npm run build && npm run smoke`

## Observability Impact

Documents how future agents inspect provider mode/fallback/requestId across API, Web, CLI, and smoke without exposing secrets.
