#!/usr/bin/env node
import { CliConfigError } from "./config.js";
import { runCommand } from "./commands.js";

try {
  const result = await runCommand(process.argv.slice(2));
  process.exitCode = result.exitCode;
} catch (error) {
  if (error instanceof CliConfigError) {
    process.stderr.write(`${JSON.stringify(error.toJSON())}\n`);
    process.exitCode = 1;
  } else {
    process.stderr.write(`${error instanceof Error ? error.message : "Unknown CLI error"}\n`);
    process.exitCode = 1;
  }
}
