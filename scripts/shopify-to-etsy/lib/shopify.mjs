const API_VERSION = "2026-01";

const PRODUCTS_QUERY = `
  query ProductsPage($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        descriptionHtml
        productType
        tags
        isGiftCard
        totalInventory
        images(first: 20) {
          nodes {
            url
            altText
          }
        }
        variants(first: 100) {
          nodes {
            title
            price
            inventoryQuantity
            selectedOptions {
              name
              value
            }
          }
        }
      }
    }
  }
`;

/**
 * @param {{ store: string, accessToken: string }} config
 */
export async function fetchAllProducts(config) {
  const products = [];
  let cursor = null;

  for (; ;) {
    const data = await shopifyGraphql(config, PRODUCTS_QUERY, { cursor });
    const page = data.products;
    for (const node of page.nodes) {
      products.push(normalizeProduct(node));
    }
    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }

  return products;
}

async function shopifyGraphql(config, query, variables) {
  const store = config.store.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!store.endsWith(".myshopify.com")) {
    throw new Error(
      `Boutique Shopify invalide pour l’API : ${store}. Utilisez xxx.myshopify.com.`,
    );
  }
  const host = store;
  const res = await fetch(`https://${host}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": config.accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  const errorText = formatShopifyErrors(json.errors);
  if (!res.ok || errorText) {
    throw new Error(`Shopify : ${errorText ?? res.statusText}`);
  }
  return json.data;
}

function formatShopifyErrors(errors) {
  if (!errors) return null;
  if (Array.isArray(errors)) {
    if (errors.length === 0) return null;
    return errors.map((e) => e.message ?? String(e)).join("; ");
  }
  if (typeof errors === "string") return errors;
  return JSON.stringify(errors);
}

function normalizeProduct(node) {
  const numericId = node.id.replace(/^gid:\/\/shopify\/Product\//, "");
  const variants = node.variants.nodes.map((v) => ({
    title: v.title,
    price: Number.parseFloat(v.price),
    inventoryQuantity: v.inventoryQuantity ?? 0,
    options: v.selectedOptions,
  }));

  let minPrice = Infinity;
  let totalQty = 0;
  for (const v of variants) {
    if (v.price < minPrice) minPrice = v.price;
    totalQty += Math.max(0, v.inventoryQuantity);
  }
  if (!Number.isFinite(minPrice)) minPrice = 0;

  const tags = node.tags ?? [];
  const productType = (node.productType ?? "").toLowerCase();
  const tagStr = tags.join(" ").toLowerCase();
  const titleLower = node.title.toLowerCase();

  const isGiftCard =
    node.isGiftCard ||
    productType.includes("gift") ||
    titleLower.includes("carte cadeau");

  const isPdf =
    productType.includes("pdf") ||
    productType.includes("digital") ||
    productType.includes("numérique") ||
    productType.includes("numerique") ||
    tagStr.includes("pdf") ||
    tagStr.includes("digital") ||
    titleLower.includes("pdf") ||
    titleLower.includes("téléchargement") ||
    titleLower.includes("telechargement") ||
    titleLower.includes("patron");

  const variantLines = variants
    .filter((v) => v.title !== "Default Title")
    .map((v) => {
      const opts = v.options.map((o) => `${o.name}: ${o.value}`).join(", ");
      return `• ${v.title}${opts ? ` (${opts})` : ""} — ${v.price.toFixed(2)} €`;
    });

  let description = stripHtml(node.descriptionHtml ?? "");
  if (variantLines.length > 0) {
    description += `\n\nVariantes Shopify :\n${variantLines.join("\n")}`;
  }

  return {
    shopifyId: numericId,
    shopifyGid: node.id,
    title: node.title.trim(),
    description,
    tags,
    images: node.images.nodes.map((img) => ({
      url: img.url,
      alt: img.altText,
    })),
    price: minPrice,
    quantity: node.totalInventory ?? totalQty,
    isGiftCard,
    isPdf,
    isPhysical: !isPdf,
  };
}

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
