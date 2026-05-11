import { FormEvent, type SVGProps, useEffect, useMemo, useState } from "react";
import { AppShell, Avatar, Badge, Banner, Button, Card, EmptyState, Input, MockOnlyBadge, Surface, type BannerProps } from "./ui/primitives";
import { WorkspaceShell } from "./ui/WorkspaceShell";
import { Markdown } from "./ui/Markdown";
import { ChatImageGallery } from "./ui/ChatImageGallery";
import { KnowledgeBase, type KnowledgeBaseDocument } from "./ui/KnowledgeBase";
import { Repository, type RepositoryItem } from "./ui/Repository";
import { ScheduledTasks } from "./ui/ScheduledTasks";
import { Skills } from "./ui/Skills";
import { Tools } from "./ui/Tools";
import { CubeLogo } from "./ui/CubeLogo";
import { ParticleField } from "./ui/ParticleField";
import {
  ApiClientError,
  getChat,
  getKnowledgeBase,
  getProjectManagement,
  getRepository,
  getRegistry,
  getSession,
  listProjects,
  login,
  resetChat,
  selectProject,
  sendChatMessage,
  type ChatProviderDiagnostics,
  type BuildingCapabilitySummary,
  type ChatMessage,
  type GatewaySummary,
  type KnowledgeBaseDocument as ApiKnowledgeBaseDocument,
  type ProjectManagementResponse,
  type ProjectSummary,
  type RepositoryArtifact,
  type RegistryResponse,
  type RuntimeProviderSummary,
  type SessionSummary,
  type SkillSummary,
  type ToolSummary,
  type UserSummary
} from "./api";

const STORAGE_KEY = "building-agent.session.v1";
type WorkspaceTab = "chat" | "kb" | "repo" | "registry" | "gateways" | "building";
type IconName =
  | "activity"
  | "arrow-up"
  | "bar-chart"
  | "book-open"
  | "building"
  | "check-check"
  | "chevron-down"
  | "clock"
  | "copy"
  | "cpu"
  | "file-chart"
  | "file-text"
  | "folder"
  | "folder-open"
  | "grid"
  | "info"
  | "key"
  | "link"
  | "lock"
  | "message"
  | "more"
  | "panel-left"
  | "panel-right"
  | "paperclip"
  | "plus"
  | "puzzle"
  | "rotate"
  | "search"
  | "search-code"
  | "settings"
  | "shield"
  | "shield-check"
  | "snowflake"
  | "table"
  | "thermometer"
  | "thumbs-down"
  | "thumbs-up"
  | "upload"
  | "wrench"
  | "zap"
  | "x";

interface StoredSession {
  token: string;
  user: UserSummary | null;
  projectId: string | null;
}

type BannerState = BannerProps;

interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
}

function conversationTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((message) => message.role === "user")?.content;
  return firstUser ? firstUser.replace(/\s+/gu, " ").trim().slice(0, 42) : "Current workspace chat";
}

function apiDocumentToUi(document: ApiKnowledgeBaseDocument) {
  return {
    id: document.id,
    name: document.name,
    kind: document.kind,
    uploadedAt: "local",
    sizeBytes: document.sizeBytes,
    uploaderName: "Knowledge Base",
    path: document.path,
    excerpt: document.excerpt
  };
}

function artifactToRepositoryItem(artifact: RepositoryArtifact): RepositoryItem {
  return {
    id: artifact.id,
    name: artifact.name,
    kind: artifact.kind,
    generatedAt: artifact.generatedAt,
    sourceTaskId: artifact.sourceMessageId,
    description: artifact.description,
    content: artifact.content
  };
}

