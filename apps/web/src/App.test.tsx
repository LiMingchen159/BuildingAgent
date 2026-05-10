import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const alphaProject = { id: "project_alpha", name: "Alpha Build", permissions: ["chat:read", "chat:write"] };
const betaProject = { id: "project_beta", name: "Beta Build", permissions: ["chat:read"] };

const runtimeProvider = {
  id: "runtime_provider_local_llm",
  name: "Local LLM Provider Placeholder",
  kind: "llm",
  status: "placeholder",
  description: "Synthetic local runtime provider slot."
};
const registryTool = {
  id: "tool_space_summary",
  name: "Space Summary Tool Placeholder",
  category: "building",
  status: "placeholder",
  description: "Synthetic tool definition."
};
const registrySkill = {
  id: "skill_building_triage",
  name: "Building Triage Skill Placeholder",
  domain: "building",
  status: "placeholder",
  description: "Synthetic skill card."
};
const gateway = {
  id: "gateway_bms_placeholder",
  name: "BMS Gateway Placeholder",
  protocol: "http",
  status: "not_configured",
  description: "Synthetic building-management gateway."
};
const capability = {
  id: "capability_energy_baseline",
  name: "Energy Baseline Placeholder",
  domain: "energy",
  status: "mock",
  description: "Synthetic energy baseline capability."
};

function registryBody(overrides: Record<string, unknown> = {}) {
  return {
    runtimeProviders: [runtimeProvider],
    tools: [registryTool],
    skills: [registrySkill],
    gateways: [gateway],
    buildingCapabilities: [capability],
    limit: 50,
    placeholderOnly: true,
    requestId: "req_registry",
    ...overrides
  };
}

function managementBody(overrides: Record<string, unknown> = {}) {
  return {
    projectId: "project_alpha",
    gateways: [gateway],
    capabilities: [capability],
    tools: [registryTool],
    limit: 50,
    placeholderOnly: true,
    requestId: "req_management",
    ...overrides
  };
}

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

function installBaseFetch(options: { registry?: Response; management?: Response; project?: typeof alphaProject | typeof betaProject; chatMessages?: unknown[] } = {}) {
  const project = options.project ?? alphaProject;
  return installFetch((url, init) => {
    if (url === "/api/login") {
      return jsonResponse({ token: "seed-token-ada", user: { id: "user_ada", name: "Ada Lovelace" }, requestId: "req_login" });
    }
    if (url === "/api/session") {
      return jsonResponse({ session: { userId: "user_ada", projectId: null, permissions: [] }, requestId: "req_session" });
    }
    if (url === "/api/projects") {
      return jsonResponse({ projects: [project], limit: 50, requestId: "req_projects" });
    }
    if (url === `/api/projects/${project.id}/select`) {
      expect(init?.headers).toBeInstanceOf(Headers);
      expect((init?.headers as Headers).has("content-type")).toBe(false);
      return jsonResponse({ session: { userId: "user_ada", projectId: project.id, permissions: project.permissions }, requestId: "req_select" });
    }
    if (url === `/api/projects/${project.id}/chat` && init?.method !== "POST") {
      return jsonResponse({ messages: options.chatMessages ?? [], limit: 50, requestId: "req_chat" });
    }
    if (url === `/api/projects/${project.id}/chat` && init?.method === "POST") {
      return jsonResponse({ message: { id: "msg_000001", projectId: project.id, userId: "user_ada", role: "user", content: "What should we build first?" }, requestId: "req_post" }, 201);
    }
    if (url === "/api/registry") {
      return options.registry ?? jsonResponse(registryBody());
    }
    if (url === `/api/projects/${project.id}/management`) {
      return options.management ?? jsonResponse(managementBody({ projectId: project.id }));
    }
    return apiError("not_found", "Unexpected test URL", 404);
  });
}

