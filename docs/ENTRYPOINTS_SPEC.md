# Entrypoints Specification

## Shared Rule

Every entry point must authenticate and resolve:

- `user_id`
- `workspace_id`
- `project_id`
- role
- permission scopes

No entry point may bypass backend runtime permissions.

## Web UI

The Web UI is the first product interface. It must require login before interaction. Required areas:

- Login/Register
- Project dashboard
- Project selector
- Chat workspace
- Skills manager
- Model/provider settings
- Tool settings
- Data source settings
- User and permission settings
- Memory/conversation history
- Audit log page

## CLI

The CLI must require authentication unless explicitly running in local developer mode. Required commands are specified in `CLI_SPEC.md`.

## Email Gateway

Email must require a verified bound email identity. Anonymous email interaction is not allowed. M001 defines adapter shape only.

## WhatsApp Gateway

WhatsApp must require a verified bound phone identity. Anonymous WhatsApp interaction is not allowed. M001 defines adapter shape only.
