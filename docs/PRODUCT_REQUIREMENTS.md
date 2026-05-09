# Product Requirements

## Definition

BuildingAgent is a building-domain Hermes-like autonomous agent platform. It starts with a general authenticated agent foundation, then later grows building-domain capabilities.

## Target Users

1. The project owner's development and research workflow.
2. An internal building-engineering/research team.
3. Later, external customer or project teams after the foundation is proven.

## Core Use Cases

- Use an authenticated Web UI to access project-scoped agent conversations and configuration.
- Use an authenticated CLI for development, research, model, tool, and skill workflows.
- Route future verified Email and WhatsApp requests into the same backend runtime.
- Configure models/providers, tools, skills, data sources, users, permissions, and audit surfaces per project.
- Run agent workflows through a Hermes-like runtime with permission-aware tool dispatch and project-scoped memory.

## MVP Scope

The MVP foundation includes:

- Authenticated Web UI skeleton.
- Authenticated CLI skeleton.
- Backend auth/project model skeleton.
- Hermes-like runtime skeleton.
- Memory skeleton.
- Tool registry skeleton.
- Skill registry skeleton.
- Model/provider configuration skeleton.
- Project isolation and RBAC-first access-control model.
- Auditability designed into sensitive paths.

M001 is earlier than the MVP implementation: it creates planning docs, folder structure, and placeholders only.

## Out of Scope for M001

- Functional Web UI or CLI implementation.
- Real Email or WhatsApp provider integration.
- BIM/IFC, Brick/RDF/SPARQL, time-series, cross-source linking, visualization, or HHW analysis logic.
- Production deployment.
- Real customer/private building data.
- Heavy dependency lock-in.
- Streamlit.
- Vendoring the full Hermes repository.

## Success Criteria

- A fresh engineer can understand the platform direction from the docs.
- The repository structure supports planned implementation without reorganizing first.
- Building-domain placeholders exist but make no implementation claims.
- Requirements clearly separate M001 planning from M002+ implementation.
- Hermes reuse policy is explicit and attribution-safe.
