# Requirements

This file is the explicit capability and coverage contract for the project.

## Active

### R001 — Hermes-first planning scaffold exists with documentation, repository structure, and placeholders only, without functional implementation.
- Class: launchability
- Status: active
- Description: Hermes-first planning scaffold exists with documentation, repository structure, and placeholders only, without functional implementation.
- Why it matters: This creates the foundation for disciplined implementation without prematurely locking architecture or adding functional complexity.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: none
- Validation: mapped
- Notes: M001 owns planning/scaffolding only. No functional Web, CLI, runtime, building-domain, or gateway provider implementation in this milestone.

### R002 — Hermes replication strategy is documented, including concepts to replicate, adapt, defer, and replace with building-domain logic.
- Class: constraint
- Status: active
- Description: Hermes replication strategy is documented, including concepts to replicate, adapt, defer, and replace with building-domain logic.
- Why it matters: The project’s first architectural move is to learn from Hermes deliberately rather than copying blindly.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: none
- Validation: mapped
- Notes: Must include `/mnt/d/Git_project/references/hermes-agent` and state that the Hermes reference repository is read-only.

### R003 — License attribution process exists for any future Hermes-derived MIT-licensed code copied or adapted into BuildingAgent.
- Class: compliance/security
- Status: active
- Description: License attribution process exists for any future Hermes-derived MIT-licensed code copied or adapted into BuildingAgent.
- Why it matters: Proper attribution keeps reuse legally and operationally clean.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: none
- Validation: mapped
- Notes: The full Hermes repository must not be vendored; copied code must be tracked and documented.

### R004 — Repository structure supports Web, API, CLI, gateways, runtime, memory, tools, skills, docs, tests, scripts, and license attribution tracking.
- Class: launchability
- Status: active
- Description: Repository structure supports Web, API, CLI, gateways, runtime, memory, tools, skills, docs, tests, scripts, and license attribution tracking.
- Why it matters: A coherent monorepo scaffold lets later milestones implement the foundation without reorganizing first.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: none
- Validation: mapped
- Notes: M001 creates folders only where functional implementation is not yet appropriate.

### R005 — Building-domain tool placeholders exist without functional BIM/IFC, Brick/RDF/SPARQL, time-series, cross-source linking, or visualization implementation.
- Class: constraint
- Status: active
- Description: Building-domain tool placeholders exist without functional BIM/IFC, Brick/RDF/SPARQL, time-series, cross-source linking, or visualization implementation.
- Why it matters: This reserves the building-domain architecture without prematurely implementing specialized logic.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: none
- Validation: mapped
- Notes: Placeholder Python files must contain only docstrings/TODO notes, no heavy imports and no real registration.

### R006 — Building-domain skill placeholders exist without detailed prompt logic or claims of implementation.
- Class: constraint
- Status: active
- Description: Building-domain skill placeholders exist without detailed prompt logic or claims of implementation.
- Why it matters: This reserves skill categories while keeping M001 focused on platform foundation planning.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: none
- Validation: mapped
- Notes: Placeholder skill files must include title, purpose, TODO status, expected future inputs, expected future outputs, and implementation notes placeholder only.

### R007 — Authenticated Web UI capability is specified before implementation.
- Class: primary-user-loop
- Status: active
- Description: Authenticated Web UI capability is specified before implementation.
- Why it matters: The Web UI is the first product interface and must be scoped before implementation starts.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: M002/none yet
- Validation: mapped
- Notes: M001 documents Web UI authentication and page requirements; M002 owns actual skeleton implementation.

### R008 — Web UI specification includes configuration pages for model/provider settings, skill management, tool management, project selection, data source settings, user and permission settings, and audit logs.
- Class: primary-user-loop
- Status: active
- Description: Web UI specification includes configuration pages for model/provider settings, skill management, tool management, project selection, data source settings, user and permission settings, and audit logs.
- Why it matters: Configuration surfaces are central to making the platform usable as a multi-project agent system rather than a single chat demo.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: M002/none yet
- Validation: mapped
- Notes: This is a specification requirement in M001, not a functional UI implementation requirement.

