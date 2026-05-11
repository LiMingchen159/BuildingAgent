import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Banner, EmptyState, LoadingSkeleton, MockOnlyBadge } from "./ui/primitives";

function readTrackedIndexHtml(): string {
 return readFileSync(resolve(__dirname, "../index.html"), "utf8");
}

function getRootFromIndexHtml(): HTMLElement {
 const parser = new DOMParser();
 const documentFromFile = parser.parseFromString(readTrackedIndexHtml(), "text/html");
 const root = documentFromFile.getElementById("root");
 if (!root) {
 throw new Error("Expected apps/web/index.html to include #root.");
 }
 return root;
}

beforeEach(() => {
 document.body.innerHTML = "";
 window.localStorage.clear();
});

describe("BuildingAgent no-blank HTML shell", () => {
 it("ships non-empty tracked #root fallback markup with brand, skeleton loading copy, and mock-only safety language", () => {
 const root = getRootFromIndexHtml();

 expect(root.innerHTML.trim()).not.toHaveLength(0);
 expect(root.querySelector("[data-static-fallback]")).toBeTruthy();
 expect(root.textContent).toMatch(/BuildingAgent/i);
 expect(root.textContent).toMatch(/loading|preparing/i);
 expect(root.querySelector(".html-fallback-skeleton")).toBeTruthy();
 expect(root.textContent).toMatch(/mock|stub/i);
 expect(root.textContent).toMatch(/no live building systems/i);
 expect(root.querySelector('[role="status"]')?.textContent).toMatch(/safe startup mode/i);
 });

 it("mountBuildingAgent removes the static fallback before normal React rendering", async () => {
 const { mountBuildingAgent } = await import("./main");
 const root = document.createElement("div");
 root.id = "root";
 root.innerHTML = getRootFromIndexHtml().innerHTML;
 document.body.append(root);
 expect(root.querySelector("[data-static-fallback]")).toBeTruthy();

 mountBuildingAgent(root);

 expect(root.querySelector("[data-static-fallback]")).toBeNull();
 expect(await screen.findByRole("heading", { name: /sign in to buildingagent/i })).toBeInTheDocument();
 await waitFor(() => expect(screen.queryByText(/safe startup mode/i)).not.toBeInTheDocument());
 });
});

describe("BuildingAgent reusable UI primitives", () => {
 it("renders compact overlay toasts with optional diagnostics and no secret-like fields", () => {
 const { rerender } = render(<Banner tone="error" title="Could not load session" message="Retry with a valid session." code="auth_invalid" requestId="req_123" />);

 const alert = screen.getByRole("alert");
 expect(alert).toHaveTextContent("Could not load session");
 expect(alert).toHaveTextContent("Code: auth_invalid");
 expect(alert).toHaveTextContent("Request: req_123");
 expect(alert).not.toHaveTextContent(/token|api[-_ ]?key|bearer|localStorage/i);

 rerender(<Banner title="Heads up" message="Optional diagnostics are absent." />);
 expect(screen.getByRole("status")).toHaveTextContent("Heads up");
 expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
 });

 it("renders accessible mock-only badges, skeletons, and empty states with safe default copy", () => {
 render(
 <>
 <MockOnlyBadge />
 <MockOnlyBadge kind="mock" />
 <LoadingSkeleton label="Preparing mock workspace…" lines={4} />
 <EmptyState>No placeholder records were returned.</EmptyState>
 </>
 );

 expect(screen.getByText("Placeholder-only")).toBeInTheDocument();
 expect(screen.getByText("Mock data only")).toBeInTheDocument();
 expect(screen.getByRole("status", { name: /preparing mock workspace/i })).toBeInTheDocument();
 expect(screen.getByLabelText(/nothing to show yet/i)).toHaveTextContent("No placeholder records were returned.");
 expect(document.body).not.toHaveTextContent(/api[-_ ]?key|bearer|token|secret/i);
 });
});
