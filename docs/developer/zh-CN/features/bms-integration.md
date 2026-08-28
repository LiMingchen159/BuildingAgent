# BMS 集成

[English](../../en/features/bms-integration.md) | [开发者文档首页](../README.md) | [运行时与存储拓扑](../architecture/runtime-storage.md)

> 代码基线：`main@af44ff15`。状态：collector 只读查询、Dashboard 批量读取、source 基础生命周期、mock/Element bridge 和 Agent 查询工具已实现；BMS 配置向导及若干前端契约仅部分实现；真实 BMS、collector 与 enteliWEB 是外部能力。

## 1. 状态与代码基线

BMS 不是单一后端。基线代码中同时存在三条服务端路径：[server.ts](../../../../apps/api/src/server.ts) 可把 source/ingestion 管理请求转发给 `BMS_API_BASE_URL`，可在 `USE_MOCK_BMS_CLIENT` 下使用进程内 mock，也可在显式设置 `BMS_DATABASE_API_URL` 时为 `project_element` 装配 [BmsDatabaseBridge](../../../../apps/api/src/bmsDatabaseBridge.ts)。此外，[bmsCollectorProxy.ts](../../../../apps/api/src/bmsCollectorProxy.ts) 为浏览器提供已鉴权的只读 collector 代理；[bmsLiveRead.ts](../../../../apps/api/src/agent/bmsLiveRead.ts) 是 Agent 使用的独立 enteliWEB 即时读取工具。

| 能力 | 状态 | 基线事实 |
| --- | --- | --- |
| BMS health、临时上传、source 创建/列表 | **已实现** | Fastify 有明确路由；health/source 按 external service、mock 或 Element bridge 分流，上传由本进程处理。 |
| source 详情/连接测试/点位发现与列表、最小 ingestion job | **已实现（mock/Element）/ 部分实现（external）** | Fastify 有路由，mock 与 Element bridge 可闭环；纯 `BMS_API_BASE_URL` source 没有写入本地 owner map，后续按 id 反查项目会先失败，无法稳定到达预期 upstream 转发。 |
| collector 点位/时序读取与 Dashboard latest/history batch | **已实现** | Fastify 代理只读 GET；批量路由把单点失败隔离在各自 result 中。 |
| CSV/XLSX 临时上传与预览 | **已实现** | API 解码并写入 `.temp/bms-config/**`，返回最多 10 行预览和 25 个规范化点位；旧 `.xls` 只有警告，没有真实预览。 |
| Web「BMS Data Configuration」六步向导 | **部分实现** | 页面和部分调用可用，但更新配置、凭据、Agent Excel 分析等步骤调用不存在的 Fastify 路由；完成页也不是实时 job 状态。 |
| Agent 点位、历史与 enteliWEB live read | **已实现 + 外部能力** | 工具代码已存在；结果仍取决于 collector、现场系统、网络和服务端环境配置。 |
| 点位导入/更新与语义建议 | **规划中** | Web client 有方法或旧 client 明确返回 501，Fastify 没有对应实现。 |

不要把这些路径统称为“BMS 服务已完整接入”。`BMS_API_BASE_URL` 与 `BMS_DATABASE_API_URL` 表示不同外部边界；配置向导呈现的完整流程也不等于每一步已有服务端契约。

基线 Fastify 明确注册的 surface 是：`GET /api/bms/health`；`GET /api/bms/collector` 与 `GET /api/bms/collector/*`；`POST /api/bms/dashboard/{history-batch,latest-batch}`；`POST /api/bms/temp-upload`；`GET|POST /api/bms/sources`；`GET /api/bms/sources/:sourceId`；source 下的 `test-connection`、`discover-points`、`points`；以及 ingestion start、job status 和 results。这里的“路由已注册”不自动等于每个 backend 分支都能端到端完成。

## 2. 功能目的及边界

该集成负责四类工作：维护 BMS source 元数据；把外部 collector 的点位、最新值和历史序列安全地送入 Web/Agent；为 Dashboard 和派生指标提供原始读数；在明确的 server-side adapter 中执行现场即时读取。它不负责把 BMS 变成 BuildingAgent 的本地权威库，也不允许 LLM 或浏览器绕过服务端直接写现场点位。

