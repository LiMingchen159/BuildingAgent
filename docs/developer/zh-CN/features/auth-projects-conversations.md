# 鉴权、项目与会话

[English](../../en/features/auth-projects-conversations.md) | [开发者文档首页](../README.md) | [接口与事件](../architecture/api-events.md)

> 代码基线：`main@af44ff15`。状态：核心 REST 流程已实现；令牌撤销、生产级身份提供方和细粒度管理仍不完整。

## 1. 状态与代码基线

Fastify 在 [auth.ts](../../../../apps/api/src/auth.ts) 中实现 bearer 解析、会话读取、项目成员关系、选中项目和 permission 校验；[authTokens.ts](../../../../apps/api/src/authTokens.ts) 负责本地令牌签发与过期判断；[server.ts](../../../../apps/api/src/server.ts) 注册登录、项目和会话路由。当前身份模型是本地 `SeedStore`，不是 OAuth/OIDC、企业 SSO 或独立 IAM 服务。

状态标签：登录、会话、项目选择和项目范围会话为 **已实现**；本地 seed 身份和轻量 token 生命周期是 **部分实现**；外部身份提供方是 **规划中/外部能力**。

## 2. 功能目的及边界

这组能力回答三个问题：请求由哪个用户发出、该用户是否属于 URL 中的项目、该 token 当前选择了哪个项目。`projectId` 只是资源标识，不是授权证明；成员关系、选中项目和所需 permission 必须在服务端分别检查。

会话（conversation）是项目内消息 id 的有序集合，不等同于登录 session。登录 session 保存 `userId` 和 `selectedProjectId`；conversation 保存标题、创建时间和 `messageIds`。

## 3. 用户入口和关键源码入口

| 能力 | REST 入口 | 关键实现 |
| --- | --- | --- |
| 登录与当前 session | `POST /api/login`、`GET /api/session` | [server.ts](../../../../apps/api/src/server.ts)、[authTokens.ts](../../../../apps/api/src/authTokens.ts) |
| 项目列表、创建与选择 | `GET/POST /api/projects`、`POST /api/projects/:projectId/select` | [server.ts](../../../../apps/api/src/server.ts) |
| 会话列表与创建 | `GET/POST /api/projects/:projectId/conversations` | [server.ts](../../../../apps/api/src/server.ts) |
| 选择、改名、删除会话 | `POST .../:convId/select`、`PATCH/DELETE .../:convId` | [server.ts](../../../../apps/api/src/server.ts) |
| Web client | [apps/web/src/api.ts](../../../../apps/web/src/api.ts) | 保存 bearer 并调用上述契约。 |

## 4. 正常数据流

1. `POST /api/login` 校验本地用户凭据，复用或签发 `ba_...` token，并确保 token 对应的登录 session 存在。
2. 客户端以 `Authorization: Bearer <token>` 调用 API；`authenticateRequest` 解析 token、用户和当前 `selectedProjectId`。
3. 客户端取得成员项目列表，再调用 select 路由。服务端只允许选择存在成员关系的项目，并把选择写回 token session。
4. 项目资源通常依次执行 membership、selected-project 和 permission 校验。Chat 读需要 `chat:read`，写、清空和多数会话变更需要 `chat:write`。
5. 创建 conversation 后，Chat 消息写入项目消息池，conversation 只保存该线程的消息 id；列表按最后消息活动排序。
6. 首次交流先生成即时标题，随后可以异步用 provider 改进标题，并通过 SSE/WebSocket 通知客户端。

## 5. 数据、状态及持久化

用户、token 元数据、登录 session、项目、membership、permission、消息和 conversation 的权威本地快照位于 `apps/data/store.json`，结构见 [seed.ts](../../../../apps/api/src/seed.ts)，写入见 [persistence.ts](../../../../apps/api/src/persistence.ts)。默认 token TTL 为 90 天；`BUILDING_AGENT_TOKEN_TTL_DAYS=0` 表示不自动过期，旧 seed token 没有元数据时也按不过期处理。

根 `data/session_index.db` 由 [sessionIndex.ts](../../../../apps/api/src/sessionIndex.ts) 维护，用于项目范围的历史会话检索，并在启动时由 store 重建。它是可重建索引，不是消息权威源。两个数据根的恢复语义见[运行时与存储拓扑](../architecture/runtime-storage.md)。

## 6. 权限与项目隔离

permission 枚举为 `chat:read`、`chat:write`、`project:configure`。新建项目默认只授予创建者前两项。项目配置、项目 Memory 和部分 Agent 变更需要 `project:configure`。

Chat 读写、会话列表/创建/选择等主路径同时要求成员关系和当前选择匹配。基线代码中 conversation 改名/删除以及项目删除会校验 membership 与 `chat:write`，但没有调用 `requireSelectedProject`；这是当前契约差异，不应由客户端状态替代服务端约束。WebSocket 的隔离规则见[接口与事件](../architecture/api-events.md)。

## 7. 错误、降级及外部依赖

- 缺失或非法 token 返回 `401`，代码为 `auth_missing` 或 `auth_invalid`。
- 项目不存在或用户不是成员返回 `403 project_forbidden`；未选择 URL 项目返回 `403 project_not_selected`。
- permission 不足也返回 `403 project_forbidden`；调用方应依赖结构化 code，而不是只匹配英文 message。
- 非法项目名、会话标题或 Chat body 返回 `422`；找不到 conversation 返回 `404 conversation_not_found`。
- `apps/data/store.json` 加载失败会回到 seed store；这适合本地启动降级，不是生产恢复保证。

## 8. 扩展方法

引入真实身份提供方时，应保留 `ApiSessionContext` 和项目授权边界，把外部 subject 映射到内部 user，而不是信任浏览器提交的 user/project。新增项目资源路由应复用 `authenticateRequest`、`requireProjectMembership`、`requireSelectedProject` 和 `requirePermission`，并明确哪些操作有意不依赖 selected-project。令牌轮换、撤销、登出、密码哈希和审计策略需要作为独立安全设计交付。

## 9. 对应测试

- 登录、session、项目列表与选择：[apps/api/src/auth.test.ts](../../../../apps/api/src/auth.test.ts)
- TTL 与过期 token：[apps/api/src/authTokens.test.ts](../../../../apps/api/src/authTokens.test.ts)
- 项目隔离、conversation CRUD、自动创建与排序：[apps/api/src/chat.test.ts](../../../../apps/api/src/chat.test.ts)
- 会话内消息顺序：[apps/api/src/conversationMessages.test.ts](../../../../apps/api/src/conversationMessages.test.ts)
- 浏览器 API 解析和 UI 主流程：[apps/web/src/api.test.ts](../../../../apps/web/src/api.test.ts)、[apps/web/src/App.test.tsx](../../../../apps/web/src/App.test.tsx)

## 10. 已知限制及关联文档

- 本地凭据和 token store 不是生产级身份系统；仓库 fixture 不能复制为真实客户账户策略。
- 没有显式 logout/revoke 路由；过期只在解析 token 时判断。
- selected-project 校验没有覆盖所有变更路由，扩展时必须逐路由审查。
- conversation 删除会删除当前 JSON 消息，但 session SQLite 是可重建检索索引；恢复与清理策略不能混为一谈。
- 继续阅读 [Chat 与 Agent Runtime](chat-agent-runtime.md)、[Tools、Skills、Memory 与 Grounding](tools-skills-memory-grounding.md)和[接口与事件](../architecture/api-events.md)。
