# BuildingAgent

## What This Is

BuildingAgent is a building-domain autonomous agent platform inspired by NousResearch Hermes Agent. It will become a Hermes-like platform specialized for building data, BIM, semantic models, time-series data, and building operations workflows. The first version focuses on a local working platform foundation skeleton rather than real building-domain analytics.

## Core Value

The core value is a clean, authenticated, project-isolated platform foundation where the login → project selection → chat workspace flow works and all future tools, skills, memory, runtime, and provider configuration have clear boundaries.

## Project Shape

- **Complexity:** complex
- **Why:** Multi-entry platform with Web UI, CLI, backend API, auth, RBAC, project isolation, runtime/tool/skill/memory/provider skeletons, and external-channel placeholders.

## Current State

The repository is effectively greenfield, with only a minimal README present. Hermes Agent exists locally at `/mnt/d/Git_project/references/hermes-agent` as a read-only architectural reference. No production BuildingAgent implementation exists yet.

## Architecture / Key Patterns

Use Hermes as an architectural and code reference, but do not modify it and do not vendor the full Hermes codebase. Build a modern React/Next.js-style product interface, not Streamlit. Include backend-side auth and permission checks, multi-workspace/multi-project structure, RBAC-first permission design, project-scoped memory/data isolation, a Hermes-like runtime skeleton, tool/skill registries, model/provider configuration skeleton, authenticated CLI, placeholder Email and WhatsApp gateways, and placeholder building-domain tools and skills only.

## Capability Contract

See `.gsd/REQUIREMENTS.md` for the explicit capability contract, requirement status, and coverage mapping.

## Milestone Sequence

- [ ] M001: Local Foundation Skeleton — Build the smallest authenticated local platform where backend, Web UI, CLI, login, project selection, chat workspace, registries, placeholders, smoke checks, and README all work coherently.
