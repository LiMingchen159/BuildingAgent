import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildServer, fddPersistenceWindowGraceMs } from "./server.js";
import { createSeedStore } from "./seed.js";
import { DerivedMetricStore } from "./derivedMetrics.js";
import type { ChatProvider } from "./providers.js";

const adaToken = "seed-token-ada";
const buildingGptToken = "seed-token-buildinggpt";

function bearer(value: string) {
  return { authorization: `Bearer ${value}` };
}

function isolatedDataEnv(): { BUILDING_AGENT_DATA_DIR: string } {
  return { BUILDING_AGENT_DATA_DIR: mkdtempSync(path.join(tmpdir(), "ba-dashboard-derived-")) };
}

function dashboardPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: "Chiller temperature watch",
    description: "Supply and return temperatures across active chillers.",
    visibility: "private",
    layoutVersion: 2,
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
      { widgetId: "live_supply_return", x: 0, y: 0, w: 3, h: 2 },
      { widgetId: "trend_supply_return", x: 3, y: 0, w: 6, h: 4 }
    ],
    ...overrides
  };
}

describe("dashboard project APIs", () => {
  it("allows a small cadence grace for FDD persistence windows", () => {
    expect(fddPersistenceWindowGraceMs(5)).toBe(60_000);
    expect(fddPersistenceWindowGraceMs(30)).toBe(120_000);
    expect(28.97 * 60_000).toBeGreaterThanOrEqual(30 * 60_000 - fddPersistenceWindowGraceMs(30));
  });

  it("requires an overall summary in generated FDD attribution text", async () => {
    const calls: Parameters<ChatProvider["complete"]>[0][] = [];
    const provider: ChatProvider = {
      metadata: { id: "fdd-test-provider", mode: "real", model: "fake-model", status: "configured" },
      async complete(request) {
        calls.push(request);
        return {
          text: calls.length === 1
            ? [
                "**Likely cause:** WCC-4 has a stuck CHW flow input.",
                "**Equipment:** WCC-4",
                "**Problem input:** WCC-L1-04-CHWFWR (Chilled Water Flow Rate)",
                "**Data evidence:** CHW flow is zero while the chiller is running and the FDD output is faulted.",
                "**Data-based next check:** Check WCC-L1-04-CHWFWR on WCC-4."
              ].join("\n\n")
            : [
                "**Overall summary:** Over the last 7 days, 1 of 8 analyzed chillers showed fault samples; 788/9604 valid FDD output samples were faults (8.2%). The strongest evidence is on WCC-4.",
                "**Likely cause:** WCC-4 has a stuck CHW flow input.",
                "**Equipment:** WCC-4",
                "**Problem input:** WCC-L1-04-CHWFWR (Chilled Water Flow Rate)",
                "**Data evidence:** CHW flow is zero while the chiller is running and the FDD output is faulted.",
                "**Data-based next check:** Check WCC-L1-04-CHWFWR on WCC-4."
              ].join("\n\n"),
          provider: provider.metadata,
          fallbackUsed: false
        };
      }
    };
    const app = buildServer({
      store: createSeedStore(),
      chatProvider: provider,
      env: { ...isolatedDataEnv(), DERIVED_METRIC_MATERIALIZER_DISABLED: "1" }
    });
    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer(adaToken) });

    const response = await app.inject({
      method: "POST",
      url: "/api/projects/project_element/fdd-attribution-analysis",
      headers: bearer(adaToken),
      payload: {
        summary: {
          outputSummary: {
            faultyEquipmentCount: 1,
            validOutputSamples: 9604,
            faultOutputSamples: 788,
            overallFaultRate: 0.082,
            boundInputCount: 32
          },
          faultEntities: [{ equipment: "WCC-4", outputFaultSamples: 788 }]
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, content: expect.stringContaining("**Overall summary:**") });
    expect(calls).toHaveLength(2);
  });

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
        layoutVersion: 2,
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

    const tooTall = await app.inject({
      method: "POST",
      url: "/api/projects/project_element/dashboards",
      headers: bearer(adaToken),
      payload: dashboardPayload({
        layout: [
          { widgetId: "live_supply_return", x: 0, y: 0, w: 1, h: 2 },
          { widgetId: "trend_supply_return", x: 1, y: 0, w: 2, h: 49 }
        ]
      })
    });

    expect(tooTall.statusCode).toBe(422);
    expect(tooTall.json().error).toMatchObject({
      code: "dashboard_invalid",
      message: expect.stringContaining("layout")
    });
  });

  it("accepts valid dashboard sections and rejects invalid section references", async () => {
    const app = buildServer({ store: createSeedStore() });

    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer(adaToken) });

    const valid = await app.inject({
      method: "POST",
      url: "/api/projects/project_element/dashboards",
      headers: bearer(adaToken),
      payload: dashboardPayload({
        sections: [
          { id: "overview", title: "Overview", kind: "overview", widgetIds: ["live_supply_return"] },
          { id: "trends", title: "Trends", kind: "trends", widgetIds: ["trend_supply_return"] }
        ]
      })
    });
    expect(valid.statusCode).toBe(201);
    expect(valid.json().dashboard.sections).toEqual([
      expect.objectContaining({ id: "overview", widgetIds: ["live_supply_return"] }),
      expect.objectContaining({ id: "trends", widgetIds: ["trend_supply_return"] })
    ]);

    const duplicateWidget = await app.inject({
      method: "POST",
      url: "/api/projects/project_element/dashboards",
      headers: bearer(adaToken),
      payload: dashboardPayload({
        sections: [
          { id: "overview", title: "Overview", kind: "overview", widgetIds: ["live_supply_return", "trend_supply_return"] },
          { id: "trends", title: "Trends", kind: "trends", widgetIds: ["trend_supply_return"] }
        ]
      })
    });
    expect(duplicateWidget.statusCode).toBe(422);
    expect(duplicateWidget.json().error).toMatchObject({
      code: "dashboard_invalid",
      message: expect.stringContaining("multiple sections")
    });

    const unknownWidget = await app.inject({
      method: "POST",
      url: "/api/projects/project_element/dashboards",
      headers: bearer(adaToken),
      payload: dashboardPayload({
        sections: [
          { id: "overview", title: "Overview", kind: "overview", widgetIds: ["live_supply_return"] },
          { id: "trends", title: "Trends", kind: "trends", widgetIds: ["missing_widget"] }
        ]
      })
    });
    expect(unknownWidget.statusCode).toBe(422);
    expect(unknownWidget.json().error).toMatchObject({
      code: "dashboard_invalid",
      message: expect.stringContaining("unknown widget")
    });

    const duplicateSection = await app.inject({
      method: "POST",
      url: "/api/projects/project_element/dashboards",
      headers: bearer(adaToken),
      payload: dashboardPayload({
        sections: [
          { id: "overview", title: "Overview", kind: "overview", widgetIds: ["live_supply_return"] },
          { id: "overview", title: "Overview copy", kind: "overview", widgetIds: ["trend_supply_return"] }
        ]
      })
    });
    expect(duplicateSection.statusCode).toBe(422);
    expect(duplicateSection.json().error).toMatchObject({
      code: "dashboard_invalid",
      message: expect.stringContaining("unique")
    });
  });

  it("accepts current-value and bar-comparison dashboard widgets", async () => {
    const app = buildServer({ store: createSeedStore() });

    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer(adaToken) });

    const created = await app.inject({
      method: "POST",
      url: "/api/projects/project_element/dashboards",
      headers: bearer(adaToken),
      payload: dashboardPayload({
        widgets: [
          {
            id: "plant_cop_stat",
            kind: "stat_value",
            title: "Plant COP",
            pointBindings: [{ pointName: "WCC-L1-04_COP", label: "COP", unit: "" }]
          },
          {
            id: "chiller_load_compare",
            kind: "bar_comparison",
            title: "Chiller load comparison",
            pointBindings: [
              { pointName: "WCC-L1-04_TLKW", label: "WCC-04", unit: "kW" },
              { pointName: "WCC-L1-05_TLKW", label: "WCC-05", unit: "kW" }
            ]
          }
        ],
        layout: [
          { widgetId: "plant_cop_stat", x: 0, y: 0, w: 1, h: 1 },
          { widgetId: "chiller_load_compare", x: 1, y: 0, w: 2, h: 1 }
        ]
      })
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().dashboard.widgets).toEqual([
      expect.objectContaining({ kind: "stat_value", id: "plant_cop_stat" }),
      expect.objectContaining({ kind: "bar_comparison", id: "chiller_load_compare" })
    ]);
  });

  it("preserves generic binding metadata for raw and derived analytics", async () => {
    const app = buildServer({ store: createSeedStore() });

    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer(adaToken) });

    const created = await app.inject({
      method: "POST",
      url: "/api/projects/project_element/dashboards",
      headers: bearer(adaToken),
      payload: dashboardPayload({
        widgets: [
          {
            id: "analytics_trend",
            kind: "timeseries_chart",
            title: "Derived analytics trend",
            pointBindings: [
              {
                source: "derived_metric",
                metricInstanceId: "minst_system_cop_04",
                metricKey: "system_cop",
                entityId: "WCC_04",
                groupId: "WCC_04",
                label: "System COP",
                role: "output",
                dependencyRole: "output",
                defaultVisible: true,
                unit: "ratio"
              },
              {
                source: "bms",
                bmsSourceId: "src_element_001",
                pointName: "WCC-L1-04_Q",
                entityId: "WCC_04",
                groupId: "WCC_04",
                label: "Cooling load",
                role: "cooling_load_kw",
                dependencyRole: "input",
                defaultVisible: false,
                unit: "kW"
              }
            ]
          }
        ],
        layout: [{ widgetId: "analytics_trend", x: 0, y: 0, w: 6, h: 4 }]
      })
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().dashboard.widgets[0].pointBindings).toEqual([
      expect.objectContaining({
        source: "derived_metric",
        entityId: "WCC_04",
        groupId: "WCC_04",
        role: "output",
        dependencyRole: "output",
        defaultVisible: true
      }),
      expect.objectContaining({
        source: "bms",
        bmsSourceId: "src_element_001",
        pointName: "WCC-L1-04_Q",
        entityId: "WCC_04",
        groupId: "WCC_04",
        role: "cooling_load_kw",
        dependencyRole: "input",
        defaultVisible: false
      })
    ]);
  });

  it("accepts derived metric bindings and serves derived latest/history batches", async () => {
    const env = isolatedDataEnv();
    const metrics = new DerivedMetricStore(env.BUILDING_AGENT_DATA_DIR);
    const metric = metrics.registerMetric({
      projectId: "project_element",
      metricKey: "system_cop",
      entityId: "WCC_04",
      displayName: "WCC-04 System COP",
      formula: "cooling_load_kw / power_kw",
      dependencies: [
        { role: "cooling_load_kw", sourceId: "WCC-L1-04_Q" },
        { role: "power_kw", sourceId: "WCC-L1-04_P" }
      ]
    });
    metrics.recordSample({
      instanceId: metric.instance.instanceId,
      ts: "2026-06-26T01:00:00.000Z",
      valueNum: 4.6
    });
    metrics.recordSample({
      instanceId: metric.instance.instanceId,
      ts: "2026-06-26T01:15:00.000Z",
      valueNum: 4.8
    });

    const app = buildServer({ store: createSeedStore(), env });
    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer(adaToken) });

    const created = await app.inject({
      method: "POST",
      url: "/api/projects/project_element/dashboards",
      headers: bearer(adaToken),
      payload: dashboardPayload({
        title: "COP comparison",
        widgets: [
          {
            id: "system_cop_stat",
            kind: "stat_value",
            title: "System COP",
            pointBindings: [{
              source: "derived_metric",
              metricInstanceId: metric.instance.instanceId,
              label: "System COP",
              unit: ""
            }]
          },
          {
            id: "system_cop_trend",
            kind: "timeseries_chart",
            title: "System COP Trend",
            pointBindings: [{
              source: "derived_metric",
              metricKey: "system_cop",
              entityId: "WCC_04",
              label: "System COP",
              unit: ""
            }]
          }
        ],
        layout: [
          { widgetId: "system_cop_stat", x: 0, y: 0, w: 2, h: 2 },
          { widgetId: "system_cop_trend", x: 2, y: 0, w: 6, h: 4 }
        ]
      })
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().dashboard.widgets[0].pointBindings[0]).toMatchObject({
      source: "derived_metric",
      metricInstanceId: metric.instance.instanceId,
      label: "System COP"
    });

    const latest = await app.inject({
      method: "POST",
      url: "/api/bms/dashboard/latest-batch",
      headers: bearer(adaToken),
      payload: {
        queries: [{
          key: "cop-latest",
          source: "derived_metric",
          metric_instance_id: metric.instance.instanceId
        }]
      }
    });
    expect(latest.statusCode).toBe(200);
    expect(latest.json().results).toEqual([
      expect.objectContaining({
        key: "cop-latest",
        ok: true,
        point: expect.objectContaining({
          name: `derived:${metric.instance.instanceId}`,
          last_value: "4.8",
          last_polled_at: "2026-06-26T01:15:00.000Z"
        })
      })
    ]);

    const history = await app.inject({
      method: "POST",
      url: "/api/bms/dashboard/history-batch",
      headers: bearer(adaToken),
      payload: {
        queries: [{
          key: "cop-history",
          source: "derived_metric",
          metric_key: "system_cop",
          entity_id: "WCC_04",
          from: "2026-06-26T00:00:00.000Z",
          to: "2026-06-26T02:00:00.000Z"
        }]
      }
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().results[0]).toMatchObject({
      key: "cop-history",
      ok: true,
      total: 2,
      items: [
        expect.objectContaining({ value_num: 4.6, object_ref: metric.instance.instanceId }),
        expect.objectContaining({ value_num: 4.8, object_ref: metric.instance.instanceId })
      ]
    });
  });

  it("lists derived KPI/FDD assets with linked dashboards and toggles materialization", async () => {
    const env = { ...isolatedDataEnv(), DERIVED_METRIC_MATERIALIZER_DISABLED: "1" };
    const metrics = new DerivedMetricStore(env.BUILDING_AGENT_DATA_DIR);
    const metric = metrics.registerMetric({
      projectId: "project_element",
      metricKey: "system_cop",
      entityId: "WCC_06",
      displayName: "WCC-06 System COP",
      formula: "cooling_load_kw / power_kw",
      dependencies: [
        { role: "cooling_load_kw", sourceId: "WCC-L1-06_Q" },
        { role: "power_kw", sourceId: "WCC-L1-06_TLKW" }
      ]
    });
    metrics.configureMaterialization({
      instanceId: metric.instance.instanceId,
      enabled: true,
      formulaKind: "ratio",
      leftRole: "cooling_load_kw",
      rightRole: "power_kw",
      invalidValuePolicy: "null"
    });

    const app = buildServer({ store: createSeedStore(), env });
    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer(adaToken) });

    const created = await app.inject({
      method: "POST",
      url: "/api/projects/project_element/dashboards",
      headers: bearer(adaToken),
      payload: dashboardPayload({
        title: "WCC-06 COP",
        widgets: [{
          id: "wcc_06_system_cop",
          kind: "stat_value",
          title: "WCC-06 System COP",
          pointBindings: [{
            source: "derived_metric",
            metricInstanceId: metric.instance.instanceId,
            label: "System COP"
          }]
        }],
        layout: [{ widgetId: "wcc_06_system_cop", x: 0, y: 0, w: 2, h: 2 }]
      })
    });
    expect(created.statusCode).toBe(201);

    const listed = await app.inject({
      method: "GET",
      url: "/api/projects/project_element/derived-metrics",
      headers: bearer(adaToken)
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject({
      projectId: "project_element",
      totalCount: 1,
      metrics: [
        expect.objectContaining({
          instance: expect.objectContaining({ instanceId: metric.instance.instanceId, displayName: "WCC-06 System COP" }),
          materialization: expect.objectContaining({ enabled: true, formulaKind: "ratio" }),
          linkedDashboards: [expect.objectContaining({ id: created.json().dashboard.id, title: "WCC-06 COP" })]
        })
      ]
    });

    const toggled = await app.inject({
      method: "PATCH",
      url: `/api/projects/project_element/derived-metrics/${metric.instance.instanceId}/materialization`,
      headers: bearer(adaToken),
      payload: { enabled: false }
    });
    expect(toggled.statusCode).toBe(200);
    expect(toggled.json().metric.materialization).toMatchObject({
      enabled: false,
      status: "paused"
    });
  });

  it("migrates persisted FDD comparison dashboards into 7-day fault-cause analysis on boot", async () => {
    const env = { ...isolatedDataEnv(), DERIVED_METRIC_MATERIALIZER_DISABLED: "1" };
    const metrics = new DerivedMetricStore(env.BUILDING_AGENT_DATA_DIR);
    const metric = metrics.registerMetric({
      projectId: "project_element",
      metricKey: "chiller_low_cop_detection",
      entityId: "WCC_04",
      displayName: "WCC-04 Low COP Detection",
      unit: "boolean",
      formula: "FDD low COP rule",
      formulaDescription: "COP below threshold for configured persistence window.",
      dependencies: [
        { role: "chiller_status", sourceType: "raw_point", sourceId: "WCC_4_Run_Status", pointName: "WCC_4_Run_Status", label: "Chiller status" },
        { role: "chw_supply_temp", sourceType: "raw_point", sourceId: "WCC-L1-04_CHWST", pointName: "WCC-L1-04_CHWST", label: "CHW supply temp" }
      ],
      metadata: {
        fddParameters: [
          { key: "window_minutes", value: 30, source: "test" },
          { key: "cop_threshold", value: 4, source: "test" }
        ]
      }
    });
    const store = createSeedStore();
    store.dashboardsByProject.project_element = [{
      id: "dash_legacy_fdd",
      projectId: "project_element",
      ownerUserId: "user_ada",
      visibility: "project",
      title: "Legacy FDD dashboard",
      layoutVersion: 2,
      layout: [
        { widgetId: "status_wcc04", x: 0, y: 0, w: 1, h: 1 },
        { widgetId: "fdd_fault_status_comparison", x: 0, y: 1, w: 6, h: 4 },
        { widgetId: "trend_wcc04", x: 0, y: 5, w: 6, h: 4 },
        { widgetId: "note_logic", x: 0, y: 9, w: 3, h: 2 }
      ],
      widgets: [{
        id: "fdd_fault_status_comparison",
        kind: "fdd_fault_rate_comparison",
        title: "Fault Rate Comparison",
        content: "**Likely cause:** WCC-4 CHW flow is stuck at 0 in the aligned FDD samples.",
        pointBindings: [{ source: "derived_metric", metricInstanceId: metric.instance.instanceId, label: "Fault status" }]
      }, {
        id: "status_wcc04",
        kind: "status_grid",
        title: "WCC-04",
        pointBindings: [{ source: "derived_metric", metricInstanceId: metric.instance.instanceId, label: "Fault status" }]
      }, {
        id: "trend_wcc04",
        kind: "timeseries_chart",
        title: "WCC-04 Trend",
        pointBindings: [{ source: "derived_metric", metricInstanceId: metric.instance.instanceId, label: "Fault status" }]
      }, {
        id: "note_logic",
        kind: "note",
        title: "Detection Logic",
        content: "Low COP while running.",
        pointBindings: []
      }],
      sections: [
        { id: "overview", title: "Overview", kind: "overview", widgetIds: ["status_wcc04"] },
        { id: "trends", title: "Trends", kind: "trends", widgetIds: ["trend_wcc04"] },
        { id: "attribution", title: "Attribution", kind: "analysis", widgetIds: ["fdd_fault_status_comparison", "note_logic"] }
      ],
      createdAt: "2026-06-27T00:00:00.000Z",
      updatedAt: "2026-06-27T00:00:00.000Z"
    } as any];

    const app = buildServer({ store, env });
    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer(adaToken) });

    const fetched = await app.inject({
      method: "GET",
      url: "/api/projects/project_element/dashboards/dash_legacy_fdd",
      headers: bearer(adaToken)
    });

	    expect(fetched.statusCode).toBe(200);
	    const dashboard = fetched.json().dashboard;
	    expect(dashboard.layout).toEqual(expect.arrayContaining([{ widgetId: "fdd_fault_status_comparison", x: 0, y: 1, w: 6, h: 4 }]));
	    expect(dashboard.widgets[0]).toMatchObject({
	      kind: "fdd_attribution_analysis",
	      title: "Fault Cause Analysis",
	      defaultTimeRange: "7d",
	      content: "**Likely cause:** WCC-4 CHW flow is stuck at 0 in the aligned FDD samples."
	    });
	    expect(dashboard.widgets[0].pointBindings).toEqual(expect.arrayContaining([
	      expect.objectContaining({
	        source: "derived_metric",
	        metricInstanceId: metric.instance.instanceId,
	        dependencyRole: "output",
	        defaultVisible: true,
	        description: "COP below threshold for configured persistence window.",
	        fddParameters: expect.arrayContaining([expect.objectContaining({ key: "window_minutes", value: 30 })])
	      }),
	      expect.objectContaining({ source: "bms", pointName: "WCC_4_Run_Status", role: "chiller_status", dependencyRole: "input", defaultVisible: false }),
	      expect.objectContaining({ source: "bms", pointName: "WCC-L1-04_CHWST", role: "chw_supply_temp", dependencyRole: "input", defaultVisible: false, description: "Chilled Water Supply Temperature" })
	    ]));
	    expect(dashboard.sections.map((section: { id: string }) => section.id)).toEqual(["overview", "analysis", "trends", "notes"]);
	    expect(dashboard.sections).toEqual(expect.arrayContaining([
	      expect.objectContaining({ id: "analysis", title: "Fault Cause Analysis", kind: "analysis", widgetIds: ["fdd_fault_status_comparison"] }),
	      expect.objectContaining({ id: "trends", title: "Chiller Trends", kind: "trends", collapsed: true }),
	      expect.objectContaining({ id: "notes", title: "Notes", kind: "custom", widgetIds: ["note_logic"] })
	    ]));
	  });

  it("accepts note dashboard widgets without point bindings", async () => {
    const app = buildServer({ store: createSeedStore() });

    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer(adaToken) });

    const created = await app.inject({
      method: "POST",
      url: "/api/projects/project_element/dashboards",
      headers: bearer(adaToken),
      payload: dashboardPayload({
        widgets: [
          {
            id: "operator_note",
            kind: "note",
            title: "Operator note",
            content: "Check valve position after morning startup.",
            tone: "yellow",
            pointBindings: []
          }
        ],
        layout: [
          { widgetId: "operator_note", x: 0, y: 0, w: 3, h: 2 }
        ],
        sections: [
          { id: "notes", title: "Notes", kind: "custom", widgetIds: ["operator_note"] }
        ]
      })
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().dashboard).toEqual(expect.objectContaining({
      widgets: [
        expect.objectContaining({
          id: "operator_note",
          kind: "note",
          content: "Check valve position after morning startup.",
          pointBindings: []
        })
      ],
      sections: [
        expect.objectContaining({ id: "notes", widgetIds: ["operator_note"] })
      ]
    }));
  });

  it("accepts taller dashboard widgets for resizable chart panels", async () => {
    const app = buildServer({ store: createSeedStore() });

    await app.inject({ method: "POST", url: "/api/projects/project_element/select", headers: bearer(adaToken) });

    const created = await app.inject({
      method: "POST",
      url: "/api/projects/project_element/dashboards",
      headers: bearer(adaToken),
      payload: dashboardPayload({
        layout: [
          { widgetId: "live_supply_return", x: 0, y: 0, w: 1, h: 2 },
          { widgetId: "trend_supply_return", x: 1, y: 0, w: 2, h: 4 }
        ]
      })
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().dashboard.layout).toEqual([
      expect.objectContaining({ widgetId: "live_supply_return", h: 2 }),
      expect.objectContaining({ widgetId: "trend_supply_return", h: 4 })
    ]);

    const dashboardId = created.json().dashboard.id as string;
    const updated = await app.inject({
      method: "PATCH",
      url: `/api/projects/project_element/dashboards/${dashboardId}`,
      headers: bearer(adaToken),
      payload: dashboardPayload({
        layout: [
          { widgetId: "live_supply_return", x: 0, y: 0, w: 1, h: 2 },
          { widgetId: "trend_supply_return", x: 1, y: 0, w: 3, h: 6 }
        ]
      })
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json().dashboard.layout).toEqual([
      expect.objectContaining({ widgetId: "live_supply_return", h: 2 }),
      expect.objectContaining({ widgetId: "trend_supply_return", w: 3, h: 6 })
    ]);
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
