# Hermes → BuildingAgent Migration Plan

_Last updated: 2026-05-13_

## Architecture Overview

BuildingAgent is a web-first platform with a Fastify API backend and a React frontend. Hermes capabilities are integrated into the agent runtime, tool system, and scheduler layers.

```
┌─────────────────────────────────────────────────┐
│                  Web Frontend                     │
│  App.tsx → SSE streaming → ChatWorkspace         │
│  Tool indicators, job status, memory UI          │
└──────────────────┬──────────────────────────────┘
                   │ SSE / REST (5s poll fallback)
┌──────────────────▼──────────────────────────────┐
│              API Server (Fastify)                 │
│  /api/projects/:id/chat          (REST)          │
│  /api/projects/:id/chat/stream   (SSE)           │
│  /api/projects/:id/conversations                 │
│  /api/projects/:id/tool-logs                     │
│  /api/health                                      │
└──────┬──────────────────────┬───────────────────┘
       │                      │
┌──────▼──────────┐  ┌────────▼───────────────────┐
│  Agent Runtime   │  │    Scheduler Service        │
│  runtime.ts      │  │    scheduler.ts             │
│  Multi-turn loop │  │    - Chinese time parsing   │
│  Tool dispatch   │  │    - Job store (Map + file) │
│  Lifecycle events│  │    - Fire → inject msg      │
│  SSE streaming   │  │    - Cancel/list/manage     │
│  Provider retry  │  │    - Persist/restore        │
└──────┬──────────┘  └────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────┐
│              Tool Registry                        │
│  tools.ts → AgentToolRegistry                    │
│  genericTools.ts → 12 tools                      │
│  ┌──────────┬──────────┬──────────┬──────────┐  │
│  │ Terminal │ File R/W │Scheduler │  Memory  │  │
│  │ exec     │ S/P      │reminder  │ persist  │  │
│  └──────────┴──────────┴──────────┴──────────┘  │
└──────────────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────┐
│           Provider Layer                          │
│  providers.ts → OpenAI-compatible                │
│  .env → BUILDING_AGENT_LLM_*                     │
│  Fallback → Mock provider with tool support      │
└──────────────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────┐
│           Persistence Layer                       │
│  persistence.ts → store.json                     │
│  data/ → agent_memory.json, scheduled_jobs.json  │
│         tool_call_logs.json, store.json          │
│  SeedStore → messages, conversations, KB         │
└──────────────────────────────────────────────────┘
```

## 1. Message Routing

**Status:** Fully implemented.

- `POST /api/projects/:projectId/chat` — non-streaming JSON endpoint
- `POST /api/projects/:projectId/chat/stream` — SSE streaming endpoint
- `GET /api/projects/:projectId/chat` — fetch messages by conversation
- `GET /api/projects/:projectId/conversations` — list conversations
- All endpoints enforce auth, project membership, selected project checks

**Chat flow:**
1. Auth check → membership check → selected project check → permission check
2. Parse time expressions (scheduler shortcut)
3. Auto-create conversation if none provided
4. Store user message
5. Run `agentRuntime.runTurn()` or `runTurnStream()` with provider, messages, KB docs
6. On provider failure: retry 2x with exponential backoff, then mock fallback if allowed
7. Store assistant message
8. Auto-generate conversation title via LLM on first exchange

**Proactive message delivery (for reminders):**
- `SchedulerService.onFired` callback creates assistant message with reminder text + " ✓"
- Message is pushed into project messages and linked to conversation if conversationId is set
- Client polls every 5s for new messages (GET /chat)
- Future: WebSocket push for real-time delivery (P1-10)

## 2. Agent Runtime

**Status:** Implemented with partial feature (missing grace call).

**File:** `apps/api/src/agent/runtime.ts` — `AgentRuntime`

**Current capabilities:**
- Multi-turn loop: up to 20 iterations (configurable via `maxIterations`)
- Provider retry: 2 retries with exponential backoff (1s, 2s, 4s, 8s max)
- Lifecycle events: `loop_started`, `user_message_received`, `memory_recalled`, `skills_applied`, `provider_started`, `thinking`, `tool_started`, `tool_completed`, `assistant_message_completed`, `memory_synced`, `turn_completed`
- System prompt includes KB documents, skill hints, memory, tool list
- Explicit memory commands: "remember X" / "remember: X"
- SSE streaming via `runTurnStream()` async generator

**Remaining work:**
- Add "grace call" — on max iteration exhaustion, one final LLM call without tools to summarize findings (P0-1)
- Add context compression trigger when message count exceeds threshold (P1-4)

