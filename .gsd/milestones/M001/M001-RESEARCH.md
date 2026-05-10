# M001 — Research

**Date:** 2026-05-10

## Summary

BuildingAgent is effectively a greenfield repository. The only concrete codebase artifact at the project root is a one-line `README.md`; the rest of the structure is GSD metadata and planning state. That means M001 is not an incremental refactor — it is the first implementation of the platform boundary itself.

The research recommendation is to prove the smallest end-to-end local platform skeleton first: authenticated login, project selection, project-scoped chat workspace, and the shared backend contracts that make tool/skill/provider/memory boundaries enforceable. Everything else in M001 should support that vertical slice, not compete with it. The repository should stay intentionally thin on domain logic and heavy on stable seams, especially because the project’s later milestones depend on those seams being trustworthy.

## Recommendation

Build a local-first Hermes-inspired skeleton with one authenticated path that touches all the important platform surfaces: backend auth/RBAC, project isolation, chat workspace, placeholder registries, and skeleton CLI/Web entry points. Reuse Hermes patterns for runtime/session shape, tool dispatch, skill listing, memory separation, and provider abstraction, but keep BuildingAgent’s own product identity and permissions model explicit.

Do not spend M001 on real building-domain analytics, data ingestion, or production deployment. The milestone should instead establish the contracts that later building-specific slices can safely extend: seeded auth, project-scoped permissions, placeholder gateways, placeholder tools/skills, and smoke checks that prove the stack starts and the user can move through the main flow locally.

## Implementation Landscape

### Key Files

- `README.md` — currently the only visible user-facing file; it will need the first runnable instructions and smoke-check path once the skeleton exists.
- `.gsd/PROJECT.md` — establishes the platform shape, scope boundaries, and Hermes reference posture.
- `.gsd/REQUIREMENTS.md` — the active M001 requirement set; this is the contract the milestone must satisfy.
- `references/hermes-agent/` — read-only engineering reference for runtime, CLI, web, tools, skills, memory, and gateway patterns.

### Build Order

1. **Authentication and project isolation first** — this is the highest-risk boundary and the gate for every other surface.
2. **Chat workspace and shared backend contracts next** — proves the product loop works end to end, not just the login screen.
3. **Skeleton registries and placeholder providers/gateways** — ensures tool, skill, and provider boundaries exist before real integrations arrive.
4. **CLI and Web UI shells** — should be thin clients over the same backend contract, not separate feature stacks.
5. **Smoke checks and README update** — verify the foundation can be run locally and understood without tribal knowledge.

### Verification Approach

- Start backend, Web UI, and CLI locally.
- Confirm login is required before protected surfaces.
- Confirm a signed-in user can select a project and reach a project-scoped chat workspace.
- Confirm placeholder tool/skill/provider lists can be surfaced without exposing unauthorized operations.
- Run smoke tests or scripted checks that prove startup + auth + project flow + basic listings.

## Constraints

- The repository currently contains essentially no application code, so M001 must create the first real structure rather than extend existing modules.
- Hermes Agent is a read-only reference; it can inform the design but should not be blindly vendored.
- v1 auth is intentionally pragmatic local auth with seeded users/tokens, not SSO or enterprise lifecycle features.
- Building-domain data must not be stored in-repo in this milestone.
- The Web UI should be modern React/Next.js-style, not Streamlit.

## Common Pitfalls

- **Trying to build all future platform surfaces at once** — keep the milestone anchored to the first authenticated vertical slice.
- **Mixing platform permissions with project/data permissions** — the separation must remain conceptually and operationally clear.
- **Letting placeholder tools or gateways become real integrations too early** — they should prove boundaries, not create scope drift.
- **Overfitting to Hermes internals instead of BuildingAgent’s boundaries** — reuse patterns, not the whole product shape.

## Open Risks

- The biggest unknown is how much of Hermes’ runtime/session/tool/skill structure can be reused cleanly without importing unwanted dependencies or product assumptions.
- Another risk is creating too much UI shell before the backend contract is stable; the UI should stay thin and contract-driven.
- There is a likely need for additional observability and smoke-test requirements, but those should remain implementation-supporting unless they become explicit acceptance criteria.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| general API/backend design | `api-design` | available |
| interface/module boundary design | `design-an-interface` | available |
| milestone decomposition | `decompose-into-slices` | available |
| observability | `observability` | available |
| docs/spec writing | `write-docs`, `write-milestone-brief` | available |
| React/Next.js UI review | `react-best-practices`, `frontend-design`, `web-design-guidelines` | available |
| code review/security review | `review`, `security-review`, `best-practices` | available |

## Sources

- Project scope and requirement contract from `.gsd/PROJECT.md` and `.gsd/REQUIREMENTS.md`
- Hermes Agent baseline patterns from `/mnt/d/Git_project/references/hermes-agent/README.md` and `/mnt/d/Git_project/references/hermes-agent/pyproject.toml`

## Advisory Notes for Planning

- Treat R001–R014 as the table-stakes M001 contract; they line up with the intended first slice of the product.
- R017 and R018 are correctly deferred and should stay out of scope for this milestone.
- Candidate follow-on requirements may be needed later for observability, startup health checks, and explicit placeholder behavior, but the current milestone can likely absorb them as implementation details unless the planner decides they deserve formal requirement status.