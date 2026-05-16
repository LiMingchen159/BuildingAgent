import "react";

declare module "react" {
  interface ButtonHTMLAttributes<T> {
    popovertarget?: string;
    popovertargetaction?: "toggle" | "show" | "hide";
  }
  interface HTMLAttributes<T> {
    popover?: "" | "auto" | "manual" | "hint";
  }
  interface CSSProperties {
    anchorName?: string;
    positionAnchor?: string;
  }
}
