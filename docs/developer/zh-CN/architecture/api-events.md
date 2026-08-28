# REST、SSE 与 WebSocket 契约

[English](../../en/architecture/api-events.md) | [开发者文档首页](../README.md) | [当前实现架构](current-architecture.md)

> 代码基线：`main@af44ff15`。状态：Fastify REST、Chat SSE 和项目 WebSocket 已实现；前端声明或 collector 能力需按实际路由归类。

## 1. 状态与代码基线

公开本地 API 的事实来源是 [server.ts](../../../../apps/api/src/server.ts) 中注册的 Fastify 路由和 upgrade handler；浏览器消费端在 [apps/web/src/api.ts](../../../../apps/web/src/api.ts)。Web client 中存在函数或解析分支，不足以证明服务端会发射该契约。

本文使用四态：**已实现**表示 Fastify 当前注册；**部分实现**表示仅某分支/兼容行为存在；**外部能力**表示 collector/BMS/LLM 提供；**规划中**表示 client 声明但当前 Fastify 无匹配实现。BMS 逐接口差距见 [BMS 集成](../features/bms-integration.md)。

## 2. 功能目的及边界

REST 处理有界请求/响应和资源 CRUD；SSE 只用于一次 Chat 请求内的单向增量输出；WebSocket 用于项目范围的异步通知和 Dashboard 点位订阅。三者共享项目身份模型，但不是同一重试或交付语义。

本页描述当前 wire behavior，不新增 schema，不把 TypeScript cast 当运行时验证，也不把外部 collector 路径冒充本 Fastify 路由。

## 3. 用户入口和关键源码入口

| 契约面 | 实现入口 | 消费入口 |
| --- | --- | --- |
| REST | [server.ts](../../../../apps/api/src/server.ts)、[auth.ts](../../../../apps/api/src/auth.ts) | [apps/web/src/api.ts](../../../../apps/web/src/api.ts)、[apps/cli/src/api.ts](../../../../apps/cli/src/api.ts) |
| Chat SSE | `POST /api/projects/:projectId/chat/stream` in [server.ts](../../../../apps/api/src/server.ts) | `sendChatMessageStream` in [apps/web/src/api.ts](../../../../apps/web/src/api.ts) |
| 项目 WebSocket | HTTP upgrade handler in [server.ts](../../../../apps/api/src/server.ts) | `createProjectSocket` in [apps/web/src/api.ts](../../../../apps/web/src/api.ts) |
| Runtime 内部事件 | [apps/api/src/agent/types.ts](../../../../apps/api/src/agent/types.ts)、[runtime.ts](../../../../apps/api/src/agent/runtime.ts) | 由 server 映射；不是自动公开的 wire enum。 |

## 4. 正常数据流

### REST

客户端发送 bearer；Fastify 分配 `req_...` request id。成功对象通常直接包含 `requestId`；规范错误为：

```json
{"error":{"code":"project_not_selected","message":"Select this project before using project resources.","requestId":"req_000001"}}
```

主要已实现分组包括登录/session/projects/registry、项目 management/bounds/memory/chat/conversations/tool logs/KB/Repository/Dashboards、BMS bridge/proxy/ingestion，以及 STT。`/health` 是无需认证的例外。具体资源权限以路由实现为准。

### SSE

成功握手后响应 `Content-Type: text/event-stream`，每帧为 `event: <name>` 加 JSON `data:`。当前 server 发射：

| 事件 | 负载与语义 |
| --- | --- |
| `conversation_title` | `{conversationId,title,requestId}`；即时标题。 |
| `activity` | 工具/上下文活动，含 label、kind 和可选 status/tool/timing。 |
| `narration_token` / `narration_reset` | 最终回答前的工作叙述及清空信号。 |
| `final_answer_start` / `answer_token` / `final_answer_end` | 明确的最终回答阶段和增量文本。 |
| `error` | `{code,message,requestId}`；流已建立后的 provider/runtime 错误。 |
| `done` | 最终 user/assistant message、conversation、provider、fallback 和 request id。 |

Web parser 仍识别 `lifecycle`、`progress`、`token` 和 `token_reset` 等兼容分支，但基线 server 没有直接发射它们。内部 `AgentLifecycleEventType` 也不等于公开 SSE 事件名。

### WebSocket

