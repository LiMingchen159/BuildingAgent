# 配置与本地运行

[English](../../en/development/configuration.md) | [开发者文档首页](../README.md) | [运行时与存储拓扑](../architecture/runtime-storage.md)

> 产品代码基线：`main@af44ff15`。状态：npm workspaces、API/Web/CLI 本地入口、根 `.env` 读取和显式 mock provider 为 **已实现**；真实 LLM、BMS collector/管理服务、enteliWEB 与 STT 为 **外部能力**；统一配置校验、生产级身份/秘密管理和多实例存储为 **规划中**。

## 1. 状态与代码基线

本仓库是一个根 npm workspace，包含 `@building-agent/api`、`@building-agent/web` 和 `@building-agent/cli`。根脚本只负责编排 workspace；运行时配置仍分散在 API 环境变量、Vite 构建变量和 CLI 用户配置中，没有单一配置 schema 或启动前完整校验。

| 能力 | 状态 | 基线事实 |
| --- | --- | --- |
| 根依赖安装、workspace build/typecheck/test 编排 | **已实现** | 根 [package.json](../../../../package.json) 声明三个 workspace；锁文件为 npm lockfile v3。 |
| API 热重载与根 `.env` 读取 | **已实现** | [index.ts](../../../../apps/api/src/index.ts) 用 `tsx watch` 启动，并以轻量 `KEY=value` parser 读取首个可用 `.env`。 |
| Web Vite 开发服务器及本地代理 | **已实现** | [vite.config.ts](../../../../apps/web/vite.config.ts) 默认代理 `/api`、`/health` 和 `/bms`。 |
| CLI 构建、本地 JSON 配置和脱敏诊断 | **已实现** | CLI 没有 watch/dev 脚本；先构建，再运行生成的 Node 入口。 |
| deterministic mock chat | **已实现且必须显式选择** | `BUILDING_AGENT_LLM_PROVIDER=mock` 直接选择 mock；“没有 key”本身不会选择 mock。 |
| LLM、embedding、BMS、enteliWEB、STT | **外部能力 / 部分实现** | 本仓库实现 adapter 或 proxy；网络、凭据、协议和数据权威性由外部系统决定。 |
| 生产配置与秘密管理 | **规划中** | 没有集中式 secrets manager、配置 schema、启动期连通性检查或按项目 provider 凭据库。 |

本页核对的主要事实入口是 [.env.example](../../../../.env.example)、根及三个 workspace 的 `package.json`、[providers.ts](../../../../apps/api/src/providers.ts)、[server.ts](../../../../apps/api/src/server.ts)、[persistence.ts](../../../../apps/api/src/persistence.ts)、[knowledgeBase.ts](../../../../apps/api/src/agent/knowledgeBase.ts) 和 [CLI config.ts](../../../../apps/cli/src/config.ts)。

## 2. 功能目的及边界

本页给出从干净 checkout 启动本地 API、Web 和 CLI 的最小可信路径，并说明每个配置值由谁读取、影响哪个数据根、失败时是否降级。它面向开发和验证，不是生产部署手册。

本页不承诺：

- 本地 SeedStore、SQLite 和 JSON 文件适合多实例、容器滚动升级或灾备；
- 仓库内 seed 账户、token、BMS demo 默认值可以用于真实环境；
- 设置一个 BMS URL 就会补齐前端声明但 Fastify 尚未实现的接口；
- 缺少 LLM key 时会静默获得 mock 回答；
- Vite dev proxy、明文 HTTP 或本地 CLI token 文件满足生产网络和秘密管理要求；
- `BUILDING_AGENT_KNOWLEDGE_BASE_DIR` 会搬迁所有项目文件，或 `BUILDING_AGENT_DATA_DIR` 会搬迁 `apps/data/store.json`。

生产部署至少还需要 TLS/reverse proxy、独立身份与秘密管理、数据卷/备份、日志脱敏、来源 allowlist、健康检查和明确的 CORS 策略。