本页所称“语义”有三层，不能混用：上传规范化时按点名/描述推断的 `semantic_class` 字符串；BMS 数据库返回的 description/object reference；FDD 或报告使用的 Brick/语义模型。基线没有 `/api/bms/semantic/suggest` 实现，因此一个 `semantic_class` 字段不代表已建立或验证完整 Brick 图。

## 3. 用户入口和关键源码入口

- Web 工作区入口与六步向导：[apps/web/src/ui/BmsDataConfig.tsx](../../../../apps/web/src/ui/BmsDataConfig.tsx)
- 向导实际使用的 client 与声明契约：[apps/web/src/bmsApiClient.ts](../../../../apps/web/src/bmsApiClient.ts)
- collector、Dashboard batch 浏览器 client：[apps/web/src/bmsCollectorClient.ts](../../../../apps/web/src/bmsCollectorClient.ts)
- Fastify 路由、临时上传解析和分流：[apps/api/src/server.ts](../../../../apps/api/src/server.ts)
- BMS source/point/job 服务端类型：[apps/api/src/bmsTypes.ts](../../../../apps/api/src/bmsTypes.ts)
- Element collector bridge：[apps/api/src/bmsDatabaseBridge.ts](../../../../apps/api/src/bmsDatabaseBridge.ts)
- collector URL 与代理：[apps/api/src/bmsCollectorUrl.ts](../../../../apps/api/src/bmsCollectorUrl.ts)、[apps/api/src/bmsCollectorProxy.ts](../../../../apps/api/src/bmsCollectorProxy.ts)
- 时序读取及 legacy fallback：[apps/api/src/bmsTimeseries.ts](../../../../apps/api/src/bmsTimeseries.ts)
- Agent BMS tools：[apps/api/src/agent/genericTools.ts](../../../../apps/api/src/agent/genericTools.ts)、[apps/api/src/agent/bmsLiveRead.ts](../../../../apps/api/src/agent/bmsLiveRead.ts)
- 可提交的环境变量名与空白占位：[.env.example](../../../../.env.example)

旧的 [BMS Data Config UI](../../../bms/BMS_DATA_CONFIG_UI.md) 是历史设计说明，其中“点位导入、凭据保存、首点即时验证均已连通”的叙述超过当前 Fastify 实现；请以本页的路由矩阵为现行依据。

## 4. 正常数据流

### 4.1 collector 和 Dashboard 读取

1. 浏览器携带 BuildingAgent bearer token 请求 `/api/bms/collector/*`，Fastify 去掉代理前缀后把 GET 转发到 `BMS_DATABASE_API_URL`；浏览器不直接访问 collector 端口。
2. 点位查询读取 catalog 中的 name、object reference、last value 和 last-polled time；时序 helper 优先访问统一 timeseries API，并在缺失/失败时退回 legacy readings API。Dashboard history batch 当前明确读取 poll readings 路径。
3. Dashboard batch 要求当前会话已选择项目和 `chat:read`。history 每批最多 32 条、latest 最多 64 条，并发度为 8；服务端把 name/object reference 解析为 point id，并把映射缓存 10 分钟。
4. 每个 query 单独返回 `ok`、数据或 error，所以一个离线点位不会使整批 HTTP 请求失败。派生指标 binding 则在当前项目的本地 Derived Metric store 中解析，不访问 collector。

### 4.2 source、上传与 ingestion

1. 用户在项目内上传 CSV/XLSX。Fastify 校验 token、membership 和 selected project，清理文件名、写入项目分区临时目录，并在服务端解析预览；上传结果本身不会把点位导入 source。
2. 向导创建 source。`project_element` 在 bridge 中创建/读取内存 source；mock 模式写入内存 map；其余请求转发给 `BMS_API_BASE_URL` 所指向的外部管理服务。
3. 连接测试和 discover/list points 沿同一分流执行。Element bridge 从 collector catalog 最多获取 500 个点位，并把外部字段映射为 `BmsPointSummary`。
4. ingestion test 接收 source id、point ids、sample count 和 interval。mock 生成确定性样本；Element bridge 从 collector 读取已有历史；external 模式交给 BMS 管理服务。job status/results 通过两个 GET 路由读取。

第 3–4 步描述的是预期分流；纯 external source 在当前基线中没有被缓存到本地 source-owner map，按 source/job id 的路由可能在转发前就返回 not found 或抛出 owner lookup 错误。因此 `BMS_API_BASE_URL` 的 health、source list/create 已连通，而后续详情/测试/ingestion 链路仍应标为 **部分实现**。

