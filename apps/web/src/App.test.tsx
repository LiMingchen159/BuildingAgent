import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

beforeEach(() => {
  window.localStorage.clear();
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  }
});

const alphaProject = { id: "project_alpha", name: "Alpha Build", permissions: ["chat:read", "chat:write"] };
const betaProject = { id: "project_beta", name: "Beta Build", permissions: ["chat:read"] };

const runtimeProvider = {
  id: "runtime_provider_local_llm",
  name: "Local LLM Provider Placeholder",
  kind: "llm",
  status: "placeholder",
  description: "Synthetic local runtime provider slot."
} as const;
const registryTool = {
  id: "tool_space_summary",
  name: "Space Summary Tool Placeholder",
  category: "building",
  status: "placeholder",
  description: "Synthetic tool definition."
} as const;
const registrySkill = {
  id: "skill_building_triage",
  name: "Building Triage Skill Placeholder",
  domain: "building",
  status: "placeholder",
  description: "Synthetic skill card."
} as const;
const gateway = {
  id: "gateway_bms_placeholder",
  name: "BMS Gateway Placeholder",
  protocol: "http",
  status: "not_configured",
  description: "Synthetic building-management gateway."
} as const;
const capability = {
  id: "capability_energy_baseline",
  name: "Energy Baseline Placeholder",
  domain: "energy",
  status: "mock",
  description: "Synthetic energy baseline capability."
} as const;

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

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function streamingResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  let index = 0;
  return new Response(new ReadableStream({
    pull(controller) {
      if (index >= chunks.length) return;
      controller.enqueue(encoder.encode(`${chunks[index]}\n\n`));
      index += 1;
    },
    cancel() {
      index = chunks.length;
    }
  }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function installBaseFetch(options: { registry?: Response; management?: Response; project?: typeof alphaProject | typeof betaProject; chatMessages?: unknown[]; artifacts?: unknown[]; documents?: unknown[] } = {}) {
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
    if (url === `/api/projects/${project.id}/chat` && init?.method === "DELETE") {
      return jsonResponse({ projectId: project.id, clearedMessages: options.chatMessages?.length ?? 0, clearedMemories: 1, requestId: "req_reset" });
    }
    if (url === `/api/projects/${project.id}/chat` && init?.method !== "POST") {
      return jsonResponse({ messages: options.chatMessages ?? [], limit: 50, requestId: "req_chat" });
    }
    if (url === `/api/projects/${project.id}/chat` && init?.method === "POST") {
      return jsonResponse({
        message: { id: "msg_000001", projectId: project.id, userId: "user_ada", role: "user", content: "What should we build first?" },
        assistantMessage: { id: "msg_000002", projectId: project.id, userId: "user_ada", role: "assistant", content: "I am unable to connect to a real LLM provider right now. Configure `BUILDING_AGENT_LLM_API_KEY` and `BUILDING_AGENT_LLM_BASE_URL` to enable Hermes streaming." },
        provider: { id: "provider-not-configured", mode: "real", model: "gpt-4o-mini", status: "unconfigured" },
        fallbackUsed: false,
        requestId: "req_post"
      }, 201);
    }
    if (url === `/api/projects/${project.id}/chat/stream` && init?.method === "POST") {
      const donePayload = {
        message: { id: "msg_000001", projectId: project.id, userId: "user_ada", role: "user", content: "What should we build first?" },
        assistantMessage: { id: "msg_000002", projectId: project.id, userId: "user_ada", role: "assistant", content: "I am checking related tools and data.\n\nFinal answer ready." },
        conversationId: "conv_new",
        conversationTitle: "What should we build first?",
        provider: { id: "provider-not-configured", mode: "real", model: "gpt-4o-mini", status: "unconfigured" },
        fallbackUsed: false,
        requestId: "req_stream"
      };
      const sseBody = [
        "event: activity\ndata: " + JSON.stringify({ id: "act_1", label: "I am checking project context", kind: "context", requestId: "req_stream" }),
        "event: activity\ndata: " + JSON.stringify({ id: "act_2", label: "Searched files", kind: "tool", tool: "search_files", status: "done", detail: "apps/web/src/App.tsx", requestId: "req_stream" }),
        "event: token\ndata: " + JSON.stringify({ content: "I am checking related tools and data." }),
        "event: token\ndata: " + JSON.stringify({ content: "\n\nFinal answer ready." }),
        "event: done\ndata: " + JSON.stringify(donePayload),
        ""
      ].join("\n\n");
      return new Response(sseBody, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" }
      });
    }
    if (url === "/api/registry") {
      return options.registry ?? jsonResponse(registryBody());
    }
    if (url === `/api/projects/${project.id}/management`) {
      return options.management ?? jsonResponse(managementBody({ projectId: project.id }));
    }
    if (url === `/api/projects/${project.id}/knowledge-base`) {
      return jsonResponse({ documents: options.documents ?? [{ id: "kb_bldg40", projectId: project.id, name: "bldg40.ttl", path: "bldg40.ttl", kind: "turtle", sizeBytes: 2048, excerpt: "Brick building metadata" }], requestId: "req_kb" });
    }
    if (url === `/api/projects/${project.id}/repository`) {
      return jsonResponse({ artifacts: options.artifacts ?? [], requestId: "req_repo" });
    }
    if (url === `/api/projects/${project.id}/conversations` && init?.method !== "POST") {
      return jsonResponse({ conversations: [{ id: "conv_test", title: "What should we build first?", messageCount: 0, createdAt: "2026-05-12T00:00:00.000Z" }], limit: 50, requestId: "req_conversations" });
    }
    if (url === `/api/projects/${project.id}/conversations` && init?.method === "POST") {
      return jsonResponse({ conversation: { id: "conv_new", title: "New conversation", messageCount: 0, createdAt: "2026-05-12T00:00:00.000Z" }, requestId: "req_new_conv" }, 201);
    }
    if (url.startsWith(`/api/projects/${project.id}/conversations/`) && url.endsWith("/select")) {
      return jsonResponse({ conversation: { id: "conv_test", title: "What should we build first?", messageCount: 2, createdAt: "2026-05-12T00:00:00.000Z" }, messages: [], requestId: "req_select_conv" });
    }
    if (url.startsWith(`/api/projects/${project.id}/conversations/`) && init?.method === "DELETE") {
      return jsonResponse({ deleted: true, conversationId: url.split("/").slice(-1)[0], removedMessages: 2, requestId: "req_delete_conv" });
    }
    if (url.startsWith(`/api/projects/${project.id}/conversations/`) && init?.method === "PATCH") {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      return jsonResponse({ conversation: { id: url.split("/").slice(-1)[0], title: body.title ?? "Renamed", messageCount: 2, createdAt: "2026-05-12T00:00:00.000Z" }, requestId: "req_rename_conv" });
    }
    return apiError("not_found", "Unexpected test URL", 404);
  });
}

