# 排障和已知契约差距

[English](../../en/development/troubleshooting.md) | [开发者文档首页](../README.md) | [配置与本地运行](configuration.md) | [测试与验证](testing.md)

> 产品代码基线：`main@af44ff15`。状态：本页是已实现路径与已知差距的排障索引；它记录可核对的边界，不表示 M011 修复了业务代码、外部服务或部署问题。

## 1. 状态与代码基线

排障前先确认正在运行的代码、文档和数据属于同一基线。产品 `main@af44ff15` 的 Web、CLI、Fastify、Chat/Agent、Dashboard 和本地存储路径已经存在，但下列名称相近的能力并不都形成产品闭环。

| 责任域 | 状态 | 排障时必须保留的事实边界 |
| --- | --- | --- |
| 鉴权、项目选择、同步 Chat 与 SSE | **已实现** | `401`、membership、selected-project、permission 和 provider failure 是不同错误层。 |
| BMS | **已实现 + 部分实现 + 外部能力** | collector 只读查询、mock/Element bridge 与部分 source 路由存在；七个 Web client 路由没有 Fastify provider，真实 BMS 仍在仓库外。 |
| Derived Metrics / Dashboard | **已实现但有隔离差距** | SQLite 指标与 Dashboard batch 可用；部分直接 `instanceId` 的 Agent 工具路径缺少再次核对项目归属。 |
| AutoReport / 服务端 Reports | **部分实现 / 规划中** | 浏览器 AutoReport 与受测的服务端报告库是两条未装配的路径；`server.ts` 没有报告执行 API。 |
| FDD | **产品仅部分消费；候选未合并** | `main` 只有 Reports 的 `fdd_rule` 证据消费者；M007 的 catalog、runtime、Task 和 `198 / 59 / 111` 是固定候选快照。 |
| Scheduler / Realtime / STT | **已实现 + 部分实现 + 外部能力** | 一次性提醒和项目 WebSocket 可用；recurring、任务面板和 STT 配置闭环不完整。 |
| 验证自动化 | **本地命令已存在；CI 规划中** | 仓库没有实际 `.github/workflows/**`；本地通过或 Web bundle warning 不能替代托管 CI 结果。 |

“路由已声明”“库测试通过”“候选分支有实现”和“产品端到端可用”是四种不同证据。排障结论必须注明依据的是 product main、浏览器 client、外部服务，还是未合并候选提交。

## 2. 功能目的及边界

本页用于把症状定位到最窄的责任层，并给出不会扩大事故面的检查方式。推荐按以下顺序分类：

1. **客户端状态**：API origin、CLI config、bearer、当前页面和本地 selected project 是否一致。
2. **服务端授权**：token、membership、selected-project 和 permission 中哪一层拒绝了请求。
3. **契约提供方**：请求由 Fastify、collector、`BMS_API_BASE_URL`、LLM 或其他外部服务中的谁提供。
4. **数据所有者**：状态属于 `apps/data/store.json`、根 `data/**`、进程内 cache，还是外部 BMS/LLM。
5. **验证环境**：命令是否在干净 worktree、隔离 data root 和正确 workspace/source 目录中运行。

本页不替代生产 incident runbook、备份/恢复方案、凭据轮换或现场 BMS 操作规程，也不授权绕过项目校验、补造 FDD 结果、手工写指标数据库或把前端声明当作服务端实现。若需要提交证据，只保留 status、稳定 `error.code`、脱敏后的 `requestId`、路由形状和基线 commit；不要粘贴 bearer、API key、密码、完整 `.env`、CLI config、客户点表、消息正文或私有地址。

## 3. 用户入口和关键源码入口

