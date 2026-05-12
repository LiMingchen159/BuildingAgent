# Hermes → BuildingAgent Migration Plan

## Architecture Overview

BuildingAgent is a web-first platform with a Fastify API backend and a React frontend. Hermes capabilities are integrated into the agent runtime, tool system, and scheduler layers.

```
┌─────────────────────────────────────────────────┐
│                  Web Frontend                     │
│  App.tsx → SSE streaming → ChatWorkspace         │
│  Tool indicators, job status, memory UI          │
└──────────────────┬──────────────────────────────┘
                   │ SSE / REST
┌──────────────────▼──────────────────────────────┐
│              API Server (Fastify)                 │
│  /api/projects/:id/chat          (REST)          │
│  /api/projects/:id/chat/stream   (SSE)           │
│  /api/projects/:id/conversations                 │
│  /api/health                                      │
└──────┬──────────────────────┬───────────────────┘
       │                      │
┌──────▼──────────┐  ┌────────▼───────────────────┐
│  Agent Runtime   │  │    Scheduler Service        │
│  runtime.ts      │  │    scheduler.ts (NEW)       │
│  Multi-turn loop │  │    - Parse time expressions │
│  Tool dispatch   │  │    - Job store (Map + file) │
│  Lifecycle events│  │    - Fire callbacks         │
│  Context compr.  │  │    - Push to conversation   │
└──────┬──────────┘  └────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────┐
│              Tool Registry                        │
│  tools.ts → AgentToolRegistry                    │
│  genericTools.ts → 9 tools + new tools           │
│  ┌──────────┬──────────┬──────────┬──────────┐  │
│  │ Terminal │  File    │ Scheduler│  Memory  │  │
│  │ commands │  R/W/S/P │ reminders│  persist │  │
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
│  apps/data/{projectId}/ → memory.json, jobs.json │
│  SeedStore → messages, conversations, KB         │
└──────────────────────────────────────────────────┘
```

## 1. Message Routing

**Current state:** Working.
- `POST /api/projects/:projectId/chat` — non-streaming JSON endpoint
- `POST /api/projects/:projectId/chat/stream` — SSE streaming endpoint
- Both authenticate, validate project membership, store messages, run agent, return results

**No changes needed for routing itself.** The scheduler will use the same message store to inject proactive messages.

## 2. Agent Runtime

**Current state:** Working with partial features.
- `runtime.ts` `AgentRuntime.runTurnStream()` — async generator
- Multi-turn loop: up to 20 iterations
- Provider retry: 2 retries with exponential backoff
- Lifecycle events: `loop_started`, `provider_started`, `tool_started`, `tool_completed`, `turn_completed`, `memory_synced`
- System prompt includes KB documents, skill hints, memory, tool list

**Changes needed:**
- Increase `maxIterations` contextually (more iterations for complex tasks)
- Add "grace call" — on budget exhaustion, one final call without tools to summarize
- Add context compression trigger (P1-4)
- Add structured tool call logging (P0-14)

## 3. Tool Dispatch

**Current state:** Working.
- `AgentToolRegistry` in `tools.ts`
- Tools self-register with `register(tool: AgentTool)`
- `dispatch(name, args, context)` → `{ result }`
- `toOpenAIToolDefinitions()` → OpenAI function-calling format
- 9 tools currently: memory_remember, memory_search, session_summary, session_reset, read_file, search_files, terminal, write_file, patch

**Changes needed:**
- Add `schedule_reminder` tool (P0-10)
- Add `cancel_reminder` tool (P0-11)
- Add `list_reminders` tool (P0-11)
- Add `execute_code` tool (P0-9)
- Add `web_search` tool (P1-1)

## 4. Scheduler / Reminder System

**This is the biggest missing P0 capability.**

### Design

```
User message: "30秒后提醒我关闭Chiller"
     │
     ▼
Agent Runtime (tool call)
     │
     ▼
schedule_reminder({ message: "关闭Chiller", delay_seconds: 30 })
     │
     ▼
SchedulerService.schedule({ message, triggerAt, projectId, conversationId })
     │
     ▼
Store in jobs Map + persist to apps/data/{projectId}/jobs.json
     │
     ▼
Agent responds: "好的，30秒后提醒你「关闭 Chiller」。"
     │
  ... 30 seconds later ...
     │
     ▼
SchedulerService fires callback:
  1. Create assistant ChatMessage with content "关闭 Chiller ✓"
  2. Push into conversation messageIds
  3. Save store
  4. (Future: push via WebSocket to connected clients)
     │
     ▼
User refreshes or receives SSE update → sees "关闭 Chiller ✓"
```

### Time Expression Parsing

Support these input patterns:
| Input | Parsed |
|-------|--------|
| `N秒后提醒我XXX` | delay_seconds = N |
| `N分钟后提醒我XXX` | delay_seconds = N * 60 |
| `N小时后提醒我XXX` | delay_seconds = N * 3600 |
| `明天上午H点提醒我XXX` | Calculate absolute time |
| `H:mm提醒我XXX` | Calculate today at H:mm |
| `取消刚才的提醒` | Cancel most recent job |
| `取消所有提醒` | Cancel all jobs for this project |
| `列出提醒` | List all active jobs |

