import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, chmod, lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  renderReportLatex,
  type LatexSourceAsset,
  type LatexSourceBundle,
  type RenderReportLatexInput
} from "./latexRenderer.js";
import type { MaterializedLatexAsset } from "./reportArtifacts.js";
import {
  DEFAULT_LATEX_TEMPLATE_ID,
  DEFAULT_LATEX_TEMPLATE_VERSION
} from "./templates/defaultLatexTemplate.js";

export const PRLIMIT_EXECUTABLE = "/usr/bin/prlimit" as const;
export const XELATEX_EXECUTABLE = "/usr/bin/xelatex" as const;
export const XELATEX_ARGUMENTS = Object.freeze([
  "-no-shell-escape",
  "-halt-on-error",
  "-interaction=nonstopmode",
  "-file-line-error",
  "report.tex"
] as const);

export const XELATEX_RESOURCE_LIMITS = Object.freeze({
  cpuSeconds: 60,
  addressSpaceBytes: 2 * 1024 * 1024 * 1024,
  fileSizeBytes: 100 * 1024 * 1024,
  processCount: 32,
  openFiles: 128,
  coreBytes: 0
});

export const PRLIMIT_ARGUMENTS: readonly string[] = Object.freeze([
  `--cpu=${XELATEX_RESOURCE_LIMITS.cpuSeconds}:${XELATEX_RESOURCE_LIMITS.cpuSeconds}`,
  `--as=${XELATEX_RESOURCE_LIMITS.addressSpaceBytes}:${XELATEX_RESOURCE_LIMITS.addressSpaceBytes}`,
  `--fsize=${XELATEX_RESOURCE_LIMITS.fileSizeBytes}:${XELATEX_RESOURCE_LIMITS.fileSizeBytes}`,
  `--nproc=${XELATEX_RESOURCE_LIMITS.processCount}:${XELATEX_RESOURCE_LIMITS.processCount}`,
  `--nofile=${XELATEX_RESOURCE_LIMITS.openFiles}:${XELATEX_RESOURCE_LIMITS.openFiles}`,
  `--core=${XELATEX_RESOURCE_LIMITS.coreBytes}:${XELATEX_RESOURCE_LIMITS.coreBytes}`,
  "--",
  XELATEX_EXECUTABLE,
  ...XELATEX_ARGUMENTS
]);

export const MINIMAL_XELATEX_ENVIRONMENT: Readonly<Record<string, string>> = Object.freeze({
  FORCE_SOURCE_DATE: "1",
  LANG: "C.UTF-8",
  LC_ALL: "C.UTF-8",
  SOURCE_DATE_EPOCH: "0",
  TZ: "UTC",
  openin_any: "p",
  openout_any: "p"
});

export const DEFAULT_REPORT_PDF_COMPILER_LIMITS = Object.freeze({
  maxSourceBytes: 2 * 1024 * 1024,
  maxAssetCount: 100,
  maxAssetBytes: 20 * 1024 * 1024,
  maxTotalAssetBytes: 200 * 1024 * 1024,
  maxPngPixels: 50_000_000,
  maxPdfBytes: 100 * 1024 * 1024,
  maxLogBytes: 1024 * 1024,
  passTimeoutMs: 60_000,
  queueTimeoutMs: 60_000,
  settlementGraceMs: 5_000
});

export interface ReportPdfCompilerLimits {
  maxSourceBytes: number;
  maxAssetCount: number;
  maxAssetBytes: number;
  maxTotalAssetBytes: number;
  maxPngPixels: number;
  maxPdfBytes: number;
  maxLogBytes: number;
  passTimeoutMs: number;
  queueTimeoutMs: number;
  settlementGraceMs: number;
}

export interface ReportPdfCompileInput {
  /** Structured report facts only. Raw or pre-rendered LaTeX is never accepted here. */
  renderInput: Readonly<RenderReportLatexInput>;
  assets: readonly MaterializedLatexAsset[];
  signal: AbortSignal;
}