| 检查面 | 最小安全入口 | 关键源码或现行文档 |
| --- | --- | --- |
| 进程与 Chat provider | `GET /health`，再核对非秘密 provider mode/code | [providers.ts](../../../../apps/api/src/providers.ts)、[server.ts](../../../../apps/api/src/server.ts)、[Chat 与 Agent Runtime](../features/chat-agent-runtime.md) |
| 身份与所选项目 | `GET /api/session`、`GET /api/projects`、项目 select 路由；不要输出 header | [auth.ts](../../../../apps/api/src/auth.ts)、[鉴权、项目与会话](../features/auth-projects-conversations.md) |
| 两个数据根 | 核对解析后的目录和文件存在性，不读取或上传内容 | [persistence.ts](../../../../apps/api/src/persistence.ts)、[knowledgeBase.ts](../../../../apps/api/src/agent/knowledgeBase.ts)、[运行时与存储拓扑](../architecture/runtime-storage.md) |
| BMS | 先区分 Fastify、collector、mock、Element bridge 与 external management mode | [bmsApiClient.ts](../../../../apps/web/src/bmsApiClient.ts)、[bmsCollectorProxy.ts](../../../../apps/api/src/bmsCollectorProxy.ts)、[BMS 集成](../features/bms-integration.md) |
| 指标、Dashboard、Reports | 核对资源类型、项目 id 和调用的是 Web 还是库组件 | [derivedMetrics.ts](../../../../apps/api/src/derivedMetrics.ts)、[dashboards.ts](../../../../apps/api/src/dashboards.ts)、[reports/](../../../../apps/api/src/reports)、[Dashboards 与 Reports](../features/dashboards-reports.md) |
| Scheduler、SSE、WS、STT | 记录 event name、payload JSON 类型和 error code，不记录消息/音频正文 | [scheduler.ts](../../../../apps/api/src/scheduler.ts)、[api.ts](../../../../apps/web/src/api.ts)、[接口与事件](../architecture/api-events.md) |
| CLI | `config-path` 与脱敏后的 `session` 输出 | [config.ts](../../../../apps/cli/src/config.ts)、[commands.ts](../../../../apps/cli/src/commands.ts)、[CLI](../features/cli.md) |
| 验证命令 | 从仓库根按各 workspace 的实际 Vitest 配置执行测试，再运行 typecheck、build 和 smoke 诊断 | [package.json](../../../../package.json)、[run-tests.cjs](../../../../scripts/run-tests.cjs)、[smoke-local.cjs](../../../../scripts/smoke-local.cjs) |

`/health` 只证明当前 HTTP 进程可响应，不证明 token、项目、LLM、collector、BMS、STT 或报告流水线健康。浏览器 banner 也可能把多个上游问题归一成同一文案，因此优先使用结构化 code、HTTP status 和 request id 关联服务端日志。

## 4. 正常数据流

对一个可复现症状采用以下最小排障流，避免一开始就修改数据或切换多个开关：

1. 记录当前 commit、启动命令、API/Web origin、发生时间和一个脱敏 `requestId`；确认请求实际命中了预期进程。
2. 用 `/health` 区分“进程不可达”与“业务依赖失败”。若 Web 可打开但 API 失败，先核对 Web 的 API base URL，而不是修改业务数据。
3. 对受保护请求，用 `session -> projects -> select` 重建授权上下文；依据 `error.code` 区分 token、membership、selected-project 和 permission。
4. 沿调用方向确认提供方：Web/CLI → Fastify route → 本地 service/adapter → 外部 provider。若 Fastify 没有路由，外部服务正常也不能补足该契约。
5. 确认所观察状态的权威位置和项目作用域。不要通过删除 SQLite、复制 `store.json` 或改写客户文件来“验证”猜测。
6. 在隔离环境运行最窄测试；只有复现稳定后才扩大到 workspace、build 和 smoke。保留命令、退出码和失败测试名，删除输出中的秘密和客户内容。

| 症状 | 检查 | 边界 / 处理 |
| --- | --- | --- |
| Web 可加载，但 Chat 返回 `provider_error` | `/health` 后核对 `BUILDING_AGENT_LLM_PROVIDER`、是否存在 API key、fallback 是否显式启用 | 这通常不是 Web 可达性问题。无 key 不会自动选择 mock；本地确定性路径须显式设置 provider 为 `mock`。 |
| 同一路由有时 `401`、有时 `403` | 记录 `auth_missing/auth_invalid`、`project_forbidden` 或 `project_not_selected`，再核对 session 和 URL project | 不要反复登录或把 project id 当凭据；按第 6 节逐层恢复上下文。 |
| UI 显示一个能力，但调用得到 `404/405/501` | 在 `server.ts` 搜索准确 method/path，并核对是否由 collector 或外部 service 提供 | client method 只证明消费者能发请求；缺少 provider 时按已知契约差距记录。 |
| 单元测试通过但页面没有可调用入口 | 区分纯库测试、Fastify route 测试和 Web mock | Reports/FDD 尤其不能由库或候选测试推导出产品 route。 |

