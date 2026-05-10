# Requirements

This file is the explicit capability and coverage contract for the project.

## Active

### R015 — The platform exposes project-scoped workspace surfaces for Knowledge Base, Repository, conversations, settings context, scheduled tasks, Skills, Tools, and future building-domain data-source configuration without storing real building data in the repository.
- Class: integration
- Status: active
- Description: The platform exposes project-scoped workspace surfaces for Knowledge Base, Repository, conversations, settings context, scheduled tasks, Skills, Tools, and future building-domain data-source configuration without storing real building data in the repository.
- Why it matters: Future building workflows require safe project-scoped data-source boundaries before real integrations arrive.
- Source: user
- Primary owning slice: M002/S06
- Supporting slices: M002/S04, M002/S07
- Validation: mapped to M002 UI-first mock/stub plan
- Notes: Re-scoped for M002 from a narrow data-source-stub milestone into the UI-first project workspace boundary. BIM, Brick/RDF/SPARQL, time-series, and mapping integrations remain represented only through safe mock/stub UI surfaces and placeholder metadata.

### R028 — The platform provides a polished React/Vite login, project selection, and workspace shell that feels like a coherent product rather than a skeleton.
- Class: primary-user-loop
- Status: active
- Description: The platform provides a polished React/Vite login, project selection, and workspace shell that feels like a coherent product rather than a skeleton.
- Why it matters: The product needs a usable front door and workspace shape before any mock building-domain surfaces matter.
- Source: user
- Primary owning slice: M002/S01-S04
- Supporting slices: M002/S05, M002/S06, M002/S07
- Validation: validated only when the local UI shows the polished shell and the login → project selection → workspace path is exercised end-to-end.
- Notes: UI-first milestone requirement. Account-level settings may live outside the project boundary, but the main product shell must present login → project selection → workspace as a clear, branded flow.

### R029 — Assistant messages render Markdown correctly, including headings, lists, links, code blocks, blockquotes, rules, and tables.
- Class: quality-attribute
- Status: active
- Description: Assistant messages render Markdown correctly, including headings, lists, links, code blocks, blockquotes, rules, and tables.
- Why it matters: Chat is the main conversational surface; raw Markdown would make the assistant feel broken.
- Source: user
- Primary owning slice: M002/S05
- Supporting slices: M002/S04
- Validation: validated when browser and test evidence show assistant chat messages render Markdown to HTML across the supported elements.
- Notes: This requirement includes safe rendering behavior and responsive table handling. Raw Markdown should not leak into the chat transcript for assistant messages.

### R030 — Assistant messages can show mock image outputs inline and in a click-to-enlarge preview modal or card.
- Class: quality-attribute
- Status: active
- Description: Assistant messages can show mock image outputs inline and in a click-to-enlarge preview modal or card.
- Why it matters: The chat needs to support the mock visual outputs that the building-domain workflows will eventually produce.
- Source: user
- Primary owning slice: M002/S05
- Supporting slices: M002/S04
- Validation: validated when inline image previews and a working enlargement flow are exercised in the browser.
- Notes: Images are stub/mock behavior only. The UI may present thumbnails, preview cards, and accessible enlargement controls, but not real image generation or repository mutation.

### R031 — The Knowledge Base surface is project-scoped, mock-only, and clearly communicates that assistant context remains limited to the current project.
- Class: primary-user-loop
- Status: active
- Description: The Knowledge Base surface is project-scoped, mock-only, and clearly communicates that assistant context remains limited to the current project.
- Why it matters: Users need to see where project knowledge will live before real data-source integrations exist.
- Source: user
- Primary owning slice: M002/S06
- Supporting slices: M002/S04
- Validation: validated when the KB surface is visible, project-scoped, and explicitly mock-only in the browser flow.
- Notes: No real RAG, indexing, vector store writes, or cross-project data access in M002. The UI may show document categories, counts, and upload placeholders only.

