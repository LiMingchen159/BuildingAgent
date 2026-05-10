---
id: T02
parent: S02
milestone: M001
key_files:
  - apps/web/src/api.ts
  - apps/web/src/App.tsx
  - apps/web/src/styles.css
  - apps/web/src/App.test.tsx
key_decisions:
  - Added strict Web client parsing for placeholder registry and management payloads so malformed item shapes throw api_malformed instead of silently dropping entries.
  - Kept management fetch failures non-destructive for auth state unless they are true auth failures, matching S01 ApiClientError behavior.
duration: 
verification_result: passed
completed_at: 2026-05-10T11:08:55.083Z
blocker_discovered: false
---

# T02: Added authenticated Web management tabs backed by registry and project management API contracts.

**Added authenticated Web management tabs backed by registry and project management API contracts.**

## What Happened

Extended the Web API client with typed getRegistry and getProjectManagement methods, including strict validation for placeholderOnly, limit, requestId, and each registry/management item shape. Refactored the selected-project workspace into tabs for Chat, Platform Registry, Gateways, and Building Domain while preserving the existing project-scoped chat flow and read-only chat disabling. Added placeholder-only badges, request id metadata, empty states, and canonical diagnostic banners for registry/management failures. Expanded App tests with authenticated management-page rendering, chat preservation, read-only inspection, requestId-aware failure diagnostics, malformed payload handling, and empty placeholder list coverage.

## Verification

Ran focused Web tests during development and then the full slice verification command: `npm test -- --run apps/api/src/registry.test.ts apps/web/src/App.test.tsx && npm run typecheck && npm run build`. The final command passed, covering API registry contracts, Web management UI behavior, TypeScript checks, and production builds.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm test -- --run apps/web/src/App.test.tsx` | 0 | ✅ pass | 61231ms |
| 2 | `npm test -- --run apps/api/src/registry.test.ts apps/web/src/App.test.tsx && npm run typecheck && npm run build` | 0 | ✅ pass | 111521ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `apps/web/src/api.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/App.test.tsx`
