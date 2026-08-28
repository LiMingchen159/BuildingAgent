# Scheduler、Realtime 与 STT

[English](../../en/features/scheduler-realtime-stt.md) | [开发者文档首页](../README.md) | [REST、SSE 与 WebSocket 契约](../architecture/api-events.md)

> 代码基线：`main@af44ff15`。状态：一次性提醒、项目 WebSocket、Dashboard 实时更新和浏览器录音入口已实现；重复任务、任务运营界面及 STT 配置闭环为部分实现；DashScope 语音识别和 BMS collector 是外部能力。

## 1. 状态与代码基线

本页同时覆盖三条相关但独立的运行路径。它们共享 Chat 工作区，却没有共同的 durable event bus。

| 能力 | 状态 | 基线事实 |
| --- | --- | --- |
| 一次性 Chat 提醒 | **已实现 / Implemented** | 中文时间表达式或 Agent `schedule_reminder` 工具创建进程内 timer；job 落盘，触发后写入 assistant message，并经项目 WebSocket 推送。 |
| interval / cron 重复任务 | **部分实现 / Partial** | 规则模型、持久化、ticker 与 `cronjob` 管理工具存在；普通 `setTimeout` 回调只调用 `fireJob`，不会创建下一次实例，重复执行不能视为可靠。 |
| 右侧 “Scheduled & rule-based tasks” 面板 | **规划中 / Planned** | [ScheduledTasks.tsx](../../../../apps/web/src/ui/ScheduledTasks.tsx) 只渲染 `MOCK_TASKS` 和本地倒计时，没有读取 SchedulerService。 |
| 项目范围 WebSocket 通知 | **已实现 / Implemented** | token、membership 与 `chat:read` upgrade guard、项目分桶广播、浏览器五秒重连均有实现。 |
| Dashboard 点位实时刷新 | **已实现 + 外部能力 / Implemented + External** | WebSocket 订阅已实现；API 每 15 秒 best-effort 轮询外部 BMS collector，只广播变化值。 |
| Chat SSE | **已实现 / Implemented** | 单次 Chat 请求内返回 activity、answer 和 terminal event；它不是后台任务通道。 |
| 浏览器录音与 API STT | **部分实现 + 外部能力 / Partial + External** | Web 生成 16 kHz mono PCM WAV，API 调用 DashScope Paraformer；无本地识别或 provider fallback，配置变量与实际模型选择也未闭环。 |

这里的 “task” 不能笼统理解为一种资源：Scheduler job、Agent tool activity、Dashboard update 和 Reports 的 `schedule` 配置是不同模型。当前没有统一的任务 REST 列表、通用 task-update WebSocket 事件或分布式 worker。

## 2. 功能目的及边界

Scheduler 负责把项目 Chat 中的未来提醒转换为 assistant message；Realtime 负责在一次 HTTP 请求之外把项目消息、标题和 Dashboard 变化通知给浏览器；STT 负责把 Chat composer 录制的语音转换为尚未发送的文字草稿。

这些能力不提供跨实例队列、exactly-once 交付、WebSocket durable replay、现场 BMS 写控制或语音存档。Reports 中的 weekly/monthly `schedule` 当前是报告配置与校验模型，不等于已注册到 [SchedulerService](../../../../apps/api/src/scheduler.ts)；详见 [Dashboards 与 Reports](dashboards-reports.md)。

## 3. 用户入口和关键源码入口

| Surface | 用户入口 | 关键源码 |
| --- | --- | --- |
| 提醒与重复任务 | 在同步或流式 Chat 中输入受支持的中文时间表达式，或由 Agent 调用 scheduler tools | [scheduler.ts](../../../../apps/api/src/scheduler.ts)、[genericTools.ts](../../../../apps/api/src/agent/genericTools.ts)、[server.ts](../../../../apps/api/src/server.ts) |
| 任务卡片 | Web 右侧资产面板的 “Scheduled & rule-based tasks” | [ScheduledTasks.tsx](../../../../apps/web/src/ui/ScheduledTasks.tsx)、[App.tsx](../../../../apps/web/src/App.tsx) |
| Chat SSE | `POST /api/projects/:projectId/chat/stream` | [server.ts](../../../../apps/api/src/server.ts)、`sendChatMessageStream` in [apps/web/src/api.ts](../../../../apps/web/src/api.ts) |
| 项目 WebSocket | `/api/projects/:projectId/ws?token=...` | upgrade/broadcast in [server.ts](../../../../apps/api/src/server.ts)、`createProjectSocket` in [apps/web/src/api.ts](../../../../apps/web/src/api.ts) |
| 语音输入 | Chat composer 的 “Voice input” 按钮；`POST /api/stt/transcribe` | [App.tsx](../../../../apps/web/src/App.tsx)、[server.ts](../../../../apps/api/src/server.ts) |
| 未接入的语音 helper | 当前没有被 `App.tsx` import | [voiceInput.ts](../../../../apps/web/src/voiceInput.ts) |

