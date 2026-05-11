import type { ReactNode } from "react";

export interface LeftSidebarProps {
  children: ReactNode;
  ariaLabel?: string | undefined;
  className?: string | undefined;
}

export function LeftSidebar({ children, ariaLabel = "Primary navigation", className }: LeftSidebarProps) {
  const composed = ["workspace-sidebar", className].filter(Boolean).join(" ");
  return (
    <aside className={composed} aria-label={ariaLabel}>
      <div className="workspace-sidebar-inner">{children}</div>
    </aside>
  );
}