**Loop pseudocode:**
```
1. Emit lifecycle events (loop_started, memory_recalled, skills_applied)
2. Handle explicit memory commands ("remember X")
3. Build system message (tools + skills + memory + KB)
4. Enter main loop:
   a. Call LLM provider with messages + tool definitions
   b. If no tool_calls → break (final answer)
   c. Execute each tool via AgentToolRegistry.dispatch()
   d. Feed tool results back as role:"tool" messages
   e. Repeat until maxIterations or no tool_calls
5. Emit turn_completed
6. Sync memory
```

## 3. Tool Dispatch

**Status:** Fully implemented.

**File:** `apps/api/src/agent/tools.ts` — `AgentToolRegistry`

**Current capabilities:**
- `register(tool)` — adds a tool (throws on duplicate)
- `dispatch(name, args, context)` — executes a tool, records log, returns result
- `toOpenAIToolDefinitions()` — converts to OpenAI function-calling format
- `list()` / `schemas()` — query registered tools
- `queryLogs(filter?)` / `logCount()` — query logged tool calls
- `enableLogging(dataDir)` — enable persistent log to `tool_call_logs.json`

**12 registered tools:**

| Name | Category | Description |
|------|----------|-------------|
| `memory_remember` | memory | Save project-scoped memory |
| `memory_search` | memory | Search memories by text |
| `session_summary` | session | Summary of current chat session |
| `session_reset` | session | Clear all memories for project/user |
| `read_file` | file | Read text file from KB with line numbers |
| `search_files` | file | Glob search or grep text in KB files |
| `terminal` | utility | Execute shell commands (timeout, cwd=KB root) |
| `write_file` | file | Create/overwrite a file in KB |
| `patch` | file | Find-and-replace string in a KB file |
| `schedule_reminder` | utility | Schedule a timed reminder |
| `cancel_reminder` | utility | Cancel recent or all reminders |
| `list_reminders` | utility | List all reminders for the project |

**Tool call logging:** Each dispatch records: id, tool, category, args, result, error, startedAt, durationMs, projectId, conversationId, requestId, userId. Persisted to `data/tool_call_logs.json` (max 2000 entries, circular buffer). Exposed via `GET /api/projects/:projectId/tool-logs`.

## 4. Scheduler / Reminder System

**Status:** Fully implemented.

**File:** `apps/api/src/scheduler.ts` — `SchedulerService`

### Design

```
User message: "30秒后提醒我关闭Chiller"
     │
     ▼
server.ts: parseTimeExpression() detects time pattern
     │
     ▼
scheduler.schedule({ message:"关闭Chiller", triggerAt: now+30s, ... })
     │
     ▼
Store in Map + persist to data/scheduled_jobs.json
     │
     ▼
Response: "好的，30秒后提醒你「关闭 Chiller」。"
     │
  ... 30 seconds later ...
     │
     ▼
SchedulerService fires callback:
  1. Create assistant ChatMessage: "关闭 Chiller ✓"
  2. Push into project messages + conversation messageIds
  3. Schedule store save
  4. Client detects via 5s poll on GET /chat
     │
     ▼
User sees "关闭 Chiller ✓" in chat
```

### Time Expression Parsing

Supports these input patterns:
| Input | Parsed |
|-------|--------|
| `N秒后提醒我XXX` | delay_seconds = N |
| `N分钟后提醒我XXX` | delay_seconds = N * 60 |
| `N小时后提醒我XXX` | delay_seconds = N * 3600 |
| `提醒我XXX` | delay_seconds = 10 (default) |
| `取消刚才的提醒` | Cancel most recent job |
| `取消所有提醒` | Cancel all jobs for project |
| `列出提醒` / `查看提醒` | List all active jobs |

### Two entry paths for scheduling:
1. **Direct parse** (server.ts lines 634-678, 844-884): `parseTimeExpression()` runs BEFORE the agent. If a time pattern is detected, the reminder is scheduled directly without agent involvement. Returns immediate response.
2. **Agent tool** (`schedule_reminder` in genericTools.ts lines 411-452): LLM calls the tool during agent loop. For when the user uses natural language that doesn't match the parse patterns (e.g., "remind me in 30 seconds via the tool").

### Storage

```typescript
interface ScheduledJob {
  jobId: string;           // e.g. "job_000001"
  projectId: string;
  conversationId: string;
  userId: string;
  message: string;         // Reminder text
  triggerAt: number;       // Unix timestamp ms
  createdAt: number;
  status: "pending" | "fired" | "cancelled";
}
```

- **Memory:** `Map<string, ScheduledJob>` for active jobs
- **Disk:** `data/scheduled_jobs.json` for persistence
- **On startup:** Load pending jobs, re-schedule timers, fire expired jobs immediately

### Scheduler Lifecycle

- **Start:** `SchedulerService.start()` — load persisted jobs, schedule timers
- **Schedule:** `schedule(params)` — create timer, persist, return jobId
- **Cancel:** `cancel(jobId)` / `cancelMostRecent(projectId)` / `cancelAll(projectId)`
- **List:** `list(projectId)` — all jobs sorted newest first
- **Stop:** `stop()` — clear all timers (graceful shutdown)

