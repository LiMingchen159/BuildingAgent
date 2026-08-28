# Feature documentation page template

[中文](../zh-CN/page-template.md) | [Developer documentation home](README.md)

> Code baseline: `main@af44ff15`. Copying this structure requires creating or updating the Chinese mirror at the same time.

## 1. Status and code baseline

Use `Implemented / Partial / Planned / External`, and name the verified commit, source entry points, and factual boundary.

## 2. Purpose and scope

State the problem being solved, explicit non-responsibilities, and differences between target architecture and current implementation.

## 3. User and source entry points

List Web, CLI, or API entry points together with verifiable source, type, and route locations.

## 4. Normal data flow

Describe the primary request, processing, response, and event sequence.

## 5. Data, state, and persistence

Distinguish authoritative data, user files, rebuildable indexes, caches, and external-system state.

## 6. Authorization and project isolation

Describe authentication, roles, project scope, and cross-project protections.

## 7. Errors, degradation, and external dependencies

List error envelopes, retry/fallback behavior, and optional or required external services.

## 8. Extension points

Identify registries, interfaces, directories, and verification practices to reuse without promising unimplemented behavior.

## 9. Tests

Name concrete test files and recommended commands; record results with their execution environment.

## 10. Known limitations and related documentation

List contract gaps, technical debt, and related architecture, FDD, or development pages.

