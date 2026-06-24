import { describe, expect, it } from "vitest";
import { chartPlottingGuidelines } from "./chartGuidelines.js";
import { executionDisciplineBlock } from "./systemPrompt.js";

describe("platform prompt rules (L0)", () => {
  it("executionDiscipline points to runtime skills and forbids hand-written data", () => {
    const block = executionDisciplineBlock();
    expect(block).toContain("skill_tool_data_bridge");
    expect(block).toContain("skill_chart_quality");
    expect(block).toContain(">20 hand-written data points");
    expect(block).toContain("parallel");
    expect(block).toContain("never pip install");
    expect(block).toContain("Hong Kong time");
    expect(block).toContain("Asia_Hong_Kong");
  });

  it("chart guidelines require injected scientific helpers", () => {
    const block = chartPlottingGuidelines();
    expect(block).toContain("save_chart");
    expect(block).toContain("build_combined_frame");
    expect(block).toContain("format_hkt_axis");
    expect(block).toContain("load_all_series().items()");
  });

  it("chart guidelines forbid mdates.timezone and pytz", () => {
    const block = chartPlottingGuidelines();
    expect(block).toContain("mdates.timezone");
    expect(block).toContain("pytz");
    expect(block).toContain("Asia/Hong_Kong");
  });

  it("chart guidelines forbid mid-turn pip", () => {
    const block = chartPlottingGuidelines();
    expect(block).toContain("do not pip install mid-turn");
  });
});
