---
estimated_steps: 10
estimated_files: 4
skills_used: []
---

# T02: Render assistant replies and provider diagnostics in Web chat

Update the React/Vite Web client and chat workspace so assistant messages and provider fallback diagnostics are parsed and displayed safely.

Skills expected: `react-best-practices`, `frontend-design`, `observability`, `tdd`, `verify-before-complete`.

Steps:
1. Extend `apps/web/src/api.ts` chat types/parsers for `role: "user" | "assistant"`, `assistantMessage`, provider metadata, and fallback flags; fail closed with `api_malformed` on malformed S04 chat payloads instead of silently dropping assistant messages.
2. Update `apps/web/src/App.tsx` ChatWorkspace to append/render the assistant response after send, distinguish user vs assistant messages accessibly, and show a concise provider/fallback notice containing only provider id/mode/model/requestId/fallback reason.
3. Keep existing login/project-selection/management tabs intact; chat UI failures should preserve request-id-aware banners and must not render tokens or raw provider errors.
4. Update `apps/web/src/App.test.tsx` fixtures/assertions for assistant rendering, fallback/provider notice, malformed provider metadata handling, and preservation of existing authenticated workspace flow.

Failure Modes (Q5): API unavailable -> existing api_unavailable banner; malformed S04 response -> api_malformed banner; provider error envelope -> visible request id/code without token or API key; assistant missing -> fail closed rather than silently pretending chat succeeded.

Load Profile (Q6): shared resources are React state and rendered message list; per operation appends two messages and provider metadata; 10x growth is bounded by backend list size and should not introduce unbounded local duplication.

Negative Tests (Q7): malformed assistant role/provider metadata, missing assistantMessage on POST, provider notice with secret-looking fields in mock payload, and existing read-only/project-denial UI states.

## Inputs

- ``apps/web/src/api.ts``
- ``apps/web/src/App.tsx``
- ``apps/web/src/styles.css``
- ``apps/web/src/App.test.tsx``
- ``apps/api/src/providers.ts``
- ``apps/api/src/server.ts``

## Expected Output

- ``apps/web/src/api.ts``
- ``apps/web/src/App.tsx``
- ``apps/web/src/styles.css``
- ``apps/web/src/App.test.tsx``

## Verification

`npm test -- --run apps/web/src/App.test.tsx && npm run typecheck --workspace @building-agent/web`

## Observability Impact

Makes provider/fallback state inspectable in the Web chat surface through a redaction-safe notice and preserves requestId/error-code banners for malformed or failed provider responses.
