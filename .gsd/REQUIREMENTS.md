# Requirements

This file is the explicit capability and coverage contract for the project.

## Active

### R001 — All user-facing entry points require authentication before use, including the Web UI, CLI, Email gateway placeholder, and WhatsApp gateway placeholder.
- Class: primary-user-loop
- Status: active
- Description: All user-facing entry points require authentication before use, including the Web UI, CLI, Email gateway placeholder, and WhatsApp gateway placeholder.
- Why it matters: The first useful platform foundation must prove that no interaction path bypasses authentication.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: none
- Validation: mapped
- Notes: V1 uses pragmatic local auth with seeded users/tokens, not production identity. Anonymous interaction is explicitly excluded.

### R005 — The platform includes a Hermes-inspired general agent runtime skeleton for sessions, planning/execution loop shape, and agent interaction flow.
- Class: core-capability
- Status: active
- Description: The platform includes a Hermes-inspired general agent runtime skeleton for sessions, planning/execution loop shape, and agent interaction flow.
- Why it matters: M001 must establish the reusable general agent foundation before later building-operations specialization.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: none
- Validation: mapped
- Notes: Use Hermes as the engineering baseline/reference for the general agent platform layer. BuildingAgent should not be built from zero unnecessarily.

### R006 — The platform includes a permission-checked tool registry and dispatcher skeleton.
- Class: core-capability
- Status: active
- Description: The platform includes a permission-checked tool registry and dispatcher skeleton.
- Why it matters: Tool dispatch is a central platform boundary and must not be retrofitted after building-domain tools arrive.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: none
- Validation: mapped
- Notes: Placeholder tools should register and dispatch through the same backend permission path future real tools will use.

### R007 — The platform includes a skill registry skeleton for listing and invoking placeholder skills through defined platform boundaries.
- Class: core-capability
- Status: active
- Description: The platform includes a skill registry skeleton for listing and invoking placeholder skills through defined platform boundaries.
- Why it matters: Skills are a first-class extension point for future building-operations workflows.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: none
- Validation: mapped
- Notes: Building-domain skills remain placeholders in v1 but should follow a Hermes-inspired registry/execution pattern where useful.

### R008 — The platform includes an extensible model/provider configuration skeleton and M001 chat prefers a real configured LLM provider/API when credentials are available, with mock responses only as fallback for smoke tests, CI, or local development without credentials.
- Class: integration
- Status: active
- Description: The platform includes an extensible model/provider configuration skeleton and M001 chat prefers a real configured LLM provider/API when credentials are available, with mock responses only as fallback for smoke tests, CI, or local development without credentials.
- Why it matters: Provider abstraction is required for a Hermes-like agent foundation and future model flexibility.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: none
- Validation: mapped
- Notes: Do not hard-code one provider too deeply. README must explain local provider configuration through environment variables or ignored local config files. Secrets must never be committed.

### R009 — The Web UI provides a coherent modern React/Next.js-style shell for login, project selection, chat workspace, and navigable placeholder management pages.
- Class: primary-user-loop
- Status: active
- Description: The Web UI provides a coherent modern React/Next.js-style shell for login, project selection, chat workspace, and navigable placeholder management pages.
- Why it matters: The platform needs a usable local product interface for the builder/operator and internal evaluator.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: none
- Validation: mapped
- Notes: Do not use Streamlit. Placeholder pages include project dashboard, model/provider settings, skills manager, tools manager, data source settings, user/permission settings, and audit logs.

### R010 — The CLI provides authenticated skeleton commands for login, project list, project use, chat, model list, skill list, and tool list.
- Class: primary-user-loop
- Status: active
- Description: The CLI provides authenticated skeleton commands for login, project list, project use, chat, model list, skill list, and tool list.
- Why it matters: The CLI is a required platform entry point and should prove the backend contract is not Web-only.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: none
- Validation: mapped
- Notes: Use Hermes CLI interaction patterns where useful, adapted to BuildingAgent naming and backend contract.

### R011 — Email and WhatsApp gateways exist as authenticated placeholders only, with no anonymous interaction path, and may remain minimal in M001 if needed to preserve the core working vertical slice.
- Class: integration
- Status: active
- Description: Email and WhatsApp gateways exist as authenticated placeholders only, with no anonymous interaction path, and may remain minimal in M001 if needed to preserve the core working vertical slice.
- Why it matters: External channel boundaries must be safe from the start even before real integrations are built.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: none
- Validation: mapped
- Notes: They do not need real channel integration in v1. The placeholder boundary must make auth expectations explicit, but gateway breadth is lower priority than authenticated backend, real-provider-first chat, Web/CLI chat/project flows, project isolation, skeleton registries, smoke checks, and README.