浏览器连接 `ws(s)://.../api/projects/:projectId/ws?token=...`；upgrade 校验 token、membership 和 `chat:read`，成功先收到 `{type:"connected",projectId}`。客户端可发 `{type:"dashboard_subscribe",pointNames:[...]}`；服务端按项目维护订阅并约每 15 秒 best-effort 轮询 collector。

服务端当前可能广播 `dashboard_created`、`dashboard_updated`、`dashboard_deleted`、`dashboard_point_update`、`conversation_title_updated` 和 `reminder_fired`。Web client 断线后每 5 秒重连。

## 5. 数据、状态及持久化

REST/SSE 消息最终写入 `apps/data/store.json`；WebSocket connection、subscription、poller 和最后发送值只在进程内存中，重启后重建连接而不恢复订阅。SSE activity 会作为 assistant message 的 `activities` 保存，便于重新打开 conversation；wire frame 本身不作为独立事件日志保存。

query token 由通用认证解析器支持，并用于 WebSocket URL 和 Repository 资源等浏览器受限场景。URL token 可能进入代理/浏览器日志，部署时必须使用 TLS、限制日志并优先使用 header 能覆盖的协议。

## 6. 权限与项目隔离

REST 项目路由通常按 `authenticate -> membership -> selected project -> permission` 执行。SSE 与同步 Chat 都要求 `chat:write`。WebSocket upgrade 要求 membership 与 `chat:read`，但不检查该 token 当前是否选择了该项目；广播仍由 URL project id 分桶。

Dashboard subscribe 消息不能指定另一个 project id，只能提交 point names。下游 collector 查询当前不携带用户身份，因此服务端的项目订阅隔离不能自动证明 collector 数据源本身按租户隔离。

## 7. 错误、降级及外部依赖

- REST 在发送 response 前失败，使用 HTTP status 和规范 error envelope；Fastify validation、空 JSON body、未捕获异常有统一映射。
- SSE 在 headers 后失败不能再改变 HTTP status，只能发 `error` 并关闭；无 terminal event 的断线由 Web client 报 `stream_incomplete`。
- WebSocket 未认证 upgrade 返回 `401`，无成员/读权限返回 `403`；非法消息 JSON 被忽略。
- Dashboard point poll 对单点 fetch 失败采用 best-effort 跳过，不广播错误事件。
- collector、LLM 和 STT 的外部状态码会被桥接或翻译；本地 `/health` 通过不代表这些依赖健康。

## 8. 扩展方法

新增 REST 时同时提交路由、runtime validator/client parser、permission 顺序和集成测试。新增 SSE 事件需定义终止、重复、排序和断线语义；新增 WebSocket type 需定义 client-to-server schema、project scope、重连后恢复方式和背压。不得只在 `apps/web/src/api.ts` 添加方法后标记为 Implemented；必须在 `server.ts` 或明确的 external collector 契约中找到提供方。

## 9. 对应测试

- REST 鉴权和错误 envelope：[apps/api/src/auth.test.ts](../../../../apps/api/src/auth.test.ts)
- Chat REST/SSE、事件顺序与失败：[apps/api/src/chat.test.ts](../../../../apps/api/src/chat.test.ts)
- Runtime 阶段事件：[apps/api/src/agent/runtime.streamPhase.test.ts](../../../../apps/api/src/agent/runtime.streamPhase.test.ts)
- Web client 解析与页面行为：[apps/web/src/api.test.ts](../../../../apps/web/src/api.test.ts)、[apps/web/src/App.test.tsx](../../../../apps/web/src/App.test.tsx)
- Dashboard 契约相关行为：[apps/api/src/dashboards.test.ts](../../../../apps/api/src/dashboards.test.ts)

## 10. 已知限制及关联文档

- SSE 没有可恢复 event id；断线重试可能遇到已保存的用户消息或已执行副作用。
- recurring-reminder SSE 快速分支把 `done` 对象先手动 stringify，再由通用 writer 再 stringify，形成与普通 `done` 不同的 JSON string 负载。
- WebSocket token 位于 query string；订阅为进程内状态，没有跨实例 fan-out 或 durable replay。
- Web client 的兼容解析分支多于当前 server 发射集合，契约评审必须区分“能解析”和“会收到”。
- 继续阅读 [鉴权、项目与会话](../features/auth-projects-conversations.md)、[Chat 与 Agent Runtime](../features/chat-agent-runtime.md)和[BMS 集成](../features/bms-integration.md)。
