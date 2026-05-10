---
estimated_steps: 1
estimated_files: 3
skills_used: []
---

# T04: Wire smoke script, root scripts, and README run path

Add the local smoke runner, root `smoke` script wiring, and README instructions that document the verified CLI login, project selection, and smoke path. The smoke command should launch or probe the API and Web services, invoke the built CLI through the real bin entrypoint, and always clean up child processes on success, failure, or timeout.

## Inputs

- ``package.json``
- ``apps/cli/package.json``
- ``apps/api/package.json``
- ``apps/web/package.json``
- ``README.md``

## Expected Output

- ``package.json``
- ``scripts/smoke-local.cjs``
- ``README.md``

## Verification

`npm run smoke`

## Observability Impact

Emit stage markers, probe results, and child exit codes from the smoke script so failures can be localized to API startup, Web reachability, CLI invocation, or cleanup. Keep bearer tokens and saved auth values out of all smoke logs and README examples.