async function loginAndSelectProject(user = userEvent.setup()) {
  await user.click(screen.getByRole("button", { name: /sign in/i }));
  await screen.findByRole("heading", { name: /choose an authorized project/i });
  await user.click(screen.getByRole("button", { name: /select project/i }));
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
  it("logs in, selects a project, loads chat, management panels, and sends project-scoped messages", async () => {
    const fetchMock = installBaseFetch();

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByRole("heading", { name: /choose an authorized project/i });
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /select project/i }));
    expect(await screen.findByRole("heading", { name: /alpha build workspace/i })).toBeInTheDocument();
    expect(screen.getAllByText(/project id:/i)[0]).toHaveTextContent("project_alpha");

    await user.click(screen.getByRole("button", { name: /platform registry/i }));
    expect(screen.getByRole("heading", { name: /runtime providers, tools, and skills/i })).toBeInTheDocument();
    expect(screen.getByText("Local LLM Provider Placeholder")).toBeInTheDocument();
    expect(screen.getByText("Building Triage Skill Placeholder")).toBeInTheDocument();
    expect(screen.getByText(/request: req_registry/i)).toBeInTheDocument();
    expect(screen.getAllByText(/placeholder-only/i).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /gateways/i }));
    expect(screen.getAllByText("BMS Gateway Placeholder").length).toBeGreaterThan(0);
    expect(screen.getByText(/no external bms/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /building domain/i }));
    expect(screen.getAllByText("Energy Baseline Placeholder").length).toBeGreaterThan(0);
    expect(screen.getByText("Space Summary Tool Placeholder")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^chat$/i }));
    await user.type(screen.getByRole("textbox", { name: /^message$/i }), "What should we build first?");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByText("What should we build first?")).toBeInTheDocument();
    const chatPostCall = fetchMock.mock.calls.find(([url, init]) => url === "/api/projects/project_alpha/chat" && init?.method === "POST");
    expect(chatPostCall).toBeTruthy();
    expect(chatPostCall?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ message: "What should we build first?" })
    });
    expect(chatPostCall?.[1]?.headers).toBeInstanceOf(Headers);
    expect((chatPostCall?.[1]?.headers as Headers).get("authorization")).toBe("Bearer seed-token-ada");
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
        expect(init?.headers).toBeInstanceOf(Headers);
        expect((init?.headers as Headers).has("content-type")).toBe(false);
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
      if (url === "/api/registry") {
        return jsonResponse(registryBody());
      }
      if (url === "/api/projects/project_alpha/management") {
        return jsonResponse(managementBody());
      }
      return apiError("not_found", "Unexpected test URL", 404);
    });

    const user = userEvent.setup();
    render(<App />);
    await loginAndSelectProject(user);

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
      if (url === "/api/registry") {
        return jsonResponse(registryBody());
      }
      if (url === "/api/projects/project_alpha/management") {
        return jsonResponse(managementBody());
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

  it("renders read-only selected projects with management inspection while chat compose remains disabled", async () => {
    installBaseFetch({ project: betaProject, management: jsonResponse(managementBody({ projectId: "project_beta" })) });

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

    await user.click(screen.getByRole("button", { name: /building domain/i }));
    expect(screen.getAllByText("Energy Baseline Placeholder").length).toBeGreaterThan(0);
  });

  it("shows requestId-aware registry and management diagnostics without clearing the selected project", async () => {
    installBaseFetch({ registry: apiError("registry_unavailable", "Registry exploded.", 500, "req_registry_fail") });

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByRole("heading", { name: /choose an authorized project/i });
    await user.click(screen.getByRole("button", { name: /select project/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("registry_unavailable");
    expect(alert).toHaveTextContent("req_registry_fail");
    expect(screen.getByRole("heading", { name: /choose an authorized project/i })).toBeInTheDocument();

    installBaseFetch({ management: apiError("project_forbidden", "Project management denied.", 403, "req_management_fail") });
    await user.click(screen.getByRole("button", { name: /select project/i }));
    const secondAlert = await screen.findByRole("alert");
    expect(secondAlert).toHaveTextContent("project_forbidden");
    expect(secondAlert).toHaveTextContent("req_management_fail");
    expect(screen.getByRole("heading", { name: /choose an authorized project/i })).toBeInTheDocument();
    expect(window.localStorage.getItem("building-agent.session.v1")).toContain("seed-token-ada");
  });

  it("surfaces malformed registry and management payloads as api_malformed and supports empty placeholder lists", async () => {
    installBaseFetch({ registry: jsonResponse(registryBody({ placeholderOnly: undefined })) });
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByRole("heading", { name: /choose an authorized project/i });
    await user.click(screen.getByRole("button", { name: /select project/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("api_malformed");
    unmount();

    window.localStorage.clear();
    vi.unstubAllGlobals();
    installBaseFetch({ management: jsonResponse(managementBody({ gateways: [{ ...gateway, protocol: "smtp" }] })) });
    render(<App />);
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByRole("heading", { name: /choose an authorized project/i });
    await user.click(screen.getByRole("button", { name: /select project/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("api_malformed");

    vi.unstubAllGlobals();
    installBaseFetch({ registry: jsonResponse(registryBody({ runtimeProviders: [], tools: [], skills: [], gateways: [], buildingCapabilities: [] })), management: jsonResponse(managementBody({ gateways: [], capabilities: [], tools: [] })) });
    await user.click(screen.getByRole("button", { name: /select project/i }));
    await screen.findByRole("heading", { name: /alpha build workspace/i });
    await user.click(screen.getByRole("button", { name: /platform registry/i }));
    expect(screen.getByText(/no runtime provider placeholders returned/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /gateways/i }));
    expect(screen.getByText(/no project gateway placeholders returned/i)).toBeInTheDocument();
  });
});
