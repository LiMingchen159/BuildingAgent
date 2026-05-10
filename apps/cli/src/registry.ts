export type PlaceholderStatus = "placeholder" | "mock" | "not_configured";

interface PlaceholderBase {
  id: string;
  name: string;
  status: PlaceholderStatus;
  description: string;
}

export interface RuntimeProviderSummary extends PlaceholderBase {
  kind: "llm" | "embedding" | "workflow";
}

export interface ToolSummary extends PlaceholderBase {
  category: "analysis" | "retrieval" | "building";
}

export interface SkillSummary extends PlaceholderBase {
  domain: "building" | "project" | "runtime";
}

export interface GatewaySummary extends PlaceholderBase {
  protocol: "http" | "mcp" | "local";
}

export interface BuildingCapabilitySummary extends PlaceholderBase {
  domain: "energy" | "safety" | "maintenance" | "planning";
}

export interface RegistryResponse {
  runtimeProviders: RuntimeProviderSummary[];
  tools: ToolSummary[];
  skills: SkillSummary[];
  gateways: GatewaySummary[];
  buildingCapabilities: BuildingCapabilitySummary[];
  limit: number;
  placeholderOnly: true;
  requestId: string;
}

export interface ProjectManagementResponse {
  projectId: string;
  gateways: GatewaySummary[];
  capabilities: BuildingCapabilitySummary[];
  tools: ToolSummary[];
  limit: number;
  placeholderOnly: true;
  requestId: string;
}

export class RegistryPayloadError extends Error {
  readonly code = "api_malformed";

  constructor(message: string) {
    super(message);
    this.name = "RegistryPayloadError";
  }

  toJSON(): { error: { code: string; message: string } } {
    return { error: { code: this.code, message: this.message } };
  }
}

const PLACEHOLDER_STATUSES = new Set(["placeholder", "mock", "not_configured"]);
const RUNTIME_KINDS = new Set(["llm", "embedding", "workflow"]);
const TOOL_CATEGORIES = new Set(["analysis", "retrieval", "building"]);
const SKILL_DOMAINS = new Set(["building", "project", "runtime"]);
const GATEWAY_PROTOCOLS = new Set(["http", "mcp", "local"]);
const CAPABILITY_DOMAINS = new Set(["energy", "safety", "maintenance", "planning"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringIn<T extends string>(value: unknown, allowed: Set<string>): value is T {
  return typeof value === "string" && allowed.has(value);
}

function malformed(message: string): never {
  throw new RegistryPayloadError(message);
}

function hasPlaceholderBase(value: Record<string, unknown>): value is Record<string, unknown> & PlaceholderBase {
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    isStringIn<PlaceholderStatus>(value.status, PLACEHOLDER_STATUSES)
  );
}

function parseRuntimeProvider(value: unknown): RuntimeProviderSummary | null {
  if (!isRecord(value) || !hasPlaceholderBase(value) || !isStringIn<RuntimeProviderSummary["kind"]>(value.kind, RUNTIME_KINDS)) {
    return null;
  }
  return { id: value.id, name: value.name, status: value.status, description: value.description, kind: value.kind };
}

function parseTool(value: unknown): ToolSummary | null {
  if (!isRecord(value) || !hasPlaceholderBase(value) || !isStringIn<ToolSummary["category"]>(value.category, TOOL_CATEGORIES)) {
    return null;
  }
  return { id: value.id, name: value.name, status: value.status, description: value.description, category: value.category };
}

function parseSkill(value: unknown): SkillSummary | null {
  if (!isRecord(value) || !hasPlaceholderBase(value) || !isStringIn<SkillSummary["domain"]>(value.domain, SKILL_DOMAINS)) {
    return null;
  }
  return { id: value.id, name: value.name, status: value.status, description: value.description, domain: value.domain };
}

function parseGateway(value: unknown): GatewaySummary | null {
  if (!isRecord(value) || !hasPlaceholderBase(value) || !isStringIn<GatewaySummary["protocol"]>(value.protocol, GATEWAY_PROTOCOLS)) {
    return null;
  }
  return { id: value.id, name: value.name, status: value.status, description: value.description, protocol: value.protocol };
}

function parseCapability(value: unknown): BuildingCapabilitySummary | null {
  if (!isRecord(value) || !hasPlaceholderBase(value) || !isStringIn<BuildingCapabilitySummary["domain"]>(value.domain, CAPABILITY_DOMAINS)) {
    return null;
  }
  return { id: value.id, name: value.name, status: value.status, description: value.description, domain: value.domain };
}

function parseArray<T>(value: unknown, parser: (item: unknown) => T | null, message: string): T[] {
  if (!Array.isArray(value)) {
    malformed(message);
  }

  return value.map((item) => {
    const parsed = parser(item);
    if (!parsed) {
      malformed(message);
    }
    return parsed;
  });
}

function parsePlaceholderMeta(payload: Record<string, unknown>, message: string): { limit: number; requestId: string } {
  if (typeof payload.limit !== "number" || payload.placeholderOnly !== true || typeof payload.requestId !== "string") {
    malformed(message);
  }
  return { limit: payload.limit, requestId: payload.requestId };
}

export function parseRegistryResponse(payload: unknown): RegistryResponse {
  if (!isRecord(payload)) {
    malformed("Registry returned an unexpected response.");
  }

  const meta = parsePlaceholderMeta(payload, "Registry returned an unexpected response.");
  return {
    runtimeProviders: parseArray(payload.runtimeProviders, parseRuntimeProvider, "Registry returned unexpected runtime providers."),
    tools: parseArray(payload.tools, parseTool, "Registry returned unexpected tools."),
    skills: parseArray(payload.skills, parseSkill, "Registry returned unexpected skills."),
    gateways: parseArray(payload.gateways, parseGateway, "Registry returned unexpected gateways."),
    buildingCapabilities: parseArray(payload.buildingCapabilities, parseCapability, "Registry returned unexpected building capabilities."),
    limit: meta.limit,
    placeholderOnly: true,
    requestId: meta.requestId
  };
}

export function parseProjectManagementResponse(payload: unknown): ProjectManagementResponse {
  if (!isRecord(payload) || typeof payload.projectId !== "string") {
    malformed("Project management returned an unexpected response.");
  }

  const meta = parsePlaceholderMeta(payload, "Project management returned an unexpected response.");
  return {
    projectId: payload.projectId,
    gateways: parseArray(payload.gateways, parseGateway, "Project management returned unexpected gateways."),
    capabilities: parseArray(payload.capabilities, parseCapability, "Project management returned unexpected capabilities."),
    tools: parseArray(payload.tools, parseTool, "Project management returned unexpected tools."),
    limit: meta.limit,
    placeholderOnly: true,
    requestId: meta.requestId
  };
}
