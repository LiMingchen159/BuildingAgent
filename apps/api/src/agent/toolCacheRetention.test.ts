import {
  closeSync,
  existsSync,
  ftruncateSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { maintainToolCache } from "./toolCacheRetention.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("tool cache retention", () => {
  it("removes expired and least-recently-used cache files without touching project data or symlink targets", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "buildingagent-cache-"));
    temporaryDirectories.push(root);
    const cacheDir = path.join(root, "outputs", ".tool_cache");
    mkdirSync(cacheDir, { recursive: true });
    const authoritativeData = path.join(root, "derived_metrics.db");
    writeFileSync(authoritativeData, "AUTHORITATIVE_DATA");
    symlinkSync(authoritativeData, path.join(cacheDir, "do-not-follow.db"));

    const now = Date.now();
    const expired = path.join(cacheDir, "expired.json");
    const expiredManifest = path.join(cacheDir, "expired_manifest.json");
    const older = path.join(cacheDir, "older.json");
    const newer = path.join(cacheDir, "newer.json");
    writeFileSync(expired, "x".repeat(20));
    writeFileSync(expiredManifest, JSON.stringify({
      requestId: "expired",
      entries: [{ data_file: "outputs/.tool_cache/expired.json" }]
    }));
    writeFileSync(older, "o".repeat(60));
    writeFileSync(newer, "n".repeat(60));
    utimesSync(expired, new Date(now - 48 * 60 * 60 * 1000), new Date(now - 48 * 60 * 60 * 1000));
    utimesSync(expiredManifest, new Date(now - 48 * 60 * 60 * 1000), new Date(now - 48 * 60 * 60 * 1000));
    utimesSync(older, new Date(now - 2_000), new Date(now - 2_000));
    utimesSync(newer, new Date(now - 1_000), new Date(now - 1_000));

    const result = await maintainToolCache(cacheDir, {
      nowMs: now,
      ttlMs: 24 * 60 * 60 * 1000,
      maxBytes: 60,
      activeRequestProtectionMs: 0
    });

    expect(result.deletedFiles).toBe(3);
    expect(result.remainingBytes).toBe(60);
    expect(() => readFileSync(expired)).toThrow();
    expect(() => readFileSync(expiredManifest)).toThrow();
    expect(() => readFileSync(older)).toThrow();
    expect(readFileSync(newer, "utf8")).toBe("n".repeat(60));
    expect(readFileSync(authoritativeData, "utf8")).toBe("AUTHORITATIVE_DATA");
  });

  it("refuses to clean a directory outside the exact tool-cache boundary", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "buildingagent-cache-safe-"));
    temporaryDirectories.push(root);
    await expect(maintainToolCache(root, { maxBytes: 0 })).rejects.toThrow("restricted to a .tool_cache directory");
  });

  it("refuses a symlinked tool-cache directory without deleting external project data", async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), "buildingagent-cache-link-project-"));
    const externalRoot = mkdtempSync(path.join(os.tmpdir(), "buildingagent-cache-link-external-"));
    temporaryDirectories.push(projectRoot, externalRoot);
    const outputDir = path.join(projectRoot, "outputs");
    mkdirSync(outputDir, { recursive: true });
    const authoritativeData = path.join(externalRoot, "derived_metrics.db");
    writeFileSync(authoritativeData, "AUTHORITATIVE_EXTERNAL_DATA");
    const linkedCache = path.join(outputDir, ".tool_cache");
    symlinkSync(externalRoot, linkedCache, "dir");

    await expect(maintainToolCache(linkedCache, { ttlMs: 0, maxBytes: 0 })).rejects.toThrow(
      "refuses linked or non-directory cache paths"
    );
    expect(readFileSync(authoritativeData, "utf8")).toBe("AUTHORITATIVE_EXTERNAL_DATA");
  });

  it("evicts an older cache over 2 GiB while preserving a live request manifest and data pointer", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "buildingagent-cache-large-"));
    temporaryDirectories.push(root);
    const cacheDir = path.join(root, "outputs", ".tool_cache");
    mkdirSync(cacheDir, { recursive: true });
    const now = Date.now();

    const oldLargeFile = path.join(cacheDir, "old_request_call.json");
    const descriptor = openSync(oldLargeFile, "w");
    ftruncateSync(descriptor, 2 * 1024 * 1024 * 1024 + 1024);
    closeSync(descriptor);
    utimesSync(oldLargeFile, new Date(now - 10 * 60 * 1000), new Date(now - 10 * 60 * 1000));

    const liveData = path.join(cacheDir, "req_live_call.json");
    const liveManifest = path.join(cacheDir, "req_live_manifest.json");
    writeFileSync(liveData, "LIVE_RESULT");
    writeFileSync(liveManifest, JSON.stringify({
      requestId: "req_live",
      entries: [{ data_file: "outputs/.tool_cache/req_live_call.json" }]
    }));

    const result = await maintainToolCache(cacheDir, {
      nowMs: now,
      ttlMs: 24 * 60 * 60 * 1000,
      maxBytes: 2 * 1024 * 1024 * 1024,
      activeRequestProtectionMs: 5 * 60 * 1000
    });

    expect(result.deletedFiles).toBe(1);
    expect(existsSync(oldLargeFile)).toBe(false);
    expect(readFileSync(liveData, "utf8")).toBe("LIVE_RESULT");
    expect(JSON.parse(readFileSync(liveManifest, "utf8"))).toMatchObject({ requestId: "req_live" });
  });
});
