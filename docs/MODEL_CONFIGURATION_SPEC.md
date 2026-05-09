# Model Configuration Specification

## Provider Configuration

BuildingAgent should support configurable model providers with:

- provider name
- base URL
- model name
- project default model
- connectivity test status
- user/project access controls
- secure secret reference

## Web UI

The Web UI should eventually allow adding providers, setting base URL/model name, selecting project defaults, testing connectivity, and controlling access.

## CLI

The CLI should eventually support:

- `buildingagent model list`
- `buildingagent model set`
- `buildingagent provider add`
- `buildingagent provider test`

## Secrets

API keys and provider secrets must not be stored in Git. They should be stored through a secure secret mechanism chosen in an implementation milestone.