## 3. 用户入口和关键源码入口

### 3.1 前置环境与安装

- Node.js **20 或更高版本**；这是根 `engines.node` 的唯一硬版本约束。
- 带 workspace 支持的 npm。仓库提交 `package-lock.json`，干净环境优先使用 `npm ci`。
- 安装依赖和外部 provider/collector 时所需的网络；若当前平台没有 `better-sqlite3` 预编译包，还需要本机原生构建工具链。
- 默认空闲端口：API `127.0.0.1:3000`、Vite 通常 `127.0.0.1:5173`、可选本地 BMS collector `127.0.0.1:8765`。

从仓库根执行：

~~~bash
npm ci
~~~

只有在有意更新依赖树或 lockfile 时才使用 `npm install`。`.env.example` 是变量清单和公开 fixture，不是应原样用于生产的配置。真实本地值写入被 Git 忽略的根 `.env`，或由进程环境注入。

### 3.2 workspace 与运行入口

| 命令 | 实际作用 | 注意事项 |
| --- | --- | --- |
| `npm run dev` / `npm run dev:api` | 运行 API 的 `tsx watch src/index.ts` | 根 `dev` **只启动 API**，不会并行启动 Web。 |
| `npm run dev:web` | 启动 Vite 开发服务器 | 默认相对 `/api` 和 `/health` 请求经代理到 `127.0.0.1:3000`。 |
| `npm run build` | 依次构建存在 build 脚本的三个 workspace | Web 同时执行 TypeScript 检查与 Vite bundle；CLI/API 输出到各自 `dist`。 |
| `npm run typecheck` | 对三个 workspace 执行 `tsc --noEmit` | 不启动服务，也不证明外部连通性。 |
| `npm test` | 由 [run-tests.cjs](../../../../scripts/run-tests.cjs) 编排 workspace Vitest | 脏树可能被额外 `dist.pre*` 目录干扰；API、CLI、Web 的可信参数组合不同，见第 9 节。 |
| `npm run smoke` | build 后尝试检查 API、Web 和 CLI 主链 | 会登录、选择项目并写 Chat；基线还存在 mock 文本断言不一致，不能作为绿色门禁。 |

CLI 编译结果位于 `apps/cli/dist/apps/cli/src/index.js`，因为其 TypeScript `rootDir` 同时覆盖 CLI 与复用的 API 类型。CLI 命令和本地配置详见 [CLI](../features/cli.md)。

### 3.3 配置源码

| 配置域 | 读取入口 |
| --- | --- |
| API host、port 与根 `.env` | [apps/api/src/index.ts](../../../../apps/api/src/index.ts) |
| Chat provider、fallback、重试和脱敏 | [apps/api/src/providers.ts](../../../../apps/api/src/providers.ts)、[apps/api/src/server.ts](../../../../apps/api/src/server.ts) |
| Embedding adapter | [apps/api/src/embeddingProvider.ts](../../../../apps/api/src/embeddingProvider.ts) |
| 项目数据根和 KB/Repository | [apps/api/src/agent/knowledgeBase.ts](../../../../apps/api/src/agent/knowledgeBase.ts) |
| SeedStore 固定路径 | [apps/api/src/persistence.ts](../../../../apps/api/src/persistence.ts) |
| BMS 管理、collector 与 enteliWEB | [apps/api/src/bmsCollectorUrl.ts](../../../../apps/api/src/bmsCollectorUrl.ts)、[apps/api/src/elementEnteliConfig.ts](../../../../apps/api/src/elementEnteliConfig.ts)、[apps/api/src/server.ts](../../../../apps/api/src/server.ts) |
| Vite API/BMS public prefix | [apps/web/src/api.ts](../../../../apps/web/src/api.ts)、[apps/web/src/bmsCollectorClient.ts](../../../../apps/web/src/bmsCollectorClient.ts) |
| CLI home、token 和选中项目 | [apps/cli/src/config.ts](../../../../apps/cli/src/config.ts) |

