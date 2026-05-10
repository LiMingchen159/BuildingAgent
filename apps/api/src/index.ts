import { buildServer } from "./server.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";

const app = buildServer();

try {
  await app.listen({ port, host });
  app.log.info({ host, port }, "BuildingAgent API listening");
} catch (error) {
  app.log.error({ err: error }, "BuildingAgent API failed to start");
  process.exit(1);
}
