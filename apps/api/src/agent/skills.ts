import { boundsViolationResult } from "../platformBounds.js";
import { BUILTIN_SKILL_IDS, type ProjectSkillBindings } from "../projectSkills.js";
import { dataBridgeSkillHint, scientificChartSkillHint } from "./chartStyle.js";
import type { AgentSkill, AgentTool, AgentToolContext } from "./types.js";

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
    return this.promptHintsForProject(this.list().map((skill) => skill.id));
  }

  listForProject(skillIds: string[]): AgentSkill[] {
    const wanted = new Set(skillIds);
    return this.list().filter((skill) => wanted.has(skill.id));
  }

  promptHintsForProject(skillIds: string[]): string {
    return this.listForProject(skillIds)
      .map((skill) => `• ${skill.promptHint}`)
      .join("\n");
  }

  /** Build tool definitions for skill CRUD operations. */
  buildCrudToolDefs(bindings?: ProjectSkillBindings): AgentTool[] {
    const registry = this;
    return [
      {
        name: "skill_create",
        category: "utility",
        description: "Create a project-scoped agent skill and attach it to the current project.",
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
        run: async (args, context: AgentToolContext) => {
          if (!context.canConfigure) {
            return boundsViolationResult("skill_create requires project:configure.");
          }
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
          bindings?.addSkill(context.projectId, id);
          return {
            created: { id: skill.id, name: skill.name, domain: skill.domain, projectId: context.projectId }
          };
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
        run: async (args, context: AgentToolContext) => {
          if (!context.canConfigure) {
            return boundsViolationResult("skill_edit requires project:configure.");
          }
          const id = String(args.id ?? "");
          if (!id) return { error: "id is required" };
          if ((BUILTIN_SKILL_IDS as readonly string[]).includes(id)) {
            return boundsViolationResult(`Cannot edit built-in skill via chat: ${id}. Deploy a code change instead.`);
          }
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
        run: async (args, context: AgentToolContext) => {
          if (!context.canConfigure) {
            return boundsViolationResult("skill_delete requires project:configure.");
          }
          const id = String(args.id ?? "");
          if (!id) return { error: "id is required" };
          if ((BUILTIN_SKILL_IDS as readonly string[]).includes(id)) {
            return boundsViolationResult(`Cannot delete built-in skill: ${id}`);
          }
          bindings?.removeSkill(context.projectId, id);
          const deleted = registry.remove(id);
          return { deleted, id, projectId: context.projectId };
        }
      },
      {
        name: "skill_list",
        category: "utility",
        description: "List agent skills enabled for the current project.",
        schema: {
          name: "skill_list",
          description: "List skills for the current project.",
          parameters: {
            type: "object",
            properties: {},
            required: []
          }
        },
        run: async (_args, context: AgentToolContext) => {
          const skillIds = bindings?.getSkillIds(context.projectId) ?? [];
          const items = registry.listForProject(skillIds).map((s) => ({
            id: s.id,
            name: s.name,
            domain: s.domain,
            description: s.description
          }));
          return { skills: items, count: items.length, projectId: context.projectId };
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
    promptHint: "Missing building data: state assumptions; keep BIM/IFC/timeseries as placeholders."
  });
  registry.register({
    id: "skill_project_readiness",
    name: "Project Readiness",
    domain: "project",
    description: "Organize answers around next actions, blockers, owners, and verification.",
    promptHint: "Prefer next actions, blockers, owners—not long background."
  });
  registry.register({
    id: "skill_runtime_health",
    name: "Runtime Health",
    domain: "runtime",
    description: "Explain provider, fallback, tool, and session state in redaction-safe terms.",
    promptHint: "No secrets; only provider id, mode, model, requestId, fallback reason."
  });
  registry.register({
    id: "environment-setup",
    name: "Environment setup",
    domain: "runtime",
    description: "Install missing runtimes and packages before analysis.",
    promptHint: "Missing pip/npm/CLI: terminal install+verify, retry—no workaround math or fake charts."
  });
  registry.register({
    id: "skill_tool_data_bridge",
    name: "Tool Data Bridge",
    domain: "runtime",
    description: "Wire tool results into execute_code via manifest helpers and pandas-safe transforms.",
    promptHint: dataBridgeSkillHint()
  });
  registry.register({
    id: "skill_chart_quality",
    name: "Chart Quality",
    domain: "runtime",
    description: "Produce unified scientific-style charts via injected matplotlib/seaborn helpers.",
    promptHint: scientificChartSkillHint()
  });
  registry.register({
    id: "skill_feedback_workflow",
    name: "Feedback workflow",
    domain: "runtime",
    description: "User correction → propose → approve → implement script → commit playbook lifecycle.",
    promptHint:
      "CORRECTION WORKFLOW: Platform bounds — do not edit kernel/skills via chat. MEMORY ROUTING: user preferences→memory(target=user) or memory_propose; declarative site facts→memory(target=project, configure) or memory_propose; user-approved judgment rules→feedback_save_site_rule after consent (requires project:configure); script playbooks→feedback_implement→feedback_commit_playbook (operator-only). memory_propose requires save memory: yes. (1) Do not auto-seed rules without user approval. (2) On user correction — same turn, in order: (a) re-fetch/recompute with tools (do not only acknowledge); (b) give the corrected answer with evidence; (c) explain why the prior answer was wrong (root cause); (d) state a broad generalized checking principle — not a rule tied to one question wording; (e) ask plainly whether to remember for similar questions. Do NOT call feedback_save_site_rule or feedback_propose on that turn. (3) Only after explicit save consent on a later message (e.g. yes, yes remember, 是的保存)→feedback_save_site_rule with rule_key from SITE RULE TEMPLATE KEYS plus LLM-authored name, scope, trigger, action, wrong_pattern, trigger_topics (≥4 paraphrases EN/ZH), systems/equipment when relevant — not a single paragraph rule_summary. (4) Never claim saved until the tool succeeds. (5) Prefer feedback_run_playbook only when script playbooks exist. (6) When applicable project rules are already in the prompt (retrieved site rules), follow them directly — do NOT read feedback_tools/*.py scripts unless the user explicitly asks to run a playbook. Past threads→session_search, not memory banks."
  });
  registry.register({
    id: "skill_element_bms_data",
    name: "Element BMS Data",
    domain: "building",
    description:
      "Element BMS local DB: bms_points_query / bms_timeseries_query for catalog, last_value, history; bms_live_read for ≤3 live points.",
    promptHint:
      "BMS DATA ROUTING (always on): NAMES → KB_CATALOG_SUMMARY.md §1.1–§2 only (COP §2.3.1, Plant `WCC-L1-0n_COP` not `WCC_n_COP`); never bms_points_query×8 to build inventories. POINT PICK: match the question — running → Run_Status+TLKW; leaving CHW temp → Chilled_Water_Temp or SUWT; COP → Plant layer (e.g. WCC-L1-04_COP), not HL `WCC_n_COP`. TOOLS: history/trend/batch/>3 points or last_value → bms_timeseries_query / bms_points_query; ≤3 live/alarm → bms_live_read; unknown name → bms_points_query(q=, limit=20). Relative time → copy from/to from CURRENT TIME CALENDAR RANGES; re-fetch every turn. Local DB = one readings timeline (backfill + 15-min poll, no source param); last_value ~15 min lag unless live read. Parallel tool calls. Do not read_file API docs unless tools fail."
  });
  registry.register({
    id: "skill_derived_metrics",
    name: "Derived metrics registry",
    domain: "building",
    description: "Reuse persisted calculated metrics such as System COP, Delta T, FD scores, and KPIs.",
    promptHint:
      "DERIVED METRICS: For calculated/reusable values (System COP, Delta T, kW/RT, FD score, KPI), call derived_metric_lookup first using project/entity/metricKey. If found, use derived_metric_read and do NOT recalculate/register a duplicate. If missing and the user asks for a one-off calculation, calculate from source BMS points and ask whether to persist. Only after explicit persistence intent/approval and project:configure, use derived_metric_calculate for safe ratio/difference metrics such as System COP (ratio) and Delta T (difference); it looks up existing metrics, computes aligned samples, persists latest/history, writes the project-memory pointer, and returns dashboardBinding. Use derived_metric_register + derived_metric_record_sample only for non-standard calculations that derived_metric_calculate cannot express. Curated memory stores only the metric pointer; timeseries values live in derived metrics storage."
  });
  registry.register({
    id: "skill_dashboard_generation",
    name: "Dashboard generation",
    domain: "building",
    description: "Turn monitoring requests into validated dashboard_create specs with per-equipment widgets.",
    promptHint:
      "DASHBOARD GENERATION (mandatory rule): If the user asks to monitor/watch/track/show real-time equipment data or says 创建 dashboard / dashboard, do not stop at a text/table answer. First identify exact BMS point names with bms_points_query or catalog grounding, verify history with bms_timeseries_query only when needed, then call dashboard_create in the same turn. Never output raw HTML/JS. Default structure when the user does not specify otherwise: create at least Overview and Trends sections. Overview contains current/live values, status, or key KPIs; Trends contains 24h history. Supported widgets: live_value_grid, stat_value, timeseries_chart, bar_comparison, note. For multi-equipment monitoring, create separate live/stat widgets per equipment and separate trend widgets per equipment; never put all equipment into one live card or one trend chart unless the user explicitly asks for a single overview. Use bar_comparison only when the user asks to compare equipment/loads/COP/temperatures. Use note only conditionally: add it for assumptions, missing point coverage, data-delay caveats, operator reminders, or explicit user note requests; do not add a generic note to every dashboard. You may omit layout and sections because dashboard_create normalizes them. Set includeTrends=false only when the user explicitly asks for no trends/overview only; set includeOverview=false only when the user explicitly asks for trends only. Default visibility is project-visible unless the user asks for private. Chart times must be Hong Kong time (HKT / Asia_Hong_Kong). When the user asks for a persisted derived value such as System COP or delta-T, first use derived_metric_lookup/read; if available, bind it in dashboard_create as {source:\"derived_metric\",metricInstanceId,label,unit} or {source:\"derived_metric\",metricKey,entityId,label,unit}. Only bind underlying source points when no persisted derived metric exists or the user asks to inspect raw inputs. Final answer: say the dashboard was created and where it appears; do not expose tokens, API keys, or raw config."
  });
  return registry;
}
