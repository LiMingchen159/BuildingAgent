"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChatMessage, getChatHistory, safeApiError, sendChatMessage } from "../../../../lib/api";
import { clearSession, getSession } from "../../../../lib/session";

const MAX_DISPLAYED_MESSAGES = 80;

export default function ChatPage() {
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const projectId = String(params.projectId || "");
  const [token, setToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [projectName, setProjectName] = useState("Selected project");

  useEffect(() => {
    const session = getSession();
    if (!session.token) {
      setError("Login required. Sign in before opening chat.");
      setLoading(false);
      return;
    }
    if (session.selectedProject?.id && session.selectedProject.id !== projectId) {
      setError("Selected project does not match this chat URL. Re-select a project to avoid cross-project leakage.");
      setLoading(false);
      return;
    }
    setToken(session.token);
    if (session.selectedProject?.name) setProjectName(session.selectedProject.name);
    getChatHistory(session.token, projectId)
      .then((history) => setMessages(history.slice(-MAX_DISPLAYED_MESSAGES)))
      .catch((err) => setError(safeApiError(err)))
      .finally(() => setLoading(false));
  }, [projectId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!token) {
      setError("Login required. Sign in before sending chat messages.");
      return;
    }
    if (!draft.trim()) {
      setError("Chat message cannot be empty.");
      return;
    }
    setSending(true);
    try {
      const created = await sendChatMessage(token, projectId, draft);
      setMessages((current) => [...current, ...created].slice(-MAX_DISPLAYED_MESSAGES));
      setDraft("");
    } catch (err) {
      setError(safeApiError(err));
    } finally {
      setSending(false);
    }
  }

  function logout() {
    clearSession();
    router.push("/");
  }

  return (
    <main id="main-content" className="shell">
      <div className="toolbar">
        <div>
          <p className="kicker">{projectId}</p>
          <h1>{projectName}</h1>
          <p className="muted">Chat history is loaded from and written to the backend project boundary.</p>
        </div>
        <div>
          <button type="button" className="secondary" onClick={() => router.push("/projects")}>Projects</button>{" "}
          <button type="button" className="secondary" onClick={logout}>Log out</button>
        </div>
      </div>
      <section className="chat-layout">
        <div className="panel chat-log" aria-label="Chat history" aria-live="polite">
          {loading ? <div className="status">Loading chat history…</div> : null}
          {messages.length === 0 && !loading ? <div className="status">No chat messages yet. Send the first project-scoped prompt.</div> : null}
          {messages.map((message) => (
            <article key={message.id} className={`message ${message.role}`}>
              <span className="message-role">{message.role}</span>
              {message.content}
            </article>
          ))}
        </div>
        <form className="panel card form" onSubmit={onSubmit}>
          <h2>Ask BuildingAgent</h2>
          {error ? <div className="alert" role="alert">{error}</div> : null}
          <label className="field" htmlFor="message">
            Message
            <textarea id="message" name="message" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask for the current project status…" />
          </label>
          <button type="submit" disabled={sending || loading || !token}>{sending ? "Sending…" : "Send message"}</button>
        </form>
      </section>
    </main>
  );
}
