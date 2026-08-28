# 规则模型与来源

[English](../../en/fdd/rule-model-sources.md) | [开发者文档首页](../README.md) | [FDD 总览](overview.md)

> 产品基线：<code>main@af44ff15</code>。规则模型与数量证据基线：[candidate snapshot@71c2cb6d](https://github.com/LiMingchen159/BuildingAgent/commit/71c2cb6d2c382348e6ccc47badea611183b0912d)。状态：产品 <code>main</code> 尚未包含候选 FDD 目录；候选快照已实现规则目录、来源保真和 59 个 evaluator 注册，整体按 **部分实现** 说明。

## 1. 状态与代码基线

本页严格区分两个基线。仓库当前产品基线 <code>main@af44ff15</code> 没有 <code>apps/api/src/fdd/**</code>，因此下面的 198、59 和 111 都不是该 <code>main</code> 的已发布 API 数量，而是对固定候选快照 <code>71c2cb6d…</code> 的可复核盘点。候选代码的统一数据结构见 [FddAlgorithm、FddRequiredPoint、参数与来源定义](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/library.ts#L5-L113)，运行时白名单见 [runtimeRegistry.ts](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/runtimeRegistry.ts#L1-L79)。

| 设备类型 | 候选目录条目 | 有 evaluator 的条目 | 主要来源 |
| --- | ---: | ---: | --- |
| AHU | 72 | 0 | 28 个研究型 DBN seed，加 44 个 DOCX 导入定义 |
| Chiller | 56 | 56 | 51 个 CH-01…CH-51 规则、4 个规则示例和 1 个低 COP 指标 |
| FCU | 20 | 0 | DOCX 导入定义 |
| Pump | 18 | 0 | DOCX 导入定义 |
| Cooling tower | 12 | 0 | DOCX 导入定义 |
| VAV | 17 | 0 | DOCX 导入定义 |
| Sensor | 3 | 3 | 冷冻水供回水温度与流量 flatline 规则 |
| **合计** | **198** | **59** | 56 个冷机 evaluator、3 个传感器 evaluator |

其中 111 个 DOCX 导入条目全部是 **spec-only**：44 AHU、20 FCU、18 Pump、12 Cooling tower、17 VAV。候选测试同时固定了设备数量、来源哈希和定义状态分布；它们不因页面筛选或项目点位而改变。

## 2. 功能目的及边界

规则模型的目的，是把“某条故障定义需要什么输入、怎样计算、有哪些可调参数、从哪里来”表示成可追踪的目录对象，再交给点位映射、现场可部署性检查和 evaluator。它解决的是定义和溯源问题，不负责证明某个项目已有合格点位，也不负责证明一次告警是正确诊断。

候选 <code>FddAlgorithm</code> 是目录卡片的聚合根：身份与版本、设备和故障分类、方法、<code>requiredPoints</code>、输出、参数、公式、逻辑摘要、来源、<code>deployableRuntime</code> 及可选的定义审查信息都在同一对象中。这里的“算法”既可能是可执行规则，也可能只是规范定义；必须继续查看 runtime 注册表，不能由名称或公式字符串推断可执行性。

候选代码没有一个字面名为 <code>FddParameter</code> 的单一接口。“参数”被有意拆成三层：

- <code>FddParameterSpec</code> 是算法公开的 typed/default/bounds/editable 参数契约。
- <code>FddDefinitionParameter</code> 保存原始文档阈值符号、原始默认值和 <code>source_default / source_expression / site_required</code> 解析状态。
- <code>FddTaskParameterValue</code> 是部署任务中的实际值，带来源、理由、置信度和更新时间。

这三层不能互换。尤其是“来源文档写了一个阈值”不等于“现场已经批准该阈值”。

## 3. 用户入口和关键源码入口

产品 <code>main</code> 的总体边界从[当前实现架构](../architecture/current-architecture.md)和[BMS 集成](../features/bms-integration.md)进入；候选 FDD 尚不能通过该产品基线中的稳定入口承诺。

候选证据固定到以下不可变链接：

- 核心类型、目录 seed 和存储回填：[library.ts](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/library.ts#L5-L113)
- DOCX 生成目录及每份来源的文件名和 SHA-256：[importedEquipmentCatalog.ts](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/importedEquipmentCatalog.ts#L1-L397)
- 原始符号、Brick class、单位及 one-of 输入的规范化：[importedEquipmentLibrary.ts](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/importedEquipmentLibrary.ts#L300-L342)
- 定义状态、问题说明和规范对象组装：[importedEquipmentLibrary.ts](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/importedEquipmentLibrary.ts#L353-L461)
- 51 个冷机定义和候选 builtin 组装：[library.ts](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/library.ts#L791-L1031)
- evaluator 允许列表及三条件可执行判断：[runtimeRegistry.ts](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/runtimeRegistry.ts#L1-L79)

<code>importedEquipmentCatalog.ts</code> 顶部明确标注为生成文件。它是候选源码证据，不是手工维护 111 行业务规则的推荐入口。

## 4. 正常数据流

DOCX 导入定义在候选中的主路径如下：

1. 生成目录为每份来源记录设备类型、文件名、SHA-256 和符号词典，并为每条规则保留 id、分类、原始 required points、诊断表达式、原始 tunable parameters、持久窗口、原始 Brick 映射与 source hash。
2. importer 按逗号拆分输入组，并把来源中的 <code>or</code> 组保留为一个 required slot；它从变量说明或 Brick class 生成可检索语义，同时保留 <code>sourceSymbols</code> 和 <code>sourceBrickClasses</code>，而不是覆盖原文。
3. importer 推断 quantity kind 和可接受单位，并把来源的持久时间转成 <code>historyRequirement</code>。DOCX 没有给出规范工程单位时，<code>unitRoleDescription</code> 明确要求部署前确认。
4. 原始参数被拆为 definition parameters。无现场值、公式表达式或语义冲突分别进入配置/审查信息；分类器给出 <code>definitionStatus</code> 和 <code>definitionIssues</code>。
5. importer 组装 <code>FddAlgorithm</code>，把来源哈希前 8 位放入 version，并同时保留完整 <code>sourcePaperId</code> 和 <code>sourceDefinition</code>。这 111 条统一写成 <code>deployableRuntime: false</code>。
6. <code>seedFddAlgorithms()</code> 合并候选 builtin 与导入目录。只有 <code>global_builtin</code>、<code>deployableRuntime: true</code> 且 key 存在 evaluator 注册表的对象才可进入可执行路径。

附件样本与候选结构只做下列溯源摘要，不迁移 51 条正文：

| 样本概念 | 候选表示 | 事实边界 |
| --- | --- | --- |
| CH-01…CH-51 规则与检测逻辑 | <code>algorithmKey</code>、<code>formula</code>、<code>logicSummary</code> | 候选有 51 个对应冷机条目；本页不复制整套规则。 |
| 所需变量与 Brick 映射 | <code>FddRequiredPoint</code>，以及来源符号/Brick class | 是匹配线索和来源证据，不是已验证的现场 point id。 |
| Tunable parameters | <code>FddParameterSpec</code> 与 definition/task 参数层 | 默认值仍需按设计或历史基线审批。 |
| WKGO 部署和历史运行分类 | 可部署性检查加 evaluator 输出的概念组合 | 不是 <code>FddDefinitionStatus</code> 或 <code>FddDeployabilityStatus</code> 的同一个 API enum。 |

## 5. 数据、状态及持久化

### 5.1 规则对象

| 对象/字段 | 作用 | 不代表什么 |
| --- | --- | --- |
| <code>FddAlgorithm.id / algorithmKey / version</code> | 稳定身份、逻辑 key 和版本；DOCX 导入版本含来源哈希前缀 | 不代表已部署实例 |
| <code>FddRequiredPoint</code> | 稳定 slot、标签、语义、quantity kind、单位角色、别名和历史要求 | 不代表实际 BMS 点位或测量质量已确认 |
| <code>sourceSymbols / sourceBrickClasses</code> | 按位置保留来源公式符号和 Brick 类 | 不构成完整 Brick RDF 图，也不执行点位绑定 |
| <code>FddParameterSpec</code> | 运行/界面可理解的类型、默认值、范围和可编辑性 | 不等于现场最终值 |
| <code>FddSourceDefinition</code> | 保留 rule id、source file、完整 SHA-256 和三段 raw 文本 | 不证明文档作者、正确性或适用性 |
| <code>deployableRuntime</code> | 表示候选目录希望允许运行；仍须通过 scope 和 evaluator registry | 不等于某项目 <code>can_deploy</code> |
| <code>definitionStatus</code> | 表示规范是否足够清晰、是否缺现场值、是否需工程复核 | 不表示告警是否触发 |

候选 seed 会把 builtin 目录和 community 条目写入 <code>SeedStore.fddAlgorithms</code>，并把没有 evaluator 的旧 community/task snapshot 降级为 spec-only；见 [seed 与回填逻辑](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/library.ts#L1029-L1075)。这是候选线的数据契约，不应误写成产品 <code>main</code> 已有的 <code>apps/data/store.json</code> schema。

### 5.2 外部附件溯源

本次分析使用的 <code>FDD样本(1).docx</code> 约 31 页，是“冷机产品手册 + WKGO 部署验证报告”：包含 51 条冷机规则、Brick 映射、参数说明、历史验证和 24 条参考文献。文件不复制进仓库，仅记录字节级摘要：

- SHA-256：<code>f9f5854e1c8270d19ed4e61d15aec65ffba8614bfc38865e8b41d5a46eb1ec35</code>
- WKGO 中 25/51 条具备数据条件，覆盖率 49.02%；这是该项目在该次数据与专家判断下的案例结果，**不是产品覆盖率或性能保证**。

这个 hash 也不是候选 111 条导入目录中五份 DOCX 的 source hash。那五份来源由生成目录分别记录；51 个冷机 candidate seed 只保存 <code>sourcePaperId: fdd-library-chiller-final</code>，在固定快照中没有把上述附件 hash 写入 <code>FddSourceDefinition</code>，因此不能伪造二者的 API 等价关系。

手绘框架图同样不复制进仓库；它的 SHA-256 是 <code>89f2be1d159a11406c93ed11b4b49b808210b4f33ff6d1ba234c416fcb2a0781</code>，重绘结果及边界见[目标架构](../architecture/target-architecture.md)。

## 6. 权限与项目隔离

候选 <code>global_builtin</code> 规则是全局目录元数据，不应包含客户点名、凭据或项目私有阈值。<code>global_community</code> 表示共享范围，但候选回填会把 community 算法的 runtime 标志关闭；共享一条定义不授予跨项目读取 BMS、KB 或历史数据的权限。

实际点位映射、可部署性检查、任务快照和参数覆盖都必须属于 project id，并在服务端鉴权后使用。规则卡片中的 <code>sourceSymbols</code>、Brick class 或默认阈值不能绕过项目 membership，也不能作为 LLM 直接读取现场数据的授权。若来源附件含站点信息，导入器只应提取必要定义与哈希，原文件按受控文档处理，不进入公开 fixture。

## 7. 错误、降级及外部依赖

111 个 spec-only 条目使用三种 definition 状态，固定分布为：

| 状态 | 数量 | 含义 |
| --- | ---: | --- |
| <code>implementation_ready</code> | 43 | 定义足够清楚，可以开始实现 evaluator；**仍然没有 evaluator** |
| <code>requires_configuration</code> | 46 | 至少一个阈值、模式编码或现场参数必须配置 |
| <code>requires_review</code> | 22 | 原始谓词、分组、符号或 Brick 映射有歧义/矛盾，需工程复核 |

解析过程有意降级而不是猜测：例如混合 AND/OR 未加括号、缺失阈值、符号和 Brick 类方向不一致会进入 <code>definitionIssues</code>。SHA-256 只能确认输入字节是否相同，不能证明来源可信或公式正确。Brick class 和 source symbol 也只是候选线索；实际部署还必须验证点位、单位、历史覆盖和设备归属。

样本报告的三态是历史执行结果分类，不是候选 enum 的别名：

| 样本状态 | 最接近的候选概念 | 为什么不是同一枚举 |
| --- | --- | --- |
| Unsupported | 现场检查趋近 <code>cannot_deploy</code> | 样本基于 WKGO ground truth；候选另有 <code>uncertain</code>，且定义审查状态完全独立 |
| Deployable + No trigger | <code>can_deploy</code> 加该历史窗口内 evaluator 未持续触发 | 没有一个字段同时编码“可部署”和“未触发” |
| Deployable + Triggered | <code>can_deploy</code> 加 fault output 为真 | 触发是运行结果，不是 <code>definitionStatus</code> |

## 8. 扩展方法

新增或更新来源时，应通过可重复生成流程更新 catalog，不手改生成文件中的单条记录。生成物至少保留完整 source hash、原始 required points、原始参数、原始 Brick mapping、规则 id 和诊断表达式；normalizer 再产生稳定 slot、quantity kind、单位候选及一对一的 source symbol/Brick class。

状态变更应遵守以下门槛：

1. 只有消除公式/映射歧义后，才能从 <code>requires_review</code> 前移。
2. 只有为每个 <code>site_required</code> 参数建立设计值或批准基线，才能认为配置完成。
3. <code>implementation_ready</code> 只允许进入 evaluator 开发；必须同时实现 evaluator、加入 registry、补正反例/边界测试并保持目录与 registry 一致，才能设置 runtime。
4. 项目部署仍要运行点位与历史证据检查；不得由 catalog 状态直接生成 <code>can_deploy</code>。

来源字节变化时必须产生新 hash/version，不能静默复用旧版本。若要建立 51 条冷机附件的强溯源，应在未来候选中显式保存该附件 hash 或受控文档 id，而不是由文件名相似推断。

## 9. 对应测试

候选快照的 [FDD library 测试](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fddLibrary.test.ts#L15-L171)验证了：

- 51 个冷机文档条目均有 runtime 标志，28 个非 DOCX AHU 定义存在；
- 111 个 DOCX 条目均为 spec-only，id/key 唯一，均有分类、required point 和持久窗口；
- 设备分布为 44/20/18/12/17，definition 状态为 43/46/22；
- 完整来源 hash 进入 <code>sourceDefinition</code>，hash 前缀进入版本；
- 262 个来源符号都保留对应 Brick class；
- runtime 元数据与 evaluator registry 精确对齐。

M011 前置分析在候选工作线上执行了六个 FDD 定向测试文件，共 52 项通过。这个结果是候选门禁，不是 <code>main@af44ff15</code> 的产品测试结果；最终命令、环境和全仓回归规则见[测试与验证](../development/testing.md)。

## 10. 已知限制及关联文档

- 产品 <code>main@af44ff15</code> 没有候选 FDD 目录；任何“已实现”都必须带 candidate 基线限定。
- 198 是目录条目数，不是全部可执行数量；59 是 evaluator 注册数，不是某项目可部署数；111 是有来源的 spec-only 定义，不是待运行任务。
- <code>implementation_ready</code> 容易被误读为 runtime ready，本页明确禁止这种等同。
- 生成目录保存 DOCX 原始字段和 hash，但 51 个冷机 seed 在该快照没有完整 <code>FddSourceDefinition</code>；附件 hash 只作为本开发者文档的来源记录。
- 本页不复制附件中的 51 条规则正文或 24 条参考文献，也不把 WKGO 的 49.02% 写成产品承诺。

继续阅读 [Brick 映射及可部署性](brick-deployability.md)、[Runtime 与物化](runtime-materialization.md)、[验证与样本溯源](verification-provenance.md)、[BMS 集成](../features/bms-integration.md)和[目标架构](../architecture/target-architecture.md)。
