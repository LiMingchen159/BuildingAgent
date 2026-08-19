const { spawnSync } = require("node:child_process");

const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const spawnOptions = { stdio: "inherit", shell: process.platform === "win32" };
const rawArgs = process.argv.slice(2).filter((arg) => arg !== "--");
const runIndex = rawArgs.indexOf("--run");
const args = rawArgs.filter((arg) => arg !== "--run");

const webFiles = args.filter((arg) => arg.startsWith("apps/web/"));
const apiFiles = args.filter((arg) => arg.startsWith("apps/api/"));
const cliFiles = args.filter((arg) => arg.startsWith("apps/cli/"));
const plannerFiles = args.filter((arg) => arg.startsWith("packages/fdd-deployment-planner/"));
const passthrough = args.filter(
  (arg) => !arg.startsWith("apps/web/")
    && !arg.startsWith("apps/api/")
    && !arg.startsWith("apps/cli/")
    && !arg.startsWith("packages/fdd-deployment-planner/")
);

function runWorkspace(workspace, files, prefix) {
  const normalizedFiles = files.map((arg) => arg.replace(new RegExp(`^${prefix}/`, "u"), ""));
  const result = spawnSync(
    npmBin,
    ["--workspace", workspace, "exec", "--", "vitest", "run", ...passthrough, ...normalizedFiles],
    spawnOptions
  );
  if (result.error) {
    console.error(`[test] failed to spawn ${npmBin}: ${result.error.message}`);
  }
  return result.status ?? 1;
}

function buildPlanner() {
  const result = spawnSync(
    npmBin,
    ["--workspace", "@building-agent/fdd-deployment-planner", "run", "build"],
    spawnOptions
  );
  if (result.error) {
    console.error(`[test] failed to build FDD deployment planner: ${result.error.message}`);
  }
  return result.status ?? 1;
}

const targetedRuns = [
  { files: plannerFiles, workspace: "@building-agent/fdd-deployment-planner", prefix: "packages/fdd-deployment-planner" },
  { files: apiFiles, workspace: "@building-agent/api", prefix: "apps/api" },
  { files: cliFiles, workspace: "@building-agent/cli", prefix: "apps/cli" },
  { files: webFiles, workspace: "@building-agent/web", prefix: "apps/web" }
].filter((run) => run.files.length > 0);

if (targetedRuns.length > 0) {
  if ((apiFiles.length > 0 || plannerFiles.length > 0) && buildPlanner() !== 0) {
    process.exit(1);
  }
  for (const run of targetedRuns) {
    const status = runWorkspace(run.workspace, run.files, run.prefix);
    if (status !== 0) {
      process.exit(status);
    }
  }
  process.exit(0);
}

if (runIndex !== -1) {
  if (buildPlanner() !== 0) {
    process.exit(1);
  }
  process.exit(runWorkspace("@building-agent/api", apiFiles, "apps/api"));
}

const result = spawnSync(npmBin, ["--workspaces", "--if-present", "run", "test"], spawnOptions);
if (result.error) {
  console.error(`[test] failed to spawn ${npmBin}: ${result.error.message}`);
}
process.exit(result.status ?? 1);
