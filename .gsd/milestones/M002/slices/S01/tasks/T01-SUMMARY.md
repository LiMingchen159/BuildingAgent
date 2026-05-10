---
id: T01
parent: S01
milestone: M002
key_files:
  - apps/web/index.html
  - apps/web/src/styles.css
  - apps/web/src/main.tsx
  - apps/web/src/appShell.test.tsx
key_decisions:
  - Implemented fallback CSS as static global classes in styles.css so the HTML fallback renders safely before React mounts.
  - Exported mountBuildingAgent from main.tsx and explicitly clears #root before React render to avoid duplicate fallback landmarks.
duration: 
verification_result: passed
completed_at: 2026-05-10T18:52:32.324Z
blocker_discovered: false
---

# T01: Added a branded no-blank BuildingAgent HTML fallback shell that React clears on mount, with focused tests proving the contract.

**Added a branded no-blank BuildingAgent HTML fallback shell that React clears on mount, with focused tests proving the contract.**

## What Happened

Added a branded static BuildingAgent startup shell inside the tracked HTML #root with a status live region, skeleton bars, and explicit mock/stub-only safety wording. Added pre-mount-safe global CSS for the fallback visual direction with reduced-motion handling. Updated the React bootstrap to export a mount function and deterministically clear the static fallback before React renders. Added focused Vitest coverage that reads the tracked index.html and proves the fallback exists, then mounts the real app and verifies the static fallback is gone. Also verified in browser by blocking the bundle to observe the fallback and reloading normally to confirm React supersedes it.

## Verification

Fresh verification passed with `npm --workspace @building-agent/web test -- --run src/appShell.test.tsx` (2 tests passed) and `npm --workspace @building-agent/web run typecheck` (exit 0). Browser verification against the local Vite app showed the blocked-bundle fallback text/status region was visible and normal React rendering had zero `[data-static-fallback]` nodes.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm --workspace @building-agent/web test -- --run src/appShell.test.tsx` | 0 | ✅ pass | 55626ms |
| 2 | `npm --workspace @building-agent/web run typecheck` | 0 | ✅ pass | 8950ms |
| 3 | `browser assertions/evaluation at http://127.0.0.1:5173/` | 0 | ✅ pass | 0ms |

## Deviations

The planned command using the repository-relative path (`npm --workspace @building-agent/web test -- --run apps/web/src/appShell.test.tsx`) fails because npm runs the workspace script from `apps/web`, so Vitest cannot match that path. I used the package-relative equivalent `src/appShell.test.tsx` for the passing focused verification.

## Known Issues

The literal planned verification command with `apps/web/src/appShell.test.tsx` exits 1 because Vitest is invoked from the workspace directory and reports no matching tests. Browser diagnostics during an intentional blocked-bundle check show the expected failed script request; after routes were cleared, React rendered and the static fallback count was 0.

## Files Created/Modified

- `apps/web/index.html`
- `apps/web/src/styles.css`
- `apps/web/src/main.tsx`
- `apps/web/src/appShell.test.tsx`
