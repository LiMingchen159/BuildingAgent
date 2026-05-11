# M002 Completion Report

**Milestone:** M002 — UI redesign and three-column workspace shell
**Branch:** `buildingagent`
**Completed:** 2026-05-11
**Issues closed:** #97 – #120 (24 of 24)

---

## Scope delivered

| Slice | Issues | Theme | Status |
| --- | --- | --- | --- |
| 1 | #97, #98, #99 | Foundation: design tokens, primitive component library, three-column shell | done |
| 2 | #100, #101 | Login redesign + loading animations | done |
| 3 | #102, #103 | Project selection redesign + skeletons | done |
| 4 | #104, #105, #106 | Three-column workspace (sidebar / center / right) | done |
| 5 | #107, #108, #109 | Markdown rendering, image lightbox, code-copy buttons | done |
| 6 | #110, #111 | Knowledge Base panel + sidebar shortcut | done |
| 7 | #112, #113 | Repository panel + sidebar shortcut | done |
| 8 | #114, #115, #116 | Right-panel cards: tasks, skills, tools | done |
| 9 | #117, #118 | First-load polish + vendor chunk split + skeleton parity | done |
| 10 | #119, #120 | Demo conversation + this completion report | done |

Each issue has a comment on the GitHub issue with the implementing commit SHA.

---

## Verification

`npm run typecheck --workspace @building-agent/web` — clean
`npm test --workspace @building-agent/web` — **40 tests passed** across 6 files
`npm run build --workspace @building-agent/web` — green, vendor chunks split:

```
dist/assets/vendor-DYLXRpC5.js              4.10 kB │ gzip:  1.78 kB
dist/assets/vendor-react-CFCE4xZu.js        7.72 kB │ gzip:  2.88 kB
dist/assets/index-r2TV6Zvk.js              57.64 kB │ gzip: 16.30 kB
dist/assets/vendor-react-dom-DCalX_8e.js  129.82 kB │ gzip: 41.68 kB
```

---

## Architecture

The post-selection workspace renders inside `WorkspaceShell` (`apps/web/src/ui/WorkspaceShell.tsx`) — a CSS grid that pins a 240 px sidebar and a 320 px right panel and gives the center column the remaining space. Below 960 px the shell collapses to a single column. Each region has its own scroll container.

```
+----------------+--------------------------------+----------------+
| LeftSidebar    | CenterWorkspace                | RightPanel     |
|                |                                |                |
| Brand          | Project title + scope notice   | Scheduled &    |
| New chat       | Tab nav: Chat, KB, Repo,       | rule-based     |
| Active project |   Platform Registry,           | tasks          |
| Conversation   |   Gateways, Building Domain    |                |
|   history      |                                | Skills         |
| KB shortcut    | Active panel content           |                |
| Repo shortcut  |                                | Tools          |
| Account block  |                                |                |
+----------------+--------------------------------+----------------+
```

### Component inventory (new in M002)

- **Primitives** (`apps/web/src/ui/primitives.tsx`): `Button` (3 variants × 3 sizes), `Input`, `Textarea`, `Badge` / `Pill` (6 tones), `Avatar`, `Dropdown` (full keyboard nav). Existing primitives `AppShell`, `Banner`, `Card`, `Surface`, `LoadingSkeleton`, `EmptyState`, `MockOnlyBadge` are unchanged.
- **Layout** (`apps/web/src/ui/{LeftSidebar,CenterWorkspace,RightPanel,WorkspaceShell}.tsx`).
- **Markdown** (`apps/web/src/ui/Markdown.tsx`): in-tree renderer — no new npm dependencies. Supports headings, lists, bold/italic, links (with safe `target="_blank"` / `rel="noopener noreferrer"`), inline code, fenced code blocks (with copy button + execCommand fallback), pipe tables, blockquotes, and horizontal rules.
- **Chat images** (`apps/web/src/ui/ChatImageGallery.tsx`): card grid + focus-trapped lightbox with arrow-key paging and Escape close.
- **Knowledge Base** (`apps/web/src/ui/KnowledgeBase.tsx`): upload zone + document list with file-type icons (PDF / DOC / XLS / RPT / MAN / DWG).
- **Repository** (`apps/web/src/ui/Repository.tsx`): output list with approval-required notice.
- **Right-panel cards** (`apps/web/src/ui/{ScheduledTasks,Skills,Tools}.tsx`): mock cards with status badges (4 of 7 covered statuses).
- **Demo conversation** (`apps/web/src/ui/demoConversation.ts`): on-demand mock chat that exercises the markdown / image / code-copy paths.

### Design tokens

`apps/web/src/styles.css` opens with a `:root` block defining the full palette (primary blue / amber accents / surface / border / focus ring), spacing scale (4 px base), typography scale, radii, shadows, motion durations, easing, and layout widths. Every new component consumes tokens via `var(--…)` — no hardcoded colors except inside file-icon tints (deliberately kind-specific and would clutter the token block).

