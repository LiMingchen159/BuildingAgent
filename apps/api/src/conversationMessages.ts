import type { ChatMessage, Conversation } from "./seed.js";

/** Messages for one conversation, in thread order (not whole-project pool). */
export function orderedConversationMessages(allMessages: ChatMessage[], conversation: Conversation): ChatMessage[] {
  const byId = new Map(allMessages.map((message) => [message.id, message]));
  const ordered: ChatMessage[] = [];
  for (const id of conversation.messageIds) {
    const message = byId.get(id);
    if (message) {
      ordered.push(message);
    }
  }
  return ordered;
}