### R009 — Authenticated CLI capability is specified before implementation.
- Class: primary-user-loop
- Status: active
- Description: Authenticated CLI capability is specified before implementation.
- Why it matters: The CLI is required from the beginning for development and research workflows.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: M002/none yet
- Validation: mapped
- Notes: M001 documents CLI authentication and command requirements; M002 owns actual skeleton implementation.

### R010 — CLI specification includes commands for login/logout, project selection, model/provider configuration, skill enable/disable, tool enable/disable, and admin/debug operations.
- Class: primary-user-loop
- Status: active
- Description: CLI specification includes commands for login/logout, project selection, model/provider configuration, skill enable/disable, tool enable/disable, and admin/debug operations.
- Why it matters: The CLI must expose the core configuration workflow needed for development and research use.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: M002/none yet
- Validation: mapped
- Notes: This is a specification requirement in M001, not a functional CLI implementation requirement.

### R011 — Multi-workspace and multi-project isolation model is specified.
- Class: core-capability
- Status: active
- Description: Multi-workspace and multi-project isolation model is specified.
- Why it matters: The project model is foundational to safe multi-project use and future customer deployment.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: M003/none yet
- Validation: mapped
- Notes: Every project is an isolation boundary for data sources, conversations, memory, skills configuration, model configuration, tool permissions, and audit logs.

### R012 — RBAC-first access control model is specified with a future ABAC extension path.
- Class: compliance/security
- Status: active
- Description: RBAC-first access control model is specified with a future ABAC extension path.
- Why it matters: Access control must be designed in before tools, memory, and gateways become functional.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: M003/none yet
- Validation: mapped
- Notes: Suggested roles include Owner, Admin, Engineer, Operator, Viewer, External Reviewer, and Developer.

### R013 — Code/platform permissions are specified separately from project/data permissions.
- Class: compliance/security
- Status: active
- Description: Code/platform permissions are specified separately from project/data permissions.
- Why it matters: Separating operational authority from data access prevents unsafe role coupling.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: M003/none yet
- Validation: mapped
- Notes: A developer may modify platform code without automatically accessing customer data; an engineer may access project data without deployment rights.

### R014 — Persistent project-scoped memory model is specified.
- Class: core-capability
- Status: active
- Description: Persistent project-scoped memory model is specified.
- Why it matters: Memory is part of the Hermes-like foundation and must not leak across projects.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: M003/none yet
- Validation: mapped
- Notes: Memory must include session, user, project, and future building memory, with searchable storage and strict project isolation.

### R015 — Skill system capability is specified.
- Class: core-capability
- Status: active
- Description: Skill system capability is specified.
- Why it matters: Skills are a core extensibility mechanism for future operator and domain workflows.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: M002/none yet
- Validation: mapped
- Notes: Skills must support loader, registry, search, enable/disable, injection into prompts, and usage logging.

### R016 — Model/provider configuration capability is specified.
- Class: integration
- Status: active
- Description: Model/provider configuration capability is specified.
- Why it matters: Configurable providers are necessary for a practical agent platform and later deployment flexibility.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: M002/none yet
- Validation: mapped
- Notes: Web UI and CLI must eventually support provider add/test, model selection, default model per project, and permission scoping for provider use.

### R017 — Sensitive tool, memory, and data access must be audit logged.
- Class: failure-visibility
- Status: active
- Description: Sensitive tool, memory, and data access must be audit logged.
- Why it matters: Auditability is required for debugging, governance, and future enterprise readiness.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: M003/none yet
- Validation: mapped
- Notes: Every sensitive tool call should flow through the dispatcher and permission layer and produce an auditable record.

### R018 — Email gateway identity and context-resolution specification exists with placeholder adapter structure only.
- Class: integration
- Status: active
- Description: Email gateway identity and context-resolution specification exists with placeholder adapter structure only.
- Why it matters: Email is a required entry point, but M001 should only define its secure shape.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: M004/none yet
- Validation: mapped
- Notes: Email must require verified email identity and resolve user, workspace, project, role, and permission scopes. Real provider integrations are deferred.

