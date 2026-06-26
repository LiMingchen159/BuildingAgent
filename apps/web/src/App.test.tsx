import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { DashboardRecord } from "./api";
import { DashboardView } from "./ui/DashboardView";

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
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

function dashboardRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "dashboard_temp_watch",
    projectId: "project_alpha",
    ownerUserId: "user_ada",
    visibility: "private",
    title: "Plant temperature dashboard",
    description: "Supply and return monitoring for active chillers.",
    layoutVersion: 2,
    layout: [
      { widgetId: "live_supply_return", x: 0, y: 0, w: 3, h: 2 },
      { widgetId: "trend_supply_return", x: 3, y: 0, w: 6, h: 4 }
    ],
    widgets: [
      {
        id: "live_supply_return",
        kind: "live_value_grid",
        title: "Live temperatures",
        pointBindings: [
          { pointName: "CH-01_Supply_Water_Temp", label: "CH-01 Supply", role: "supply", unit: "degF" },
          { pointName: "CH-01_Return_Water_Temp", label: "CH-01 Return", role: "return", unit: "degF" }
        ]
      },
      {
        id: "trend_supply_return",
        kind: "timeseries_chart",
        title: "Temperature history",
        defaultTimeRange: "12h",
        pointBindings: [
          { pointName: "CH-01_Supply_Water_Temp", label: "CH-01 Supply", role: "supply", unit: "degF" },
          { pointName: "CH-01_Return_Water_Temp", label: "CH-01 Return", role: "return", unit: "degF" }
        ]
      }
    ],
    createdAt: "2026-06-24T02:00:00.000Z",
    updatedAt: "2026-06-24T02:00:00.000Z",
    ...overrides
  };
}

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
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(`${chunks[index]}\n\n`));
      index += 1;
      if (index >= chunks.length) {
        controller.close();
      }
    },
    cancel() {
      index = chunks.length;
    }
  }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function hangingStreamingResponse(chunks: string[], signal?: AbortSignal) {
  const encoder = new TextEncoder();
  let sent = false;
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`${chunk}\n\n`));
      }
      sent = true;
      signal?.addEventListener("abort", () => {
        controller.error(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    },
    pull() {
      if (!sent) return;
    },
    cancel() {
      sent = true;
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
        assistantMessage: { id: "msg_000002", projectId: project.id, userId: "user_ada", role: "assistant", content: "I am unable to connect to a real LLM provider right now. Configure `BUILDING_AGENT_LLM_API_KEY` and `BUILDING_AGENT_LLM_BASE_URL` to enable BuildingGPT streaming." },
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

async function signIn(user = userEvent.setup()) {
  await user.type(screen.getByLabelText(/email/i), "ada@example.test");
  await user.type(screen.getByLabelText(/password/i), "local-dev-password");
  await user.click(screen.getByRole("button", { name: /sign in/i }));
}

async function loginAndSelectProject(user = userEvent.setup()) {
  await signIn(user);
  await screen.findByRole("heading", { name: /choose a project to get started/i });
  await user.click(screen.getByRole("button", { name: /open/i }));
  await screen.findByRole("textbox", { name: /^message$/i });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("BuildingGPT Web flow", () => {
  it("shows the workspace shell while restoring a saved session", async () => {
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

    expect(screen.getByRole("status", { name: /preparing buildinggpt workspace/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /choose a project to get started/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/startup shell only/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/checking your saved buildinggpt session/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/loading authorized projects|loading projects/i)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/bearer\s+seed-token-ada|seed-token-ada/i);

    session.resolve(jsonResponse({ session: { userId: "user_ada", projectId: null, permissions: [] }, requestId: "req_session" }));
    expect(await screen.findByRole("heading", { name: /choose a project to get started/i })).toBeInTheDocument();
  });

  it("logs in, selects a project, loads chat, management panels, and sends project-scoped messages", async () => {
    const fetchMock = installBaseFetch();

    const user = userEvent.setup();
    render(<App />);

    await signIn(user);
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

  it("starts a draft new chat from the sidebar without creating a conversation row until first send", async () => {
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
    expect(screen.getByRole("list", { name: /recent conversations/i })).toHaveTextContent("What should we build first?");
    expect(screen.queryByText("Existing context")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/provider diagnostics/i)).not.toBeInTheDocument();
  });

  it("keeps prior messages above newer ones within the same conversation after a completed answer", async () => {
    const user = userEvent.setup();
    let streamCallCount = 0;
    installFetch((url, init) => {
      if (url === "/api/login") return jsonResponse({ token: "seed-token-ada", user: { id: "user_ada", name: "Ada Lovelace" }, requestId: "req_login" });
      if (url === "/api/session") return jsonResponse({ session: { userId: "user_ada", projectId: null, permissions: [] }, requestId: "req_session" });
      if (url === "/api/projects") return jsonResponse({ projects: [alphaProject], limit: 50, requestId: "req_projects" });
      if (url === "/api/projects/project_alpha/select") return jsonResponse({ session: { userId: "user_ada", projectId: "project_alpha", permissions: alphaProject.permissions }, requestId: "req_select" });
      if (url === "/api/projects/project_alpha/chat" && init?.method !== "POST") return jsonResponse({ messages: [], limit: 50, requestId: "req_chat" });
      if (url === "/api/projects/project_alpha/conversations" && init?.method !== "POST") return jsonResponse({ conversations: [], limit: 50, requestId: "req_conversations" });
      if (url === "/api/projects/project_alpha/conversations" && init?.method === "POST") return jsonResponse({ conversation: { id: "conv_thread", title: "New conversation", messageCount: 0, createdAt: "2026-05-12T00:00:00.000Z" }, requestId: "req_new_conv" }, 201);
      if (url === "/api/projects/project_alpha/chat/stream" && init?.method === "POST") {
        streamCallCount += 1;
        const prompts = ["First question", "Second question"];
        const answers = ["First answer", "Second answer"];
        const idx = streamCallCount - 1;
        return streamingResponse([
          "event: token\ndata: " + JSON.stringify({ content: answers[idx] }),
          "event: done\ndata: " + JSON.stringify({
            message: { id: `msg_user_${idx}`, projectId: "project_alpha", userId: "user_ada", role: "user", content: prompts[idx] },
            assistantMessage: { id: `msg_assistant_${idx}`, projectId: "project_alpha", userId: "user_ada", role: "assistant", content: answers[idx] },
            conversationId: "conv_thread",
            conversationTitle: "Conversation thread",
            provider: { id: "provider-not-configured", mode: "real", model: "gpt-4o-mini", status: "unconfigured" },
            fallbackUsed: false,
            requestId: `req_stream_${idx}`
          })
        ]);
      }
      if (url === "/api/registry") return jsonResponse(registryBody());
      if (url === "/api/projects/project_alpha/management") return jsonResponse(managementBody());
      if (url === "/api/projects/project_alpha/knowledge-base") return jsonResponse({ documents: [], requestId: "req_kb" });
      if (url === "/api/projects/project_alpha/repository") return jsonResponse({ artifacts: [], requestId: "req_repo" });
      return apiError("not_found", "Unexpected test URL", 404);
    });

    render(<App />);
    await loginAndSelectProject(user);

    await user.type(screen.getByRole("textbox", { name: /^message$/i }), "First question");
    await user.click(screen.getByRole("button", { name: /send message/i }));
    await screen.findByText("First answer");
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /stop generating/i })).not.toBeInTheDocument();
    });

    const composer = screen.getByRole("textbox", { name: /^message$/i });
    await user.type(composer, "Second question");
    await user.keyboard("{Enter}");
    await screen.findByText("Second answer");

    const messageList = screen.getByLabelText(/alpha build messages/i);
    expect(messageList.textContent?.indexOf("First question")).toBeLessThan(messageList.textContent?.indexOf("Second question") ?? 0);
    expect(messageList.textContent?.indexOf("First answer")).toBeLessThan(messageList.textContent?.indexOf("Second answer") ?? 0);
  });

  it("filters python files out of the repository panel", async () => {
    const user = userEvent.setup();
    installBaseFetch({
      artifacts: [
        { id: "report_1", projectId: "project_alpha", name: "summary.md", kind: "report", generatedAt: "2026-05-12", sourceMessageId: "msg_1" },
        { id: "script_1", projectId: "project_alpha", name: "helper.py", kind: "analysis", generatedAt: "2026-05-12", sourceMessageId: "msg_2" }
      ]
    });

    render(<App />);
    await loginAndSelectProject(user);

    expect(screen.getByText(/1 items/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^repository/i }));

    expect(screen.getByText("summary.md")).toBeInTheDocument();
    expect(screen.queryByText("helper.py")).not.toBeInTheDocument();
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
          "event: final_answer_start\ndata: " + JSON.stringify({ requestId: "req_stream" }),
          "event: answer_token\ndata: " + JSON.stringify({ content: "Final answer ready." }),
          "event: final_answer_end\ndata: " + JSON.stringify({ requestId: "req_stream" }),
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

    const workedLabel = await screen.findByText(/Worked for/i);
    const assistantMessage = workedLabel.closest("article");
    expect(assistantMessage).not.toBeNull();
    expect(assistantMessage).toHaveTextContent(/Final answer ready/);
    expect(workedLabel.closest("details")).not.toHaveAttribute("open");
  });

  it("creates the sidebar conversation only after the first message in a new chat", async () => {
    const fetchMock = installBaseFetch({
      chatMessages: [
        { id: "msg_existing", projectId: "project_alpha", userId: "user_ada", role: "user", content: "Existing context" },
        { id: "msg_existing_assistant", projectId: "project_alpha", userId: "user_ada", role: "assistant", content: "Existing answer" }
      ]
    });

    const user = userEvent.setup();
    render(<App />);
    await loginAndSelectProject(user);

    await user.click(screen.getByRole("button", { name: /new chat/i }));
    expect(screen.getByRole("list", { name: /recent conversations/i })).not.toHaveTextContent("New conversation");

    await user.type(screen.getByRole("textbox", { name: /^message$/i }), "What should we build first?");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByRole("list", { name: /recent conversations/i })).toHaveTextContent("What should we build first?");
    const createConversationCall = fetchMock.mock.calls.find(([url, init]) => url === "/api/projects/project_alpha/conversations" && init?.method === "POST");
    expect(createConversationCall).toBeTruthy();
  });

  it("keeps the active stream stable until completion, then restores the completed conversation after switching away", async () => {
    let releaseDone!: () => void;
    const doneGate = new Promise<void>((resolve) => {
      releaseDone = resolve;
    });

    installFetch(async (url, init) => {
      if (url === "/api/login") return jsonResponse({ token: "seed-token-ada", user: { id: "user_ada", name: "Ada Lovelace" }, requestId: "req_login" });
      if (url === "/api/session") return jsonResponse({ session: { userId: "user_ada", projectId: null, permissions: [] }, requestId: "req_session" });
      if (url === "/api/projects") return jsonResponse({ projects: [alphaProject], limit: 50, requestId: "req_projects" });
      if (url === "/api/projects/project_alpha/select") return jsonResponse({ session: { userId: "user_ada", projectId: "project_alpha", permissions: alphaProject.permissions }, requestId: "req_select" });
      if (url === "/api/projects/project_alpha/chat" && init?.method !== "POST") return jsonResponse({ messages: [], limit: 50, requestId: "req_chat" });
      if (url === "/api/projects/project_alpha/conversations" && init?.method !== "POST") {
        return jsonResponse({
          conversations: [
            { id: "conv_existing", title: "Existing thread", messageCount: 2, createdAt: "2026-05-11T00:00:00.000Z" }
          ],
          limit: 50,
          requestId: "req_conversations"
        });
      }
      if (url === "/api/projects/project_alpha/conversations" && init?.method === "POST") {
        return jsonResponse({ conversation: { id: "conv_streaming", title: "New conversation", messageCount: 0, createdAt: "2026-05-12T00:00:00.000Z" }, requestId: "req_new_conv" }, 201);
      }
      if (url === "/api/projects/project_alpha/chat/stream" && init?.method === "POST") {
        const encoder = new TextEncoder();
        return new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode("event: activity\ndata: " + JSON.stringify({ id: "act_1", label: "I am checking project context.", kind: "context", requestId: "req_stream" }) + "\n\n"));
            controller.enqueue(encoder.encode("event: final_answer_start\ndata: " + JSON.stringify({ requestId: "req_stream" }) + "\n\n"));
            controller.enqueue(encoder.encode("event: answer_token\ndata: " + JSON.stringify({ content: "Partial answer" }) + "\n\n"));
            void doneGate.then(() => {
              controller.enqueue(encoder.encode("event: done\ndata: " + JSON.stringify({
                message: { id: "msg_000001", projectId: "project_alpha", userId: "user_ada", role: "user", content: "timeline please" },
                assistantMessage: { id: "msg_000002", projectId: "project_alpha", userId: "user_ada", role: "assistant", content: "Partial answer\n\nFinal answer ready." },
                conversationId: "conv_streaming",
                conversationTitle: "Timeline please",
                provider: { id: "provider-not-configured", mode: "real", model: "gpt-4o-mini", status: "unconfigured" },
                fallbackUsed: false,
                requestId: "req_stream"
              }) + "\n\n"));
              controller.close();
            });
          }
        }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
      }
      if (url === "/api/registry") return jsonResponse(registryBody());
      if (url === "/api/projects/project_alpha/management") return jsonResponse(managementBody());
      if (url === "/api/projects/project_alpha/knowledge-base") return jsonResponse({ documents: [], requestId: "req_kb" });
      if (url === "/api/projects/project_alpha/repository") return jsonResponse({ artifacts: [], requestId: "req_repo" });
      if (url === "/api/projects/project_alpha/conversations/conv_existing/select") {
        return jsonResponse({
          conversation: { id: "conv_existing", title: "Existing thread", messageCount: 2, createdAt: "2026-05-11T00:00:00.000Z" },
          messages: [
            { id: "msg_existing", projectId: "project_alpha", userId: "user_ada", role: "user", content: "Existing question" },
            { id: "msg_existing_assistant", projectId: "project_alpha", userId: "user_ada", role: "assistant", content: "Existing answer" }
          ],
          requestId: "req_select_existing"
        });
      }
      if (url === "/api/projects/project_alpha/conversations/conv_streaming/select") {
        return jsonResponse({
          conversation: { id: "conv_streaming", title: "New conversation", messageCount: 1, createdAt: "2026-05-12T00:00:00.000Z" },
          messages: [
            { id: "msg_000001", projectId: "project_alpha", userId: "user_ada", role: "user", content: "timeline please" },
            { id: "msg_000002", projectId: "project_alpha", userId: "user_ada", role: "assistant", content: "Partial answer\n\nFinal answer ready." }
          ],
          requestId: "req_select_streaming"
        });
      }
      return apiError("not_found", "Unexpected test URL", 404);
    });

    const user = userEvent.setup();
    render(<App />);
    await loginAndSelectProject(user);
    await user.type(screen.getByRole("textbox", { name: /^message$/i }), "timeline please");
    await user.click(screen.getByRole("button", { name: /send message/i }));
    expect(await screen.findByText(/Partial answer/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Existing thread/i })).toBeDisabled();

    releaseDone();
    expect(await screen.findByText(/Final answer ready/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Existing thread/i }));
    expect(await screen.findByText("Existing answer")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Timeline please/i }));
    expect(await screen.findByText(/Final answer ready/i)).toBeInTheDocument();
    expect(screen.queryByText(/Working for/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Partial answer/i)).toBeInTheDocument();
  });

  it("removes the running workflow immediately when generation is stopped", async () => {
    const abortSignals: AbortSignal[] = [];
    installFetch(async (url, init) => {
      if (url === "/api/login") return jsonResponse({ token: "seed-token-ada", user: { id: "user_ada", name: "Ada Lovelace" }, requestId: "req_login" });
      if (url === "/api/session") return jsonResponse({ session: { userId: "user_ada", projectId: null, permissions: [] }, requestId: "req_session" });
      if (url === "/api/projects") return jsonResponse({ projects: [alphaProject], limit: 50, requestId: "req_projects" });
      if (url === "/api/projects/project_alpha/select") return jsonResponse({ session: { userId: "user_ada", projectId: "project_alpha", permissions: alphaProject.permissions }, requestId: "req_select" });
      if (url === "/api/projects/project_alpha/chat" && init?.method !== "POST") return jsonResponse({ messages: [], limit: 50, requestId: "req_chat" });
      if (url === "/api/projects/project_alpha/conversations" && init?.method !== "POST") return jsonResponse({ conversations: [], limit: 50, requestId: "req_conversations" });
      if (url === "/api/projects/project_alpha/conversations" && init?.method === "POST") return jsonResponse({ conversation: { id: "conv_streaming", title: "New conversation", messageCount: 0, createdAt: "2026-05-12T00:00:00.000Z" }, requestId: "req_new_conv" }, 201);
      if (url === "/api/projects/project_alpha/chat/stream" && init?.method === "POST") {
        if (init?.signal) abortSignals.push(init.signal);
        return hangingStreamingResponse([
          "event: activity\ndata: " + JSON.stringify({ id: "act_1", label: "I am checking project context.", kind: "context", requestId: "req_stream" })
        ], init?.signal ?? undefined);
      }
      if (url === "/api/registry") return jsonResponse(registryBody());
      if (url === "/api/projects/project_alpha/management") return jsonResponse(managementBody());
      if (url === "/api/projects/project_alpha/knowledge-base") return jsonResponse({ documents: [], requestId: "req_kb" });
      if (url === "/api/projects/project_alpha/repository") return jsonResponse({ artifacts: [], requestId: "req_repo" });
      return apiError("not_found", "Unexpected test URL", 404);
    });

    const user = userEvent.setup();
    render(<App />);
    await loginAndSelectProject(user);
    await user.type(screen.getByRole("textbox", { name: /^message$/i }), "stop please");
    await user.click(screen.getByRole("button", { name: /send message/i }));
    expect(await screen.findByText(/Working for/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /stop generating/i }));
    await waitFor(() => {
      expect(screen.queryByText(/Working for/i)).not.toBeInTheDocument();
    });
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

    expect(await screen.findByRole("heading", { name: /^BuildingAgent$/i })).toBeInTheDocument();
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

    await signIn(user);
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
    const messageList = screen.getByLabelText(/alpha build messages/i);
    expect(within(messageList).queryByText("Please mutate optimistically")).not.toBeInTheDocument();
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
    expect(screen.getByRole("alert")).toHaveTextContent(/enter your email and password/i);
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/email/i), "ada@example.test");
    await user.type(screen.getByLabelText(/password/i), "local-dev-password");
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
    await signIn(user);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("api_malformed"));
    expect(screen.getByRole("heading", { name: /choose a project to get started/i })).toBeInTheDocument();
  });

  it("renders read-only selected projects with management inspection while chat compose remains disabled", async () => {
    installBaseFetch({ project: betaProject, management: jsonResponse(managementBody({ projectId: "project_beta" })) });

    const user = userEvent.setup();
    render(<App />);
    await signIn(user);
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
    await signIn(user);
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
    await signIn(user);
    await screen.findByRole("heading", { name: /choose a project to get started/i });
    await user.click(screen.getByRole("button", { name: /open/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("api_malformed");
    unmount();

    window.localStorage.clear();
    vi.unstubAllGlobals();
    installBaseFetch({ management: jsonResponse(managementBody({ gateways: [{ ...gateway, protocol: "smtp" }] })) });
    const user2 = userEvent.setup();
    render(<App />);
    await signIn(user2);
    await screen.findByRole("heading", { name: /choose a project to get started/i });
    await user2.click(screen.getByRole("button", { name: /open/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("api_malformed");

    vi.unstubAllGlobals();
    cleanup();
    window.localStorage.clear();
    installBaseFetch({ registry: jsonResponse(registryBody({ runtimeProviders: [], tools: [], skills: [], gateways: [], buildingCapabilities: [] })), management: jsonResponse(managementBody({ gateways: [], capabilities: [], tools: [] })) });
    const user3 = userEvent.setup();
    render(<App />);
    await signIn(user3);
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
    const messageList = screen.getByLabelText(/alpha build messages/i);
    expect(within(messageList).queryByText("malformed please")).not.toBeInTheDocument();
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
    const messageList = screen.getByLabelText(/alpha build messages/i);
    expect(within(messageList).queryByText("metadata please")).not.toBeInTheDocument();
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
    const messageList = screen.getByLabelText(/alpha build messages/i);
    expect(within(messageList).queryByText("provider fail")).not.toBeInTheDocument();
  });

  it("shows dashboards in the right sidebar, opens one, updates live values from websocket, and saves drag reorders", async () => {
    const dashboard = dashboardRecord({
      sections: [{ id: "overview", title: "Overview", kind: "overview", widgetIds: ["live_supply_return", "trend_supply_return"] }]
    }) as DashboardRecord;
    const generatedDashboard = dashboardRecord({
      id: "dashboard_generated",
      title: "Generated chiller dashboard",
      sourceConversationId: "conv_dashboard_source",
      sections: [{ id: "overview", title: "Overview", kind: "overview", widgetIds: ["live_supply_return", "trend_supply_return"] }]
    }) as DashboardRecord;
    const otherConversationDashboard = dashboardRecord({
      id: "dashboard_other_generated",
      title: "Other conversation dashboard",
      sourceConversationId: "conv_elsewhere",
      sections: [{ id: "overview", title: "Overview", kind: "overview", widgetIds: ["live_supply_return", "trend_supply_return"] }]
    }) as DashboardRecord;
    const patchCalls: Array<{ url: string; body: Record<string, unknown> }> = [];

    class MockWebSocket {
      static OPEN = 1;
      static instances: MockWebSocket[] = [];
      readyState = MockWebSocket.OPEN;
      url: string;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      sent: string[] = [];

      constructor(url: string) {
        this.url = url;
        MockWebSocket.instances.push(this);
      }

      send(payload: string) {
        this.sent.push(payload);
      }

      close() {
        this.onclose?.({} as CloseEvent);
      }
    }

    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

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
        return jsonResponse({ messages: [], activeConversationId: "conv_dashboard_source", limit: 50, requestId: "req_chat" });
      }
      if (url === "/api/projects/project_alpha/conversations" && init?.method !== "POST") {
        return jsonResponse({ conversations: [], limit: 50, requestId: "req_conversations" });
      }
      if (url === "/api/projects/project_alpha/conversations" && init?.method === "POST") {
        return jsonResponse({ conversation: { id: "conv_dashboard_source", title: "New conversation", messageCount: 0, createdAt: "2026-06-24T01:00:00.000Z" }, requestId: "req_new_conversation" }, 201);
      }
      if (url === "/api/projects/project_alpha/chat/stream" && init?.method === "POST") {
        return streamingResponse([
          "event: token\ndata: " + JSON.stringify({ content: "Dashboard request acknowledged." }),
          "event: done\ndata: " + JSON.stringify({
            message: { id: "msg_dashboard_user", projectId: "project_alpha", userId: "user_ada", role: "user", content: "Create a dashboard" },
            assistantMessage: { id: "msg_dashboard_assistant", projectId: "project_alpha", userId: "user_ada", role: "assistant", content: "Dashboard request acknowledged." },
            conversationId: "conv_dashboard_source",
            conversationTitle: "Chiller monitoring request",
            provider: { id: "provider-not-configured", mode: "real", model: "gpt-4o-mini", status: "unconfigured" },
            fallbackUsed: false,
            requestId: "req_dashboard_stream"
          })
        ]);
      }
      if (url === "/api/registry") return jsonResponse(registryBody());
      if (url === "/api/projects/project_alpha/management") return jsonResponse(managementBody());
      if (url === "/api/projects/project_alpha/knowledge-base") return jsonResponse({ documents: [], totalCount: 0, requestId: "req_kb" });
      if (url === "/api/projects/project_alpha/repository") return jsonResponse({ artifacts: [], totalCount: 0, requestId: "req_repo" });
      if (url === "/api/projects/project_alpha/dashboards") {
        return jsonResponse({ projectId: "project_alpha", dashboards: [dashboard], totalCount: 1, requestId: "req_dashboards" });
      }
      if (url === "/api/projects/project_alpha/dashboards/dashboard_temp_watch" && (!init?.method || init.method === "GET")) {
        return jsonResponse({ projectId: "project_alpha", dashboard, requestId: "req_dashboard" });
      }
      if (url === "/api/projects/project_alpha/dashboards/dashboard_temp_watch" && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
        patchCalls.push({ url, body });
        const nextLayout = Array.isArray(body.layout) ? body.layout : dashboard.layout;
        return jsonResponse({
          projectId: "project_alpha",
          dashboard: dashboardRecord({
            layout: nextLayout,
            sections: Array.isArray(body.sections) ? body.sections : dashboard.sections,
            visibility: typeof body.visibility === "string" ? body.visibility : dashboard.visibility,
            updatedAt: "2026-06-24T03:00:00.000Z"
          }),
          requestId: "req_patch_dashboard"
        });
      }
      if (url === "/api/bms/dashboard/history-batch" && init?.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}")) as { queries?: Array<{ key: string; name?: string }> };
        return jsonResponse({
          results: (body.queries ?? []).map((query) => {
            const isReturn = query.name?.includes("Return");
            return {
              key: query.key,
              ok: true,
              total: 2,
              items: [
                { ts: "2026-06-24T01:00:00.000Z", value_num: isReturn ? 47.4 : 42.0, name: query.name },
                { ts: "2026-06-24T02:00:00.000Z", value_num: isReturn ? 47.1 : 41.8, name: query.name }
              ]
            };
          }),
          requestId: "req_history_batch"
        });
      }
      if (url.startsWith("/api/bms/collector/api/v1/readings?")) {
        return jsonResponse({
          total: 2,
          items: [
            { ts: "2026-06-24T01:00:00.000Z", value_num: url.includes("CH-01_Return_Water_Temp") ? 47.4 : 42.0, name: url.includes("CH-01_Return_Water_Temp") ? "CH-01_Return_Water_Temp" : "CH-01_Supply_Water_Temp" },
            { ts: "2026-06-24T02:00:00.000Z", value_num: url.includes("CH-01_Return_Water_Temp") ? 47.1 : 41.8, name: url.includes("CH-01_Return_Water_Temp") ? "CH-01_Return_Water_Temp" : "CH-01_Supply_Water_Temp" }
          ]
        });
      }
      if (url.startsWith("/api/bms/collector/api/v1/points?")) {
        return jsonResponse({
          total: 1,
          items: [{ id: 101, name: "CH-01_Supply_Water_Temp", last_value: "42.0", last_polled_at: "2026-06-24T02:00:00.000Z" }]
        });
      }
      return apiError("not_found", "Unexpected test URL", 404);
    });

    const user = userEvent.setup();
    render(<App />);
    await loginAndSelectProject(user);
    expect(screen.getByText("Dashboards").closest("details")).toHaveAttribute("open");
    expect(screen.getByText(/Scheduled & rule-based tasks/i).closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Skills").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Tools").closest("details")).not.toHaveAttribute("open");
    await user.type(screen.getByRole("textbox", { name: /^message$/i }), "Create a dashboard");
    await user.click(screen.getByRole("button", { name: /send message/i }));
    expect(await screen.findByText("Dashboard request acknowledged.")).toBeInTheDocument();

    expect(screen.getByText(/dashboards/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /plant temperature dashboard/i }));

    expect(await screen.findByRole("heading", { name: /plant temperature dashboard/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/projects/project_alpha/dashboards/dashboard_temp_watch");
    expect(screen.getByRole("button", { name: /expand project sidebar/i })).toBeInTheDocument();

    const socket = MockWebSocket.instances.at(-1);
    expect(socket).toBeTruthy();
    await act(async () => {
      socket?.onmessage?.({ data: JSON.stringify({ type: "connected" }) } as MessageEvent);
    });
    expect(socket?.sent.some((payload) => payload.includes("dashboard_subscribe"))).toBe(true);

    await act(async () => {
      socket?.onmessage?.({
        data: JSON.stringify({
          type: "dashboard_point_update",
          updates: [
            { pointName: "CH-01_Supply_Water_Temp", value: "42.6", polledAt: "2026-06-24T02:05:00.000Z" }
          ]
        })
      } as MessageEvent);
    });
    expect((await screen.findAllByText(/42\.6 degF/i)).length).toBeGreaterThan(0);

    const liveCard = screen.getByText("Live temperatures").closest("article");
    const trendCard = screen.getByText("Temperature history").closest("article");
    expect(liveCard).not.toBeNull();
    expect(trendCard).not.toBeNull();
    await user.click(screen.getByRole("button", { name: /edit layout/i }));
    const trendDragHandle = trendCard!.querySelector(".dashboard-panel-drag-handle");
    expect(trendDragHandle).not.toBeNull();
    fireEvent.dragStart(trendDragHandle!);
    fireEvent.dragOver(liveCard!);
    fireEvent.drop(liveCard!);

    await waitFor(() => {
      expect(patchCalls.length).toBeGreaterThan(0);
    });
    expect(patchCalls.at(-1)?.body.layout).toEqual(expect.arrayContaining([
      expect.objectContaining({ widgetId: "trend_supply_return", x: 0, y: 0, w: 6, h: 4 }),
      expect.objectContaining({ widgetId: "live_supply_return", x: 6, y: 0, w: 3, h: 2 })
    ]));
    expect(patchCalls.at(-1)?.body.layoutVersion).toBe(2);
    expect(patchCalls.at(-1)?.body.sections).toEqual([
      expect.objectContaining({ id: "overview", widgetIds: ["live_supply_return", "trend_supply_return"] })
    ]);

    await act(async () => {
      socket?.onmessage?.({
        data: JSON.stringify({ type: "dashboard_created", dashboard: generatedDashboard })
      } as MessageEvent);
    });
    expect(window.location.pathname).toBe("/projects/project_alpha/dashboards/dashboard_generated");
    expect(await screen.findByRole("heading", { name: /generated chiller dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Dashboard created");

    await act(async () => {
      socket?.onmessage?.({
        data: JSON.stringify({ type: "dashboard_created", dashboard: otherConversationDashboard })
      } as MessageEvent);
    });
    expect(window.location.pathname).toBe("/projects/project_alpha/dashboards/dashboard_generated");
    expect(screen.getByRole("button", { name: /other conversation dashboard/i })).toBeInTheDocument();
  });

  it("does not reload completed trend charts when unchanged dashboard objects are rerendered", async () => {
    const dashboard = dashboardRecord({
      layout: [
        { widgetId: "trend_supply_return_cache", x: 0, y: 0, w: 2, h: 4 },
        { widgetId: "trend_secondary_cache", x: 2, y: 0, w: 2, h: 4 }
      ],
      widgets: [
        {
          id: "trend_supply_return_cache",
          kind: "timeseries_chart",
          title: "Temperature history",
          defaultTimeRange: "24h",
          pointBindings: [
            { pointName: "CH-21_Supply_Water_Temp", label: "CH-21 Supply", role: "supply", unit: "degF" },
            { pointName: "CH-21_Return_Water_Temp", label: "CH-21 Return", role: "return", unit: "degF" }
          ]
        },
        {
          id: "trend_secondary_cache",
          kind: "timeseries_chart",
          title: "Secondary history",
          defaultTimeRange: "24h",
          pointBindings: [
            { pointName: "CH-22_Supply_Water_Temp", label: "CH-22 Supply", role: "supply", unit: "degF" },
            { pointName: "CH-22_Return_Water_Temp", label: "CH-22 Return", role: "return", unit: "degF" }
          ]
        }
      ]
    }) as DashboardRecord;
    let batchCalls = 0;
    const batchQueryKeys: string[][] = [];

    installFetch((url, init) => {
      if (url === "/api/bms/dashboard/history-batch" && init?.method === "POST") {
        batchCalls += 1;
        const body = JSON.parse(String(init.body ?? "{}")) as { queries?: Array<{ key: string; name?: string }> };
        batchQueryKeys.push((body.queries ?? []).map((query) => query.key));
        return jsonResponse({
          results: (body.queries ?? []).map((query) => {
            const name = query.name ?? "Unknown_Point";
            const offset = name.includes("Return") ? 5 : 0;
            return {
              key: query.key,
              ok: true,
              total: 2,
              items: [
                { ts: "2026-06-24T01:00:00.000Z", value_num: 41.8 + offset, name },
                { ts: "2026-06-24T02:00:00.000Z", value_num: 42.1 + offset, name }
              ]
            };
          }),
          requestId: "req_history_batch"
        });
      }
      if (url.startsWith("/api/bms/collector/api/v1/points?")) {
        const name = new URL(`http://test.local${url}`).searchParams.get("q") ?? "Unknown_Point";
        return jsonResponse({
          total: 1,
          items: [{ id: 101, name, last_value: "42.1", last_polled_at: "2026-06-24T02:00:00.000Z" }]
        });
      }
      return apiError("not_found", "Unexpected test URL", 404);
    });

    const props = {
      token: "seed-token-ada",
      liveValues: {},
      stale: false,
      onLayoutChange: vi.fn(async () => undefined),
      onVisibilityChange: vi.fn(async () => undefined)
    };
    const { rerender } = render(<DashboardView {...props} dashboard={dashboard} />);

    await waitFor(() => expect(batchCalls).toBe(1));
    expect([...(batchQueryKeys[0] ?? [])].sort()).toEqual([
      "trend_supply_return_cache:0",
      "trend_supply_return_cache:1",
      "trend_secondary_cache:0",
      "trend_secondary_cache:1"
    ].sort());
    await waitFor(() => expect(screen.queryAllByText(/Loading trend/i)).toHaveLength(0));
    const initialBatchCalls = batchCalls;

    rerender(<DashboardView {...props} dashboard={JSON.parse(JSON.stringify(dashboard)) as DashboardRecord} />);
    await act(async () => undefined);

    expect(batchCalls).toBe(initialBatchCalls);
    expect(screen.queryAllByText(/Loading trend/i)).toHaveLength(0);
  });

  it("does not reload trend history when note placement changes reorder dashboard widgets", async () => {
    const dashboard = dashboardRecord({
      layout: [
        { widgetId: "trend_supply_return", x: 0, y: 0, w: 6, h: 4 },
        { widgetId: "trend_secondary", x: 6, y: 0, w: 6, h: 4 }
      ],
      widgets: [
        {
          id: "trend_supply_return",
          kind: "timeseries_chart",
          title: "Temperature history",
          defaultTimeRange: "24h",
          pointBindings: [
            { pointName: "CH-11_Supply_Water_Temp", label: "CH-11 Supply", role: "supply", unit: "degF" },
            { pointName: "CH-11_Return_Water_Temp", label: "CH-11 Return", role: "return", unit: "degF" }
          ]
        },
        {
          id: "trend_secondary",
          kind: "timeseries_chart",
          title: "Secondary history",
          defaultTimeRange: "24h",
          pointBindings: [
            { pointName: "CH-12_Supply_Water_Temp", label: "CH-12 Supply", role: "supply", unit: "degF" },
            { pointName: "CH-12_Return_Water_Temp", label: "CH-12 Return", role: "return", unit: "degF" }
          ]
        }
      ],
      sections: [
        { id: "trends", title: "Trends", kind: "trends", widgetIds: ["trend_supply_return", "trend_secondary"] }
      ]
    }) as DashboardRecord;
    let batchCalls = 0;

    installFetch((url, init) => {
      if (url === "/api/bms/dashboard/history-batch" && init?.method === "POST") {
        batchCalls += 1;
        const body = JSON.parse(String(init.body ?? "{}")) as { queries?: Array<{ key: string; name?: string }> };
        return jsonResponse({
          results: (body.queries ?? []).map((query) => ({
            key: query.key,
            ok: true,
            total: 2,
            items: [
              { ts: "2026-06-24T01:00:00.000Z", value_num: 41.8, name: query.name },
              { ts: "2026-06-24T02:00:00.000Z", value_num: 42.1, name: query.name }
            ]
          })),
          requestId: "req_history_batch"
        });
      }
      if (url.startsWith("/api/bms/collector/api/v1/points?")) {
        const name = new URL(`http://test.local${url}`).searchParams.get("q") ?? "Unknown_Point";
        return jsonResponse({
          total: 1,
          items: [{ id: 101, name, last_value: "42.1", last_polled_at: "2026-06-24T02:00:00.000Z" }]
        });
      }
      return apiError("not_found", "Unexpected test URL", 404);
    });

    const props = {
      token: "seed-token-ada",
      liveValues: {},
      stale: false,
      onLayoutChange: vi.fn(async () => undefined),
      onVisibilityChange: vi.fn(async () => undefined)
    };
    const { rerender } = render(<DashboardView {...props} dashboard={dashboard} />);

    await waitFor(() => expect(batchCalls).toBe(1));
    await waitFor(() => expect(screen.queryAllByText(/Loading trend/i)).toHaveLength(0));

    rerender(
      <DashboardView
        {...props}
        dashboard={{
          ...dashboard,
          layout: [
            { widgetId: "note_copy", x: 0, y: 0, w: 3, h: 2 },
            { widgetId: "trend_supply_return", x: 0, y: 0, w: 6, h: 4 },
            { widgetId: "trend_secondary", x: 6, y: 0, w: 6, h: 4 }
          ],
          widgets: [
            {
              id: "note_copy",
              kind: "note",
              title: "Operator note",
              content: "Moved into overview.",
              tone: "yellow",
              pointBindings: []
            },
            dashboard.widgets[1]!,
            dashboard.widgets[0]!
          ],
          sections: [
            { id: "overview", title: "Overview", kind: "overview", widgetIds: ["note_copy"] },
            { id: "trends", title: "Trends", kind: "trends", widgetIds: ["trend_supply_return", "trend_secondary"] }
          ],
          updatedAt: "2026-06-24T04:00:00.000Z"
        }}
      />
    );
    await act(async () => undefined);

    expect(batchCalls).toBe(1);
    expect(screen.queryAllByText(/Loading trend/i)).toHaveLength(0);
  });

  it("synthesizes independent dashboard sections for legacy dashboard specs", async () => {
    const dashboard = dashboardRecord({
      layoutVersion: undefined,
      layout: [
        { widgetId: "live_supply_return", x: 0, y: 0, w: 1, h: 1 },
        { widgetId: "trend_supply_return", x: 1, y: 0, w: 2, h: 1 }
      ]
    }) as DashboardRecord;

    installFetch((url, init) => {
      if (url === "/api/bms/dashboard/history-batch" && init?.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}")) as { queries?: Array<{ key: string; name?: string }> };
        return jsonResponse({
          results: (body.queries ?? []).map((query) => ({
            key: query.key,
            ok: true,
            total: 1,
            items: [{ ts: "2026-06-24T02:00:00.000Z", value_num: 42.1, name: query.name }]
          })),
          requestId: "req_history_batch"
        });
      }
      if (url.startsWith("/api/bms/collector/api/v1/points?")) {
        const name = new URL(`http://test.local${url}`).searchParams.get("q") ?? "Unknown_Point";
        return jsonResponse({
          total: 1,
          items: [{ id: 101, name, last_value: "42.1", last_polled_at: "2026-06-24T02:00:00.000Z" }]
        });
      }
      return apiError("not_found", "Unexpected test URL", 404);
    });

    const { container } = render(
      <DashboardView
        token="seed-token-ada"
        dashboard={dashboard}
        liveValues={{}}
        stale={false}
        onLayoutChange={vi.fn(async () => undefined)}
        onVisibilityChange={vi.fn(async () => undefined)}
      />
    );

    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Trends")).toBeInTheDocument();
    const sections = [...container.querySelectorAll(".dashboard-section")];
    expect(sections).toHaveLength(2);
    expect(within(sections[0] as HTMLElement).getByText("Live temperatures")).toBeInTheDocument();
    expect(within(sections[1] as HTMLElement).getByText("Temperature history")).toBeInTheDocument();
    expect(sections[0]?.querySelector(".dashboard-grid")).not.toBe(sections[1]?.querySelector(".dashboard-grid"));
  });

  it("adds notes into the selected section and supports direct title and content editing", async () => {
    const initialDashboard = dashboardRecord({
      layout: [],
      widgets: [],
      sections: []
    }) as DashboardRecord;
    const patchCalls: DashboardRecord[] = [];

    function DashboardHarness() {
      const [dashboard, setDashboard] = useState<DashboardRecord>(initialDashboard);
      return (
        <DashboardView
          token="seed-token-ada"
          dashboard={dashboard}
          liveValues={{}}
          stale={false}
          onDashboardChange={async (next) => {
            const updated = {
              ...dashboard,
              ...next,
              updatedAt: "2026-06-24T03:00:00.000Z"
            } as DashboardRecord;
            patchCalls.push(updated);
            setDashboard(updated);
          }}
          onLayoutChange={vi.fn(async () => undefined)}
          onVisibilityChange={vi.fn(async () => undefined)}
        />
      );
    }

    const user = userEvent.setup();
    const { container } = render(<DashboardHarness />);

    await user.click(screen.getByLabelText(/add widget/i));
    await user.click(screen.getByRole("button", { name: "Note" }));
    expect(screen.getByLabelText("Choose note section")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Overview" }));

    const noteDragHandle = await screen.findByRole("button", { name: /drag new note/i });
    const placementPanel = noteDragHandle.closest("article");
    expect(placementPanel).toHaveClass("is-placement-target");
    expect(placementPanel?.querySelector(".dashboard-placement-drag-layer")).toBeInTheDocument();

    fireEvent.mouseUp(placementPanel!.querySelector(".dashboard-placement-drag-layer")!);

    await waitFor(() => {
      expect(container.querySelector(".dashboard-placement-drag-layer")).not.toBeInTheDocument();
    });

    const titleInput = await screen.findByDisplayValue("New note");
    await user.clear(titleInput);
    await user.type(titleInput, "Shift handoff");
    fireEvent.blur(titleInput);

    const contentInput = await screen.findByPlaceholderText("Click to add a note");
    await user.type(contentInput, "Check CHW delta before tomorrow.");
    fireEvent.blur(contentInput);

    await waitFor(() => {
      expect(patchCalls.at(-1)?.widgets).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: "note",
          title: "Shift handoff",
          content: "Check CHW delta before tomorrow."
        })
      ]));
    });
    expect(patchCalls.at(-1)?.sections).toEqual([
      expect.objectContaining({ id: "overview", title: "Overview", widgetIds: [expect.any(String)] })
    ]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the BMS workspace entry and syncs the bms path", async () => {
    installBaseFetch();
    const user = userEvent.setup();

    render(<App />);
    await loginAndSelectProject(user);

    const sidebar = screen.getByRole("complementary", { name: /^project sidebar$/i });
    expect(within(sidebar).getByRole("button", { name: /bms data config/i })).toBeInTheDocument();

    await user.click(within(sidebar).getByRole("button", { name: /bms data config/i }));
    expect(window.location.pathname).toBe("/projects/project_alpha/bms-data-config");
    expect(await screen.findByRole("heading", { name: /bms data config/i })).toBeInTheDocument();
  });

  it("renders the real BMS config page and keeps enteliWEB as the active adapter", async () => {
    installFetch((url, init) => {
      if (url === "/api/login") return jsonResponse({ token: "seed-token-ada", user: { id: "user_ada", name: "Ada Lovelace" }, requestId: "req_login" });
      if (url === "/api/session") return jsonResponse({ session: { userId: "user_ada", projectId: null, permissions: [] }, requestId: "req_session" });
      if (url === "/api/projects") return jsonResponse({ projects: [alphaProject], limit: 50, requestId: "req_projects" });
      if (url === "/api/projects/project_alpha/select") return jsonResponse({ session: { userId: "user_ada", projectId: "project_alpha", permissions: alphaProject.permissions }, requestId: "req_select" });
      if (url === "/api/projects/project_alpha/chat" && init?.method !== "POST") return jsonResponse({ messages: [], limit: 50, requestId: "req_chat" });
      if (url === "/api/projects/project_alpha/conversations" && init?.method !== "POST") return jsonResponse({ conversations: [], limit: 50, requestId: "req_conversations" });
      if (url === "/api/registry") return jsonResponse(registryBody());
      if (url === "/api/projects/project_alpha/management") return jsonResponse(managementBody());
      if (url === "/api/projects/project_alpha/knowledge-base") return jsonResponse({ documents: [], requestId: "req_kb" });
      if (url === "/api/projects/project_alpha/repository") return jsonResponse({ artifacts: [], requestId: "req_repo" });
      if (url === "/api/bms/health") return jsonResponse({ ok: true, service: "buildinggpt-bms-service", request_id: "req_bms" });
      if (url === "/api/bms/temp-upload" && init?.method === "POST") {
        return jsonResponse({
          upload_id: "upload_001",
          project_id: "project_alpha",
          file_name: "points.csv",
          mime_type: "text/csv",
          temp_file_token: ".temp/bms-config/project_alpha/upload_001/points.csv",
          temp_relative_path: ".temp/bms-config/project_alpha/upload_001/points.csv",
          uploaded_at: "2026-05-15T10:00:00Z",
          row_count: 2,
          preview_headers: ["point_name", "vendor_point_id", "equipment_name", "api_url"],
          preview_rows: [
            {
              point_name: "WCC_1_Control_Mode",
              vendor_point_id: "//Elements/10101.AV1",
              equipment_name: "WCC 1",
              api_url: "http://host/api/1"
            },
            {
              point_name: "WCC_1_Status",
              vendor_point_id: "//Elements/10101.BV2",
              equipment_name: "WCC 1",
              api_url: "http://host/api/2"
            }
          ],
          points: [{
            id: "pt_001",
            point_name: "WCC_1_Control_Mode",
            vendor_point_id: "//Elements/10101.AV1",
            api_path: "/enteliweb/api/.bacnet/Elements/10101/AV,1",
            unit: "",
            equipment_name: "WCC 1",
            system_name: "CHW System",
            location: "Plant Room",
            point_type: "sensor",
            writable: false,
            semantic_class: "brick:Command",
            status: "ready",
            description: "Control Mode",
            warnings: [],
            raw_row: { point_name: "WCC_1_Control_Mode" }
          }]
        });
      }
      if (url === "/api/bms/sources?project_id=project_alpha") return jsonResponse([]);
      if (url === "/api/bms/sources" && init?.method === "POST") {
        return jsonResponse({
          source_id: "src_001",
          project_id: "project_alpha",
          building_id: "project_alpha",
          name: "enteliWEB source",
          vendor_type: "enteliweb",
          protocol_type: "bacnet_http",
          base_url: null,
          auth_type: "basic",
          read_only: true,
          config: {
            verify_ssl: false,
            latest_value_endpoint_template: "/api/.bacnet/Elements/{element_id}/{object_type},{object_instance}"
          },
          status: "configured",
          created_at: "2026-05-15T10:00:00Z",
          updated_at: "2026-05-15T10:00:00Z"
        }, 201);
      }
      if (url === "/api/bms/sources/src_001/credentials" && init?.method === "POST") {
        return jsonResponse({
          source_id: "src_001",
          project_id: "project_alpha",
          building_id: "project_alpha",
          name: "enteliWEB source",
          vendor_type: "enteliweb",
          protocol_type: "bacnet_http",
          base_url: null,
          auth_type: "basic",
          read_only: true,
          config: { verify_ssl: false, latest_value_endpoint_template: "/api/.bacnet/Elements/{element_id}/{object_type},{object_instance}" },
          status: "configured",
          created_at: "2026-05-15T10:00:00Z",
          updated_at: "2026-05-15T10:00:00Z"
        });
      }
      if (url === "/api/bms/sources/src_001/test-connection" && init?.method === "POST") {
        return jsonResponse({
          source_id: "src_001",
          success: true,
          message: "Connection successful.",
          capabilities: {
            test_connection: true,
            import_points: true,
            read_latest: true,
            discover_points: false,
            read_history: false,
            write_point: false
          },
          tested_at: "2026-05-15T10:00:00Z"
        });
      }
      if (url === "/api/bms/sources/src_001/points") {
        return jsonResponse({
          source_id: "src_001",
          count: 1,
          points: [{
            id: "pt_001",
            point_name: "WCC_1_Control_Mode",
            vendor_point_id: "//Elements/10101.AV1",
            api_path: "/enteliweb/api/.bacnet/Elements/10101/AV,1",
            unit: "",
            equipment_name: "WCC 1",
            system_name: "CHW System",
            location: "Plant Room",
            point_type: "sensor",
            writable: false,
            semantic_class: "brick:Command",
            status: "ready",
            description: "Control Mode",
            warnings: []
          }]
        });
      }
      if (url === "/api/bms/ingestion/test" && init?.method === "POST") {
        return jsonResponse({ job_id: "job_001", status: "running", message: "Minimal ingestion test started." });
      }
      if (url === "/api/bms/points/pt_001" && init?.method === "PATCH") {
        return jsonResponse({
          id: "pt_001",
          point_name: "WCC_1_Control_Mode",
          vendor_point_id: "//Elements/10101.AV1",
          api_path: "/enteliweb/api/.bacnet/Elements/10101/AV,1",
          unit: "",
          equipment_name: "WCC 1",
          system_name: "CHW System",
          location: "Plant Room",
          point_type: "sensor",
          writable: false,
          semantic_class: "brick:Command",
          status: "ready",
          description: "Control Mode",
          warnings: []
        });
      }
      if (url === "/api/bms/points/test-live-values" && init?.method === "POST") {
        return jsonResponse({
          source_id: "src_001",
          success: true,
          message: "Live read successful.",
          tested_at: "2026-05-15T10:00:00Z",
          rows: [{
            point_id: "pt_001",
            point_name: "WCC_1_Control_Mode",
            vendor_point_id: "//Elements/10101.AV1",
            api_path: "/enteliweb/api/.bacnet/Elements/10101/AV,1",
            value: 1,
            unit: "",
            quality: "good",
            timestamp: "2026-05-15T10:00:00Z",
            success: true,
            raw_payload_keys: ["source_id", "rows"]
          }]
        });
      }
      return apiError("not_found", "Unexpected test URL", 404);
    });

    const user = userEvent.setup();
    render(<App />);
    await loginAndSelectProject(user);
    await user.click(screen.getByRole("button", { name: /bms data config/i }));
    expect(screen.getByRole("heading", { name: /upload file/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
    expect(screen.queryByText(/no upload yet/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no file selected yet/i)).toBeInTheDocument();
    const fileInput = screen.getByLabelText(/drop or choose a file/i);
    await user.upload(fileInput, new File(["point_name,vendor_point_id\nWCC_1_Control_Mode,//Elements/10101.AV1"], "points.csv", { type: "text/csv" }));
    expect(await screen.findByText(/rows ready for preview/i)).toBeInTheDocument();
    expect(screen.getByText(/4 columns, showing 2 of 2 rows/i)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "point_name" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "equipment_name" })).toBeInTheDocument();
    expect(screen.getByText("WCC_1_Status")).toBeInTheDocument();
    expect(screen.getByText("http://host/api/2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    expect(screen.getByRole("heading", { name: /select vendor/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delta controls enteliweb/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    expect(screen.getByRole("heading", { name: /review config/i })).toBeInTheDocument();
    expect(screen.getByText(/vendor_type: enteliweb/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    expect(screen.getByRole("heading", { name: /credentials & test/i })).toBeInTheDocument();
    expect(screen.getByText(/save credentials/i)).toBeInTheDocument();
  });
});
