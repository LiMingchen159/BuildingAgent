# S04 — Research: Provider-backed chat fallback remediation

**Date:** 2026-05-10
**Scope:** Research for `M001/S04` planner. This slice is medium-risk because it changes the core chat contract from local user-message storage to a provider-selection/runtime seam while preserving existing auth, project isolation, Web, CLI, and smoke behavior.

## Summary

S04 primarily owns **R008**: the platform needs an extensible model/provider configuration skeleton and chat must prefer a configured real provider when credentials/config exist, with mock fallback only for CI/smoke/no-credential local runs. It also supports **R013** and **R014** because smoke checks and README must prove/explain both provider paths, and it touches **R002/R004/R009/R010** because the existing Web/CLI chat flows parse and render the current chat message contract.

Current implementation is intentionally pre-S04: `POST /api/projects/:projectId/chat` authenticates, checks selected project and `chat:write`, validates the message, stores only a `role: "user"` message, and returns that one message. There is no provider module, provider config, assistant response, provider metadata, or fallback notice. The registry has placeholder runtime provider cards, but those are static synthetic fixtures and are not connected to chat execution.

The most important planner constraint: **do not weaken S01’s trusted boundary**. Provider selection must happen only after bearer auth, project membership, selected-project match, and `chat:write` pass. Provider calls must not receive bearer tokens, seeded passwords, API keys, or broad project/user objects. The provider should get a narrow prompt/context payload and return a narrow completion result.

## Recommendation

Add a small backend **ports-and-adapters provider seam** and make the chat route call it after authorization. Keep the external API stable enough for existing clients, but extend it with assistant response/provider metadata:

- Introduce a deep module such as `apps/api/src/providers.ts` that exposes one main operation, e.g. `resolveChatProvider(env).completeChat(input)`.
- Provide two adapters:
  - deterministic local/mock provider used when credentials/config are absent or explicit mock mode is set;
  - real provider adapter selected when required environment variables are present. Prefer an OpenAI-compatible HTTP adapter using Node’s built-in `fetch` instead of adding a vendor SDK for M001, while keeping the interface generic enough to add other vendors later.
- Extend `ChatMessage.role` from only `"user"` to `"user" | "assistant"`; `POST /chat` should store the user message, call the selected provider, store the assistant message, and return `{ message, assistantMessage, provider, fallbackUsed, requestId }` (or a similarly explicit shape).
- Include provider diagnostics in API responses and CLI/Web display, but never include secret values. Good metadata fields: provider id/name, mode/status (`real`/`mock`), model when non-secret, `fallbackUsed`, and a short fallback reason code.
- Add tests using injected fake providers rather than real credentials, so CI proves provider-selection behavior without network/secrets. Optional real-provider smoke can be enabled only when env vars are present.

The `design-an-interface` skill guidance applies here: make this a **small interface hiding provider complexity**, not scattered env checks in `server.ts`. A ports-and-adapters shape is best because `server.ts`, CLI, Web, and tests should experience one stable provider contract while implementation details (env parsing, OpenAI-compatible payloads, fallback decision, error normalization, secret redaction) stay internal.

## Implementation Landscape

### Existing files and roles

- `apps/api/src/server.ts`
  - Defines all Fastify routes.
  - `buildServer(options = {})` currently accepts only `{ store?: SeedStore }`.
  - Chat routes are around `/api/projects/:projectId/chat`.
  - The POST route already performs the correct auth/project/permission checks before message storage. This is the right insertion point for provider invocation.
  - Current POST response is `{ message, requestId }` with status 201.

- `apps/api/src/seed.ts`
  - Defines `ChatMessage` as `{ id, projectId, userId, role: "user", content }`.
  - Contains static `runtimeProviders` placeholder fixtures including `runtime_provider_local_llm`; these are registry metadata only.
  - `messagesByProject` remains the natural in-memory chat transcript store for S04.

- `apps/api/src/chat.test.ts`
  - Verifies auth, selected-project, project isolation, write permission, invalid payloads, and user-message storage.
  - Must be updated/extended for assistant messages, provider selection, fallback behavior, provider failure handling, and no-secret metadata.
  - Existing auth/isolation tests are valuable guardrails; preserve them.

- `apps/api/src/registry.test.ts`
  - Verifies placeholder registry/management payloads contain no obvious secret-like fields.
  - S04 may need updates if registry runtime provider status becomes dynamic, but the safer M001 path is to leave registry fixtures static unless explicit provider-status surfacing is required.

