# 验证和样本溯源

[English](../../en/fdd/verification-provenance.md) | [开发者文档首页](../README.md) | [FDD 总览](overview.md) | [Runtime 与物化](runtime-materialization.md)

> 产品代码基线：`main@af44ff15`。状态：**部分实现**，且仅限 Reports 对外部 `fdd_rule` 事实的消费与验证；该基线没有 FDD producer、算法目录、deployability、Task 或专用 FDD 测试目录。M007 链接均固定到未合并候选提交，只能证明相应候选快照。附件是**外部来源**，不复制进仓库，也不是产品验收证书。

## 1. 状态与代码基线

FDD 的“验证通过”必须说明验证对象、提交、数据和判定标准。下列层次不能用同一个通过标记替代：

| 验证对象 | 本页基线与状态 | 能证明什么 | 不能证明什么 |
| --- | --- | --- | --- |
| 产品 Reports 消费契约 | `main@af44ff15`，**部分实现** | 外部 fault tool 的结果会按项目、设备、时段、definition、fault code、时间和 typed evidence 校验；检测与 LLM 诊断保持分离。 | 产品内存在 FDD evaluator，或现场检测准确。 |
| M007 catalog / registry | `71c2cb6d…`，**候选 / 未合并** | 固定快照的目录唯一性、来源字段、`deployableRuntime` 与 evaluator registry 对齐。 | 目录项在某项目可部署，或候选 API 已发布。 |
| M007 deployability / fleet | `6c7936e…`、`bef810af…`，**候选 / 未合并** | 固定 fixture 下的设备清单、点位、单位、历史和同构设备约束。 | 任意现场的 Brick 模型、点位质量或整批设备均满足约束。 |
| 历史数据回放 | 候选测试或附件案例 | 给定版本、映射、参数和时段时，规则如何触发。 | 触发就是物理根因、规则无误报，或将来数据会有相同结果。 |
| FDD 样本 DOCX | **外部案例** | 一份约 31 页来源包含 51 条冷机规则、Brick 映射、参数、WKGO 历史验证和 24 条参考文献。 | BuildingAgent 的产品能力、准确率、覆盖率、节能量或 SLA。 |

这里的 catalog consistency、evaluator correctness、deployment readiness、historical replay 和现场 commissioning 是五种不同证据。只有在记录中明确列出哪几层已经完成，审查者才能解释“已验证”。

## 2. 功能目的及边界

本页提供一条可审计的验证链：来源完整性 → 目录/registry 一致性 → evaluator 确定性 → 项目可部署性 → 物化与历史回放 → 报告消费。它的目的不是用单个测试数或案例百分比给整个 FDD 能力背书。

候选验证至少分为以下层次：

1. **规格与来源**：算法 key、版本、required points、参数、公式、Brick class 和来源摘要可追踪，生成目录没有静默丢字段。
2. **Catalog / registry consistency**：id/key 唯一；只有登记了确定性 evaluator 的 key 才能声明候选 runtime；spec-only 条目始终不可执行。
3. **规则单元验证**：正例、反例、阈值边界、持续窗口、恢复、缺数据、无效单位和时间排序均得到确定性结果。
4. **部署证据**：完整设备清单、点位父子关系、语义、工程单位、历史覆盖和歧义候选均进入判定；单台样例不能替代 fleet 证据。
5. **历史物化**：固定输入窗口按固定版本重放，记录映射、参数、采样/对齐策略、watermark、latch 和输出来源；重复执行应可解释且尽可能幂等。
6. **归因与报告**：物化结果可以关联其输入证据，但“规则触发”只能归因到规则条件成立。物理根因仍需现场检查；LLM 只能给出带不确定性的诊断假设。

附件把 51 条规则按 WKGO 条件分成 `Unsupported`、`Deployable + No trigger`、`Deployable + Triggered` 三类。这是案例中“数据可用性 × 历史触发”的概念分类，**不是**候选代码的 API enum，也不与候选定义状态、`can_deploy / uncertain / cannot_deploy` 或 Task 状态一一对应。迁移时必须分别保存“能否运行”和“观察期内是否触发”，不能强制转换成一个状态字段。

## 3. 用户入口和关键源码入口

产品 `main` 没有 FDD 验证页面或 `/api/fdd/**`。现行可核对入口是 Reports 的消费者边界：

