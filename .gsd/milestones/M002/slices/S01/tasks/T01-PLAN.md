---
estimated_steps: 12
estimated_files: 4
skills_used: []
---

# T01: Add a branded no-blank HTML fallback shell

Expected skills: frontend-design, accessibility, react-best-practices, verify-before-complete.

Add a branded static fallback and skeleton inside the server-delivered HTML so users see BuildingAgent immediately before the React bundle loads. Wire the React bootstrap to explicitly remove or mark the fallback after mount, and add focused tests that prove the no-blank contract from tracked source files.

Steps:
1. Update `apps/web/index.html` so `#root` contains accessible fallback markup: BuildingAgent brand, short loading/skeleton copy, and explicit mock/stub-only safety language.
2. Add fallback/skeleton CSS in `apps/web/src/styles.css` that is safe before React mounts and matches the new visual direction without depending on generated assets.
3. Update `apps/web/src/main.tsx` so React clears or supersedes the static fallback deterministically when mounting; avoid leaving duplicate landmarks after mount.
4. Create `apps/web/src/appShell.test.tsx` with tests that read `apps/web/index.html` from the tracked file and assert non-empty fallback/skeleton/brand/mock-only text, plus a render assertion that React replaces the fallback.

Must-haves:
- `#root` is non-empty in `apps/web/index.html` and contains a visible branded BuildingAgent loading/skeleton shell.
- The fallback includes mock/stub-only wording so first paint cannot imply live building operations.
- React mount does not leave duplicate static fallback UI in normal app rendering.
- Tests do not read `.gsd/`, `.planning/`, `dist/`, or other ignored paths; they use inline setup or tracked files only.

## Inputs

- ``apps/web/index.html` — current empty root and Vite entrypoint.`
- ``apps/web/src/main.tsx` — current React bootstrap entrypoint.`
- ``apps/web/src/styles.css` — existing shared Web styles.`
- ``apps/web/vite.config.ts` — existing Vitest/jsdom configuration.`

## Expected Output

- ``apps/web/index.html` — static branded no-blank fallback shell inside `#root`.`
- ``apps/web/src/main.tsx` — React bootstrap cleanup/supersession of the fallback.`
- ``apps/web/src/styles.css` — fallback and skeleton styles that apply before and after mount.`
- ``apps/web/src/appShell.test.tsx` — focused no-blank shell tests.`

## Verification

npm --workspace @building-agent/web test -- --run apps/web/src/appShell.test.tsx

## Observability Impact

Signals added/changed: first-paint shell text, skeleton classes, and mock/stub-only safety label become visible before React. How a future agent inspects this: open `apps/web/index.html`, run the new Vitest tests, or view the local app before bundle completion. Failure state exposed: a broken or delayed bundle leaves branded safe fallback UI instead of a blank screen.
