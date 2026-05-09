import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import LoginPage from "../app/page";
import ProjectsPage from "../app/projects/page";
import ChatPage from "../app/projects/[projectId]/chat/page";
import { getChatHistory, login, ApiClientError } from "../lib/api";
import { saveLogin, saveSelectedProject } from "../lib/session";

const user = { id: "usr_owner", email: "owner@buildingagent.local", displayName: "Demo Owner", workspaceId: "ws_default", selectedProjectId: null };
const project = { id: "prj_demo_building", name: "Demo Building Project", workspaceId: "ws_default", createdAt: "2025-01-01T00:00:00Z" };
const assistant = "BuildingAgent placeholder reply for prj_demo_building: received 27 characters.";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });
}

function mockFetch(routes: Record<string, (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const route = Object.entries(routes).find(([key]) => url.includes(key));
    if (!route) throw new Error(`Unhandled request ${url}`);
    return Promise.resolve(route[1](input, init));
  });
}

describe("S01 web flow", () => {
  it("logs in with the backend response and stores a bearer session", async () => {
    mockFetch({
      "/api/v1/auth/login": (_input, init) => {
        expect(init?.body).toBe(JSON.stringify({ email: "owner@buildingagent.local", password: "buildingagent-dev-password" }));
        return jsonResponse({ accessToken: "bag_s01_test", tokenType: "bearer", user });
      },
    });

    render(<LoginPage />);
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(localStorage.getItem("buildingagent.s01.token")).toBe("bag_s01_test"));
  });

  it("clears local state and shows a safe backend login error", async () => {
    localStorage.setItem("buildingagent.s01.token", "old-secret-token");
    mockFetch({
      "/api/v1/auth/login": () => jsonResponse({ error: { code: "invalid_credentials", message: "Email or password is incorrect", requestId: "req_test" } }, { status: 401 }),
    });

    render(<LoginPage />);
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect");
    expect(screen.getByRole("alert")).not.toHaveTextContent("old-secret-token");
    expect(localStorage.getItem("buildingagent.s01.token")).toBeNull();
  });

  it("validates empty credentials before calling the backend", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<LoginPage />);
    await userEvent.clear(screen.getByLabelText(/email address/i));
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email and password are required");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows login-required state for a fresh browser project page", async () => {
    render(<ProjectsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Login required");
    expect(screen.getByRole("link", { name: /return to login/i })).toBeInTheDocument();
  });

  it("renders backend projects and calls select before chat navigation", async () => {
    saveLogin("bag_s01_test", user);
    mockFetch({
      "/api/v1/projects/prj_demo_building/select": (_input, init) => {
        expect(init?.method).toBe("POST");
        expect(init?.headers).toMatchObject({ Authorization: "Bearer bag_s01_test" });
        return jsonResponse({ selectedProject: project });
      },
      "/api/v1/projects": (_input, init) => {
        expect(init?.headers).toMatchObject({ Authorization: "Bearer bag_s01_test" });
        return jsonResponse({ projects: [project], limit: 50 });
      },
    });

    render(<ProjectsPage />);
    await userEvent.click(await screen.findByRole("button", { name: /demo building project/i }));

    await waitFor(() => expect(localStorage.getItem("buildingagent.s01.selectedProject")).toContain("prj_demo_building"));
  });

  it("renders project access failures without pretending success", async () => {
    saveLogin("bag_s01_test", user);
    mockFetch({
      "/api/v1/projects/prj_demo_building/select": () => jsonResponse({ error: { code: "project_forbidden", message: "You do not have access to this project" } }, { status: 403 }),
      "/api/v1/projects": () => jsonResponse({ projects: [project], limit: 50 }),
    });

    render(<ProjectsPage />);
    await userEvent.click(await screen.findByRole("button", { name: /demo building project/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have access to this project");
    expect(localStorage.getItem("buildingagent.s01.selectedProject")).toBeNull();
  });

  it("loads history and appends persisted deterministic chat replies", async () => {
    saveLogin("bag_s01_test", user);
    saveSelectedProject(project);
    mockFetch({
      "/api/v1/projects/prj_demo_building/chat?limit=80": () => jsonResponse({ messages: [], limit: 80 }),
      "/api/v1/projects/prj_demo_building/chat": (_input, init) => {
        expect(init?.headers).toMatchObject({ Authorization: "Bearer bag_s01_test" });
        expect(init?.body).toBe(JSON.stringify({ message: "What is the project status?" }));
        return jsonResponse({ messages: [
          { id: "msg_1", projectId: "prj_demo_building", role: "user", content: "What is the project status?", createdAt: "2025-01-01T00:00:01Z" },
          { id: "msg_2", projectId: "prj_demo_building", role: "assistant", content: assistant, createdAt: "2025-01-01T00:00:02Z" },
        ] });
      },
    });

    render(<ChatPage />);
    await userEvent.type(await screen.findByLabelText(/message/i), "What is the project status?");
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByText(assistant)).toBeInTheDocument();
    expect(screen.getByLabelText(/message/i)).toHaveValue("");
  });

  it("rejects empty chat messages without a backend call", async () => {
    saveLogin("bag_s01_test", user);
    saveSelectedProject(project);
    const fetchSpy = mockFetch({ "/api/v1/projects/prj_demo_building/chat?limit=80": () => jsonResponse({ messages: [], limit: 80 }) });

    render(<ChatPage />);
    await screen.findByText(/no chat messages yet/i);
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Chat message cannot be empty");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("blocks reload restore when selected project mismatches the chat URL", async () => {
    saveLogin("bag_s01_test", user);
    saveSelectedProject({ ...project, id: "prj_other" });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(<ChatPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("does not match this chat URL");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("API response validation", () => {
  it("turns malformed responses into typed client errors", async () => {
    mockFetch({ "/api/v1/auth/login": () => jsonResponse({ accessToken: "bag_s01_test", tokenType: "bearer", user: { id: "usr_owner" } }) });

    await expect(login("owner@buildingagent.local", "buildingagent-dev-password")).rejects.toMatchObject({ code: "malformed_response" });
  });

  it("turns backend unavailable into safe client errors", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("ECONNREFUSED with private stack"));

    await expect(getChatHistory("bag_s01_test", "prj_demo_building")).rejects.toMatchObject(
      new ApiClientError("Backend is unavailable. Check that the local API is running.", "backend_unavailable"),
    );
  });
});
