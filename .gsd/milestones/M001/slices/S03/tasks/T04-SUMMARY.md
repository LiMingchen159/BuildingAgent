---
id: T04
parent: S03
milestone: M001
key_files:
  - package.json
  - scripts/smoke-local.cjs
  - README.md
key_decisions:
  - The smoke script builds workspaces first, then starts API/Web only when probes show they are not already reachable, minimizing interference with an existing local stack.
  - The smoke CLI flow uses a mkdtemp BUILDING_AGENT_CLI_HOME and redacts process output so persisted auth can be verified without leaking bearer token material.
  - The smoke runner uses managed child processes with timeout-bound cleanup and emits stage markers, probe results, and child exit codes for agent-readable failure localization.
duration: 
verification_result: passed
completed_at: 2026-05-10T12:00:15.846Z
blocker_discovered: false
---

# T04: Added a local smoke runner, root smoke script, and README path that prove API/Web/CLI seeded login, project selection, registry, management, and chat coherence with redaction-safe diagnostics.

**Added a local smoke runner, root smoke script, and README path that prove API/Web/CLI seeded login, project selection, registry, management, and chat coherence with redaction-safe diagnostics.**

## What Happened

Added a root `smoke` script that runs `scripts/smoke-local.cjs`. The smoke runner creates an isolated temporary CLI home, builds all workspaces, probes the API and Web health URLs, starts missing dev services with managed child processes, and runs the built CLI through login, session, projects, use, registry, management, chat, and chat:list against the real seeded API. It prints `[smoke]` stage markers, request ids from probes/CLI responses, child exit codes, and cleanup progress while redacting token-like output and deleting the temp CLI config directory. README now documents the local CLI flow, isolated config usage, and the smoke command expectations without including bearer tokens.

## Verification

Ran `npm run smoke` successfully after iterating on the built CLI entrypoint path and token assertion. The passing run built all workspaces, started API/Web, probed `/health`, executed the CLI login/session/project/registry/management/chat flow, printed request ids and child exit codes, and cleaned up child processes plus the temp CLI home. Also scanned the smoke script and README for obvious fixture token leaks.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm run smoke` | 0 | ✅ pass | 41126ms |
| 2 | `node - <<'NODE'
const fs = require('fs');
for (const path of ['scripts/smoke-local.cjs','README.md']) {
  const text = fs.readFileSync(path, 'utf8');
  const leaks = ['seed-token-ada','Bearer seed','token:'].filter((needle) => text.includes(needle));
  console.log(`${path}: ${leaks.length ? `leaks ${leaks.join(',')}` : 'no obvious token fixture leaks'}`);
}
NODE` | 0 | ✅ pass | 40ms |

## Deviations

Used the built CLI JavaScript path under apps/cli/dist/apps/cli/src/index.js because the current CLI tsconfig emits with rootDir ../.. and the workspace package is not linked under node_modules as @building-agent/cli in this install. The smoke runner still exercises the real built entrypoint instead of TypeScript sources or command internals.

## Known Issues

The CLI package metadata declares bin dist/index.js, but the current tsconfig emits the built entrypoint at apps/cli/dist/apps/cli/src/index.js and node_modules did not include an @building-agent/cli workspace link in this install. The smoke runner and README use the actual emitted built path for now.

## Files Created/Modified

- `package.json`
- `scripts/smoke-local.cjs`
- `README.md`