### R012 — The platform includes registered placeholder building-domain tools and skills for BIM/IFC, Brick/RDF/SPARQL, time-series, cross-source linking, visualization, and HHW-style analysis, kept minimal if needed to preserve the core working vertical slice.
- Class: differentiator
- Status: active
- Description: The platform includes registered placeholder building-domain tools and skills for BIM/IFC, Brick/RDF/SPARQL, time-series, cross-source linking, visualization, and HHW-style analysis, kept minimal if needed to preserve the core working vertical slice.
- Why it matters: The platform should visibly point toward BuildingAgent's building-operations direction while keeping v1 executable.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: none
- Validation: mapped
- Notes: Placeholders only in v1; no real building analytics or real building data should be included. Small clearly marked synthetic/demo Brick-like and time-series data is acceptable for local testing of workflows, permissions, and project isolation. Placeholder gateways and building-domain demo data are lower priority than authenticated backend, real-provider-first chat, Web/CLI chat/project flows, project isolation, skeleton registries, smoke checks, and README.

### R013 — The local backend, Web UI, and CLI can start or run their skeleton flows, and basic tests or smoke checks prove the foundation works, including the real-provider path when configured and mock fallback when credentials are absent.
- Class: launchability
- Status: active
- Description: The local backend, Web UI, and CLI can start or run their skeleton flows, and basic tests or smoke checks prove the foundation works, including the real-provider path when configured and mock fallback when credentials are absent.
- Why it matters: A foundation skeleton is only useful if it can be run and verified locally.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: none
- Validation: mapped
- Notes: Smoke checks should cover authenticated happy path, key permission/project-isolation boundaries where practical, provider fallback behavior, and CLI/Web access through backend auth checks.

### R014 — The README explains how to run the local backend, Web UI, CLI, seeded auth flow, model/provider configuration, fallback behavior, and smoke checks concisely.
- Class: operability
- Status: active
- Description: The README explains how to run the local backend, Web UI, CLI, seeded auth flow, model/provider configuration, fallback behavior, and smoke checks concisely.
- Why it matters: The builder/operator and local evaluator need a clear path to run the platform without tribal knowledge.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: none
- Validation: mapped
- Notes: Documentation should be implementation-oriented. It must explain using environment variables or ignored local config files for provider credentials and must warn against committing secrets or private building data.

### R015 — The platform can represent project-scoped external data source configuration surfaces for future BIM, Brick/RDF/SPARQL, time-series, and mapping sources.
- Class: integration
- Status: active
- Description: The platform can represent project-scoped external data source configuration surfaces for future BIM, Brick/RDF/SPARQL, time-series, and mapping sources.
- Why it matters: Future building workflows require safe project-scoped data-source boundaries before real integrations arrive.
- Source: user
- Primary owning slice: M002/none yet
- Supporting slices: none
- Validation: mapped
- Notes: Do not store real building data in the repository. This is owned by M002 after the M001 foundation exists.

### R016 — The platform introduces first real building-operations workflow prototypes after the foundation and data-source boundaries are proven.
- Class: differentiator
- Status: active
- Description: The platform introduces first real building-operations workflow prototypes after the foundation and data-source boundaries are proven.
- Why it matters: BuildingAgent ultimately needs to become a building-operations assistant, not only a general agent shell.
- Source: user
- Primary owning slice: M003/none yet
- Supporting slices: none
- Validation: mapped
- Notes: Likely directions include equipment exploration, semantic query scaffolding, trend inspection, and HHW reset analysis. This is not part of M001.

## Validated

### R002 — A signed-in user can select a project and enter a project-scoped chat workspace.
- Class: primary-user-loop
- Status: validated
- Description: A signed-in user can select a project and enter a project-scoped chat workspace.
- Why it matters: This is the main vertical slice that proves the platform foundation is usable rather than only structural.
- Source: user
- Primary owning slice: M001/S01
- Supporting slices: M001/S03
- Validation: Validated by S01 verification: API auth/project/chat contract tests, Web App tests, typecheck, and build all passed on 2026-05-10. Evidence: npm test -- --run apps/api/src/auth.test.ts apps/api/src/chat.test.ts; npm test -- --run apps/web/src/App.test.tsx; npm run typecheck; npm run build.
- Notes: S01 proves the Web UI login → project selection → project-scoped chat workspace flow for seeded local users. CLI parity remains for S03.

