# Hermes Replication Strategy

## Reference

BuildingAgent uses the local NousResearch Hermes Agent repository as a read-only reference:

`/mnt/d/Git_project/references/hermes-agent`

Do not modify that repository. Do not vendor the full Hermes repository into BuildingAgent. If MIT-licensed Hermes code is copied later, preserve attribution and license notices and document the copied source in `third_party_licenses/`.

## Replicate

BuildingAgent should replicate these Hermes-style platform concepts at the architectural level:

- Agent loop and request lifecycle.
- Prompt builder and context assembly.
- Runtime provider abstraction.
- Model/provider resolver.
- Tool registry and dispatcher.
- Session manager.
- Persistent memory concepts.
- Skill loading and injection.
- Gateway/entrypoint separation from runtime execution.
- Configuration-driven provider and runtime behavior.
- Event/callback stream suitable for UI updates.

## Adapt

Hermes concepts must be adapted for BuildingAgent's requirements:

- Every request must resolve `user_id`, `workspace_id`, `project_id`, role, and permission scopes.
- Every tool call must go through a permission-aware dispatcher.
- Memory retrieval must be project-scoped and user-aware.
- Sensitive tool, memory, and data access should be audit logged.
- Web UI, CLI, Email, and WhatsApp must share the same backend runtime contract.
- Configuration must support per-project model providers, tool permissions, skill enablement, and data-source settings.

## Defer

These Hermes-like concepts can remain documented until later implementation milestones:

- Scheduler support.
- Subagent orchestration.
- Trajectory/context compression.
- Full browser automation.
- MCP integration.
- Production-grade provider plugin ecosystem.

## Replace or Extend with Building-Domain Logic

BuildingAgent will later add building-domain tools and skills for BIM/IFC, Brick/RDF/SPARQL, time-series, cross-source linking, visualization, and HHW reset analysis. These should extend the Hermes-like platform foundation rather than replace it.

In M001, building-domain files are placeholders only. They must not import `ifcopenshell`, `rdflib`, `pandas`, `matplotlib`, or other heavy domain dependencies.

## Copying Policy

Prefer reimplementation or small, understood adaptations over direct copying. If copying is justified later:

1. Identify the exact source file and commit/reference.
2. Confirm the license.
3. Preserve license notices.
4. Add attribution under `third_party_licenses/`.
5. Document why copying is better than reimplementation.
