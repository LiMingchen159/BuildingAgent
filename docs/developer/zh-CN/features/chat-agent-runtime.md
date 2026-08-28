# Chat 与 Agent Runtime

[English](../../en/features/chat-agent-runtime.md) | [开发者文档首页](../README.md) | [接口与事件](../architecture/api-events.md)

> 代码基线：`main@af44ff15`。状态：同步 Chat、SSE Chat 和多轮 provider/tool loop 已实现；真实 LLM 是外部能力。

![Chat 与 Agent Runtime 时序](../../../assets/diagrams/chat-agent-sequence.drawio.svg)

## 1. 状态与代码基线

[server.ts](../../../../apps/api/src/server.ts) 暴露同步 `POST /api/projects/:projectId/chat` 和流式 `POST .../chat/stream`；[runtime.ts](../../../../apps/api/src/agent/runtime.ts) 实现上下文装配后的多轮 Agent 循环；[providers.ts](../../../../apps/api/src/providers.ts) 解析 mock 或 OpenAI-compatible provider。它们在同一 Fastify 进程内组合，不是独立 Agent 服务。

核心循环、工具并行和 SSE 为 **已实现**；provider 质量、外部可用性和模型能力为 **外部能力**；无凭据时不会自动伪装成真实模型，只有显式配置 mock 或允许 fallback 才使用确定性 mock。

## 2. 功能目的及边界

Chat 路由负责 HTTP 授权、conversation 选择、消息持久化和协议输出；Agent Runtime 负责系统上下文、provider 调用、工具执行、循环终止和结果校验。确定性提醒会在进入 LLM 前由路由处理。Dashboard、BMS、Memory 等工具各自仍是业务事实的计算者，LLM 只选择工具并组织回答。

## 3. 用户入口和关键源码入口

- Web 流客户端：[apps/web/src/api.ts](../../../../apps/web/src/api.ts)
- HTTP 装配、消息生命周期和 fallback：[apps/api/src/server.ts](../../../../apps/api/src/server.ts)
- Agent 循环与事件：[apps/api/src/agent/runtime.ts](../../../../apps/api/src/agent/runtime.ts)
- provider 配置、重试和错误脱敏：[apps/api/src/providers.ts](../../../../apps/api/src/providers.ts)
- prompt 边界：[apps/api/src/agent/systemPrompt.ts](../../../../apps/api/src/agent/systemPrompt.ts)
- 上下文压缩：[apps/api/src/agent/compressor.ts](../../../../apps/api/src/agent/compressor.ts)
- 工具与技能：[apps/api/src/agent/genericTools.ts](../../../../apps/api/src/agent/genericTools.ts)、[apps/api/src/agent/skills.ts](../../../../apps/api/src/agent/skills.ts)

## 4. 正常数据流

1. 路由校验 token、membership、selected project、`chat:write` 和 1–1000 字符消息；没有 conversation id 时创建线程。
2. 用户消息先写入项目消息池、conversation 和 session 搜索索引。同步路径立即落盘；SSE 路径在开始流式响应前落盘。
3. `buildAgentTurnInputs` 只取当前 conversation 的有序消息，同时扫描 `data/<project>/kb` 与 `repository`，生成 provider 历史和文件目录。
4. Runtime 检索项目 Grounding、加载 playbook、Memory 快照和项目 Skills，组合内核约束、时间/语言、工具 schema、KB/Repository 摘要等 system prompt。
5. provider 每次返回最终文本或 tool calls。单次迭代中的工具按 `BUILDING_AGENT_TOOL_CONCURRENCY`（默认 8）并行调度，结果按原 tool-call 顺序追加，再进入下一次 provider 调用。
6. 默认最多 20 次迭代；长上下文先裁剪工具行，超过阈值再压缩。达到上限后做一次不带工具的总结调用。
7. 最终回答经过用户可见文本清理与 Grounding 规则校验；图片只保留可信工具生成且被正文引用的条目，下载合并工具结果与规范化的 `outputs/...` 链接。服务端保存 assistant 消息并返回 JSON 或 SSE `done`。

上图同时标出普通成功、显式 fallback 和流式错误分支；内部 lifecycle 事件与公开 SSE 事件并非一一对应。

