---
estimated_steps: 1
estimated_files: 4
skills_used: []
---

# T03: Add registry and management inspection commands

Add the authenticated registry and management inspection commands so the CLI can render the same placeholder platform data exposed by S02. The commands should keep the global registry versus project-scoped management boundary intact and reject malformed payloads or missing authorization instead of silently dropping fields.

## Inputs

- ``apps/api/src/server.ts``
- ``apps/api/src/seed.ts``
- ``apps/cli/src/api.ts``
- ``apps/cli/src/config.ts``

## Expected Output

- ``apps/cli/src/registry.ts``
- ``apps/cli/src/commands.ts``
- ``apps/cli/src/index.ts``
- ``apps/cli/src/registry.test.ts``

## Verification

`npm test -- --run apps/cli/src/registry.test.ts`

## Observability Impact

Surface registry request ids, limit metadata, and placeholder-only flags in CLI output so a future agent can distinguish an empty list from a transport or authorization failure.
