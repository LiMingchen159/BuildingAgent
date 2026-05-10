import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ApiClientError,
  getChat,
  getSession,
  listProjects,
  login,
  selectProject,
  sendChatMessage,
  type ChatMessage,
  type ProjectSummary,
  type SessionSummary,
  type UserSummary
} from "./api";

const STORAGE_KEY = "building-agent.session.v1";

interface StoredSession {
  token: string;
  user: UserSummary | null;
  projectId: string | null;
}

interface BannerState {
  tone: "error" | "info" | "success";
  title: string;
  message: string;
  code?: string | undefined;
  requestId?: string | undefined;
}

function readStoredSession(): StoredSession {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { token: "", user: null, projectId: null };
    }
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    return {
      token: typeof parsed.token === "string" ? parsed.token : "",
      user: parsed.user && typeof parsed.user.id === "string" && typeof parsed.user.name === "string" ? parsed.user : null,
      projectId: typeof parsed.projectId === "string" ? parsed.projectId : null
    };
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return { token: "", user: null, projectId: null };
  }
}

function storeSession(value: StoredSession): void {
  if (!value.token) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function errorBanner(error: unknown, title: string): BannerState {
  if (error instanceof ApiClientError) {
    return { tone: "error", title, message: error.message, code: error.code, requestId: error.requestId };
  }
  return { tone: "error", title, message: "Something went wrong. Please retry." };
}

function isAuthFailure(error: unknown): boolean {
  return error instanceof ApiClientError && (error.status === 401 || error.code === "auth_invalid" || error.code === "auth_missing");
}

function Banner({ banner }: { banner: BannerState | null }) {
  if (!banner) {
    return null;
  }
  return (
    <section className={`banner banner-${banner.tone}`} role={banner.tone === "error" ? "alert" : "status"} aria-live="polite">
      <strong>{banner.title}</strong>
      <p>{banner.message}</p>
      {(banner.code || banner.requestId) ? (
        <p className="diagnostic-line">
          {banner.code ? <span>Code: {banner.code}</span> : null}
          {banner.requestId ? <span>Request: {banner.requestId}</span> : null}
        </p>
      ) : null}
    </section>
  );
}

function LoginScreen({ onLogin, busy }: { onLogin: (email: string, password: string) => Promise<void>; busy: boolean }) {
  const [email, setEmail] = useState("ada@example.test");
  const [password, setPassword] = useState("local-dev-password");
  const [validation, setValidation] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setValidation("Enter the seeded email and password to continue.");
      return;
    }
    setValidation("");
    await onLogin(email.trim(), password);
  }

  return (
    <main className="auth-card" aria-labelledby="login-title">
      <p className="eyebrow">Local seeded access</p>
      <h1 id="login-title">Sign in to BuildingAgent</h1>
      <p className="muted">Use the development credentials from the README. Anonymous access is intentionally disabled.</p>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Email
          <input autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {validation ? <p className="field-error" role="alert">{validation}</p> : null}
        <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}

function ProjectScreen({ projects, onSelect, busy }: { projects: ProjectSummary[]; onSelect: (project: ProjectSummary) => Promise<void>; busy: boolean }) {
  return (
    <main className="workspace-card" aria-labelledby="projects-title">
      <p className="eyebrow">Project boundary</p>
      <h1 id="projects-title">Choose an authorized project</h1>
      <p className="muted">Only projects returned by the API for this seeded session are selectable.</p>
      <div className="project-grid">
        {projects.map((project) => (
          <article className="project-card" key={project.id}>
            <div>
              <h2>{project.name}</h2>
              <p>{project.id}</p>
              <p className="permissions">{project.permissions.join(" · ") || "No chat permissions"}</p>
            </div>
            <button type="button" onClick={() => void onSelect(project)} disabled={busy}>
              Select project
            </button>
          </article>
        ))}
      </div>
    </main>
  );
}

function ChatWorkspace({ project, messages, onSend, busy }: { project: ProjectSummary; messages: ChatMessage[]; onSend: (message: string) => Promise<void>; busy: boolean }) {
  const [draft, setDraft] = useState("");
  const canWrite = project.permissions.includes("chat:write");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) {
      return;
    }
    const message = draft;
    await onSend(message);
    setDraft("");
  }

  return (
    <main className="workspace-card chat-shell" aria-labelledby="chat-title">
      <div>
        <p className="eyebrow">Selected project</p>
        <h1 id="chat-title">{project.name} workspace</h1>
        <p className="muted">Project id: <strong>{project.id}</strong></p>
      </div>
      <section className="message-list" aria-label={`${project.name} messages`}>
        {messages.length === 0 ? <p className="empty-state">No messages yet. Start with a project-scoped question.</p> : null}
        {messages.map((message) => (
          <article className="message" key={message.id}>
            <span>{message.userId}</span>
            <p>{message.content}</p>
          </article>
        ))}
      </section>
      <form className="composer" onSubmit={handleSubmit}>
        <label htmlFor="chat-message">Message</label>
        <textarea id="chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={!canWrite || busy} placeholder={canWrite ? "Ask about this project…" : "This project is read-only for your account."} />
        <button type="submit" disabled={!canWrite || busy || !draft.trim()}>{busy ? "Sending…" : "Send message"}</button>
      </form>
      {!canWrite ? <p className="field-error" role="status">This project does not grant chat write permission.</p> : null}
    </main>
  );
}

