# Derived Metrics 与 KPI

[English](../../en/features/derived-metrics-kpi.md) | [开发者文档首页](../README.md)

> 代码基线：`main@af44ff15`。总体状态：Derived Metrics 为 **已实现（Implemented）**；KPI 为 **部分实现（Partial）**。本文中的 KPI 是面向运营的指标语义，不代表仓库已经提供独立 KPI 服务。

## 1. 状态与代码基线

| 能力 | 状态 | 当前事实 |
| --- | --- | --- |
| 指标定义、实例、依赖、样本与最新值 | 已实现 | [`DerivedMetricStore`](../../../../apps/api/src/derivedMetrics.ts) 使用 SQLite 保存确定性指标及其溯源。 |
| Agent 查询、预览、计算、登记、写样本与读取工具 | 已实现 | 工具注册在 [`genericTools.ts`](../../../../apps/api/src/agent/genericTools.ts)，技能约束在 [`skills.ts`](../../../../apps/api/src/agent/skills.ts)。 |
| Dashboard 读取派生指标 | 已实现 | Dashboard binding 可选择 `source: "derived_metric"`，Fastify 的 latest/history batch 路由把样本适配成 BMS 风格结果。 |
| KPI 数据模型 | 部分实现 | `metricType` 是开放字符串；报告规格含 `kpiKeys`，报告块和 `stat_value` widget 使用 KPI 称谓，但没有统一 KPI registry 或独立生命周期。 |
| KPI 回馈 | 规划中 | 当前没有独立 KPI 反馈服务、REST 路由或持久化回馈闭环。 |
| 服务端报告执行 | 部分实现 | [`reports/`](../../../../apps/api/src/reports) 有契约、规划、证据、组装与 LaTeX 组件及单元测试，但 [`server.ts`](../../../../apps/api/src/server.ts) 未注册对应执行路由。 |
| AutoReport | 部分实现 | [`AutoReport.tsx`](../../../../apps/web/src/ui/AutoReport.tsx) 在浏览器内聚合所选 dashboard 的 latest/history 证据并调用打印；它不是上述服务端报告库的执行入口。 |

## 2. 功能目的及边界

Derived Metric 把“某项目中某实体的可复用计算结果”建模为四类事实：定义和公式版本、实体实例、输入依赖、按时间记录的样本。典型用途包括 System COP、Delta T、kW/RT、FD score，以及可以被业务称为 KPI 的派生值。

这里的确定性边界很重要：通用计算工具只直接执行两个受控公式种类——`ratio`（左值除以右值）和 `difference`（左值减右值），并按完全相同的时间戳对齐输入。任意表达式不会因被写入 `formula` 字段就自动获得执行能力；非标准计算必须由可信调用方完成后，再用登记和写样本工具持久化。

KPI 当前不是独立领域服务。代码可把派生指标的 `metricType` 写成 `kpi`，报告规格可选择 `kpiKeys`，Dashboard 的统计卡和 AutoReport 也使用 KPI 文案；这些是概念连接点，不是同一个 KPI API 或枚举。

## 3. 用户入口和关键源码入口

主要用户入口有三类：

1. Chat 中要求计算、保存或复用 COP、Delta T 等值；Agent 依照 [`skill_derived_metrics`](../../../../apps/api/src/agent/skills.ts) 调用派生指标工具。
2. Dashboard widget 使用 `metricInstanceId`，或使用 `metricKey + entityId`，绑定一个已持久化指标；Web 通过 batch 接口读取最新值和历史值。
3. Reports 页中的 AutoReport 选择已有 dashboard，以 BMS 和派生指标 binding 为证据生成双语网页预览，并通过浏览器打印保存 PDF。

关键实现入口：

- 存储和数据模型：[`apps/api/src/derivedMetrics.ts`](../../../../apps/api/src/derivedMetrics.ts)
- Agent 工具：[`apps/api/src/agent/genericTools.ts`](../../../../apps/api/src/agent/genericTools.ts)
- Fastify 装配与 Dashboard batch 适配：[`apps/api/src/server.ts`](../../../../apps/api/src/server.ts)
- Dashboard 数据模型：[`apps/api/src/dashboards.ts`](../../../../apps/api/src/dashboards.ts)
- Web 展示：[`DashboardView.tsx`](../../../../apps/web/src/ui/DashboardView.tsx) 与 [`AutoReport.tsx`](../../../../apps/web/src/ui/AutoReport.tsx)
- 尚未接入服务端路由的报告内核：[`apps/api/src/reports/`](../../../../apps/api/src/reports)

没有 `/api/derived-metrics` 或 `/api/kpis` 这样的独立 REST 资源。派生指标写入当前由 Agent 工具完成；供 Dashboard/AutoReport 使用的读取复用了 `/api/bms/dashboard/latest-batch` 和 `/api/bms/dashboard/history-batch`。

