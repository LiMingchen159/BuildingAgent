# Scheduler, Realtime, and STT

[中文](../../zh-CN/features/scheduler-realtime-stt.md) | [Developer documentation home](../README.md) | [REST, SSE, and WebSocket contracts](../architecture/api-events.md)

> Code baseline: `main@af44ff15`. Status: one-shot reminders, the project WebSocket, Dashboard realtime updates, and the browser recording entry are implemented; recurring jobs, the task operations surface, and STT configuration are partial; DashScope speech recognition and the BMS collector are external capabilities.

## 1. Status and code baseline

This page covers three related but independent runtime paths. They share the Chat workspace but do not share a durable event bus.

| Capability | Status | Baseline fact |
| --- | --- | --- |
| One-shot Chat reminder | **Implemented / 已实现** | A Chinese time expression or the Agent `schedule_reminder` tool creates an in-process timer; the job is written to disk, then firing persists an assistant message and pushes it over the project WebSocket. |
| Interval / cron recurring job | **Partial / 部分实现** | The rule model, persistence, ticker, and `cronjob` management tool exist. The normal `setTimeout` callback calls only `fireJob` and does not create the next instance, so repetition is not reliable. |
| Right-side “Scheduled & rule-based tasks” panel | **Planned / 规划中** | [ScheduledTasks.tsx](../../../../apps/web/src/ui/ScheduledTasks.tsx) renders only `MOCK_TASKS` and a local countdown; it does not read SchedulerService. |
| Project-scoped WebSocket notifications | **Implemented / 已实现** | The token, membership, and `chat:read` upgrade guard, project-bucketed broadcast, and five-second browser reconnect are implemented. |
| Dashboard point realtime refresh | **Implemented + External / 已实现 + 外部能力** | WebSocket subscription is implemented; the API polls the external BMS collector best-effort every 15 seconds and broadcasts only changed values. |
| Chat SSE | **Implemented / 已实现** | Activity, answer, and terminal events are returned within one Chat request; SSE is not a background-job channel. |
| Browser recording and API STT | **Partial + External / 部分实现 + 外部能力** | The Web creates 16 kHz mono PCM WAV and the API calls DashScope Paraformer. There is no local recognition or provider fallback, and configuration does not fully control model selection. |

“Task” is not one generic resource here: Scheduler jobs, Agent tool activity, Dashboard updates, and the Reports `schedule` configuration are different models. There is no unified task REST list, general task-update WebSocket event, or distributed worker today.

## 2. Purpose and boundary

Scheduler converts future reminders from project Chat into assistant messages. Realtime delivers project messages, titles, and Dashboard changes outside the lifetime of one HTTP request. STT converts a Chat composer recording into unsent draft text.

These capabilities do not provide a cross-instance queue, exactly-once delivery, durable WebSocket replay, site BMS write control, or an audio archive. The weekly/monthly `schedule` in Reports is currently a report configuration and validation model, not a registration in [SchedulerService](../../../../apps/api/src/scheduler.ts); see [Dashboards and Reports](dashboards-reports.md).

## 3. User entry and key source entry

| Surface | User entry | Key source |
| --- | --- | --- |
| Reminders and recurring jobs | Enter a supported Chinese time expression in synchronous or streaming Chat, or let the Agent call scheduler tools | [scheduler.ts](../../../../apps/api/src/scheduler.ts), [genericTools.ts](../../../../apps/api/src/agent/genericTools.ts), [server.ts](../../../../apps/api/src/server.ts) |
| Task cards | “Scheduled & rule-based tasks” in the Web right asset panel | [ScheduledTasks.tsx](../../../../apps/web/src/ui/ScheduledTasks.tsx), [App.tsx](../../../../apps/web/src/App.tsx) |
| Chat SSE | `POST /api/projects/:projectId/chat/stream` | [server.ts](../../../../apps/api/src/server.ts), `sendChatMessageStream` in [apps/web/src/api.ts](../../../../apps/web/src/api.ts) |
| Project WebSocket | `/api/projects/:projectId/ws?token=...` | Upgrade/broadcast in [server.ts](../../../../apps/api/src/server.ts), `createProjectSocket` in [apps/web/src/api.ts](../../../../apps/web/src/api.ts) |
| Voice input | “Voice input” in the Chat composer; `POST /api/stt/transcribe` | [App.tsx](../../../../apps/web/src/App.tsx), [server.ts](../../../../apps/api/src/server.ts) |
| Unwired voice helper | Not imported by `App.tsx` today | [voiceInput.ts](../../../../apps/web/src/voiceInput.ts) |