## 4. 正常数据流

### 4.1 使用显式 mock 的本地主路径

在两个终端中从仓库根运行：

~~~bash
# Terminal 1: deterministic local Chat; no external LLM call.
BUILDING_AGENT_LLM_PROVIDER=mock \
BUILDING_AGENT_LLM_ALLOW_FALLBACK=false \
npm run dev:api

# Terminal 2: keep VITE_API_BASE_URL unset to use the checked-in same-origin dev proxy.
npm run dev:web
~~~

API 默认监听 `http://127.0.0.1:3000`。浏览器打开 Vite 输出的 URL；`GET /health` 可作为 API 启动探针。登录后必须选择一个有 membership 的项目，项目 Chat 才能写入。

CLI 没有 dev script：

~~~bash
npm --workspace @building-agent/cli run build
BUILDING_AGENT_CLI_HOME=/tmp/building-agent-cli-dev \
  node apps/cli/dist/apps/cli/src/index.js help
~~~

`BUILDING_AGENT_CLI_HOME` 只改变 CLI 配置位置，不改变 API 数据根。不要把包含 bearer token 的真实 CLI home 放进共享目录。

### 4.2 `.env` 与进程环境的解析顺序

API 从若干相对于编译入口或当前目录的位置查找根 `.env`，读取**第一个可打开的文件**。parser 只支持去除首尾空白后的 `KEY=value`；它不实现 shell `export`、引号去除、变量展开、多行值或行内注释。已经存在于 `process.env` 的键优先，`.env` 不覆盖它。

因此：

1. shell、容器或服务管理器注入的值优先于根 `.env`；
2. 修改 `.env` 后应重启 API，不能假设所有模块会热加载新值；
3. server-only key 不得使用 `VITE_` 前缀；Vite 会把 `VITE_*` 暴露给浏览器 bundle；
4. 默认 Vite 代理要求浏览器使用相对 URL。若设置 `VITE_API_BASE_URL` 为另一 origin，当前 Fastify 没有启用 CORS，必须由同源 reverse proxy 或外部 CORS 层解决；
5. CLI 不读取根 `.env` 作为账户配置，它把 API URL、token 和 selected project 写入自己的 JSON。

### 4.3 Chat provider 的真实选择语义

| 配置 | 实际行为 |
| --- | --- |
| `BUILDING_AGENT_LLM_PROVIDER=mock` | 立即选择 deterministic mock，不查看真实 provider key；响应标记 `mode: mock`、`fallbackUsed: true` 和 `fallbackReason: local_default`。 |
| `openai-compatible`（或未显式 provider）+ 非空 key | 使用 OpenAI-compatible `/chat/completions` adapter；model/base URL 分别使用配置或代码默认值。 |
| 无 key，fallback 未开启 | resolver 返回 `provider-not-configured` adapter；Chat 执行时失败，不会自动 mock。同步路由返回 `502 provider_error`，流式路由发出 error event。 |
| 无 key，`BUILDING_AGENT_LLM_ALLOW_FALLBACK=true` | 首次 provider 调用以 `provider_not_configured` 失败后，Chat 路径显式切换 deterministic mock。 |
| 真实 provider 失败，fallback 未开启 | 重试耗尽后返回结构化 provider 失败，不保存未完成的用户 turn。 |
| 真实 provider 失败，fallback 开启 | 记录脱敏诊断，再以失败 code 作为 `fallbackReason` 运行 mock。 |

[.env.example](../../../../.env.example) 中“留空 key 使用 fallback”的注释成立，是因为同一文件还显式设置了 `BUILDING_AGENT_LLM_ALLOW_FALLBACK=true`；这**不是** `resolveChatProvider({})` 的默认行为。需要确定性离线开发时，直接设置 `BUILDING_AGENT_LLM_PROVIDER=mock`，不要依赖一次失败后再 fallback。

真实 provider 的最小占位示例：

