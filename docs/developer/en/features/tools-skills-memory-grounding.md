# Tools, Skills, Memory, and Grounding

[中文](../../zh-CN/features/tools-skills-memory-grounding.md) | [Developer documentation home](../README.md) | [Chat Runtime](chat-agent-runtime.md)

> Code baseline: `main@af44ff15`. Status: project-scoped registries, Memory, and Grounding are Implemented; some tools depend on External services or the local runtime environment.

## 1. Status and code baseline

[tools.ts](../../../../apps/api/src/agent/tools.ts) provides registration, OpenAI tool-schema conversion, dispatch, result compaction, and logs. [genericTools.ts](../../../../apps/api/src/agent/genericTools.ts) assembles Memory, session retrieval, files, BMS, derived metrics, Dashboard, execution, scheduling, web, and feedback tools. [skills.ts](../../../../apps/api/src/agent/skills.ts) represents a Skill as a prompt hint. [curatedMemory.ts](../../../../apps/api/src/agent/curatedMemory.ts) and [projectGrounding.ts](../../../../apps/api/src/projectGrounding.ts) persist two different forms of long-lived context.

Tool execution, Skill injection, Memory banks, and project-rule retrieval are **Implemented**. Tools that rely on a collector, network, or interpreter are **Partial/External**. Placeholder entries in `/api/registry` are not proof of runtime availability.

## 2. Purpose and scope

- **Tool**: an executable function with a JSON schema. It returns serializable results and may create files or external side effects.
- **Skill**: a project-enabled prompt guideline; it does not automatically create a process or grant authority.
- **Memory**: capacity-bounded curated text for user preferences or declarative project facts, not time series or executable rules.
- **Grounding rule**: a project rule with source, status, and trigger fields. It is retrieved into the prompt and used to validate the final answer.
- **Playbook/feedback**: a separate propose, approve, implement, and commit lifecycle after user correction; it must not be collapsed into ordinary Memory.

## 3. User and source entry points

| Responsibility | Entry |
| --- | --- |
| Tool registry and logs | [apps/api/src/agent/tools.ts](../../../../apps/api/src/agent/tools.ts), `GET /api/projects/:projectId/tool-logs` |
| Generic tools | [apps/api/src/agent/genericTools.ts](../../../../apps/api/src/agent/genericTools.ts) |
| Skill registry/bindings | [apps/api/src/agent/skills.ts](../../../../apps/api/src/agent/skills.ts), [projectSkills.ts](../../../../apps/api/src/projectSkills.ts) |
| Memory REST | `GET/PATCH /api/projects/:projectId/memory/{user,project,global}` |
| Rule summary | `GET /api/projects/:projectId/memory/rules` |
| Grounding retrieval | [groundingRuleRetrieval.ts](../../../../apps/api/src/groundingRuleRetrieval.ts), [groundingRuleIndex.ts](../../../../apps/api/src/groundingRuleIndex.ts) |
| Feedback workflow | [projectFeedback.ts](../../../../apps/api/src/projectFeedback.ts), [projectRules.ts](../../../../apps/api/src/projectRules.ts) |

## 4. Normal data flow

1. Startup registers built-in tools and Skills and merges default skill ids for each project. Runtime Skills are always added back to the project binding.
2. Every Chat turn reads project Skill hints, a Memory snapshot, approved Grounding, and committed playbooks.
3. The Grounding index performs project-filtered FTS and merges dense retrieval when embeddings are available; it can degrade to keyword-only retrieval.
4. Runtime sends tool schemas to the provider. When the provider returns tool calls, the registry dispatches them with model-independent tool context and compacts the results.
5. Each call is logged with project/conversation/request/user dimensions in `tool_call_logs.json`; its result is returned to the provider as a `role=tool` message.
6. Memory writes deduplicate, enforce length, scan threat patterns, and invalidate affected conversation snapshots. A snapshot remains stable within its lifecycle.
7. User-approved rules are stored in SeedStore and also update the Grounding SQLite index; startup can rebuild that index from SeedStore.

## 5. Data, state, and persistence

