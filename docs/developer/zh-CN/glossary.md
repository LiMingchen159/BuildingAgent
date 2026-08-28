# 术语表

[English](../en/glossary.md) | [开发者文档首页](README.md)

> 代码基线：`main@af44ff15`。中文术语是冲突时的基准，代码标识符保持原样。

| 中文术语 | 英文 / 代码用语 | 本文档中的含义 |
| --- | --- | --- |
| 已实现 | Implemented | 当前代码存在可达入口、处理路径与持久化或响应，并有源码或测试证据。 |
| 部分实现 | Partial | 主路径或界面存在，但仍依赖占位、外部服务、缺失契约或未闭环步骤。 |
| 规划中 | Planned | 目标架构中的方向；当前代码不得被解释为已提供该能力。 |
| 外部能力 | External | 由 LLM provider、BMS collector、数据库驱动或其他系统负责。 |
| 组合根 | composition root | 装配路由、依赖和 UI 区域的入口；当前主要是 `server.ts` 与 `App.tsx`。 |
| 项目隔离 | project isolation | 鉴权后仍按 project id 与成员关系限制读取、写入和事件。 |
| Agent Runtime | Agent Runtime | 装配上下文、调用 provider、执行工具循环并流式返回结果的运行路径。 |
| 工具 | Tool | Agent 可按 schema 调用的确定性或集成能力。 |
| 技能 | Skill | 用于约束工具组合、提示和领域工作流的注册能力。 |
| Grounding | grounding | 将回答约束到项目知识、仓库、记忆和可引用证据的过程。 |
| Knowledge Base | Knowledge Base / KB | 项目范围的可检索知识材料及其索引。 |
| Repository | Repository | 项目文件/代码材料及其索引，不等同于本 Git 仓库本身。 |
| BMS | Building Management System | 楼宇管理系统及 collector 提供的点位、时序和控制/读取边界。 |
| Brick | Brick Schema | 表达设备、点位、关系与语义类别的本体模型。 |
| FDD | Fault Detection and Diagnosis | 故障检测与诊断领域；确定性规则检测与 Agent 解释必须区分。 |
| 可部署性 | deployability | 算法所需语义点位、参数和证据能否在目标设备上满足。 |
| 算法目录 | algorithm catalog | 含来源、输入和规则定义的条目集合；不保证每个条目可执行。 |
| 可执行运行时 | executable runtime | 当前代码能对数据实际求值的实现。 |
| 物化 | materialization | 将运行结果转成可查询、可归因、可展示的持久化事实。 |
| Derived Metric | Derived Metric | 从已知数据和确定性表达式派生的指标。 |
| KPI | Key Performance Indicator | 面向运营或项目目标的关键绩效指标。 |
| SSE | Server-Sent Events | 用于一次 HTTP 请求内单向流式返回 Agent 事件。 |
| WebSocket | WebSocket | 用于跨请求推送任务、状态或仪表盘更新的长连接。 |
| 权威数据 | authoritative data | 对某类事实拥有最终解释权、不可仅靠重建恢复的存储。 |
| 可重建索引 | rebuildable index | 可从权威材料重新生成的检索或会话索引。 |
| 公开 fixture | public fixture | 仅供本地测试的公开账号、令牌、密码或模拟响应，不是真实秘密。 |

