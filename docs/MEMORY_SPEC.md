# Memory Specification

## Memory Types

- Session memory: conversation-local state and recent context.
- User memory: private preferences or stable facts scoped to a user.
- Project memory: shared project knowledge visible to authorized project members.
- Future building memory: building-domain entities, relationships, and observations.

## Search

Initial searchable memory may use SQLite FTS5 or Postgres full-text search. The choice should be made in an implementation milestone after the data layer is selected.

## Isolation

- Project A memory must never be retrieved for Project B.
- User-private memory must not be visible to other users.
- Building/project memory is available only to users with project access.
- Sensitive memory access should be audit logged.

## M001 Scope

M001 specifies memory behavior only. It does not implement storage or retrieval.
