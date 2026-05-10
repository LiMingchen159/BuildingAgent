export type Permission = "chat:read" | "chat:write";
export type PlaceholderStatus = "placeholder" | "mock" | "not_configured";

export interface PlaceholderRuntimeProvider {
  id: string;
  name: string;
  kind: "llm" | "embedding" | "workflow";
  status: PlaceholderStatus;
  description: string;
}

export interface PlaceholderTool {
  id: string;
  name: string;
  category: "analysis" | "retrieval" | "building";
  status: PlaceholderStatus;
  description: string;
}

export interface PlaceholderSkill {
  id: string;
  name: string;
  domain: "building" | "project" | "runtime";
  status: PlaceholderStatus;
  description: string;
}

export interface PlaceholderGateway {
  id: string;
  name: string;
  protocol: "http" | "mcp" | "local";
  status: PlaceholderStatus;
  description: string;
}

export interface PlaceholderCapability {
  id: string;
  name: string;
  domain: "energy" | "safety" | "maintenance" | "planning";
  status: PlaceholderStatus;
  description: string;
}

export interface ProjectManagementFixtures {
  gateways: PlaceholderGateway[];
  capabilities: PlaceholderCapability[];
  tools: PlaceholderTool[];
}

export interface SeedUser {
  id: string;
  name: string;
  email: string;
  password: string;
}

export interface SeedProject {
  id: string;
  name: string;
}

export interface SeedMembership {
  userId: string;
  projectId: string;
  permissions: Permission[];
}

export interface ChatMessage {
  id: string;
  projectId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
}

export interface SessionState {
  userId: string;
  selectedProjectId: string | null;
}

export interface SeedStore {
  users: SeedUser[];
  tokens: Record<string, string>;
  projects: SeedProject[];
  memberships: SeedMembership[];
  messagesByProject: Record<string, ChatMessage[]>;
  runtimeProviders: PlaceholderRuntimeProvider[];
  tools: PlaceholderTool[];
  skills: PlaceholderSkill[];
  gateways: PlaceholderGateway[];
  buildingCapabilities: PlaceholderCapability[];
  managementByProject: Record<string, ProjectManagementFixtures>;
  sessionsByToken: Record<string, SessionState>;
  maxListSize: number;
  maxChatMessages: number;
}

