import { exec } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { repoRootForProject } from "./agent/knowledgeBase.js";
import type { ProjectGroundingBindings } from "./projectGrounding.js";
import {
  extractQueryContext,
  normalizeProjectRuleInput,
  type FeedbackEpisode,
  type RuleErrorType,
  type SaveProjectRuleInput
} from "./projectRules.js";
import type { ChatMessage, SeedStore } from "./seed.js";
import { hasSiteRuleSaveConsent } from "./agent/siteRuleConsent.js";

export type FeedbackProposalStatus = "proposed" | "approved" | "implemented" | "committed" | "rejected";

export interface FeedbackProposal {
  id: string;
  projectId: string;
  conversationId: string;
  userCorrection: string;
  proposedFix: string;
  triggerTopics: string[];
  status: FeedbackProposalStatus;
  scriptRelativePath?: string;
  playbookId?: string;
  createdAt: string;
}

export interface ProjectPlaybook {
  id: string;
  projectId: string;
  title: string;
  triggerTopics: string[];
  scriptRelativePath: string;
  groundingSummary: string;
  sourceProposalId: string;
  active: boolean;
  createdAt: string;
}

const FEEDBACK_TOOLS_DIR = "feedback_tools";
const TERMINAL_TIMEOUT_MS = 30_000;
const TERMINAL_MAX_OUTPUT = 100_000;

export function ensureStoreProjectFeedback(store: SeedStore): void {
  if (!store.feedbackProposalsByProject) {
    store.feedbackProposalsByProject = {};
  }
  if (!store.projectPlaybooksByProject) {
    store.projectPlaybooksByProject = {};
  }
  if (!store.pendingFeedbackByConversation) {
    store.pendingFeedbackByConversation = {};
  }
}

const CORRECTION_HINTS =
  /wrong|incorrect|not right|不对|错了|应该用|instead|actually|correction|纠正|别用|不要只|不能只看|要看/i;

export function isLikelyCorrectionTurn(userMessage: string): boolean {
  const trimmed = userMessage.trim();
  if (!trimmed || hasSiteRuleSaveConsent(trimmed)) {
    return false;
  }
  if (/^correct[:\s]/i.test(trimmed)) {
    return true;
  }
  return CORRECTION_HINTS.test(trimmed);
}

export function captureFeedbackEpisode(
  store: SeedStore,
  input: {
    projectId: string;
    conversationId: string;
    messages: ChatMessage[];
    userCorrection: string;
    errorType?: RuleErrorType;
  },
  onChange?: () => void
): FeedbackEpisode | null {
  ensureStoreProjectFeedback(store);
  const userMessages = input.messages.filter((message) => message.role === "user");
  const assistantMessages = input.messages.filter((message) => message.role === "assistant");
  const priorUser = userMessages.at(-2)?.content ?? "";
  const priorAssistant = assistantMessages.at(-1)?.content ?? "";
  const context = extractQueryContext(`${priorUser} ${input.userCorrection}`);

  const episode: FeedbackEpisode = {
    conversationId: input.conversationId,
    projectId: input.projectId,
    userQuestion: priorUser,
    modelAnswer: priorAssistant,
    userCorrection: input.userCorrection.trim(),
    relatedEntities: context.entities,
    capturedAt: new Date().toISOString(),
    ...(input.errorType
      ? { errorType: input.errorType }
      : context.intent === "running_status"
        ? { errorType: "wrong_running_state" as const }
        : {}),
    ...(context.intent === "running_status" ? { relatedSystems: ["chiller plant", "HVAC"] } : {}),
    ...(context.intent === "running_status" ? { relatedBrickClasses: ["brick:Chiller", "brick:Sensor"] } : {})
  };
  store.pendingFeedbackByConversation![input.conversationId] = episode;
  onChange?.();
  return episode;
}

export function consumeFeedbackEpisode(store: SeedStore, conversationId: string): FeedbackEpisode | null {
  const episode = store.pendingFeedbackByConversation?.[conversationId] ?? null;
  if (episode && store.pendingFeedbackByConversation) {
    delete store.pendingFeedbackByConversation[conversationId];
  }
  return episode;
}