Scheduler 没有独立 REST controller。`schedule_reminder`、`cancel_reminder`、`list_reminders` 和 `cronjob` 是 Agent tools；快速中文解析则在进入 provider/tool loop 前由两个 Chat 路由直接处理。

## 4. 正常数据流

### 4.1 一次性提醒与重复任务

1. 同步 Chat 或 SSE Chat 先执行常规的 authentication、membership、selected-project 和 `chat:write` 检查，并保存用户消息。
2. `parseTimeExpression` 识别“N 秒/分钟/小时后提醒……”以及无时间时默认十秒的“提醒我……”；命中后直接创建无 `recurrence` 的 job，不调用 LLM。
3. 若未命中一次性表达式，`parseRecurringExpression` 再识别“每 N 秒/分钟/小时……”和“每天 H 点……”，创建 `interval` 或五字段 `cron` recurrence。Agent 也可通过 tools 创建、列出、暂停、恢复、删除或触发 job。
4. `SchedulerService.schedule` 分配 `job_000001` 形式的 id，保存 `pending` job，注册 `setTimeout`，并同步 best-effort 写入 `scheduled_jobs.json`。
5. job 触发后，server callback 追加内容为 `<message> ✓` 的 assistant message；若原 conversation 仍存在则追加 message id；随后请求 SeedStore 持久化并广播 `reminder_fired`。
6. WebSocket 可即时把消息加入当前浏览器状态；Chat 页同时每五秒轮询当前 conversation，用于补到已持久化但推送未收到的消息。

一次性和 recurring 的确认响应外形相似，但运行语义不同。一次性 job 预期只 fire 一次；recurring job 需要 `advanceRecurringJob` 创建带 `_rN` 后缀的下一实例。当前普通 timer callback 直接调用 `fireJob`，使 job 变成 `fired` 而未 advance；只有一分钟 ticker 在 timer 之前观察到已到期 `pending` job 时才会 advance。因此重复任务必须标为 **部分实现**，不能承诺持续运行。

### 4.2 SSE 与 WebSocket 的边界

- SSE 只属于发起它的 Chat POST：headers 建立后按帧发送当前 turn 的标题、activity、answer、error 和 `done`，流结束即关闭。
- WebSocket 属于 URL 中的 project id：连接后先收到 `connected`，浏览器再发送 `dashboard_subscribe` 和 point names。它承载 `reminder_fired`、`conversation_title_updated`、Dashboard CRUD 以及 `dashboard_point_update`。
- 服务端没有发射通用 `task_created`、`task_progress` 或 `task_completed`，也没有 project metadata update 事件。右侧静态任务卡不会随 Scheduler job 更新。
- Dashboard subscription 聚合该项目所有 socket 的 point names；进程每 15 秒读取 collector，只在序列化后的 latest value 或 poll time 发生变化时广播。

### 4.3 语音转写

1. 有 `chat:write` 的用户在 Chat composer 启动录音；浏览器请求 microphone permission，并用 Web Audio 收集 PCM，同时用 analyser 显示波形。
2. 用户确认后，Web 把 float samples 转为 16-bit、mono、16 kHz WAV，并以 bearer token 和 `audio/wav` POST 到 `/api/stt/transcribe`；结果只写回 composer draft，不自动发送 Chat。
3. Fastify 校验 session、`audio/*` content type 和非空 Buffer；全局 body limit 为 10 MiB。
4. server 从 RIFF/WAV 中查找 `data` chunk，通过 TLS WebSocket 把 PCM 发给 DashScope Paraformer，并等待 `task-finished`；当前超时为 30 秒。
5. 成功返回 `{text,requestId}`。没有配置、格式错误、空音频、外部鉴权失败或一般识别失败分别映射为规范 HTTP error。

## 5. 数据、状态及持久化

