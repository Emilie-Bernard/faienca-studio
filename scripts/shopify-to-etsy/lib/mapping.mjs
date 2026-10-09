import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { MAPPING_PATH } from "./paths.mjs";

export function readMapping() {
  if (!existsSync(MAPPING_PATH)) return {};
  return JSON.parse(readFileSync(MAPPING_PATH, "utf8"));
}

export function writeMapping(mapping) {
  writeFileSync(MAPPING_PATH, JSON.stringify(mapping, null, 2), "utf8");
}

export function shopifyTagsForEtsy(tags) {
  const out = [];
  for (const raw of tags) {
    const tag = raw.trim().slice(0, 20);
    if (!tag) continue;
    if (!/^[\p{L}\p{Nd}\p{Zs}\-'™©®]+$/u.test(tag)) continue;
    if (!out.includes(tag)) out.push(tag);
    if (out.length >= 13) break;
  }
  return out;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
