---
version: 1

mode: team
planning_depth: deep
uat_dispatch: true

models:
  executor_class: balanced

workflow_prefs_captured: true

git:
  auto_push: true
  commit_docs: true
  isolation: none
  remote: origin
  main_branch: main
  snapshots: true
  pre_merge_check: auto

github:
  enabled: true
  repo: "LiMingchen159/BuildingAgent"

custom_instructions:
  - "Every meaningful enhancement, bug fix, refactor, test addition, documentation change, or implementation slice must be tracked by a GitHub Issue when possible."
  - "Before starting meaningful work, create or reference a GitHub Issue."
  - "If GitHub issue creation fails, update docs/ISSUE_BACKLOG.md instead."
  - "Every commit must reference an issue or backlog item."
  - "Use refs #N for partial progress and closes #N only when completed and validated."
  - "Do not make feature or bug-fix commits without issue/backlog traceability unless it is an emergency WIP checkpoint."
  - "When planning tasks, any file that will be newly created by a task must be declared as an expected output of that same task; do not reference non-existing files only as inputs."
  - "For trivial scaffold/index/placeholder files clearly within the current milestone scope, self-heal by creating the placeholder and updating the plan instead of pausing; never self-heal secrets, production configs, customer data, dependency artifacts, or real building-domain implementation files."

verification_commands:
  - .venv/bin/python -m pytest
verification_auto_fix: true
verification_max_retries: 2

pre_dispatch_hooks:
  - name: issue-traceability-before-task
    before: [execute-task]
    action: modify
    prepend: |
      Before executing this task, identify or create/reference the corresponding GitHub Issue. If GitHub Issue creation is unavailable, create or update docs/ISSUE_BACKLOG.md. Ensure the task has issue/backlog traceability before making feature, bug-fix, refactor, test, documentation, or implementation changes.

post_unit_hooks:
  - name: issue-traceability-review
    after: [execute-task]
    prompt: |
      Review whether issue traceability was followed for this execute-task unit. Confirm the GitHub Issue or docs/ISSUE_BACKLOG.md item referenced by the work and whether commits used refs/closes correctly. If traceability is missing, write ISSUE_TRACEABILITY_REVIEW.md with the gap, remediation, and required issue/backlog reference before continuing.
    max_cycles: 1
    artifact: ISSUE_TRACEABILITY_REVIEW.md
---