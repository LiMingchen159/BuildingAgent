import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { repoRootForProject } from "./knowledgeBase.js";
import { registerToolCacheEntry, toolCacheManifestRelativePath } from "./toolCacheManifest.js";
import type { AgentToolContext } from "./types.js";

const PROJECT_ID = "project_manifest_test";

function context(requestId: string, toolCallId: string): AgentToolContext {
  return {
    projectId: PROJECT_ID,
    userId: "user_test",
    requestId,
    conversationId: "conv_test",
    canConfigure: false,
    messages: [],
    toolCallId
  };
}

afterEach(() => {
  const manifest = path.join(
    repoRootForProject(PROJECT_ID),
    toolCacheManifestRelativePath("req_manifest_test")
  );
  if (existsSync(manifest)) {
    rmSync(manifest);
  }
});

describe("toolCacheManifest", () => {
  it("accumulates data_file entries for a request", () => {
    const req = "req_manifest_test";
    registerToolCacheEntry(context(req, "call_a"), "bms_timeseries_query", "outputs/.tool_cache/a.json", "WCC_6_TLKW");
    const manifestPath = registerToolCacheEntry(
      context(req, "call_b"),
      "bms_timeseries_query",
      "outputs/.tool_cache/b.json",
      "WCC_6_Run_Status"
    );
    expect(manifestPath).toBe(`outputs/.tool_cache/${req}_manifest.json`);
    const stored = JSON.parse(
      readFileSync(path.join(repoRootForProject(PROJECT_ID), manifestPath), "utf8")
    ) as { entries: Array<{ label: string; data_file: string }> };
    expect(stored.entries).toHaveLength(2);
    expect(stored.entries.map((entry) => entry.label).sort()).toEqual(["WCC_6_Run_Status", "WCC_6_TLKW"]);
  });
});
