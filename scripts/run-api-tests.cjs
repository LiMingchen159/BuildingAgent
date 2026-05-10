const { spawnSync } = require("node:child_process");

const args = process.argv
  .slice(2)
  .filter((arg) => arg !== "--" && arg !== "--run")
  .map((arg) => arg.replace(/^apps\/api\//u, ""));

const result = spawnSync(
  "npm",
  ["--workspace", "@building-agent/api", "exec", "--", "vitest", "run", ...args],
  { stdio: "inherit" }
);

process.exit(result.status ?? 1);
