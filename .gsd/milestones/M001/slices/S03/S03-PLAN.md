# S03: Authenticated CLI shell and local smoke checks

**Goal:** Build the authenticated CLI surface and local smoke path so a seeded user can log in from the terminal, reuse saved auth/project selection across fresh invocations, inspect registry and management placeholders, and prove API/Web/CLI coherence from one smoke command.
**Demo:** After this, the CLI can authenticate, select a project, and exercise the same local platform contracts; startup smoke checks confirm the backend, Web UI, and CLI all run coherently.

## Must-Haves

- `apps/cli` exists as a workspace package with strict NodeNext TypeScript settings, isolated config persistence, and deterministic command output suitable for tests.
- Authenticated CLI commands reuse saved token and selected-project state across fresh processes and preserve canonical backend error codes and request ids on denial paths.
- Registry and management inspection commands render the same authenticated placeholder data as S02 without exposing secret-like fields or collapsing the registry/project-scoped boundary.
- `npm run smoke` starts or probes the local stack and completes CLI login → project selection → registry/chat inspection end-to-end with bounded cleanup and timeouts.
- Root test/typecheck/build wiring and README instructions include the verified CLI and smoke path.

## Proof Level

- This slice proves: final-assembly

## Integration Closure

This slice consumes the S01 auth/session/project-selection/chat contracts, the S02 authenticated registry and project-management contracts, and the root workspace/test forwarding already established for the API and Web packages. It introduces a real `apps/cli` workspace, a persisted local config store, a CLI bin entrypoint, and a smoke runner that launches or probes the local stack and exercises the built CLI against the live API. What remains after this slice is only later milestone hardening and replacement of placeholder/local-skeleton behavior, not further work to prove the M001 local platform coheres.

## Verification

- The CLI and smoke path should make failure diagnosis easy without exposing secrets: commands must surface canonical backend error codes plus request ids, and the smoke script must print stage markers, child process exit codes, and probe failures. Future agents should be able to inspect `building-agent session`, the temp CLI config directory, and the smoke script output to tell whether a failure came from auth, project selection, registry access, or process startup. Bearer tokens and other auth material must never be echoed in logs, tests, or README examples.

## Tasks

- [x] **T01: Scaffold the CLI workspace and isolated config store** `est:1h`
  Create the standalone CLI workspace with isolated config persistence, a redaction-safe error shape, and test coverage that proves config never spills into the real home directory. Add the root workspace/test router updates needed for focused CLI tests to run from the repo root.
  - Files: `package.json`, `package-lock.json`, `scripts/run-tests.cjs`, `apps/cli/package.json`, `apps/cli/tsconfig.json`, `apps/cli/src/config.ts`, `apps/cli/src/config.test.ts`, `apps/cli/src/index.ts`
  - Verify: `npm test -- --run apps/cli/src/config.test.ts`

- [x] **T02: Wire seeded login, session, project, and chat commands to the API** `est:2h`
  Implement the authenticated CLI command path against the real API: login stores the bearer token and API base URL, and session, projects, use, chat, and chat:list reuse the saved token and selected project in fresh processes. Keep canonical API errors intact so missing auth, forbidden project selection, and blank chat input fail closed with request ids instead of vague local errors.
  - Files: `apps/cli/src/api.ts`, `apps/cli/src/commands.ts`, `apps/cli/src/index.ts`, `apps/cli/src/commands.test.ts`, `apps/cli/src/config.ts`
  - Verify: `npm test -- --run apps/cli/src/commands.test.ts`

- [x] **T03: Add registry and management inspection commands** `est:1h`
  Add the authenticated registry and management inspection commands so the CLI can render the same placeholder platform data exposed by S02. The commands should keep the global registry versus project-scoped management boundary intact and reject malformed payloads or missing authorization instead of silently dropping fields.
  - Files: `apps/cli/src/registry.ts`, `apps/cli/src/commands.ts`, `apps/cli/src/index.ts`, `apps/cli/src/registry.test.ts`
  - Verify: `npm test -- --run apps/cli/src/registry.test.ts`

- [x] **T04: Wire smoke script, root scripts, and README run path** `est:1h 30m`
  Add the local smoke runner, root `smoke` script wiring, and README instructions that document the verified CLI login, project selection, and smoke path. The smoke command should launch or probe the API and Web services, invoke the built CLI through the real bin entrypoint, and always clean up child processes on success, failure, or timeout.
  - Files: `package.json`, `scripts/smoke-local.cjs`, `README.md`
  - Verify: `npm run smoke`

## Files Likely Touched

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
