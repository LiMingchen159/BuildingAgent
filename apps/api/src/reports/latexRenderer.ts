import { createHash } from "node:crypto";

import type {
  AnalysisPackage,
  AnalysisResult,
  AnalysisSegment,
  ChartResult,
  DashboardResult,
  EquipmentIdentity,
  EvidenceExecutionRecord,
  EvidencePackage,
  FaultEvent,
  MetricResult,
  ReportArtifact,
  ReportBlock,
  ReportDocument,
  ReportPlan,
  ReportValidationIssue,
  ReportValidationResult,
  SectionBlock,
  TableCell
} from "./contracts.js";
import type { EvidenceDefinitionRegistry } from "./evidenceDefinitions.js";
import { validateReportDocumentForPackages } from "./reportAssembler.js";
import {
  DEFAULT_LATEX_TEMPLATE_ID,
  DEFAULT_LATEX_TEMPLATE_VERSION,
  applyDefaultLatexTemplate
} from "./templates/defaultLatexTemplate.js";

export const LATEX_RENDERER_ID = "building-agent-latex-renderer" as const;
export const LATEX_RENDERER_VERSION = "1.0.0" as const;

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const MAX_LATEX_SOURCE_BYTES = 2_000_000;
const MAX_RENDER_ASSETS = 100;

export interface LatexSourceAsset {
  artifactId: string;
  fileName: string;
  mediaType: "image/png" | "application/pdf";
  checksum: string;
  relativePath: string;
}

export interface LatexSourceBundle {
  templateId: typeof DEFAULT_LATEX_TEMPLATE_ID;
  templateVersion: typeof DEFAULT_LATEX_TEMPLATE_VERSION;
  documentId: string;
  documentRevision: string;
  source: string;
  sourceHash: string;
  assets: LatexSourceAsset[];
}

export interface RenderReportLatexInput {
  document: Readonly<ReportDocument>;
  plan: Readonly<ReportPlan>;
  evidencePackage: Readonly<EvidencePackage>;
  analysisPackage: Readonly<AnalysisPackage>;
  evidenceDefinitions: Readonly<EvidenceDefinitionRegistry>;
}

class LatexRenderFailure extends Error {
  constructor(readonly validationIssue: ReportValidationIssue) {
    super(validationIssue.message);
    this.name = "LatexRenderFailure";
  }
}

function issue(path: string, code: string, message: string): ReportValidationIssue {
  return { path, code, message };
}