export function createSeedStore(): SeedStore {
  const projects: SeedProject[] = [
    { id: "project_alpha", name: "Alpha Build" },
    { id: "project_beta", name: "Beta Build" },
    { id: "project_gamma", name: "Gamma Build" }
  ];

  const runtimeProviders: PlaceholderRuntimeProvider[] = [
    {
      id: "runtime_provider_local_llm",
      name: "Local LLM Provider Placeholder",
      kind: "llm",
      status: "placeholder",
      description: "Synthetic local runtime provider slot for future model routing diagnostics."
    },
    {
      id: "runtime_provider_embeddings",
      name: "Embedding Provider Placeholder",
      kind: "embedding",
      status: "not_configured",
      description: "Synthetic embedding provider slot with no external key or live index configured."
    },
    {
      id: "runtime_provider_workflow",
      name: "Workflow Runtime Placeholder",
      kind: "workflow",
      status: "mock",
      description: "Mock workflow provider entry used only to exercise registry listings."
    }
  ];

  const tools: PlaceholderTool[] = [
    {
      id: "tool_space_summary",
      name: "Space Summary Tool Placeholder",
      category: "building",
      status: "placeholder",
      description: "Synthetic tool definition for summarizing sample space metadata."
    },
    {
      id: "tool_document_lookup",
      name: "Document Lookup Tool Placeholder",
      category: "retrieval",
      status: "not_configured",
      description: "Synthetic retrieval tool slot with no live document connector."
    },
    {
      id: "tool_energy_snapshot",
      name: "Energy Snapshot Tool Placeholder",
      category: "analysis",
      status: "mock",
      description: "Mock analysis tool entry backed only by placeholder fixtures."
    }
  ];

  const skills: PlaceholderSkill[] = [
    {
      id: "skill_building_triage",
      name: "Building Triage Skill Placeholder",
      domain: "building",
      status: "placeholder",
      description: "Synthetic skill card for routing future building diagnostics."
    },
    {
      id: "skill_project_readiness",
      name: "Project Readiness Skill Placeholder",
      domain: "project",
      status: "mock",
      description: "Mock skill card for project-management workflow inspection."
    },
    {
      id: "skill_runtime_health",
      name: "Runtime Health Skill Placeholder",
      domain: "runtime",
      status: "not_configured",
      description: "Synthetic runtime health skill with no external observability backend."
    }
  ];

  const gateways: PlaceholderGateway[] = [
    {
      id: "gateway_bms_placeholder",
      name: "BMS Gateway Placeholder",
      protocol: "http",
      status: "not_configured",
      description: "Synthetic building-management gateway; no live BMS endpoint is configured."
    },
    {
      id: "gateway_mcp_placeholder",
      name: "MCP Gateway Placeholder",
      protocol: "mcp",
      status: "placeholder",
      description: "Placeholder MCP gateway definition for future external tool bridging."
    },
    {
      id: "gateway_local_fixture",
      name: "Local Fixture Gateway",
      protocol: "local",
      status: "mock",
      description: "Mock local gateway backed by in-memory synthetic fixtures only."
    }
  ];

  const buildingCapabilities: PlaceholderCapability[] = [
    {
      id: "capability_energy_baseline",
      name: "Energy Baseline Placeholder",
      domain: "energy",
      status: "mock",
      description: "Synthetic capability for future energy baseline analysis without real meter data."
    },
    {
      id: "capability_life_safety_review",
      name: "Life Safety Review Placeholder",
      domain: "safety",
      status: "placeholder",
      description: "Placeholder capability for safety review workflows using no customer records."
    },
    {
      id: "capability_maintenance_priorities",
      name: "Maintenance Priorities Placeholder",
      domain: "maintenance",
      status: "not_configured",
      description: "Synthetic maintenance planning capability with no live CMMS integration."
    },
    {
      id: "capability_project_phasing",
      name: "Project Phasing Placeholder",
      domain: "planning",
      status: "placeholder",
      description: "Placeholder project phasing capability for management page diagnostics."
    }
  ];

  const managementByProject: Record<string, ProjectManagementFixtures> = Object.fromEntries(
    projects.map((project, index) => [
      project.id,
      {
        gateways: gateways.slice(index % gateways.length, (index % gateways.length) + 1),
        capabilities: buildingCapabilities.slice(index, index + 2),
        tools: tools.slice(0, 2)
      }
    ])
  );

  return {
    users: [
      { id: "user_ada", name: "Ada Lovelace", email: "ada@example.test", password: "local-dev-password" },
      { id: "user_grace", name: "Grace Hopper", email: "grace@example.test", password: "local-dev-password" }
    ],
    tokens: {
      "seed-token-ada": "user_ada",
      "seed-token-grace": "user_grace"
    },
    projects,
    memberships: [
      { userId: "user_ada", projectId: "project_alpha", permissions: ["chat:read", "chat:write"] },
      { userId: "user_ada", projectId: "project_beta", permissions: ["chat:read"] },
      { userId: "user_grace", projectId: "project_gamma", permissions: ["chat:read", "chat:write"] }
    ],
    messagesByProject: Object.fromEntries(projects.map((project) => [project.id, [] as ChatMessage[]])),
    runtimeProviders,
    tools,
    skills,
    gateways,
    buildingCapabilities,
    managementByProject,
    sessionsByToken: {},
    maxListSize: 50,
    maxChatMessages: 25
  };
}

export function cloneStore(store: SeedStore): SeedStore {
  return {
    users: store.users.map((user) => ({ ...user })),
    tokens: { ...store.tokens },
    projects: store.projects.map((project) => ({ ...project })),
    memberships: store.memberships.map((membership) => ({ ...membership, permissions: [...membership.permissions] })),
    messagesByProject: Object.fromEntries(
      Object.entries(store.messagesByProject).map(([projectId, messages]) => [
        projectId,
        messages.map((message) => ({ ...message }))
      ])
    ),
    runtimeProviders: store.runtimeProviders.map((provider) => ({ ...provider })),
    tools: store.tools.map((tool) => ({ ...tool })),
    skills: store.skills.map((skill) => ({ ...skill })),
    gateways: store.gateways.map((gateway) => ({ ...gateway })),
    buildingCapabilities: store.buildingCapabilities.map((capability) => ({ ...capability })),
    managementByProject: Object.fromEntries(
      Object.entries(store.managementByProject).map(([projectId, management]) => [
        projectId,
        {
          gateways: management.gateways.map((gateway) => ({ ...gateway })),
          capabilities: management.capabilities.map((capability) => ({ ...capability })),
          tools: management.tools.map((tool) => ({ ...tool }))
        }
      ])
    ),
    sessionsByToken: Object.fromEntries(
      Object.entries(store.sessionsByToken).map(([token, session]) => [token, { ...session }])
    ),
    maxListSize: store.maxListSize,
    maxChatMessages: store.maxChatMessages
  };
}

export function seedStore(): SeedStore {
  return createSeedStore();
}
