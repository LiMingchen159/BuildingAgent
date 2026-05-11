import { Badge, EmptyState } from "./primitives";

export type RepositoryItemKind = "image" | "chart" | "report" | "table" | "analysis" | "note" | "summary";

export interface RepositoryItem {
  id: string;
  name: string;
  kind: RepositoryItemKind;
  generatedAt: string;
  sourceTaskId: string;
  description?: string | undefined;
  content?: string | undefined;
}

export interface RepositoryProps {
  projectId: string;
  projectName: string;
  items: ReadonlyArray<RepositoryItem>;
}

const KIND_TONES: Record<RepositoryItemKind, "primary" | "success" | "warning" | "info" | "neutral"> = {
  image: "primary",
  chart: "info",
  report: "warning",
  table: "success",
  analysis: "neutral",
  note: "primary",
  summary: "info"
};

const KIND_LABELS: Record<RepositoryItemKind, string> = {
  image: "IMG",
  chart: "CHT",
  report: "RPT",
  table: "TBL",
  analysis: "ANL",
  note: "NOTE",
  summary: "SUM"
};

export function Repository({ projectId, projectName, items }: RepositoryProps) {
  return (
    <section className="repo-panel" aria-labelledby="repo-title">
      <header className="kb-panel-header">
        <div>
          <p className="eyebrow">Project repository</p>
          <h2 id="repo-title">{projectName} outputs</h2>
          <p className="muted">Project id: <strong>{projectId}</strong></p>
          <p className="chat-scope-notice" role="note">I can only access outputs from this project.</p>
        </div>
        <Badge tone="success">Session artifacts</Badge>
      </header>
      <p className="repo-approval-notice" role="note">
        <strong>Approval required:</strong> Future repository actions (download, share, delete, regenerate) will
        require explicit user approval before any state-changing call leaves the local API session boundary.
      </p>
      {items.length === 0 ? (
        <EmptyState title="No outputs yet">Assistant responses and future tool outputs will appear here after chat turns.</EmptyState>
      ) : (
        <ul className="repo-item-list" aria-label={`${projectName} outputs (${items.length})`}>
          {items.map((item) => (
            <li className="repo-item" key={item.id}>
              <span className={`repo-item-icon repo-item-icon-${item.kind}`} aria-hidden="true">{KIND_LABELS[item.kind]}</span>
              <div className="repo-item-body">
                <div className="repo-item-row">
                  <strong>{item.name}</strong>
                  <Badge tone={KIND_TONES[item.kind]}>{item.kind}</Badge>
                </div>
                {item.description ? <p className="repo-item-description">{item.description}</p> : null}
                {item.content ? <p className="repo-item-content">{item.content}</p> : null}
                <div className="repo-item-meta">
                  <span>Generated {item.generatedAt}</span>
                  <span>Source: {item.sourceTaskId}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function buildMockRepositoryItems(projectId: string): RepositoryItem[] {
  let hash = 0;
  for (let index = 0; index < projectId.length; index += 1) {
    hash = (hash * 33 + projectId.charCodeAt(index)) >>> 0;
  }
  const kinds: RepositoryItemKind[] = ["image", "chart", "report", "table", "analysis"];
  const baseDate = "2026-05-0";
  const count = ((hash >>> 1) % 4) + 2;
  const items: RepositoryItem[] = [];
  for (let index = 0; index < count; index += 1) {
    const kindShift = (hash >>> (index * 4)) >>> 0;
    const kind = kinds[kindShift % kinds.length]!;
    items.push({
      id: `${projectId}-out-${index + 1}`,
      name: `${capitalize(kind)} output ${index + 1}`,
      kind,
      generatedAt: `${baseDate}${(index % 9) + 1}`,
      sourceTaskId: `task_${(((hash >>> (index * 5)) >>> 0) % 1000).toString().padStart(3, "0")}`,
      description: index === 0 ? "Placeholder output — produced by a synthetic task run." : undefined
    });
  }
  return items;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