- `apps/web/src/api.ts`
  - Defines Web-facing `ChatMessage` with `role: "user"` only.
  - `getChat()` and `sendChatMessage()` currently drop any message whose role is not `"user"`.
  - Must be changed or the Web will silently discard assistant responses.
  - Good seam for parsing provider metadata and failing closed on malformed S04 chat responses.

- `apps/web/src/App.tsx`
  - `ChatWorkspace` renders messages without role-aware styling; `handleSend()` appends only `posted.message`.
  - Must append/display assistant message and visible provider/fallback notice. Avoid exposing secrets; show provider status/model/request id/fallback only.

- `apps/web/src/App.test.tsx`
  - Tests the login → project select → chat flow and fetch shapes.
  - Must update chat POST mock response and assertions to cover assistant rendering plus fallback/provider notice.

- `apps/cli/src/api.ts`
  - Low-level API client returns unknown payloads for `sendChat()`; no strict chat parser yet.
  - It can pass through S04 fields without much change, but adding a typed parser would improve failure visibility.

- `apps/cli/src/commands.ts`
  - `chat` command prints the raw API response; `chat:list` prints raw list.
  - Existing behavior can work if API returns extra fields, but tests should assert provider metadata is visible and token material is absent.

- `apps/cli/src/commands.test.ts`
  - Uses a real in-process API server. Must update expected chat response to include assistant/provider metadata and ensure no token/secret leaks.

- `scripts/smoke-local.cjs`
  - Runs `npm run build`, starts/probes API/Web, drives built CLI through login/project/registry/management/chat.
  - Current chat assertion only checks `chat.message.projectId` and `chat:list` includes the user content.
  - Add fallback assertion for default no-secret runs. Optionally add an env-gated real-provider check when provider env vars exist, but default smoke must stay deterministic and no-secret.

- `README.md`
  - Currently documents local Web/API/CLI/smoke but not provider configuration or fallback behavior.
  - Must document env vars, default mock fallback, optional real-provider mode, no-secret policy, and verification commands.

- `package.json` / `apps/api/package.json`
  - No provider SDKs are installed. API dependencies are only Fastify/CORS.
  - Node 20 is available via TypeScript settings/dev deps; built-in `fetch` can support an OpenAI-compatible HTTP adapter without adding dependency risk.

### Natural seams for planner decomposition

1. **Backend provider seam + API contract**
   - Add `providers.ts` (or similar), extend `buildServer` options for injected provider/env, update `ChatMessage`, and update chat route.
   - Highest-risk task because it defines the contract all clients/tests consume.

2. **API tests**
   - Add provider-selection/fallback tests adjacent to `apps/api/src/chat.test.ts` or in a new `providers.test.ts`.
   - Tests should prove:
     - no provider call before auth/project/permission checks;
     - configured fake real provider is preferred;
     - missing config uses deterministic mock fallback;
     - real provider failure either returns explicit `provider_error` or falls back only when explicitly allowed by local/smoke mode (do not silently hide primary-path failures);
     - response metadata contains no key/secret/bearer/password strings.

3. **Web contract/UI update**
   - Update `apps/web/src/api.ts` parser and `App.tsx` rendering.
   - Ensure assistant messages are not dropped and fallback notice is visible.
   - Add/update App tests.

4. **CLI + smoke update**
   - CLI may need minimal changes if API pass-through is accepted, but tests should lock provider metadata and redaction.
   - `scripts/smoke-local.cjs` should assert default fallback mode and not require credentials.

5. **README/docs**
   - Document env names and behavior after implementation shape is stable.

## Interface Design Notes

Three viable provider interface shapes considered:

1. **Single function:** `completeProjectChat(input, config)` hides all provider resolution internally.
   - Simple for `server.ts`, but awkward for tests and future providers because env/config resolution and completion execution are coupled.

2. **Registry/router:** `providerRegistry.resolve(config).complete(input)` with many extension points.
   - Flexible, but too broad for M001 and risks creating a shallow framework before any real integrations exist.

3. **Ports-and-adapters hybrid (recommended):**
   - `ChatProvider` port: `complete(input): Promise<ChatProviderResult>`.
   - `resolveChatProvider(env, options)` returns `{ provider, selected, fallbackUsed? }` or a provider that includes selection metadata in each result.
   - `MockChatProvider` and `OpenAICompatibleProvider` are adapters.
   - Tests can inject a fake `ChatProvider` through `buildServer({ chatProvider })` or inject env/fetch into resolver.

Recommended because it keeps `server.ts` small, gives tests deterministic control, and preserves future extensibility without overbuilding a provider framework.

## Provider Behavior Contract to Prove

Minimum useful S04 behavior:

- Default no-env local run uses deterministic mock fallback and marks `fallbackUsed: true` (or provider mode `mock`).
- When required real-provider env exists, selection prefers the real adapter and marks `fallbackUsed: false`.
- Provider metadata includes non-secret model/provider id and request id, not raw config.
- Provider prompt input is narrow: current project id, user id, sanitized message, and optionally bounded recent transcript; no bearer token or seeded password.
- Bounded chat history still applies (`store.maxChatMessages`). If both user and assistant messages are stored, trimming must account for two messages per turn.
- Auth/project/write checks remain before provider work.
- Read-only project still cannot trigger provider calls.

## Suggested Environment Shape

Keep names implementation-oriented and README-friendly. Example:

- `BUILDING_AGENT_LLM_PROVIDER=mock|openai-compatible`
- `BUILDING_AGENT_LLM_BASE_URL=https://api.openai.com/v1` (or local compatible endpoint)
- `BUILDING_AGENT_LLM_API_KEY=...` (required for real adapter; never logged)
- `BUILDING_AGENT_LLM_MODEL=...`
- Optional: `BUILDING_AGENT_LLM_ALLOW_FALLBACK=true` for local/dev fallback on real-provider errors. Without this, configured-real-provider failures should be explicit so primary user path does not silently degrade.

The planner/executor can choose exact names, but README and tests should lock them once chosen.

## Verification Strategy

Use existing root commands, but target S04 files first:

- API focused tests:
  - `npm test -- --run apps/api/src/chat.test.ts` (or plus a new provider test file)
- Web tests:
  - `npm test -- --run apps/web/src/App.test.tsx`
- CLI tests:
  - `npm test -- --run apps/cli/src/commands.test.ts`
- Full checks:
  - `npm run typecheck`
  - `npm run build`
  - `npm run smoke`

For optional real-provider proof, do not require secrets in default CI. Add an env-gated smoke branch or documented manual check that runs only when provider env vars are present. If a command fails due to missing provider key during execution, collect secrets through `secure_env_collect`; do not ask the user to edit `.env` manually.

## Risks and Pitfalls

- **Silent fallback can violate D005/R008.** If credentials are configured but the real provider fails, fallback should be explicit and preferably opt-in for local/dev. Otherwise the system can appear to be real-provider-backed while using mock output.
- **Web parser currently drops assistant messages.** This is the most likely integration gotcha after backend changes.
- **Provider metadata can leak secrets by accident.** Never include raw env/config in responses, errors, CLI diagnostics, logs, README examples with real-looking keys, or GSD artifacts.
- **Provider calls before permission checks would be a regression.** Preserve the current guard order in `server.ts`.
- **Registry placeholder status is separate from runtime behavior.** Avoid making `/api/registry` imply a real integration unless it is truly wired and tested.
- **No new real building data.** Provider prompts/responses should use local synthetic/project text only.

## Skill Discovery

Installed/relevant skills from the environment:

- `api-design` — relevant if planner wants to formalize the extended chat response shape and error semantics.
- `design-an-interface` — used for this research; recommendation is a ports-and-adapters provider seam with a small deep interface.
- `observability` — relevant for provider selection/fallback diagnostics and redaction-safe failure modes.
- `write-docs` — relevant for README provider configuration and no-secret fallback instructions.

External skill search for Fastify found potentially relevant optional skills, not installed:

- `mcollina/skills@fastify-best-practices` (~1.9K installs): `npx skills add mcollina/skills@fastify-best-practices`
- `mindrally/skills@fastify-typescript` (~353 installs): `npx skills add mindrally/skills@fastify-typescript`

No provider SDK skill is necessary for the recommended dependency-light OpenAI-compatible HTTP adapter.

## Sources

- Existing API route and auth/project guard flow: `apps/api/src/server.ts`
- Seed/store/message and placeholder provider fixture definitions: `apps/api/src/seed.ts`
- Current API chat/registry tests: `apps/api/src/chat.test.ts`, `apps/api/src/registry.test.ts`
- Web API parser and chat UI: `apps/web/src/api.ts`, `apps/web/src/App.tsx`
- CLI API/command path: `apps/cli/src/api.ts`, `apps/cli/src/commands.ts`, `apps/cli/src/commands.test.ts`
- Smoke runner: `scripts/smoke-local.cjs`
- Current docs/scripts/env usage: `README.md`, `package.json`, `apps/api/package.json`
- Project memories: MEM012 (S01 trusted auth/project boundary), MEM017 (S02 registry/project-management split), MEM025 (smoke should exercise real built CLI entrypoint)
