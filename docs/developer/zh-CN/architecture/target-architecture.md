# 目标架构

[English](../../en/architecture/target-architecture.md) | [开发者文档首页](../README.md) | [当前实现](current-architecture.md)

> 代码基线：`main@af44ff15`。本页以手绘框架为目标叙事，不把目标状态冒充当前实现。

![BuildingAgent 目标架构](../../../assets/diagrams/target-architecture.drawio.svg)

## 1. 状态与代码基线

目标架构固定为前端、数据、后台、业务四层。状态是对 `af44ff15` 的事实核对，不是路线承诺。

| 层 | 能力 | 状态 | 当前依据 |
| --- | --- | --- | --- |
| 前端 | 自定义面板 | 部分实现 | 已有 Dashboard 定义、Widget 和工作区，但仍集中在大型 `App.tsx`。 |
| 前端 | 自然语言对话 | 已实现 | Web/CLI 均可进入项目范围 Chat，API 支持普通响应和 SSE。 |
| 前端 | 模型调试 | 部分实现 | 有 provider 诊断、工具日志和过程状态，没有独立的通用模型调试台。 |
| 数据 | 对话 | 已实现 | 会话、消息和选中会话进入 JSON store，并建立会话 SQLite 索引。 |
| 数据 | 时序 | 部分实现 / 外部能力 | API 有 BMS 批量历史/最新值边界；真实采集和时序权威数据由 collector/BMS 提供。 |
| 数据 | 静态 | 已实现 | 项目 Knowledge Base、Repository 和上传材料使用项目文件目录。 |
| 数据 | 语义 | 部分实现 | 支持 Brick/TTL 材料、语义检索和 FDD 点位证据，但自动闭环建模未完成。 |
| 数据 | 用户 | 已实现 | Bearer 会话、成员关系、角色权限及项目选择存在；默认账号是公开本地 fixture。 |
| 后台 | FDD 回馈 | 部分实现 | 有反馈、归因、grounding 规则与 FDD 结果路径，但并非完整自学习闭环。 |
| 后台 | KPI 回馈 | 规划中 | Derived Metrics/KPI 基础存在，未找到与目标图同义的 KPI 自动回馈闭环。 |
| 后台 | 模拟数据 | 部分实现 | 有 deterministic mock provider、mock BMS 和测试 fixture；不是通用建筑仿真平台。 |
| 业务 | 自动建模 | 部分实现 | 具备语义材料、点位候选和部署辅助，没有端到端自主建模产品流程。 |
| 业务 | 检索 | 已实现 | KB、Repository、Memory、会话及 grounding 检索可由 Agent 工具使用。 |
| 业务 | FDD | 部分实现 | 算法目录广于可执行 Runtime，部署前仍需语义点位和证据检查。 |
| 业务 | 世界模型 | 规划中 | 当前代码没有可验证的世界模型 Runtime 或独立契约。 |

## 2. 功能目的及边界

目标图提供长期稳定的“责任地图”：用户从前端表达意图，数据层提供项目事实，后台能力完成确定性或集成处理，业务层组合成建模、检索和诊断体验。它不规定部署拓扑，也不意味着每个方框对应一个服务。

当前 Fastify API 和 React 应用仍是模块化代码装配成的单体进程/单页应用。实际边界以[当前实现架构](current-architecture.md)和源码为准。

## 3. 用户入口和关键源码入口

- Web 组合根：[apps/web/src/App.tsx](../../../../apps/web/src/App.tsx)
- API 组合根：[apps/api/src/server.ts](../../../../apps/api/src/server.ts)
- Agent 循环：[apps/api/src/agent/runtime.ts](../../../../apps/api/src/agent/runtime.ts)
- 工具注册：[apps/api/src/agent/genericTools.ts](../../../../apps/api/src/agent/genericTools.ts)
- 数据根解析：[apps/api/src/agent/knowledgeBase.ts](../../../../apps/api/src/agent/knowledgeBase.ts)
- 规则与反馈边界：[apps/api/src/projectRules.ts](../../../../apps/api/src/projectRules.ts)、[apps/api/src/projectFeedback.ts](../../../../apps/api/src/projectFeedback.ts)

## 4. 正常数据流

1. 用户在 Web 或 CLI 登录并选择项目。
2. 自然语言请求进入项目范围 Chat；普通接口返回 JSON，流式接口返回 SSE。
3. Agent Runtime 装配会话、KB/Repository、Memory、Grounding、Skills 和可用 Tools。
4. Tool 调用读取静态/语义/时序数据，或执行 Derived Metrics、BMS、FDD、Dashboard 等确定性能力。
5. 结果和来源被持久化到相应数据根；SSE 返回当前请求进度，WebSocket 推送跨请求更新。
6. 未来闭环能力必须在确定性事实与有证据的反馈之上扩展，不能由 LLM 发明数值或故障。

## 5. 数据、状态及持久化

目标图中的“数据层”是概念分层，不是一个统一数据库。当前实现至少有 `apps/data/store.json` 和可配置的根 `data/**` 两个数据根，另有外部 BMS/collector 与 LLM provider。具体权威性见[运行时与存储拓扑](runtime-storage.md)。

## 6. 权限与项目隔离

所有项目业务入口必须在 bearer 鉴权后验证成员关系和权限。项目 id 同时约束消息、文件、记忆、仪表盘、FDD/BMS 请求与 WebSocket 连接。目标图中跨层箭头不绕过这一检查。

## 7. 错误、降级及外部依赖

- 未配置真实 LLM 时可使用确定性 mock；真实 provider 失败默认返回规范错误，只有显式配置才回退。
- BMS/collector 不可用时，外部时序和点位能力降级；文档不得把 mock 结果写成现场数据。
- 世界模型、KPI 回馈等规划能力没有可调用的降级实现。
- JSON 保存是 best effort；关键部署必须考虑备份、并发与恢复，而不能从目标图推断生产级保证。

## 8. 扩展方法

新增能力应先确定它属于哪一层、其权威数据源和项目隔离边界，再复用现有注册表/契约。只有存在路由、Runtime、持久化和验证证据后，状态才能从 Planned 或 Partial 提升为 Implemented。

## 9. 对应测试

- Chat 与 provider：[apps/api/src/chat.test.ts](../../../../apps/api/src/chat.test.ts)、[apps/api/src/providers.test.ts](../../../../apps/api/src/providers.test.ts)
- Web 入口：[apps/web/src/App.test.tsx](../../../../apps/web/src/App.test.tsx)
- 项目隔离：[apps/api/src/auth.test.ts](../../../../apps/api/src/auth.test.ts)
- 架构构建门禁：`npm run typecheck`、`npm run build`、`npm run smoke`

## 10. 已知限制及关联文档

- 图中状态是基线快照，会随代码演进而变化。
- 世界模型明确为规划中；模拟数据不等同于物理仿真。
- 参阅[当前实现架构](current-architecture.md)、[运行时与存储拓扑](runtime-storage.md)和 [FDD 总览](../fdd/overview.md)。
