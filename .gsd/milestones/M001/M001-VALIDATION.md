# BLOCKER — auto-mode recovery failed

Unit `validate-milestone` for `M001` failed to produce this artifact after idle recovery exhausted all retries.

**Reason**: Deterministic policy rejection for validate-milestone "M001": subagent: HARD BLOCK: unit "validate-milestone" runs under tools-policy "planning-dispatch" — subagent dispatch of "scout" not permitted by ToolsPolicy.allowedSubagents; permitted agents for this unit: reviewer, security, tester. This is a mechanical gate enforced by manifest.tools (#4934). You MUST NOT proceed, retry the same call, or rationalize past this block. If you need to write user source, the work belongs in execute-task, not in a planning unit.. Retrying cannot resolve this gate — writing blocker placeholder to advance pipeline.

This placeholder was written by auto-mode so the pipeline can advance.
Review and replace this file before relying on downstream artifacts.