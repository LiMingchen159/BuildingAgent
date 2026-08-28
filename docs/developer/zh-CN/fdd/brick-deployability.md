# Brick 映射及可部署性

[English](../../en/fdd/brick-deployability.md) | [开发者文档首页](../README.md) | [FDD 总览](overview.md) | [规则模型与来源](rule-model-sources.md)

> 产品代码基线：`main@af44ff15`。状态：产品 `main` 上的 Brick 点位映射与 FDD 可部署性检查为 **规划中**；该基线只有 Reports 中的 `fdd_rule` 证据消费契约，没有 FDD producer、目录、deployability runtime 或专用路由。本文中的模型和行为均固定到未合并 M007 候选提交，不是产品 API 或发布承诺。

![BMS–FDD 部署与消费链路](../../../assets/diagrams/bms-fdd-pipeline.drawio.svg)

图中绿色区域是产品 `main` 的现行边界，紫色区域只表示按能力固定到不可变提交的未合并候选实现；[Draw.io 源文件](../../../assets/diagrams/bms-fdd-pipeline.drawio)可用于审查和重新导出。

## 1. 状态与代码基线

本页使用四个不可变候选快照解释设计如何逐步收紧。它们不是一条已发布产品版本线，缓存状态也不能跨这些策略版本直接复用。