## 5. 数据、状态及持久化

消息和 conversation 的权威本地状态在 `apps/data/store.json`。`data/session_index.db` 是由消息重建的搜索索引；Memory、Grounding 索引、KB、Repository、工具日志和生成输出位于根 `data/**`。Agent Runtime 自身不维护独立数据库。

工具活动、生成图片、下载和 `workDuration` 会随 assistant 消息持久化。同步响应还返回生命周期数组；SSE 将部分 runtime 生命周期映射为用户可见 activity/narration/answer 事件，而不是逐项透传全部内部事件。

## 6. 权限与项目隔离

两个 Chat POST 路由都要求项目已选中及 `chat:write`。Runtime request 显式携带 `projectId`、`userId`、`conversationId`、`requestId` 和 `canConfigure`；工具 registry 用这些字段限制文件根、日志和配置写入。`canConfigure` 只来自 membership 的 `project:configure`，不能由模型参数提升。

KB/Repository 扫描使用当前 project id 解析目录；会话历史只从当前 conversation 取出。实现新工具时必须继续使用 tool context，不得接受模型传入的任意 project root。

## 7. 错误、降级及外部依赖

- provider 未配置或调用失败且未允许 fallback：同步返回 `502 provider_error`；SSE 发出 `error` 后结束。
- `BUILDING_AGENT_LLM_ALLOW_FALLBACK`（及兼容变量）显式开启时，失败会记录脱敏诊断并用确定性 mock 重跑。
- provider streaming 失败会尝试非流式调用；可重试错误带退避，rate limit 使用更长等待。
- 工具未知、抛错或返回域错误时，registry 将其转成结构化 tool result，循环可让 provider 解释或修正；这不等于业务操作成功。
- 客户端在连接无 `done`/`error` 结束时报告 `stream_incomplete`；用户问题可能已经保存，重试需要考虑重复执行。
- LLM、BMS、网络搜索、语音和现场系统均是外部依赖；本地 fallback 不能代替真实数据。

## 8. 扩展方法

新增 provider 应实现 `ChatProvider`，只暴露脱敏 metadata，并保持 tool-call delta 的顺序组装。新增工具应在 registry 注册 JSON schema、使用 `AgentToolContext`、返回可序列化的确定性结果，并为写操作检查 `canConfigure` 或更窄权限。新增 SSE 事件必须同步修改服务端发射、Web parser、事件文档和测试；内部 lifecycle type 不应自动视为公开 SSE 契约。

## 9. 对应测试

- 同步 Chat、权限、fallback、文件和 conversation：[apps/api/src/chat.test.ts](../../../../apps/api/src/chat.test.ts)
- 工作/答案阶段门控：[apps/api/src/agent/runtime.streamPhase.test.ts](../../../../apps/api/src/agent/runtime.streamPhase.test.ts)
- 同迭代工具并行与消息顺序：[apps/api/src/agent/runtime.toolParallel.test.ts](../../../../apps/api/src/agent/runtime.toolParallel.test.ts)
- 上下文压缩：[apps/api/src/agent/compressor.test.ts](../../../../apps/api/src/agent/compressor.test.ts)
- 工具结果压缩：[apps/api/src/agent/toolResultCompaction.test.ts](../../../../apps/api/src/agent/toolResultCompaction.test.ts)
- Web 流式渲染：[apps/web/src/App.test.tsx](../../../../apps/web/src/App.test.tsx)

## 10. 已知限制及关联文档

- `server.ts` 同时承载协议、持久化和多个领域装配，文档分层不表示已经拆成服务。
- 默认 20 次循环和并发 8 是进程级配置，不是按项目配额或分布式调度。
- 工具副作用没有跨 JSON、SQLite、文件和外部系统的统一事务。
- SSE 中 recurring-reminder 快速分支的 `done` 数据在基线代码中被二次 JSON 编码，和普通 Chat `done` 对象不一致；调用方不应把这一差异推广为新规范。
- 继续阅读 [Tools、Skills、Memory 与 Grounding](tools-skills-memory-grounding.md)、[Knowledge Base 与 Repository](knowledge-base-repository.md)和[运行时与存储拓扑](../architecture/runtime-storage.md)。
