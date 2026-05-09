# Runtime Specification

## Purpose

The runtime is the Hermes-like execution core shared by Web UI, CLI, Email, and WhatsApp entry points.

## Core Components

- Agent loop
- Prompt builder
- Runtime provider abstraction
- Model/provider resolver
- Tool registry
- Permission-aware tool dispatcher
- Session manager
- Event/callback stream
- Memory access layer
- Skill injection

## Request Lifecycle

1. Entrypoint authenticates the user.
2. Backend resolves workspace, project, role, and permission scopes.
3. Runtime builds prompt/context from session, memory, project config, and enabled skills.
4. Provider resolver selects the allowed model/provider.
5. Agent loop runs.
6. Tool calls route through the dispatcher.
7. Dispatcher checks permissions and audit rules before execution.
8. Events stream back to the entry point.
9. Session and memory updates are persisted within project scope.

## Future Support

Scheduler, subagents, and trajectory/context compression are planned but deferred.
