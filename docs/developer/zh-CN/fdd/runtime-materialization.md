# Runtime 与物化

[English](../../en/fdd/runtime-materialization.md) | [开发者文档首页](../README.md) | [FDD 总览](overview.md) | [Brick 映射及可部署性](brick-deployability.md)

> 产品代码基线：`main@af44ff15`。总体状态：**部分实现**，且仅限 Reports 对 `fdd_rule` 证据的消费；该基线没有 FDD Task、runtime registry、evaluator、物化调度或 FDD 路由。下文的 Task 与物化实现来自未合并候选提交 `71c2cb6d2c382348e6ccc47badea611183b0912d`，只用于说明可核对的候选设计，不能当作 `main` API 或已发布能力。

## 1. 状态与代码基线

| 能力 | 产品 `main@af44ff15` | M007 候选 `71c2cb6d…` |
| --- | --- | --- |
| 报告侧 FDD 证据消费 | **部分实现**：Reports 可调用注入的 fault evidence tool、严格校验结果并组装 `FaultEvent`。 | 候选 runtime 没有接入产品 `main` 的 `FaultEvidenceTool` 端口。 |
| FDD Task 与部署检查 | **规划中**：没有模型、store 或路由。 | **候选 / 未合并**：Task 保存算法快照、检查、参数与项目状态。 |
| Runtime registry 与 evaluator | **规划中**：没有 `apps/api/src/fdd/**`。 | **候选 / 未合并**：runtime registry 与算法 key 精确对齐；固定快照中有 59 个可执行条目。 |
| 周期物化、历史与 latest | **规划中（FDD）**：产品已有通用 Derived Metrics，但没有 FDD producer。 | **候选 / 未合并**：把每个设备上的 evaluator 注册成 `metricType: "fdd"` 的派生指标并周期写样本。 |
| Dashboard 与归因 | 产品 Dashboard/Reports 是消费者，不会自行检测故障。 | **候选 / 未合并**：部署时生成 Dashboard；另有 LLM 归因端点，但归因不等于确定性检测。 |

候选 `FddTaskStatus` 定义五个值，但“类型存在”不等于每个状态都有完整操作契约：

| Task 状态 | 候选含义与已核对转换 |
| --- | --- |
| `checking` | 算法快照变化，或启动时发现检查策略、时效、项目签名、算法版本、实体覆盖不再有效时，撤回原运行授权并等待重检。 |
| `ready` | evaluator 已登记且检查为 `can_deploy`，但尚未成功建立并启动物化实例。 |
| `running` | 部署已为至少一个完整实体建立派生指标、启用物化并安排首次运行。它不是“最近一次求值成功”的证明。 |
| `paused` | 类型中存在；在该提交的 FDD Task 路由中没有发现把 Task 转成 `paused` 的操作。通用派生指标 materialization 可被单独设为 `paused`，两者不是同一状态机。 |
| `cannot_deploy` | 规格没有登记 evaluator，或当前检查不能授权部署。缺失点位、歧义、历史不足等细节应从 check 读取，不能只看该汇总状态。 |

## 2. 功能目的及边界

Runtime 的责任是对**版本化算法快照、明确的实体点位映射和限定时间窗口**执行可复现求值；物化的责任是保存求值事实，供 Dashboard、报告或其他只读消费者读取。它们不得把目录卡片、可部署性判断、LLM 归因或操作员描述当作检测结果。

需要区分五种对象：

1. `FddDeployabilityCheck` 证明某个项目数据签名、算法版本和策略版本下的输入准备度；它不运行规则。
2. `ProjectFddTask` 固化项目、来源、分享范围、算法快照、参数和 check；它是控制面对象，不是故障记录。
3. runtime registry 决定算法 key 是否有受测 evaluator；`deployableRuntime: true` 单独不能授权执行。
4. 派生指标 instance、materialization 配置和 sample 是候选数据面的运行及历史记录。
5. 产品 Reports 中的 `FaultEvent` 是一次报告证据包里的检测事实。候选派生指标样本不会自动成为该类型，除非未来实现显式、受测的 adapter。

产品 `main` 当前只拥有第 5 项的**消费者边界**，没有前四项组成的 FDD producer。本文描述候选状态机时始终以此前提为准。