export default function App() {
  const initial = useMemo(readStoredSession, []);
  const [token, setToken] = useState(initial.token);
  const [user, setUser] = useState<UserSummary | null>(initial.user);
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [busy, setBusy] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(Boolean(initial.token));

  function clearAuth(nextBanner?: BannerState) {
    setToken("");
    setUser(null);
    setSession(null);
    setProjects([]);
    setSelectedProject(null);
    setMessages([]);
    storeSession({ token: "", user: null, projectId: null });
    setBanner(nextBanner ?? { tone: "info", title: "Signed out", message: "Sign in again to continue." });
  }

  useEffect(() => {
    if (!token) {
      setBootstrapping(false);
      return;
    }

    let cancelled = false;
    async function bootstrap() {
      setBootstrapping(true);
      try {
        const [sessionResponse, projectResponse] = await Promise.all([getSession(token), listProjects(token)]);
        if (cancelled) {
          return;
        }
        setSession(sessionResponse.session);
        setProjects(projectResponse.projects);
        const restoredProject = projectResponse.projects.find((project) => project.id === sessionResponse.session.projectId) ?? null;
        setSelectedProject(restoredProject);
        if (restoredProject) {
          const chatResponse = await getChat(token, restoredProject.id);
          if (!cancelled) {
            setMessages(chatResponse.messages);
          }
        }
        setBanner(null);
      } catch (error) {
        if (!cancelled) {
          if (isAuthFailure(error)) {
            clearAuth(errorBanner(error, "Session expired"));
          } else {
            setBanner(errorBanner(error, "Could not load session"));
          }
        }
      } finally {
        if (!cancelled) {
          setBootstrapping(false);
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleLogin(email: string, password: string) {
    setBusy(true);
    try {
      const response = await login(email, password);
      setToken(response.token);
      setUser(response.user);
      storeSession({ token: response.token, user: response.user, projectId: null });
      setBanner({ tone: "success", title: "Signed in", message: `Welcome, ${response.user.name}.`, requestId: response.requestId });
    } catch (error) {
      setBanner(errorBanner(error, "Sign in failed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleProjectSelect(project: ProjectSummary) {
    if (!token) {
      setBanner({ tone: "error", title: "Authentication required", message: "Sign in before selecting a project.", code: "auth_missing" });
      return;
    }
    setBusy(true);
    try {
      const selected = await selectProject(token, project.id);
      const chat = await getChat(token, project.id);
      setSession(selected.session);
      setSelectedProject(project);
      setMessages(chat.messages);
      storeSession({ token, user, projectId: project.id });
      setBanner({ tone: "success", title: "Project selected", message: `${project.name} is now active.`, requestId: selected.requestId });
    } catch (error) {
      if (isAuthFailure(error)) {
        clearAuth(errorBanner(error, "Session expired"));
      } else {
        setBanner(errorBanner(error, "Project selection failed"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSend(message: string) {
    if (!token || !selectedProject) {
      setBanner({ tone: "error", title: "Select a project first", message: "Chat is available only after authentication and project selection.", code: "project_not_selected" });
      return;
    }
    if (!message.trim()) {
      setBanner({ tone: "error", title: "Message required", message: "Enter a non-empty message before sending.", code: "chat_invalid" });
      return;
    }
    setBusy(true);
    try {
      const posted = await sendChatMessage(token, selectedProject.id, message.trim());
      setMessages((current) => [...current, posted.message]);
      setBanner({ tone: "success", title: "Message sent", message: "The API accepted the project-scoped message.", requestId: posted.requestId });
    } catch (error) {
      if (isAuthFailure(error)) {
        clearAuth(errorBanner(error, "Session expired"));
      } else {
        setBanner(errorBanner(error, "Chat message failed"));
      }
    } finally {
      setBusy(false);
    }
  }

  const authenticated = Boolean(token && user);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <span className="brand-mark" aria-hidden="true">BA</span>
          <span className="brand-name">BuildingAgent</span>
        </div>
        {authenticated ? <button className="secondary" type="button" onClick={() => clearAuth()}>Sign out</button> : null}
      </header>
      <Banner banner={banner} />
      {bootstrapping ? <main className="workspace-card"><p>Checking your saved session…</p></main> : null}
      {!bootstrapping && !authenticated ? <LoginScreen onLogin={handleLogin} busy={busy} /> : null}
      {!bootstrapping && authenticated && !selectedProject ? <ProjectScreen projects={projects} onSelect={handleProjectSelect} busy={busy} /> : null}
      {!bootstrapping && authenticated && selectedProject ? <ChatWorkspace project={selectedProject} messages={messages} onSend={handleSend} busy={busy} /> : null}
      {session ? <footer className="diagnostic-footer">Session project: {session.projectId ?? "none selected"}</footer> : null}
    </div>
  );
}