function Icon({ name, className = "", ...props }: { name: IconName; className?: string } & SVGProps<SVGSVGElement>) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2,
    viewBox: "0 0 24 24",
    className: `workspace-icon ${className}`.trim(),
    "aria-hidden": true,
    ...props
  };
  const paths: Record<IconName, JSX.Element> = {
    activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
    "arrow-up": <><path d="m12 19 0-14" /><path d="m5 12 7-7 7 7" /></>,
    "bar-chart": <><path d="M3 3v18h18" /><path d="M7 16v-5" /><path d="M12 16V7" /><path d="M17 16v-8" /></>,
    "book-open": <><path d="M12 7v14" /><path d="M3 5a5 5 0 0 1 5-1l4 2v15l-4-2a5 5 0 0 0-5 1z" /><path d="M21 5a5 5 0 0 0-5-1l-4 2v15l4-2a5 5 0 0 1 5 1z" /></>,
    building: <><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18" /><path d="M6 12H4a2 2 0 0 0-2 2v8" /><path d="M18 9h2a2 2 0 0 1 2 2v11" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" /></>,
    "check-check": <><path d="m3 12 4 4L17 6" /><path d="m14 14 1.5 1.5L21 10" /></>,
    "chevron-down": <path d="m6 9 6 6 6-6" />,
    clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
    copy: <><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></>,
    cpu: <><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M9 1v3" /><path d="M15 1v3" /><path d="M9 20v3" /><path d="M15 20v3" /><path d="M20 9h3" /><path d="M20 14h3" /><path d="M1 9h3" /><path d="M1 14h3" /></>,
    "file-chart": <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 18v-3" /><path d="M12 18v-6" /><path d="M16 18v-4" /></>,
    "file-text": <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8" /><path d="M8 17h6" /></>,
    folder: <><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" /></>,
    "folder-open": <><path d="m6 14 1.5-3h12.8a1.7 1.7 0 0 1 1.6 2.2l-1.8 5.4A2 2 0 0 1 18.2 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v3" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>,
    info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>,
    key: <><circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.6 9.6" /><path d="m15 7 2 2" /><path d="m18 4 2 2" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" /></>,
    lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
    message: <><path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /></>,
    more: <><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></>,
    "panel-left": <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
    "panel-right": <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></>,
    paperclip: <path d="m21.4 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 1 1-2.8-2.8l8.5-8.5" />,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    puzzle: <><path d="M19 13.5V19a2 2 0 0 1-2 2h-4v-2.5a2 2 0 0 0-4 0V21H5a2 2 0 0 1-2-2v-4h2.5a2 2 0 0 0 0-4H3V7a2 2 0 0 1 2-2h5.5V3.5a2 2 0 0 1 4 0V5H17a2 2 0 0 1 2 2v2.5h1.5a2 2 0 0 1 0 4z" /></>,
    rotate: <><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></>,
    search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
    "search-code": <><path d="m21 21-4.3-4.3" /><circle cx="11" cy="11" r="8" /><path d="m10 8-3 3 3 3" /><path d="m12 14 3-3-3-3" /></>,
    settings: <><path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5z" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.3 7A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z" /></>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
    "shield-check": <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>,
    snowflake: <><path d="M12 2v20" /><path d="m17 5-10 14" /><path d="m7 5 10 14" /><path d="M2 12h20" /></>,
    table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M9 4v16" /></>,
    thermometer: <><path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z" /></>,
    "thumbs-down": <><path d="M17 14V2" /><path d="M9 18.1 10 14H4.2a2 2 0 0 1-1.9-2.6l2.2-7A2 2 0 0 1 6.4 3H20v11h-4.3a2 2 0 0 0-1.7 1l-3 5a2 2 0 0 1-3.7-1.5z" /></>,
    "thumbs-up": <><path d="M7 10v12" /><path d="M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.2 7a2 2 0 0 1-1.9 1.4H4V10h4.3a2 2 0 0 0 1.7-1l3-5a2 2 0 0 1 3.7 1.5z" /></>,
    upload: <><path d="M16 16l-4-4-4 4" /><path d="M12 12v9" /><path d="M20.4 18.5A5 5 0 0 0 18 9h-1.3A8 8 0 1 0 4 16.3" /></>,
    wrench: <><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-2.6z" /></>,
    x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
    zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  };
  return <svg {...common}>{paths[name]}</svg>;
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

