# BuildingAgent 开发者文档

[English](../en/README.md) | [仓库首页](../../../README.md) | [术语表](glossary.md) | [页面模板](page-template.md)

> 代码基线：`main@af44ff15`。中文是术语冲突时的基准版本；英文目录提供完整镜像。状态标签的含义见[术语表](glossary.md)。

本文档从目标架构开始，但始终用“已实现 / 部分实现 / 规划中 / 外部能力”校正当前事实。`server.ts` 和 `App.tsx` 是大型组合根，而不是已经拆分完成的微服务。

## 架构

- [目标架构](architecture/target-architecture.md)
- [当前实现架构](architecture/current-architecture.md)
- [运行时与存储拓扑](architecture/runtime-storage.md)
- [REST、SSE 与 WebSocket 契约](architecture/api-events.md)

## 独立功能

- [鉴权、项目与会话](features/auth-projects-conversations.md)
- [Web 工作区](features/web-workspace.md)
- [Chat 与 Agent Runtime](features/chat-agent-runtime.md)
- [Tools、Skills、Memory 与 Grounding](features/tools-skills-memory-grounding.md)
- [Knowledge Base 与 Repository](features/knowledge-base-repository.md)
- [BMS 集成](features/bms-integration.md)
- [Derived Metrics 与 KPI](features/derived-metrics-kpi.md)
- [Dashboards 与 Reports](features/dashboards-reports.md)
- [Scheduler、Realtime 与 STT](features/scheduler-realtime-stt.md)
- [CLI](features/cli.md)

## FDD 专题

- [FDD 总览](fdd/overview.md)
- [规则模型与来源](fdd/rule-model-sources.md)
- [Brick 映射及可部署性](fdd/brick-deployability.md)
- [Runtime 与物化](fdd/runtime-materialization.md)
- [验证和样本溯源](fdd/verification-provenance.md)

## 开发

- [配置与本地运行](development/configuration.md)
- [测试与验证](development/testing.md)
- [排障和已知契约差距](development/troubleshooting.md)

所有正式页面从本页最多两次点击可达。历史文档仍保留在原目录；新页面会明确标注它是现行依据、补充材料还是历史记录。

