const { spawnSync } = require("node:child_process");

const rawArgs = process.argv.slice(2).filter((arg) => arg !== "--");
const runIndex = rawArgs.indexOf("--run");
const args = rawArgs.filter((arg) => arg !== "--run");

const webFiles = args.filter((arg) => arg.startsWith("apps/web/"));
const apiFiles = args.filter((arg) => arg.startsWith("apps/api/"));
const passthrough = args.filter((arg) => !arg.startsWith("apps/web/") && !arg.startsWith("apps/api/"));

function runWorkspace(workspace, files, prefix) {
  const normalizedFiles = files.map((arg) => arg.replace(new RegExp(`^${prefix}/`, "u"), ""));
  const result = spawnSync(
    "npm",
    ["--workspace", workspace, "exec", "--", "vitest", "run", ...passthrough, ...normalizedFiles],
    { stdio: "inherit" }
  );
  return result.status ?? 1;
}

if (webFiles.length > 0 && apiFiles.length > 0) {
  const apiStatus = runWorkspace("@building-agent/api", apiFiles, "apps/api");
  if (apiStatus !== 0) {
    process.exit(apiStatus);
  }
  process.exit(runWorkspace("@building-agent/web", webFiles, "apps/web"));
}

if (webFiles.length > 0) {
  process.exit(runWorkspace("@building-agent/web", webFiles, "apps/web"));
}

if (apiFiles.length > 0 || runIndex !== -1 || args.length === 0) {
  process.exit(runWorkspace("@building-agent/api", apiFiles, "apps/api"));
}

const result = spawnSync("npm", ["--workspaces", "--if-present", "run", "test"], { stdio: "inherit" });
process.exit(result.status ?? 1);
