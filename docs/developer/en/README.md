---
title: BuildingAgent developer documentation
description: Architecture, Agent Runtime, building data, and FDD guidance for BuildingAgent implementers.
hide:
  - toc
---

<div class="ba-hero ba-hero--compact" markdown>

<span class="ba-eyebrow">ENGLISH · DEVELOPER HANDBOOK</span>

# Understand BuildingAgent from source facts

The complete technical handbook for implementers: architecture, Agent Runtime, building data, analytics, and FDD—with current implementation, candidate work, and external boundaries kept explicit.

[Start with target architecture](architecture/target-architecture.md){ .md-button .md-button--primary }
[Configure a local environment](development/configuration.md){ .md-button }
[中文](../zh-CN/README.md){ .md-button }

<div class="ba-hero__meta">
  <span><strong>4</strong> topic areas</span>
  <span><strong>25</strong> complete pages</span>
  <span><strong>Source</strong> paths traced</span>
  <span><strong>Status</strong> boundaries explicit</span>
</div>

</div>

<div class="ba-status-strip">
  <span class="is-implemented">Implemented</span>
  <span class="is-partial">Partial</span>
  <span class="is-planned">Planned</span>
  <span class="is-external">External</span>
</div>

<div class="ba-section-intro">
  <div><span class="ba-kicker">RECOMMENDED PATHS</span></div>
  <div>
    <h2>Start with the work you need to complete</h2>
    <p>Each route begins with the system boundary, then narrows into source entry points, data flow, authorization, tests, and known limitations.</p>
  </div>
</div>

<div class="grid cards ba-route-grid" markdown>

-   :material-sitemap:{ .lg .middle } **Understand the system**

    [Target architecture](architecture/target-architecture.md) → [Current implementation](architecture/current-architecture.md) → [Runtime and storage](architecture/runtime-storage.md)

-   :material-console-line:{ .lg .middle } **Start developing**

    [Configuration](development/configuration.md) → [Testing](development/testing.md) → [Troubleshooting](development/troubleshooting.md)

-   :material-robot-outline:{ .lg .middle } **Extend the Agent**

    [Chat Runtime](features/chat-agent-runtime.md) → [Tools and Memory](features/tools-skills-memory-grounding.md) → [Knowledge Base](features/knowledge-base-repository.md)

-   :material-alert-decagram-outline:{ .lg .middle } **Implement FDD**

    [FDD overview](fdd/overview.md) → [Brick deployability](fdd/brick-deployability.md) → [Runtime](fdd/runtime-materialization.md) → [Verification](fdd/verification-provenance.md)

</div>

<div class="ba-index-section" markdown>

## Architecture

Establish system boundaries before entering individual capabilities. Target narrative and current implementation stay separate.

- [Target architecture](architecture/target-architecture.md)
- [Current implementation architecture](architecture/current-architecture.md)
- [Runtime and storage topology](architecture/runtime-storage.md)
- [REST, SSE, and WebSocket contracts](architecture/api-events.md)

</div>

<div class="ba-index-section" markdown>

## Features

Trace each user entry point through Runtime, data, authorization, degradation, and tests.

- [Authentication, projects, and conversations](features/auth-projects-conversations.md)
- [Web workspace](features/web-workspace.md)
- [Chat and Agent Runtime](features/chat-agent-runtime.md)
- [Tools, Skills, Memory, and Grounding](features/tools-skills-memory-grounding.md)
- [Knowledge Base and Repository](features/knowledge-base-repository.md)
- [BMS integration](features/bms-integration.md)
- [Derived Metrics and KPI](features/derived-metrics-kpi.md)
- [Dashboards and Reports](features/dashboards-reports.md)
- [Scheduler, Realtime, and STT](features/scheduler-realtime-stt.md)
- [CLI](features/cli.md)

</div>

<div class="ba-index-section" markdown>

## FDD

Separate algorithm catalogs, deployability, executable Runtime, result materialization, and verification evidence.

- [FDD overview](fdd/overview.md)
- [Rule model and sources](fdd/rule-model-sources.md)
- [Brick mapping and deployability](fdd/brick-deployability.md)
- [Runtime and materialization](fdd/runtime-materialization.md)
- [Verification and sample provenance](fdd/verification-provenance.md)

</div>

<div class="ba-index-section" markdown>

## Development and maintenance

Run the project with verified commands while preserving known test and contract boundaries.

- [Configuration and local run](development/configuration.md)
- [Testing and verification](development/testing.md)
- [Troubleshooting and known contract gaps](development/troubleshooting.md)
- [Glossary](glossary.md)
- [Page template](page-template.md)

</div>

<div class="ba-trust-strip">
  <span>Chinese is authoritative for terminology conflicts</span>
  <span>English remains a complete mirror</span>
  <span><a href="https://github.com/LiMingchen159/BuildingAgent">Repository home</a></span>
  <span><a href="glossary/">Status and terminology definitions</a></span>
</div>
