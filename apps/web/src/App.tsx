import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell, Banner, Card, EmptyState, LoadingSkeleton, MockOnlyBadge, Surface, type BannerProps } from "./ui/primitives";
import {
  ApiClientError,
  getChat,
  getProjectManagement,
  getRegistry,
  getSession,
  listProjects,
  login,
  selectProject,
  sendChatMessage,
  type ChatProviderDiagnostics,
  type BuildingCapabilitySummary,
  type ChatMessage,
  type GatewaySummary,
  type ProjectManagementResponse,
  type ProjectSummary,
  type RegistryResponse,
  type RuntimeProviderSummary,
  type SessionSummary,
  type SkillSummary,
  type ToolSummary,
  type UserSummary
} from "./api";

const STORAGE_KEY = "building-agent.session.v1";
type WorkspaceTab = "chat" | "registry" | "gateways" | "building";

interface StoredSession {
  token: string;
  user: UserSummary | null;
  projectId: string | null;
}

type BannerState = BannerProps;

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
      {busy ? <p className="inline-status" role="status">Signing in with the local API session boundary…</p> : null}
      <form className="stack" onSubmit={handleSubmit} aria-busy={busy}>
        <label>
          Email
          <input autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {validation ? <p className="field-error" role="alert">{validation}</p> : null}
        <button type="submit" disabled={busy} aria-busy={busy}>{busy ? "Signing in…" : "Sign in"}</button>
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
      {busy ? <p className="inline-status" role="status">Selecting project and loading placeholder workspace surfaces…</p> : null}
      {projects.length === 0 ? <EmptyState title="No authorized projects">This session did not return any selectable project records.</EmptyState> : null}
      <div className="project-grid" aria-busy={busy}>
        {projects.map((project) => (
          <Card className="project-card" key={project.id}>
            <div>
              <h2>{project.name}</h2>
              <p>{project.id}</p>
              <p className="permissions">{project.permissions.join(" · ") || "No chat permissions"}</p>
            </div>
            <button type="button" onClick={() => void onSelect(project)} disabled={busy} aria-busy={busy}>
              {busy ? "Selecting…" : "Select project"}
            </button>
          </Card>
        ))}
      </div>
    </main>
  );
}

function BootstrapLoading() {
  return (
    <main className="workspace-card bootstrap-card" aria-labelledby="bootstrap-title">
      <div>
        <p className="eyebrow">BuildingAgent startup</p>
        <h1 id="bootstrap-title">Restoring your saved session</h1>
        <p className="muted">Checking the local API session and authorized project list before showing any workspace data.</p>
      </div>
      <LoadingSkeleton label="Checking your saved BuildingAgent session…" lines={5} />
      <p className="inline-status" role="status" aria-label="Saved-session bootstrap phase">Safe phase: saved-session bootstrap is in progress. No live building systems, repositories, or control routes are being contacted.</p>
      <MockOnlyBadge kind="stub" label="Startup shell only" />
    </main>
  );
}

function MetaBar({ limit, requestId }: { limit?: number | undefined; requestId?: string | undefined }) {
  return (
    <p className="management-meta">
      <MockOnlyBadge />
      {typeof limit === "number" ? <span>Limit: {limit}</span> : null}
      {requestId ? <span>Request: {requestId}</span> : null}
    </p>
  );
}

function ItemList<T extends { id: string; name: string; status: string; description: string }>({
  items,
  getMeta,
  emptyText
}: {
  items: T[];
  getMeta: (item: T) => string;
  emptyText: string;
}) {
  if (items.length === 0) {
    return <EmptyState>{emptyText}</EmptyState>;
  }
  return (
    <div className="management-grid">
      {items.map((item) => (
        <Card className="management-item" key={item.id}>
          <div className="item-heading">
            <h3>{item.name}</h3>
            <span className={`status-pill status-${item.status.replace("_", "-")}`}>{item.status.replace("_", " ")}</span>
          </div>
          <p className="item-meta">{item.id} · {getMeta(item)}</p>
          <p>{item.description}</p>
        </Card>
      ))}
    </div>
  );
}

function providerNotice(provider: ChatProviderDiagnostics | null, requestId?: string | undefined) {
  if (!provider) {
    return null;
  }
  return (
    <p className="provider-notice" aria-label="Provider diagnostics">
      <span>Provider: {provider.id}</span>
      <span>Mode: {provider.mode}</span>
      <span>Model: {provider.model}</span>
      <span>Fallback: {provider.fallbackUsed ? "yes" : "no"}</span>
      {provider.fallbackReason ? <span>Reason: {provider.fallbackReason}</span> : null}
      {requestId ? <span>Request: {requestId}</span> : null}
    </p>
  );
}

