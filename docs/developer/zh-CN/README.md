---
title: BuildingAgent 开发者文档
description: 面向 BuildingAgent 实现者的架构、Agent Runtime、楼宇数据与 FDD 技术手册。
hide:
  - toc
---

<div class="ba-hero ba-hero--compact" markdown>

<span class="ba-eyebrow">中文 · 开发者手册</span>

# 从代码事实理解 BuildingAgent

面向实现者的完整技术手册：理解架构、Agent Runtime、楼宇数据、分析能力与 FDD 全链路，并明确当前实现、候选能力和外部边界。

[从目标架构开始](architecture/target-architecture.md){ .md-button .md-button--primary }
[配置本地环境](development/configuration.md){ .md-button }
[English](../en/README.md){ .md-button }

<div class="ba-hero__meta">
  <span><strong>4</strong> 个主题域</span>
  <span><strong>25</strong> 个完整页面</span>
  <span><strong>代码</strong> 路径可追踪</span>
  <span><strong>状态</strong> 边界明确</span>
</div>

</div>

<div class="ba-status-strip">
  <span class="is-implemented">已实现</span>
  <span class="is-partial">部分实现</span>
  <span class="is-planned">规划中</span>
  <span class="is-external">外部能力</span>
</div>

<div class="ba-section-intro">
  <div><span class="ba-kicker">推荐路径</span></div>
  <div>
    <h2>按你要完成的工作开始</h2>
    <p>每条路径从整体边界进入，再逐步落到源码入口、数据流、权限、测试和已知限制。</p>
  </div>
</div>

<div class="grid cards ba-route-grid" markdown>

-   :material-sitemap:{ .lg .middle } **理解系统**

    [目标架构](architecture/target-architecture.md) → [当前实现](architecture/current-architecture.md) → [运行时与存储](architecture/runtime-storage.md)

-   :material-console-line:{ .lg .middle } **开始开发**

    [配置与本地运行](development/configuration.md) → [测试与验证](development/testing.md) → [排障](development/troubleshooting.md)

-   :material-robot-outline:{ .lg .middle } **扩展 Agent**

    [Chat Runtime](features/chat-agent-runtime.md) → [Tools 与 Memory](features/tools-skills-memory-grounding.md) → [Knowledge Base](features/knowledge-base-repository.md)

-   :material-alert-decagram-outline:{ .lg .middle } **实施 FDD**

    [FDD 总览](fdd/overview.md) → [Brick 可部署性](fdd/brick-deployability.md) → [Runtime](fdd/runtime-materialization.md) → [验证溯源](fdd/verification-provenance.md)

</div>

<div class="ba-index-section" markdown>

## 架构

先建立系统边界，再进入具体功能。目标叙事与当前实现始终分开表达。

- [目标架构](architecture/target-architecture.md)
- [当前实现架构](architecture/current-architecture.md)
- [运行时与存储拓扑](architecture/runtime-storage.md)
- [REST、SSE 与 WebSocket 契约](architecture/api-events.md)

</div>

<div class="ba-index-section" markdown>

## 独立功能

从用户入口一路追踪到 Runtime、数据、权限、降级和测试。

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

</div>

<div class="ba-index-section" markdown>

## FDD 专题

区分算法目录、可部署性、可执行 Runtime、结果物化与验证证据。

- [FDD 总览](fdd/overview.md)
- [规则模型与来源](fdd/rule-model-sources.md)
- [Brick 映射及可部署性](fdd/brick-deployability.md)
- [Runtime 与物化](fdd/runtime-materialization.md)
- [验证和样本溯源](fdd/verification-provenance.md)

</div>

<div class="ba-index-section" markdown>

## 开发与维护

使用经过核对的命令运行项目，并保留已知测试与契约边界。

- [配置与本地运行](development/configuration.md)
- [测试与验证](development/testing.md)
- [排障和已知契约差距](development/troubleshooting.md)
- [术语表](glossary.md)
- [页面模板](page-template.md)

</div>

<div class="ba-trust-strip">
  <span>中文术语为冲突时的基准</span>
  <span>英文版本保持完整镜像</span>
  <span><a href="https://github.com/LiMingchen159/BuildingAgent">仓库首页</a></span>
  <span><a href="glossary/">查看状态与术语定义</a></span>
</div>
