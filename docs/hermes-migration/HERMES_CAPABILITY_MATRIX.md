# Hermes → BuildingAgent Capability Matrix

_Last audited: 2026-05-13 against branch m004-s1-hermes-migration-audit_

## P0 — Core capabilities (must migrate first)

| # | Capability | Hermes Location | Original Hermes Behavior | BuildingAgent Status | Required Behavior | Files to Modify | Priority |
|---|---|---|---|---|---|---|---|
| P0-1 | **Agent Runtime (multi-turn loop)** | `run_agent.py` `AIAgent._run()` | while loop: LLM call → tool_calls → execute → repeat up to 90 iters. IterationBudget with subagents. Grace call on exhaustion. | **Implemented** — `runtime.ts` `AgentRuntime.runTurnStream()`: multi-turn loop (max 20 iters), SSE streaming, lifecycle events, provider retry (2x). Missing: grace call on max iteration (uses hardcoded fallback text). | Add grace call: one final LLM call without tools at max iterations to summarize findings. | `apps/api/src/agent/runtime.ts` | P0 |
| P0-2 | **LLM Provider Config (.env)** | `providers/` via `resolve_chat_provider()` | `BUILDING_AGENT_LLM_PROVIDER`, `_API_KEY`, `_MODEL`, `_BASE_URL` env vars. Falls back to mock if no API key. | **Implemented** — `providers.ts` `resolveChatProvider()` reads same env vars. `createOpenAICompatibleProvider()` handles OpenAI-compatible APIs. Mock fallback with tool support. | Already working. | — | — |
| P0-3 | **Tool Registry / Dispatcher** | `tools/registry.py`, `model_tools.py` | Hierarchical toolset system. Tools self-register with schema + handler + check_fn. `handle_function_call()` dispatches. | **Implemented** — `AgentToolRegistry` with `register()`, `dispatch()`, `toOpenAIToolDefinitions()`, `schemas()`, `queryLogs()`. 12 tools registered. | Already working. | — | — |
| P0-4 | **Terminal Execution** | `tools/terminal_tool.py` | Shell command execution with timeout, stdout/stderr capture, background process support. | **Implemented** — `terminal` tool: `exec()` with timeout (max 120s), cwd=KB root, output limits (100K chars). Sync only (no background process monitoring yet). | Already working. Background process support deferred to P1. | — | — |
| P0-5 | **File Read** | `tools/file_tools.py` | Read text files with line numbers, offset, limit. Path traversal protection. | **Implemented** — `read_file` tool: line-numbered output, offset/limit params, path traversal guard, binary detection. | Already working. | — | — |
| P0-6 | **File Write** | `tools/file_tools.py` | Create/overwrite files with path traversal protection, auto-create parent dirs. | **Implemented** — `write_file` tool: KB-scoped path, auto-create dirs, max 500KB content. | Already working. | — | — |
| P0-7 | **File Search (grep/glob)** | `tools/file_tools.py` | Search by glob pattern or grep file contents. | **Implemented** — `search_files` tool: `mode=files` (glob) and `mode=content` (grep). Max 50 results. | Already working. | — | — |
| P0-8 | **File Patch (edit)** | `tools/file_tools.py` | Find `old_string` in file, replace with `new_string`. First match only. | **Implemented** — `patch` tool: exact string replacement, path safety. | Already working. | — | — |
| P0-9 | **Code Execution** | `tools/code_execution_tool.py` | LLM writes Python scripts that call tools via RPC bridge. Dedicated sandboxed process. Collapses N tool calls into 1 inference turn. | **Partial** — No dedicated `execute_code` tool. The `terminal` tool can run `python -c "..."` but cannot call other tools via RPC. | Add `execute_code` tool that runs Python in a sandboxed subprocess. P2: add tool RPC bridge so executed code can call other tools. | `apps/api/src/agent/genericTools.ts` | P1 |
| P0-10 | **Scheduler / Reminder** | `cron/` (jobs.py, scheduler.py), `tools/cronjob_tools.py` | Create one-shot/recurring jobs with `job_id`. Parse natural-language time expressions. Fire callbacks at scheduled time. | **Implemented** — `scheduler.ts` `SchedulerService`: schedule, cancel, cancelMostRecent, cancelAll, list. Chinese time expression parsing. File persistence (`scheduled_jobs.json`). `schedule_reminder`, `cancel_reminder`, `list_reminders` tools. `onFired` callback injects proactive messages into chat. | Already working. Recurring cron support deferred to P1. | — | — |
| P0-11 | **Job Cancel / Management** | `cron/`, `tools/cronjob_tools.py` | Cancel by ID, cancel most recent, cancel all, list jobs. Pause/resume for recurring. | **Implemented** — `cancel(jobId)`, `cancelMostRecent(projectId)`, `cancelAll(projectId)`, `list(projectId)` on `SchedulerService`. Tools: `cancel_reminder(action)`, `list_reminders`. | Already working. | — | — |
| P0-12 | **Memory / Session State** | `tools/memory_tool.py` (MEMORY.md/USER.md), `agent/memory_manager.py`, `hermes_state.py` (SQLite FTS5) | Three-layer memory: file-backed MEMORY.md + external MemoryProvider plugins + SQLite session DB with FTS5 search. | **Implemented** — `AgentMemoryStore`: scoped by `projectId:userId`, max 50 entries. `memory_remember` + `memory_search` tools. File persistence to `data/agent_memory.json` on every write. Loaded on server start via `start()`. | Already working. | — | — |
| P0-13 | **Project-Scoped Context** | `hermes_state.py` session DB | Each project/session has isolated messages, files, tools, memory. | **Implemented** — All data keyed by `projectId`: messages, conversations, KB, repository, memory, scheduler jobs. Membership guards on all endpoints. | Already working. | — | — |
| P0-14 | **Tool Call Logging** | `run_agent.py` exception handlers, gateway logging | Tool calls logged with args, result, duration, error. Structured JSON output. | **Implemented** — `AgentToolRegistry` logs every dispatch to `data/tool_call_logs.json` with: id, tool name, category, args, result, error, duration, projectId, conversationId, requestId, userId. Max 2000 entries. API endpoint: `GET /:projectId/tool-logs`. | Already working. | — | — |

