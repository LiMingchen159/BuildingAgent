---
id: M001
title: "Local Hermes-Like Foundation Skeleton"
status: complete
completed_at: 2026-05-10T16:45:13.989Z
key_decisions:
  - Use Hermes Agent as a read-only engineering baseline/reference while preserving BuildingAgent-specific structure, permissions, and attribution.
  - Keep M001 focused on a local authenticated Web/API/CLI foundation with building-domain and gateway capabilities represented as placeholders only.
  - Use an npm workspace monorepo with TypeScript Fastify API, React/Vite Web UI, and TypeScript CLI workspaces.
  - Use seeded local username/password auth returning bearer/session tokens for Web and CLI, guarded by backend membership, selected-project, and permission checks.
  - Expose placeholder runtime/tool/skill/gateway/building-domain surfaces through bounded authenticated API contracts: global registry plus selected-project management listings.
  - Implement provider-backed chat as a backend ports-and-adapters seam that prefers configured OpenAI-compatible providers and falls back deterministically for no-secret local/CI smoke paths.
  - Treat the milestone validation artifact and requirements matrix as the closure source of truth for validated, skeleton-only, deferred, and out-of-scope claims.
key_files:
  - package.json
  - package-lock.json
  - tsconfig.base.json
  - scripts/run-tests.cjs
  - scripts/smoke-local.cjs
  - apps/api/src/auth.ts
  - apps/api/src/server.ts
  - apps/api/src/providers.ts
  - apps/api/src/seed.ts
  - apps/api/src/auth.test.ts
  - apps/api/src/chat.test.ts
  - apps/api/src/registry.test.ts
  - apps/api/src/providers.test.ts
  - apps/web/src/api.ts
  - apps/web/src/App.tsx
  - apps/web/src/styles.css
  - apps/web/src/App.test.tsx
  - apps/cli/src/config.ts
  - apps/cli/src/api.ts
  - apps/cli/src/commands.ts
  - apps/cli/src/registry.ts
  - apps/cli/src/commands.test.ts
  - README.md
  - .gsd/PROJECT.md
  - .gsd/REQUIREMENTS.md
  - .gsd/milestones/M001/M001-VALIDATION.md
lessons_learned:
  - Backend-side auth, selected-project, membership, and permission checks must be established first because every later surface depends on that session shape.
  - Placeholder registry/management surfaces need explicit `placeholderOnly`, `limit`, and request-id metadata so future agents do not confuse synthetic contracts with live integrations.
  - Smoke checks are most valuable when they exercise the built CLI against live API/Web services and emit request ids, stage markers, child exits, and cleanup logs.
  - Provider-backed chat can satisfy real-provider-first architecture without requiring secrets in local smoke by using a deterministic fallback plus fake/injected provider tests.
  - Requirement reconciliation must anchor wording to actual evidence; otherwise local skeleton milestones can accidentally overclaim real runtime, gateway, tool, skill, or building-domain integrations.
---

# M001: Local Hermes-Like Foundation Skeleton

**M001 delivers a verified local Hermes-like BuildingAgent foundation: authenticated Web/API/CLI flows, project-scoped chat, placeholder registry/management surfaces, provider-backed chat fallback, smoke checks, and reconciled requirement boundaries.**

## What Happened

M001 built the first coherent BuildingAgent foundation skeleton. S01 created the Fastify API and React/Vite Web vertical slice for seeded local login, project listing/selection, backend-enforced membership and permissions, canonical request-id-bearing errors, and project-scoped chat. S02 expanded the authenticated surface with bounded placeholder registry and project-management contracts for runtime providers, tools, skills, gateways, and building-domain capabilities, then rendered those through Web management tabs while keeping chat intact. S03 added the TypeScript CLI workspace and root smoke runner, proving that seeded auth, project selection, registry/management inspection, and chat work outside the browser against live local services. S04 converted chat into an explicit provider-backed contract: the backend owns provider selection, prefers configured OpenAI-compatible mode, uses deterministic mock fallback for no-secret local/CI/smoke runs, and exposes redaction-safe provider diagnostics to API/Web/CLI. S05 closed the traceability gap by reconciling requirements and validation language so validated local skeleton behavior, skeleton-only contracts, deferred capabilities, and negative boundaries are explicit. Final validation confirmed all success criteria, slice outputs, requirement coverage, implementation evidence, and fresh operational smoke/README checks pass without claiming production auth, real building analytics, real gateway integration, real tool dispatch, real skill invocation, or live external provider readiness.

## Success Criteria Results

