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
      "Project-scoped BMS local DB: bms_points_query / bms_timeseries_query for catalog, last_value, history; bms_live_read for ≤3 live points when configured.",
    promptHint:
      "BMS DATA ROUTING (project-scoped): NAMES → read KB_CATALOG_SUMMARY.md §1.1–§2 for the current project's entity inventory, aliases, naming layers, and easy-to-miss points; never brute-force every entity to build inventories. POINT PICK: match the question and formula semantics. For running status, follow retrieved project grounding and cross-check with the project's instantaneous motor/electric power evidence when such a rule exists; do not rely on a status code alone. For COP or other calculated points, use the naming layer documented by the KB rather than assuming controller-layer names. When validating or reconstructing a BMS KPI, keep dependencies on the same naming/equipment layer as the KPI and prefer companion raw components from that layer over similarly named points from another layer; call out any intentional cross-layer mix. TOOLS: only when the current project has a configured BMS source, history/trend/batch/>3 points or last_value → bms_timeseries_query / bms_points_query; ≤3 live/alarm → bms_live_read; unknown name → bms_points_query(q=, limit=20). If the tool returns bms_source_not_configured, say this project has no BMS source configured and use only that project's KB, Repository, and derived metrics. Relative time → copy from/to from CURRENT TIME CALENDAR RANGES; re-fetch every turn. Local DB = one readings timeline (backfill + 15-min poll, no source param); last_value ~15 min lag unless live read. Parallel tool calls. Do not read_file API docs unless tools fail."
  });
  registry.register({
    id: "skill_derived_metrics",
    name: "Derived metrics registry",
    domain: "building",
    description: "Reuse persisted calculated metrics such as System COP, Delta T, FD scores, and KPIs.",
    promptHint:
      "DERIVED METRICS: For calculated/reusable values (System COP, Delta T, kW/RT, FD score, KPI), call derived_metric_lookup first using project/entity/metricKey. Prefer semantic metric keys (system_cop, delta_t), not generic derived_*. Choose metricType by semantics: kpi for performance/efficiency, fdd/fd_score for detection, derived for neutral intermediate values. If found, use derived_metric_read for latest/small single-series reads and do NOT recalculate/register a duplicate. For multi-series history analysis or charts, use exactly one lookup, then one derived_metric_history_prepare containing every selected instanceId and the requested fixed from/to range, then one execute_code; after prepare returns a local data_file/cache_manifest, never call derived_metric_read or prepare again for the same histories in that turn. If missing and the user asks for a one-off calculation or has not clearly approved persistence, use derived_metric_preview for safe ratio/difference metrics; show the preview and ask whether to save it. Only after explicit persistence intent/approval and project:configure, call derived_metric_calculate with the preview persistCandidate args; it looks up existing metrics, computes aligned samples, persists latest/history, writes the project-memory pointer, returns dashboardBinding, and registers supported metrics for background materialization shown in KPI/FDD assets. Persisted derived metrics should have enough history for trends: use at least a 30-day source window, or omit from and let derived_metric_calculate apply its 30-day default/minimum. Pick alignmentPolicy by source cadence: exact for synchronized samples; nearest with a small tolerance for different-frequency analog KPI/FDD inputs. For KPI cross-checks, select dependencies that represent the same semantic boundary as the KPI being checked; do not mix plant-level numerator points with equipment/controller-level denominator points unless the user asks for that alternate KPI and the dashboard labels it clearly. For fleet/equipment-set requests, preserve coverage: enumerate the requested entity set and create/reuse one metric per entity; do not silently omit offline, faulty, missing, or non-calculable entities. If a value cannot be meaningfully calculated, choose derived_metric_calculate.invalidValuePolicy from the metric semantics: use null for unknown/not-applicable/ambiguous values and for status/control signals where 0 has operational meaning; use zero only when numeric zero is a truthful value for that metric or explicitly requested. Derived UI: live uses dashboardBinding+inputDashboardBindings; trends show outputs first, inputs defaultVisible:false. Always explain invalid/degraded quality/status in a dashboard note or final answer. Use derived_metric_register + derived_metric_record_sample only for non-standard calculations that derived_metric_calculate cannot express. Curated memory stores only the metric pointer; timeseries values live in derived metrics storage."
  });
  registry.register({
    id: "skill_fdd_fault_attribution",
    name: "FDD Fault Attribution",
    domain: "building",
    description: "Analyze FDD fault outputs against their input histories to identify likely sensor, data, or equipment causes.",
    promptHint:
      "FDD FAULT ATTRIBUTION: When the user asks for FDD attribution / fault cause / why a chiller faulted, do the analysis yourself from data before writing the answer, dashboard note, or fdd_attribution_analysis.content. Use derived_metric_lookup/read for persisted FDD outputs and their inputDashboardBindings; read the FDD metric metadata/metadata.fddParameters and treat algorithm hyperparameters as inputs to the reasoning (for example window_minutes, cop_threshold, min_load, min_flow, delta_t_min, tolerance_percent, freeze_window, epsilon_temp, epsilon_flow). Do not assume the window is 30 minutes unless window_minutes is actually missing; if a fallback is used, say so. Use bms_timeseries_query for raw inputs only when the current project has live BMS access; otherwise stay within that project's derived metrics, Knowledge Base, and Repository. Work in the requested window, default last 7 days, and use HKT only for display. Method: (1) find output samples where the FDD/fault value is active (>=0.5) and record fault timestamps per equipment; (2) for each bound input on the same equipment/layer, align values inside the configured FDD persistence window from the FDD parameters around fault timestamps and compare against normal output timestamps from the same window; (3) score concrete evidence: missing/grey input values during faults, flatlined analog values, stuck-zero analog values such as CHW flow/power/load when operation context says they should vary, large fault-vs-normal shifts, impossible units/ranges, and status/command states that are consistently on/off during faults; (4) choose one likely cause only when evidence is stronger than alternatives, otherwise say inconclusive and list what data is missing; (5) report concise English text with **Likely cause**, **Equipment**, **Problem input**, **FDD parameters used**, **Evidence**, and **Data-based next check**. Evidence must include exact point names and numbers (fault samples/valid samples, missing %, zero/flatline counts, min/max, or fault-vs-normal averages), include point-name expansions when known (for example TLKW = Motor Kilowatts, CHWST = Chilled Water Supply Temperature), and state the actual FDD window when discussing missing fault-aligned samples. Write the next check for a facility engineer with basic engineering experience: use plain field language such as 'check the BMS trend', 'confirm the point is being recorded', 'confirm it belongs to this chiller', or 'check whether the value is forced to zero'. Avoid internal software wording such as telemetry/mapping gap, state semantics, or restore the path. The next check must name the exact point(s) to inspect, e.g. check WCC-L1-04_CHWFWR (Chilled Water Flow Rate) if it is stuck at 0; never give generic advice such as 'check sensors and telemetry paths'. Do not present a ranking table or generic comparison. Do not infer causality from the FDD output alone; always tie the conclusion to actual input samples or state that the inputs do not support attribution."
  });
  registry.register({
    id: "skill_dashboard_generation",
    name: "Dashboard generation",
    domain: "building",
    description: "Turn monitoring requests into validated dashboard_create specs with per-equipment widgets.",
    promptHint:
      "DASHBOARD GENERATION (mandatory rule): If the user asks to monitor/watch/track/show real-time equipment data or says 创建 dashboard / dashboard, do not stop at a text/table answer. For projects with live BMS access, first identify exact BMS point names with bms_points_query or catalog grounding, verify history with bms_timeseries_query only when needed, then call dashboard_create in the same turn; for other projects, use only that project's Knowledge Base, Repository, and derived metrics. Never output raw HTML/JS. Default structure when the user does not specify otherwise: create at least Overview and Trends sections. Overview contains current/live values, status, or key KPIs; Trends contains 24h history. Supported widgets: live_value_grid, stat_value, status_grid, fdd_attribution_analysis, timeseries_chart, bar_comparison, note. FDD dashboards should use one 1x1 status_grid per entity for current fault overview and one fdd_attribution_analysis titled Fault Cause Analysis with defaultTimeRange:\"7d\" and content containing the FDD FAULT ATTRIBUTION result in concise Markdown; before explaining the dashboard, follow FDD FAULT ATTRIBUTION, read actual FDD hyperparameters from metric metadata, and analyze fault output timestamps against actual bound input histories. Put chiller trend widgets in a Chiller Trends section and leave that section collapsed by default. For multi-equipment monitoring, create separate live/stat widgets per equipment and separate trend widgets per equipment; never put all equipment into one live card or one trend chart unless the user explicitly asks for a single overview. Use bar_comparison only when the user asks to compare equipment/loads/COP/temperatures. Derived analytics UI: live groups input+output by entity; trends show outputs first and inputs as defaultVisible:false audit series; FDD/BuildingGPT one-click analytics should produce fault-cause analysis text with exact point names, point expansions, FDD parameters used, and evidence numbers, not ranking/comparison blocks or generic recommendations. Use note only conditionally: add it for assumptions, missing point coverage, data-delay caveats, operator reminders, or explicit user note requests; do not add a generic note to every dashboard. You may omit layout and sections because dashboard_create normalizes them. Set includeTrends=false only when the user explicitly asks for no trends/overview only; set includeOverview=false only when the user explicitly asks for trends only. Default visibility is project-visible unless the user asks for private. Chart times must be Hong Kong time (HKT / Asia_Hong_Kong). For derived dashboards, use returned dashboardBinding + inputDashboardBindings; use raw-only bindings only when no persisted metric exists. Final answer: say the dashboard was created and include the returned dashboard path/link plus a brief data-backed attribution summary; do not expose tokens, API keys, or raw config."
  });
  registry.register({
    id: "skill_fdd_deployability_check",
    name: "FDD Deployability Check",
    domain: "building",
    description: "Check whether FDD algorithm specs can be deployed to the current project's BMS data.",
    promptHint:
      "FDD DEPLOYABILITY CHECK: Treat FDD Library/Test with data/deployability as BuildingGPT using this skill, not a separate agent. First read the project KB catalog context (`KB_CATALOG_SUMMARY.md`) for entity inventory, aliases, naming layers, and grounding-sensitive point families, then query the BMS catalog/history tools. Build an entity alias map from the KB before selecting points, including all documented aliases/prefixes for the same physical equipment and pump/chiller entities. Algorithm cards are class-level; do not duplicate or mark uncertain just because multiple same-class entities can deploy. For project check, choose one complete example entity only. `uncertain` means one required input within that same example entity has multiple plausible candidates; it does not mean choosing between two entities of the same class. Judge every input from the formula's physical quantity and unit dimension: instantaneous power (kW/W) is not accumulated energy (kWh/Wh), load is not electric power, flow is not load unless the formula explicitly derives load from flow and delta-T. First-pass library checks should use the deterministic validator and return structured `can_deploy | uncertain | cannot_deploy`; reserve LLM/time-series deep inference for uncertain deployment."
  });
  return registry;
}
