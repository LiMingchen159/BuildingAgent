# Decisions Register

<!-- Append-only. Never edit or remove existing rows.
     To reverse a decision, add a new row that supersedes it.
     Read this file at the start of any planning or research phase. -->

| # | When | Scope | Decision | Choice | Rationale | Revisable? | Made By |
|---|------|-------|----------|--------|-----------|------------|---------|
| D001 | project requirements | architecture | How BuildingAgent should relate to Hermes Agent | Use Hermes Agent as the engineering baseline/reference for the general agent platform layer, selectively reusing/copying/adapting MIT-licensed components and patterns when useful while preserving BuildingAgent-specific structure and attribution. | The user explicitly wants BuildingAgent to avoid unnecessary from-zero rebuilding and accelerate the foundation using Hermes patterns, without modifying the reference repo or blindly vendoring the whole codebase. | Yes — if Hermes-derived code proves mismatched to BuildingAgent's permission or domain boundaries | human |
| D002 | project requirements | scope | M001 foundation scope | Keep M001 focused on a Hermes-inspired general agent foundation plus local authenticated Web UI/CLI/backend skeleton, with building-domain capabilities represented as placeholders only. | The user wants the first version to prove platform boundaries and local workflow before adding real BIM, Brick, time-series, HHW, or building operations analytics. | Yes — after M001 validates the platform foundation | human |
