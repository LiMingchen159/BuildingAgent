import { ApiClient, ApiClientError } from "./api.js";
import {
  type CliConfig,
  type ConfigStoreOptions,
  getConfigDiagnostics,
  loadConfig,
  redactConfig,
  saveConfig
} from "./config.js";
import { parseProjectManagementResponse, parseRegistryResponse } from "./registry.js";

const DEFAULT_API_URL = "http://127.0.0.1:3000";

export interface CommandIO {
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
}

export interface CommandOptions extends ConfigStoreOptions {
  fetchImpl?: typeof fetch;
  io?: CommandIO;
}

export interface CommandResult {
  exitCode: number;
}

export class CliCommandError extends Error {
  readonly code: string;
  readonly requestId: string | undefined;
  readonly status: number | undefined;

  constructor(code: string, message: string, options: { requestId?: string; status?: number } = {}) {
    super(message);
    this.name = "CliCommandError";
    this.code = code;
    this.requestId = options.requestId;
    this.status = options.status;
  }

  toJSON(): { error: { code: string; message: string; requestId?: string; status?: number } } {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.requestId ? { requestId: this.requestId } : {}),
        ...(this.status ? { status: this.status } : {})
      }
    };
  }
}

export async function runCommand(argv: string[], options: CommandOptions = {}): Promise<CommandResult> {
  const io = options.io ?? { stdout: process.stdout, stderr: process.stderr };
  const [command, ...args] = argv;

  if (!command || command === "help" || command === "--help") {
    io.stdout.write("building-agent <login|session|projects|use|registry|management|chat|chat:list|config-path>\n");
    return { exitCode: 0 };
  }

  try {
    const output = await execute(command, args, options);
    if (output !== undefined) {
      printJson(io.stdout, output);
    }
    return { exitCode: 0 };
  } catch (error) {
    if (error instanceof Error && error.name === "CliConfigError") {
      throw error;
    }
    await recordFailure(command, error, options);
    printJson(io.stderr, serializeError(error));
    return { exitCode: 1 };
  }
}

async function execute(command: string, args: string[], options: CommandOptions): Promise<unknown> {
  if (command === "config-path") {
    return getConfigDiagnostics(options);
  }

  if (command === "login") {
    const flags = parseFlags(args);
    const email = valueFromFlag(flags, "email");
    const password = valueFromFlag(flags, "password");
    const apiUrl = valueFromFlag(flags, "api-url") ?? DEFAULT_API_URL;
    if (!email || !password) {
      throw new CliCommandError("cli_usage", "login requires --email and --password.");
    }

    const api = new ApiClient({ apiUrl, fetchImpl: options.fetchImpl });
    const response = await api.login(email, password);
    const token = tokenFromLogin(response);
    await saveConfig({ ...(await loadConfig(options)), apiUrl, token, lastCommand: command }, options);
    return { ...withoutToken(response), apiUrl, config: redactConfig(await loadConfig(options)) };
  }

  if (command === "session") {
    const config = await loadConfig(options);
    if (!hasApiAuth(config)) {
      return { diagnostics: getConfigDiagnostics(options), config: redactConfig(config) };
    }
    const response = await clientFromConfig(config, options).session();
    await saveConfig({ ...config, lastCommand: command }, options);
    return { ...asRecord(response), config: redactConfig(await loadConfig(options)) };
  }

  if (command === "projects") {
    const config = await requireApiAuth(command, options);
    const response = await clientFromConfig(config, options).projects();
    await saveConfig({ ...config, lastCommand: command }, options);
    return response;
  }

  if (command === "use") {
    const projectId = args[0];
    if (!projectId) {
      throw new CliCommandError("cli_usage", "use requires a project id.");
    }
    const config = await requireApiAuth(command, options);
    const response = await clientFromConfig(config, options).selectProject(projectId);
    await saveConfig({ ...config, selectedProjectId: projectId, lastCommand: command }, options);
    return { ...asRecord(response), config: redactConfig(await loadConfig(options)) };
  }

  if (command === "registry") {
    const config = await requireApiAuth(command, options);
    const response = parseRegistryResponse(await clientFromConfig(config, options).registry());
    await saveConfig({ ...config, lastCommand: command }, options);
    return response;
  }

  if (command === "management") {
    const config = await requireSelectedProject(command, options);
    const response = parseProjectManagementResponse(await clientFromConfig(config, options).management(config.selectedProjectId));
    await saveConfig({ ...config, lastCommand: command }, options);
    return response;
  }

  if (command === "chat:list") {
    const config = await requireSelectedProject(command, options);
    const response = await clientFromConfig(config, options).listChat(config.selectedProjectId);
    await saveConfig({ ...config, lastCommand: command }, options);
    return response;
  }

  if (command === "chat") {
    const message = args.join(" ").trim();
    if (!message) {
      throw new CliCommandError("chat_invalid", "Chat message must be 1-1000 characters.");
    }
    const config = await requireSelectedProject(command, options);
    const response = await clientFromConfig(config, options).sendChat(config.selectedProjectId, message);
    await saveConfig({ ...config, lastCommand: command }, options);
    return response;
  }

  throw new CliCommandError("cli_unknown_command", `Unknown command: ${command}`);
}