## 4. 正常数据流

推荐链路是“先复用，再预览，明确同意后持久化”：

1. `derived_metric_lookup` 用当前 `projectId`、`metricKey` 和 `entityId` 查询已有实例。
2. 命中时，`derived_metric_read` 读取 latest/history，避免重复计算和重复登记。
3. 未命中且用户只要求一次计算、或尚未明确同意保存时，`derived_metric_preview` 读取两个 `raw_point` 或 `metric` 依赖，计算预览但不写定义、样本、latest 或 Memory。
4. 用户明确要求保存且拥有 `project:configure` 后，`derived_metric_calculate` 可接收预览返回的 `persistCandidate.args`。它再次查重、读取并按时间戳对齐输入、计算 `ratio` 或 `difference`、登记实例、写入所有样本及 latest。
5. 成功结果返回 `dashboardBinding`，并向项目 Memory 写一条幂等指针。Memory 只保存“到哪里读取”的提示，不复制时序值。
6. Dashboard 或 AutoReport 后续通过 batch 路由读取持久化 latest/history；再次请求同一指标时，Agent 应优先走 lookup/read。

`derived_metric_register` 加 `derived_metric_record_sample` 是非标准计算的低层路径：前者登记公式、实例与依赖，后者保存可信调用方已经计算好的值。它们不执行 `formula` 字符串。

KPI 没有与此平行的独立写入或回馈流。当前连接方式是把某个派生指标标注为相应 `metricType`、把其 binding 放入 Dashboard，或在服务端报告规格中用 `kpiKeys` 引用一个指标定义。

## 5. 数据、状态及持久化

API 启动时用通用 [`dataRoot`](../../../../apps/api/src/agent/knowledgeBase.ts) 创建 `DerivedMetricStore`。默认文件为仓库数据根下的 `data/derived_metrics.db`；`BUILDING_AGENT_DATA_DIR` 或 `DATA_DIR` 可改变数据根。SQLite 启用 WAL，主要表如下：

| 表 | 责任与约束 |
| --- | --- |
| `metric_definitions` | 项目级指标定义，`(project_id, metric_key)` 唯一；含显示名、`metric_type` 和默认单位。 |
| `metric_versions` | 定义的公式版本，`(definition_id, version)` 唯一。 |
| `metric_instances` | 实体上的指标实例，`(project_id, entity_id, metric_key)` 唯一；快照公式、版本与说明，避免共享定义后续变化破坏实例溯源。 |
| `metric_dependencies` | 输入角色及 `raw_point`/`metric` 来源，按实例、角色、来源类型和来源 ID 去重。 |
| `metric_samples` | 历史样本，按 `(instance_id, ts, calculation_run_id)` 幂等更新；保存质量、状态、来源窗口和计算运行 ID。 |
| `metric_latest` | 每个实例一行最新值；只有时间戳不早于现有 latest 的写入才更新。 |

旧数据库启动时会补齐实例级公式 lineage 列，并从共享版本记录回填。历史读取默认最多 720 条，调用方可调整，但存储层上限为 20,000 条；`calculate`/`preview` 的每个输入也限制为 20,000 条。

项目 Memory 只保存派生指标指针。Dashboard 定义由现有 Dashboard store 管理。AutoReport 的选择、摘要、证据 snapshot 和格式是 React 页面状态；当前没有服务端 AutoReport 记录或已生成 PDF 的持久化。

## 6. 权限与项目隔离

Agent 工具从已鉴权、已选择项目的 Chat 上下文取得 `projectId`。`lookup` 使用该项目过滤实例；`calculate`、`register` 和 `record_sample` 还要求 `context.canConfigure`，即 `project:configure`。`preview`、`lookup` 和 `read` 本身不要求配置权限。Dashboard batch 路由要求有效 session 和选中项目；即使请求提供 `metric_instance_id`，服务端也会核对实例的 `projectId`。

当前仍有三个必须视为安全边界缺口的路径：

- `derived_metric_read` 在调用方直接提供 `instanceId` 时使用未带项目条件的 `getInstance`。
- `derived_metric_record_sample` 按 `instanceId` 写入，但没有把该实例的项目与工具上下文再次比较。
- `preview`/`calculate` 读取 `sourceType: "metric"` 的依赖时，按依赖 `sourceId` 取得实例，没有验证依赖属于当前项目。

因此，项目隔离目前依赖上层不暴露或混用其他项目的 instance ID；不能把底层 store API 当作完整授权层。扩展或对外开放这些入口前，应统一增加 `(projectId, instanceId)` 归属校验并补跨项目拒绝测试。Dashboard batch 的项目核对不能自动弥补 Agent 工具中的这些路径。

## 7. 错误、降级及外部依赖

