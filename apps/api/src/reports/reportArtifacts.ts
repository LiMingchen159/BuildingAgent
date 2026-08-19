import { createHash } from "node:crypto";

import type { ReportArtifact } from "./contracts.js";

export const DEFAULT_REPORT_ARTIFACT_LIMITS = Object.freeze({
  maxAssetCount: 100,
  maxAssetBytes: 20 * 1024 * 1024,
  maxTotalBytes: 200 * 1024 * 1024,
  maxPngPixels: 50_000_000
});

export interface ReportArtifactLimits {
  maxAssetCount: number;
  maxAssetBytes: number;
  maxTotalBytes: number;
  maxPngPixels: number;
}

/** Renderer-owned reference. It contains metadata only, never a host filesystem path. */
export interface LatexAssetReference {
  artifactId: string;
  fileName: string;
  mediaType: ReportArtifact["mediaType"];
  checksum: string;
  relativePath: string;
}

/** Opaque run identifiers supplied to the configured artifact store. */
export interface ReportArtifactRunContext {
  storageNamespace: string;
  packageId: string;
  planId: string;
  projectId: string;
}

export interface ReportArtifactReadInput {
  artifact: Readonly<LatexAssetReference>;
  context: Readonly<ReportArtifactRunContext>;
  signal: AbortSignal;
}

export interface ReportArtifactReader {
  read(input: Readonly<ReportArtifactReadInput>): Promise<Uint8Array>;
}

export interface MaterializedLatexAsset extends LatexAssetReference {
  bytes: Uint8Array;
}

export interface MaterializeReportArtifactsInput {
  assets: readonly LatexAssetReference[];
  context: Readonly<ReportArtifactRunContext>;
  signal: AbortSignal;
}

export interface MaterializeReportArtifactsDependencies {
  reader: ReportArtifactReader;
  limits?: Partial<ReportArtifactLimits>;
}

export type ReportArtifactMaterializationErrorCode =
  | "artifact_aborted"
  | "artifact_limit_exceeded"
  | "artifact_read_failed"
  | "invalid_artifact"
  | "unsupported_asset";

export class ReportArtifactMaterializationError extends Error {
  readonly code: ReportArtifactMaterializationErrorCode;

  constructor(code: ReportArtifactMaterializationErrorCode, message: string) {
    super(message);
    this.name = "ReportArtifactMaterializationError";
    this.code = code;
  }
}

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SAFE_OPAQUE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/u;
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/u;
const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

function fail(
  code: ReportArtifactMaterializationErrorCode,
  message: string
): never {
  throw new ReportArtifactMaterializationError(code, message);
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    return fail("artifact_limit_exceeded", `${name} must be a positive safe integer.`);
  }
  return value;
}

function resolvedLimits(overrides: Partial<ReportArtifactLimits> | undefined): ReportArtifactLimits {
  return {
    maxAssetCount: positiveInteger(
      overrides?.maxAssetCount ?? DEFAULT_REPORT_ARTIFACT_LIMITS.maxAssetCount,
      "maxAssetCount"
    ),
    maxAssetBytes: positiveInteger(
      overrides?.maxAssetBytes ?? DEFAULT_REPORT_ARTIFACT_LIMITS.maxAssetBytes,
      "maxAssetBytes"
    ),
    maxTotalBytes: positiveInteger(
      overrides?.maxTotalBytes ?? DEFAULT_REPORT_ARTIFACT_LIMITS.maxTotalBytes,
      "maxTotalBytes"
    ),
    maxPngPixels: positiveInteger(
      overrides?.maxPngPixels ?? DEFAULT_REPORT_ARTIFACT_LIMITS.maxPngPixels,
      "maxPngPixels"
    )
  };
}

function nonEmpty(value: unknown, maxLength: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && value === value.trim()
    && !value.includes("\0");
}

function safeRelativePath(value: string): boolean {
  if (
    !nonEmpty(value, 1024)
    || value.startsWith("/")
    || value.includes("\\")
    || /^[A-Za-z]:\//u.test(value)
  ) return false;
  const segments = value.split("/");
  return segments.every((segment) => (
    SAFE_PATH_SEGMENT.test(segment)
    && segment !== "."
    && segment !== ".."
    && !segment.includes("..")
  ));
}

