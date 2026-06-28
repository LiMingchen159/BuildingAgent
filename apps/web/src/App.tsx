import { FormEvent, type CSSProperties, type ReactNode, type SVGProps, useEffect, useMemo, useRef, useState } from "react";
import { AppShell, Avatar, Badge, Banner, Button, Card, EmptyState, Input, MockOnlyBadge, Surface, type BannerProps } from "./ui/primitives";
import { WorkspaceShell } from "./ui/WorkspaceShell";
import { Markdown } from "./ui/Markdown";
import { ChatImageGallery } from "./ui/ChatImageGallery";
import { KnowledgeBase, type KnowledgeBaseDocument } from "./ui/KnowledgeBase";
import { Repository, type RepositoryItem } from "./ui/Repository";
import { BmsDataConfigPage } from "./ui/BmsDataConfig";
import { DashboardView } from "./ui/DashboardView";
import { ScheduledTasks } from "./ui/ScheduledTasks";
import { CubeLogo } from "./ui/CubeLogo";
import { ParticleField } from "./ui/ParticleField";
import { instantConversationTitle, parseActivityLabel, parseAssistantContent, stripThinkingFromAnswer } from "./ui/activityThinking";
import {
  ApiClientError,
  createProjectSocket,
  getDashboard,
  getDashboards,
  getDerivedMetric,
  getDerivedMetrics,
  getChat,
  getActiveChatStreams,
  parseActiveChatStreamSnapshot,
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
  createDashboard,
  createProject,
  createConversation,
  getConversations,
  selectConversation,
  deleteConversation,
  renameConversation,
  updateDashboard,
  updateDerivedMetricMaterialization,
  deleteDashboard,
  deleteProject,
  type DashboardRecord,
  type DerivedMetricAsset,
  type DashboardVisibility,
  type ActiveChatStreamSnapshot,
  type ChatProviderDiagnostics,
  type ChatLifecycleEvent,
  type ChatMessageImage,
  type ChatStreamActivityEvent,
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
import type { BmsCollectorPoint } from "./bmsCollectorClient";

const STORAGE_KEY = "building-agent.session.v1";
/** Set after explicit login so bootstrap shows project picker instead of restoring URL/storage project. */
const SKIP_PROJECT_RESTORE_KEY = "building-agent.skip-project-restore";
const STARTUP_BURST_SEGMENTS = Array.from({ length: 12 }, (_, index) => index);

function consumeSkipProjectRestore(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (window.sessionStorage.getItem(SKIP_PROJECT_RESTORE_KEY) !== "1") {
    return false;
  }
  window.sessionStorage.removeItem(SKIP_PROJECT_RESTORE_KEY);
  return true;
}

type WorkspaceTab = "chat" | "bms" | "kb" | "repo" | "dashboards" | "kpis" | "registry" | "gateways" | "building";

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
  | "edit-3"
  | "file-search"
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
  | "terminal"
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

function isVisibleRepositoryArtifact(artifact: RepositoryArtifact): boolean {
  return !artifact.name.toLowerCase().endsWith(".py");
}

function visibleRepositoryItemsFromArtifacts(artifacts: RepositoryArtifact[]): RepositoryItem[] {
  return artifacts.filter(isVisibleRepositoryArtifact).map(artifactToRepositoryItem);
}

function visibleRepositoryArtifactCount(artifacts: RepositoryArtifact[]): number {
  return artifacts.filter(isVisibleRepositoryArtifact).length;
}

function workspacePathFromTab(projectId: string, tab: WorkspaceTab, dashboardId?: string | null, metricInstanceId?: string | null): string {
  const section = tab === "bms" ? "bms-data-config" : tab;
  if (tab === "dashboards" && dashboardId) {
    return `/projects/${encodeURIComponent(projectId)}/dashboards/${encodeURIComponent(dashboardId)}`;
  }
  if (tab === "kpis" && metricInstanceId) {
    return `/projects/${encodeURIComponent(projectId)}/kpis/${encodeURIComponent(metricInstanceId)}`;
  }
  return `/projects/${encodeURIComponent(projectId)}/${section}`;
}

function dashboardSoloPath(projectId: string, dashboardId: string): string {
  return `${workspacePathFromTab(projectId, "dashboards", dashboardId)}?view=solo`;
}

function isSoloDashboardSearch(search: string): boolean {
  return new URLSearchParams(search).get("view") === "solo";
}

function parseWorkspacePath(pathname: string): { projectId: string; tab: WorkspaceTab; dashboardId?: string; metricInstanceId?: string } | null {
  const dashboardMatch = pathname.match(/^\/projects\/([^/]+)\/dashboards\/([^/]+)$/);
  if (dashboardMatch) {
    const projectId = decodeURIComponent(dashboardMatch[1] ?? "");
    const dashboardId = decodeURIComponent(dashboardMatch[2] ?? "");
    if (!projectId || !dashboardId) return null;
    return { projectId, tab: "dashboards", dashboardId };
  }
  const kpiMatch = pathname.match(/^\/projects\/([^/]+)\/kpis\/([^/]+)$/);
  if (kpiMatch) {
    const projectId = decodeURIComponent(kpiMatch[1] ?? "");
    const metricInstanceId = decodeURIComponent(kpiMatch[2] ?? "");
    if (!projectId || !metricInstanceId) return null;
    return { projectId, tab: "kpis", metricInstanceId };
  }
  const match = pathname.match(/^\/projects\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  const projectId = decodeURIComponent(match[1] ?? "");
  const section = match[2];
  if (!projectId) return null;
  const tab = section === "bms-data-config" ? "bms" : section;
  if (tab === "chat" || tab === "bms" || tab === "kb" || tab === "repo" || tab === "dashboards" || tab === "kpis" || tab === "registry" || tab === "gateways" || tab === "building") {
    return { projectId, tab };
  }
  return null;
}

function normalizeChatImagePath(rawUrl: string): string {
  let normalized = rawUrl.replace(/\\/g, "/").replace(/^\/+/, "");
  const kbMatch = normalized.match(/(?:^|\.\.\/|\/)kb\/outputs\/(.+)/i);
  if (kbMatch) {
    normalized = `outputs/${kbMatch[1]}`;
  }
  return normalized;
}

function extractMarkdownImagePaths(content: string): string[] {
  const matches = content.matchAll(/!\[[^\]]*]\(([^)\s]+)\)/g);
  return [...matches].map((match) => normalizeChatImagePath(match[1] ?? ""));
}

