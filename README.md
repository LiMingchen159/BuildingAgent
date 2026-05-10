# BuildingAgent

BuildingAgent is currently a local development vertical slice: a Fastify API plus a React/Vite Web UI that exercise seeded authentication, project membership, and project-scoped chat.

## S01 local run

### Seeded users

Production auth and SSO are out of scope for this slice. There are no anonymous Web or API paths beyond `/health`; use one of the local seeded accounts:

| User | Email | Password | Authorized projects |
| --- | --- | --- | --- |
| Ada Lovelace | `ada@example.test` | `local-dev-password` | `Alpha Build` read/write, `Beta Build` read-only |
| Grace Hopper | `grace@example.test` | `local-dev-password` | `Gamma Build` read/write |

Seeded bearer tokens exist only for local fixture behavior and should not be logged or reused for production auth.

### Install and run

```bash
npm install
npm run dev:api
npm run dev:web
```

The API runs on `http://127.0.0.1:3000` by default. The Web app runs through Vite and proxies `/api` and `/health` to the local API. To point the browser client at a different API origin, set `VITE_API_BASE_URL` for the Web dev server.

### Demo flow

1. Open the Vite Web URL.
2. Sign in as `ada@example.test` / `local-dev-password`.
3. Select `Alpha Build` to enter the project-scoped chat workspace.
4. Send a message and verify it appears only in the selected project workspace.
5. Select/read-only or forbidden projects through the API to see request-id-bearing error banners.

## Verification commands

```bash
npm test -- --run apps/api/src/auth.test.ts apps/api/src/chat.test.ts
npm test -- --run apps/web/src/App.test.tsx
npm run typecheck
npm run build
```

The Web tests mock `fetch` only at the network boundary so the React flow still exercises the real API client, guarded screens, error banners, and selected-project chat routing.
