# Knowledge Base 与 Repository

[English](../../en/features/knowledge-base-repository.md) | [开发者文档首页](../README.md) | [存储拓扑](../architecture/runtime-storage.md)

> 代码基线：`main@af44ff15`。状态：项目文件扫描、Agent 读写和安全下载已实现；摄取、版本和生产级文档治理为部分实现。

## 1. 状态与代码基线

[knowledgeBase.ts](../../../../apps/api/src/agent/knowledgeBase.ts) 解析根 `data/**` 下的项目 KB/Repository、递归扫描文件并生成轻量目录；[genericTools.ts](../../../../apps/api/src/agent/genericTools.ts) 提供 `read_file`、`search_files`、`write_file`、`patch` 和执行工具；[server.ts](../../../../apps/api/src/server.ts) 暴露列表与 Repository 文件下载。

本地目录与工具链是 **已实现**；自动上传/转换、权限继承、版本历史、病毒扫描和向量文档检索是 **部分实现或规划中**。KB 中存在文件并不表示内容已验证为产品事实。

## 2. 功能目的及边界

Knowledge Base 是项目提供的参考资料和语义/目录输入，默认只读给 Agent；Repository 是 Agent/用户面向项目的工作区和生成物出口，可由工具写入。二者都不是 Web 应用源码仓库，也不应保存 API key。`KB_CATALOG_SUMMARY.md` 和 `bms_guide.md` 是路由提示文件，不是实时 BMS 数值源。

## 3. 用户入口和关键源码入口

| 能力 | 入口 |
| --- | --- |
| KB 列表 | `GET /api/projects/:projectId/knowledge-base` |
| Repository 列表 | `GET /api/projects/:projectId/repository` |
| 文件读取/下载 | `GET /api/projects/:projectId/repository/files/*` |
| Agent 浏览 | `read_file`、`search_files` in [genericTools.ts](../../../../apps/api/src/agent/genericTools.ts) |
| Agent 生成/修改 | `write_file`、`patch`、`terminal`、`execute_code` |
| 路径和目录索引 | [apps/api/src/agent/knowledgeBase.ts](../../../../apps/api/src/agent/knowledgeBase.ts) |
| 下载链接规范化 | [repositoryDownloadLinks.ts](../../../../apps/api/src/repositoryDownloadLinks.ts) |

## 4. 正常数据流

1. `dataRoot` 解析 `BUILDING_AGENT_DATA_DIR`/`DATA_DIR`，然后为 project id 创建 `kb` 与 `repository` 目录。
2. 每次列表请求和每轮 Chat 都递归扫描相应目录；隐藏条目跳过，最多索引 500 个文件。
3. 支持的文本扩展名读取前 600 bytes，再压缩为最多 200 字符摘要；其他文件只记录元数据和类型。
4. Runtime 把排序后的少量 KB/Repository 条目写入 system prompt；需要正文时 provider 应调用 `read_file`，而不是假设摘要完整。
5. `read_file` 和 `search_files` 同时支持项目 KB 与 Repository，并返回带 `kb:/` 或 `repo:/` 的范围路径。
6. `write_file`/`patch` 只允许 Repository；生成物推荐写入 `repository/outputs`。执行工具在 Repository 中运行，并通过环境变量提供 KB、Repository 和 output 目录。
7. assistant 回答中的 `outputs/...` 链接与可信工具下载合并后作为结构化 download 返回；HTTP 下载再次做项目授权和路径检查。

## 5. 数据、状态及持久化

默认目录是 `data/<projectId>/kb/**` 和 `data/<projectId>/repository/**`；`outputs/**` 是 Repository 子目录。目录文件是主要来源，`apps/data/store.json` 中的 `knowledgeBaseByProject`/`repositoryByProject` 只是最新扫描摘要和部分内存 artifact 的快照。

KB/Repository 列表会把磁盘条目与尚未出现在磁盘索引的内存 artifact 合并。文件是否可重建取决于来源：上传资料通常是权威输入，Agent 输出可能需要保留，索引摘要可以重新扫描生成。

## 6. 权限与项目隔离

列表和下载要求 bearer、membership、selected project 与 `chat:read`。下载拒绝空路径、绝对路径和包含 `..` 的路径，并确认解析后的文件仍在允许的项目 Repository 根中。Agent 文件工具从不可由模型选择的 `context.projectId` 推导根；写操作只解析 Repository 相对路径。

基线下载读取还兼容显式配置的 legacy data root 和少量既有位置，但逐个根执行 containment 检查。这是迁移兼容，不是跨项目搜索。

## 7. 错误、降级及外部依赖

- 目录缺失时会 best-effort 创建；扫描读失败会返回空/跳过条目，而不是使服务停止。
- 二进制文件不能通过 `read_file` 当文本读取；大文件和返回行数有上限。
- `search_files` 是递归 glob/substring 搜索，不是语义检索服务；最多返回 50 个结果。
- 下载不存在文件返回 `404 repo_file_not_found`，非法路径返回 `400 repo_invalid_path`。
- terminal/Python 依赖主机运行时与包；生成文件成功不等于内容正确，仍需要领域验证。

## 8. 扩展方法

新增摄取器时应把原文件写到正确项目 KB，保留来源/hash/时间，并在转换产物与原件之间建立明确关系。新增可读格式时要限制大小和解析资源；新增下载根必须沿用 resolve-and-containment 检查。若引入向量检索，应把索引标为可重建，不得替代原始文档。生成物需记录 source message/tool 和可验证的事实来源。

## 9. 对应测试

- 目录排序和 KB routing：[apps/api/src/agent/knowledgeBase.test.ts](../../../../apps/api/src/agent/knowledgeBase.test.ts)
- KB/Repository API、Agent 读取与生成物：[apps/api/src/chat.test.ts](../../../../apps/api/src/chat.test.ts)
- 下载链接清理、规范化和去重：[apps/api/src/repositoryDownloadLinks.test.ts](../../../../apps/api/src/repositoryDownloadLinks.test.ts)
- Runtime 中的文件工具调用：[apps/api/src/agent/runtime.streamPhase.test.ts](../../../../apps/api/src/agent/runtime.streamPhase.test.ts)

## 10. 已知限制及关联文档

- 没有独立 REST 上传、删除或版本 API；资料进入目录的运维方式不等于稳定产品契约。
- 每轮 Chat 递归扫描文件，文件数量上限和大目录性能需要部署评估。
- 文本摘要只截取开头，不能代替全文检索或解析 PDF/DOCX。
- legacy Repository 读取兼容增加了部署根配置复杂度；新写入仍只进入当前数据根。
- 继续阅读 [Tools、Skills、Memory 与 Grounding](tools-skills-memory-grounding.md)、[Chat 与 Agent Runtime](chat-agent-runtime.md)和[配置与本地运行](../development/configuration.md)。
