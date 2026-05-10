import type { ReactNode } from "react";

export type BannerTone = "error" | "info" | "success";

export interface DiagnosticLineProps {
  code?: string | undefined;
  requestId?: string | undefined;
  className?: string | undefined;
}

export interface BannerProps extends DiagnosticLineProps {
  tone?: BannerTone | undefined;
  title: string;
  message: string;
}

export interface AppShellProps {
  children: ReactNode;
  authenticated?: boolean | undefined;
  onSignOut?: (() => void) | undefined;
}

export interface SurfaceProps {
  children: ReactNode;
  className?: string | undefined;
  labelledBy?: string | undefined;
}

export interface EmptyStateProps {
  children: ReactNode;
  title?: string | undefined;
}

export interface LoadingSkeletonProps {
  label?: string | undefined;
  lines?: number | undefined;
}

const MOCK_LABELS = {
  mock: "Mock data only",
  stub: "Stub surface only",
  placeholder: "Placeholder-only",
  inspection: "Inspection surfaces are placeholder-only"
} as const;

export type MockOnlyBadgeKind = keyof typeof MOCK_LABELS;

export interface MockOnlyBadgeProps {
  kind?: MockOnlyBadgeKind | undefined;
  label?: string | undefined;
}

function classNames(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}

export function BrandMark() {
  return <span className="brand-mark" aria-hidden="true">BA</span>;
}

export function BrandHeader({ authenticated = false, onSignOut }: { authenticated?: boolean | undefined; onSignOut?: (() => void) | undefined }) {
  return (
    <header className="topbar">
      <div>
        <BrandMark />
        <span className="brand-name">BuildingAgent</span>
      </div>
      {authenticated && onSignOut ? <button className="secondary" type="button" onClick={onSignOut}>Sign out</button> : null}
    </header>
  );
}

export function AppShell({ children, authenticated = false, onSignOut }: AppShellProps) {
  return (
    <div className="app-shell">
      <BrandHeader authenticated={authenticated} onSignOut={onSignOut} />
      {children}
    </div>
  );
}

export function DiagnosticLine({ code, requestId, className }: DiagnosticLineProps) {
  if (!code && !requestId) {
    return null;
  }
  return (
    <p className={classNames("diagnostic-line", className)}>
      {code ? <span>Code: {code}</span> : null}
      {requestId ? <span>Request: {requestId}</span> : null}
    </p>
  );
}

export function Banner({ tone = "info", title, message, code, requestId }: BannerProps) {
  return (
    <section className={`banner banner-${tone}`} role={tone === "error" ? "alert" : "status"} aria-live={tone === "error" ? "assertive" : "polite"}>
      <strong>{title}</strong>
      <p>{message}</p>
      <DiagnosticLine code={code} requestId={requestId} />
    </section>
  );
}

export function MockOnlyBadge({ kind = "placeholder", label }: MockOnlyBadgeProps) {
  const displayLabel = label ?? MOCK_LABELS[kind];
  return <span className={`placeholder-badge mock-badge mock-badge-${kind}`}>{displayLabel}</span>;
}

export function Surface({ children, className, labelledBy }: SurfaceProps) {
  return (
    <section className={classNames("surface-card", className)} aria-labelledby={labelledBy}>
      {children}
    </section>
  );
}

export function Card({ children, className, labelledBy }: SurfaceProps) {
  return (
    <article className={classNames("primitive-card", className)} aria-labelledby={labelledBy}>
      {children}
    </article>
  );
}

export function EmptyState({ children, title = "Nothing to show yet" }: EmptyStateProps) {
  return (
    <section className="empty-state management-empty" aria-label={title}>
      <strong>{title}</strong>
      <p>{children}</p>
    </section>
  );
}

export function LoadingSkeleton({ label = "Loading BuildingAgent workspace…", lines = 3 }: LoadingSkeletonProps) {
  const count = Math.max(1, Math.min(lines, 8));
  return (
    <section className="loading-skeleton" role="status" aria-live="polite" aria-label={label}>
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: count }, (_, index) => (
        <span className="loading-skeleton-line" key={index} aria-hidden="true" />
      ))}
    </section>
  );
}
