import { afterEach, describe, expect, it, vi } from "vitest";
import { sendChatMessageStream } from "./api";

function streamResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" }
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