~~~bash
BUILDING_AGENT_LLM_PROVIDER=openai-compatible
BUILDING_AGENT_LLM_BASE_URL=https://provider.example/v1
BUILDING_AGENT_LLM_API_KEY=<provider-api-key>
BUILDING_AGENT_LLM_MODEL=<provider-model>
BUILDING_AGENT_LLM_ALLOW_FALLBACK=false
~~~

新配置优先使用 `BUILDING_AGENT_LLM_*`；`LLM_*`、`OPENAI_*` 和 `CHAT_PROVIDER_*` 是兼容别名。Embedding 可用 `BUILDING_AGENT_EMBEDDING_API_KEY`、`BUILDING_AGENT_EMBEDDING_BASE_URL` 和 `BUILDING_AGENT_EMBEDDING_MODEL` 单独覆盖，否则复用 LLM key/base URL 和内置模型名。没有 embedding key 时向量调用返回 `null`，Grounding 仍可使用 FTS/关键词路径，但不能声称 dense retrieval 已运行。

## 5. 数据、状态及持久化

### 5.1 两个数据根与本地状态

| 状态 | 默认位置 | 可配置性与恢复语义 |
| --- | --- | --- |
| SeedStore | `apps/data/store.json`（另有 `.bak`/`.tmp`） | 路径由 `persistence.ts` 固定；`BUILDING_AGENT_DATA_DIR` **不改变它**。保存是单进程 best-effort。 |
| 项目数据根 | `data/**` | `BUILDING_AGENT_DATA_DIR` 优先，兼容 `DATA_DIR`；相对路径按仓库根解析。 |
| 项目 KB/Repository | `data/<projectId>/kb/**`、`repository/**` | 项目目录由 API 创建；索引结果进入 SeedStore，但文件是来源材料。 |
| SQLite 与运行记录 | `data/{session_index,grounding_index,derived_metrics}.db`、`scheduled_jobs.json`、Memory、logs | 只有明确标为 index 的数据库可由来源重建；Derived Metrics/Memory/schedule 不能一概删除。 |
| 旧/general KB root | 默认 `Knowledge Base` | `BUILDING_AGENT_KNOWLEDGE_BASE_DIR`（兼容 `KNOWLEDGE_BASE_DIR`）主要用于通用 KB resolver/子进程默认 cwd；项目 KB API 仍使用 `<dataRoot>/<projectId>/kb`。 |
| BMS 临时上传 | `.temp/bms-config/<projectId>/**` | 当前没有 TTL/清理 job；不受项目 data-root override 控制。 |
| CLI 配置 | `<home>/.building-agent/config.json` | `BUILDING_AGENT_CLI_HOME` 可隔离；包含明文 bearer token，写入请求权限为 `0600`。 |

完整的权威性、索引和缓存分类见[运行时与存储拓扑](../architecture/runtime-storage.md)。

### 5.2 运行时与外部服务变量

