import { createHash } from "node:crypto";
import {
  accessSync,
  constants as fsConstants,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  REPORT_SPEC_SCHEMA_VERSION,
  type ReportSpec
} from "./contracts.js";
import { DEFAULT_ANALYSIS_DEFINITION_REGISTRY } from "./analysisDefinitions.js";
import { executeReportAnalysis } from "./analysisExecutor.js";
import type { EvidenceDefinitionRegistry } from "./evidenceDefinitions.js";
import { executeReportEvidence } from "./evidenceExecutor.js";
import type { ReportEvidenceTools } from "./evidenceTools.js";

import {
  createXeLatexProcessCompiler,
  MINIMAL_XELATEX_ENVIRONMENT,
  PRLIMIT_ARGUMENTS,
  PRLIMIT_EXECUTABLE,
  ReportPdfCompilerError,
  XELATEX_ARGUMENTS,
  XELATEX_EXECUTABLE,
  XELATEX_RESOURCE_LIMITS,
  type CreateXeLatexProcessCompilerOptions,
  type LatexProcessInvocation,
  type LatexProcessResult,
  type LatexProcessRunner,
  type ReportPdfCompileInput
} from "./latexCompiler.js";
import {
  renderReportLatex,
  type RenderReportLatexInput
} from "./latexRenderer.js";
import { buildReportPlan } from "./planner.js";
import { assembleReportDocument } from "./reportAssembler.js";
import type { MaterializedLatexAsset } from "./reportArtifacts.js";
import {
  DEFAULT_LATEX_TEMPLATE_ID,
  DEFAULT_LATEX_TEMPLATE_VERSION
} from "./templates/defaultLatexTemplate.js";

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
const PDF_BYTES = new TextEncoder().encode("%PDF-1.7\ncompiled fixture");
const temporaryRoots: string[] = [];
const PERIOD = {
  startAt: "2026-08-09T16:00:00.000Z",
  endAt: "2026-08-16T16:00:00.000Z",
  timeZone: "Asia/Hong_Kong"
} as const;
const EVIDENCE_DEFINITIONS: EvidenceDefinitionRegistry = {
  metrics: [],
  charts: [],
  dashboards: [{
    definitionId: "dashboard:default",
    definitionVersion: "1",
    rendererKey: "default",
    producerKind: "dashboard_renderer"
  }],
  faults: []
};

interface CompilerFixture {
  renderInput: RenderReportLatexInput;
  assets: MaterializedLatexAsset[];
}

let safeFixture: CompilerFixture;
let assetFixture: CompilerFixture;

function toolchainAvailable(): boolean {
  try {
    accessSync(PRLIMIT_EXECUTABLE, fsConstants.X_OK);
    accessSync(XELATEX_EXECUTABLE, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function temporaryRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "m008-s5-latex-test-"));
  temporaryRoots.push(root);
  return root;
}

