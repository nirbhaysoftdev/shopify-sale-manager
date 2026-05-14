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
    scopes: ["read_products"],
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
  const client = new shopify.clients.Graphql({ session });

  // Test different filter syntaxes
  const filters = ["status:active", "status:ACTIVE", "published_status:published"];

  for (const filter of filters) {
    const query = `
      query {
        products(first: 3, query: "${filter}") {
          edges {
            node { title status }
          }
        }
      }
    `;
    const res = await client.request(query);
    const products = res.data.products.edges.map(e => e.node);
    console.log(`\nFilter: ${filter}`);
    console.log(products.map(p => `${p.title} - ${p.status}`).join("\n"));
  }

  process.exit(0);
}

test().catch(e => {
  console.error("Error:", e.message);
  process.exit(1);
});