function expectedExtension(mediaType: ReportArtifact["mediaType"]): string {
  if (mediaType === "image/png") return ".png";
  if (mediaType === "application/pdf") return ".pdf";
  return ".svg";
}

function validateReference(asset: LatexAssetReference): void {
  if (!nonEmpty(asset.artifactId, 256)) {
    fail("invalid_artifact", "Artifact ID is invalid.");
  }
  if (
    !SAFE_FILE_NAME.test(asset.fileName)
    || asset.fileName === "."
    || asset.fileName === ".."
    || asset.fileName.includes("..")
  ) {
    fail("invalid_artifact", "Artifact file name is unsafe.");
  }
  if (!safeRelativePath(asset.relativePath)) {
    fail("invalid_artifact", "Artifact relative path is unsafe.");
  }
  if (!SHA256_PATTERN.test(asset.checksum)) {
    fail("invalid_artifact", "Artifact checksum must be a canonical SHA-256 value.");
  }
  if (asset.mediaType === "image/svg+xml") {
    fail("unsupported_asset", "SVG report assets are not supported by the safe LaTeX pipeline.");
  }
  if (asset.mediaType !== "image/png" && asset.mediaType !== "application/pdf") {
    fail("unsupported_asset", "Report asset media type is unsupported.");
  }
  const extension = expectedExtension(asset.mediaType);
  if (
    !asset.fileName.toLocaleLowerCase("en").endsWith(extension)
    || !asset.relativePath.toLocaleLowerCase("en").endsWith(extension)
  ) {
    fail("invalid_artifact", "Artifact file extension does not match its media type.");
  }
}

function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (bytes.byteLength < prefix.byteLength) return false;
  for (let index = 0; index < prefix.byteLength; index += 1) {
    if (bytes[index] !== prefix[index]) return false;
  }
  return true;
}

