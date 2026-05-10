---
sliceId: S03
uatType: mixed
verdict: PASS
date: 2026-05-10T12:20:00.000Z
---

# UAT Result — S03

## Checks

| Check | Mode | Result | Notes |
|-------|------|--------|-------|
| Smoke Test: Run `npm run smoke` from the repo root. | runtime | PASS | Prior UAT execution `.gsd/exec/6838145e-a9b1-4394-9f99-d98606a800e4.stdout` shows `npm run smoke` exited 0 after building workspaces, starting/probing API and Web, executing CLI login/session/projects/use/registry/management/chat/chat:list, printing request ids `req_000003` through `req_000010`, reporting child exit codes, removing the temp CLI home, and ending with `[smoke] smoke passed` plus `__UAT_SMOKE_EXIT_CODE=0`. |
| Fresh CLI login and session rehydration. | runtime | PASS | Smoke evidence shows isolated temp CLI home creation, `cli login exit code=0`, `cli session exit code=0`, and request ids for both commands. T01/T02 summaries verify persisted CLI config, redaction-safe diagnostics, and auth/session reuse across fresh invocations; leak scan `.gsd/exec/d3d1dc87-38b2-42c2-9034-db984dd33ccf.stdout` found no token-like bearer/seed-token/unredacted-token findings in smoke output or selected docs. |
| Project selection and project-scoped chat. | runtime | PASS | Smoke evidence shows `cli projects`, `cli use`, `cli chat`, and `cli chat:list` each exited 0 and emitted request ids. T02 verification covered forbidden project selection, missing auth, blank chat input, and canonical backend error/request-id preservation in CLI diagnostics. |
| Registry and management placeholder inspection. | runtime | PASS | Smoke evidence shows `cli registry exit code=0` with request id `req_000007` and `cli management exit code=0` with request id `req_000008`. T03 verification passed strict CLI parser tests for registry/management happy paths, missing auth, and malformed registry payload failure with `api_malformed` behavior instead of silent partial rendering. |
| Smoke cleanup and failure localization. | runtime | PASS | Smoke output includes `[smoke]` stage markers, API/Web probe results, per-child CLI exit code lines, cleanup start, API/Web child termination signals, temp CLI home removal, and cleanup complete. |
| Edge case: Missing auth or forbidden project selection. | artifact | PASS | T02 focused command tests passed against a real Fastify API and explicitly covered forbidden project selection and missing auth while preserving backend error code/requestId envelopes in `ApiClientError` and persisted diagnostics. |
| Edge case: Malformed placeholder response. | artifact | PASS | T03 focused registry tests passed and covered malformed registry payload rejection. The CLI registry module strictly parses placeholder contracts before rendering and fails closed with `api_malformed`. |
| Failure signal: Token-like values appear in logs or README examples. | artifact | PASS | Leak scan `.gsd/exec/d3d1dc87-38b2-42c2-9034-db984dd33ccf.stdout` reported no token-like bearer/seed-token/unredacted-token findings in smoke output or selected docs; T04 summary also records a README/smoke script fixture-token scan with no obvious token leaks. |

## Overall Verdict

PASS — All automatable runtime and artifact-driven S03 UAT checks passed using the real smoke command plus persisted task-level evidence for edge cases and strict parser behavior.

## Notes

No human-only checks remain for this mixed-mode UAT. The known packaging limitation from the slice summary remains: the smoke runner uses the emitted built CLI path under `apps/cli/dist/apps/cli/src/index.js` because this install does not expose the workspace package as a linked `@building-agent/cli` binary; this does not block S03 UAT because the smoke path exercises the real built entrypoint verified in practice.