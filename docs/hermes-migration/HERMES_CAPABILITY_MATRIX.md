# Hermes → BuildingAgent Capability Matrix

## P0 — Core capabilities (must migrate first)

| # | Capability | Hermes Location | Original Hermes Behavior | BuildingAgent Status | Required Behavior | Files to Modify | Tests |
|---|-----------|----------------|-------------------------|---------------------|-------------------|----------------|-------|
| P0-1 | **Agent Runtime (multi-turn loop)** | `run_agent.py` `AIAgent._run()` L11369 | while loop: LLM call → tool_calls → execute → feed back → repeat until no tool_calls. Max 90 iterations. IterationBudget shared with subagents. Grace call on exhaustion. | **Partial** — `runtime.ts` has multi-turn loop but max 20 iterations, no budget sharing, no grace call | Loop up to N iterations; yield lifecycle events; call LLM with tools; execute tool_calls; feed results back; break when no tool_calls; emit `turn_completed` | `apps/api/src/agent/runtime.ts` | Unit: mock provider + tool cycle, max iteration guard, grace call |
| P0-2 | **LLM Provider Config (.env)** | `providers/` via `resolve_chat_provider()` | `BUILDING_AGENT_LLM_PROVIDER`, `BUILDING_AGENT_LLM_API_KEY`, `BUILDING_AGENT_LLM_MODEL`, `BUILDING_AGENT_LLM_BASE_URL` env vars. Falls back to mock if no API key. | **Migrated** — `providers.ts` `resolveChatProvider()` reads same env vars. `createOpenAICompatibleProvider()` handles OpenAI-compatible APIs. | Already working. Verify .env loading from repo root. | `apps/api/src/providers.ts` | Confirm mock when no key; confirm real provider when key set |
| P0-3 | **Tool Registry / Dispatcher** | `tools/registry.py`, `model_tools.py`, `toolsets.py` | Hierarchical toolset system. Tools self-register with schema + handler + check_fn. `handle_function_call()` dispatches. | **Migrated** — `AgentToolRegistry` with `register()`, `dispatch()`, `toOpenAIToolDefinitions()`, `schemas()`. | Already working. Tools self-register in `createGenericToolRegistry()`. | `apps/api/src/agent/tools.ts`, `genericTools.ts` | Verify 9 tools registered, dispatch returns results |
| P0-4 | **Terminal Execution** | `tools/terminal_tool.py` | Shell command execution with timeout, stdout/stderr capture, background process support | **Migrated** — `terminal` tool in `genericTools.ts`. Uses `exec()` with timeout, cwd=KB root, output limits. | Works. Add background process support later (P1). | `apps/api/src/agent/genericTools.ts` | Run `echo hello`, verify stdout, verify timeout |
| P0-5 | **File Read** | `tools/file_tools.py` | Read text files with line numbers, offset, limit. Path traversal protection. | **Migrated** — `read_file` tool in `genericTools.ts`. KB-scoped path. | Already working. | `apps/api/src/agent/genericTools.ts` | Read a known file, verify line numbers |
| P0-6 | **File Write** | `tools/file_tools.py` | Create/overwrite files with path traversal protection. Auto-create parent dirs. | **Migrated** — `write_file` tool in `genericTools.ts`. | Already working. | `apps/api/src/agent/genericTools.ts` | Write, read back, verify content |
| P0-7 | **File Search (grep/glob)** | `tools/file_tools.py` | Search by glob pattern or grep file contents. | **Migrated** — `search_files` tool with `mode: files|content`. | Already working. | `apps/api/src/agent/genericTools.ts` | Search for `*.ttl`, search content for "Brick" |
| P0-8 | **File Patch (edit)** | `tools/file_tools.py` `patch` action | Find `old_string` in file, replace with `new_string`. First match only. | **Migrated** — `patch` tool in `genericTools.ts`. | Already working. | `apps/api/src/agent/genericTools.ts` | Patch a test file, verify |
| P0-9 | **Code Execution** | `tools/code_execution_tool.py` | LLM writes Python scripts that call tools via RPC. Collapses N tool calls into 1 inference turn. | **Missing** — No `execute_code` tool. Terminal tool can run Python but can't call tools. | Add `execute_code` tool that runs Python in a sandboxed process. P1: add tool RPC bridge. | `apps/api/src/agent/genericTools.ts` | Run `print(1+1)`, verify output |
| P0-10 | **Scheduler / Reminder / Cronjob** | `cron/` (cronjob system), `tools/cronjob_tools.py` | Parse natural-language time expressions. Create one-shot or recurring jobs with `job_id`. Fire callbacks at scheduled time. Support cancel/list/pause/resume. | **Missing** — No scheduler service. Agent can't create reminders or cronjobs. | **CRITICAL**: Build a scheduler service with: (a) parse "N秒后"/"N分钟后"/"明天上午9点" from chat messages, (b) create job with job_id, (c) fire callback that sends proactive message into the conversation, (d) support cancel. Store jobs in memory + persistence layer. | New: `apps/api/src/scheduler.ts`. Modify: `server.ts` (wire scheduler), `agent/genericTools.ts` (add `schedule_reminder` + `cancel_reminder` + `list_reminders` tools) | Create reminder, wait, verify proactive message. Cancel reminder. List reminders. |
| P0-11 | **Job Cancel / Management** | `cron/`, `tools/cronjob_tools.py` | Cancel jobs by ID. List all jobs. Pause/resume recurring. | **Missing** — Depends on P0-10 scheduler. | Add cancel/list tools that query the scheduler service. | `apps/api/src/scheduler.ts`, `agent/genericTools.ts` | Create job → cancel → verify removed |
| P0-12 | **Memory / Session State** | `tools/memory_tool.py` (MEMORY.md/USER.md), `agent/memory_manager.py`, `hermes_state.py` (SQLite FTS5) | Three layers: file-backed MEMORY.md + external MemoryProvider + SQLite session DB. `remember` stores project-scoped entries. `search` queries by text. Survives server restart. | **Partial** — `AgentMemoryStore` (in-memory Map). `memory_remember` + `memory_search` tools exist. But: (a) not file-backed, (b) not persisted across restarts, (c) no SQLite search. | Add file-backed persistence to `AgentMemoryStore`. Save to `apps/data/{projectId}/memory.json` on write. Load on init. | `apps/api/src/agent/memory.ts` | Write memory → restart server → verify memory persists |
| P0-13 | **Project-Scoped Context** | `hermes_state.py` session DB (scoped by session_id) | Each project/session has isolated messages, files, tools, memory. No cross-project leakage. | **Migrated** — `SeedStore` scoped by `projectId`. Messages, conversations, KB, repository, management all per-project. | Already working. Verify isolation. | `apps/api/src/seed.ts`, `server.ts` | Create messages in project A → switch to project B → verify no leakage |
| P0-14 | **Tool Call Logging / Error Handling** | `run_agent.py` exception handlers, gateway logging | Tool calls logged with args/result. Errors caught per-tool, reported as structured JSON. Provider errors trigger retry or fallback. | **Partial** — `runtime.ts` emits `tool_started`/`tool_completed` events with args/resultPreview. Provider has retry (2 retries, exponential backoff). But no persistent log of all tool calls. | Add structured logging of tool calls (name, args, result, duration, error). Store in `toolCallHistory` on the turn result. | `apps/api/src/agent/runtime.ts` | Trigger a failing tool → verify error in lifecycle event |