### R019 — WhatsApp gateway identity and context-resolution specification exists with placeholder adapter structure only.
- Class: integration
- Status: active
- Description: WhatsApp gateway identity and context-resolution specification exists with placeholder adapter structure only.
- Why it matters: WhatsApp is a required entry point, but M001 should only define its secure shape.
- Source: user
- Primary owning slice: M001/none yet
- Supporting slices: M004/none yet
- Validation: mapped
- Notes: WhatsApp must require verified phone identity and resolve user, workspace, project, role, and permission scopes. Real provider integrations are deferred.

### R020 — Authenticated Web UI skeleton is implemented.
- Class: primary-user-loop
- Status: active
- Description: Authenticated Web UI skeleton is implemented.
- Why it matters: The Web UI is the first product interface and must become usable after the planning scaffold.
- Source: user
- Primary owning slice: M002/none yet
- Supporting slices: none
- Validation: mapped
- Notes: M002 owns actual implementation of login/register, project dashboard/selector, chat workspace, configuration pages, memory/history, and audit log page skeletons.

### R021 — Authenticated CLI skeleton is implemented.
- Class: primary-user-loop
- Status: active
- Description: Authenticated CLI skeleton is implemented.
- Why it matters: The CLI is required from the beginning for development and research workflows.
- Source: user
- Primary owning slice: M002/none yet
- Supporting slices: none
- Validation: mapped
- Notes: M002 owns actual implementation of login/logout, project, chat, model, skill, tool, and admin/debug command skeletons.

### R023 — Hermes-like runtime, memory, tool, skill, and model configuration skeletons are implemented.
- Class: core-capability
- Status: active
- Description: Hermes-like runtime, memory, tool, skill, and model configuration skeletons are implemented.
- Why it matters: This is the executable foundation for later BuildingAgent capabilities.
- Source: user
- Primary owning slice: M002/none yet
- Supporting slices: M003/none yet
- Validation: mapped
- Notes: M002 owns implementation skeletons only; complete permission integration and enforcement deepen in M003.

### R024 — Permission checks are enforced in backend runtime and tool dispatcher.
- Class: compliance/security
- Status: active
- Description: Permission checks are enforced in backend runtime and tool dispatcher.
- Why it matters: Frontend hiding is not security; enforcement must live where actions execute.
- Source: user
- Primary owning slice: M003/none yet
- Supporting slices: none
- Validation: mapped
- Notes: No tool call should bypass backend-side authorization. M003 owns enforcement after M002 skeletons exist.

### R025 — Project-scoped memory and data isolation is enforced.
- Class: compliance/security
- Status: active
- Description: Project-scoped memory and data isolation is enforced.
- Why it matters: Isolation is a hard safety property for multi-project work.
- Source: user
- Primary owning slice: M003/none yet
- Supporting slices: none
- Validation: mapped
- Notes: Project A memory/data must never be retrieved for Project B; user-private memory must not be visible to other users.

### R026 — Untitled
- Class: core-capability
- Status: active
- Why it matters: A single authoritative request context is the basis for authorization, memory isolation, and audit logging.
- Source: user
- Primary owning slice: M003/none yet
- Supporting slices: M002/S01
- Validation: M002/S01 backend/API proof: request context resolves user_id, workspace_id, project_id, role, and permission_scopes for seeded memberships and rejects inaccessible projects; verified by 26 passing API/domain tests and TestClient smoke. Still active until CLI/Web/runtime entry points resolve the same context object.
- Notes: S01 materially advances and partially validates the backend request-context contract for API entry points. Full all-entrypoint validation remains dependent on later CLI/Web/runtime slices.

