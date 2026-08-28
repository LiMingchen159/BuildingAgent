# Tools、Skills、Memory 与 Grounding

[English](../../en/features/tools-skills-memory-grounding.md) | [开发者文档首页](../README.md) | [Chat Runtime](chat-agent-runtime.md)

> 代码基线：`main@af44ff15`。状态：项目范围 registry、Memory 和 Grounding 已实现；部分工具依赖外部服务或本地运行环境。

## 1. 状态与代码基线

[tools.ts](../../../../apps/api/src/agent/tools.ts) 提供注册、OpenAI tool schema 转换、调度、结果压缩和日志；[genericTools.ts](../../../../apps/api/src/agent/genericTools.ts) 装配 Memory、会话检索、文件、BMS、派生指标、Dashboard、执行、调度、Web 和反馈工具；[skills.ts](../../../../apps/api/src/agent/skills.ts) 将 Skill 表达为 prompt hint；[curatedMemory.ts](../../../../apps/api/src/agent/curatedMemory.ts) 与 [projectGrounding.ts](../../../../apps/api/src/projectGrounding.ts) 保存两类不同的长期上下文。

Tool 执行、Skill 注入、Memory bank 和项目规则检索为 **已实现**；依赖 collector、网络或解释器的工具是 **部分实现/外部能力**；`/api/registry` 中的 placeholder 项不是运行可用性的保证。

## 2. 功能目的及边界

- **Tool**：有 JSON schema 的可执行函数，返回可序列化结果并可能产生文件或外部副作用。
- **Skill**：按项目启用的 prompt 指南；它不会自动创建独立进程或权限。
- **Memory**：用户偏好或声明式项目事实的策展文本，容量有限，不保存时序数据或可执行规则。
- **Grounding rule**：带来源、状态和触发字段的项目判断规则，检索后进入 prompt，并对最终回答做校验。
- **Playbook/feedback**：用户纠错后提议、审批、实现和提交的独立流程，不应与普通 Memory 混写。

## 3. 用户入口和关键源码入口

| 责任 | 入口 |
| --- | --- |
| Tool registry 与日志 | [apps/api/src/agent/tools.ts](../../../../apps/api/src/agent/tools.ts)、`GET /api/projects/:projectId/tool-logs` |
| 通用工具 | [apps/api/src/agent/genericTools.ts](../../../../apps/api/src/agent/genericTools.ts) |
| Skill registry/绑定 | [apps/api/src/agent/skills.ts](../../../../apps/api/src/agent/skills.ts)、[projectSkills.ts](../../../../apps/api/src/projectSkills.ts) |
| Memory REST | `GET/PATCH /api/projects/:projectId/memory/{user,project,global}` |
| 规则摘要 | `GET /api/projects/:projectId/memory/rules` |
| Grounding 检索 | [groundingRuleRetrieval.ts](../../../../apps/api/src/groundingRuleRetrieval.ts)、[groundingRuleIndex.ts](../../../../apps/api/src/groundingRuleIndex.ts) |
| 反馈流程 | [projectFeedback.ts](../../../../apps/api/src/projectFeedback.ts)、[projectRules.ts](../../../../apps/api/src/projectRules.ts) |

## 4. 正常数据流

1. 服务启动时注册内置工具和 Skills，为每个项目合并默认 skill ids；Runtime Skills 始终重新加入项目绑定。
2. 每轮 Chat 先按项目读取 Skill hint、Memory 快照、approved Grounding 和 committed playbook。
3. Grounding index 使用项目过滤的 FTS，并在 embedding 可用时合并 dense 检索；退化时仍可只用关键词。
4. Runtime 把 tool schemas 交给 provider。provider 返回一个或多个 tool calls，registry 使用不可由模型覆盖的 tool context 调度并压缩结果。
5. Tool call 以 project/conversation/request/user 维度记录到 `tool_call_logs.json`；结果再作为 `role=tool` 消息送回 provider。
6. Memory 写入会执行去重、长度和威胁模式扫描，并使相关 conversation 快照失效；同一快照在会话中保持稳定。
7. 用户批准的规则保存在 SeedStore，同时更新 Grounding SQLite 索引；启动时可由 SeedStore 重建索引。

## 5. 数据、状态及持久化

