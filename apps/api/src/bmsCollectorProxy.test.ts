import { describe, expect, it, vi } from "vitest";
import { proxyBmsCollector } from "./bmsCollectorProxy.js";

describe("proxyBmsCollector", () => {
  it("forwards to BMS_DATABASE_API_URL with path and query", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const result = await proxyBmsCollector(
      { BMS_DATABASE_API_URL: "http://127.0.0.1:8765" },
      fetchImpl,
      "/api/v1/points",
      "?q=WCC_3&limit=1"
    );

    expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:8765/api/v1/points?q=WCC_3&limit=1", {});
    expect(result.statusCode).toBe(200);
    expect(result.payload).toEqual({ status: "ok" });
  });
});