async function loginAndSelectProject(user = userEvent.setup()) {
  await user.click(screen.getByRole("button", { name: /sign in/i }));
  await screen.findByRole("heading", { name: /choose a project to get started/i });
  await user.click(screen.getByRole("button", { name: /open/i }));
  await screen.findByRole("textbox", { name: /^message$/i });
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("BuildingAgent Web flow", () => {
  it("shows a minimal startup status while restoring a saved session", async () => {
    window.localStorage.setItem("building-agent.session.v1", JSON.stringify({ token: "seed-token-ada", user: { id: "user_ada", name: "Ada Lovelace" }, projectId: null }));
    const session = deferredResponse();
    installFetch((url) => {
      if (url === "/api/session") {
        return session.promise;
      }
      if (url === "/api/projects") {
        return jsonResponse({ projects: [alphaProject], limit: 50, requestId: "req_projects" });
      }
      return apiError("not_found", "Unexpected test URL", 404);
    });

    render(<App />);

    expect(screen.getByRole("heading", { name: /restoring your saved session/i })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /saved-session bootstrap phase/i })).toHaveTextContent(/restoring your saved session/i);
    expect(screen.queryByText(/startup shell only/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/checking your saved buildingagent session/i)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/bearer|api[-_ ]?key|seed-token-ada/i);

    session.resolve(jsonResponse({ session: { userId: "user_ada", projectId: null, permissions: [] }, requestId: "req_session" }));
    expect(await screen.findByRole("heading", { name: /choose a project to get started/i })).toBeInTheDocument();
  });

  it("logs in, selects a project, loads chat, management panels, and sends project-scoped messages", async () => {
    const fetchMock = installBaseFetch();

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByRole("heading", { name: /choose a project to get started/i });

    await user.click(screen.getByRole("button", { name: /open/i }));
    expect(await screen.findByRole("textbox", { name: /^message$/i })).toBeInTheDocument();
    expect(screen.getByText("Energy Baseline Analysis")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/live building operation|repository action|control route/i);
    expect(screen.getByText(/scheduled & rule-based tasks/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Energy Baseline/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Space Summary/i)).toBeInTheDocument();
    expect(screen.getByText(/1 files/i)).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: /^message$/i }), "What should we build first?");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    const messageList = screen.getByLabelText(/alpha build messages/i);
    expect(within(messageList).getByText("What should we build first?")).toBeInTheDocument();
    const assistantMessage = screen.getByRole("article", { name: /assistant message/i });
    expect(assistantMessage).toHaveTextContent(/I am checking related tools and data\./);
    expect(assistantMessage).toHaveTextContent(/Final answer ready/);
    expect(assistantMessage).toHaveTextContent(/Worked for/);
    expect(assistantMessage).toHaveTextContent(/Searched files/);
    expect(screen.queryByLabelText(/provider diagnostics/i)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Agent loop started|Agent iteration|Running tool:|Executing tool call|This is a mock response/);
    expect(screen.getByRole("list", { name: /recent conversations/i })).toHaveTextContent("What should we build first?");
    await user.click(screen.getByRole("button", { name: /^repository/i }));
    expect(screen.getByRole("heading", { name: /alpha build outputs/i })).toBeInTheDocument();
    expect(screen.getByText(/assistant responses and future tool outputs will appear here after chat turns/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /knowledge base/i }));
    expect((await screen.findAllByText("bldg40.ttl")).length).toBeGreaterThan(0);
    const chatPostCall = fetchMock.mock.calls.find(([url, init]) => url === "/api/projects/project_alpha/chat/stream" && init?.method === "POST");
    expect(chatPostCall).toBeTruthy();
    expect(chatPostCall?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ message: "What should we build first?", conversationId: "conv_new" })
    });
    expect(chatPostCall?.[1]?.headers).toBeInstanceOf(Headers);
    expect((chatPostCall?.[1]?.headers as Headers).get("authorization")).toBe("Bearer seed-token-ada");
  });

  it("starts a new backend chat session from the sidebar", async () => {
    const fetchMock = installBaseFetch({
      chatMessages: [
        { id: "msg_existing", projectId: "project_alpha", userId: "user_ada", role: "user", content: "Existing context" },
        { id: "msg_existing_assistant", projectId: "project_alpha", userId: "user_ada", role: "assistant", content: "Existing answer" }
      ]
    });

    const user = userEvent.setup();
    render(<App />);
    await loginAndSelectProject(user);
    expect(within(screen.getByLabelText(/alpha build messages/i)).queryByText("Existing context")).toBeNull();

    await user.click(screen.getByRole("button", { name: /new chat/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("New chat ready");
    expect(screen.getByRole("list", { name: /recent conversations/i })).toHaveTextContent("New conversation");
    expect(screen.queryByText("Existing context")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/provider diagnostics/i)).not.toBeInTheDocument();
  });

  it("keeps the running activity timeline expanded and only collapses it after final answer starts", async () => {
    let releaseDone!: () => void;
    const doneGate = new Promise<void>((resolve) => {
      releaseDone = resolve;
    });
    installFetch(async (url, init) => {
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
      if (url === "/api/projects/project_alpha/conversations" && init?.method !== "POST") {
        return jsonResponse({ conversations: [], limit: 50, requestId: "req_conversations" });
      }
      if (url === "/api/projects/project_alpha/conversations" && init?.method === "POST") {
        return jsonResponse({ conversation: { id: "conv_streaming", title: "New conversation", messageCount: 0, createdAt: "2026-05-12T00:00:00.000Z" }, requestId: "req_new_conv" }, 201);
      }
      if (url === "/api/projects/project_alpha/chat/stream" && init?.method === "POST") {
        await doneGate;
        return streamingResponse([
          "event: activity\ndata: " + JSON.stringify({ id: "act_1", label: "I am checking project context.", kind: "context", requestId: "req_stream" }),
          "event: activity\ndata: " + JSON.stringify({ id: "act_2", label: "Ran 2 commands", kind: "tool", tool: "shell", status: "done", detail: "git status; git fetch origin", requestId: "req_stream" }),
          "event: token\ndata: " + JSON.stringify({ content: "Final answer ready." }),
          "event: done\ndata: " + JSON.stringify({
            message: { id: "msg_000001", projectId: "project_alpha", userId: "user_ada", role: "user", content: "timeline please" },
            assistantMessage: { id: "msg_000002", projectId: "project_alpha", userId: "user_ada", role: "assistant", content: "Final answer ready." },
            conversationId: "conv_streaming",
            conversationTitle: "Timeline please",
            provider: { id: "provider-not-configured", mode: "real", model: "gpt-4o-mini", status: "unconfigured" },
            fallbackUsed: false,
            requestId: "req_stream"
          })
        ]);
      }
      if (url === "/api/registry") {
        return jsonResponse(registryBody());
      }
      if (url === "/api/projects/project_alpha/management") {
        return jsonResponse(managementBody());
      }
      if (url === `/api/projects/project_alpha/knowledge-base`) {
        return jsonResponse({ documents: [], requestId: "req_kb" });
      }
      if (url === `/api/projects/project_alpha/repository`) {
        return jsonResponse({ artifacts: [], requestId: "req_repo" });
      }
      return apiError("not_found", "Unexpected test URL", 404);
    });

    const user = userEvent.setup();
    render(<App />);
    await loginAndSelectProject(user);
    await user.type(screen.getByRole("textbox", { name: /^message$/i }), "timeline please");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByText(/Working for/i)).toBeInTheDocument();
    expect(screen.queryByText(/Worked for/i)).not.toBeInTheDocument();

    releaseDone();

    const assistantMessage = await screen.findByRole("article", { name: /assistant message/i });
    expect(assistantMessage).toHaveTextContent(/Worked for/);
    expect(assistantMessage).toHaveTextContent(/Final answer ready/);
    expect(within(assistantMessage).getByText(/Worked for/).closest("details")).not.toHaveAttribute("open");
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
    expect(screen.getByRole("alert")).toHaveTextContent("req_bad_session");
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
    await screen.findByRole("heading", { name: /choose a project to get started/i });
    await user.click(screen.getByRole("button", { name: /open/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("project_forbidden");
    expect(alert).toHaveTextContent("req_forbidden");
    expect(screen.getByRole("heading", { name: /choose a project to get started/i })).toBeInTheDocument();
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
      if (url === "/api/projects/project_alpha/chat/stream" && init?.method === "POST") {
        return apiError("project_forbidden", "Project permission is required.", 403, "req_chat_forbidden");
      }
      if (url === "/api/projects/project_alpha/conversations" && init?.method === "POST") {
        return jsonResponse({ conversation: { id: "conv_new", title: "New conversation", messageCount: 0, createdAt: "2026-05-12T00:00:00.000Z" }, requestId: "req_new_conv" }, 201);
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

    await user.type(screen.getByRole("textbox", { name: /^message$/i }), "Please mutate optimistically");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("project_forbidden");
    expect(alert).toHaveTextContent("req_chat_forbidden");
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
    await screen.findByRole("heading", { name: /choose a project to get started/i });
    await user.click(screen.getByRole("button", { name: /open/i }));
    expect(await screen.findByRole("textbox", { name: /^message$/i })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

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
    expect(screen.getByRole("heading", { name: /choose a project to get started/i })).toBeInTheDocument();
  });

  it("renders read-only selected projects with management inspection while chat compose remains disabled", async () => {
    installBaseFetch({ project: betaProject, management: jsonResponse(managementBody({ projectId: "project_beta" })) });

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByText("Beta Build");
    await user.click(screen.getByRole("button", { name: /open/i }));

    expect(await screen.findByRole("textbox", { name: /^message$/i })).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByRole("textbox", { name: /^message$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /send message/i })).toBeDisabled();
    expect(screen.getByText(/does not grant chat write permission/i)).toBeInTheDocument();

  });

  it("shows requestId-aware registry and management diagnostics without clearing the selected project", async () => {
    installBaseFetch({
      registry: jsonResponse(registryBody()),
      management: apiError("project_forbidden", "Project management denied.", 403, "req_management_fail")
    });

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByRole("heading", { name: /choose a project to get started/i });
    await user.click(screen.getByRole("button", { name: /open/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("project_forbidden");
    expect(alert).toHaveTextContent("req_management_fail");
    expect(screen.getByRole("heading", { name: /choose a project to get started/i })).toBeInTheDocument();
  });

  it("surfaces malformed registry and management payloads as api_malformed and supports empty placeholder lists", async () => {
    installBaseFetch({ registry: jsonResponse(registryBody({ placeholderOnly: undefined })) });
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByRole("heading", { name: /choose a project to get started/i });
    await user.click(screen.getByRole("button", { name: /open/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("api_malformed");
    unmount();

    window.localStorage.clear();
    vi.unstubAllGlobals();
    installBaseFetch({ management: jsonResponse(managementBody({ gateways: [{ ...gateway, protocol: "smtp" }] })) });
    const user2 = userEvent.setup();
    render(<App />);
    await user2.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByRole("heading", { name: /choose a project to get started/i });
    await user2.click(screen.getByRole("button", { name: /open/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("api_malformed");

    vi.unstubAllGlobals();
    cleanup();
    window.localStorage.clear();
    installBaseFetch({ registry: jsonResponse(registryBody({ runtimeProviders: [], tools: [], skills: [], gateways: [], buildingCapabilities: [] })), management: jsonResponse(managementBody({ gateways: [], capabilities: [], tools: [] })) });
    const user3 = userEvent.setup();
    render(<App />);
    await user3.click(await screen.findByRole("button", { name: /sign in/i }));
    await screen.findByRole("heading", { name: /choose a project to get started/i });
    await user3.click(screen.getByRole("button", { name: /open/i }));
    await screen.findByRole("textbox", { name: /^message$/i });
    expect(screen.getByText(/scheduled & rule-based tasks/i)).toBeInTheDocument();
  });

  it("fails closed on malformed S04 chat responses without appending user or assistant messages", async () => {
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
        return jsonResponse({ messages: [], limit: 50, requestId: "req_chat" });
      }
      if (url === "/api/projects/project_alpha/chat/stream" && init?.method === "POST") {
        return apiError("api_malformed", "Chat post returned an unexpected assistant message.", 502, "req_bad_post");
      }
      if (url === "/api/projects/project_alpha/conversations" && init?.method === "POST") {
        return jsonResponse({ conversation: { id: "conv_new", title: "New conversation", messageCount: 0, createdAt: "2026-05-12T00:00:00.000Z" }, requestId: "req_new_conv" }, 201);
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
    await user.type(screen.getByRole("textbox", { name: /^message$/i }), "malformed please");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("api_malformed");
    expect(screen.queryByText("malformed please")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/provider diagnostics/i)).not.toBeInTheDocument();
  });

  it("requires assistant messages and well-formed redaction-safe provider metadata on chat POST", async () => {
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
        return jsonResponse({ messages: [], limit: 50, requestId: "req_chat" });
      }
      if (url === "/api/projects/project_alpha/chat/stream" && init?.method === "POST") {
        return apiError("api_malformed", "Chat post returned unexpected provider diagnostics.", 502, "req_bad_provider");
      }
      if (url === "/api/projects/project_alpha/conversations" && init?.method === "POST") {
        return jsonResponse({ conversation: { id: "conv_new", title: "New conversation", messageCount: 0, createdAt: "2026-05-12T00:00:00.000Z" }, requestId: "req_new_conv" }, 201);
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
    await user.type(screen.getByRole("textbox", { name: /^message$/i }), "metadata please");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("api_malformed");
    expect(alert).not.toHaveTextContent(/provider-secret-should-not-render|apiKey/i);
    expect(screen.queryByText("metadata please")).not.toBeInTheDocument();
  });

  it("surfaces provider error envelopes with request ids without leaking secret-looking text", async () => {
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
        return jsonResponse({ messages: [], limit: 50, requestId: "req_chat" });
      }
      if (url === "/api/projects/project_alpha/chat/stream" && init?.method === "POST") {
        return apiError("provider_error", "Chat provider failed before producing a safe response.", 502, "req_provider_fail");
      }
      if (url === "/api/projects/project_alpha/conversations" && init?.method === "POST") {
        return jsonResponse({ conversation: { id: "conv_new", title: "New conversation", messageCount: 0, createdAt: "2026-05-12T00:00:00.000Z" }, requestId: "req_new_conv" }, 201);
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
    await user.type(screen.getByRole("textbox", { name: /^message$/i }), "provider fail");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("provider_error");
    expect(alert).toHaveTextContent("req_provider_fail");
    expect(alert).not.toHaveTextContent(/sk-|api[_-]?key|bearer/i);
    expect(screen.queryByText("provider fail")).not.toBeInTheDocument();
  });
});