export interface ReportPdfCompilerDescriptor {
  compilerId: "xelatex-prlimit-process";
  compilerVersion: "2";
  engine: "xelatex";
  launcherExecutable: typeof PRLIMIT_EXECUTABLE;
  engineExecutable: typeof XELATEX_EXECUTABLE;
  launcherArguments: readonly string[];
  engineArguments: typeof XELATEX_ARGUMENTS;
  resourceLimits: typeof XELATEX_RESOURCE_LIMITS;
  environment: Readonly<Record<string, string>>;
  shell: false;
  maxConcurrency: 2;
}

export interface CompiledReportPdf {
  mediaType: "application/pdf";
  bytes: Uint8Array;
  checksum: string;
  source: {
    documentId: string;
    documentRevision: string;
    sourceHash: string;
    templateId: string;
    templateVersion: string;
  };
  compiler: ReportPdfCompilerDescriptor;
}

export interface ReportPdfCompiler {
  readonly descriptor: ReportPdfCompilerDescriptor;
  compile(input: Readonly<ReportPdfCompileInput>): Promise<CompiledReportPdf>;
}

export interface LatexProcessInvocation {
  executable: typeof PRLIMIT_EXECUTABLE;
  arguments: readonly string[];
  environment: Readonly<Record<string, string>>;
  cwd: string;
  shell: false;
  pass: 1 | 2;
  maxOutputBytes: number;
  signal: AbortSignal;
}

export interface LatexProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: Uint8Array;
  stderr: Uint8Array;
  outputLimitExceeded?: boolean;
}

export interface LatexProcessRunner {
  /** Resolves only after the child process and its pipes have closed. */
  run(input: Readonly<LatexProcessInvocation>): Promise<LatexProcessResult>;
}

export interface WorkingDirectoryRemover {
  remove(workingDirectory: string): Promise<void>;
}

export type ReportPdfCompilerErrorCode =
  | "cleanup_failed"
  | "compile_aborted"
  | "compile_failed"
  | "compile_timeout"
  | "compiler_output_too_large"
  | "compiler_settlement_failed"
  | "compiler_unavailable"
  | "invalid_asset"
  | "invalid_pdf"
  | "invalid_source";

export class ReportPdfCompilerError extends Error {
  readonly code: ReportPdfCompilerErrorCode;

  constructor(code: ReportPdfCompilerErrorCode, message: string) {
    super(message);
    this.name = "ReportPdfCompilerError";
    this.code = code;
  }
}

export interface CreateXeLatexProcessCompilerOptions {
  runner?: LatexProcessRunner;
  limits?: Partial<ReportPdfCompilerLimits>;
  temporaryRoot?: string;
  remover?: WorkingDirectoryRemover;
  executableProbe?: (paths: readonly string[]) => Promise<boolean>;
}

const COMPILER_DESCRIPTOR: ReportPdfCompilerDescriptor = Object.freeze({
  compilerId: "xelatex-prlimit-process",
  compilerVersion: "2",
  engine: "xelatex",
  launcherExecutable: PRLIMIT_EXECUTABLE,
  engineExecutable: XELATEX_EXECUTABLE,
  launcherArguments: PRLIMIT_ARGUMENTS,
  engineArguments: XELATEX_ARGUMENTS,
  resourceLimits: XELATEX_RESOURCE_LIMITS,
  environment: MINIMAL_XELATEX_ENVIRONMENT,
  shell: false,
  maxConcurrency: 2
});
const SAFE_DOCUMENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CLEANUP_ATTEMPTS = 3;
const MAX_CONCURRENCY = 2;

class LatexExecutableUnavailable extends Error {}

function isExecutableUnavailable(error: unknown): boolean {
  return error instanceof LatexExecutableUnavailable
    || (
      typeof error === "object"
      && error !== null
      && "code" in error
      && (error as { code?: unknown }).code === "ENOENT"
    );
}

function fail(code: ReportPdfCompilerErrorCode, message: string): never {
  throw new ReportPdfCompilerError(code, message);
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    return fail("invalid_source", `${name} must be a positive safe integer.`);
  }
  return value;
}