### R027 — Development workflow requires git status, git add, git commit, and git push at each implementation milestone.
- Class: operability
- Status: active
- Description: Development workflow requires git status, git add, git commit, and git push at each implementation milestone.
- Why it matters: Every milestone must leave a recoverable history and shareable state.
- Source: user
- Primary owning slice: M002/none yet
- Supporting slices: M002, M003, M004, M005
- Validation: mapped
- Notes: M001 is planning only, but later implementation milestones must end with this hygiene step.

## Validated

### R022 — Untitled
- Class: core-capability
- Status: validated
- Why it matters: The runtime and entry points need backend-side identity and project context from the start.
- Source: user
- Primary owning slice: M002/S01
- Validation: M002/S01 verified by `.venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py` (26 passed) plus TestClient smoke covering `/health`, `/auth/dev-login`, `/auth/me` unauthenticated401, `/projects`, and `/projects/{project_id}/context` with request-id propagation.
- Notes: M002/S01 implemented backend-local/dev users, workspaces, projects, memberships, roles, permissions, and reusable request-context objects with seeded in-memory data. Production identity/persistence remain out of scope for this skeleton.

## Deferred

### R028 — Email provider integrations are deferred.
- Class: integration
- Status: deferred
- Description: Email provider integrations are deferred.
- Why it matters: M001 should define the adapter shape but not implement external mail connectivity.
- Source: user
- Primary owning slice: M004/none yet
- Supporting slices: none
- Validation: unmapped
- Notes: Real Gmail, IMAP, SMTP, or similar provider integrations remain out of M001 scope.

### R029 — WhatsApp provider integrations are deferred.
- Class: integration
- Status: deferred
- Description: WhatsApp provider integrations are deferred.
- Why it matters: M001 should define the adapter shape but not implement external messaging connectivity.
- Source: user
- Primary owning slice: M004/none yet
- Supporting slices: none
- Validation: unmapped
- Notes: Real WhatsApp Cloud API, Twilio, or similar provider integrations remain out of M001 scope.

### R030 — Functional BIM/IFC tools are deferred.
- Class: core-capability
- Status: deferred
- Description: Functional BIM/IFC tools are deferred.
- Why it matters: BIM/IFC is important later but must not distract from the Hermes-like foundation.
- Source: user
- Primary owning slice: M005/none yet
- Supporting slices: none
- Validation: unmapped
- Notes: No ifcopenshell import, BIM parsing, or IFC logic in M001 placeholders.

### R031 — Functional Brick/RDF/SPARQL tools are deferred.
- Class: core-capability
- Status: deferred
- Description: Functional Brick/RDF/SPARQL tools are deferred.
- Why it matters: Brick/RDF/SPARQL capabilities depend on the platform foundation and should be scoped later.
- Source: user
- Primary owning slice: M005/none yet
- Supporting slices: none
- Validation: unmapped
- Notes: No rdflib import, SPARQL execution, or Brick model logic in M001 placeholders.

### R032 — Functional time-series tools are deferred.
- Class: core-capability
- Status: deferred
- Description: Functional time-series tools are deferred.
- Why it matters: Time-series analysis should be implemented after runtime, memory, permissions, and data source models exist.
- Source: user
- Primary owning slice: M005/none yet
- Supporting slices: none
- Validation: unmapped
- Notes: No pandas import, database connectors, trend analysis, or plotting logic in M001 placeholders.

### R033 — Functional cross-source linking tools are deferred.
- Class: core-capability
- Status: deferred
- Description: Functional cross-source linking tools are deferred.
- Why it matters: Cross-source linking requires mature data models and should be scoped after the foundation.
- Source: user
- Primary owning slice: M005/none yet
- Supporting slices: none
- Validation: unmapped
- Notes: No real entity resolution, BIM-Brick-timeseries linking, or data fusion logic in M001 placeholders.

### R034 — Functional visualization tools are deferred.
- Class: core-capability
- Status: deferred
- Description: Functional visualization tools are deferred.
- Why it matters: Visualization should build on confirmed data/runtime architecture rather than precede it.
- Source: user
- Primary owning slice: M005/none yet
- Supporting slices: none
- Validation: unmapped
- Notes: No matplotlib import, plotting implementation, dashboard visualization logic, or heavy visualization dependencies in M001 placeholders.

