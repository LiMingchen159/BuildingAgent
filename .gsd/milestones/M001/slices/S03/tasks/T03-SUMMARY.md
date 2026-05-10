---
id: T03
parent: S03
milestone: M001
key_files:
  - apps/cli/src/registry.ts
  - apps/cli/src/commands.ts
  - apps/cli/src/registry.test.ts
key_decisions:
  - Added strict CLI-side registry and management payload parsing before rendering command output so malformed placeholder API responses fail closed with api_malformed.
  - Kept global registry and selected-project management as separate command paths while preserving backend requestId, limit, and placeholderOnly metadata in output.
duration: 
verification_result: passed
completed_at: 2026-05-10T11:51:18.110Z
blocker_discovered: false
---

# T03: Added strict CLI registry and management inspection commands with request-id metadata and malformed-payload rejection.

**Added strict CLI registry and management inspection commands with request-id metadata and malformed-payload rejection.**

## What Happened

Added a new CLI registry module with typed placeholder response contracts and strict parsers for runtime providers, tools, skills, gateways, and building capabilities. Wired the existing registry and management commands through those parsers before printing JSON, preserving backend request ids, list limits, and placeholder-only flags while rejecting malformed payloads instead of silently dropping fields. Added focused CLI tests covering authenticated happy paths, missing auth failure, and malformed registry payload failure.

## Verification

Ran the task-required focused test `npm test -- --run apps/cli/src/registry.test.ts` successfully. Also ran slice-level API/CLI/Web coherence checks for registry, commands, and Web app tests; all selected suites passed.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm test -- --run apps/cli/src/registry.test.ts` | 0 | ✅ pass | 17004ms |
| 2 | `npm test -- --run apps/api/src/registry.test.ts apps/cli/src/commands.test.ts apps/cli/src/registry.test.ts apps/web/src/App.test.tsx` | 0 | ✅ pass | 92528ms |

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `apps/cli/src/registry.ts`
- `apps/cli/src/commands.ts`
- `apps/cli/src/registry.test.ts`
