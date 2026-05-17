import { describe, expect, it } from "vitest";
import { orderedConversationMessages } from "./conversationMessages.js";
import type { ChatMessage, Conversation } from "./seed.js";

describe("orderedConversationMessages", () => {
  it("returns only messages in the conversation thread order", () => {
    const conversation: Conversation = {
      id: "conv_1",
      projectId: "project_element",
      title: "Test",
      messageIds: ["m2", "m4"],
      createdAt: new Date().toISOString()
    };
    const all: ChatMessage[] = [
      { id: "m1", projectId: "project_element", userId: "u", role: "user", content: "other conv" },
      { id: "m2", projectId: "project_element", userId: "u", role: "user", content: "hello" },
      { id: "m3", projectId: "project_element", userId: "u", role: "user", content: "noise" },
      { id: "m4", projectId: "project_element", userId: "u", role: "assistant", content: "hi" }
    ];
    expect(orderedConversationMessages(all, conversation).map((m) => m.id)).toEqual(["m2", "m4"]);
  });
});