| 数据 | 默认位置 | 恢复语义 |
| --- | --- | --- |
| Skill 项目绑定、Grounding、反馈/提议 | `apps/data/store.json` | 权威本地状态。 |
| 项目用户 Memory | `data/<project>/memories/users/<user>/USER.md` | 权威策展文本。 |
| 全局用户 Memory | `data/global/memories/users/<user>/USER.md` | 跨项目合并，但仍按 user 隔离。 |
| 项目 Memory | `data/<project>/memories/PROJECT.md` | 项目声明事实；写入需 configure。 |
| Grounding 检索 | `data/grounding_index.db` | 可由 SeedStore 重建。 |
| Tool 日志 | `data/tool_call_logs.json` | best-effort 诊断/审计数据，默认最多 2000 条。 |

用户和项目 Memory 默认字符上限分别为 1375 和 2200；条目用 `§` 分隔。它们不是无限上下文或秘密存储。

## 6. 权限与项目隔离

所有 REST Memory 路由都要求 token、membership 和选中项目。项目 Memory PATCH 明确要求 `project:configure`；项目用户与 global 用户 Memory 的 PATCH 以当前认证 user 写入，不允许指定他人 user id。Skill create/edit/delete 和项目 Grounding/规则写入由工具层检查 `canConfigure`；内置 Skills 不能通过 Chat 编辑或删除。

Tool context 的 project id 决定文件根、会话检索、日志和 Dashboard 操作。外部数据工具也必须在自身实现中维护项目/连接边界；Tool registry 只提供上下文，不自动证明下游服务已隔离。

## 7. 错误、降级及外部依赖

- 未知或抛错的工具被转换为 `{error: ...}` 结果并写日志；HTTP 请求不一定立即失败。
- 工具结果会压缩以控制上下文，完整大结果可能通过项目文件/缓存交接；回答不能假设所有原始行仍在 prompt。
- Memory 威胁扫描、字符上限或格式校验失败返回 `422`；项目写权限不足返回 `403 bounds_violation`。
- embedding 不可用时 Grounding 退化为 FTS；这会改变召回质量但不会跨项目搜索。
- BMS、Web、terminal、Python 和 STT 等工具依赖外部服务或主机环境；registry 中存在 schema 不代表依赖健康。

## 8. 扩展方法

新增 Tool 时定义最小参数 schema、使用 tool context、限制路径/副作用、返回可压缩的结构化结果，并加入成功、错误和权限测试。新增 Skill 应先判断它是否只是 prompt 指南；确定性业务规则应进入代码或 Grounding，不应藏在长 prompt。新增 Memory 类型必须明确 owner、scope、容量、威胁扫描和恢复语义。Grounding schema 变更要同时考虑 SeedStore 迁移与 SQLite rebuild。

## 9. 对应测试

- Tool 并行与顺序：[apps/api/src/agent/runtime.toolParallel.test.ts](../../../../apps/api/src/agent/runtime.toolParallel.test.ts)
- Tool 结果压缩与日志表现：[apps/api/src/agent/toolResultCompaction.test.ts](../../../../apps/api/src/agent/toolResultCompaction.test.ts)
- Memory 文件、快照、安全和迁移：[apps/api/src/agent/curatedMemory.test.ts](../../../../apps/api/src/agent/curatedMemory.test.ts)
- Memory REST：[apps/api/src/memory.api.test.ts](../../../../apps/api/src/memory.api.test.ts)
- 项目 Skill 绑定：[apps/api/src/projectSkills.test.ts](../../../../apps/api/src/projectSkills.test.ts)
- Grounding 模型与检索：[apps/api/src/projectGrounding.test.ts](../../../../apps/api/src/projectGrounding.test.ts)、[groundingRuleRetrieval.test.ts](../../../../apps/api/src/groundingRuleRetrieval.test.ts)

## 10. 已知限制及关联文档

- `/api/registry` 合并了 placeholder 和真实 Agent tool/skill 摘要，并返回 `placeholderOnly: true`；它是管理展示，不是健康探针。
- Tool 日志包含参数和结果，虽有展示层脱敏，生产仍需访问控制、字段级脱敏和保留策略。
- Memory、Grounding 和 playbook 有不同审批与执行语义，不能只因都进入 prompt 就合并。
- Grounding 最终校验只产生 warning，不会自动重算或阻断回答。
- 继续阅读 [Chat 与 Agent Runtime](chat-agent-runtime.md)、[Knowledge Base 与 Repository](knowledge-base-repository.md)和[FDD 规则模型](../fdd/rule-model-sources.md)。
