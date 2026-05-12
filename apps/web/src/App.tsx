import { FormEvent, type CSSProperties, type SVGProps, useEffect, useMemo, useRef, useState } from "react";
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
  sendChatMessageStream,
  createProject,
  getConversations,
  selectConversation,
  deleteConversation,
  renameConversation,
  deleteProject,
  type ChatProviderDiagnostics,
  type ChatLifecycleEvent,
  type BuildingCapabilitySummary,
  type ChatMessage,
  type ConversationSummary,
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
type ProjectPickerView = "cards" | "list";

const PROJECT_COLOR_PRESETS = [
  { id: "mint", label: "Mint", bg: "#eefbf5", fg: "#13855f", border: "#9edec2" },
  { id: "sky", label: "Sky", bg: "#edf5ff", fg: "#2563eb", border: "#b9d5ff" },
  { id: "violet", label: "Violet", bg: "#f3efff", fg: "#7c3aed", border: "#d8c9ff" },
  { id: "amber", label: "Amber", bg: "#fff7e6", fg: "#b7791f", border: "#f2d39a" },
  { id: "slate", label: "Slate", bg: "#eef1f5", fg: "#334155", border: "#cbd5e1" }
] as const;

const PROJECT_LOGO_PRESETS = [
  { id: "building", label: "Building", icon: "building" },
  { id: "folder", label: "Folder", icon: "folder" },
  { id: "snowflake", label: "Cooling", icon: "snowflake" },
  { id: "activity", label: "Energy", icon: "activity" },
  { id: "shield", label: "Secure", icon: "shield-check" }
] as const satisfies ReadonlyArray<{ id: string; label: string; icon: IconName }>;