### R032 — The Repository surface is project-scoped, mock-only, and makes future write/delete actions visibly approval-gated.
- Class: primary-user-loop
- Status: active
- Description: The Repository surface is project-scoped, mock-only, and makes future write/delete actions visibly approval-gated.
- Why it matters: The repository boundary must be explicit before the product introduces any building-domain artifacts or generated outputs.
- Source: user
- Primary owning slice: M002/S06
- Supporting slices: M002/S04
- Validation: validated when the repository surface is visible, project-scoped, and the approval-gated future action language is present.
- Notes: No real file writes, deletes, or repository mutations in M002. The surface may preview generated outputs, source labels, timestamps, and approval affordances.

### R033 — The right-side contextual panel presents Scheduled & Rule-based Tasks first, Skills second, and Tools third.
- Class: core-capability
- Status: active
- Description: The right-side contextual panel presents Scheduled & Rule-based Tasks first, Skills second, and Tools third.
- Why it matters: The panel order is part of the product’s information architecture and should not drift.
- Source: user
- Primary owning slice: M002/S07
- Supporting slices: M002/S04
- Validation: validated when the browser and tests prove the section order and labels are stable.
- Notes: This order is fixed for M002 and must be preserved in the UI and tests. Any task or tool examples remain mock/stub-only.

### R034 — The app renders a visible shell, loading state, or skeleton quickly on first load and does not leave the user staring at a blank screen.
- Class: launchability
- Status: active
- Description: The app renders a visible shell, loading state, or skeleton quickly on first load and does not leave the user staring at a blank screen.
- Why it matters: First load is part of the user experience and currently looks empty for too long.
- Source: user
- Primary owning slice: M002/S01
- Supporting slices: M002/S02, M002/S04
- Validation: validated when browser evidence shows the app shell or loading state appears immediately on startup and the blank-screen case is removed or materially reduced.
- Notes: If cold-start delay is unavoidable, the UI must still surface immediate feedback. This is a perceived-load requirement, not a backend-performance claim.

### R035 — All M002 agent, skill, tool, task, repository, scheduling, BIM, Brick/RDF/SPARQL, time-series, mapping, and building-control behavior remains mock/stub-only.
- Class: anti-feature
- Status: active
- Description: All M002 agent, skill, tool, task, repository, scheduling, BIM, Brick/RDF/SPARQL, time-series, mapping, and building-control behavior remains mock/stub-only.
- Why it matters: M002 must stay safe and UI-first while the real integrations are deferred.
- Source: user
- Primary owning slice: M002/S01-S07
- Supporting slices: none
- Validation: validated when the implementation and browser/tests show only mock/stub behaviors and no live external actions are reachable.
- Notes: No real RAG, MCP calls, backend scheduling, repository mutation, BMS control, chiller shutdown, external operations, or cost-producing API calls in this milestone.

### R036 — Project data access, conversations, Knowledge Base, Repository, tasks, Skills, Tools, and building-domain surfaces remain project-scoped, while LLM connection settings may be account-level.
- Class: constraint
- Status: active
- Description: Project data access, conversations, Knowledge Base, Repository, tasks, Skills, Tools, and building-domain surfaces remain project-scoped, while LLM connection settings may be account-level.
- Why it matters: The product needs a clear boundary between personal model configuration and project-specific operational data.
- Source: user
- Primary owning slice: M002/S04
- Supporting slices: M002/S05, M002/S06, M002/S07
- Validation: validated when the UI and API preserve account-level settings separation and project-scoped content boundaries.
- Notes: This requirement keeps user-configured model credentials/settings separate from project content and prevents cross-project leakage.

## Validated

### R001 — All user-facing M001 entry points require authentication before use across the proven local Web UI, CLI, registry/management, provider-backed chat, and smoke paths; Email and WhatsApp gateways are authenticated placeholder inspections only.
- Class: primary-user-loop
- Status: validated
- Description: All user-facing M001 entry points require authentication before use across the proven local Web UI, CLI, registry/management, provider-backed chat, and smoke paths; Email and WhatsApp gateways are authenticated placeholder inspections only.
- Why it matters: The first useful platform foundation must prove that no interaction path bypasses authentication.
- Source: user
- Primary owning slice: M001/S05
- Supporting slices: M001/S01, M001/S02, M001/S03, M001/S04
- Validation: Validated by S01-S04 evidence: S01 Web/API auth/project/chat tests, typecheck, and build; S02 authenticated registry/management API and Web tests; S03 authenticated CLI command tests and npm run smoke; S04 provider-backed chat tests/build/smoke proving provider invocation occurs only after auth, selected-project, membership, and permission checks. Scope is local M001 skeleton auth, not enterprise identity or production deployment.
- Notes: V1 uses pragmatic local auth with seeded users/tokens, not production identity. Anonymous interaction is explicitly excluded. S01 proves Web/API login, project selection, protected chat, and project isolation; S02 proves authenticated placeholder registry/management/gateway inspection; S03 proves authenticated CLI login, session, project, registry, management, and chat smoke paths; S04 proves provider-backed chat remains behind the same auth/project/permission guards. Gateway surfaces are placeholder-only inspections with no anonymous path and no live channel integration.

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

