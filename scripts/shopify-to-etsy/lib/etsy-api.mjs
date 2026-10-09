import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { refreshAccessToken } from "./etsy-auth.mjs";
import { readTokens, userIdFromAccessToken } from "./etsy-tokens.mjs";
import { TAXONOMY_CACHE_PATH } from "./paths.mjs";

const BASE = "https://openapi.etsy.com";

/**
 * @param {{ keystring: string, sharedSecret: string }} config
 */
export async function getValidAccessToken(config) {
  let tokens = readTokens();
  if (!tokens?.refresh_token) {
    throw new Error("Pas de jeton Etsy. Lancez : npm run shopify-to-etsy:auth");
  }
  if (Date.now() >= tokens.expires_at) {
    tokens = await refreshAccessToken(config, tokens.refresh_token);
  }
  return tokens.access_token;
}

/**
 * @param {{ keystring: string, sharedSecret: string }} config
 */
export async function etsyRequest(config, accessToken, method, path, options = {}) {
  const headers = {
    "x-api-key": `${config.keystring}:${config.sharedSecret}`,
    ...options.headers,
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: options.body,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  if (!res.ok) {
    const msg =
      typeof data?.error === "string"
        ? data.error
        : `Etsy ${method} ${path} → ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function getShopId(config, accessToken, envShopId) {
  if (envShopId) {
    const parsed = Number.parseInt(String(envShopId), 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  const userId = userIdFromAccessToken(accessToken);
  const data = await etsyRequest(
    config,
    accessToken,
    "GET",
    `/v3/application/users/${userId}/shops`,
  );
  // Open API returns one Shop object, not { results: [...] }
  const shopId = data?.shop_id ?? data?.results?.[0]?.shop_id;
  if (!shopId) {
    throw new Error(
      "Boutique Etsy introuvable pour ce compte. Ouvrez une boutique vendeur sur Etsy avec le même compte que l’autorisation OAuth.",
    );
  }
  return shopId;
}

export async function getDefaultShippingProfileId(config, accessToken, shopId) {
  const data = await etsyRequest(
    config,
    accessToken,
    "GET",
    `/v3/application/shops/${shopId}/shipping-profiles`,
  );
  const profile = data?.results?.[0];
  if (!profile?.shipping_profile_id) {
    throw new Error(
      "Aucun profil d’expédition Etsy. Créez-en un dans le gestionnaire Etsy.",
    );
  }
  return profile.shipping_profile_id;
}

export async function getDefaultReadinessStateId(config, accessToken, shopId) {
  const data = await etsyRequest(
    config,
    accessToken,
    "GET",
    `/v3/application/shops/${shopId}/readiness-state-definitions`,
  );
  const results = data?.results ?? [];
  const madeToOrder = results.find((p) => p.readiness_state === "made_to_order");
  const profile = madeToOrder ?? results[0];
  const id = profile?.readiness_state_id;
  if (!id) {
    throw new Error(
      "Aucun profil de délai Etsy (readiness). Configurez-le dans le gestionnaire Etsy.",
    );
  }
  return id;
}

export async function getDefaultReturnPolicyId(config, accessToken, shopId) {
  const data = await etsyRequest(
    config,
    accessToken,
    "GET",
    `/v3/application/shops/${shopId}/policies/return`,
  );
  const policy = data?.results?.[0];
  if (!policy?.return_policy_id) {
    throw new Error(
      "Aucune politique de retour Etsy. Créez-en une dans le gestionnaire Etsy.",
    );
  }
  return policy.return_policy_id;
}

/** @returns {Promise<Array<{ id: number, name: string, path: string }>>} */
async function loadTaxonomyFlat(config) {
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  if (existsSync(TAXONOMY_CACHE_PATH)) {
    const cached = JSON.parse(readFileSync(TAXONOMY_CACHE_PATH, "utf8"));
    if (cached.fetchedAt && Date.now() - cached.fetchedAt < maxAge && cached.flat) {
      return cached.flat;
    }
  }

  const data = await etsyRequest(
    config,
    null,
    "GET",
    "/v3/application/seller-taxonomy/nodes",
    {
      headers: {
        "x-api-key": `${config.keystring}:${config.sharedSecret}`,
      },
    },
  );

  const flat = [];
  function walk(nodes, names = []) {
    for (const node of nodes ?? []) {
      const pathNames = [...names, node.name];
      flat.push({
        id: node.id,
        name: node.name,
        path: pathNames.join(" > "),
      });
      walk(node.children, pathNames);
    }
  }
  walk(data.results ?? data);

  writeFileSync(
    TAXONOMY_CACHE_PATH,
    JSON.stringify({ fetchedAt: Date.now(), flat }, null, 0),
    "utf8",
  );
  return flat;
}

const TAXONOMY_KEYWORDS = {
  digital: [
    "cross stitch patterns",
    "embroidery patterns",
    "digital downloads",
    "patterns & blueprints",
    "craft patterns",
  ],
  kit: [
    "embroidery kits",
    "cross stitch kits",
    "needlecraft kits",
    "kits",
  ],
  physical: [
    "embroidered",
    "cross stitch",
    "needlecraft",
    "hand embroidery",
  ],
};

export async function resolveTaxonomyId(config, kind) {
  const flat = await loadTaxonomyFlat(config);
  const keywords = TAXONOMY_KEYWORDS[kind] ?? TAXONOMY_KEYWORDS.physical;
  for (const kw of keywords) {
    const lower = kw.toLowerCase();
    const hit = flat.find((n) => n.path.toLowerCase().includes(lower));
    if (hit) return hit.id;
  }
  const fallback = flat.find((n) =>
    n.path.toLowerCase().includes("embroidery"),
  );
  if (fallback) return fallback.id;
  throw new Error(`Catégorie Etsy introuvable pour le type « ${kind} ».`);
}

export async function createDraftListing(
  config,
  accessToken,
  shopId,
  fields,
) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        body.append(key, String(item));
      }
    } else {
      body.append(key, String(value));
    }
  }

  return await etsyRequest(
    config,
    accessToken,
    "POST",
    `/v3/application/shops/${shopId}/listings`,
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
}

export async function uploadListingImage(
  config,
  accessToken,
  shopId,
  listingId,
  imageBuffer,
  filename,
  rank,
) {
  const form = new FormData();
  form.append(
    "image",
    new Blob([imageBuffer], { type: guessMime(filename) }),
    filename,
  );
  form.append("rank", String(rank));

  const res = await fetch(
    `${BASE}/v3/application/shops/${shopId}/listings/${listingId}/images`,
    {
      method: "POST",
      headers: {
        "x-api-key": `${config.keystring}:${config.sharedSecret}`,
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
    },
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : `Échec envoi image (${res.status})`,
    );
  }
  return data;
}

function guessMime(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}
