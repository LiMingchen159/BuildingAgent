import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const alphaProject = { id: "project_alpha", name: "Alpha Build", permissions: ["chat:read", "chat:write"] };
const betaProject = { id: "project_beta", name: "Beta Build", permissions: ["chat:read"] };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function apiError(code: string, message: string, status: number, requestId = "req_error"): Response {
  return jsonResponse({ error: { code, message, requestId } }, status);
}

function installFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function loginAndSelectAlpha(user = userEvent.setup()) {
  await user.click(screen.getByRole("button", { name: /sign in/i }));
  await screen.findByRole("heading", { name: /choose an authorized project/i });
  await user.click(screen.getAllByRole("button", { name: /select project/i })[0]!);
  await screen.findByRole("heading", { name: /alpha build workspace/i });
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("BuildingAgent Web flow", () => {
  it("logs in, selects a project, loads chat, and sends project-scoped messages", async () => {
    const fetchMock = installFetch((url, init) => {
      if (url === "/api/login") {
        return jsonResponse({ token: "seed-token-ada", user: { id: "user_ada", name: "Ada Lovelace" }, requestId: "req_login" });
      }
      if (url === "/api/session") {
        return jsonResponse({ session: { userId: "user_ada", projectId: null, permissions: [] }, requestId: "req_session" });
      }
      if (url === "/api/projects") {
        return jsonResponse({ projects: [alphaProject, betaProject], limit: 50, requestId: "req_projects" });
      }
      if (url === "/api/projects/project_alpha/select") {
        return jsonResponse({ session: { userId: "user_ada", projectId: "project_alpha", permissions: alphaProject.permissions }, requestId: "req_select" });
      }
      if (url === "/api/projects/project_alpha/chat" && init?.method !== "POST") {
        return jsonResponse({ messages: [], limit: 50, requestId: "req_chat" });
      }
      if (url === "/api/projects/project_alpha/chat" && init?.method === "POST") {
        return jsonResponse({ message: { id: "msg_000001", projectId: "project_alpha", userId: "user_ada", role: "user", content: "What should we build first?" }, requestId: "req_post" }, 201);
      }
      return apiError("not_found", "Unexpected test URL", 404);
    });

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByRole("heading", { name: /choose an authorized project/i });
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /select project/i })[0]!);
    expect(await screen.findByRole("heading", { name: /alpha build workspace/i })).toBeInTheDocument();
    expect(screen.getByText(/project id:/i)).toHaveTextContent("project_alpha");

    await user.type(screen.getByRole("textbox", { name: /^message$/i }), "What should we build first?");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByText("What should we build first?")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project_alpha/chat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "What should we build first?" }),
        headers: expect.objectContaining({ authorization: "Bearer seed-token-ada" })
      })
    );
  });

  it("guards the workspace when unauthenticated and clears invalid stored tokens", async () => {
    window.localStorage.setItem("building-agent.session.v1", JSON.stringify({ token: "expired", user: { id: "user_ada", name: "Ada Lovelace" }, projectId: null }));
    installFetch((url) => {
      if (url === "/api/session") {
        return apiError("auth_invalid", "Invalid bearer token.", 401, "req_bad_session");
      }
      if (url === "/api/projects") {
        return jsonResponse({ projects: [], requestId: "req_projects" });
      }
      return apiError("not_found", "Unexpected test URL", 404);
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: /sign in to buildingagent/i })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("auth_invalid");
    expect(window.localStorage.getItem("building-agent.session.v1")).toBeNull();
    expect(screen.queryByRole("heading", { name: /workspace/i })).not.toBeInTheDocument();
  });

  it("displays forbidden API errors with request ids without mutating the selected project", async () => {
    installFetch((url) => {
      if (url === "/api/login") {
        return jsonResponse({ token: "seed-token-ada", user: { id: "user_ada", name: "Ada Lovelace" }, requestId: "req_login" });
      }
      if (url === "/api/session") {
        return jsonResponse({ session: { userId: "user_ada", projectId: null, permissions: [] }, requestId: "req_session" });
      }
      if (url === "/api/projects") {
        return jsonResponse({ projects: [alphaProject], limit: 50, requestId: "req_projects" });
      }
      if (url === "/api/projects/project_alpha/select") {
        return apiError("project_forbidden", "Project is not available for this session.", 403, "req_forbidden");
      }
      return apiError("not_found", "Unexpected test URL", 404);
    });

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByRole("heading", { name: /choose an authorized project/i });
    await user.click(screen.getByRole("button", { name: /select project/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("project_forbidden");
    expect(alert).toHaveTextContent("req_forbidden");
    expect(screen.getByRole("heading", { name: /choose an authorized project/i })).toBeInTheDocument();
  });

  it("keeps current chat state on chat failure and shows the backend diagnostic", async () => {
    installFetch((url, init) => {
      if (url === "/api/login") {
        return jsonResponse({ token: "seed-token-ada", user: { id: "user_ada", name: "Ada Lovelace" }, requestId: "req_login" });
      }
      if (url === "/api/session") {
        return jsonResponse({ session: { userId: "user_ada", projectId: null, permissions: [] }, requestId: "req_session" });
      }
      if (url === "/api/projects") {
        return jsonResponse({ projects: [alphaProject], limit: 50, requestId: "req_projects" });
      }
      if (url === "/api/projects/project_alpha/select") {
        return jsonResponse({ session: { userId: "user_ada", projectId: "project_alpha", permissions: alphaProject.permissions }, requestId: "req_select" });
      }
      if (url === "/api/projects/project_alpha/chat" && init?.method !== "POST") {
        return jsonResponse({ messages: [{ id: "msg_existing", projectId: "project_alpha", userId: "user_ada", role: "user", content: "Existing context" }], limit: 50, requestId: "req_chat" });
      }
      if (url === "/api/projects/project_alpha/chat" && init?.method === "POST") {
        return apiError("project_forbidden", "Project permission is required.", 403, "req_chat_forbidden");
      }
      return apiError("not_found", "Unexpected test URL", 404);
    });

    const user = userEvent.setup();
    render(<App />);
    await loginAndSelectAlpha(user);

    expect(screen.getByText("Existing context")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: /^message$/i }), "Please mutate optimistically");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("project_forbidden");
    expect(alert).toHaveTextContent("req_chat_forbidden");
    expect(screen.getByText("Existing context")).toBeInTheDocument();
    expect(screen.queryByText("Please mutate optimistically")).not.toBeInTheDocument();
  });

  it("validates empty login fields, blank chat messages, malformed JSON, and local API outages", async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch((url, init) => {
      if (url === "/api/login") {
        return jsonResponse({ token: "seed-token-ada", user: { id: "user_ada", name: "Ada Lovelace" }, requestId: "req_login" });
      }
      if (url === "/api/session") {
        return jsonResponse({ session: { userId: "user_ada", projectId: null, permissions: [] }, requestId: "req_session" });
      }
      if (url === "/api/projects") {
        return jsonResponse({ projects: [alphaProject], limit: 50, requestId: "req_projects" });
      }
      if (url === "/api/projects/project_alpha/select") {
        return jsonResponse({ session: { userId: "user_ada", projectId: "project_alpha", permissions: alphaProject.permissions }, requestId: "req_select" });
      }
      if (url === "/api/projects/project_alpha/chat" && init?.method !== "POST") {
        return jsonResponse({ messages: [], limit: 50, requestId: "req_chat" });
      }
      throw new TypeError("network down");
    });

    render(<App />);
    await user.clear(screen.getByLabelText(/email/i));
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/enter the seeded email/i);
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/email/i), "ada@example.test");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByRole("heading", { name: /choose an authorized project/i });
    await user.click(screen.getByRole("button", { name: /select project/i }));
    await screen.findByRole("heading", { name: /alpha build workspace/i });

    const sendButton = screen.getByRole("button", { name: /send message/i });
    expect(sendButton).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: /^message$/i }), "network please");
    await user.click(sendButton);
    expect(await screen.findByRole("alert")).toHaveTextContent("api_unavailable");
  });

  it("surfaces malformed API JSON as api_malformed without crashing", async () => {
    installFetch((url) => {
      if (url === "/api/login") {
        return jsonResponse({ token: "seed-token-ada", user: { id: "user_ada", name: "Ada Lovelace" }, requestId: "req_login" });
      }
      if (url === "/api/session") {
        return jsonResponse({ session: { userId: "user_ada", projectId: null, permissions: [] }, requestId: "req_session" });
      }
      if (url === "/api/projects") {
        return jsonResponse({ definitely: "not projects" });
      }
      return apiError("not_found", "Unexpected test URL", 404);
    });

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("api_malformed"));
    expect(screen.getByRole("heading", { name: /choose an authorized project/i })).toBeInTheDocument();
  });

  it("renders read-only selected projects without usable chat compose controls", async () => {
    installFetch((url, init) => {
      if (url === "/api/login") {
        return jsonResponse({ token: "seed-token-ada", user: { id: "user_ada", name: "Ada Lovelace" }, requestId: "req_login" });
      }
      if (url === "/api/session") {
        return jsonResponse({ session: { userId: "user_ada", projectId: null, permissions: [] }, requestId: "req_session" });
      }
      if (url === "/api/projects") {
        return jsonResponse({ projects: [betaProject], limit: 50, requestId: "req_projects" });
      }
      if (url === "/api/projects/project_beta/select") {
        return jsonResponse({ session: { userId: "user_ada", projectId: "project_beta", permissions: betaProject.permissions }, requestId: "req_select" });
      }
      if (url === "/api/projects/project_beta/chat" && init?.method !== "POST") {
        return jsonResponse({ messages: [], limit: 50, requestId: "req_chat" });
      }
      return apiError("not_found", "Unexpected test URL", 404);
    });

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByText("Beta Build");
    await user.click(screen.getByRole("button", { name: /select project/i }));

    const workspace = await screen.findByRole("heading", { name: /beta build workspace/i });
    expect(workspace).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByRole("textbox", { name: /^message$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /send message/i })).toBeDisabled();
    expect(screen.getByText(/does not grant chat write permission/i)).toBeInTheDocument();
  });
});