### R005 — The platform includes a Hermes-inspired general agent runtime skeleton for authenticated sessions, project-scoped chat interaction flow, provider-backed assistant responses, and observable planning/execution loop boundaries.
- Class: core-capability
- Status: validated
- Description: The platform includes a Hermes-inspired general agent runtime skeleton for authenticated sessions, project-scoped chat interaction flow, provider-backed assistant responses, and observable planning/execution loop boundaries.
- Why it matters: M001 must establish the reusable general agent foundation before later building-operations specialization.
- Source: user
- Primary owning slice: M001/S05
- Supporting slices: M001/S01, M001/S04
- Validation: Validated at M001 skeleton/contract level by S01 Web/API foundation tests and S04 provider-backed chat tests/build/smoke. Evidence proves the local session/chat/provider seams and observable request-id/provider metadata, but does not claim a full autonomous planning/execution runtime.
- Notes: M001 validates skeleton/contract coverage only. S01 establishes authenticated sessions, project selection, project-scoped chat memory, and canonical request-id diagnostics; S04 adds the provider seam and assistant response contract. The full autonomous planning/execution loop, real task planner/executor, long-running runtime orchestration, and production resilience remain future work under the Hermes-inspired roadmap.

### R006 — The platform includes an authenticated, permission-checked tool registry and dispatcher skeleton boundary for inspecting placeholder tools without enabling real tool execution in M001.
- Class: core-capability
- Status: validated
- Description: The platform includes an authenticated, permission-checked tool registry and dispatcher skeleton boundary for inspecting placeholder tools without enabling real tool execution in M001.
- Why it matters: Tool dispatch is a central platform boundary and must not be retrofitted after building-domain tools arrive.
- Source: user
- Primary owning slice: M001/S05
- Supporting slices: M001/S02, M001/S03
- Validation: Validated at M001 skeleton/contract level by S02 registry/management API and Web tests plus S03 CLI registry/management tests and npm run smoke. Evidence proves authenticated, bounded placeholder tool inspection and selected-project management checks; it does not claim real dispatcher execution.
- Notes: M001 validates skeleton/contract coverage only. S02 proves authenticated global registry listing and selected-project management inspection for placeholder tools behind membership, selected-project, and chat:read checks; S03 proves the same surfaces through CLI/smoke. Real tool dispatch, execution/mutation routes, approvals, audit trails, and live integrations remain future work. This preserves D009's coherent vertical-slice priority and D010's placeholder-only boundary with no accidental live integrations.

### R007 — The platform includes an authenticated skill registry skeleton boundary for listing placeholder skills through defined platform and project-management surfaces without real skill invocation in M001.
- Class: core-capability
- Status: validated
- Description: The platform includes an authenticated skill registry skeleton boundary for listing placeholder skills through defined platform and project-management surfaces without real skill invocation in M001.
- Why it matters: Skills are a first-class extension point for future building-operations workflows.
- Source: user
- Primary owning slice: M001/S05
- Supporting slices: M001/S02, M001/S03
- Validation: Validated at M001 skeleton/contract level by S02 registry/management API and Web tests plus S03 CLI registry/management tests and npm run smoke. Evidence proves authenticated placeholder skill inspection; it does not claim real skill invocation.
- Notes: M001 validates skeleton/contract coverage only. S02 proves authenticated placeholder skill listings in the global registry and Web management tabs, and S03 proves registry/management inspection through the authenticated CLI/smoke path. Real skill invocation, skill execution runtime, approvals, and building-workflow skills remain future work. The boundary remains placeholder-only and does not introduce live integrations or real building analytics.

