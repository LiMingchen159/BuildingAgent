# Dashboards 与 Reports

[English](../../en/features/dashboards-reports.md) | [开发者文档首页](../README.md) | [REST、SSE 与 WebSocket 契约](../architecture/api-events.md)

> 代码基线：`main@af44ff15`。总体状态：Dashboard 资源、Web 工作区和 BMS/Derived Metric 读取为 **已实现（Implemented）**；浏览器 AutoReport 为 **部分实现（Partial）**；服务端报告内核是 **已实现并受单元测试覆盖的库组件**，但可调用的报告 API、调度执行、运行记录和下载链路仍为 **规划中（Planned）**。

## 1. 状态与代码基线

仓库中有三组名称相近、成熟度不同的能力，必须分开判断：

| 能力 | 状态 | 当前事实 |
| --- | --- | --- |
| Dashboard 模型与 CRUD REST | **已实现** | [`dashboards.ts`](../../../../apps/api/src/dashboards.ts) 校验 widget、binding、section 和 12 列 layout；[`server.ts`](../../../../apps/api/src/server.ts) 注册列表、详情、创建、完整规格更新和删除路由。 |
| Dashboard Web 工作区 | **已实现** | [`DashboardView.tsx`](../../../../apps/web/src/ui/DashboardView.tsx) 展示 live/stat/trend/comparison/note widget，并支持布局、分区、可见性、重命名、复制、合并、跨 Dashboard 复制 widget 和 solo view。 |
| Dashboard BMS 与 Derived Metric 数据 | **已实现** | latest/history batch 同时解析原始 BMS binding 和派生指标 binding；原始具名 BMS 点还可通过项目 WebSocket 接收 best-effort 更新。 |
| Agent 创建 Dashboard | **已实现** | `dashboard_create` 把工具输入规范化为 Dashboard 资源，并从 Chat 关联 `sourceConversationId`。 |
| Web AutoReport | **部分实现** | [`AutoReport.tsx`](../../../../apps/web/src/ui/AutoReport.tsx) 在浏览器中聚合所选 Dashboard 的 latest/history、生成固定双语预览并调用 `window.print()`；没有保存报告定义、运行记录或生成产物。 |
| 服务端报告契约、计划、证据、分析、组装与 LaTeX | **库组件已实现** | [`reports/`](../../../../apps/api/src/reports) 有版本化类型、严格校验器、执行内核、安全渲染/编译边界及单元测试。 |
| 服务端 Reports API 与产品全链路 | **规划中** | `server.ts` 没有报告规格、运行、状态、产物或下载路由，也没有把完整 evidence tools、artifact store、scheduler 和 PDF compiler 装配成产品服务。 |

因此，“Auto Report”标签页不是服务端报告内核的 UI，“Save PDF”也不是调用服务端 XeLaTeX。反过来，`reports/*.test.ts` 的端到端 fixture 能贯穿库函数，并不证明部署中的 Fastify 已暴露相同链路。

## 2. 功能目的及边界

Dashboard 是项目内可复用的运营视图定义。它保存标题、可见性、widget、数据 binding、布局和分区，而不复制 BMS/Derived Metric 时序值。Widget 类型固定为 `live_value_grid`、`timeseries_chart`、`stat_value`、`bar_comparison` 和无点位要求的 `note`；数据 binding 指向原始 BMS 点，或一个已持久化的 Derived Metric 实例/实体指标。

AutoReport 是面向值班人员的浏览器工作台。用户从当前可读 Dashboard 中选择范围，再选择每日交班、周/月管理汇报或故障/问题复盘。页面只汇总 Dashboard 规格、BMS latest/history、Derived Metric latest/history 和人工编辑的摘要/备注；它明确不推断报警、工单、CMMS 记录或已验证根因。

服务端 `reports/` 是另一条更严格的报告流水线内核。其目标模型是：解析 `ReportSpec`，发现并固定设备资产来源，生成 `ReportPlan`，通过确定性 producer 收集 `EvidencePackage`，让受约束的 B-Agent 只解释已投影证据，组装 renderer-neutral `ReportDocument`，再安全渲染并编译 PDF。当前缺少把这些步骤装配成一个经鉴权、可持久化、可调度的产品入口，不能直接从库接口推断 REST 契约。

## 3. 用户入口和关键源码入口

### Dashboard