| 数据/状态 | 位置 | 生命周期与权威性 |
| --- | --- | --- |
| Scheduler jobs | `<dataRoot>/scheduled_jobs.json` | Scheduler 的落盘记录；`BUILDING_AGENT_DATA_DIR`/`DATA_DIR` 可改变 data root。每次改变同步、best-effort 重写整个 JSON 数组。 |
| job timers、recurring ticker | API 进程内 `Map` / Node timer | 重启即丢失，随后从 JSON 重建；不是多实例协调状态。 |
| 触发后的 Chat message | API SeedStore 的 `messagesByProject` 与 conversation message ids | 产品运行时通常进入 `apps/data/store.json`；是否落盘取决于 server 的 `persist` 配置。 |
| WebSocket connection/subscription/poller/last values | Fastify 进程内 `Map` | 断线或重启后不恢复；浏览器重连并重新订阅。 |
| 浏览器录音、波形与草稿 | React refs/state | 取消、完成或刷新后丢失；音频本身没有写入 BuildingAgent 文件存储。 |
| STT transcript | 外部 provider 响应后进入 composer draft | 未点击发送前只在浏览器 state；发送后才成为普通 Chat message。 |

API 启动调用 `scheduler.start()`：它跳过 `cancelled`/`fired`，为未来的 `pending` job 重建 timer，立即 fire 已过期的 pending job，并保留 paused job。JSON 读取或解析错误被吞掉，表现为没有恢复 job；没有迁移、校验和隔离坏记录的机制。当前 `buildServer` 也没有注册调用 `scheduler.stop()` 的 Fastify close hook。

## 6. 权限与项目隔离

- Chat 快速调度路径要求 bearer、project membership、当前 selected project 和 `chat:write`。Agent tool context 也带 `projectId`、`conversationId` 与 `userId`。
- `schedule_reminder`、`list_reminders`、`cancelMostRecent` 和 `cancelAll` 使用当前 project id。`cronjob get` 也在当前项目列表内查找。
- **已知隔离差距：** `cronjob pause`、`resume`、`remove` 和 `update` 把全局 job id 直接交给 SchedulerService，没有先验证 job 属于当前项目；不能把 tool 层描述为完整的 job ownership enforcement。
- WebSocket upgrade 从 query token 解析用户，并要求 URL 项目的 membership 与 `chat:read`。它**不**调用 selected-project guard；这与 REST/SSE 的 selected-project 约束不同，但广播仍按 URL project id 分桶。
- `dashboard_subscribe` 不能另传 project id，但 collector 查询没有用户身份；项目 channel 隔离不能自动证明底层共享点位目录是 tenant-isolated。
- `/api/stt/transcribe` 只要求有效 session，不带 project id，也不检查 `chat:write`。Web 按钮在 UI 层以当前项目 `chat:write` 禁用，但 API 层没有同等 project guard。
- WebSocket token 位于 URL query，可能进入浏览器、代理或基础设施日志；真实部署必须使用 TLS 并控制 URL 日志。

## 7. 错误、降级及外部依赖

- Scheduler JSON 读写是 best-effort：读损坏时忽略恢复，写失败也不会传回 Chat 请求。触发 callback 不做重试或 dead-letter；WebSocket 离线时只剩持久化后的 Chat 轮询路径。
- recurring timer 的 advance 差距、server-local cron 时区、长 `setTimeout` 和进程停机窗口都使它不适合作为关键告警或 SLA 任务。没有 leader election、lease、幂等键或多实例 fan-out。
- WebSocket 非法 JSON/未知消息会被静默忽略；Dashboard collector 单点失败也被 best-effort 跳过。client 固定五秒重连，没有 replay cursor、指数退避或 jitter。
- SSE 建立后只能用 event 报错。recurring 快速分支先手动 `JSON.stringify` `done` 对象，再交给通用 writer 二次 stringify；Web parser 会把它当字符串 cast 为响应，和正常 `done` 契约不一致。
- STT 的 **外部能力** 是 `wss://dashscope.aliyuncs.com`。缺少 `DASHSCOPE_API_KEY` 返回 `503 stt_unavailable`；401-like provider error 映射 `503 stt_auth_failed`；30 秒超时、网络关闭或识别错误返回一般 `stt_failed`。
- STT 没有 deterministic mock、本地模型、浏览器 SpeechRecognition 或第二 provider fallback。浏览器拒绝 microphone、缺少 MediaRecorder/Web Audio 或不满足 secure-context 要求时，只显示本地错误。
- 路由接受任意 `audio/*`，但实际 transcriber 只从 RIFF/WAV 提取 PCM；非 WAV 音频即使 content type 合法也会失败。`ALIYUN_STT_MODEL` 被读取后传入 helper，但 helper 当前忽略该参数并固定使用 `paraformer-realtime-v2`。

