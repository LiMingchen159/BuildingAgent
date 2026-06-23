import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { ChatMessage, Conversation, SeedStore } from "./seed.js";

export interface SessionSearchHit {
  conversationId: string;
  messageId: string;
  role: string;
  snippet: string;
  content: string;
  score: number;
}

export interface SessionBrowseEntry {
  conversationId: string;
  title: string;
  messageCount: number;
  lastMessageAt: string;
  preview: string;
}

export interface SessionScrollMessage {
  conversationId: string;
  messageId: string;
  role: string;
  content: string;
  createdAt: string;
}

function escapeFtsQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `"${token.replace(/"/g, '""')}"`)
    .join(" ");
}

function snippet(content: string, query: string, maxLen = 200): string {
  const tokens = query.toLowerCase().split(/\s+/).filter((token) => token.length >= 2);
  const lower = content.toLowerCase();
  for (const token of tokens) {
    const index = lower.indexOf(token);
    if (index >= 0) {
      const start = Math.max(0, index - 40);
      const end = Math.min(content.length, index + maxLen);
      return `${start > 0 ? "…" : ""}${content.slice(start, end).replace(/\s+/g, " ").trim()}${end < content.length ? "…" : ""}`;
    }
  }
  return content.slice(0, maxLen).replace(/\s+/g, " ").trim();
}

