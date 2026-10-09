#!/usr/bin/env node
import { loadEnvFile, requireEnv } from "./lib/load-env.mjs";
import {
  authorizeShopify,
  shopifyConfigFromEnv,
} from "./lib/shopify-auth.mjs";

const fileEnv = loadEnvFile();
const base = shopifyConfigFromEnv(fileEnv);

const config = {
  store: requireEnv("SHOPIFY_STORE", fileEnv),
  clientId: requireEnv("SHOPIFY_CLIENT_ID", fileEnv),
  clientSecret: requireEnv("SHOPIFY_CLIENT_SECRET", fileEnv),
  redirectUri: base.redirectUri,
  scopes: base.scopes,
};

await authorizeShopify(config);
