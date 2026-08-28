# FDD 总览

[English](../../en/fdd/overview.md) | [开发者文档首页](../README.md) | [规则模型与来源](rule-model-sources.md) | [Runtime 与物化](runtime-materialization.md)

> 产品代码基线：`main@af44ff15`。状态：**部分实现**，但仅限 Reports 中的 `fdd_rule` 证据消费契约；该基线没有 `apps/api/src/fdd/**`、FDD 算法目录、evaluator 或 FDD 路由。本文另列出的 M007 内容来自未合并候选提交，不能当作 `main` API、已发布功能或产品保证。

## 1. 状态与代码基线

阅读 FDD 文档时必须同时保留两条基线，不能把候选分支的截图、数量或类型投射到产品 `main`。

| 基线 | 状态 | 可以据此声称的事实 | 不能据此声称的事实 |
| --- | --- | --- | --- |
| 产品 `main@af44ff15` | **部分实现** | Reports 能注册 `producerKind: "fdd_rule"` 的故障证据定义，调用注入的 fault evidence tool，校验其结果并生成报告范围内的 `FaultEvent`；报告分析严格区分检测与诊断。 | 仓库内存在 FDD 检测器、算法库、部署检查、项目 FDD Task、FDD REST API 或 Web FDD 工作区。 |
| M007 候选提交 | **候选 / 未合并** | `d8eeb1fb…` 引入项目域算法模型与 evaluator；`71c2cb6d…` 扩展分类目录、DOCX 溯源和 runtime registry；后续 M007 提交继续探索设备证据与同构设备部署。 | 这些接口已在 `main` 上发布、数量长期稳定、现场部署已经验证，或候选分支与当前产品存储/API 兼容。 |

候选提交 `71c2cb6d…` 的目录快照计数如下。这里的“可执行”只表示算法 key 同时登记在候选 runtime registry 并带有 evaluator；不表示已经合入产品、已接入现场数据或取得诊断准确率。

| 设备类型 | 候选目录条目 | 候选可执行 runtime | 其中 DOCX 导入且仅有规格 |
| --- | ---: | ---: | ---: |
| AHU | 72 | 0 | 44 |
| Chiller | 56 | 56 | 0 |
| Cooling tower | 12 | 0 | 12 |
| FCU | 20 | 0 | 20 |
| Pump | 18 | 0 | 18 |
| Sensor | 3 | 3 | 0 |
| VAV | 17 | 0 | 17 |
| **合计** | **198** | **59** | **111** |

因此，候选目录中的 198 条不等于 198 个可运行检测器：只有 56 条冷机和 3 条传感器规则进入候选 runtime registry。111 条 DOCX 导入项是不可执行规格目录；另外 28 条 AHU builtin 也没有候选 runtime，故候选快照中共有 139 条不可执行项。111 不是 `198 - 59` 的另一种写法。

## 2. 功能目的及边界

FDD 在产品语境中覆盖“故障检测与诊断”，但代码责任必须拆开：

- **检测（detection）**：确定性规则或可审计模型只根据版本化定义、映射后的点位和限定时段数据产出故障事实。检测器负责 fault code、起止时间、状态和证据引用。
- **诊断（diagnosis）**：B-Agent 只能对已经提供的故障事实提出明确带不确定性的解释或排查假设。它不得新增检测、改变 fault code、计算事实或确认根因。

四个经常被混用的层次也必须分开：

1. **目录 / 规格**描述算法身份、适用设备、所需点位、参数、公式、版本和来源。存在一张算法卡片不等于代码可以执行它。
2. **可部署性**检查项目中是否存在可信的设备与点位映射、单位、历史覆盖和设备集合证据。`can_deploy` 只表示输入准备度，不证明算法正确，也不表示任务正在运行。
3. **Runtime** 是与算法 key 精确对应的 evaluator。只有目录元数据、没有注册 evaluator 的规则必须保持不可执行。
4. **物化**把确定性运行结果写成可消费的项目结果、派生指标或报告 `FaultEvent`，并保留定义版本和输入证据。物化不应重新检测或补造缺失事实。

产品基线只实现了第四层中“报告消费外部 fault tool 事实”的一段：它不是通用 FDD runtime。候选 M007 才提出前三层以及项目任务物化的组合实现。

## 3. 用户入口和关键源码入口

产品 `main` 没有 FDD 专用用户入口或 `/api/fdd/**` 路由。当前可核对入口全部位于 Reports 责任域：

- fault definition 与 `fdd_rule` producer 契约：[evidenceDefinitions.ts](../../../../apps/api/src/reports/evidenceDefinitions.ts)
- 可注入的 fault evidence tool 输入/输出边界：[evidenceTools.ts](../../../../apps/api/src/reports/evidenceTools.ts)
- fault fact 校验及报告 `FaultEvent` 生成：[evidenceExecutor.ts](../../../../apps/api/src/reports/evidenceExecutor.ts)
- `FaultEvent`、evidence package 与 report block 类型：[contracts.ts](../../../../apps/api/src/reports/contracts.ts)
- 检测/诊断边界与 grounded analysis 校验：[analysisExecutor.ts](../../../../apps/api/src/reports/analysisExecutor.ts)、[analysisPrompt.ts](../../../../apps/api/src/reports/analysisPrompt.ts)

