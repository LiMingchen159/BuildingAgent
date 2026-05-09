# Authentication and Access Control Specification

## Entities

- User
- Workspace
- Project
- Project membership
- Role
- Permission
- Model provider permission
- Tool permission
- Data source permission
- Skill permission
- Audit log

## RBAC MVP

MVP access control should start with RBAC. Suggested project roles:

- Owner
- Admin
- Engineer
- Operator
- Viewer
- External Reviewer
- Developer

## Future ABAC

The model should allow later ABAC conditions such as data sensitivity, project phase, tool risk level, time window, approval state, and organization policy.

## Code Permissions vs Data Permissions

Code/platform permissions and project/data permissions are separate. A platform developer does not automatically get customer data access. A project engineer does not automatically get deployment or tool-development permissions.

## Enforcement

- Frontend hiding is not security.
- Runtime and tool dispatcher enforce permissions.
- Data-source and memory retrieval enforce project scope.
- Sensitive actions emit audit records.

## Audit Logging

Audit logs should record actor, workspace, project, entry point, action, target resource, permission decision, risk level, timestamp, and non-secret metadata.
