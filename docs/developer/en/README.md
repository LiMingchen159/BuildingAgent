# BuildingAgent developer documentation

[中文](../zh-CN/README.md) | [Repository home](../../../README.md) | [Glossary](glossary.md) | [Page template](page-template.md)

> Code baseline: `main@af44ff15`. Chinese is authoritative when terminology conflicts; the English tree is a complete structural mirror. See the [glossary](glossary.md) for status labels.

The documentation starts from the target architecture while continually correcting it with Implemented, Partial, Planned, and External status labels. `server.ts` and `App.tsx` are large composition roots, not already separated microservices.

## Architecture

- [Target architecture](architecture/target-architecture.md)
- [Current implementation architecture](architecture/current-architecture.md)
- [Runtime and storage topology](architecture/runtime-storage.md)
- [REST, SSE, and WebSocket contracts](architecture/api-events.md)

## Features

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

## FDD

- [FDD overview](fdd/overview.md)
- [Rule model and sources](fdd/rule-model-sources.md)
- [Brick mapping and deployability](fdd/brick-deployability.md)
- [Runtime and materialization](fdd/runtime-materialization.md)
- [Verification and sample provenance](fdd/verification-provenance.md)

## Development

- [Configuration and local run](development/configuration.md)
- [Testing and verification](development/testing.md)
- [Troubleshooting and known contract gaps](development/troubleshooting.md)

Every formal page is reachable from this index in at most two clicks. Historical documents remain in their original locations; new pages identify them as current authority, supplementary material, or historical record.