export function feedbackProposalGuidanceBlock(): string {
  return [
    "FEEDBACK PROPOSAL SHAPE (when user may want a project rule):",
    "- Generalize from the specific mistake to the underlying class of problem — not one exact user phrasing, point name, or single-query template.",
    "- Bad (too narrow): rule tied to one question wording, one data point, or one threshold with no stated principle or scope.",
    "- Good (broad): states the principle, which evidence or signals to use, how to handle ambiguity or conflicting readings, and the full family of related queries it applies to.",
    "- proposed_fix: principle + evidence/signals + ambiguity handling + scope (which situations and question types are covered).",
    "- trigger_topics: cover the topic family, synonyms, and paraphrases — not only the literal words from the last message; non-English phrases OK for matching only, not in the rule text.",
    "- Correction turn: tools → corrected answer → why prior answer failed → broad principle → ask to remember. Save turn only: after user consent, call feedback_save_site_rule with rule_key + structured fields per SITE RULE TEMPLATE KEYS — you author the field values from the principle, not a one-question rule."
  ].join("\n");
}

export function playbooksPromptBlock(playbooks: ProjectPlaybook[]): string {
  const active = playbooks.filter((playbook) => playbook.active);
  if (active.length === 0) {
    return "";
  }
  return [
    "Active playbooks (prefer feedback_run_playbook before ad-hoc analysis for matching topics):",
    ...active.map(
      (playbook) =>
        `- [${playbook.id}] ${playbook.title}: triggers=[${playbook.triggerTopics.join(", ")}]; script=repo:/${playbook.scriptRelativePath}; run via feedback_run_playbook`
    )
  ].join("\n");
}

function pythonExecutable(): string {
  const configured = process.env.PYTHON?.trim();
  if (configured) {
    return configured;
  }
  return process.platform === "win32" ? "python" : "python3";
}

function stringArrayArg(args: Record<string, unknown>, key: string): string[] {
  const value = args[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

export function sanitizeScriptFilename(filename: string): string | null {
  const base = path.basename(filename.replace(/\\/g, "/"));
  if (!base || base.includes("..") || !base.endsWith(".py")) {
    return null;
  }
  if (!/^[a-zA-Z0-9_.-]+\.py$/u.test(base)) {
    return null;
  }
  return base;
}

export function resolveFeedbackScriptPath(projectId: string, relativePath: string): string | null {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/u, "");
  if (!normalized.startsWith(`${FEEDBACK_TOOLS_DIR}/`)) {
    return null;
  }
  const repoRoot = repoRootForProject(projectId);
  const resolved = path.resolve(repoRoot, normalized);
  if (!resolved.startsWith(repoRoot + path.sep) && resolved !== repoRoot) {
    return null;
  }
  return resolved;
}

export async function runFeedbackScript(
  projectId: string,
  scriptRelativePath: string
): Promise<Record<string, unknown>> {
  const scriptPath = resolveFeedbackScriptPath(projectId, scriptRelativePath);
  if (!scriptPath) {
    return { error: "invalid_script_path", scriptRelativePath };
  }
  try {
    await access(scriptPath);
  } catch {
    return { error: "script_not_found", scriptRelativePath };
  }

  const repoRoot = repoRootForProject(projectId);
  const outputDir = path.join(repoRoot, "outputs");
  await mkdir(outputDir, { recursive: true });
  const command = `${pythonExecutable()} "${scriptPath}"`;

  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      exec(
        command,
        {
          cwd: repoRoot,
          timeout: TERMINAL_TIMEOUT_MS,
          maxBuffer: TERMINAL_MAX_OUTPUT,
          env: { ...process.env, PYTHONUNBUFFERED: "1", OUTPUT_DIR: outputDir, REPO_DIR: repoRoot }
        },
        (error, out, errOut) => {
          if (error) {
            reject(new Error(errOut || error.message));
          } else {
            resolve(out + (errOut ? `\n${errOut}` : ""));
          }
        }
      );
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout.trim());
    } catch {
      parsed = undefined;
    }

    return {
      ok: true,
      scriptRelativePath,
      stdout: stdout.slice(0, TERMINAL_MAX_OUTPUT),
      ...(parsed !== undefined ? { result: parsed } : {})
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "script_execution_failed",
      scriptRelativePath
    };
  }
}

function matchPlaybookByTopic(playbooks: ProjectPlaybook[], topic: string): ProjectPlaybook | null {
  const lowered = topic.toLowerCase();
  const active = playbooks.filter((playbook) => playbook.active);
  for (const playbook of active) {
    if (playbook.id.toLowerCase() === lowered) {
      return playbook;
    }
    for (const trigger of playbook.triggerTopics) {
      const triggerLower = trigger.toLowerCase();
      if (lowered.includes(triggerLower) || triggerLower.includes(lowered)) {
        return playbook;
      }
    }
  }
  return null;
}