### R008 — The chat layer uses a provider abstraction that prefers configured OpenAI-compatible real-provider mode when BUILDING_AGENT_LLM_* configuration exists and otherwise supports deterministic local mock fallback for no-secret development, CI, and smoke runs.
- Class: integration
- Status: validated
- Description: The chat layer uses a provider abstraction that prefers configured OpenAI-compatible real-provider mode when BUILDING_AGENT_LLM_* configuration exists and otherwise supports deterministic local mock fallback for no-secret development, CI, and smoke runs.
- Why it matters: Provider abstraction is required for a Hermes-like agent foundation and future model flexibility.
- Source: user
- Primary owning slice: M001/S04
- Supporting slices: M001/S04
- Validation: Validated by S04 verification on 2026-05-10: npm test -- --run apps/api/src/chat.test.ts apps/api/src/providers.test.ts apps/web/src/App.test.tsx apps/cli/src/commands.test.ts passed 29 tests; npm run typecheck passed API/CLI/Web; npm run build passed all workspaces and Vite production build; npm run smoke passed live API/Web/CLI no-secret fallback flow; refined redaction scan found no unallowed real-looking provider key, bearer token, password, token, or API-key literal beyond documented seeded/test fixtures.
- Notes: S04 implements the provider configuration skeleton with OpenAI-compatible real-provider selection when BUILDING_AGENT_LLM_* configuration is present, deterministic mock fallback for no-secret/local smoke runs, redaction-safe provider diagnostics, and API/Web/CLI/smoke proof. Live external provider operation remains optional/env-gated and was not exercised with real credentials.

### R009 — The Web UI provides a coherent modern React/Vite product shell for login, project selection, project-scoped chat, and navigable placeholder management pages.
- Class: primary-user-loop
- Status: validated
- Description: The Web UI provides a coherent modern React/Vite product shell for login, project selection, project-scoped chat, and navigable placeholder management pages.
- Why it matters: The platform needs a usable local product interface for the builder/operator and internal evaluator.
- Source: user
- Primary owning slice: M001/S02
- Supporting slices: M001/S01
- Validation: Validated by S01 Web/API flow tests, typecheck, and build plus S02 Web management tests, typecheck, and build. Evidence includes S01 App tests for login/project/chat and S02 App tests for registry, gateway, building-domain tabs, diagnostics, malformed payload handling, and empty states.
- Notes: Validated by S01/S02 Web implementation and verification. The UI remains a local skeleton, not a production deployment surface.

### R010 — The CLI provides authenticated skeleton commands for login, session inspection, project list/use, chat send/list, registry inspection, and project management inspection.
- Class: primary-user-loop
- Status: validated
- Description: The CLI provides authenticated skeleton commands for login, session inspection, project list/use, chat send/list, registry inspection, and project management inspection.
- Why it matters: The CLI is a required platform entry point and should prove the backend contract is not Web-only.
- Source: user
- Primary owning slice: M001/S03
- Supporting slices: M001/S04
- Validation: Validated by S03 CLI tests, typecheck, and npm run smoke; S04 extended CLI chat JSON metadata and reran CLI command tests, typecheck, build, and smoke with provider fallback assertions.
- Notes: Validated for the local skeleton. Packaging/bin alignment remains a follow-up before treating the CLI as publish-ready.

### R011 — Email and WhatsApp gateways exist as authenticated placeholders only, with no anonymous interaction path and no real channel integration in M001.
- Class: integration
- Status: validated
- Description: Email and WhatsApp gateways exist as authenticated placeholders only, with no anonymous interaction path and no real channel integration in M001.
- Why it matters: External channel boundaries must be safe from the start even before real integrations are built.
- Source: user
- Primary owning slice: M001/S02
- Supporting slices: M001/S03
- Validation: Validated by S02 registry/management API and Web tests proving authenticated placeholder gateway listings, selected-project management access, request-id diagnostics, placeholderOnly metadata, and no obvious secret-like fields in successful payloads.
- Notes: Validated only as authenticated placeholder surfaces. Real gateway integrations remain out of scope for M001.

