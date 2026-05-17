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
          if (
            [
              "skill_building_triage",
              "skill_project_readiness",
              "skill_runtime_health",
              "skill_element_bms_data"
            ].includes(id)
          ) {
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
  registry.register({
    id: "environment-setup",
    name: "Environment setup",
    domain: "runtime",
    description: "Install missing runtimes and packages before analysis.",
    promptHint: "When pip, npm, or a CLI is missing, use terminal to install and verify first. Never substitute workarounds for missing Python/Node/system tooling."
  });
  registry.register({
    id: "skill_chart_quality",
    name: "Chart Quality",
    domain: "runtime",
    description: "Produce clear English-labeled charts with matplotlib/seaborn and non-overlapping layout.",
    promptHint:
      "For charts: matplotlib + seaborn, English-only on-figure text, legend outside plot, tight_layout/bbox_inches=tight, no crowded data labels; save to OUTPUT_DIR as outputs/*.png."
  });
  registry.register({
    id: "skill_element_bms_data",
    name: "Element BMS Data Access",
    domain: "building",
    description:
      "Fetch Element chiller BMS data: live via enteliWEB :20800; local history via BMS-database GET /api/v1/timeseries (poll+history merged, no source param).",
    promptHint: [
      "Element project (project_element) BMS data routing — follow strictly:",
      "1) DECIDE: 'current/live/now/alarm' → enteliWEB :20800 (tool bms_live_read or api_path XML). 'yesterday/trend/report/history' → BMS REST timeseries ONLY — NOT live BACnet.",
      "2) CATALOG: GET {BMS_DATABASE_API_URL}/api/v1/points?q=<keyword>&limit=50 — name, point_id, object_ref, api_path, last_value (~5min lag).",
      "3) LIVE: tool bms_live_read(point_name|object_ref|api_path); demo enteliWEB auth pre-configured.",
      "4) HISTORICAL (canonical): GET /api/v1/timeseries?name=<name>&from=<UTC ISO>&to=&limit=5000&order=asc — NO source=poll/history/merged. Response items: ts, value, value_num (no source field). Aliases: /api/v1/readings, /api/v1/points/{id}/timeseries. Public collector example: http://117.72.185.234:8765; server local: http://127.0.0.1:8765.",
      "5) GRANULARITY: API returns server-merged series (device trend ~6d @15min + 5min poll after collector start); do not assume uniform 5min for all past days. Display ts in Asia/Shanghai for users; stored as UTC.",
      "6) TOOLS: bms_live_read, terminal curl timeseries, run_python requests, read_file data/project_element/kb/bms_data_access.md. SQLite direct only if API down.",
      "7) REPORT: live vs timeseries path, time range, staleness."
    ].join(" ")
  });
  return registry;
}
