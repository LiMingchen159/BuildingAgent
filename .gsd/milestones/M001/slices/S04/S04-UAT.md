# S04: Provider-backed chat fallback remediation — UAT

**Milestone:** M001
**Written:** 2026-05-10T15:36:38.375Z

# S04 UAT — Provider-backed chat fallback remediation

## UAT Type

Contract/integration UAT for the authenticated local foundation. This UAT validates provider-selection behavior, deterministic fallback, assistant-message rendering, redaction-safe diagnostics, and Web/CLI/API coherence using local seeded auth and no committed secrets.

## Preconditions

1. Dependencies are installed with `npm install`.
2. No real provider secret is required for the default path. Leave `BUILDING_AGENT_LLM_API_KEY` unset for fallback tests.
3. Use the seeded local user credentials documented in README.
4. The API and Web are run locally or via `npm run smoke`, which starts/probes them automatically.

## Test Case 1 — API default no-secret fallback

1. Start the API locally without `BUILDING_AGENT_LLM_API_KEY`.
2. Log in as a seeded writable user.
3. Select an authorized project.
4. POST a valid message to `/api/projects/:projectId/chat`.

Expected outcomes:
- The response is successful and includes a `requestId`.
- The response includes both the submitted user message and an assistant message.
- Provider metadata includes non-secret provider id/mode/model where applicable.
- `fallbackUsed` is true, with an explicit fallback reason/status indicating the no-secret/mock path.
- No API key, bearer token, seeded password, raw env value, stack trace, or raw upstream provider body appears in the response.

## Test Case 2 — API authorization gates block provider invocation

1. Attempt chat POST without a bearer token.
2. Attempt chat POST with a user that has not selected the target project.
3. Attempt chat POST as a read-only user or a user without chat write permission.

Expected outcomes:
- Each request fails with the canonical request-id-bearing auth/permission error envelope.
- No assistant message is stored for denied requests.
- No provider/fallback call is observable for denied requests; auth/project/permission checks happen first.

## Test Case 3 — Configured real-provider selection contract

1. In a controlled test environment, provide non-secret fake/injected provider configuration equivalent to `BUILDING_AGENT_LLM_*` settings.
2. Submit a valid authenticated project chat message.

Expected outcomes:
- Provider selection prefers the configured real-provider adapter instead of default mock mode.
- Response metadata reports configured provider id/mode/model without secret material.
- If the fake provider succeeds, the assistant response is stored and returned.
- If fallback is explicitly disabled and the provider fails, the API returns a canonical provider error with request id rather than silently masking the failure.

## Test Case 4 — Web chat renders assistant and provider notice

1. Open the Web UI.
2. Log in with a seeded writable user.
3. Select an authorized project.
4. Send a chat message from the workspace.

Expected outcomes:
- The user message remains visible.
- The assistant response is rendered as an assistant message instead of being dropped.
- A provider/fallback notice is visible and uses redaction-safe metadata only.
- Existing navigation to registry/gateway/building-domain placeholder tabs remains available.

## Test Case 5 — CLI chat exposes provider metadata safely

1. Run CLI login against the local API.
2. Run CLI project list/use to select a project.
3. Run CLI chat with a valid message.

Expected outcomes:
- CLI output includes request id, assistant response, and provider/fallback metadata.
- CLI output does not print bearer tokens, provider API keys, raw env values, or seeded passwords.
- CLI denial/error paths preserve backend error codes and request ids.

## Test Case 6 — Smoke proves default no-secret path

1. Ensure provider credentials are not set in the shell used for smoke.
2. Run `npm run smoke`.

Expected outcomes:
- Workspaces build successfully.
- API and Web probes succeed.
- CLI login/session/projects/use/registry/management/chat/chat:list stages succeed.
- Smoke asserts deterministic provider fallback metadata in the chat stage.
- Smoke cleanup stops child processes and removes the temporary CLI home.

## Edge Cases

- Malformed or oversized chat messages should fail validation before provider invocation.
- Forged project ids or selected-project mismatches should fail with canonical request-id-bearing errors.
- Provider outage with fallback disabled should remain visible as a provider error rather than silently producing mock output.
- Provider outage with fallback allowed should include explicit fallback metadata so operators know a fallback was used.
- Redaction checks should reject committed real-looking provider keys, bearer tokens, passwords, or API-key literals outside documented seeded/test fixtures.

## Not Proven By This UAT

- Live third-party LLM behavior with real credentials, real billing/rate limits, or real network outages.
- Production authentication, SSO, non-loopback deployment, hardened CORS, or browser token hardening.
- Streaming responses, provider retries/backoff, observability metrics dashboards, or performance under load.
- Real building-domain analytics, real BIM/Brick/time-series integrations, or customer building data workflows.

