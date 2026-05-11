import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell, Avatar, Badge, Banner, Button, Card, EmptyState, Input, LoadingSkeleton, MockOnlyBadge, Surface, type BannerProps } from "./ui/primitives";
import { WorkspaceShell } from "./ui/WorkspaceShell";
import { Markdown } from "./ui/Markdown";
import { ChatImageGallery } from "./ui/ChatImageGallery";
import { KnowledgeBase, buildMockKnowledgeBaseDocuments } from "./ui/KnowledgeBase";
import { Repository, buildMockRepositoryItems } from "./ui/Repository";
import { ScheduledTasks } from "./ui/ScheduledTasks";
import { Skills } from "./ui/Skills";
import { Tools } from "./ui/Tools";
import { CubeLogo } from "./ui/CubeLogo";
import { ParticleField } from "./ui/ParticleField";
import { buildDemoConversation } from "./ui/demoConversation";
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
type WorkspaceTab = "chat" | "kb" | "repo" | "registry" | "gateways" | "building";

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
    <main className="login-shell minimal-auth-shell" aria-labelledby="login-title">
      <ParticleField className="minimal-particle-field" density={60} connectionDistance={150} opacity={0.15} />
      <section className="minimal-auth-panel" aria-label="BuildingAgent local access">
        <CubeLogo className="minimal-auth-logo" />
        <div className="minimal-auth-heading">
          <h1 id="login-title">BuildingAgent</h1>
          <h2 className="visually-hidden">Sign in to BuildingAgent</h2>
          <p>Architecture Intelligence</p>
        </div>
        <form className="minimal-auth-form" onSubmit={handleSubmit} aria-busy={busy}>
          <label>
            <span className="visually-hidden">Email</span>
            <Input className="input-minimal" autoComplete="username" placeholder="Workspace ID or Email" value={email} onChange={(event) => setEmail(event.target.value)} invalid={Boolean(validation && !email.trim())} />
          </label>
          <label>
            <span className="visually-hidden">Password</span>
            <Input className="input-minimal" type="password" autoComplete="current-password" placeholder="Access Key" value={password} onChange={(event) => setPassword(event.target.value)} invalid={Boolean(validation && !password)} />
          </label>
          {validation ? <p className="field-error login-error" role="alert">{validation}</p> : null}
          <Button type="submit" loading={busy} className="btn-minimal login-submit" aria-label="Sign in">
            {busy ? <span className="spinner" aria-hidden="true" /> : null}
            {busy ? "Connecting..." : "Initialize"}
          </Button>
          {busy ? <p className="minimal-auth-status" role="status">Checking local access...</p> : null}
          <div className="minimal-auth-links" aria-label="Seeded demo guidance">
            <span>Recover key</span>
            <span>Request access</span>
          </div>
        </form>
      </section>
    </main>
  );
}
function projectMockMetrics(projectId: string): { lastOpened: string; knowledgeBases: number; repositories: number; tasks: number } {
  let hash = 0;
  for (let index = 0; index < projectId.length; index += 1) {
    hash = (hash * 31 + projectId.charCodeAt(index)) >>> 0;
  }
  const days = (hash % 14) + 1;
  const lastOpened = days === 1 ? "Last opened: yesterday" : `Last opened: ${days} days ago`;
  return {
    lastOpened,
    knowledgeBases: (hash >> 4) % 6,
    repositories: (hash >> 8) % 4,
    tasks: (hash >> 12) % 12
  };
}

function ProjectCardSkeleton() {
  return (
    <Card className="project-card project-card-skeleton" aria-hidden="true">
      <div className="project-card-skeleton-row">
        <span className="skeleton-line skeleton-line-title" />
        <span className="skeleton-line skeleton-line-tag" />
      </div>
      <div className="project-card-skeleton-row">
        <span className="skeleton-line skeleton-line-meta" />
        <span className="skeleton-line skeleton-line-meta" />
        <span className="skeleton-line skeleton-line-meta" />
      </div>
      <span className="skeleton-line skeleton-line-button" />
    </Card>
  );
}

