export type Permission = "chat:read" | "chat:write";

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
  role: "user";
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