function ChatWorkspace({ project, messages, onSend, busy, provider, requestId }: { project: ProjectSummary; messages: ChatMessage[]; onSend: (message: string) => Promise<void>; busy: boolean; provider: ChatProviderDiagnostics | null; requestId?: string | undefined }) {
  const [draft, setDraft] = useState("");
  const canWrite = project.permissions.includes("chat:write");
  const quickActions = [
    { label: "Upload PDF", detail: "Add to knowledge base", icon: "upload" as IconName },
    { label: "Search Knowledge Base", detail: "Find documents & insights", icon: "search" as IconName },
    { label: "Open Repository", detail: "View generated outputs", icon: "folder" as IconName },
    { label: "Analyze Energy Baseline", detail: "Compare & identify issues", icon: "bar-chart" as IconName }
  ];
  const hasMessages = messages.length > 0;

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
    <section className={`chat-shell${hasMessages ? " chat-shell-active" : " chat-shell-empty"}`} aria-labelledby="chat-title">
      <h2 id="chat-title" className="visually-hidden">{project.name} chat</h2>
      {providerNotice(provider, requestId)}
      <section className="message-list" aria-label={`${project.name} messages`}>
        {messages.length === 0 && busy ? <div className="workspace-inline-status" role="status">Sending...</div> : null}
        {messages.map((message) => (
          <article className={`message message-${message.role}${message.id.startsWith("pending_assistant_") ? " message-thinking" : ""}`} key={message.id} aria-label={`${message.role === "assistant" ? "Assistant" : "You"} message`}>
            <div className="message-content">
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
                <Icon name={action.icon} />
                <span>
                  <strong>{action.label}</strong>
                  <small>{action.detail}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="composer-box">
          <label className="visually-hidden" htmlFor="chat-message">Message</label>
          <textarea id="chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={!canWrite || busy} placeholder={canWrite ? "Ask about this project, its knowledge base, or repository files..." : "This project is read-only for your account."} />
          <div className="composer-actions">
            <div className="composer-tools">
              <button type="button" disabled aria-disabled="true" title="Attach file"><Icon name="paperclip" /></button>
              <button type="button" disabled aria-disabled="true" title="Tools"><Icon name="grid" /></button>
            </div>
            <button type="submit" disabled={!canWrite || busy || !draft.trim()} aria-busy={busy} aria-label={busy ? "Sending message" : "Send message"}>
              {busy ? <span className="button-spinner" aria-hidden="true" /> : <Icon name="arrow-up" />}
            </button>
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
  conversations,
  activeConversationId,
  busy,
  onSwitchProject,
  onSelectProject,
  onSignOut,
  onNewChat,
  onOpenKnowledgeBase,
  onOpenRepository
}: {
  project: ProjectSummary | null;
  projects: ProjectSummary[];
  user: UserSummary | null;
  kbCount: number;
  repoCount: number;
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  busy: boolean;
  onSwitchProject: () => void;
  onSelectProject: (project: ProjectSummary) => void;
  onSignOut: () => void;
  onNewChat: () => void;
  onOpenKnowledgeBase: () => void;
  onOpenRepository: () => void;
}) {
  const activeProjectName = project?.name ?? "No project";
  const history = conversations.length > 0 ? conversations : [{ id: "empty", title: "No conversations yet", messageCount: 0 }];

  return (
    <div className="workspace-sidebar-block">
      <div className="workspace-sidebar-brand">
        <span className="brand-mark" aria-hidden="true">BA</span>
        <span className="brand-name">BuildingAgent</span>
      </div>
      <details className="workspace-project-menu">
        <summary className="workspace-sidebar-project-switcher">
          <span>
            <Icon name="building" />
            <span>{activeProjectName} workspace</span>
          </span>
          <Icon name="chevron-down" />
        </summary>
        <ul>
          {projects.length === 0 ? <li><span className="workspace-project-menu-empty">No authorized projects</span></li> : null}
          {projects.map((candidate) => (
            <li key={candidate.id}>
              <button type="button" disabled={candidate.id === project?.id || busy} onClick={candidate.id === project?.id ? undefined : () => onSelectProject(candidate)}>
                {candidate.name}
              </button>
            </li>
          ))}
        </ul>
      </details>
      <button type="button" onClick={onNewChat} className="workspace-sidebar-new-chat">
        <Icon name="plus" />
        <span>New chat</span>
      </button>
      <div className="workspace-sidebar-section">
        <p className="workspace-sidebar-eyebrow">Recent conversations</p>
        <ul className="workspace-sidebar-history" aria-label="Recent conversations">
          {history.map((conversation) => (
            <li key={conversation.id}>
              <button type="button" className={`workspace-sidebar-history-item${conversation.id === activeConversationId ? " is-active" : ""}`} disabled={conversation.id === "empty"} aria-disabled={conversation.id === "empty"}>
                <span><Icon name="message" />{conversation.title}</span>
                {conversation.messageCount > 0 ? <small>{conversation.messageCount}</small> : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="workspace-sidebar-section workspace-sidebar-assets">
        <ul className="workspace-sidebar-shortcuts">
          <li>
            <button type="button" className="workspace-sidebar-shortcut" onClick={onOpenKnowledgeBase}>
              <span className="workspace-sidebar-shortcut-icon is-blue"><Icon name="book-open" /></span>
              <span>
                <strong>Knowledge Base</strong>
                <small>PDFs, manuals, reports, drawings</small>
              </span>
              <small>{kbCount} files</small>
            </button>
          </li>
          <li>
            <button type="button" className="workspace-sidebar-shortcut" onClick={onOpenRepository}>
              <span className="workspace-sidebar-shortcut-icon is-purple"><Icon name="folder-open" /></span>
              <span>
                <strong>Repository</strong>
                <small>Images, daily/weekly/monthly reports</small>
              </span>
              <small>{repoCount} items</small>
            </button>
          </li>
        </ul>
      </div>
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
            <li><button type="button" disabled aria-disabled="true"><Icon name="key" />LLM API key</button></li>
            <li><button type="button" disabled aria-disabled="true"><Icon name="link" />Base URL</button></li>
            <li><button type="button" disabled aria-disabled="true"><Icon name="cpu" />Model</button></li>
            <li><button type="button" disabled aria-disabled="true"><Icon name="settings" />Settings</button></li>
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
          <span><Icon name="clock" />Scheduled &amp; rule-based tasks</span>
          <span className="right-section-meta">3</span>
        </summary>
        <ScheduledTasks />
      </details>
      <details className="workspace-right-section" open>
        <summary>
          <span><Icon name="puzzle" />Skills</span>
          <span className="right-section-meta">{skillCount}</span>
        </summary>
        <Skills />
      </details>
      <details className="workspace-right-section" open>
        <summary>
          <span><Icon name="wrench" />Tools</span>
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
  kbDocuments,
  repoItems,
  providerDiagnostics,
  providerRequestId,
  registry,
  management,
  activeTab,
  onTabChange,
  onSend,
  onResetChat,
  onSwitchProject,
  onSelectProject,
  onCreateProject,
  onSignOut,
  busy
}: {
  project: ProjectSummary | null;
  projects: ProjectSummary[];
  user: UserSummary | null;
  messages: ChatMessage[];
  kbDocuments: KnowledgeBaseDocument[];
  repoItems: RepositoryItem[];
  providerDiagnostics: ChatProviderDiagnostics | null;
  providerRequestId: string | undefined;
  registry: RegistryResponse | null;
  management: ProjectManagementResponse | null;
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  onSend: (message: string) => Promise<void>;
  onResetChat: () => Promise<void>;
  onSwitchProject: () => void;
  onSelectProject: (project: ProjectSummary) => void;
  onCreateProject: () => void;
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

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const conversations = useMemo<ConversationSummary[]>(() => (
    project && messages.length > 0
      ? [{ id: `${project.id}-current`, title: conversationTitle(messages), messageCount: messages.length }]
      : []
  ), [messages, project]);
  const activeConversationId = conversations[0]?.id ?? null;

  const noProjectCenter = (
    <div className="workspace-center-block workspace-center-empty" aria-labelledby="workspace-title">
      <div className="workspace-floating-toggles">
        <button type="button" className="workspace-icon-button" onClick={() => setLeftOpen((open) => !open)} aria-label={leftOpen ? "Collapse project sidebar" : "Expand project sidebar"}>
          <Icon name="panel-left" />
        </button>
        <button type="button" className="workspace-icon-button" onClick={() => setRightOpen((open) => !open)} aria-label={rightOpen ? "Collapse workspace details" : "Expand workspace details"}>
          <Icon name="panel-right" />
        </button>
      </div>
      <section className="new-project-state">
        <div className="brand-mark" aria-hidden="true">BA</div>
        <h1 id="workspace-title">BuildingAgent workspace</h1>
        <p>Create a project to unlock project-scoped chat, knowledge base search, and repository outputs.</p>
        <button type="button" className="workspace-primary-action" onClick={onCreateProject} disabled={busy || projects.length === 0}>
          <Icon name="plus" />
          <span>{busy ? "Creating project..." : "New project"}</span>
        </button>
        {projects.length === 0 ? <p className="workspace-inline-status" role="status">No authorized projects are available for this account.</p> : null}
      </section>
    </div>
  );

  const center = (
    <div className="workspace-center-block" aria-labelledby="workspace-title">
      <div className="workspace-floating-toggles">
        <button type="button" className="workspace-icon-button" onClick={() => setLeftOpen((open) => !open)} aria-label={leftOpen ? "Collapse project sidebar" : "Expand project sidebar"}>
          <Icon name="panel-left" />
        </button>
        <button type="button" className="workspace-icon-button" onClick={() => setRightOpen((open) => !open)} aria-label={rightOpen ? "Collapse workspace details" : "Expand workspace details"}>
          <Icon name="panel-right" />
        </button>
      </div>
      {project ? <h1 id="workspace-title" className="visually-hidden">{project.name} workspace</h1> : null}
      {activeTab === "chat" && project ? <ChatWorkspace project={project} messages={messages} onSend={onSend} busy={busy} provider={providerDiagnostics} requestId={providerRequestId} /> : null}
      {activeTab === "kb" && project ? <KnowledgeBase projectId={project.id} projectName={project.name} documents={kbDocuments} /> : null}
      {activeTab === "repo" && project ? <Repository projectId={project.id} projectName={project.name} items={repoItems} /> : null}
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
        left={leftOpen ? (
          <WorkspaceSidebarBlock
            project={project}
            projects={projects}
            user={user}
            kbCount={kbDocuments.length}
            repoCount={repoItems.length}
            conversations={conversations}
            activeConversationId={activeConversationId}
            busy={busy}
            onSwitchProject={onSwitchProject}
            onSelectProject={onSelectProject}
            onSignOut={onSignOut}
            onNewChat={() => { void onResetChat(); }}
            onOpenKnowledgeBase={() => onTabChange("kb")}
            onOpenRepository={() => onTabChange("repo")}
          />
        ) : null}
        center={project ? center : noProjectCenter}
        right={rightOpen ? <WorkspaceRightPanel registry={registry} management={management} /> : null} className={`cgpt-workspace-shell${leftOpen ? "" : " is-left-collapsed"}${rightOpen ? "" : " is-right-collapsed"}`}
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
  const [knowledgeBaseDocuments, setKnowledgeBaseDocuments] = useState<KnowledgeBaseDocument[]>([]);
  const [repositoryItems, setRepositoryItems] = useState<RepositoryItem[]>([]);
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
    setKnowledgeBaseDocuments([]);
    setRepositoryItems([]);
    setChatProviderDiagnostics(null);
    setChatProviderRequestId(undefined);
    setRegistry(null);
    setManagement(null);
    setActiveTab("chat");
    storeSession({ token: "", user: null, projectId: null });
    setBanner(nextBanner ?? { tone: "info", title: "Signed out", message: "Sign in again to continue." });
  }

  async function loadManagementSurfaces(currentToken: string, projectId: string) {
    const [registryResponse, managementResponse] = await Promise.all([
      getRegistry(currentToken),
      getProjectManagement(currentToken, projectId)
    ]);
    const [kbResponse, repoResponse] = await Promise.all([
      getKnowledgeBase(currentToken, projectId).catch(() => ({ documents: [], requestId: "" })),
      getRepository(currentToken, projectId).catch(() => ({ artifacts: [], requestId: "" }))
    ]);
    setRegistry(registryResponse);
    setManagement(managementResponse);
    setKnowledgeBaseDocuments(kbResponse.documents.map(apiDocumentToUi));
    setRepositoryItems(repoResponse.artifacts.map(artifactToRepositoryItem));
    return { registryResponse, managementResponse, kbResponse, repoResponse };
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
          const [kbResponse, repoResponse] = await Promise.all([
            getKnowledgeBase(token, restoredProject.id).catch(() => ({ documents: [], requestId: "" })),
            getRepository(token, restoredProject.id).catch(() => ({ artifacts: [], requestId: "" }))
          ]);
          if (!cancelled) {
            setMessages(chatResponse.messages);
            setRegistry(registryResponse);
            setManagement(managementResponse);
            setKnowledgeBaseDocuments(kbResponse.documents.map(apiDocumentToUi));
            setRepositoryItems(repoResponse.artifacts.map(artifactToRepositoryItem));
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
      const [chat, surfaces] = await Promise.all([getChat(token, project.id), loadManagementSurfaces(token, project.id)]);
      setSession(selected.session);
      setSelectedProject(project);
      setMessages(chat.messages);
      setKnowledgeBaseDocuments(surfaces.kbResponse.documents.map(apiDocumentToUi));
      setRepositoryItems(surfaces.repoResponse.artifacts.map(artifactToRepositoryItem));
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

  function handleCreateProject() {
    const firstProject = projects[0];
    if (!firstProject) {
      setBanner({ tone: "error", title: "No project available", message: "This account does not have an authorized project yet.", code: "project_missing" });
      return;
    }
    void handleProjectSelect(firstProject);
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
    const optimisticUser: ChatMessage = {
      id: `pending_user_${Date.now()}`,
      projectId: selectedProject.id,
      userId: user?.id ?? "local-user",
      role: "user",
      content: message.trim()
    };
    const optimisticAssistant: ChatMessage = {
      id: `pending_assistant_${Date.now()}`,
      projectId: selectedProject.id,
      userId: user?.id ?? "local-user",
      role: "assistant",
      content: "Thinking with project memory and Knowledge Base context..."
    };
    setMessages((current) => [...current, optimisticUser, optimisticAssistant]);
    try {
      const posted = await sendChatMessage(token, selectedProject.id, message.trim());
      setMessages((current) => [
        ...current.filter((item) => item.id !== optimisticUser.id && item.id !== optimisticAssistant.id),
        posted.message,
        posted.assistantMessage
      ]);
      if (posted.artifact) {
        setRepositoryItems((current) => [artifactToRepositoryItem(posted.artifact!), ...current.filter((item) => item.id !== posted.artifact!.id)]);
      }
      setChatProviderDiagnostics(posted.provider);
      setChatProviderRequestId(posted.requestId);
      setBanner({ tone: "success", title: "Message sent", message: "The assistant response is ready with redaction-safe provider diagnostics.", requestId: posted.requestId });
    } catch (error) {
      setMessages((current) => current.filter((item) => item.id !== optimisticUser.id && item.id !== optimisticAssistant.id));
      if (isAuthFailure(error)) {
        clearAuth(errorBanner(error, "Session expired"));
      } else {
        setBanner(errorBanner(error, "Chat message failed"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleResetChat() {
    if (!token || !selectedProject) {
      setActiveTab("chat");
      setMessages([]);
      setRepositoryItems([]);
      setChatProviderDiagnostics(null);
      setChatProviderRequestId(undefined);
      return;
    }
    setBusy(true);
    try {
      const reset = await resetChat(token, selectedProject.id);
      setMessages([]);
      setChatProviderDiagnostics(null);
      setChatProviderRequestId(undefined);
      setActiveTab("chat");
      setBanner({
        tone: "success",
        title: "New chat started",
        message: `Cleared ${reset.clearedMessages} messages and ${reset.clearedMemories} memories for this project session.`,
        requestId: reset.requestId
      });
    } catch (error) {
      if (isAuthFailure(error)) {
        clearAuth(errorBanner(error, "Session expired"));
      } else {
        setBanner(errorBanner(error, "New chat failed"));
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
      {!bootstrapping && authenticated ? <Workspace project={selectedProject} projects={projects} user={user} messages={messages} kbDocuments={knowledgeBaseDocuments} repoItems={repositoryItems} providerDiagnostics={chatProviderDiagnostics} providerRequestId={chatProviderRequestId} registry={registry} management={management} activeTab={activeTab} onTabChange={setActiveTab} onSend={handleSend} onResetChat={handleResetChat} onSwitchProject={() => setSelectedProject(null)} onSelectProject={(project) => { void handleProjectSelect(project); }} onCreateProject={handleCreateProject} onSignOut={() => clearAuth()} busy={busy} /> : null}
      {session ? <footer className="diagnostic-footer">Session project: {session.projectId ?? "none selected"}</footer> : null}
    </AppShell>
  );
}