| 变量 | 所有者 | 作用与边界 |
| --- | --- | --- |
| `HOST` / `PORT` | API | 默认 `127.0.0.1` / `3000`。改为 `0.0.0.0` 会扩大网络暴露面，必须配合防火墙/TLS/proxy。 |
| `VITE_API_BASE_URL` | Web build/dev | 浏览器 API base；默认空字符串走同源。它不是 server secret。 |
| `VITE_BMS_PUBLIC_BASE` | Web build/dev | 可选无 BuildingAgent auth 的外部 `/bms` 前缀；Fastify 不实现该 public 路由。 |
| `BUILDING_AGENT_TOKEN_TTL_DAYS` | API auth | 新签发 token 默认 90 天；`0` 表示不自动过期。seed token 的生命周期不同。 |
| `BUILDING_AGENT_TIMEZONE` | Agent temporal context | 默认 `Asia/Hong_Kong`；Scheduler 本身仍使用 server-local date/time 语义。 |
| `BUILDING_AGENT_LLM_*` | API | Chat provider、key、base URL、model 和 opt-in fallback。值对整个 API 实例生效，不按项目分配。 |
| `BUILDING_AGENT_EMBEDDING_*` | API | Grounding dense retrieval 的可选 OpenAI-compatible embedding adapter。 |
| `BMS_API_BASE_URL` | API | 外部 BMS source/ingestion **管理服务**；不等于 collector。 |
| `USE_MOCK_BMS_CLIENT` | API | `true`/`1`/`yes` 时启用进程内 BMS management mock；不代表现场数据。 |
| `BMS_DATABASE_API_URL` | API | 只读 collector 和 Element bridge 的 base URL；若未配置，部分 collector helper 使用本地 `:8765` 默认。 |
| `ELEMENT_ENTELI_BASE_URL` / `ELEMENT_ENTELI_USERNAME` / `ELEMENT_ENTELI_PASSWORD` | API | enteliWEB live read；兼容别名存在。代码中的默认值是公开 demo fixture，不是生产凭据。 |
| `DASHSCOPE_API_KEY` | API STT | 缺少时 `POST /api/stt/transcribe` 返回 `503 stt_unavailable`；不得传到浏览器。 |
| `ALIYUN_STT_MODEL` | API STT | 路由读取该值，但基线 helper 仍固定 realtime model；当前不能把它视为有效 model selection。 |

### 5.3 公开 fixture 与真实秘密

仓库提交的 `example.test` 用户、seed password/token、deterministic mock 文本、`data/project_*` 示例和代码内 BMS demo 默认值均是**公开本地 fixture**。它们可用于可重复测试，不能证明身份安全、现场连通性或生产授权。

真实 LLM/embedding/STT key、BuildingAgent bearer token、BMS/enteliWEB 密码、私有服务地址、客户点表、KB 文件和导出数据都属于秘密或客户数据。只通过受控 server-side 环境/secret store 注入；不要提交到 `.env`、`.env.example`、文档、issue、截图、浏览器变量、CLI 输出或测试 fixture。`.env` 虽被 Git 忽略，但仍是明文文件，不是 secret manager。

## 6. 权限与项目隔离

本地启动不会关闭鉴权。`/health` 提供健康检查，`/api/login` 用于建立身份；受保护资源仍要求 bearer token。多数项目资源还依次验证 membership、当前 selected project 和 `chat:read`/`chat:write`/`project:configure`。seed 账户只用于本地 fixture，详见[鉴权、项目与会话](../features/auth-projects-conversations.md)。

环境变量配置是**进程级**而不是 project-scoped：一个 API 实例的 LLM、embedding、STT 和 BMS 凭据会被所有能到达相应路由/工具的项目共享。新增按项目 provider 时必须建立服务端加密存储、授权、审计和选择规则，不能让浏览器提交任意 key/base URL 后直接生效。

另外要保留当前边界：

- Web 的 `VITE_*` 值对任何能下载 bundle 的用户可见，绝不能包含 server credential；
- CLI token 明文存在用户配置中，复制该文件等于复制 bearer 能力；
- `/api/bms/collector/*` 当前只校验 token，未完全按项目隔离；
- STT 路由只要求有效 session，没有 project id/`chat:write` 的同等 API guard；
- BMS/KB 文件即使物理目录含 project id，也仍需服务端 membership、permission 和安全路径校验。

## 7. 错误、降级及外部依赖

