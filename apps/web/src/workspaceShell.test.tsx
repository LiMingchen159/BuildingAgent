import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspaceShell } from "./ui/WorkspaceShell";

describe("WorkspaceShell layout", () => {
  it("renders three labelled regions when right content is provided", () => {
    render(
      <WorkspaceShell
        leftLabel="Project list"
        centerLabel="Active project"
        rightLabel="Diagnostics"
        left={<p>left content</p>}
        center={<p>center content</p>}
        right={<p>right content</p>}
      />
    );

    expect(screen.getByRole("complementary", { name: "Project list" })).toHaveTextContent("left content");
    expect(screen.getByRole("main", { name: "Active project" })).toHaveTextContent("center content");
    expect(screen.getByRole("complementary", { name: "Diagnostics" })).toHaveTextContent("right content");
  });

  it("falls back to default region labels and omits the right panel when no right slot is given", () => {
    const { container } = render(
      <WorkspaceShell
        left={<p>left</p>}
        center={<p>center</p>}
      />
    );

    expect(screen.getByRole("complementary", { name: "Primary navigation" })).toBeInTheDocument();
    expect(screen.getByRole("main", { name: "Workspace content" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Workspace details" })).not.toBeInTheDocument();

    const shell = container.querySelector(".workspace-shell");
    expect(shell).toHaveClass("workspace-shell-no-right");
  });

  it("forwards a custom className alongside the workspace-shell base class", () => {
    const { container } = render(
      <WorkspaceShell
        className="custom-shell"
        left={<p>left</p>}
        center={<p>center</p>}
        right={<p>right</p>}
      />
    );

    const shell = container.querySelector(".workspace-shell");
    expect(shell).toHaveClass("workspace-shell", "custom-shell");
  });
});
