import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Banner, EmptyState, LoadingSkeleton, MockOnlyBadge } from "../../../src/ui/primitives";

function readTrackedIndexHtml(): string {
 return readFileSync(resolve(__dirname, "../../../index.html"), "utf8");
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

describe("BuildingGPT shell and primitives via workspace-relative filter", () => {
 it("ships a non-empty static fallback and clears it when React mounts", async () => {
 const rootFromFile = getRootFromIndexHtml();
 expect(rootFromFile.textContent).toMatch(/BuildingGPT/i);
 expect(rootFromFile.querySelector('[role="status"]')?.textContent).toMatch(/safe startup mode/i);

 const { mountBuildingGPT } = await import("../../../src/main");
 const root = document.createElement("div");
 root.id = "root";
 root.innerHTML = rootFromFile.innerHTML;
 document.body.append(root);
 mountBuildingGPT(root);

 expect(root.querySelector("[data-static-fallback]")).toBeNull();
 expect(await screen.findByRole("heading", { name: /sign in to buildinggpt/i })).toBeInTheDocument();
 await waitFor(() => expect(screen.queryByText(/safe startup mode/i)).not.toBeInTheDocument());
 });

 it("renders bounded reusable primitives without leaking secret-like field names", () => {
 const { rerender } = render(<Banner tone="error" title="Could not load session" message="Retry with a valid session." code="auth_invalid" requestId="req_123" />);
 expect(screen.getByRole("alert")).toHaveTextContent("Code: auth_invalid");
 expect(screen.getByRole("alert")).toHaveTextContent("Request: req_123");
 expect(screen.getByRole("alert")).not.toHaveTextContent(/token|api[-_ ]?key|bearer|localStorage/i);

 rerender(
 <>
 <Banner title="Heads up" message="Optional diagnostics are absent." />
 <MockOnlyBadge />
 <MockOnlyBadge kind="mock" />
 <LoadingSkeleton label="Preparing mock workspace…" lines={4} />
 <EmptyState>No placeholder records were returned.</EmptyState>
 </>
 );
 expect(screen.getByRole("status", { name: /preparing mock workspace/i })).toBeInTheDocument();
 expect(screen.getByText("Placeholder-only")).toBeInTheDocument();
 expect(screen.getByText("Mock data only")).toBeInTheDocument();
 expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
 expect(document.body).not.toHaveTextContent(/api[-_ ]?key|bearer|token|secret/i);
 });

 it("renders integrated App bootstrap and mock-only shell labels through shared primitives", async () => {
 window.localStorage.setItem("building-agent.session.v1", JSON.stringify({ token: "seed-token-ada", user: { id: "user_ada", name: "Ada Lovelace" }, projectId: null }));
 let resolveSession!: (response: Response) => void;
 const sessionPromise = new Promise<Response>((resolve) => {
 resolveSession = resolve;
 });
 const fetchMock = vi.fn((input: RequestInfo | URL) => {
 const url = String(input);
 if (url === "/api/session") {
 return sessionPromise;
 }
 if (url === "/api/projects") {
 return new Response(JSON.stringify({ projects: [], limit: 50, requestId: "req_projects" }), { status: 200, headers: { "content-type": "application/json" } });
 }
 return new Response(JSON.stringify({ error: { code: "not_found", message: "Unexpected test URL", requestId: "req_unexpected" } }), { status: 404, headers: { "content-type": "application/json" } });
 });
 vi.stubGlobal("fetch", fetchMock);
 const { default: App } = await import("../../../src/App");
 render(<App />);

 expect(screen.getByRole("heading", { name: /restoring your saved session/i })).toBeInTheDocument();
 expect(screen.getByRole("status", { name: /saved-session bootstrap phase/i })).toHaveTextContent(/restoring your saved session/i);
 expect(screen.queryByText(/checking your saved buildinggpt session/i)).not.toBeInTheDocument();
 expect(screen.queryByText(/startup shell only/i)).not.toBeInTheDocument();
 expect(document.body).not.toHaveTextContent(/bearer|api[-_ ]?key|seed-token-ada|secret/i);

 resolveSession(new Response(JSON.stringify({ session: { userId: "user_ada", projectId: null, permissions: [] }, requestId: "req_session" }), { status: 200, headers: { "content-type": "application/json" } }));
 expect(await screen.findByRole("heading", { name: /buildinggpt workspace/i })).toBeInTheDocument();
 });
});
