require("dotenv").config();
const crypto = require("crypto");
if (!globalThis.crypto) globalThis.crypto = crypto;

const { shopifyApi, ApiVersion } = require("@shopify/shopify-api");
const { nodeAdapter } = require("@shopify/shopify-api/adapters/node");
const mysql = require("mysql2/promise");

async function test() {
  const shopify = shopifyApi({
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    scopes: ["read_products", "write_products"],
    hostName: "example.com",
    apiVersion: ApiVersion.January25,
    isEmbeddedApp: true,
    ...nodeAdapter
  });

  const pool = await mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  const [rows] = await pool.query("SELECT * FROM sessions LIMIT 1");
  const session = rows[0];
  console.log("Session shop:", session.shop);

  const client = new shopify.clients.Graphql({ session });

  // First get the product ID for this variant
  const productQuery = `
    query {
      productVariant(id: "gid://shopify/ProductVariant/41711434465462") {
        id
        price
        compareAtPrice
        product {
          id
        }
      }
    }
  `;

  const productRes = await client.request(productQuery);
  console.log("Current variant:", JSON.stringify(productRes.data, null, 2));

  const productId = productRes.data.productVariant.product.id;
  console.log("Product ID:", productId);

  // Use productVariantsBulkUpdate
  const mutation = `
    mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
          compareAtPrice
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const res = await client.request(mutation, {
    variables: {
      productId: productId,
      variants: [
        {
          id: "gid://shopify/ProductVariant/41711434465462",
          price: "58.49",
          compareAtPrice: "64.99"
        }
      ]
    }
  });

  console.log("Update result:", JSON.stringify(res.data, null, 2));
  process.exit(0);
}

test().catch(e => {
  console.error("Error:", e.message);
  process.exit(1);
});
