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
      "event: lifecycle\ndata: " + JSON.stringify({ type: "loop_started", message: "Agent loop started.", at: new Date().toISOString() }),
      ""
    ].join("\n\n"))));

    const onError = vi.fn();
    const onDone = vi.fn();

    await sendChatMessageStream("token", "project_alpha", "hello", { onError, onDone });

    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith({
      code: "stream_incomplete",
      message: "Chat stream ended before the assistant returned a final response."
    });
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