---

## Accessibility safety

- All interactive controls have accessible names. Existing test fixtures (`/sign in/i`, `/sign out/i`, `/select project/i`, `/^chat$/i`, `/platform registry/i`, `/^message$/i`, etc.) still resolve uniquely.
- New tab — Knowledge Base — is keyboard-focusable. The Dropdown primitive supports `ArrowUp`/`ArrowDown`/`Home`/`End`/`Enter`/`Escape`.
- `<details>` is used for collapsible right-panel sections and the account menu — gets keyboard support for free.
- `prefers-reduced-motion` is honored: surface fade-in, login shake, button hover lift, primitive-card hover lift, and the spinner animation are all softened.
- Image lightbox is `role="dialog" aria-modal="true"` with autofocus on open and Escape close.

---

## Mock-only safety boundary

The chat scope notice — *"I can only access data within this project."* — is rendered on every chat / KB / Repo header. Repository surfaces show a warning-tone *"Approval required"* notice. The HTML startup shell carries the `/safe startup mode/i` copy that the existing tests assert on. No live BMS, gateway, or external integration is contacted from any of the new code paths; every mock dataset is derived deterministically from `projectId` so it is reproducible without storage.

---

## Known limitations

1. **Demo conversation is opt-in.** Clicking *Load demo conversation* in the empty chat state injects mock messages locally; it does not POST to `/api/projects/:id/chat`. This keeps the existing API-contract tests unchanged. Running with a real provider will overwrite the demo on the next send.
2. **Markdown renderer is a focused subset.** Nested lists, task lists (`- [ ]`), reference-style links, footnotes, and ATX headings *with trailing hashes* are not supported. Adding them later is straightforward — the renderer is one self-contained file with no dependencies.
3. **Knowledge base upload, repository actions, account-menu settings, and the conversation-history list are placeholders.** Each is wired with `disabled aria-disabled="true"` and a tooltip explaining intent. Hooking them up to real APIs is later-milestone work.
4. **Image attachments require the backend to populate `images: ChatMessage["images"]`.** The wire parser, types, and render path are live; the API does not currently emit the field. Demo conversation includes one inline `data:` image to demonstrate the gallery + lightbox without changing the API.
5. **Vite dev cold start (~2–4 s) is documented in the issue #117 comment.** Production builds do not have this cost.

---

## Files changed (high-level)

```
apps/web/index.html                     (untouched in M002 — already had the static fallback)
apps/web/vite.config.ts                 (vendor chunk split)
apps/web/src/App.tsx                    (rewired to WorkspaceShell + new tabs + demo)
apps/web/src/api.ts                     (ChatMessage gains optional images[])
apps/web/src/main.tsx                   (untouched)
apps/web/src/styles.css                 (design tokens + every new component)
apps/web/src/ui/primitives.tsx          (Button, Input, Textarea, Badge, Avatar, Dropdown)
apps/web/src/ui/{LeftSidebar,CenterWorkspace,RightPanel,WorkspaceShell}.tsx     (new)
apps/web/src/ui/{Markdown,ChatImageGallery}.tsx                                  (new)
apps/web/src/ui/{KnowledgeBase,Repository}.tsx                                   (new)
apps/web/src/ui/{ScheduledTasks,Skills,Tools}.tsx                                (new)
apps/web/src/ui/demoConversation.ts                                              (new)
apps/web/src/{primitives,workspaceShell,markdown}.test.tsx                       (new tests)
```

---

## Tests added in M002

| File | Tests | Covers |
| --- | --- | --- |
| `primitives.test.tsx` | 11 | Button variants/sizes/loading; Input/Textarea invalid; Badge/Pill; Avatar initials + image fallback; Dropdown listbox semantics, arrow-key nav, disabled-option skip, Escape |
| `workspaceShell.test.tsx` | 3 | Three labelled regions; default labels; right-panel optional; className forwarding |
| `markdown.test.tsx` | 6 | Headings/lists/inline/link target; fenced code with copy callback; tables; blockquotes/hr; image gallery cards + lightbox open/close + Escape |
| `App.test.tsx` (existing) | 13 | Untouched — full app flow (login → project → chat send → registry/management tabs) still passes |
| `appShell.test.tsx` (existing) | 7 | Untouched — static HTML fallback assertions still pass |

Total: **40 tests, 40 passing, 0 skipped**.

---

## Next steps (post-M002)

- Wire the placeholder shortcuts (KB upload, Repo actions, account-menu settings) to real APIs.
- Render real images returned by the chat API once the backend ships them.
- Replace the in-tree Markdown renderer with `react-markdown` only if we genuinely need GitHub-flavored extras (the current renderer covers the M002 spec).
- Audit color contrast under the new token palette in WCAG AA mode.
