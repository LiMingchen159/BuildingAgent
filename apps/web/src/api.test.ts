import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deployFddAlgorithm,
  deployFddTask,
  getFddLibrary,
  sendChatMessageStream,
  type FddFleetGuardAuthorization
} from "./api";

function streamResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" }
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chat stream client", () => {
  it("reports an incomplete stream when no done or error event arrives", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse([
      "event: debug\ndata: " + JSON.stringify({ type: "loop_started", message: "I am checking project context and memory.", at: new Date().toISOString() }),
      ""
    ].join("\n\n"))));

    const onError = vi.fn();
    const onDone = vi.fn();

    await sendChatMessageStream("token", "project_alpha", "hello", { onError, onDone });

    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith({
      code: "stream_incomplete",
      message: "The connection closed before the assistant finished. Long think/tool runs can hit proxy timeouts — please retry; your question may already be saved."
    });
  });

  it("routes answer_token after final_answer_start for black answer streaming", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse([
      "event: narration_token\ndata: " + JSON.stringify({ content: "Work narration" }),
      "",
      "event: final_answer_start\ndata: " + JSON.stringify({ requestId: "req_1" }),
      "",
      "event: answer_token\ndata: " + JSON.stringify({ content: "Hello " }),
      "",
      "event: answer_token\ndata: " + JSON.stringify({ content: "world" }),
      "",
      "event: done\ndata: " + JSON.stringify({
        message: { role: "user", content: "hello" },
        assistantMessage: { role: "assistant", content: "Hello world" },
        conversationId: "conv_1",
        provider: { id: "test" },
        requestId: "req_1"
      }),
      ""
    ].join("\n\n"))));

    const onNarrationToken = vi.fn();
    const onFinalAnswerStart = vi.fn();
    const onAnswerToken = vi.fn();

    await sendChatMessageStream("token", "project_alpha", "hello", {
      onNarrationToken,
      onFinalAnswerStart,
      onAnswerToken,
      onDone: vi.fn()
    });

    expect(onNarrationToken).toHaveBeenCalledWith("Work narration");
    expect(onFinalAnswerStart).toHaveBeenCalledTimes(1);
    expect(onAnswerToken).toHaveBeenCalledTimes(2);
    expect(onAnswerToken).toHaveBeenNthCalledWith(1, "Hello ");
    expect(onAnswerToken).toHaveBeenNthCalledWith(2, "world");
  });

  it("routes narration_token and narration_reset without touching answer handlers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse([
      "event: narration_token\ndata: " + JSON.stringify({ content: "Interim " }),
      "",
      "event: narration_token\ndata: " + JSON.stringify({ content: "narration." }),
      "",
      "event: narration_reset\ndata: " + JSON.stringify({ requestId: "req_1" }),
      "",
      "event: final_answer_start\ndata: " + JSON.stringify({ requestId: "req_1" }),
      "",
      "event: done\ndata: " + JSON.stringify({
        message: { role: "user", content: "hello" },
        assistantMessage: { role: "assistant", content: "Final answer." },
        conversationId: "conv_1",
        provider: { id: "test" },
        requestId: "req_1"
      }),
      ""
    ].join("\n\n"))));

    const onNarrationToken = vi.fn();
    const onNarrationReset = vi.fn();
    const onToken = vi.fn();
    const onFinalAnswerStart = vi.fn();
    const onDone = vi.fn();

    await sendChatMessageStream("token", "project_alpha", "hello", {
      onNarrationToken,
      onNarrationReset,
      onToken,
      onFinalAnswerStart,
      onDone
    });

    expect(onNarrationToken).toHaveBeenCalledTimes(2);
    expect(onNarrationToken).toHaveBeenNthCalledWith(1, "Interim ");
    expect(onNarrationToken).toHaveBeenNthCalledWith(2, "narration.");
    expect(onNarrationReset).toHaveBeenCalledTimes(1);
    expect(onToken).not.toHaveBeenCalled();
    expect(onFinalAnswerStart).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("passes stream error request ids through to the UI handler", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse([
      "event: error\ndata: " + JSON.stringify({ code: "provider_error", message: "Provider failed.", requestId: "req_123" }),
      ""
    ].join("\n\n"))));

    const onError = vi.fn();

    await sendChatMessageStream("token", "project_alpha", "hello", { onError });

    expect(onError).toHaveBeenCalledWith({
      code: "provider_error",
      message: "Provider failed.",
      requestId: "req_123"
    });
  });
});

