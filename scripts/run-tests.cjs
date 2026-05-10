const { spawnSync } = require("node:child_process");

const rawArgs = process.argv.slice(2).filter((arg) => arg !== "--");
const runIndex = rawArgs.indexOf("--run");
const args = rawArgs.filter((arg) => arg !== "--run");

const webFiles = args.filter((arg) => arg.startsWith("apps/web/"));
const apiFiles = args.filter((arg) => arg.startsWith("apps/api/"));
const cliFiles = args.filter((arg) => arg.startsWith("apps/cli/"));
const passthrough = args.filter(
  (arg) => !arg.startsWith("apps/web/") && !arg.startsWith("apps/api/") && !arg.startsWith("apps/cli/")
);

function runWorkspace(workspace, files, prefix) {
  const normalizedFiles = files.map((arg) => arg.replace(new RegExp(`^${prefix}/`, "u"), ""));
  const result = spawnSync(
    "npm",
    ["--workspace", workspace, "exec", "--", "vitest", "run", ...passthrough, ...normalizedFiles],
    { stdio: "inherit" }
  );
  return result.status ?? 1;
}

const targetedRuns = [
  { files: apiFiles, workspace: "@building-agent/api", prefix: "apps/api" },
  { files: cliFiles, workspace: "@building-agent/cli", prefix: "apps/cli" },
  { files: webFiles, workspace: "@building-agent/web", prefix: "apps/web" }
].filter((run) => run.files.length > 0);

if (targetedRuns.length > 0) {
  for (const run of targetedRuns) {
    const status = runWorkspace(run.workspace, run.files, run.prefix);
    if (status !== 0) {
      process.exit(status);
    }
  }
  process.exit(0);
}

if (runIndex !== -1 || args.length === 0) {
  process.exit(runWorkspace("@building-agent/api", apiFiles, "apps/api"));
}

const result = spawnSync("npm", ["--workspaces", "--if-present", "run", "test"], { stdio: "inherit" });
process.exit(result.status ?? 1);