function checksum(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function reportSpec(title: string, dashboardCount: number): ReportSpec {
  return {
    schemaVersion: REPORT_SPEC_SCHEMA_VERSION,
    specId: "compiler-fixture",
    projectId: "project-compiler-fixture",
    title,
    timeZone: PERIOD.timeZone,
    period: { kind: "weekly", window: "previous_complete", weekStartsOn: "monday" },
    schedule: { enabled: false },
    sections: {
      ordered: [
        { section: "executive_summary", enabled: false },
        { section: "key_findings", enabled: false },
        { section: "system_performance", enabled: false },
        { section: "selected_dashboards", enabled: dashboardCount > 0 },
        { section: "fault_summary", enabled: false },
        { section: "equipment_analysis", enabled: false },
        { section: "recommended_actions", enabled: false },
        { section: "appendix", enabled: false }
      ]
    },
    kpiKeys: [],
    dashboardIds: Array.from({ length: dashboardCount }, (_, index) => `dashboard-${index + 1}`),
    equipment: { mode: "all", equipmentTypes: [] }
  };
}

async function buildCompilerFixture(
  title = "Safe weekly report",
  dashboardCount = 0
): Promise<CompilerFixture> {
  const spec = reportSpec(title, dashboardCount);
  const planned = buildReportPlan({
    planId: "plan-compiler-fixture",
    spec,
    period: { ...PERIOD },
    plannedAt: "2026-08-17T00:05:00.000Z",
    equipment: [],
    profiles: [],
    evidenceDefinitions: EVIDENCE_DEFINITIONS,
    analysisDefinitions: DEFAULT_ANALYSIS_DEFINITION_REGISTRY,
    resolvedDashboards: spec.dashboardIds.map((dashboardId) => ({
      dashboardId,
      dashboardRevision: `revision:${dashboardId}`
    })),
    assetRevision: "sha256:compiler-fixture-assets",
    assetProvenance: {
      resolverVersion: 1,
      sources: [{
        sourceKind: "project_metadata",
        sourceId: "compiler-fixture-assets",
        sourceRevision: "sha256:compiler-fixture-assets"
      }],
      equipment: []
    }
  });
  if (!planned.ok) throw new Error(`invalid compiler plan fixture: ${JSON.stringify(planned.issues)}`);

  const unreachable = async (): Promise<never> => {
    throw new Error("unexpected fixture evidence tool call");
  };
  const evidenceTools: ReportEvidenceTools = {
    metrics: {},
    chart: {
      descriptor: { producerKind: "plot_tool", producerId: "fixture-chart", producerVersion: "1" },
      execute: unreachable
    },
    dashboard: {
      descriptor: {
        producerKind: "dashboard_renderer",
        producerId: "fixture-dashboard",
        producerVersion: "1"
      },
      async execute({ request, context }) {
        return {
          status: "complete",
          sourceRevision: request.dashboardRevision,
          value: {
            projectId: context.projectId,
            dashboardId: request.dashboardId,
            dashboardRevision: request.dashboardRevision,
            period: { ...context.period },
            definition: { ...request.definition },
            title: request.dashboardId,
            artifact: {
              relativePath: `dashboards/${request.dashboardId}.png`,
              mediaType: "image/png",
              bytes: new Uint8Array(PNG_BYTES)
            },
            evidence: [{
              evidenceId: `evidence:${request.requestId}`,
              sourceKind: "dashboard",
              sourceId: request.requestId
            }]
          }
        };
      }
    },
    fault: {
      descriptor: { producerKind: "fdd_rule", producerId: "fixture-fault", producerVersion: "1" },
      execute: unreachable
    },
    artifactSink: { async write() {} }
  };
  const evidence = await executeReportEvidence({
    plan: planned.value,
    packageId: "evidence-compiler-fixture",
    generatedAt: "2026-08-17T00:10:00.000Z"
  }, { definitions: EVIDENCE_DEFINITIONS, tools: evidenceTools });
  if (!evidence.ok) throw new Error(`invalid compiler evidence fixture: ${JSON.stringify(evidence.issues)}`);

  const analysis = await executeReportAnalysis({
    plan: planned.value,
    evidencePackage: evidence.value,
    packageId: "analysis-compiler-fixture",
    generatedAt: "2026-08-17T00:15:00.000Z"
  }, {
    definitions: DEFAULT_ANALYSIS_DEFINITION_REGISTRY,
    model: {
      metadata: { id: "fixture-model", mode: "mock", model: "fixture-model", status: "configured" },
      async analyze() { throw new Error("unexpected fixture analysis call"); }
    }
  });
  if (!analysis.ok) throw new Error(`invalid compiler analysis fixture: ${JSON.stringify(analysis.issues)}`);
  const assembled = assembleReportDocument({
    plan: planned.value,
    evidencePackage: evidence.value,
    analysisPackage: analysis.value,
    evidenceDefinitions: EVIDENCE_DEFINITIONS,
    documentId: "document-compiler-fixture",
    generatedAt: "2026-08-17T00:20:00.000Z"
  });
  if (!assembled.ok) throw new Error(`invalid compiler document fixture: ${JSON.stringify(assembled.issues)}`);
  const renderInput: RenderReportLatexInput = {
    document: assembled.value,
    plan: planned.value,
    evidencePackage: evidence.value,
    analysisPackage: analysis.value,
    evidenceDefinitions: EVIDENCE_DEFINITIONS
  };
  const rendered = renderReportLatex(renderInput);
  if (!rendered.ok) throw new Error(`invalid compiler render fixture: ${JSON.stringify(rendered.issues)}`);
  return {
    renderInput,
    assets: rendered.value.assets.map((asset) => ({
      ...asset,
      bytes: new Uint8Array(PNG_BYTES)
    }))
  };
}

function successResult(overrides: Partial<LatexProcessResult> = {}): LatexProcessResult {
  return {
    exitCode: overrides.exitCode ?? 0,
    signal: overrides.signal ?? null,
    stdout: overrides.stdout ?? new Uint8Array(),
    stderr: overrides.stderr ?? new Uint8Array(),
    ...(overrides.outputLimitExceeded !== undefined
      ? { outputLimitExceeded: overrides.outputLimitExceeded }
      : {})
  };
}

function testCompilerOptions(
  temporaryRootValue: string,
  runner: LatexProcessRunner,
  overrides: Partial<CreateXeLatexProcessCompilerOptions> = {}
): CreateXeLatexProcessCompilerOptions {
  return {
    temporaryRoot: temporaryRootValue,
    runner,
    executableProbe: async () => true,
    ...overrides
  };
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: "ReportPdfCompilerError", code });
}