export class SessionSearchIndex {
  private readonly db: Database.Database;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, "session_index.db");
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_messages (
        message_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS session_messages_fts USING fts5(
        project_id UNINDEXED,
        conversation_id UNINDEXED,
        message_id UNINDEXED,
        role UNINDEXED,
        content,
        created_at UNINDEXED,
        tokenize='unicode61'
      );

      CREATE TABLE IF NOT EXISTS conversation_index (
        project_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        title TEXT NOT NULL,
        last_message_at TEXT NOT NULL,
        message_count INTEGER NOT NULL,
        preview TEXT NOT NULL,
        PRIMARY KEY (project_id, conversation_id)
      );

      CREATE INDEX IF NOT EXISTS idx_session_messages_project_conv
        ON session_messages(project_id, conversation_id, created_at);
    `);
  }

  upsertMessage(
    message: ChatMessage,
    conversationId: string,
    options?: { title?: string; messageCount?: number }
  ): void {
    if (!message.content?.trim()) {
      return;
    }
    const createdAt = new Date().toISOString();
    const upsertMessage = this.db.prepare(`
      INSERT INTO session_messages (message_id, project_id, conversation_id, role, content, created_at)
      VALUES (@message_id, @project_id, @conversation_id, @role, @content, @created_at)
      ON CONFLICT(message_id) DO UPDATE SET
        project_id = excluded.project_id,
        conversation_id = excluded.conversation_id,
        role = excluded.role,
        content = excluded.content,
        created_at = excluded.created_at
    `);
    const deleteFts = this.db.prepare(`DELETE FROM session_messages_fts WHERE message_id = ?`);
    const insertFts = this.db.prepare(`
      INSERT INTO session_messages_fts (project_id, conversation_id, message_id, role, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const upsertConversation = this.db.prepare(`
      INSERT INTO conversation_index (project_id, conversation_id, title, last_message_at, message_count, preview)
      VALUES (@project_id, @conversation_id, @title, @last_message_at, @message_count, @preview)
      ON CONFLICT(project_id, conversation_id) DO UPDATE SET
        title = excluded.title,
        last_message_at = excluded.last_message_at,
        message_count = excluded.message_count,
        preview = excluded.preview
    `);

    const tx = this.db.transaction(() => {
      upsertMessage.run({
        message_id: message.id,
        project_id: message.projectId,
        conversation_id: conversationId,
        role: message.role,
        content: message.content,
        created_at: createdAt
      });
      deleteFts.run(message.id);
      insertFts.run(
        message.projectId,
        conversationId,
        message.id,
        message.role,
        message.content,
        createdAt
      );
      if (options?.title) {
        upsertConversation.run({
          project_id: message.projectId,
          conversation_id: conversationId,
          title: options.title,
          last_message_at: createdAt,
          message_count: options.messageCount ?? 1,
          preview: message.content.slice(0, 120).replace(/\s+/g, " ").trim()
        });
      }
    });
    tx();
  }

  rebuildFromStore(store: SeedStore): number {
    let count = 0;
    this.db.exec(`DELETE FROM session_messages; DELETE FROM session_messages_fts; DELETE FROM conversation_index;`);

    const conversations = Object.values(store.conversationsByProject ?? {}).flat();
    const messageById = new Map<string, ChatMessage>();
    for (const messages of Object.values(store.messagesByProject ?? {})) {
      for (const message of messages) {
        messageById.set(message.id, message);
      }
    }

    for (const conversation of conversations) {
      const msgs = conversation.messageIds
        .map((id) => messageById.get(id))
        .filter((message): message is ChatMessage => Boolean(message?.content?.trim()));
      for (const message of msgs) {
        this.upsertMessage(message, conversation.id, {
          title: conversation.title,
          messageCount: msgs.length
        });
        count += 1;
      }
    }
    return count;
  }

  search(projectId: string, query: string, limit = 8): SessionSearchHit[] {
    const ftsQuery = escapeFtsQuery(query);
    if (!ftsQuery) {
      return [];
    }
    const rows = this.db
      .prepare(
        `
        SELECT conversation_id, message_id, role, content, bm25(session_messages_fts) AS score
        FROM session_messages_fts
        WHERE project_id = ? AND session_messages_fts MATCH ?
        ORDER BY score ASC
        LIMIT ?
      `
      )
      .all(projectId, ftsQuery, limit) as Array<{
      conversation_id: string;
      message_id: string;
      role: string;
      content: string;
      score: number;
    }>;

    return rows.map((row) => ({
      conversationId: row.conversation_id,
      messageId: row.message_id,
      role: row.role,
      snippet: snippet(row.content, query),
      content: row.content.slice(0, 1200),
      score: row.score
    }));
  }

  browse(projectId: string, limit = 10): SessionBrowseEntry[] {
    const rows = this.db
      .prepare(
        `
        SELECT conversation_id, title, message_count, last_message_at, preview
        FROM conversation_index
        WHERE project_id = ?
        ORDER BY last_message_at DESC
        LIMIT ?
      `
      )
      .all(projectId, limit) as Array<{
      conversation_id: string;
      title: string;
      message_count: number;
      last_message_at: string;
      preview: string;
    }>;

    return rows.map((row) => ({
      conversationId: row.conversation_id,
      title: row.title,
      messageCount: row.message_count,
      lastMessageAt: row.last_message_at,
      preview: row.preview
    }));
  }

  /** Recover a persisted message body when store.json lost the row but SQLite still has it. */
  getMessageById(messageId: string): { conversationId: string; role: ChatMessage["role"]; content: string } | null {
    const row = this.db
      .prepare(
        `
        SELECT conversation_id, role, content
        FROM session_messages
        WHERE message_id = ?
        LIMIT 1
      `
      )
      .get(messageId) as { conversation_id: string; role: string; content: string } | undefined;
    if (!row?.content?.trim()) {
      return null;
    }
    if (row.role !== "user" && row.role !== "assistant") {
      return null;
    }
    return {
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content
    };
  }

  scroll(
    projectId: string,
    conversationId: string,
    aroundMessageId: string | undefined,
    window = 4
  ): SessionScrollMessage[] {
    const rows = this.db
      .prepare(
        `
        SELECT conversation_id, message_id, role, content, created_at
        FROM session_messages
        WHERE project_id = ? AND conversation_id = ?
        ORDER BY created_at ASC
      `
      )
      .all(projectId, conversationId) as Array<{
      conversation_id: string;
      message_id: string;
      role: string;
      content: string;
      created_at: string;
    }>;

    if (rows.length === 0) {
      return [];
    }
    const anchorIndex = aroundMessageId
      ? rows.findIndex((row) => row.message_id === aroundMessageId)
      : rows.length - 1;
    const index = anchorIndex >= 0 ? anchorIndex : rows.length - 1;
    const start = Math.max(0, index - window);
    const end = Math.min(rows.length, index + window + 1);
    return rows.slice(start, end).map((row) => ({
      conversationId: row.conversation_id,
      messageId: row.message_id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at
    }));
  }

  close(): void {
    this.db.close();
  }
}
