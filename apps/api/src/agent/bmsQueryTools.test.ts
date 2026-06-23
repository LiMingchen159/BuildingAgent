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
    expect(result.hint).toContain("prior successful bms_points_query");
    expect(result.hint).toContain("aliases");
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
});
