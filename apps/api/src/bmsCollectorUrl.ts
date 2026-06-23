/** Read-only BMS-database collector (SQLite API, default :8765). Server-side only. */

export function bmsCollectorBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.BMS_DATABASE_API_URL ?? "http://127.0.0.1:8765").replace(/\/+$/, "");
}

export function bmsCollectorPath(baseUrl: string, pathname: string, search = ""): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${baseUrl.replace(/\/+$/, "")}${path}${search}`;
}
