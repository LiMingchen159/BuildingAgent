/**
 * Element / enteliWEB demo credentials.
 * Env vars override defaults; defaults match BMS-database collector (.env).
 */

export interface ElementEnteliConfig {
  baseUrl: string;
  username: string;
  password: string;
}

const DEMO_BASE_URL = "http://223.197.33.165:20800/enteliweb";
const DEMO_USERNAME = "GPTAI";
const DEMO_PASSWORD = "hkustapi";

function firstEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return "";
}

export function resolveElementEnteliConfig(): ElementEnteliConfig {
  return {
    baseUrl: (firstEnv("ELEMENT_ENTELI_BASE_URL", "ENTELIWEB_BASE_URL") || DEMO_BASE_URL).replace(/\/+$/, ""),
    username: firstEnv("ELEMENT_ENTELI_USERNAME", "ENTELIWEB_USERNAME", "ENTELI_USER", "ELEMENT_ENTELI_USER") || DEMO_USERNAME,
    password: firstEnv("ELEMENT_ENTELI_PASSWORD", "ENTELIWEB_PASSWORD", "ENTELI_PASS", "ELEMENT_ENTELI_PASS") || DEMO_PASSWORD
  };
}

/** Inject aliases so terminal / execute_code scripts can read credentials. */
export function applyElementEnteliEnv(): void {
  const { baseUrl, username, password } = resolveElementEnteliConfig();
  const pairs: Record<string, string> = {
    ELEMENT_ENTELI_BASE_URL: baseUrl,
    ENTELIWEB_BASE_URL: baseUrl,
    ELEMENT_ENTELI_USERNAME: username,
    ELEMENT_ENTELI_USER: username,
    ENTELI_USER: username,
    ENTELIWEB_USERNAME: username,
    ELEMENT_ENTELI_PASSWORD: password,
    ELEMENT_ENTELI_PASS: password,
    ENTELI_PASS: password,
    ENTELIWEB_PASSWORD: password
  };
  for (const [key, value] of Object.entries(pairs)) {
    if (!(process.env[key]?.trim())) {
      process.env[key] = value;
    }
  }
}
