import type { ReactNode } from "react";

export interface RightPanelProps {
  children: ReactNode;
  ariaLabel?: string | undefined;
  className?: string | undefined;
}

export function RightPanel({ children, ariaLabel = "Workspace details", className }: RightPanelProps) {
  const composed = ["workspace-right", className].filter(Boolean).join(" ");
  return (
    <aside className={composed} aria-label={ariaLabel}>
      <div className="workspace-right-inner">{children}</div>
    </aside>
  );
}