- ✅ Seeded user Web flow: S01 verifies seeded login, authorized project selection, and project-scoped Web chat through API/Web tests, typecheck, and build.
- ✅ Backend authorization and project permissions: S01 verifies missing/invalid bearer tokens, forbidden project selection, selected-project enforcement, read/write permission checks, and project-scoped chat access; later slices reuse those guards.
- ✅ Authenticated placeholder inspection: S02 verifies authenticated runtime/tool/skill/gateway/building-domain placeholder listings through API and Web; S03 verifies the same contracts through CLI/smoke.
- ✅ CLI and smoke coherence: S03 delivers authenticated CLI login/session/project/chat/registry/management commands and root smoke; S04 extends smoke to provider fallback metadata; remediation-round-1 reran `npm run smoke` successfully.
- ✅ README/local launchability: README coverage was verified for `npm run dev:api`, `npm run dev:web`, direct built CLI examples, `npm run typecheck`, `npm run build`, `npm run smoke`, and verification commands.
- ✅ Provider-backed chat fallback: S04 proves real-provider-first selection with deterministic no-secret fallback, provider metadata, redaction-safe diagnostics, tests/typecheck/build/smoke, and no live-provider overclaim.
- ✅ Requirement coverage reconciliation: S05 and `M001-VALIDATION.md` separate validated local skeleton behavior, skeleton-only contracts, deferred/out-of-scope work, and negative boundaries.

## Definition of Done Results

- ✅ All planned slices are complete: `gsd_milestone_status` reports S01-S05 status `complete` with 14/14 tasks done.
- ✅ Slice summaries and UAT artifacts exist for S01-S05; artifact presence verification reported no missing milestone/slice evidence.
- ✅ Code-change verification passed: branch self-diff showed no non-.gsd files, but milestone-scoped commit evidence includes implementation commits touching non-.gsd files such as `apps/api/src/server.ts`, `apps/api/src/auth.ts`, `apps/api/src/providers.ts`, `apps/api/src/registry.test.ts`, `apps/web/src/App.tsx`, `apps/cli/src/commands.ts`, `scripts/smoke-local.cjs`, root workspace files, and README.
- ✅ Cross-slice integrations are coherent: S01 auth/session/project boundaries are reused by S02 registry/management, S03 CLI/smoke, and S04 provider-backed chat; S05 reconciles requirement coverage without expanding runtime scope.
- ✅ Fresh milestone validation is recorded in `M001-VALIDATION.md` with verdict `pass`, and remediation-round-1 operational evidence in `.gsd/exec/cf811044-b7fc-46d7-87b7-a62a3f763f95.stdout` confirms `npm run smoke` and README command coverage passed.

## Requirement Outcomes

| Requirement group | Outcome | Evidence |
|---|---|---|
| R001 | Validated for local M001 entry points. | S01-S04 prove authenticated Web, API, CLI, registry/management, provider-backed chat, and smoke paths; gateways are authenticated placeholders only. |
| R002-R004 | Validated. | S01 tests/build prove seeded login, project selection, project-scoped chat, backend auth/RBAC/permission enforcement, and project isolation. |
| R005-R007 | Validated at skeleton/contract level. | S01/S04 prove session/chat/provider seams; S02/S03 prove authenticated placeholder tool and skill inspection. No full autonomous runtime, real dispatcher, or real skill invocation is claimed. |
| R008 | Validated. | S04 tests/typecheck/build/smoke/redaction scan prove real-provider-first configuration seam and deterministic no-secret fallback. |
| R009-R012 | Validated. | S01/S02 Web shell and management tests, S03 CLI/smoke, and placeholder fixture contracts prove React/Vite UI, CLI, placeholder gateways, and placeholder building-domain surfaces. |
| R013-R014 | Validated. | S03/S04 smoke/build/typecheck/test evidence plus remediation-round-1 operational verification prove local launchability and README command coverage. |
| R015-R016 | Remain active/deferred to later milestones. | M002/M003 planning targets; intentionally not implemented by M001. |
| R017-R020 | Remain deferred. | Enterprise identity, production deployment, real analytics, and real BIM/Brick/time-series/mapping integrations are future work. |
| R021-R027 | Preserved as out-of-scope/negative boundaries. | M001 uses React/Vite rather than Streamlit, blocks anonymous paths, stores no real customer building data, does not modify or blindly vendor Hermes, and implements only placeholders for v1 analytics/integration surfaces. |

## Deviations

M001 stayed within the intended local foundation skeleton scope. Notable bounded deviations/limitations: the CLI smoke path uses the emitted built CLI file path because the workspace package bin is not yet linked as a package binary; live external LLM verification was intentionally not required and remains env-gated; gateway/building-domain/tool/skill surfaces remain placeholder-only; seeded auth, permissive local CORS, and localStorage token persistence remain local-development limitations.

## Follow-ups

Before shared/non-loopback demos: add a seeded-auth guard for explicit local/dev mode, restrict CORS to known local Web origins, and replace localStorage token persistence with a safer production session approach. Before real integrations: validate Web project-management response `projectId` against the requested project, add non-GET/negative-route tests for registry/management and execution-looking paths, align CLI package bin output with the emitted build path, and run live-provider acceptance in a secret-managed environment. Future milestones should build M002 data-source configuration surfaces and M003 building-operations workflows without overclaiming M001 placeholder contracts.