### R035 — Scheduler, subagent, and trajectory/context compression implementation is deferred.
- Class: differentiator
- Status: deferred
- Description: Scheduler, subagent, and trajectory/context compression implementation is deferred.
- Why it matters: These are advanced Hermes-like capabilities, not necessary for the first foundation proof.
- Source: user
- Primary owning slice: M003/none yet
- Supporting slices: none
- Validation: unmapped
- Notes: M001 and M002 may document future support, but functional implementation waits until the core foundation is stable.

### R036 — Enterprise-grade ABAC and compliance implementation is deferred.
- Class: compliance/security
- Status: deferred
- Description: Enterprise-grade ABAC and compliance implementation is deferred.
- Why it matters: The MVP should optimize for fast researcher/operator iteration while preserving a future governance path.
- Source: user
- Primary owning slice: M003/none yet
- Supporting slices: none
- Validation: unmapped
- Notes: Architecture must allow future enterprise governance, but MVP should not overbuild compliance workflows.

### R037 — External customer/project team deployment readiness is deferred.
- Class: launchability
- Status: deferred
- Description: External customer/project team deployment readiness is deferred.
- Why it matters: Customer deployment should follow proven architecture, workflow, and governance foundations.
- Source: user
- Primary owning slice: M005/none yet
- Supporting slices: none
- Validation: unmapped
- Notes: The first MVP targets the owner’s development/research workflow and internal building-engineering/research team, not customer deployment.

## Out of Scope

### R038 — Streamlit must not be used for the Web UI.
- Class: anti-feature
- Status: out-of-scope
- Description: Streamlit must not be used for the Web UI.
- Why it matters: This prevents the Web UI from being implemented as a temporary prototype stack that does not match the target product.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Use a modern React/Next.js AI frontend approach instead.

### R039 — Anonymous Email or WhatsApp interaction is not allowed.
- Class: anti-feature
- Status: out-of-scope
- Description: Anonymous Email or WhatsApp interaction is not allowed.
- Why it matters: Anonymous gateways would bypass the permission and audit model.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Email requires verified email identity; WhatsApp requires verified phone identity; both must resolve user/workspace/project context.

### R040 — Functional building-domain logic is out of scope for M001.
- Class: anti-feature
- Status: out-of-scope
- Description: Functional building-domain logic is out of scope for M001.
- Why it matters: M001 must establish platform architecture before domain logic.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: No BIM/IFC, Brick/RDF/SPARQL, time-series, cross-source linking, visualization, or HHW analysis logic in the planning scaffold.

### R041 — Vendoring the full Hermes repository into BuildingAgent is not allowed.
- Class: anti-feature
- Status: out-of-scope
- Description: Vendoring the full Hermes repository into BuildingAgent is not allowed.
- Why it matters: Vendoring the full reference would blur architecture ownership and increase maintenance risk.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Small, well-understood copied/adapted modules may be considered later with attribution and rationale.

### R042 — Modifying the Hermes reference repository is not allowed.
- Class: anti-feature
- Status: out-of-scope
- Description: Modifying the Hermes reference repository is not allowed.
- Why it matters: The reference repository should remain stable and unmodified as an architectural source.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: The local Hermes path `/mnt/d/Git_project/references/hermes-agent` is read-only for BuildingAgent work.

### R043 — Secrets or credentials must not be committed to Git.
- Class: anti-feature
- Status: out-of-scope
- Description: Secrets or credentials must not be committed to Git.
- Why it matters: Secret leakage would create immediate security risk and undermine deployment readiness.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: No hard-coded API keys, tokens, passwords, provider credentials, or customer secrets in repository files.

### R044 — Real customer or private building data must not be stored in the repository.
- Class: anti-feature
- Status: out-of-scope
- Description: Real customer or private building data must not be stored in the repository.
- Why it matters: Private building data belongs behind project-scoped storage and access controls, not in Git.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Use synthetic/demo data later unless explicit secure data handling is designed.

