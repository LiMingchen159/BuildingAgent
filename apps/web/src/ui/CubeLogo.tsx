import type { CSSProperties } from "react";

export interface CubeLogoProps {
  size?: number | undefined;
  className?: string | undefined;
}

export function CubeLogo({ size = 48, className }: CubeLogoProps) {
  const half = size / 2;
  const style: CSSProperties & Record<string, string> = {
    width: `${size}px`,
    height: `${size}px`,
    "--cube-half": `${half}px`
  };
  const composed = ["cube-logo", className].filter(Boolean).join(" ");
  return (
    <div className={composed} style={style} aria-hidden="true">
      <div className="cube-logo-face" />
      <div className="cube-logo-face" />
      <div className="cube-logo-face" />
      <div className="cube-logo-face" />
      <div className="cube-logo-face" />
      <div className="cube-logo-face" />
    </div>
  );
}