- Web 组合根、路由与 CRUD 操作：[`apps/web/src/App.tsx`](../../../../apps/web/src/App.tsx)
- Dashboard 展示、编辑和 batch 查询：[`apps/web/src/ui/DashboardView.tsx`](../../../../apps/web/src/ui/DashboardView.tsx)
- Web REST client 与镜像类型：[`apps/web/src/api.ts`](../../../../apps/web/src/api.ts)
- BMS/Derived Metric batch client：[`apps/web/src/bmsCollectorClient.ts`](../../../../apps/web/src/bmsCollectorClient.ts)
- 服务端模型和 payload 校验：[`apps/api/src/dashboards.ts`](../../../../apps/api/src/dashboards.ts)
- Fastify CRUD、batch、WebSocket 与 store 装配：[`apps/api/src/server.ts`](../../../../apps/api/src/server.ts)
- Agent 工具：[`apps/api/src/agent/genericTools.ts`](../../../../apps/api/src/agent/genericTools.ts)

主要 HTTP 入口是：

- `GET|POST /api/projects/:projectId/dashboards`
- `GET|PATCH|DELETE /api/projects/:projectId/dashboards/:dashboardId`
- `POST /api/bms/dashboard/latest-batch`
- `POST /api/bms/dashboard/history-batch`
- `WS /api/projects/:projectId/ws`，消息 `dashboard_subscribe` 与 `dashboard_point_update`

### Reports

- 浏览器 AutoReport：[`apps/web/src/ui/AutoReport.tsx`](../../../../apps/web/src/ui/AutoReport.tsx)
- 规格、package 和 document 契约：[`apps/api/src/reports/contracts.ts`](../../../../apps/api/src/reports/contracts.ts)
- 设备 profile 与资产发现：[`profiles.ts`](../../../../apps/api/src/reports/profiles.ts)、[`assetDiscovery.ts`](../../../../apps/api/src/reports/assetDiscovery.ts)
- 计划：[`planner.ts`](../../../../apps/api/src/reports/planner.ts)
- 证据定义、工具接口与执行：[`evidenceDefinitions.ts`](../../../../apps/api/src/reports/evidenceDefinitions.ts)、[`evidenceTools.ts`](../../../../apps/api/src/reports/evidenceTools.ts)、[`evidenceExecutor.ts`](../../../../apps/api/src/reports/evidenceExecutor.ts)
- 受约束分析：[`analysisDefinitions.ts`](../../../../apps/api/src/reports/analysisDefinitions.ts)、[`analysisExecutor.ts`](../../../../apps/api/src/reports/analysisExecutor.ts)
- 文档、渲染、资产与编译：[`reportAssembler.ts`](../../../../apps/api/src/reports/reportAssembler.ts)、[`latexRenderer.ts`](../../../../apps/api/src/reports/latexRenderer.ts)、[`reportArtifacts.ts`](../../../../apps/api/src/reports/reportArtifacts.ts)、[`latexCompiler.ts`](../../../../apps/api/src/reports/latexCompiler.ts)

基线不存在 `/api/reports` 或等价 Fastify surface。`ReportSpec.schedule` 是已校验的数据契约，不是已接入 Scheduler 的运行任务。

## 4. 正常数据流

### 4.1 Dashboard 创建与读取

1. 用户可由 Chat 要求监控设备；Agent 先查 BMS/Derived Metric，再调用 `dashboard_create`。用户也可在 Web 中复制现有 Dashboard，但没有独立的空白 Dashboard builder。
2. 服务端把输入规范化并校验：title、widget/binding、layout、section 必须互相引用一致；Agent 工具可为省略或无效的布局/分区生成规范规格。
3. 创建结果写入 `dashboardsByProject`，触发延迟持久化，并向该项目广播 `dashboard_created`。若 `sourceConversationId` 等于当前对话，Web 自动打开新 Dashboard。
4. Web 从右侧 Dashboard 列表或 `/projects/<project>/dashboards/<id>` 打开资源。`DashboardView` 为 trend 以最多 32 条一批读取 history，为所有有效 binding 以最多 64 条一批读取 latest。
5. 当前 Dashboard 的原始具名 BMS binding 通过 `dashboard_subscribe` 注册；API 每 15 秒 best-effort 轮询 collector，只广播变化。页面另外每 60 秒 latest-batch 轮询全部 binding，因此 Derived Metric 和没有 WebSocket 更新的值仍可刷新。
6. 拖拽/缩放、分区、note、widget 标题或 Dashboard 可见性变化最终发送完整 `PATCH` 规格。服务端不是 JSON Merge Patch：调用方必须保留 title、layout 和 widgets 等必需字段。