## 8. 扩展方法

调度扩展应先修复并覆盖 recurring advance，再定义 job 的单一逻辑 id 与 execution history，而不是用每次运行的新 id 代替状态历史。新增管理 API/工具必须验证 project ownership，明确时区、misfire、重试、幂等、停机恢复与多实例语义；若接入队列，应把 durable schedule 与 transient WebSocket delivery 分开。

新增 WebSocket event 时同时定义 runtime validator、project/permission guard、顺序、重复、重连订阅和 replay 行为。不要只在 Web client 添加解析分支。需要通用任务面板时，应先建立真实的 project-scoped task read model，再替换 `MOCK_TASKS`；Report schedule、Scheduler reminder 和后台 process 不应靠一个 UI union 隐式合并。

STT 扩展应把 provider 抽成显式 adapter，验证真实音频格式而不只看 content type，并提供受控的 model selection、超时/取消、敏感 transcript 日志策略和可离线测试 fake。新增 fallback 必须在响应中暴露实际 provider/fallback diagnostics，不能静默改变语言、隐私或质量边界。

## 9. 对应测试

- Chat REST/SSE、事件终止与标题更新：[apps/api/src/chat.test.ts](../../../../apps/api/src/chat.test.ts)
- Web SSE parser 的完成/未完成行为：[apps/web/src/api.test.ts](../../../../apps/web/src/api.test.ts)
- Dashboard WebSocket 订阅与 live value 页面更新、静态任务面板呈现：[apps/web/src/App.test.tsx](../../../../apps/web/src/App.test.tsx)
- Dashboard REST 权限与 CRUD：[apps/api/src/dashboards.test.ts](../../../../apps/api/src/dashboards.test.ts)

基线没有 `scheduler.test.ts`、STT route/provider 测试或 WebSocket upgrade 集成测试；现有 Chat 测试也没有覆盖一次性/recurring 快速分支。`App.test.tsx` 使用浏览器 `MockWebSocket`，证明 consumer 行为，不证明 Fastify upgrade、重连或 collector 轮询。新增这些能力时应补 fake timers、临时 data root、fake provider 和真实 socket 握手测试。

推荐在隔离 data root 下执行源码测试：

```bash
npm --workspace @building-agent/api exec -- vitest run --dir src
npm --workspace @building-agent/web exec -- vitest run
```

## 10. 已知限制及关联文档

- 重复任务的 timer/ticker 实现不保证创建下一次运行；过期 recurring job 在重启恢复时也只调用 `fireJob`。
- `cronjob update` 当前取消旧 job 后创建一个默认 60 秒的一次性 job，并返回新的 id；`trigger` 创建内容为 `[Triggered] job <id>` 的独立一次性 job，而不是执行原 job 内容。
- `parseCancelCommand` 与 `parseListCommand` 虽从 `scheduler.ts` 导入到 `server.ts`，但快速 Chat 路径未调用；取消/列出通常依赖 Agent tools。
- `reminder_fired` payload 没有 `conversationId`。Web consumer 虽有更新 conversation count 的分支，却无法从当前事件命中；它也会先把消息追加到当前 messages state，之后才由 conversation 轮询校正。
- 右侧任务列表是固定 demo，刷新、切换项目或收到 WebSocket 时都不会反映真实 jobs；Report schedule 也没有接到 SchedulerService。
- WebSocket 只在单个 API 实例内 fan-out；没有 broker、durable replay、背压或通用 task status event。
- recurring Chat SSE 的 `done` 是二次 JSON 编码；普通 Chat 和一次性提醒的 `done` 是对象。
- STT 固定 DashScope realtime model、仅可靠接受 Web 生成的 WAV、无 fallback，且 provider 配置尚未出现在 `.env.example`。
- 继续阅读 [Chat 与 Agent Runtime](chat-agent-runtime.md)、[Dashboards 与 Reports](dashboards-reports.md)、[BMS 集成](bms-integration.md)、[运行时与存储拓扑](../architecture/runtime-storage.md)和[排障与已知契约差距](../development/troubleshooting.md)。
