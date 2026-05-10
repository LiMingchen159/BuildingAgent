---
id: T01
parent: S03
milestone: M001
key_files:
  - package.json
  - package-lock.json
  - scripts/run-tests.cjs
  - apps/cli/package.json
  - apps/cli/tsconfig.json
  - apps/cli/src/config.ts
  - apps/cli/src/config.test.ts
  - apps/cli/src/index.ts
key_decisions:
  - Added @building-agent/cli as a root npm workspace so focused CLI tests and later CLI scripts run through the same workspace tooling as api/web.
  - Implemented the CLI config home override with BUILDING_AGENT_CLI_HOME/options.homeDir and redaction-safe CliConfigError diagnostics.
duration: 
verification_result: mixed
completed_at: 2026-05-10T11:36:03.048Z
blocker_discovered: false
---

# T01: Scaffolded the CLI workspace with isolated config persistence, redaction-safe diagnostics, and focused root test routing.

**Scaffolded the CLI workspace with isolated config persistence, redaction-safe diagnostics, and focused root test routing.**

## What Happened

Created the standalone CLI workspace and wired it into the root workspace list and focused test router. Added an isolated config store that resolves a CLI home directory, reads/writes `.building-agent/config.json`, validates config shape, reports config-path/config-load/write failures with canonical codes and diagnostics, and redacts tokens for display. Added a minimal `building-agent session`/`config-path` entrypoint so future tasks have an inspectable CLI surface. Wrote config tests proving writes are confined to a temp CLI home and that diagnostics/error serialization do not echo token values.

## Verification

Ran the task-required focused CLI config test through the root test router and ran the CLI workspace typecheck. LSP diagnostics were attempted for `apps/cli/src/config.ts`, but no TypeScript language server was available in this harness; `tsc` typecheck passed instead.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm test -- --run apps/cli/src/config.test.ts` | 0 | ✅ pass | 7356ms |
| 2 | `npm --workspace @building-agent/cli run typecheck` | 0 | ✅ pass | 4463ms |
| 3 | `lsp diagnostics apps/cli/src/config.ts` | 1 | ❌ fail — no language server found; covered by tsc typecheck | 0ms |

## Deviations

None.

## Known Issues

npm install reported existing audit findings: 10 vulnerabilities (5 moderate, 5 high). They were not introduced or remediated in this scaffold task.

## Files Created/Modified

- `package.json`
- `package-lock.json`
- `scripts/run-tests.cjs`
- `apps/cli/package.json`
- `apps/cli/tsconfig.json`
- `apps/cli/src/config.ts`
- `apps/cli/src/config.test.ts`
- `apps/cli/src/index.ts`
