const crypto = require("crypto");
if (!globalThis.crypto) {
  globalThis.crypto = crypto;
}

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");
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

// Routes
app.use("/auth", require("./routes/authRoutes"));
app.use("/api/products", require("./routes/productRoutes"));
app.use("/api/collections", require("./routes/collectionRoutes"));
app.use("/api/campaigns", require("./routes/campaignRoutes"));

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Shopify Sale Manager Running",
    timestamp: new Date().toISOString()
  });
});

// Proxy everything else to frontend
app.use("/", createProxyMiddleware({
  target: process.env.FRONTEND_URL || "http://localhost:3000",
  changeOrigin: true,
  ws: true,
  on: {
    proxyReq: (proxyReq) => {
      proxyReq.setHeader("ngrok-skip-browser-warning", "true");
    },
    proxyRes: (proxyRes) => {
      proxyRes.headers["ngrok-skip-browser-warning"] = "true";
    },
    error: (err, req, res) => {
      res.status(502).json({ error: "Frontend not ready" });
    }
  }
}));

const PORT = process.env.PORT || 5001;

async function startServer() {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Environment: ${process.env.NODE_ENV}`);
  console.log("⏳ Waiting for MySQL to be ready...");
  await new Promise(res => setTimeout(res, 15000));
  await runMigrations();
}

app.listen(PORT, () => {
  startServer();
});
