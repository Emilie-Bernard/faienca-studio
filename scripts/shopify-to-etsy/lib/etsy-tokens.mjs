import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { TOKENS_PATH } from "./paths.mjs";

/** @typedef {{ access_token: string, refresh_token: string, expires_at: number, scope?: string }} EtsyTokens */

export function readTokens() {
  if (!existsSync(TOKENS_PATH)) return null;
  return JSON.parse(readFileSync(TOKENS_PATH, "utf8"));
}

export function writeTokens(tokens) {
  writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2), "utf8");
}

export function userIdFromAccessToken(accessToken) {
  const dot = accessToken.indexOf(".");
  if (dot === -1) {
    throw new Error("Jeton Etsy invalide : préfixe user_id manquant.");
  }
  const id = accessToken.slice(0, dot);
  if (!/^\d+$/.test(id)) {
    throw new Error("Jeton Etsy invalide : user_id non numérique.");
  }
  return id;
}