## P1 — Important capabilities (migrate after P0)

| # | Capability | Hermes Location | BuildingAgent Status | Required Behavior | Priority |
|---|---|---|---|---|---|
| P1-1 | **Web Search** | `tools/web_search_tool.py` | **Missing** — No web search tool. | Add `web_search` tool via configurable search API. | P1 |
| P1-2 | **Web Extract** | `tools/web_extract_tool.py` | **Missing** — No URL content extractor. | Add `web_extract` tool (readability-style extraction). | P1 |
| P1-3 | **Git / Repository Operations** | `tools/git_tools.py` | **Missing** — No git tools. | Add `git_status`, `git_diff`, `git_log` (read-only first). | P1 |
| P1-4 | **Context Compression** | `agent/context_compressor.py` | **Missing** — Messages grow unbounded. | Prune old tool results, summarize middle turns when threshold exceeded. | P1 |
| P1-5 | **Health / Status Endpoints** | Gateway health checks | **Partial** — `/health` returns `{ok: true}` only. | Expand `/health` to include provider, scheduler, tool count, uptime. | P1 |
| P1-6 | **Skill Registry (runtime CRUD)** | `skills/`, `tools/skill_manager_tool.py` | **Partial** — `AgentSkillRegistry` has 3 placeholder skills. No runtime CRUD. | Add skill create/edit tools. Load skills from `Knowledge Base/skills/`. | P1 |
| P1-7 | **Structured JSON Logging** | `hermes_logging.py` | **Missing** — Fastify logger disabled, console.error only. | Add structured JSON logging with request tracing, log rotation. | P1 |
| P1-8 | **Background Process Monitoring** | `tools/terminal_tool.py`, `process_registry.py` | **Missing** — `terminal` tool is sync-only. | Add async process: start/status/output/kill. Process registry. | P1 |
| P1-9 | **Recurring Cron Jobs** | `cron/scheduler.py`, `cron/jobs.py` | **Missing** — Scheduler is one-shot only. | Add cron expression parsing. Recurring job ticker with at-most-once semantics. | P1 |
| P1-10 | **WebSocket Push** | `tui_gateway/ws.py` | **Missing** — Client polls every 5s. | Add WebSocket server for real-time reminder delivery and streaming. | P1 |

## P2 — Nice-to-have (migrate last)

| # | Capability | Hermes Location | BuildingAgent Status |
|---|---|---|---|
| P2-1 | **UI for Jobs/Tools/Memory** | Web/TUI dashboard | **Missing** — No management panels in web UI. |
| P2-2 | **Subagent Delegation** | `tools/delegate_tool.py` | **Missing** — No multi-agent support. |
| P2-3 | **Multi-Agent Orchestration** | `tools/kanban_tools.py` | **Missing** — No task board for agent coordination. |
| P2-4 | **Plugin System** | `plugins/` directory | **Missing** — No plugin hooks. |
| P2-5 | **Image Analysis (Vision)** | `tools/vision_tools.py` | **Missing** — No vision support. |
| P2-6 | **Image Generation** | `tools/image_generation_tool.py` | **Missing** — No image generation. |
| P2-7 | **Text-to-Speech** | `tools/tts_tool.py` | **Missing** — No TTS support. |
| P2-8 | **Browser Automation** | `tools/browser_tool.py` | **Missing** — No Playwright-based browser tools. |

## Summary

| Priority | Total | Implemented | Partial | Missing |
|----------|-------|-------------|---------|---------|
| P0 | 14 | 12 | 2 | 0 |
| P1 | 10 | 0 | 2 | 8 |
| P2 | 8 | 0 | 0 | 8 |

**Remaining P0 work:**
1. P0-1: Agent Runtime — add grace call on max iteration exhaustion
2. P0-9: Code Execution — add dedicated `execute_code` tool (deferred to P1 due to terminal workaround)

**Key P1 gaps to address next:**
1. P1-9: Recurring Cron Jobs
2. P1-8: Background Process Monitoring
3. P1-4: Context Compression
4. P1-10: WebSocket Push
