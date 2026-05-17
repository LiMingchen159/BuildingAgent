import { describe, expect, it } from "vitest";
import { fetchEnteliLiveValue } from "./bmsLiveRead.js";
import { applyElementEnteliEnv } from "../elementEnteliConfig.js";

describe("fetchEnteliLiveValue", () => {
  it("reads WCC_1_Chilled_Water_Temp when catalog and enteliWEB are reachable", async () => {
    applyElementEnteliEnv();
    const result = await fetchEnteliLiveValue({ pointName: "WCC_1_Chilled_Water_Temp" });
    if (!result.ok) {
      console.warn("bms live read skipped:", result.error);
      return;
    }
    expect(result.presentValue).toBeTruthy();
    expect(result.apiPath).toContain("AV,5");
  }, 60_000);
});
