# S02: Registry skeletons, placeholder gateways, and management pages

**Goal:** Extend the S01 authenticated local Web/API foundation with bounded, placeholder-only registry and project management surfaces. An authenticated user with a selected authorized project can inspect runtime providers, tools, skills, gateway placeholders, and synthetic building-domain capabilities through real backend listings and real Web management pages, without introducing any live external integrations.
**Demo:** After this, an authenticated user can inspect real placeholder pages and backend listings for runtime providers, skills, tools, gateways, and building-domain capabilities without exposing real external integrations.

## Must-Haves

- ## Must-Haves
- Backend exposes bounded, authenticated placeholder registry listings for runtime providers, tools, and skills; responses include `limit`, `placeholderOnly`, and `requestId`, reuse canonical S01 error envelopes, and do not require a selected project for global platform registry inspection.
- Backend exposes bounded, selected-project placeholder management listings for gateways and synthetic building-domain capabilities; access requires valid bearer auth, project membership, selected project match, and `chat:read` as the current read permission proxy for local management inspection.
- Web UI adds real management navigation/panels after project selection, fetches the new backend contracts through `apps/web/src/api.ts`, renders placeholder-only labels/statuses for registry, gateway, and building-domain capabilities, and preserves the S01 chat flow.
- Existing S01 auth, project selection, project isolation, and chat behavior remain green.
- ## Threat Surface
- **Abuse**: callers may try missing/invalid bearer tokens, selecting one project and reading another project's management surface, tampering with `projectId`, or using placeholder endpoints as undocumented integration execution paths. Tests must prove denials happen before data is returned and no mutating/execution endpoint exists in S02.
- **Data exposure**: payloads must contain only synthetic/demo metadata, no bearer tokens, provider API keys, secrets, private customer building data, or live gateway connection strings.
- **Input trust**: the only untrusted input is the bearer token and URL `projectId`; both must be validated through S01 auth/project helpers before project-scoped placeholder data is returned.
- ## Requirement Impact
- **Requirements touched**: R001 and R009 are directly advanced by gateway/management-page placeholders; R003 is re-verified because new protected routes must preserve backend-enforced auth/project permissions; R013 is supported by keeping test/typecheck/build commands green.
- **Re-verify**: API auth/session/project denial modes, new registry/management API contracts, Web login/project/chat regression path, Web management rendering, root typecheck, and production build.
- **Decisions revisited**: D003, D007, D008, D009, and D010 are honored; none should be re-litigated unless real integrations become necessary, which would be out of scope for S02.
- ## Verification
- `npm test -- --run apps/api/src/registry.test.ts apps/web/src/App.test.tsx`
- `npm run typecheck`
- `npm run build`

## Proof Level

- This slice proves: Contract plus same-repo Web integration proof. This slice proves the authenticated API contracts and the browser UI consuming them with seeded synthetic data and mocked network-boundary Web tests. Real runtime/provider/gateway integrations are explicitly not required and must not be introduced. Human/UAT is not required for completion, though the resulting pages should be visually inspectable in local dev.

## Integration Closure

Upstream surfaces consumed: `apps/api/src/auth.ts` authentication/project helpers, `apps/api/src/seed.ts` seeded in-memory store, `apps/api/src/server.ts` Fastify route pattern, `apps/web/src/api.ts` typed request/error wrapper, and `apps/web/src/App.tsx` login/project/chat shell. New wiring introduced: authenticated `GET /api/registry` platform listing and selected-project `GET /api/projects/:projectId/management` listing, plus Web navigation from the selected project workspace to placeholder management panels. Remaining before milestone end-to-end usability: S03 must add the authenticated CLI shell and startup smoke checks that exercise these same contracts outside the browser.

## Verification

- Runtime signals: all new protected endpoint failures continue to use canonical API error envelopes with stable error codes and request ids; successful list responses include explicit `limit`, `placeholderOnly`, and `requestId` fields. Inspection surfaces: API contract tests can inspect `/api/registry` and `/api/projects/:projectId/management`; the Web UI renders diagnostic banners with backend request ids/codes for registry/management failures. Failure visibility: auth_missing/auth_invalid/project_forbidden/project_not_selected denials remain distinguishable, and malformed or unavailable registry responses surface as existing `api_malformed`/`api_unavailable` banners. Redaction constraints: placeholder payloads must contain no secrets, bearer tokens, real provider keys, or real customer building data.

## Tasks

- [x] **T01: Add authenticated placeholder registry and management API contracts** `est:1.5h`
  Add the backend seed fixtures and Fastify routes for S02's placeholder registry and project management contracts. The implementation should be API-first and synthetic-only: global registry data is inspectable by any authenticated user, while project management placeholder data is returned only after membership, selected-project, and read-permission checks pass.
  - Files: ``apps/api/src/seed.ts``, ``apps/api/src/server.ts``, ``apps/api/src/auth.ts``, ``apps/api/src/auth.test.ts``, ``apps/api/src/chat.test.ts``, ``apps/api/src/registry.test.ts``
  - Verify: `npm test -- --run apps/api/src/registry.test.ts apps/api/src/auth.test.ts apps/api/src/chat.test.ts`

- [x] **T02: Build Web management panels from the registry contracts** `est:2h`
  Wire the S02 backend contracts into the React/Vite Web app as real authenticated management pages. The UI should extend the selected-project workspace rather than replacing S01 chat: users should be able to inspect runtime/provider/tool/skill placeholders, project gateway placeholders, and synthetic building-domain capabilities while still seeing and using the project-scoped chat shell.
  - Files: ``apps/web/src/api.ts``, ``apps/web/src/App.tsx``, ``apps/web/src/styles.css``, ``apps/web/src/App.test.tsx``, ``apps/api/src/registry.test.ts``
  - Verify: `npm test -- --run apps/api/src/registry.test.ts apps/web/src/App.test.tsx && npm run typecheck && npm run build`

## Files Likely Touched

- `apps/api/src/seed.ts`
- `apps/api/src/server.ts`
- `apps/api/src/auth.ts`
- `apps/api/src/auth.test.ts`
- `apps/api/src/chat.test.ts`
- `apps/api/src/registry.test.ts`
- `apps/web/src/api.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/App.test.tsx`
