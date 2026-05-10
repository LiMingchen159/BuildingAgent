---
sliceId: S01
uatType: artifact-driven
verdict: PASS
date: 2026-05-10T18:18:00Z
---

# UAT Result — S01

## Checks

| Check | Mode | Result | Notes |
|-------|------|--------|-------|
| Test Case 1 — API health and request-id signal | runtime | PASS | `gsd_exec` 393a34fb ran API contract tests; `apps/api/src/auth.test.ts` includes `exposes health without authentication and includes a request id`. Build/typecheck passed. Targeted artifact evidence found `/health`, `building-agent-api`, and `requestId` markers. |
| Test Case 2 — Seeded Web login | runtime | PASS | `gsd_exec` 393a34fb ran Web tests: 7/7 passed. Test names include `logs in, selects a project, loads chat, and sends project-scoped messages` and `guards the workspace when unauthenticated and clears invalid stored tokens`. Seed markers for `ada@example.test` and `local-dev-password` are present. |
| Test Case 3 — Authorized project selection | runtime | PASS | API tests include `selects an authorized project and rejects a forbidden project`; Web tests exercise login and project selection. Targeted artifact evidence found `Alpha Build`, selected-project flow markers, and permissions markers. |
| Test Case 4 — Project-scoped chat happy path | runtime | PASS | API chat tests passed 4/4 and Web tests passed 7/7. Test names include `stores and returns chat messages only for the selected project` and `logs in, selects a project, loads chat, and sends project-scoped messages`. |
| Test Case 5 — Unauthorized API rejection | runtime | PASS | API auth tests passed and include `rejects missing, malformed, and unknown bearer tokens`. Targeted artifact evidence found `auth_missing`, `auth_invalid`, and `requestId`. |
| Test Case 6 — Forbidden project access | runtime | PASS | API auth tests include `selects an authorized project and rejects a forbidden project`; API chat tests include `rechecks membership on every operation and isolates projects between users`. Targeted evidence found `Gamma Build` and `project_forbidden`. |
| Test Case 7 — Selected-project enforcement | runtime | PASS | API chat tests include `requires auth and a matching selected project before reading chat` and `rejects chat writes without selected project, write permission, or valid body`. Targeted evidence found `project_not_selected`. |
| Test Case 8 — Read-only permission behavior | runtime | PASS | API chat tests include rejection of writes without write permission; Web tests include `renders read-only selected projects without usable chat compose controls`. Seed/artifact evidence found `Beta Build` and read-only behavior. The implementation returns a permission-denial response using `project_forbidden` for missing write permission, which satisfies this UAT's permission-denial expectation even though the earlier slice summary also mentioned a `permission_denied` code. |
| Test Case 9 — Invalid chat input | runtime | PASS | API chat tests include invalid body coverage; Web tests include `validates empty login fields, blank chat messages, malformed JSON, and local API outages`. Targeted evidence found `chat_invalid`, the 1000-character cap, and blank/trim handling. |
| Preconditions and local run/build readiness | runtime | PASS | `gsd_exec` 393a34fb ran `npm test -- --run apps/api/src/auth.test.ts apps/api/src/chat.test.ts` (10/10 tests passed), `npm test -- --run apps/web/src/App.test.tsx` (7/7 tests passed), `npm run typecheck` (API and Web passed), and `npm run build` (API TypeScript build and Vite production build passed). README markers for `npm run dev:api`, `npm run dev:web`, seeded credentials, and verification commands are present. |

## Overall Verdict

PASS — All automatable artifact-driven UAT checks passed through contract tests, Web tests, typecheck/build verification, and targeted source/documentation evidence.

## Notes

Evidence was gathered with `gsd_exec` to keep noisy test/build output out of prompt context:

- `393a34fb-2a21-49ea-90eb-7a58cbeae7fc` — ran API tests, Web tests, typecheck, build, and source/README artifact assertions. The verification commands all passed; a broad marker scan reported false negatives because some codes live in `auth.ts` rather than `server.ts`, and the Web client uses lowercase `authorization` instead of an `Authorization` string literal.
- `9d53d456-08f7-454b-85c3-e2c1a9485148` — ran targeted contract marker checks for each UAT case. It confirmed most case markers and highlighted that permission denial is represented by `project_forbidden` rather than a distinct `permission_denied` code.
- `66f8e639-62f2-4aee-85f7-7590e10842f4` — listed API/Web test case names as traceable evidence for UAT coverage.

This was an artifact-driven UAT run, not a live browser session. No human-only checks remain for the stated S01 artifact-driven acceptance scope.