Web 可复制/合并 Dashboard，或复制单个 widget 到另一 Dashboard；这些操作在浏览器中构造新规格后调用已有 `POST`/`PATCH`，服务端没有专用 duplicate/merge endpoint。删除 Dashboard 只删除视图定义，不删除 BMS 数据或 Derived Metric。

### 4.2 浏览器 AutoReport

1. Reports 标签页直接接收 App 已加载的可读 Dashboard 数组；选择变化和可编辑叙述只保存在 React state。
2. 生成时，从去重后的 binding 构造 latest 和 history query。页面按 API 上限分别切为 64/32 条，时间窗口由模板固定为 24 小时、7 天或 48 小时。
3. BMS 与 Derived Metric 返回统一为点位/时序形态。页面计算样本数、min/max/avg、最新值覆盖，并用超过两小时未刷新判定 `stale`。
4. 页面渲染固定双语摘要、风险/数据质量、Dashboard/widget 清单、趋势证据和原始点位快照。人工备注不会提交到 API。
5. “生成网页”只更新当前页面 snapshot；“保存 PDF”在同样取证后延迟调用浏览器打印对话框。保存位置、PDF 能力与失败行为由浏览器/操作系统决定。

### 4.3 服务端报告库的目标调用顺序

以下是可组合的库函数顺序，不是当前可访问的产品 API：

1. `parseReportSpec` 校验周期、时区、schedule、section、KPI、Dashboard 和设备选择。
2. `discoverProjectReportAssets`/`resolveReportAssets` 从语义模型、项目元数据和 BMS 元数据中确定设备 identity、profile、分类规则和内容 revision。
3. `buildReportPlan` 固定设备、section、Dashboard revision、证据/分析 definition revision 及每个 request。
4. `executeReportEvidence` 并发调用注入的 metric、chart、Dashboard 与 fault producer，记录 `complete`、`no_data` 或 `error`，以及 typed evidence、query hash、producer provenance 和 package revision。
5. `executeReportAnalysis` 仅把每个 request 的证据投影交给受限模型；模型不能调工具或发明事实，故障诊断结果被标为 hypothesis。
6. `assembleReportDocument` 从已验证的 plan/evidence/analysis 组装结构化 block graph；`renderReportLatex` 转义外部文本并建立 source bundle。
7. `materializeReportArtifacts` 经注入 reader 检查路径、checksum、类型和大小；`createXeLatexProcessCompiler` 在隔离临时目录中用 `/usr/bin/prlimit` 和 `/usr/bin/xelatex` 编译两遍并返回内存 PDF bytes。

仓库只提供 Derived Metric evidence adapter；完整 registry、BMS/chart/Dashboard/FDD producer、artifact sink/reader、运行 orchestrator 和对外 delivery 仍需部署方装配。

## 5. 数据、状态及持久化

| 数据/状态 | 位置 | 生命周期和权威性 |
| --- | --- | --- |
| Dashboard 规格 | `apps/data/store.json` 的 `dashboardsByProject` | API 进程内修改后约 500 ms best-effort 保存；是本地 Dashboard 定义的权威记录。 |
| BMS latest/history | 外部 collector/BMS | 外部权威事实；Dashboard 不复制时序。Fastify 只维护短期 point-id cache 和 WebSocket 轮询去重状态。 |
| Derived Metric latest/history | 项目数据根的 `derived_metrics.db` | 本地派生事实；Dashboard 只保存 instance/key/entity 引用。 |
| Dashboard Web 状态 | React state、history/latest cache | 选择项目或刷新后重建；图表 cache 和实时值不是权威记录。 |
| AutoReport 选择、摘要和 snapshot | `AutoReport` React state | 切换/刷新会丢失；没有 report id、保存 API、审计记录或恢复能力。 |
| 浏览器打印结果 | 浏览器/用户选择的位置 | 不写 Repository，不注册 `RepositoryArtifact`，服务端不可查询。 |
| 服务端 `ReportSpec`、Plan、Packages、Document、PDF | TypeScript 值/测试 fixture | 基线没有产品持久化、run registry 或 artifact-store 装配；schema revision 只保证值的可验证性，不等于已经落盘。 |