## 5. 数据、状态及持久化

| 症状 | 检查 | 边界 / 处理 |
| --- | --- | --- |
| 修改 `BUILDING_AGENT_DATA_DIR` 后用户、项目或对话仍来自旧位置 | 核对 `apps/data/store.json` 与配置后的根 `data/**` 两边；只比较路径、mtime 和非敏感计数 | 环境变量只移动项目文件/SQLite/Memory/Scheduler 根，不移动 [persistence.ts](../../../../apps/api/src/persistence.ts) 固定的 SeedStore。两个根没有统一事务或恢复。 |
| KB/Repository 文件存在但搜索不到，或索引看起来“丢失” | 先确认项目目录，再区分来源文件与 `session_index.db`、`grounding_index.db` 等可重建索引 | 不要删除来源文件；只有明确标成可重建的索引才可按专门流程重建。`derived_metrics.db` 不是通用 cache。 |
| API 重启后 BMS mock/source/job、WebSocket 订阅或 Dashboard 点位 cache 消失 | 核对运行模式与进程重启时间 | 这些状态全部或部分位于进程内存；外部 BMS/collector 才是现场数据权威方。不要把 cache 消失解释为现场数据删除。 |
| Scheduler job 重启后缺失或状态异常 | 核对配置后的 data root 中 `scheduled_jobs.json` 是否可解析，并只记录 job id/status/time | JSON 是 best-effort 本地状态，不是多实例队列。文件可能含项目消息，不应复制到 issue。 |
| CLI 指向错误 API/项目，或报 `config_parse_failed` | 运行构建后的 `config-path`，并使用 `session` 的脱敏 config；核对 `BUILDING_AGENT_CLI_HOME` | 配置默认是 home 下明文 JSON，token 仅在输出中脱敏。用隔离 CLI home 重现；不要粘贴或共享原 config。并发写入也可能覆盖项目选择。 |
| 测试改变了本地项目文件或结果依赖旧 fixture | 检查是否使用干净 worktree、临时 `BUILDING_AGENT_DATA_DIR` 和隔离 CLI home | 不在含真实 KB、客户输出或活动 `store.json` 的目录跑有写入行为的测试；先复制非敏感 fixture 到临时环境。 |

`apps/data/store.json` 是本地用户、token、项目、消息、conversation 和 Dashboard 等状态的权威快照；根 `data/<project>/**` 则包含 KB、Repository、outputs、Memory、SQLite 和调度文件。前者损坏时回退 seed 只是一种本地降级，不能当作生产恢复成功。真实客户文件、BMS 导出、transcript、报告产物和连接凭据必须遵守部署方的数据分类、保留和访问策略。

## 6. 权限与项目隔离

| 症状 | 检查 | 边界 / 处理 |
| --- | --- | --- |
| `401 auth_missing` / `auth_invalid` | 检查 header 是否存在、token 是否属于当前 API store、是否过期；只记录 code 和 request id | 重新取得合法 token；不要把 token 放进 URL、日志、截图或 issue。 |
| `403 project_forbidden` | 用项目列表确认 membership，再确认所需 `chat:read/chat:write/project:configure` | 选择项目不能创建 membership 或 permission；不要通过修改浏览器 state 绕过。 |
| `403 project_not_selected` | 比较 `/api/session` 的 selected project 与 URL project，再调用正式 select 路由 | Web/CLI 本地 `selectedProjectId` 只是便利状态，服务端 session 才是 REST/Chat guard 的依据。重复登录不会清除现有选择。 |
| WebSocket 能连接 URL 项目，但 REST/SSE 报项目未选择 | 核对 upgrade 的 membership 与 `chat:read`，以及 REST session 的 selected project | 这是现行契约差异：WS 不调用 selected-project guard，但仍按 URL 项目分桶。不能用 WS 成功证明 REST 授权正确。 |
| Derived Metric 通过直接 `instanceId` 读/写时疑似跨项目 | 从可信的当前项目 `metricKey + entityId` lookup 和 Dashboard batch 重新核对 instance 所属项目 | `derived_metric_read` 的直接 id 路径与 `record_sample` 缺少一致的项目再校验。停止使用可疑 id并作为隔离差距上报；不要暴露指标值或手工改 SQLite。 |
| collector 或 STT API 在没有 selected project 时仍响应 | 核对实际 route guard，而不是套用一般项目路由假设 | `/api/bms/collector/*` 主要校验 token；STT 路由只要求 session。它们是已知权限边界，不证明外部数据按 tenant 隔离。 |

