# WhatsApp Gateway Specification

## Scope

M001 defines the secure gateway shape only. It does not implement WhatsApp Cloud API, Twilio, or other real provider integrations.

## Identity

A user must bind and verify a phone number through Web UI or CLI before WhatsApp interaction is allowed. Anonymous WhatsApp interaction is not allowed.

## Context Resolution

Every WhatsApp request must resolve:

- `user_id`
- `workspace_id`
- `project_id`
- role
- permission scopes

## Routing

Project routing may use default project settings, explicit project aliases, or signed selection flows. Ambiguous routing should fail closed.

## Security Constraints

- No anonymous execution.
- No tool execution without backend permission checks.
- Sensitive requests are audit logged.
- Media handling requires later threat modeling before implementation.
