import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export const ROOT = root;
export const ENV_PATH = path.join(root, ".env");
export const TOKENS_PATH = path.join(root, ".etsy-tokens.json");
export const MAPPING_PATH = path.join(root, "mapping.json");
export const TAXONOMY_CACHE_PATH = path.join(root, ".taxonomy-cache.json");
