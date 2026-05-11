# Workspace Mockup Reference

User-provided visual target for the BuildingAgent workspace redesign.

Key visual details to preserve in React implementation:

- Full viewport workspace, no outer white gutters.
- Left sidebar: 280px, `#f9fafb`, right border, BA logo, workspace dropdown, New chat button, recent conversations, asset shortcuts, bottom user/settings.
- Center: flexible chat area, compact top header with sidebar toggle, workspace title, project-data-only badge, info and right-panel toggle.
- Right sidebar: 340px, `#fcfcfc`, task/skills/tools sections with compact row cards.
- Scrollbars should be hidden or visually very subtle.
- Use icon-sized controls, not text placeholders, for toggles/actions.
- Chat assistant replies should not show a BA avatar/name block in the answer content.
- First-use flow: enter workspace directly, show only a create/new-project action; after new project, center the composer until the first message, then move composer to the bottom like ChatGPT.
