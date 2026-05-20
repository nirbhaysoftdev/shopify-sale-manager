const shopify = require("../services/shopifyService");
const mysqlSessionStorage = require("../db/sessionStorage");

// Verifies the Shopify-issued session token JWT sent by App Bridge in the
// Authorization header. On success, sets req.shop to the verified shop domain
// (and overwrites req.query.shop / req.body.shop with it) so controllers can
// keep reading from those without trusting client input.
async function verifyShopifyAuth(req, res, next) {
  try {
    const header = req.headers.authorization || req.headers.Authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing session token" });
    }
    const token = header.slice(7).trim();

    let payload;
    try {
      payload = await shopify.session.decodeSessionToken(token);
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired session token" });
    }

    let shopDomain;
    try {
      shopDomain = new URL(payload.dest).hostname;
    } catch {
      return res.status(401).json({ error: "Malformed session token (dest)" });
    }
    if (!shopDomain || !shopDomain.endsWith(".myshopify.com")) {
      return res.status(401).json({ error: "Untrusted shop domain" });
    }

    const sessions = await mysqlSessionStorage.findSessionsByShop(shopDomain);
    if (!sessions || sessions.length === 0) {
      return res.status(401).json({ error: "Shop not installed. Please reinstall the app." });
    }

    const claimedShopQuery = req.query?.shop;
    const claimedShopBody = req.body?.shop;
    if (claimedShopQuery && claimedShopQuery !== shopDomain) {
      return res.status(403).json({ error: "Shop mismatch" });
    }
    if (claimedShopBody && claimedShopBody !== shopDomain) {
      return res.status(403).json({ error: "Shop mismatch" });
    }

    req.shop = shopDomain;
    req.shopifySession = sessions[0];
    if (req.query) req.query.shop = shopDomain;
    if (req.body && typeof req.body === "object") req.body.shop = shopDomain;

    next();
  } catch (err) {
    console.error("❌ Auth middleware error:", err.message);
    return res.status(401).json({ error: "Auth failure" });
  }
}

module.exports = verifyShopifyAuth;