### R012 — The platform includes registered placeholder building-domain tools and skills for BIM/IFC, Brick/RDF/SPARQL, time-series, cross-source linking, visualization, and HHW-style analysis, without real building analytics or real building data in M001.
- Class: differentiator
- Status: validated
- Description: The platform includes registered placeholder building-domain tools and skills for BIM/IFC, Brick/RDF/SPARQL, time-series, cross-source linking, visualization, and HHW-style analysis, without real building analytics or real building data in M001.
- Why it matters: The platform should visibly point toward BuildingAgent's building-operations direction while keeping v1 executable.
- Source: user
- Primary owning slice: M001/S02
- Supporting slices: M001/S03
- Validation: Validated by S02 registry/management API and Web tests covering synthetic runtime provider, tool, skill, gateway, and building-domain capability fixtures; S03 smoke exercised registry and management inspection through the authenticated CLI.
- Notes: Validated as placeholder-only BuildingAgent direction markers. Real BIM/Brick/time-series/HHW analytics remain deferred/out of scope for M001.

### R013 — The platform can be built, typechecked, tested, and smoke-tested locally through documented commands that exercise the API, Web UI, and CLI coherence path.
- Class: launchability
- Status: validated
- Description: The platform can be built, typechecked, tested, and smoke-tested locally through documented commands that exercise the API, Web UI, and CLI coherence path.
- Why it matters: A foundation skeleton is only useful if it can be run and verified locally.
- Source: user
- Primary owning slice: M001/S03
- Supporting slices: M001/S01, M001/S04
- Validation: Validated by S03 npm run smoke plus CLI tests/typecheck, and advanced by S04 full verification: API provider/chat tests, Web chat tests, CLI command tests, npm run typecheck, npm run build, and live npm run smoke all passed. Smoke exercised authenticated CLI login/project/registry/management/chat against live API/Web and asserted deterministic provider fallback metadata in the no-secret run.
- Notes: Default smoke remains no-secret and deterministic. Real-provider behavior is proven through injected/fake provider tests rather than live network credentials.

### R014 — The README documents local setup, seeded auth, CLI/Web/API usage, provider configuration, fallback behavior, and verification commands for the M001 skeleton.
- Class: operability
- Status: validated
- Description: The README documents local setup, seeded auth, CLI/Web/API usage, provider configuration, fallback behavior, and verification commands for the M001 skeleton.
- Why it matters: The builder/operator and local evaluator need a clear path to run the platform without tribal knowledge.
- Source: user
- Primary owning slice: M001/S04
- Supporting slices: M001/S01, M001/S03
- Validation: Validated by S01 README local-run documentation, S03 smoke documentation, and S04 README provider configuration/fallback instructions included in the full build/smoke-verified slice; redaction scan included README to guard against committed provider keys or secret-looking examples.
- Notes: S04 updated README coverage for provider environment variables, default mock fallback, explicit fallback policy, and verification commands. Final M001 validation should reconcile complete README coverage across all slices.

## Deferred

### R016 — The platform introduces first real building-operations workflow prototypes only after the foundation, project-scoped workspace, and mock-only data-source boundaries are proven.
- Class: differentiator
- Status: deferred
- Description: The platform introduces first real building-operations workflow prototypes only after the foundation, project-scoped workspace, and mock-only data-source boundaries are proven.
- Why it matters: BuildingAgent ultimately needs to become a building-operations assistant, not only a general agent shell.
- Source: user
- Primary owning slice: M003/none yet
- Supporting slices: none
- Validation: unmapped
- Notes: Deferred out of M002. M002 may show mock building-operations examples in chat, tasks, skills, or tools, but must not execute real workflows, controls, analytics, BMS operations, or cost-producing calls.

### R017 — Enterprise identity and account lifecycle capabilities such as SSO, invitations, and password reset are useful later but not required for v1.
- Class: admin/support
- Status: deferred
- Description: Enterprise identity and account lifecycle capabilities such as SSO, invitations, and password reset are useful later but not required for v1.
- Why it matters: These capabilities matter later but would distract from proving the local foundation skeleton.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: V1 uses seeded local users/tokens. Revisit when optimizing for external customers or enterprise deployment.

### R018 — Production-grade deployment is deferred beyond the first local working foundation.
- Class: operability
- Status: deferred
- Description: Production-grade deployment is deferred beyond the first local working foundation.
- Why it matters: The first version should prove platform boundaries locally before deployment hardening.
- Source: user
- Primary owning slice: none
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

