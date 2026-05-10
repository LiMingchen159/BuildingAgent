# S02: Registry skeletons, placeholder gateways, and management pages — UAT

**Milestone:** M001
**Written:** 2026-05-10T11:19:24.425Z

# S02: Registry skeletons, placeholder gateways, and management pages — UAT

**Milestone:** M001
**Written:** 2026-05-10

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S02 is explicitly a placeholder-only contract/UI slice. Acceptance can be proven by API/Web contract tests, TypeScript checks, and production build without requiring live external integrations or human visual judgment.

## Preconditions

- Repository dependencies are installed.
- Seed data is the local in-memory development store.
- Seeded Web/API auth fixtures are available, including `seed-token-ada` and the seeded Ada project memberships.
- No real provider credentials, gateway connection strings, customer building data, or live integration services are required.

## Smoke Test

Run:

```bash
npm test -- --run apps/api/src/registry.test.ts apps/web/src/App.test.tsx && npm run typecheck && npm run build
```

Expected: command exits 0, API registry tests pass, Web App tests pass, TypeScript checks pass, and both workspaces build successfully.

## Test Cases

### 1. Authenticated platform registry inspection

1. Call `GET /api/registry` with `Authorization: Bearer seed-token-ada`.
2. Inspect the JSON response.
3. **Expected:** status 200; response includes bounded arrays for `runtimeProviders`, `tools`, `skills`, `gateways`, and `buildingCapabilities`; response includes `limit`, `placeholderOnly: true`, and a `requestId`; payload contains synthetic placeholder/mock/not_configured metadata only.

### 2. Registry rejects unauthenticated callers

1. Call `GET /api/registry` without an Authorization header.
2. Call `GET /api/registry` with a malformed non-Bearer Authorization header.
3. Call `GET /api/registry` with an unknown bearer token.
4. **Expected:** each request is rejected with a canonical error envelope, stable auth error code (`auth_missing` or `auth_invalid`), and request id; no registry data is returned.

### 3. Project management requires selected authorized project

1. Call `GET /api/projects/project_alpha/management` with Ada's token before selecting a project.
2. Select `project_beta` with Ada's token, then call `GET /api/projects/project_alpha/management`.
3. Call `GET /api/projects/project_gamma/management` with Ada's token where Ada is not a member.
4. **Expected:** each request is rejected before placeholder management data is returned, using canonical `project_not_selected` or `project_forbidden` errors with request ids.

### 4. Project management returns bounded synthetic placeholders after authorization

1. Select `project_alpha` with Ada's token using the project selection API.
2. Call `GET /api/projects/project_alpha/management` with Ada's token.
3. **Expected:** status 200; response `projectId` is `project_alpha`; response includes project gateway placeholders, building-domain capabilities, tools, `limit`, `placeholderOnly: true`, and `requestId`; no secret-like fields or live connection strings are present.

### 5. Web workspace preserves chat and renders management tabs

1. In the Web app test flow, sign in as the seeded user.
2. Select Alpha Build.
3. Open the Platform Registry tab.
4. Open the Gateways tab.
5. Open the Building Domain tab.
6. Return to Chat and send a project-scoped message.
7. **Expected:** the Alpha Build workspace remains mounted; Platform Registry shows runtime provider/tool/skill placeholders and request id metadata; Gateways shows the BMS gateway placeholder and no external BMS connection; Building Domain shows the Energy Baseline capability and Space Summary tool; Chat still sends to `/api/projects/project_alpha/chat` with bearer auth.

### 6. Read-only project allows inspection but blocks chat compose

1. Use a seeded project membership with `chat:read` but no `chat:write`.
2. Select that project in the Web app.
3. Open the Building Domain tab.
4. **Expected:** management placeholders render for inspection; the chat textbox and send button are disabled; the UI states that the project does not grant chat write permission.

### 7. Diagnostics and malformed payload handling

1. Mock `/api/registry` to return a canonical backend error with code and request id.
2. Mock `/api/projects/:id/management` to return a canonical backend error with code and request id.
3. Mock malformed registry or management payload metadata/item shapes.
4. **Expected:** the Web UI renders request-id-aware diagnostic banners for backend errors and `api_malformed` for malformed payloads without crashing or clearing bearer auth state for non-auth failures.

## Edge Cases

### Empty placeholder lists

1. Return valid registry and management responses with empty placeholder arrays and valid `limit`, `placeholderOnly`, and `requestId` metadata.
2. **Expected:** the Web UI renders explicit empty states such as no runtime provider placeholders and no project gateway placeholders instead of crashing or showing stale data.

### Bounded list size

1. Configure the seed store `maxListSize` to 1.
2. Call registry and management listings.
3. **Expected:** each list is limited to one item and the response `limit` reports 1.

## Failure Signals

- Registry or management success responses missing `requestId`, `limit`, or `placeholderOnly: true`.
- Registry data returned without bearer authentication.
- Project management data returned before project selection or for a non-member/wrong selected project.
- Web management tabs missing placeholder-only badges, request ids, or empty states.
- Payloads containing secret-like fields such as bearer tokens, passwords, private keys, API keys, or live gateway connection strings.
- S01 chat no longer works after selecting a project.

## Not Proven By This UAT

- Real runtime provider execution, real tool execution, real skill execution, real BMS/email/WhatsApp gateway connectivity, or real building analytics.
- Performance under load or large customer datasets.
- Production-grade authentication/session storage; seeded bearer tokens and localStorage persistence remain local-development-only.
- Explicit rejection of every non-GET or execution-looking registry/management route; closure review identified this as a follow-up hardening test before real integrations.
- Browser-side project-management payload projectId equality enforcement; closure review identified this as a follow-up hardening fix before real project data exists.

## Notes for Tester

Treat all registry, gateway, and building-domain content as synthetic placeholders. The correct S02 behavior is inspectable read-only metadata plus strong auth/project denial modes, not live integration behavior.
