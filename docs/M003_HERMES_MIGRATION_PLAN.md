# M003 Hermes-Like Chat Assistant MVP Plan

## Workflow Status

- BuildingAgent workflow rules read from `Agent.md` before coding.
- Hermes reference rules read from `D:\Git_project\references\hermes-agent\AGENTS.md`.
- Hermes is treated as read-only reference.
- GitHub CLI is installed, but issue creation is blocked by missing authentication (`HTTP 401`).
- Local git required per-command `safe.directory`; branch creation required elevated filesystem access for `.git`.

## Current BuildingAgent Structure

BuildingAgent is a TypeScript monorepo:

- `apps/api`: Fastify API with seeded auth, project selection, project-scoped chat, provider abstraction, registry placeholders, tests.
- `apps/web`: React/Vite UI with login, project picker, ChatGPT-like workspace layout, chat panel, registry/tools/skills panels.
- `apps/cli`: JSON CLI for login, project selection, registry, management, chat.
- `scripts`: test and smoke runners.

Existing chat state is in-memory inside `SeedStore.messagesByProject`. The API already has an OpenAI-compatible provider adapter and deterministic mock fallback, but it lacks a Hermes-style session runtime, agent loop, tool execution, skill loading, memory recall, message lifecycle events, and streaming semantics.

## Hermes Reference Architecture Summary

Hermes is Python-heavy and highly integrated. The useful MVP strategy is to reimplement the patterns in TypeScript rather than copy large Python modules.

- `run_agent.py`: `AIAgent` owns the conversation loop, tool-call processing, memory hooks, skill nudges, final response handling, and streaming callbacks.
- `model_tools.py`: thin public tool orchestration over a central registry; resolves enabled toolsets, filters schemas, dispatches tool calls.
- `tools/registry.py`: self-registering tool registry with schemas, handlers, availability checks, dispatch, and toolset metadata.
- `toolsets.py`: named toolset bundles that decide what tools are exposed.
- `hermes_state.py`: SQLite session/message store with search and session metadata.
- `providers/base.py`: declarative provider profile pattern.
- `agent/memory_provider.py` and `agent/memory_manager.py`: memory provider lifecycle, recall context, post-turn sync, memory tool dispatch.
- `agent/skill_commands.py`, `agent/skill_utils.py`, `agent/prompt_builder.py`, `tools/skills_tool.py`, `tools/skill_manager_tool.py`: skill discovery, skill prompt injection, skill inspection/management.
- `web/src/pages/ChatPage.tsx`, `web/src/lib/gatewayClient.ts`, `tui_gateway/server.py`: Hermes web/TUI chat lifecycle and streaming/event surfaces.

## Migration Map

| Capability | Hermes source path | BuildingAgent target path | Approach | Dependencies required | Risk / complexity | MVP priority |
| --- | --- | --- | --- | --- | --- | --- |
| Session state | `hermes_state.py` | `apps/api/src/agent/sessionStore.ts` | Reimplement pattern | Node fs/path or in-memory first | Medium: persistence semantics can grow | P0 |
| Chat messages | `hermes_state.py`, `run_agent.py` | `apps/api/src/agent/messages.ts` | Reimplement pattern | TypeScript types only | Low | P0 |
| Agent runtime loop | `run_agent.py` | `apps/api/src/agent/runtime.ts` | Reimplement minimal pattern | Existing `ChatProvider` | Medium: tool-call loop later | P0 |
| Provider abstraction | `providers/base.py`, `agent/transports/*`, `run_agent.py` | `apps/api/src/providers.ts`, `apps/api/src/agent/providerProfiles.ts` | Adapt existing BuildingAgent provider layer | Existing fetch/OpenAI-compatible path | Low | P0 |
| Tool registry | `tools/registry.py`, `model_tools.py` | `apps/api/src/agent/tools.ts` | Reimplement pattern | TypeScript types only | Low | P0 |
| Generic tools | `tools/clarify_tool.py`, `tools/todo_tool.py`, `tools/session_search_tool.py`, `tools/memory_tool.py` | `apps/api/src/agent/genericTools.ts` | Reimplement small safe tools | Session/memory store | Medium | P1 |
| Skill registry | `agent/skill_utils.py`, `agent/skill_commands.py`, `tools/skills_tool.py` | `apps/api/src/agent/skills.ts` | Reimplement simple registry | Static TS fixtures first | Low | P1 |
| Generic skills | `skills/software-development/*`, `skills/research/*` | `apps/api/src/agent/genericSkills.ts` | Adapt concepts, not files | Skill registry | Low | P1 |
| Memory | `agent/memory_provider.py`, `agent/memory_manager.py`, `tools/memory_tool.py` | `apps/api/src/agent/memory.ts` | Reimplement minimal local memory | Session store | Medium | P0 |
| Chat loop | `run_agent.py` | `apps/api/src/agent/runtime.ts` | Reimplement minimal loop | Provider/tools/memory | Medium | P0 |
| Streaming lifecycle | `run_agent.py`, `tui_gateway/server.py`, `web/src/lib/gatewayClient.ts` | `apps/api/src/agent/lifecycle.ts`, `apps/web/src/api.ts`, `apps/web/src/App.tsx` | Simulated streaming for MVP | Existing REST endpoint | Medium | P1 |
| Registry UI data | `model_tools.py`, `tools/registry.py`, `web/src/pages/SkillsPage.tsx` | `apps/api/src/seed.ts`, `apps/api/src/server.ts`, `apps/web/src/ui/Tools.tsx`, `apps/web/src/ui/Skills.tsx` | Adapt current placeholder endpoints to real registry data | Agent registries | Low | P1 |