向导中的“24h / 7d / 30d / 1y”目前不会发送 `from`/`to` 日期范围，只会被换算为少量 `sample_count`，且 interval 固定为 2 秒。页面在 ingestion start 返回后立即显示静态“listener started / verified”文案，没有轮询 job 或 results；因此它是流程原型，不是运维状态屏。

### 4.3 Agent 即时读取

`bms_points_query` 和 `bms_timeseries_query` 通过 server-side collector catalog/history 工作；`bms_live_read` 先用 catalog 把 point name 或 object reference 解析为 API path，再由服务端使用环境配置访问 enteliWEB 并解析 present value。它不等同于 Web client 声明但缺失的 `/api/bms/points/test-live-values`。

## 5. 数据、状态及持久化

| 数据 | 位置/所有者 | 生命周期与权威性 |
| --- | --- | --- |
| 真实点位、poll/history 和现场 present value | 外部 collector / BMS / enteliWEB | **外部权威数据**；BuildingAgent 只读取或代理，不应声称本地副本更权威。 |
| external source/job 状态 | `BMS_API_BASE_URL` 对应服务 | 持久化与恢复语义由外部服务定义，本仓库未实现。 |
| mock source、mock job | `server.ts` 的进程内 `Map` | 进程重启即丢失；不写 `apps/data/store.json`。 |
| Element bridge source、发现点位、job/result | `BmsDatabaseBridge` 的进程内 `Map` | 进程重启后重新 seed source，发现/作业状态不恢复；真实序列仍由 collector 持有。 |
| 上传文件和预览 | 仓库根 `.temp/bms-config/<project>/<upload>/...` | 文件落盘，但基线没有 TTL、清理 job 或删除 API；返回的 temp token 只是相对定位符，不是访问凭据。 |
| Dashboard point-id 映射 | Fastify 进程内全局 cache | 最多 2048 项、10 分钟 TTL；按 lookup kind/value 键控，不是权威点位表。 |
| Web 表单、用户名/密码输入、步骤状态 | React component state | 刷新即丢失；不会写浏览器 local/session storage。由于 credentials 路由缺失，向导不能持久化凭据。 |

上传预览、source points 与 collector catalog 是三个不同集合。当前向导把上传预览中的 point ids直接交给 ingestion test，却没有先调用点位导入或 discover；在 mock/Element bridge 中，这些 id 可能不在 source 的 points map，因而可能得到零记录的“完成”job。扩展代码不得依赖“上传成功即已导入”的假设。

## 6. 权限与项目隔离

- `/api/bms/health` 只要求有效 token，不要求选择项目。
- 临时上传、source 列表/创建/详情、连接测试、点位发现/列表和 ingestion job 路由要求 membership 与 selected project；通过 source/job id 访问时，服务端先反查所属项目再校验。
- Dashboard latest/history batch 要求 selected project、membership 和 `chat:read`，且本地 derived metric 只在该 project id 下解析。
- `/api/bms/collector/*` 当前只校验 token，没有 membership、selected project 或细粒度读权限。它代理的是共享 collector catalog，因此不能把 URL 中没有 project id 的请求描述成项目隔离读取。
- source 创建、临时上传和 ingestion 等改变配置/临时状态的路由当前没有 `project:configure` 检查。这是已知权限差距，不是推荐的扩展模式。
- enteliWEB 身份信息只应存在于 API 进程环境中。不要把真实 URL、用户名、密码、bearer token 或客户点表写入文档、前端状态持久化、日志或仓库 fixture。

## 7. 错误、降级及外部依赖

- 未启用 bridge/mock 且没有 `BMS_API_BASE_URL` 时，管理 health/source 路径返回 BMS unavailable；collector 路径则使用 collector URL resolver 的本地默认值，依赖相应服务实际可达。
- Web BMS client 设有 8 秒超时；网络、abort 和非标准响应会被归一为 `bms_service_unavailable`。配置页会抑制这一类 banner，因此某些失败可能只表现为没有前进或没有状态更新。
- collector proxy 基本透传 HTTP status/content type；Dashboard batch 把查找、超时或单点网络失败写入该 query 的 error。调用方必须检查每项 `ok`，不能只检查批量请求为 200。
- CSV/XLSX 解析是轻量实现：只读取首个 worksheet 和有限预览；`.xls` 尚不解析。临时文件没有自动清理。
- mock 数据只验证契约和 UI，不代表现场精度、协议兼容性或写入能力。所有基线路径均应按 read-only 使用。
- enteliWEB live read 是真实网络外部能力，并解析特定 XML present-value 形态；鉴权、路径格式或响应变化都可能失败。环境 fallback 仅是公开本地 fixture，不是生产秘密或产品保证。

