const crypto = require("crypto");
if (!globalThis.crypto) {
  globalThis.crypto = crypto;
}

require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const runMigrations = require("./db/migrations");
const verifyShopifyAuth = require("./middleware/verifyShopifyAuth");

const app = express();

app.use((req, res, next) => {
  res.setHeader("ngrok-skip-browser-warning", "true");
  next();
});

// Shopify admin loads embedded apps inside an iframe. Allow that, and only
// that — every other site is blocked by frame-ancestors.
app.use((req, res, next) => {
  const shop = req.query?.shop;
  const frameAncestors = shop && /^[a-z0-9-]+\.myshopify\.com$/i.test(shop)
    ? `https://${shop} https://admin.shopify.com`
    : "https://admin.shopify.com https://*.myshopify.com";
  res.setHeader("Content-Security-Policy", `frame-ancestors ${frameAncestors};`);
  next();
});

// API is same-origin with the React build, so cross-origin requests aren't
// needed. Restrict CORS to our own host; reject anything else.
const HOST = process.env.HOST || "";
app.use(cors({
  origin: HOST ? [HOST] : false,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

app.use("/auth", require("./routes/authRoutes"));

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Shopify Sale Manager Running",
    timestamp: new Date().toISOString()
  });
});

// All data routes require a verified Shopify session token.
app.use("/api/products", verifyShopifyAuth, require("./routes/productRoutes"));
app.use("/api/collections", verifyShopifyAuth, require("./routes/collectionRoutes"));
app.use("/api/campaigns", verifyShopifyAuth, require("./routes/campaignRoutes"));

const buildPath = path.join(__dirname, "..", "frontend", "build");
app.use(express.static(buildPath));

app.get("*", (req, res) => {
  res.sendFile(path.join(buildPath, "index.html"));
});

const PORT = process.env.PORT || 5002;

app.listen(PORT, async () => {
  console.log("Server running on port " + PORT);
  console.log("Environment: " + process.env.NODE_ENV);
  console.log("Waiting for MySQL to be ready...");
  await new Promise(res => setTimeout(res, 5000));
  await runMigrations();
});
