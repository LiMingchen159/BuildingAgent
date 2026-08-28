---
title: BuildingAgent Developer Documentation
description: Bilingual architecture, feature, FDD, and development guidance for BuildingAgent.
hide:
  - toc
---

<div class="ba-hero" markdown>

<span class="ba-eyebrow">BUILDING OPERATIONS · AGENT RUNTIME · FDD</span>

# BuildingAgent Developer Documentation

Architecture, runtime boundaries, feature guides, FDD traceability, and verified development workflows in Chinese and English.

面向 BuildingAgent 的双语开发者文档：架构、运行时边界、功能指南、FDD 溯源与经过核验的开发流程。

[进入中文文档](developer/zh-CN/README.md){ .md-button .md-button--primary }
[Read in English](developer/en/README.md){ .md-button }

</div>

<div class="grid cards ba-card-grid" markdown>

-   :material-sitemap:{ .lg .middle } **Architecture / 架构**

    ---

    Compare the target architecture with the current implementation, runtime, storage, and event contracts.

    对照目标架构、当前实现、运行时、存储以及事件契约。

    [中文](developer/zh-CN/architecture/target-architecture.md) · [English](developer/en/architecture/target-architecture.md)

-   :material-robot-outline:{ .lg .middle } **Features / 功能**

    ---

    Follow Web, Chat, Agent Runtime, tools, knowledge, BMS, analytics, dashboards, scheduling, and CLI flows.

    阅读 Web、Chat、Agent Runtime、工具、知识、BMS、分析、仪表盘、调度与 CLI 链路。

    [中文](developer/zh-CN/features/chat-agent-runtime.md) · [English](developer/en/features/chat-agent-runtime.md)

-   :material-alert-decagram-outline:{ .lg .middle } **FDD**

    ---

    Separate product-main contracts from unmerged candidate catalogs, deployability checks, runtime, and verification evidence.

    区分产品主线契约与未合并候选目录、可部署性检查、运行时和验证证据。

    [中文](developer/zh-CN/fdd/overview.md) · [English](developer/en/fdd/overview.md)

-   :material-hammer-wrench:{ .lg .middle } **Development / 开发**

    ---

    Configure a local environment, run the verified test commands, and diagnose known contract gaps safely.

    配置本地环境、执行已验证的测试命令，并安全排查已知契约差距。

    [中文](developer/zh-CN/development/configuration.md) · [English](developer/en/development/configuration.md)

</div>

## System at a glance / 系统一览

![BuildingAgent target architecture](assets/diagrams/target-architecture.drawio.svg)

The diagram is shared by both language editions. Its editable [Draw.io source](assets/diagrams/target-architecture.drawio) is versioned alongside the SVG export.

中英文版本共用这张架构图；可编辑的 [Draw.io 源文件](assets/diagrams/target-architecture.drawio) 与 SVG 导出物一同纳入版本管理。

!!! info "Status labels / 状态标签"

    Every architecture and feature page distinguishes **Implemented**, **Partial**, **Planned**, and **External** capabilities. The target architecture is the main narrative, while the current-implementation pages remain the product truth.

    每篇架构和功能文档都会区分**已实现、部分实现、规划中、外部能力**。目标架构负责主叙事，当前实现页面负责校正产品事实。
