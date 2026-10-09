#!/usr/bin/env node
import { loadEnvFile, requireEnv } from "./lib/load-env.mjs";
import { authorizeNewTokens } from "./lib/etsy-auth.mjs";

const fileEnv = loadEnvFile();

const config = {
  keystring: requireEnv("ETSY_KEYSTRING", fileEnv),
  sharedSecret: requireEnv("ETSY_SHARED_SECRET", fileEnv),
  redirectUri:
    process.env.ETSY_REDIRECT_URI ??
    fileEnv.ETSY_REDIRECT_URI ??
    "https://localhost:8787/callback",
};

await authorizeNewTokens(config);
