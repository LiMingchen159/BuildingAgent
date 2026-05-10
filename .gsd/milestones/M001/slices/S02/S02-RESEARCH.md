# S02: Registry skeletons, placeholder gateways, and management pages — Research

## Summary
S01 already proves the authenticated Web/API vertical slice: login, project selection, backend-enforced project isolation, and project-scoped chat. S02 does **not** need to rediscover that contract; it needs to extend the same authenticated session/project boundary into a visible registry layer for runtime/providers/tools/skills and a set of placeholder gateway + management pages that are inspectable but not real integrations.

The current codebase has no registry, gateway, or management-page routes yet. The API only exposes `/health`, `/api/login`, `/api/session`, `/api/projects`, project selection, and project chat. The Web app only knows login, project selection, and chat. That means S02 is primarily a new surface-planning slice, not a refactor of existing behavior.

## Recommendation
Keep S02 thin and contract-first: add authenticated list/detail endpoints for placeholder registries, then expose them in the Web UI as management pages that read the same authenticated session/project state from S01. Do not introduce real external integrations or hidden privilege paths; placeholder gateways should only prove the boundary and permission model.

Use the same API discipline already established in S01: canonical error envelopes with `requestId`, honest status codes, and bounded list responses. Any new list endpoint should cap results and make the cap explicit in the response so the future CLI and management pages can rely on stable contracts.

## Implementation Landscape

### Key Files
- `apps/api/src/server.ts` — current Fastify routes; natural home for authenticated registry/list endpoints, placeholder gateway endpoints, and any project-scoped management APIs.
- `apps/api/src/auth.ts` — already centralizes bearer auth, project membership, selected-project enforcement, and canonical error formatting; new registry endpoints should reuse these helpers.
- `apps/api/src/seed.ts` — current in-memory seed store; likely needs extension with placeholder runtime/provider/skill/tool/gateway/building-domain fixture data and possibly separate lists for global vs project-scoped visibility.
- `apps/web/src/api.ts` — typed fetch wrapper; should gain client methods for registry and placeholder-management endpoints, preserving the existing error parsing and `requestId` handling.
- `apps/web/src/App.tsx` — current auth/project/chat shell; should become the navigation/entry point for new management pages while keeping the S01 flow intact.
- `README.md` — still only documents the S01 run path; S02 additions will eventually need a follow-on README update, but not yet unless the slice closes.

### Build Order
1. Add the backend registry contracts first, because the UI should be driven by real endpoint shapes rather than invented client state.
2. Back the endpoints with seed fixtures and permission checks so placeholder surfaces stay clearly bounded and authenticated.
3. Add Web management-page routes/panels that consume the new API client methods and reuse the S01 session/project bootstrap.
4. Add tests around list bounds, forbidden access, and “placeholder only” behavior so real integrations cannot leak in by accident.

### Verification Approach
- API tests for authenticated registry access, forbidden access, and bounded list responses.
- Web tests for authenticated navigation to placeholder management pages and correct rendering of registry data.
- Run the same workspace checks already used in S01, then add targeted tests for the new routes/components.
- Keep the existing auth/project/chat tests green to prove S02 did not regress the S01 boundary.

## Constraints
- The repo is still local-dev only; no real gateway/provider integrations should be introduced in S02.
- New endpoints must preserve the S01 auth/session shape: `userId`, `projectId`, and `permissions`.
- Any list endpoint should be bounded and explicit about limits, per the API-design guidance already in use.
- Placeholder surfaces must not become back doors around project membership or permission checks.

## Common Pitfalls
- **Leaking real-integration semantics into placeholders** — keep names, payloads, and error messages clearly synthetic until the real slices arrive.
- **Adding UI pages without backend contracts** — the planner should prefer API-first seams so the pages stay thin and testable.
- **Treating registry lists as unbounded** — cap them now so later CLI and management views do not inherit an unsafe “return everything” pattern.

## Open Risks
- The boundary between “platform registry” and “management page” can drift if the slice tries to represent too many future surfaces at once.
- It is easy to overbuild placeholder gateways; the safe path is minimal visibility plus permission-checked listing, not simulated external behavior.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| HTTP API design | `api-design` | available |
| interface/module boundary design | `design-an-interface` | available |
| milestone decomposition | `decompose-into-slices` | available |
| observability | `observability` | available |
| docs/spec writing | `write-docs`, `write-milestone-brief` | available |
| React/Next.js UI review | `react-best-practices`, `frontend-design`, `web-design-guidelines` | available |

## Sources
- S01 API/Web implementation and tests in `apps/api/src/server.ts`, `apps/api/src/auth.ts`, `apps/api/src/seed.ts`, `apps/web/src/api.ts`, and `apps/web/src/App.tsx`.
- S01 README local-run contract in `README.md`.
- Hermes reference patterns for tool/skill/provider/gateway registries and runtime footer behavior in `/mnt/d/Git_project/references/hermes-agent/hermes_cli/tools_config.py`, `/mnt/d/Git_project/references/hermes-agent/hermes_cli/skills_config.py`, `/mnt/d/Git_project/references/hermes-agent/hermes_cli/providers.py`, and `/mnt/d/Git_project/references/hermes-agent/gateway/runtime_footer.py`.
- API-design guidance for bounded lists, canonical error shapes, and honest status codes from the installed `api-design` skill.