### R003 — The backend enforces authentication, RBAC, and project-scoped permission checks before protected operations run.
- Class: compliance/security
- Status: validated
- Description: The backend enforces authentication, RBAC, and project-scoped permission checks before protected operations run.
- Why it matters: Weak RBAC or unclear permission boundaries are the highest-risk failure mode for v1.
- Source: user
- Primary owning slice: M001/S01
- Supporting slices: M001/S02, M001/S03
- Validation: Validated by S01 API contract tests covering missing/invalid bearer tokens, forbidden project selection, selected-project enforcement, read/write permission checks, and project-scoped chat access; full slice verification passed on 2026-05-10.
- Notes: S01 validates backend auth, selected-project, project membership, and chat permission checks for current project/chat protected operations. Future tool/registry/CLI operations must reuse this boundary in S02/S03.

### R004 — Project data and project memory are isolated by project boundary.
- Class: core-capability
- Status: validated
- Description: Project data and project memory are isolated by project boundary.
- Why it matters: BuildingAgent's future building data workflows depend on trustable project isolation from the foundation.
- Source: user
- Primary owning slice: M001/S01
- Supporting slices: M002
- Validation: Validated by S01 API chat tests proving a user cannot select/chat in a project they are not a member of and chat history is read/written through the selected project boundary; full slice verification passed on 2026-05-10.
- Notes: S01 validates in-memory chat messages/memory keyed by project boundary for seeded local projects. Broader data-source isolation remains for later milestones.

## Deferred

### R017 — Enterprise identity and account lifecycle capabilities such as SSO, invitations, and password reset are useful later but not required for v1.
- Class: admin/support
- Status: deferred
- Description: Enterprise identity and account lifecycle capabilities such as SSO, invitations, and password reset are useful later but not required for v1.
- Why it matters: These capabilities matter later but would distract from proving the local foundation skeleton.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: none
- Validation: unmapped
- Notes: V1 uses seeded local users/tokens. Revisit when optimizing for external customers or enterprise deployment.

### R018 — Production-grade deployment is deferred beyond the first local working foundation.
- Class: operability
- Status: deferred
- Description: Production-grade deployment is deferred beyond the first local working foundation.
- Why it matters: The first version should prove platform boundaries locally before deployment hardening.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: none
- Validation: unmapped
- Notes: V1 only needs local runability and smoke checks.

### R019 — Real building analytics and cross-source reasoning are deferred until the platform foundation and data-source boundaries exist.
- Class: differentiator
- Status: deferred
- Description: Real building analytics and cross-source reasoning are deferred until the platform foundation and data-source boundaries exist.
- Why it matters: Analytics without a stable project-isolated platform boundary would create premature complexity.
- Source: user
- Primary owning slice: M003/none yet
- Supporting slices: none
- Validation: unmapped
- Notes: Includes real HHW analysis, cross-source equipment reasoning, and advanced building-operations workflows.

### R020 — Real BIM, Brick/RDF/SPARQL, time-series, and mapping data integrations are deferred beyond the v1 foundation.
- Class: integration
- Status: deferred
- Description: Real BIM, Brick/RDF/SPARQL, time-series, and mapping data integrations are deferred beyond the v1 foundation.
- Why it matters: Building-domain integrations should be project-scoped external data sources, not hardcoded or bundled data.
- Source: user
- Primary owning slice: M002/none yet
- Supporting slices: none
- Validation: unmapped
- Notes: M002 may add configuration surfaces and contracts first; real integration work comes after safe boundaries are established.

## Out of Scope

### R021 — The Web UI must not be implemented with Streamlit.
- Class: anti-feature
- Status: out-of-scope
- Description: The Web UI must not be implemented with Streamlit.
- Why it matters: This prevents a prototype UI choice that conflicts with the intended product interface.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Use a modern React/Next.js-style product interface instead.

### R022 — Anonymous interaction through Web UI, CLI, Email, WhatsApp, tools, or chat is out of scope and must not be provided.
- Class: compliance/security
- Status: out-of-scope
- Description: Anonymous interaction through Web UI, CLI, Email, WhatsApp, tools, or chat is out of scope and must not be provided.
- Why it matters: Anonymous paths would undermine the platform's auth, RBAC, and audit boundaries.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: All entry points require authentication, including placeholders.

### R023 — Real customer building data must not be stored in the repository.
- Class: constraint
- Status: out-of-scope
- Description: Real customer building data must not be stored in the repository.
- Why it matters: This protects the repository from accidental contamination with sensitive or proprietary building data.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Future building data should come from project-scoped external data sources only.

### R024 — The Hermes reference repository must not be modified.
- Class: constraint
- Status: out-of-scope
- Description: The Hermes reference repository must not be modified.
- Why it matters: The reference must remain intact so it can continue serving as a clean baseline and provenance source.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Use it only as a read-only engineering baseline/reference.

