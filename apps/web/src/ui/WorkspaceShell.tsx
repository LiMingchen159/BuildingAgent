import type { ReactNode } from "react";
import { LeftSidebar } from "./LeftSidebar";
import { CenterWorkspace } from "./CenterWorkspace";
import { RightPanel } from "./RightPanel";

export interface WorkspaceShellProps {
  left: ReactNode;
  center: ReactNode;
  right?: ReactNode | undefined;
  leftLabel?: string | undefined;
  centerLabel?: string | undefined;
  rightLabel?: string | undefined;
  className?: string | undefined;
}

export function WorkspaceShell({
  left,
  center,
  right,
  leftLabel,
  centerLabel,
  rightLabel,
  className
}: WorkspaceShellProps) {
  const composed = ["workspace-shell", !right && "workspace-shell-no-right", className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={composed}>
      <LeftSidebar ariaLabel={leftLabel}>{left}</LeftSidebar>
      <CenterWorkspace ariaLabel={centerLabel}>{center}</CenterWorkspace>
      {right ? <RightPanel ariaLabel={rightLabel}>{right}</RightPanel> : null}
    </div>
  );
}

export { LeftSidebar } from "./LeftSidebar";
export { CenterWorkspace } from "./CenterWorkspace";
export { RightPanel } from "./RightPanel";
