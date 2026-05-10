import { describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

const adaToken = "seed-token-ada";
const graceToken = "seed-token-grace";

function bearer(value: string) {
  return { authorization: `Bearer ${value}` };
}

describe("project-scoped chat contract", () => {
  it("requires auth and a matching selected project before reading chat", async () => {
    const app = buildServer();

    const unauthorized = await app.inject({ method: "GET", url: "/api/projects/project_alpha/chat" });
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.json().error).toMatchObject({ code: "auth_missing" });

    const notSelected = await app.inject({
      method: "GET",
      url: "/api/projects/project_alpha/chat",
      headers: bearer(adaToken)
    });
    expect(notSelected.statusCode).toBe(403);
    expect(notSelected.json().error).toMatchObject({ code: "project_not_selected" });
  });

  it("stores and returns chat messages only for the selected project", async () => {
    const app = buildServer();

    await app.inject({ method: "POST", url: "/api/projects/project_alpha/select", headers: bearer(adaToken) });
    const posted = await app.inject({
      method: "POST",
      url: "/api/projects/project_alpha/chat",
      headers: bearer(adaToken),
      payload: { message: "What should we build first?" }
    });

    expect(posted.statusCode).toBe(201);
    expect(posted.json()).toEqual({
      message: {
        id: "msg_000001",
        projectId: "project_alpha",
        userId: "user_ada",
        role: "user",
        content: "What should we build first?"
      },
      requestId: expect.stringMatching(/^req_/)
    });

    const alphaChat = await app.inject({
      method: "GET",
      url: "/api/projects/project_alpha/chat",
      headers: bearer(adaToken)
    });
    expect(alphaChat.statusCode).toBe(200);
    expect(alphaChat.json()).toEqual({
      messages: [posted.json().message],
      limit: 50,
      requestId: expect.stringMatching(/^req_/)
    });

    await app.inject({ method: "POST", url: "/api/projects/project_beta/select", headers: bearer(adaToken) });
    const betaChat = await app.inject({
      method: "GET",
      url: "/api/projects/project_beta/chat",
      headers: bearer(adaToken)
    });
    expect(betaChat.statusCode).toBe(200);
    expect(betaChat.json().messages).toEqual([]);
  });

  it("rejects chat writes without selected project, write permission, or valid body", async () => {
    const app = buildServer();

    const notSelected = await app.inject({
      method: "POST",
      url: "/api/projects/project_alpha/chat",
      headers: bearer(adaToken),
      payload: { message: "Hello" }
    });
    expect(notSelected.statusCode).toBe(403);
    expect(notSelected.json().error).toMatchObject({ code: "project_not_selected" });

    await app.inject({ method: "POST", url: "/api/projects/project_beta/select", headers: bearer(adaToken) });
    const noWrite = await app.inject({
      method: "POST",
      url: "/api/projects/project_beta/chat",
      headers: bearer(adaToken),
      payload: { message: "Should not write" }
    });
    expect(noWrite.statusCode).toBe(403);
    expect(noWrite.json().error).toMatchObject({ code: "project_forbidden" });

    await app.inject({ method: "POST", url: "/api/projects/project_alpha/select", headers: bearer(adaToken) });
    for (const payload of [{}, { message: "" }, { message: "   " }, { message: "x".repeat(1001) }, { text: "wrong shape" }]) {
      const invalid = await app.inject({
        method: "POST",
        url: "/api/projects/project_alpha/chat",
        headers: bearer(adaToken),
        payload
      });
      expect(invalid.statusCode).toBe(422);
      expect(invalid.json().error).toMatchObject({ code: "chat_invalid" });
    }
  });

  it("rechecks membership on every operation and isolates projects between users", async () => {
    const app = buildServer();

    await app.inject({ method: "POST", url: "/api/projects/project_alpha/select", headers: bearer(adaToken) });
    await app.inject({
      method: "POST",
      url: "/api/projects/project_alpha/chat",
      headers: bearer(adaToken),
      payload: { message: "Alpha-only context" }
    });

    const graceForbidden = await app.inject({
      method: "GET",
      url: "/api/projects/project_alpha/chat",
      headers: bearer(graceToken)
    });
    expect(graceForbidden.statusCode).toBe(403);
    expect(graceForbidden.json().error).toMatchObject({ code: "project_forbidden" });

    await app.inject({ method: "POST", url: "/api/projects/project_gamma/select", headers: bearer(graceToken) });
    const graceChat = await app.inject({
      method: "GET",
      url: "/api/projects/project_gamma/chat",
      headers: bearer(graceToken)
    });
    expect(graceChat.statusCode).toBe(200);
    expect(graceChat.json().messages).toEqual([]);
  });
});
