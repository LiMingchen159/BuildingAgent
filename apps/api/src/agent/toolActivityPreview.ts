/** Map tool dispatch results to activity UI fields (exit code, human-readable output). */

export function toolExitCode(result: Record<string, unknown>): number | undefined {
  if (typeof result.exitCode === "number") {
    return result.exitCode;
  }
  if (result.ok === false || result.error !== undefined) {
    return 1;
  }
  const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
  if (/Traceback|Error:|ModuleNotFoundError|FileNotFoundError/i.test(stderr)) {
    return 1;
  }
  return undefined;
}

export function toolActivityOutput(result: Record<string, unknown>, maxLen = 500): string | undefined {
  const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
  if (stderr) {
    return stderr.slice(0, maxLen);
  }
  if (result.ok === false) {
    const err = typeof result.error === "string" ? result.error : JSON.stringify(result.error ?? "failed");
    return err.slice(0, maxLen);
  }
  if (typeof result.error === "string" && result.error.trim()) {
    return result.error.trim().slice(0, maxLen);
  }
  const serialized = JSON.stringify(result);
  return serialized.length > 0 ? serialized.slice(0, maxLen) : undefined;
}

export function toolFailed(result: Record<string, unknown>): boolean {
  const code = toolExitCode(result);
  return code !== undefined && code !== 0;
}