任何跨项目疑似泄露都应先停止进一步读取，把证据缩减为匿名 project/instance 标识、route、status、code、request id 和 commit，再按安全流程升级。不要为了复现而访问另一个客户项目。

## 7. 错误、降级及外部依赖

### 7.1 Provider 与 BMS

| 症状 | 检查 | 边界 / 处理 |
| --- | --- | --- |
| 未配置 LLM 时 Chat 失败 | 确认没有 key，且 `BUILDING_AGENT_LLM_PROVIDER` 未显式设为 `mock`；同步路径通常返回 `502 provider_error`，SSE 发 `error` 后关闭 | 这是 fail-closed 的预期行为。离线开发设置 `BUILDING_AGENT_LLM_PROVIDER=mock`；真实调用配置受信的 OpenAI-compatible endpoint。fallback 只有显式允许时启用，不能静默当产品结果。 |
| 已配置 provider 但超时、429 或 5xx | 记录脱敏的 provider code/status/model 与 request id，核对 base URL、模型和网络 | API 会对部分错误重试；允许 fallback 时结果会标记 mock/fallback reason。不要记录 key 或上游原始敏感响应。 |
| BMS 向导在更新配置、保存凭据或导入点位时失败 | 对照 method/path：`PATCH /sources/:id`、credentials、Excel analyze、point import/update、semantic suggest、Web live-values 均没有基线 Fastify route | 标记为 **规划中**，不是现场故障。不得临时把凭据写入前端、fixture 或日志。完整矩阵见 [BMS 集成](../features/bms-integration.md)。 |
| external source 创建/列表成功，但详情、连接测试或 ingestion 随后找不到 source/job | 核对是否为纯 `BMS_API_BASE_URL` mode，以及本地 owner map 是否包含该 id | 当前 external create/list 可转发，但远端 source 没有进入本地 owner cache；后续 owner lookup 可能在转发前失败。这是 **部分实现**，不能靠伪造本地 owner 记录作为正式处理。 |
| collector/enteliWEB/现场值不可达 | 分别检查 Fastify proxy、collector URL、只读 point path 和外部服务健康 | mock 只验证契约，不能证明现场精度或可写性；BuildingAgent 基线路径按只读处理。 |

### 7.2 Reports 与 FDD

| 症状 | 检查 | 边界 / 处理 |
| --- | --- | --- |
| Reports 单元测试通过，但 Web 只有 AutoReport 或 API route 不存在 | 核对调用的是 `AutoReport.tsx`、`apps/api/src/reports/**` 库，还是 Fastify route | 浏览器 AutoReport 聚合 Dashboard 并 `window.print()`；服务端 kernel 尚未装配 REST、运行记录、调度、产物和下载。两者不能互相证明可用。 |
| 在 `main` 找不到 FDD catalog、evaluator、Task 或 `/api/fdd/**` | 核对 commit 和 [FDD 总览](../fdd/overview.md) 的双基线 | 这是产品基线的预期边界：`main` 只有 Reports 的外部 `fdd_rule` 证据消费契约。不要把缺少 M007 文件报成运行时损坏。 |
| 看到 `198 / 59 / 111` 或“52 项 FDD 测试通过”，但当前 main 无对应文件 | 核对证据是否固定到未合并 M007 commit和独立干净 worktree | 数量和历史测试只证明候选快照；它们不是 `main` API 返回值、CI 结果、准确率或部署保证。 |