const PROJECT_FILTERS = ["All projects", "Active", "Paused"] as const;
type ProjectColorId = (typeof PROJECT_COLOR_PRESETS)[number]["id"];
type ProjectLogoId = (typeof PROJECT_LOGO_PRESETS)[number]["id"];
const DEFAULT_PROJECT_COLOR = PROJECT_COLOR_PRESETS[0];
const DEFAULT_PROJECT_LOGO = PROJECT_LOGO_PRESETS[0];

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
    more: <><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="2.5" fill="currentColor" stroke="none" /><circle cx="5" cy="12" r="2.5" fill="currentColor" stroke="none" /></>,
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
function projectHash(projectId: string): number {
  let hash = 0;
  for (let index = 0; index < projectId.length; index += 1) {
    hash = (hash * 31 + projectId.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function projectVisual(project: Pick<ProjectSummary, "id" | "name">) {
  const hash = projectHash(project.id);
  return {
    color: PROJECT_COLOR_PRESETS[hash % PROJECT_COLOR_PRESETS.length] ?? DEFAULT_PROJECT_COLOR,
    logo: PROJECT_LOGO_PRESETS[(hash >> 3) % PROJECT_LOGO_PRESETS.length] ?? DEFAULT_PROJECT_LOGO
  };
}

function projectMockMetrics(projectId: string): { status: "Active" | "Paused"; zone: string } {
  const hash = projectHash(projectId);
  const zoneNames = ["Cooling Plant", "Air Handler Units", "Chillers", "Demo Zone", "Envelope", "Energy Model"] as const;
  return {
    status: hash % 5 === 0 ? "Paused" : "Active",
    zone: zoneNames[hash % zoneNames.length] ?? zoneNames[0]
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

function ProjectMark({ project, colorId, logoId, className = "" }: { project?: Pick<ProjectSummary, "id" | "name">; colorId?: string; logoId?: string; className?: string }) {
  const visual = project ? projectVisual(project) : null;
  const color = PROJECT_COLOR_PRESETS.find((preset) => preset.id === colorId) ?? visual?.color ?? DEFAULT_PROJECT_COLOR;
  const logo = PROJECT_LOGO_PRESETS.find((preset) => preset.id === logoId) ?? visual?.logo ?? DEFAULT_PROJECT_LOGO;
  return (
    <span
      className={`project-picker-mark ${className}`.trim()}
      style={{ "--project-mark-bg": color.bg, "--project-mark-fg": color.fg, "--project-mark-border": color.border } as CSSProperties}
      aria-hidden="true"
    >
      <Icon name={logo.icon} />
    </span>
  );
}

function ProjectPickerCard({ project, conversationCount, assetCount, busy, onSelect }: { project: ProjectSummary; conversationCount: number; assetCount: number; busy: boolean; onSelect: (project: ProjectSummary) => void }) {
  const metrics = projectMockMetrics(project.id);
  const canChat = project.permissions.includes("chat:read");
  return (
    <article className="project-picker-card">
      <div className="project-picker-card-top">
        <div className="project-picker-card-identity">
          <ProjectMark project={project} />
          <div className="project-picker-title">
            <h2>{project.name}</h2>
            <p>{project.id}</p>
          </div>
        </div>
        <button type="button" className="project-picker-more" aria-label={`${project.name} actions`} disabled={busy}>
          <Icon name="more" />
        </button>
      </div>
      <dl className="project-picker-metrics" aria-label={`${project.name} project metrics`}>
        <div><dt><Icon name="message" />Conversations</dt><dd>{conversationCount}</dd></div>
        <div><dt><Icon name="folder" />Assets</dt><dd>{assetCount.toLocaleString()}</dd></div>
      </dl>
      <div className="project-picker-card-footer">
        <span className={`project-picker-status is-${metrics.status.toLowerCase()}`}>{metrics.status}</span>
        <span className="project-picker-zone">{metrics.zone}</span>
        <button type="button" className="project-picker-open" onClick={() => onSelect(project)} disabled={busy || !canChat}>
          Open <Icon name="arrow-up" />
        </button>
      </div>
    </article>
  );
}

function ProjectPickerListRow({ project, conversationCount, assetCount, busy, onSelect }: { project: ProjectSummary; conversationCount: number; assetCount: number; busy: boolean; onSelect: (project: ProjectSummary) => void }) {
  const metrics = projectMockMetrics(project.id);
  return (
    <button type="button" className="project-picker-list-row" onClick={() => onSelect(project)} disabled={busy}>
      <ProjectMark project={project} />
      <span className="project-picker-list-main">
        <strong>{project.name}</strong>
        <span>{project.id}</span>
      </span>
      <span className={`project-picker-status is-${metrics.status.toLowerCase()}`}>{metrics.status}</span>
      <span>{conversationCount} conversations</span>
      <span>{assetCount.toLocaleString()} assets</span>
      <Icon name="arrow-up" />
    </button>
  );
}

function NewProjectForm({ onCreate, busy, onCancel }: { onCreate: (name: string) => void; busy: boolean; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [colorId, setColorId] = useState<ProjectColorId>(DEFAULT_PROJECT_COLOR.id);
  const [logoId, setLogoId] = useState<ProjectLogoId>(DEFAULT_PROJECT_LOGO.id);
  const previewProject = { id: "project_preview", name: name.trim() || "New Project" };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    onCreate(name.trim());
    setName("");
    onCancel();
  }

  return (
    <form className="new-project-form" onSubmit={handleSubmit}>
      <div className="new-project-form-header">
        <ProjectMark project={previewProject} colorId={colorId} logoId={logoId} />
        <div>
          <h2>Create new project</h2>
          <p>Choose a title, color, and logo preset.</p>
        </div>
      </div>
      <label className="new-project-title">
        <span>Project title</span>
        <Input
          id="new-project-name"
          placeholder="Enter project name..."
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={busy}
        />
      </label>
      <fieldset className="new-project-preset-group">
        <legend>Color</legend>
        <div className="new-project-swatches">
          {PROJECT_COLOR_PRESETS.map((preset) => (
            <button key={preset.id} type="button" className={preset.id === colorId ? "is-selected" : ""} onClick={() => setColorId(preset.id)} style={{ "--swatch-bg": preset.bg, "--swatch-fg": preset.fg, "--swatch-border": preset.border } as CSSProperties} aria-label={preset.label}>
              <span />
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="new-project-preset-group">
        <legend>Logo</legend>
        <div className="new-project-logo-grid">
          {PROJECT_LOGO_PRESETS.map((preset) => (
            <button key={preset.id} type="button" className={preset.id === logoId ? "is-selected" : ""} onClick={() => setLogoId(preset.id)}>
              <Icon name={preset.icon} />
              <span>{preset.label}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="new-project-form-actions">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="submit" loading={busy} disabled={!name.trim() || busy}>Create project</Button>
      </div>
    </form>
  );
}

function ProjectPicker({
  projects,
  user,
  busy,
  onSelect,
  onCreate,
  onSignOut,
  conversationCounts,
  assetCounts,
  showChrome = true
}: {
  projects: ProjectSummary[];
  user: UserSummary | null;
  busy: boolean;
  onSelect: (project: ProjectSummary) => void;
  onCreate: (name: string) => void;
  onSignOut: () => void;
  conversationCounts?: Record<string, number>;
  assetCounts?: Record<string, number>;
  showChrome?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ProjectPickerView>("cards");
  const [filter, setFilter] = useState<(typeof PROJECT_FILTERS)[number]>("All projects");
  const [creating, setCreating] = useState(false);
  const [openingProjectId, setOpeningProjectId] = useState<string | null>(null);
  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return projects.filter((project) => {
      const metrics = projectMockMetrics(project.id);
      const matchesSearch = !normalized || project.name.toLowerCase().includes(normalized) || project.id.toLowerCase().includes(normalized);
      const matchesFilter = filter === "All projects" || metrics.status === filter;
      return matchesSearch && matchesFilter;
    });
  }, [projects, query, filter]);

  function handleSelectProject(project: ProjectSummary) {
    if (busy) return;
    setOpeningProjectId(project.id);
    window.setTimeout(() => onSelect(project), 120);
  }

  return (
    <section className={`project-picker${openingProjectId ? " is-opening" : ""}`} aria-labelledby="projects-title">
      {showChrome ? (
        <header className="project-picker-topbar">
          <div className="project-picker-brand"><span>BA</span><strong>BuildingAgent</strong></div>
          <div className="project-picker-top-actions">
            <button type="button" aria-label="Help"><Icon name="info" /></button>
            <button type="button" aria-label="Notifications"><Icon name="zap" /></button>
            <button type="button" className="project-picker-user" onClick={onSignOut} aria-label="Sign out">{user?.name?.slice(0, 2).toUpperCase() ?? "BA"}</button>
          </div>
        </header>
      ) : null}
      <div className="project-picker-body">
        <div className="project-picker-hero">
          <p>Welcome back, {user?.name?.split(" ")[0] ?? "there"}</p>
          <h1 id="projects-title">Choose a project to get started</h1>
          <span>Pick up where you left off or create a new project to unlock project-scoped chat, knowledge base search, and repository outputs.</span>
        </div>
        <div className="project-picker-toolbar">
          <label className="project-picker-search">
            <Icon name="search" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects by name or ID..." />
          </label>
          <label className="project-picker-filter">
            <Icon name="settings" />
            <select value={filter} onChange={(event) => setFilter(event.target.value as (typeof PROJECT_FILTERS)[number])}>
              {PROJECT_FILTERS.map((option) => <option key={option}>{option}</option>)}
            </select>
            <Icon name="chevron-down" />
          </label>
          <div className="project-picker-view-toggle" aria-label="Project view">
            <button type="button" className={view === "cards" ? "is-active" : ""} onClick={() => setView("cards")} aria-label="Card view"><Icon name="grid" /></button>
            <button type="button" className={view === "list" ? "is-active" : ""} onClick={() => setView("list")} aria-label="List view"><Icon name="table" /></button>
          </div>
        </div>
        {busy ? <p className="project-picker-status-line" role="status"><span className="spinner" aria-hidden="true" />Opening workspace...</p> : null}
        <div className={`project-picker-results is-${view}`}>
          {filteredProjects.map((project) => view === "cards" ? (
            <ProjectPickerCard key={project.id} project={project} conversationCount={conversationCounts?.[project.id] ?? 0} assetCount={assetCounts?.[project.id] ?? 0} busy={busy || Boolean(openingProjectId)} onSelect={handleSelectProject} />
          ) : (
            <ProjectPickerListRow key={project.id} project={project} conversationCount={conversationCounts?.[project.id] ?? 0} assetCount={assetCounts?.[project.id] ?? 0} busy={busy || Boolean(openingProjectId)} onSelect={handleSelectProject} />
          ))}
          {filteredProjects.length === 0 ? <p className="project-picker-empty">No projects match that search.</p> : null}
          {view === "cards" ? (
            <button type="button" className="project-picker-create-card" onClick={() => setCreating(true)}>
              <span><Icon name="plus" /></span>
              <strong>Create new project</strong>
              <small>Start fresh with a blank project and configure your workspace.</small>
            </button>
          ) : (
            <button type="button" className="project-picker-create-row" onClick={() => setCreating(true)}><Icon name="plus" />Create new project</button>
          )}
        </div>
      </div>
      {creating ? (
        <div className="new-project-backdrop" role="presentation">
          <NewProjectForm onCreate={onCreate} busy={busy} onCancel={() => setCreating(false)} />
        </div>
      ) : null}
    </section>
  );
}

function ProjectScreen({ projects, onSelect, onSignOut, onCreate, user, busy }: { projects: ProjectSummary[]; onSelect: (project: ProjectSummary) => Promise<void>; onSignOut: () => void; onCreate: (name: string) => void; user: UserSummary | null; busy: boolean }) {
  return (
    <main className="workspace-card project-screen minimal-project-shell" aria-labelledby="projects-title">
      <ProjectPicker projects={projects} user={user} busy={busy} onSelect={(project) => { void onSelect(project); }} onCreate={onCreate} onSignOut={onSignOut} />
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

interface ActiveTool {
  name: string;
  status: "running" | "done";
  args?: Record<string, unknown>;
  resultPreview?: string;
}

function ToolCallIndicator({ tool }: { tool: ActiveTool }) {
  return (
    <div className={`tool-call-indicator tool-${tool.status}`} aria-label={`Tool ${tool.name} ${tool.status}`}>
      <span className={`tool-indicator-icon${tool.status === "running" ? " tool-spinner" : ""}`}>
        {tool.status === "running" ? <Icon name="rotate" /> : <Icon name="check-check" />}
      </span>
      <span className="tool-indicator-name">{tool.name}</span>
      {tool.status === "running" ? <span className="tool-indicator-status">Running...</span> : null}
    </div>
  );
}

function ChatWorkspace({ project, user, messages, activeConversationId, onSend, busy, provider, requestId, activeTools, onStop }: { project: ProjectSummary; user: UserSummary | null; messages: ChatMessage[]; activeConversationId: string | null; onSend: (message: string) => Promise<void>; busy: boolean; provider: ChatProviderDiagnostics | null; requestId?: string | undefined; activeTools?: ActiveTool[]; onStop: () => void }) {
  const [draft, setDraft] = useState("");
  const [leavingEmptyState, setLeavingEmptyState] = useState(false);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const previousConversationRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const wasEmptyRef = useRef(messages.length === 0);
  const canWrite = project.permissions.includes("chat:write");
  const hasMessages = messages.length > 0;
  const latestMessage = messages[messages.length - 1];
  const latestMessageId = latestMessage?.id ?? "";
  const latestMessageKey = `${messages.length}:${latestMessageId}`;
  const emptyChatGreeting = `Hi ${user?.name ?? "there"}, how are you today?`;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const maxHeight = Math.floor(window.innerHeight / 3);
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, [draft]);

  useEffect(() => {
    if (wasEmptyRef.current && hasMessages) {
      setLeavingEmptyState(true);
      const timeout = window.setTimeout(() => setLeavingEmptyState(false), 220);
      wasEmptyRef.current = false;
      return () => window.clearTimeout(timeout);
    }
    wasEmptyRef.current = !hasMessages;
    if (!hasMessages) {
      setLeavingEmptyState(false);
    }
    return undefined;
  }, [hasMessages]);

  useEffect(() => {
    if (!hasMessages) {
      previousConversationRef.current = null;
      return;
    }

    const behavior: ScrollBehavior = previousConversationRef.current !== activeConversationId ? "auto" : "smooth";
    previousConversationRef.current = activeConversationId;
    requestAnimationFrame(() => {
      messageEndRef.current?.scrollIntoView({ block: "end", behavior });
    });
  }, [activeConversationId, hasMessages, latestMessageKey]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim() || busy) {
      return;
    }
    const message = draft.trim();
    setDraft("");
    await onSend(message);
  }

  return (
    <section className={`chat-shell${hasMessages ? " chat-shell-active" : " chat-shell-empty"}${leavingEmptyState ? " chat-shell-leaving-empty" : ""}`} aria-labelledby="chat-title">
      <h2 id="chat-title" className="visually-hidden">{project.name} chat</h2>
      {providerNotice(provider, requestId)}
      <section className="message-list" aria-label={`${project.name} messages`}>
        {messages.length === 0 && busy ? <div className="workspace-inline-status" role="status">Sending...</div> : null}
        {messages.map((message) => {
          const isStreaming = message.id.startsWith("streaming_");
          const isThinking = message.id.startsWith("pending_assistant_");
          return (
            <article className={`message message-${message.role}${isThinking ? " message-thinking" : ""}${isStreaming ? " message-streaming" : ""}`} key={message.id} aria-label={`${message.role === "assistant" ? "Assistant" : "You"} message`}>
              <div className="message-content">
                {message.role === "assistant" ? <Markdown source={message.content || (isStreaming ? "Thinking..." : "")} /> : <p>{message.content}</p>}
                {isStreaming && activeTools && activeTools.length > 0 ? (
                  <div className="tool-call-indicators" aria-label="Active tool calls">
                    {activeTools.map((tool) => (
                      <ToolCallIndicator key={tool.name} tool={tool} />
                    ))}
                  </div>
                ) : null}
                {message.images && message.images.length > 0 ? <ChatImageGallery images={message.images} messageId={message.id} /> : null}
              </div>
            </article>
          );
        })}
        <div className="message-list-end" ref={messageEndRef} aria-hidden="true" />
      </section>
      <form className="composer" onSubmit={handleSubmit}>
        {(!hasMessages || leavingEmptyState) ? <p className="composer-empty-greeting">{emptyChatGreeting}</p> : null}
        <div className="composer-box">
          <label className="visually-hidden" htmlFor="chat-message">Message</label>
          <textarea ref={textareaRef} id="chat-message" rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} disabled={!canWrite} placeholder={canWrite ? (hasMessages ? "Ask about this project, its knowledge base, or repository files..." : "Ask anything about building") : "This project is read-only for your account."} />
          <div className="composer-actions">
            {busy ? (
              <button type="button" className="composer-stop-button" onClick={onStop} title="Stop generating" aria-label="Stop generating">
                <Icon name="x" />
              </button>
            ) : (
              <button type="submit" disabled={!canWrite || !draft.trim()} aria-label="Send message">
                <Icon name="arrow-up" />
              </button>
            )}
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
  onSelectConversation,
  onSignOut,
  onNewChat,
  onOpenKnowledgeBase,
  onOpenRepository,
  onDeleteConversation,
  onRenameConversation,
  onDeleteProject
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
  onSelectConversation: (convId: string) => void;
  onSignOut: () => void;
  onNewChat: () => void;
  onOpenKnowledgeBase: () => void;
  onOpenRepository: () => void;
  onDeleteConversation: (convId: string) => void;
  onRenameConversation: (convId: string, title: string) => void;
  onDeleteProject: (projectId: string) => void;
}) {
  const activeProjectName = project?.name ?? "No project";
  const hasProject = Boolean(project);

  return (
    <div className="workspace-sidebar-block">
      <div className="workspace-sidebar-top">
        <div className="workspace-sidebar-brand">
          <span className="brand-mark" aria-hidden="true">BA</span>
          <span className="brand-name">BuildingAgent</span>
        </div>
        <details className="workspace-project-menu" open={!hasProject ? false : undefined}>
          <summary className={`workspace-sidebar-project-switcher${hasProject ? "" : " is-disabled"}`}>
            <span>
              <Icon name="building" />
              <span>{activeProjectName} workspace</span>
            </span>
            <Icon name="chevron-down" />
          </summary>
          {hasProject ? (
            <ul>
              {projects.length === 0 ? <li><span className="workspace-project-menu-empty">No authorized projects</span></li> : null}
              {projects.map((candidate) => (
                <li key={candidate.id}>
                  <button type="button" disabled={candidate.id === project?.id || busy} onClick={candidate.id === project?.id ? undefined : () => onSelectProject(candidate)}>
                    {candidate.name}
                  </button>
                </li>
              ))}
              {project ? (
                <li className="workspace-project-menu-divider">
                  <button type="button" className="workspace-project-menu-delete" disabled={busy} onClick={() => { if (window.confirm(`Delete project "${project.name}" and all its data?`)) onDeleteProject(project.id); }}>
                    Delete {project.name}
                  </button>
                </li>
              ) : null}
            </ul>
          ) : null}
        </details>
        <button type="button" onClick={onNewChat} className="workspace-sidebar-new-chat" disabled={!hasProject || busy}>
          <Icon name="plus" />
          <span>New chat</span>
        </button>
      </div>
      <div className="workspace-sidebar-conversations">
        <p className="workspace-sidebar-eyebrow">Recent conversations</p>
        {conversations.length === 0 ? (
          <p className="workspace-sidebar-empty">{hasProject ? "No conversations yet" : "Select a project to view conversations"}</p>
        ) : (
          <ul className="workspace-sidebar-history" aria-label="Recent conversations">
            {conversations.map((conversation) => (
              <li key={conversation.id} className={`workspace-sidebar-history-row${conversation.id === activeConversationId ? " is-active" : ""}`}>
                <button
                  type="button"
                  className="workspace-sidebar-history-item"
                  onClick={conversation.id === activeConversationId ? undefined : () => onSelectConversation(conversation.id)}
                  disabled={busy}
                  title={conversation.title}
                >
                  <span className="workspace-sidebar-history-title">
                    <Icon name="message" />
                    <span className="workspace-sidebar-history-title-text">{conversation.title}</span>
                  </span>
                </button>
                <span className="conversation-menu">
                  <button type="button" className="conversation-menu-trigger" aria-label="Conversation menu" popovertarget={`conv-menu-${conversation.id}`} style={{ anchorName: `--cm-${conversation.id.replace(/[^a-zA-Z0-9]/g, "")}` }}><Icon name="more" /></button>
                  <ul className="conversation-menu-list" id={`conv-menu-${conversation.id}`} popover="auto" style={{ positionAnchor: `--cm-${conversation.id.replace(/[^a-zA-Z0-9]/g, "")}` }}>
                    <li><button type="button" className="conversation-menu-action" onClick={() => { const title = window.prompt("Rename conversation", conversation.title); if (title && title.trim() && title.trim() !== conversation.title) onRenameConversation(conversation.id, title.trim()); }} disabled={busy}>Rename</button></li>
                    <li><button type="button" className="conversation-menu-action conversation-menu-action-danger" onClick={() => { if (window.confirm(`Delete "${conversation.title}"?`)) onDeleteConversation(conversation.id); }} disabled={busy}>Delete</button></li>
                  </ul>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="workspace-sidebar-assets">
        <ul className="workspace-sidebar-shortcuts">
          <li>
            <button type="button" className="workspace-sidebar-shortcut" onClick={onOpenKnowledgeBase} disabled={!hasProject}>
              <span className="workspace-sidebar-shortcut-icon is-blue"><Icon name="book-open" /></span>
              <span>
                <strong>Knowledge Base</strong>
                <small>PDFs, manuals, reports, drawings</small>
              </span>
              <small>{kbCount} files</small>
            </button>
          </li>
          <li>
            <button type="button" className="workspace-sidebar-shortcut" onClick={onOpenRepository} disabled={!hasProject}>
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
        <details className="workspace-sidebar-account-menu">
          <summary aria-label="Account menu">
            <div className="workspace-sidebar-account-row">
              <Avatar name={user?.name ?? "Local user"} size="sm" />
              <div className="workspace-sidebar-account-info">
                <strong>{user?.name ?? "Local user"}</strong>
                <span>{user?.id === "user_ada" ? "ada.lovelace@buildingagent.ai" : user?.id ?? "local-user"}</span>
              </div>
            </div>
          </summary>
          <ul>
            <li><button type="button"><Icon name="key" />LLM API key</button></li>
            <li><button type="button"><Icon name="link" />Base URL</button></li>
            <li><button type="button"><Icon name="cpu" />Model</button></li>
            <li><button type="button"><Icon name="settings" />Settings</button></li>
            <li><button type="button" onClick={onSignOut}><Icon name="x" />Switch account</button></li>
          </ul>
        </details>
      </div>
    </div>
  );
}

function WorkspaceRightPanel({ registry, management, disabled }: { registry: RegistryResponse | null; management: ProjectManagementResponse | null; disabled?: boolean }) {
  const taskCount = disabled ? 0 : 3;
  const skillCount = disabled ? 0 : (registry?.skills.length ?? 0);
  const toolCount = disabled ? 0 : (management?.tools.length ?? registry?.tools.length ?? 0);
  return (
    <div className={`workspace-right-block${disabled ? " is-disabled" : ""}`}>
      <details className="workspace-right-section" open={!disabled}>
        <summary>
          <span><Icon name="clock" />Scheduled &amp; rule-based tasks</span>
          <span className="right-section-meta">{taskCount}</span>
        </summary>
        {disabled ? <p className="right-section-empty">Select a project to view tasks</p> : <ScheduledTasks />}
      </details>
      <details className="workspace-right-section">
        <summary>
          <span><Icon name="puzzle" />Skills</span>
          <span className="right-section-meta">{skillCount}</span>
        </summary>
        {disabled ? <p className="right-section-empty">Select a project to view skills</p> : <Skills />}
      </details>
      <details className="workspace-right-section">
        <summary>
          <span><Icon name="wrench" />Tools</span>
          <span className="right-section-meta">{toolCount}</span>
        </summary>
        {disabled ? <p className="right-section-empty">Select a project to view tools</p> : <Tools />}
      </details>
    </div>
  );
}

function Workspace({
  project,
  projects,
  user,
  messages,
  conversations,
  activeConversationId,
  kbDocuments,
  repoItems,
  providerDiagnostics,
  providerRequestId,
  registry,
  management,
  activeTab,
  onTabChange,
  onSend,
  onNewChat,
  onResetChat,
  onSwitchProject,
  onSelectProject,
  onSelectConversation,
  onCreateProject,
  onSignOut,
  projectConversationCounts,
  projectAssetCounts,
  busy,
  onDeleteConversation,
  onRenameConversation,
  onDeleteProject,
  onStop,
  activeTools
}: {
  project: ProjectSummary | null;
  projects: ProjectSummary[];
  user: UserSummary | null;
  messages: ChatMessage[];
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  kbDocuments: KnowledgeBaseDocument[];
  repoItems: RepositoryItem[];
  providerDiagnostics: ChatProviderDiagnostics | null;
  providerRequestId: string | undefined;
  registry: RegistryResponse | null;
  management: ProjectManagementResponse | null;
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  onSend: (message: string) => Promise<void>;
  onStop: () => void;
  onNewChat: () => Promise<void>;
  onResetChat: () => Promise<void>;
  onSwitchProject: () => void;
  onSelectProject: (project: ProjectSummary) => void;
  onSelectConversation: (convId: string) => void;
  onCreateProject: (name: string) => void;
  onSignOut: () => void;
  projectConversationCounts: Record<string, number>;
  projectAssetCounts: Record<string, number>;
  busy: boolean;
  onDeleteConversation: (convId: string) => void;
  onRenameConversation: (convId: string, title: string) => void;
  onDeleteProject: (projectId: string) => void;
  activeTools?: Array<{ name: string; status: "running" | "done"; args?: Record<string, unknown>; resultPreview?: string }>;
}) {
  const tabs: Array<{ id: WorkspaceTab; label: string }> = [
    { id: "chat", label: "Chat" },
    { id: "kb", label: "Knowledge Base" },
    { id: "repo", label: "Repository" },
    { id: "registry", label: "Platform Registry" },
    { id: "gateways", label: "Gateways" },
    { id: "building", label: "Building Domain" }
  ];

  const [leftOpen, setLeftOpen] = useState(project !== null);
  const [rightOpen, setRightOpen] = useState(false);

  useEffect(() => {
    if (project) {
      setLeftOpen(true);
      setRightOpen(false);
    } else {
      setLeftOpen(false);
      setRightOpen(false);
    }
  }, [project?.id ?? null]);

  // Determine shell class name for sidebar visibility
  const shellClass = [
    "cgpt-workspace-shell",
    project ? "" : "is-no-sidebars",
    !project ? (leftOpen ? "is-left-expanded" : "") : (leftOpen ? "" : "is-left-collapsed"),
    !project ? (rightOpen ? "is-right-expanded" : "") : (rightOpen ? "" : "is-right-collapsed")
  ].filter(Boolean).join(" ");

  const center = project ? (
    <div className="workspace-center-block" aria-labelledby="workspace-title">
      <div className="workspace-floating-toggles">
        <button type="button" className="workspace-icon-button workspace-left-toggle" onClick={() => setLeftOpen((open) => !open)} aria-label={leftOpen ? "Collapse project sidebar" : "Expand project sidebar"}>
          <Icon name="panel-left" />
        </button>
        <button type="button" className="workspace-icon-button workspace-right-toggle" onClick={() => setRightOpen((open) => !open)} aria-label={rightOpen ? "Collapse workspace details" : "Expand workspace details"}>
          <Icon name="panel-right" />
        </button>
      </div>
      <h1 id="workspace-title" className="visually-hidden">{project.name} workspace</h1>
      {activeTab === "chat" ? <ChatWorkspace project={project} user={user} messages={messages} activeConversationId={activeConversationId} onSend={onSend} onStop={onStop} busy={busy} provider={providerDiagnostics} requestId={providerRequestId} {...(activeTools ? { activeTools } : {})} /> : null}
      {activeTab === "kb" ? <KnowledgeBase projectId={project.id} projectName={project.name} documents={kbDocuments} /> : null}
      {activeTab === "repo" ? <Repository projectId={project.id} projectName={project.name} items={repoItems} /> : null}
      {activeTab === "registry" ? <RegistryPanel registry={registry} /> : null}
      {activeTab === "gateways" ? <GatewayPanel registry={registry} management={management} /> : null}
      {activeTab === "building" ? <BuildingDomainPanel registry={registry} management={management} /> : null}
    </div>
  ) : (
    <div className="workspace-center-block workspace-center-empty" aria-labelledby="workspace-title">
      <div className="workspace-floating-toggles">
        <button type="button" className="workspace-icon-button workspace-left-toggle" onClick={() => setLeftOpen((open) => !open)} aria-label={leftOpen ? "Collapse project sidebar" : "Expand project sidebar"}>
          <Icon name="panel-left" />
        </button>
        <button type="button" className="workspace-icon-button workspace-right-toggle" onClick={() => setRightOpen((open) => !open)} aria-label={rightOpen ? "Collapse workspace details" : "Expand workspace details"}>
          <Icon name="panel-right" />
        </button>
      </div>
      <ProjectPicker projects={projects} user={user} busy={busy} onSelect={onSelectProject} onCreate={onCreateProject} onSignOut={onSignOut} conversationCounts={projectConversationCounts} assetCounts={projectAssetCounts} showChrome={false} />
    </div>
  );

  return (
    <div className="workspace-card workspace-management cgpt-workspace">
      <WorkspaceShell
        leftLabel="Project sidebar"
        centerLabel="Workspace content"
        rightLabel="Workspace details"
        left={(
          <WorkspaceSidebarBlock
            project={project}
            projects={projects}
            user={user}
            kbCount={project ? kbDocuments.length : 0}
            repoCount={project ? repoItems.length : 0}
            conversations={project ? conversations : []}
            activeConversationId={project ? activeConversationId : null}
            busy={busy}
            onSwitchProject={onSwitchProject}
            onSelectProject={onSelectProject}
            onSelectConversation={onSelectConversation}
            onSignOut={onSignOut}
            onNewChat={() => { void onNewChat(); }}
            onOpenKnowledgeBase={() => onTabChange("kb")}
            onOpenRepository={() => onTabChange("repo")}
            onDeleteConversation={onDeleteConversation}
            onRenameConversation={(convId, title) => { void onRenameConversation(convId, title); }}
            onDeleteProject={onDeleteProject}
          />
        )}
        center={center}
        right={<WorkspaceRightPanel registry={project ? registry : null} management={project ? management : null} disabled={!project} />}
        className={shellClass}
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
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [knowledgeBaseDocuments, setKnowledgeBaseDocuments] = useState<KnowledgeBaseDocument[]>([]);
  const [repositoryItems, setRepositoryItems] = useState<RepositoryItem[]>([]);
  const [projectConversationCounts, setProjectConversationCounts] = useState<Record<string, number>>({});
  const [projectAssetCounts, setProjectAssetCounts] = useState<Record<string, number>>({});
  const [chatProviderDiagnostics, setChatProviderDiagnostics] = useState<ChatProviderDiagnostics | null>(null);
  const [chatProviderRequestId, setChatProviderRequestId] = useState<string | undefined>(undefined);
  const [registry, setRegistry] = useState<RegistryResponse | null>(null);
  const [management, setManagement] = useState<ProjectManagementResponse | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("chat");
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeTools, setActiveTools] = useState<Array<{ name: string; status: "running" | "done"; args?: Record<string, unknown>; resultPreview?: string }>>([]);
  const [bootstrapping, setBootstrapping] = useState(Boolean(initial.token));
  const hadSavedSession = useMemo(() => Boolean(initial.token), [initial.token]);
  const abortControllerRef = useRef<AbortController | null>(null);

  function clearAuth(nextBanner?: BannerState) {
    setToken("");
    setUser(null);
    setSession(null);
    setProjects([]);
    setSelectedProject(null);
    setMessages([]);
    setConversations([]);
    setActiveConversationId(null);
    setKnowledgeBaseDocuments([]);
    setRepositoryItems([]);
    setProjectConversationCounts({});
    setProjectAssetCounts({});
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
    setProjectAssetCounts((current) => ({ ...current, [projectId]: kbResponse.documents.length + repoResponse.artifacts.length }));
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
          const [chatResponse, registryResponse, managementResponse, convResponse] = await Promise.all([
            getChat(token, restoredProject.id),
            getRegistry(token),
            getProjectManagement(token, restoredProject.id),
            getConversations(token, restoredProject.id).catch(() => ({ conversations: [], limit: 50, requestId: "" }))
          ]);
          const [kbResponse, repoResponse] = await Promise.all([
            getKnowledgeBase(token, restoredProject.id).catch(() => ({ documents: [], requestId: "" })),
            getRepository(token, restoredProject.id).catch(() => ({ artifacts: [], requestId: "" }))
          ]);
          if (!cancelled) {
            setMessages(chatResponse.messages);
            setConversations(convResponse.conversations);
            setProjectConversationCounts((current) => ({ ...current, [restoredProject.id]: convResponse.conversations.length }));
            setProjectAssetCounts((current) => ({ ...current, [restoredProject.id]: kbResponse.documents.length + repoResponse.artifacts.length }));
            setActiveConversationId(chatResponse.activeConversationId ?? null);
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

  // Poll for proactive messages (scheduler-fired reminders) in the active conversation
  useEffect(() => {
    if (!token || !selectedProject || !activeConversationId) return;

    const POLL_INTERVAL_MS = 5000;
    let active = true;

    async function poll() {
      if (!active || busy) return;
      try {
        const chat = await getChat(token!, selectedProject!.id, activeConversationId!);
        if (!active) return;
        setMessages((current) => {
          const currentIds = new Set(current.map((m) => m.id));
          const newMessages = chat.messages.filter((m) => !currentIds.has(m.id));
          if (newMessages.length === 0) return current;
          // Append new messages (typically scheduler-fired assistant messages)
          const merged = [...current];
          for (const msg of newMessages) {
            if (!currentIds.has(msg.id)) {
              merged.push(msg);
            }
          }
          return merged;
        });
      } catch {
        // Polling failures are silent — retry on next interval
      }
    }

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [token, selectedProject?.id ?? null, activeConversationId, busy]);

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
      const [surfaces, convResponse] = await Promise.all([
        loadManagementSurfaces(token, project.id),
        getConversations(token, project.id).catch(() => ({ conversations: [], limit: 50, requestId: "" }))
      ]);
      setSession(selected.session);
      setSelectedProject(project);
      setMessages([]);
      setConversations(convResponse.conversations);
      setProjectConversationCounts((current) => ({ ...current, [project.id]: convResponse.conversations.length }));
      setProjectAssetCounts((current) => ({ ...current, [project.id]: surfaces.kbResponse.documents.length + surfaces.repoResponse.artifacts.length }));
      setActiveConversationId(null);
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

  async function handleCreateProject(name: string) {
    if (!token) {
      setBanner({ tone: "error", title: "Authentication required", message: "Sign in before creating a project.", code: "auth_missing" });
      return;
    }
    if (!name.trim() || name.trim().length > 80) {
      setBanner({ tone: "error", title: "Invalid name", message: "Project name must be 1-80 characters.", code: "project_invalid" });
      return;
    }
    setBusy(true);
    try {
      const created = await createProject(token, name.trim());
      setProjects((current) => [...current, created.project]);
      setSession(created.session);
      const project = { id: created.project.id, name: created.project.name, permissions: created.project.permissions };
      setSelectedProject(project);
      setMessages([]);
      setConversations([]);
      setActiveConversationId(null);
      setKnowledgeBaseDocuments([]);
      setRepositoryItems([]);
      setProjectConversationCounts((current) => ({ ...current, [project.id]: 0 }));
      setProjectAssetCounts((current) => ({ ...current, [project.id]: 0 }));
      setChatProviderDiagnostics(null);
      setChatProviderRequestId(undefined);
      setRegistry(null);
      setManagement(null);
      setActiveTab("chat");
      storeSession({ token, user, projectId: created.project.id });
      setBanner({ tone: "success", title: "Project created", message: `${name.trim()} is now active.`, requestId: created.requestId });
    } catch (error) {
      setBanner(errorBanner(error, "Project creation failed"));
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
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    setBusy(true);
    setActiveTools([]);
    const projectId = selectedProject.id;
    const userId = user?.id ?? "local-user";

    const optimisticUser: ChatMessage = {
      id: `pending_user_${Date.now()}`,
      projectId,
      userId,
      role: "user",
      content: message.trim()
    };
    const streamingId = `streaming_${Date.now()}`;
    const streamingAssistant: ChatMessage = {
      id: streamingId,
      projectId,
      userId,
      role: "assistant",
      content: ""
    };

    setMessages((current) => [...current, optimisticUser, streamingAssistant]);

    try {
      await sendChatMessageStream(token, projectId, message.trim(), {
        onToken(content: string) {
          setMessages((current) =>
            current.map((m) => (m.id === streamingId ? { ...m, content: m.content + content } : m))
          );
        },
        onLifecycle(event: ChatLifecycleEvent) {
          // For non-streaming providers, set full text at turn_completed
          if (event.type === "turn_completed" && event.message) {
            setMessages((current) =>
              current.map((m) => (m.id === streamingId ? { ...m, content: event.message } : m))
            );
          }
          // Track tool calls
          if (event.type === "tool_started" && event.metadata?.tool) {
            const toolName = typeof event.metadata.tool === "string" ? event.metadata.tool : "unknown";
            setActiveTools((current) => {
              const existing = current.find((t) => t.name === toolName);
              if (existing && existing.status === "done") {
                return current;
              }
              if (existing) return current;
              return [...current, { name: toolName, status: "running" }];
            });
          }
          if (event.type === "tool_completed" && event.metadata?.tool) {
            const toolName = typeof event.metadata.tool === "string" ? event.metadata.tool : "unknown";
            setActiveTools((current) =>
              current.map((t) => (t.name === toolName ? { ...t, status: "done" as const } : t))
            );
          }
        },
        onError(error) {
          setMessages((current) => current.filter((m) => m.id !== optimisticUser.id && m.id !== streamingId));
          setBanner({ tone: "error", title: error.code, message: error.message, ...(error.requestId ? { requestId: error.requestId } : {}) });
        },
        onDone(response) {
          setMessages((current) => [
            ...current.filter((m) => m.id !== optimisticUser.id && m.id !== streamingId),
            response.message,
            response.assistantMessage
          ]);
          if (response.artifact) {
            setRepositoryItems((current) => [
              ...current.filter((item) => item.id !== response.artifact!.id),
              artifactToRepositoryItem(response.artifact!)
            ]);
          }
          if (response.conversationId) {
            setActiveConversationId(response.conversationId);
            const updatedTitle = response.conversationTitle ?? "New conversation";
            setConversations((current) => {
              const existing = current.find((c) => c.id === response.conversationId);
              if (existing) {
                return current.map((c) =>
                  c.id === response.conversationId
                    ? { ...c, title: updatedTitle, messageCount: c.messageCount + 2 }
                    : c
                );
              }
              return [...current, { id: response.conversationId!, title: updatedTitle, messageCount: 2, createdAt: new Date().toISOString() }];
            });
          }
          setChatProviderDiagnostics(response.provider);
          setChatProviderRequestId(response.requestId);
          setActiveTools([]);
          setBanner(null);
        }
      }, activeConversationId ?? undefined, signal);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setMessages((current) => current.filter((m) => m.id !== optimisticUser.id && m.id !== streamingId));
        setBanner(null);
        return;
      }
      setMessages((current) => current.filter((m) => m.id !== optimisticUser.id && m.id !== streamingId));
      if (isAuthFailure(error)) {
        clearAuth(errorBanner(error, "Session expired"));
      } else {
        setBanner(errorBanner(error, "Chat message failed"));
      }
    } finally {
      abortControllerRef.current = null;
      setBusy(false);
    }
  }

  function handleStop() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }

  async function handleNewChat() {
    if (!token || !selectedProject) {
      setActiveTab("chat");
      setMessages([]);
      setChatProviderDiagnostics(null);
      setChatProviderRequestId(undefined);
      return;
    }
    setActiveConversationId(null);
    setMessages([]);
    setChatProviderDiagnostics(null);
    setChatProviderRequestId(undefined);
    setActiveTab("chat");
    setBanner({
      tone: "info",
      title: "New chat ready",
      message: "Send a message to start a new conversation."
    });
  }

  async function handleSelectConversation(convId: string) {
    if (!token || !selectedProject) return;
    if (convId === activeConversationId) return;
    setBusy(true);
    try {
      const result = await selectConversation(token, selectedProject.id, convId);
      setMessages(result.messages);
      setActiveConversationId(convId);
      setActiveTab("chat");
    } catch (error) {
      if (isAuthFailure(error)) {
        clearAuth(errorBanner(error, "Session expired"));
      } else {
        setBanner(errorBanner(error, "Could not load conversation"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteConversation(convId: string) {
    if (!token || !selectedProject) return;
    setBusy(true);
    try {
      const result = await deleteConversation(token, selectedProject.id, convId);
      setConversations((current) => current.filter((c) => c.id !== result.conversationId));
      if (convId === activeConversationId) {
        setActiveConversationId(null);
        setMessages([]);
        setChatProviderDiagnostics(null);
        setChatProviderRequestId(undefined);
      }
      setBanner({ tone: "success", title: "Conversation deleted", message: `Removed ${result.removedMessages} messages.`, requestId: result.requestId });
    } catch (error) {
      if (isAuthFailure(error)) {
        clearAuth(errorBanner(error, "Session expired"));
      } else {
        setBanner(errorBanner(error, "Could not delete conversation"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRenameConversation(convId: string, title: string) {
    if (!token || !selectedProject) return;
    setBusy(true);
    try {
      const result = await renameConversation(token, selectedProject.id, convId, title);
      setConversations((current) => current.map((c) => (c.id === convId ? result.conversation : c)));
      setBanner({ tone: "success", title: "Conversation renamed", message: `Title updated to "${result.conversation.title}".`, requestId: result.requestId });
    } catch (error) {
      if (isAuthFailure(error)) {
        clearAuth(errorBanner(error, "Session expired"));
      } else {
        setBanner(errorBanner(error, "Could not rename conversation"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteProject(projectId: string) {
    if (!token) return;
    setBusy(true);
    try {
      const result = await deleteProject(token, projectId);
      setProjects((current) => current.filter((p) => p.id !== result.projectId));
      if (selectedProject?.id === result.projectId) {
        setSelectedProject(null);
        setMessages([]);
        setConversations([]);
        setActiveConversationId(null);
        setKnowledgeBaseDocuments([]);
        setRepositoryItems([]);
        setChatProviderDiagnostics(null);
        setChatProviderRequestId(undefined);
        setRegistry(null);
        setManagement(null);
        setSession((current) => current ? { ...current, projectId: null } : null);
        storeSession({ token, user, projectId: null });
      }
      setBanner({ tone: "success", title: "Project deleted", message: `Project ${result.projectId} and all its data removed.`, requestId: result.requestId });
    } catch (error) {
      if (isAuthFailure(error)) {
        clearAuth(errorBanner(error, "Session expired"));
      } else {
        setBanner(errorBanner(error, "Could not delete project"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleResetChat() {
    if (!token || !selectedProject) {
      setActiveTab("chat");
      setMessages([]);
      setChatProviderDiagnostics(null);
      setChatProviderRequestId(undefined);
      return;
    }
    setBusy(true);
    try {
      const reset = await resetChat(token, selectedProject.id, activeConversationId ?? undefined);
      setMessages([]);
      setChatProviderDiagnostics(null);
      setChatProviderRequestId(undefined);
      setActiveTab("chat");
      // Update the conversation message count
      setConversations((current) =>
        current.map((c) =>
          c.id === activeConversationId ? { ...c, messageCount: 0, title: "New conversation" } : c
        )
      );
      setBanner({
        tone: "success",
        title: "Chat cleared",
        message: `Cleared ${reset.clearedMessages} messages and ${reset.clearedMemories} memories.`,
        requestId: reset.requestId
      });
    } catch (error) {
      if (isAuthFailure(error)) {
        clearAuth(errorBanner(error, "Session expired"));
      } else {
        setBanner(errorBanner(error, "Clear chat failed"));
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
      {!bootstrapping && authenticated ? <Workspace project={selectedProject} projects={projects} user={user} messages={messages} conversations={conversations} activeConversationId={activeConversationId} kbDocuments={knowledgeBaseDocuments} repoItems={repositoryItems} providerDiagnostics={chatProviderDiagnostics} providerRequestId={chatProviderRequestId} registry={registry} management={management} activeTab={activeTab} onTabChange={setActiveTab} onSend={handleSend} onNewChat={handleNewChat} onResetChat={handleResetChat} onSwitchProject={() => setSelectedProject(null)} onSelectProject={(project) => { void handleProjectSelect(project); }} onSelectConversation={(convId) => { void handleSelectConversation(convId); }} onCreateProject={(name) => { void handleCreateProject(name); }} onSignOut={() => clearAuth()} projectConversationCounts={projectConversationCounts} projectAssetCounts={projectAssetCounts} busy={busy} onDeleteConversation={(convId) => { void handleDeleteConversation(convId); }} onRenameConversation={(convId, title) => { void handleRenameConversation(convId, title); }} onDeleteProject={(projectId) => { void handleDeleteProject(projectId); }} onStop={handleStop} activeTools={activeTools} /> : null}
      {session ? <footer className="diagnostic-footer">Session project: {session.projectId ?? "none selected"}</footer> : null}
    </AppShell>
  );
}