function resolvedLimits(overrides: Partial<ReportPdfCompilerLimits> | undefined): ReportPdfCompilerLimits {
  return {
    maxSourceBytes: positiveInteger(overrides?.maxSourceBytes ?? DEFAULT_REPORT_PDF_COMPILER_LIMITS.maxSourceBytes, "maxSourceBytes"),
    maxAssetCount: positiveInteger(overrides?.maxAssetCount ?? DEFAULT_REPORT_PDF_COMPILER_LIMITS.maxAssetCount, "maxAssetCount"),
    maxAssetBytes: positiveInteger(overrides?.maxAssetBytes ?? DEFAULT_REPORT_PDF_COMPILER_LIMITS.maxAssetBytes, "maxAssetBytes"),
    maxTotalAssetBytes: positiveInteger(overrides?.maxTotalAssetBytes ?? DEFAULT_REPORT_PDF_COMPILER_LIMITS.maxTotalAssetBytes, "maxTotalAssetBytes"),
    maxPngPixels: positiveInteger(overrides?.maxPngPixels ?? DEFAULT_REPORT_PDF_COMPILER_LIMITS.maxPngPixels, "maxPngPixels"),
    maxPdfBytes: positiveInteger(overrides?.maxPdfBytes ?? DEFAULT_REPORT_PDF_COMPILER_LIMITS.maxPdfBytes, "maxPdfBytes"),
    maxLogBytes: positiveInteger(overrides?.maxLogBytes ?? DEFAULT_REPORT_PDF_COMPILER_LIMITS.maxLogBytes, "maxLogBytes"),
    passTimeoutMs: positiveInteger(overrides?.passTimeoutMs ?? DEFAULT_REPORT_PDF_COMPILER_LIMITS.passTimeoutMs, "passTimeoutMs"),
    queueTimeoutMs: positiveInteger(overrides?.queueTimeoutMs ?? DEFAULT_REPORT_PDF_COMPILER_LIMITS.queueTimeoutMs, "queueTimeoutMs"),
    settlementGraceMs: positiveInteger(overrides?.settlementGraceMs ?? DEFAULT_REPORT_PDF_COMPILER_LIMITS.settlementGraceMs, "settlementGraceMs")
  };
}

function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (bytes.byteLength < prefix.byteLength) return false;
  for (let index = 0; index < prefix.byteLength; index += 1) {
    if (bytes[index] !== prefix[index]) return false;
  }
  return true;
}

