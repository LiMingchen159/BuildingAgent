import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CuratedMemoryStore } from "./agent/curatedMemory.js";
import { looksExecutableMemoryContent } from "./projectMemoryProposals.js";
import { createSeedStore } from "./seed.js";
import { buildServer } from "./server.js";
import { createDeterministicMockProvider } from "./providers.js";

const adaToken = "seed-token-ada";
const graceToken = "seed-token-grace";

function bearer(value: string) {
  return { authorization: `Bearer ${value}` };
}

function isolatedEnv() {
  return { BUILDING_AGENT_DATA_DIR: mkdtempSync(path.join(tmpdir(), "ba-memory-api-")) };
}

describe("memory API and proposals", () => {
  it("serves and patches project user memory", async () => {
    const app = buildServer({
      chatProvider: createDeterministicMockProvider(),
      env: isolatedEnv()
    });
    await app.inject({ method: "POST", url: "/api/projects/project_alpha/select", headers: bearer(adaToken) });

    const initial = await app.inject({
      method: "GET",
      url: "/api/projects/project_alpha/memory/user",
      headers: bearer(adaToken)
    });
    expect(initial.statusCode).toBe(200);
    expect(initial.json().entries).toEqual([]);

    const patched = await app.inject({
      method: "PATCH",
      url: "/api/projects/project_alpha/memory/user",
      headers: bearer(adaToken),
      payload: { entries: ["Prefers concise summaries"] }
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().entries).toEqual(["Prefers concise summaries"]);
  });

  it("blocks project memory patch without configure permission", async () => {
    const app = buildServer({
      chatProvider: createDeterministicMockProvider(),
      env: isolatedEnv()
    });
    await app.inject({ method: "POST", url: "/api/projects/project_gamma/select", headers: bearer(graceToken) });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/projects/project_gamma/memory/project",
      headers: bearer(graceToken),
      payload: { entries: ["Site note"] }
    });
    expect(response.statusCode).toBe(403);
  });

  it("routes executable proposal content away from memory bank", () => {
    expect(looksExecutableMemoryContent("Use TLKW > 0 to determine chiller running status")).toBe(true);
    expect(looksExecutableMemoryContent("Prefers BMS catalog for multi-point queries")).toBe(false);
  });

  it("merges global and project user memory for injection", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ba-memory-merge-"));
    const store = new CuratedMemoryStore(dir);
    store.setGlobalUserEntries("user_a", ["Always reply in Chinese"]);
    store.setEntries("project_a", "user_a", "user", ["Use BMS catalog"], "conv_1");
    const blocks = store.getPromptBlocks("project_a", "user_a", "conv_1");
    expect(blocks.userBlock).toContain("Always reply in Chinese");
    expect(blocks.userBlock).toContain("Use BMS catalog");
    expect(blocks.userEntryCount).toBe(2);
  });
});