| 失败 | 当前行为 | 操作建议 |
| --- | --- | --- |
| 找不到根 `.env` | API 输出提示并仅使用 host environment；进程仍可启动。 | 对每个必需外部能力做显式启动检查，不要把“服务已监听”当成“provider 已配置”。 |
| 不支持的 LLM provider | 构建 server 时抛 `provider_unsupported`，API 可能无法启动。 | 只使用 `mock` 或 `openai-compatible`；新增 provider 先实现 adapter/test。 |
| 缺少 LLM key | provider 调用报 `provider_not_configured`；是否转 mock 完全由 fallback flag 决定。 | 离线开发显式 mock；真实验证关闭 fallback，避免假成功。 |
| LLM HTTP/网络/响应错误 | adapter 对可重试失败最多进行初次请求加四次重试；随后 error 或 opt-in mock。 | 使用 response 的脱敏 code/requestId/provider diagnostics 排障，不记录 key/header。 |
| 无 embedding key或 embedding 失败 | `embedText` 返回 `null`，不会使 API 崩溃。 | 把 dense retrieval 视为不可用；不要用零向量冒充成功。 |
| 无 BMS management URL | 对应管理路径返回 `503 bms_unavailable`；collector helper 可能仍尝试本地默认端口。 | 分开检查 management 与 collector health。 |
| 无 STT key | 返回 `503 stt_unavailable`；没有本地/mock fallback。 | 禁用/隐藏语音入口或配置外部服务。 |
| SeedStore 缺失/JSON 损坏 | 持久化启动退回 seed store。 | 这可能掩盖数据损坏；先备份并检查文件，不把 seed fallback 当恢复。 |
| SeedStore 写入失败 | best-effort warning，不使请求必然失败。 | 监控日志和磁盘；不要把 HTTP 成功等同于 durable commit。 |
| Web 指向跨域 API | 当前 Fastify CORS 未启用，浏览器可能拦截。 | 本地使用 Vite same-origin proxy；生产用受控 reverse proxy/CORS。 |
| CLI 配置损坏/不可写 | 返回带路径但不含 token 的 `CliConfigError`。 | 用隔离 home 修复；不要把真实 config 内容粘贴到日志。 |

BMS、STT 和 scheduler 的更细降级语义分别见 [BMS 集成](../features/bms-integration.md)与 [Scheduler、Realtime 与 STT](../features/scheduler-realtime-stt.md)。

## 8. 扩展方法

新增配置时先定义：所有者（API/Web/CLI）、作用域（instance/project/user）、敏感性、默认值、是否必需、失败模式、reload 语义和测试注入方式。server secret 使用无 `VITE_` 前缀的环境或 secret provider；浏览器只接收公开 base path/feature flag。同步更新空白/示例安全的 [.env.example](../../../../.env.example) 和本页，但不要提交真实值。

优先为每个域建立纯 resolver/validator，再由组合根注入；不要继续在路由、工具和 UI 中各自读取同一个 env key。新增 LLM/STT/BMS adapter 必须带 timeout、取消、脱敏错误、健康检查和 deterministic fake，并明确 fallback 是否 opt-in。真实 provider 的“可达”与“允许某项目使用”是两项不同检查。

新增持久化配置必须复用现有两个数据根之一，并声明权威性、迁移、备份和并发语义；不要引入第三个隐式 cwd-relative 根。若需要迁移 SeedStore 路径，应先把 `persistence.ts` 的固定路径变为显式配置并提供迁移/冲突检测，不能假设 `BUILDING_AGENT_DATA_DIR` 已覆盖它。

## 9. 对应测试

配置相关的直接测试包括：

- Chat provider 选择、重试和脱敏：[apps/api/src/providers.test.ts](../../../../apps/api/src/providers.test.ts)
- Embedding override/fallback：[apps/api/src/embeddingProvider.test.ts](../../../../apps/api/src/embeddingProvider.test.ts)
- token TTL：[apps/api/src/authTokens.test.ts](../../../../apps/api/src/authTokens.test.ts)
- BMS adapter/proxy：[apps/api/src/bms.test.ts](../../../../apps/api/src/bms.test.ts)、[apps/api/src/bmsCollectorProxy.test.ts](../../../../apps/api/src/bmsCollectorProxy.test.ts)
- CLI home、文件权限意图和脱敏：[apps/cli/src/config.test.ts](../../../../apps/cli/src/config.test.ts)

从仓库根分别使用下列参数；不要给三个 workspace 套用同一个 `--dir src`。smoke 作为单独的已知差距复现：