### R025 — The first version must not implement real BIM/IFC, Brick/RDF/SPARQL, time-series analytics, visualization, cross-source reasoning, or HHW analysis.
- Class: anti-feature
- Status: out-of-scope
- Description: The first version must not implement real BIM/IFC, Brick/RDF/SPARQL, time-series analytics, visualization, cross-source reasoning, or HHW analysis.
- Why it matters: This keeps M001 small and executable instead of turning it into an unfinished analytics project.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Only placeholders are allowed in v1.

### R026 — Production auth features such as SSO, invitation flow, password reset, and enterprise identity are out of scope for v1.
- Class: anti-feature
- Status: out-of-scope
- Description: Production auth features such as SSO, invitation flow, password reset, and enterprise identity are out of scope for v1.
- Why it matters: This prevents auth scope creep while preserving the security boundary that v1 must prove.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: This does not remove the requirement for pragmatic local auth with backend checks.

### R027 — BuildingAgent must not blindly vendor the full Hermes repository, but it may and should selectively reuse, copy, and adapt MIT-licensed Hermes components and patterns when useful.
- Class: constraint
- Status: out-of-scope
- Description: BuildingAgent must not blindly vendor the full Hermes repository, but it may and should selectively reuse, copy, and adapt MIT-licensed Hermes components and patterns when useful.
- Why it matters: This prevents both wasteful from-zero rebuilding and uncontrolled wholesale vendoring, while preserving provenance and license obligations.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Allowed Hermes-derived areas include agent runtime patterns, planning/execution loop patterns, tool and skill registry patterns, memory patterns, model/provider patterns, runtime/session structure, CLI/UI patterns, permission/approval/audit/safety patterns, and smoke-test patterns. Preserve license notices and attribution for Hermes-derived code.

## Traceability

| ID | Class | Status | Primary owner | Supporting | Proof |
|---|---|---|---|---|---|
| R001 | primary-user-loop | active | M001/none yet | none | mapped |
| R002 | primary-user-loop | validated | M001/S01 | M001/S03 | Validated by S01 verification: API auth/project/chat contract tests, Web App tests, typecheck, and build all passed on 2026-05-10. Evidence: npm test -- --run apps/api/src/auth.test.ts apps/api/src/chat.test.ts; npm test -- --run apps/web/src/App.test.tsx; npm run typecheck; npm run build. |
| R003 | compliance/security | validated | M001/S01 | M001/S02, M001/S03 | Validated by S01 API contract tests covering missing/invalid bearer tokens, forbidden project selection, selected-project enforcement, read/write permission checks, and project-scoped chat access; full slice verification passed on 2026-05-10. |
| R004 | core-capability | validated | M001/S01 | M002 | Validated by S01 API chat tests proving a user cannot select/chat in a project they are not a member of and chat history is read/written through the selected project boundary; full slice verification passed on 2026-05-10. |
| R005 | core-capability | active | M001/none yet | none | mapped |
| R006 | core-capability | active | M001/none yet | none | mapped |
| R007 | core-capability | active | M001/none yet | none | mapped |
| R008 | integration | active | M001/none yet | none | mapped |
| R009 | primary-user-loop | active | M001/none yet | none | mapped |
| R010 | primary-user-loop | active | M001/none yet | none | mapped |
| R011 | integration | active | M001/none yet | none | mapped |
| R012 | differentiator | active | M001/none yet | none | mapped |
| R013 | launchability | active | M001/none yet | none | mapped |
| R014 | operability | active | M001/none yet | none | mapped |
| R015 | integration | active | M002/none yet | none | mapped |
| R016 | differentiator | active | M003/none yet | none | mapped |
| R017 | admin/support | deferred | M001/none yet | none | unmapped |
| R018 | operability | deferred | M001/none yet | none | unmapped |
| R019 | differentiator | deferred | M003/none yet | none | unmapped |
| R020 | integration | deferred | M002/none yet | none | unmapped |
| R021 | anti-feature | out-of-scope | none | none | n/a |
| R022 | compliance/security | out-of-scope | none | none | n/a |
| R023 | constraint | out-of-scope | none | none | n/a |
| R024 | constraint | out-of-scope | none | none | n/a |
| R025 | anti-feature | out-of-scope | none | none | n/a |
| R026 | anti-feature | out-of-scope | none | none | n/a |
| R027 | constraint | out-of-scope | none | none | n/a |

## Coverage Summary

- Active requirements: 13
- Mapped to slices: 13
- Validated: 3 (R002, R003, R004)
- Unmapped active requirements: 0