### R045 — Frontend-only permission enforcement is not allowed.
- Class: anti-feature
- Status: out-of-scope
- Description: Frontend-only permission enforcement is not allowed.
- Why it matters: Security decisions must be enforced by the backend runtime and dispatcher.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: UI hiding may improve UX but cannot be the enforcement mechanism.

### R046 — Unrestricted shell or code execution without permission checks is not allowed.
- Class: anti-feature
- Status: out-of-scope
- Description: Unrestricted shell or code execution without permission checks is not allowed.
- Why it matters: Execution tools are powerful enough to damage data, leak secrets, or alter deployments.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Shell/code execution is high-risk and must be gated by tool risk level and permissions before implementation.

### R047 — Tool calls bypassing the backend permission layer are not allowed.
- Class: anti-feature
- Status: out-of-scope
- Description: Tool calls bypassing the backend permission layer are not allowed.
- Why it matters: Bypasses would invalidate the access-control and audit model.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: All tool calls must go through the tool dispatcher and permission checks.

### R048 — Project memory or data leakage across projects is not allowed.
- Class: anti-feature
- Status: out-of-scope
- Description: Project memory or data leakage across projects is not allowed.
- Why it matters: Cross-project leakage is a hard safety failure for a multi-project platform.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Project A memory/data must not be retrieved for Project B under any entry point.

### R049 — Direct production deployment is out of scope for the first milestones.
- Class: anti-feature
- Status: out-of-scope
- Description: Direct production deployment is out of scope for the first milestones.
- Why it matters: Premature deployment would force operational decisions before the platform foundation is proven.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: The early work proves architecture and development workflow before production customer deployment.

### R050 — Over-engineered enterprise compliance implementation is out of scope for the MVP.
- Class: anti-feature
- Status: out-of-scope
- Description: Over-engineered enterprise compliance implementation is out of scope for the MVP.
- Why it matters: The first product loop should stay usable for researcher/operator iteration.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Architecture must allow future enterprise governance, but MVP should not implement heavy compliance workflows prematurely.

### R051 — Heavy frontend or backend dependency lock-in before architecture confirmation is not allowed.
- Class: anti-feature
- Status: out-of-scope
- Description: Heavy frontend or backend dependency lock-in before architecture confirmation is not allowed.
- Why it matters: Early lock-in can constrain the architecture before the Hermes-first foundation is clear.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: M001 can compare options and recommend MVP approaches, but should avoid installing heavy dependencies.

### R052 — Blind copying of Hermes code without understanding, attribution, and clear adaptation rationale is not allowed.
- Class: anti-feature
- Status: out-of-scope
- Description: Blind copying of Hermes code without understanding, attribution, and clear adaptation rationale is not allowed.
- Why it matters: The goal is an adapted BuildingAgent architecture, not an unexamined clone.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Any future copied Hermes code must be small, understood, attributed, and documented with adaptation rationale.

### R053 — Functional HHW reset analysis logic is out of scope for M001.
- Class: anti-feature
- Status: out-of-scope
- Description: Functional HHW reset analysis logic is out of scope for M001.
- Why it matters: The goal is an adapted BuildingAgent architecture, not an unexamined clone.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: HHW reset analysis may become a future building-domain skill/tool area, but M001 must keep it as placeholder-only documentation with no analysis logic.

## Traceability

