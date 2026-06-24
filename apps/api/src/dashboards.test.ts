import { describe, expect, it } from "vitest";
import { buildServer } from "./server.js";
import { createSeedStore } from "./seed.js";

const adaToken = "seed-token-ada";
const buildingGptToken = "seed-token-buildinggpt";

function bearer(value: string) {
  return { authorization: `Bearer ${value}` };
}

function dashboardPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: "Chiller temperature watch",
    description: "Supply and return temperatures across active chillers.",
    visibility: "private",
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
    layout: [
      { widgetId: "live_supply_return", x: 0, y: 0, w: 1, h: 1 },
      { widgetId: "trend_supply_return", x: 1, y: 0, w: 2, h: 1 }
    ],
    ...overrides
  };
}

describe("dashboard project APIs", () => {
  it("creates, lists, and retrieves a private dashboard for its owner", async () => {
    const app = buildServer({ store: createSeedStore() });

    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer(adaToken) });

    const created = await app.inject({
      method: "POST",
      url: "/api/projects/project_element/dashboards",
      headers: bearer(adaToken),
      payload: dashboardPayload()
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      projectId: "project_element",
      path: expect.stringMatching(/^\/projects\/project_element\/dashboards\/dash_/),
      dashboard: expect.objectContaining({
        title: "Chiller temperature watch",
        visibility: "private",
        widgets: expect.arrayContaining([
          expect.objectContaining({ kind: "live_value_grid" }),
          expect.objectContaining({ kind: "timeseries_chart" })
        ])
      })
    });

    const dashboardId = created.json().dashboard.id as string;

    const listed = await app.inject({
      method: "GET",
      url: "/api/projects/project_element/dashboards",
      headers: bearer(adaToken)
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject({
      projectId: "project_element",
      totalCount: 1,
      dashboards: [expect.objectContaining({ id: dashboardId, visibility: "private" })]
    });

    const fetched = await app.inject({
      method: "GET",
      url: `/api/projects/project_element/dashboards/${dashboardId}`,
      headers: bearer(adaToken)
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json()).toMatchObject({
      dashboard: expect.objectContaining({ id: dashboardId, title: "Chiller temperature watch" })
    });
  });

  it("keeps private dashboards hidden until the owner shares them to the project", async () => {
    const app = buildServer({ store: createSeedStore() });

    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer(adaToken) });
    const created = await app.inject({
      method: "POST",
      url: "/api/projects/project_element/dashboards",
      headers: bearer(adaToken),
      payload: dashboardPayload()
    });
    const dashboardId = created.json().dashboard.id as string;

    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer(buildingGptToken) });

    const hiddenList = await app.inject({
      method: "GET",
      url: "/api/projects/project_element/dashboards",
      headers: bearer(buildingGptToken)
    });
    expect(hiddenList.statusCode).toBe(200);
    expect(hiddenList.json().dashboards).toEqual([]);

    const hiddenGet = await app.inject({
      method: "GET",
      url: `/api/projects/project_element/dashboards/${dashboardId}`,
      headers: bearer(buildingGptToken)
    });
    expect(hiddenGet.statusCode).toBe(404);
    expect(hiddenGet.json().error).toMatchObject({ code: "dashboard_not_found" });

    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer(adaToken) });
    const shared = await app.inject({
      method: "PATCH",
      url: `/api/projects/project_element/dashboards/${dashboardId}`,
      headers: bearer(adaToken),
      payload: dashboardPayload({ visibility: "project" })
    });
    expect(shared.statusCode).toBe(200);
    expect(shared.json().dashboard.visibility).toBe("project");

    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer(buildingGptToken) });
    const visibleList = await app.inject({
      method: "GET",
      url: "/api/projects/project_element/dashboards",
      headers: bearer(buildingGptToken)
    });
    expect(visibleList.statusCode).toBe(200);
    expect(visibleList.json()).toMatchObject({
      totalCount: 1,
      dashboards: [expect.objectContaining({ id: dashboardId, visibility: "project" })]
    });

    const managed = await app.inject({
      method: "PATCH",
      url: `/api/projects/project_element/dashboards/${dashboardId}`,
      headers: bearer(buildingGptToken),
      payload: dashboardPayload({ visibility: "project", title: "Shared plant overview" })
    });
    expect(managed.statusCode).toBe(200);
    expect(managed.json().dashboard).toMatchObject({
      id: dashboardId,
      title: "Shared plant overview",
      visibility: "project"
    });
  });

  it("rejects invalid dashboard payloads", async () => {
    const app = buildServer({ store: createSeedStore() });

    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer(adaToken) });

    const invalid = await app.inject({
      method: "POST",
      url: "/api/projects/project_element/dashboards",
      headers: bearer(adaToken),
      payload: dashboardPayload({
        widgets: [{
          id: "broken_widget",
          kind: "html_embed",
          title: "Broken widget",
          pointBindings: [{ pointName: "CH-01_Supply_Water_Temp" }]
        }]
      })
    });

    expect(invalid.statusCode).toBe(422);
    expect(invalid.json().error).toMatchObject({
      code: "dashboard_invalid",
      message: expect.stringContaining("widgets")
    });
  });

  it("backfills dashboard storage for persisted stores created before dashboards existed", async () => {
    const baseStore = createSeedStore();
    const { dashboardsByProject: _unusedDashboards, ...legacyStore } = baseStore as ReturnType<typeof createSeedStore> & {
      dashboardsByProject?: unknown;
    };
    const app = buildServer({ store: legacyStore as ReturnType<typeof createSeedStore> });

    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer(adaToken) });

    const listed = await app.inject({
      method: "GET",
      url: "/api/projects/project_element/dashboards",
      headers: bearer(adaToken)
    });

    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject({
      projectId: "project_element",
      totalCount: 0,
      dashboards: []
    });
  });

  it("continues dashboard ids after persisted records when the API restarts", async () => {
    const store = createSeedStore();
    store.dashboardsByProject.project_element = [{
      id: "dash_000009",
      projectId: "project_element",
      ownerUserId: "user_ada",
      visibility: "private",
      title: "Existing dashboard",
      description: "Persisted before restart.",
      layout: dashboardPayload().layout as never,
      widgets: dashboardPayload().widgets as never,
      createdAt: "2026-06-24T00:00:00.000Z",
      updatedAt: "2026-06-24T00:00:00.000Z"
    }];
    const app = buildServer({ store });

    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer(adaToken) });
    const created = await app.inject({
      method: "POST",
      url: "/api/projects/project_element/dashboards",
      headers: bearer(adaToken),
      payload: dashboardPayload({ title: "Next dashboard" })
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().dashboard.id).toBe("dash_000010");
  });
});
