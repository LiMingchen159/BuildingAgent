import type { ReactNode } from "react";

export interface CenterWorkspaceProps {
  children: ReactNode;
  ariaLabel?: string | undefined;
  className?: string | undefined;
}

export function CenterWorkspace({ children, ariaLabel = "Workspace content", className }: CenterWorkspaceProps) {
  const composed = ["workspace-center", className].filter(Boolean).join(" ");
  return (
    <main className={composed} aria-label={ariaLabel}>
      <div className="workspace-center-inner">{children}</div>
    </main>
  );
}
