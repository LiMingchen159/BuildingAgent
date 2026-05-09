# Project Model Specification

## Model

A workspace contains projects. A project is the primary isolation boundary for BuildingAgent work.

Example workspace:

- Workspace A
  - HKUST Building Demo
  - MTRC ELEMENTS
  - UC Berkeley Demo

## Project Membership

Project membership binds users to projects with roles and permission scopes. Roles should not imply unrelated platform permissions.

## Project-Scoped Resources

Each project may have distinct:

- Users and roles
- Conversations
- Memory
- BIM files later
- Brick models later
- Time-series datasets later
- Tool permissions
- Enabled skills
- Model providers
- Data sources
- Audit requirements

## Isolation Requirement

Project A memory, data, and conversations must not be retrieved for Project B. This is a hard safety invariant.