Dashboard 的 JSON store 与 Derived Metric SQLite 分属两个数据根；详见[运行时与存储拓扑](../architecture/runtime-storage.md)。旧 store 缺少 `dashboardsByProject` 时启动会回填空集合，Dashboard ID 也会从已持久化的 `dash_<number>` 最大值继续，但 JSON 写入仍不提供多实例事务一致性。

## 6. 权限与项目隔离

Dashboard REST 首先要求有效 session、项目 membership 和会话已选择 URL 中同一项目。列表/详情要求 `chat:read`；创建、更新和删除要求 `chat:write`。读取范围再由 `canReadDashboard` 限制为“本人拥有”或 `visibility: "project"`。更新/删除只允许 owner，或允许拥有 `project:configure` 的用户管理项目可见 Dashboard；配置者不能借此管理他人的 private Dashboard。

Agent 创建继承已鉴权 Chat 的 `projectId` 和 `userId`。新资源可由 `chat:write` 用户直接创建为 project-visible；当前没有额外 `project:configure` 检查，这是现行契约而非推荐的高权限设计。

WebSocket upgrade 验证 token、project membership 和 `chat:read`，但不要求 session 当前选中了同一项目。其 `dashboard_subscribe` 接收的是任意 point-name 数组，并直接查询共享 collector；消息不携带或校验 Dashboard ID/可读性。因此它依赖客户端只订阅已授权 Dashboard 中的点名，不能视为点级授权边界。batch API 则要求 session 已选项目，并在解析 Derived Metric 时检查项目归属。

AutoReport 没有独立权限层；它只能使用 App 已取得的 Dashboard 和两个 batch 路由。服务端报告库中的 `projectId`、asset revision 和 package validation 是数据一致性机制，不执行身份认证或 membership 检查；未来路由必须在调用库之前补齐授权与 artifact 下载控制。

## 7. 错误、降级及外部依赖

- Dashboard payload 无效时返回 `422 dashboard_invalid`；不存在和不可读的详情统一为 `404 dashboard_not_found`，无管理权的变更返回 `403 dashboard_forbidden`。
- JSON persistence 是 best-effort：保存失败只写 warning，成功 REST 响应不构成 durable-commit 保证。
- history/latest batch 对每条 query 隔离错误；调用方必须检查 result 的 `ok`。原始 BMS 依赖 collector，Derived Metric 依赖本地 SQLite。
- WebSocket 轮询吞掉单点网络异常，只广播实际变化；70 秒无更新时 Web 标记 realtime stale，但 60 秒 latest fallback 仍可能提供值。WebSocket 只推原始具名 BMS 点，Derived Metric 依赖 batch polling。
- Dashboard trend 加载失败时保留空/旧展示，不会把错误读数伪装为数据；无数值的 comparison/stat widget 显示无可用值。
- AutoReport 至少需要一个 Dashboard。证据请求整体抛错时，它降级为 Dashboard 定义和人工说明，把点位视为 missing；单条 history 失败则跳过该趋势证据。页面不伪造报警、工单或根因。
- 浏览器 PDF 依赖 `window.print()`；没有服务端状态、重试、可下载 URL 或 checksum。
- 服务端编译器依赖 Linux `/usr/bin/prlimit` 和 `/usr/bin/xelatex`，并受并发、超时、source/asset/PDF 大小和像素限制；这些代码未由 Fastify 调用。完整证据执行还依赖注入的 producer 和 artifact store。

## 8. 扩展方法

新增 Dashboard widget 或 binding 时，要同步更新服务端 discriminated union/校验、Web 镜像类型和 parser、Agent tool schema/规范化、`DashboardView` 查询与渲染、AutoReport 摘要、layout/section 迁移和 API/Web 测试。不要让前端单独接受服务端会拒绝的规格。涉及时序的 widget 应复用 batch API，并明确 source、单位、缺数、过期和项目校验规则。

Dashboard 更新目前采用“发送完整规格”。若引入局部 patch、乐观并发或多人编辑，应先增加 revision/ETag 与冲突契约，否则最后写入者会覆盖其他编辑。若扩展实时订阅，应让服务端从已授权 Dashboard/binding 解析订阅，而不是接受任意点名，并把 Derived Metric 更新策略与外部 BMS 推送策略分别定义。

