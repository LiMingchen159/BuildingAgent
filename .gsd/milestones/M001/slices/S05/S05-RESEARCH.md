# S05 Research — Requirement coverage reconciliation remediation

## Summary

S05 is a traceability and boundary-reconciliation slice, not a new feature slice. The codebase already proves the authenticated Web/CLI/API foundation, placeholder registry/management surfaces, strict client parsing, provider-backed chat fallback, and the default no-secret smoke path. The remaining work is to make the requirements record say exactly that: what is proven, what is only skeleton coverage, and what remains intentionally out of scope.

## Active requirements this slice owns or supports

Owned by M001/S05:
- **R001** — all user-facing entry points require authentication.
- **R005** — Hermes-inspired general agent runtime skeleton.
- **R006** — permission-checked tool registry and dispatcher skeleton.
- **R007** — skill registry skeleton with placeholder invocation boundaries.

Supported by S05 verification and coverage cleanup:
- **R013** — local build/typecheck/test/smoke launchability.
- **R014** — README run/auth/provider/smoke instructions.

## What the current code already proves

### Authenticated foundation is real, not implied

The API enforces bearer auth before protected work. `apps/api/src/auth.ts` centralizes canonical error envelopes with request ids and project/membership/permission guards. `apps/api/src/server.ts` wires those guards into the login, session, project selection, project chat, registry, and management routes. The project-selection and project-scoped chat contract is already exercised by S01/S03 tests and the smoke runner.

### Placeholder registry/management surfaces are bounded and synthetic

`apps/api/src/seed.ts` seeds only synthetic runtime providers, tools, skills, gateways, and building-operations capability fixtures. `apps/api/src/server.ts` exposes them through authenticated read-only `/api/registry` and selected-project `/api/projects/:projectId/management` endpoints. Both responses are bounded by `maxListSize`, mark `placeholderOnly: true`, and include `requestId` for diagnostics. The registry/management tests explicitly assert no obvious secret-like fields.

### Web and CLI clients fail closed on malformed placeholder data

`apps/web/src/api.ts` and `apps/cli/src/registry.ts` both parse registry/management payloads strictly and throw `api_malformed` instead of silently dropping unexpected shapes. That means S05 can rely on the current client behavior as evidence that placeholder boundaries are not being treated as live integrations.

### The README and smoke path already describe the runnable local contract

`README.md` already documents seeded auth, provider configuration, fallback behavior, CLI usage, and `npm run smoke`. `scripts/smoke-local.cjs` proves the end-to-end local path by logging in, selecting a project, inspecting registry/management, and running chat through the built CLI against live local API/Web services.

## Important boundary note

The current code proves **skeleton and placeholder coverage**, not real runtime/dispatcher/skill execution.

That matters for these active requirements:
- **R005** is only partially proven by the session/chat/provider/runtime seams. The project has a Hermes-inspired runtime shape, but not a full execution-loop contract in the product sense.
- **R006** is proven as an authenticated placeholder registry surface, but not as a complete tool dispatcher with real permission-gated execution.
- **R007** is proven as a skill registry/listing boundary, but not as a complete invoke-and-run skill engine.

S05 should therefore be careful about language. If it updates requirements, it should either:
1. keep those requirements active with notes that they are skeleton-only, or
2. narrow their validation language to the exact placeholder/surface behavior that exists today.

## Out-of-scope / intentionally deferred boundaries to preserve in coverage cleanup

These should be called out explicitly so the milestone does not overclaim:
- **R017** — enterprise identity/account lifecycle.
- **R018** — production-grade deployment.
- **R019** — real analytics and cross-source reasoning.
- **R020** — real BIM/Brick/RDF/SPARQL/time-series/mapping integrations.
- **R021** — Streamlit UI is prohibited.
- **R022** — anonymous interaction is prohibited.
- **R023** — real customer building data must not be stored in-repo.
- **R024** — the Hermes reference repo must not be modified.
- **R025** — no real BIM/IFC, Brick/RDF/SPARQL, time-series analytics, visualization, cross-source reasoning, or HHW in v1.
- **R026** — no enterprise auth features in v1.
- **R027** — selective Hermes reuse only; no blind vendoring.

The S05 write-up should make these boundaries explicit so placeholder gateway/building-domain surfaces are not read as live integrations.

## Natural seams for execution

1. **Requirements record cleanup**
   - Update `.gsd/REQUIREMENTS.md` notes/status/validation wording for R001, R005, R006, and R007 so the record matches the proven surface area.
   - Reconfirm that deferred and out-of-scope requirements are explicitly framed as such.

2. **Milestone validation artifact**
   - Produce the M001 validation artifact with a coverage matrix showing which requirements are validated, which are skeleton-only, and which are intentionally deferred.
   - This is the main place to prove the milestone does not overstate placeholder surfaces as real integrations.

3. **README traceability only if needed**
   - Only touch README if the coverage review uncovers a user-facing wording mismatch.
   - The current README already appears adequate for local runability and no-secret smoke behavior.

## What to build or prove first

1. Audit the active requirements one by one against the existing slice summaries and code markers.
2. Decide whether R005/R006/R007 should remain active with clarified skeleton-only notes or be marked validated with narrowed wording.
3. Write the milestone validation so it distinguishes proven placeholder boundaries from future real integrations.
4. Avoid source changes unless the audit finds a genuine wording mismatch in user-facing docs.

## Verification approach

- Use the existing S01–S04 verification evidence as proof sources rather than re-running feature work.
- Cross-check the requirement notes against `apps/api/src/server.ts`, `apps/api/src/seed.ts`, `apps/web/src/api.ts`, `apps/cli/src/registry.ts`, `README.md`, and `scripts/smoke-local.cjs`.
- The final S05 proof should be a traceability/coverage artifact, not another platform feature test run.

## Surprises / constraints

- The repository already has strong negative-boundary behavior for malformed placeholder data; this is a good basis for the reconciliation slice.
- The main risk is not missing functionality, but **overstating** what the placeholder surfaces mean.
- The write-up should keep the distinction sharp between “synthetic placeholder listing” and “real integration or execution engine.”
