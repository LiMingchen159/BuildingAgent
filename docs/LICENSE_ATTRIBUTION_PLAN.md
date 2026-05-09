# License Attribution Plan

## Hermes Reference

BuildingAgent may reuse or adapt small, well-understood MIT-licensed portions of NousResearch Hermes Agent in later milestones. The local reference repository is:

`/mnt/d/Git_project/references/hermes-agent`

It must remain read-only.

## Policy

- Do not vendor the full Hermes repository.
- Do not blindly copy code.
- Prefer adapting architecture and reimplementing where practical.
- If code is copied, preserve original license notices.
- Track copied files and adaptation rationale under `third_party_licenses/`.

## Attribution Record

For each copied/adapted Hermes code fragment, record:

- Source repository and path
- Source commit or version if available
- License
- Copied/adapted file in BuildingAgent
- Changes made
- Rationale for copying instead of reimplementing