| ID | Class | Status | Primary owner | Supporting | Proof |
|---|---|---|---|---|---|
| R001 | launchability | active | M001/none yet | none | mapped |
| R002 | constraint | active | M001/none yet | none | mapped |
| R003 | compliance/security | active | M001/none yet | none | mapped |
| R004 | launchability | active | M001/none yet | none | mapped |
| R005 | constraint | active | M001/none yet | none | mapped |
| R006 | constraint | active | M001/none yet | none | mapped |
| R007 | primary-user-loop | active | M001/none yet | M002/none yet | mapped |
| R008 | primary-user-loop | active | M001/none yet | M002/none yet | mapped |
| R009 | primary-user-loop | active | M001/none yet | M002/none yet | mapped |
| R010 | primary-user-loop | active | M001/none yet | M002/none yet | mapped |
| R011 | core-capability | active | M001/none yet | M003/none yet | mapped |
| R012 | compliance/security | active | M001/none yet | M003/none yet | mapped |
| R013 | compliance/security | active | M001/none yet | M003/none yet | mapped |
| R014 | core-capability | active | M001/none yet | M003/none yet | mapped |
| R015 | core-capability | active | M001/none yet | M002/none yet | mapped |
| R016 | integration | active | M001/none yet | M002/none yet | mapped |
| R017 | failure-visibility | active | M001/none yet | M003/none yet | mapped |
| R018 | integration | active | M001/none yet | M004/none yet | mapped |
| R019 | integration | active | M001/none yet | M004/none yet | mapped |
| R020 | primary-user-loop | active | M002/none yet | none | mapped |
| R021 | primary-user-loop | active | M002/none yet | none | mapped |
| R022 | core-capability | validated | M002/S01 | none | M002/S01 verified by `.venv/bin/python -m pytest tests/test_api_foundation.py tests/test_project_context.py tests/test_api_auth_context.py` (26 passed) plus TestClient smoke covering `/health`, `/auth/dev-login`, `/auth/me` unauthenticated401, `/projects`, and `/projects/{project_id}/context` with request-id propagation. |
| R023 | core-capability | active | M002/none yet | M003/none yet | mapped |
| R024 | compliance/security | active | M003/none yet | none | mapped |
| R025 | compliance/security | active | M003/none yet | none | mapped |
| R026 | core-capability | active | M003/none yet | M002/S01 | M002/S01 backend/API proof: request context resolves user_id, workspace_id, project_id, role, and permission_scopes for seeded memberships and rejects inaccessible projects; verified by 26 passing API/domain tests and TestClient smoke. Still active until CLI/Web/runtime entry points resolve the same context object. |
| R027 | operability | active | M002/none yet | M002, M003, M004, M005 | mapped |
| R028 | integration | deferred | M004/none yet | none | unmapped |
| R029 | integration | deferred | M004/none yet | none | unmapped |
| R030 | core-capability | deferred | M005/none yet | none | unmapped |
| R031 | core-capability | deferred | M005/none yet | none | unmapped |
| R032 | core-capability | deferred | M005/none yet | none | unmapped |
| R033 | core-capability | deferred | M005/none yet | none | unmapped |
| R034 | core-capability | deferred | M005/none yet | none | unmapped |
| R035 | differentiator | deferred | M003/none yet | none | unmapped |
| R036 | compliance/security | deferred | M003/none yet | none | unmapped |
| R037 | launchability | deferred | M005/none yet | none | unmapped |
| R038 | anti-feature | out-of-scope | none | none | n/a |
| R039 | anti-feature | out-of-scope | none | none | n/a |
| R040 | anti-feature | out-of-scope | none | none | n/a |
| R041 | anti-feature | out-of-scope | none | none | n/a |
| R042 | anti-feature | out-of-scope | none | none | n/a |
| R043 | anti-feature | out-of-scope | none | none | n/a |
| R044 | anti-feature | out-of-scope | none | none | n/a |
| R045 | anti-feature | out-of-scope | none | none | n/a |
| R046 | anti-feature | out-of-scope | none | none | n/a |
| R047 | anti-feature | out-of-scope | none | none | n/a |
| R048 | anti-feature | out-of-scope | none | none | n/a |
| R049 | anti-feature | out-of-scope | none | none | n/a |
| R050 | anti-feature | out-of-scope | none | none | n/a |
| R051 | anti-feature | out-of-scope | none | none | n/a |
| R052 | anti-feature | out-of-scope | none | none | n/a |
| R053 | anti-feature | out-of-scope | none | none | n/a |

## Coverage Summary

- Active requirements: 26
- Mapped to slices: 26
- Validated: 1 (R022)
- Unmapped active requirements: 0
