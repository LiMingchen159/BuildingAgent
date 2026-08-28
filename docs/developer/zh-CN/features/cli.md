# CLI

[English](../../en/features/cli.md) | [开发者文档首页](../README.md) | [鉴权、项目与会话](auth-projects-conversations.md) | [Chat 与 Agent Runtime](chat-agent-runtime.md)

> 产品代码基线：`main@af44ff15`。状态：登录、会话检查、项目选择、同步 Chat 和本地配置为 **已实现**；`registry` 与 `management` 只公开 `placeholderOnly: true` 的占位清单，因此是 **部分实现**。CLI 是 Fastify REST API 的轻量 JSON 客户端，不包含浏览器界面、SSE、WebSocket、FDD、Dashboard 或报告命令。

## 1. 状态与代码基线

CLI 是 npm workspace `@building-agent/cli`，构建后入口为 `building-agent`。[`index.ts`](../../../../apps/cli/src/index.ts) 把进程参数交给 [`runCommand`](../../../../apps/cli/src/commands.ts)，正常结果写为格式化 JSON，失败写到 stderr 并返回非零退出码。

| 能力 | 状态 | 事实边界 |
| --- | --- | --- |
| `login`、`session`、`projects`、`use` | **已实现** | 调用产品 REST API，并把 token、API URL 和所选项目保存到本地配置。 |
| `chat`、`chat:list` | **已实现** | 使用同步 JSON `POST/GET /chat`；不消费 SSE 流，也不订阅 WebSocket。 |
| `registry`、`management` | **部分实现** | 解析并强制要求 `placeholderOnly: true`；列表描述占位 provider/tool/skill/gateway/capability，不代表可调用的运行时。 |
| `config-path` 与脱敏诊断 | **已实现** | 显示配置位置；命令输出会把 token 替换为 `[redacted]`。 |
| 交互式 shell、token 吊销、流式输出和其他业务命令 | **规划中** | 当前命令分派是固定字符串分支，没有插件式命令注册。 |

## 2. 功能目的及边界

CLI 为脚本、smoke 验证和无浏览器环境提供最小控制面：登录、枚举项目、选择一个项目、读取占位 registry/management 信息，并发送或列出 Chat 消息。它复用服务端鉴权和项目隔离，不在客户端复制业务规则。

它不负责：

- 启动 API/Web 服务、管理数据库或安装依赖；
- 以浏览器 session、cookie 或本地项目选择替代服务端授权；
- 处理 SSE token/event 流、WebSocket 更新或后台任务进度；
- 提供 BMS、Derived Metrics、Dashboard、Reports、Scheduler、STT 或 FDD 命令；
- 加密 token、刷新/吊销 token，或充当操作系统秘密管理器；
- 自动把 registry 占位条目升级为可执行工具。

## 3. 用户入口和关键源码入口

开发环境可先构建 CLI，再通过 workspace 或生成的二进制入口调用。所有命令只把 JSON 写到 stdout/stderr，适合由脚本解析。

```bash
npm --workspace @building-agent/cli run build
node apps/cli/dist/index.js help
node apps/cli/dist/index.js login --email '<user@example.test>' --password '<password>' --api-url http://127.0.0.1:3000
node apps/cli/dist/index.js projects
node apps/cli/dist/index.js use '<project-id>'
node apps/cli/dist/index.js chat 'summarize the selected project'
```

| 入口 | 作用 | 关键源码 |
| --- | --- | --- |
| `help` / `--help` | 输出固定命令列表。 | [`commands.ts`](../../../../apps/cli/src/commands.ts) |
| `login --email --password [--api-url]` | 调用 `/api/login`，保存 bearer token，输出中删除 token。 | [`commands.ts`](../../../../apps/cli/src/commands.ts)、[`api.ts`](../../../../apps/cli/src/api.ts) |
| `session` | 有完整认证配置时读取 `/api/session`；否则只返回脱敏配置诊断。 | [`commands.ts`](../../../../apps/cli/src/commands.ts) |
| `projects` / `use <project-id>` | 列出成员项目；服务端选择成功后保存 `selectedProjectId`。 | [`api.ts`](../../../../apps/cli/src/api.ts) |
| `registry` / `management` | 校验占位 registry 或当前项目 management payload。 | [`registry.ts`](../../../../apps/cli/src/registry.ts) |
| `chat` / `chat:list` | 对所选项目同步发送或读取消息。 | [`api.ts`](../../../../apps/cli/src/api.ts) |
| `config-path` | 返回 CLI home 与配置文件路径。 | [`config.ts`](../../../../apps/cli/src/config.ts) |

