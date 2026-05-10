---
id: T04
parent: S04
milestone: M001
key_files:
  - README.md
  - apps/api/src/providers.ts
  - apps/api/src/providers.test.ts
  - apps/web/src/App.test.tsx
  - apps/cli/src/commands.test.ts
key_decisions:
  - Document BUILDING_AGENT_LLM_* as the preferred provider contract in README while keeping legacy OpenAI-compatible env names as compatibility fallbacks.
  - Default to deterministic mock chat when no provider credentials are present or when BUILDING_AGENT_LLM_PROVIDER=mock.
  - Require explicit BUILDING_AGENT_LLM_ALLOW_FALLBACK=true to convert real-provider failures into deterministic fallback responses; otherwise preserve the canonical provider error envelope.
  - Keep all Web/CLI/API/smoke examples redaction-safe and placeholder-only, with requestId/provider diagnostics but no secrets.
duration: 
verification_result: passed
completed_at: 2026-05-10T15:30:10.427Z
blocker_discovered: false
---

# T04: Documented the BUILDING_AGENT_LLM_* provider contract and verified the full S04 chat fallback suite end-to-end.

**Documented the BUILDING_AGENT_LLM_* provider contract and verified the full S04 chat fallback suite end-to-end.**

## What Happened

I documented the provider configuration and fallback contract in README.md so a cold reader can tell when the chat path uses deterministic mock fallback, when it prefers a configured real provider, how explicit fallback behaves, and how to inspect requestId/provider diagnostics without exposing secrets. To keep the docs accurate, I also aligned the provider resolver to honor the BUILDING_AGENT_LLM_* env names described in the README and updated API/Web/CLI tests to cover the new contract and redaction-safe examples.

I then ran the full S04 verification suite from the repository root and repeated it after fixing redaction scan failures in test fixtures. The final gate passed cleanly, and a follow-up redaction scan over the touched source/docs also passed with no secret-like literals remaining.

## Verification

Verified the documentation and implementation contract with the full S04 gate from repo root: `npm test -- --run apps/api/src/chat.test.ts apps/api/src/providers.test.ts apps/web/src/App.test.tsx apps/cli/src/commands.test.ts && npm run typecheck && npm run build && npm run smoke` passed, and a targeted redaction scan over `apps/api/src/providers.ts`, `apps/api/src/chat.test.ts`, `apps/api/src/providers.test.ts`, `apps/web/src/App.test.tsx`, `apps/cli/src/commands.test.ts`, `scripts/smoke-local.cjs`, and `README.md` passed with no secret-like literals.

Smoke exercised the live API/Web/CLI path, including deterministic fallback behavior, requestId propagation, and cleanup, without leaking secrets.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm test -- --run apps/api/src/chat.test.ts apps/api/src/providers.test.ts apps/web/src/App.test.tsx apps/cli/src/commands.test.ts && npm run typecheck && npm run build && npm run smoke` | 0 | ✅ pass | 165747ms |
| 2 | `python3 redaction_scan.py (touched source/docs secret-literal scan)` | 0 | ✅ pass | 61ms |

## Deviations

I made a small implementation alignment in apps/api/src/providers.ts so the documented BUILDING_AGENT_LLM_* env contract is actually honored; legacy OpenAI-compatible env names remain supported for compatibility.

## Known Issues

None.

## Files Created/Modified

- `README.md`
- `apps/api/src/providers.ts`
- `apps/api/src/providers.test.ts`
- `apps/web/src/App.test.tsx`
- `apps/cli/src/commands.test.ts`
