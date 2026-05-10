#!/usr/bin/env node
import { CliConfigError, getConfigDiagnostics, loadConfig, redactConfig } from "./config.js";

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main(argv: string[]): Promise<number> {
  const [command] = argv;

  if (!command || command === "help" || command === "--help") {
    process.stdout.write("building-agent <session|config-path>\n");
    return 0;
  }

  if (command === "config-path") {
    printJson(getConfigDiagnostics());
    return 0;
  }

  if (command === "session") {
    const diagnostics = getConfigDiagnostics();
    const config = await loadConfig();
    printJson({ diagnostics, config: redactConfig(config) });
    return 0;
  }

  process.stderr.write(`Unknown command: ${command}\n`);
  return 2;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  if (error instanceof CliConfigError) {
    process.stderr.write(`${JSON.stringify(error.toJSON())}\n`);
    process.exitCode = 1;
  } else {
    process.stderr.write(`${error instanceof Error ? error.message : "Unknown CLI error"}\n`);
    process.exitCode = 1;
  }
}