function sha256Bytes(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function sha256Text(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function validatePng(bytes: Uint8Array, maxPngPixels: number): void {
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
  ) fail("invalid_asset", "A PNG report asset is missing a canonical IHDR header.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  const pixels = width * height;
  if (width < 1 || height < 1 || !Number.isSafeInteger(pixels) || pixels > maxPngPixels) {
    fail("invalid_asset", "A PNG report asset exceeds the configured pixel limit.");
  }
}

function validateAsset(asset: MaterializedLatexAsset, maxPngPixels: number): void {
  if (
    !asset
    || typeof asset !== "object"
    || !SAFE_FILE_NAME.test(asset.fileName)
    || asset.fileName.includes("..")
    || asset.fileName.toLocaleLowerCase("en").startsWith("report.")
    || (asset.mediaType !== "image/png" && asset.mediaType !== "application/pdf")
    || !(asset.bytes instanceof Uint8Array)
    || asset.bytes.byteLength === 0
    || !SHA256_PATTERN.test(asset.checksum)
  ) fail("invalid_asset", "A materialized report asset is invalid.");
  const extension = asset.mediaType === "image/png" ? ".png" : ".pdf";
  const magic = asset.mediaType === "image/png" ? PNG_MAGIC : PDF_MAGIC;
  if (!asset.fileName.toLocaleLowerCase("en").endsWith(extension) || !startsWith(asset.bytes, magic)) {
    fail("invalid_asset", "A materialized report asset does not match its declared media type.");
  }
  if (asset.mediaType === "image/png") validatePng(asset.bytes, maxPngPixels);
  if (sha256Bytes(asset.bytes) !== asset.checksum) {
    fail("invalid_asset", "A materialized report asset checksum is invalid.");
  }
}

function sameManifestAsset(reference: LatexSourceAsset, asset: MaterializedLatexAsset): boolean {
  return reference.artifactId === asset.artifactId
    && reference.fileName === asset.fileName
    && reference.mediaType === asset.mediaType
    && reference.checksum === asset.checksum
    && reference.relativePath === asset.relativePath;
}

function validateRenderedBundle(
  bundle: Readonly<LatexSourceBundle>,
  assets: readonly MaterializedLatexAsset[],
  limits: ReportPdfCompilerLimits
): void {
  if (!bundle || typeof bundle !== "object") fail("invalid_source", "A rendered LaTeX source bundle is required.");
  if (
    bundle.templateId !== DEFAULT_LATEX_TEMPLATE_ID
    || bundle.templateVersion !== DEFAULT_LATEX_TEMPLATE_VERSION
  ) fail("invalid_source", "Rendered LaTeX template identity is unsupported.");
  if (
    !SAFE_DOCUMENT_ID.test(bundle.documentId)
    || !SHA256_PATTERN.test(bundle.documentRevision)
    || !SHA256_PATTERN.test(bundle.sourceHash)
  ) fail("invalid_source", "Rendered LaTeX document provenance is invalid.");
  if (
    typeof bundle.source !== "string"
    || bundle.source.length === 0
    || bundle.source.includes("\0")
    || Buffer.byteLength(bundle.source, "utf8") > limits.maxSourceBytes
    || sha256Text(bundle.source) !== bundle.sourceHash
  ) fail("invalid_source", "Rendered LaTeX source is invalid or exceeds the configured limit.");
  if (
    !Array.isArray(bundle.assets)
    || !Array.isArray(assets)
    || bundle.assets.length !== assets.length
    || bundle.assets.length > limits.maxAssetCount
  ) fail("invalid_asset", "Rendered and materialized asset manifests do not match.");

  const ids = new Set<string>();
  const names = new Set<string>();
  let totalBytes = 0;
  for (const [index, asset] of assets.entries()) {
    const reference = bundle.assets[index];
    if (!reference || !sameManifestAsset(reference, asset)) {
      fail("invalid_asset", "Rendered and materialized asset manifests do not match.");
    }
    validateAsset(asset, limits.maxPngPixels);
    if (ids.has(asset.artifactId) || names.has(asset.fileName)) {
      fail("invalid_asset", "Materialized report assets must have unique IDs and file names.");
    }
    ids.add(asset.artifactId);
    names.add(asset.fileName);
    if (asset.bytes.byteLength > limits.maxAssetBytes) {
      fail("invalid_asset", "A materialized report asset exceeds the configured size limit.");
    }
    totalBytes += asset.bytes.byteLength;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > limits.maxTotalAssetBytes) {
      fail("invalid_asset", "Materialized report assets exceed the configured total size limit.");
    }
  }
}

function snapshotInput(input: Readonly<ReportPdfCompileInput>): {
  renderInput: RenderReportLatexInput;
  assets: MaterializedLatexAsset[];
} {
  try {
    return {
      renderInput: structuredClone(input.renderInput),
      assets: structuredClone(input.assets) as MaterializedLatexAsset[]
    };
  } catch {
    return fail("invalid_source", "Structured report compiler input could not be snapshotted safely.");
  }
}

function renderTrustedBundle(renderInput: RenderReportLatexInput): LatexSourceBundle {
  try {
    const rendered = renderReportLatex(renderInput);
    if (!rendered.ok) {
      fail("invalid_source", "Structured report input failed renderer validation.");
    }
    return rendered.value;
  } catch (error) {
    if (error instanceof ReportPdfCompilerError) throw error;
    return fail("invalid_source", "Structured report input could not be rendered safely.");
  }
}

function terminateProcess(pid: number | undefined, kill: (signal?: NodeJS.Signals) => boolean): void {
  if (pid !== undefined && process.platform !== "win32") {
    try {
      process.kill(-pid, "SIGKILL");
      return;
    } catch {
      // Fall through to the direct child handle.
    }
  }
  try {
    kill("SIGKILL");
  } catch {
    // The child already exited.
  }
}

const nodeProcessRunner: LatexProcessRunner = {
  run(input) {
    return new Promise<LatexProcessResult>((resolve, reject) => {
      let settled = false;
      let outputLimitExceeded = false;
      let outputBytes = 0;
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      const child = spawn(input.executable, [...input.arguments], {
        cwd: input.cwd,
        shell: false,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...input.environment }
      });
      const finishReject = (error: Error): void => {
        if (settled) return;
        settled = true;
        input.signal.removeEventListener("abort", onAbort);
        reject(error);
      };
      const onAbort = (): void => terminateProcess(child.pid, child.kill.bind(child));
      input.signal.addEventListener("abort", onAbort, { once: true });
      if (input.signal.aborted) onAbort();

      const collect = (target: Buffer[], chunk: Buffer): void => {
        outputBytes += chunk.byteLength;
        if (outputBytes <= input.maxOutputBytes) target.push(Buffer.from(chunk));
        if (outputBytes > input.maxOutputBytes && !outputLimitExceeded) {
          outputLimitExceeded = true;
          terminateProcess(child.pid, child.kill.bind(child));
        }
      };
      child.stdout?.on("data", (chunk: Buffer) => collect(stdout, chunk));
      child.stderr?.on("data", (chunk: Buffer) => collect(stderr, chunk));
      child.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") finishReject(new LatexExecutableUnavailable());
        else finishReject(new Error("latex_process_failed"));
      });
      child.once("close", (exitCode, signal) => {
        if (settled) return;
        settled = true;
        input.signal.removeEventListener("abort", onAbort);
        resolve({
          exitCode,
          signal,
          stdout: new Uint8Array(Buffer.concat(stdout)),
          stderr: new Uint8Array(Buffer.concat(stderr)),
          ...(outputLimitExceeded ? { outputLimitExceeded: true } : {})
        });
      });
    });
  }
};

