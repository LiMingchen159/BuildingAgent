# CLI Specification

## Authentication

The CLI requires authentication unless explicitly running in local developer mode. Tokens or sessions must be stored securely and never committed to Git.

## Required Commands

- `buildingagent login`
- `buildingagent logout`
- `buildingagent project list`
- `buildingagent project use <project_id>`
- `buildingagent chat`
- `buildingagent model list`
- `buildingagent model set`
- `buildingagent provider add`
- `buildingagent provider test`
- `buildingagent skills list`
- `buildingagent skills enable`
- `buildingagent skills disable`
- `buildingagent tools list`
- `buildingagent tools enable`
- `buildingagent tools disable`
- `buildingagent admin/debug ...`

## Runtime Context

Every CLI command that touches runtime, memory, tools, skills, data sources, or provider settings must resolve authenticated user, workspace, project, role, and permission scopes.
