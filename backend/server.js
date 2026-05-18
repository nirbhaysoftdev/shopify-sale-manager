const crypto = require("crypto");
if (!globalThis.crypto) {
  globalThis.crypto = crypto;
}

require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const runMigrations = require("./db/migrations");

const app = express();

app.use((req, res, next) => {
  res.setHeader("ngrok-skip-browser-warning", "true");
  next();
});

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

app.use("/auth", require("./routes/authRoutes"));
app.use("/api/products", require("./routes/productRoutes"));
app.use("/api/collections", require("./routes/collectionRoutes"));
app.use("/api/campaigns", require("./routes/campaignRoutes"));

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Shopify Sale Manager Running",
    timestamp: new Date().toISOString()
  });
});

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
