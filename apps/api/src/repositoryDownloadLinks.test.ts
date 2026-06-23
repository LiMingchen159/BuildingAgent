import { describe, expect, it } from "vitest";
import {
  finalizeAssistantDownloads,
  normalizeRepositoryAssetPath,
  sanitizeRepositoryDownloadMarkdown
} from "./repositoryDownloadLinks.js";

describe("repositoryDownloadLinks", () => {
  it("repairs nested markdown links", () => {
    const input =
      "[file.csv]([file.csv](outputs/file.csv))";
    expect(sanitizeRepositoryDownloadMarkdown(input)).toBe("[file.csv](outputs/file.csv)");
  });

  it("normalizes nested href payloads", () => {
    const corrupted = "[label]([label](outputs/file.csv))";
    expect(normalizeRepositoryAssetPath(corrupted)).toBe("outputs/file.csv");
  });

  it("merges tool and content downloads", () => {
    const merged = finalizeAssistantDownloads(
      [{ path: "outputs/a.csv", filename: "a.csv" }],
      "Download [b.md](outputs/b.md)"
    );
    expect(merged).toEqual([
      { path: "outputs/a.csv", filename: "a.csv" },
      { path: "outputs/b.md", filename: "b.md" }
    ]);
  });
});