describe("FleetGuard FDD wire client", () => {
  const checkedAt = "2026-08-20T00:00:00.000Z";
  const entityKeys = Array.from({ length: 8 }, (_, index) => `WCC_${index + 1}`);
  const templateRef = { templateId: "template-1", version: 2, signature: "template-signature" };
  const signatures = {
    algorithm: "algorithm-signature",
    evaluator: "evaluator-signature",
    inventory: "inventory-signature",
    evidence: "evidence-signature",
    template: templateRef.signature
  };
  const authorization: FddFleetGuardAuthorization = {
    policyVersion: "fleetguard-v1",
    planId: "plan-1",
    planSignature: "plan-signature",
    rolloutRevision: 2,
    parameterSignature: "parameter-signature",
    templateRef,
    signatures
  };
  const readyFleetGuard = {
    kind: "fleetguard_v1",
    policyVersion: "fleetguard-v1",
    state: "ready",
    planId: "plan-1",
    planSignature: "plan-signature",
    rolloutRevision: 2,
    templateRef,
    parameterSignature: "parameter-signature",
    signatures,
    coverage: { expected: 8, bound: 8, dataReady: 8, authorized: 8 },
    warnings: [],
    authorization,
    checkedAt
  };
  const baseCheck = {
    algorithmId: "algorithm-1",
    algorithmVersion: "1.0.0",
    checkPolicyVersion: "v4-homogeneous-fleet",
    projectId: "project_element",
    status: "uncertain",
    applicability: "applicable",
    equipmentAvailability: { equipmentType: "chiller", status: "available", entityCount: 8, entityKeys },
    equipmentInventorySignature: "inventory-signature",
    expectedEntityCount: 8,
    pointCandidates: [],
    deployableEntities: [],
    ambiguousInputs: [],
    rejectedCandidates: [],
    missingPoints: [],
    historyIssues: [],
    checkedAt,
    source: "auto",
    projectDataSignature: "project-signature"
  };

  function libraryPayload(check: unknown) {
    return {
      projectId: "project_element",
      algorithms: [],
      checks: [check],
      tasks: [],
      equipmentAvailability: [baseCheck.equipmentAvailability],
      equipmentInventorySignature: "inventory-signature",
      fleetGuardRollout: {
        mode: "canary",
        revision: 2,
        algorithmKeys: ["chiller_ch_01_commanded_chiller_fails_to_start"],
        templateRefs: [{ algorithmKey: "chiller_ch_01_commanded_chiller_fails_to_start", ...templateRef }]
      },
      requestId: "request-1"
    };
  }

  it("parses a self-consistent Ready summary and effective rollout", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(libraryPayload({ ...baseCheck, fleetGuard: readyFleetGuard }))));

    const result = await getFddLibrary("token", "project_element");

    expect(result.checks[0]?.fleetGuard).toMatchObject({ state: "ready", coverage: { expected: 8, authorized: 8 } });
    expect(result.checks[0]?.fleetGuardMalformed).toBeUndefined();
    expect(result.fleetGuardRollout).toMatchObject({ mode: "canary", revision: 2 });
  });

  it("keeps present-but-malformed 7-of-8 FleetGuard evidence as a fail-closed sentinel", async () => {
    const malformed = {
      ...readyFleetGuard,
      coverage: { expected: 7, bound: 7, dataReady: 7, authorized: 7 }
    };
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(libraryPayload({ ...baseCheck, fleetGuard: malformed }))));

    const result = await getFddLibrary("token", "project_element");

    expect(result.checks[0]?.fleetGuard).toBeUndefined();
    expect(result.checks[0]?.fleetGuardMalformed).toBe(true);
  });

  it("preserves a legitimate unknown-inventory Blocked primary blocker", async () => {
    const unknownCheck = {
      ...baseCheck,
      status: "cannot_deploy",
      applicability: "unknown",
      expectedEntityCount: 0,
      equipmentAvailability: { equipmentType: "chiller", status: "unknown", entityCount: 0 },
      fleetGuard: {
        ...readyFleetGuard,
        state: "blocked",
        templateRef: undefined,
        signatures: { ...signatures, template: undefined },
        coverage: { expected: 0, bound: 0, dataReady: 0, authorized: 0 },
        primaryBlocker: { code: "inventory_unknown", reason: "Authoritative chiller inventory is unknown." },
        authorization: undefined
      }
    };
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(libraryPayload(unknownCheck))));

    const result = await getFddLibrary("token", "project_element");

    expect(result.checks[0]?.fleetGuard).toMatchObject({
      state: "blocked",
      primaryBlocker: { code: "inventory_unknown", reason: "Authoritative chiller inventory is unknown." }
    });
  });

  it("sends exact authorization bodies for FleetGuard and keeps v4 requests bodyless", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return jsonResponse({ error: { code: "expected_test_stop", message: "stop" } }, 409);
    }));

    await expect(deployFddAlgorithm("token", "project_element", "algorithm-1", authorization)).rejects.toThrow();
    await expect(deployFddTask("token", "project_element", "task-1", authorization)).rejects.toThrow();
    await expect(deployFddAlgorithm("token", "project_element", "algorithm-2")).rejects.toThrow();
    await expect(deployFddTask("token", "project_element", "task-2")).rejects.toThrow();

    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ authorization });
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ authorization });
    expect(calls[2]?.init?.body).toBeUndefined();
    expect(calls[3]?.init?.body).toBeUndefined();
  });
});