| Data | Default location | Recovery semantics |
| --- | --- | --- |
| Project Skill bindings, Grounding, feedback/proposals | `apps/data/store.json` | Authoritative local state. |
| Project-local user Memory | `data/<project>/memories/users/<user>/USER.md` | Authoritative curated text. |
| Global user Memory | `data/global/memories/users/<user>/USER.md` | Merged across projects but still user-isolated. |
| Project Memory | `data/<project>/memories/PROJECT.md` | Declarative project facts; writes require configure. |
| Grounding retrieval | `data/grounding_index.db` | Rebuildable from SeedStore. |
| Tool logs | `data/tool_call_logs.json` | Best-effort diagnostic/audit data, default maximum 2,000 entries. |

The default user and project Memory character limits are 1,375 and 2,200; entries use `§` as a delimiter. These banks are neither unbounded context nor secret storage.

## 6. Authorization and project isolation

Every REST Memory route requires token, membership, and the selected project. Project Memory PATCH explicitly requires `project:configure`. Project-local and global user Memory PATCH write for the authenticated user and do not accept another user id. Skill create/edit/delete and project Grounding/rule writes check `canConfigure` in the tool layer; built-in Skills cannot be edited or deleted through Chat.

Tool context determines file roots, session retrieval, logs, and Dashboard operations from the project id. External data tools must also enforce the relevant connection/project boundary themselves; receiving tool context does not prove that a downstream service is tenant-isolated.

## 7. Errors, degradation, and external dependencies

- An unknown or throwing tool becomes an `{error: ...}` result and is logged; the HTTP request does not necessarily fail immediately.
- Tool results are compacted to control context. A complete large result may be handed off through project files/cache; an answer cannot assume every source row remains in the prompt.
- Memory threat scan, capacity, or shape failures return `422`; missing project-write authority returns `403 bounds_violation`.
- When embeddings are unavailable, Grounding degrades to FTS. Recall quality changes, but the search remains project-filtered.
- BMS, web, terminal, Python, and speech tools rely on External services or the host. A schema in the registry does not prove that a dependency is healthy.

## 8. Extension points

A new Tool should define a minimal schema, consume tool context, constrain paths and side effects, return compactable structured results, and include success/error/authorization tests. Before adding a Skill, decide whether the behavior is only guidance; deterministic business rules belong in code or Grounding rather than a hidden long prompt. A new Memory type needs an owner, scope, capacity, threat scan, and recovery semantics. A Grounding schema change must account for both SeedStore migration and SQLite rebuild.

## 9. Tests

- Tool parallelism and order: [apps/api/src/agent/runtime.toolParallel.test.ts](../../../../apps/api/src/agent/runtime.toolParallel.test.ts)
- Tool-result compaction and logging behavior: [apps/api/src/agent/toolResultCompaction.test.ts](../../../../apps/api/src/agent/toolResultCompaction.test.ts)
- Memory files, snapshots, safety, and migration: [apps/api/src/agent/curatedMemory.test.ts](../../../../apps/api/src/agent/curatedMemory.test.ts)
- Memory REST: [apps/api/src/memory.api.test.ts](../../../../apps/api/src/memory.api.test.ts)
- Project Skill bindings: [apps/api/src/projectSkills.test.ts](../../../../apps/api/src/projectSkills.test.ts)
- Grounding model and retrieval: [apps/api/src/projectGrounding.test.ts](../../../../apps/api/src/projectGrounding.test.ts), [groundingRuleRetrieval.test.ts](../../../../apps/api/src/groundingRuleRetrieval.test.ts)

## 10. Known limitations and related documentation

- `/api/registry` combines placeholders with summaries of real Agent tools/skills and returns `placeholderOnly: true`; it is a management view, not a health probe.
- Tool logs contain arguments and results. Despite presentation-layer redaction, production needs access control, field-level redaction, and retention policy.
- Memory, Grounding, and playbooks have different approval and execution semantics and must not be merged merely because all may enter a prompt.
- Final Grounding validation produces warnings; it does not automatically recompute or block an answer.
- Continue with [Chat and Agent Runtime](chat-agent-runtime.md), [Knowledge Base and Repository](knowledge-base-repository.md), and the [FDD rule model](../fdd/rule-model-sources.md).