接通服务端 Reports 时，建议建立一个显式 orchestrator，按状态机保存 spec → run → immutable plan/package/document → artifact，并把 definition/asset revision 和失败阶段写入审计记录。路由需要 project membership/permission、幂等键、取消/重试、下载授权和保留策略。不要让 LLM 直接生成 LaTeX、调用 evidence producer 或改变确定性事实；沿用现有“确定性证据 → 受约束分析 → 结构化组装 → inert rendering”边界。

若要让 Web AutoReport 复用服务端内核，应以正式 ReportSpec/API 重写其调用，而不是仅把相同标签或模板名称连接起来；迁移期间应明确展示“浏览器草稿”和“服务端已保存报告”的不同状态。

## 9. 对应测试

Dashboard 与 Web 覆盖：

- [`apps/api/src/dashboards.test.ts`](../../../../apps/api/src/dashboards.test.ts)：CRUD、可见性/管理权限、payload 校验、BMS/Derived Metric batch、legacy store 回填和 ID 恢复。
- [`apps/api/src/chat.test.ts`](../../../../apps/api/src/chat.test.ts)：Agent 查点、创建 Dashboard、派生指标复用、条件 note 和 `sourceConversationId` 链路。
- [`apps/web/src/App.test.tsx`](../../../../apps/web/src/App.test.tsx)：右侧列表、deep link、WebSocket 更新、布局保存、Derived Metric 查询、legacy section、复制/合并等工作区行为。
- [`apps/web/src/ui/AutoReport.test.tsx`](../../../../apps/web/src/ui/AutoReport.test.tsx)：报告意图切换、Dashboard 选择、BMS/Derived evidence、missing/stale、人工备注和 `window.print()`。

服务端报告库覆盖：

- [`contracts.test.ts`](../../../../apps/api/src/reports/contracts.test.ts)、[`assetDiscovery.test.ts`](../../../../apps/api/src/reports/assetDiscovery.test.ts)、[`planner.test.ts`](../../../../apps/api/src/reports/planner.test.ts)
- [`evidenceExecutor.test.ts`](../../../../apps/api/src/reports/evidenceExecutor.test.ts)、[`derivedMetricEvidence.test.ts`](../../../../apps/api/src/reports/derivedMetricEvidence.test.ts)
- [`analysisExecutor.test.ts`](../../../../apps/api/src/reports/analysisExecutor.test.ts)、[`analysisTools.test.ts`](../../../../apps/api/src/reports/analysisTools.test.ts)
- [`reportAssembler.test.ts`](../../../../apps/api/src/reports/reportAssembler.test.ts)、[`latexRenderer.test.ts`](../../../../apps/api/src/reports/latexRenderer.test.ts)、[`reportArtifacts.test.ts`](../../../../apps/api/src/reports/reportArtifacts.test.ts)、[`latexCompiler.test.ts`](../../../../apps/api/src/reports/latexCompiler.test.ts)

这些链接说明对应覆盖，不声称本页编写时单独执行了测试。最终里程碑结果见[测试与验证](../development/testing.md)。尤其不能用库单元测试代替缺失的 Reports REST、授权、持久化、调度和下载集成测试。

## 10. 已知限制及关联文档

当前主要限制是：Dashboard 使用本地 JSON store 和 last-write-wins 完整规格更新；WebSocket 订阅未绑定 Dashboard 授权且只覆盖原始具名 BMS 点；没有空白 Dashboard builder；AutoReport 是易失的浏览器页面，PDF 只是打印；服务端报告库没有 Fastify 路由、完整 producer 装配、run/artifact 持久化、Scheduler 连接或产品下载链路。服务端 `ReportSpec.schedule`、安全 XeLaTeX compiler 和测试中的 PDF bytes 都不能写成已上线报告服务。

旧的 [Derived Metrics Storage And Agent Workflow](../../../bms/DERIVED_METRICS.md) 是实现阶段的**历史/补充说明**，其中 Dashboard binding 和 batch API 仍有参考价值；当前状态、项目隔离缺口与报告边界以本开发者文档及 [Derived Metrics 与 KPI](derived-metrics-kpi.md) 为准。

关联页面：

- [Web 工作区](web-workspace.md)
- [BMS 集成](bms-integration.md)
- [Derived Metrics 与 KPI](derived-metrics-kpi.md)
- [Scheduler、Realtime 与 STT](scheduler-realtime-stt.md)
- [运行时与存储拓扑](../architecture/runtime-storage.md)
- [排障与已知契约差距](../development/troubleshooting.md)
