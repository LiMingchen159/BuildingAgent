---
id: T01
parent: S02
milestone: M001
key_files:
  - apps/api/src/seed.ts
  - apps/api/src/server.ts
  - apps/api/src/registry.test.ts
key_decisions:
  - Kept registry globally authenticated but project management project-scoped behind membership, selected-project, and chat:read permission checks.
  - Bound each placeholder list independently with store.maxListSize and included requestId/placeholderOnly/limit on successful registry and management responses.
duration: 
verification_result: passed
completed_at: 2026-05-10T10:48:38.409Z
blocker_discovered: false
---

# T01: Added authenticated placeholder registry and project management API contracts with bounded synthetic fixtures and denial-mode tests.

**Added authenticated placeholder registry and project management API contracts with bounded synthetic fixtures and denial-mode tests.**

## What Happened

Extended the in-memory seed store with typed synthetic placeholder fixtures for runtime providers, tools, skills, gateways, and building-domain capabilities, plus per-project management fixture groupings. Added read-only Fastify GET contracts for /api/registry and /api/projects/:projectId/management. The registry endpoint requires only bearer authentication; the management endpoint reuses the existing auth pipeline for project membership, matching selected project, and chat:read permission. Added registry contract tests for successful placeholder listings, canonical auth failures, selected-project enforcement, forbidden access, read-permission denial, bounded maxListSize behavior, request ids, and absence of live-integration secret-like fields.

## Verification

Ran the slice task verification command for registry/auth/chat contract coverage and an API TypeScript typecheck. The verification command passed with 3 test files and 16 tests passing; typecheck also passed. Observability requirements were verified through tests asserting requestId, limit, placeholderOnly, and canonical error code envelopes.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm test -- --run apps/api/src/registry.test.ts apps/api/src/auth.test.ts apps/api/src/chat.test.ts` | 0 | ✅ pass | 16403ms |
| 2 | `npm --workspace @building-agent/api run typecheck` | 0 | ✅ pass | 6672ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `apps/api/src/seed.ts`
- `apps/api/src/server.ts`
- `apps/api/src/registry.test.ts`