### Storage

```typescript
interface ScheduledJob {
  jobId: string;
  projectId: string;
  conversationId: string;
  userId: string;
  message: string;          // The reminder text
  triggerAt: number;        // Unix timestamp ms
  createdAt: number;
  status: "pending" | "fired" | "cancelled";
}
```

Store in:
- **Memory:** `Map<string, ScheduledJob>` for active jobs
- **Disk:** `apps/data/{projectId}/jobs.json` for persistence across restarts
- **On startup:** Load pending jobs from disk, schedule timers

### Proactive Message Delivery

When a job fires:
1. Look up the conversation's messages
2. Create an assistant message with the reminder text + " ✓"
3. Append to the conversation
4. Save the store
5. Mark job as `fired`
6. The next time the user loads that conversation, they see the reminder

### Scheduler Lifecycle

- **Start:** `SchedulerService.start()` — load persisted jobs, schedule timers
- **Schedule:** `schedule(job)` — create timer, persist, return jobId
- **Cancel:** `cancel(jobId)` — clear timer, update status
- **List:** `list(projectId)` — return active jobs
- **Stop:** `stop()` — clear all timers (graceful shutdown)

## 5. Memory / Session Persistence

**Current state:** In-memory `AgentMemoryStore`. Lost on restart.

**Changes needed:**
- Back memory with files: `apps/data/{projectId}/memory.json`
- `AgentMemoryStore.remember()` → write to file
- `AgentMemoryStore.search()` → search in memory (current Map is fine, load from file on init)
- `AgentMemoryStore.list()` → return all entries
- Load memory from file on first access per project

## 6. Project-Scoped Isolation

**Current state:** Working.
- Messages, conversations, KB, repository, management all keyed by `projectId`
- `SeedStore` is the in-memory data store

**Verification:**
- Create messages in project A
- Switch to project B
- Verify project B does not see project A's messages
- Verify tools operate within the correct project's KB root

## 7. Provider Configuration

**Current state:** Working.
- Reads from `.env` at repo root (verified by recent commit `3f72cc2`)
- `resolveChatProvider()` reads env vars
- Falls back to mock provider when no API key

**Verification:**
- Set `BUILDING_AGENT_LLM_API_KEY=test` → should use real provider
- Unset all LLM env vars → should use mock provider

## 8. Logging

**Current state:** Minimal.
- Fastify default logging
- No structured tool call logs
- No job execution logs

**Changes needed:**
- Log tool calls with: name, args, result preview, duration, error (if any)
- Log scheduler jobs: created, fired, cancelled, failed
- Include `requestId` in all log entries for tracing

## 9. Files to Create / Modify

### New files:
| File | Purpose |
|------|---------|
| `apps/api/src/scheduler.ts` | Scheduler service — parse time, manage jobs, fire callbacks |
| `apps/api/src/agent/compressor.ts` | (P1) Context compression |
| `docs/hermes-migration/HERMES_CAPABILITY_MATRIX.md` | ✅ Created |
| `docs/hermes-migration/MIGRATION_PLAN.md` | ✅ This file |

### Modified files:
| File | Changes |
|------|---------|
| `apps/api/src/server.ts` | Wire scheduler service (init, schedule, cancel). Add scheduler status to /health. |
| `apps/api/src/agent/genericTools.ts` | Add `schedule_reminder`, `cancel_reminder`, `list_reminders`, `execute_code` tools |
| `apps/api/src/agent/memory.ts` | Add file-backed persistence (read/write memory.json) |
| `apps/api/src/agent/runtime.ts` | Add grace call, structured tool logging, context compression trigger |
| `apps/api/src/agent/types.ts` | Add scheduler-related types |
| `apps/api/src/providers.ts` | ✅ Enhanced mock provider with tool support |
| `apps/web/src/App.tsx` | Show reminders in chat, tool call status improvements |

## 10. Implementation Order

1. ✅ Audit complete — matrix created
2. ✅ Migration plan created
3. **Create scheduler service** (`scheduler.ts`)
4. **Add scheduler tools** to `genericTools.ts`
5. **Wire scheduler into server.ts**
6. **Add file-backed memory** to `memory.ts`
7. **Enhance agent runtime** (grace call, logging)
8. **Verify end-to-end** — reminder flow, tool calls
9. **Commit** after each slice

## 11. Testing Strategy

### Unit tests (`apps/api/src/chat.test.ts`):
- Scheduler: parse time expressions, create job, cancel job, list jobs
- Tool dispatch: register → dispatch → verify result
- Memory: write → search → verify persistence

### Manual verification:
- Send "30秒后提醒我测试成功" → verify bot responds with job_id
- Wait 30 seconds → refresh → verify message appears
- Send "取消刚才的提醒" → verify job cancelled
- Send "列出提醒" → verify list

### Provider config verification:
- `BUILDING_AGENT_LLM_API_KEY=test` → real provider used
- No API key → mock provider used (with tool support)

_Last updated: 2026-05-12_
