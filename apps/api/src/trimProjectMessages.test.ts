import { describe, expect, it } from "vitest";
import { createSeedStore, type ChatMessage, type Conversation } from "./seed.js";

function trimProjectMessagesLikeServer(
  store: ReturnType<typeof createSeedStore>,
  projectId: string,
  limit: number
): void {
  const messages = store.messagesByProject[projectId];
  if (!messages || messages.length <= limit) {
    return;
  }
  const referenced = new Set(
    (store.conversationsByProject[projectId] ?? []).flatMap((conversation) => conversation.messageIds)
  );
  const protectedMessages = messages.filter((message) => referenced.has(message.id));
  const unprotected = messages.filter((message) => !referenced.has(message.id));
  const unprotectedBudget = Math.max(0, limit - protectedMessages.length);
  const keptUnprotected = unprotected.slice(-unprotectedBudget);
  const keptIds = new Set([...protectedMessages, ...keptUnprotected].map((message) => message.id));
  store.messagesByProject[projectId] = messages.filter((message) => keptIds.has(message.id));
}

describe("trimProjectMessages", () => {
  it("keeps messages referenced by any conversation when trimming", () => {
    const store = createSeedStore();
    const projectId = "project_element";
    const convA: Conversation = {
      id: "conv_a",
      projectId,
      title: "A",
      messageIds: ["msg_old"],
      createdAt: new Date().toISOString()
    };
    const convB: Conversation = {
      id: "conv_b",
      projectId,
      title: "B",
      messageIds: ["msg_new"],
      createdAt: new Date().toISOString()
    };
    store.conversationsByProject[projectId] = [convA, convB];
    const mk = (id: string, content: string): ChatMessage => ({
      id,
      projectId,
      userId: "u",
      role: "user",
      content
    });
    store.messagesByProject[projectId] = [
      mk("msg_old", "early"),
      mk("msg_mid1", "x"),
      mk("msg_mid2", "y"),
      mk("msg_new", "late")
    ];
    trimProjectMessagesLikeServer(store, projectId, 2);
    const byId = new Map(store.messagesByProject[projectId]!.map((m) => [m.id, m]));
    expect(byId.has("msg_old")).toBe(true);
    expect(byId.has("msg_new")).toBe(true);
  });
});
