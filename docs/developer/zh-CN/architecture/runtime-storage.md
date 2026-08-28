# 运行时与存储拓扑

[English](../../en/architecture/runtime-storage.md) | [开发者文档首页](../README.md) | [当前实现](current-architecture.md)

> 代码基线：`main@af44ff15`。状态：已实现，但默认本地存储不是生产级数据库架构。

![BuildingAgent 存储拓扑](../../../assets/diagrams/storage-topology.drawio.svg)

## 1. 状态与代码基线

当前 API 有两个独立解析的数据根。它们不能合并理解，也不能把其中一个当作另一个的备份。

| 数据根 | 默认位置 | 解析入口 | 主要内容 |
| --- | --- | --- | --- |
| SeedStore 根 | `apps/data/store.json` | [persistence.ts](../../../../apps/api/src/persistence.ts) | 用户/token、项目/成员关系、消息/会话、Dashboard 和多种项目绑定。 |
| 项目数据根 | `data/**` | [knowledgeBase.ts](../../../../apps/api/src/agent/knowledgeBase.ts) | KB、Repository、Memory、输出、日志、调度状态及 SQLite 数据。 |

`BUILDING_AGENT_DATA_DIR`（兼容 `DATA_DIR`）只覆盖项目数据根，不改变 `persistence.ts` 的 SeedStore 路径。因此“已设置数据目录”不代表所有本地状态都迁移了。

## 2. 功能目的及边界

本页将数据分为五类：权威业务状态、用户文件、权威定义/运行记录、可重建索引、缓存/诊断。分类按恢复语义，而不是文件扩展名。生产部署需要明确备份、并发写入和保留策略；当前代码只提供本地开发所需的轻量持久化。

## 3. 用户入口和关键源码入口

- JSON 加载/延迟保存：[apps/api/src/persistence.ts](../../../../apps/api/src/persistence.ts)
- SeedStore 结构和本地 fixture：[apps/api/src/seed.ts](../../../../apps/api/src/seed.ts)
- 数据根、KB 与 Repository：[apps/api/src/agent/knowledgeBase.ts](../../../../apps/api/src/agent/knowledgeBase.ts)
- Memory 文件：[apps/api/src/agent/curatedMemory.ts](../../../../apps/api/src/agent/curatedMemory.ts)
- 会话索引：[apps/api/src/sessionIndex.ts](../../../../apps/api/src/sessionIndex.ts)
- Grounding 索引：[apps/api/src/groundingRuleIndex.ts](../../../../apps/api/src/groundingRuleIndex.ts)
- Derived Metrics SQLite：[apps/api/src/derivedMetrics.ts](../../../../apps/api/src/derivedMetrics.ts)
- Scheduler 文件：[apps/api/src/scheduler.ts](../../../../apps/api/src/scheduler.ts)

## 4. 正常数据流

1. `buildServer` 在持久化模式下读取 `store.json`；缺失或解析失败时创建 seed store。
2. store 变更通过约 500 ms debounce 写入临时文件，旧文件复制到 `.bak`，再 rename。
3. API 以项目数据根创建 Memory、Session index、Grounding index、Derived Metrics、Scheduler 和工具日志组件。
4. Session/Grounding 索引在启动时从 store 重建；它们服务检索，不替代来源记录。
5. KB/Repository 文件和 Agent 输出按 project id 落入项目目录；外部 BMS 数据通常只在请求时读取或按域逻辑物化。

## 5. 数据、状态及持久化

| 类别 | 示例 | 恢复/生命周期约束 |
| --- | --- | --- |
| 权威业务状态 | `apps/data/store.json` | 不能通过 SQLite 索引完整恢复；需要备份。`.bak` 只是上一次本地副本，不是备份策略。 |
| 用户/项目文件 | `data/<project>/kb/**`、`repository/**`、`outputs/**` | KB/Repository 是来源材料；输出可能是重要交付物，是否可重建取决于生成过程。 |
| 权威定义或运行状态 | `derived_metrics.db`、`scheduled_jobs.json`、Memory Markdown | 保存定义、调度和人工/Agent 策展状态；不要当作随时可删缓存。 |
| 可重建索引 | `session_index.db`、`grounding_index.db` | 服务检索，启动时可由 store 重建；删除会损失临时检索可用性和重建时间。 |
| 缓存/诊断 | `tool_call_logs.json`、结构化日志、临时上传 | 用于审计与排障；应设置保留和脱敏策略。 |
| 外部权威数据 | BMS 点位/时序、真实 LLM 服务 | 本地只保存引用、配置或派生事实；恢复依赖外部系统及凭据。 |

仓库内 `data/project_element`、`data/project_mortar` 等内容是公开本地 fixture。真实客户 KB、BMS 导出和连接凭据不得提交。

## 6. 权限与项目隔离

文件根使用 project id 分区，但路径分区不是唯一安全控制。API 在进入文件读写前仍须验证 membership/permission，并对 project id、相对路径、下载路径做校验。Memory 还区分项目、用户和 global bank；global 不等于匿名公开。

## 7. 错误、降级及外部依赖

- `loadStoreSync` 遇到缺失/解析异常返回 `null`；启动方可能回到 seed store，这会掩盖损坏，不能当作生产恢复。
- `saveStoreSync` 捕获写入异常并警告，不使进程崩溃；调用成功不等于已持久化保证。
- SQLite 文件损坏时可重建的仅是明确标注的索引；Derived Metrics 等数据库不能一概删除。
- 外部 BMS/LLM 不可用时，持久化的连接信息不能替代现场数据或 provider。

## 8. 扩展方法

新增存储前必须声明：权威方、作用域、写入者、恢复来源、保留策略和秘密处理。可重建索引应提供确定性 rebuild；用户文件应采用安全路径拼接；业务定义应有迁移和备份策略。不要再引入第三个隐式数据根。

## 9. 对应测试

- JSON 持久化行为由 API 集成测试间接覆盖。
- Session 索引由 [apps/api/src/conversationMessages.test.ts](../../../../apps/api/src/conversationMessages.test.ts) 和 Chat 集成测试间接覆盖。
- Grounding 索引：[apps/api/src/groundingRuleIndex.test.ts](../../../../apps/api/src/groundingRuleIndex.test.ts)
- Derived Metrics：[apps/api/src/derivedMetrics.test.ts](../../../../apps/api/src/derivedMetrics.test.ts)
- Memory：[apps/api/src/agent/curatedMemory.test.ts](../../../../apps/api/src/agent/curatedMemory.test.ts)

测试必须通过 `BUILDING_AGENT_DATA_DIR` 或临时目录隔离项目数据；涉及 `store.json` 的测试不得指向真实本地状态。

## 10. 已知限制及关联文档

- 两个数据根没有统一事务、迁移或备份机制。
- JSON store 的单进程 best-effort 写入不提供多实例一致性。
- 当前仓库 fixture 与运行时生成文件混居的风险需靠环境配置和部署规范控制。
- 参阅[配置与本地运行](../development/configuration.md)、[Knowledge Base 与 Repository](../features/knowledge-base-repository.md)和 [Memory/Grounding](../features/tools-skills-memory-grounding.md)。
