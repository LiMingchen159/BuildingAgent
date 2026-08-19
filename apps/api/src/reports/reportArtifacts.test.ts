import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  materializeReportArtifacts,
  ReportArtifactMaterializationError,
  type LatexAssetReference,
  type ReportArtifactReader,
  type ReportArtifactRunContext
} from "./reportArtifacts.js";

function pngBytes(width = 1, height = 1): Uint8Array {
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00
  ]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes;
}

const PNG_BYTES = pngBytes();
const PDF_BYTES = new TextEncoder().encode("%PDF-1.7\nfixture");
const CONTEXT: ReportArtifactRunContext = {
  storageNamespace: "run_opaque_fixture",
  packageId: "evidence-package-fixture",
  planId: "plan-fixture",
  projectId: "project-fixture"
};

function checksum(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function asset(
  bytes: Uint8Array,
  overrides: Partial<LatexAssetReference> = {}
): LatexAssetReference {
  const mediaType = overrides.mediaType ?? "image/png";
  return {
    artifactId: overrides.artifactId ?? "artifact-fixture",
    fileName: overrides.fileName ?? (mediaType === "application/pdf" ? "asset-0001.pdf" : "asset-0001.png"),
    mediaType,
    checksum: overrides.checksum ?? checksum(bytes),
    relativePath: overrides.relativePath ?? "evidence/safe/artifact.png"
  };
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    name: "ReportArtifactMaterializationError",
    code
  });
}

