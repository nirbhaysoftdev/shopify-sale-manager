const crypto = require("crypto");
if (!globalThis.crypto) {
  globalThis.crypto = crypto;
}

const { shopifyApi, ApiVersion } = require("@shopify/shopify-api");
const { nodeAdapter } = require("@shopify/shopify-api/adapters/node");

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: process.env.SHOPIFY_SCOPES.split(","),
  hostName: process.env.HOST.replace(/https?:\/\//, ""),
  apiVersion: ApiVersion.July25,
  isEmbeddedApp: true,
  ...nodeAdapter
});

module.exports = shopify;
