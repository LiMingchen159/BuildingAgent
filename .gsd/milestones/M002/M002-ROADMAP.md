# M002: BuildingAgent UI Redesign and Project-Scoped Workspace

**Vision:** Turn the current local skeleton Web app into a polished ChatGPT/Hermes-style BuildingAgent project workspace that proves the product information architecture, project/account scope boundaries, Markdown and mock visual chat output, and safe mock-only operational surfaces without adding real building integrations or external actions.

## Success Criteria

- A seeded user can log in, select an authorized project, and enter the redesigned project workspace through the local Web app.
- The app shows a visible shell/loading/skeleton state quickly and avoids a post-bundle blank screen.
- The workspace is a coherent three-column UI with left project navigation, central chat, and right contextual panel.
- Assistant Markdown renders correctly and mock image previews open/close in the browser.
- Knowledge Base and Repository mock surfaces are visibly project-scoped and clearly non-operational.
- The right panel order is fixed as Scheduled & Rule-based Tasks, Skills, Tools.
- All task, skill, tool, repository, scheduling, building-domain, and control examples are labeled mock/stub-only and no excluded live operation is reachable.

## Slices

- [x] **S01: S01** `risk:high` `depends:[]`
  > After this: After this: opening the local Web app shows a branded BuildingAgent shell or skeleton immediately after HTML/React bootstrap, with bounded loading/error states and reusable UI primitives ready for later screens.

- [ ] **S02: Polished Seeded Login Experience** `risk:medium` `depends:[S01]`
  > After this: After this: a seeded user can log in through a polished BuildingAgent-branded page that preserves the existing auth/session contract and displays safe request-id-aware errors.

- [ ] **S03: Authorized Project Selection Redesign** `risk:medium` `depends:[S01,S02]`
  > After this: After this: an authenticated user sees a polished list of authorized projects, can select one, and understands project metadata and building examples are local mock/stub context only.

- [ ] **S04: Three-Column Project Workspace IA** `risk:high` `depends:[S01,S02,S03]`
  > After this: After this: selecting a project opens a coherent three-column workspace with left navigation/project switcher, center chat, right context rail, project-scope markers, and an account-level settings affordance.

- [ ] **S05: Markdown Chat and Mock Image Previews** `risk:high` `depends:[S04]`
  > After this: After this: assistant chat messages render Markdown as structured HTML and mock image outputs appear inline with an enlarge-and-close preview interaction.

- [ ] **S06: Project Knowledge Base and Repository Mock Surfaces** `risk:medium` `depends:[S04]`
  > After this: After this: users can navigate project-scoped Knowledge Base and Repository mock surfaces that clearly show limited current-project context and approval-gated future repository actions.

- [ ] **S07: Ordered Right Panel and Integrated Verification** `risk:medium` `depends:[S04,S05,S06]`
  > After this: After this: the full local login → project selection → workspace flow shows the right panel in the exact order Scheduled & Rule-based Tasks, Skills, Tools, with mock-only labels and browser verification evidence.

## Boundary Map

## Boundary Map

- **S01 App Shell & Loading Primitives** produces the shared visual language, immediate static/React loading shell, reusable layout primitives, mock-only badge vocabulary, and first-load test hooks consumed by every later UI slice.
- **S02 Branded Login Flow** consumes S01 shell primitives and existing `apps/web/src/api.ts` auth contracts; produces a polished seeded-login entry screen that keeps M001 auth/session behavior unchanged.
- **S03 Authorized Project Selection** consumes S01/S02 visual and session patterns plus `/api/projects`; produces a polished project chooser that only renders authorized API projects and clearly labels mock metadata.
- **S04 Three-Column Workspace IA** consumes S01 layout primitives and S03 selected-project state; produces the durable workspace frame: left nav/project switcher, center chat region, right context rail, project-scope labels, and account settings affordance.
- **S05 Markdown & Mock Image Chat** consumes the S04 center chat contract and existing chat API responses; produces safe Markdown rendering and non-operational mock image preview behavior without real generation or repository persistence.
- **S06 Project KB & Repository Mock Surfaces** consumes S04 navigation/scope contracts; produces project-scoped, mock-only Knowledge Base and Repository surfaces with approval-gated future action language.
- **S07 Ordered Right Panel & Integrated Flow** consumes S04 right-rail contract plus S05/S06 surfaces; produces final Scheduled & Rule-based Tasks → Skills → Tools ordering, mock-only safety assertions, and full local browser verification.

## Horizontal Checklist

- **Requirements re-read:** Active M002 requirements R015 and R028-R036 are mapped to slices; R035 mock/stub-only is carried across all slices and re-checked in S07.
- **Decisions re-evaluated:** D012-D014 remain current; this plan keeps M002 UI-first, separates account/project scope, and treats Markdown/images as first-class chat UI contracts.
- **Auth boundary:** Existing M001 API auth, selected-project, membership, and permission checks remain the only real backend boundaries used by the redesigned UI.
- **Shared resources:** The Web app keeps `api.ts`, localStorage rehydration, and existing test harness as shared seams; mock workspace fixtures stay front-end-local unless a later milestone promotes them to API contracts.
- **Reconnection/continuity:** Session rehydration and selected-project recovery remain part of the shell/workspace flow; failures continue to show request-id-aware bounded error states for real API calls.
- **Graceful shutdown / operations:** No new long-running backend worker, scheduler, MCP dispatcher, repository writer, or building-control process is introduced.
- **Revenue/cost path:** No unapproved cost-producing provider call is added; provider behavior remains whatever M001 already gates behind existing env configuration.
- **Safety boundary:** Real RAG, MCP calls, scheduling backend, repository mutation, BIM/Brick/time-series integrations, BMS control, chiller shutdown, and external operations remain excluded.