## 3. 用户入口和关键源码入口

产品 `main` 没有 FDD runtime 用户入口、`/api/projects/:projectId/fdd-*` 路由或 FDD 专用 Web 工作区。可核对的产品入口都在 Reports：

- fault definition 与 `producerKind: "fdd_rule"`：[evidenceDefinitions.ts](../../../../apps/api/src/reports/evidenceDefinitions.ts)
- 注入式 fault tool 契约：[evidenceTools.ts](../../../../apps/api/src/reports/evidenceTools.ts)
- 结果校验及 `FaultEvent` 组装：[evidenceExecutor.ts](../../../../apps/api/src/reports/evidenceExecutor.ts)
- 检测/诊断边界：[analysisExecutor.ts](../../../../apps/api/src/reports/analysisExecutor.ts)

以下入口固定到不可变候选提交；它们不是现行源码链接：

- Task、check、状态和参数类型：[M007 `library.ts`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/library.ts)
- evaluator 登记白名单：[M007 `runtimeRegistry.ts`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/runtimeRegistry.ts)
- 确定性规则与窗口逻辑：[M007 `evaluator.ts`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/evaluator.ts)
- 路由、部署、物化器、Dashboard 与归因装配：[M007 `server.ts`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/server.ts)
- 派生指标 SQLite 模型：[M007 `derivedMetrics.ts`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/derivedMetrics.ts)

候选路由包含 library 列表/测试/部署、Task 列表/创建/测试/参数更新/部署/删除，以及派生指标读取、删除和 materialization 开关。路径仅用于候选代码评审，调用方不得据此集成产品 `main`。

## 4. 正常数据流

候选的成功路径如下；整条链路均标记为 **候选 / 未合并**：

1. 对版本化算法执行 deployability check。部署前重新核对 `v2-observed-history` 策略、检查时效、项目数据签名、算法 id/version 和实体覆盖；旧检查不能继续授权。
2. Task 保存算法 snapshot 和参数。默认参数可被 BuildingGPT 推荐值初始化，操作员覆盖值则记录来源、理由、更新时间和用户。
3. `isExecutableFddAlgorithm` 同时要求 global builtin、`deployableRuntime` 和 registry 中存在同 key evaluator。规格上传及没有 evaluator 的 DOCX 项保持不可运行。
4. 对 check 中每个映射完整的实体登记一个派生指标 instance。required-point mapping 变成 `raw_point` dependencies；metadata 保存 Task、算法、部署状态、参数和 grounding 引用。
5. 部署把 Task 置为 `running`，为 instance 启用 `formulaKind: "fdd_rule"` 的 materialization，并生成包含状态、7 天归因、24 小时趋势和检测逻辑的项目 Dashboard。
6. 候选默认每 5 分钟求值、回看 30 天，并以 15 分钟容差把其他输入匹配到样本最多的 anchor series。调度循环每分钟选择到期项；这些是候选默认值，不是现场推荐值。
7. evaluator 读取 Task 参数，例如 `window_minutes`。需要持续条件的规则只有在当前条件成立、窗口内至少两个有效 fault 样本、没有 normal 样本、最近 fault 足够新且覆盖窗口（允许小幅采样宽限）时才输出确认故障。
8. 每个样本保存数值/文本、quality、status、输入值、各输入时间戳与延迟、容差、reason、derived values、来源窗口和稳定 calculation run id。无输入写成 `no_data / invalid / not_calculable`，而不是正常值。
9. Dashboard 通过派生指标 binding 读取 latest/history。候选归因端点可基于客户端提交的证据摘要请求 LLM 生成说明；该文本不能改变 evaluator 样本，也不能确认根因。
10. 产品 Reports 若要消费这些结果，未来仍需显式 adapter，把候选样本转换成符合 definition/tool provenance 的 `FaultEvent`；该连接在两个基线中都不存在。

## 5. 数据、状态及持久化

候选设计跨越两个本地存储和一个外部权威数据源：

