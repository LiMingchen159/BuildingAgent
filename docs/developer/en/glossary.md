# Glossary

[中文](../zh-CN/glossary.md) | [Developer documentation home](README.md)

> Code baseline: `main@af44ff15`. Chinese terminology is authoritative when wording conflicts; code identifiers remain unchanged.

| English / code term | Chinese term | Meaning in this documentation |
| --- | --- | --- |
| Implemented | 已实现 | Current code has a reachable entry point, processing path, and persistence or response, supported by source or test evidence. |
| Partial | 部分实现 | A main path or surface exists, but placeholders, external services, missing contracts, or open-loop steps remain. |
| Planned | 规划中 | A target-architecture direction that must not be presented as a currently delivered capability. |
| External | 外部能力 | Responsibility of an LLM provider, BMS collector, database driver, or another system. |
| composition root | 组合根 | Entry point that assembles routes, dependencies, and UI regions; chiefly `server.ts` and `App.tsx` today. |
| project isolation | 项目隔离 | Restricting reads, writes, and events by project id and membership after authentication. |
| Agent Runtime | Agent Runtime | Runtime path that assembles context, calls a provider, executes tool loops, and streams results. |
| Tool | 工具 | A schema-described deterministic or integration capability callable by the Agent. |
| Skill | 技能 | A registered capability that constrains tool combinations, prompts, and domain workflows. |
| grounding | Grounding | Constraining an answer to project knowledge, repository content, memory, and citable evidence. |
| Knowledge Base / KB | 知识库 | Project-scoped searchable knowledge material and its indexes. |
| Repository | 仓库资料 | Project file/code material and its index, not necessarily this Git repository. |
| BMS | 楼宇管理系统 | The building-management system and the point, time-series, read, or control boundary exposed by a collector. |
| Brick Schema | Brick | Ontology for equipment, points, relationships, and semantic classes. |
| FDD | 故障检测与诊断 | Fault Detection and Diagnosis; deterministic detection must remain separate from Agent interpretation. |
| deployability | 可部署性 | Whether required semantic points, parameters, and evidence are available for target equipment. |
| algorithm catalog | 算法目录 | Entries with provenance, inputs, and rule definitions; catalog membership does not imply executability. |
| executable runtime | 可执行运行时 | An implementation that can actually evaluate data in current code. |
| materialization | 物化 | Persisting runtime results as queryable, attributable, displayable facts. |
| Derived Metric | 派生指标 | A metric derived from known data by a deterministic expression. |
| KPI | 关键绩效指标 | A key performance indicator tied to an operational or project objective. |
| SSE | 服务器发送事件 | One-way Agent event streaming within one HTTP request. |
| WebSocket | WebSocket | Long-lived cross-request delivery of task, state, or dashboard updates. |
| authoritative data | 权威数据 | Storage with final authority for a fact class that cannot be recovered merely by rebuilding an index. |
| rebuildable index | 可重建索引 | Search or session indexes that can be regenerated from authoritative material. |
| public fixture | 公开 fixture | Public local-test accounts, tokens, passwords, or mock responses; never a real secret. |

