import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./paths.mjs";

export const SHOPIFY_TOKENS_PATH = path.join(ROOT, ".shopify-tokens.json");

export function readShopifyTokens() {
  if (!existsSync(SHOPIFY_TOKENS_PATH)) return null;
  return JSON.parse(readFileSync(SHOPIFY_TOKENS_PATH, "utf8"));
}

export function writeShopifyTokens(tokens) {
  writeFileSync(SHOPIFY_TOKENS_PATH, JSON.stringify(tokens, null, 2), "utf8");
}
