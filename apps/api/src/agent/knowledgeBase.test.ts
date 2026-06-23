import { describe, expect, it } from "vitest";
import type { KnowledgeBaseDocument } from "../seed.js";
import {
  KB_BMS_GUIDE_NAME,
  KB_CATALOG_SUMMARY_NAME,
  hasKbCatalogSummary,
  kbCatalogPrefetchHintBlock,
  kbCatalogRoutingBlock,
  knowledgeBasePrompt,
  shouldPrefetchKbCatalog,
  sortKnowledgeBaseForPrompt
} from "./knowledgeBase.js";

function doc(path: string, kind: KnowledgeBaseDocument["kind"] = "markdown"): KnowledgeBaseDocument {
  return {
    id: `kb_${path}`,
    projectId: "project_element",
    name: path.split("/").pop() ?? path,
    path,
    kind,
    sizeBytes: 1000
  };
}

describe("knowledgeBase prompt helpers", () => {
  it("pins catalog and BMS guide ahead of PDFs and spreadsheets", () => {
    const ordered = sortKnowledgeBaseForPrompt([
      doc("Poc Project/foo.pdf", "other"),
      doc(KB_CATALOG_SUMMARY_NAME),
      doc("Elements Chiller Plant API.xlsx", "data"),
      doc(KB_BMS_GUIDE_NAME),
      doc("brick_model.ttl", "turtle")
    ]);

    expect(ordered.map((entry) => entry.path)).toEqual([
      KB_CATALOG_SUMMARY_NAME,
      KB_BMS_GUIDE_NAME,
      "brick_model.ttl",
      "Elements Chiller Plant API.xlsx",
      "Poc Project/foo.pdf"
    ]);
  });

  it("emits routing block only when catalog summary exists", () => {
    expect(kbCatalogRoutingBlock([doc(KB_BMS_GUIDE_NAME)])).toBe("");
    const block = kbCatalogRoutingBlock([doc(KB_CATALOG_SUMMARY_NAME), doc(KB_BMS_GUIDE_NAME)]);
    expect(block).toContain("KB ROUTING");
    expect(block).toContain(KB_CATALOG_SUMMARY_NAME);
    expect(block).toContain("§1");
    expect(block).toContain("§5");
    expect(block).toContain("data tools first");
    expect(hasKbCatalogSummary([doc(KB_CATALOG_SUMMARY_NAME)])).toBe(true);
  });

  it("detects catalog questions and emits prefetch hint", () => {
    expect(shouldPrefetchKbCatalog("What points are available?")).toBe(true);
    expect(shouldPrefetchKbCatalog("有哪些点位")).toBe(true);
    expect(shouldPrefetchKbCatalog("equipment inventory list")).toBe(true);
    expect(shouldPrefetchKbCatalog("What is chiller 3 power now?")).toBe(false);
    expect(shouldPrefetchKbCatalog("yesterday show data")).toBe(false);
    expect(shouldPrefetchKbCatalog("昨天 WCC 趋势")).toBe(false);
    const hint = kbCatalogPrefetchHintBlock(
      "What points are available?",
      [doc(KB_CATALOG_SUMMARY_NAME)]
    );
    expect(hint).toContain("KB CATALOG HINT");
    expect(hint).toContain(KB_CATALOG_SUMMARY_NAME);
    expect(hint).toContain("Do not run data-query tools");
    expect(hint).toContain("call data tools directly");
  });

  it("routes values/trends to data tools in the platform block", () => {
    const block = kbCatalogRoutingBlock([doc(KB_CATALOG_SUMMARY_NAME), doc(KB_BMS_GUIDE_NAME)]);
    expect(block).toContain("Values / trends / history");
    expect(block).toContain("do NOT `read_file` KB as a prefetch step");
    expect(block).not.toContain("skill_element_bms_data");
  });

  it("labels pinned files in the knowledge base list", () => {
    const prompt = knowledgeBasePrompt([
      doc("Poc Project/foo.pdf", "other"),
      doc(KB_CATALOG_SUMMARY_NAME),
      doc(KB_BMS_GUIDE_NAME)
    ], 3);

    expect(prompt).toContain("[catalog index — read §1+§5 first]");
    expect(prompt).toContain("[BMS ops — after Summary for fetch questions]");
    expect(prompt.indexOf(KB_CATALOG_SUMMARY_NAME)).toBeLessThan(prompt.indexOf(KB_BMS_GUIDE_NAME));
  });
});
