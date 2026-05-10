import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../../api/src/server.js";
import { loadConfig } from "./config.js";
import { runCommand, type CommandIO } from "./commands.js";

function createIo(): CommandIO & { stdoutText(): string; stderrText(): string } {
  let stdout = "";
  let stderr = "";
  return {
    stdout: {
      write: (chunk: string | Uint8Array) => {
        stdout += String(chunk);
        return true;
      }
    },
    stderr: {
      write: (chunk: string | Uint8Array) => {
        stderr += String(chunk);
        return true;
      }
    },
    stdoutText: () => stdout,
    stderrText: () => stderr
  };
}

function parseOutput(io: { stdoutText(): string }): unknown {
  return JSON.parse(io.stdoutText()) as unknown;
}

function parseError(io: { stderrText(): string }): { error: { code: string; requestId?: string; message: string } } {
  return JSON.parse(io.stderrText()) as { error: { code: string; requestId?: string; message: string } };
}

describe("registry and management inspection commands", () => {
  let homeDir: string;
  let apiUrl: string;
  let closeServer: () => Promise<void>;

  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), "building-agent-cli-registry-"));
    const app = buildServer();
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    if (typeof address === "string" || address === null) {
      throw new Error("Expected TCP test server address.");
    }
    apiUrl = `http://127.0.0.1:${address.port}`;
    closeServer = async () => app.close();
  });

  afterEach(async () => {
    await closeServer();
    await rm(homeDir, { recursive: true, force: true });
  });

  it("surfaces placeholder-only registry and management metadata with request ids", async () => {
    await runCommand(
      ["login", "--email", "ada@example.test", "--password", "local-dev-password", "--api-url", apiUrl],
      { homeDir, io: createIo() }
    );
    await runCommand(["use", "project_alpha"], { homeDir, io: createIo() });

    const registryIo = createIo();
    await expect(runCommand(["registry"], { homeDir, io: registryIo })).resolves.toEqual({ exitCode: 0 });
    expect(parseOutput(registryIo)).toMatchObject({
      limit: 50,
      placeholderOnly: true,
      requestId: expect.stringMatching(/^req_/u),
      runtimeProviders: expect.arrayContaining([expect.objectContaining({ id: "runtime_provider_local_llm" })])
    });

    const managementIo = createIo();
    await expect(runCommand(["management"], { homeDir, io: managementIo })).resolves.toEqual({ exitCode: 0 });
    expect(parseOutput(managementIo)).toMatchObject({
      projectId: "project_alpha",
      limit: 50,
      placeholderOnly: true,
      requestId: expect.stringMatching(/^req_/u),
      gateways: expect.arrayContaining([expect.objectContaining({ id: "gateway_bms_placeholder" })])
    });

    await expect(loadConfig({ homeDir })).resolves.toMatchObject({ lastCommand: "management" });
  });

  it("fails closed for missing auth and malformed placeholder payloads", async () => {
    const unauthenticatedIo = createIo();
    await expect(runCommand(["registry"], { homeDir, io: unauthenticatedIo })).resolves.toEqual({ exitCode: 1 });
    expect(parseError(unauthenticatedIo).error).toMatchObject({ code: "auth_missing" });

    const malformedFetch = async () =>
      new Response(
        JSON.stringify({
          runtimeProviders: [{ id: "runtime_provider_local_llm", name: "bad", status: "placeholder", description: "x" }],
          tools: [],
          skills: [],
          gateways: [],
          buildingCapabilities: [],
          limit: 50,
          placeholderOnly: true,
          requestId: "req_bad"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );

    await runCommand(
      ["login", "--email", "ada@example.test", "--password", "local-dev-password", "--api-url", apiUrl],
      { homeDir, io: createIo() }
    );

    const malformedIo = createIo();
    await expect(
      runCommand(["registry"], {
        homeDir,
        io: malformedIo,
        fetchImpl: malformedFetch as unknown as typeof fetch
      })
    ).resolves.toEqual({ exitCode: 1 });
    expect(parseError(malformedIo).error).toMatchObject({ code: "api_malformed" });
  });
});