`login` 的参数 parser 支持 `--key value` 和 `--key=value`。它不是通用命令行框架：未知位置参数通常被忽略，Chat 除外，因为 `chat` 会把剩余参数以空格拼成消息。

## 4. 正常数据流

1. `login` 默认连接 `http://127.0.0.1:3000`，或使用显式 `--api-url`；服务端成功响应必须包含非空 token。
2. CLI 将 API URL、token 和 `lastCommand` 写入配置，但登录结果输出会删除 token，并把诊断中的 token 脱敏。
3. `projects` 使用 bearer token 读取成员项目。`use` 把目标 id 发送给服务端；只有选择成功后才更新本地 `selectedProjectId`。
4. `management`、`chat` 与 `chat:list` 先检查本地是否已有 token 和所选项目，然后把编码后的 project id 放入 URL。该检查只提供快速失败，服务端仍执行真实 authorization。
5. `chat` 发送单个同步 JSON 请求；CLI 严格验证 user/assistant message、provider 诊断、fallback 标记、可选 lifecycle 和 request id，再打印响应。
6. `login` 和成功的已认证业务命令会更新 `lastCommand`；`help`、`config-path` 以及缺少认证配置时的 `session` 诊断不会更新它。其他失败会尽力记录 `lastCommand`、`lastErrorCode` 和可选 `lastRequestId`，但保存诊断失败不会覆盖原始错误。
7. shell 依据退出码决定成功或失败；调用方应解析 `error.code`，不要依赖英文错误文本。

## 5. 数据、状态及持久化

默认配置位于用户 home 下的 `.building-agent/config.json`；设置 `BUILDING_AGENT_CLI_HOME` 可把 CLI home 指向隔离目录。`config-path` 返回解析后的绝对位置。首次保存时目录请求 `0700`，文件写入请求 `0600`。

| 字段 | 用途 | 敏感性 / 生命周期 |
| --- | --- | --- |
| `apiUrl` | API origin；保存时不自动验证协议或可信主机。 | 持久配置；不要指向未受信服务。 |
| `token` | 每个受保护请求的 bearer token。 | 明文保存在本地 JSON；输出脱敏，但没有加密或 keychain。 |
| `selectedProjectId` | 当前 CLI 命令默认使用的项目。 | 客户端便利状态，不是授权凭据。 |
| `lastCommand` | 最近执行/尝试的命令。 | 诊断状态。 |
| `lastErrorCode` / `lastRequestId` | 最近失败的稳定码与请求关联 id。 | 诊断状态；下一次成功不会显式清空旧错误字段。 |

CLI 不保存消息、registry 或 management 响应；这些事实仍由 API 及其存储拥有。配置写入不是原子 rename，也没有跨进程锁；并发 CLI 调用可能最后写入者覆盖诊断或项目选择。

## 6. 权限与项目隔离

`projects` 和 `registry` 要求本地已有 API URL/token；`management`、`chat` 和 `chat:list` 还要求 `selectedProjectId`。这些只是客户端前置条件。真正边界来自 API 对 token、membership 和 selected-project 的校验，详见[鉴权、项目与会话](auth-projects-conversations.md)。

CLI 不应允许 project id、token 或 API URL 从不受信输出拼接进 shell。项目 id 会在 URL path 中编码，但 `apiUrl` 只移除尾部斜杠；操作者必须信任连接目标并在非本地环境使用受保护传输。复制配置文件等于复制 bearer 权限，应按秘密处理。

`registry` 是认证后的全局占位目录；`management` 使用当前项目 URL。两者都验证 `placeholderOnly: true` 和枚举字段，避免调用方把任意服务端 JSON 当成正式能力，但这不是细粒度工具权限模型。

## 7. 错误、降级及外部依赖