## Minimal Integration Plan

1. Keep BuildingAgent TypeScript-native.
2. Add an `apps/api/src/agent/` module group for session, memory, tool registry, skill registry, and runtime.
3. Route `POST /api/projects/:projectId/chat` through the agent runtime instead of calling the provider directly.
4. Keep deterministic mock behavior as the no-secret default.
5. Make tool and skill registry data power the existing registry and side panels.
6. Simulate streaming in the web UI by rendering an assistant draft while the API request is in flight, then replacing it with the final message.
7. Leave BIM/Brick/IFC/timeseries capabilities as mocked tool/skill entries with clear placeholder metadata.

## M003 Slices And Issues

### S1: Architecture Inspection And Migration Plan

- `[M003-S1-1] Inspect BuildingAgent frontend and backend structure`
  - Labels: `M003`, `slice-1`, `documentation`, `backend`, `frontend`
  - Branch: `m003-s1-1-buildingagent-structure-inspection`
- `[M003-S1-2] Analyze Hermes reference architecture and identify reusable modules`
  - Labels: `M003`, `slice-1`, `documentation`, `agent`
  - Branch: `m003-s1-2-hermes-architecture-analysis`
- `[M003-S1-3] Define the minimal Hermes-like chat/agent integration plan`
  - Labels: `M003`, `slice-1`, `documentation`, `chat`
  - Branch: `m003-s1-3-chat-agent-integration-plan`

### S2: Migrate Minimal Hermes-Like Core

- `[M003-S2-1] Add provider and chat service abstraction`
  - Labels: `M003`, `slice-2`, `enhancement`, `backend`, `agent`
  - Branch: `m003-s2-1-provider-chat-service`
- `[M003-S2-2] Add memory and session state module`
  - Labels: `M003`, `slice-2`, `enhancement`, `memory`, `backend`
  - Branch: `m003-s2-2-memory-session-state`
- `[M003-S2-3] Add agent runtime loop`
  - Labels: `M003`, `slice-2`, `enhancement`, `agent`, `chat`
  - Branch: `m003-s2-3-agent-runtime-loop`
- `[M003-S2-4] Add tool registry and generic tools`
  - Labels: `M003`, `slice-2`, `enhancement`, `tools`, `backend`
  - Branch: `m003-s2-4-tool-registry-generic-tools`
- `[M003-S2-5] Add skill registry and generic skills`
  - Labels: `M003`, `slice-2`, `enhancement`, `skills`, `backend`
  - Branch: `m003-s2-5-skill-registry-generic-skills`

### S3: Connect Frontend To Agent Backend

- `[M003-S3-1] Add backend chat/agent API endpoint`
  - Labels: `M003`, `slice-3`, `enhancement`, `backend`, `chat`
  - Branch: `m003-s3-1-backend-chat-agent-endpoint`
- `[M003-S3-2] Wire frontend chat input to backend endpoint`
  - Labels: `M003`, `slice-3`, `enhancement`, `frontend`, `chat`
  - Branch: `m003-s3-2-frontend-chat-endpoint`
- `[M003-S3-3] Render assistant responses and loading state`
  - Labels: `M003`, `slice-3`, `enhancement`, `frontend`, `chat`
  - Branch: `m003-s3-3-assistant-response-loading`
- `[M003-S3-4] Add streaming or simulated streaming feel`
  - Labels: `M003`, `slice-3`, `enhancement`, `frontend`, `chat`
  - Branch: `m003-s3-4-simulated-streaming-feel`

### S4: Hermes-Like UX Polish

- `[M003-S4-1] Show available tools and skills in the UI`
  - Labels: `M003`, `slice-4`, `enhancement`, `frontend`, `tools`, `skills`
  - Branch: `m003-s4-1-tools-skills-ui`
- `[M003-S4-2] Improve assistant response style`
  - Labels: `M003`, `slice-4`, `enhancement`, `chat`, `frontend`
  - Branch: `m003-s4-2-assistant-response-style`
- `[M003-S4-3] Add session reset and conversation persistence behavior`
  - Labels: `M003`, `slice-4`, `enhancement`, `memory`, `chat`
  - Branch: `m003-s4-3-session-reset-persistence`
- `[M003-S4-4] Verify end-to-end chat experience`
  - Labels: `M003`, `slice-4`, `verification`, `chat`
  - Branch: `m003-s4-4-e2e-chat-verification`

## Copy / Adaptation Decision

No Hermes module should be copied wholesale for MVP. Hermes modules are Python, broad, and tightly coupled to CLI/gateway/plugin infrastructure. BuildingAgent should copy ideas and small data shapes only:

- Keep the OpenAI message shape and tool schema shape.
- Reimplement registry dispatch in TypeScript.
- Reimplement memory/session stores in TypeScript.
- Reimplement the agent loop as a small provider -> optional tool calls -> final response pipeline.
- Adapt generic skill names/descriptions from Hermes-style skills, not full skill directories.