| 数据 | 候选位置与生命周期 |
| --- | --- |
| 算法目录、项目 Task、checks、library check runs | `SeedStore` 的 `fddAlgorithms`、`fddTasksByProject`、`fddChecksByProject`、`fddLibraryCheckRunsByProject`；随项目 JSON store 持久化。Task 包含算法 snapshot，避免只靠可变目录指针。 |
| 指标定义、版本、实例与 dependencies | `DerivedMetricStore` 的 SQLite 表；每个项目、entity 和 metric key 建立实例，并保存算法版本与原始点位依赖。 |
| materialization 控制面 | SQLite `metric_materialization`；含 enabled、interval/lookback、formula kind、对齐策略、last/next run、watermark、status 和 last error。 |
| 检测历史与 latest | SQLite `metric_samples` 和 `metric_latest`；`(instance_id, ts, calculation_run_id)` 幂等更新，只有不早于当前 latest 的样本才能替换 latest。 |
| 原始 BMS 时序 | 外部 collector 权威数据；候选只按窗口读取，不复制成 FDD Task。 |
| Dashboard | 候选项目 JSON store；保存 binding 与布局，不取代检测历史。 |
| LLM 归因响应 | 候选端点按请求返回文本；端点本身不把诊断结论写成确定性故障事实。 |

样本 metadata 保留输入和值的时间对齐证据，但这仍不是完整审计日志：候选没有独立运行实体记录每次调度的开始/结束、软件构建 id 或外部请求摘要。产品 Reports 的 evidence package 也不是这些 SQLite 表的长期别名。

## 6. 权限与项目隔离

产品 `main` 的 Reports 上游必须先完成鉴权和项目选择；evidence executor 还会拒绝 tool 返回中项目、设备、definition 或时间窗口不匹配的结果。它是事实一致性防线，不替代路由授权。

候选路由统一要求有效 session、项目 membership 和当前选中项目。library/Task/派生指标读取及归因使用 `chat:read`；检查、部署、创建、删除、参数修改和 materialization 开关使用 `chat:write`。按 instance id 读取或修改时还核对 `instance.projectId`。Task 和 check 都携带 `projectId`，Dashboard 广播也按项目发送。

这些 guard 只在未合并候选提交中存在，不构成产品保证。产品化时应把“读取算法目录”“配置检查”“部署/暂停 runtime”“调整参数”“读取故障事实”“执行 LLM 诊断”拆成明确权限，而不是长期复用宽泛的 Chat 权限；后台调度也必须在读取每个 dependency 前重新确认实例、数据源和 owner project 一致。

## 7. 错误、降级及外部依赖

- 规格只有目录元数据、没有 registry/evaluator 时，候选部署返回 `fdd_runtime_not_supported`；不得产生一个只会输出 `no_data` 的伪 running Task。
- check 不是 `can_deploy`，或没有完整 entity mapping 时，部署以 422 失败。`uncertain` 不能被默认为可运行。
- 策略版本过旧、检查过期、项目数据签名或算法版本变化时，候选会重检；启动审计会把原 `running`/`ready` Task 退回 `checking`，并以 `authorization_required` 禁用旧 materialization。
- BMS 未配置或没有输入历史时，物化器保存 `no_data / invalid / not_calculable`。缺输入、inactive gate 与正常 `0` 是不同语义。
- 未知 evaluator、缺 dependencies 或 materializer 异常不会由 LLM 修复。周期调度将 materialization 标成 `error`、保存 `lastError` 并安排下次尝试。
- 单个 background 首次物化的错误只记录警告；周期器按进程内定时器工作，进程停止时不会运行，也没有分布式租约或跨实例互斥。
- Dashboard 或 LLM provider 故障不得修改已物化样本。候选归因返回 unavailable/invalid output 时，消费者应保留检测事实并显示诊断不可用。
- 产品 Reports 的 fault tool 仍可返回 `complete / no_data / error`，且严格拒绝不匹配证据；候选 runtime 当前没有实现该 tool adapter。

外部依赖包括项目 BMS collector、其点位/时序质量，以及归因时可选的 LLM provider。SQLite、项目 JSON store 和 WebSocket 广播均是候选进程本地责任。

## 8. 扩展方法

新增可执行规则时，必须在同一受审变更中完成：版本化算法定义；required points、单位和参数；算法 key 对应 evaluator；runtime registry 登记；窗口/缺数据/边界测试；Task 部署测试；样本 provenance；以及对产品 `FaultEvidenceTool` 的显式 adapter。只添加目录行、公式文本或 `deployableRuntime: true` 都不够。

