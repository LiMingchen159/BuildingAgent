import { describe, expect, it } from "vitest";
import {
  resolveRelativeRange,
  shouldInjectTemporalHint,
  temporalQueryHintBlock,
  wallClockContextBlock
} from "./temporalContext.js";

describe("temporalContext", () => {
  const hktZone = "Asia/Hong_Kong";
  const june7 = new Date("2026-06-07T10:00:00.000Z");

  it("wallClockContextBlock includes authoritative current time and calendar ranges", () => {
    const block = wallClockContextBlock(june7, hktZone);
    expect(block).toContain("CURRENT TIME");
    expect(block).toContain("Conversation date:");
    expect(block).toContain(hktZone);
    expect(block).toContain("2026-06-07T10:00:00.000Z");
    expect(block).toContain("CALENDAR RANGES");
    expect(block).toContain("Yesterday (2026-06-06 Asia/Hong_Kong): from=2026-06-05T16:00:00.000Z to=2026-06-06T15:59:59.999Z");
    expect(block).toContain("never to BMS backfill");
  });

  it("resolveRelativeRange yesterday uses HKT calendar boundaries", () => {
    const resolved = resolveRelativeRange("yesterday", hktZone, june7);
    expect(resolved.label).toBe("yesterday");
    expect(resolved.calendarDate).toBe("2026-06-06");
    expect(resolved.from).toBe("2026-06-05T16:00:00.000Z");
    expect(resolved.to).toBe("2026-06-06T15:59:59.999Z");
  });

  it("resolveRelativeRange today starts at HKT midnight", () => {
    const resolved = resolveRelativeRange("today", hktZone, june7);
    expect(resolved.label).toBe("today");
    expect(resolved.calendarDate).toBe("2026-06-07");
    expect(resolved.from).toBe("2026-06-06T16:00:00.000Z");
    expect(resolved.to).toBe(june7.toISOString());
  });

  it("shouldInjectTemporalHint detects relative time words", () => {
    expect(shouldInjectTemporalHint("show yesterday's WCC-06 data")).toBe(true);
    expect(shouldInjectTemporalHint("昨天 WCC_6 数据")).toBe(true);
    expect(shouldInjectTemporalHint("WCC_6 SUWT on 2026-04-10")).toBe(false);
  });

  it("temporalQueryHintBlock points to calendar ranges without tool enums", () => {
    const hint = temporalQueryHintBlock("yesterday WCC-06");
    expect(hint).toContain("TEMPORAL QUERY");
    expect(hint).toContain("CALENDAR RANGES");
    expect(hint).not.toContain("relative=");
    expect(temporalQueryHintBlock("WCC_6 on April 10")).toBe("");
  });
});
