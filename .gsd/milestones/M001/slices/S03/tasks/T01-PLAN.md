---
estimated_steps: 1
estimated_files: 8
skills_used: []
---

# T01: Scaffold the CLI workspace and isolated config store

Create the standalone CLI workspace with isolated config persistence, a redaction-safe error shape, and test coverage that proves config never spills into the real home directory. Add the root workspace/test router updates needed for focused CLI tests to run from the repo root.

## Inputs

- ``package.json``
- ``package-lock.json``
- ``scripts/run-tests.cjs``
- ``tsconfig.base.json``
- ``apps/api/package.json``
- ``apps/web/package.json``

## Expected Output

- ``package.json``
- ``package-lock.json``
- ``scripts/run-tests.cjs``
- ``apps/cli/package.json``
- ``apps/cli/tsconfig.json``
- ``apps/cli/src/config.ts``
- ``apps/cli/src/config.test.ts``
- ``apps/cli/src/index.ts``

## Verification

`npm test -- --run apps/cli/src/config.test.ts`

## Observability Impact

Add config-path and config-load failure signals that make it obvious which CLI home directory was used and why a config read/write failed, while redacting token values from all errors and test output.
