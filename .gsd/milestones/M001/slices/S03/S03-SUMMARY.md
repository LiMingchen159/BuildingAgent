---
id: S03
parent: M001
milestone: M001
provides:
  - An authenticated CLI entrypoint that can be reused by later milestone tooling and automation
  - A reproducible root smoke command that future slices can extend as the platform grows
  - A stable local-auth/project-selection contract outside the browser
requires:
  - slice: S01
    provides: Seeded auth, selected-project handling, and project-scoped chat/session contracts from S01
  - slice: S02
    provides: Authenticated placeholder registry and management contracts from S02
affects:
  - none
key_files:
  - package.json
  - package-lock.json
  - scripts/run-tests.cjs
  - apps/cli/package.json
  - apps/cli/tsconfig.json
  - apps/cli/src/config.ts
  - apps/cli/src/config.test.ts
  - apps/cli/src/index.ts
  - apps/cli/src/api.ts
  - apps/cli/src/commands.ts
  - apps/cli/src/commands.test.ts
  - apps/cli/src/registry.ts
  - apps/cli/src/registry.test.ts
  - scripts/smoke-local.cjs
  - README.md
  - .gsd/PROJECT.md
key_decisions:
  - Added @building-agent/cli as a root npm workspace so CLI tests, typecheck, and smoke flows use the same workspace tooling as api/web.
  - Kept CLI config persistence isolated through BUILDING_AGENT_CLI_HOME/options.homeDir and made diagnostics redaction-safe while persisting last command/error/request-id data for triage.
  - Parsed registry and management placeholder payloads strictly before rendering output, failing closed with api_malformed instead of silently dropping fields.
  - Made the smoke command exercise the real built CLI entrypoint against live local API/Web services and print stage markers, request ids, and child exit codes for agent-readable diagnosis.
patterns_established:
  - workspace-level CLI tooling should share the monorepo's root test/typecheck path
  - placeholder payloads must be parsed strictly before rendering
  - smoke checks should exercise the real built entrypoint rather than internals
  - redaction-safe CLI diagnostics can preserve request ids without leaking tokens
observability_surfaces:
  - [smoke] stage markers
  - CLI request-id and error-code persistence
  - child process exit codes
  - probe failures for API/Web health
  - redaction-safe temp CLI home cleanup
drill_down_paths:
  - .gsd/milestones/M001/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S03/tasks/T02-SUMMARY.md
  - .gsd/milestones/M001/slices/S03/tasks/T03-SUMMARY.md
  - .gsd/milestones/M001/slices/S03/tasks/T04-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-05-10T12:09:32.943Z
blocker_discovered: false
---

# S03: Authenticated CLI shell and local smoke checks

**Authenticated CLI shell plus local smoke verification that proves the same seeded login, project selection, registry/management inspection, and chat contracts now work coherently across API, Web, and CLI.**

## What Happened

S03 completed the last missing platform proof for M001: a real CLI workspace, persisted isolated CLI config, authenticated command flows, placeholder registry/management inspection, and a root smoke runner that checks end-to-end coherence outside the browser. The CLI can log in against the seeded API, reuse saved auth and selected-project state across fresh invocations, surface canonical backend error codes and request ids on denial paths, and render the same synthetic registry/management placeholders established in S02 without exposing token material. The smoke runner builds the workspaces, probes or starts API/Web, invokes the built CLI through login → session → project selection → registry/management/chat, and then tears everything down cleanly. The root project state was refreshed to record that M001 implementation is now complete and pending final validation.

## Verification

Fresh verification after the last project-state refresh: `npm run smoke` passed with exit code 0 and reported `[smoke] smoke passed`; a combined `npm test -- --run apps/cli/src/config.test.ts apps/cli/src/commands.test.ts apps/cli/src/registry.test.ts && npm run typecheck` also passed, and a leak scan over `scripts/smoke-local.cjs`, `README.md`, and `.gsd/PROJECT.md` reported no obvious fixture/token leaks.

## Requirements Advanced

- None. — 

## Requirements Validated

- None. — 

## New Requirements Surfaced

- None.

## Requirements Invalidated or Re-scoped

- None. — 

## Operational Readiness

None.

## Deviations

The smoke runner uses the emitted built CLI path under apps/cli/dist/apps/cli/src/index.js because this install does not expose the workspace package as a linked @building-agent/cli binary and the emitted path is the one verified in practice.

## Known Limitations

The current install does not expose the workspace as a linked @building-agent/cli binary, so the smoke path uses the emitted build artifact directly. The CLI package bin declaration should be reconciled with the actual emitted path before treating packaging as final.

## Follow-ups

Align the CLI package bin target with the emitted build path, add regression coverage for non-GET registry/management methods, and tighten project-management payload validation in the Web client if that surface is extended further.

## Files Created/Modified

- `.gsd/PROJECT.md` — Updated the root project state to reflect that M001 implementation is complete across S01/S02/S03 and ready for milestone validation.
