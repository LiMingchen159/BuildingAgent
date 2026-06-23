import { describe, expect, it } from "vitest";
import {
  extractRepositoryDownloadPaths,
  linkifyRepositoryOutputPaths,
  normalizeRepositoryAssetPath,
  sanitizeRepositoryDownloadMarkdown
} from "./repositoryLinks";

describe("linkifyRepositoryOutputPaths", () => {
  it("leaves existing markdown download links unchanged", () => {
    const input =
      "- CSV: [chiller_plant_bms_point_list.csv](outputs/chiller_plant_bms_point_list.csv)";
    expect(linkifyRepositoryOutputPaths(input)).toBe(input);
  });

  it("linkifies bare outputs paths in plain text", () => {
    const input = "Files:\n- outputs/chiller_plant_bms_point_list.csv";
    expect(linkifyRepositoryOutputPaths(input)).toContain(
      "[chiller_plant_bms_point_list.csv](outputs/chiller_plant_bms_point_list.csv)"
    );
  });

  it("repairs nested markdown download links", () => {
    const input =
      "[chiller_plant_bms_point_list.csv]([chiller_plant_bms_point_list.csv](outputs/chiller_plant_bms_point_list.csv))";
    expect(sanitizeRepositoryDownloadMarkdown(input)).toBe(
      "[chiller_plant_bms_point_list.csv](outputs/chiller_plant_bms_point_list.csv)"
    );
  });

  it("normalizes corrupted hrefs to outputs paths", () => {
    const corrupted =
      "[chiller_plant_bms_point_list.csv](outputs/chiller_plant_bms_point_list.csv?token=seed)";
    expect(normalizeRepositoryAssetPath(corrupted)).toBe("outputs/chiller_plant_bms_point_list.csv");
  });

  it("extracts downloads from markdown and bare paths", () => {
    const content =
      "Files:\n- [a.csv](outputs/a.csv)\n- outputs/b.md";
    const downloads = extractRepositoryDownloadPaths(content);
    expect(downloads).toEqual([
      { path: "outputs/a.csv", filename: "a.csv" },
      { path: "outputs/b.md", filename: "b.md" }
    ]);
  });
});