function dedupeMessageImages(images: ChatMessageImage[] | undefined, content: string): ChatMessageImage[] | undefined {
  if (!images || images.length === 0) {
    return undefined;
  }
  const markdownPaths = new Set(extractMarkdownImagePaths(content).map((value) => value.toLowerCase()));
  // Text-only answers should not show a leftover gallery from earlier tool runs.
  if (markdownPaths.size === 0) {
    return undefined;
  }
  const seen = new Set<string>();
  const deduped = images.filter((image) => {
    const normalized = normalizeChatImagePath(image.src);
    const key = normalized.toLowerCase();
    if (seen.has(key) || markdownPaths.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  }).map((image) => ({
    ...image,
    src: normalizeChatImagePath(image.src)
  }));
  return deduped.length > 0 ? deduped : undefined;
}

interface MessageDashboardReference {
  id: string;
  title: string;
  subtitle: string;
  dashboard?: DashboardRecord;
}

function extractDashboardReferences(content: string, dashboards: DashboardRecord[]): MessageDashboardReference[] {
  const dashboardsById = new Map(dashboards.map((dashboard) => [dashboard.id, dashboard]));
  const titlesById = new Map<string, string>();
  for (const match of content.matchAll(/###\s+\*\*(.+?)\*\*\s+—\s+`(dash_\d+)`/g)) {
    const title = match[1]?.trim();
    const id = match[2]?.trim();
    if (title && id) {
      titlesById.set(id, title);
    }
  }

  const ids = new Set<string>();
  for (const match of content.matchAll(/\/projects\/[^/\s`]+\/dashboards\/(dash_\d+)/g)) {
    const id = match[1]?.trim();
    if (id) ids.add(id);
  }
  for (const id of titlesById.keys()) {
    ids.add(id);
  }

  return [...ids].map((id) => {
    const dashboard = dashboardsById.get(id);
    const title = dashboard?.title ?? titlesById.get(id) ?? id;
    const visibilityLabel = dashboard?.visibility === "project" ? "Shared" : "Private";
    const subtitle = dashboard
      ? `${visibilityLabel} dashboard · ${dashboard.widgets.length} widget${dashboard.widgets.length === 1 ? "" : "s"}`
      : "Dashboard artifact";
    return { id, title, subtitle, ...(dashboard ? { dashboard } : {}) };
  });
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
    "edit-3": <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
    "file-chart": <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 18v-3" /><path d="M12 18v-6" /><path d="M16 18v-4" /></>,
    "file-search": <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h7" /><path d="M14 2v6h6" /><path d="M9 15h2" /><circle cx="17" cy="17" r="3" /><path d="m21 21-1.8-1.8" /></>,
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
    terminal: <><path d="m4 17 6-5-6-5" /><path d="M12 19h8" /></>,
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

function DashboardArtifactCard({
  reference,
  projectId,
  onOpenDashboard
}: {
  reference: MessageDashboardReference;
  projectId: string;
  onOpenDashboard: (dashboardId: string) => void;
}) {
  return (
    <section className="dashboard-artifact-card" aria-label={`Dashboard artifact ${reference.title}`}>
      <button
        type="button"
        className="dashboard-artifact-surface"
        onClick={() => onOpenDashboard(reference.id)}
        disabled={!reference.dashboard}
      >
        <div className="dashboard-artifact-icon" aria-hidden="true">
          <Icon name="grid" />
        </div>
        <div className="dashboard-artifact-copy">
          <strong>{reference.title}</strong>
          <span>{reference.subtitle}</span>
        </div>
      </button>
      <details className="dashboard-artifact-menu" onClick={(event) => event.stopPropagation()}>
        <summary className="dashboard-artifact-action" aria-label="Open dashboard options">
          <span>Open in</span>
          <Icon name="chevron-down" />
        </summary>
        <ul>
          <li>
            <button type="button" onClick={() => onOpenDashboard(reference.id)} disabled={!reference.dashboard}>
              This page
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => {
                if (!reference.dashboard) return;
                window.open(dashboardSoloPath(projectId, reference.id), "_blank", "noopener,noreferrer");
              }}
              disabled={!reference.dashboard}
            >
              New page
            </button>
          </li>
        </ul>
      </details>
    </section>
  );
}

function ThinkDetails({
  blocks,
  streamingBlock,
  runningLastBlock = false
}: {
  blocks: string[];
  streamingBlock?: string | null;
  runningLastBlock?: boolean;
}) {
  if (blocks.length === 0 && !streamingBlock) {
    return null;
  }

  return (
    <div className="activity-context-block">
      {blocks.map((block, index) => {
        const isFinalBlock = index === blocks.length - 1;
        const running = runningLastBlock && isFinalBlock && !streamingBlock;
        return (
          <details
            key={`think-done-${index}`}
            className={`activity-row activity-think${running ? " is-running" : ""}`}
          >
            <summary className="activity-row-summary">
              <span className="activity-row-icon"><Icon name="cpu" /></span>
              <span className="activity-row-label">Think</span>
              <Icon name="chevron-down" className="activity-row-chevron" />
            </summary>
            <div className="activity-row-details activity-think-details">
              <Markdown source={block} className="markdown-think" />
            </div>
          </details>
        );
      })}
      {streamingBlock ? (
        <details className="activity-row activity-think is-running" open>
          <summary className="activity-row-summary">
            <span className="activity-row-icon"><Icon name="cpu" /></span>
            <span className="activity-row-label">Think</span>
            <Icon name="chevron-down" className="activity-row-chevron" />
          </summary>
          <div className="activity-row-details activity-think-details">
            <Markdown source={streamingBlock} className="markdown-think" />
          </div>
        </details>
      ) : null}
    </div>
  );
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [validation, setValidation] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setValidation("Enter your email and password to continue.");
      return;
    }
    setValidation("");
    try {
      await onLogin(email.trim(), password);
    } catch (error) {
      setValidation(error instanceof ApiClientError ? error.message : "Sign in failed. Check email and password.");
    }
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
        <div><dt><Icon name="folder" />Assets</dt><dd>{assetCount.toLocaleString("en-US")}</dd></div>
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
      <span>{assetCount.toLocaleString("en-US")} assets</span>
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

function StartupBurstLoader({ className }: { className?: string }) {
  return (
    <div className={["workspace-restoring-surface", className].filter(Boolean).join(" ")} role="status" aria-live="polite" aria-label="Preparing BuildingGPT workspace">
      <div className="workspace-restoring-card">
        <div className="workspace-restoring-burst" aria-hidden="true">
          {STARTUP_BURST_SEGMENTS.map((segment) => (
            <span key={segment} style={{ "--i": segment } as CSSProperties} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ProjectScreenSkeleton() {
  return (
    <main className="workspace-card project-screen project-screen-skeleton project-screen-startup minimal-project-shell" aria-busy="true">
      <StartupBurstLoader />
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

interface StreamingTurnState {
  conversationId: string | null;
  assistantId: string | null;
  userId: string | null;
  activities: ChatStreamActivityEvent[];
  startedAt: number;
  interimNarration: string;
  answerPhase: boolean;
  workElapsedMs: number;
  workSegmentStartedAt: number | null;
  workTimelinePaused: boolean;
  streamTimelineFinalized: boolean;
}

interface ConversationStreamState {
  conversationId: string;
  optimisticUser: ChatMessage;
  streamingAssistant: ChatMessage;
  activities: ChatStreamActivityEvent[];
  startedAt: number;
  interimNarration: string;
  answerPhase: boolean;
  workElapsedMs: number;
  workSegmentStartedAt: number | null;
  workTimelinePaused: boolean;
  streamTimelineFinalized: boolean;
}

function conversationStreamFromActiveSnapshot(stream: ActiveChatStreamSnapshot): ConversationStreamState {
  return {
    conversationId: stream.conversationId,
    optimisticUser: stream.userMessage,
    streamingAssistant: stream.assistantMessage,
    activities: stream.activities,
    startedAt: stream.startedAt,
    interimNarration: stream.interimNarration,
    answerPhase: stream.answerPhase,
    workElapsedMs: stream.workElapsedMs,
    workSegmentStartedAt: stream.workSegmentStartedAt,
    workTimelinePaused: stream.workTimelinePaused,
    streamTimelineFinalized: stream.streamTimelineFinalized
  };
}

function conversationStreamsFromActiveSnapshots(streams: ActiveChatStreamSnapshot[]): Record<string, ConversationStreamState> {
  return Object.fromEntries(streams.map((stream) => [
    stream.conversationId,
    conversationStreamFromActiveSnapshot(stream)
  ]));
}

function conversationSummaryFromActiveStream(stream: ActiveChatStreamSnapshot): ConversationSummary {
  return {
    id: stream.conversationId,
    title: instantConversationTitle(stream.userMessage.content),
    messageCount: 1,
    createdAt: new Date(stream.startedAt).toISOString()
  };
}

interface SidebarRefreshSnapshot {
  conversations: ConversationSummary[];
  kbDocuments: KnowledgeBaseDocument[];
  repositoryItems: RepositoryItem[];
  kbTotalCount: number;
  repoTotalCount: number;
}

function sortConversationsByNewest(conversations: ConversationSummary[]): ConversationSummary[] {
  return [...conversations].sort((left, right) => {
    const rightTime = Date.parse(right.createdAt);
    const leftTime = Date.parse(left.createdAt);
    if (Number.isFinite(rightTime) && Number.isFinite(leftTime) && rightTime !== leftTime) {
      return rightTime - leftTime;
    }
    return right.title.localeCompare(left.title);
  });
}

function upsertConversationSummary(
  conversations: ConversationSummary[],
  conversation: ConversationSummary
): ConversationSummary[] {
  const next = conversations.filter((entry) => entry.id !== conversation.id);
  next.unshift(conversation);
  return sortConversationsByNewest(next);
}

function mergeConversationSummaries(
  serverConversations: ConversationSummary[],
  localConversations: ConversationSummary[],
  streamStates: Record<string, ConversationStreamState>,
  deletedConversationIds: ReadonlySet<string> = new Set()
): ConversationSummary[] {
  const merged = new Map<string, ConversationSummary>();
  for (const conversation of serverConversations) {
    if (deletedConversationIds.has(conversation.id)) continue;
    merged.set(conversation.id, conversation);
  }
  for (const conversation of localConversations) {
    if (deletedConversationIds.has(conversation.id)) continue;
    const existing = merged.get(conversation.id);
    if (!existing) {
      merged.set(conversation.id, conversation);
      continue;
    }
    merged.set(conversation.id, {
      ...existing,
      title: existing.title === "New conversation" && conversation.title !== "New conversation" ? conversation.title : existing.title,
      messageCount: Math.max(existing.messageCount, conversation.messageCount),
      createdAt: existing.createdAt || conversation.createdAt
    });
  }
  for (const [conversationId, streamState] of Object.entries(streamStates)) {
    if (deletedConversationIds.has(conversationId)) continue;
    const existing = merged.get(conversationId);
    if (!existing) continue;
    merged.set(conversationId, {
      ...existing,
      messageCount: Math.max(existing.messageCount, 1),
      createdAt: new Date(streamState.startedAt).toISOString()
    });
  }
  return sortConversationsByNewest([...merged.values()]);
}

function sortDashboardsByUpdatedAt(dashboards: DashboardRecord[]): DashboardRecord[] {
  return [...dashboards].sort((left, right) => {
    const rightTime = Date.parse(right.updatedAt);
    const leftTime = Date.parse(left.updatedAt);
    if (Number.isFinite(rightTime) && Number.isFinite(leftTime) && rightTime !== leftTime) {
      return rightTime - leftTime;
    }
    return left.title.localeCompare(right.title);
  });
}

function dashboardLayoutSignature(layout: DashboardRecord["layout"]): string {
  return [...layout]
    .sort((left, right) => (left.y - right.y) || (left.x - right.x) || left.widgetId.localeCompare(right.widgetId))
    .map((item) => `${item.widgetId}:${item.x}:${item.y}:${item.w}:${item.h}`)
    .join("|");
}

function dashboardWidgetSignature(widget: DashboardRecord["widgets"][number]): string {
  const bindings = widget.pointBindings
    .map((binding) => [
      binding.id ?? "",
      binding.source ?? "",
      binding.pointName ?? "",
      binding.objectRef ?? "",
      binding.metricInstanceId ?? "",
      binding.metricKey ?? "",
      binding.entityId ?? "",
      binding.label ?? "",
      binding.role ?? "",
      binding.unit ?? ""
    ].join(","))
    .join(";");
  return [
    widget.id,
    widget.kind,
    widget.title,
    widget.defaultTimeRange ?? "",
    widget.content ?? "",
    widget.tone ?? "",
    bindings
  ].join(":");
}

function dashboardSectionSignature(sections: DashboardRecord["sections"] | undefined): string {
  return (sections ?? [])
    .map((section) => `${section.id}:${section.title}:${section.kind}:${section.collapsed ? "1" : "0"}:${section.widgetIds.join(",")}`)
    .join("|");
}

function dashboardRecordSignature(dashboard: DashboardRecord): string {
  return [
    dashboard.id,
    dashboard.projectId,
    dashboard.ownerUserId,
    dashboard.visibility,
    dashboard.title,
    dashboard.description ?? "",
    String(dashboard.layoutVersion ?? ""),
    dashboard.createdAt,
    dashboard.updatedAt,
    dashboard.sourceConversationId ?? "",
    dashboardLayoutSignature(dashboard.layout),
    dashboard.widgets.map(dashboardWidgetSignature).join("|"),
    dashboardSectionSignature(dashboard.sections)
  ].join("||");
}

function sameDashboardRecord(left: DashboardRecord, right: DashboardRecord): boolean {
  return dashboardRecordSignature(left) === dashboardRecordSignature(right);
}

function sameDashboardList(left: DashboardRecord[], right: DashboardRecord[]): boolean {
  return left.length === right.length && left.every((dashboard, index) => dashboard === right[index]);
}

function upsertDashboardRecord(dashboards: DashboardRecord[], dashboard: DashboardRecord): DashboardRecord[] {
  let found = false;
  const next = dashboards.map((entry) => {
    if (entry.id !== dashboard.id) return entry;
    found = true;
    return sameDashboardRecord(entry, dashboard) ? entry : dashboard;
  });
  if (!found) {
    next.unshift(dashboard);
  }
  const sorted = sortDashboardsByUpdatedAt(next);
  return sameDashboardList(dashboards, sorted) ? dashboards : sorted;
}

function mergeDashboardList(current: DashboardRecord[], incoming: DashboardRecord[]): DashboardRecord[] {
  const currentById = new Map(current.map((dashboard) => [dashboard.id, dashboard]));
  const merged = incoming.map((dashboard) => {
    const existing = currentById.get(dashboard.id);
    return existing && sameDashboardRecord(existing, dashboard) ? existing : dashboard;
  });
  const sorted = sortDashboardsByUpdatedAt(merged);
  return sameDashboardList(current, sorted) ? current : sorted;
}

function sortDerivedMetricAssets(metrics: DerivedMetricAsset[]): DerivedMetricAsset[] {
  return [...metrics].sort((left, right) => {
    const leftTime = Date.parse(left.instance.updatedAt) || 0;
    const rightTime = Date.parse(right.instance.updatedAt) || 0;
    return rightTime - leftTime || left.instance.displayName.localeCompare(right.instance.displayName);
  });
}

function upsertDerivedMetricAsset(metrics: DerivedMetricAsset[], metric: DerivedMetricAsset): DerivedMetricAsset[] {
  let found = false;
  const next = metrics.map((entry) => {
    if (entry.instance.instanceId !== metric.instance.instanceId) return entry;
    found = true;
    return metric;
  });
  if (!found) {
    next.unshift(metric);
  }
  return sortDerivedMetricAssets(next);
}

function dashboardPointNames(dashboard: DashboardRecord | null): string[] {
  if (!dashboard) return [];
  return [...new Set(dashboard.widgets.flatMap((widget) =>
    widget.pointBindings
      .filter((binding) => binding.source !== "derived_metric" && !binding.metricInstanceId && !binding.metricKey && !binding.entityId)
      .map((binding) => binding.pointName)
      .filter((value): value is string => Boolean(value))
  ))].sort((left, right) => left.localeCompare(right));
}

type AppDashboardWidget = DashboardRecord["widgets"][number];
type AppDashboardSection = NonNullable<DashboardRecord["sections"]>[number];
const DASHBOARD_LAYOUT_VERSION = 2;

function dashboardWidgetSectionInfo(widget: AppDashboardWidget): Pick<AppDashboardSection, "id" | "title" | "kind"> {
  if (widget.kind === "timeseries_chart") return { id: "trends", title: "Trends", kind: "trends" };
  if (widget.kind === "bar_comparison") return { id: "comparison", title: "Comparison", kind: "comparison" };
  if (widget.kind === "note") return { id: "notes", title: "Notes", kind: "custom" };
  return { id: "overview", title: "Overview", kind: "overview" };
}

function sectionsForDashboardSpec(dashboard: DashboardRecord): AppDashboardSection[] {
  const widgetIds = new Set(dashboard.widgets.map((widget) => widget.id));
  const usedWidgetIds = new Set<string>();
  const explicitSections = (dashboard.sections ?? [])
    .map((section) => ({ ...section, widgetIds: section.widgetIds.filter((widgetId) => widgetIds.has(widgetId)) }))
    .filter((section) => section.widgetIds.length > 0);
  for (const section of explicitSections) {
    for (const widgetId of section.widgetIds) usedWidgetIds.add(widgetId);
  }
  const fallbackById = new Map<string, AppDashboardSection>();
  for (const widget of dashboard.widgets) {
    if (usedWidgetIds.has(widget.id)) continue;
    const info = dashboardWidgetSectionInfo(widget);
    const section = fallbackById.get(info.id) ?? { ...info, widgetIds: [] };
    section.widgetIds.push(widget.id);
    fallbackById.set(info.id, section);
  }
  return [
    ...explicitSections,
    ...["overview", "comparison", "trends", "notes"].map((id) => fallbackById.get(id)).filter((section): section is AppDashboardSection => Boolean(section))
  ];
}

function widgetSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "") || "widget";
}

function uniqueDashboardWidgetId(baseId: string, existingIds: Set<string>): string {
  const base = widgetSlug(baseId);
  let candidate = `${base}-copy`;
  let index = 2;
  while (existingIds.has(candidate)) {
    candidate = `${base}-copy-${index}`;
    index += 1;
  }
  return candidate;
}

function cloneWidgetIntoDashboard(widget: AppDashboardWidget, existingIds: Set<string>, titleSuffix = " Copy"): AppDashboardWidget {
  const id = uniqueDashboardWidgetId(widget.id, existingIds);
  existingIds.add(id);
  return {
    ...widget,
    id,
    title: `${widget.title}${titleSuffix}`,
    pointBindings: widget.pointBindings.map((binding, index) => ({
      ...binding,
      ...(binding.id ? { id: `${binding.id}-copy-${index}` } : {})
    }))
  };
}

function defaultLayoutForDashboardWidget(widget: AppDashboardWidget, y: number): DashboardRecord["layout"][number] {
  if (widget.kind === "timeseries_chart") return { widgetId: widget.id, x: 0, y, w: 6, h: 4 };
  if (widget.kind === "bar_comparison") return { widgetId: widget.id, x: 0, y, w: 6, h: 3 };
  if (widget.kind === "live_value_grid") return { widgetId: widget.id, x: 0, y, w: 3, h: widget.pointBindings.length > 2 ? 3 : 2 };
  if (widget.kind === "note") return { widgetId: widget.id, x: 0, y, w: 3, h: 2 };
  return { widgetId: widget.id, x: 0, y, w: 3, h: 2 };
}

function layoutMaxY(layout: DashboardRecord["layout"], widgetIds: string[]): number {
  const ids = new Set(widgetIds);
  return layout
    .filter((item) => ids.has(item.widgetId))
    .reduce((max, item) => Math.max(max, item.y + item.h), 0);
}

function normalizeLayoutForDashboardSections(layout: DashboardRecord["layout"], sections: AppDashboardSection[]): DashboardRecord["layout"] {
  const layoutByWidgetId = new Map(layout.map((item) => [item.widgetId, item]));
  return sections.flatMap((section) => {
    const items = section.widgetIds
      .map((widgetId) => layoutByWidgetId.get(widgetId))
      .filter((item): item is DashboardRecord["layout"][number] => Boolean(item));
    const minY = items.length > 0 ? Math.min(...items.map((item) => item.y)) : 0;
    return items.map((item) => ({ ...item, y: Math.max(0, item.y - minY) }));
  });
}

function sectionMatchKey(section: AppDashboardSection): string {
  return section.kind === "custom" ? `custom:${section.id}` : section.kind;
}

function uniqueSectionId(baseId: string, sections: AppDashboardSection[]): string {
  const existing = new Set(sections.map((section) => section.id));
  const base = widgetSlug(baseId);
  let candidate = base;
  let index = 2;
  while (existing.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

function mergeDashboardIntoTarget(source: DashboardRecord, target: DashboardRecord): {
  layout: DashboardRecord["layout"];
  widgets: DashboardRecord["widgets"];
  sections: AppDashboardSection[];
} {
  const nextWidgets = [...target.widgets];
  const nextSections = sectionsForDashboardSpec(target).map((section) => ({ ...section, widgetIds: [...section.widgetIds] }));
  const nextLayout = normalizeLayoutForDashboardSections(target.layout, nextSections);
  const sourceSections = sectionsForDashboardSpec(source);
  const sourceLayoutByWidgetId = new Map(source.layout.map((item) => [item.widgetId, item]));
  const existingWidgetIds = new Set(nextWidgets.map((widget) => widget.id));

  for (const sourceSection of sourceSections) {
    let targetSection = nextSections.find((section) => sectionMatchKey(section) === sectionMatchKey(sourceSection));
    if (!targetSection) {
      targetSection = {
        id: uniqueSectionId(sourceSection.id, nextSections),
        title: sourceSection.title,
        kind: sourceSection.kind,
        widgetIds: []
      };
      nextSections.push(targetSection);
    }

    const sourceLayoutItems = sourceSection.widgetIds
      .map((widgetId) => sourceLayoutByWidgetId.get(widgetId))
      .filter((item): item is DashboardRecord["layout"][number] => Boolean(item));
    const minSourceY = sourceLayoutItems.length > 0 ? Math.min(...sourceLayoutItems.map((item) => item.y)) : 0;
    const targetBaseY = layoutMaxY(nextLayout, targetSection.widgetIds);

    for (const sourceWidgetId of sourceSection.widgetIds) {
      const sourceWidget = source.widgets.find((widget) => widget.id === sourceWidgetId);
      if (!sourceWidget) continue;
      const clonedWidget = cloneWidgetIntoDashboard(sourceWidget, existingWidgetIds);
      const sourceItem = sourceLayoutByWidgetId.get(sourceWidgetId) ?? defaultLayoutForDashboardWidget(sourceWidget, 0);
      nextWidgets.push(clonedWidget);
      targetSection.widgetIds.push(clonedWidget.id);
      nextLayout.push({
        widgetId: clonedWidget.id,
        x: sourceItem.x,
        y: targetBaseY + Math.max(0, sourceItem.y - minSourceY),
        w: sourceItem.w,
        h: sourceItem.h
      });
    }
  }

  const validIds = new Set(nextWidgets.map((widget) => widget.id));
  return {
    widgets: nextWidgets,
    layout: nextLayout.filter((item) => validIds.has(item.widgetId)),
    sections: nextSections
      .map((section) => ({ ...section, widgetIds: section.widgetIds.filter((widgetId) => validIds.has(widgetId)) }))
      .filter((section) => section.widgetIds.length > 0)
  };
}

function dashboardChoiceLines(dashboards: DashboardRecord[]): string {
  return dashboards.map((dashboard, index) => {
    const visibility = dashboard.visibility === "project" ? "Shared" : "Private";
    return `${index + 1}. ${dashboard.title} - ${dashboard.widgets.length} widgets - ${visibility}`;
  }).join("\n");
}

function findDashboardChoice(dashboards: DashboardRecord[], requested: string): DashboardRecord | undefined {
  const trimmed = requested.trim();
  const index = Number(trimmed);
  if (Number.isInteger(index) && index >= 1 && index <= dashboards.length) {
    return dashboards[index - 1];
  }
  const normalized = trimmed.toLowerCase();
  return dashboards.find((dashboard) => (
    dashboard.title.toLowerCase() === normalized
    || dashboard.id === trimmed
  ));
}

const AUTO_FLIP_DETAILS_MENU_SELECTOR = [
  "details.dashboard-panel-menu",
  "details.dashboard-artifact-menu",
  "details.workspace-right-dashboard-menu",
  "details.workspace-project-menu",
  "details.workspace-sidebar-account-menu"
].join(", ");

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/gu, "\\$&");
}

function shouldOpenMenuUp(triggerRect: DOMRect, menuHeight: number): boolean {
  const viewportGap = 18;
  const composer = triggerRect.bottom < window.innerHeight
    ? document.querySelector<HTMLElement>(".chat-shell .composer")
    : null;
  const composerRect = composer?.getBoundingClientRect();
  const effectiveViewportBottom = composerRect
    ? Math.min(window.innerHeight, Math.max(0, composerRect.top - 10))
    : window.innerHeight;
  const spaceBelow = effectiveViewportBottom - triggerRect.bottom;
  const spaceAbove = triggerRect.top;
  return spaceBelow < menuHeight + viewportGap && spaceAbove > spaceBelow;
}

function isPopoverOpen(menu: HTMLElement): boolean {
  try {
    return menu.matches(":popover-open");
  } catch {
    return false;
  }
}

function updateDetailsMenuDirection(details: HTMLDetailsElement): void {
  if (!details.open) {
    details.classList.remove("is-menu-up");
    return;
  }
  const trigger = details.querySelector<HTMLElement>("summary");
  const menu = details.querySelector<HTMLElement>(":scope > ul");
  if (!trigger || !menu) {
    details.classList.remove("is-menu-up");
    return;
  }
  details.classList.toggle("is-menu-up", shouldOpenMenuUp(trigger.getBoundingClientRect(), menu.getBoundingClientRect().height));
}

function updatePopoverMenuPosition(menu: HTMLElement): void {
  if (!menu.id || !isPopoverOpen(menu)) return;
  const trigger = document.querySelector<HTMLElement>(`[popovertarget="${cssEscape(menu.id)}"]`);
  if (!trigger) return;

  const triggerRect = trigger.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const gap = 6;
  const viewportPadding = 8;
  const menuHeight = menuRect.height;
  const openUp = shouldOpenMenuUp(triggerRect, menuHeight);
  const top = openUp
    ? Math.max(viewportPadding, triggerRect.top - menuHeight - gap)
    : Math.min(triggerRect.bottom + gap, window.innerHeight - menuHeight - viewportPadding);

  menu.classList.toggle("is-menu-up", openUp);
  menu.style.top = `${top}px`;
  menu.style.right = `${Math.max(viewportPadding, window.innerWidth - triggerRect.right)}px`;
  menu.style.bottom = "auto";
  menu.style.left = "auto";
}

function updateOpenMenus(): void {
  document.querySelectorAll<HTMLDetailsElement>(AUTO_FLIP_DETAILS_MENU_SELECTOR).forEach((details) => {
    updateDetailsMenuDirection(details);
  });
  document.querySelectorAll<HTMLElement>(".conversation-menu-list[popover]").forEach((menu) => {
    updatePopoverMenuPosition(menu);
  });
}

function useAutoFlipMenus(): void {
  useEffect(() => {
    const scheduleUpdate = () => {
      window.requestAnimationFrame(updateOpenMenus);
    };
    const closeDetailsMenus = (target: EventTarget | null) => {
      document.querySelectorAll<HTMLDetailsElement>(`${AUTO_FLIP_DETAILS_MENU_SELECTOR}[open]`).forEach((details) => {
        if (target instanceof Node && details.contains(target)) return;
        details.open = false;
        details.classList.remove("is-menu-up");
      });
    };
    const handleToggle = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.matches(AUTO_FLIP_DETAILS_MENU_SELECTOR) || target.matches(".conversation-menu-list[popover]")) {
        scheduleUpdate();
      }
    };
    const handlePointerDown = (event: Event) => {
      closeDetailsMenus(event.target);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closeDetailsMenus(null);
    };

    document.addEventListener("toggle", handleToggle, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("click", scheduleUpdate, true);
    document.addEventListener("scroll", scheduleUpdate, true);
    document.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      document.removeEventListener("toggle", handleToggle, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("click", scheduleUpdate, true);
      document.removeEventListener("scroll", scheduleUpdate, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, []);
}

function mergeMessagesWithStreamingState(
  messages: ChatMessage[],
  streamState: ConversationStreamState | undefined
): ChatMessage[] {
  if (!streamState) {
    return messages;
  }
  const optimisticUserContent = streamState.optimisticUser.content.trim();
  const persistedUserIndex = optimisticUserContent.length > 0
    ? messages.findIndex((message) =>
      message.role === "user"
      && !message.id.startsWith("pending_user_")
      && message.content.trim() === optimisticUserContent
    )
    : -1;
  const persistedAssistantAfterUser = persistedUserIndex >= 0
    ? messages.slice(persistedUserIndex + 1).some((message) =>
      message.role === "assistant" && !message.id.startsWith("streaming_")
    )
    : false;
  if (persistedAssistantAfterUser) {
    return messages.filter((message) =>
      message.id !== streamState.optimisticUser.id
      && message.id !== streamState.streamingAssistant.id
      && !message.id.startsWith("pending_user_")
      && !message.id.startsWith("streaming_")
    );
  }
  const withoutOptimistic = messages.filter(
    (message) =>
      message.id !== streamState.optimisticUser.id
      && message.id !== streamState.streamingAssistant.id
      && !(message.role === "user" && optimisticUserContent.length > 0 && message.content.trim() === optimisticUserContent)
      && !(message.role === "assistant" && message.id.startsWith("streaming_"))
  );
  return [...withoutOptimistic, streamState.optimisticUser, streamState.streamingAssistant];
}

function formatElapsedTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function computeStreamingWorkMs(
  workElapsedMs: number,
  workSegmentStartedAt: number | null,
  now = Date.now()
): number {
  return workElapsedMs + (workSegmentStartedAt != null ? Math.max(0, now - workSegmentStartedAt) : 0);
}

function streamShowsWorkedFor(
  state: Pick<ConversationStreamState, "workTimelinePaused" | "streamTimelineFinalized"> | null | undefined
): boolean {
  if (!state) return false;
  return state.streamTimelineFinalized || state.workTimelinePaused;
}

function activitiesHaveRunningTools(activities: ChatStreamActivityEvent[]): boolean {
  return activities.some((activity) => activity.kind === "tool" && activity.status === "running");
}

function pauseWorkingTimelineForStream(turn: StreamingTurnState): void {
  if (turn.streamTimelineFinalized) return;
  const now = Date.now();
  if (turn.workSegmentStartedAt != null) {
    turn.workElapsedMs += Math.max(0, now - turn.workSegmentStartedAt);
    turn.workSegmentStartedAt = null;
  }
  turn.workTimelinePaused = true;
}

function resumeWorkingTimelineForOngoingTask(turn: StreamingTurnState): void {
  if (turn.streamTimelineFinalized || !turn.workTimelinePaused) return;
  turn.workTimelinePaused = false;
  turn.workSegmentStartedAt = Date.now();
  turn.answerPhase = false;
}

function streamingWorkFieldsFromTurn(turn: StreamingTurnState): Pick<
  ConversationStreamState,
  "workElapsedMs" | "workSegmentStartedAt" | "workTimelinePaused" | "answerPhase"
> {
  return {
    workElapsedMs: turn.workElapsedMs,
    workSegmentStartedAt: turn.workSegmentStartedAt,
    workTimelinePaused: turn.workTimelinePaused,
    answerPhase: turn.answerPhase
  };
}

function activityIcon(kind: ChatStreamActivityEvent["kind"], label: string): IconName {
  const normalized = label.toLowerCase();
  if (kind === "tool" && normalized.includes("search")) return "file-search";
  if (kind === "tool" && normalized.includes("edit")) return "edit-3";
  if (kind === "file" || normalized.includes("read")) return "file-text";
  if (kind === "tool" && (normalized.includes("ran") || normalized.includes("running") || normalized.includes("command"))) return "terminal";
  if (kind === "kb") return "book-open";
  if (kind === "memory") return "clock";
  if (kind === "response") return "message";
  return "activity";
}

function ActivityRow({ activity, streaming, isLast }: { activity: ChatStreamActivityEvent; streaming: boolean; isLast: boolean }) {
  if (activity.kind !== "tool") {
    const running = streaming && isLast;
    const { thinkingBlocks, visibleText } = parseActivityLabel(activity.label);
    if (thinkingBlocks.length === 0) {
      if (!visibleText) {
        return null;
      }
      return (
        <p className={`activity-progress-text activity-context-narration${running ? " is-running" : ""}`}>
          {visibleText}
        </p>
      );
    }
    return (
      <>
        <ThinkDetails
          blocks={thinkingBlocks}
          runningLastBlock={running && !visibleText}
        />
        {visibleText ? (
          <p className={`activity-progress-text activity-context-narration${running ? " is-running" : ""}`}>
            {visibleText}
          </p>
        ) : null}
      </>
    );
  }
  const details = [activity.detail, activity.exitCode !== undefined ? `exit ${activity.exitCode}` : undefined, activity.durationMs !== undefined ? `${activity.durationMs}ms` : undefined, activity.output]
    .filter((item): item is string => Boolean(item && item.trim()));
  const icon = activityIcon(activity.kind, activity.label);
  // A tool row is "running" only while we're still streaming AND the most recent
  // event for it was tool_started. Once we're past streaming (history replay or
  // post-done state), always render the completed-tense label that the server
  // sent on tool_completed — never show the running tense.
  const running = streaming && activity.status === "running";
  return (
    <details className={`activity-row activity-${activity.kind}${running ? " is-running" : ""}`}>
      <summary className="activity-row-summary">
        <span className="activity-row-icon"><Icon name={icon} /></span>
        <span className="activity-row-label">{activity.label}</span>
        <Icon name="chevron-down" className="activity-row-chevron" />
      </summary>
      {details.length > 0 ? (
        <div className="activity-row-details">
          {details.map((detail, index) => <p key={index}>{detail}</p>)}
        </div>
      ) : null}
    </details>
  );
}

function ChatWorkspace({ project, user, token, messages, dashboards, activeConversationId, onSend, onOpenDashboard, busy, provider, requestId, streamingActivity, streamInterimNarration, streamWorkElapsedMs = 0, streamWorkSegmentStartedAt = null, streamOutputStarted, streamAnswerPhase = false, streamTick = 0, onStop }: { project: ProjectSummary; user: UserSummary | null; token: string; messages: ChatMessage[]; dashboards: DashboardRecord[]; activeConversationId: string | null; onSend: (message: string) => Promise<void>; onOpenDashboard: (dashboardId: string) => void; busy: boolean; provider: ChatProviderDiagnostics | null; requestId?: string | undefined; streamingActivity?: ChatStreamActivityEvent[]; streamInterimNarration?: string; streamWorkElapsedMs?: number; streamWorkSegmentStartedAt?: number | null; streamOutputStarted: boolean; streamAnswerPhase?: boolean; streamTick?: number; onStop: () => void }) {
  const [draft, setDraft] = useState("");
  const [leavingEmptyState, setLeavingEmptyState] = useState(false);
  const [timelineCollapsed, setTimelineCollapsed] = useState<Record<string, boolean>>({});
  const [lightbox, setLightbox] = useState<{ images: string[]; alts: string[]; index: number } | null>(null);
  const [voiceState, setVoiceState] = useState<"idle" | "recording" | "transcribing" | "error">("idle");
  const [voiceError, setVoiceError] = useState("");
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(90).fill(0));
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLElement | null>(null);
  const previousConversationRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const submitInFlightRef = useRef(false);
  const wasEmptyRef = useRef(messages.length === 0);
  const userScrolledUpRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const pcmBuffersRef = useRef<Float32Array[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const canWrite = project.permissions.includes("chat:write");
  const hasMessages = messages.length > 0;
  const latestMessage = messages[messages.length - 1];
  const latestMessageId = latestMessage?.id ?? "";
  const latestMessageKey = `${messages.length}:${latestMessageId}`;
  const emptyChatGreeting = `Hi ${user?.name ?? "there"}, how are you today?`;
  const activities = streamingActivity ?? [];
  const isRecording = voiceState === "recording";
  const isTranscribing = voiceState === "transcribing";

  const resolveImageUrl = (rawUrl: string): string => {
    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://") || rawUrl.startsWith("/") || rawUrl.startsWith("#") || rawUrl.startsWith("mailto:") || rawUrl.startsWith("data:")) {
      return rawUrl;
    }
    // Normalize wrong paths: ../kb/outputs/foo.png or kb/outputs/foo.png → outputs/foo.png
    let normalized = rawUrl;
    const kbMatch = normalized.match(/(?:^|\.\.\/|\/)kb\/outputs\/(.+)/);
    if (kbMatch) {
      normalized = `outputs/${kbMatch[1]}`;
    }
    const params = new URLSearchParams();
    if (token) {
      params.set("token", token);
    }
    const query = params.size > 0 ? `?${params.toString()}` : "";
    return `/api/projects/${encodeURIComponent(project.id)}/repository/files/${normalized}${query}`;
  };

  // Lightbox keyboard navigation
  useEffect(() => {
    if (!lightbox) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setLightbox(null);
      } else if (event.key === "ArrowRight") {
        setLightbox((cur) => cur ? { ...cur, index: Math.min(cur.images.length - 1, cur.index + 1) } : null);
      } else if (event.key === "ArrowLeft") {
        setLightbox((cur) => cur ? { ...cur, index: Math.max(0, cur.index - 1) } : null);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [lightbox]);

  // Timer for streaming elapsed time is now managed by parent component

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

  // Track user scroll position
  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = list;
      userScrolledUpRef.current = scrollTop + clientHeight < scrollHeight - 32;
    };
    list.addEventListener("scroll", handleScroll, { passive: true });
    return () => list.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll: only when at bottom or on new message/activity
  useEffect(() => {
    if (!hasMessages) {
      previousConversationRef.current = null;
      userScrolledUpRef.current = false;
      return;
    }

    const behavior: ScrollBehavior = previousConversationRef.current !== activeConversationId ? "auto" : "smooth";
    previousConversationRef.current = activeConversationId;
    if (!userScrolledUpRef.current) {
      requestAnimationFrame(() => {
        messageEndRef.current?.scrollIntoView({ block: "end", behavior });
      });
    }
  }, [activeConversationId, hasMessages, latestMessageKey]);

  // Scroll on new activity as well
  useEffect(() => {
    if (!userScrolledUpRef.current && activities.length > 0) {
      requestAnimationFrame(() => {
        messageEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
      });
    }
  }, [activities.length]);

  async function submitDraft() {
    if (submitInFlightRef.current || !draft.trim() || busy) {
      return;
    }
    submitInFlightRef.current = true;
    const message = draft.trim();
    setDraft("");
    userScrolledUpRef.current = false;
    try {
      await onSend(message);
    } finally {
      submitInFlightRef.current = false;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitDraft();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends message, Ctrl+Enter or Cmd+Enter inserts newline
    if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      void submitDraft();
    }
  }

  async function handleStartRecording() {
    if (!canWrite || busy) return;

    // Set recording state first
    setVoiceState("recording");
    setVoiceError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      pcmBuffersRef.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;

      // Setup audio analysis for waveform visualization AND PCM extraction
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;

      // Create ScriptProcessorNode to extract PCM data
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Copy to our buffer
        pcmBuffersRef.current.push(new Float32Array(inputData));
      };

      source.connect(analyser);
      source.connect(processor);
      processor.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      processorRef.current = processor;

      // Start visualizing audio levels
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const smoothedLevels = new Array(90).fill(0);

      const updateLevels = () => {
        if (!analyserRef.current) return;
        analyser.getByteFrequencyData(dataArray);

        // Get average volume for the leftmost point
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const average = sum / dataArray.length / 255;

        // Amplify the signal for better visibility (3x boost)
        const amplified = Math.min(1, average * 3);

        // Shift all values to the right (each point copies its left neighbor)
        for (let i = smoothedLevels.length - 1; i > 0; i--) {
          smoothedLevels[i] = smoothedLevels[i - 1];
        }

        // Set the leftmost point to current audio level
        smoothedLevels[0] = amplified;

        // Copy to state with slight randomness for natural feel
        const levels = smoothedLevels.map((level) => {
          const noise = (Math.random() - 0.5) * 0.04;
          return Math.max(0, Math.min(1, level + noise));
        });

        setAudioLevels(levels);
        animationFrameRef.current = requestAnimationFrame(updateLevels);
      };
      updateLevels();
    } catch (error) {
      setVoiceState("error");
      setVoiceError(error instanceof Error && error.name === "NotAllowedError" ? "Microphone permission denied" : "Could not access microphone");
    }
  }

  function handleCancelRecording() {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    audioChunksRef.current = [];
    setAudioLevels(new Array(90).fill(0));
    setVoiceState("idle");
    setVoiceError("");
  }

  async function handleConfirmRecording() {
    if (!mediaRecorderRef.current) return;
    const recorder = mediaRecorderRef.current;

    setVoiceState("transcribing");

    // Wait for recorder to stop and collect all data
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });

    recorder.stream.getTracks().forEach((track) => track.stop());

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    try {
      // Get token from localStorage
      const stored = window.localStorage.getItem("building-agent.session.v1");
      const token = stored ? (JSON.parse(stored) as { token?: string }).token : "";

      if (!token) {
        throw new Error("Authentication required");
      }

      // Convert Float32Array PCM buffers to WAV file
      const pcmBuffers = pcmBuffersRef.current;
      if (pcmBuffers.length === 0) {
        throw new Error("No audio data recorded");
      }

      // Calculate total length
      const totalSamples = pcmBuffers.reduce((sum, buf) => sum + buf.length, 0);
      const pcm16 = new Int16Array(totalSamples);
      let offset = 0;

      for (const buffer of pcmBuffers) {
        for (let i = 0; i < buffer.length; i++) {
          // Convert float32 [-1, 1] to int16 [-32768, 32767]
          const s = Math.max(-1, Math.min(1, buffer[i] ?? 0));
          pcm16[offset++] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
      }

      // Create WAV file header
      const sampleRate = 16000;
      const numChannels = 1;
      const bitsPerSample = 16;
      const byteRate = sampleRate * numChannels * bitsPerSample / 8;
      const blockAlign = numChannels * bitsPerSample / 8;
      const dataSize = pcm16.length * 2;
      const wavHeader = new ArrayBuffer(44);
      const view = new DataView(wavHeader);

      // "RIFF" chunk descriptor
      view.setUint32(0, 0x52494646, false); // "RIFF"
      view.setUint32(4, 36 + dataSize, true); // file size - 8
      view.setUint32(8, 0x57415645, false); // "WAVE"

      // "fmt " sub-chunk
      view.setUint32(12, 0x666d7420, false); // "fmt "
      view.setUint32(16, 16, true); // fmt chunk size
      view.setUint16(20, 1, true); // audio format (1 = PCM)
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, byteRate, true);
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, bitsPerSample, true);

      // "data" sub-chunk
      view.setUint32(36, 0x64617461, false); // "data"
      view.setUint32(40, dataSize, true);

      const audioBlob = new Blob([wavHeader, pcm16.buffer], { type: "audio/wav" });
      console.log("Audio blob size:", audioBlob.size, "bytes (WAV 16-bit, 16kHz)");

      if (audioBlob.size === 0) {
        throw new Error("No audio data recorded");
      }

      const response = await fetch("/api/stt/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "audio/wav",
          "Authorization": `Bearer ${token}`
        },
        body: audioBlob
      });

      if (!response.ok) {
        throw new Error("Transcription failed");
      }

      const result = await response.json();
      console.log("Transcription result:", result);
      const text = result.text || "";
      console.log("Transcribed text:", text);
      setDraft((current) => (current ? `${current} ${text}` : text).trim());
      setVoiceState("idle");
      setVoiceError("");
    } catch (error) {
      setVoiceState("error");
      setVoiceError(error instanceof Error ? error.message : "Transcription failed");
      setTimeout(() => {
        setVoiceState("idle");
        setVoiceError("");
      }, 3000);
    } finally {
      mediaRecorderRef.current = null;
      pcmBuffersRef.current = [];
      audioChunksRef.current = [];
      setAudioLevels(new Array(90).fill(0));
    }
  }

  return (
    <section className={`chat-shell${hasMessages ? " chat-shell-active" : " chat-shell-empty"}${leavingEmptyState ? " chat-shell-leaving-empty" : ""}`} aria-labelledby="chat-title">
      <h2 id="chat-title" className="visually-hidden">{project.name} chat</h2>
      <section className="message-list" aria-label={`${project.name} messages`} ref={messageListRef}>
        {messages.length === 0 && busy ? <div className="workspace-inline-status" role="status">Sending...</div> : null}
        {messages.map((message) => {
          const isStreaming = message.id.startsWith("streaming_");
          const isThinking = message.id.startsWith("pending_assistant_");
          const messageActivities = isStreaming ? activities : (message.activities ?? []);
          const hasActivity = messageActivities.length > 0 || isStreaming;
          const hasContent = message.content.trim().length > 0;
          const showRunningTimeline = isStreaming && !streamOutputStarted;
          const isCollapsed = timelineCollapsed[message.id] ?? true;
          void streamTick;
          const timelineDurationMs = isStreaming
            ? computeStreamingWorkMs(streamWorkElapsedMs, streamWorkSegmentStartedAt)
            : (message.workDuration ?? 0);
          const timelineTitle = showRunningTimeline
            ? `Working for ${formatElapsedTime(timelineDurationMs)}`
            : `Worked for ${formatElapsedTime(timelineDurationMs)}`;
          const answerText = message.role === "assistant"
            ? (isStreaming ? message.content : stripThinkingFromAnswer(message.content))
            : message.content;
          const liveInterimNarration = isStreaming && !streamAnswerPhase ? (streamInterimNarration ?? "") : "";
          const dashboardReferences = message.role === "assistant"
            ? extractDashboardReferences(answerText, dashboards)
            : [];

          return (
            <article className={`message message-${message.role}${isThinking ? " message-thinking" : ""}${isStreaming ? " message-streaming" : ""}`} key={message.id} aria-label={`${message.role === "assistant" ? "Assistant" : "You"} message`}>
              <div className="message-content" onClick={(event) => {
                const target = event.target as HTMLElement;
                if (!target.classList.contains("md-image")) return;
                const article = target.closest(".message");
                if (!article) return;
                const imgs = article.querySelectorAll<HTMLImageElement>(".md-image");
                const imgArray: string[] = [];
                const altArray: string[] = [];
                let clickedIndex = 0;
                imgs.forEach((img, i) => {
                  imgArray.push(img.src);
                  altArray.push(img.alt);
                  if (img === target) clickedIndex = i;
                });
                if (imgArray.length > 0) setLightbox({ images: imgArray, alts: altArray, index: clickedIndex });
              }}>
                {message.role === "user" ? (
                  <p>{message.content}</p>
                ) : (
                  <>
                    {hasActivity ? (
                      showRunningTimeline ? (
                        <section className="worked-timeline worked-timeline-running" aria-label="Assistant activity">
                          <div className="worked-timeline-header" aria-live="polite">
                            <span className="worked-timeline-title is-running">{timelineTitle}</span>
                          </div>
                          <div className="worked-timeline-content">
                            {messageActivities.length > 0 ? messageActivities.map((act, i) => (
                              <ActivityRow
                                key={act.id ?? `${act.kind}-${act.label}-${i}`}
                                activity={act}
                                streaming={true}
                                isLast={i === messageActivities.length - 1 && !liveInterimNarration.trim()}
                              />
                            )) : (
                              <p className="activity-progress-text activity-progress-pending is-running">Working</p>
                            )}
                          </div>
                        </section>
                      ) : (
                        <details
                          className={`worked-timeline worked-timeline-done${isStreaming && streamOutputStarted ? " worked-timeline-output-streaming" : ""}`}
                          open={isStreaming && streamOutputStarted ? false : !isCollapsed}
                          onToggle={(e) => setTimelineCollapsed((prev) => ({ ...prev, [message.id]: !(e.target as HTMLDetailsElement).open }))}
                        >
                          <summary className="worked-timeline-header">
                            <span className="worked-timeline-header-label">
                              <span className="worked-timeline-title">{timelineTitle}</span>
                              <Icon name="chevron-down" className="worked-timeline-chevron" />
                            </span>
                          </summary>
                          <div className="worked-timeline-content">
                            {messageActivities.map((act, i) => (
                              <ActivityRow key={act.id ?? `${act.kind}-${act.label}-${i}`} activity={act} streaming={false} isLast={false} />
                            ))}
                          </div>
                        </details>
                      )
                    ) : null}
                    {liveInterimNarration.trim() ? (
                      <div className="activity-context-block is-running">
                        <Markdown source={liveInterimNarration} resolveImageUrl={resolveImageUrl} />
                      </div>
                    ) : null}
                    {hasContent ? (() => {
                      if (!answerText.trim() || (isStreaming && !streamOutputStarted && !streamAnswerPhase)) {
                        return null;
                      }
                      return (
                        <div className="final-answer">
                          <Markdown source={answerText} resolveImageUrl={resolveImageUrl} />
                        </div>
                      );
                    })() : isStreaming && !hasActivity ? (
                      <div className="final-answer-placeholder">
                        <span className="spinner" aria-hidden="true" />
                        <span>Thinking...</span>
                      </div>
                    ) : null}
                    {dashboardReferences.length > 0 ? (
                      <div className="dashboard-artifact-list">
                        {dashboardReferences.map((reference) => (
                          <DashboardArtifactCard
                            key={`${message.id}-${reference.id}`}
                            reference={reference}
                            projectId={project.id}
                            onOpenDashboard={onOpenDashboard}
                          />
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
                {(() => {
                  const galleryImages = dedupeMessageImages(message.images, message.content);
                  return galleryImages && galleryImages.length > 0 ? <ChatImageGallery images={galleryImages} messageId={message.id} resolveImageUrl={resolveImageUrl} /> : null;
                })()}
              </div>
            </article>
          );
        })}
        <div className="message-list-end" ref={messageEndRef} aria-hidden="true" />
      </section>
      <form className="composer" onSubmit={handleSubmit}>
        {(!hasMessages || leavingEmptyState) ? <p className="composer-empty-greeting">{emptyChatGreeting}</p> : null}
        <div className={`composer-box${isRecording ? " is-recording" : ""}${isTranscribing ? " is-transcribing" : ""}`}>
          <label className="visually-hidden" htmlFor="chat-message">Message</label>
          {isRecording ? (
            <div className="composer-recording-indicator" aria-live="polite">
              <span className="recording-waveform" aria-hidden="true">
                {audioLevels.map((level, i) => {
                  const hasSound = level > 0.05;
                  return hasSound ? (
                    <span key={i} style={{ transform: `scaleY(${Math.max(0.2, level)})` }} />
                  ) : (
                    <span key={i} />
                  );
                })}
              </span>
            </div>
          ) : isTranscribing ? (
            <div className="composer-transcribing-indicator" aria-live="polite">
              <span>Transcribing...</span>
            </div>
          ) : (
            <textarea ref={textareaRef} id="chat-message" rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown} disabled={!canWrite} placeholder={canWrite ? (hasMessages ? "Ask about this project, its knowledge base, or repository files..." : "Ask anything about building") : "This project is read-only for your account."} />
          )}
          <div className="composer-actions">
            {isRecording ? (
              <>
                <button type="button" className="composer-voice-button" onClick={handleCancelRecording} title="Cancel recording" aria-label="Cancel recording">
                  <Icon name="x" />
                </button>
                <button type="button" className="composer-voice-confirm" onClick={handleConfirmRecording} title="Confirm and transcribe" aria-label="Confirm and transcribe">
                  <Icon name="check-check" />
                </button>
              </>
            ) : isTranscribing ? (
              <button type="button" className="composer-transcribing-button" disabled aria-label="Transcribing">
                <Icon name="clock" />
              </button>
            ) : busy ? (
              <button type="button" className="composer-stop-button" onClick={onStop} title="Stop generating" aria-label="Stop generating">
                <Icon name="x" />
              </button>
            ) : (
              <>
                <button type="button" className="composer-voice-button" onClick={handleStartRecording} disabled={!canWrite} title="Voice input" aria-label="Voice input">
                  <svg className="workspace-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <path d="M12 19v3" />
                  </svg>
                </button>
                <button type="submit" disabled={!canWrite || !draft.trim()} aria-label="Send message">
                  <Icon name="arrow-up" />
                </button>
              </>
            )}
          </div>
        </div>
        {!canWrite ? <p className="field-error composer-readonly" role="status">This project does not grant chat write permission.</p> : null}
        {voiceError ? <p className="field-error" role="alert">{voiceError}</p> : null}
      </form>
      {lightbox ? (
        <div className="chat-image-lightbox" role="dialog" aria-modal="true" aria-label={lightbox.alts[lightbox.index] || "Image preview"} onClick={() => setLightbox(null)}>
          <figure className="chat-image-lightbox-figure" onClick={(event) => event.stopPropagation()}>
            <img src={lightbox.images[lightbox.index]} alt={lightbox.alts[lightbox.index]} />
            <figcaption>
              <strong>{lightbox.alts[lightbox.index]}</strong>
              <span> · {lightbox.index + 1} of {lightbox.images.length}</span>
            </figcaption>
            <button type="button" className="chat-image-lightbox-close" onClick={() => setLightbox(null)} aria-label="Close image preview">
              Close
            </button>
          </figure>
        </div>
      ) : null}
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
  onOpenBmsDataConfig,
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
  onOpenBmsDataConfig: () => void;
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
              <span>{activeProjectName}</span>
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
                  onClick={() => onSelectConversation(conversation.id)}
                  disabled={busy}
                  title={conversation.title}
                  aria-current={conversation.id === activeConversationId ? "page" : undefined}
                >
                  <span className="workspace-sidebar-history-title">
                    <Icon name="message" />
                    <span className="workspace-sidebar-history-title-text">{conversation.title}</span>
                  </span>
                </button>
                <span className="conversation-menu">
                  <button type="button" className="conversation-menu-trigger" aria-label="Conversation menu" popovertarget={`conv-menu-${conversation.id}`} style={{ anchorName: `--cm-${conversation.id.replace(/[^a-zA-Z0-9]/g, "")}` }}><Icon name="more" /></button>
                  <ul className="conversation-menu-list" id={`conv-menu-${conversation.id}`} popover="auto" style={{ positionAnchor: `--cm-${conversation.id.replace(/[^a-zA-Z0-9]/g, "")}` }}>
                    <li><button type="button" className="conversation-menu-action" onClick={() => { const title = window.prompt("Rename conversation", conversation.title); if (title && title.trim() && title.trim() !== conversation.title) onRenameConversation(conversation.id, title.trim()); }}>Rename</button></li>
                    <li><button type="button" className="conversation-menu-action conversation-menu-action-danger" onClick={() => { if (window.confirm(`Delete "${conversation.title}"?`)) onDeleteConversation(conversation.id); }}>Delete</button></li>
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
            <button type="button" className="workspace-sidebar-shortcut" onClick={onOpenBmsDataConfig} disabled={!hasProject}>
              <span className="workspace-sidebar-shortcut-icon is-blue"><Icon name="activity" /></span>
              <span>
                <strong>BMS Data Config</strong>
                <small>Configure sources, points, and minimal ingestion tests</small>
              </span>
              <small>{hasProject ? "open" : "locked"}</small>
            </button>
          </li>
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

interface KpiMetricGroup {
  groupKey: string;
  representative: DerivedMetricAsset;
  metrics: DerivedMetricAsset[];
  displayName: string;
}

function humanizeMetricKey(metricKey: string): string {
  return metricKey
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.length <= 3 ? part.toUpperCase() : `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function kpiMetricGroupKey(asset: DerivedMetricAsset): string {
  const normalized = `${asset.instance.metricType} ${asset.instance.metricKey}`.toLowerCase();
  const assetKind = /\b(fdd|fd|fault|detection|diagnostic)\b/u.test(normalized) ? "fdd" : "kpi";
  return `${assetKind}:${asset.instance.metricKey}:${asset.instance.formulaVersion}`;
}

function groupDisplayName(asset: DerivedMetricAsset, count: number): string {
  if (count > 1) {
    return humanizeMetricKey(asset.instance.metricKey);
  }
  return asset.instance.displayName;
}

function formatEntityId(entityId: string): string {
  return entityId.replace(/_/gu, "-");
}

function formatEntityLabel(asset: DerivedMetricAsset): string {
  const entityId = formatEntityId(asset.instance.entityId);
  const entityName = asset.instance.entityName?.trim();
  if (!entityName || entityName === asset.instance.entityId || entityName === entityId) {
    return entityId;
  }
  return `${entityName} (${entityId})`;
}

function groupDerivedMetricAssets(metrics: DerivedMetricAsset[]): KpiMetricGroup[] {
  const grouped = new Map<string, DerivedMetricAsset[]>();
  for (const metric of metrics) {
    const key = kpiMetricGroupKey(metric);
    grouped.set(key, [...(grouped.get(key) ?? []), metric]);
  }
  return [...grouped.entries()]
    .map(([groupKey, entries]) => {
      const sorted = entries.slice().sort((left, right) =>
        left.instance.entityId.localeCompare(right.instance.entityId)
      );
      const representative = sorted[0]!;
      return {
        groupKey,
        representative,
        metrics: sorted,
        displayName: groupDisplayName(representative, sorted.length)
      };
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function formatDerivedMetricValue(asset: DerivedMetricAsset): string {
  const latest = asset.latest;
  if (!latest) return "N/A";
  const unit = asset.instance.unit ? ` ${asset.instance.unit}` : "";
  if (typeof latest.valueNum === "number" && Number.isFinite(latest.valueNum)) {
    return `${Number(latest.valueNum.toFixed(3)).toLocaleString()}${unit}`;
  }
  return latest.valueText ?? "N/A";
}

function derivedAssetKindLabel(asset: DerivedMetricAsset): "FDD" | "KPI" {
  const normalized = `${asset.instance.metricType} ${asset.instance.metricKey}`.toLowerCase();
  return /\b(fdd|fd|fault|detection|diagnostic)\b/u.test(normalized) ? "FDD" : "KPI";
}

function materializationEnabled(asset: DerivedMetricAsset): boolean {
  return asset.materialization?.enabled === true;
}

function groupMaterializationEnabled(group: KpiMetricGroup): boolean {
  return group.metrics.length > 0 && group.metrics.every(materializationEnabled);
}

function groupMaterializationStatus(group: KpiMetricGroup): string {
  const enabledCount = group.metrics.filter(materializationEnabled).length;
  if (enabledCount === group.metrics.length) return "On";
  if (enabledCount === 0) return "Off";
  return `${enabledCount}/${group.metrics.length} On`;
}

function metricBackgroundCalculationStatus(asset: DerivedMetricAsset): string {
  if (!asset.materialization) return "Not set";
  return asset.materialization.enabled ? "On" : "Off";
}

function dependencyDisplayName(dependency: DerivedMetricAsset["instance"]["dependencies"][number]): string {
  return dependency.label ?? dependency.pointName ?? dependency.objectRef ?? dependency.sourceId ?? dependency.role;
}

function dependencySourceLabel(dependency: DerivedMetricAsset["instance"]["dependencies"][number]): string {
  const source = dependency.pointName ?? dependency.objectRef ?? dependency.sourceId;
  return [source, dependency.unit].filter(Boolean).join(" · ");
}

function dependencyIconName(dependency: DerivedMetricAsset["instance"]["dependencies"][number]): IconName {
  const normalized = `${dependency.role} ${dependency.label ?? ""} ${dependency.pointName ?? ""} ${dependency.unit ?? ""}`.toLowerCase();
  if (/\b(power|motor|kw|tlkw|electric)\b/u.test(normalized)) return "cpu";
  if (/\b(cooling|load|chw|water|temp|q)\b/u.test(normalized)) return "snowflake";
  return "activity";
}

function escapeLatexText(value: string): string {
  return value.replace(/[\\{}]/g, "\\$&");
}

function latexText(value: string): string {
  return `\\text{${escapeLatexText(value)}}`;
}

function dependencyForRole(asset: DerivedMetricAsset, role: string | undefined, fallbackIndex: number) {
  return asset.instance.dependencies.find((dependency) => dependency.role === role)
    ?? asset.instance.dependencies[fallbackIndex]
    ?? null;
}

function formulaMarkdownForMetric(asset: DerivedMetricAsset): string {
  const formulaKind = asset.materialization?.formulaKind;
  const left = dependencyForRole(asset, asset.materialization?.leftRole, 0);
  const right = dependencyForRole(asset, asset.materialization?.rightRole, 1);
  const output = latexText(humanizeMetricKey(asset.instance.metricKey));
  if (formulaKind === "ratio" && left && right) {
    return `$$\n${output} = \\frac{${latexText(dependencyDisplayName(left))}}{${latexText(dependencyDisplayName(right))}}\n$$`;
  }
  if (formulaKind === "difference" && left && right) {
    return `$$\n${output} = ${latexText(dependencyDisplayName(left))} - ${latexText(dependencyDisplayName(right))}\n$$`;
  }
  if (asset.instance.formula.includes("/")) {
    const [leftFormula, rightFormula] = asset.instance.formula.split("/").map((part) => part.trim());
    return `$$\n${output} = \\frac{${latexText(leftFormula || "input")}}{${latexText(rightFormula || "input")}}\n$$`;
  }
  return `$$\n${output} = ${latexText(asset.instance.formula)}\n$$`;
}

function professionalExplanationForMetric(asset: DerivedMetricAsset): string {
  const metricKey = asset.instance.metricKey.toLowerCase();
  const formulaKind = asset.materialization?.formulaKind;
  if (/\bcop\b/u.test(metricKey) || metricKey.includes("_cop")) {
    return "COP (Coefficient of Performance) expresses how many units of cooling are delivered per unit of electrical power consumed. It is dimensionless, and higher values generally indicate better chiller efficiency. The value is only operationally meaningful when the power input is positive and the cooling/power measurements are valid.";
  }
  if (derivedAssetKindLabel(asset) === "FDD") {
    return "This FDD asset converts raw operating evidence into a reusable diagnostic signal. Treat the output as a maintained detection result, while the listed inputs remain available for audit and troubleshooting.";
  }
  if (formulaKind === "ratio") {
    return "This KPI normalizes one measured quantity by another so equipment can be compared on a like-for-like basis. Review denominator quality carefully because zero or unavailable denominator values make the KPI non-calculable.";
  }
  if (formulaKind === "difference") {
    return "This derived asset tracks the difference between two aligned measurements. Positive or negative direction should be interpreted according to the input roles and equipment context.";
  }
  return "This derived asset stores a reusable calculated result from the listed input measurements, so dashboards and reports can consume the output consistently instead of recalculating it inside each widget.";
}

const HKT_FRIENDLY_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Hong_Kong",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

function formatRelativeTime(ms: number): string {
  const diffMs = ms - Date.now();
  const absMs = Math.abs(diffMs);
  if (absMs < 45_000) return diffMs < 0 ? "just now" : "now";
  const units: Array<[label: string, sizeMs: number]> = [
    ["d", 86_400_000],
    ["h", 3_600_000],
    ["min", 60_000]
  ];
  const [label, sizeMs] = units.find(([, size]) => absMs >= size) ?? units[units.length - 1]!;
  const amount = Math.max(1, Math.round(absMs / sizeMs));
  return diffMs < 0 ? `${amount}${label} ago` : `in ${amount}${label}`;
}

function formatFriendlyDateTime(value: string | number | undefined): string {
  if (value === undefined) return "Not scheduled";
  const ms = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return "Not scheduled";
  return `${formatRelativeTime(ms)} · ${HKT_FRIENDLY_DATE_FORMATTER.format(ms)} HKT`;
}

function groupScheduleValue(group: KpiMetricGroup, field: "lastRunAt" | "nextRunAt"): string {
  const times = group.metrics
    .map((metric) => metric.materialization?.[field])
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);
  if (times.length === 0) return "Not scheduled";
  const selected = field === "lastRunAt" ? Math.max(...times) : Math.min(...times);
  return formatFriendlyDateTime(selected);
}

function groupIntervalLabel(group: KpiMetricGroup): string {
  const seconds = group.representative.materialization?.intervalSeconds;
  if (!seconds) return "Not scheduled";
  if (seconds % 3600 === 0) return `Every ${seconds / 3600}h`;
  if (seconds % 60 === 0) return `Every ${seconds / 60}m`;
  return `Every ${seconds}s`;
}

function formatKpiGroupValue(group: KpiMetricGroup): string {
  if (group.metrics.length === 1) {
    return formatDerivedMetricValue(group.representative);
  }
  return `${group.metrics.length} entities`;
}

function linkedDashboardIdsForGroup(group: KpiMetricGroup): Set<string> {
  return new Set(group.metrics.flatMap((metric) => metric.linkedDashboards.map((dashboard) => dashboard.id)));
}

function MetricToggle({
  checked,
  onChange,
  disabled,
  title
}: {
  checked: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <label className={`metric-toggle${checked ? " is-on" : ""}${disabled ? " is-disabled" : ""}`} title={title ?? (checked ? "Background Calculation is On" : "Background Calculation is Off")}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span aria-hidden="true" />
    </label>
  );
}

function RightPanelEmptyCard({
  label,
  title,
  children
}: {
  label: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rp-empty-card" aria-label={label}>
      <strong>{title}</strong>
      <span>{children}</span>
    </div>
  );
}

function WorkspaceMetricGroupList({
  groups,
  activeMetricId,
  ariaLabel,
  onOpenMetric,
  onToggleMetricMaterialization
}: {
  groups: KpiMetricGroup[];
  activeMetricId: string | null;
  ariaLabel: string;
  onOpenMetric: (instanceId: string) => void;
  onToggleMetricMaterialization: (instanceIds: string[], enabled: boolean) => void;
}) {
  return (
    <ul className="workspace-right-metric-list" aria-label={ariaLabel}>
      {groups.map((group) => {
        const instanceIds = group.metrics.map((metric) => metric.instance.instanceId);
        const isActive = activeMetricId ? instanceIds.includes(activeMetricId) : false;
        const groupBackgroundStatus = groupMaterializationStatus(group);
        return (
          <li key={group.groupKey} className={`workspace-right-metric-row${isActive ? " is-active" : ""}`}>
            <button type="button" className="workspace-right-metric-item" onClick={() => onOpenMetric(group.representative.instance.instanceId)}>
              <span className="workspace-right-metric-copy">
                <strong>{group.displayName}</strong>
                <small>{derivedAssetKindLabel(group.representative)} · {group.metrics.length === 1 ? formatEntityLabel(group.representative) : `${group.metrics.length} entities`}</small>
              </span>
              <span className="workspace-right-metric-value">{formatKpiGroupValue(group)}</span>
            </button>
            <MetricToggle
              checked={groupMaterializationEnabled(group)}
              onChange={(enabled) => onToggleMetricMaterialization(instanceIds, enabled)}
              title={`Background Calculation: ${groupBackgroundStatus}`}
            />
          </li>
        );
      })}
    </ul>
  );
}

function KpiDetailPanel({
  metricGroup,
  activeMetricId,
  dashboards,
  onOpenDashboard,
  onToggleMetricMaterialization
}: {
  metricGroup: KpiMetricGroup | null;
  activeMetricId: string | null;
  dashboards: DashboardRecord[];
  onOpenDashboard: (dashboardId: string) => void;
  onToggleMetricMaterialization: (instanceIds: string[], enabled: boolean) => void;
}) {
  if (!activeMetricId) {
    return (
      <Surface className="kpi-detail-page">
        <EmptyState title="Choose a KPI or FDD">Open a derived asset from the right sidebar to review its formula, inputs, Background Calculation, covered entities, and linked dashboards.</EmptyState>
      </Surface>
    );
  }
  if (!metricGroup) {
    return (
      <Surface className="kpi-detail-page">
        <EmptyState title="Loading asset">The KPI/FDD detail will appear here as soon as it is available.</EmptyState>
      </Surface>
    );
  }
  const representative = metricGroup.representative;
  const instance = representative.instance;
  const linkedDashboardIds = linkedDashboardIdsForGroup(metricGroup);
  const linkedDashboards = dashboards.filter((dashboard) => linkedDashboardIds.has(dashboard.id));
  const instanceIds = metricGroup.metrics.map((metric) => metric.instance.instanceId);
  const enabledCount = metricGroup.metrics.filter(materializationEnabled).length;
  const groupBackgroundStatus = groupMaterializationStatus(metricGroup);
  return (
    <Surface className="kpi-detail-page">
      <section className="kpi-detail-section kpi-asset-overview-card">
        <div className="kpi-detail-header">
          <div>
            <h2>{metricGroup.displayName}</h2>
            <p>{metricGroup.metrics.length} entities · {instance.metricKey}</p>
          </div>
        </div>
        <p>{professionalExplanationForMetric(representative)}</p>
        <div className="kpi-formula-panel">
          <div className="kpi-formula-panel-label">Formula</div>
          <Markdown source={formulaMarkdownForMetric(representative)} className="kpi-formula-markdown" />
          {instance.formulaDescription ? <span>{instance.formulaDescription}</span> : null}
        </div>
      </section>

      <div className="kpi-detail-three-column">
        <section className="kpi-detail-section">
          <h3>Inputs / Output</h3>
          <div className="kpi-io-contract">
            <div className="kpi-io-group">
              <div className="kpi-io-group-label">Output</div>
              <div className="kpi-io-card kpi-io-card-output">
                <span className="kpi-io-icon"><Icon name="bar-chart" /></span>
                <span className="kpi-io-card-copy">
                  <strong>{metricGroup.displayName}</strong>
                  <small>{instance.unit ?? "derived value"}</small>
                </span>
              </div>
            </div>
            <div className="kpi-io-group">
              <div className="kpi-io-group-label kpi-io-group-label-lined">Inputs</div>
              <div className="kpi-io-input-list">
                {instance.dependencies.map((dependency) => (
                  <div key={dependency.dependencyId} className="kpi-io-card">
                    <span className="kpi-io-icon"><Icon name={dependencyIconName(dependency)} /></span>
                    <span className="kpi-io-card-copy">
                      <strong>{dependencyDisplayName(dependency)}</strong>
                      <small>{dependencySourceLabel(dependency)}</small>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
        <section className="kpi-detail-section">
          <h3>Background Calculation</h3>
          <p className="kpi-muted">Controls whether the system keeps this asset updated in the background. Use the group switch for the whole algorithm, or entity switches below for individual equipment.</p>
          <div className="kpi-background-status-card">
            <div>
              <strong><span aria-hidden="true" />{groupBackgroundStatus}</strong>
              <span>{enabledCount}/{metricGroup.metrics.length} entities enabled</span>
            </div>
            <MetricToggle
              checked={groupMaterializationEnabled(metricGroup)}
              onChange={(enabled) => onToggleMetricMaterialization(instanceIds, enabled)}
              title={`Background Calculation: ${groupBackgroundStatus}`}
            />
          </div>
          <div className="kpi-schedule-card">
            <span className="kpi-schedule-icon"><Icon name="clock" /></span>
            <div className="kpi-schedule-lines">
              <span>{groupIntervalLabel(metricGroup)}</span>
              <span>Last: {groupScheduleValue(metricGroup, "lastRunAt")}</span>
              <span>Next: {groupScheduleValue(metricGroup, "nextRunAt")}</span>
            </div>
          </div>
        </section>
        <section className="kpi-detail-section kpi-linked-dashboard-section">
          <div className="kpi-section-heading-row">
            <h3>Linked Dashboards</h3>
            <span className="kpi-count-pill">{linkedDashboards.length}</span>
          </div>
          {linkedDashboards.length === 0 ? (
            <p className="kpi-muted">No dashboard currently binds this output.</p>
          ) : (
            <div className="kpi-dashboard-links kpi-dashboard-links-compact">
              {linkedDashboards.map((dashboard) => (
                <button key={dashboard.id} type="button" onClick={() => onOpenDashboard(dashboard.id)}>
                  <span className="kpi-dashboard-link-icon"><Icon name="grid" /></span>
                  <span className="kpi-dashboard-link-copy">
                    <strong>{dashboard.title}</strong>
                    <span>{dashboard.widgets.length} widgets using this output</span>
                  </span>
                  <span className="kpi-dashboard-link-arrow" aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="kpi-detail-section">
        <h3>Covered Entities</h3>
        <div className="kpi-entity-card-grid">
          {metricGroup.metrics.map((metric) => (
            <article key={metric.instance.instanceId} className="kpi-entity-card">
              <strong>{formatEntityLabel(metric)}</strong>
              <span className={metric.latest?.valueNum === undefined ? "is-muted" : ""}>{formatDerivedMetricValue(metric)}</span>
              <div className="kpi-entity-background">
                <small><span aria-hidden="true" />{metricBackgroundCalculationStatus(metric)}</small>
                <MetricToggle
                  checked={materializationEnabled(metric)}
                  onChange={(enabled) => onToggleMetricMaterialization([metric.instance.instanceId], enabled)}
                  title={`Background Calculation: ${metricBackgroundCalculationStatus(metric)}`}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

    </Surface>
  );
}

function WorkspaceRightPanel({
  registry,
  management,
  dashboards,
  derivedMetrics,
  activeDashboardId,
  activeMetricId,
  disabled,
  onOpenDashboard,
  onOpenMetric,
  onToggleMetricMaterialization,
  onRenameDashboard,
  onDuplicateDashboard,
  onDeleteDashboard,
  onMergeDashboard
}: {
  registry: RegistryResponse | null;
  management: ProjectManagementResponse | null;
  dashboards: DashboardRecord[];
  derivedMetrics: DerivedMetricAsset[];
  activeDashboardId: string | null;
  activeMetricId: string | null;
  disabled?: boolean;
  onOpenDashboard: (dashboardId: string) => void;
  onOpenMetric: (instanceId: string) => void;
  onToggleMetricMaterialization: (instanceIds: string[], enabled: boolean) => void;
  onRenameDashboard: (dashboardId: string) => void;
  onDuplicateDashboard: (dashboardId: string) => void;
  onDeleteDashboard: (dashboardId: string) => void;
  onMergeDashboard: (sourceDashboardId: string, targetDashboardId?: string) => void;
}) {
  const assetGroups = disabled ? [] : groupDerivedMetricAssets(derivedMetrics);
  const fddGroups = assetGroups.filter((group) => derivedAssetKindLabel(group.representative) === "FDD");
  const kpiGroups = assetGroups.filter((group) => derivedAssetKindLabel(group.representative) === "KPI");
  const taskCount = fddGroups.length;
  const metricCount = kpiGroups.length;
  const dashboardCount = disabled ? 0 : dashboards.length;
  const [dashboardsSectionOpen, setDashboardsSectionOpen] = useState(true);
  return (
    <div className={`workspace-right-block${disabled ? " is-disabled" : ""}`}>
      <details className="workspace-right-section">
        <summary>
          <span><Icon name="file-search" />FDD Tasks</span>
          <span className="right-section-meta">{taskCount}</span>
        </summary>
        {disabled ? (
          <RightPanelEmptyCard label="FDD tasks" title="Select a project">
            Choose a project to view FDD tasks.
          </RightPanelEmptyCard>
        ) : fddGroups.length === 0 ? (
          <ScheduledTasks />
        ) : (
          <WorkspaceMetricGroupList
            groups={fddGroups}
            activeMetricId={activeMetricId}
            ariaLabel="Project FDD tasks"
            onOpenMetric={onOpenMetric}
            onToggleMetricMaterialization={onToggleMetricMaterialization}
          />
        )}
      </details>
      <details className="workspace-right-section" open>
        <summary>
          <span><Icon name="bar-chart" />KPI</span>
          <span className="right-section-meta">{metricCount}</span>
        </summary>
        {disabled ? (
          <RightPanelEmptyCard label="KPI assets" title="Select a project">
            Choose a project to view KPI assets.
          </RightPanelEmptyCard>
        ) : kpiGroups.length === 0 ? (
          <RightPanelEmptyCard label="KPI assets" title="No KPI assets yet.">
            KPI assets will appear here after BuildingGPT registers a KPI calculation.
          </RightPanelEmptyCard>
        ) : (
          <WorkspaceMetricGroupList
            groups={kpiGroups}
            activeMetricId={activeMetricId}
            ariaLabel="Project KPI assets"
            onOpenMetric={onOpenMetric}
            onToggleMetricMaterialization={onToggleMetricMaterialization}
          />
        )}
      </details>
      <details className="workspace-right-section" open={dashboardsSectionOpen} onToggle={(event) => setDashboardsSectionOpen(event.currentTarget.open)}>
        <summary>
          <span><Icon name="grid" />Dashboards</span>
          <span className="right-section-meta">{dashboardCount}</span>
        </summary>
        {disabled ? (
          <RightPanelEmptyCard label="Project dashboards" title="Select a project">
            Choose a project to view dashboards.
          </RightPanelEmptyCard>
        ) : dashboards.length === 0 ? (
          <RightPanelEmptyCard label="Project dashboards" title="No dashboards yet.">
            Dashboards will appear here after BuildingGPT creates one.
          </RightPanelEmptyCard>
        ) : (
          <ul className="workspace-right-dashboard-list" aria-label="Project dashboards">
            {dashboards.map((dashboard) => (
              <li key={dashboard.id}>
                <div className={`workspace-right-dashboard-row${dashboard.id === activeDashboardId ? " is-active" : ""}`}>
                  <button
                    type="button"
                    className="workspace-right-dashboard-item"
                    onClick={() => onOpenDashboard(dashboard.id)}
                  >
                    <span className="workspace-right-dashboard-copy">
                      <strong>{dashboard.title}</strong>
                      <small>{dashboard.widgets.length} widgets · Updated {formatFriendlyDateTime(dashboard.updatedAt)}</small>
                    </span>
                    <Badge tone={dashboard.visibility === "project" ? "success" : "neutral"}>
                      {dashboard.visibility === "project" ? "Shared" : "Private"}
                    </Badge>
                  </button>
                  <details className="workspace-right-dashboard-menu">
                    <summary aria-label="Dashboard actions">
                      <Icon name="more" />
                    </summary>
                    <ul>
                      <li><button type="button" onClick={() => onRenameDashboard(dashboard.id)}>Rename</button></li>
                      <li><button type="button" onClick={() => onDuplicateDashboard(dashboard.id)}>Duplicate</button></li>
                      <li><button type="button" onClick={() => onMergeDashboard(dashboard.id)}>Merge into...</button></li>
                      <li><button type="button" className="is-danger" onClick={() => onDeleteDashboard(dashboard.id)}>Delete</button></li>
                    </ul>
                  </details>
                </div>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}

function Workspace({
  project,
  projects,
  user,
  token,
  messages,
  conversations,
  activeConversationId,
  kbDocuments,
  repoItems,
  dashboards,
  activeDashboard,
  derivedMetrics,
  activeMetricGroup,
  activeMetricId,
  dashboardLiveValues,
  dashboardRealtimeStale,
  kbTotalCount,
  repoTotalCount,
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
  onOpenDashboard,
  onOpenMetric,
  onCreateProject,
  onSignOut,
  projectConversationCounts,
  projectAssetCounts,
  busy,
  onDeleteConversation,
  onRenameConversation,
  onDeleteProject,
  onDashboardSpecChange,
  onDashboardLayoutChange,
  onDashboardVisibilityChange,
  onRenameDashboard,
  onDuplicateDashboard,
  onDeleteDashboard,
  onMergeDashboard,
  onCopyWidgetToDashboard,
  onToggleMetricMaterialization,
  onStop,
  soloDashboardView,
  streamingActivity,
  streamOutputStarted,
  streamAnswerPhase,
  streamInterimNarration,
  streamWorkElapsedMs,
  streamWorkSegmentStartedAt,
  streamTick,
  restoringSession
}: {
  project: ProjectSummary | null;
  projects: ProjectSummary[];
  user: UserSummary | null;
  token: string;
  messages: ChatMessage[];
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  kbDocuments: KnowledgeBaseDocument[];
  repoItems: RepositoryItem[];
  dashboards: DashboardRecord[];
  activeDashboard: DashboardRecord | null;
  derivedMetrics: DerivedMetricAsset[];
  activeMetricGroup: KpiMetricGroup | null;
  activeMetricId: string | null;
  dashboardLiveValues: Record<string, BmsCollectorPoint>;
  dashboardRealtimeStale: boolean;
  kbTotalCount: number;
  repoTotalCount: number;
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
  onOpenDashboard: (dashboardId: string) => void;
  onOpenMetric: (instanceId: string) => void;
  onCreateProject: (name: string) => void;
  onSignOut: () => void;
  projectConversationCounts: Record<string, number>;
  projectAssetCounts: Record<string, number>;
  busy: boolean;
  onDeleteConversation: (convId: string) => void;
  onRenameConversation: (convId: string, title: string) => void;
  onDeleteProject: (projectId: string) => void;
  onDashboardSpecChange: (next: Pick<DashboardRecord, "title" | "visibility" | "layout" | "widgets"> & Partial<DashboardRecord>) => Promise<void>;
  onDashboardLayoutChange: (layout: DashboardRecord["layout"], sections?: DashboardRecord["sections"]) => Promise<void>;
  onDashboardVisibilityChange: (visibility: DashboardVisibility) => Promise<void>;
  onRenameDashboard: (dashboardId: string) => Promise<void>;
  onDuplicateDashboard: (dashboardId: string) => Promise<void>;
  onDeleteDashboard: (dashboardId: string) => Promise<void>;
  onMergeDashboard: (sourceDashboardId: string, targetDashboardId?: string) => Promise<void>;
  onCopyWidgetToDashboard: (widgetId: string, targetDashboardId: string) => Promise<void>;
  onToggleMetricMaterialization: (instanceIds: string[], enabled: boolean) => Promise<void>;
  streamingActivity?: ChatStreamActivityEvent[];
  streamOutputStarted: boolean;
  streamAnswerPhase?: boolean;
  streamInterimNarration?: string;
  streamWorkElapsedMs?: number;
  streamWorkSegmentStartedAt?: number | null;
  streamTick?: number;
  restoringSession?: boolean;
  soloDashboardView?: boolean;
}) {
  const tabs: Array<{ id: WorkspaceTab; label: string }> = [
    { id: "chat", label: "Chat" },
    { id: "bms", label: "BMS Data Config" },
    { id: "kb", label: "Knowledge Base" },
    { id: "repo", label: "Repository" },
    { id: "dashboards", label: "Dashboards" },
    { id: "kpis", label: "KPI" },
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

  useEffect(() => {
    if (!project) return;
    if (activeTab === "dashboards" && activeDashboard) {
      setLeftOpen(false);
    }
  }, [activeDashboard?.id ?? null, activeTab, project?.id ?? null]);

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
      {activeTab === "chat" ? <ChatWorkspace project={project} user={user} token={token} messages={messages} dashboards={dashboards} activeConversationId={activeConversationId} onSend={onSend} onOpenDashboard={onOpenDashboard} onStop={onStop} busy={busy} provider={providerDiagnostics} requestId={providerRequestId} streamOutputStarted={streamOutputStarted} {...(streamAnswerPhase !== undefined ? { streamAnswerPhase } : {})} {...(streamInterimNarration !== undefined ? { streamInterimNarration } : {})} {...(streamWorkElapsedMs !== undefined ? { streamWorkElapsedMs } : {})} {...(streamWorkSegmentStartedAt !== undefined ? { streamWorkSegmentStartedAt } : {})} {...(streamTick !== undefined ? { streamTick } : {})} {...(streamingActivity ? { streamingActivity } : {})} /> : null}
      {activeTab === "bms" ? <BmsDataConfigPage projectId={project.id} projectName={project.name} token={token} /> : null}
      {activeTab === "kb" ? <KnowledgeBase projectId={project.id} projectName={project.name} documents={kbDocuments} /> : null}
      {activeTab === "repo" ? <Repository projectId={project.id} projectName={project.name} items={repoItems} /> : null}
      {activeTab === "dashboards" ? (
        activeDashboard ? (
          <DashboardView
            key={activeDashboard.id}
            token={token}
            dashboard={activeDashboard}
            dashboards={dashboards}
            liveValues={dashboardLiveValues}
            stale={dashboardRealtimeStale}
            forceCompactLayout={leftOpen || rightOpen}
            onDashboardChange={onDashboardSpecChange}
            onDashboardRename={() => { void onRenameDashboard(activeDashboard.id); }}
            onDashboardDuplicate={() => { void onDuplicateDashboard(activeDashboard.id); }}
            onDashboardDelete={() => { void onDeleteDashboard(activeDashboard.id); }}
            onDashboardMerge={() => { void onMergeDashboard(activeDashboard.id); }}
            onCopyWidgetToDashboard={onCopyWidgetToDashboard}
            onLayoutChange={onDashboardLayoutChange}
            onVisibilityChange={onDashboardVisibilityChange}
          />
        ) : (
          <Surface className="dashboard-empty-surface">
            <EmptyState title="Choose a dashboard">Pick a dashboard from the right sidebar to open it here.</EmptyState>
          </Surface>
        )
      ) : null}
      {activeTab === "kpis" ? (
        <KpiDetailPanel
          metricGroup={activeMetricGroup}
          activeMetricId={activeMetricId}
          dashboards={dashboards}
          onOpenDashboard={onOpenDashboard}
          onToggleMetricMaterialization={(instanceIds, enabled) => { void onToggleMetricMaterialization(instanceIds, enabled); }}
        />
      ) : null}
      {activeTab === "registry" ? <RegistryPanel registry={registry} /> : null}
      {activeTab === "gateways" ? <GatewayPanel registry={registry} management={management} /> : null}
      {activeTab === "building" ? <BuildingDomainPanel registry={registry} management={management} /> : null}
    </div>
  ) : restoringSession ? (
    <div className="workspace-center-block workspace-center-empty workspace-center-restoring" aria-labelledby="workspace-title" aria-busy="true">
      <div className="workspace-floating-toggles">
        <button type="button" className="workspace-icon-button workspace-left-toggle" onClick={() => setLeftOpen((open) => !open)} aria-label={leftOpen ? "Collapse project sidebar" : "Expand project sidebar"}>
          <Icon name="panel-left" />
        </button>
        <button type="button" className="workspace-icon-button workspace-right-toggle" onClick={() => setRightOpen((open) => !open)} aria-label={rightOpen ? "Collapse workspace details" : "Expand workspace details"}>
          <Icon name="panel-right" />
        </button>
      </div>
      <h1 id="workspace-title" className="visually-hidden">Workspace</h1>
      <StartupBurstLoader />
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

  if (project && soloDashboardView && activeTab === "dashboards") {
    return (
      <div className="workspace-card workspace-management cgpt-workspace dashboard-solo-workspace">
        <div className="dashboard-solo-shell">
          {activeDashboard ? (
            <DashboardView
              key={activeDashboard.id}
              token={token}
              dashboard={activeDashboard}
              dashboards={dashboards}
              liveValues={dashboardLiveValues}
              stale={dashboardRealtimeStale}
              forceCompactLayout={false}
              onDashboardChange={onDashboardSpecChange}
              onDashboardRename={() => { void onRenameDashboard(activeDashboard.id); }}
              onDashboardDuplicate={() => { void onDuplicateDashboard(activeDashboard.id); }}
              onDashboardDelete={() => { void onDeleteDashboard(activeDashboard.id); }}
              onDashboardMerge={() => { void onMergeDashboard(activeDashboard.id); }}
              onCopyWidgetToDashboard={onCopyWidgetToDashboard}
              onLayoutChange={onDashboardLayoutChange}
              onVisibilityChange={onDashboardVisibilityChange}
            />
          ) : (
            <Surface className="dashboard-empty-surface">
              <EmptyState title="Loading dashboard">This dashboard will open here as soon as it is available.</EmptyState>
            </Surface>
          )}
        </div>
      </div>
    );
  }

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
            kbCount={project ? kbTotalCount : 0}
            repoCount={project ? repoTotalCount : 0}
            conversations={project ? conversations : []}
            activeConversationId={project ? activeConversationId : null}
            busy={busy}
            onSwitchProject={onSwitchProject}
            onSelectProject={onSelectProject}
            onSelectConversation={onSelectConversation}
            onSignOut={onSignOut}
            onNewChat={() => { void onNewChat(); }}
            onOpenKnowledgeBase={() => onTabChange("kb")}
            onOpenBmsDataConfig={() => onTabChange("bms")}
            onOpenRepository={() => onTabChange("repo")}
            onDeleteConversation={onDeleteConversation}
            onRenameConversation={(convId, title) => { void onRenameConversation(convId, title); }}
            onDeleteProject={onDeleteProject}
          />
        )}
        center={center}
        right={(
          <WorkspaceRightPanel
            registry={project ? registry : null}
            management={project ? management : null}
            dashboards={project ? dashboards : []}
            derivedMetrics={project ? derivedMetrics : []}
            activeDashboardId={activeDashboard?.id ?? null}
            activeMetricId={activeMetricId}
            disabled={!project}
            onOpenDashboard={onOpenDashboard}
            onOpenMetric={onOpenMetric}
            onToggleMetricMaterialization={(instanceIds, enabled) => { void onToggleMetricMaterialization(instanceIds, enabled); }}
            onRenameDashboard={(dashboardId) => { void onRenameDashboard(dashboardId); }}
            onDuplicateDashboard={(dashboardId) => { void onDuplicateDashboard(dashboardId); }}
            onDeleteDashboard={(dashboardId) => { void onDeleteDashboard(dashboardId); }}
            onMergeDashboard={(sourceDashboardId, targetDashboardId) => { void onMergeDashboard(sourceDashboardId, targetDashboardId); }}
          />
        )}
        className={shellClass}
      />
    </div>
  );
}

export default function App() {
  useAutoFlipMenus();
  const initial = useMemo(readStoredSession, []);
  const [token, setToken] = useState(initial.token);
  const [user, setUser] = useState<UserSummary | null>(initial.user);
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [pendingNewChat, setPendingNewChat] = useState(false);
  const [knowledgeBaseDocuments, setKnowledgeBaseDocuments] = useState<KnowledgeBaseDocument[]>([]);
  const [repositoryItems, setRepositoryItems] = useState<RepositoryItem[]>([]);
  const [dashboards, setDashboards] = useState<DashboardRecord[]>([]);
  const [activeDashboardId, setActiveDashboardId] = useState<string | null>(() => parseWorkspacePath(window.location.pathname)?.dashboardId ?? null);
  const [derivedMetrics, setDerivedMetrics] = useState<DerivedMetricAsset[]>([]);
  const [activeMetricId, setActiveMetricId] = useState<string | null>(() => parseWorkspacePath(window.location.pathname)?.metricInstanceId ?? null);
  const [dashboardLiveValues, setDashboardLiveValues] = useState<Record<string, BmsCollectorPoint>>({});
  const [dashboardRealtimeAt, setDashboardRealtimeAt] = useState<number | null>(null);
  const [kbTotalCount, setKbTotalCount] = useState(0);
  const [repoTotalCount, setRepoTotalCount] = useState(0);
  const [projectConversationCounts, setProjectConversationCounts] = useState<Record<string, number>>({});
  const [projectAssetCounts, setProjectAssetCounts] = useState<Record<string, number>>({});
  const [chatProviderDiagnostics, setChatProviderDiagnostics] = useState<ChatProviderDiagnostics | null>(null);
  const [chatProviderRequestId, setChatProviderRequestId] = useState<string | undefined>(undefined);
  const [registry, setRegistry] = useState<RegistryResponse | null>(null);
  const [management, setManagement] = useState<ProjectManagementResponse | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("chat");
  const [pathnameProjectId, setPathnameProjectId] = useState<string | null>(() => parseWorkspacePath(window.location.pathname)?.projectId ?? null);
  const [locationSearch, setLocationSearch] = useState(() => window.location.search);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [busy, setBusy] = useState(false);
  const [conversationStreams, setConversationStreams] = useState<Record<string, ConversationStreamState>>({});
  const [streamElapsedTick, setStreamElapsedTick] = useState(0);
  const [bootstrapping, setBootstrapping] = useState(Boolean(initial.token));
  const hadSavedSession = useMemo(() => Boolean(initial.token), [initial.token]);
  const soloDashboardView = isSoloDashboardSearch(locationSearch);
  const abortControllerRef = useRef<AbortController | null>(null);
  const sendInFlightRef = useRef(false);
  const streamingTurnRef = useRef<StreamingTurnState | null>(null);
  const projectSocketRef = useRef<ReturnType<typeof createProjectSocket> | null>(null);
  const activeConversationIdRef = useRef<string | null>(activeConversationId);
  const conversationStreamsRef = useRef<Record<string, ConversationStreamState>>({});
  const deletedConversationIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);
  useEffect(() => {
    conversationStreamsRef.current = conversationStreams;
  }, [conversationStreams]);

  function isLocallyStreamingConversation(conversationId: string): boolean {
    const turn = streamingTurnRef.current;
    return Boolean(turn?.conversationId === conversationId && turn.assistantId);
  }

  useEffect(() => {
    if (!selectedProject) {
      return;
    }
    const targetPath = workspacePathFromTab(
      selectedProject.id,
      activeTab,
      activeTab === "dashboards" ? activeDashboardId : null,
      activeTab === "kpis" ? activeMetricId : null
    );
    const targetUrl = soloDashboardView && activeTab === "dashboards" && activeDashboardId
      ? dashboardSoloPath(selectedProject.id, activeDashboardId)
      : targetPath;
    if (`${window.location.pathname}${window.location.search}` !== targetUrl) {
      window.history.pushState({}, "", targetUrl);
      setLocationSearch(soloDashboardView && activeTab === "dashboards" && activeDashboardId ? "?view=solo" : "");
    }
  }, [activeDashboardId, activeMetricId, activeTab, selectedProject?.id ?? null, soloDashboardView]);

  useEffect(() => {
    const parsed = parseWorkspacePath(window.location.pathname);
    if (parsed) {
      setPathnameProjectId(parsed.projectId);
      setActiveTab(parsed.tab);
      setActiveDashboardId(parsed.dashboardId ?? null);
      setActiveMetricId(parsed.metricInstanceId ?? null);
    }
    setLocationSearch(window.location.search);
    const handlePopState = () => {
      const next = parseWorkspacePath(window.location.pathname);
      setPathnameProjectId(next?.projectId ?? null);
      setLocationSearch(window.location.search);
      if (next) {
        setActiveTab(next.tab);
        setActiveDashboardId(next.dashboardId ?? null);
        setActiveMetricId(next.metricInstanceId ?? null);
      } else {
        setActiveDashboardId(null);
        setActiveMetricId(null);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const visibleStreamState = activeConversationId ? conversationStreams[activeConversationId] : undefined;
  const activeDashboard = useMemo(
    () => dashboards.find((dashboard) => dashboard.id === activeDashboardId) ?? null,
    [dashboards, activeDashboardId]
  );
  const activeMetricGroup = useMemo(() => {
    if (!activeMetricId) return null;
    return groupDerivedMetricAssets(derivedMetrics).find((group) =>
      group.metrics.some((metric) => metric.instance.instanceId === activeMetricId)
    ) ?? null;
  }, [derivedMetrics, activeMetricId]);
  const activeDashboardPointNames = useMemo(
    () => dashboardPointNames(activeDashboard),
    [activeDashboard]
  );
  const activeDashboardPointNamesSignature = activeDashboardPointNames.join("|");
  const dashboardRealtimeStale = activeDashboardPointNames.length > 0
    && (dashboardRealtimeAt === null || (Date.now() - dashboardRealtimeAt) > 70_000);
  const visibleMessages = useMemo(
    () => mergeMessagesWithStreamingState(messages, visibleStreamState),
    [messages, visibleStreamState]
  );
  const visibleStreamingActivity = visibleStreamState?.activities ?? [];

  function clearAuth(nextBanner?: BannerState) {
    setToken("");
    setUser(null);
    setSession(null);
    setProjects([]);
    setSelectedProject(null);
    setMessages([]);
    setConversations([]);
    setActiveConversationId(null);
    setPendingNewChat(false);
    setKnowledgeBaseDocuments([]);
    setRepositoryItems([]);
    setDashboards([]);
    setActiveDashboardId(null);
    setDerivedMetrics([]);
    setActiveMetricId(null);
    setDashboardLiveValues({});
    setDashboardRealtimeAt(null);
    setKbTotalCount(0);
    setRepoTotalCount(0);
    setProjectConversationCounts({});
    setProjectAssetCounts({});
    setChatProviderDiagnostics(null);
    setChatProviderRequestId(undefined);
    setRegistry(null);
    setManagement(null);
    setActiveTab("chat");
    setConversationStreams({});
    setStreamElapsedTick(0);
    streamingTurnRef.current = null;
    abortControllerRef.current = null;
    storeSession({ token: "", user: null, projectId: null });
    window.sessionStorage.removeItem(SKIP_PROJECT_RESTORE_KEY);
    if (window.location.pathname !== "/" || window.location.search) {
      window.history.replaceState({}, "", "/");
    }
    setLocationSearch("");
    setBanner(nextBanner ?? { tone: "info", title: "Signed out", message: "Sign in again to continue." });
  }

  async function loadManagementSurfaces(currentToken: string, projectId: string) {
    const [registryResponse, managementResponse] = await Promise.all([
      getRegistry(currentToken),
      getProjectManagement(currentToken, projectId)
    ]);
    const [kbResponse, repoResponse, dashboardResponse, derivedMetricResponse] = await Promise.all([
      getKnowledgeBase(currentToken, projectId).catch(() => ({ documents: [], totalCount: 0, requestId: "" })),
      getRepository(currentToken, projectId).catch(() => ({ artifacts: [], totalCount: 0, requestId: "" })),
      getDashboards(currentToken, projectId).catch(() => null),
      getDerivedMetrics(currentToken, projectId).catch(() => ({ metrics: [], totalCount: 0, requestId: "" }))
    ]);
    setRegistry(registryResponse);
    setManagement(managementResponse);
    setKnowledgeBaseDocuments(kbResponse.documents.map(apiDocumentToUi));
    if (dashboardResponse) {
      setDashboards((current) => mergeDashboardList(current, dashboardResponse.dashboards));
    }
    setDerivedMetrics(derivedMetricResponse.metrics);
    const visibleRepoItems = visibleRepositoryItemsFromArtifacts(repoResponse.artifacts);
    const visibleRepoCount = visibleRepositoryArtifactCount(repoResponse.artifacts);
    setRepositoryItems(visibleRepoItems);
    setKbTotalCount(kbResponse.totalCount);
    setRepoTotalCount(visibleRepoCount);
    setProjectAssetCounts((current) => ({ ...current, [projectId]: kbResponse.totalCount + visibleRepoCount }));
    return { registryResponse, managementResponse, kbResponse, repoResponse, dashboardResponse, derivedMetricResponse };
  }

  function applyWorkspacePath(projectId: string, tab: WorkspaceTab, dashboardId?: string | null, metricInstanceId?: string | null): void {
    const nextPath = workspacePathFromTab(projectId, tab, dashboardId, metricInstanceId);
    if (window.location.pathname !== nextPath || window.location.search) {
      window.history.pushState({}, "", nextPath);
    }
    setPathnameProjectId(projectId);
    setActiveTab(tab);
    setActiveDashboardId(tab === "dashboards" ? (dashboardId ?? null) : null);
    setActiveMetricId(tab === "kpis" ? (metricInstanceId ?? null) : null);
    setLocationSearch("");
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
        const skipProjectRestore = consumeSkipProjectRestore();
        const storedProjectId = readStoredSession().projectId;
        const restoredProject = projectResponse.projects.find((project) => project.id === sessionResponse.session.projectId) ?? null;
        const pathState = parseWorkspacePath(window.location.pathname);
        const restoredByPath = pathState ? projectResponse.projects.find((project) => project.id === pathState.projectId) ?? null : null;
        const restoredFromStorage = storedProjectId
          ? projectResponse.projects.find((project) => project.id === storedProjectId) ?? null
          : null;
        const nextProject = skipProjectRestore ? null : restoredByPath ?? restoredProject ?? restoredFromStorage;
        setSelectedProject(nextProject);
        setBanner(null);
        if (nextProject) {
          setActiveTab(pathState?.tab ?? "chat");
          setActiveDashboardId(pathState?.dashboardId ?? null);
          setActiveMetricId(pathState?.metricInstanceId ?? null);
          setPathnameProjectId(nextProject.id);
          if (sessionResponse.session.projectId !== nextProject.id) {
            const selected = await selectProject(token, nextProject.id);
            if (cancelled) {
              return;
            }
            setSession(selected.session);
          }
          const [chatResponse, registryResponse, managementResponse, convResponse, activeStreamsResponse] = await Promise.all([
            getChat(token, nextProject.id),
            getRegistry(token),
            getProjectManagement(token, nextProject.id),
            getConversations(token, nextProject.id).catch(() => ({ conversations: [], limit: 50, requestId: "" })),
            getActiveChatStreams(token, nextProject.id).catch(() => ({ projectId: nextProject.id, streams: [], requestId: "" }))
          ]);
          const [kbResponse, repoResponse, dashboardResponse, derivedMetricResponse] = await Promise.all([
            getKnowledgeBase(token, nextProject.id).catch(() => ({ documents: [], totalCount: 0, requestId: "" })),
            getRepository(token, nextProject.id).catch(() => ({ artifacts: [], totalCount: 0, requestId: "" })),
            getDashboards(token, nextProject.id).catch(() => null),
            getDerivedMetrics(token, nextProject.id).catch(() => ({ metrics: [], totalCount: 0, requestId: "" }))
          ]);
          if (!cancelled) {
            const visibleRepoItems = visibleRepositoryItemsFromArtifacts(repoResponse.artifacts);
            const visibleRepoCount = visibleRepositoryArtifactCount(repoResponse.artifacts);
            const restoredStreams = conversationStreamsFromActiveSnapshots(activeStreamsResponse.streams);
            const restoredActiveConversationId = chatResponse.activeConversationId
              ?? activeStreamsResponse.streams[activeStreamsResponse.streams.length - 1]?.conversationId
              ?? null;
            setMessages(chatResponse.messages);
            setConversations(mergeConversationSummaries(convResponse.conversations, [], restoredStreams, deletedConversationIdsRef.current));
            setProjectConversationCounts((current) => ({ ...current, [nextProject.id]: convResponse.conversations.length }));
            setProjectAssetCounts((current) => ({ ...current, [nextProject.id]: kbResponse.totalCount + visibleRepoCount }));
            setActiveConversationId(restoredActiveConversationId);
            setPendingNewChat(false);
            setRegistry(registryResponse);
            setManagement(managementResponse);
            setKnowledgeBaseDocuments(kbResponse.documents.map(apiDocumentToUi));
            if (dashboardResponse) {
              setDashboards((current) => mergeDashboardList(current, dashboardResponse.dashboards));
            }
            setDerivedMetrics(derivedMetricResponse.metrics);
            setRepositoryItems(visibleRepoItems);
            setKbTotalCount(kbResponse.totalCount);
            setRepoTotalCount(visibleRepoCount);
            setConversationStreams(restoredStreams);
            storeSession({ token, user: user ?? readStoredSession().user, projectId: nextProject.id });
          }
        }
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

  useEffect(() => {
    if (!token || !selectedProject || !activeDashboardId) return;
    if (dashboards.some((dashboard) => dashboard.id === activeDashboardId)) return;

    let cancelled = false;
    const projectId = selectedProject.id;
    const dashboardId = activeDashboardId;
    async function hydrateActiveDashboard() {
      try {
        const response = await getDashboard(token, projectId, dashboardId);
        if (cancelled) return;
        setDashboards((current) => upsertDashboardRecord(current, response.dashboard));
      } catch (error) {
        if (cancelled) return;
        if (isAuthFailure(error)) {
          clearAuth(errorBanner(error, "Session expired"));
          return;
        }
        if (activeTab === "dashboards") {
          applyWorkspacePath(projectId, "dashboards");
        }
        setBanner(errorBanner(error, "Could not load dashboard"));
      }
    }

    void hydrateActiveDashboard();
    return () => {
      cancelled = true;
    };
  }, [activeDashboardId, activeTab, dashboards, selectedProject?.id ?? null, token]);

  useEffect(() => {
    if (!token || !selectedProject || !activeMetricId) return;
    if (derivedMetrics.some((metric) => metric.instance.instanceId === activeMetricId)) return;

    let cancelled = false;
    const projectId = selectedProject.id;
    const metricId = activeMetricId;
    async function hydrateActiveMetric() {
      try {
        const response = await getDerivedMetric(token, projectId, metricId);
        if (cancelled) return;
        setDerivedMetrics((current) => upsertDerivedMetricAsset(current, response.metric));
      } catch (error) {
        if (cancelled) return;
        if (isAuthFailure(error)) {
          clearAuth(errorBanner(error, "Session expired"));
          return;
        }
        if (activeTab === "kpis") {
          applyWorkspacePath(projectId, "kpis");
        }
        setBanner(errorBanner(error, "Could not load KPI/FDD asset"));
      }
    }

    void hydrateActiveMetric();
    return () => {
      cancelled = true;
    };
  }, [activeMetricId, activeTab, derivedMetrics, selectedProject?.id ?? null, token]);

  useEffect(() => {
    setDashboardLiveValues({});
    setDashboardRealtimeAt(null);
  }, [selectedProject?.id ?? null]);

  // Poll for proactive messages (scheduler-fired reminders) in the active conversation
  useEffect(() => {
    if (!token || !selectedProject || !activeConversationId || activeTab !== "chat") return;

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
        // Polling failures are silent 鈥?retry on next interval
      }
    }

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [token, selectedProject?.id ?? null, activeConversationId, activeTab, busy]);

  // Re-render once per second only while a Working-for segment is active
  useEffect(() => {
    if (!visibleStreamState || visibleStreamState.workSegmentStartedAt == null) {
      return;
    }
    const interval = setInterval(() => {
      setStreamElapsedTick((current) => current + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [
    visibleStreamState?.conversationId,
    visibleStreamState?.workSegmentStartedAt,
    visibleStreamState?.streamTimelineFinalized
  ]);

  useEffect(() => {
    if (!token || !selectedProject || activeTab === "dashboards") return;

    const POLL_INTERVAL_MS = 15_000;
    const projectId = selectedProject.id;
    let active = true;
    let inFlight = false;

    async function refreshSidebar() {
      if (inFlight || busy) return;
      inFlight = true;
      try {
        const [convResponse, kbResponse, repoResponse, dashboardResponse, derivedMetricResponse] = await Promise.all([
          getConversations(token, projectId).catch(() => ({ conversations: [], limit: 50, requestId: "" })),
          getKnowledgeBase(token, projectId).catch(() => ({ documents: [], totalCount: 0, requestId: "" })),
          getRepository(token, projectId).catch(() => ({ artifacts: [], totalCount: 0, requestId: "" })),
          getDashboards(token, projectId).catch(() => null),
          getDerivedMetrics(token, projectId).catch(() => ({ metrics: [], totalCount: 0, requestId: "" }))
        ]);
        if (!active) return;
        const visibleRepoItems = visibleRepositoryItemsFromArtifacts(repoResponse.artifacts);
        const visibleRepoCount = visibleRepositoryArtifactCount(repoResponse.artifacts);
        const visibleConversations = convResponse.conversations.filter((conversation) => !deletedConversationIdsRef.current.has(conversation.id));
        setConversations((current) => mergeConversationSummaries(visibleConversations, current, conversationStreamsRef.current, deletedConversationIdsRef.current));
        setKnowledgeBaseDocuments(kbResponse.documents.map(apiDocumentToUi));
        if (dashboardResponse) {
          setDashboards((current) => mergeDashboardList(current, dashboardResponse.dashboards));
        }
        setDerivedMetrics(derivedMetricResponse.metrics);
        setRepositoryItems((current) => {
          const incomingIds = new Set(visibleRepoItems.map((item) => item.id));
          return [...visibleRepoItems, ...current.filter((item) => !incomingIds.has(item.id))];
        });
        setKbTotalCount(kbResponse.totalCount);
        setRepoTotalCount(visibleRepoCount);
        setProjectConversationCounts((current) => ({ ...current, [projectId]: visibleConversations.length }));
        setProjectAssetCounts((current) => ({ ...current, [projectId]: kbResponse.totalCount + visibleRepoCount }));
      } catch {
        // Sidebar refresh is best-effort.
      } finally {
        inFlight = false;
      }
    }

    const interval = setInterval(() => {
      void refreshSidebar();
    }, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [token, selectedProject?.id ?? null, activeTab, busy]);

  // WebSocket connection for real-time reminder/message delivery
  useEffect(() => {
    if (!token || !selectedProject) return;

    const socket = createProjectSocket(selectedProject.id, token);
    projectSocketRef.current = socket;
    let active = true;

    async function hydrateActiveChatStreams(): Promise<void> {
      try {
        const response = await getActiveChatStreams(token!, selectedProject!.id);
        if (!active) return;
        const visibleStreams = response.streams.filter((stream) =>
          !deletedConversationIdsRef.current.has(stream.conversationId)
          && !isLocallyStreamingConversation(stream.conversationId)
        );
        const restoredStreams = conversationStreamsFromActiveSnapshots(visibleStreams);
        setConversationStreams((current) => ({ ...current, ...restoredStreams }));
        setConversations((current) => {
          let next = current;
          for (const stream of visibleStreams) {
            next = upsertConversationSummary(next, conversationSummaryFromActiveStream(stream));
          }
          return next;
        });
      } catch {
        // Active stream hydration is best-effort; normal chat polling still works.
      }
    }

    socket.on("message", (data) => {
      if (data.type === "connected") {
        socket.send({ type: "dashboard_subscribe", pointNames: activeDashboardPointNames });
        void hydrateActiveChatStreams();
      }
      if (data.type === "chat_stream_updated") {
        const stream = parseActiveChatStreamSnapshot(data.stream);
        if (stream) {
          if (deletedConversationIdsRef.current.has(stream.conversationId)) return;
          if (!isLocallyStreamingConversation(stream.conversationId)) {
            setConversationStreams((current) => ({
              ...current,
              [stream.conversationId]: conversationStreamFromActiveSnapshot(stream)
            }));
          }
          setConversations((current) => upsertConversationSummary(current, conversationSummaryFromActiveStream(stream)));
        }
      }
      if (data.type === "chat_stream_finished" && typeof data.conversationId === "string") {
        const finishedConversationId = data.conversationId;
        if (isLocallyStreamingConversation(finishedConversationId)) return;
        setConversationStreams((current) => {
          if (!current[finishedConversationId]) return current;
          const next = { ...current };
          delete next[finishedConversationId];
          return next;
        });
        void getConversations(token, selectedProject.id)
          .then((response) => {
            if (!active) return;
            const visibleConversations = response.conversations.filter((conversation) => !deletedConversationIdsRef.current.has(conversation.id));
            setConversations((current) => mergeConversationSummaries(visibleConversations, current, conversationStreamsRef.current, deletedConversationIdsRef.current));
            setProjectConversationCounts((current) => ({ ...current, [selectedProject.id]: visibleConversations.length }));
          })
          .catch(() => undefined);
        if (!deletedConversationIdsRef.current.has(finishedConversationId) && finishedConversationId === activeConversationIdRef.current) {
          void getChat(token, selectedProject.id, finishedConversationId)
            .then((response) => {
              if (!active) return;
              setMessages(response.messages);
            })
            .catch(() => undefined);
        }
      }
      if (data.type === "reminder_fired" && data.message) {
        const reminderMsg = data.message as ChatMessage;
        setMessages((current) => {
          const currentIds = new Set(current.map((m) => m.id));
          if (currentIds.has(reminderMsg.id)) return current;
          return [...current, reminderMsg];
        });
        setConversations((current) => {
          if (typeof data.conversationId !== "string") return current;
          if (deletedConversationIdsRef.current.has(data.conversationId)) return current;
          const existing = current.find((conversation) => conversation.id === data.conversationId);
          if (!existing) return current;
          return upsertConversationSummary(current, {
            ...existing,
            messageCount: existing.messageCount + 1,
            createdAt: new Date().toISOString()
          });
        });
      }
      if (data.type === "conversation_title_updated" && typeof data.conversationId === "string" && typeof data.title === "string") {
        if (deletedConversationIdsRef.current.has(data.conversationId)) return;
        setConversations((current) =>
          sortConversationsByNewest(current.map((c) =>
            c.id === data.conversationId ? { ...c, title: data.title as string } : c
          ))
        );
      }
      if (data.type === "dashboard_point_update" && Array.isArray(data.updates)) {
        type DashboardPointUpdate = {
          pointName: string;
          value: string | null | undefined;
          polledAt: string | undefined;
          objectRef: string | undefined;
        };
        const updates = data.updates
          .map((entry) => {
            if (typeof entry !== "object" || entry === null || typeof (entry as Record<string, unknown>).pointName !== "string") {
              return null;
            }
            const payload = entry as Record<string, unknown>;
            return {
              pointName: payload.pointName as string,
              value: typeof payload.value === "string" || payload.value == null ? payload.value : String(payload.value),
              polledAt: typeof payload.polledAt === "string" ? payload.polledAt : undefined,
              objectRef: typeof payload.objectRef === "string" ? payload.objectRef : undefined
            };
          })
          .filter((entry): entry is DashboardPointUpdate => entry !== null);
        if (updates.length > 0) {
          setDashboardLiveValues((current) => {
            const next = { ...current };
            for (const update of updates) {
              next[update.pointName] = {
                id: -1,
                name: update.pointName,
                last_value: update.value ?? null,
                ...(update.polledAt ? { last_polled_at: update.polledAt } : {}),
                ...(update.objectRef ? { object_ref: update.objectRef } : {})
              };
            }
            return next;
          });
          setDashboardRealtimeAt(Date.now());
        }
      }
      if (data.type === "dashboard_created" && typeof data.dashboard === "object" && data.dashboard !== null) {
        const dashboard = data.dashboard as DashboardRecord;
        setDashboards((current) => upsertDashboardRecord(current, dashboard));
        if (dashboard.sourceConversationId && dashboard.sourceConversationId === activeConversationIdRef.current) {
          setBanner({ tone: "success", title: "Dashboard created", message: dashboard.title });
        }
      }
      if (data.type === "dashboard_updated" && typeof data.dashboard === "object" && data.dashboard !== null) {
        setDashboards((current) => upsertDashboardRecord(current, data.dashboard as DashboardRecord));
      }
      if (data.type === "dashboard_deleted" && typeof data.dashboardId === "string") {
        setDashboards((current) => current.filter((dashboard) => dashboard.id !== data.dashboardId));
        if (data.dashboardId === activeDashboardId) {
          applyWorkspacePath(selectedProject.id, "dashboards");
        }
      }
      if (data.type === "derived_metrics_updated") {
        void getDerivedMetrics(token, selectedProject.id)
          .then((response) => {
            if (!active) return;
            setDerivedMetrics(response.metrics);
          })
          .catch(() => undefined);
      }
    });

    return () => {
      active = false;
      if (projectSocketRef.current === socket) {
        projectSocketRef.current = null;
      }
      socket.close();
    };
  }, [activeDashboardId, activeDashboardPointNamesSignature, selectedProject?.id ?? null, token]);

  useEffect(() => {
    projectSocketRef.current?.send({ type: "dashboard_subscribe", pointNames: activeDashboardPointNames });
    setDashboardRealtimeAt(null);
  }, [activeDashboardPointNamesSignature]);

  async function handleLogin(email: string, password: string) {
    setBusy(true);
    try {
      const response = await login(email, password);
      setToken(response.token);
      setUser(response.user);
      setSession(null);
      setSelectedProject(null);
      setMessages([]);
      setConversations([]);
      setActiveConversationId(null);
      setDerivedMetrics([]);
      setActiveMetricId(null);
      setRegistry(null);
      setManagement(null);
      storeSession({ token: response.token, user: response.user, projectId: null });
      window.sessionStorage.setItem(SKIP_PROJECT_RESTORE_KEY, "1");
      if (window.location.pathname !== "/") {
        window.history.replaceState({}, "", "/");
      }
      setPathnameProjectId(null);
      setActiveTab("chat");
      setBanner({ tone: "success", title: "Signed in", message: `Welcome, ${response.user.name}. Choose a project to continue.`, requestId: response.requestId });
    } catch (error) {
      setBanner(errorBanner(error, "Sign in failed"));
      throw error;
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
      setConversations(sortConversationsByNewest(convResponse.conversations));
      setProjectConversationCounts((current) => ({ ...current, [project.id]: convResponse.conversations.length }));
      setProjectAssetCounts((current) => ({
        ...current,
        [project.id]: surfaces.kbResponse.totalCount + visibleRepositoryArtifactCount(surfaces.repoResponse.artifacts)
      }));
      setActiveConversationId(null);
      setPendingNewChat(false);
      setKnowledgeBaseDocuments(surfaces.kbResponse.documents.map(apiDocumentToUi));
      setRepositoryItems(visibleRepositoryItemsFromArtifacts(surfaces.repoResponse.artifacts));
      setChatProviderDiagnostics(null);
      setChatProviderRequestId(undefined);
      applyWorkspacePath(project.id, "chat");
      setConversationStreams({});
      setStreamElapsedTick(0);
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
      setPendingNewChat(false);
      setKnowledgeBaseDocuments([]);
      setRepositoryItems([]);
      setDashboards([]);
      setActiveDashboardId(null);
      setDerivedMetrics([]);
      setActiveMetricId(null);
      setDashboardLiveValues({});
      setDashboardRealtimeAt(null);
      setKbTotalCount(0);
      setRepoTotalCount(0);
      setProjectConversationCounts((current) => ({ ...current, [project.id]: 0 }));
      setProjectAssetCounts((current) => ({ ...current, [project.id]: 0 }));
      setChatProviderDiagnostics(null);
      setChatProviderRequestId(undefined);
      setRegistry(null);
      setManagement(null);
      applyWorkspacePath(created.project.id, "chat");
      setConversationStreams({});
      setStreamElapsedTick(0);
      storeSession({ token, user, projectId: created.project.id });
      setBanner({ tone: "success", title: "Project created", message: `${name.trim()} is now active.`, requestId: created.requestId });
    } catch (error) {
      setBanner(errorBanner(error, "Project creation failed"));
    } finally {
      setBusy(false);
    }
  }

  function handleTabChange(tab: WorkspaceTab) {
    if (!selectedProject) {
      setActiveTab(tab);
      if (tab !== "dashboards") {
        setActiveDashboardId(null);
      }
      return;
    }
    applyWorkspacePath(selectedProject.id, tab);
  }

  async function handleOpenDashboard(dashboardId: string) {
    if (!token || !selectedProject) return;
    const cachedDashboard = dashboards.find((dashboard) => dashboard.id === dashboardId);
    setDashboardLiveValues({});
    setDashboardRealtimeAt(null);
    applyWorkspacePath(selectedProject.id, "dashboards", dashboardId);
    setBanner(null);
    setBusy(!cachedDashboard);
    try {
      const response = await getDashboard(token, selectedProject.id, dashboardId);
      setDashboards((current) => upsertDashboardRecord(current, response.dashboard));
    } catch (error) {
      if (isAuthFailure(error)) {
        clearAuth(errorBanner(error, "Session expired"));
      } else if (!cachedDashboard) {
        setBanner(errorBanner(error, "Could not open dashboard"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDashboardSpecChange(next: Pick<DashboardRecord, "title" | "visibility" | "layout" | "widgets"> & Partial<DashboardRecord>) {
    if (!token || !selectedProject || !activeDashboard) return;
    try {
      const response = await updateDashboard(token, selectedProject.id, activeDashboard.id, {
        ...next,
        layoutVersion: next.layoutVersion ?? activeDashboard.layoutVersion ?? DASHBOARD_LAYOUT_VERSION
      });
      setDashboards((current) => upsertDashboardRecord(current, response.dashboard));
      setBanner({ tone: "success", title: "Dashboard updated", message: `${response.dashboard.title} saved.`, requestId: response.requestId });
    } catch (error) {
      if (isAuthFailure(error)) {
        clearAuth(errorBanner(error, "Session expired"));
      } else {
        setBanner(errorBanner(error, "Could not save dashboard"));
      }
      throw error;
    }
  }

  async function handleDashboardLayoutChange(layout: DashboardRecord["layout"], sections?: DashboardRecord["sections"]) {
    if (!activeDashboard) return;
    await handleDashboardSpecChange({
      title: activeDashboard.title,
      ...(activeDashboard.description ? { description: activeDashboard.description } : {}),
      visibility: activeDashboard.visibility,
      layout,
      widgets: activeDashboard.widgets,
      ...(sections ? { sections } : activeDashboard.sections ? { sections: activeDashboard.sections } : {})
    });
  }

  async function handleDashboardVisibilityChange(visibility: DashboardVisibility) {
    if (!token || !selectedProject || !activeDashboard) return;
    try {
      const response = await updateDashboard(token, selectedProject.id, activeDashboard.id, {
        title: activeDashboard.title,
        ...(activeDashboard.description ? { description: activeDashboard.description } : {}),
        visibility,
        layoutVersion: activeDashboard.layoutVersion ?? DASHBOARD_LAYOUT_VERSION,
        layout: activeDashboard.layout,
        widgets: activeDashboard.widgets,
        ...(activeDashboard.sections ? { sections: activeDashboard.sections } : {})
      });
      setDashboards((current) => upsertDashboardRecord(current, response.dashboard));
      setBanner({
        tone: "success",
        title: visibility === "project" ? "Dashboard shared" : "Dashboard made private",
        message: `${response.dashboard.title} updated.`,
        requestId: response.requestId
      });
    } catch (error) {
      if (isAuthFailure(error)) {
        clearAuth(errorBanner(error, "Session expired"));
      } else {
        setBanner(errorBanner(error, "Could not update dashboard visibility"));
      }
      throw error;
    }
  }

  async function handleRenameDashboard(dashboardId: string) {
    if (!token || !selectedProject) return;
    const dashboard = dashboards.find((entry) => entry.id === dashboardId);
    if (!dashboard) return;
    const title = window.prompt("Dashboard name", dashboard.title)?.trim();
    if (!title || title === dashboard.title) return;
    const description = window.prompt("Dashboard description", dashboard.description ?? "")?.trim();
    try {
      const response = await updateDashboard(token, selectedProject.id, dashboard.id, {
        title,
        ...(description ? { description } : dashboard.description ? { description: dashboard.description } : {}),
        visibility: dashboard.visibility,
        layoutVersion: dashboard.layoutVersion ?? DASHBOARD_LAYOUT_VERSION,
        layout: dashboard.layout,
        widgets: dashboard.widgets,
        ...(dashboard.sections ? { sections: dashboard.sections } : {})
      });
      setDashboards((current) => upsertDashboardRecord(current, response.dashboard));
      setBanner({ tone: "success", title: "Dashboard renamed", message: response.dashboard.title, requestId: response.requestId });
    } catch (error) {
      if (isAuthFailure(error)) {
        clearAuth(errorBanner(error, "Session expired"));
      } else {
        setBanner(errorBanner(error, "Could not rename dashboard"));
      }
    }
  }

  async function handleDuplicateDashboard(dashboardId: string) {
    if (!token || !selectedProject) return;
    const dashboard = dashboards.find((entry) => entry.id === dashboardId);
    if (!dashboard) return;
    try {
      const response = await createDashboard(token, selectedProject.id, {
        title: `${dashboard.title} Copy`,
        ...(dashboard.description ? { description: dashboard.description } : {}),
        visibility: dashboard.visibility,
        layoutVersion: dashboard.layoutVersion ?? DASHBOARD_LAYOUT_VERSION,
        layout: dashboard.layout,
        widgets: dashboard.widgets,
        ...(dashboard.sections ? { sections: dashboard.sections } : {}),
        ...(dashboard.sourceConversationId ? { sourceConversationId: dashboard.sourceConversationId } : {})
      });
      setDashboards((current) => upsertDashboardRecord(current, response.dashboard));
      applyWorkspacePath(selectedProject.id, "dashboards", response.dashboard.id);
      setBanner({ tone: "success", title: "Dashboard duplicated", message: response.dashboard.title, requestId: response.requestId });
    } catch (error) {
      if (isAuthFailure(error)) {
        clearAuth(errorBanner(error, "Session expired"));
      } else {
        setBanner(errorBanner(error, "Could not duplicate dashboard"));
      }
    }
  }

  async function handleDeleteDashboard(dashboardId: string) {
    if (!token || !selectedProject) return;
    const dashboard = dashboards.find((entry) => entry.id === dashboardId);
    if (!dashboard || !window.confirm(`Delete "${dashboard.title}"? This removes the dashboard only, not BMS data.`)) return;
    try {
      const response = await deleteDashboard(token, selectedProject.id, dashboard.id);
      setDashboards((current) => current.filter((entry) => entry.id !== dashboard.id));
      if (dashboard.id === activeDashboardId) {
        applyWorkspacePath(selectedProject.id, "dashboards");
      }
      setBanner({ tone: "success", title: "Dashboard deleted", message: dashboard.title, requestId: response.requestId });
    } catch (error) {
      if (isAuthFailure(error)) {
        clearAuth(errorBanner(error, "Session expired"));
      } else {
        setBanner(errorBanner(error, "Could not delete dashboard"));
      }
    }
  }

  async function handleMergeDashboard(sourceDashboardId: string, targetDashboardId?: string) {
    if (!token || !selectedProject) return;
    const source = dashboards.find((entry) => entry.id === sourceDashboardId);
    if (!source) return;
    const candidates = dashboards.filter((entry) => entry.id !== sourceDashboardId);
    if (candidates.length === 0) {
      setBanner({ tone: "warning", title: "No target dashboard", message: "Create another dashboard before merging." });
      return;
    }
    const requested = targetDashboardId ?? window.prompt(
      `Merge "${source.title}" into dashboard:\n${dashboardChoiceLines(candidates)}\n\nType a dashboard name or number.`,
      candidates[0]?.title
    )?.trim();
    if (!requested) return;
    const target = targetDashboardId
      ? candidates.find((entry) => entry.id === targetDashboardId)
      : findDashboardChoice(candidates, requested);
    if (!target) {
      setBanner({ tone: "error", title: "Dashboard not found", message: "Choose an existing target dashboard." });
      return;
    }
    const merged = mergeDashboardIntoTarget(source, target);
    try {
      const response = await updateDashboard(token, selectedProject.id, target.id, {
        title: target.title,
        ...(target.description ? { description: target.description } : {}),
        visibility: target.visibility,
        layoutVersion: target.layoutVersion ?? DASHBOARD_LAYOUT_VERSION,
        layout: merged.layout,
        widgets: merged.widgets,
        sections: merged.sections,
        ...(target.sourceConversationId ? { sourceConversationId: target.sourceConversationId } : {})
      });
      setDashboards((current) => upsertDashboardRecord(current, response.dashboard));
      applyWorkspacePath(selectedProject.id, "dashboards", response.dashboard.id);
      setBanner({ tone: "success", title: "Dashboard merged", message: `${source.title} copied into ${response.dashboard.title}.`, requestId: response.requestId });
    } catch (error) {
      if (isAuthFailure(error)) {
        clearAuth(errorBanner(error, "Session expired"));
      } else {
        setBanner(errorBanner(error, "Could not merge dashboards"));
      }
    }
  }

  async function handleCopyWidgetToDashboard(widgetId: string, targetDashboardId: string) {
    if (!token || !selectedProject || !activeDashboard) return;
    const sourceWidget = activeDashboard.widgets.find((widget) => widget.id === widgetId);
    const target = dashboards.find((dashboard) => dashboard.id === targetDashboardId);
    if (!sourceWidget || !target) return;
    const sourceSection = sectionsForDashboardSpec(activeDashboard).find((section) => section.widgetIds.includes(widgetId));
    const sourceLayout = activeDashboard.layout.find((item) => item.widgetId === widgetId) ?? defaultLayoutForDashboardWidget(sourceWidget, 0);
    const miniSource: DashboardRecord = {
      ...activeDashboard,
      layoutVersion: activeDashboard.layoutVersion ?? DASHBOARD_LAYOUT_VERSION,
      widgets: [sourceWidget],
      layout: [sourceLayout],
      sections: [{ ...(sourceSection ?? { ...dashboardWidgetSectionInfo(sourceWidget), widgetIds: [widgetId] }), widgetIds: [widgetId] }]
    };
    const merged = mergeDashboardIntoTarget(miniSource, target);
    try {
      const response = await updateDashboard(token, selectedProject.id, target.id, {
        title: target.title,
        ...(target.description ? { description: target.description } : {}),
        visibility: target.visibility,
        layoutVersion: target.layoutVersion ?? DASHBOARD_LAYOUT_VERSION,
        layout: merged.layout,
        widgets: merged.widgets,
        sections: merged.sections,
        ...(target.sourceConversationId ? { sourceConversationId: target.sourceConversationId } : {})
      });
      setDashboards((current) => upsertDashboardRecord(current, response.dashboard));
      setBanner({ tone: "success", title: "Widget copied", message: `${sourceWidget.title} copied to ${response.dashboard.title}.`, requestId: response.requestId });
    } catch (error) {
      if (isAuthFailure(error)) {
        clearAuth(errorBanner(error, "Session expired"));
      } else {
        setBanner(errorBanner(error, "Could not copy widget"));
      }
    }
  }

  async function handleSend(message: string) {
    if (sendInFlightRef.current) {
      return;
    }
    if (!token || !selectedProject) {
      setBanner({ tone: "error", title: "Select a project first", message: "Chat is available only after authentication and project selection.", code: "project_not_selected" });
      return;
    }
    if (!message.trim()) {
      setBanner({ tone: "error", title: "Message required", message: "Enter a non-empty message before sending.", code: "chat_invalid" });
      return;
    }
    sendInFlightRef.current = true;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    setBusy(true);
    const projectId = selectedProject.id;
    const userId = user?.id ?? "local-user";
    let targetConversationId = activeConversationId;

    if (!targetConversationId) {
      try {
        const created = await createConversation(token, projectId);
        targetConversationId = created.conversation.id;
        setActiveConversationId(created.conversation.id);
        activeConversationIdRef.current = created.conversation.id;
        setPendingNewChat(false);
        setConversations((current) => current.some((c) => c.id === created.conversation.id) ? current : upsertConversationSummary(current, created.conversation));
        setProjectConversationCounts((current) => ({ ...current, [projectId]: (current[projectId] ?? 0) + 1 }));
      } catch (error) {
        abortControllerRef.current = null;
        sendInFlightRef.current = false;
        setBusy(false);
        setBanner(errorBanner(error, "Could not create conversation"));
        return;
      }
    }

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

    const turnStartedAt = Date.now();
    setStreamElapsedTick(0);
    streamingTurnRef.current = {
      conversationId: targetConversationId,
      assistantId: streamingId,
      userId: optimisticUser.id,
      activities: [],
      startedAt: turnStartedAt,
      interimNarration: "",
      answerPhase: false,
      workElapsedMs: 0,
      workSegmentStartedAt: turnStartedAt,
      workTimelinePaused: false,
      streamTimelineFinalized: false
    };
    setConversationStreams((current) => ({
      ...current,
      [targetConversationId]: {
        conversationId: targetConversationId,
        optimisticUser,
        streamingAssistant,
        activities: [],
        startedAt: turnStartedAt,
        interimNarration: "",
        answerPhase: false,
        workElapsedMs: 0,
        workSegmentStartedAt: turnStartedAt,
        workTimelinePaused: false,
        streamTimelineFinalized: false
      }
    }));
    setConversations((current) => {
      const existing = current.find((conversation) => conversation.id === targetConversationId);
      if (!existing) return current;
      const title = existing.title === "New conversation"
        ? instantConversationTitle(message.trim())
        : existing.title;
      return upsertConversationSummary(current, { ...existing, title, createdAt: new Date().toISOString() });
    });

    try {
      await sendChatMessageStream(token, projectId, message.trim(), {
        onNarrationToken(content: string) {
          const turn = streamingTurnRef.current;
          if (!turn || turn.assistantId !== streamingId || !turn.conversationId || turn.answerPhase) return;
          pauseWorkingTimelineForStream(turn);
          turn.interimNarration += content;
          setConversationStreams((current) => {
            const stream = current[turn.conversationId!];
            if (!stream) return current;
            return {
              ...current,
              [turn.conversationId!]: {
                ...stream,
                interimNarration: turn.interimNarration,
                ...streamingWorkFieldsFromTurn(turn)
              }
            };
          });
        },
        onAnswerToken(content: string) {
          const turn = streamingTurnRef.current;
          if (!turn || turn.assistantId !== streamingId || !turn.conversationId) return;
          pauseWorkingTimelineForStream(turn);
          if (!turn.answerPhase) {
            turn.answerPhase = true;
          }
          setConversationStreams((current) => {
            const stream = current[turn.conversationId!];
            if (!stream) return current;
            return {
              ...current,
              [turn.conversationId!]: {
                ...stream,
                streamingAssistant: { ...stream.streamingAssistant, content: stream.streamingAssistant.content + content },
                ...streamingWorkFieldsFromTurn(turn)
              }
            };
          });
          if (turn.conversationId === activeConversationIdRef.current) {
            setMessages((current) => current.map((m) => (m.id === streamingId ? { ...m, content: m.content + content } : m)));
          }
        },
        onFinalAnswerStart() {
          const turn = streamingTurnRef.current;
          if (!turn || turn.assistantId !== streamingId || !turn.conversationId) return;
          pauseWorkingTimelineForStream(turn);
          turn.answerPhase = true;
          turn.interimNarration = "";
          setConversationStreams((current) => {
            const stream = current[turn.conversationId!];
            if (!stream) return current;
            return {
              ...current,
              [turn.conversationId!]: {
                ...stream,
                interimNarration: "",
                ...streamingWorkFieldsFromTurn(turn)
              }
            };
          });
        },
        onToken(content: string) {
          const turn = streamingTurnRef.current;
          if (!turn || turn.assistantId !== streamingId || !turn.conversationId) return;
          pauseWorkingTimelineForStream(turn);
          if (!turn.answerPhase) {
            turn.answerPhase = true;
          }
          setConversationStreams((current) => {
            const stream = current[turn.conversationId!];
            if (!stream) return current;
            return {
              ...current,
              [turn.conversationId!]: {
                ...stream,
                streamingAssistant: { ...stream.streamingAssistant, content: stream.streamingAssistant.content + content },
                ...streamingWorkFieldsFromTurn(turn)
              }
            };
          });
          if (turn.conversationId === activeConversationIdRef.current) {
            setMessages((current) => current.map((m) => (m.id === streamingId ? { ...m, content: m.content + content } : m)));
          }
        },
        onTokenReset() {
          const turn = streamingTurnRef.current;
          if (!turn || turn.assistantId !== streamingId || !turn.conversationId) return;
          setConversationStreams((current) => {
            const stream = current[turn.conversationId!];
            if (!stream) return current;
            return {
              ...current,
              [turn.conversationId!]: {
                ...stream,
                streamingAssistant: { ...stream.streamingAssistant, content: "" }
              }
            };
          });
          if (turn.conversationId === activeConversationIdRef.current) {
            setMessages((current) => current.map((m) => (m.id === streamingId ? { ...m, content: "" } : m)));
          }
        },
        onActivity(event: ChatStreamActivityEvent) {
          const turn = streamingTurnRef.current;
          if (!turn || turn.assistantId !== streamingId) return;
          turn.activities = (() => {
            const current = turn.activities;
            // Same id → replace the row in place (e.g. tool running → done).
            if (event.id) {
              const idx = current.findIndex((a) => a.id === event.id);
              if (idx >= 0) {
                const next = current.slice();
                next[idx] = event;
                return next;
              }
            }
            // No id → fall back to label+kind dedup so retried progress lines collapse.
            const dupe = current.find((a) => !a.id && a.label === event.label && a.kind === event.kind);
            if (dupe) {
              return current.map((a) => (a === dupe ? event : a));
            }
            return [...current, event];
          })();
          if (event.kind === "context") {
            turn.interimNarration = "";
          }
          if (activitiesHaveRunningTools(turn.activities)) {
            resumeWorkingTimelineForOngoingTask(turn);
          }
          if (turn.conversationId) {
            setConversationStreams((current) => {
              const stream = current[turn.conversationId!];
              if (!stream) return current;
              return {
                ...current,
                [turn.conversationId!]: {
                  ...stream,
                  activities: turn.activities,
                  interimNarration: turn.interimNarration,
                  ...streamingWorkFieldsFromTurn(turn)
                }
              };
            });
          }
        },
        onProgress(event) {
          const label = event.message.trim();
          if (!label) return;
          const turn = streamingTurnRef.current;
          if (!turn || turn.assistantId !== streamingId) return;
          turn.activities = (() => {
            const current = turn.activities;
            const dupe = current.find((a) => a.label === label && a.kind === "context");
            if (dupe) return current;
            return [...current, { label, kind: "context" as const }];
          })();
          if (turn.conversationId) {
            setConversationStreams((current) => {
              const stream = current[turn.conversationId!];
              if (!stream) return current;
              return {
                ...current,
                [turn.conversationId!]: {
                  ...stream,
                  activities: turn.activities
                }
              };
            });
          }
        },
        onConversationTitle({ conversationId, title }) {
          setConversations((current) => {
            const existing = current.find((conversation) => conversation.id === conversationId);
            if (!existing) return current;
            return upsertConversationSummary(current, { ...existing, title });
          });
        },
        onLifecycle(event: ChatLifecycleEvent) {
          if (event.type === "turn_completed" && event.message) {
            const turn = streamingTurnRef.current;
            if (!turn || turn.assistantId !== streamingId || !turn.conversationId) return;
            setConversationStreams((current) => {
              const stream = current[turn.conversationId!];
              if (!stream) return current;
              return {
                ...current,
                [turn.conversationId!]: {
                  ...stream,
                  streamingAssistant: { ...stream.streamingAssistant, content: event.message }
                }
              };
            });
            if (turn.conversationId === activeConversationIdRef.current) {
              setMessages((current) =>
                current.map((m) => (m.id === streamingId ? { ...m, content: event.message } : m))
              );
            }
          }
        },
        onError(error) {
          const turn = streamingTurnRef.current;
          if (turn?.conversationId) {
            setConversationStreams((current) => {
              const next = { ...current };
              delete next[turn.conversationId!];
              return next;
            });
          }
          if (turn?.conversationId === activeConversationIdRef.current) {
            setMessages((current) => current.filter((m) => m.id !== optimisticUser.id && m.id !== streamingId));
          }
          streamingTurnRef.current = null;
          setBanner({ tone: "error", title: error.code, message: error.message, ...(error.requestId ? { requestId: error.requestId } : {}) });
        },
        onDone(response) {
          const turn = streamingTurnRef.current;
          if (turn?.assistantId === streamingId && turn.conversationId) {
            pauseWorkingTimelineForStream(turn);
            turn.streamTimelineFinalized = true;
            turn.workTimelinePaused = true;
          }
          const capturedActivities = turn?.assistantId === streamingId ? [...turn.activities] : [];
          const finalDuration = turn?.assistantId === streamingId
            ? computeStreamingWorkMs(turn.workElapsedMs, turn.workSegmentStartedAt)
            : 0;
          const completedConversationId = turn?.conversationId ?? response.conversationId ?? null;
          const finalAssistantMessage = {
            ...response.assistantMessage,
            activities: capturedActivities.length > 0 ? capturedActivities : undefined,
            workDuration: finalDuration > 0 ? finalDuration : undefined
          };
          const completedConversationDeleted = completedConversationId
            ? deletedConversationIdsRef.current.has(completedConversationId)
            : false;
          if (!completedConversationDeleted && completedConversationId === activeConversationIdRef.current) {
            setMessages((current) => [
              ...current.filter((message) => message.id !== optimisticUser.id && message.id !== streamingId),
              response.message,
              finalAssistantMessage
            ]);
          }
          if (completedConversationId) {
            setConversationStreams((current) => {
              const next = { ...current };
              delete next[completedConversationId];
              return next;
            });
          }
          if (response.artifact) {
            setRepositoryItems((current) => {
              const exists = current.some((item) => item.id === response.artifact!.id);
              const visibleArtifact = isVisibleRepositoryArtifact(response.artifact!);
              if (!exists && visibleArtifact) {
                setRepoTotalCount((c) => c + 1);
              }
              return [
                ...current.filter((item) => item.id !== response.artifact!.id),
                ...(visibleArtifact ? [artifactToRepositoryItem(response.artifact!)] : [])
              ];
            });
          }
          if (response.conversationId && !deletedConversationIdsRef.current.has(response.conversationId)) {
            const updatedTitle = response.conversationTitle ?? "New conversation";
            setConversations((current) => {
              const existing = current.find((c) => c.id === response.conversationId);
              if (existing) {
                return upsertConversationSummary(current, {
                  ...existing,
                  title: updatedTitle,
                  messageCount: Math.max(existing.messageCount + 2, 2),
                  createdAt: new Date().toISOString()
                });
              }
              return upsertConversationSummary(current, { id: response.conversationId!, title: updatedTitle, messageCount: 2, createdAt: new Date().toISOString() });
            });
          }
          setChatProviderDiagnostics(response.provider);
          setChatProviderRequestId(response.requestId);
          streamingTurnRef.current = null;
          setBanner(null);
        }
      }, targetConversationId ?? undefined, signal);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        const turn = streamingTurnRef.current;
        if (turn?.conversationId) {
          setConversationStreams((current) => {
            const next = { ...current };
            delete next[turn.conversationId!];
            return next;
          });
        }
        if (turn?.conversationId === activeConversationIdRef.current) {
          setMessages((current) => current.filter((m) => m.id !== optimisticUser.id && m.id !== streamingId));
        }
        streamingTurnRef.current = null;
        setBanner(null);
        return;
      }
      const turn = streamingTurnRef.current;
      if (turn?.conversationId) {
        setConversationStreams((current) => {
          const next = { ...current };
          delete next[turn.conversationId!];
          return next;
        });
      }
      if (turn?.conversationId === activeConversationIdRef.current) {
        setMessages((current) => current.filter((m) => m.id !== optimisticUser.id && m.id !== streamingId));
      }
      streamingTurnRef.current = null;
      if (isAuthFailure(error)) {
        clearAuth(errorBanner(error, "Session expired"));
      } else {
        setBanner(errorBanner(error, "Chat message failed"));
      }
    } finally {
      abortControllerRef.current = null;
      sendInFlightRef.current = false;
      setBusy(false);
    }
  }

  function handleStop() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    const turn = streamingTurnRef.current;
    if (turn?.conversationId) {
      setConversationStreams((current) => {
        const next = { ...current };
        delete next[turn.conversationId!];
        return next;
      });
      if (turn.conversationId === activeConversationIdRef.current) {
        setMessages((current) => current.filter((message) => message.id !== turn.userId && message.id !== turn.assistantId));
      }
    }
    streamingTurnRef.current = null;
  }

  async function handleNewChat() {
    if (!token || !selectedProject) {
      setActiveTab("chat");
      setActiveDashboardId(null);
      setActiveMetricId(null);
      setMessages([]);
      setChatProviderDiagnostics(null);
      setChatProviderRequestId(undefined);
      return;
    }
    setPendingNewChat(true);
    setActiveConversationId(null);
    setMessages([]);
    setChatProviderDiagnostics(null);
    setChatProviderRequestId(undefined);
    applyWorkspacePath(selectedProject.id, "chat");
    setBanner({
      tone: "info",
      title: "New chat ready",
      message: "Send a message to start a new conversation."
    });
  }

  async function handleSelectConversation(convId: string) {
    if (!token || !selectedProject) return;
    if (convId === activeConversationId) {
      setPendingNewChat(false);
      applyWorkspacePath(selectedProject.id, "chat");
      return;
    }
    setPendingNewChat(false);
    setBusy(true);
    try {
      const result = await selectConversation(token, selectedProject.id, convId);
      setMessages(mergeMessagesWithStreamingState(result.messages, conversationStreams[convId]));
      setActiveConversationId(convId);
      applyWorkspacePath(selectedProject.id, "chat");
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
    deletedConversationIdsRef.current.add(convId);
    const activeStream = streamingTurnRef.current;
    if (activeStream?.conversationId === convId) {
      abortControllerRef.current?.abort();
    }
    setConversations((current) => current.filter((c) => c.id !== convId));
    setConversationStreams((current) => {
      const next = { ...current };
      delete next[convId];
      return next;
    });
    setBusy(true);
    try {
      const result = await deleteConversation(token, selectedProject.id, convId);
      setConversations((current) => current.filter((c) => c.id !== result.conversationId));
      setConversationStreams((current) => {
        const next = { ...current };
        delete next[result.conversationId];
        return next;
      });
      if (convId === activeConversationId) {
        setActiveConversationId(null);
        setPendingNewChat(false);
        setMessages([]);
        setChatProviderDiagnostics(null);
        setChatProviderRequestId(undefined);
      }
      setBanner({ tone: "success", title: "Conversation deleted", message: `Removed ${result.removedMessages} messages.`, requestId: result.requestId });
    } catch (error) {
      deletedConversationIdsRef.current.delete(convId);
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
      setConversations((current) => sortConversationsByNewest(current.map((c) => (c.id === convId ? result.conversation : c))));
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
        setPendingNewChat(false);
        setKnowledgeBaseDocuments([]);
        setRepositoryItems([]);
        setDashboards([]);
        setActiveDashboardId(null);
        setDerivedMetrics([]);
        setActiveMetricId(null);
        setDashboardLiveValues({});
        setDashboardRealtimeAt(null);
        setKbTotalCount(0);
        setRepoTotalCount(0);
        setChatProviderDiagnostics(null);
        setChatProviderRequestId(undefined);
        setRegistry(null);
        setManagement(null);
        setConversationStreams({});
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
      setActiveDashboardId(null);
      setActiveMetricId(null);
      setMessages([]);
      setChatProviderDiagnostics(null);
      setChatProviderRequestId(undefined);
      return;
    }
    setBusy(true);
    try {
      const reset = await resetChat(token, selectedProject.id, activeConversationId ?? undefined);
      setMessages([]);
      if (activeConversationId) {
        setConversationStreams((current) => {
          const next = { ...current };
          delete next[activeConversationId];
          return next;
        });
      }
      setChatProviderDiagnostics(null);
      setChatProviderRequestId(undefined);
      applyWorkspacePath(selectedProject.id, "chat");
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

  async function handleOpenMetric(instanceId: string) {
    if (!token || !selectedProject) return;
    applyWorkspacePath(selectedProject.id, "kpis", null, instanceId);
    setBanner(null);
    if (derivedMetrics.some((metric) => metric.instance.instanceId === instanceId)) {
      return;
    }
    try {
      const response = await getDerivedMetric(token, selectedProject.id, instanceId);
      setDerivedMetrics((current) => upsertDerivedMetricAsset(current, response.metric));
    } catch (error) {
      if (isAuthFailure(error)) {
        clearAuth(errorBanner(error, "Session expired"));
      } else {
        setBanner(errorBanner(error, "Could not open KPI/FDD asset"));
      }
    }
  }

  async function handleToggleMetricMaterialization(instanceIds: string[], enabled: boolean) {
    if (!token || !selectedProject || instanceIds.length === 0) return;
    try {
      const responses = await Promise.all(instanceIds.map((instanceId) =>
        updateDerivedMetricMaterialization(token, selectedProject.id, instanceId, { enabled })
      ));
      setDerivedMetrics((current) => responses.reduce(
        (next, response) => upsertDerivedMetricAsset(next, response.metric),
        current
      ));
      setBanner({
        tone: "success",
        title: enabled ? "Background Calculation enabled" : "Background Calculation disabled",
        message: responses.length === 1
          ? responses[0]!.metric.instance.displayName
          : `${responses.length} Background Calculation entries updated`,
        requestId: responses.at(-1)?.requestId
      });
    } catch (error) {
      if (isAuthFailure(error)) {
        clearAuth(errorBanner(error, "Session expired"));
      } else {
        setBanner(errorBanner(error, "Could not update Background Calculation"));
      }
    }
  }

  const authenticated = Boolean(token && user);
  const shellVariant = "workspace";
  const showProjectPicker = authenticated && !bootstrapping && !selectedProject;
  const showWorkspace = authenticated && Boolean(selectedProject);
  const showBootstrapProjectShell = authenticated && bootstrapping && !selectedProject;

  return (
    <AppShell authenticated={authenticated} onSignOut={() => clearAuth()} variant={shellVariant}>
      {banner ? <Banner {...banner} onDismiss={() => setBanner(null)} /> : null}
      {showBootstrapProjectShell ? <ProjectScreenSkeleton /> : null}
      {!bootstrapping && !authenticated ? <LoginScreen onLogin={handleLogin} busy={busy} /> : null}
      {showProjectPicker ? (
        <ProjectScreen
          projects={projects}
          user={user}
          busy={busy}
          onSelect={handleProjectSelect}
          onCreate={(name) => { void handleCreateProject(name); }}
          onSignOut={() => clearAuth()}
        />
      ) : null}
      {showWorkspace ? (
        <Workspace
          project={selectedProject}
          projects={projects}
          user={user}
          token={token}
          messages={visibleMessages}
          conversations={conversations}
          activeConversationId={activeConversationId}
          kbDocuments={knowledgeBaseDocuments}
          repoItems={repositoryItems}
          dashboards={dashboards}
          activeDashboard={activeDashboard}
          derivedMetrics={derivedMetrics}
          activeMetricGroup={activeMetricGroup}
          activeMetricId={activeMetricId}
          dashboardLiveValues={dashboardLiveValues}
          dashboardRealtimeStale={dashboardRealtimeStale}
          kbTotalCount={kbTotalCount}
          repoTotalCount={repoTotalCount}
          providerDiagnostics={chatProviderDiagnostics}
          providerRequestId={chatProviderRequestId}
          registry={registry}
          management={management}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onSend={handleSend}
          onNewChat={handleNewChat}
          onResetChat={handleResetChat}
          onSwitchProject={() => {
            setSelectedProject(null);
            setMessages([]);
            setConversations([]);
            setActiveConversationId(null);
            setDashboards([]);
            setActiveDashboardId(null);
            setDerivedMetrics([]);
            setActiveMetricId(null);
            setDashboardLiveValues({});
            setDashboardRealtimeAt(null);
            storeSession({ token, user, projectId: null });
            window.history.pushState({}, "", "/");
          }}
          onSelectProject={(project) => { void handleProjectSelect(project); }}
          onSelectConversation={(convId) => { void handleSelectConversation(convId); }}
          onOpenDashboard={(dashboardId) => { void handleOpenDashboard(dashboardId); }}
          onOpenMetric={(instanceId) => { void handleOpenMetric(instanceId); }}
          onCreateProject={(name) => { void handleCreateProject(name); }}
          onSignOut={() => clearAuth()}
          projectConversationCounts={projectConversationCounts}
          projectAssetCounts={projectAssetCounts}
          busy={busy}
          onDeleteConversation={(convId) => { void handleDeleteConversation(convId); }}
          onRenameConversation={(convId, title) => { void handleRenameConversation(convId, title); }}
          onDeleteProject={(projectId) => { void handleDeleteProject(projectId); }}
          onDashboardSpecChange={handleDashboardSpecChange}
          onDashboardLayoutChange={handleDashboardLayoutChange}
          onDashboardVisibilityChange={handleDashboardVisibilityChange}
          onRenameDashboard={handleRenameDashboard}
          onDuplicateDashboard={handleDuplicateDashboard}
          onDeleteDashboard={handleDeleteDashboard}
          onMergeDashboard={handleMergeDashboard}
          onCopyWidgetToDashboard={handleCopyWidgetToDashboard}
          onToggleMetricMaterialization={handleToggleMetricMaterialization}
          onStop={handleStop}
          streamingActivity={visibleStreamingActivity}
          streamOutputStarted={streamShowsWorkedFor(visibleStreamState)}
          {...(visibleStreamState ? { streamAnswerPhase: visibleStreamState.answerPhase } : {})}
          streamTick={streamElapsedTick}
          {...(visibleStreamState ? { streamInterimNarration: visibleStreamState.interimNarration } : {})}
          {...(visibleStreamState ? { streamWorkElapsedMs: visibleStreamState.workElapsedMs } : {})}
          {...(visibleStreamState ? { streamWorkSegmentStartedAt: visibleStreamState.workSegmentStartedAt } : {})}
          soloDashboardView={soloDashboardView}
          restoringSession={bootstrapping}
        />
      ) : null}
      {session ? <footer className="diagnostic-footer">Session project: {session.projectId ?? "none selected"}</footer> : null}
    </AppShell>
  );
}