## P1 — Important capabilities (migrate after P0)

| # | Capability | Hermes Location | Original Behavior | BuildingAgent Status | Required Behavior | Files to Modify | Tests |
|---|-----------|----------------|-------------------------|---------------------|-------------------|----------------|-------|
| P1-1 | **Web Search** | `tools/web_search_tool.py` | Search the web via configurable search API. Return top results with titles and snippets. | **Missing** — No web search tool. | Add `web_search` tool. Use a configurable search backend (DuckDuckGo free tier or Google CSE via API key). | `apps/api/src/agent/genericTools.ts` | Search for a known term, verify result structure |
| P1-2 | **Web Extract** | `tools/web_extract_tool.py` | Fetch and extract text content from a URL (readability-style). | **Missing** | Add `web_extract` tool. Fetch URL, extract text content, respect size limits. | `apps/api/src/agent/genericTools.ts` | Extract from a known URL |
| P1-3 | **Git / Repository Operations** | `tools/git_tools.py` | Clone, status, diff, log, branch, commit within project workspace. | **Missing** — No git tools. | Add `git_status`, `git_diff`, `git_log` tools. Read-only initially. Write ops gated behind config. | `apps/api/src/agent/genericTools.ts` | Run git status in a repo dir |
| P1-4 | **Context Compression** | `agent/context_compressor.py` | Prune old tool results. Summarize middle turns with aux LLM. Protect head/tail messages. Triggers at 50% context window. | **Missing** — No compression. Messages grow unbounded. | Implement `ContextCompressor` that: (a) prunes duplicate tool results, (b) summarizes old turns, (c) protects recent messages. Trigger when message count > threshold. | New: `apps/api/src/agent/compressor.ts`. Modify: `runtime.ts` | Long conversation → verify compression |
| P1-5 | **Health / Status Endpoints** | `gateway/` health checks | `/health` returns service status, uptime, provider status. | **Partial** — `/health` exists but only returns `{ok: true}`. No provider status, no scheduler status. | Expand `/health` to include provider info, scheduler status, tool count, uptime. | `apps/api/src/server.ts` | GET /health → verify extended fields |
| P1-6 | **Skill Registry** | `skills/` directory, `tools/skill_manager_tool.py` | Skills are markdown documents injected into system prompt. `skill_manage` tool creates/edits skills at runtime. | **Partial** — `AgentSkillRegistry` exists but only has placeholder skills. No runtime skill editing. | Add runtime skill CRUD via tools. Load skills from `Knowledge Base/skills/`. | `apps/api/src/agent/skills.ts` | Create skill → verify it appears in prompt |
| P1-7 | **Observability / Structured Logs** | `hermes_logging.py`, gateway request tracing | Structured JSON logs with request_id, tool_call_id, provider, duration. | **Missing** — No structured logging. Server uses Fastify defaults. | Add structured JSON logging with request_id, tool_name, duration_ms, error info. | `apps/api/src/server.ts`, `agent/runtime.ts` | Trigger a turn → verify structured log output |
| P1-8 | **Long-Running Task Monitoring** | `tools/terminal_tool.py` process sub-action | Start background process, poll status, get output by session_id. | **Missing** — `terminal` tool is synchronous only. | Add async process support: start, status, get_output, kill. Store processes in a Map. | `apps/api/src/agent/genericTools.ts` | Start long process → poll status → get output |
| P1-9 | **Watchdog Notifications** | `gateway/` watchdog module | Monitor agent health. Send notification if agent is stuck or unresponsive. | **Missing** | Add watchdog that pings agent health every N seconds. Log or notify on failure. | `apps/api/src/server.ts` | Simulate agent hang → verify watchdog log |

