import { readFileSync, existsSync } from "node:fs";
import { ENV_PATH } from "./paths.mjs";

/** @returns {Record<string, string>} */
export function loadEnvFile() {
  if (!existsSync(ENV_PATH)) {
    return {};
  }
  const out = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function requireEnv(name, fileEnv) {
  const value = process.env[name] ?? fileEnv[name];
  if (!value) {
    throw new Error(
      `Variable manquante : ${name}. Copiez scripts/shopify-to-etsy/.env.example vers scripts/shopify-to-etsy/.env`,
    );
  }
  return value;
}