- fault definition 和 `fdd_rule` producer 描述：[evidenceDefinitions.ts](../../../../apps/api/src/reports/evidenceDefinitions.ts)
- 外部 fault tool 的输入、结果与 descriptor：[evidenceTools.ts](../../../../apps/api/src/reports/evidenceTools.ts)
- 严格结果校验、执行记录和 `FaultEvent` 组装：[evidenceExecutor.ts](../../../../apps/api/src/reports/evidenceExecutor.ts)
- 检测/诊断边界及 grounded analysis 校验：[analysisExecutor.ts](../../../../apps/api/src/reports/analysisExecutor.ts)

候选源码和测试必须使用不可变链接；下表不代表这些文件存在于产品 `main`：

| 候选关注点 | 固定源码 / 测试 |
| --- | --- |
| 目录、deployability 类型和 policy | [`library.ts` @ `71c2cb6d…`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/library.ts)、[`fddLibrary.test.ts` @ `71c2cb6d…`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fddLibrary.test.ts) |
| evaluator / registry 对齐 | [`runtimeRegistry.ts` @ `71c2cb6d…`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/runtimeRegistry.ts)、[`evaluator.test.ts` @ `71c2cb6d…`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/evaluator.test.ts) |
| 来源英文、符号和 Brick 保真 | [`importedEquipmentEnglish.test.ts` @ `6c7936e…`](https://github.com/LiMingchen159/BuildingAgent/blob/6c7936e01a249a134b758c02f6454d67f961ec23/apps/api/src/fdd/importedEquipmentEnglish.test.ts) |
| 设备清单、单位和 evidence signature | [`equipmentEvidence.ts` @ `6c7936e…`](https://github.com/LiMingchen159/BuildingAgent/blob/6c7936e01a249a134b758c02f6454d67f961ec23/apps/api/src/fdd/equipmentEvidence.ts)、[`equipmentEvidence.test.ts` @ `6c7936e…`](https://github.com/LiMingchen159/BuildingAgent/blob/6c7936e01a249a134b758c02f6454d67f961ec23/apps/api/src/fdd/equipmentEvidence.test.ts) |
| 同构 fleet、原子部署和历史状态 | [`fddHomogeneousFleet.test.ts` @ `bef810af…`](https://github.com/LiMingchen159/BuildingAgent/blob/bef810af291665bcaaf1b8b3bda185bdb663a19b/apps/api/src/fddHomogeneousFleet.test.ts) |

## 4. 正常数据流

一次可审查验证应按下面的顺序运行并保存证据，而不是从最终 dashboard 截图反推规则正确：

1. 固定完整 commit SHA、lockfile、运行环境、算法定义版本和输入 fixture 哈希。附件或人工摘录先做 SHA-256 完整性检查；hash 只确认字节身份，不确认内容正确。
2. 运行 catalog 检查：数量、id/key 唯一性、来源字段、required point/Brick class、参数解析状态，以及 `deployableRuntime` 与 registry 的精确集合一致性。
3. 对每个 registered evaluator 运行正/反例和边界样本；校验排序、窗口、单位、缺失值、恢复和确定性。没有 evaluator 的 spec-only 定义不得进入这一步。
4. 用目标项目证据运行 deployability：区分权威完整 inventory 与局部导出，保留所有候选、拒绝原因、单位/历史问题、evidence signature 和 policy version。fleet 部署要求每个目标实体都有完整且同构的 counterpart。
5. 在冻结的历史区间物化；记录 source revision、时区、采样周期、对齐容差、参数、mapping、watermark/latch 和每个结果的 evidence reference。重新运行不得悄悄改变旧结果。
6. 将检测事实交给现行 Reports 消费契约。`main` 会拒绝项目、设备、时段、definition、fault code 或 typed evidence 不一致的结果；`no_data` 和 `error` 不能伪装成“无故障”。
7. 最后才进行人工/专家审查和诊断。触发次数、持续时长和占比是观察结果；任何根因和维修建议必须保留不确定性及现场核查项。

## 5. 数据、状态及持久化

验证记录应能独立回答“对什么、用什么、何时、得到什么”，至少保存以下不可变或版本化字段：

| 类别 | 应记录内容 | 解释边界 |
| --- | --- | --- |
| 代码与定义 | 完整 commit SHA、algorithm key/version、registry/policy version、参数及来源 | 分支名和 `latest` 不可复现；定义状态不等于部署状态。 |
| 输入证据 | project/equipment、点位映射、Brick class、单位、数据源 revision、时间范围/时区、采样与覆盖、fixture hash | 原始 BMS 与语义模型仍由外部系统权威管理。 |
| 执行状态 | check id、候选/拒绝项、missing/ambiguous/history issues、Task snapshot、watermark/latch | 候选字段不是产品 `main` schema。 |
| 输出 | 正常/故障/无数据/错误、区间、计数、持续时长、typed evidence、结果 hash | 触发是规则输出，不是已确认根因。 |
| 审查 | 命令、工具版本、通过/失败/跳过、日志位置、审查人、时间和已知偏差 | 只报“52 passed”不足以重现验证。 |

### 外部附件登记

| 来源 | SHA-256 | 本页采用的摘要 | 仓库策略 |
| --- | --- | --- | --- |
| `FDD样本(1).docx` | `f9f5854e1c8270d19ed4e61d15aec65ffba8614bfc38865e8b41d5a46eb1ec35` | 约 31 页；51 条冷机规则；Brick 映射、参数、WKGO 部署/历史验证；24 条参考文献。 | 不复制附件，不迁移 51 条正文或完整参考文献；只保留摘要和 hash。 |
| 手绘目标架构图 | `89f2be1d159a11406c93ed11b4b49b808210b4f33ff6d1ba234c416fcb2a0781` | 目标架构四层关系的来源；与规则验证无直接证明关系。 | 不复制原图；可编辑重绘见[目标架构](../architecture/target-architecture.md)。 |

附件声明 WKGO 在当时数据条件下 51 条规则中 25 条可部署、26 条因必要输入不足不可执行，即 `25 / 51 = 49.02%`。该数字只属于该项目、该时间和该判定方法；它不是 BuildingAgent 的通用覆盖率、验收阈值或产品保证。附件内 24 条参考文献的存在也不等于本里程碑逐条核验或授权转载了这些文献。

## 6. 权限与项目隔离

- 历史 BMS 数据、点位名称、设备关系、告警和运维结论都可能是敏感项目数据。验证 runner 必须在已授权项目上下文读取，输出也必须绑定同一 `projectId`；不得为了比较而把不同租户 fixture 合并。
- 产品 Reports 的项目/设备/时段匹配是额外一致性校验，不替代路由层鉴权、membership 和操作权限。候选路由或测试 token 不是产品授权证明。
- 外部附件只记录显示名、摘要和 SHA-256，不提交原文件、临时解压内容、本机附件路径、作者元数据或嵌入凭据。需要共享原件时应走项目批准的文档渠道。
- 现场历史用于回放前应最小化、脱敏并限定保存期。日志不得包含 Bearer token、BMS 密码、私有 collector 地址或整段原始时序；失败 fixture 也遵守相同规则。
- 人工标注和 Ground Truth 必须记录来源、审查者角色、日期和冲突处理。LLM 生成的判断不能作为未复核 Ground Truth，也不能跨项目进入 memory 或报告。

## 7. 错误、降级及外部依赖

- 来源文件 hash 不匹配、commit 不存在、lockfile 改变或 fixture 不完整时，结果应标为不可复现，而不是沿用旧的“通过”。
- 设备 inventory 没有明确的完整性证据时，“未找到设备/点位”不是权威缺失结论；单位未知、不可转换，历史覆盖未验证或候选接近时，应阻断或降为 uncertain。
- Catalog/registry 不一致必须失败关闭：有 runtime 标志而无 evaluator 不能退回通用公式或 LLM；有 evaluator 而无可追踪目录也不能发布。
- 历史源断连、时间戳/时区异常、采样间隔变化、重复或迟到数据会改变窗口、latch 和占比。应保留 `no_data`/错误和 coverage，不以零值补成正常。
- 物化失败不得留下半个 fleet 的“成功”结果；重试必须从已记录的 watermark 和版本判断是否安全。候选测试只能描述固定实现，不能替代产品事务保证。
- 专家复核、Brick/BMS、collector 及外部 fault producer 都是外部依赖。依赖不可用时仍可完成静态目录检查，但不能声称 deployability、历史表现或现场验证完成。

## 8. 扩展方法

新增规则或新设备库时，先建立验证矩阵，再扩展实现：每个规格行至少对应来源/hash、required-point/Brick 校验、registry 决策、evaluator 正反/边界样本、缺数据/单位/历史测试、单设备与 fleet 证据、物化 lineage、报告消费及人工复核。测试 fixture 应小而去标识化，并明确它是合成、公开还是现场摘录。

可复现审查清单：

- 从完整 SHA 创建 detached、干净 worktree；确认 `git status --short` 为空，不混用另一个 M007 提交的源码或测试。
- 记录 Node、npm、Vitest、操作系统、时区和 lockfile hash；按 lockfile 安装，显式列出测试文件和所有非秘密环境开关。
- 校验附件/fixture hash，记录输入时段、采样规则、单位、mapping、参数、policy/registry 版本和外部服务 stub；真实凭据只通过秘密管理注入且不进入日志。
- 同时保存通过、失败、跳过和 warning；重跑确定性测试并比较结构化输出或 hash，而非比较容易变化的截图。
- 对历史触发抽样回溯原始 evidence，区分数据质量、运行工况、阈值敏感性和可能设备故障；记录专家不同意见。
- 确认结果没有跨项目引用、附件没有进入 Git、报告没有把诊断文字升级为检测事实；由独立审查者签署适用范围和未验证项。

任何把候选能力产品化的工作都应从最新 `main` 独立移植，并重新运行以上矩阵。新增 API、schema、CI 或 runtime 不属于 M011 文档里程碑。

## 9. 对应测试

产品 `main@af44ff15` 没有 FDD catalog/evaluator/deployability/Task 的专用测试文件。它具有的是 Reports 消费外部 fault evidence 的测试：

- outcome、严格字段校验、`no_data`/`error`、execution provenance 与 evidence package：[evidenceExecutor.test.ts](../../../../apps/api/src/reports/evidenceExecutor.test.ts)
- 检测/诊断分离、引用约束、prompt injection 数据边界与分析失败：[analysisExecutor.test.ts](../../../../apps/api/src/reports/analysisExecutor.test.ts)
- 类型、assembly 和渲染回归：[contracts.test.ts](../../../../apps/api/src/reports/contracts.test.ts)、[reportAssembler.test.ts](../../../../apps/api/src/reports/reportAssembler.test.ts)、[latexRenderer.test.ts](../../../../apps/api/src/reports/latexRenderer.test.ts)

M011 前置分析曾在候选工作线上运行六个 FDD 定向测试文件，得到 **52 项全部通过**。这是历史候选门禁，不是 `main@af44ff15` 的测试结果，也不能只凭该数字复现。固定候选测试证据包括：

- 目录、来源、状态和 registry 一致性：[`fddLibrary.test.ts` @ `71c2cb6d…`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fddLibrary.test.ts)
- 规则 evaluator：[`evaluator.test.ts` @ `71c2cb6d…`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/evaluator.test.ts)
- 设备/单位 evidence：[`equipmentEvidence.test.ts` @ `6c7936e…`](https://github.com/LiMingchen159/BuildingAgent/blob/6c7936e01a249a134b758c02f6454d67f961ec23/apps/api/src/fdd/equipmentEvidence.test.ts)
- 英文来源保真：[`importedEquipmentEnglish.test.ts` @ `6c7936e…`](https://github.com/LiMingchen159/BuildingAgent/blob/6c7936e01a249a134b758c02f6454d67f961ec23/apps/api/src/fdd/importedEquipmentEnglish.test.ts)
- 同构 fleet、物化状态和原子性：[`fddHomogeneousFleet.test.ts` @ `bef810af…`](https://github.com/LiMingchen159/BuildingAgent/blob/bef810af291665bcaaf1b8b3bda185bdb663a19b/apps/api/src/fddHomogeneousFleet.test.ts)

重新验证时应选择一个包含所需文件的**单一完整 SHA**，再报告该快照实际收集和通过的测试数；不得把上述不同提交的文件拼成一个虚构的 52 项套件。最终产品回归命令和环境规则见[测试与验证](../development/testing.md)。

## 10. 已知限制及关联文档

- 产品 `main` 只验证/消费外部 fault facts，没有仓库内 FDD producer，也没有现场 accuracy、precision/recall、误报/漏报或 commissioning 证据。
- 候选单元和集成 fixture 证明代码契约，不证明所有 Brick 模型、BMS 单位、历史数据质量和同构 fleet 都满足假设。
- 52 项是一次候选历史执行记录；没有完整 SHA、命令、环境与日志时不能升级为可复现发布门禁。
- 附件 51 条规则、24 条参考文献、三态分类和 WKGO `25/51 = 49.02%` 都是来源案例；三态不是 API enum，该比率不是产品保证。
- SHA-256 证明附件字节未变，不证明作者身份、参考文献有效性、规则正确性、使用授权或现场结论可推广。
- 历史触发只能证明在给定输入和参数下规则条件成立；dashboard 的“归因”视图和报告诊断都不能替代根因确认。

继续阅读[规则模型与来源](rule-model-sources.md)、[Brick 映射及可部署性](brick-deployability.md)、[Runtime 与物化](runtime-materialization.md)、[BMS 集成](../features/bms-integration.md)和[Dashboards 与 Reports](../features/dashboards-reports.md)。
