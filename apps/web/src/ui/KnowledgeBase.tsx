import { Badge, Button, EmptyState } from "./primitives";

export type KnowledgeBaseDocumentKind = "pdf" | "word" | "excel" | "report" | "manual" | "drawing" | "text" | "turtle" | "markdown" | "parquet" | "data" | "other";

export interface KnowledgeBaseDocument {
  id: string;
  name: string;
  kind: KnowledgeBaseDocumentKind;
  uploadedAt: string;
  sizeBytes: number;
  uploaderName?: string | undefined;
  path?: string | undefined;
  excerpt?: string | undefined;
}

export interface KnowledgeBaseProps {
  projectId: string;
  projectName: string;
  documents: ReadonlyArray<KnowledgeBaseDocument>;
}

const KIND_ICONS: Record<KnowledgeBaseDocumentKind, string> = {
  pdf: "PDF",
  word: "DOC",
  excel: "XLS",
  report: "RPT",
  manual: "MAN",
  drawing: "DWG",
  text: "TXT",
  turtle: "TTL",
  markdown: "MD",
  parquet: "PQT",
  data: "DAT",
  other: "FILE"
};

const KIND_TONES: Record<KnowledgeBaseDocumentKind, "danger" | "primary" | "success" | "warning" | "info" | "neutral"> = {
  pdf: "danger",
  word: "primary",
  excel: "success",
  report: "info",
  manual: "warning",
  drawing: "neutral",
  text: "neutral",
  turtle: "info",
  markdown: "primary",
  parquet: "success",
  data: "success",
  other: "neutral"
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function KnowledgeBase({ projectId, projectName, documents }: KnowledgeBaseProps) {
  return (
    <section className="kb-panel" aria-labelledby="kb-title">
      <header className="kb-panel-header">
        <div>
          <p className="eyebrow">Project knowledge base</p>
          <h2 id="kb-title">{projectName} knowledge base</h2>
          <p className="muted">Project id: <strong>{projectId}</strong></p>
          <p className="chat-scope-notice" role="note">I can only access data within this project.</p>
        </div>
        <Badge tone="success">Live local files</Badge>
      </header>
      <div className="kb-upload">
        <div className="kb-upload-text">
          <strong>Upload a document</strong>
          <span className="muted">Drop files into the repo Knowledge Base folder. The assistant indexes readable text and lists data files for future tools.</span>
        </div>
        <Button variant="secondary" disabled aria-disabled="true">Choose file</Button>
      </div>
      {documents.length === 0 ? (
        <EmptyState title="No documents found">Place Markdown, text, Turtle, CSV, JSON, or data files in the Knowledge Base folder.</EmptyState>
      ) : (
        <ul className="kb-document-list" aria-label={`${projectName} documents (${documents.length})`}>
          {documents.map((document) => (
            <li className="kb-document" key={document.id}>
              <span className={`kb-document-icon kb-document-icon-${document.kind}`} aria-hidden="true">{KIND_ICONS[document.kind]}</span>
              <div className="kb-document-body">
                <div className="kb-document-row">
                  <strong>{document.name}</strong>
                  <Badge tone={KIND_TONES[document.kind]}>{document.kind}</Badge>
                </div>
                {document.path ? <p className="kb-document-path">{document.path}</p> : null}
                {document.excerpt ? <p className="kb-document-excerpt">{document.excerpt}</p> : null}
                <div className="kb-document-meta">
                  <span>{formatSize(document.sizeBytes)}</span>
                  <span>Uploaded {document.uploadedAt}</span>
                  {document.uploaderName ? <span>By {document.uploaderName}</span> : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function buildMockKnowledgeBaseDocuments(projectId: string): KnowledgeBaseDocument[] {
  let hash = 0;
  for (let index = 0; index < projectId.length; index += 1) {
    hash = (hash * 31 + projectId.charCodeAt(index)) >>> 0;
  }
  const kinds: KnowledgeBaseDocumentKind[] = ["pdf", "word", "excel", "report", "manual", "drawing"];
  const baseDate = "2026-05-0";
  const count = (hash % 5) + 2;
  const docs: KnowledgeBaseDocument[] = [];
  for (let index = 0; index < count; index += 1) {
    const kindShift = (hash >>> (index * 3)) >>> 0;
    const kind = kinds[kindShift % kinds.length]!;
    const sizeKb = (((hash >>> (index * 2)) >>> 0) % 950) + 50;
    docs.push({
      id: `${projectId}-doc-${index + 1}`,
      name: `${capitalize(kind)} placeholder ${index + 1}`,
      kind,
      uploadedAt: `${baseDate}${(index % 9) + 1}`,
      sizeBytes: sizeKb * 1024,
      uploaderName: index % 2 === 0 ? "Local user" : "Field engineer"
    });
  }
  return docs;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
