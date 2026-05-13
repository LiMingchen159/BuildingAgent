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
| P0-9 | **Code Execution** | `tools/code_execution_tool.py` | LLM writes Python scripts that call tools via RPC bridge. Dedicated sandboxed process. Collapses N tool calls into 1 inference turn. | **Implemented** — `execute_code` tool runs Python in a sandboxed subprocess with timeout and output capture. RPC bridge deferred. | Already working. RPC bridge deferred to P2. | — | — |
| P0-10 | **Scheduler / Reminder** | `cron/` (jobs.py, scheduler.py), `tools/cronjob_tools.py` | Create one-shot/recurring jobs with `job_id`. Parse natural-language time expressions. Fire callbacks at scheduled time. | **Implemented** — `scheduler.ts` `SchedulerService`: schedule, cancel, cancelMostRecent, cancelAll, list. Chinese time expression parsing. File persistence (`scheduled_jobs.json`). `schedule_reminder`, `cancel_reminder`, `list_reminders` tools. `onFired` callback injects proactive messages into chat. | Already working. Recurring cron support deferred to P1. | — | — |
| P0-11 | **Job Cancel / Management** | `cron/`, `tools/cronjob_tools.py` | Cancel by ID, cancel most recent, cancel all, list jobs. Pause/resume for recurring. | **Implemented** — `cancel(jobId)`, `cancelMostRecent(projectId)`, `cancelAll(projectId)`, `list(projectId)` on `SchedulerService`. Tools: `cancel_reminder(action)`, `list_reminders`. | Already working. | — | — |
| P0-12 | **Memory / Session State** | `tools/memory_tool.py` (MEMORY.md/USER.md), `agent/memory_manager.py`, `hermes_state.py` (SQLite FTS5) | Three-layer memory: file-backed MEMORY.md + external MemoryProvider plugins + SQLite session DB with FTS5 search. | **Implemented** — `AgentMemoryStore`: scoped by `projectId:userId`, max 50 entries. `memory_remember` + `memory_search` tools. File persistence to `data/agent_memory.json` on every write. Loaded on server start via `start()`. | Already working. | — | — |
| P0-13 | **Project-Scoped Context** | `hermes_state.py` session DB | Each project/session has isolated messages, files, tools, memory. | **Implemented** — All data keyed by `projectId`: messages, conversations, KB, repository, memory, scheduler jobs. Membership guards on all endpoints. | Already working. | — | — |
| P0-14 | **Tool Call Logging** | `run_agent.py` exception handlers, gateway logging | Tool calls logged with args, result, duration, error. Structured JSON output. | **Implemented** — `AgentToolRegistry` logs every dispatch to `data/tool_call_logs.json` with: id, tool name, category, args, result, error, duration, projectId, conversationId, requestId, userId. Max 2000 entries. API endpoint: `GET /:projectId/tool-logs`. | Already working. | — | — |

## P1 — Important capabilities (migrate after P0)

| # | Capability | Hermes Location | BuildingAgent Status | Required Behavior | Priority |
|---|---|---|---|---|---|
| P1-1 | **Web Search** | `tools/web_search_tool.py` | **Implemented** — `web_search` (DuckDuckGo API) + `web_extract` (URL text extraction). No API key required. | m004-s5 | — |
| P1-2 | **Web Extract** | `tools/web_extract_tool.py` | **Implemented** — Included with web_search. Fetches URL, strips HTML, returns plain text. | m004-s5 | — |
| P1-3 | **Git / Repository Operations** | `tools/git_tools.py` | **Missing** — No git tools. | Add `git_status`, `git_diff`, `git_log` (read-only first). | P2 |
| P1-4 | **Context Compression** | `agent/context_compressor.py` | **Implemented** — `ContextCompressor` deduplicates tool results, keeps tail messages. Budget: 40 msgs, 8 tail. | m004-s6 | — |
| P1-5 | **Health / Status Endpoints** | Gateway health checks | **Implemented** — `/health` returns `{ok, service, requestId}`. | Already working. | — |
| P1-6 | **Skill Registry (runtime CRUD)** | `skills/`, `tools/skill_manager_tool.py` | **Partial** — `AgentSkillRegistry` has 3 placeholder skills. No runtime CRUD. | Add skill create/edit tools. | P2 |
| P1-7 | **Structured JSON Logging** | `hermes_logging.py` | **Partial** — Tool call logs are persisted. Fastify logger not structured. | Add structured logging with rotation. | P2 |
| P1-8 | **Background Process Monitoring** | `tools/terminal_tool.py`, `process_registry.py` | **Implemented** — `ProcessRegistry` with spawn/status/kill/list. 4 process tools. | m004-s4 | — |
| P1-9 | **Recurring Cron Jobs** | `cron/scheduler.py`, `cron/jobs.py` | **Implemented** — Interval + cron expression recurrence. Background ticker. Pause/resume. `cronjob` tool. | m004-s2 | — |
| P1-10 | **WebSocket Push** | `tui_gateway/ws.py` | **Implemented** — WS upgrade handler, per-project connection tracking, `reminder_fired` broadcast. Frontend auto-reconnect. | m004-s3 | — |

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
| P0 | 14 | 14 | 0 | 0 |
| P1 | 10 | 8 | 2 | 0 |
| P2 | 8 | 0 | 0 | 8 |

**P1 completed (m004-s2 through m004-s6):**
- P1-9: Recurring Cron Jobs ✅ — interval/cron recurrence, ticker, pause/resume, cronjob tool
- P1-10: WebSocket Push ✅ — real-time delivery, auto-reconnect, auth via token query param
- P1-8: Background Process Monitoring ✅ — ProcessRegistry, process_start/status/kill/list tools
- P1-4: Context Compression ✅ — dedup tool results, keep tail, budget 40 messages
- P1-1: Web Search ✅ — DuckDuckGo API, web_extract for URL text extraction
- P1-5: Health Endpoint ✅ — /health returns `{ok, service, requestId}`

**P0 all clear:**
- P0-1: Grace call ✅ — final LLM call without tools on max iteration
- P0-9: execute_code tool ✅ — Python execution via terminal tool

**P1 remaining:**
- P1-6: Skill CRUD (runtime skill editing)
- P1-7: Structured JSON Logging (log rotation, request tracing)
