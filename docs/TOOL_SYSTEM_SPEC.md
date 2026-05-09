# Tool System Specification

## General Tool Contract

Every tool should eventually define:

- name
- description
- input schema
- output schema
- risk level
- permission requirement
- audit logging behavior
- project scope behavior

## Risk Levels

- Level 0: read-only query
- Level 1: analysis/plotting
- Level 2: export/report
- Level 3: external messaging
- Level 4: data modification
- Level 5: shell/code execution/deployment

## Dispatcher Rule

All tool calls go through the tool dispatcher. The dispatcher checks permissions before execution and emits audit logs for sensitive calls.

## General Tool Families

Future general tools may include file tools, shell tools, web search tools, Python execution tools, browser placeholder, MCP placeholder, and messaging tools.

## Building Tool Placeholders

M001 reserves placeholder files for:

- BIM/IFC tools
- Brick/RDF/SPARQL tools
- Time-series tools
- Cross-source linking tools
- Visualization tools

These placeholders do not implement real tools.
