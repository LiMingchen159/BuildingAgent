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
    stdout: { write: (chunk: string | Uint8Array) => { stdout += String(chunk); return true; } },
    stderr: { write: (chunk: string | Uint8Array) => { stderr += String(chunk); return true; } },
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

describe("authenticated cli commands", () => {
  let homeDir: string;
  let apiUrl: string;
  let closeServer: () => Promise<void>;

  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), "building-agent-cli-"));
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

  it("logs in, persists auth, selects a project, and reuses it for chat in fresh invocations", async () => {
    const loginIo = createIo();
    await expect(
      runCommand(
        ["login", "--email", "ada@example.test", "--password", "local-dev-password", "--api-url", apiUrl],
        { homeDir, io: loginIo }
      )
    ).resolves.toEqual({ exitCode: 0 });
    expect(loginIo.stdoutText()).not.toContain("seed-token-ada");
    await expect(loadConfig({ homeDir })).resolves.toMatchObject({ apiUrl, token: "seed-token-ada" });

    const projectsIo = createIo();
    await expect(runCommand(["projects"], { homeDir, io: projectsIo })).resolves.toEqual({ exitCode: 0 });
    expect(parseOutput(projectsIo)).toMatchObject({
      projects: expect.arrayContaining([expect.objectContaining({ id: "project_alpha" })])
    });

    const useIo = createIo();
    await expect(runCommand(["use", "project_alpha"], { homeDir, io: useIo })).resolves.toEqual({ exitCode: 0 });
    await expect(loadConfig({ homeDir })).resolves.toMatchObject({ selectedProjectId: "project_alpha" });

    const chatIo = createIo();
    await expect(runCommand(["chat", "hello", "from", "the", "cli"], { homeDir, io: chatIo })).resolves.toEqual({
      exitCode: 0
    });
    expect(parseOutput(chatIo)).toMatchObject({
      message: { projectId: "project_alpha", content: "hello from the cli" },
      requestId: expect.stringMatching(/^req_/u)
    });

    const listIo = createIo();
    await expect(runCommand(["chat:list"], { homeDir, io: listIo })).resolves.toEqual({ exitCode: 0 });
    expect(parseOutput(listIo)).toMatchObject({
      messages: [expect.objectContaining({ content: "hello from the cli" })],
      requestId: expect.stringMatching(/^req_/u)
    });

    const sessionIo = createIo();
    await expect(runCommand(["session"], { homeDir, io: sessionIo })).resolves.toEqual({ exitCode: 0 });
    expect(sessionIo.stdoutText()).not.toContain("seed-token-ada");
    expect(parseOutput(sessionIo)).toMatchObject({
      session: { userId: "user_ada", projectId: "project_alpha" },
      config: { token: "[redacted]", selectedProjectId: "project_alpha", lastCommand: "session" }
    });
  });

  it("preserves backend error codes and request ids for forbidden project selection", async () => {
    const loginIo = createIo();
    await runCommand(
      ["login", "--email", "ada@example.test", "--password", "local-dev-password", "--api-url", apiUrl],
      { homeDir, io: loginIo }
    );

    const useIo = createIo();
    await expect(runCommand(["use", "project_gamma"], { homeDir, io: useIo })).resolves.toEqual({ exitCode: 1 });
    const failure = parseError(useIo);
    expect(failure.error).toMatchObject({ code: "project_forbidden", requestId: expect.stringMatching(/^req_/u) });
    await expect(loadConfig({ homeDir })).resolves.toMatchObject({
      lastCommand: "use",
      lastErrorCode: "project_forbidden",
      lastRequestId: failure.error.requestId
    });
  });

  it("fails closed for missing auth and blank chat input without leaking secrets", async () => {
    const projectsIo = createIo();
    await expect(runCommand(["projects"], { homeDir, io: projectsIo })).resolves.toEqual({ exitCode: 1 });
    expect(parseError(projectsIo).error).toMatchObject({ code: "auth_missing" });

    const loginIo = createIo();
    await runCommand(
      ["login", "--email", "ada@example.test", "--password", "local-dev-password", "--api-url", apiUrl],
      { homeDir, io: loginIo }
    );
    await runCommand(["use", "project_alpha"], { homeDir, io: createIo() });

    const chatIo = createIo();
    await expect(runCommand(["chat", "   "], { homeDir, io: chatIo })).resolves.toEqual({ exitCode: 1 });
    expect(parseError(chatIo).error).toMatchObject({ code: "chat_invalid" });
    expect(chatIo.stderrText()).not.toContain("seed-token-ada");
  });

  it("surfaces registry and management placeholder state through the saved session", async () => {
    await runCommand(
      ["login", "--email", "ada@example.test", "--password", "local-dev-password", "--api-url", apiUrl],
      { homeDir, io: createIo() }
    );
    await runCommand(["use", "project_alpha"], { homeDir, io: createIo() });

    const registryIo = createIo();
    await expect(runCommand(["registry"], { homeDir, io: registryIo })).resolves.toEqual({ exitCode: 0 });
    expect(parseOutput(registryIo)).toMatchObject({ placeholderOnly: true, requestId: expect.stringMatching(/^req_/u) });

    const managementIo = createIo();
    await expect(runCommand(["management"], { homeDir, io: managementIo })).resolves.toEqual({ exitCode: 0 });
    expect(parseOutput(managementIo)).toMatchObject({
      projectId: "project_alpha",
      placeholderOnly: true,
      requestId: expect.stringMatching(/^req_/u)
    });
  });
});
