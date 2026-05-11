import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildServer } from "./server.js";

// Load root .env (not committed; safe to skip if absent)
function loadEnv(): void {
  const candidates = [
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env"),
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env")
  ];
  for (const envPath of candidates) {
    try {
      const content = readFileSync(envPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim();
        if (key && !(key in process.env)) {
          process.env[key] = value;
        }
      }
      console.error("[env] loaded %s vars from %s", Object.keys(process.env).filter(k => k.startsWith("LLM") || k.startsWith("BUILDING")).length, envPath);
      return;
    } catch {
      // try next candidate
    }
  }
  console.error("[env] no .env file found, using host environment only");
}
loadEnv();

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