type RunningOutcome =
  | { kind: "result"; value: LatexProcessResult }
  | { kind: "error"; error: unknown };

type BoundaryOutcome = { kind: "aborted" } | { kind: "timeout" };

function after(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runPass(
  runner: LatexProcessRunner,
  cwd: string,
  pass: 1 | 2,
  inputSignal: AbortSignal,
  limits: ReportPdfCompilerLimits
): Promise<void> {
  if (inputSignal.aborted) fail("compile_aborted", "Report PDF compilation was aborted.");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let removeAbort = (): void => {};
  const boundary = new Promise<BoundaryOutcome>((resolve) => {
    const onAbort = (): void => {
      controller.abort();
      resolve({ kind: "aborted" });
    };
    inputSignal.addEventListener("abort", onAbort, { once: true });
    removeAbort = () => inputSignal.removeEventListener("abort", onAbort);
    if (inputSignal.aborted) onAbort();
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: "timeout" });
    }, limits.passTimeoutMs);
  });
  const running: Promise<RunningOutcome> = Promise.resolve().then(() => runner.run(Object.freeze({
    executable: PRLIMIT_EXECUTABLE,
    arguments: PRLIMIT_ARGUMENTS,
    environment: MINIMAL_XELATEX_ENVIRONMENT,
    cwd,
    shell: false as const,
    pass,
    maxOutputBytes: limits.maxLogBytes,
    signal: controller.signal
  }))).then(
    (value) => ({ kind: "result", value }),
    (error: unknown) => ({ kind: "error", error })
  );
  const first = await Promise.race([running, boundary]);
  if (timer !== undefined) clearTimeout(timer);
  removeAbort();

  let outcome: RunningOutcome;
  if (first.kind === "aborted" || first.kind === "timeout") {
    controller.abort();
    const settled = await Promise.race([
      running.then((value) => ({ settled: true as const, value })),
      after(limits.settlementGraceMs).then(() => ({ settled: false as const }))
    ]);
    if (!settled.settled) {
      fail("compiler_settlement_failed", "XeLaTeX did not stop within the configured grace period.");
    }
    if (first.kind === "aborted") fail("compile_aborted", "Report PDF compilation was aborted.");
    fail("compile_timeout", "Report PDF compilation timed out.");
  } else {
    outcome = first;
  }

  if (inputSignal.aborted) fail("compile_aborted", "Report PDF compilation was aborted.");
  if (outcome.kind === "error") {
    if (isExecutableUnavailable(outcome.error)) {
      fail("compiler_unavailable", "The isolated XeLaTeX toolchain is unavailable on this server.");
    }
    fail("compile_failed", "XeLaTeX could not compile the report.");
  }
  const logBytes = outcome.value.stdout.byteLength + outcome.value.stderr.byteLength;
  if (outcome.value.outputLimitExceeded || logBytes > limits.maxLogBytes) {
    fail("compiler_output_too_large", "XeLaTeX output exceeded the configured limit.");
  }
  if (outcome.value.exitCode !== 0 || outcome.value.signal !== null) {
    fail("compile_failed", "XeLaTeX could not compile the report.");
  }
}