### R037 — Real RAG, MCP tool calls, backend scheduling, repository file writes/deletes, BMS control, chiller shutdown, external operations, and unapproved cost-producing API calls are out of scope for M002.
- Class: anti-feature
- Status: out-of-scope
- Description: Real RAG, MCP tool calls, backend scheduling, repository file writes/deletes, BMS control, chiller shutdown, external operations, and unapproved cost-producing API calls are out of scope for M002.
- Why it matters: This prevents the UI milestone from accidentally creating unsafe operational behavior or hidden external costs.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: This is the explicit negative boundary for the UI-first mock/stub milestone. Mock images, mock task cards, mock tools, and mock building-domain examples may be shown only when labeled as non-operational.

## Traceability

| ID | Class | Status | Primary owner | Supporting | Proof |
|---|---|---|---|---|---|
| R001 | primary-user-loop | validated | M001/S05 | M001/S01, M001/S02, M001/S03, M001/S04 | Validated by S01-S04 evidence: S01 Web/API auth/project/chat tests, typecheck, and build; S02 authenticated registry/management API and Web tests; S03 authenticated CLI command tests and npm run smoke; S04 provider-backed chat tests/build/smoke proving provider invocation occurs only after auth, selected-project, membership, and permission checks. Scope is local M001 skeleton auth, not enterprise identity or production deployment. |
| R002 | primary-user-loop | validated | M001/S01 | M001/S03 | Validated by S01 verification: API auth/project/chat contract tests, Web App tests, typecheck, and build all passed on 2026-05-10. Evidence: npm test -- --run apps/api/src/auth.test.ts apps/api/src/chat.test.ts; npm test -- --run apps/web/src/App.test.tsx; npm run typecheck; npm run build. |
| R003 | compliance/security | validated | M001/S01 | M001/S02, M001/S03 | Validated by S01 API contract tests covering missing/invalid bearer tokens, forbidden project selection, selected-project enforcement, read/write permission checks, and project-scoped chat access; full slice verification passed on 2026-05-10. |
| R004 | core-capability | validated | M001/S01 | M002 | Validated by S01 API chat tests proving a user cannot select/chat in a project they are not a member of and chat history is read/written through the selected project boundary; full slice verification passed on 2026-05-10. |
| R005 | core-capability | validated | M001/S05 | M001/S01, M001/S04 | Validated at M001 skeleton/contract level by S01 Web/API foundation tests and S04 provider-backed chat tests/build/smoke. Evidence proves the local session/chat/provider seams and observable request-id/provider metadata, but does not claim a full autonomous planning/execution runtime. |
| R006 | core-capability | validated | M001/S05 | M001/S02, M001/S03 | Validated at M001 skeleton/contract level by S02 registry/management API and Web tests plus S03 CLI registry/management tests and npm run smoke. Evidence proves authenticated, bounded placeholder tool inspection and selected-project management checks; it does not claim real dispatcher execution. |
| R007 | core-capability | validated | M001/S05 | M001/S02, M001/S03 | Validated at M001 skeleton/contract level by S02 registry/management API and Web tests plus S03 CLI registry/management tests and npm run smoke. Evidence proves authenticated placeholder skill inspection; it does not claim real skill invocation. |
| R008 | integration | validated | M001/S04 | M001/S04 | Validated by S04 verification on 2026-05-10: npm test -- --run apps/api/src/chat.test.ts apps/api/src/providers.test.ts apps/web/src/App.test.tsx apps/cli/src/commands.test.ts passed 29 tests; npm run typecheck passed API/CLI/Web; npm run build passed all workspaces and Vite production build; npm run smoke passed live API/Web/CLI no-secret fallback flow; refined redaction scan found no unallowed real-looking provider key, bearer token, password, token, or API-key literal beyond documented seeded/test fixtures. |
| R009 | primary-user-loop | validated | M001/S02 | M001/S01 | Validated by S01 Web/API flow tests, typecheck, and build plus S02 Web management tests, typecheck, and build. Evidence includes S01 App tests for login/project/chat and S02 App tests for registry, gateway, building-domain tabs, diagnostics, malformed payload handling, and empty states. |
| R010 | primary-user-loop | validated | M001/S03 | M001/S04 | Validated by S03 CLI tests, typecheck, and npm run smoke; S04 extended CLI chat JSON metadata and reran CLI command tests, typecheck, build, and smoke with provider fallback assertions. |
| R011 | integration | validated | M001/S02 | M001/S03 | Validated by S02 registry/management API and Web tests proving authenticated placeholder gateway listings, selected-project management access, request-id diagnostics, placeholderOnly metadata, and no obvious secret-like fields in successful payloads. |
| R012 | differentiator | validated | M001/S02 | M001/S03 | Validated by S02 registry/management API and Web tests covering synthetic runtime provider, tool, skill, gateway, and building-domain capability fixtures; S03 smoke exercised registry and management inspection through the authenticated CLI. |
| R013 | launchability | validated | M001/S03 | M001/S01, M001/S04 | Validated by S03 npm run smoke plus CLI tests/typecheck, and advanced by S04 full verification: API provider/chat tests, Web chat tests, CLI command tests, npm run typecheck, npm run build, and live npm run smoke all passed. Smoke exercised authenticated CLI login/project/registry/management/chat against live API/Web and asserted deterministic provider fallback metadata in the no-secret run. |
| R014 | operability | validated | M001/S04 | M001/S01, M001/S03 | Validated by S01 README local-run documentation, S03 smoke documentation, and S04 README provider configuration/fallback instructions included in the full build/smoke-verified slice; redaction scan included README to guard against committed provider keys or secret-looking examples. |
| R015 | integration | active | M002/S06 | M002/S04, M002/S07 | mapped to M002 UI-first mock/stub plan |
| R016 | differentiator | deferred | M003/none yet | none | unmapped |
| R017 | admin/support | deferred | none | none | unmapped |
| R018 | operability | deferred | none | none | unmapped |
| R019 | differentiator | deferred | M003/none yet | none | unmapped |
| R020 | integration | deferred | M002/none yet | none | unmapped |
| R021 | anti-feature | out-of-scope | none | none | n/a |
| R022 | compliance/security | out-of-scope | none | none | n/a |
| R023 | constraint | out-of-scope | none | none | n/a |
| R024 | constraint | out-of-scope | none | none | n/a |
| R025 | anti-feature | out-of-scope | none | none | n/a |
| R026 | anti-feature | out-of-scope | none | none | n/a |
| R027 | constraint | out-of-scope | none | none | n/a |
| R028 | primary-user-loop | active | M002/S01-S04 | M002/S05, M002/S06, M002/S07 | validated only when the local UI shows the polished shell and the login → project selection → workspace path is exercised end-to-end. |
| R029 | quality-attribute | active | M002/S05 | M002/S04 | validated when browser and test evidence show assistant chat messages render Markdown to HTML across the supported elements. |
| R030 | quality-attribute | active | M002/S05 | M002/S04 | validated when inline image previews and a working enlargement flow are exercised in the browser. |
| R031 | primary-user-loop | active | M002/S06 | M002/S04 | validated when the KB surface is visible, project-scoped, and explicitly mock-only in the browser flow. |
| R032 | primary-user-loop | active | M002/S06 | M002/S04 | validated when the repository surface is visible, project-scoped, and the approval-gated future action language is present. |
| R033 | core-capability | active | M002/S07 | M002/S04 | validated when the browser and tests prove the section order and labels are stable. |
| R034 | launchability | active | M002/S01 | M002/S02, M002/S04 | validated when browser evidence shows the app shell or loading state appears immediately on startup and the blank-screen case is removed or materially reduced. |
| R035 | anti-feature | active | M002/S01-S07 | none | validated when the implementation and browser/tests show only mock/stub behaviors and no live external actions are reachable. |
| R036 | constraint | active | M002/S04 | M002/S05, M002/S06, M002/S07 | validated when the UI and API preserve account-level settings separation and project-scoped content boundaries. |
| R037 | anti-feature | out-of-scope | none | none | n/a |

## Coverage Summary

- Active requirements: 10
- Mapped to slices: 10
- Validated: 14 (R001, R002, R003, R004, R005, R006, R007, R008, R009, R010, R011, R012, R013, R014)
- Unmapped active requirements: 0
