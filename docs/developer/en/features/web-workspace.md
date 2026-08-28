# Web workspace

[中文](../../zh-CN/features/web-workspace.md) | [Developer documentation home](../README.md) | [Draw.io source](../../../assets/diagrams/web-workspace-map.drawio)

> Code baseline: `main@af44ff15`. Status: login, project selection, the three-region workspace, and the primary business pages are **Implemented**; navigation completeness and some panel data are **Partial**; a standalone model-debugging console is **Planned**.

![Web workspace map](../../../assets/diagrams/web-workspace-map.drawio.svg)

## 1. Status and code baseline

[App.tsx](../../../../apps/web/src/App.tsx) composes login, project restoration, URL synchronization, conversations, Chat streaming, BMS, the knowledge base, Repository, Dashboards, Auto Report, registry/management placeholder panels, and WebSocket state. It is the React SPA's large composition root, not a microfrontend container; this page separates UI responsibilities only as a reading model.

| Surface | Status | Current fact |
| --- | --- | --- |
| Login, project selection, conversations, and central Chat | Implemented | They use the real Web API client, with Fastify re-enforcing authentication and project isolation. |
| Left sidebar, center, and collapsible right panel | Implemented | [WorkspaceShell.tsx](../../../../apps/web/src/ui/WorkspaceShell.tsx) provides three ARIA-labelled regions. |
| BMS, knowledge base, Repository, Dashboard, and Auto Report | Implemented / Partial | The pages are connected; each domain still has its own contract gaps, so “opens in the UI” does not mean feature-complete. |
| Registry, Gateways, and Building Domain | Partial | Center panels and URL branches exist, but their content is explicitly placeholder/synthetic and there is no complete visible tab navigation. |
| Right-panel Tasks, Skills, and Tools | Partial | The Dashboard list comes from project state; the first three card groups still render static example components. |
| Model debugging and account configuration | Planned | Provider diagnostics appear with Chat, but the account menu's API key, Base URL, Model, and Settings items have no action handlers. |

## 2. Purpose and boundary

The Web workspace combines “who is the user, which project is active, and which feature surface is open” into one browser interaction shell. It owns presentation, client-state coordination, and API calls; it is not the authority for permissions, business data, or scheduler outcomes.

After login, the project picker appears first. Selecting a project opens a left project/conversation/asset sidebar, the active center page, and a right task/skill/tool/Dashboard asset panel. Dashboards also support a standalone `?view=solo` view. The target architecture's custom panels and natural-language conversation have concrete implementations; a separate model-debugging console, world model, and other targets must not be inferred from existing menu copy.

## 3. User entry points and key source entry points

- SPA bootstrap: [apps/web/src/main.tsx](../../../../apps/web/src/main.tsx)
- Large composition root, path parsing, and surface switching: [apps/web/src/App.tsx](../../../../apps/web/src/App.tsx)
- REST, SSE, and WebSocket client: [apps/web/src/api.ts](../../../../apps/web/src/api.ts)
- Three-region semantic shell: [WorkspaceShell.tsx](../../../../apps/web/src/ui/WorkspaceShell.tsx), [LeftSidebar.tsx](../../../../apps/web/src/ui/LeftSidebar.tsx), [CenterWorkspace.tsx](../../../../apps/web/src/ui/CenterWorkspace.tsx), and [RightPanel.tsx](../../../../apps/web/src/ui/RightPanel.tsx)
- Center feature components: [BmsDataConfig.tsx](../../../../apps/web/src/ui/BmsDataConfig.tsx), [KnowledgeBase.tsx](../../../../apps/web/src/ui/KnowledgeBase.tsx), [Repository.tsx](../../../../apps/web/src/ui/Repository.tsx), [DashboardView.tsx](../../../../apps/web/src/ui/DashboardView.tsx), and [AutoReport.tsx](../../../../apps/web/src/ui/AutoReport.tsx)
- Right-panel components: [ScheduledTasks.tsx](../../../../apps/web/src/ui/ScheduledTasks.tsx), [Skills.tsx](../../../../apps/web/src/ui/Skills.tsx), and [Tools.tsx](../../../../apps/web/src/ui/Tools.tsx)

`App.tsx` uses `history.pushState` and `popstate` directly; it does not use a routing framework. Parsed paths are `/projects/:projectId/{chat|bms-data-config|kb|repo|dashboards|autoreport|registry|gateways|building}`, with `/projects/:projectId/dashboards/:dashboardId` for a Dashboard detail. The conversation id is not encoded in the URL.

## 4. Normal data flow

1. On first mount, the app reads `building-agent.session.v1`. With a saved token it requests the session and accessible projects in parallel; otherwise it renders login.
2. Explicit login clears the project selection and returns to `/`. Restoration chooses “project in the URL → project in the server session → project in localStorage”; a one-shot sessionStorage flag set by explicit login prevents immediately restoring the old project.
3. After project selection, the client calls select and loads registry, project management, conversations, Chat, knowledge-base, Repository, and Dashboard summaries; core client state remains centralized in `App` React state.
4. The left sidebar switches project or conversation and opens BMS, knowledge base, Repository, or Auto Report. “New chat” creates only a local draft state; the server creates and returns the conversation after the first message is sent.
5. The path builder updates `activeTab` and browser history, and the center conditionally renders the selected surface. Selecting a Dashboard in the right panel synchronizes the URL and center Dashboard.
6. Chat uses SSE to update the activity timeline and answer. The project WebSocket updates reminders, conversation titles, Dashboard creation/changes, and point values. Active Chat polls every five seconds for proactive messages; non-Dashboard pages make a best-effort sidebar refresh every 15 seconds.

