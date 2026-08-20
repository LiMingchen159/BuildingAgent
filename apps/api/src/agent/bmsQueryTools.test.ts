import { describe, expect, it, vi } from "vitest";
import { createGenericToolRegistry } from "./genericTools.js";
import { AgentMemoryStore } from "./memory.js";

describe("bms query tools", () => {
  it("bms_points_query calls local collector points API", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ total: 1, items: [{ name: "WCC_3_Chilled_Water_Temp", last_value: "8.6" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchImpl);

    const registry = createGenericToolRegistry(new AgentMemoryStore("/tmp/ba-test-memory"));
    const tool = registry.list().find((candidate) => candidate.name === "bms_points_query");
    expect(tool).toBeDefined();
    const result = await tool!.run({ q: "WCC_3_Chilled_Water_Temp", limit: 1 }, {
      projectId: "project_element",
      userId: "user_test",
      requestId: "req_test",
      conversationId: "conv_test",
      canConfigure: false,
      messages: []
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("127.0.0.1:8765/api/v1/points?q=WCC_3_Chilled_Water_Temp"),
      expect.any(Object)
    );
    expect(result).toMatchObject({ total: 1, items: [{ name: "WCC_3_Chilled_Water_Temp" }] });

    vi.unstubAllGlobals();
  });

  it("bms_points_query returns hint when catalog search has no matches", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ total: 0, items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchImpl);

    const registry = createGenericToolRegistry(new AgentMemoryStore("/tmp/ba-test-memory"));
    const tool = registry.list().find((candidate) => candidate.name === "bms_points_query");
    const result = await tool!.run({ q: "WCC-06 TLKW" }, {
      projectId: "project_element",
      userId: "user_test",
      requestId: "req_test",
      conversationId: "conv_test",
      canConfigure: false,
      messages: []
    });

    vi.unstubAllGlobals();

    expect(result).toMatchObject({ total: 0, items: [] });
    expect(result.hint).toContain("Already retried with these terms");
    expect(result.hint).toContain("aliases");
    expect(result.hint).toContain("KB_CATALOG_SUMMARY.md");
  });

  it("bms_points_query recovers a natural-language phrase by searching its terms", async () => {
    const catalog = [
      { name: "WCC-L1-01-CHWRT", description: "WCC-01-CHW Return Temperature" },
      { name: "WCC-L1-01-CHWST", description: "WCC-01-CHW Supply Temperature" },
      { name: "CHWP-01-PRESS", description: "CHW Pump 01 Pressure" }
    ];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const term = new URL(String(input)).searchParams.get("q")?.toLowerCase() ?? "";
      // Mirror the catalog API: plain substring match over name + description.
      const items = catalog.filter((row) =>
        `${row.name} ${row.description}`.toLowerCase().includes(term));
      return new Response(JSON.stringify({ total: items.length, items }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchImpl);

    const registry = createGenericToolRegistry(new AgentMemoryStore("/tmp/ba-test-memory"));
    const tool = registry.list().find((candidate) => candidate.name === "bms_points_query");
    const result = await tool!.run({ q: "Chiller 1 return water temperature" }, {
      projectId: "project_element",
      userId: "user_test",
      requestId: "req_test",
      conversationId: "conv_test",
      canConfigure: false,
      messages: []
    });

    vi.unstubAllGlobals();

    const names = (result.items as Array<{ name: string }>).map((row) => row.name);
    expect(names[0]).toBe("WCC-L1-01-CHWRT");
    expect(names).not.toContain("CHWP-01-PRESS");
    expect(result.matched_terms).toEqual(["chiller", "1", "return", "water", "temperature"]);
    expect(result.hint).toContain("No exact catalog match");
  });

  it("bms_timeseries_query accepts explicit from/to UTC range", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ total: 2, items: [{ ts: "2026-06-05T20:00:00Z", value_num: 12 }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchImpl);

    const registry = createGenericToolRegistry(new AgentMemoryStore("/tmp/ba-test-memory"));
    const tool = registry.list().find((candidate) => candidate.name === "bms_timeseries_query");
    expect(tool).toBeDefined();

    const result = await tool!.run(
      {
        name: "WCC_6_SUWT",
        from: "2026-06-05T16:00:00.000Z",
        to: "2026-06-06T15:59:59.999Z"
      },
      {
        projectId: "project_element",
        userId: "user_test",
        requestId: "req_test",
        conversationId: "conv_test",
        canConfigure: false,
        messages: []
      }
    );

    vi.unstubAllGlobals();

    expect(fetchImpl).toHaveBeenCalledOnce();
    const calledUrl = (fetchImpl.mock.calls as unknown as Array<[string]>)[0]![0];
    expect(calledUrl).toContain("from=2026-06-05T16%3A00%3A00.000Z");
    expect(calledUrl).toContain("to=2026-06-06T15%3A59%3A59.999Z");
    expect(calledUrl).toContain("name=WCC_6_SUWT");
    expect(result).toMatchObject({ total: 2 });
  });

  it("bms_timeseries_query falls back to readings when unified timeseries has no alias", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/api/v1/timeseries?")) {
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(JSON.stringify({
        total: 2,
        items: [
          { ts: "2026-06-24T11:21:43+00:00", value_num: 9.45, name: "WCC-L1-02-CHWST" },
          { ts: "2026-06-24T11:00:00+00:00", value_num: 9.5, name: "WCC-L1-02-CHWST" }
        ]
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchImpl);

    const registry = createGenericToolRegistry(new AgentMemoryStore("/tmp/ba-test-memory"));
    const tool = registry.list().find((candidate) => candidate.name === "bms_timeseries_query");
    const result = await tool!.run(
      {
        name: "WCC-L1-02-CHWST",
        from: "2026-06-24T10:00:00.000Z",
        to: "2026-06-24T12:00:00.000Z",
        order: "asc"
      },
      {
        projectId: "project_element",
        userId: "user_test",
        requestId: "req_test",
        conversationId: "conv_test",
        canConfigure: false,
        messages: []
      }
    );

    vi.unstubAllGlobals();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const fallbackUrl = (fetchImpl.mock.calls as unknown as Array<[string]>)[1]![0];
    expect(fallbackUrl).toContain("/api/v1/readings?");
    expect(fallbackUrl).toContain("source=poll");
    expect(result).toMatchObject({
      total: 2,
      items: [
        expect.objectContaining({ ts: "2026-06-24T11:00:00+00:00" }),
        expect.objectContaining({ ts: "2026-06-24T11:21:43+00:00" })
      ]
    });
  });
});