### 7.3 SSE、WebSocket、Scheduler 与 STT

| 症状 | 检查 | 边界 / 处理 |
| --- | --- | --- |
| recurring Chat 的 SSE `done` payload 是字符串，而普通 Chat 是对象 | 记录 event name 与 JSON 类型，并与一次性提醒/普通 Chat 对比 | recurring 快速分支先 stringify，通用 writer 再 stringify，属于已知二次编码差距。不要把它误判成 provider 内容，也不要让通用 client 无限制重复解析。 |
| 重复提醒只触发一次、停机后错过，或右侧任务卡不一致 | 核对 job recurrence/status、timer/ticker 路径和页面是否仍使用 `MOCK_TASKS` | recurring advance 仅部分实现；任务面板不是 Scheduler read model。不要用于关键告警、SLA 或 exactly-once 工作。 |
| WebSocket 漏事件或重连后没有历史 | 核对 URL project、membership、`chat:read`、重连和重新订阅 | WS 是单实例、进程内、无 durable replay 的 best-effort 通道；持久消息可由 Chat 轮询补取，通用事件不能假设可恢复。 |
| STT 返回 `stt_unavailable/stt_auth_failed/stt_failed` | 依次检查浏览器 microphone/secure context、WAV 内容、body limit、`DASHSCOPE_API_KEY` 和外部网络 | STT 没有 deterministic mock、本地模型或第二 provider fallback；模型 helper 当前固定 Paraformer。不要上传真实录音用于公共 issue 复现。 |

## 8. 扩展方法

把新差距记录成最小可执行 issue，而不是在排障页暗示兼容层已经存在。建议证据包只包含：产品 commit、匿名环境、准确 method/path、预期/实际 status 与 `error.code`、一个脱敏 request id、最小 fixture、是否在干净 worktree复现，以及责任层判断。若涉及 SSE/WS，再加入 event name、顺序和 payload 的 JSON 类型；若涉及存储，只加入目录类别和非敏感计数。

修复 client/server 契约时必须同时更新 route、runtime validator、permission/project ownership、错误码和集成测试，不能只在 Web client 增加 method。存储变更必须声明权威方、迁移、备份、项目作用域和秘密处理。Provider/BMS/STT adapter 必须显式呈现实际 provider 与 fallback，不得把 mock 标成现场成功。Reports 或 FDD 产品化需要独立装配和权限设计，不能直接复制未合并候选路由。

文档发现事实错误时可以修正文档和状态标签；任何业务代码、API、schema、CI、依赖或数据迁移修改都超出 M011，应另建 issue/branch/PR 并按风险验证。

## 9. 对应测试