function ProjectScreen({ projects, onSelect, onSignOut, busy }: { projects: ProjectSummary[]; onSelect: (project: ProjectSummary) => Promise<void>; onSignOut: () => void; busy: boolean }) {
  return (
    <main className="workspace-card project-screen minimal-project-shell" aria-labelledby="projects-title">
      <ParticleField className="minimal-particle-field" density={44} connectionDistance={145} opacity={0.12} />
      <div className="project-screen-header minimal-project-header">
        <div>
          <CubeLogo size={34} className="minimal-project-logo" />
          <p className="eyebrow">Project boundary</p>
          <h1 id="projects-title">Choose an authorized project</h1>
          <p className="muted">Only projects returned by the API for this seeded session are selectable. Metadata below is mock-only; no live customer telemetry.</p>
        </div>
        <div className="project-screen-actions">
          <MockOnlyBadge kind="stub" label="Mock metrics only" />
          <button type="button" className="project-sign-out" onClick={onSignOut}>Sign out</button>
        </div>
      </div>
      {busy ? (
        <p className="inline-status project-status" role="status">
          <span className="spinner" aria-hidden="true" />
          Opening workspace...
        </p>
      ) : null}
      {projects.length === 0 ? <EmptyState title="No authorized projects">This session did not return any selectable project records.</EmptyState> : null}
      <div className="project-grid" aria-busy={busy}>
        {projects.map((project) => {
          const metrics = projectMockMetrics(project.id);
          const canChat = project.permissions.includes("chat:read");
          return (
            <Card className="project-card minimal-project-card" key={project.id}>
              <div className="project-card-heading">
                <div>
                  <h2>{project.name}</h2>
                  <p className="project-card-id">{project.id}</p>
                </div>
                <Badge tone={canChat ? "success" : "neutral"}>{canChat ? "Chat-enabled" : "Read-only"}</Badge>
              </div>
              <p className="project-card-last-opened">{metrics.lastOpened}</p>
              <dl className="project-card-metrics" aria-label={`${project.name} mock metrics`}>
                <div>
                  <dt>Knowledge bases</dt>
                  <dd>{metrics.knowledgeBases}</dd>
                </div>
                <div>
                  <dt>Repositories</dt>
                  <dd>{metrics.repositories}</dd>
                </div>
                <div>
                  <dt>Open tasks</dt>
                  <dd>{metrics.tasks}</dd>
                </div>
              </dl>
              <p className="permissions">{project.permissions.join(" / ") || "No chat permissions"}</p>
              <Button type="button" className="btn-minimal" onClick={() => void onSelect(project)} loading={busy}>
                {busy ? "Selecting..." : "Select project"}
              </Button>
            </Card>
          );
        })}
        {projects.length > 0 ? (
          <Card className="project-card project-card-add minimal-project-card" aria-label="Add project (placeholder)">
            <div className="project-card-add-icon" aria-hidden="true">+</div>
            <h2>Add project</h2>
            <p className="muted">New project provisioning is not wired yet. Track progress in M002 follow-up issues.</p>
            <Button type="button" variant="secondary" className="btn-minimal" disabled>Coming soon</Button>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
function ProjectScreenSkeleton() {
  return (
    <main className="workspace-card project-screen project-screen-skeleton minimal-project-shell" aria-labelledby="projects-skeleton-title" aria-busy="true">
      <ParticleField className="minimal-particle-field" density={36} connectionDistance={145} opacity={0.1} />
      <div className="project-screen-header minimal-project-header">
        <div>
          <CubeLogo size={34} className="minimal-project-logo" />
          <p className="eyebrow">Project boundary</p>
          <h1 id="projects-skeleton-title">Loading authorized projects...</h1>
          <p className="muted">Fetching your authorized projects.</p>
        </div>
      </div>
      <p className="minimal-loading-status project-status" role="status" aria-label="Project list bootstrap phase">
        <span className="spinner" aria-hidden="true" />
        Loading projects...
      </p>
      <div className="project-grid" aria-hidden="true">
        <ProjectCardSkeleton />
        <ProjectCardSkeleton />
        <ProjectCardSkeleton />
      </div>
    </main>
  );
}
function BootstrapLoading() {
  return (
    <main className="minimal-bootstrap-shell" aria-labelledby="bootstrap-title" aria-busy="true">
      <div className="minimal-bootstrap-status" role="status" aria-live="polite" aria-label="Saved-session bootstrap phase">
        <span className="spinner" aria-hidden="true" />
        <h1 id="bootstrap-title">Restoring your saved session</h1>
      </div>
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
          <p className="item-meta">{item.id} / {getMeta(item)}</p>
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

function ChatWorkspace({ project, messages, onSend, onLoadDemo, busy, provider, requestId }: { project: ProjectSummary; messages: ChatMessage[]; onSend: (message: string) => Promise<void>; onLoadDemo: () => void; busy: boolean; provider: ChatProviderDiagnostics | null; requestId?: string | undefined }) {
  const [draft, setDraft] = useState("");
  const canWrite = project.permissions.includes("chat:write");
  const quickActions = [
    { label: "Upload PDF", detail: "Add to knowledge base" },
    { label: "Search KB", detail: "Find documents" },
    { label: "Open Repo", detail: "View outputs" }
  ];

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
      <h2 id="chat-title" className="visually-hidden">{project.name} chat</h2>
      <p className="chat-scope-notice" role="note">I can only access data within this project: knowledge base, repository, and approved project metadata.</p>
      {providerNotice(provider, requestId)}
      <section className="message-list" aria-label={`${project.name} messages`}>
        {messages.length === 0 && busy ? <LoadingSkeleton label="Sending the first project-scoped message..." lines={4} /> : null}
        {messages.length === 0 && !busy ? (
          <div className="empty-state empty-state-with-action">
            <p>Ask about this project, its knowledge base, repository outputs, or equipment summaries.</p>
            <Button type="button" variant="secondary" size="sm" onClick={onLoadDemo}>Load demo conversation</Button>
          </div>
        ) : null}
        {messages.map((message) => (
          <article className={`message message-${message.role}`} key={message.id} aria-label={`${message.role === "assistant" ? "Assistant" : "You"} message`}>
            <div className="message-avatar" aria-hidden="true">{message.role === "assistant" ? "BA" : "You"}</div>
              <div className="message-content">
              <span className="message-author">
                <span className="visually-hidden">{message.role === "assistant" ? "Assistant" : "You"}</span>
                <span aria-hidden="true">{message.role === "assistant" ? "BuildingAgent" : message.userId}</span>
              </span>
              {message.role === "assistant" ? <Markdown source={message.content} /> : <p>{message.content}</p>}
              {message.images && message.images.length > 0 ? <ChatImageGallery images={message.images} messageId={message.id} /> : null}
            </div>
          </article>
        ))}
      </section>
      <form className="composer" onSubmit={handleSubmit}>
        <ul className="composer-quick-actions" aria-label="Quick actions (placeholder)">
          {quickActions.map((action) => (
            <li key={action.label}>
              <button type="button" className="composer-quick-action" disabled aria-disabled="true" title="Quick action placeholder">
                <span>{action.label}</span>
                <small>{action.detail}</small>
              </button>
            </li>
          ))}
        </ul>
        <div className="composer-box">
          <label className="visually-hidden" htmlFor="chat-message">Message</label>
          <textarea id="chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={!canWrite || busy} placeholder={canWrite ? "Ask about this project, its knowledge base, or repository files..." : "This project is read-only for your account."} />
          <div className="composer-actions">
            <div className="composer-tools" aria-hidden="true">
              <span>Attach</span>
              <span>Tools</span>
            </div>
            <button type="submit" disabled={!canWrite || busy || !draft.trim()} aria-busy={busy}>{busy ? "Sending..." : "Send message"}</button>
          </div>
        </div>
        {!canWrite ? <p className="field-error composer-readonly" role="status">This project does not grant chat write permission.</p> : null}
      </form>
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

function WorkspaceSidebarBlock({
  project,
  projects,
  user,
  kbCount,
  repoCount,
  onSwitchProject,
  onSignOut,
  onNewChat,
  onOpenKnowledgeBase,
  onOpenRepository
}: {
  project: ProjectSummary;
  projects: ProjectSummary[];
  user: UserSummary | null;
  kbCount: number;
  repoCount: number;
  onSwitchProject: () => void;
  onSignOut: () => void;
  onNewChat: () => void;
  onOpenKnowledgeBase: () => void;
  onOpenRepository: () => void;
}) {
  const otherProjects = projects.filter((candidate) => candidate.id !== project.id).slice(0, 5);
  const conversationStubs: Array<{ id: string; title: string }> = [
    { id: "stub-1", title: "Chiller runtime summary" },
    { id: "stub-2", title: "Readings anomaly check" },
    { id: "stub-3", title: "Energy baseline analysis" },
    { id: "stub-4", title: "Life safety review status" },
    { id: "stub-5", title: "Weekly report draft" }
  ];

  return (
    <div className="workspace-sidebar-block">
      <div className="workspace-sidebar-brand">
        <span className="brand-mark" aria-hidden="true">BA</span>
        <span className="brand-name">BuildingAgent</span>
      </div>
      <button type="button" className="workspace-sidebar-project-switcher" onClick={onSwitchProject}>
        <span>
          <span className="workspace-sidebar-project-icon" aria-hidden="true">BA</span>
          <span>{project.name} workspace</span>
        </span>
        <span aria-hidden="true">v</span>
      </button>
      <button type="button" onClick={onNewChat} className="workspace-sidebar-new-chat">
        <span aria-hidden="true">+</span>
        <span>New chat</span>
      </button>
      <div className="workspace-sidebar-section">
        <p className="workspace-sidebar-eyebrow">Recent conversations</p>
        <ul className="workspace-sidebar-history" aria-label="Recent conversations (placeholder)">
          {conversationStubs.map((stub, index) => (
            <li key={stub.id}>
              <button type="button" className={`workspace-sidebar-history-item${index === 0 ? " is-active" : ""}`} disabled aria-disabled="true" title="Conversation history placeholder">
                {stub.title}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="workspace-sidebar-section">
        <p className="workspace-sidebar-eyebrow">Project assets</p>
        <ul className="workspace-sidebar-shortcuts">
          <li>
            <button type="button" className="workspace-sidebar-shortcut" onClick={onOpenKnowledgeBase}>
              <span>
                <strong>Knowledge Base</strong>
                <small>PDFs, manuals, reports, drawings</small>
              </span>
              <small>{kbCount} files</small>
            </button>
          </li>
          <li>
            <button type="button" className="workspace-sidebar-shortcut" onClick={onOpenRepository}>
              <span>
                <strong>Repository</strong>
                <small>Images, daily and weekly reports</small>
              </span>
              <small>{repoCount} items</small>
            </button>
          </li>
        </ul>
      </div>
      {otherProjects.length > 0 ? (
        <button type="button" className="workspace-sidebar-switch" onClick={onSwitchProject}>
          Switch project
        </button>
      ) : null}
      <div className="workspace-sidebar-account" aria-label="Account">
        <div className="workspace-sidebar-account-row">
          <Avatar name={user?.name ?? "Local user"} size="md" />
          <div className="workspace-sidebar-account-info">
            <strong>{user?.name ?? "Local user"}</strong>
            <span>{user?.id ?? "local-user"}</span>
          </div>
        </div>
        <details className="workspace-sidebar-account-menu">
          <summary aria-label="Account menu">Account menu</summary>
          <ul>
            <li><button type="button" disabled aria-disabled="true">LLM API key</button></li>
            <li><button type="button" disabled aria-disabled="true">Base URL</button></li>
            <li><button type="button" disabled aria-disabled="true">Model</button></li>
            <li><button type="button" disabled aria-disabled="true">Settings</button></li>
            <li><button type="button" onClick={onSignOut}>Switch account</button></li>
          </ul>
        </details>
      </div>
    </div>
  );
}

function WorkspaceRightPanel({ registry, management }: { registry: RegistryResponse | null; management: ProjectManagementResponse | null }) {
  const skillCount = registry?.skills.length ?? 0;
  const toolCount = management?.tools.length ?? registry?.tools.length ?? 0;
  return (
    <div className="workspace-right-block">
      <details className="workspace-right-section" open>
        <summary>
          <span>Scheduled &amp; rule-based tasks</span>
          <span className="right-section-meta">3</span>
        </summary>
        <ScheduledTasks />
      </details>
      <details className="workspace-right-section" open>
        <summary>
          <span>Skills</span>
          <span className="right-section-meta">{skillCount}</span>
        </summary>
        <Skills />
      </details>
      <details className="workspace-right-section" open>
        <summary>
          <span>Tools</span>
          <span className="right-section-meta">{toolCount}</span>
        </summary>
        <Tools />
      </details>
    </div>
  );
}

function Workspace({
  project,
  projects,
  user,
  messages,
  providerDiagnostics,
  providerRequestId,
  registry,
  management,
  activeTab,
  onTabChange,
  onSend,
  onLoadDemo,
  onSwitchProject,
  onSignOut,
  busy
}: {
  project: ProjectSummary;
  projects: ProjectSummary[];
  user: UserSummary | null;
  messages: ChatMessage[];
  providerDiagnostics: ChatProviderDiagnostics | null;
  providerRequestId: string | undefined;
  registry: RegistryResponse | null;
  management: ProjectManagementResponse | null;
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  onSend: (message: string) => Promise<void>;
  onLoadDemo: () => void;
  onSwitchProject: () => void;
  onSignOut: () => void;
  busy: boolean;
}) {
  const tabs: Array<{ id: WorkspaceTab; label: string }> = [
    { id: "chat", label: "Chat" },
    { id: "kb", label: "Knowledge Base" },
    { id: "repo", label: "Repository" },
    { id: "registry", label: "Platform Registry" },
    { id: "gateways", label: "Gateways" },
    { id: "building", label: "Building Domain" }
  ];

  const kbDocuments = useMemo(() => buildMockKnowledgeBaseDocuments(project.id), [project.id]);
  const repoItems = useMemo(() => buildMockRepositoryItems(project.id), [project.id]);

  const center = (
    <div className="workspace-center-block" aria-labelledby="workspace-title">
      <div className="workspace-heading">
        <div className="workspace-heading-title">
          <button type="button" className="workspace-panel-toggle" aria-label="Project sidebar">
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>
          <div>
            <h1 id="workspace-title">{project.name} workspace</h1>
            <p>Project id: <strong>{project.id}</strong></p>
          </div>
        </div>
        <div className="workspace-heading-actions">
          <span className="workspace-scope-label">
            <span className="visually-hidden">Inspection surfaces are placeholder-only</span>
            <span aria-hidden="true">Project data only</span>
          </span>
          <button type="button" className="workspace-icon-button" aria-label="Workspace information">i</button>
          <button type="button" className="workspace-panel-toggle workspace-panel-toggle-right" aria-label="Workspace details">
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>
        </div>
      </div>
      <nav className="workspace-tabs" aria-label="Workspace panels">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" className={activeTab === tab.id ? "tab-active secondary" : "secondary"} aria-pressed={activeTab === tab.id} onClick={() => onTabChange(tab.id)}>
            {tab.label}
          </button>
        ))}
      </nav>
      {activeTab === "chat" ? <ChatWorkspace project={project} messages={messages} onSend={onSend} onLoadDemo={onLoadDemo} busy={busy} provider={providerDiagnostics} requestId={providerRequestId} /> : null}
      {activeTab === "kb" ? <KnowledgeBase projectId={project.id} projectName={project.name} documents={kbDocuments} /> : null}
      {activeTab === "repo" ? <Repository projectId={project.id} projectName={project.name} items={repoItems} /> : null}
      {activeTab === "registry" ? <RegistryPanel registry={registry} /> : null}
      {activeTab === "gateways" ? <GatewayPanel registry={registry} management={management} /> : null}
      {activeTab === "building" ? <BuildingDomainPanel registry={registry} management={management} /> : null}
    </div>
  );

  return (
    <div className="workspace-card workspace-management cgpt-workspace">
      <WorkspaceShell
        leftLabel="Project sidebar"
        centerLabel="Workspace content"
        rightLabel="Workspace details"
        left={
          <WorkspaceSidebarBlock
            project={project}
            projects={projects}
            user={user}
            kbCount={kbDocuments.length}
            repoCount={repoItems.length}
            onSwitchProject={onSwitchProject}
            onSignOut={onSignOut}
            onNewChat={() => onTabChange("chat")}
            onOpenKnowledgeBase={() => onTabChange("kb")}
            onOpenRepository={() => onTabChange("repo")}
          />
        }
        center={center}
        right={<WorkspaceRightPanel registry={registry} management={management} />} className="cgpt-workspace-shell"
      />
    </div>
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
  const hadSavedSession = useMemo(() => Boolean(initial.token), [initial.token]);

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
  const shellVariant = "workspace";

  return (
    <AppShell authenticated={authenticated} onSignOut={() => clearAuth()} variant={shellVariant}>
      {banner ? <Banner {...banner} onDismiss={() => setBanner(null)} /> : null}
      {bootstrapping ? (hadSavedSession ? <BootstrapLoading /> : <ProjectScreenSkeleton />) : null}
      {!bootstrapping && !authenticated ? <LoginScreen onLogin={handleLogin} busy={busy} /> : null}
      {!bootstrapping && authenticated && !selectedProject ? <ProjectScreen projects={projects} onSelect={handleProjectSelect} onSignOut={() => clearAuth()} busy={busy} /> : null}
      {!bootstrapping && authenticated && selectedProject ? <Workspace project={selectedProject} projects={projects} user={user} messages={messages} providerDiagnostics={chatProviderDiagnostics} providerRequestId={chatProviderRequestId} registry={registry} management={management} activeTab={activeTab} onTabChange={setActiveTab} onSend={handleSend} onLoadDemo={() => setMessages(buildDemoConversation(selectedProject.id, user?.id ?? "user_demo"))} onSwitchProject={() => setSelectedProject(null)} onSignOut={() => clearAuth()} busy={busy} /> : null}
      {session ? <footer className="diagnostic-footer">Session project: {session.projectId ?? "none selected"}</footer> : null}
    </AppShell>
  );
}
