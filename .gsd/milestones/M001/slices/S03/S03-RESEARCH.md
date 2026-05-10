# S03 — Research

**Date:** 2026-05-10

## Summary

S03 is the final multi-entrypoint proof for M001. The repo currently has a working npm workspace with `apps/api` and `apps/web`; there is no `apps/cli` package and no smoke-check script yet. S01/S02 already provide the backend contracts the CLI should reuse directly: seeded login, bearer session rehydration, project list/select, project-scoped chat read/write, global authenticated registry listing, and selected-project management listing.

This slice primarily owns or advances R001, R010, R013, and R014: add an authenticated CLI entrypoint, prove token reuse and project selection against the same backend contract, add local smoke checks that cover API/Web/CLI coherence, and update README with the verified run path. It also provides final milestone evidence for R002/R003/R004 by proving the same project-scoped auth boundary works outside the browser, and for R005–R008/R011/R012 by making the registry/placeholder surfaces inspectable from the CLI.

The work is targeted rather than novel: implement a small TypeScript CLI workspace plus tests and a smoke script. Avoid introducing a large command framework unless the executor explicitly wants one; current dependencies are intentionally thin and a hand-written command dispatcher is enough for M001.

## Recommendation

Create `apps/cli` as a third npm workspace package using the existing TypeScript/NodeNext conventions. The CLI should be a thin client over the existing API, not a second source of truth: commands should call the real HTTP endpoints, persist only local auth/project config, and surface canonical API errors with status/code/requestId. Keep command output deterministic enough for tests and smoke checks; JSON output can be optional later, but S03 tests will be simpler if each command prints stable lines.

Recommended command surface for M001:

- `building-agent login --email ada@example.test --password local-dev-password [--api http://127.0.0.1:3000]` — calls `POST /api/login`, saves token and API base URL locally.
- `building-agent session` — calls `GET /api/session` using stored token and prints user/project/permissions.
- `building-agent projects` — calls `GET /api/projects` and prints authorized projects.
- `building-agent use project_alpha` — calls `POST /api/projects/:projectId/select`, saves selected project id on success.
- `building-agent chat "message"` — requires saved selected project id, calls `POST /api/projects/:projectId/chat`, prints stored message id/request id.
- `building-agent chat:list` — calls `GET /api/projects/:projectId/chat`.
- `building-agent models` or `providers`, `skills`, `tools` — calls `GET /api/registry` and filters the relevant arrays.
- Optionally `building-agent management` — calls `GET /api/projects/:projectId/management` to prove gateway/building-domain placeholder parity with S02.

For tests, isolate the config store with `BUILDING_AGENT_CLI_HOME` or `BUILDING_AGENT_CONFIG` so no real user home files are touched. For smoke checks, prefer a Node script that starts the built API and Web dev/preview/build artifacts on local ports, probes `/health`, verifies the Web endpoint responds, then runs the CLI login → projects → use → registry/tools/skills/providers → chat path. The smoke script should clean up child processes and redact/avoid printing tokens.

## Implementation Landscape

### Key Files

- `package.json` — root workspace currently lists only `apps/api` and `apps/web`; add `apps/cli` and likely scripts such as `dev:cli`, `smoke`, and ensure root `build`/`typecheck` pick the CLI up through workspaces.
- `package-lock.json` — will change when adding the CLI workspace and any dependency. Current repo uses npm workspaces with no root deps.
- `tsconfig.base.json` — strict NodeNext config shared by API/Web; CLI should extend this.
- `scripts/run-tests.cjs` — currently routes `apps/api/*` and `apps/web/*` test paths into the right workspace. It must be updated to route `apps/cli/*` tests, otherwise focused root verification commands for CLI files will not work.
- `scripts/run-api-tests.cjs` — API-only helper; probably no S03 change needed.
- `apps/api/src/server.ts` — existing contract source. Relevant endpoints: `POST /api/login`, `GET /api/session`, `GET /api/projects`, `POST /api/projects/:projectId/select`, `GET|POST /api/projects/:projectId/chat`, `GET /api/registry`, `GET /api/projects/:projectId/management`, and `/health`.
- `apps/api/src/auth.ts` — canonical error envelope shape: `{ error: { code, message, requestId } }`. CLI should preserve these fields in user-visible errors.
- `apps/api/src/seed.ts` — seeded fixtures and credentials. CLI tests/smoke can use Ada (`ada@example.test` / `local-dev-password`) and project `project_alpha` for read/write, `project_beta` for read-only denial checks if desired.
- `apps/api/src/auth.test.ts`, `apps/api/src/chat.test.ts`, `apps/api/src/registry.test.ts` — examples of injection-driven API contract tests. S03 likely does not need new API endpoints unless the planner adds smoke-only health semantics; reuse these for regression coverage.
- `apps/web/src/api.ts` — typed Web client parser and error handling pattern. A CLI API client can reuse the same endpoint semantics but should not import browser-only code because it uses `import.meta.env` and `window.setTimeout`.
- `apps/web/vite.config.ts` — dev server proxies `/api` and `/health` to `127.0.0.1:3000`. A smoke script can use this by starting `npm run dev:web -- --host 127.0.0.1 --port <port>` or by running `npm run build` and checking output exists.
- `README.md` — currently documents only S01 Web/API local run and verification. S03 must update it with CLI install/run commands, token/config location behavior, provider/mock fallback note if applicable, and the local smoke command.
- New `apps/cli/package.json` — should define `bin`, `build`, `test`, `typecheck`, and possibly `dev` scripts.
- New `apps/cli/tsconfig.json` — extend root config, `rootDir: src`, `outDir: dist`, `types: ["node", "vitest/globals"]`.
- New `apps/cli/src/*` — suggested split: `api.ts` for HTTP client/error parsing, `config.ts` for local token/project persistence, `commands.ts` for command handlers, `index.ts` for bin entrypoint. Keep side effects out of command functions so tests can call them.
- New `apps/cli/src/*.test.ts` — test command behavior using a real `buildServer()` listening on an ephemeral port or mocked fetch. Ephemeral real server is better because it proves the CLI talks to the actual Fastify contract.
- New `scripts/smoke-local.cjs` or `scripts/smoke-local.mjs` — starts/probes API and Web and exercises built CLI. It should be cross-platform enough for Node, use child processes, allocate fixed/default local ports or configurable env vars, and always terminate children.