export interface ProjectFeedbackBindings {
  propose(
    projectId: string,
    conversationId: string,
    input: { userCorrection: string; proposedFix: string; triggerTopics: string[] }
  ): FeedbackProposal;
  implement(
    projectId: string,
    proposalId: string,
    input: { scriptContent: string; scriptFilename: string }
  ): Promise<{ proposal: FeedbackProposal; execution: Record<string, unknown> }>;
  commit(
    projectId: string,
    proposalId: string,
    input: { title: string; groundingSummary: string; createdBy?: string }
  ): { proposal: FeedbackProposal; playbook: ProjectPlaybook; groundingRuleId: string };
  listPlaybooks(projectId: string): ProjectPlaybook[];
  listProposals(projectId: string): FeedbackProposal[];
  runPlaybook(projectId: string, input: { playbookId?: string; topic?: string }): Promise<Record<string, unknown>>;
  findLatestImplementedProposal(projectId: string, conversationId: string): FeedbackProposal | null;
  findLatestProposedProposal(projectId: string, conversationId: string): FeedbackProposal | null;
  saveSiteRule(
    projectId: string,
    conversationId: string,
    input: SaveProjectRuleInput
  ): { groundingRuleId: string; proposalId?: string };
}

let proposalSequence = 0;
let playbookSequence = 0;

export function restoreFeedbackSequence(store: SeedStore): void {
  let maxProposal = 0;
  let maxPlaybook = 0;
  for (const proposals of Object.values(store.feedbackProposalsByProject ?? {})) {
    for (const proposal of proposals) {
      const match = /^fb_prop_(\d+)$/u.exec(proposal.id);
      if (match) {
        maxProposal = Math.max(maxProposal, Number(match[1]!));
      }
    }
  }
  for (const playbooks of Object.values(store.projectPlaybooksByProject ?? {})) {
    for (const playbook of playbooks) {
      const match = /^pb_(\d+)$/u.exec(playbook.id);
      if (match) {
        maxPlaybook = Math.max(maxPlaybook, Number(match[1]!));
      }
    }
  }
  proposalSequence = maxProposal;
  playbookSequence = maxPlaybook;
}

