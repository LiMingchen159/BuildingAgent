# Email Gateway Specification

## Scope

M001 defines the secure gateway shape only. It does not implement Gmail, IMAP, SMTP, or other real provider integrations.

## Identity

A user must bind and verify an email address through Web UI or CLI before email interaction is allowed. Anonymous email interaction is not allowed.

## Context Resolution

Every email request must resolve:

- `user_id`
- `workspace_id`
- `project_id`
- role
- permission scopes

## Routing

Project routing may use explicit project aliases, verified sender mappings, or signed commands. Ambiguous routing should fail closed and ask for clarification through an authenticated channel.

## Security Constraints

- No anonymous execution.
- No tool execution without backend permission checks.
- Sensitive requests are audit logged.
- Attachments and external links require later threat modeling before implementation.
