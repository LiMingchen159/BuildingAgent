import { describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

const token = "seed-token-ada";

function bearer(value = token) {
  return { authorization: `Bearer ${value}` };
}

describe("auth, session, and project contract", () => {
  it("exposes health without authentication and includes a request id", async () => {
    const app = buildServer();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, service: "building-agent-api" });
    expect(response.json().requestId).toMatch(/^req_/);
  });

  it("logs in a seeded user without exposing the token in logs", async () => {
    const app = buildServer();
    const response = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { email: "ada@example.test", password: "local-dev-password" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      token,
      tokenType: "Bearer",
      expiresAt: null,
      user: { id: "user_ada", name: "Ada Lovelace" },
      requestId: expect.stringMatching(/^req_/)
    });
  });

  it("does not clear the selected project when the same user logs in again", async () => {
    const app = buildServer();

    await app.inject({
      method: "POST",
      url: "/api/projects/project_alpha/select",
      headers: bearer()
    });

    const loginAgain = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { email: "ada@example.test", password: "local-dev-password" }
    });
    expect(loginAgain.statusCode).toBe(200);

    const session = await app.inject({ method: "GET", url: "/api/session", headers: bearer() });
    expect(session.json().session.projectId).toBe("project_alpha");
  });

  it("rejects empty credentials with a canonical error", async () => {
    const app = buildServer();
    const response = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { email: "", password: "" }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: "auth_invalid",
        message: "Invalid credentials.",
        requestId: expect.stringMatching(/^req_/)
      }
    });
  });

  it("rejects missing, malformed, and unknown bearer tokens", async () => {
    const app = buildServer();

    const missing = await app.inject({ method: "GET", url: "/api/session" });
    expect(missing.statusCode).toBe(401);
    expect(missing.json().error).toMatchObject({ code: "auth_missing" });

    const malformed = await app.inject({
      method: "GET",
      url: "/api/session",
      headers: { authorization: "Token definitely-not-bearer" }
    });
    expect(malformed.statusCode).toBe(401);
    expect(malformed.json().error).toMatchObject({ code: "auth_missing" });

    const unknown = await app.inject({
      method: "GET",
      url: "/api/session",
      headers: bearer("unknown-token")
    });
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json().error).toMatchObject({ code: "auth_invalid" });
  });

  it("returns session and bounded authorized projects for a valid token", async () => {
    const app = buildServer();

    const session = await app.inject({ method: "GET", url: "/api/session", headers: bearer() });
    expect(session.statusCode).toBe(200);
    expect(session.json()).toEqual({
      session: {
        userId: "user_ada",
        projectId: null,
        permissions: []
      },
      requestId: expect.stringMatching(/^req_/)
    });

    const projects = await app.inject({ method: "GET", url: "/api/projects", headers: bearer() });
    expect(projects.statusCode).toBe(200);
    expect(projects.json()).toEqual({
      projects: expect.arrayContaining([
        { id: "project_alpha", name: "Alpha Build", permissions: ["chat:read", "chat:write"] },
        { id: "project_beta", name: "Beta Build", permissions: ["chat:read", "chat:write"] },
        { id: "project_mortar", name: "Mortar", permissions: ["chat:read", "chat:write"] },
        { id: "project_element", name: "Element", permissions: ["chat:read", "chat:write"] },
        { id: "project_demo", name: "Demo Project", permissions: ["chat:read", "chat:write"] }
      ]),
      limit: 50,
      requestId: expect.stringMatching(/^req_/)
    });
  });

  it("selects an authorized project and rejects a forbidden project", async () => {
    const app = buildServer();

    const selected = await app.inject({
      method: "POST",
      url: "/api/projects/project_alpha/select",
      headers: bearer()
    });
    expect(selected.statusCode).toBe(200);
    expect(selected.json()).toEqual({
      session: {
        userId: "user_ada",
        projectId: "project_alpha",
        permissions: ["chat:read", "chat:write"]
      },
      requestId: expect.stringMatching(/^req_/)
    });

    const forbidden = await app.inject({
      method: "POST",
      url: "/api/projects/project_gamma/select",
      headers: bearer()
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().error).toMatchObject({ code: "project_forbidden" });
  });
});