describe("materializeReportArtifacts", () => {
  it("reads ordered assets through opaque frozen context and returns byte clones", async () => {
    const pngSource = new Uint8Array(PNG_BYTES);
    const pdfSource = new Uint8Array(PDF_BYTES);
    const references = [
      asset(pngSource),
      asset(pdfSource, {
        artifactId: "artifact-pdf",
        fileName: "asset-0002.pdf",
        mediaType: "application/pdf",
        relativePath: "evidence/safe/artifact.pdf"
      })
    ];
    const original = structuredClone(references);
    const read = vi.fn<ReportArtifactReader["read"]>(async ({ artifact, context, signal }) => {
      expect(Object.isFrozen(artifact)).toBe(true);
      expect(Object.isFrozen(context)).toBe(true);
      expect(context).toEqual(CONTEXT);
      expect(signal.aborted).toBe(false);
      return artifact.artifactId === "artifact-pdf" ? pdfSource : pngSource;
    });

    const result = await materializeReportArtifacts({
      assets: references,
      context: CONTEXT,
      signal: new AbortController().signal
    }, { reader: { read } });

    expect(read).toHaveBeenCalledTimes(2);
    expect(result.map((entry) => entry.artifactId)).toEqual(["artifact-fixture", "artifact-pdf"]);
    expect(result[0]!.bytes).toEqual(pngSource);
    expect(result[1]!.bytes).toEqual(pdfSource);
    expect(result[0]!.bytes).not.toBe(pngSource);
    expect(result[1]!.bytes).not.toBe(pdfSource);
    pngSource[24] = 0xff;
    expect(result[0]!.bytes[24]).toBe(0x08);
    expect(references).toEqual(original);
  });

  it("rejects SVG before the reader is called", async () => {
    const read = vi.fn<ReportArtifactReader["read"]>();
    const reference = asset(new TextEncoder().encode("<svg/>"), {
      fileName: "asset-0001.svg",
      mediaType: "image/svg+xml",
      relativePath: "evidence/safe/artifact.svg"
    });

    await expectCode(materializeReportArtifacts({
      assets: [reference],
      context: CONTEXT,
      signal: new AbortController().signal
    }, { reader: { read } }), "unsupported_asset");
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    ["checksum mismatch", asset(PNG_BYTES, { checksum: `sha256:${"0".repeat(64)}` })],
    ["media magic mismatch", asset(PNG_BYTES, { fileName: "asset-0001.pdf", mediaType: "application/pdf" })]
  ])("rejects %s", async (_label, reference) => {
    await expectCode(materializeReportArtifacts({
      assets: [reference],
      context: CONTEXT,
      signal: new AbortController().signal
    }, { reader: { async read() { return new Uint8Array(PNG_BYTES); } } }), "invalid_artifact");
  });

  it.each([
    ["../artifact.png", "evidence/safe/artifact.png"],
    ["asset.png", "../outside.png"],
    ["asset.png", "/absolute/artifact.png"],
    ["asset.png", "evidence\\artifact.png"],
    ["asset.png", "C:/outside/artifact.png"],
    ["asset.png", "evidence/safe/artifact.pdf"]
  ])("rejects unsafe file/path metadata %s %s without reading", async (fileName, relativePath) => {
    const read = vi.fn<ReportArtifactReader["read"]>();
    await expectCode(materializeReportArtifacts({
      assets: [asset(PNG_BYTES, { fileName, relativePath })],
      context: CONTEXT,
      signal: new AbortController().signal
    }, { reader: { read } }), "invalid_artifact");
    expect(read).not.toHaveBeenCalled();
  });

  it("rejects duplicate IDs and file names before reading", async () => {
    const read = vi.fn<ReportArtifactReader["read"]>();
    const first = asset(PNG_BYTES);
    const duplicate = asset(PNG_BYTES, { relativePath: "evidence/safe/second.png" });

    await expectCode(materializeReportArtifacts({
      assets: [first, duplicate],
      context: CONTEXT,
      signal: new AbortController().signal
    }, { reader: { read } }), "invalid_artifact");
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    { storageNamespace: "../run", packageId: "package", planId: "plan", projectId: "project" },
    { storageNamespace: "run", packageId: "package/child", planId: "plan", projectId: "project" },
    { storageNamespace: "run", packageId: "package", planId: "plan\\child", projectId: "project" },
    { storageNamespace: "run", packageId: "package", planId: "plan", projectId: "project\u0001" }
  ])("rejects path-like or control-bearing opaque context before reading", async (context) => {
    const read = vi.fn<ReportArtifactReader["read"]>();
    await expectCode(materializeReportArtifacts({
      assets: [asset(PNG_BYTES)], context, signal: new AbortController().signal
    }, { reader: { read } }), "invalid_artifact");
    expect(read).not.toHaveBeenCalled();
  });

  it("validates PNG IHDR dimensions and enforces the pixel ceiling", async () => {
    const oversized = pngBytes(10_000, 10_000);
    await expectCode(materializeReportArtifacts({
      assets: [asset(oversized)], context: CONTEXT, signal: new AbortController().signal
    }, { reader: { async read() { return oversized; } }, limits: { maxPngPixels: 1_000_000 } }), "artifact_limit_exceeded");

    const missingIhdr = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...new Uint8Array(25)
    ]);
    await expectCode(materializeReportArtifacts({
      assets: [asset(missingIhdr)], context: CONTEXT, signal: new AbortController().signal
    }, { reader: { async read() { return missingIhdr; } } }), "invalid_artifact");
  });

  it("enforces count, per-asset, and total byte limits", async () => {
    const first = asset(PNG_BYTES);
    const second = asset(PNG_BYTES, {
      artifactId: "artifact-second",
      fileName: "asset-0002.png",
      relativePath: "evidence/safe/second.png"
    });
    const reader: ReportArtifactReader = { async read() { return new Uint8Array(PNG_BYTES); } };

    await expectCode(materializeReportArtifacts({
      assets: [first, second], context: CONTEXT, signal: new AbortController().signal
    }, { reader, limits: { maxAssetCount: 1 } }), "artifact_limit_exceeded");
    await expectCode(materializeReportArtifacts({
      assets: [first], context: CONTEXT, signal: new AbortController().signal
    }, { reader, limits: { maxAssetBytes: PNG_BYTES.byteLength - 1 } }), "artifact_limit_exceeded");
    await expectCode(materializeReportArtifacts({
      assets: [first, second], context: CONTEXT, signal: new AbortController().signal
    }, { reader, limits: { maxTotalBytes: (PNG_BYTES.byteLength * 2) - 1 } }), "artifact_limit_exceeded");
  });

  it("fails immediately when already aborted and while a reader is pending", async () => {
    const before = new AbortController();
    before.abort();
    const read = vi.fn<ReportArtifactReader["read"]>();
    await expectCode(materializeReportArtifacts({
      assets: [asset(PNG_BYTES)], context: CONTEXT, signal: before.signal
    }, { reader: { read } }), "artifact_aborted");
    expect(read).not.toHaveBeenCalled();

    const during = new AbortController();
    const pending = materializeReportArtifacts({
      assets: [asset(PNG_BYTES)], context: CONTEXT, signal: during.signal
    }, { reader: { async read() { return new Promise<Uint8Array>(() => undefined); } } });
    during.abort();
    await expectCode(pending, "artifact_aborted");
  });

  it("sanitizes reader failures", async () => {
    const result = materializeReportArtifacts({
      assets: [asset(PNG_BYTES)], context: CONTEXT, signal: new AbortController().signal
    }, { reader: { async read() { throw new Error("secret /server/path"); } } });
    await expectCode(result, "artifact_read_failed");
    await result.catch((error: unknown) => {
      expect(error).toBeInstanceOf(ReportArtifactMaterializationError);
      expect((error as Error).message).not.toContain("secret");
      expect((error as Error).message).not.toContain("/server/path");
    });
  });
});
