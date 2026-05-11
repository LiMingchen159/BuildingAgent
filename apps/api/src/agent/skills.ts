import type { AgentSkill } from "./types.js";

export class AgentSkillRegistry {
  private readonly skills = new Map<string, AgentSkill>();

  register(skill: AgentSkill): void {
    if (this.skills.has(skill.id)) {
      throw new Error(`Skill already registered: ${skill.id}`);
    }
    this.skills.set(skill.id, skill);
  }

  list(): AgentSkill[] {
    return [...this.skills.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  promptHints(): string {
    return this.list().map((skill) => `- ${skill.name}: ${skill.promptHint}`).join("\n");
  }
}

export function createGenericSkillRegistry(): AgentSkillRegistry {
  const registry = new AgentSkillRegistry();
  registry.register({
    id: "skill_building_triage",
    name: "Building Triage",
    domain: "building",
    description: "Ask concise follow-up questions and separate known building facts from assumptions.",
    promptHint: "When building data is missing, state assumptions and keep BIM/IFC/timeseries details as placeholders."
  });
  registry.register({
    id: "skill_project_readiness",
    name: "Project Readiness",
    domain: "project",
    description: "Organize answers around next actions, blockers, owners, and verification.",
    promptHint: "Prefer actionable project guidance over broad background explanation."
  });
  registry.register({
    id: "skill_runtime_health",
    name: "Runtime Health",
    domain: "runtime",
    description: "Explain provider, fallback, tool, and session state in redaction-safe terms.",
    promptHint: "Never expose secrets; mention only provider id, mode, model, request id, and fallback reason."
  });
  return registry;
}
