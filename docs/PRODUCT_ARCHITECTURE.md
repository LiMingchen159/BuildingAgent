# Product Architecture

## Overview

BuildingAgent is a monorepo with a Python backend/agent runtime, a Next.js Web UI, a CLI, gateway adapters, project-scoped memory, tool and skill systems, and documentation for future building-domain extensions.

## Architecture Diagram

```mermaid
flowchart TD
    Web[Authenticated Web UI]
    CLI[Authenticated CLI]
    Email[Verified Email Gateway]
    WhatsApp[Verified WhatsApp Gateway]

    Web --> Auth[Auth + Request Context]
    CLI --> Auth
    Email --> Auth
    WhatsApp --> Auth

    Auth --> Project[Workspace / Project Layer]
    Project --> Runtime[Hermes-like Core Runtime]

    Runtime --> Prompt[Prompt Builder]
    Runtime --> Provider[Model Provider Resolver]
    Runtime --> Session[Session Manager]
    Runtime --> Events[Event Stream]
    Runtime --> Dispatcher[Permission-aware Tool Dispatcher]
    Runtime --> Memory[Project-scoped Memory]
    Runtime --> Skills[Skill Registry + Injection]

    Dispatcher --> Tools[Tool Registry]
    Tools --> General[General Tool Specs]
    Tools --> Building[Future Building Tool Placeholders]

    Memory --> Data[(Data Layer)]
    Project --> Audit[Audit Logs]
    Dispatcher --> Audit
    Memory --> Audit
    Provider --> Secrets[Secure Provider Secret Store]

    Skills --> SkillFiles[Markdown/YAML Skills]
```

## Boundaries

- Entry points authenticate users but do not execute tools directly.
- Runtime receives a resolved request context.
- Tool dispatcher is the only path to tool execution.
- Permission checks are backend-side.
- Memory and data retrieval are project-scoped.
- Audit logs are emitted for sensitive tool, memory, and data access.

## M001 Architecture Output

M001 creates documentation and placeholders. It does not implement the runtime, Web UI, CLI, gateways, memory, tools, or skills.
