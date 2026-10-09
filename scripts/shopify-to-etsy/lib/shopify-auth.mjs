import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createCodeVerifier } from "./pkce.mjs";
import {
  readShopifyTokens,
  writeShopifyTokens,
} from "./shopify-tokens.mjs";
import { loadEnvFile } from "./load-env.mjs";

const DEFAULT_SCOPES = "read_products";

/** @returns {string} hostname like cabxdx-vs.myshopify.com */
export function resolveMyshopifyHost(store) {
  const trimmed = store.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (trimmed.endsWith(".myshopify.com")) return trimmed;
  if (!trimmed.includes(".")) return `${trimmed}.myshopify.com`;
  return null;
}

function normalizeStore(store) {
  const host = resolveMyshopifyHost(store);
  if (host) return host;
  return store.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function extractRedirectUrl(pasted) {
  const match = pasted.match(/https?:\/\/[^\s"'<>]+/);
  return (match ? match[0] : pasted).trim();
}

async function parseJsonResponse(res) {
  const text = await res.text();
  try {
    return { data: JSON.parse(text), text };
  } catch {
    throw new Error(
      `Réponse Shopify invalide (${res.status}). Utilisez SHOPIFY_STORE=nom.myshopify.com (pas faienca.fr). Début : ${text.slice(0, 120)}`,
    );
  }
}

/**
 * @param {{ store: string, clientId?: string, clientSecret?: string, redirectUri?: string, accessToken?: string }} config
 */
export async function resolveShopifyAccessToken(config) {
  if (config.accessToken?.trim()) {
    return config.accessToken.trim();
  }

  const saved = readShopifyTokens();
  if (saved?.access_token) {
    return saved.access_token;
  }

  throw new Error(
    "Pas de jeton Shopify. Ajoutez SHOPIFY_ACCESS_TOKEN dans .env ou lancez : npm run shopify-to-etsy:shopify-auth",
  );
}

/** Shop hostname for Admin API calls (saved OAuth shop wins). */
export function resolveShopifyShopHost(fileEnv = loadEnvFile()) {
  const saved = readShopifyTokens();
  if (saved?.shop) return saved.shop;
  const fromEnv = process.env.SHOPIFY_STORE ?? fileEnv.SHOPIFY_STORE ?? "";
  const host = resolveMyshopifyHost(fromEnv);
  if (!host) {
    throw new Error(
      "SHOPIFY_STORE doit être du type cabxdx-vs.myshopify.com (pas faienca.fr). Relancez shopify-auth après correction.",
    );
  }
  return host;
}

/**
 * @param {{ store: string, clientId: string, clientSecret: string, redirectUri: string, scopes?: string }} config
 */
export async function authorizeShopify(config) {
  const storeFromEnv = normalizeStore(config.store);
  const scopes = config.scopes ?? DEFAULT_SCOPES;
  const state = createCodeVerifier();

  const myshopifyHost = resolveMyshopifyHost(storeFromEnv);
  if (!myshopifyHost) {
    console.warn(
      "\n⚠ SHOPIFY_STORE semble être un domaine personnalisé (ex. faienca.fr).",
    );
    console.warn(
      "  Mettez dans .env : SHOPIFY_STORE=cabxdx-vs.myshopify.com",
    );
    console.warn(
      "  (Admin → Paramètres → Domaines, ou le paramètre shop= dans l’URL OAuth.)\n",
    );
  }

  const authHost = myshopifyHost ?? storeFromEnv;
  const params = new URLSearchParams({
    client_id: config.clientId,
    scope: scopes,
    redirect_uri: config.redirectUri,
    state,
  });

  const authUrl = `https://${authHost}/admin/oauth/authorize?${params.toString()}`;

  console.log("\n1. Dans le Dev Dashboard Shopify (app producttoetsy), ajoutez cette URL");
  console.log("   dans les redirections autorisées si ce n’est pas déjà fait :");
  console.log(`   ${config.redirectUri}\n`);
  console.log("2. Ouvrez ce lien et autorisez l’application :\n");
  console.log(authUrl);
  console.log(
    "\n3. Collez uniquement l’URL qui commence par http://localhost:3456/callback?...\n",
  );

  const rl = createInterface({ input, output });
  const pasted = extractRedirectUrl(await rl.question("URL de redirection : "));
  rl.close();

  const parsed = new URL(pasted);
  const code = parsed.searchParams.get("code");
  const returnedState = parsed.searchParams.get("state");
  const shopParam = parsed.searchParams.get("shop");

  if (!code) {
    throw new Error(
      parsed.searchParams.get("error_description") ??
      parsed.searchParams.get("error") ??
      "Code d’autorisation absent dans l’URL.",
    );
  }
  if (returnedState !== state) {
    throw new Error("État OAuth invalide. Réessayez.");
  }

  const tokenShop =
    resolveMyshopifyHost(shopParam ?? "") ?? myshopifyHost ?? null;
  if (!tokenShop) {
    throw new Error(
      "Impossible de déterminer la boutique (.myshopify.com). Corrigez SHOPIFY_STORE dans .env.",
    );
  }

  const res = await fetch(`https://${tokenShop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
    }),
  });
  const { data } = await parseJsonResponse(res);
  if (!res.ok) {
    throw new Error(
      typeof data.error_description === "string"
        ? data.error_description
        : `Échec OAuth Shopify (${res.status})`,
    );
  }

  writeShopifyTokens({
    shop: tokenShop,
    access_token: data.access_token,
    scope: data.scope,
    createdAt: new Date().toISOString(),
  });

  console.log(`\nBoutique enregistrée : ${tokenShop}`);
  console.log(
    "Mettez la même valeur dans .env : SHOPIFY_STORE=" + tokenShop,
  );
  console.log(
    "\nJeton Shopify enregistré dans scripts/shopify-to-etsy/.shopify-tokens.json\n",
  );
  return data.access_token;
}

export function shopifyConfigFromEnv(fileEnv = loadEnvFile()) {
  const store =
    process.env.SHOPIFY_STORE ?? fileEnv.SHOPIFY_STORE ?? "";
  return {
    store,
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN ?? fileEnv.SHOPIFY_ACCESS_TOKEN,
    clientId: process.env.SHOPIFY_CLIENT_ID ?? fileEnv.SHOPIFY_CLIENT_ID,
    clientSecret:
      process.env.SHOPIFY_CLIENT_SECRET ?? fileEnv.SHOPIFY_CLIENT_SECRET,
    redirectUri:
      process.env.SHOPIFY_REDIRECT_URI ??
      fileEnv.SHOPIFY_REDIRECT_URI ??
      "http://localhost:3456/callback",
    scopes:
      process.env.SHOPIFY_SCOPES ?? fileEnv.SHOPIFY_SCOPES ?? DEFAULT_SCOPES,
  };
}
