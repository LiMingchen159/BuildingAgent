import type { AgentSkill, AgentTool } from "./types.js";

export class AgentSkillRegistry {
  private readonly skills = new Map<string, AgentSkill>();

  register(skill: AgentSkill): void {
    if (this.skills.has(skill.id)) {
      throw new Error(`Skill already registered: ${skill.id}`);
    }
    this.skills.set(skill.id, skill);
  }

  get(id: string): AgentSkill | undefined {
    return this.skills.get(id);
  }

  update(id: string, patch: Partial<Omit<AgentSkill, "id">>): AgentSkill {
    const existing = this.skills.get(id);
    if (!existing) {
      throw new Error(`Skill not found: ${id}`);
    }
    const updated: AgentSkill = { ...existing, ...patch, id };
    this.skills.set(id, updated);
    return updated;
  }

  remove(id: string): boolean {
    return this.skills.delete(id);
  }

  list(): AgentSkill[] {
    return [...this.skills.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  promptHints(): string {
    return this.list().map((skill) => `- ${skill.name}: ${skill.promptHint}`).join("\n");
  }

  /** Build tool definitions for skill CRUD operations. */
  buildCrudToolDefs(): AgentTool[] {
    const registry = this;
    return [
      {
        name: "skill_create",
        category: "utility",
        description: "Create a new agent skill at runtime. Skills shape how the agent approaches problem domains.",
        schema: {
          name: "skill_create",
          description: "Create a new agent skill.",
          parameters: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique skill id, e.g. skill_my_feature" },
              name: { type: "string", description: "Display name, e.g. My Feature" },
              domain: { type: "string", enum: ["building", "project", "runtime"], description: "Skill domain" },
              description: { type: "string", description: "What this skill enables" },
              promptHint: { type: "string", description: "Guidance injected into the system prompt when skill is active" }
            },
            required: ["id", "name", "domain", "description", "promptHint"]
          }
        },
        run: async (args) => {
          const id = String(args.id ?? "");
          if (!id) return { error: "id is required" };
          if (registry.get(id)) return { error: `Skill already exists: ${id}` };
          const domain = args.domain as AgentSkill["domain"];
          if (!["building", "project", "runtime"].includes(domain)) {
            return { error: `Invalid domain: ${domain}. Must be building, project, or runtime.` };
          }
          const skill: AgentSkill = {
            id,
            name: String(args.name ?? id),
            domain,
            description: String(args.description ?? ""),
            promptHint: String(args.promptHint ?? "")
          };
          registry.register(skill);
          return { created: { id: skill.id, name: skill.name, domain: skill.domain } };
        }
      },
      {
        name: "skill_edit",
        category: "utility",
        description: "Edit an existing agent skill by id. Omitted fields are left unchanged.",
        schema: {
          name: "skill_edit",
          description: "Edit an existing agent skill.",
          parameters: {
            type: "object",
            properties: {
              id: { type: "string", description: "Skill id to update" },
              name: { type: "string", description: "New display name" },
              domain: { type: "string", enum: ["building", "project", "runtime"], description: "New domain" },
              description: { type: "string", description: "New description" },
              promptHint: { type: "string", description: "New prompt hint" }
            },
            required: ["id"]
          }
        },
        run: async (args) => {
          const id = String(args.id ?? "");
          if (!id) return { error: "id is required" };
          if (!registry.get(id)) return { error: `Skill not found: ${id}` };
          const patch: Partial<Omit<AgentSkill, "id">> = {};
          if (typeof args.name === "string") patch.name = args.name;
          if (typeof args.domain === "string") {
            const domain = args.domain as AgentSkill["domain"];
            if (!["building", "project", "runtime"].includes(domain)) {
              return { error: `Invalid domain: ${domain}` };
            }
            patch.domain = domain;
          }
          if (typeof args.description === "string") patch.description = args.description;
          if (typeof args.promptHint === "string") patch.promptHint = args.promptHint;
          const updated = registry.update(id, patch);
          return { updated: { id: updated.id, name: updated.name, domain: updated.domain } };
        }
      },
      {
        name: "skill_delete",
        category: "utility",
        description: "Delete an agent skill by id. Cannot delete built-in skills (skill_building_triage, skill_project_readiness, skill_runtime_health).",
        schema: {
          name: "skill_delete",
          description: "Delete an agent skill.",
          parameters: {
            type: "object",
            properties: {
              id: { type: "string", description: "Skill id to delete" }
            },
            required: ["id"]
          }
        },
        run: async (args) => {
          const id = String(args.id ?? "");
          if (!id) return { error: "id is required" };
          if (["skill_building_triage", "skill_project_readiness", "skill_runtime_health"].includes(id)) {
            return { error: `Cannot delete built-in skill: ${id}` };
          }
          const deleted = registry.remove(id);
          return { deleted, id };
        }
      },
      {
        name: "skill_list",
        category: "utility",
        description: "List all registered agent skills with their domains and descriptions.",
        schema: {
          name: "skill_list",
          description: "List all registered skills.",
          parameters: {
            type: "object",
            properties: {},
            required: []
          }
        },
        run: async () => {
          const items = registry.list().map((s) => ({
            id: s.id,
            name: s.name,
            domain: s.domain,
            description: s.description
          }));
          return { skills: items, count: items.length };
        }
      }
    ];
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