| 症状 | 检查 | 边界 / 处理 |
| --- | --- | --- |
| 根 `npm test` 运行重复/旧测试，或命中 `dist.predeploy-*`、`dist.prehotfix-*` | 检查 workspace 下是否有未跟踪的 `dist.pre*` 备份目录，并分别比较 API、CLI、Web 的收集列表 | 脏工作区的根测试不是可信基线。不要为了测试删除用户备份；改用干净 worktree 和下方各 workspace 的准确命令。 |
| 测试接触真实 KB、project feedback 或本地配置 | 核对 `BUILDING_AGENT_DATA_DIR`、SeedStore fixture、CLI home 和工作目录 | 使用临时数据根/配置；不要让测试指向客户资料或活动本地状态。根 `npm test` 只在无真实本地 KB 与备份 dist 的干净环境考虑使用。 |
| 干净 checkout 的 API 门禁有两项 bldg40 相关失败 | 检查失败是否来自代码硬编码引用、但 clean checkout 缺失的 KB Turtle/PNG fixture | 这两项用例在补入受控 fixture 后定向复跑为 2/2 通过；完整 API 门禁仍有 3 项既有失败。只可使用仓库公开或一次性生成的最小 fixture；不得从原工作树复制客户 KB、图片或输出，也必须分别记录原始 clean checkout 与受控 fixture 结果。 |
| CLI 门禁只通过 8/9 | 使用 `--no-file-parallelism` 取得稳定结果，并检查 authenticated Chat 用例的 provider contract | 当前一项失败来自无 provider/key 时产品 fail-closed，而测试仍期待成功 Chat 的契约差异；记录为既有基线失败，不通过修改环境、测试或业务代码伪装全绿。 |
| Web 使用 `--dir src` 显示 0 collected | 检查 [vite.config.ts](../../../../apps/web/vite.config.ts) 的 `include`，改用 workspace 普通 `vitest run` | Web 的 include 已限定 `src/**/*.test.ts(x)`；额外 `--dir src` 会改变 Vitest root 并实测收集不到文件，不能把 0 collected 当通过。 |
| `npm run build` 显示 Web chunk 超过 500 kB | 先检查退出码、三个 workspace build 和产物是否完成 | 这是 Vite bundle-size warning，不是当前构建失败；性能优化仍需单独 issue，不能把 warning 记为通过的性能验收。 |
| 本地全绿但仓库页面没有 checks | 检查是否实际存在 GitHub Actions workflow | 基线没有 CI workflow；必须报告为“本地验证”，不能写成“CI 通过”。 |
| smoke 的 Chat 在无凭据环境失败；显式 mock 后仍在 Chat 断言失败 | 先确认没有复用端口上旧 API，再比较 provider metadata、assistant 固定文本与 smoke 所要求的 prompt 回显 | 无 provider/key 时 product main 会 fail closed；显式 mock 虽能走到 Chat 并返回 deterministic-mock metadata，但 `local_default` 文本固定为 provider-unavailable 提示，不回显 smoke prompt，因此最终内容断言仍失败。两个结果都必须如实记录，不能把显式 mock 写成 smoke 通过方法。 |

推荐从仓库根、干净 worktree 执行：

```bash
npm --workspace @building-agent/api exec -- vitest run --dir src
npm --workspace @building-agent/cli exec -- vitest run --dir src --no-file-parallelism
npm --workspace @building-agent/web exec -- vitest run
npm run typecheck
npm run build
npm run smoke
BUILDING_AGENT_LLM_PROVIDER=mock npm run smoke
```

两条 smoke 命令用于区分“provider 未配置”和“显式 mock 固定回复”两个失败阶段，不是两个预期通过的门禁。命令结果、既有基线失败集合和 FDD 候选测试的解释以[测试与验证](testing.md)为准。失败时保存测试文件名、用例名、退出码和已脱敏错误；不要上传 `store.json`、SQLite、CLI config、`.env`、录音或客户 fixture。测试“通过”也不能弥补未覆盖的 recurring、STT、真实 WebSocket、外部 BMS 或未装配 Reports API。

## 10. 已知限制及关联文档

- 本页记录的 contract/guard/runtime 差距在 M011 中不会被业务修复；状态可能在后续 commit 改变，排障时必须重新核对产品基线。
- 无 provider key 时不会自动进入 mock；explicit mock 和 opt-in fallback 是不同运行模式。
- 两个数据根没有统一迁移、事务或备份；CLI config、scheduler JSON 和多种 cache 还有各自生命周期。
- BMS client 的七个缺失 route、external source owner cache、Derived Metric 直接 instance id 的项目校验均是已知差距。
- Web AutoReport 不等于服务端 Reports kernel；产品 main 的 FDD consumer 也不等于未合并 M007 producer/runtime。
- recurring Scheduler、SSE `done`、WS selected-project、静态任务面板和 STT provider/model 均有明确限制。
- Web bundle 大小 warning 尚未变成性能门禁；仓库也没有实际 CI workflow。

继续阅读[当前实现架构](../architecture/current-architecture.md)、[运行时与存储拓扑](../architecture/runtime-storage.md)、[REST、SSE 与 WebSocket 契约](../architecture/api-events.md)、[BMS 集成](../features/bms-integration.md)、[Derived Metrics 与 KPI](../features/derived-metrics-kpi.md)、[Dashboards 与 Reports](../features/dashboards-reports.md)、[Scheduler、Realtime 与 STT](../features/scheduler-realtime-stt.md)和 [FDD 验证与样本溯源](../fdd/verification-provenance.md)。