~~~bash
npm --workspace @building-agent/api exec -- vitest run --dir src
npm --workspace @building-agent/cli exec -- vitest run --dir src --no-file-parallelism
npm --workspace @building-agent/web exec -- vitest run
npm run typecheck
npm run build
# Known baseline failure; run separately to capture the exact stage.
BUILDING_AGENT_LLM_PROVIDER=mock npm run smoke
~~~

API 使用 `--dir src` 约束发现范围。CLI 还需要 `--no-file-parallelism` 来避免共享状态并发，但最新实测在两种 provider 配置下均为 **8/9**，因此当前不能标为绿色；完整失败名、环境与结果见[测试与验证](testing.md)。Web 已在 Vite 配置中限定 `src/**/*.test.ts(x)`，直接运行 workspace Vitest；额外传 `--dir src` 会收集 **0** 项，不能把 “0 collected” 当通过。

`npm run smoke` 不会自行设置 mock；它继承调用 shell 的 provider 环境，并期望 Chat 最终报告 deterministic mock。基线脚本还断言 mock assistant 文本包含输入 `Smoke check from CLI`，而 `createDeterministicMockProvider("local_default")` 固定返回 provider-unavailable 文本并不回显输入，所以即使显式 mock，这个 smoke 也会在 Chat 文本断言处失败。该不一致应作为后续工程问题记录，本里程碑不修改脚本或 provider。

若 `3130`/`5174` 已有服务可达，runner 会复用现有服务，因此结果也受该进程配置和状态影响。它还会写 Chat/项目状态；应在干净 worktree 或可丢弃实例运行。`BUILDING_AGENT_DATA_DIR` 只能隔离项目数据根，不能隔离固定的 `apps/data/store.json`。

根 `npm test` 会让各 workspace 使用各自默认 Vitest discovery；存在未跟踪 `dist.predeploy-*`/`dist.prehotfix-*` 或真实本地 KB 数据时可能误扫。正式记录必须使用上面各 workspace 自己的参数，并报告收集数、失败名和退出码。实际执行结果、允许的历史失败集合和文档门禁见[测试与验证](testing.md)。

## 10. 已知限制及关联文档

- 没有集中配置 schema、启动前必填检查、动态 reload 或配置来源诊断 endpoint；变量解析分散在多个模块。
- `.env` parser 不是 dotenv/shell parser，静默忽略不存在的文件，且只采用首个可读取候选。
- [.env.example](../../../../.env.example) 的空 key 注释依赖它同时开启 fallback；没有 key 的 resolver 默认并非 mock。
- 根 `npm run dev` 只启动 API；Web 需要第二个进程，CLI 需要先 build。
- 当前 Fastify CORS 被禁用；`VITE_API_BASE_URL` 的跨域用法需要仓库外网络层。
- `BUILDING_AGENT_DATA_DIR` 与 `BUILDING_AGENT_KNOWLEDGE_BASE_DIR` 都不能迁移 SeedStore；BMS 临时上传又有独立固定路径。
- 仓库存在公开 seed credentials 和 BMS demo defaults；它们不是秘密，却也不应被生产部署继承。
- STT key/model 没有列入 [.env.example](../../../../.env.example)，且 `ALIYUN_STT_MODEL` 尚未真正控制 helper 模型。
- provider/BMS/STT 凭据均为 API instance-global，没有 project-scoped secrets、轮换或审计闭环。
- CLI 当前在两种 provider 配置下均为 8/9；Web 额外使用 `--dir src` 会收集 0 项，二者都不能误报为绿色门禁。
- smoke 要求 deterministic mock 同时回显输入，但当前 mock 固定文本不满足该断言，因此不是绿色基线。

继续阅读[当前实现架构](../architecture/current-architecture.md)、[运行时与存储拓扑](../architecture/runtime-storage.md)、[CLI](../features/cli.md)、[BMS 集成](../features/bms-integration.md)、[测试与验证](testing.md)和[排障与已知契约差距](troubleshooting.md)。