async function validateGeneratedLog(workingDirectory: string, maxLogBytes: number): Promise<void> {
  try {
    const stats = await lstat(path.join(workingDirectory, "report.log"));
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size > maxLogBytes) {
      fail("compiler_output_too_large", "XeLaTeX output exceeded the configured limit.");
    }
  } catch (error) {
    if (error instanceof ReportPdfCompilerError) throw error;
    const code = typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
    if (code !== "ENOENT") fail("compile_failed", "XeLaTeX log validation failed.");
  }
}

async function safePdfBytes(outputPath: string, maxPdfBytes: number): Promise<Uint8Array> {
  let stats;
  try {
    stats = await lstat(outputPath);
  } catch {
    return fail("invalid_pdf", "XeLaTeX did not produce a report PDF.");
  }
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size < PDF_MAGIC.byteLength || stats.size > maxPdfBytes) {
    return fail("invalid_pdf", "XeLaTeX produced an invalid report PDF.");
  }
  const bytes = new Uint8Array(await readFile(outputPath));
  if (!startsWith(bytes, PDF_MAGIC)) fail("invalid_pdf", "XeLaTeX produced an invalid report PDF.");
  return bytes;
}

interface QueueEntry {
  active: boolean;
  grant: () => void;
}

class CompilerConcurrencyGate {
  private active = 0;
  private readonly queue: QueueEntry[] = [];

  async acquire(signal: AbortSignal, timeoutMs: number): Promise<() => void> {
    if (signal.aborted) fail("compile_aborted", "Report PDF compilation was aborted while queued.");
    if (this.active < MAX_CONCURRENCY) {
      this.active += 1;
      return this.releaseHandle();
    }
    return new Promise<() => void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const entry: QueueEntry = {
        active: true,
        grant: () => {
          if (!entry.active) return;
          entry.active = false;
          if (timer !== undefined) clearTimeout(timer);
          signal.removeEventListener("abort", onAbort);
          this.active += 1;
          resolve(this.releaseHandle());
        }
      };
      const onAbort = (): void => {
        if (!entry.active) return;
        entry.active = false;
        if (timer !== undefined) clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        reject(new ReportPdfCompilerError("compile_aborted", "Report PDF compilation was aborted while queued."));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => {
        if (!entry.active) return;
        entry.active = false;
        signal.removeEventListener("abort", onAbort);
        reject(new ReportPdfCompilerError("compile_timeout", "Report PDF compilation queue timed out."));
      }, timeoutMs);
      this.queue.push(entry);
      if (signal.aborted) onAbort();
    });
  }

  private releaseHandle(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      this.drain();
    };
  }

  private drain(): void {
    while (this.active < MAX_CONCURRENCY) {
      const entry = this.queue.shift();
      if (!entry) return;
      if (entry.active) entry.grant();
    }
  }
}

const defaultRemover: WorkingDirectoryRemover = {
  async remove(workingDirectory) {
    await rm(workingDirectory, { recursive: true, force: true });
  }
};

async function cleanupWorkingDirectory(
  workingDirectory: string,
  remover: WorkingDirectoryRemover
): Promise<void> {
  for (let attempt = 1; attempt <= CLEANUP_ATTEMPTS; attempt += 1) {
    try {
      await remover.remove(workingDirectory);
      return;
    } catch {
      if (attempt < CLEANUP_ATTEMPTS) await after(10);
    }
  }
  fail("cleanup_failed", "The isolated report compiler directory could not be removed.");
}