扩展物化器时应保持 evaluator 纯且确定性，把 I/O 留在 materializer；明确定义 anchor、对齐容差、采样宽限、回看窗口、时区、幂等 key、重算策略和参数版本。对每次重算保留 input timestamps、source window 和 evaluator/build lineage，避免历史结果在无解释时被覆盖。

产品化 Task 控制面前，应补齐独立的 pause/resume 状态转换，并规定 Task 状态与各实体 materialization 状态如何汇总。目前候选的 `paused` Task 只存在于类型，而派生指标开关可单独把 materialization 设为 paused，容易产生 `Task=running / materialization=paused` 的分歧。

归因应继续作为检测后的只读分析：输入必须引用已物化 fault timestamp、实际 input history 和使用的参数；输出应标明不确定性。不要让自然语言归因回写 fault bit、修改 Task 参数或替代现场确认。

## 9. 对应测试

产品基线只对报告消费者边界提供测试：

- fault tool outcome、严格校验、no-data/error 和 evidence package：[evidenceExecutor.test.ts](../../../../apps/api/src/reports/evidenceExecutor.test.ts)
- 检测与诊断边界、引用和失败降级：[analysisExecutor.test.ts](../../../../apps/api/src/reports/analysisExecutor.test.ts)
- fault 类型、报告组装与渲染：[contracts.test.ts](../../../../apps/api/src/reports/contracts.test.ts)、[reportAssembler.test.ts](../../../../apps/api/src/reports/reportAssembler.test.ts)

候选测试必须在包含对应不可变提交的干净 worktree 中运行：

- registry 中每个 key 都有非 fallback evaluator，以及具体规则输出：[M007 `evaluator.test.ts`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fdd/evaluator.test.ts)
- 目录/runtime 一致性、spec-only 降级与旧 Task 迁移：[M007 `fddLibrary.test.ts`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/fddLibrary.test.ts)
- 路由、检查策略、部署授权、重启失效与项目 BMS 隔离：[M007 `bms.test.ts`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/bms.test.ts)
- SQLite 样本/materialization 与 Dashboard FDD binding/归因：[M007 `derivedMetrics.test.ts`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/derivedMetrics.test.ts)、[M007 `dashboards.test.ts`](https://github.com/LiMingchen159/BuildingAgent/blob/71c2cb6d2c382348e6ccc47badea611183b0912d/apps/api/src/dashboards.test.ts)

这些是测试入口，不声称本页编写时重新执行了候选测试，也不能把候选历史的 52 项通过结果记到 `main@af44ff15`。里程碑最终回归见[测试与验证](../development/testing.md)。

## 10. 已知限制及关联文档

- 产品 `main` 没有 FDD Task、evaluator、runtime、物化器、FDD 路由或候选 Dashboard；仅有报告侧 evidence consumer。
- 候选 runtime 与路由集中在大型 `server.ts`，依赖进程内 timer、本地 JSON/SQLite 和外部 collector；它不是已发布的分布式任务服务。
- 只有候选 registry 对齐的 59 项可执行；目录其余条目不能因 check 成功就运行。
- `FddTaskStatus.paused` 没有候选 Task 操作路径，Task 与 materialization 可能状态分歧。
- 候选默认 15 分钟最近点对齐、30 天回看和 5 分钟间隔必须按现场采样率及规则重新验证，不能作为通用工程保证。
- 候选派生指标没有连接产品 Reports 的 `FaultEvidenceTool`；Dashboard binding 也不是报告 provenance adapter。
- LLM 归因是可降级的诊断说明，不是检测器、根因确认或控制指令。

继续阅读 [FDD 总览](overview.md)、[规则模型与来源](rule-model-sources.md)、[Brick 映射及可部署性](brick-deployability.md)和[验证与样本溯源](verification-provenance.md)。存储边界见[运行时与存储拓扑](../architecture/runtime-storage.md)，通用指标存储见 [Derived Metrics 与 KPI](../features/derived-metrics-kpi.md)，报告消费者见 [Dashboards 与 Reports](../features/dashboards-reports.md)。
