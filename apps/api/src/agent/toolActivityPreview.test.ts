import { describe, expect, it } from "vitest";
import { toolActivityOutput, toolExitCode, toolFailed } from "./toolActivityPreview.js";

describe("toolActivityPreview", () => {
  it("detects python stderr failures", () => {
    const result = { stderr: "Traceback...\nFileNotFoundError: missing.json" };
    expect(toolExitCode(result)).toBe(1);
    expect(toolFailed(result)).toBe(true);
    expect(toolActivityOutput(result)).toContain("FileNotFoundError");
  });

  it("detects ok:false tool payloads", () => {
    const result = { ok: false, error: "Point not found" };
    expect(toolExitCode(result)).toBe(1);
    expect(toolFailed(result)).toBe(true);
    expect(toolActivityOutput(result)).toContain("Point not found");
  });

  it("passes successful results", () => {
    const result = { ok: true, items: [] };
    expect(toolExitCode(result)).toBeUndefined();
    expect(toolFailed(result)).toBe(false);
  });
});