### Build Order

1. **CLI foundation and config store first.** Add `apps/cli` workspace, strict TS config, a command runner that can be tested without process exits, and isolated config persistence. This unblocks all command work and makes tests safe.
2. **Authenticated API client commands next.** Implement login/session/projects/use/chat over the real backend endpoints, preserving canonical error status/code/requestId. Verify token reuse by logging in once, then running subsequent commands from the saved config.
3. **Registry/placeholder parity commands.** Add providers/models, skills, tools, and optionally management/gateways/building-domain commands using S02 `/api/registry` and `/api/projects/:projectId/management` contracts. These are lower risk once auth/config is working.
4. **Smoke script.** Build a local smoke command that starts or probes API/Web and runs the CLI path. This should come after the CLI build is stable so it can use the real `dist` bin or `npm --workspace @building-agent/cli exec` path.
5. **README and root verification wiring.** Update root scripts and docs last, once command names and smoke behavior are proven.

### Verification Approach

Recommended focused verification while implementing:

```bash
npm test -- --run apps/cli/src/cli.test.ts
npm test -- --run apps/api/src/auth.test.ts apps/api/src/chat.test.ts apps/api/src/registry.test.ts apps/cli/src/cli.test.ts apps/web/src/App.test.tsx
npm run typecheck
npm run build
npm run smoke
```

The final S03 verification should prove:

- CLI login writes a reusable local config without echoing token values.
- CLI `projects` works in a fresh process using the saved token.
- CLI `use project_alpha` stores selected project and backend session selection.
- CLI `chat "..."` succeeds for `project_alpha`; a read-only or unselected/forbidden path returns a clear canonical error if tested.
- CLI registry/model/skill/tool commands list the same placeholder data exposed by S02.
- Smoke check gets API `/health`, confirms Web is reachable, and completes the CLI authenticated path with exit code 0.
- Root `npm run typecheck` and `npm run build` include the new CLI workspace.

## Constraints

- Do not store CLI config in the real home directory during tests; use an env override such as `BUILDING_AGENT_CLI_HOME`.
- Do not print bearer tokens in normal command output, errors, tests, smoke logs, or README examples.
- Keep seeded auth documented as local-only. Existing S01 limitations still apply: public seeded credentials, localStorage token in Web, and permissive local CORS are acceptable only for local development.
- `apps/web/src/api.ts` is browser-specific because it uses `import.meta.env` and `window`; do not import it from the Node CLI.
- Existing TypeScript config uses `module: NodeNext`, `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`; CLI code should satisfy these rather than weakening config.
- Current dependency set has no CLI framework. Adding a dependency like `commander` is optional but not necessary for the small M001 surface; if added, update lockfile and keep tests deterministic.

## Common Pitfalls

- **CLI selecting only local config but not backend session** — protected backend endpoints require the selected project to match backend session state. `use` must call `POST /api/projects/:projectId/select`, not only save a project id locally.
- **Token leakage in output** — login should confirm success and user/request id but should not print the bearer token.
- **Tests mutating developer config** — every CLI test and smoke run should use a temp config path via env.
- **Smoke script hanging** — child processes for API/Web must be terminated in `finally`/signal handlers, and probes should have bounded timeouts.
- **Root test routing missing CLI files** — update `scripts/run-tests.cjs`; otherwise `npm test -- --run apps/cli/...` may accidentally route to the API workspace.
- **Registry parity omitting auth** — S02 registry is globally authenticated, not public; CLI model/skill/tool commands must require saved token.

## Open Risks

- The milestone context mentions real-provider-first chat behavior, but the current API chat implementation stores only user messages and has no model/provider response path. S03 can prove CLI chat against the existing M001 contract, but if the planner interprets final acceptance as requiring provider-generated responses, this is a scope gap that needs a separate API/runtime task before CLI smoke can prove it.
- README currently only has S01-era docs despite S02 completion; S03 docs need to consolidate S01/S02/S03 rather than append contradictory sections.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Node.js / TypeScript CLI | installed skills: `test`, `lint`; marketplace `mcollina/skills@node` (1.2K installs) and `julianobarbosa/claude-code-skills@writing-typescript` (50 installs) | available / optional, not installed |
| Local smoke testing | installed skill: `test`; marketplace `cursor/plugins@run-smoke-tests` (30 installs), `wojons/skills@testing-smoke` (25 installs) | available / optional, not installed |
| API contract design | `api-design` | installed |
| Observability / diagnostics | `observability` | installed |

## Sources

- Existing workspace/package/test topology from `package.json`, `scripts/run-tests.cjs`, `apps/api/package.json`, and `apps/web/package.json`.
- Existing API contracts from `apps/api/src/server.ts`, `apps/api/src/auth.ts`, `apps/api/src/seed.ts`, and API tests.
- Existing Web client parsing/error pattern from `apps/web/src/api.ts`.
- Durable architecture memories: S01 backend-enforced auth/project boundary and S02 split registry model.
