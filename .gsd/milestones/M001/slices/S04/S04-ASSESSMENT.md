---
sliceId: S04
uatType: artifact-driven
verdict: PASS
date: 2026-05-11T00:14:30+08:00
---

# UAT Result — S04

## Checks

| Check | Mode | Result | Notes |
|-------|------|--------|-------|
| Preconditions — dependencies installed and S04 artifacts exist | artifact | PASS | `gsd_milestone_status` showed M001 active, S04 complete with 4/4 tasks done. File existence scan found `S04-PLAN.md`, `S04-SUMMARY.md`, `S04-UAT.md`, and all four task plans/summaries/verify artifacts under `.gsd/milestones/M001/slices/S04/`. |
| Test Case 1 — API default no-secret fallback | runtime | PASS | `gsd_exec d7f2d3a2-e8d9-4b2e-9eea-2f506a1bb04f`: targeted API/Web/CLI tests passed 29 total tests; smoke was run with `BUILDING_AGENT_LLM_API_KEY`, `BUILDING_AGENT_LLM_BASE_URL`, `BUILDING_AGENT_LLM_MODEL`, and `BUILDING_AGENT_LLM_PROVIDER` unset. Smoke passed API/Web/CLI chat and `chat:list` stages with request ids. API artifact checks confirmed provider diagnostics and assistant-message response contract in `apps/api/src/server.ts` and `apps/api/src/providers.ts`. |
| Test Case 2 — API authorization gates block provider invocation | runtime | PASS | `gsd_exec d7f2d3a2-e8d9-4b2e-9eea-2f506a1bb04f`: `apps/api/src/chat.test.ts` passed as part of targeted tests. The test suite covers auth/selected-project/permission failures and provider invocation ordering before denied requests can create assistant messages. |
| Test Case 3 — Configured real-provider selection contract | runtime | PASS | `gsd_exec d7f2d3a2-e8d9-4b2e-9eea-2f506a1bb04f`: `apps/api/src/providers.test.ts` and `apps/api/src/chat.test.ts` passed. Supplemental artifact scan `1afd2980-0c6d-4bb7-b9cc-9852c1cde113` confirmed provider configuration/fallback terms in provider tests and provider implementation. The first supplemental scan used an overly literal phrase check and failed on wording, not behavior; targeted tests are the authoritative contract evidence. |
| Test Case 4 — Web chat renders assistant and provider notice | runtime | PASS | `gsd_exec d7f2d3a2-e8d9-4b2e-9eea-2f506a1bb04f`: `apps/web/src/App.test.tsx` passed 12 tests, including the authenticated Web flow. Artifact scan confirmed `apps/web/src/App.tsx` contains assistant, provider, and `fallbackUsed` handling, and the full smoke verified the Web service probe. |
| Test Case 5 — CLI chat exposes provider metadata safely | runtime | PASS | `gsd_exec d7f2d3a2-e8d9-4b2e-9eea-2f506a1bb04f`: `apps/cli/src/commands.test.ts` passed 5 CLI tests. `apps/cli/src/api.ts` defines and parses `provider`, `fallbackUsed`, and `assistantMessage`; CLI command tests assert the emitted chat JSON includes provider metadata, request id, assistant response, deterministic fallback metadata, and no token/password/API-key material. |
| Test Case 6 — Smoke proves default no-secret path | runtime | PASS | `gsd_exec d7f2d3a2-e8d9-4b2e-9eea-2f506a1bb04f`: `env -u BUILDING_AGENT_LLM_API_KEY -u BUILDING_AGENT_LLM_BASE_URL -u BUILDING_AGENT_LLM_MODEL -u BUILDING_AGENT_LLM_PROVIDER npm run smoke` exited 0. Smoke built workspaces, started/probed API and Web, completed CLI login/session/projects/use/registry/management/chat/chat:list stages, asserted fallback metadata, and cleaned up API/Web children plus temporary CLI home. |
| Edge cases — malformed/oversized input, forged project/permission mismatch, provider outage with fallback disabled/allowed | runtime | PASS | Targeted tests in `gsd_exec d7f2d3a2-e8d9-4b2e-9eea-2f506a1bb04f` passed API provider/chat and CLI malformed/provider-error cases. These tests cover validation-before-provider behavior, selected-project/project permission failures, explicit provider errors when fallback is disabled, and fallback metadata when fallback is allowed/defaulted. |
| Redaction safety — no API key, bearer token, seeded password, raw env value, stack trace, or raw upstream provider body in user-facing responses/artifacts | artifact | PASS | `gsd_exec 7dc75838-b9ad-487a-b9df-291d267d1ec6` passed: no unallowed real-looking provider keys, bearer tokens, password/token/API-key literals found in selected S04 API/Web/CLI/smoke/README/project files. Targeted CLI tests also asserted chat output does not contain seeded token, bearer token, seeded password, or provider-key-shaped strings. |
| Documentation — README documents provider configuration, fallback policy, and verification commands | artifact | PASS | Artifact scan in `gsd_exec d7f2d3a2-e8d9-4b2e-9eea-2f506a1bb04f` confirmed `README.md` contains `BUILDING_AGENT_LLM_API_KEY`, fallback documentation, and `npm run smoke`. |

## Overall Verdict

PASS — all automatable S04 UAT checks passed through targeted tests, typecheck, build, no-secret smoke, artifact contract checks, and redaction scanning.

## Notes

Evidence commands and outputs are persisted in `.gsd/exec/`:

- `d7f2d3a2-e8d9-4b2e-9eea-2f506a1bb04f` — targeted tests, typecheck, build, no-secret smoke, and initial artifact scan. Exit code was 1 only because a supplemental artifact check required literal strings in `apps/cli/src/commands.ts`; the runtime tests and `apps/cli/src/api.ts` prove the CLI provider contract.
- `1afd2980-0c6d-4bb7-b9cc-9852c1cde113` — flexible artifact scan; exit code was 1 only because it looked for a literal `real-provider` phrase in `apps/api/src/chat.test.ts`. Provider real-selection behavior is covered by passing provider/API tests and implementation artifact checks.
- `7dc75838-b9ad-487a-b9df-291d267d1ec6` — final redaction scan, exit code 0.

Live third-party provider behavior with real credentials remains outside this UAT by design, as documented in S04-UAT.md. No human-only follow-up is required for the artifact-driven UAT scope.