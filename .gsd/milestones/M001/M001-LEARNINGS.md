---
phase: complete-milestone
phase_name: M001 Learnings Extraction
project: BuildingAgent
generated: 2026-05-10T16:45:00Z
counts:
  decisions: 5
  lessons: 5
  patterns: 5
  surprises: 3
missing_artifacts: []
---

# M001 Learnings: Local Hermes-Like Foundation Skeleton

### Decisions

- Chose an npm workspace monorepo with a TypeScript Fastify API, Vite React Web UI, and TypeScript CLI so the local platform can be verified through shared root scripts while preserving separate entrypoint boundaries.
  Source: S01-SUMMARY.md/Key decisions; S03-SUMMARY.md/Key decisions

- Chose backend-side bearer auth, selected-project state, project membership, and permission checks as the source of truth for all protected Web/API/CLI/provider operations rather than trusting browser or CLI state.
  Source: S01-SUMMARY.md/Patterns established; S04-SUMMARY.md/Key decisions

- Chose bounded authenticated placeholder registry and project-management APIs with `placeholderOnly`, `limit`, and `requestId` metadata so future runtime/tool/skill/gateway/building-domain surfaces are visible without becoming live integrations.
  Source: S02-SUMMARY.md/Key decisions

- Chose a backend provider ports-and-adapters seam that prefers configured OpenAI-compatible providers and uses deterministic mock fallback for no-secret local/CI/smoke runs.
  Source: S04-SUMMARY.md/Key decisions

- Chose to make the M001 validation artifact and requirements matrix the closure source of truth for validated, skeleton-only, deferred, and out-of-scope claims.
  Source: S05-SUMMARY.md/Key decisions

### Lessons

- The auth/session/project boundary had to land first because registry, CLI, smoke, and provider-backed chat all reuse the same `userId`, `projectId`, and `permissions` contract.
  Source: S01-SUMMARY.md/What Happened

- Placeholder surfaces are easy to overclaim unless the artifacts repeatedly state that gateway, building-domain, tool, and skill surfaces are synthetic inspections rather than live integrations.
  Source: M001-VALIDATION.md/Requirement coverage matrix

- A smoke check that uses the built CLI against live API/Web services gives stronger platform evidence than unit tests alone because it catches startup, config, auth persistence, request-id diagnostics, and cleanup behavior together.
  Source: S03-SUMMARY.md/What Happened

- Real-provider-first architecture can still be safe for local verification if live-provider calls are env-gated and default smoke asserts deterministic fallback metadata rather than requiring secrets.
  Source: S04-SUMMARY.md/Verification

- Requirement wording must be reconciled after implementation because early broad requirements can imply production runtime, real dispatcher, or real analytics scope that the local skeleton did not and should not claim.
  Source: S05-SUMMARY.md/What Happened

### Patterns

- Reuse canonical request-id-bearing API error envelopes across Web and CLI so future agents can diagnose auth, project, malformed payload, provider, and service availability failures without secret exposure.
  Source: S01-SUMMARY.md/Patterns established; S03-SUMMARY.md/Patterns established

- Put provider invocation behind backend auth, selected-project, membership, and permission guards; clients should render provider metadata but never own provider selection or secrets.
  Source: S04-SUMMARY.md/Patterns established

- Parse API payloads strictly at Web/CLI boundaries and fail closed with `api_malformed` rather than silently rendering partial or unexpected placeholder data.
  Source: S02-SUMMARY.md/Patterns established; S03-SUMMARY.md/Key decisions

- Treat `npm run smoke` as the authoritative local coherence check and make its output agent-readable with stage markers, request ids, child exit codes, fallback assertions, and cleanup logs.
  Source: S03-SUMMARY.md/Observability surfaces; M001-VALIDATION.md/Operational verification

- Use requirements and validation artifacts as a closure record that explicitly separates proven local skeleton behavior, skeleton-only contracts, deferred work, and negative boundaries.
  Source: S05-SUMMARY.md/Patterns established

### Surprises

- The workspace package did not expose the CLI as a linked `@building-agent/cli` binary in this install, so smoke had to use the verified emitted build artifact path.
  Source: S03-SUMMARY.md/Deviations

- Closure review surfaced that Web project-management responses should validate `projectId` exactly against the requested id before real integrations land.
  Source: S02-SUMMARY.md/Known Limitations

- Final validation required a remediation-round operational rerun to prove smoke and README command coverage freshly at milestone closure, not just from prior slice evidence.
  Source: M001-VALIDATION.md/Verification classes