function pngDimensions(bytes: Uint8Array, maxPngPixels: number): { width: number; height: number } {
  if (
    bytes.byteLength < 33
    || !startsWith(bytes, PNG_MAGIC)
    || bytes[8] !== 0x00
    || bytes[9] !== 0x00
    || bytes[10] !== 0x00
    || bytes[11] !== 0x0d
    || bytes[12] !== 0x49
    || bytes[13] !== 0x48
    || bytes[14] !== 0x44
    || bytes[15] !== 0x52
  ) {
    return fail("invalid_artifact", "PNG artifact is missing a canonical IHDR header.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  const pixels = width * height;
  if (
    width < 1
    || height < 1
    || !Number.isSafeInteger(pixels)
    || pixels > maxPngPixels
  ) {
    return fail("artifact_limit_exceeded", "PNG dimensions exceed the configured pixel limit.");
  }
  return { width, height };
}

function validateBytes(asset: LatexAssetReference, bytes: Uint8Array, maxPngPixels: number): void {
  const matchesMediaType = asset.mediaType === "image/png"
    ? startsWith(bytes, PNG_MAGIC)
    : startsWith(bytes, PDF_MAGIC);
  if (!matchesMediaType) {
    fail("invalid_artifact", "Artifact bytes do not match the declared media type.");
  }
  if (asset.mediaType === "image/png") pngDimensions(bytes, maxPngPixels);
  const checksum = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (checksum !== asset.checksum) {
    fail("invalid_artifact", "Artifact checksum verification failed.");
  }
}

function frozenReference(asset: LatexAssetReference): Readonly<LatexAssetReference> {
  return Object.freeze({
    artifactId: asset.artifactId,
    fileName: asset.fileName,
    mediaType: asset.mediaType,
    checksum: asset.checksum,
    relativePath: asset.relativePath
  });
}

function frozenContext(context: Readonly<ReportArtifactRunContext>): Readonly<ReportArtifactRunContext> {
  for (const value of Object.values(context)) {
    if (
      !nonEmpty(value, 512)
      || !SAFE_OPAQUE_TOKEN.test(value)
      || value.includes("..")
      || value.includes("/")
      || value.includes("\\")
    ) fail("invalid_artifact", "Artifact run context is invalid.");
  }
  return Object.freeze({
    storageNamespace: context.storageNamespace,
    packageId: context.packageId,
    planId: context.planId,
    projectId: context.projectId
  });
}

async function readWithAbort(
  reader: ReportArtifactReader,
  artifact: Readonly<LatexAssetReference>,
  context: Readonly<ReportArtifactRunContext>,
  signal: AbortSignal
): Promise<Uint8Array> {
  if (signal.aborted) return fail("artifact_aborted", "Report artifact materialization was aborted.");
  let removeListener = (): void => {};
  const aborted = new Promise<never>((_, reject) => {
    const onAbort = (): void => reject(new ReportArtifactMaterializationError(
      "artifact_aborted",
      "Report artifact materialization was aborted."
    ));
    signal.addEventListener("abort", onAbort, { once: true });
    removeListener = () => signal.removeEventListener("abort", onAbort);
    if (signal.aborted) onAbort();
  });
  try {
    const read = Promise.resolve(reader.read(Object.freeze({ artifact, context, signal })));
    const bytes = await Promise.race([read, aborted]);
    if (signal.aborted) return fail("artifact_aborted", "Report artifact materialization was aborted.");
    if (!(bytes instanceof Uint8Array)) {
      return fail("artifact_read_failed", "Report artifact reader returned invalid bytes.");
    }
    return bytes;
  } catch (error) {
    if (error instanceof ReportArtifactMaterializationError) throw error;
    if (signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      return fail("artifact_aborted", "Report artifact materialization was aborted.");
    }
    return fail("artifact_read_failed", "Report artifact bytes could not be read.");
  } finally {
    removeListener();
  }
}

/**
 * Materialize renderer-selected artifacts through a narrow injected store boundary.
 * This function never joins or opens relativePath itself.
 */
export async function materializeReportArtifacts(
  input: Readonly<MaterializeReportArtifactsInput>,
  dependencies: Readonly<MaterializeReportArtifactsDependencies>
): Promise<MaterializedLatexAsset[]> {
  if (!Array.isArray(input.assets)) fail("invalid_artifact", "Report assets must be an array.");
  const limits = resolvedLimits(dependencies.limits);
  if (input.assets.length > limits.maxAssetCount) {
    fail("artifact_limit_exceeded", "Report asset count exceeds the configured limit.");
  }
  if (!dependencies.reader || typeof dependencies.reader.read !== "function") {
    fail("artifact_read_failed", "Report artifact reader is unavailable.");
  }
  if (input.signal.aborted) fail("artifact_aborted", "Report artifact materialization was aborted.");

  const context = frozenContext(input.context);
  const artifactIds = new Set<string>();
  const fileNames = new Set<string>();
  const references = input.assets.map((candidate) => {
    const asset = frozenReference(candidate);
    validateReference(asset);
    if (artifactIds.has(asset.artifactId) || fileNames.has(asset.fileName)) {
      fail("invalid_artifact", "Report assets contain a duplicate ID or file name.");
    }
    artifactIds.add(asset.artifactId);
    fileNames.add(asset.fileName);
    return asset;
  });

  let totalBytes = 0;
  const materialized: MaterializedLatexAsset[] = [];
  for (const asset of references) {
    const bytes = await readWithAbort(dependencies.reader, asset, context, input.signal);
    if (bytes.byteLength === 0 || bytes.byteLength > limits.maxAssetBytes) {
      fail("artifact_limit_exceeded", "Report asset size exceeds the configured limit.");
    }
    totalBytes += bytes.byteLength;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > limits.maxTotalBytes) {
      fail("artifact_limit_exceeded", "Total report asset size exceeds the configured limit.");
    }
    const ownedBytes = new Uint8Array(bytes);
    validateBytes(asset, ownedBytes, limits.maxPngPixels);
    materialized.push({ ...asset, bytes: ownedBytes });
  }
  return materialized;
}
