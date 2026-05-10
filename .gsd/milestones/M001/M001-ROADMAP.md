# M001: Local Hermes-Like Foundation Skeleton

**Vision:** Build the smallest authenticated local platform skeleton that proves the BuildingAgent foundation: backend, Web UI, CLI, login, project selection, project-scoped chat, Hermes-inspired runtime/tool/skill/provider seams, placeholder gateways, placeholder building-domain surfaces, and local smoke checks all work coherently.

## Success Criteria

- A seeded user can log in, select a project, and reach a project-scoped chat workspace through the Web UI.
- The backend rejects unauthorized access and enforces project-scoped permissions before protected operations run.
- Authenticated users can inspect placeholder runtime, tool, skill, provider, gateway, and building-domain surfaces without real external integrations.
- The CLI uses the same authenticated foundation and local smoke checks prove the stack starts coherently.
- README instructions match the verified local run and smoke path.

## Slices

- [x] **S01: S01** `risk:Highest-risk boundary: auth, session shape, and project isolation must be correct before any other surface can trust them.` `depends:[]`
  > After this: After this, a seeded local user can log in through the real Web UI, choose a project, and reach a protected project-scoped chat workspace; unauthorized access is blocked by the backend.

- [ ] **S02: S02** `risk:Placeholder boundaries can easily drift into accidental real integrations or undocumented privilege paths.` `depends:[]`
  > After this: After this, an authenticated user can inspect real placeholder pages and backend listings for runtime providers, skills, tools, gateways, and building-domain capabilities without exposing real external integrations.

- [ ] **S03: Authenticated CLI shell and local smoke checks** `risk:Multi-entrypoint coherence is the last major proof that the skeleton is truly platform-wide instead of only a web demo.` `depends:[S01,S02]`
  > After this: After this, the CLI can authenticate, select a project, and exercise the same local platform contracts; startup smoke checks confirm the backend, Web UI, and CLI all run coherently.

## Boundary Map

### S01 → S02

Produces:
- Authenticated session context with `userId`, `projectId`, and `permissions` attached to backend requests and UI state.
- Project-scoped chat workspace shell and route guards that downstream surfaces can reuse.

Consumes:
- nothing (first slice)

### S01 → S03

Produces:
- Seeded local auth flow and project-selection contract that the CLI can reuse.
- Shared auth/session primitives for non-web entrypoints.

Consumes:
- nothing (first slice)

### S02 → S03

Produces:
- Stable registry/listing contracts for models, skills, tools, gateways, and placeholder building-domain surfaces.
- Placeholder management-page routes that the CLI smoke flow can reference for parity.

Consumes:
- authenticated session and project context from S01