async function defaultExecutableProbe(paths: readonly string[]): Promise<boolean> {
  try {
    await Promise.all(paths.map((candidate) => access(candidate, fsConstants.X_OK)));
    return true;
  } catch {
    return false;
  }
}

async function validateTemporaryRoot(temporaryRoot: string): Promise<void> {
  try {
    const stats = await lstat(temporaryRoot);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      fail("compile_failed", "The isolated compiler root is unavailable.");
    }
  } catch (error) {
    if (error instanceof ReportPdfCompilerError) throw error;
    fail("compile_failed", "The isolated compiler root is unavailable.");
  }
}

export function createXeLatexProcessCompiler(
  options: Readonly<CreateXeLatexProcessCompilerOptions> = {}
): ReportPdfCompiler {
  const runner = options.runner ?? nodeProcessRunner;
  const limits = resolvedLimits(options.limits);
  const temporaryRoot = options.temporaryRoot ?? tmpdir();
  const remover = options.remover ?? defaultRemover;
  const executableProbe = options.executableProbe ?? defaultExecutableProbe;
  const gate = new CompilerConcurrencyGate();

  return Object.freeze({
    descriptor: COMPILER_DESCRIPTOR,
    async compile(input: Readonly<ReportPdfCompileInput>): Promise<CompiledReportPdf> {
      if (input.signal.aborted) fail("compile_aborted", "Report PDF compilation was aborted.");
      const release = await gate.acquire(input.signal, limits.queueTimeoutMs);
      try {
        const snapshot = snapshotInput(input);
        const bundle = renderTrustedBundle(snapshot.renderInput);
        validateRenderedBundle(bundle, snapshot.assets, limits);
        if (!await executableProbe([PRLIMIT_EXECUTABLE, XELATEX_EXECUTABLE])) {
          fail("compiler_unavailable", "The isolated XeLaTeX toolchain is unavailable on this server.");
        }
        await validateTemporaryRoot(temporaryRoot);
        let workingDirectory: string | undefined;
        try {
          workingDirectory = await mkdtemp(path.join(temporaryRoot, "building-agent-report-"));
          await chmod(workingDirectory, 0o700);
          if (input.signal.aborted) fail("compile_aborted", "Report PDF compilation was aborted.");
          await writeFile(path.join(workingDirectory, "report.tex"), bundle.source, {
            encoding: "utf8",
            flag: "wx",
            mode: 0o600,
            signal: input.signal
          });
          for (const asset of snapshot.assets) {
            await writeFile(path.join(workingDirectory, asset.fileName), new Uint8Array(asset.bytes), {
              flag: "wx",
              mode: 0o600,
              signal: input.signal
            });
          }
          await runPass(runner, workingDirectory, 1, input.signal, limits);
          await validateGeneratedLog(workingDirectory, limits.maxLogBytes);
          await runPass(runner, workingDirectory, 2, input.signal, limits);
          await validateGeneratedLog(workingDirectory, limits.maxLogBytes);
          if (input.signal.aborted) fail("compile_aborted", "Report PDF compilation was aborted.");
          const bytes = await safePdfBytes(path.join(workingDirectory, "report.pdf"), limits.maxPdfBytes);
          if (input.signal.aborted) fail("compile_aborted", "Report PDF compilation was aborted.");
          return {
            mediaType: "application/pdf",
            bytes: new Uint8Array(bytes),
            checksum: sha256Bytes(bytes),
            source: {
              documentId: bundle.documentId,
              documentRevision: bundle.documentRevision,
              sourceHash: bundle.sourceHash,
              templateId: bundle.templateId,
              templateVersion: bundle.templateVersion
            },
            compiler: COMPILER_DESCRIPTOR
          };
        } catch (error) {
          if (error instanceof ReportPdfCompilerError) throw error;
          if (input.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
            fail("compile_aborted", "Report PDF compilation was aborted.");
          }
          fail("compile_failed", "Report PDF compilation failed at the isolated compiler boundary.");
        } finally {
          if (workingDirectory !== undefined) await cleanupWorkingDirectory(workingDirectory, remover);
        }
      } finally {
        release();
      }
    }
  });
}
