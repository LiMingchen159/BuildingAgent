import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRootForProject } from "./agent/knowledgeBase.js";
import { createProjectGroundingBindings } from "./projectGrounding.js";
import {
  captureFeedbackEpisode,
  createProjectFeedbackBindings,
  feedbackProposalGuidanceBlock,
  isLikelyCorrectionTurn,
  playbooksPromptBlock,
  resolveFeedbackScriptPath,
  runFeedbackScript,
  sanitizeScriptFilename
} from "./projectFeedback.js";
import { createSeedStore } from "./seed.js";

describe("projectFeedback", () => {
  it("injects broad feedback proposal guidance in English", () => {
    const block = feedbackProposalGuidanceBlock();
    expect(block).toContain("Generalize from the specific mistake");
    expect(block).toContain("Bad (too narrow)");
    expect(block).toContain("Good (broad)");
    expect(block).toContain("feedback_save_site_rule");
    expect(block).not.toMatch(/[\u4e00-\u9fff]/);
    expect(block).not.toMatch(/chiller|TLKW|Run_Status/i);
  });

  it("detects correction turns and captures feedback episodes", () => {
    expect(isLikelyCorrectionTurn("不对，应该用 TLKW 判断")).toBe(true);
    expect(isLikelyCorrectionTurn("yes")).toBe(false);

    const store = createSeedStore();
    const episode = captureFeedbackEpisode(store, {
      projectId: "project_element",
      conversationId: "conv_capture",
      messages: [
        {
          id: "msg_u1",
          projectId: "project_element",
          userId: "user_test",
          role: "user",
          content: "How many chillers are running?"
        },
        {
          id: "msg_a1",
          projectId: "project_element",
          userId: "user_test",
          role: "assistant",
          content: "Four chillers based on Run_Status."
        },
        {
          id: "msg_u2",
          projectId: "project_element",
          userId: "user_test",
          role: "user",
          content: "不对，要看 TLKW"
        }
      ],
      userCorrection: "不对，要看 TLKW"
    });
    expect(episode?.userQuestion).toContain("How many chillers");
    expect(store.pendingFeedbackByConversation?.conv_capture?.userCorrection).toContain("TLKW");
  });

  it("saves a site rule to grounding without a playbook", () => {
    const store = createSeedStore();
    const grounding = createProjectGroundingBindings(store);
    const feedback = createProjectFeedbackBindings(store, grounding);
    const projectId = "project_element";
    const conversationId = "conv_site_rule_001";

    const proposal = feedback.propose(projectId, conversationId, {
      userCorrection: "Status code alone was wrong",
      proposedFix: "Cross-check status codes with load evidence for all running-state questions.",
      triggerTopics: ["running status", "loaded"]
    });

    const result = feedback.saveSiteRule(projectId, conversationId, {
      ruleSummary: proposal.proposedFix,
      proposalId: proposal.id,
      createdBy: "user_test"
    });

    expect(result.groundingRuleId).toBeTruthy();
    const rules = grounding.list(projectId);
    expect(rules.some((rule) => rule.source === "user" && rule.content.includes("Cross-check"))).toBe(true);
    expect(rules.some((rule) => (rule.triggerTopics?.length ?? 0) >= 4)).toBe(true);
    const updated = feedback.listProposals(projectId).find((item) => item.id === proposal.id);
    expect(updated?.status).toBe("committed");
    expect(store.projectPlaybooksByProject?.[projectId] ?? []).toHaveLength(0);
  });

  it("proposes, implements, commits, and runs a playbook", async () => {
    const store = createSeedStore();
    const grounding = createProjectGroundingBindings(store);
    const feedback = createProjectFeedbackBindings(store, grounding);
    const projectId = "project_element";
    const conversationId = "conv_test_001";

    const proposal = feedback.propose(projectId, conversationId, {
      userCorrection: "Run_Status=1 is not loaded running",
      proposedFix: "Check TLKW and Compressor_Start_Relay",
      triggerTopics: ["chiller running", "哪台冷机运行"]
    });
    expect(proposal.status).toBe("proposed");

    const scriptContent = [
      "import json",
      'print(json.dumps({"loaded": ["WCC_2"], "evidence": "TLKW>50"}))'
    ].join("\n");

    const { proposal: implemented, execution } = await feedback.implement(projectId, proposal.id, {
      scriptContent,
      scriptFilename: "chiller_running_status.py"
    });
    expect(implemented.status).toBe("implemented");
    expect(implemented.scriptRelativePath).toBe("feedback_tools/chiller_running_status.py");
    expect(execution.ok).toBe(true);

    const committed = feedback.commit(projectId, implemented.id, {
      title: "Chiller running status",
      groundingSummary: "Use TLKW and relay, not Run_Status alone"
    });
    expect(committed.playbook.active).toBe(true);
    const rules = grounding.list(projectId);
    expect(rules.some((rule) => rule.content.includes("feedback_run_playbook"))).toBe(true);
    expect(rules.some((rule) => rule.source === "playbook")).toBe(true);

    const runResult = await feedback.runPlaybook(projectId, { topic: "哪台冷机运行" });
    expect(runResult.ok).toBe(true);
    expect(runResult.playbook).toMatchObject({ id: committed.playbook.id });
  });

  it("formats active playbooks prompt block", () => {
    const block = playbooksPromptBlock([
      {
        id: "pb_000001",
        projectId: "project_element",
        title: "Chiller running",
        triggerTopics: ["chiller running"],
        scriptRelativePath: "feedback_tools/chiller_running_status.py",
        groundingSummary: "TLKW check",
        sourceProposalId: "fb_prop_000001",
        active: true,
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ]);
    expect(block).toContain("Active playbooks");
    expect(block).toContain("pb_000001");
    expect(block).toContain("feedback_run_playbook");
  });

  it("rejects script paths outside feedback_tools", () => {
    expect(sanitizeScriptFilename("bad name.py")).toBeNull();
    expect(sanitizeScriptFilename("not-python.txt")).toBeNull();
    expect(resolveFeedbackScriptPath("project_element", "scripts/evil.py")).toBeNull();
    expect(resolveFeedbackScriptPath("project_element", "feedback_tools/ok.py")).toBeTruthy();
  });

  it("finds latest implemented proposal for commit command", async () => {
    const store = createSeedStore();
    const grounding = createProjectGroundingBindings(store);
    const feedback = createProjectFeedbackBindings(store, grounding);
    const projectId = "project_alpha";
    const conversationId = "conv_commit";

    const proposal = feedback.propose(projectId, conversationId, {
      userCorrection: "wrong",
      proposedFix: "fix",
      triggerTopics: ["topic"]
    });
    await feedback.implement(projectId, proposal.id, {
      scriptContent: 'print("ok")',
      scriptFilename: "demo.py"
    });

    const latest = feedback.findLatestImplementedProposal(projectId, conversationId);
    expect(latest?.id).toBe(proposal.id);
    expect(latest?.status).toBe("implemented");
  });

  it("runFeedbackScript returns error for missing script", async () => {
    const projectId = "project_demo";
    const repoRoot = repoRootForProject(projectId);
    const toolsDir = path.join(repoRoot, "feedback_tools");
    await mkdir(toolsDir, { recursive: true });
    const result = await runFeedbackScript(projectId, "feedback_tools/missing.py");
    expect(result.error).toBe("script_not_found");
  });

  it("runFeedbackScript executes valid script", async () => {
    const projectId = "project_demo";
    const repoRoot = repoRootForProject(projectId);
    const scriptPath = path.join(repoRoot, "feedback_tools", "echo_test.py");
    await mkdir(path.dirname(scriptPath), { recursive: true });
    await writeFile(scriptPath, 'import json\nprint(json.dumps({"ok": True}))', "utf8");

    const result = await runFeedbackScript(projectId, "feedback_tools/echo_test.py");
    expect(result.ok).toBe(true);
    expect(result.result).toEqual({ ok: true });

    await rm(path.join(repoRoot, "feedback_tools"), { recursive: true, force: true });
  });
});