function ChatWorkspace({ project, messages, onSend, busy, provider, requestId }: { project: ProjectSummary; messages: ChatMessage[]; onSend: (message: string) => Promise<void>; busy: boolean; provider: ChatProviderDiagnostics | null; requestId?: string | undefined }) {
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
    <section className="chat-shell" aria-labelledby="chat-title">
      <div>
        <p className="eyebrow">Selected project</p>
        <h2 id="chat-title">{project.name} chat</h2>
        <p className="muted">Project id: <strong>{project.id}</strong></p>
      </div>
      {providerNotice(provider, requestId)}
      <section className="message-list" aria-label={`${project.name} messages`}>
        {messages.length === 0 ? <p className="empty-state">No messages yet. Start with a project-scoped question.</p> : null}
        {messages.map((message) => (
          <article className={`message message-${message.role}`} key={message.id} aria-label={`${message.role === "assistant" ? "Assistant" : "You"} message`}>
            <span>{message.role === "assistant" ? "Assistant" : message.userId}</span>
            <p>{message.content}</p>
          </article>
        ))}
      </section>
      <form className="composer" onSubmit={handleSubmit}>
        <label htmlFor="chat-message">Message</label>
        <textarea id="chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={!canWrite || busy} placeholder={canWrite ? "Ask about this project…" : "This project is read-only for your account."} />
        <button type="submit" disabled={!canWrite || busy || !draft.trim()} aria-busy={busy}>{busy ? "Sending…" : "Send message"}</button>
      </form>
      {!canWrite ? <p className="field-error" role="status">This project does not grant chat write permission.</p> : null}
    </section>
  );
}

function RegistryPanel({ registry }: { registry: RegistryResponse | null }) {
  return (
    <Surface className="management-panel" labelledBy="registry-title">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Platform registry</p>
          <h2 id="registry-title">Runtime providers, tools, and skills</h2>
        </div>
        <MetaBar limit={registry?.limit} requestId={registry?.requestId} />
      </div>
      {!registry ? <EmptyState>Registry data is unavailable. Check the diagnostic banner and retry.</EmptyState> : null}
      {registry ? (
        <>
          <h3>Runtime providers</h3>
          <ItemList<RuntimeProviderSummary> items={registry.runtimeProviders} getMeta={(item) => item.kind} emptyText="No runtime provider placeholders returned." />
          <h3>Tools</h3>
          <ItemList<ToolSummary> items={registry.tools} getMeta={(item) => item.category} emptyText="No tool placeholders returned." />
          <h3>Skills</h3>
          <ItemList<SkillSummary> items={registry.skills} getMeta={(item) => item.domain} emptyText="No skill placeholders returned." />
        </>
      ) : null}
    </Surface>
  );
}

function GatewayPanel({ registry, management }: { registry: RegistryResponse | null; management: ProjectManagementResponse | null }) {
  return (
    <Surface className="management-panel" labelledBy="gateways-title">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Gateways</p>
          <h2 id="gateways-title">Project gateway placeholders</h2>
        </div>
        <MetaBar limit={management?.limit ?? registry?.limit} requestId={management?.requestId ?? registry?.requestId} />
      </div>
      <p className="muted">These entries are read-only synthetic gateway slots; no external BMS, MCP, or customer integration is live.</p>
      <h3>Project gateways</h3>
      {management ? <ItemList<GatewaySummary> items={management.gateways} getMeta={(item) => item.protocol} emptyText="No project gateway placeholders returned." /> : <EmptyState>Project management data is unavailable.</EmptyState>}
      <h3>Registry gateway catalog</h3>
      {registry ? <ItemList<GatewaySummary> items={registry.gateways} getMeta={(item) => item.protocol} emptyText="No registry gateway placeholders returned." /> : <EmptyState>Registry gateway data is unavailable.</EmptyState>}
    </Surface>
  );
}

function BuildingDomainPanel({ registry, management }: { registry: RegistryResponse | null; management: ProjectManagementResponse | null }) {
  return (
    <Surface className="management-panel" labelledBy="building-title">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Building domain</p>
          <h2 id="building-title">Synthetic capabilities and tools</h2>
        </div>
        <MetaBar limit={management?.limit ?? registry?.limit} requestId={management?.requestId ?? registry?.requestId} />
      </div>
      <p className="muted">Capability cards are mock or placeholder data only and contain no customer building records.</p>
      <h3>Project capabilities</h3>
      {management ? <ItemList<BuildingCapabilitySummary> items={management.capabilities} getMeta={(item) => item.domain} emptyText="No project building capabilities returned." /> : <EmptyState>Project capability data is unavailable.</EmptyState>}
      <h3>Project tools</h3>
      {management ? <ItemList<ToolSummary> items={management.tools} getMeta={(item) => item.category} emptyText="No project tool placeholders returned." /> : <EmptyState>Project tool data is unavailable.</EmptyState>}
      <h3>Registry capability catalog</h3>
      {registry ? <ItemList<BuildingCapabilitySummary> items={registry.buildingCapabilities} getMeta={(item) => item.domain} emptyText="No registry building capabilities returned." /> : <EmptyState>Registry capability data is unavailable.</EmptyState>}
    </Surface>
  );
}