function parseFlags(args: string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg?.startsWith("--")) {
      continue;
    }
    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const value = inlineValue ?? args[index + 1];
    if (inlineValue === undefined) {
      index += 1;
    }
    if (rawKey && value !== undefined) {
      flags.set(rawKey, value);
    }
  }
  return flags;
}

function valueFromFlag(flags: Map<string, string>, key: string): string | undefined {
  const value = flags.get(key)?.trim();
  return value ? value : undefined;
}

function clientFromConfig(config: CliConfig, options: CommandOptions): ApiClient {
  return new ApiClient({ apiUrl: config.apiUrl ?? DEFAULT_API_URL, token: config.token, fetchImpl: options.fetchImpl });
}

function hasApiAuth(config: CliConfig): config is CliConfig & { apiUrl: string; token: string } {
  return Boolean(config.apiUrl && config.token);
}

async function requireApiAuth(command: string, options: CommandOptions): Promise<CliConfig & { apiUrl: string; token: string }> {
  const config = await loadConfig(options);
  if (!hasApiAuth(config)) {
    throw new CliCommandError("auth_missing", `${command} requires login first.`);
  }
  return config;
}

async function requireSelectedProject(
  command: string,
  options: CommandOptions
): Promise<CliConfig & { apiUrl: string; token: string; selectedProjectId: string }> {
  const config = await requireApiAuth(command, options);
  if (!config.selectedProjectId) {
    throw new CliCommandError("project_not_selected", `${command} requires selecting a project first.`);
  }
  return { ...config, selectedProjectId: config.selectedProjectId };
}

function tokenFromLogin(response: unknown): string {
  const token = (response as { token?: unknown }).token;
  if (typeof token !== "string" || !token) {
    throw new CliCommandError("auth_invalid", "Login response did not include a bearer token.");
  }
  return token;
}

function withoutToken(response: unknown): Record<string, unknown> {
  const record = asRecord(response);
  const { token: _token, ...safe } = record;
  return safe;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function recordFailure(command: string, error: unknown, options: CommandOptions): Promise<void> {
  try {
    const config = await loadConfig(options);
    const serialized = serializeError(error).error;
    await saveConfig(
      {
        ...config,
        lastCommand: command,
        lastErrorCode: serialized.code,
        ...(serialized.requestId ? { lastRequestId: serialized.requestId } : {})
      },
      options
    );
  } catch {
    // Preserve the original failure. Config errors are already emitted when they are the original error.
  }
}

function serializeError(error: unknown): { error: { code: string; message: string; requestId?: string; status?: number } } {
  if (error instanceof ApiClientError || error instanceof CliCommandError) {
    return error.toJSON();
  }
  if (error instanceof Error && "toJSON" in error && typeof error.toJSON === "function") {
    const serialized = error.toJSON() as unknown;
    if (isSerializedError(serialized)) {
      return serialized;
    }
  }
  return { error: { code: "cli_error", message: error instanceof Error ? error.message : "Unknown CLI error" } };
}

function isSerializedError(value: unknown): value is { error: { code: string; message: string } } {
  return (
    value !== null &&
    typeof value === "object" &&
    "error" in value &&
    value.error !== null &&
    typeof value.error === "object" &&
    "code" in value.error &&
    typeof value.error.code === "string" &&
    "message" in value.error &&
    typeof value.error.message === "string"
  );
}

function printJson(stream: Pick<NodeJS.WriteStream, "write">, value: unknown): void {
  stream.write(`${JSON.stringify(value, null, 2)}\n`);
}
