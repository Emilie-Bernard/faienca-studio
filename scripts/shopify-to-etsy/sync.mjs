#!/usr/bin/env node
import { loadEnvFile, requireEnv } from "./lib/load-env.mjs";
import { ensureEtsyTokens } from "./lib/etsy-auth.mjs";
import {
  getValidAccessToken,
  getShopId,
  getDefaultShippingProfileId,
  getDefaultReturnPolicyId,
  getDefaultReadinessStateId,
  resolveTaxonomyId,
  createDraftListing,
  uploadListingImage,
} from "./lib/etsy-api.mjs";
import { fetchAllProducts } from "./lib/shopify.mjs";
import {
  resolveShopifyAccessToken,
  resolveShopifyShopHost,
  shopifyConfigFromEnv,
} from "./lib/shopify-auth.mjs";
import {
  readMapping,
  writeMapping,
  shopifyTagsForEtsy,
  sleep,
} from "./lib/mapping.mjs";

const force = process.argv.includes("--force");
const fileEnv = loadEnvFile();

const etsyConfig = {
  keystring: requireEnv("ETSY_KEYSTRING", fileEnv),
  sharedSecret: requireEnv("ETSY_SHARED_SECRET", fileEnv),
  redirectUri:
    process.env.ETSY_REDIRECT_URI ??
    fileEnv.ETSY_REDIRECT_URI ??
    "https://localhost:8787/callback",
};

const shopifyBase = shopifyConfigFromEnv(fileEnv);
const shopifyAccessToken = await resolveShopifyAccessToken({
  store: fileEnv.SHOPIFY_STORE ?? "",
  accessToken: shopifyBase.accessToken,
});
const shopifyConfig = {
  store: resolveShopifyShopHost(fileEnv),
  accessToken: shopifyAccessToken,
};

/** @type {{ created: string[], skippedGiftCards: string[], skippedExisting: string[], zeroStock: string[], failed: { title: string, error: string }[] }} */
const report = {
  created: [],
  skippedGiftCards: [],
  skippedExisting: [],
  zeroStock: [],
  failed: [],
};

console.log("Connexion Etsy…");
await ensureEtsyTokens(etsyConfig);
const accessToken = await getValidAccessToken(etsyConfig);
const shopId = await getShopId(
  etsyConfig,
  accessToken,
  process.env.ETSY_SHOP_ID ?? fileEnv.ETSY_SHOP_ID,
);

let shippingProfileId;
let returnPolicyId;
let readinessStateId;
try {
  shippingProfileId = await getDefaultShippingProfileId(
    etsyConfig,
    accessToken,
    shopId,
  );
  returnPolicyId = await getDefaultReturnPolicyId(
    etsyConfig,
    accessToken,
    shopId,
  );
  readinessStateId = await getDefaultReadinessStateId(
    etsyConfig,
    accessToken,
    shopId,
  );
} catch (err) {
  console.warn(
    `Avertissement profils Etsy : ${err instanceof Error ? err.message : err}`,
  );
}

console.log("Lecture des produits Shopify…");
const products = await fetchAllProducts(shopifyConfig);
const mapping = readMapping();

const taxonomyIds = {
  digital: await resolveTaxonomyId(etsyConfig, "digital"),
  kit: await resolveTaxonomyId(etsyConfig, "kit"),
  physical: await resolveTaxonomyId(etsyConfig, "physical"),
};

function taxonomyForProduct(product) {
  if (product.isPdf) return taxonomyIds.digital;
  const t = `${product.title} ${product.tags.join(" ")}`.toLowerCase();
  if (t.includes("kit")) return taxonomyIds.kit;
  return taxonomyIds.physical;
}

console.log(`\n${products.length} produit(s) trouvé(s) sur Shopify.\n`);

for (const product of products) {
  if (product.isGiftCard) {
    report.skippedGiftCards.push(product.title);
    continue;
  }

  if (mapping[product.shopifyId] && !force) {
    report.skippedExisting.push(product.title);
    continue;
  }

  const qty = product.quantity > 0 ? product.quantity : 1;
  const hadZeroStock = product.quantity <= 0;

  const listingType = product.isPdf ? "download" : "physical";
  const fields = {
    quantity: qty,
    title: product.title.slice(0, 140),
    description: product.description.slice(0, 5000) || product.title,
    price: product.price.toFixed(2),
    who_made: "i_did",
    when_made: "2020_2026",
    is_supply: "false",
    taxonomy_id: taxonomyForProduct(product),
    type: listingType,
  };

  const etsyTags = shopifyTagsForEtsy(product.tags);
  if (etsyTags.length) fields.tags = etsyTags;

  if (listingType === "physical") {
    if (shippingProfileId) fields.shipping_profile_id = shippingProfileId;
    if (returnPolicyId) fields.return_policy_id = returnPolicyId;
    if (readinessStateId) fields.readiness_state_id = readinessStateId;
  }

  try {
    const listing = await createDraftListing(
      etsyConfig,
      accessToken,
      shopId,
      fields,
    );
    const listingId = listing.listing_id;

    let rank = 1;
    for (const image of product.images.slice(0, 20)) {
      try {
        const imgRes = await fetch(image.url);
        if (!imgRes.ok) continue;
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        const filename = image.url.split("/").pop()?.split("?")[0] ?? "image.jpg";
        await uploadListingImage(
          etsyConfig,
          accessToken,
          shopId,
          listingId,
          buffer,
          filename,
          rank,
        );
        rank += 1;
        await sleep(400);
      } catch {
        // continue with other images
      }
    }

    mapping[product.shopifyId] = {
      etsyListingId: listingId,
      title: product.title,
      createdAt: new Date().toISOString(),
      state: "draft",
    };
    writeMapping(mapping);

    report.created.push(`${product.title} → brouillon #${listingId}`);
    if (hadZeroStock) report.zeroStock.push(product.title);
    console.log(`✓ Brouillon : ${product.title}`);
    await sleep(500);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    report.failed.push({ title: product.title, error: message });
    console.error(`✗ ${product.title} : ${message}`);
  }
}

console.log("\n——— Rapport ———");
console.log(`Créés : ${report.created.length}`);
for (const line of report.created) console.log(`  ${line}`);

console.log(`\nCartes cadeau ignorées : ${report.skippedGiftCards.length}`);
for (const t of report.skippedGiftCards) console.log(`  ${t}`);

console.log(`\nDéjà synchronisés (ignorés) : ${report.skippedExisting.length}`);
for (const t of report.skippedExisting) console.log(`  ${t}`);

if (report.zeroStock.length) {
  console.log(`\nStock Shopify à 0 (brouillon avec quantité 1) :`);
  for (const t of report.zeroStock) console.log(`  ${t}`);
}

console.log(`\nÉchecs : ${report.failed.length}`);
for (const f of report.failed) console.log(`  ${f.title} : ${f.error}`);

console.log(
  "\nVérifiez les brouillons dans Etsy → Gestionnaire de boutique → Annonces → Brouillons.",
);
if (force) {
  console.log("(Mode --force : les produits déjà mappés ont été recréés.)");
}
