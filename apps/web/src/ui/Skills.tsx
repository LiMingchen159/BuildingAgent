import { Badge } from "./primitives";

type SkillStatus = "active" | "placeholder" | "mock" | "not_configured";

interface SkillCard {
  id: string;
  name: string;
  description: string;
  status: SkillStatus;
}

const MOCK_SKILLS: ReadonlyArray<SkillCard> = [
  { id: "skill_energy_baseline", name: "Energy Baseline Analysis", description: "Compare current consumption against a rolling 30-day baseline.", status: "mock" },
  { id: "skill_life_safety", name: "Life Safety Review Assistant", description: "Walk through fire, egress, and life-safety checklists for a space.", status: "placeholder" },
  { id: "skill_anomaly_detection", name: "Anomaly Detection", description: "Flag points whose readings deviate from learned profiles.", status: "active" },
  { id: "skill_weekly_report", name: "Weekly Report Generator", description: "Compose the weekly energy + occupancy summary every Monday.", status: "mock" },
  { id: "skill_chiller_opt", name: "Chiller Optimization Assistant", description: "Suggest setpoint adjustments using current load and forecast.", status: "placeholder" },
  { id: "skill_space_classification", name: "Space Classification", description: "Tag spaces by inferred use class from BMS metadata.", status: "not_configured" },
  { id: "skill_document_qa", name: "Document Q&A Skill", description: "Answer questions grounded in the project knowledge base.", status: "active" }
];

const STATUS_TONES: Record<SkillStatus, "success" | "primary" | "info" | "danger"> = {
  active: "success",
  placeholder: "primary",
  mock: "info",
  not_configured: "danger"
};

const STATUS_LABELS: Record<SkillStatus, string> = {
  active: "Active",
  placeholder: "Placeholder",
  mock: "Mock",
  not_configured: "Not configured"
};

export function Skills() {
  return (
    <ul className="rp-card-list" aria-label="Project skill placeholders">
      {MOCK_SKILLS.map((skill) => (
        <li className="rp-card" key={skill.id}>
          <div className="rp-card-row">
            <strong>{skill.name}</strong>
            <Badge tone={STATUS_TONES[skill.status]}>{STATUS_LABELS[skill.status]}</Badge>
          </div>
          <p className="rp-card-description">{skill.description}</p>
        </li>
      ))}
    </ul>
  );
}