beforeAll(async () => {
  [safeFixture, assetFixture] = await Promise.all([
    buildCompilerFixture(),
    buildCompilerFixture("Safe weekly report", 2)
  ]);
});

function compileInput(
  fixture: CompilerFixture = safeFixture,
  signal: AbortSignal = new AbortController().signal
): ReportPdfCompileInput {
  return {
    renderInput: fixture.renderInput,
    assets: fixture.assets,
    signal
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("createXeLatexProcessCompiler", () => {
  it("uses a fixed prlimit/XeLaTeX boundary for two passes and returns bundle provenance", async () => {
    const root = temporaryRoot();
    const fixture = structuredClone(assetFixture);
    const rendered = renderReportLatex(fixture.renderInput);
    if (!rendered.ok) throw new Error("expected valid compiler fixture");
    const sourceBundle = rendered.value;
    const invocations: LatexProcessInvocation[] = [];
    const run = vi.fn<LatexProcessRunner["run"]>(async (input) => {
      invocations.push(input);
      expect(statSync(input.cwd).mode & 0o777).toBe(0o700);
      expect(statSync(path.join(input.cwd, "report.tex")).mode & 0o777).toBe(0o600);
      expect(readFileSync(path.join(input.cwd, "report.tex"), "utf8")).toBe(sourceBundle.source);
      for (const asset of fixture.assets) {
        expect(statSync(path.join(input.cwd, asset.fileName)).mode & 0o777).toBe(0o600);
        expect(new Uint8Array(readFileSync(path.join(input.cwd, asset.fileName)))).toEqual(PNG_BYTES);
      }
      if (input.pass === 2) writeFileSync(path.join(input.cwd, "report.pdf"), PDF_BYTES);
      return successResult();
    });
    const compiler = createXeLatexProcessCompiler(testCompilerOptions(root, { run }));

    const result = await compiler.compile(compileInput(fixture));

    expect(run).toHaveBeenCalledTimes(2);
    expect(invocations.map((invocation) => invocation.pass)).toEqual([1, 2]);
    for (const invocation of invocations) {
      expect(invocation.executable).toBe(PRLIMIT_EXECUTABLE);
      expect(invocation.arguments).toEqual(PRLIMIT_ARGUMENTS);
      expect(invocation.environment).toEqual(MINIMAL_XELATEX_ENVIRONMENT);
      expect(Object.keys(invocation.environment).sort()).toEqual(Object.keys(MINIMAL_XELATEX_ENVIRONMENT).sort());
      expect(invocation.shell).toBe(false);
      expect(path.dirname(invocation.cwd)).toBe(root);
    }
    expect(result).toEqual({
      mediaType: "application/pdf",
      bytes: PDF_BYTES,
      checksum: checksum(PDF_BYTES),
      source: {
        documentId: sourceBundle.documentId,
        documentRevision: sourceBundle.documentRevision,
        sourceHash: sourceBundle.sourceHash,
        templateId: DEFAULT_LATEX_TEMPLATE_ID,
        templateVersion: DEFAULT_LATEX_TEMPLATE_VERSION
      },
      compiler: {
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
      }
    });
    expect(result.bytes).not.toBe(PDF_BYTES);
    expect(readdirSync(root)).toEqual([]);
  });

  it.each([
    ["missing document", (candidate: RenderReportLatexInput) => {
      (candidate as { document: unknown }).document = null;
    }],
    ["stale document revision", (candidate: RenderReportLatexInput) => {
      (candidate.document as { revisionHash: string }).revisionHash = `sha256:${"0".repeat(64)}`;
    }],
    ["malformed plan", (candidate: RenderReportLatexInput) => {
      (candidate as { plan: unknown }).plan = { planId: "forged" };
    }]
  ])("rejects malformed structured render input %s before probing or spawning", async (_label, mutate) => {
    const root = temporaryRoot();
    const candidate = structuredClone(safeFixture.renderInput);
    mutate(candidate);
    const run = vi.fn<LatexProcessRunner["run"]>();
    const probe = vi.fn(async () => true);
    const compiler = createXeLatexProcessCompiler({ temporaryRoot: root, runner: { run }, executableProbe: probe });
    await expectCode(compiler.compile({
      renderInput: candidate,
      assets: [],
      signal: new AbortController().signal
    }), "invalid_source");
    expect(probe).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("renders internally, escapes malicious text, and ignores forged raw TeX fields", async () => {
    const root = temporaryRoot();
    const fixture = await buildCompilerFixture(String.raw`Weekly \input{/etc/passwd} \loop report`);
    let compiledSource = "";
    const run = vi.fn<LatexProcessRunner["run"]>(async (input) => {
      compiledSource = readFileSync(path.join(input.cwd, "report.tex"), "utf8");
      if (input.pass === 2) writeFileSync(path.join(input.cwd, "report.pdf"), PDF_BYTES);
      return successResult();
    });
    const compiler = createXeLatexProcessCompiler(testCompilerOptions(root, { run }));
    const forged = {
      ...compileInput(fixture),
      source: String.raw`\input{/etc/shadow}\loop`,
      bundle: { source: String.raw`\input{/etc/shadow}\loop` }
    } as ReportPdfCompileInput;

    await compiler.compile(forged);

    expect(compiledSource).not.toContain(String.raw`\input{/etc/passwd}`);
    expect(compiledSource).not.toContain(String.raw`\input{/etc/shadow}`);
    expect(compiledSource).not.toContain(String.raw`\loop`);
    expect(compiledSource).toContain(String.raw`\textbackslash{}input`);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("requires an exact ordered renderer/materialized asset manifest", async () => {
    const root = temporaryRoot();
    const fixture = structuredClone(assetFixture);
    fixture.assets.reverse();
    const run = vi.fn<LatexProcessRunner["run"]>();
    const compiler = createXeLatexProcessCompiler(testCompilerOptions(root, { run }));
    await expectCode(compiler.compile(compileInput(fixture)), "invalid_asset");
    expect(run).not.toHaveBeenCalled();
  });

  it.runIf(!toolchainAvailable())("reports compiler_unavailable for the fixed absolute toolchain", async () => {
    const root = temporaryRoot();
    const compiler = createXeLatexProcessCompiler({ temporaryRoot: root });
    await expectCode(compiler.compile(compileInput()), "compiler_unavailable");
    expect(readdirSync(root)).toEqual([]);
  });

  it("sanitizes nonzero compiler exits and never starts the second pass", async () => {
    const root = temporaryRoot();
    const run = vi.fn<LatexProcessRunner["run"]>(async () => successResult({
      exitCode: 1,
      stderr: new TextEncoder().encode("sensitive absolute path and TeX log")
    }));
    const compiler = createXeLatexProcessCompiler(testCompilerOptions(root, { run }));
    const result = compiler.compile(compileInput());

    await expectCode(result, "compile_failed");
    expect(run).toHaveBeenCalledTimes(1);
    await result.catch((caught: unknown) => {
      expect(caught).toBeInstanceOf(ReportPdfCompilerError);
      expect((caught as Error).message).not.toContain("sensitive");
    });
    expect(readdirSync(root)).toEqual([]);
  });

  it("waits for process settlement after timeout before cleanup", async () => {
    const root = temporaryRoot();
    let settled = false;
    const runner: LatexProcessRunner = {
      async run(input) {
        return new Promise<LatexProcessResult>((resolve) => {
          input.signal.addEventListener("abort", () => {
            setTimeout(() => {
              settled = true;
              resolve(successResult({ exitCode: null, signal: "SIGKILL" }));
            }, 5);
          }, { once: true });
        });
      }
    };
    const remover = {
      async remove(directory: string) {
        expect(settled).toBe(true);
        rmSync(directory, { recursive: true, force: true });
      }
    };
    const compiler = createXeLatexProcessCompiler(testCompilerOptions(root, runner, {
      remover,
      limits: { passTimeoutMs: 10, settlementGraceMs: 100 }
    }));
    await expectCode(compiler.compile(compileInput()), "compile_timeout");
    expect(readdirSync(root)).toEqual([]);
  });

  it("fails closed when a cancelled runner does not settle within grace", async () => {
    const root = temporaryRoot();
    const compiler = createXeLatexProcessCompiler(testCompilerOptions(root, {
      async run() { return new Promise<LatexProcessResult>(() => undefined); }
    }, { limits: { passTimeoutMs: 10, settlementGraceMs: 10 } }));
    await expectCode(compiler.compile(compileInput()), "compiler_settlement_failed");
    expect(readdirSync(root)).toEqual([]);
  });

  it("propagates external cancellation, waits for settlement, then cleans", async () => {
    const root = temporaryRoot();
    let started!: () => void;
    const hasStarted = new Promise<void>((resolve) => { started = resolve; });
    let settled = false;
    const runner: LatexProcessRunner = {
      async run(input) {
        started();
        return new Promise<LatexProcessResult>((resolve) => {
          input.signal.addEventListener("abort", () => {
            settled = true;
            resolve(successResult({ exitCode: null, signal: "SIGKILL" }));
          }, { once: true });
        });
      }
    };
    const controller = new AbortController();
    const compiler = createXeLatexProcessCompiler(testCompilerOptions(root, runner));
    const compiling = compiler.compile(compileInput(safeFixture, controller.signal));
    await hasStarted;
    controller.abort();

    await expectCode(compiling, "compile_aborted");
    expect(settled).toBe(true);
    expect(readdirSync(root)).toEqual([]);
  });

  it("retries cleanup and never returns success when cleanup cannot complete", async () => {
    const root = temporaryRoot();
    const run = vi.fn<LatexProcessRunner["run"]>(async (input) => {
      if (input.pass === 2) writeFileSync(path.join(input.cwd, "report.pdf"), PDF_BYTES);
      return successResult();
    });
    const remove = vi.fn(async () => { throw new Error("cleanup path secret"); });
    const compiler = createXeLatexProcessCompiler(testCompilerOptions(root, { run }, {
      remover: { remove }
    }));
    await expectCode(compiler.compile(compileInput()), "cleanup_failed");
    expect(remove).toHaveBeenCalledTimes(3);
  });

  it("bounds concurrency at two and lets queued work abort or time out", async () => {
    const root = temporaryRoot();
    let active = 0;
    let maximumActive = 0;
    const firstPassReleases: Array<() => void> = [];
    let startedCount = 0;
    let startedResolve!: () => void;
    const twoStarted = new Promise<void>((resolve) => { startedResolve = resolve; });
    const runner: LatexProcessRunner = {
      async run(input) {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        if (input.pass === 1) {
          startedCount += 1;
          if (startedCount === 2) startedResolve();
          await new Promise<void>((resolve) => firstPassReleases.push(resolve));
        } else {
          writeFileSync(path.join(input.cwd, "report.pdf"), PDF_BYTES);
        }
        active -= 1;
        return successResult();
      }
    };
    const compiler = createXeLatexProcessCompiler(testCompilerOptions(root, runner, {
      limits: { queueTimeoutMs: 30, passTimeoutMs: 500 }
    }));
    const first = compiler.compile(compileInput());
    const second = compiler.compile(compileInput());
    const abortController = new AbortController();
    const queuedAbort = compiler.compile(compileInput(safeFixture, abortController.signal));
    const queuedTimeout = compiler.compile(compileInput());
    await twoStarted;
    abortController.abort();
    await expectCode(queuedAbort, "compile_aborted");
    await expectCode(queuedTimeout, "compile_timeout");
    for (const release of firstPassReleases.splice(0)) release();
    await Promise.all([first, second]);
    expect(maximumActive).toBe(2);
    expect(startedCount).toBe(2);
    expect(readdirSync(root)).toEqual([]);
  });

  it.each([
    ["reserved file name", (asset: MaterializedLatexAsset) => { asset.fileName = "report.pdf"; }],
    ["bad checksum", (asset: MaterializedLatexAsset) => { asset.checksum = `sha256:${"0".repeat(64)}`; }],
    ["bad PNG magic", (asset: MaterializedLatexAsset) => {
      asset.bytes = new TextEncoder().encode("not png");
    }],
    ["oversized PNG dimensions", (asset: MaterializedLatexAsset) => {
      asset.bytes = pngBytes(10_000, 10_000);
    }]
  ])("rejects %s before invoking a process", async (_label, mutate) => {
    const root = temporaryRoot();
    const fixture = structuredClone(assetFixture);
    mutate(fixture.assets[0]!);
    const run = vi.fn<LatexProcessRunner["run"]>();
    const compiler = createXeLatexProcessCompiler(testCompilerOptions(root, { run }, {
      limits: { maxPngPixels: 1_000_000 }
    }));
    await expectCode(compiler.compile(compileInput(fixture)), "invalid_asset");
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects missing or malformed PDF output after two fixed passes", async () => {
    const root = temporaryRoot();
    const run = vi.fn<LatexProcessRunner["run"]>(async (input) => {
      if (input.pass === 2) writeFileSync(path.join(input.cwd, "report.pdf"), "not a pdf");
      return successResult();
    });
    const compiler = createXeLatexProcessCompiler(testCompilerOptions(root, { run }));
    await expectCode(compiler.compile(compileInput()), "invalid_pdf");
    expect(run).toHaveBeenCalledTimes(2);
    expect(readdirSync(root)).toEqual([]);
  });
});