## 8. 扩展方法

新增 adapter 时，先决定它属于外部 `BMS_API_BASE_URL` 管理服务、只读 collector，还是仓库内 bridge；不要让三者隐式互相替代。服务端应先实现并测试 route、project/permission guard、schema、错误和持久化，再在两个 Web client 中暴露方法。写现场点位必须另立高风险权限、审计和确认流程；不能仅把 `read_only` 改为 false。

完成配置向导至少需要：实现 source PATCH 与安全的 credentials store；实现或删除 Excel analyze client；建立上传点位到 source 的 import/update 生命周期；为语义建议提供确定性依据和 provenance；实现 Web live-values endpoint 或明确复用 Agent tool；让 sync range 传递真实时间窗口并轮询 job/results。每项新增路由都应同时补充 [REST、SSE 与 WebSocket 契约](../architecture/api-events.md)和端到端 Fastify 测试。

## 9. 对应测试

- Fastify 鉴权、mock source、上传预览、ingestion 和 history batch：[apps/api/src/bms.test.ts](../../../../apps/api/src/bms.test.ts)
- collector URL/查询转发：[apps/api/src/bmsCollectorProxy.test.ts](../../../../apps/api/src/bmsCollectorProxy.test.ts)
- Agent catalog/history 与 fallback：[apps/api/src/agent/bmsQueryTools.test.ts](../../../../apps/api/src/agent/bmsQueryTools.test.ts)
- enteliWEB live read 集成：[apps/api/src/agent/bmsLiveRead.test.ts](../../../../apps/api/src/agent/bmsLiveRead.test.ts)
- Dashboard BMS/derived binding：[apps/api/src/dashboards.test.ts](../../../../apps/api/src/dashboards.test.ts)
- Web 工作区和配置向导：[apps/web/src/App.test.tsx](../../../../apps/web/src/App.test.tsx)

`App.test.tsx` 为页面 mock 了 credentials、point update 和 live-values 等响应，因此它只能证明 UI 在假定契约下的行为，不能证明 Fastify 已实现这些路由。`bmsLiveRead.test.ts` 依赖外部系统，连接失败时会提前返回；它不是可离线重复的完整门禁。

## 10. 已知限制及关联文档

以下 client 路径在基线 Fastify 路由中找不到对应实现；请求 BuildingAgent API 时应视为 **规划中**，而不是可用接口：

| Client 声明 | 方法和路径 | 当前影响 |
| --- | --- | --- |
| 更新 source | `PATCH /api/bms/sources/:sourceId` | source 首次创建后再次保存配置会失败。 |
| 保存凭据 | `POST /api/bms/sources/:sourceId/credentials` | 向导的 Save Credentials 不会形成服务端凭据记录。 |
| Agent/Excel 分析 | `POST /api/bms/import/excel/analyze` | Review Config 的 Run Agent 不可由当前 Fastify 完成。 |
| 导入点位 | `POST /api/bms/points/import` | 上传预览不会成为 source point inventory。 |
| 更新点位 | `PATCH /api/bms/points/:pointId` | 规范化字段和语义类不能经该 client 保存。 |
| 语义建议 | `POST /api/bms/semantic/suggest` | `semantic_class` 只有上传/bridge 的轻量映射，没有建议服务。 |
| Web live-values 测试 | `POST /api/bms/points/test-live-values` | 不能用配置页 client 验证导入点位；Agent 的 `bms_live_read` 是另一条实现。 |

另外，`bmsCollectorClient.ts` 声明的无鉴权 `/bms` 公共前缀依赖仓库外的反向代理部署，Fastify 本身没有该路由，应标为 **外部能力**。继续阅读 [Derived Metrics 与 KPI](derived-metrics-kpi.md)、[Dashboards 与 Reports](dashboards-reports.md)、[FDD Brick 映射及可部署性](../fdd/brick-deployability.md)和[排障与已知契约差距](../development/troubleshooting.md)。