以下链接固定到不可变候选提交，便于研究候选设计，但不是 `main` 源码链接：

- 项目算法、Task 和 deployability 模型：[M007 `library.ts` at `d8eeb1fb…`](https://github.com/LiMingchen159/BuildingAgent/blob/d8eeb1fb5541f08267e66c492e4a8b39bacf8de2/apps/api/src/fdd/library.ts)
- 确定性 evaluator：[M007 `evaluator.ts` at `d8eeb1fb…`](https://github.com/LiMingchen159/BuildingAgent/blob/d8eeb1fb5541f08267e66c492e4a8b39bacf8de2/apps/api/src/fdd/evaluator.ts)
- 111 条导入目录及转换逻辑：[M007 catalog](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/importedEquipmentCatalog.ts)、[M007 library adapter](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/importedEquipmentLibrary.ts)
- evaluator 白名单：[M007 `runtimeRegistry.ts` at `71c2cb6d…`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/runtimeRegistry.ts)
- 设备清单证据探索：[M007 `equipmentEvidence.ts` at `6c7936e0…`](https://github.com/LiMingchen159/BuildingAgent/blob/6c7936e01a249a134b758c02f6454d67f961ec23/apps/api/src/fdd/equipmentEvidence.ts)
- 同构设备约束测试：[M007 `fddHomogeneousFleet.test.ts` at `bef810af…`](https://github.com/LiMingchen159/BuildingAgent/blob/bef810af291665bcaaf1b8b3bda185bdb663a19b/apps/api/src/fddHomogeneousFleet.test.ts)

## 4. 正常数据流

### 4.1 产品 `main` 的实际报告消费流

1. 报告定义 registry 为某类设备声明版本化 fault definition，其中每个 fault code 绑定 severity、detector id 和 detector version。
2. 报告执行器把项目、设备、时段、计划请求和定义交给注入的 `FaultEvidenceTool`。该接口是**消费者端口**；`main` 没有提供实现检测算法的 FDD adapter。
3. tool 返回 `complete`、`no_data` 或 `error` outcome。完成结果仍需通过项目、设备、时段、definition、fault code、时间区间和 typed evidence 的一致性校验。
4. 通过校验的事实被确定性地转换为稳定 `FaultEvent` 并加入 evidence package。无数据或错误执行不得持有 fault event。
5. 只有这些已检测事件才能进入报告分析。分析器把“诊断”限制为对 supplied fault evidence 的不确定假设，并拒绝跨越检测/诊断边界的文本。

这个流程证明的是“报告可安全消费一个外部 FDD producer”，不是“产品已经拥有 producer”。

### 4.2 M007 候选流

候选设计把流程扩展为：版本化目录 → 项目/设备证据 → 点位候选与可部署性检查 → 项目 Task 快照 → registry 对齐的 evaluator → 结果物化。后续同构设备探索要求先证明设备集合和模板适用性，再批量部署；不能只在一个样例设备上匹配点位后推断整个 fleet 可运行。

该候选流只用于解释设计方向。任何合并实现都需要重新对齐最新 `main` 的权限、存储、报告 tool adapter 和 API 契约，不能把候选 `server.ts` 路由复制成现行接口文档。

## 5. 数据、状态及持久化

| 数据/状态 | 产品 `main@af44ff15` | M007 候选 |
| --- | --- | --- |
| Fault definition | 作为报告执行依赖传入的版本化 registry；不是持久化 FDD 算法目录。 | 候选 global builtin/community 算法卡片包含公式、点位、参数、版本与来源。 |
| 原始时序和设备语义 | 由注入 tool 自行读取；报告契约只接收结果和 typed evidence。 | 候选 deployability/evaluator 设想读取项目 BMS、语义和历史证据。 |
| FDD Task / check run | 不存在对应产品模型或 store 字段。 | 候选 `SeedStore` 增加按项目 Task、检查结果、算法 snapshot 等状态。 |
| 检测结果 | 报告范围内的 `FaultEvent` 存在于 evidence package，并随 definition/tool provenance 被消费。 | 候选 evaluator 结果可进一步物化为项目结果或派生指标；具体语义随候选提交演进。 |
| DOCX 来源 | 产品不存放本里程碑附件，也没有这 111 条目录。 | 候选把来源文件名、SHA-256、原始公式/Brick 类和审查状态固化为代码生成目录。 |

报告 `FaultEvent` 是一次报告证据包中的类型化事实，不应被描述成长期 FDD 告警数据库。反过来，候选 Task snapshot 也不能在未合并前被描述成 `apps/data/store.json` 的产品 schema。真实 BMS 历史和现场设备仍是外部权威数据。

## 6. 权限与项目隔离

产品基线没有可单独授权的 FDD REST surface。报告上游负责鉴权和项目选择；evidence executor 进一步要求 tool 输出的 `projectId`、设备、时段和 definition 与当前报告 context 完全一致。这是数据一致性防线，不替代路由层 membership/permission 检查。

候选模型把 Task、检查运行和点位映射绑定 `projectId`，候选路由也以所选项目为边界。但这些未合并 guard 不能当成产品权限保证。若将候选能力产品化，至少应分别定义：算法目录读取、项目部署配置、运行/暂停、结果读取和跨项目分享权限；所有 id 查询都必须先解析 owner project 再校验 membership，且不得把 BMS 凭据、私有点位或别的项目 evidence 送入 Agent。

## 7. 错误、降级及外部依赖

- 产品 fault tool 可显式返回 `no_data` 或 `error`。报告保留执行状态和 data quality，不把无数据降级成“未发现故障”。
- tool 输出中的项目、definition、设备、时段、fault code、RFC3339 时间或 typed evidence 不匹配时，产品执行器拒绝结果；它不会尝试让 LLM 修复事实。
- 没有已检测 fault event 时，报告诊断不会运行。证据覆盖不完整会被渲染为覆盖警告，而不是正常结论。
- 在候选实现中，目录规格即使标成 `implementation_ready`，若没有 runtime registry/evaluator 仍不可执行；缺点位、单位不兼容、历史不足或 fleet 证据不一致也应阻断或降级部署。
- BMS/collector、现场语义、外部 detector 和 LLM provider 都可能不可用。只有 detector 是检测事实的生产者；LLM 故障不能改变确定性检测结果。
- 候选计数和测试反映固定 commit，不是未来 catalog、准确率、覆盖率或现场节能效果保证。

## 8. 扩展方法

在产品 `main` 上新增 FDD 能力时，先实现一个满足 `FaultEvidenceTool` 的确定性、只读 adapter，并为每个 definition 固定 detector id/version、输入 evidence 和 no-data/error 语义。然后再决定是否引入候选目录与项目 Task 模型。不要从 Web 页面直接调用未合并的 M007 路由，也不要让 Agent 自由文本承担检测。

引入一条新规则至少需要：可追溯的规格；规范化 required points 与单位；显式参数及默认值来源；可复现 evaluator；与 runtime registry 的一一对应；项目/设备/时段隔离；正例、反例、边界、缺数据和错误测试；结果 provenance；以及报告 adapter。仅增加 catalog JSON 或把 `deployableRuntime` 设为 true 都不够。

若复用候选代码，应从最新 `main` 新建独立 issue/branch，逐层移植并重新验证，而不是合并整个长期候选分支。任何新的 REST、SSE、WebSocket、存储或 TypeScript contract 都超出 M011 文档里程碑，需单独设计和审批。

## 9. 对应测试

产品基线对 FDD 的可重复门禁是 Reports 的消费契约测试，而不是不存在的 `apps/api/src/fdd` 测试：

- fault tool outcome、严格校验、no-data/error 和 evidence package：[evidenceExecutor.test.ts](../../../../apps/api/src/reports/evidenceExecutor.test.ts)
- 检测/诊断边界、引用限制和 analysis failure：[analysisExecutor.test.ts](../../../../apps/api/src/reports/analysisExecutor.test.ts)
- fault types、报告 assembly 和渲染：[contracts.test.ts](../../../../apps/api/src/reports/contracts.test.ts)、[reportAssembler.test.ts](../../../../apps/api/src/reports/reportAssembler.test.ts)、[latexRenderer.test.ts](../../../../apps/api/src/reports/latexRenderer.test.ts)

候选测试必须在包含相应 commit 的干净 worktree 运行，不能在 `main@af44ff15` 上把“测试文件不存在”解释为跳过成功。候选目录/evaluator 的固定参考是 [M007 `fddLibrary.test.ts` at `71c2cb6d…`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fddLibrary.test.ts) 和 [M007 `evaluator.test.ts` at `71c2cb6d…`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/evaluator.test.ts)。历史上在候选工作树执行的定向结果只能作为该候选快照证据，不能转写为产品 `main` 的 FDD 通过数。

## 10. 已知限制及关联文档

- 产品 `main` 当前没有 FDD catalog/evaluator/deployability/Task/materialization API 或专用 Web surface；只有报告证据消费者契约。
- 候选 `198 / 59 / 111` 是 `71c2cb6d…` 快照事实，不是现行产品 API 返回值或发布承诺。
- 候选 DOCX 的 `implementation_ready / requires_configuration / requires_review` 描述规格整理状态；它不同于 deployability 的 `can_deploy / uncertain / cannot_deploy`，也不同于 Task 运行状态。
- “可执行 runtime”只说明存在候选 evaluator，不代表 Brick 映射、项目数据、现场 commissioning、准确率或安全审批已经满足。
- 文档样本中的验证比率只能作为来源案例，不能写成 BuildingAgent 产品保证；附件也不复制进仓库。

继续阅读[规则模型与来源](rule-model-sources.md)、[Brick 映射及可部署性](brick-deployability.md)、[Runtime 与物化](runtime-materialization.md)和[验证与样本溯源](verification-provenance.md)。报告侧契约详见 [Dashboards 与 Reports](../features/dashboards-reports.md)，BMS 外部边界详见 [BMS 集成](../features/bms-integration.md)。
