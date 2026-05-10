#!/usr/bin/env node
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = resolve(__dirname, "..");
const API_URL = process.env.SMOKE_API_URL ?? "http://127.0.0.1:3000";
const WEB_URL = process.env.SMOKE_WEB_URL ?? "http://127.0.0.1:5173";
const API_HEALTH_URL = `${API_URL.replace(/\/+$/u, "")}/health`;
const WEB_HEALTH_URL = `${WEB_URL.replace(/\/+$/u, "")}/health`;
const DEFAULT_TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 90000);
const PROBE_INTERVAL_MS = 500;
const SEEDED_EMAIL = "ada@example.test";
const SEEDED_PASSWORD = "local-dev-password";
const SEEDED_PROJECT_ID = "project_alpha";

const children = [];
let cleanupStarted = false;
let cliHomeDir;

function stage(message) {
  process.stdout.write(`[smoke] ${message}\n`);
}

function redactOutput(value) {
  return value.replace(/Bearer\s+[A-Za-z0-9._-]+/gu, "Bearer [redacted]").replace(/local-dev-password/gu, "[redacted-password]");
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function withDeadline(work) {
  let timeout;
  try {
    return await Promise.race([
      work(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Smoke timed out after ${DEFAULT_TIMEOUT_MS}ms.`)), DEFAULT_TIMEOUT_MS);
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function probeJson(url, label) {
  try {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    if (!response.ok) {
      return { ok: false, label, status: response.status, requestId: payload?.requestId ?? payload?.error?.requestId };
    }
    return { ok: true, label, status: response.status, requestId: payload?.requestId, payload };
  } catch (error) {
    return { ok: false, label, error: error instanceof Error ? error.message : String(error) };
  }
}

async function waitForProbe(url, label) {
  const started = Date.now();
  let last;
  while (Date.now() - started < DEFAULT_TIMEOUT_MS) {
    last = await probeJson(url, label);
    if (last.ok) {
      stage(`${label} probe ok status=${last.status}${last.requestId ? ` requestId=${last.requestId}` : ""}`);
      return last;
    }
    await sleep(PROBE_INTERVAL_MS);
  }
  stage(`${label} probe failed ${JSON.stringify(last)}`);
  throw new Error(`${label} did not become reachable at ${url}.`);
}

async function isReachable(url, label) {
  const result = await probeJson(url, label);
  if (result.ok) {
    stage(`${label} already reachable status=${result.status}${result.requestId ? ` requestId=${result.requestId}` : ""}`);
    return true;
  }
  stage(`${label} not reachable yet: ${JSON.stringify(result)}`);
  return false;
}

function spawnManaged(label, command, args, options = {}) {
  stage(`starting ${label}`);
  const child = spawn(command, args, {
    cwd: ROOT,
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32"
  });

  const state = { label, child, exitCode: null, signal: null, stdoutTail: "", stderrTail: "" };
  children.push(state);

  const capture = (streamName, chunk) => {
    const text = redactOutput(chunk.toString());
    const prefixed = text
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => `[smoke:${label}:${streamName}] ${line}`)
      .join("\n");
    if (prefixed) {
      process.stdout.write(`${prefixed}\n`);
    }
    const key = streamName === "stdout" ? "stdoutTail" : "stderrTail";
    state[key] = (state[key] + text).slice(-4000);
  };

  child.stdout.on("data", (chunk) => capture("stdout", chunk));
  child.stderr.on("data", (chunk) => capture("stderr", chunk));
  child.on("exit", (code, signal) => {
    state.exitCode = code;
    state.signal = signal;
    stage(`${label} child exit code=${code ?? "null"} signal=${signal ?? "null"}`);
  });
  child.on("error", (error) => {
    stage(`${label} child error=${error.message}`);
  });

  return state;
}

function runProcess(label, command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    stage(`run ${label}`);
    const child = spawn(command, args, {
      cwd: ROOT,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", rejectRun);
    child.on("close", (code, signal) => {
      const safeStdout = redactOutput(stdout);
      const safeStderr = redactOutput(stderr);
      stage(`${label} exit code=${code ?? "null"} signal=${signal ?? "null"}`);
      if (safeStderr.trim()) {
        stage(`${label} stderr=${safeStderr.trim()}`);
      }
      if (code !== 0) {
        const error = new Error(`${label} failed with exit code ${code}.`);
        error.stdout = safeStdout;
        error.stderr = safeStderr;
        rejectRun(error);
        return;
      }
      resolveRun({ stdout: safeStdout, stderr: safeStderr });
    });
  });
}

async function runCli(label, args) {
  const result = await runProcess(`cli ${label}`, "node", ["apps/cli/dist/apps/cli/src/index.js", ...args], {
    env: { BUILDING_AGENT_CLI_HOME: cliHomeDir }
  });
  const trimmed = result.stdout.trim();
  if (!trimmed) {
    stage(`cli ${label} produced no stdout`);
    return undefined;
  }
  let payload;
  try {
    payload = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`cli ${label} returned non-JSON stdout: ${trimmed.slice(0, 200)}`);
  }
  const requestId = payload?.requestId ?? payload?.session?.requestId ?? payload?.error?.requestId;
  const summary = requestId ? ` requestId=${requestId}` : "";
  stage(`cli ${label} ok${summary}`);
  return payload;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function cleanup() {
  if (cleanupStarted) {
    return;
  }
  cleanupStarted = true;
  stage("cleanup start");

  await Promise.all(
    children.map(async (state) => {
      if (state.child.exitCode !== null || state.child.signalCode !== null) {
        stage(`${state.label} already exited code=${state.exitCode ?? "null"} signal=${state.signal ?? "null"}`);
        return;
      }
      stage(`stopping ${state.label} pid=${state.child.pid}`);
      try {
        if (process.platform === "win32") {
          state.child.kill("SIGTERM");
        } else {
          process.kill(-state.child.pid, "SIGTERM");
        }
      } catch (error) {
        stage(`${state.label} stop warning=${error instanceof Error ? error.message : String(error)}`);
      }
      await sleep(1000);
      if (state.child.exitCode === null && state.child.signalCode === null) {
        try {
          if (process.platform === "win32") {
            state.child.kill("SIGKILL");
          } else {
            process.kill(-state.child.pid, "SIGKILL");
          }
        } catch {
          // Process may have exited after SIGTERM.
        }
      }
    })
  );

  if (cliHomeDir) {
    await rm(cliHomeDir, { recursive: true, force: true });
    stage(`removed temp CLI home ${cliHomeDir}`);
  }
  stage("cleanup complete");
}

process.on("SIGINT", () => {
  void cleanup().finally(() => process.exit(130));
});
process.on("SIGTERM", () => {
  void cleanup().finally(() => process.exit(143));
});

async function main() {
  cliHomeDir = await mkdtemp(join(tmpdir(), "building-agent-cli-smoke-"));
  stage(`temp CLI home ${cliHomeDir}`);
  stage("build workspaces");
  await runProcess("npm run build", "npm", ["run", "build"]);

  if (!(await isReachable(API_HEALTH_URL, "api"))) {
    spawnManaged("api", "npm", ["run", "dev:api"], { env: { HOST: "127.0.0.1", PORT: "3000" } });
    await waitForProbe(API_HEALTH_URL, "api");
  }

  if (!(await isReachable(WEB_HEALTH_URL, "web"))) {
    spawnManaged("web", "npm", ["run", "dev:web"], { env: { VITE_API_BASE_URL: API_URL } });
    await waitForProbe(WEB_HEALTH_URL, "web");
  }

  stage("cli login and project flow");
  const login = await runCli("login", ["login", "--email", SEEDED_EMAIL, "--password", SEEDED_PASSWORD, "--api-url", API_URL]);
  assert(!Object.prototype.hasOwnProperty.call(login ?? {}, "token"), "Login output must not include token material.");
  assert(login?.user?.id === "user_ada", "Login did not authenticate the seeded Ada user.");

  const sessionBeforeUse = await runCli("session", ["session"]);
  assert(sessionBeforeUse?.session?.userId === "user_ada", "Session did not persist authenticated user.");

  const projects = await runCli("projects", ["projects"]);
  assert(Array.isArray(projects?.projects) && projects.projects.some((project) => project.id === SEEDED_PROJECT_ID), "Projects output did not include Alpha Build.");

  const useProject = await runCli("use", ["use", SEEDED_PROJECT_ID]);
  assert(useProject?.session?.projectId === SEEDED_PROJECT_ID, "Project selection did not persist Alpha Build.");

  const registry = await runCli("registry", ["registry"]);
  assert(registry?.placeholderOnly === true && Array.isArray(registry.runtimeProviders), "Registry output was not the authenticated placeholder registry.");

  const management = await runCli("management", ["management"]);
  assert(management?.projectId === SEEDED_PROJECT_ID && management.placeholderOnly === true, "Management output was not scoped to the selected project.");

  const chat = await runCli("chat", ["chat", "Smoke check from CLI"]);
  assert(chat?.message?.projectId === SEEDED_PROJECT_ID, "Chat command did not write to the selected project.");

  const chatList = await runCli("chat:list", ["chat:list"]);
  assert(Array.isArray(chatList?.messages) && chatList.messages.some((message) => message.content === "Smoke check from CLI"), "Chat list did not include the smoke message.");

  stage("smoke passed");
}

withDeadline(main)
  .catch((error) => {
    stage(`smoke failed: ${redactOutput(error instanceof Error ? error.message : String(error))}`);
    if (error?.stdout) {
      stage(`failure stdout=${redactOutput(error.stdout).trim()}`);
    }
    if (error?.stderr) {
      stage(`failure stderr=${redactOutput(error.stderr).trim()}`);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
  });