export function createProjectFeedbackBindings(
  store: SeedStore,
  projectGrounding: ProjectGroundingBindings,
  onChange?: () => void
): ProjectFeedbackBindings {
  ensureStoreProjectFeedback(store);

  const getProposals = (projectId: string): FeedbackProposal[] => store.feedbackProposalsByProject?.[projectId] ?? [];

  const setProposals = (projectId: string, proposals: FeedbackProposal[]): void => {
    if (!store.feedbackProposalsByProject) {
      store.feedbackProposalsByProject = {};
    }
    store.feedbackProposalsByProject[projectId] = proposals;
  };

  const getPlaybooks = (projectId: string): ProjectPlaybook[] => store.projectPlaybooksByProject?.[projectId] ?? [];

  const setPlaybooks = (projectId: string, playbooks: ProjectPlaybook[]): void => {
    if (!store.projectPlaybooksByProject) {
      store.projectPlaybooksByProject = {};
    }
    store.projectPlaybooksByProject[projectId] = playbooks;
  };

  const findProposal = (projectId: string, proposalId: string): FeedbackProposal | null =>
    getProposals(projectId).find((proposal) => proposal.id === proposalId) ?? null;

  const updateProposal = (projectId: string, updated: FeedbackProposal): void => {
    setProposals(
      projectId,
      getProposals(projectId).map((proposal) => (proposal.id === updated.id ? updated : proposal))
    );
  };

  return {
    propose(projectId, conversationId, input) {
      proposalSequence += 1;
      const proposal: FeedbackProposal = {
        id: `fb_prop_${String(proposalSequence).padStart(6, "0")}`,
        projectId,
        conversationId,
        userCorrection: input.userCorrection.trim(),
        proposedFix: input.proposedFix.trim(),
        triggerTopics: input.triggerTopics.map((topic) => topic.trim()).filter(Boolean),
        status: "proposed",
        createdAt: new Date().toISOString()
      };
      setProposals(projectId, [...getProposals(projectId), proposal].slice(-50));
      onChange?.();
      return proposal;
    },

    async implement(projectId, proposalId, input) {
      const proposal = findProposal(projectId, proposalId);
      if (!proposal) {
        throw new Error("proposal_not_found");
      }
      if (proposal.status !== "proposed" && proposal.status !== "approved") {
        throw new Error("proposal_not_ready_for_implement");
      }

      const filename = sanitizeScriptFilename(input.scriptFilename);
      if (!filename) {
        throw new Error("invalid_script_filename");
      }

      const scriptRelativePath = `${FEEDBACK_TOOLS_DIR}/${filename}`;
      const scriptPath = resolveFeedbackScriptPath(projectId, scriptRelativePath);
      if (!scriptPath) {
        throw new Error("invalid_script_path");
      }

      await mkdir(path.dirname(scriptPath), { recursive: true });
      await writeFile(scriptPath, input.scriptContent, "utf8");

      const execution = await runFeedbackScript(projectId, scriptRelativePath);
      const updated: FeedbackProposal = {
        ...proposal,
        status: "implemented",
        scriptRelativePath
      };
      updateProposal(projectId, updated);
      onChange?.();
      return { proposal: updated, execution };
    },

    commit(projectId, proposalId, input) {
      const proposal = findProposal(projectId, proposalId);
      if (!proposal) {
        throw new Error("proposal_not_found");
      }
      if (proposal.status !== "implemented") {
        throw new Error("proposal_not_implemented");
      }
      if (!proposal.scriptRelativePath) {
        throw new Error("proposal_missing_script");
      }

      playbookSequence += 1;
      const playbook: ProjectPlaybook = {
        id: `pb_${String(playbookSequence).padStart(6, "0")}`,
        projectId,
        title: input.title.trim(),
        triggerTopics: proposal.triggerTopics,
        scriptRelativePath: proposal.scriptRelativePath,
        groundingSummary: input.groundingSummary.trim(),
        sourceProposalId: proposal.id,
        active: true,
        createdAt: new Date().toISOString()
      };

      const groundingContent = `[Playbook:${playbook.title}] ${playbook.groundingSummary} — run via feedback_run_playbook(${playbook.id})`;
      const rule = projectGrounding.add(projectId, groundingContent, {
        source: "playbook",
        ...(input.createdBy ? { createdBy: input.createdBy } : {})
      });

      const updatedProposal: FeedbackProposal = {
        ...proposal,
        status: "committed",
        playbookId: playbook.id
      };
      updateProposal(projectId, updatedProposal);
      setPlaybooks(projectId, [...getPlaybooks(projectId), playbook].slice(-30));
      onChange?.();
      return { proposal: updatedProposal, playbook, groundingRuleId: rule.id };
    },

    listPlaybooks(projectId) {
      return getPlaybooks(projectId).filter((playbook) => playbook.active);
    },

    listProposals(projectId) {
      return [...getProposals(projectId)];
    },

    async runPlaybook(projectId, input) {
      const playbooks = getPlaybooks(projectId).filter((playbook) => playbook.active);
      let playbook: ProjectPlaybook | null = null;
      if (input.playbookId) {
        playbook = playbooks.find((item) => item.id === input.playbookId) ?? null;
      } else if (input.topic) {
        playbook = matchPlaybookByTopic(playbooks, input.topic);
      }
      if (!playbook) {
        return { error: "playbook_not_found", playbookId: input.playbookId, topic: input.topic };
      }
      const execution = await runFeedbackScript(projectId, playbook.scriptRelativePath);
      return { playbook, ...execution };
    },

    findLatestImplementedProposal(projectId, conversationId) {
      const proposals = getProposals(projectId)
        .filter((proposal) => proposal.conversationId === conversationId && proposal.status === "implemented")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return proposals[0] ?? null;
    },

    findLatestProposedProposal(projectId, conversationId) {
      const proposals = getProposals(projectId)
        .filter((proposal) => proposal.conversationId === conversationId && proposal.status === "proposed")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return proposals[0] ?? null;
    },

    saveSiteRule(projectId, conversationId, input) {
      const episode = consumeFeedbackEpisode(store, conversationId);
      const fields = normalizeProjectRuleInput(input, episode);
      const rule = projectGrounding.addStructured(projectId, fields, {
        source: "user",
        ...(input.createdBy ? { createdBy: input.createdBy } : {})
      });

      let proposal: FeedbackProposal | null = null;
      if (input.proposalId) {
        proposal = findProposal(projectId, input.proposalId);
      }
      if (!proposal) {
        proposal = getProposals(projectId)
          .filter((item) => item.conversationId === conversationId && item.status === "proposed")
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
      }

      if (proposal) {
        const updated: FeedbackProposal = { ...proposal, status: "committed" };
        updateProposal(projectId, updated);
        onChange?.();
        return { groundingRuleId: rule.id, proposalId: proposal.id };
      }

      onChange?.();
      return { groundingRuleId: rule.id };
    }
  };
}

export { stringArrayArg };