function Workspace({
  project,
  messages,
  providerDiagnostics,
  providerRequestId,
  registry,
  management,
  activeTab,
  onTabChange,
  onSend,
  busy
}: {
  project: ProjectSummary;
  messages: ChatMessage[];
  providerDiagnostics: ChatProviderDiagnostics | null;
  providerRequestId: string | undefined;
  registry: RegistryResponse | null;
  management: ProjectManagementResponse | null;
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  onSend: (message: string) => Promise<void>;
  busy: boolean;
}) {
  const tabs: Array<{ id: WorkspaceTab; label: string }> = [
    { id: "chat", label: "Chat" },
    { id: "registry", label: "Platform Registry" },
    { id: "gateways", label: "Gateways" },
    { id: "building", label: "Building Domain" }
  ];

  return (
    <main className="workspace-card workspace-management" aria-labelledby="workspace-title">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">Selected project</p>
          <h1 id="workspace-title">{project.name} workspace</h1>
          <p className="muted">Project id: <strong>{project.id}</strong></p>
        </div>
        <MockOnlyBadge kind="inspection" />
      </div>
      <nav className="workspace-tabs" aria-label="Workspace panels">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" className={activeTab === tab.id ? "tab-active secondary" : "secondary"} aria-pressed={activeTab === tab.id} onClick={() => onTabChange(tab.id)}>
            {tab.label}
          </button>
        ))}
      </nav>
      {activeTab === "chat" ? <ChatWorkspace project={project} messages={messages} onSend={onSend} busy={busy} provider={providerDiagnostics} requestId={providerRequestId} /> : null}
      {activeTab === "registry" ? <RegistryPanel registry={registry} /> : null}
      {activeTab === "gateways" ? <GatewayPanel registry={registry} management={management} /> : null}
      {activeTab === "building" ? <BuildingDomainPanel registry={registry} management={management} /> : null}
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
  const [chatProviderDiagnostics, setChatProviderDiagnostics] = useState<ChatProviderDiagnostics | null>(null);
  const [chatProviderRequestId, setChatProviderRequestId] = useState<string | undefined>(undefined);
  const [registry, setRegistry] = useState<RegistryResponse | null>(null);
  const [management, setManagement] = useState<ProjectManagementResponse | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("chat");
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
    setChatProviderDiagnostics(null);
    setChatProviderRequestId(undefined);
    setRegistry(null);
    setManagement(null);
    setActiveTab("chat");
    storeSession({ token: "", user: null, projectId: null });
    setBanner(nextBanner ?? { tone: "info", title: "Signed out", message: "Sign in again to continue." });
  }

  async function loadManagementSurfaces(currentToken: string, projectId: string) {
    const [registryResponse, managementResponse] = await Promise.all([getRegistry(currentToken), getProjectManagement(currentToken, projectId)]);
    setRegistry(registryResponse);
    setManagement(managementResponse);
    return { registryResponse, managementResponse };
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
          const [chatResponse, registryResponse, managementResponse] = await Promise.all([
            getChat(token, restoredProject.id),
            getRegistry(token),
            getProjectManagement(token, restoredProject.id)
          ]);
          if (!cancelled) {
            setMessages(chatResponse.messages);
            setRegistry(registryResponse);
            setManagement(managementResponse);
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
      setRegistry(null);
      setManagement(null);
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
      const [chat] = await Promise.all([getChat(token, project.id), loadManagementSurfaces(token, project.id)]);
      setSession(selected.session);
      setSelectedProject(project);
      setMessages(chat.messages);
      setChatProviderDiagnostics(null);
      setChatProviderRequestId(undefined);
      setActiveTab("chat");
      storeSession({ token, user, projectId: project.id });
      setBanner({ tone: "success", title: "Project selected", message: `${project.name} is now active. Placeholder registry and management surfaces loaded.`, requestId: selected.requestId });
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
      setMessages((current) => [...current, posted.message, posted.assistantMessage]);
      setChatProviderDiagnostics(posted.provider);
      setChatProviderRequestId(posted.requestId);
      setBanner({ tone: "success", title: "Message sent", message: "The assistant response is ready with redaction-safe provider diagnostics.", requestId: posted.requestId });
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
    <AppShell authenticated={authenticated} onSignOut={() => clearAuth()}>
      {banner ? <Banner {...banner} /> : null}
      {bootstrapping ? <BootstrapLoading /> : null}
      {!bootstrapping && !authenticated ? <LoginScreen onLogin={handleLogin} busy={busy} /> : null}
      {!bootstrapping && authenticated && !selectedProject ? <ProjectScreen projects={projects} onSelect={handleProjectSelect} busy={busy} /> : null}
      {!bootstrapping && authenticated && selectedProject ? <Workspace project={selectedProject} messages={messages} providerDiagnostics={chatProviderDiagnostics} providerRequestId={chatProviderRequestId} registry={registry} management={management} activeTab={activeTab} onTabChange={setActiveTab} onSend={handleSend} busy={busy} /> : null}
      {session ? <footer className="diagnostic-footer">Session project: {session.projectId ?? "none selected"}</footer> : null}
    </AppShell>
  );
}
