# S03: Authenticated CLI shell and local smoke checks — UAT

**Milestone:** M001
**Written:** 2026-05-10T12:09:32.955Z

# S03: Authenticated CLI shell and local smoke checks — UAT

**Milestone:** M001
**Written:** 2026-05-10

## UAT Type

- UAT mode: mixed
- Why this mode is sufficient: This slice ships an executable CLI workspace plus a root smoke command, so acceptance is proven by a combination of live-runtime smoke execution and artifact-driven inspection of persisted CLI state/output shape.

## Preconditions

- Seeded local API and Web services are available or startable by the smoke runner.
- The repo root can run workspace build/typecheck/test commands.
- The CLI is allowed to create a temporary isolated home directory for local config persistence.

## Smoke Test

Run `npm run smoke` from the repo root.

Expected: the command builds the workspaces, starts or probes API/Web, logs into the CLI, selects a project, exercises registry/management/chat inspection, prints `[smoke]` stage markers and child exit codes, and exits 0 after cleanup.

## Test Cases

### 1. Fresh CLI login and session rehydration

1. Run the built CLI login flow through the smoke command.
2. Re-run a fresh CLI invocation that reads the saved config.
3. Inspect session output.
4. **Expected:** the CLI reuses the saved bearer token and selected project, and `session` shows redaction-safe state without exposing token material.

### 2. Project selection and project-scoped chat

1. Authenticate the CLI.
2. Select a seeded project.
3. Send a chat message and list recent chat state.
4. **Expected:** the CLI uses the selected project for chat commands, and missing or invalid project state fails closed with canonical backend error codes plus request ids.

### 3. Registry and management placeholder inspection

1. Run the CLI registry inspection command.
2. Run the CLI management inspection command for the selected project.
3. Compare the rendered output with the synthetic placeholder contract.
4. **Expected:** the CLI renders authenticated placeholder registry/management data, preserves request-id metadata, and rejects malformed placeholder payloads instead of silently dropping fields.

### 4. Smoke cleanup and failure localization

1. Force the smoke runner to start from a clean temp CLI home.
2. Observe a successful run or inspect a failure run.
3. **Expected:** the smoke runner emits stage markers, probe results, and child process exit codes, then removes the temp CLI home and terminates any child API/Web processes.

## Edge Cases

### Missing auth or forbidden project selection

1. Remove saved CLI auth or attempt to select an unauthorized project.
2. **Expected:** the CLI reports canonical backend error code/request-id pairs and does not fall back to vague local-only errors.

### Malformed placeholder response

1. Simulate an invalid registry or management payload.
2. **Expected:** the CLI fails closed with `api_malformed` rather than rendering a partial or misleading placeholder view.

## Failure Signals

- `npm run smoke` exits non-zero.
- CLI output omits request ids, child exit codes, or stage markers.
- Token-like values appear in logs or README examples.
- Registry/management output accepts malformed payloads or drops fields silently.

## Not Proven By This UAT

- Non-local deployment packaging of the CLI binary.
- Real external integrations for registry, management, or chat providers.
- Long-running robustness under load or concurrent multi-user stress.
- Future milestone hardening such as non-GET registry/management method checks and non-local auth guards.

## Notes for Tester

The smoke command is the authoritative end-to-end proof for this slice. The CLI should be verified in a fresh process, not by calling command internals directly, because the slice depends on persisted config reuse across invocations.
