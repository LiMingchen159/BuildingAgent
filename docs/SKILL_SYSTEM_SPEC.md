# Skill System Specification

## Skill Format

Skills may be markdown or YAML. They should be loadable by a skill loader and injectable into prompts when enabled.

## Components

- Skill loader
- Skill registry
- Skill search
- User/project enablement
- Prompt injection
- Skill usage logging
- Future skill improvement mechanism

## Configuration

- Web UI supports viewing skills and enabling/disabling where appropriate.
- CLI supports listing/enabling/disabling skills.
- Skill usage should be recorded for audit/debugging.

## Building Skill Placeholders

M001 reserves placeholder skill files for:

- BIM object exploration
- Brick SPARQL query
- Time-series trend analysis
- Cross-source equipment analysis
- HHW reset analysis

These files contain no detailed prompt logic and make no implementation claims.
