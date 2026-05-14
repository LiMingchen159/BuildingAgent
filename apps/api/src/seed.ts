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

export interface ChatMessageActivity {
  id?: string;
  label: string;
  kind: "tool" | "memory" | "kb" | "file" | "response" | "context";
  tool?: string;
  status?: "running" | "done";
  raw?: string;
  requestId?: string;
  detail?: string;
  output?: string;
  durationMs?: number;
  exitCode?: number;
}

export interface ChatMessage {
  id: string;
  projectId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  artifactId?: string | undefined;
  activities?: ChatMessageActivity[] | undefined;
  workDuration?: number | undefined;
}

export interface KnowledgeBaseDocument {
  id: string;
  projectId: string;
  name: string;
  path: string;
  kind: "text" | "turtle" | "markdown" | "parquet" | "data" | "other";
  sizeBytes: number;
  excerpt?: string | undefined;
}

export interface RepositoryArtifact {
  id: string;
  projectId: string;
  name: string;
  path?: string;
  kind: "note" | "analysis" | "summary";
  generatedAt: string;
  sourceMessageId?: string;
  description?: string;
  content?: string;
  sizeBytes?: number;
}

export interface Conversation {
  id: string;
  projectId: string;
  title: string;
  messageIds: string[];
  createdAt: string;
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
  conversationsByProject: Record<string, Conversation[]>;
  knowledgeBaseByProject: Record<string, KnowledgeBaseDocument[]>;
  repositoryByProject: Record<string, RepositoryArtifact[]>;
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
    { id: "project_gamma", name: "Gamma Build" },
    { id: "project_mortar", name: "Mortar" },
    { id: "project_demo", name: "Demo Project" }
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

  const messagesByProject: Record<string, ChatMessage[]> = Object.fromEntries(projects.map((project) => [project.id, [] as ChatMessage[]]));
  const conversationsByProject: Record<string, Conversation[]> = Object.fromEntries(projects.map((project) => [project.id, [] as Conversation[]]));

  // Seed: Mortar project — Building 40 semantic model review
  const mortarConversation: Conversation = {
    id: "conv_seed_mortar_01",
    projectId: "project_mortar",
    title: "Building 40 Semantic Model Review",
    messageIds: ["msg_seed_mortar_01", "msg_seed_mortar_02", "msg_seed_mortar_03", "msg_seed_mortar_04"],
    createdAt: "2026-05-10T08:30:00.000Z"
  };
  conversationsByProject["project_mortar"] = [mortarConversation];
  messagesByProject["project_mortar"] = [
    { id: "msg_seed_mortar_01", projectId: "project_mortar", userId: "user_ada", role: "user", content: "Review the Brick TTL schema for Building 40 and identify any missing sensor relationships." },
    { id: "msg_seed_mortar_02", projectId: "project_mortar", userId: "user_ada", role: "assistant", content: "I've analyzed the bldg40.ttl Brick model. The semantic graph covers 12 zones, 8 air-handling units, and 3 chillers. However, I noticed that the VAV boxes in zones 4 and 7 lack discharge air temperature sensor relationships. The energy meter for the east wing is also missing its electrical panel association. I recommend adding `brick:hasPoint` edges for those sensors. The temperature setpoint deviations on the 3rd floor AHU are within normal range (±0.3°C), but the pressure sensor on VAV-4B shows intermittent readings that may indicate a faulty transducer." },
    { id: "msg_seed_mortar_03", projectId: "project_mortar", userId: "user_ada", role: "user", content: "Great analysis. Also check if there are any historical energy patterns that correlate with the VAV issues." },
    { id: "msg_seed_mortar_04", projectId: "project_mortar", userId: "user_ada", role: "assistant", content: "Cross-referencing the energy data with VAV performance: the east wing energy consumption spikes 12% on weekdays between 14:00-16:00, which correlates with the VAV-4B pressure anomalies. This suggests the faulty transducer may be causing the VAV to over-compensate, driving up fan energy. I'd recommend prioritizing the VAV-4B transducer replacement — estimated energy savings of 8-10% on the east wing AHU. The Brick model already has the replacement part reference (`bldg:VAV-4B-PT-01`) linked in the maintenance schedule." }
  ];

  // Seed: Demo project — generic test conversation
  const demoConversation: Conversation = {
    id: "conv_seed_demo_01",
    projectId: "project_demo",
    title: "Welcome to Demo Project",
    messageIds: ["msg_seed_demo_01", "msg_seed_demo_02"],
    createdAt: "2026-05-11T14:00:00.000Z"
  };
  conversationsByProject["project_demo"] = [demoConversation];
  messagesByProject["project_demo"] = [
    { id: "msg_seed_demo_01", projectId: "project_demo", userId: "user_ada", role: "user", content: "This is a test project to verify project switching isolation works correctly." },
    { id: "msg_seed_demo_02", projectId: "project_demo", userId: "user_ada", role: "assistant", content: "Understood! This Demo Project is isolated from Mortar and other projects. Conversations, knowledge base documents, and repository artifacts are all scoped to this project. You can switch between projects using the sidebar dropdown, and each will maintain its own context. I'll remember that this is purely for testing project switching behavior." }
  ];

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
      { userId: "user_ada", projectId: "project_beta", permissions: ["chat:read", "chat:write"] },
      { userId: "user_ada", projectId: "project_mortar", permissions: ["chat:read", "chat:write"] },
      { userId: "user_ada", projectId: "project_demo", permissions: ["chat:read", "chat:write"] },
      { userId: "user_grace", projectId: "project_gamma", permissions: ["chat:read", "chat:write"] }
    ],
    messagesByProject,
    conversationsByProject,
    knowledgeBaseByProject: Object.fromEntries(projects.map((project) => [project.id, [] as KnowledgeBaseDocument[]])),
    repositoryByProject: Object.fromEntries(projects.map((project) => [project.id, [] as RepositoryArtifact[]])),
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
    conversationsByProject: Object.fromEntries(
      Object.entries(store.conversationsByProject).map(([projectId, conversations]) => [
        projectId,
        conversations.map((conversation) => ({ ...conversation, messageIds: [...conversation.messageIds] }))
      ])
    ),
    knowledgeBaseByProject: Object.fromEntries(
      Object.entries(store.knowledgeBaseByProject).map(([projectId, documents]) => [
        projectId,
        documents.map((document) => ({ ...document }))
      ])
    ),
    repositoryByProject: Object.fromEntries(
      Object.entries(store.repositoryByProject).map(([projectId, artifacts]) => [
        projectId,
        artifacts.map((artifact) => ({ ...artifact }))
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
