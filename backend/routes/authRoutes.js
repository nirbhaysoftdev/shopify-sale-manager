const express = require("express");
const router = express.Router();
const shopify = require("../services/shopifyService");

// Step 1 - Begin OAuth
router.get("/", async (req, res) => {
  try {
    await shopify.auth.begin({
      shop: shopify.utils.sanitizeShop(req.query.shop, true),
      callbackPath: "/auth/callback",
      isOnline: false,
      rawRequest: req,
      rawResponse: res
    });
  } catch (error) {
    console.error("❌ Auth begin error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Step 2 - OAuth Callback
router.get("/callback", async (req, res) => {
  try {
    const callback = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res
    });

    const session = callback.session;
    console.log("✅ OAuth Success for shop:", session.shop);
    console.log("✅ Access Token:", session.accessToken);

    // Redirect to frontend
    const host = req.query.host;
    res.redirect(
      `https://13ae-2409-40e5-210d-2e34-b8c3-7d28-1f8f-23c9.ngrok-free.app/frontend?shop=${session.shop}&host=${host}`
    );

  } catch (error) {
    console.error("❌ Auth callback error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
