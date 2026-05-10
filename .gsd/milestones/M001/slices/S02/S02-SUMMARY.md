---
id: S02
parent: M001
milestone: M001
provides:
  - Stable authenticated GET /api/registry contract for runtime providers, tools, skills, gateway placeholders, and building-domain capabilities.
  - Stable selected-project GET /api/projects/:projectId/management contract for project gateway, capability, and tool placeholders.
  - Web workspace tabs for Platform Registry, Gateways, and Building Domain that S03 can reference for CLI parity and smoke coverage.
  - Synthetic-only placeholder fixtures and tests proving no obvious secret-like fields are returned in successful S02 payloads.
requires:
  - slice: S01
    provides: S01 authenticated bearer sessions, project membership, selected-project state, chat:read/chat:write permissions, canonical error envelopes, Web login/project-selection/chat shell, and typed API-client pattern.
affects:
  - S03
key_files:
  - apps/api/src/seed.ts
  - apps/api/src/server.ts
  - apps/api/src/registry.test.ts
  - apps/web/src/api.ts
  - apps/web/src/App.tsx
  - apps/web/src/styles.css
  - apps/web/src/App.test.tsx
  - .gsd/PROJECT.md
key_decisions:
  - Kept registry globally authenticated but project management project-scoped behind membership, selected-project, and chat:read permission checks.
  - Bound each placeholder list independently with store.maxListSize and included requestId/placeholderOnly/limit on successful registry and management responses.
  - Added strict Web client parsing for placeholder registry and management payloads so malformed item shapes throw api_malformed instead of silently dropping entries.
  - Kept management fetch failures non-destructive for auth state unless they are true auth failures, matching S01 ApiClientError behavior.
patterns_established:
  - Split global-vs-project registry boundary: global platform registry requires bearer auth only; project management listings additionally require membership, selected-project match, and chat:read.
  - Bounded placeholder-list responses include limit, placeholderOnly, and requestId on success and canonical S01 error envelopes on failure.
  - Web clients fail closed on malformed placeholder payloads and render request-id-aware diagnostic banners for management surfaces.
observability_surfaces:
  - Successful registry and management responses expose requestId, limit, and placeholderOnly fields for diagnostics.
  - Canonical API error envelopes preserve stable error codes and request ids for auth_missing, auth_invalid, project_not_selected, project_forbidden, api_malformed, and api_unavailable style diagnosis.
  - Web management tabs render request-id metadata and diagnostic banners so future agents can identify whether failures came from registry, management, auth, or malformed payloads.
drill_down_paths:
  - .gsd/milestones/M001/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S02/tasks/T02-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-05-10T11:19:24.414Z
blocker_discovered: false
---

# S02: Registry skeletons, placeholder gateways, and management pages

**Authenticated placeholder registry and project management surfaces now expose bounded synthetic runtime/tool/skill/gateway/building-domain listings through real API contracts and Web management tabs while preserving the project-scoped chat workspace.**

## What Happened

S02 extended the S01 authenticated local Web/API foundation with bounded synthetic registry and management surfaces. T01 added typed seed fixtures for runtime providers, tools, skills, gateway placeholders, and building-domain capabilities, then exposed them through read-only Fastify contracts. /api/registry is globally inspectable by any authenticated bearer token, while /api/projects/:projectId/management reuses the existing S01 guard chain so membership, selected-project match, and chat:read permission are checked before project placeholder data is returned. Successful payloads include limit, placeholderOnly, and requestId, and failure modes reuse canonical request-id-bearing error envelopes.

T02 wired those contracts into the React/Vite Web app. The selected-project workspace now has tabs for Chat, Platform Registry, Gateways, and Building Domain. Chat remains available through the original S01 project-scoped flow, while the new management tabs render placeholder-only registry/provider/tool/skill/gateway/capability cards, request-id metadata, empty states, read-only inspection for read-only projects, and diagnostic banners for canonical API failures. The Web client validates the S02 payloads strictly enough that malformed placeholder metadata or item shapes surface as api_malformed rather than silently rendering partial untrusted data.

Closure review confirmed the slice delivered the intended placeholder-only API and UI surface, with a low security risk for local-skeleton scope. It also identified follow-up hardening items that should be handled in a later execute-task because this complete-slice unit is write-restricted for source files.

## Verification

Fresh slice-level verification passed after closure review: `npm test -- --run apps/api/src/registry.test.ts apps/web/src/App.test.tsx && npm run typecheck && npm run build` exited 0 in gsd_exec e731b122-9d79-4f0d-8f62-d05c78d59035. This verifies API registry/management contracts, Web management UI behavior, TypeScript correctness, and production builds. Task-level evidence also passed: T01 API registry/auth/chat tests and API typecheck; T02 focused Web tests plus full slice command. Closure subagents reviewed code/security/test coverage and found no critical exploit for placeholder scope, but recorded hardening follow-ups before real integrations.

## Requirements Advanced

- R003 — S02 extends the authenticated/project-scoped foundation with new protected management routes and re-verifies canonical auth, selected-project, and permission denial behavior for additional protected surfaces.

## Requirements Validated

- R003 — Fresh slice verification passed `npm test -- --run apps/api/src/registry.test.ts apps/web/src/App.test.tsx && npm run typecheck && npm run build` with exit code 0 after S02 API/Web integration; registry tests cover auth/project/permission denials for the new management surfaces.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Operational Readiness

None.

## Deviations

None from the implemented task plan. Closure review found hardening/test follow-ups that could not be patched in this planning-dispatch unit because source writes are restricted to task execution units; they are recorded as known limitations/follow-ups rather than silently ignored.

## Known Limitations

S02 remains placeholder-only: no live runtime providers, gateway connections, external tools, building datasets, or execution/mutation contracts exist. Closure review also identified hardening gaps to resolve before real integrations: the Web client currently accepts any string projectId in project-management responses rather than comparing it to the requested id, API tests do not explicitly cover non-GET registry/management method rejection, and current project selection waits for management surfaces before entering the workspace when those surfaces fail.

## Follow-ups

Before real integrations land, add an execute-task hardening pass that (1) validates Web project-management response projectId exactly equals the requested project id, (2) adds API tests proving non-GET registry/management methods and execution-looking routes do not return placeholder data, and (3) considers loading management surfaces independently so transient registry/management failure does not block an otherwise successful chat workspace selection.

## Files Created/Modified

- `apps/api/src/seed.ts` — Seeded synthetic runtime provider, tool, skill, gateway, and building-domain placeholder fixtures plus project management fixture groupings.
- `apps/api/src/server.ts` — Read-only authenticated GET contracts for /api/registry and /api/projects/:projectId/management, wired through canonical auth/project permission checks.
- `apps/api/src/registry.test.ts` — API contract tests for registry/management success, canonical auth failures, selected-project enforcement, read-permission denial, bounds, request ids, and no obvious secret-like fields.
- `apps/web/src/api.ts` — Typed Web client methods and strict parsers for registry and project management placeholder payloads.
- `apps/web/src/App.tsx` — Selected-project workspace tabs for Chat, Platform Registry, Gateways, and Building Domain while preserving S01 chat behavior.
- `apps/web/src/styles.css` — Styling for management tabs, placeholder cards, badges, diagnostics, and empty states.
- `apps/web/src/App.test.tsx` — Web tests for authenticated management rendering, chat preservation, read-only inspection, failure diagnostics, malformed payloads, and empty placeholder lists.
- `.gsd/PROJECT.md` — Project context refreshed to reflect S02 completion, S02 patterns, and S03 forward intelligence.
