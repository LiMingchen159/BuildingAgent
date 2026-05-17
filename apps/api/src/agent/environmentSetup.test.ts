import { describe, expect, it } from "vitest";
import { buildEnvironmentSetupHint, detectMissingEnvironment } from "./environmentSetup.js";

describe("detectMissingEnvironment", () => {
  it("detects missing Python modules", () => {
    const issue = detectMissingEnvironment("ModuleNotFoundError: No module named 'pandas'");
    expect(issue).toEqual({ kind: "python", detail: "pandas" });
  });

  it("detects missing Node modules", () => {
    const issue = detectMissingEnvironment("Error: Cannot find module 'lodash'");
    expect(issue?.kind).toBe("node");
  });

  it("detects missing shell commands", () => {
    const issue = detectMissingEnvironment("bash: sparql: command not found");
    expect(issue?.kind).toBe("system");
  });
});

describe("buildEnvironmentSetupHint", () => {
  it("tells the agent to install before continuing", () => {
    const hint = buildEnvironmentSetupHint("ModuleNotFoundError: No module named 'matplotlib'");
    expect(hint).toContain("ENVIRONMENT SETUP REQUIRED");
    expect(hint).toContain("pip install");
    expect(hint).toMatch(/matplotlib/);
    expect(hint).toContain("Do NOT answer the user");
  });
});
