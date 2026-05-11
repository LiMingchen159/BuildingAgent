---
version: 1
models:
  executor_class: balanced
uat_dispatch: true
git:
  isolation: none
  main_branch: buildingagent
  auto_push: true
  push_branches: false
  snapshots: true
  pre_merge_check: true
  merge_strategy: merge
  absorb_snapshot_commits: true
stale_commit_threshold_minutes: 30
planning_depth: deep
commit_policy: per-task
branch_model: single
workflow_prefs_captured: true
---

# GSD Skill Preferences

See `~/.gsd/agent/extensions/gsd/docs/preferences-reference.md` for full field documentation and examples.
