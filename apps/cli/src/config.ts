import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const CONFIG_DIRECTORY_NAME = ".building-agent";
const CONFIG_FILE_NAME = "config.json";

export interface CliConfig {
  apiUrl?: string;
  token?: string;
  selectedProjectId?: string;
  lastCommand?: string;
  lastErrorCode?: string;
  lastRequestId?: string;
}

export interface ConfigStoreOptions {
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
}

export interface ConfigDiagnostics {
  cliHomeDir: string;
  configPath: string;
}

export class CliConfigError extends Error {
  readonly code: "config_parse_failed" | "config_read_failed" | "config_write_failed";
  readonly diagnostics: ConfigDiagnostics;

  constructor(
    code: CliConfigError["code"],
    message: string,
    diagnostics: ConfigDiagnostics,
    cause?: unknown
  ) {
    super(message, { cause });
    this.name = "CliConfigError";
    this.code = code;
    this.diagnostics = diagnostics;
  }

  toJSON(): { error: { code: string; message: string; cliHomeDir: string; configPath: string } } {
    return {
      error: {
        code: this.code,
        message: this.message,
        cliHomeDir: this.diagnostics.cliHomeDir,
        configPath: this.diagnostics.configPath
      }
    };
  }
}

function configuredHomeDir(options: ConfigStoreOptions = {}): string {
  const env = options.env ?? process.env;
  return options.homeDir ?? env.BUILDING_AGENT_CLI_HOME ?? homedir();
}

export function getConfigDiagnostics(options: ConfigStoreOptions = {}): ConfigDiagnostics {
  const cliHomeDir = resolve(configuredHomeDir(options));
  return {
    cliHomeDir,
    configPath: join(cliHomeDir, CONFIG_DIRECTORY_NAME, CONFIG_FILE_NAME)
  };
}

function assertPlainConfig(value: unknown, diagnostics: ConfigDiagnostics): CliConfig {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CliConfigError("config_parse_failed", "CLI config file must contain a JSON object.", diagnostics);
  }

  const candidate = value as Record<string, unknown>;
  for (const key of ["apiUrl", "token", "selectedProjectId", "lastCommand", "lastErrorCode", "lastRequestId"] as const) {
    if (candidate[key] !== undefined && typeof candidate[key] !== "string") {
      throw new CliConfigError("config_parse_failed", `CLI config field ${key} must be a string.`, diagnostics);
    }
  }

  return {
    ...(typeof candidate.apiUrl === "string" ? { apiUrl: candidate.apiUrl } : {}),
    ...(typeof candidate.token === "string" ? { token: candidate.token } : {}),
    ...(typeof candidate.selectedProjectId === "string" ? { selectedProjectId: candidate.selectedProjectId } : {}),
    ...(typeof candidate.lastCommand === "string" ? { lastCommand: candidate.lastCommand } : {}),
    ...(typeof candidate.lastErrorCode === "string" ? { lastErrorCode: candidate.lastErrorCode } : {}),
    ...(typeof candidate.lastRequestId === "string" ? { lastRequestId: candidate.lastRequestId } : {})
  };
}

export async function loadConfig(options: ConfigStoreOptions = {}): Promise<CliConfig> {
  const diagnostics = getConfigDiagnostics(options);

  try {
    const raw = await readFile(diagnostics.configPath, "utf8");
    return assertPlainConfig(JSON.parse(raw) as unknown, diagnostics);
  } catch (error) {
    if (error instanceof CliConfigError) {
      throw error;
    }

    if (error instanceof SyntaxError) {
      throw new CliConfigError("config_parse_failed", "CLI config file contains malformed JSON.", diagnostics, error);
    }

    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return {};
    }

    throw new CliConfigError("config_read_failed", "Failed to read CLI config file.", diagnostics, error);
  }
}

export async function saveConfig(config: CliConfig, options: ConfigStoreOptions = {}): Promise<ConfigDiagnostics> {
  const diagnostics = getConfigDiagnostics(options);
  const safeConfig = assertPlainConfig(config, diagnostics);

  try {
    await mkdir(dirname(diagnostics.configPath), { recursive: true, mode: 0o700 });
    await writeFile(diagnostics.configPath, `${JSON.stringify(safeConfig, null, 2)}\n`, { mode: 0o600 });
    return diagnostics;
  } catch (error) {
    throw new CliConfigError("config_write_failed", "Failed to write CLI config file.", diagnostics, error);
  }
}

export function redactConfig(config: CliConfig): CliConfig {
  return {
    ...config,
    ...(config.token ? { token: "[redacted]" } : {})
  };
}