Scheduler has no standalone REST controller. `schedule_reminder`, `cancel_reminder`, `list_reminders`, and `cronjob` are Agent tools. The fast Chinese parser instead runs in both Chat routes before the provider/tool loop.

## 4. Normal data flow

### 4.1 One-shot reminders and recurring jobs

1. Synchronous Chat or SSE Chat performs the normal authentication, membership, selected-project, and `chat:write` checks, then saves the user message.
2. `parseTimeExpression` recognizes “remind after N seconds/minutes/hours” in Chinese and a “remind me” form with a default ten-second delay. A match creates a job with no `recurrence` and bypasses the LLM.
3. If no one-shot form matches, `parseRecurringExpression` recognizes Chinese “every N seconds/minutes/hours” and “daily at H,” creating an `interval` or five-field `cron` recurrence. Agent tools can also create, list, pause, resume, remove, or trigger jobs.
4. `SchedulerService.schedule` allocates an id such as `job_000001`, stores a `pending` job, registers `setTimeout`, and synchronously rewrites `scheduled_jobs.json` on a best-effort basis.
5. When the job fires, the server callback appends an assistant message containing `<message> ✓`. It adds the message id if the original conversation still exists, requests SeedStore persistence, and broadcasts `reminder_fired`.
6. WebSocket can append the message to browser state immediately. The Chat page also polls the current conversation every five seconds to recover persisted messages missed by push.

One-shot and recurring confirmation responses look similar but have different runtime semantics. A one-shot job is expected to fire once. A recurring job needs `advanceRecurringJob` to create the next `_rN` instance. The ordinary timer callback currently calls `fireJob` directly, changing the job to `fired` without advancing it; only the one-minute ticker can advance a due `pending` job if it observes it before the timer callback. Recurring execution is therefore **Partial** and must not be promised as continuous.

### 4.2 SSE and WebSocket boundary

- SSE belongs only to the Chat POST that opened it: after headers are sent, it frames title, activity, answer, error, and `done` for that turn, then closes.
- WebSocket belongs to the project id in its URL. It first emits `connected`; the browser then sends `dashboard_subscribe` with point names. It carries `reminder_fired`, `conversation_title_updated`, Dashboard CRUD, and `dashboard_point_update`.
- The server emits no general `task_created`, `task_progress`, or `task_completed` event and no project-metadata update event. The static task panel does not change with Scheduler jobs.
- Dashboard subscriptions aggregate point names across sockets in the project. The process reads the collector every 15 seconds and broadcasts only when serialized latest value or poll time changes.

### 4.3 Speech transcription

1. A user with `chat:write` starts recording in the Chat composer. The browser requests microphone permission, collects PCM through Web Audio, and renders a waveform through an analyser.
2. On confirmation, the Web converts float samples to 16-bit mono 16 kHz WAV and POSTs it to `/api/stt/transcribe` with a bearer token and `audio/wav`. The result is inserted only into the composer draft; it is not sent automatically.
3. Fastify validates the session, an `audio/*` content type, and a nonempty Buffer. The global body limit is 10 MiB.
4. The server finds the `data` chunk in RIFF/WAV, sends PCM over a TLS WebSocket to DashScope Paraformer, and waits for `task-finished`; the current timeout is 30 seconds.
5. Success returns `{text,requestId}`. Missing configuration, invalid format, empty audio, external authentication failure, and general recognition failure are mapped to structured HTTP errors.

## 5. Data, state, and persistence

