import { Badge } from "./primitives";

type ToolStatus = "active" | "placeholder" | "mock" | "not_configured";

interface ToolCard {
  id: string;
  name: string;
  description: string;
  status: ToolStatus;
}

const MOCK_TOOLS: ReadonlyArray<ToolCard> = [
  { id: "tool_doc_lookup", name: "Document Lookup Tool", description: "Locate documents by metadata across the project knowledge base.", status: "active" },
  { id: "tool_kb_search", name: "Knowledge Base Search Tool", description: "Full-text search inside uploaded knowledge base documents.", status: "active" },
  { id: "tool_repo_writer", name: "Repository Writer", description: "Produce charts, tables, and reports into the project repository.", status: "placeholder" },
  { id: "tool_space_summary", name: "Space Summary", description: "Summarize equipment and zones for a given space.", status: "mock" },
  { id: "tool_brick_query", name: "Brick Query Tool", description: "Query the Brick model for relationships and asset metadata.", status: "placeholder" },
  { id: "tool_bim_summary", name: "BIM Summary Tool", description: "Pull a high-level summary from BIM/IFC sources.", status: "not_configured" },
  { id: "tool_timeseries_plot", name: "Time-Series Plotter", description: "Render time-series charts for selected points.", status: "mock" },
  { id: "tool_energy_snapshot", name: "Energy Snapshot Tool", description: "Show a quick energy snapshot for the project.", status: "active" }
];

const STATUS_TONES: Record<ToolStatus, "success" | "primary" | "info" | "danger"> = {
  active: "success",
  placeholder: "primary",
  mock: "info",
  not_configured: "danger"
};

const STATUS_LABELS: Record<ToolStatus, string> = {
  active: "Active",
  placeholder: "Placeholder",
  mock: "Mock",
  not_configured: "Not configured"
};

export function Tools() {
  return (
    <ul className="rp-card-list" aria-label="Project tool placeholders">
      {MOCK_TOOLS.map((tool) => (
        <li className="rp-card" key={tool.id}>
          <div className="rp-card-row">
            <strong>{tool.name}</strong>
            <Badge tone={STATUS_TONES[tool.status]}>{STATUS_LABELS[tool.status]}</Badge>
          </div>
          <p className="rp-card-description">{tool.description}</p>
        </li>
      ))}
    </ul>
  );
}
