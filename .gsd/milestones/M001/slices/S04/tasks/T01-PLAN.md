---
estimated_steps: 11
estimated_files: 5
skills_used: []
---

# T01: Wire provider-backed chat contract into the API

Introduce the backend provider port, deterministic mock fallback, OpenAI-compatible real-provider adapter selection, and the extended chat response contract.

Skills expected: `design-an-interface`, `api-design`, `observability`, `tdd`, `verify-before-complete`.

Steps:
1. Add a deep provider module (for example `apps/api/src/providers.ts`) with `ChatProvider`, provider metadata/result types, `resolveChatProvider(env, options)`, deterministic mock provider, and OpenAI-compatible HTTP adapter using built-in `fetch` instead of a vendor SDK.
2. Extend `buildServer` options in `apps/api/src/server.ts` to accept an injected chat provider/resolver or env/fetch hooks for deterministic tests while defaulting to process env.
3. Update `ChatMessage` in `apps/api/src/seed.ts` to allow `role: "user" | "assistant"`; POST /chat must validate and store the user message, invoke provider only after auth/project/selected-project/chat:write checks, normalize/store the assistant message, trim bounded history, and return `{ message, assistantMessage, provider, fallbackUsed, requestId }` with status 201.
4. Preserve GET /chat shape additively by returning both user and assistant messages plus requestId/limit; do not make registry placeholder provider fixtures imply live provider status.
5. Add or update tests in `apps/api/src/chat.test.ts` and a focused `apps/api/src/providers.test.ts` for default mock fallback, configured real-provider preference via fake fetch/provider, provider failure semantics, no provider call before denial paths, bounded two-message turns, malformed/oversized input, and metadata redaction.

Failure Modes (Q5): provider env incomplete -> deterministic mock fallback only in no-credential/local default; configured real provider HTTP error/timeout/malformed JSON -> canonical provider error unless explicit fallback is allowed; adapter response with invalid text -> normalized provider error without storing unsafe assistant content.

Load Profile (Q6): shared resources are in-memory message arrays and outbound provider calls; per chat POST is one provider completion plus two message writes; 10x load first stresses external provider rate limits and in-memory transcript growth, so retain existing maxChatMessages trimming and avoid unbounded prompt/history.

Negative Tests (Q7): auth_missing/auth_invalid/project_forbidden/project_not_selected/permission_denied must not invoke provider; blank/oversized/non-string messages fail 422; fake real provider failure and malformed response produce non-secret diagnostics; configured fallback path returns explicit fallbackUsed metadata.

## Inputs

- ``apps/api/src/server.ts``
- ``apps/api/src/seed.ts``
- ``apps/api/src/chat.test.ts``
- ``apps/api/src/registry.test.ts``

## Expected Output

- ``apps/api/src/providers.ts``
- ``apps/api/src/server.ts``
- ``apps/api/src/seed.ts``
- ``apps/api/src/chat.test.ts``
- ``apps/api/src/providers.test.ts``

## Verification

`npm test -- --run apps/api/src/chat.test.ts apps/api/src/providers.test.ts && npm run typecheck --workspace @building-agent/api`

## Observability Impact

Adds the backend provider diagnostics contract: requestId, provider id/mode/model, fallbackUsed, fallback reason/status, and redaction-safe provider error handling.
