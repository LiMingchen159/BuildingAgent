import { describe, expect, it } from "vitest";
import { buildServer } from "./server.js";
import { createSeedStore } from "./seed.js";

const adaToken = "seed-token-ada";
const graceToken = "seed-token-grace";

function bearer(value: string) {
  return { authorization: `Bearer ${value}` };
}

function expectCanonicalError(body: unknown, code: string) {
  expect(body).toEqual({
    error: {
      code,
      message: expect.any(String),
      requestId: expect.stringMatching(/^req_/)
    }
  });
}

function assertNoLiveIntegrationFields(value: unknown) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const forbidden of ["secret", "apikey", "api_key", "bearer", "password", "client_secret", "private_key"]) {
    expect(serialized).not.toContain(forbidden);
  }
}

describe("placeholder registry and management API contracts", () => {
  it("lists bounded synthetic registry data for an authenticated user", async () => {
    const app = buildServer();
    const response = await app.inject({ method: "GET", url: "/api/registry", headers: bearer(adaToken) });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      runtimeProviders: expect.arrayContaining([
        expect.objectContaining({ id: "runtime_provider_local_llm", status: "placeholder" })
      ]),
      tools: expect.arrayContaining([expect.objectContaining({ id: "tool_space_summary", status: "placeholder" })]),
      skills: expect.arrayContaining([expect.objectContaining({ id: "skill_building_triage", status: "placeholder" })]),
      gateways: expect.arrayContaining([expect.objectContaining({ id: "gateway_bms_placeholder", status: "not_configured" })]),
      buildingCapabilities: expect.arrayContaining([expect.objectContaining({ id: "capability_energy_baseline", status: "mock" })]),
      limit: 50,
      placeholderOnly: true,
      requestId: expect.stringMatching(/^req_/)
    });
    expect(response.json().runtimeProviders).toHaveLength(3);
    assertNoLiveIntegrationFields(response.json());
  });

  it("rejects missing, malformed, and unknown auth for registry with canonical envelopes", async () => {
    const app = buildServer();

    const missing = await app.inject({ method: "GET", url: "/api/registry" });
    expect(missing.statusCode).toBe(401);
    expectCanonicalError(missing.json(), "auth_missing");

    const malformed = await app.inject({
      method: "GET",
      url: "/api/registry",
      headers: { authorization: "Token definitely-not-bearer" }
    });
    expect(malformed.statusCode).toBe(401);
    expectCanonicalError(malformed.json(), "auth_invalid");

    const unknown = await app.inject({ method: "GET", url: "/api/registry", headers: bearer("missing-token") });
    expect(unknown.statusCode).toBe(401);
    expectCanonicalError(unknown.json(), "auth_invalid");
  });

  it("requires project membership and matching selected project before management listing", async () => {
    const app = buildServer();

    const notSelected = await app.inject({
      method: "GET",
      url: "/api/projects/project_alpha/management",
      headers: bearer(adaToken)
    });
    expect(notSelected.statusCode).toBe(403);
    expectCanonicalError(notSelected.json(), "project_not_selected");

    await app.inject({ method: "POST", url: "/api/projects/project_beta/select", headers: bearer(adaToken) });
    const wrongSelection = await app.inject({
      method: "GET",
      url: "/api/projects/project_alpha/management",
      headers: bearer(adaToken)
    });
    expect(wrongSelection.statusCode).toBe(403);
    expectCanonicalError(wrongSelection.json(), "project_not_selected");

    const forbidden = await app.inject({
      method: "GET",
      url: "/api/projects/project_gamma/management",
      headers: bearer(adaToken)
    });
    expect(forbidden.statusCode).toBe(403);
    expectCanonicalError(forbidden.json(), "project_forbidden");
  });

  it("lists bounded synthetic management data for the selected authorized project", async () => {
    const app = buildServer();
    await app.inject({ method: "POST", url: "/api/projects/project_alpha/select", headers: bearer(adaToken) });

    const response = await app.inject({
      method: "GET",
      url: "/api/projects/project_alpha/management",
      headers: bearer(adaToken)
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      projectId: "project_alpha",
      gateways: [expect.objectContaining({ id: "gateway_bms_placeholder", status: "not_configured" })],
      capabilities: expect.arrayContaining([
        expect.objectContaining({ id: "capability_energy_baseline", status: "mock" })
      ]),
      tools: expect.arrayContaining([expect.objectContaining({ id: "tool_space_summary", status: "placeholder" })]),
      limit: 50,
      placeholderOnly: true,
      requestId: expect.stringMatching(/^req_/)
    });
    assertNoLiveIntegrationFields(response.json());
  });

  it("enforces read permission for project management listings", async () => {
    const store = createSeedStore();
    store.memberships.push({ userId: "user_ada", projectId: "project_gamma", permissions: [] });
    const app = buildServer({ store });

    await app.inject({ method: "POST", url: "/api/projects/project_gamma/select", headers: bearer(adaToken) });
    const denied = await app.inject({
      method: "GET",
      url: "/api/projects/project_gamma/management",
      headers: bearer(adaToken)
    });

    expect(denied.statusCode).toBe(403);
    expectCanonicalError(denied.json(), "project_forbidden");
  });

  it("bounds registry and management arrays by maxListSize", async () => {
    const store = createSeedStore();
    store.maxListSize = 1;
    const app = buildServer({ store });

    const registry = await app.inject({ method: "GET", url: "/api/registry", headers: bearer(graceToken) });
    expect(registry.statusCode).toBe(200);
    expect(registry.json()).toMatchObject({ limit: 1, placeholderOnly: true });
    expect(registry.json().runtimeProviders).toHaveLength(1);
    expect(registry.json().tools).toHaveLength(1);
    expect(registry.json().skills).toHaveLength(1);
    expect(registry.json().gateways).toHaveLength(1);
    expect(registry.json().buildingCapabilities).toHaveLength(1);

    await app.inject({ method: "POST", url: "/api/projects/project_gamma/select", headers: bearer(graceToken) });
    const management = await app.inject({
      method: "GET",
      url: "/api/projects/project_gamma/management",
      headers: bearer(graceToken)
    });
    expect(management.statusCode).toBe(200);
    expect(management.json()).toMatchObject({ limit: 1, placeholderOnly: true, projectId: "project_gamma" });
    expect(management.json().gateways).toHaveLength(1);
    expect(management.json().capabilities).toHaveLength(1);
    expect(management.json().tools).toHaveLength(1);
  });
});