function fail(path: string, code: string, message: string): never {
  throw new LatexRenderFailure(issue(path, code, message));
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function normalizedText(value: string): string {
  return value.replace(/\r\n/gu, "\n").replace(/\r/gu, "\n");
}

function safeCodePoint(character: string): string {
  const codePoint = character.codePointAt(0) ?? 0;
  if (
    (codePoint >= 0 && codePoint < 0x20)
    || (codePoint >= 0x7f && codePoint <= 0x9f)
    || (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) {
    return character === "\n" || character === "\t" ? character : "�";
  }
  return character;
}

const LATEX_ESCAPES: Readonly<Record<string, string>> = Object.freeze({
  "\\": String.raw`\textbackslash{}`,
  "{": String.raw`\{`,
  "}": String.raw`\}`,
  "$": String.raw`\$`,
  "&": String.raw`\&`,
  "#": String.raw`\#`,
  "_": String.raw`\_`,
  "%": String.raw`\%`,
  "~": String.raw`\textasciitilde{}`,
  "^": String.raw`\textasciicircum{}`
});

/** Escape external text for a mandatory LaTeX argument; line breaks become spaces. */
export function escapeLatexInline(value: string): string {
  let output = "";
  for (const rawCharacter of normalizedText(value)) {
    const character = safeCodePoint(rawCharacter);
    if (character === "\n") {
      output += " ";
    } else if (character === "\t") {
      output += String.raw`\quad{}`;
    } else {
      output += LATEX_ESCAPES[character] ?? character;
    }
  }
  return output;
}

/** Escape external prose as plain text. Markdown and raw LaTeX are intentionally not interpreted. */
export function escapeLatexText(value: string): string {
  return normalizedText(value)
    .split("\n")
    .map((line) => escapeLatexInline(line))
    .join("\\par\n");
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "Unavailable";
  if (Object.is(value, -0)) return "0";
  return String(value);
}

function validArtifactPath(relativePath: string, mediaType: ReportArtifact["mediaType"]): boolean {
  if (!relativePath || relativePath.includes("\\") || relativePath.includes("\0")) return false;
  if (relativePath.startsWith("/") || /^[A-Za-z]:/u.test(relativePath)) return false;
  const segments = relativePath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return false;
  const lower = relativePath.toLowerCase();
  return (mediaType === "image/png" && lower.endsWith(".png"))
    || (mediaType === "image/svg+xml" && lower.endsWith(".svg"))
    || (mediaType === "application/pdf" && lower.endsWith(".pdf"));
}

function indexById<T>(
  values: readonly T[],
  idFor: (value: T) => string
): Map<string, T> {
  return new Map(values.map((value) => [idFor(value), value]));
}

class LatexDocumentRenderer {
  private readonly equipmentById: Map<string, EquipmentIdentity>;
  private readonly metricById: Map<string, MetricResult>;
  private readonly chartById: Map<string, ChartResult>;
  private readonly dashboardById: Map<string, DashboardResult>;
  private readonly faultById: Map<string, FaultEvent>;
  private readonly executionById: Map<string, EvidenceExecutionRecord>;
  private readonly analysisById: Map<string, AnalysisResult>;
  private readonly registeredAssets = new Map<string, LatexSourceAsset>();
  private appendixStarted = false;

  constructor(private readonly input: RenderReportLatexInput) {
    this.equipmentById = indexById(input.plan.equipment, (value) => value.equipmentId);
    this.metricById = indexById(input.evidencePackage.metricResults, (value) => value.resultId);
    this.chartById = indexById(input.evidencePackage.chartResults, (value) => value.resultId);
    this.dashboardById = indexById(input.evidencePackage.dashboardResults, (value) => value.resultId);
    this.faultById = indexById(input.evidencePackage.faultEvents, (value) => value.eventId);
    this.executionById = indexById(input.evidencePackage.executions, (value) => value.requestId);
    this.analysisById = indexById(input.analysisPackage.results, (value) => value.analysisId);
  }

  assets(): LatexSourceAsset[] {
    return [...this.registeredAssets.values()].map((asset) => ({ ...asset }));
  }

  render(): string {
    return this.input.document.blocks
      .map((block, index) => this.renderBlock(block, `document.blocks[${index}]`))
      .join("\n\n");
  }

  private renderBlock(block: ReportBlock, path: string): string {
    switch (block.kind) {
      case "title":
        return this.renderTitle(block.title, block.subtitle);
      case "text":
        return escapeLatexText(block.text);
      case "kpi":
        return this.renderKpi(block.title, block.metricResultIds, path);
      case "table":
        return this.renderTable(block.title, block.columns, block.rows, path);
      case "chart":
        return this.renderChart(block.chartResultId, block.caption, path);
      case "dashboard":
        return this.renderDashboard(block.dashboardResultId, block.caption, path);
      case "fault":
        return this.renderFaultBlock(block.title, block.faultRequestIds, block.faultEventIds, path);
      case "analysis":
        return this.renderAnalysis(block.title, block.analysisResultId, path);
      case "section":
        return this.renderSection(block, path);
      case "page_break":
        return String.raw`\clearpage`;
    }
  }

  private renderTitle(title: string, subtitle: string | undefined): string {
    const period = this.input.document.period;
    const subtitleSource = subtitle
      ? String.raw`{\sffamily\large\color{BAMuted}`
        + escapeLatexInline(subtitle)
        + String.raw`\par}\vspace{1.5em}`
      : "";
    return [
      String.raw`\begin{titlepage}`,
      String.raw`\thispagestyle{empty}`,
      String.raw`\vspace*{0.16\textheight}`,
      String.raw`{\sffamily\bfseries\fontsize{27}{33}\selectfont\color{BAInk}`
        + escapeLatexInline(title)
        + String.raw`\par}`,
      String.raw`\vspace{1.1em}`,
      subtitleSource,
      String.raw`{\color{BAAccent}\rule{\linewidth}{1.2pt}\par}`,
      String.raw`\vfill`,
      String.raw`{\sffamily\small\color{BAMuted}Report period\par}`,
      String.raw`{\sffamily\large\color{BAInk}`
        + `${escapeLatexInline(period.startAt)} -- ${escapeLatexInline(period.endAt)}`
        + String.raw`\par}`,
      String.raw`\vspace{0.45em}`,
      String.raw`{\sffamily\small\color{BAMuted}` + escapeLatexInline(period.timeZone) + String.raw`\par}`,
      String.raw`\end{titlepage}`,
      String.raw`\tableofcontents`,
      String.raw`\clearpage`
    ].filter(Boolean).join("\n");
  }

  private renderKpi(title: string, resultIds: readonly string[], path: string): string {
    const items = resultIds.map((resultId, index) => {
      const metric = this.metricById.get(resultId);
      if (!metric) fail(`${path}.metricResultIds[${index}]`, "unresolved_metric", "KPI metric reference is unavailable.");
      return String.raw`\BAKpiItem{`
        + escapeLatexInline(metric.label)
        + "}{"
        + this.renderMetricValue(metric)
        + "}";
    });
    if (items.length === 0) {
      items.push(String.raw`\BAStatusBox{No KPI results were planned for this section.}`);
    }
    return [
      String.raw`{\sffamily\bfseries\large\color{BAInk}` + escapeLatexInline(title) + String.raw`\par}`,
      ...items
    ].join("\n");
  }

  private renderMetricValue(metric: MetricResult): string {
    if (metric.status === "no_data") return "No data";
    if (metric.status === "error") return "Unavailable";
    const value = escapeLatexInline(formatNumber(metric.value));
    const unit = metric.unit ? ` ${escapeLatexInline(metric.unit)}` : "";
    return `${value}${unit}`;
  }

  private renderTable(
    title: string | undefined,
    columns: readonly { key: string; label: string; alignment?: "left" | "center" | "right" }[],
    rows: readonly Record<string, TableCell>[],
    path: string
  ): string {
    const heading = title
      ? String.raw`{\sffamily\bfseries\color{BAInk}` + escapeLatexInline(title) + String.raw`\par}`
      : "";
    if (rows.length === 0) {
      return [heading, String.raw`\BAStatusBox{No entries are available for this table.}`].filter(Boolean).join("\n");
    }
    const alignments = columns.map((column) => (
      column.alignment === "center" ? "C" : column.alignment === "right" ? "R" : "L"
    )).join("");
    const rowEnd = "\\\\";
    const header = columns.map((column) => (
      String.raw`\sffamily\bfseries ` + escapeLatexInline(column.label)
    )).join(" & ");
    const renderedRows = rows.map((row, rowIndex) => columns.map((column) => {
      const cell = row[column.key];
      if (!cell) fail(`${path}.rows[${rowIndex}].${column.key}`, "missing_table_cell", "Table cell is unavailable.");
      return this.renderTableCell(cell, `${path}.rows[${rowIndex}].${column.key}`);
    }).join(" & ") + ` ${rowEnd}`);
    return [
      heading,
      String.raw`\begin{tabularx}{\textwidth}{@{}` + alignments + String.raw`@{}}`,
      String.raw`\toprule`,
      `${header} ${rowEnd}`,
      String.raw`\midrule`,
      ...renderedRows,
      String.raw`\bottomrule`,
      String.raw`\end{tabularx}`
    ].filter(Boolean).join("\n");
  }

  private renderTableCell(cell: TableCell, path: string): string {
    switch (cell.kind) {
      case "text":
        return escapeLatexInline(cell.text);
      case "metric_ref": {
        const metric = this.metricById.get(cell.metricResultId);
        if (!metric) fail(path, "unresolved_metric", "Table metric reference is unavailable.");
        return String.raw`\BAInlineFact{` + this.renderMetricValue(metric) + "}";
      }
      case "equipment_ref":
        return String.raw`\BAInlineFact{` + this.renderEquipment(cell.equipmentId, path) + "}";
      case "fault_ref":
        return String.raw`\BAInlineFact{` + this.renderFaultEvent(cell.faultEventId, path) + "}";
    }
  }

  private renderChart(resultId: string, caption: string | undefined, path: string): string {
    const chart = this.chartById.get(resultId);
    if (!chart) fail(`${path}.chartResultId`, "unresolved_chart", "Chart result is unavailable.");
    if (chart.status === "no_data") {
      return this.renderUnavailableFigure(caption ?? chart.title, "Chart unavailable: no data.");
    }
    if (chart.status === "error") {
      return this.renderUnavailableFigure(caption ?? chart.title, "Chart unavailable.");
    }
    return this.renderReadyFigure(chart, caption ?? chart.title, `${path}.chartResultId`);
  }

  private renderDashboard(resultId: string, caption: string | undefined, path: string): string {
    const dashboard = this.dashboardById.get(resultId);
    if (!dashboard) fail(`${path}.dashboardResultId`, "unresolved_dashboard", "Dashboard result is unavailable.");
    if (dashboard.status === "no_data") {
      return this.renderUnavailableFigure(caption ?? dashboard.title, "Dashboard unavailable: no data.");
    }
    if (dashboard.status === "error") {
      return this.renderUnavailableFigure(caption ?? dashboard.title, "Dashboard unavailable.");
    }
    return this.renderReadyFigure(dashboard, caption ?? dashboard.title, `${path}.dashboardResultId`);
  }

  private renderUnavailableFigure(title: string, status: string): string {
    return [
      String.raw`{\sffamily\bfseries\color{BAInk}` + escapeLatexInline(title) + String.raw`\par}`,
      String.raw`\BAStatusBox{` + status + "}"
    ].join("\n");
  }

  private renderReadyFigure(
    result: Extract<ChartResult, { status: "ready" }> | Extract<DashboardResult, { status: "ready" }>,
    caption: string,
    path: string
  ): string {
    const asset = this.registerAsset(result.artifact, path);
    return String.raw`\BAFigure{` + asset.fileName + "}{" + escapeLatexInline(caption) + "}";
  }

  private registerAsset(artifact: ReportArtifact, path: string): LatexSourceAsset {
    if (artifact.mediaType === "image/svg+xml") {
      fail(path, "unsupported_asset_media_type", "SVG report artifacts require an unavailable safe conversion stage.");
    }
    if (!artifact.artifactId || !SHA256_PATTERN.test(artifact.checksum)) {
      fail(path, "invalid_asset", "Report artifact identity or checksum is invalid.");
    }
    if (!validArtifactPath(artifact.relativePath, artifact.mediaType)) {
      fail(path, "unsafe_asset_path", "Report artifact path is unsafe or inconsistent with its media type.");
    }
    const extension = artifact.mediaType === "image/png" ? "png" : "pdf";
    const nameHash = createHash("sha256")
      .update(`${artifact.artifactId}\0${artifact.checksum}`, "utf8")
      .digest("hex")
      .slice(0, 32);
    const candidate: LatexSourceAsset = {
      artifactId: artifact.artifactId,
      fileName: `asset-${nameHash}.${extension}`,
      mediaType: artifact.mediaType,
      checksum: artifact.checksum,
      relativePath: artifact.relativePath
    };
    const existing = this.registeredAssets.get(candidate.artifactId);
    if (existing) {
      if (
        existing.fileName !== candidate.fileName
        || existing.mediaType !== candidate.mediaType
        || existing.checksum !== candidate.checksum
        || existing.relativePath !== candidate.relativePath
      ) {
        fail(path, "conflicting_asset", "A report artifact ID resolves to conflicting immutable content.");
      }
      return existing;
    }
    if (this.registeredAssets.size >= MAX_RENDER_ASSETS) {
      fail(path, "asset_limit_exceeded", `A report may render no more than ${MAX_RENDER_ASSETS} assets.`);
    }
    this.registeredAssets.set(candidate.artifactId, candidate);
    return candidate;
  }

  private renderFaultBlock(
    title: string,
    requestIds: readonly string[],
    eventIds: readonly string[],
    path: string
  ): string {
    const executions = requestIds.map((requestId, index) => {
      const execution = this.executionById.get(requestId);
      if (!execution || execution.requestKind !== "fault") {
        fail(`${path}.faultRequestIds[${index}]`, "unresolved_fault_request", "Fault coverage reference is unavailable.");
      }
      return execution;
    });
    const coverageComplete = executions.length > 0 && executions.every((execution) => execution.status === "complete");
    const heading = String.raw`{\sffamily\bfseries\color{BAInk}` + escapeLatexInline(title) + String.raw`\par}`;
    if (eventIds.length === 0) {
      const message = coverageComplete
        ? "No faults were detected during the report period."
        : "Fault detection coverage is incomplete for this report period.";
      const command = coverageComplete ? String.raw`\BAStatusBox{` : String.raw`\BAWarningBox{`;
      return `${heading}\n${command}${message}}`;
    }
    const items = eventIds.map((eventId, index) => {
      const rendered = this.renderFaultEvent(eventId, `${path}.faultEventIds[${index}]`);
      return String.raw`\item ` + rendered;
    });
    return [
      heading,
      String.raw`\begin{itemize}`,
      ...items,
      String.raw`\end{itemize}`,
      ...(coverageComplete ? [] : [String.raw`\BAWarningBox{Fault detection coverage is incomplete for this report period.}`])
    ].join("\n");
  }

  private renderFaultEvent(eventId: string, path: string): string {
    const event = this.faultById.get(eventId);
    if (!event) fail(path, "unresolved_fault", "Fault event reference is unavailable.");
    const equipment = this.renderEquipment(event.equipment.equipmentId, path);
    const fields = [
      equipment,
      escapeLatexInline(event.faultCode),
      `Severity: ${escapeLatexInline(event.severity)}`,
      `Status: ${escapeLatexInline(event.status)}`,
      `Started: ${escapeLatexInline(event.startedAt)}`,
      `Duration: ${escapeLatexInline(formatNumber(event.durationHours))} h`
    ];
    if (event.status === "active") {
      fields.push(`Observed through: ${escapeLatexInline(event.observedThrough)}`);
    } else {
      fields.push(`Ended: ${escapeLatexInline(event.endedAt)}`);
    }
    return fields.join(String.raw` \textbullet{} `);
  }

  private renderAnalysis(title: string, analysisId: string, path: string): string {
    const result = this.analysisById.get(analysisId);
    if (!result) fail(`${path}.analysisResultId`, "unresolved_analysis", "Analysis result is unavailable.");
    const heading = String.raw`{\sffamily\bfseries\color{BAInk}` + escapeLatexInline(title) + String.raw`\par}`;
    if (result.status === "insufficient_evidence") {
      return `${heading}\n${String.raw`\BAStatusBox{Insufficient evidence is available for this analysis.}`}`;
    }
    if (result.status === "skipped") {
      return `${heading}\n${String.raw`\BAStatusBox{This analysis was not required for the report period.}`}`;
    }
    if (result.status === "error") {
      return `${heading}\n${String.raw`\BAWarningBox{This analysis is unavailable.}`}`;
    }
    const segments = result.segments.map((segment, index) => (
      this.renderAnalysisSegment(segment, `${path}.segments[${index}]`)
    ));
    return [
      heading,
      ...(result.analysisKind === "fault_diagnosis"
        ? [String.raw`\BAWarningBox{Fault diagnosis is a possible hypothesis over detected fault evidence.}`]
        : []),
      segments.join(" ")
    ].join("\n");
  }

  private renderAnalysisSegment(segment: AnalysisSegment, path: string): string {
    switch (segment.kind) {
      case "text":
        return escapeLatexText(segment.text);
      case "metric_ref": {
        const metric = this.metricById.get(segment.metricResultId);
        if (!metric) fail(path, "unresolved_metric", "Analysis metric reference is unavailable.");
        return String.raw`\BAInlineFact{` + this.renderMetricValue(metric) + "}";
      }
      case "equipment_ref":
        return String.raw`\BAInlineFact{` + this.renderEquipment(segment.equipmentId, path) + "}";
      case "fault_ref":
        return String.raw`\BAInlineFact{` + this.renderFaultEvent(segment.faultEventId, path) + "}";
    }
  }

  private renderEquipment(equipmentId: string, path: string): string {
    const equipment = this.equipmentById.get(equipmentId);
    if (!equipment) fail(path, "unresolved_equipment", "Equipment reference is unavailable.");
    return escapeLatexInline(equipment.displayName);
  }

  private renderSection(section: SectionBlock, path: string): string {
    const command = section.level === 1 ? "section" : section.level === 2 ? "subsection" : "subsubsection";
    const appendix = section.numbering === "appendix" && !this.appendixStarted
      ? `${String.raw`\appendix`}\n`
      : "";
    if (section.numbering === "appendix") this.appendixStarted = true;
    const sectionCommand = section.numbering === "unnumbered"
      ? `\\${command}*{${escapeLatexInline(section.title)}}`
      : `\\${command}{${escapeLatexInline(section.title)}}`;
    const children = section.blocks.map((block, index) => (
      this.renderBlock(block, `${path}.blocks[${index}]`)
    ));
    return [appendix + sectionCommand, ...children].join("\n\n");
  }
}

/** Render an exact validated ReportDocument into an inert XeLaTeX source bundle. */
export function renderReportLatex(
  input: RenderReportLatexInput
): ReportValidationResult<LatexSourceBundle> {
  const validated = validateReportDocumentForPackages({
    document: input.document,
    plan: input.plan,
    evidencePackage: input.evidencePackage,
    analysisPackage: input.analysisPackage,
    evidenceDefinitions: input.evidenceDefinitions,
    documentId: input.document.documentId,
    generatedAt: input.document.generatedAt
  });
  if (!validated.ok) return validated;

  try {
    const validatedInput: RenderReportLatexInput = { ...input, document: validated.value };
    const renderer = new LatexDocumentRenderer(validatedInput);
    const source = applyDefaultLatexTemplate(renderer.render());
    if (Buffer.byteLength(source, "utf8") > MAX_LATEX_SOURCE_BYTES) {
      return {
        ok: false,
        issues: [issue("document.blocks", "source_limit_exceeded", "Rendered LaTeX source exceeds the 2 MB safety limit.")]
      };
    }
    return {
      ok: true,
      value: {
        templateId: DEFAULT_LATEX_TEMPLATE_ID,
        templateVersion: DEFAULT_LATEX_TEMPLATE_VERSION,
        documentId: validated.value.documentId,
        documentRevision: validated.value.revisionHash,
        source,
        sourceHash: sha256(source),
        assets: renderer.assets()
      }
    };
  } catch (error) {
    if (error instanceof LatexRenderFailure) {
      return { ok: false, issues: [error.validationIssue] };
    }
    return {
      ok: false,
      issues: [issue("document.blocks", "render_failed", "The validated report document could not be rendered.")]
    };
  }
}