| Data/state | Location | Lifecycle and authority |
| --- | --- | --- |
| Scheduler jobs | `<dataRoot>/scheduled_jobs.json` | Scheduler's on-disk record; `BUILDING_AGENT_DATA_DIR`/`DATA_DIR` changes the data root. Each change synchronously rewrites the full JSON array best-effort. |
| Job timers and recurring ticker | In-process API `Map` / Node timers | Lost on restart, then rebuilt from JSON; not cross-instance coordination state. |
| Fired Chat message | API SeedStore `messagesByProject` and conversation message ids | Normally reaches `apps/data/store.json` in product runtime; disk persistence depends on the server `persist` option. |
| WebSocket connection/subscription/poller/last values | In-process Fastify `Map` | Not restored after disconnect or restart; the browser reconnects and subscribes again. |
| Browser recording, waveform, and draft | React refs/state | Lost on cancel, completion, or refresh; the audio itself is not written to BuildingAgent file storage. |
| STT transcript | Composer draft after the external provider response | Browser-only until Send is clicked, after which it becomes an ordinary Chat message. |

API startup calls `scheduler.start()`. It skips `cancelled`/`fired` jobs, rebuilds timers for future `pending` jobs, immediately fires overdue pending jobs, and leaves paused jobs paused. JSON read or parse errors are swallowed and appear as no recovered jobs; there is no migration, validation, or bad-record quarantine. `buildServer` currently registers no Fastify close hook that calls `scheduler.stop()`.

## 6. Permissions and project isolation

- The fast Chat scheduling path requires bearer authentication, project membership, the current selected project, and `chat:write`. Agent tool context also carries `projectId`, `conversationId`, and `userId`.
- `schedule_reminder`, `list_reminders`, `cancelMostRecent`, and `cancelAll` use the current project id. `cronjob get` also searches the current project's list.
- **Known isolation gap:** `cronjob pause`, `resume`, `remove`, and `update` pass a global job id directly to SchedulerService without first verifying that the job belongs to the current project. The tool layer is not complete job-ownership enforcement.
- WebSocket upgrade resolves the user from a query token and requires membership plus `chat:read` on the URL project. It does **not** call the selected-project guard. This differs from REST/SSE, although broadcast remains bucketed by URL project id.
- `dashboard_subscribe` cannot supply another project id, but collector requests carry no user identity. Project-channel isolation alone does not prove that the underlying shared point catalog is tenant-isolated.
- `/api/stt/transcribe` requires only a valid session. It has no project id and does not check `chat:write`. The Web button is disabled by the current project's `chat:write`, but the API has no equivalent project guard.
- The WebSocket token is in the URL query and can enter browser, proxy, or infrastructure logs. Real deployments must use TLS and control URL logging.

## 7. Errors, degradation, and external dependencies

- Scheduler JSON I/O is best-effort: corrupt input suppresses recovery, and a write failure is not returned to the Chat request. The firing callback has no retry or dead-letter path; when WebSocket is offline, only persisted Chat polling remains.
- The recurring advance gap, server-local cron timezone, long `setTimeout` behavior, and process downtime make this unsuitable for critical alerts or SLA jobs. There is no leader election, lease, idempotency key, or multi-instance fan-out.
- Malformed/unknown WebSocket messages are silently ignored, and individual Dashboard collector failures are skipped best-effort. The client reconnects on a fixed five-second delay with no replay cursor, exponential backoff, or jitter.
- Once SSE headers exist, failure can only be an event. The recurring fast path manually `JSON.stringify`s the `done` object and then passes it to the common writer, which stringifies it again; the Web parser casts that string as a response, unlike the normal `done` contract.
- The STT **External** capability is `wss://dashscope.aliyuncs.com`. Missing `DASHSCOPE_API_KEY` returns `503 stt_unavailable`; a 401-like provider error maps to `503 stt_auth_failed`; timeout, network close, or recognition errors map to general `stt_failed`.
- STT has no deterministic mock, local model, browser SpeechRecognition, or second-provider fallback. A denied microphone, missing MediaRecorder/Web Audio, or an unmet secure-context requirement produces only a local browser error.
- The route accepts any `audio/*`, but the transcriber actually extracts PCM only from RIFF/WAV. Non-WAV input can therefore pass the content-type check and still fail. `ALIYUN_STT_MODEL` is read and passed to the helper, but the helper ignores it and hard-codes `paraformer-realtime-v2`.