## 5. Memory / Session Persistence

**Status:** Fully implemented.

**File:** `apps/api/src/agent/memory.ts` — `AgentMemoryStore`

- Scoped by `projectId:userId` composite key
- Max 50 memories per scope (auto-truncated)
- File persistence to `data/agent_memory.json` on every write
- Loaded on server start via `start()`
- Tools: `memory_remember`, `memory_search`, `session_reset`
- `syncTurn()` called after each agent turn (currently skips mock responses)

## 6. Project-Scoped Isolation

**Status:** Fully implemented.

- All data keyed by `projectId`: messages, conversations, KB, repository, memory, scheduler jobs
- `requireProjectMembership()` enforces user-project membership
- `requireSelectedProject()` ensures session matches requested project
- KB filesystem isolation: `Knowledge Base/{projectId}/` directories
- Memory isolation: scoped by `projectId:userId`
- No cross-project data leakage

## 7. Provider Configuration

**Status:** Fully implemented.

- Reads from `.env` at repo root
- `resolveChatProvider(env)` routes to `openai-compatible` or `mock`
- Env vars: `BUILDING_AGENT_LLM_PROVIDER`, `_API_KEY`, `_BASE_URL`, `_MODEL`, `_ALLOW_FALLBACK`
- Streaming: `completeStream()` returns `AsyncGenerator<ChatCompletionDelta>`
- Retry: 2 retries with exponential backoff (1s, 2s, 4s, 8s max)

## 8. Logging

**Status:** Implemented.

- Tool call logs: `data/tool_call_logs.json` — id, tool, args, result, error, duration, projectId, conversationId, requestId, userId
- Lifecycle events: returned in API response, visible in SSE stream
- Provider diagnostics: redacted metadata in chat responses
- Server: Fastify request IDs (`req_NNNNNN`)

**Remaining (P1-7):** Structured JSON logging with log levels, rotation, request tracing.

## 9. Remaining Implementation Work

### P0 (must complete):
1. **P0-1: Grace call** — `runtime.ts` line 274: when `iterations >= maxIterations` and `!finalText`, make one final LLM call without tools to get a summary instead of hardcoded fallback text.

### P1 (next priority):
1. **P1-9: Recurring Cron Jobs** — Add cron expression support to scheduler
2. **P1-10: WebSocket Push** — Real-time message delivery, eliminate 5s polling
3. **P1-8: Background Process Monitoring** — Process registry for long-running terminal commands
4. **P1-4: Context Compression** — Prune old tool results, summarize middle turns
5. **P1-1: Web Search** — Configurable search backend
6. **P1-6: Skill CRUD** — Runtime skill editing tools

### P2 (nice-to-have):
1. **P2-1: Management UI** — Visual panels for jobs, tools, memory
2. **Subagent, multi-agent, plugins, vision, TTS, browser** — Deferred

## 10. Files

### Existing (implemented):
| File | Purpose |
|------|---------|
| `apps/api/src/agent/runtime.ts` | Agent loop + streaming |
| `apps/api/src/agent/tools.ts` | Tool registry + dispatch + logging |
| `apps/api/src/agent/genericTools.ts` | 12 concrete tools |
| `apps/api/src/agent/memory.ts` | Scoped memory with file persistence |
| `apps/api/src/agent/skills.ts` | Skill registry |
| `apps/api/src/agent/types.ts` | Shared types |
| `apps/api/src/agent/knowledgeBase.ts` | KB indexing + prompt |
| `apps/api/src/scheduler.ts` | Scheduler service + time parsing |
| `apps/api/src/providers.ts` | LLM provider abstraction |
| `apps/api/src/server.ts` | All HTTP routes, scheduler wiring |

### To create/modify:
| File | Change |
|------|--------|
| `apps/api/src/agent/runtime.ts` | Add grace call on max iterations |
| `apps/api/src/agent/genericTools.ts` | Add `execute_code` tool (P1) |

## 11. Testing Strategy

### Existing tests:
- `apps/api/src/chat.test.ts` — Chat API tests
- `apps/api/src/providers.test.ts` — Provider configuration tests
- `apps/api/src/auth.test.ts` — Auth middleware tests

### Manual verification:
1. Send "30秒后提醒我测试成功" → verify bot responds "好的，30秒后提醒你「测试成功」。"
2. Wait 30 seconds → refresh chat → verify "测试成功 ✓" appears
3. Send "取消刚才的提醒" → verify job cancelled
4. Send "列出提醒" → verify list

### Provider config verification:
- Set `BUILDING_AGENT_LLM_API_KEY=test` → real provider used
- Unset API key → mock provider used with tool support