- Store 未装配时，工具返回 `derived_metrics_unavailable`；实例不存在时返回 `derived_metric_not_found` 或相应登记/写入错误。
- `preview`/`calculate` 需要至少两个依赖、合法 `from`、以及 `ratio` 或 `difference`。它们只匹配完全相同的时间戳；没有对齐的数值样本时返回 `no_aligned_samples`。
- 分母为零、非有限值和不可解析的非数值样本会被跳过，并计入 `skipped`。当前没有插值、窗口聚合、单位换算或采样频率协调。
- `raw_point` 依赖通过外部 BMS collector 读取；collector 不可达或历史不足会让预览/计算失败。`metric` 依赖来自本地 SQLite。
- Dashboard 的派生指标不存在或没有 latest 时，batch 结果按查询项返回错误，而不是伪造数值。
- AutoReport 证据读取失败时降级为 Dashboard 定义和可编辑说明，并把点位标成缺失；它不会伪造报警、工单或 CMMS 状态。
- 服务端报告库包含严格契约与安全渲染组件，但没有 Fastify 执行路由；不得把其单元测试通过解释为线上报告服务可用。

## 8. 扩展方法

新增可复用指标时，优先使用稳定、项目内唯一的 `metricKey`，为每个实体提供 `entityId`、单位、公式版本、明确的依赖角色与来源。可由两个同时间戳序列表达的安全计算，应沿用 preview → 用户同意 → calculate；其他计算应在受测的确定性实现中完成，再用 register/record_sample 保存。

若要扩展通用计算器，应增加显式 `formulaKind`，而不是执行任意 `formula` 文本；同时定义除零/空值/单位/时间对齐规则，并覆盖预览不写入、持久化幂等、最新值选择和项目隔离。若要把派生指标接到 Dashboard，使用 `metricInstanceId` 最明确，也可使用同项目的 `metricKey + entityId`。

把 KPI 升级为独立能力前，需要先确定 KPI registry、类型和版本、目标/阈值、评价周期、聚合规则、权限、反馈语义和持久化契约，再接入 REST/Agent/Dashboard/Report。现有开放字符串 `metricType`、`kpiKeys` 或 `stat_value` 名称不能替代这些设计。接入服务端报告内核时还需要增加显式路由、运行记录、产物存储和访问控制，而不是从 AutoReport 组件直接推断后端能力。

## 9. 对应测试

- [`derivedMetrics.test.ts`](../../../../apps/api/src/derivedMetrics.test.ts)：Store 唯一性、实例公式 lineage、旧库迁移、latest/history、Agent 登记/查找/读取、ratio/difference 与预览不落盘。
- [`chat.test.ts`](../../../../apps/api/src/chat.test.ts)：Chat 中计算并保存 COP、复用已存指标、先预览后同意保存，以及创建派生指标 Dashboard 的完整工具循环。
- [`dashboards.test.ts`](../../../../apps/api/src/dashboards.test.ts)：派生指标 binding，以及 latest/history batch 的项目范围读取。
- [`App.test.tsx`](../../../../apps/web/src/App.test.tsx)：Web 按数据源组装 Dashboard latest/history 查询。
- [`AutoReport.test.tsx`](../../../../apps/web/src/ui/AutoReport.test.tsx)：报告意图、Dashboard 证据聚合、派生指标读取、缺失/过期降级和浏览器打印。
- [`reports/derivedMetricEvidence.test.ts`](../../../../apps/api/src/reports/derivedMetricEvidence.test.ts) 与 [`reports/contracts.test.ts`](../../../../apps/api/src/reports/contracts.test.ts)：尚未路由化的报告内核对派生指标证据、周期边界和 KPI key 契约的单元覆盖。

这些链接说明应运行的相关覆盖，不声称本页生成时单独执行了测试；里程碑最终测试结果见[测试与验证](../development/testing.md)。

## 10. 已知限制及关联文档

当前限制包括：通用公式只有 ratio/difference、输入只做精确时间戳对齐、SQLite 是本地文件而不是共享式指标服务、部分按 instance ID 和 metric 依赖的跨项目校验缺失、没有独立 KPI REST/反馈服务、服务端报告内核没有执行路由、AutoReport 只做前端证据聚合与打印。`metricType: "kpi"`、报告 `kpiKeys` 和 UI 中的 KPI 字样都只能解释为部分实现。

相关页面：

- [BMS 集成](bms-integration.md)
- [Dashboards 与 Reports](dashboards-reports.md)
- [Chat 与 Agent Runtime](chat-agent-runtime.md)
- [Tools、Skills、Memory 与 Grounding](tools-skills-memory-grounding.md)
- [运行时与存储拓扑](../architecture/runtime-storage.md)
- [REST、SSE 与 WebSocket 契约](../architecture/api-events.md)