## 8. Extension method

Fix and cover recurring advancement before extending scheduling, then define one logical job id plus execution history instead of using each run's new id as implicit history. A new management API/tool must verify project ownership and define timezone, misfire, retry, idempotency, shutdown recovery, and multi-instance semantics. If a queue is introduced, keep durable scheduling separate from transient WebSocket delivery.

A new WebSocket event needs a runtime validator, project/permission guard, ordering, duplicate, resubscription, and replay semantics. Do not add only a Web client parser branch. A general task panel needs a real project-scoped task read model before replacing `MOCK_TASKS`; Report schedules, Scheduler reminders, and background processes should not be merged implicitly through one UI union.

An STT extension should make the provider an explicit adapter, validate the actual audio format rather than only content type, and define controlled model selection, timeout/cancellation, sensitive-transcript logging, and an offline-test fake. A fallback must disclose the actual provider and fallback diagnostics; it must not silently alter language, privacy, or quality boundaries.

## 9. Corresponding tests

- Chat REST/SSE, terminal events, and title updates: [apps/api/src/chat.test.ts](../../../../apps/api/src/chat.test.ts)
- Web SSE parser completion/incompletion behavior: [apps/web/src/api.test.ts](../../../../apps/web/src/api.test.ts)
- Dashboard WebSocket subscription and live-value UI update, plus static task-panel rendering: [apps/web/src/App.test.tsx](../../../../apps/web/src/App.test.tsx)
- Dashboard REST permissions and CRUD: [apps/api/src/dashboards.test.ts](../../../../apps/api/src/dashboards.test.ts)

The baseline has no `scheduler.test.ts`, STT route/provider test, or WebSocket-upgrade integration test, and the existing Chat tests do not cover the one-shot/recurring fast paths. `App.test.tsx` uses a browser `MockWebSocket`; it proves consumer behavior, not Fastify upgrade, reconnect, or collector polling. Extensions should add fake timers, a temporary data root, a fake provider, and a real socket-handshake test.

Run source tests under an isolated data root:

```bash
npm --workspace @building-agent/api exec -- vitest run --dir src
npm --workspace @building-agent/web exec -- vitest run --dir src
```

## 10. Known limitations and related documentation

- The recurring timer/ticker implementation does not guarantee creation of the next run; startup recovery also calls only `fireJob` for an overdue recurring job.
- `cronjob update` cancels the old job and creates a default 60-second one-shot with a new id. `trigger` creates a separate one-shot whose content is `[Triggered] job <id>` rather than running the original message.
- Although `parseCancelCommand` and `parseListCommand` are imported from `scheduler.ts` into `server.ts`, the fast Chat paths do not call them; cancellation/listing normally depends on Agent tools.
- The `reminder_fired` payload omits `conversationId`. The Web consumer has a conversation-count update branch but cannot enter it for the current event; it also first appends the message to the current messages state, then relies on conversation polling for correction.
- The right task list is a fixed demo. Refresh, project switching, and WebSocket events do not make it reflect real jobs, and Report schedules are not connected to SchedulerService.
- WebSocket fan-out is confined to one API instance; there is no broker, durable replay, backpressure, or generic task-status event.
- Recurring Chat SSE double-encodes `done`; normal Chat and one-shot reminder `done` payloads are objects.
- STT is fixed to the DashScope realtime model, reliably accepts only the WAV produced by the Web, has no fallback, and its provider variables are not yet listed in `.env.example`.
- Continue with [Chat and Agent Runtime](chat-agent-runtime.md), [Dashboards and Reports](dashboards-reports.md), [BMS integration](bms-integration.md), [Runtime and storage topology](../architecture/runtime-storage.md), and [Troubleshooting and known contract gaps](../development/troubleshooting.md).