| 失败 | CLI 行为 |
| --- | --- |
| 缺少登录或项目选择 | 返回 `auth_missing` 或 `project_not_selected`，不发网络请求。 |
| 参数缺失、空 Chat 或未知命令 | 返回 `cli_usage`、`chat_invalid` 或 `cli_unknown_command`。 |
| HTTP 非成功 | 保留服务端 `error.code/message/requestId`；缺字段时退化为 `api_error`。 |
| 非 JSON 或 payload shape 不符合契约 | 返回 `api_invalid_json` 或 `api_malformed`，失败关闭。 |
| 配置 JSON 损坏、读写失败 | 抛出 `CliConfigError`，包含路径诊断，不包含 token。 |
| Chat provider 不可用 | 原样保留服务端 `provider_error`；CLI 不自动切换 provider。 |

当前 client 没有显式 timeout、AbortSignal、重试、退避或离线队列；网络挂起由底层 `fetch`/运行环境决定。外部依赖是可达的 Fastify API，以及 Chat 时由 API 选择的 LLM provider。registry/management 的占位条目本身不是外部服务健康检查。

## 8. 扩展方法

新增命令时同时完成四层：在 [`ApiClient`](../../../../apps/cli/src/api.ts) 加入最窄 HTTP 方法；为响应定义并执行运行时 shape 校验；在 `execute` 中加入明确的 auth/project precondition；最后补充成功、服务端拒绝、malformed payload 和秘密不泄漏测试。

保持 stdout 为机器可读 JSON，进度或调试信息写 stderr，错误码稳定。任何新命令都不得输出 token、password、provider key 或完整认证 header。若加入 SSE/WS，应实现独立 parser、取消/timeout、终端中断和部分输出语义，而不是复用当前一次性 JSON reader。

配置 schema 扩展要继续拒绝已知字段的非字符串值，对新增敏感字段采用显式 allowlist，并考虑原子写、跨进程锁、登出/吊销和 OS keychain。当前 parser 会忽略未知字段，不能把这种兼容行为当成秘密校验。若要开放真正 registry 工具调用，必须先替换 `placeholderOnly` 服务端契约及权限模型；不能仅放宽客户端 parser。

## 9. 对应测试

- [`commands.test.ts`](../../../../apps/cli/src/commands.test.ts)：真实 Fastify test server 上的登录、项目、同步 Chat/list、session、错误码/request id、malformed payload、provider error 和秘密不泄漏。
- [`config.test.ts`](../../../../apps/cli/src/config.test.ts)：隔离 home、读写、结构校验、错误诊断与 token 脱敏。
- [`registry.test.ts`](../../../../apps/cli/src/registry.test.ts)：registry/management 占位 shape、认证要求与 malformed payload 失败关闭。

源码目录共有 9 项 CLI 测试。为避免测试文件争用共享 SQLite，本次采用的稳定复现命令是：

```bash
npm --workspace @building-agent/cli exec -- vitest run --dir src --no-file-parallelism
```

最终里程碑结果见[测试与验证](../development/testing.md)。CLI 测试会启动 API test server，并把配置写入临时目录；新增测试也应保持这一隔离，不能触碰真实用户配置。

## 10. 已知限制及关联文档

- CLI 只有固定的九类入口（help 不计业务调用），没有子命令框架、交互提示、shell completion 或插件发现。
- Chat 只使用同步 JSON endpoint；无法显示 SSE token/tool/lifecycle 增量，也不会接收 WebSocket project 更新。
- 本地 token 是权限为 `0600` 的明文 JSON，不支持 refresh、logout/revoke、keychain 或多 profile。
- 配置保存没有原子 rename/锁；并发调用可能覆盖 `selectedProjectId` 或最近诊断。
- HTTP client 没有 timeout/retry，`apiUrl` 没有 TLS 强制或 allowlist。
- registry/management 明确为 `placeholderOnly`，不能作为实际 provider、gateway、tool 或 capability 可用性证明。
- CLI 没有 BMS、Dashboard、Report、Scheduler、STT、Derived Metrics 或 FDD 控制面。

继续阅读 [REST、SSE 与 WebSocket 契约](../architecture/api-events.md)、[Chat 与 Agent Runtime](chat-agent-runtime.md)、[Web 工作区](web-workspace.md)和[配置与本地运行](../development/configuration.md)。