## P2 — Nice-to-have (migrate last)

| # | Capability | Hermes Location | Original Behavior | BuildingAgent Status | Required Behavior |
|---|-----------|----------------|-------------------------|---------------------|-------------------|
| P2-1 | **UI for Jobs / Tools / Memory** | TUI gateway, web UI | Visual management of cronjobs, tool schemas, memory entries. | **Missing** — No management UI in web app. | Add management panels to the web UI (tabs or sidebar sections). |
| P2-2 | **Subagent Delegation** | `tools/delegate_tool.py` | Spawn child AIAgent with isolated context, restricted tools, parallel execution. | **Missing** | Add `delegate_task` tool that spawns sub-agent runs. |
| P2-3 | **Multi-Agent Orchestration** | `tools/kanban_tools.py` | Kanban board for multi-agent coordination. | **Missing** | Add kanban-style task board for coordinating multiple agent runs. |
| P2-4 | **Plugin / Skill Marketplace** | `plugins/` directory | External plugins can hook into pre/post tool/LLM call lifecycle. | **Missing** | Add plugin hook system (pre_tool_call, post_tool_call, etc.). |
| P2-5 | **Image Analysis (Vision)** | `tools/vision_tools.py` | Analyze images with auxiliary vision model. | **Missing** | Add vision tool for image analysis. |
| P2-6 | **Image Generation** | `tools/image_generation_tool.py` | Generate images via DALL-E/Imagen. | **Missing** | Add image generation tool. |
| P2-7 | **Text-to-Speech** | `tools/tts_tool.py` | Convert text to speech via Edge TTS / ElevenLabs. | **Missing** | Add TTS tool. |
| P2-8 | **Browser Automation** | `tools/browser_tool.py`, `browser_cdp_tool.py` | Playwright-based browser: navigate, snapshot, click, type, scroll. | **Missing** | Add browser tools (Playwright-based). |

## Summary

| Priority | Total | Migrated | Partial | Missing |
|----------|-------|----------|---------|---------|
| P0 | 14 | 7 | 4 | 3 |
| P1 | 9 | 0 | 2 | 7 |
| P2 | 8 | 0 | 0 | 8 |

**Key gaps to close first (P0 missing):**
1. P0-10: Scheduler / Reminder / Cronjob
2. P0-11: Job Cancel / Management
3. P0-9: Code Execution

**Key partials to complete (P0 partial):**
1. P0-1: Agent Runtime (add grace call, increase max iterations contextually)
2. P0-12: Memory (add file-backed persistence)
3. P0-14: Tool Call Logging

_Last updated: 2026-05-12_