| 基线 | 候选能力 | 事实边界 |
| --- | --- | --- |
| 产品 `main@af44ff15` | Reports 可校验外部 fault tool 产生的 `fdd_rule` 事实。 | 没有 `apps/api/src/fdd/**`、Brick-to-point matcher、可部署性检查或 FDD 路由。 |
| [`71c2cb6d…`](https://github.com/LiMingchen159/BuildingAgent/commit/71c2cb6d2c382348e6ccc47badea611183b0912d) | 定义 `FddRequiredPoint`、候选、映射、检查三态和 `v2-observed-history` 策略。 | 是未合并的基础候选；Brick class 仍是匹配线索，不能证明项目设备清单完整。 |
| [`6c7936e0…`](https://github.com/LiMingchen159/BuildingAgent/commit/6c7936e01a249a134b758c02f6454d67f961ec23) | 增加 equipment-first 清单、最小 Brick 事实、单位校验、实际历史探测和 `v3-equipment-first`。 | 仍是候选；最小 Turtle parser 不是完整 RDF/Brick reasoner。 |
| [`bef810af…`](https://github.com/LiMingchen159/BuildingAgent/commit/bef810af291665bcaaf1b8b3bda185bdb663a19b) | 对多冷机增加同构模板、全实体覆盖 guard 和 `v4-homogeneous-fleet`。 | 只证明该候选实现与测试中的 guard；不证明任意设备族都同构。 |
| [`c27a3af2…`](https://github.com/LiMingchen159/BuildingAgent/commit/c27a3af2dca6b04fe731b6fc11f83e9608f10943) | 增补 fleet deployability 的特征测试。 | 该提交只改测试，不应被描述成新的产品实现。 |

所以这里的“已实现”一律是“在指定候选快照中可找到代码和测试”；对产品 `main` 而言，本页能力仍为规划中。候选目录的 `198 / 59 / 111` 数量边界见[规则模型与来源](rule-model-sources.md)，它们既不是 `main` 返回值，也不是项目可部署数量。

## 2. 功能目的及边界

可部署性检查回答一个窄问题：**某个版本化规则能否在某项目当前确认的设备集合上，得到单位和历史证据均满足要求的、无歧义且逐设备完整的输入映射？** 它应在启动 evaluator 之前运行，并把不能自动判定的内容留给工程复核。

它不负责：

- 判断规则公式是否科学、阈值是否适合现场，或故障诊断是否正确；
- 把来源文档中的 Brick class 当成现场 point id；
- 把“找到一个相似点名”升级为设备清单完整、单位可转换或历史覆盖充分；
- 产生 fault event、执行 evaluator、物化结果或生成报告；这些属于后续 runtime/消费边界；
- 让 LLM 的自由文本替代确定性映射、三态判定或项目授权。

三个名称相近但含义不同的对象必须分开：`FddDefinitionStatus` 说明规则规格是否清楚，`FddDeployabilityStatus` 说明当前项目输入是否就绪，`FddTaskStatus` 说明候选任务处于检查、就绪或运行等生命周期。`implementation_ready` 不等于 `can_deploy`，`can_deploy` 也不等于 `running`。

## 3. 用户入口和关键源码入口

产品 `main` 没有 FDD Library、Test、Deploy 或 Task 的稳定 Web/API 入口。可从[当前实现架构](../architecture/current-architecture.md)核对产品边界；当前 Reports 侧的消费者端口见 [evidenceDefinitions.ts](../../../../apps/api/src/reports/evidenceDefinitions.ts) 和 [evidenceExecutor.ts](../../../../apps/api/src/reports/evidenceExecutor.ts)。

以下只是不变候选源码证据：

- 基础 required-point、candidate、mapping、check 和三态 evaluator：[M007 `library.ts` at `71c2cb6d…`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/library.ts)
- 来源符号/Brick class 的规范化与保真：[M007 `importedEquipmentLibrary.ts` at `71c2cb6d…`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/importedEquipmentLibrary.ts)
- 最小 Brick 事实、单位别名和清单签名：[M007 `equipmentEvidence.ts` at `6c7936e0…`](https://github.com/LiMingchen159/BuildingAgent/blob/6c7936e01a249a134b758c02f6454d67f961ec23/apps/api/src/fdd/equipmentEvidence.ts)
- equipment-first 上下文、候选检索、历史探测和候选路由：[M007 `server.ts` at `6c7936e0…`](https://github.com/LiMingchen159/BuildingAgent/blob/6c7936e01a249a134b758c02f6454d67f961ec23/apps/api/src/server.ts)
- 同构模板和全实体覆盖 guard：[M007 `server.ts` at `bef810af…`](https://github.com/LiMingchen159/BuildingAgent/blob/bef810af291665bcaaf1b8b3bda185bdb663a19b/apps/api/src/server.ts)
- fleet 特征测试：[M007 `fddHomogeneousFleet.test.ts` at `c27a3af2…`](https://github.com/LiMingchen159/BuildingAgent/blob/c27a3af2dca6b04fe731b6fc11f83e9608f10943/apps/api/src/fddHomogeneousFleet.test.ts)

候选 `server.ts` 曾声明项目化 `fdd-library/.../test`、`.../deploy` 和 `fdd-tasks` 路由，但它们不在产品基线。客户端、集成方和本文都不得把这些候选路径当成 `main` 契约。

## 4. 正常数据流

候选设计的确定性主路径如下；产品 `main` 目前没有这条生产者链路。

1. **读取规则要求。** 每个 required slot 给出语义、quantity kind、单位角色、可接受单位、关键词、来源符号/Brick class，以及最短/建议历史天数。来源 Brick class 是检索提示，不是已绑定点位。
2. **先确认设备集合。** `6c7936e0…` 从项目 `KB_CATALOG_SUMMARY.md` 和 `brick_model.ttl` 收集设备/点位事实。只有显式“完整清单”标记与 Brick 设备事实同时存在，缺失设备才可作为权威的 `not_available`；否则保持 `unknown`。
3. **生成点位候选。** 候选结合项目设备别名、KB 词汇、最小 Brick class/`isPointOf` 事实和外部 BMS point catalog。每项保留 slot、point name、entity key、object ref、单位兼容性、维度理由、置信度、原因和可选历史天数。
4. **拒绝或排序。** 单位维度不兼容的候选进入 `rejectedCandidates`。其余候选按原始置信度与确定性的公式角色加权排序，例如区分 run status 与 flow status、供水温度与回水温度、功率与能量。
5. **验证历史观测。** 对每个 entity/slot 的确定性胜出候选，候选服务通过外部 readings 接口验证覆盖天数。未验证或少于 required point 的 `minDays` 都写入 `historyIssues`，不会被解释为零故障。
6. **逐设备形成映射。** 每个 required slot 选择一个点；缺少必需点、候选过近、低置信度、单位未知和历史问题被显式保留。映射记录 slot、point name、object ref 和单位，不复制原始时序。
7. **执行同构 fleet guard。** `bef810af…` 对多冷机可从一个完整实体提取 point-family 模板，但仍要求每台当前清单内设备都有同族 counterpart，并逐台重新计算三态；不是把样例映射复制给其余设备。
8. **签署检查结果。** 检查保存算法版本、策略版本、项目数据签名、设备清单签名、检查时间和来源。部署前还要复核这些签名、时效和全实体覆盖，旧检查不能直接授权新部署。

## 5. 数据、状态及持久化

### 5.1 映射与证据对象

| 对象/字段 | 候选中的作用 | 明确不代表 |
| --- | --- | --- |
| `FddRequiredPoint.sourceSymbols / sourceBrickClasses` | 保留规则来源的公式符号和 Brick 类，辅助检索与审查。 | 项目 point id、完整 Brick 图或已验证关系。 |
| `FddPointCandidate` | 保存一个 slot 的候选点、设备、对象引用、单位判断、置信度、理由及历史天数。 | 权威映射、诊断概率或模型准确率。 |
| `FddPointMapping` | 保存确定性选择后的 slot → point 绑定。 | 原始时序副本、长期告警或跨项目共享映射。 |
| `FddEntityDeployability` | 保存单个设备的三态、映射、歧义、缺口、历史问题和聚合置信度。 | 整个 fleet 已通过。 |
| `FddDeployabilityCheck` | 绑定 project、algorithm/policy version、设备/数据签名、候选、拒绝项和检查时间。 | 永久授权或 evaluator 结果。 |

`FddUnitCompatibility` 的类型包含 `match / convertible / mismatch / unknown`，但 `6c7936e0…` 的单位工具**只规范化拼写/符号别名，不执行数值换算**。例如 `°C` 与 `degC` 可视为同一别名，`degF` 不能因物理上可换算就自动接受为 `degC`。需要换算时必须引入有版本、可测试且作用于数值的转换步骤，不能只改 enum。

### 5.2 权威数据与派生状态

| 层次 | 候选中的权威性/生命周期 |
| --- | --- |
| 项目 KB 与 `brick_model.ttl` | 项目用户文件；只有完整性声明与可解析设备事实组合后，缺失才是权威证据。最小 parser 只识别受限 Turtle 子集。 |
| BMS point catalog/readings | 外部系统权威数据；候选只读取目录、对象引用、单位和历史覆盖，不拥有原始时序。 |
| 点位候选与置信度 | 可重建的派生索引/判断；数据、规则或 ranking 改变后应重新生成。 |
| deployability check | 候选项目 store 中的缓存授权证据；受 algorithm version、policy version、project data signature、inventory signature 和时效约束。 |
| selected mapping | 检查快照的一部分；只能在同一项目、设备集合和规则版本语境内解释。 |

这些字段是未合并候选 store 的设计，不是产品 `main` 的 `apps/data/store.json` schema。`projectDataSignature` 和 inventory SHA-256 用于发现输入证据变化，不证明语义模型正确，也不代替保留具体 evidence source。

## 6. 权限与项目隔离

候选路由先认证 session，再对 URL 中的 `projectId` 调用 project membership guard。候选 checks、library check runs、tasks 和映射按项目分组，`FddDeployabilityCheck.projectId` 也随结果持久化。全局 builtin/community 规则只共享规格；项目 point name、object ref、设备清单、历史证据、阈值和检查签名不得进入全局目录。

服务端必须从已授权 project 解析 KB 根目录和 BMS access，不能接受客户端提交的另一个 project mapping，也不能仅凭 algorithm id 或 task id 查到跨项目对象。候选 membership guard 只证明“成员边界”的探索，没有定义细粒度的 FDD read/test/deploy/override permissions；若产品化，应单独设计这些权限，并为批量部署要求更高权限和审计记录。

Agent/LLM 可以帮助产生检索词或显示理由，但最终候选、拒绝项、历史证据和三态必须落在当前 project 的结构化 check 中。任何跨项目 memory、KB 文本、BMS 凭据或点位证据都不能送入该判断。

## 7. 错误、降级及外部依赖

| 条件 | 候选降级结果 | 原因 |
| --- | --- | --- |
| 权威清单明确没有目标设备 | `cannot_deploy`，`applicability: no_equipment`，不查询点位目录。 | 没有适用实体，继续搜索会制造假匹配。 |
| 设备清单不完整或 Brick 证据缺失 | `cannot_deploy`，`applicability: unknown`，保留证据问题。 | “没看到”不能被当成权威不存在。 |
| required slot 无候选 | `cannot_deploy` + `missingPoints`。 | evaluator 缺输入。 |
| 历史未知/不足或 readings 调用失败 | `cannot_deploy` + `historyIssues`。 | 无法证明检测窗口可计算。 |
| 最佳置信度低于候选阈值、近邻难分或单位未知 | `uncertain` + `ambiguousInputs`。 | 需要人工确认，不能自动授权。 |
| 单位维度不兼容 | 候选进入 `rejectedCandidates`。 | 不做隐式转换或猜测。 |
| 一个 fleet 实体缺 counterpart、slot 重复映射或状态非 `can_deploy` | 全量部署被阻断。 | fleet 授权必须完整且点位角色互异。 |
| 算法/策略/项目数据/清单签名变化或检查过期 | 重新检查；旧缓存不授权。 | 旧证据不再描述当前输入。 |

外部依赖包括项目 KB 文件、受限 Brick Turtle 数据、BMS point catalog 和 readings 服务。它们不可用时应保留 `unknown`、`uncertain` 或 `cannot_deploy`，而不是回退到 `can_deploy`。LLM 不可用只应影响深度推理/说明，不应改变确定性 core 的结果。

## 8. 扩展方法

新增设备类型、点位角色或语义来源时，按以下顺序扩展候选设计：

1. 在规则规格中增加稳定 slot、quantity kind、单位角色、可接受单位、source symbol/Brick class 和历史要求；不要把站点 point id 写进全局规则。
2. 为项目 inventory parser 增加最小且可测试的 Brick class → equipment/point role 映射。若需要完整 RDF 推理，应引入明确的 Brick/RDF 组件，不能悄悄扩张正则 parser 的承诺。
3. 让 candidate generator 保留每个证据源、维度判断、拒绝理由和设备归属；ranking 必须确定、可复现，并有同名/近邻/错误角色反例。
4. 单位换算需要显式 conversion id、方向、比例/偏移、源/目标单位和数值测试；在此之前保持 mismatch/unknown，不能用 `convertible` 绕过计算。
5. 改变 `can_deploy` 所需证据时提升 policy version，并使旧 cache 和运行实例进入重新授权流程。
6. 新的 fleet 模板必须先证明设备族同构，再逐实体验证完整、唯一、互异的 required-slot 映射；任一实体失败都应原子阻断 Deploy All。
7. 为每个新外部 adapter 补充 timeout、no-data、分页、单位缺失和历史边界测试，并保持 project id 贯穿读取、签名和持久化。

把候选移植到产品时，应通过独立 issue 重新设计 REST/type/store 契约，并把确定性结果适配到产品现有 `FaultEvidenceTool` 消费端口；不得直接把长期候选 `server.ts` 当作已批准实现。

## 9. 对应测试

产品 `main@af44ff15` 没有可部署性测试，因为没有这一 producer。产品可回归的只是报告侧外部事实消费：[evidenceExecutor.test.ts](../../../../apps/api/src/reports/evidenceExecutor.test.ts) 验证 `fdd_rule` tool outcome、范围和 evidence 一致性；它不验证 Brick 映射。

候选证据应在含相应 commit 的干净 worktree 中运行：

- [`fddLibrary.test.ts` at `71c2cb6d…`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fddLibrary.test.ts)：三态、缺点位、未验证历史、近邻角色排序、目录/runtime 对齐。
- [`equipmentEvidence.test.ts` at `6c7936e0…`](https://github.com/LiMingchen159/BuildingAgent/blob/6c7936e01a249a134b758c02f6454d67f961ec23/apps/api/src/fdd/equipmentEvidence.test.ts)：完整清单 marker、最小 Brick 事实、单位别名和 inventory signature。
- [`bms.test.ts` at `6c7936e0…`](https://github.com/LiMingchen159/BuildingAgent/blob/6c7936e01a249a134b758c02f6454d67f961ec23/apps/api/src/bms.test.ts)：equipment-first applicability、BMS 候选/历史证据、旧策略和签名重验证。
- [`fddHomogeneousFleet.test.ts` at `bef810af…`](https://github.com/LiMingchen159/BuildingAgent/blob/bef810af291665bcaaf1b8b3bda185bdb663a19b/apps/api/src/fddHomogeneousFleet.test.ts)：八台冷机完整模板、缺一台 counterpart 时阻断、噪声高置信候选不覆盖同族映射、原子部署。
- [`fddHomogeneousFleet.test.ts` at `c27a3af2…`](https://github.com/LiMingchen159/BuildingAgent/blob/c27a3af2dca6b04fe731b6fc11f83e9608f10943/apps/api/src/fddHomogeneousFleet.test.ts)：后续 fleet contract 特征测试。

M011 前置分析记录的 52 项 FDD 定向通过结果属于候选工作线，不是 `main` 的产品测试数。命令、环境和最终回归结果统一见[测试与验证](../development/testing.md)。

## 10. 已知限制及关联文档

- 产品 `main` 没有本页所述 producer、Brick matcher、deployability store/API 或 fleet deployment；唯一现行边界是 Reports 消费外部 `fdd_rule` 事实。
- 候选最小 Turtle parser 只识别 prefixed subject、`a brick:Class`、label、`brick:isPointOf` 和单位提示的受限子集，不验证完整 RDF 图。
- 来源规则的 Brick class、项目 Brick fact、BMS description 和点名均可能不完整或错误；置信度是排序启发式，不是统计校准概率。
- `6c7936e0…` 规范化单位别名但不做换算；`convertible` 类型的存在不构成转换实现。
- `bef810af…` 的 homogeneous template 明确针对多冷机场景；不能外推到泵、AHU、FCU、冷却塔或 VAV，也不能假定所有同类设备必然同构。
- 候选路由只有 membership 型边界，细粒度 FDD 操作权限、审计、并发冲突和生产级回滚仍需设计。
- 不同候选策略版本说明契约仍在演进；固定 commit 测试通过不代表现场 commissioning、检测准确率或产品支持承诺。

继续阅读 [Runtime 与物化](runtime-materialization.md)、[验证与样本溯源](verification-provenance.md)、[BMS 集成](../features/bms-integration.md)、[运行时与存储拓扑](../architecture/runtime-storage.md)和 [API 事件契约](../architecture/api-events.md)。
