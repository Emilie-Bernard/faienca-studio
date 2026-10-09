import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createCodeVerifier, codeChallengeFromVerifier } from "./pkce.mjs";
import { readTokens, writeTokens } from "./etsy-tokens.mjs";

const ETSY_TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";
const ETSY_AUTH_URL = "https://www.etsy.com/oauth/connect";
const SCOPES = "listings_w shops_r";

/**
 * @param {{ keystring: string, sharedSecret: string, redirectUri: string }} config
 */
export async function ensureEtsyTokens(config) {
  const existing = readTokens();
  if (existing?.access_token && Date.now() < existing.expires_at) {
    return existing;
  }
  if (existing?.refresh_token) {
    return await refreshAccessToken(config, existing.refresh_token);
  }
  return await authorizeNewTokens(config);
}

/**
 * @param {{ keystring: string, sharedSecret: string, redirectUri: string }} config
 */
export async function authorizeNewTokens(config) {
  const verifier = createCodeVerifier();
  const challenge = codeChallengeFromVerifier(verifier);
  const state = createCodeVerifier();

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.keystring,
    redirect_uri: config.redirectUri,
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  const authUrl = `${ETSY_AUTH_URL}?${params.toString()}`;
  console.log("\n1. Ouvrez ce lien dans votre navigateur et autorisez l’application :\n");
  console.log(authUrl);
  console.log(
    "\n2. Après « Autoriser », copiez l’URL complète de la barre d’adresse",
  );
  console.log("   (même si la page ne charge pas) et collez-la ici.\n");

  const rl = createInterface({ input, output });
  const pasted = (await rl.question("URL de redirection : ")).trim();
  rl.close();

  const parsed = new URL(pasted);
  const code = parsed.searchParams.get("code");
  const returnedState = parsed.searchParams.get("state");
  if (!code) {
    const err = parsed.searchParams.get("error_description") ?? parsed.searchParams.get("error");
    throw new Error(err ?? "Code d’autorisation absent dans l’URL.");
  }
  if (returnedState !== state) {
    throw new Error("État OAuth invalide. Réessayez l’autorisation.");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.keystring,
    redirect_uri: config.redirectUri,
    code,
    code_verifier: verifier,
  });

  const tokens = await exchangeToken(config, body);
  writeTokens(tokens);
  console.log("\nJetons Etsy enregistrés dans scripts/shopify-to-etsy/.etsy-tokens.json\n");
  return tokens;
}

/**
 * @param {{ keystring: string, sharedSecret: string }} config
 */
export async function refreshAccessToken(config, refreshToken) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.keystring,
    refresh_token: refreshToken,
  });
  const tokens = await exchangeToken(config, body);
  writeTokens(tokens);
  return tokens;
}

async function exchangeToken(config, body) {
  const res = await fetch(ETSY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-api-key": `${config.keystring}:${config.sharedSecret}`,
    },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : `Échec OAuth Etsy (${res.status})`,
    );
  }
  const expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt,
    scope: data.scope,
  };
}
