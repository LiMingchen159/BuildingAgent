---
title: BuildingAgent Developer Documentation
description: Bilingual architecture, feature, FDD, and development guidance for BuildingAgent.
hide:
  - toc
---

<div class="ba-hero" markdown>

<span class="ba-eyebrow">BUILDING INTELLIGENCE · AGENT RUNTIME · FDD</span>

# BuildingAgent

A source-linked technical handbook for the platform that connects natural-language workflows, building data, deterministic analytics, and fault detection.

面向 BuildingAgent 实现者的技术手册：从自然语言工作流到楼宇数据、确定性分析与故障检测，每项说明都回到代码与验证证据。

[进入中文文档](developer/zh-CN/README.md){ .md-button .md-button--primary }
[Read in English](developer/en/README.md){ .md-button }

<div class="ba-hero__meta">
  <span><strong>4</strong> architecture layers</span>
  <span><strong>2</strong> mirrored editions</span>
  <span><strong>Draw.io</strong> editable diagrams</span>
  <span><strong>Source</strong> linked evidence</span>
</div>

</div>

<div class="ba-section-intro">
  <div><span class="ba-kicker">START WITH AN OUTCOME</span></div>
  <div>
    <h2>Choose a path / 按目标阅读</h2>
    <p>Skip the document tree. Begin with the task you need to complete, then follow the linked implementation boundary.</p>
  </div>
</div>

<div class="grid cards ba-route-grid" markdown>

-   :material-sitemap:{ .lg .middle } **Understand the system / 理解系统**

    Target architecture, current implementation, runtime, storage, and event contracts.

    [中文](developer/zh-CN/architecture/target-architecture.md) · [English](developer/en/architecture/target-architecture.md)

-   :material-console-line:{ .lg .middle } **Run it locally / 本地运行**

    Configuration, verified commands, regression boundaries, and troubleshooting.

    [中文](developer/zh-CN/development/configuration.md) · [English](developer/en/development/configuration.md)

-   :material-robot-outline:{ .lg .middle } **Extend the Agent / 扩展 Agent**

    Chat Runtime, tools, skills, memory, grounding, Knowledge Base, and Repository.

    [中文](developer/zh-CN/features/chat-agent-runtime.md) · [English](developer/en/features/chat-agent-runtime.md)

-   :material-alert-decagram-outline:{ .lg .middle } **Implement FDD / 实施 FDD**

    Rule sources, Brick deployability, runtime materialization, and verification evidence.

    [中文](developer/zh-CN/fdd/overview.md) · [English](developer/en/fdd/overview.md)

</div>

<div class="ba-trust-strip">
  <span>中英结构镜像</span>
  <span>Current vs target separated</span>
  <span>接口差距显式标注</span>
  <span>Verification is reproducible</span>
</div>

<div class="ba-diagram-heading">
  <h2>System at a glance / 系统一览</h2>
  <p>The target narrative and implementation status share one editable architecture map.</p>
</div>

![BuildingAgent target architecture](assets/diagrams/target-architecture.drawio.svg)

The diagram is shared by both language editions. Open the [target architecture guide](developer/zh-CN/architecture/target-architecture.md) or inspect the editable [Draw.io source](assets/diagrams/target-architecture.drawio).

<div class="ba-status-strip">
  <span class="is-implemented">已实现 / Implemented</span>
  <span class="is-partial">部分实现 / Partial</span>
  <span class="is-planned">规划中 / Planned</span>
  <span class="is-external">外部能力 / External</span>
</div>
