import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = path.join(packageRoot, "src");

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(entryPath);
    return entry.isFile() && entry.name.endsWith(".ts") ? [entryPath] : [];
  });
}

describe("deployment planner architecture", () => {
  it("has no runtime dependencies", () => {
    const manifest = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8")) as {
      private?: boolean;
      dependencies?: Record<string, string>;
    };
    expect(manifest.private).toBe(true);
    expect(manifest.dependencies ?? {}).toEqual({});
  });

  it("does not import infrastructure, application, persistence, or provider modules", () => {
    const sourceFiles = sourceFilesUnder(sourceRoot);
    const forbiddenNodeModules = new Set([
      "node:child_process",
      "node:crypto",
      "node:fs",
      "node:http",
      "node:https",
      "node:net",
      "node:path",
      "node:process",
      "node:tls",
      "child_process",
      "crypto",
      "fs",
      "http",
      "https",
      "net",
      "path",
      "process",
      "tls"
    ]);
    const forbiddenImportPath = /(?:^|\/)(?:apps?|fastify|better-sqlite3|seed|store|provider|agent)(?:\/|$)/iu;
    for (const sourceFile of sourceFiles) {
      const source = readFileSync(sourceFile, "utf8");
      const importSpecifiers = [...source.matchAll(/(?:from\s+|import\s*\()\s*["']([^"']+)["']/gu)]
        .map((match) => match[1] ?? "");
      expect(importSpecifiers.filter((specifier) =>
        forbiddenNodeModules.has(specifier) || forbiddenImportPath.test(specifier)
      )).toEqual([]);
      expect(source).not.toMatch(/\bfetch\s*\(/u);
      expect(source).not.toMatch(/\bprocess\.env\b/u);
    }
  });

  it("keeps API-only workflow metadata outside the package contract", () => {
    const contractSource = readFileSync(path.join(sourceRoot, "contracts.ts"), "utf8");
    expect(contractSource).not.toContain("agentWorkflow");
    expect(contractSource).not.toContain("FddCheckAgentWorkflow");
  });
});