## 5. Data, state, and persistence

- `localStorage` holds the bearer token, user summary, and last project id; `sessionStorage` holds only the one-shot “skip project restore” flag. These browser copies are not authorization facts.
- The URL persists the project, feature area, and optional Dashboard id. The current conversation, panel collapse state, draft, streaming state, banners, and realtime values live only in React state/refs.
- Messages, conversations, projects, Dashboards, and other authoritative records remain in the API or external systems; see [Runtime and storage topology](../architecture/runtime-storage.md). Knowledge-base, Repository, and Dashboard load failures may degrade to empty collections, so an empty UI is not authoritative proof of no data.
- Project-card Active/Paused state and zone are generated by `projectMockMetrics`, a deterministic hash of the id. Color and icon selections in the new-project form are not sent by `createProject`. These are **Partial / example presentation**, not persisted project attributes.
- Right-panel Scheduled Tasks, Skills, and Tools render static arrays. Their displayed counts also come from hard-coded or registry/management values, so the count and cards do not share one authoritative collection.

## 6. Permissions and project isolation

Unless both a token and user summary are present, `App` does not render a project workspace. A `401` or structured auth error clears browser state and returns to `/`. The project card view disables Open without `chat:read`, and the Chat composer disables writes without `chat:write`, but these are user-experience gates only.

Fastify is authoritative for membership, selected-project, and permission checks. Every client request must use the current project URL; neither React state nor a deep link is proof of access. Switching project replaces messages, conversations, and successfully loaded project assets; the realtime-value effect clears its cache, while the WebSocket effect closes the old connection and creates one for the new project id. See [Authentication, projects, and conversations](auth-projects-conversations.md) for the full boundary.

## 7. Errors, degradation, and external dependencies

- `ApiClientError` becomes a banner with code/requestId; unknown errors use generic copy instead of exposing exceptions or credentials.
- An expired session clears all local state. Failure of registry/management requests needed during project selection prevents opening it; knowledge-base, Repository, and Dashboard summaries instead degrade independently to empty or retained data.
- Proactive-message polling, the 15-second sidebar refresh, and unparseable WebSocket messages fail silently. A closed WebSocket reconnects every five seconds. There is no unified offline state, so stale data may be explicitly indicated only on the Dashboard.
- Chat/LLM, the BMS collector, STT, field gateways, and networking are **External** capabilities. Rendering the local shell does not prove those dependencies are available.
- Browser history recognizes only the fixed paths. An unknown path does not map to a workspace tab; opening a known deep link still requires a valid token, project membership, and successful API restoration.

## 8. Extension method

When adding a center surface, update `WorkspaceTab`, path construction/parsing, a visible entry point, conditional center rendering, required state loading, and `popstate` tests together; adding only to the currently unused `tabs` constant is insufficient. New right-panel assets should use project-scoped API records and stable ids rather than copying static demo arrays or treating a count as the underlying record list.

Put substantial features in dedicated `apps/web/src/ui/` components, keep `App.tsx` as the composition layer, and pass token, project id, and results through explicit props/callbacks. Any new REST/SSE/WS event must also update [api.ts](../../../../apps/web/src/api.ts), [API and event contracts](../architecture/api-events.md), and client/server tests.

## 9. Corresponding tests

- Login, restore, project selection, conversations, permissions, errors, the right-panel Dashboard, WebSocket, and the BMS path: [apps/web/src/App.test.tsx](../../../../apps/web/src/App.test.tsx)
- Three ARIA regions, optional right panel, and class composition: [apps/web/src/workspaceShell.test.tsx](../../../../apps/web/src/workspaceShell.test.tsx)
- Initial fallback, toasts, skeletons, and empty states: [apps/web/src/appShell.test.tsx](../../../../apps/web/src/appShell.test.tsx)
- SSE parsing and incomplete-stream errors: [apps/web/src/api.test.ts](../../../../apps/web/src/api.test.ts)

Recommended from the repository root:

```bash
npm --workspace @building-agent/web exec -- vitest run --dir src
```

## 10. Known limitations and related documentation

- `App.tsx` owns routing, remote loads, realtime connections, and many domain interactions at once. It is not a microfrontend, and separating page components has not removed shared-state coupling.
- `tabs` defines nine feature names but is not rendered as a visible tab bar. The left sidebar exposes BMS, knowledge base, Repository, and Auto Report; Chat/conversations and right-panel Dashboards provide the other common entries. Registry/Gateways/Building primarily depend on known deep links.
- During project switching, a failed Dashboard-list request degrades to `null` and does not actively clear the old list. The server still isolates subsequent reads, but the UI can temporarily show a stale Dashboard summary from the prior project.
- Project-list view does not reuse the card view's `chat:read` disable check. The server still rejects unauthorized access; this UI difference must not be mistaken for the authorization fix itself.
- Help, Notifications, and account-configuration menu entries have no actions. Model debugging is limited to Chat provider diagnostics, not a configuration or debugging workbench.
- Continue with [Chat and Agent Runtime](chat-agent-runtime.md), [BMS integration](bms-integration.md), [Dashboards and Reports](dashboards-reports.md), [Scheduler, realtime, and STT](scheduler-realtime-stt.md), and [Current implementation architecture](../architecture/current-architecture.md).
