import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, redactConfig, saveConfig, CliConfigError, getConfigDiagnostics } from "./config.js";

describe("cli config store", () => {
  it("uses an isolated home directory and never touches the real home", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "building-agent-cli-"));
    const diagnostics = await saveConfig(
      { apiUrl: "http://127.0.0.1:3000", token: "secret-token", selectedProjectId: "proj_1" },
      { homeDir }
    );

    expect(diagnostics.cliHomeDir).toBe(homeDir);
    expect(diagnostics.configPath).toBe(join(homeDir, ".building-agent", "config.json"));
    await expect(readFile(join(homeDir, ".building-agent", "config.json"), "utf8")).resolves.toContain(
      "selectedProjectId"
    );
    await expect(loadConfig({ homeDir })).resolves.toEqual({
      apiUrl: "http://127.0.0.1:3000",
      token: "secret-token",
      selectedProjectId: "proj_1"
    });
    await rm(homeDir, { recursive: true, force: true });
  });

  it("surfaces redaction-safe diagnostics for malformed config", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "building-agent-cli-"));
    const diagnostics = getConfigDiagnostics({ homeDir });
    await saveConfig({ token: "top-secret" }, { homeDir });
    await expect(readFile(diagnostics.configPath, "utf8")).resolves.toContain("top-secret");

    await expect(saveConfig({ token: 1 as never }, { homeDir })).rejects.toMatchObject({
      code: "config_parse_failed",
      diagnostics: {
        cliHomeDir: homeDir,
        configPath: diagnostics.configPath
      }
    });

    const error = new CliConfigError(
      "config_write_failed",
      "Failed to write CLI config file.",
      diagnostics,
      new Error("boom")
    );
    expect(error.toJSON()).toEqual({
      error: {
        code: "config_write_failed",
        message: "Failed to write CLI config file.",
        cliHomeDir: homeDir,
        configPath: diagnostics.configPath
      }
    });

    expect(redactConfig({ apiUrl: "x", token: "secret" })).toEqual({ apiUrl: "x", token: "[redacted]" });
    await rm(homeDir, { recursive: true, force: true });
  });
});
