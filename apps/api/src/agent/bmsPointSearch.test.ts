import { describe, expect, it } from "vitest";
import {
  bmsPointSearchMissHint,
  planBmsPointSearch,
  rankBmsPointCandidates,
  scoreBmsPointCandidate
} from "./bmsPointSearch.js";

describe("planBmsPointSearch", () => {
  it("drops conversational filler and keeps site terms", () => {
    const plan = planBmsPointSearch("What is the Chiller 1 return water temperature right now?");
    expect(plan.terms).toEqual(["chiller", "1", "return", "water", "temperature"]);
    expect(plan.probes).toEqual(["chiller", "return", "water", "temperature"]);
  });

  it("keeps short numeric terms for scoring but never probes with them", () => {
    const plan = planBmsPointSearch("chiller 1 kw");
    expect(plan.terms).toContain("1");
    expect(plan.probes).not.toContain("1");
  });

  it("returns no probes for a single-term query", () => {
    expect(planBmsPointSearch("CHWRT").probes).toEqual([]);
    expect(planBmsPointSearch("the value").probes).toEqual([]);
  });

  it("caps the number of probes", () => {
    const plan = planBmsPointSearch("alpha bravo charlie delta echo foxtrot golf hotel", 3);
    expect(plan.probes).toHaveLength(3);
  });

  it("de-duplicates repeated terms", () => {
    expect(planBmsPointSearch("temperature TEMPERATURE return").terms).toEqual(["temperature", "return"]);
  });
});

describe("scoreBmsPointCandidate", () => {
  it("counts terms found across name and description", () => {
    const item = { name: "WCC-L1-01-CHWRT", description: "WCC-01-CHW Return Temperature" };
    expect(scoreBmsPointCandidate(item, ["return", "temperature", "1"])).toBe(3);
    expect(scoreBmsPointCandidate(item, ["pressure"])).toBe(0);
  });

  it("tolerates rows with missing fields", () => {
    expect(scoreBmsPointCandidate({}, ["return"])).toBe(0);
  });
});

describe("rankBmsPointCandidates", () => {
  const chillerReturn = { name: "WCC-L1-01-CHWRT", description: "WCC-01-CHW Return Temperature" };
  const chillerSupply = { name: "WCC-L1-01-CHWST", description: "WCC-01-CHW Supply Temperature" };
  const pumpPressure = { name: "CHWP-01-PRESS", description: "CHW Pump 01 Pressure" };

  it("orders by how many terms each candidate matches", () => {
    const ranked = rankBmsPointCandidates(
      [pumpPressure, chillerSupply, chillerReturn],
      ["return", "water", "temperature"],
      10
    );
    expect(ranked[0]?.name).toBe("WCC-L1-01-CHWRT");
    expect(ranked[0]?.match_score).toBe(2);
    expect(ranked.map((row) => row.name)).not.toContain("CHWP-01-PRESS");
  });

  it("drops candidates that match nothing", () => {
    expect(rankBmsPointCandidates([pumpPressure], ["return", "temperature"], 10)).toEqual([]);
  });

  it("de-duplicates rows gathered from several probes and honours the limit", () => {
    const ranked = rankBmsPointCandidates(
      [chillerReturn, chillerReturn, chillerSupply],
      ["temperature"],
      1
    );
    expect(ranked).toHaveLength(1);
  });

  it("breaks ties on name so results are stable", () => {
    const ranked = rankBmsPointCandidates([chillerSupply, chillerReturn], ["temperature"], 10);
    expect(ranked.map((row) => row.name)).toEqual(["WCC-L1-01-CHWRT", "WCC-L1-01-CHWST"]);
  });
});

describe("bmsPointSearchMissHint", () => {
  it("reports the terms already tried and points at the catalog summary", () => {
    const hint = bmsPointSearchMissHint("chiller 1 flux capacitor", ["chiller", "flux", "capacitor"]);
    expect(hint).toContain("chiller, flux, capacitor");
    expect(hint).toContain("KB_CATALOG_SUMMARY.md");
  });

  it("explains when there was nothing broader to retry", () => {
    expect(bmsPointSearchMissHint("CHWRT", [])).toContain("single term");
  });
});
