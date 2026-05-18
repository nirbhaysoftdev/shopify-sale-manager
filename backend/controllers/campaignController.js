const pool = require("../db/connection");
const shopify = require("../services/shopifyService");
const mysqlSessionStorage = require("../db/sessionStorage");
const { scheduleSaleStart, scheduleSaleEnd } = require("../jobs/scheduler");

async function getProductId(client, variantId) {
  const query = `
    query {
      productVariant(id: "${variantId}") {
        product { id }
      }
    }
  `;
  const res = await client.request(query);
  return res.data.productVariant.product.id;
}

async function updateVariantPrice(client, variantId, price, compareAtPrice) {
  const productId = await getProductId(client, variantId);

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
      productId,
      variants: [{
        id: variantId,
        price: price,
        compareAtPrice: compareAtPrice || null
      }]
    }
  });

  const errors = res.data?.productVariantsBulkUpdate?.userErrors;
  if (errors?.length > 0) throw new Error(errors[0].message);
  return res;
}

async function createCampaign(req, res) {
  try {
    const { shop, name, discount_percentage, start_time, end_time, variants } = req.body;

    if (!shop || !name || !start_time || !variants?.length) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const sessions = await mysqlSessionStorage.findSessionsByShop(shop);
    if (!sessions || sessions.length === 0) {
      return res.status(401).json({ error: "No session found. Please reinstall the app." });
    }
    const session = sessions[0];

    // Reject the request if any selected variant overlaps an existing scheduled/active campaign.
    const variantIds = variants.map(v => v.id);
    const sqlStart = new Date(start_time).toISOString().slice(0, 19).replace("T", " ");
    const sqlEnd = end_time ? new Date(end_time).toISOString().slice(0, 19).replace("T", " ") : null;
    const [conflictRows] = await pool.query(
      `SELECT cv.variant_id, c.name AS campaign_name
       FROM campaign_variants cv
       JOIN campaigns c ON c.id = cv.campaign_id
       WHERE c.shop = ?
         AND c.status IN ('scheduled', 'active')
         AND cv.variant_id IN (?)
         AND (c.end_time IS NULL OR c.end_time > ?)
         AND (? IS NULL OR c.start_time < ?)`,
      [shop, variantIds, sqlStart, sqlEnd, sqlEnd]
    );
    if (conflictRows.length > 0) {
      return res.status(409).json({
        error: `One or more variants already belong to an overlapping campaign (e.g. "${conflictRows[0].campaign_name}"). Adjust the dates or remove the conflicting variants.`,
        conflicts: conflictRows
      });
    }

   const discountType = req.body.discount_type || "percentage";
const discountVal = req.body.discount_value || 0;

const [result] = await pool.query(
  `INSERT INTO campaigns (name, shop, discount_percentage, discount_type, discount_value, status, start_time, end_time)
   VALUES (?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
  [name, shop, discount_percentage, discountType, discountVal, start_time, end_time || null]
);


    const campaignId = result.insertId;

    for (const variant of variants) {
      await pool.query(
        `INSERT INTO campaign_variants (campaign_id, variant_id, product_id)
         VALUES (?, ?, ?)`,
        [campaignId, variant.id, variant.id]
      );

      const originalPrice = parseFloat(variant.price);
      const discountType = req.body.discount_type || "percentage";
const discountVal = parseFloat(req.body.discount_value || 0);
const salePrice = discountType === "fixed"
  ? Math.max(0, originalPrice - discountVal)
  : originalPrice - (originalPrice * discount_percentage / 100);

  
      await pool.query(
        `INSERT INTO price_snapshots
         (campaign_id, variant_id, product_title, variant_title, sku, original_price, sale_price, compare_at_price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          campaignId,
          variant.id,
          variant.productTitle,
          variant.variantTitle,
          variant.sku || "",
          originalPrice,
          salePrice.toFixed(2),
          originalPrice
        ]
      );
    }

    const startDelay = new Date(start_time).getTime() - Date.now();

    if (startDelay > 0) {
      await scheduleSaleStart({ campaignId, shop }, startDelay);
      console.log(`✅ Sale start scheduled in ${Math.round(startDelay/1000)}s`);
    } else {
      await startSale(campaignId, shop, session);
    }

    if (end_time) {
      const endDelay = new Date(end_time).getTime() - Date.now();
      if (endDelay > 0) {
        await scheduleSaleEnd({ campaignId, shop }, endDelay);
        console.log(`✅ Sale end scheduled in ${Math.round(endDelay/1000)}s`);
      }
    } else {
      console.log(`ℹ️  Campaign ${campaignId} has no end time — runs until ended manually.`);
    }

    res.json({
      campaign: {
        id: campaignId,
        name,
        discount_percentage,
        start_time,
        end_time,
        variantCount: variants.length
      }
    });

  } catch (error) {
    console.error("❌ Create campaign error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

async function startSale(campaignId, shop, session) {
  try {
    console.log(`🟢 Starting sale for campaign ${campaignId}`);

    if (!session) {
      const sessions = await mysqlSessionStorage.findSessionsByShop(shop);
      if (!sessions || sessions.length === 0) throw new Error("No session found");
      session = sessions[0];
    }

    const client = new shopify.clients.Graphql({ session });

    const [snapshots] = await pool.query(
      `SELECT * FROM price_snapshots WHERE campaign_id = ?`,
      [campaignId]
    );

    for (const snapshot of snapshots) {
      try {
        await updateVariantPrice(
          client,
          snapshot.variant_id,
          snapshot.sale_price.toString(),
          snapshot.original_price.toString()
        );
        console.log(`✅ Updated variant to £${snapshot.sale_price}`);
      } catch (err) {
        console.error(`❌ Failed to update variant:`, err.message);
      }
      await new Promise(r => setTimeout(r, 600));
    }

    await pool.query(
      `UPDATE campaigns SET status = 'active' WHERE id = ?`,
      [campaignId]
    );

    console.log(`✅ Sale started for campaign ${campaignId} - ${snapshots.length} variants updated`);

  } catch (error) {
    console.error(`❌ Start sale error for campaign ${campaignId}:`, error.message);
  }
}

async function endSale(campaignId, shop) {
  try {
    console.log(`🔴 Ending sale for campaign ${campaignId}`);

    const sessions = await mysqlSessionStorage.findSessionsByShop(shop);
    if (!sessions || sessions.length === 0) {
      console.error("❌ No session found for shop:", shop);
      return;
    }
    const session = sessions[0];
    const client = new shopify.clients.Graphql({ session });

    const [snapshots] = await pool.query(
      `SELECT * FROM price_snapshots WHERE campaign_id = ? AND is_restored = FALSE`,
      [campaignId]
    );

    for (const snapshot of snapshots) {
      try {
        await updateVariantPrice(
          client,
          snapshot.variant_id,
          snapshot.original_price.toString(),
          null
        );
        console.log(`✅ Restored variant to £${snapshot.original_price}`);
      } catch (err) {
        console.error(`❌ Failed to restore variant:`, err.message);
      }

      await pool.query(
        `UPDATE price_snapshots SET is_restored = TRUE WHERE id = ?`,
        [snapshot.id]
      );

      await new Promise(r => setTimeout(r, 600));
    }

    await pool.query(
      `UPDATE campaigns SET status = 'completed' WHERE id = ?`,
      [campaignId]
    );

    console.log(`✅ Sale ended for campaign ${campaignId} - ${snapshots.length} variants restored`);

  } catch (error) {
    console.error(`❌ End sale error for campaign ${campaignId}:`, error.message);
  }
}

async function getCampaigns(req, res) {
  try {
    const shop = req.query.shop;
    const status = req.query.status || "all";

    if (!shop) return res.status(400).json({ error: "Shop is required" });

    let statusFilter = "";
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");

    if (status === "running") {
      statusFilter = `AND c.status = 'active'`;
    } else if (status === "upcoming") {
      statusFilter = `AND c.status = 'scheduled'`;
    } else if (status === "ended") {
      statusFilter = `AND c.status IN ('completed', 'cancelled')`;
    }

    const [campaigns] = await pool.query(
      `SELECT c.*,
        COUNT(DISTINCT cv.variant_id) as variant_count
       FROM campaigns c
       LEFT JOIN campaign_variants cv ON c.id = cv.campaign_id
       WHERE c.shop = ? ${statusFilter}
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [shop]
    );

    // Get counts for tabs
    const [counts] = await pool.query(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as running,
        SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as upcoming,
        SUM(CASE WHEN status IN ('completed','cancelled') THEN 1 ELSE 0 END) as ended
       FROM campaigns WHERE shop = ?`,
      [shop]
    );

    res.json({ campaigns, counts: counts[0] });

  } catch (error) {
    console.error("❌ Get campaigns error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

async function getConflicts(req, res) {
  try {
    const { shop, start, end } = req.query;

    if (!shop) return res.status(400).json({ error: "Shop is required" });
    if (!start) return res.json({ conflicts: [] });

    const newStart = new Date(start);
    if (Number.isNaN(newStart.getTime())) {
      return res.status(400).json({ error: "Invalid start time" });
    }

    let newEnd = null;
    if (end) {
      const parsed = new Date(end);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ error: "Invalid end time" });
      }
      newEnd = parsed;
    }

    // A variant is in conflict if it belongs to a scheduled/active campaign whose
    // date range overlaps [newStart, newEnd]. Either side may be open-ended (null end_time).
    // Overlap: existing.start < new.end AND existing.end > new.start (treating nulls as infinity).
    const sqlStart = newStart.toISOString().slice(0, 19).replace("T", " ");
    const sqlEnd = newEnd ? newEnd.toISOString().slice(0, 19).replace("T", " ") : null;

    const [rows] = await pool.query(
      `SELECT cv.variant_id, c.id AS campaign_id, c.name AS campaign_name,
              c.start_time, c.end_time, c.status
       FROM campaign_variants cv
       JOIN campaigns c ON c.id = cv.campaign_id
       WHERE c.shop = ?
         AND c.status IN ('scheduled', 'active')
         AND (c.end_time IS NULL OR c.end_time > ?)
         AND (? IS NULL OR c.start_time < ?)`,
      [shop, sqlStart, sqlEnd, sqlEnd]
    );

    res.json({ conflicts: rows });
  } catch (error) {
    console.error("❌ Get conflicts error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

async function endCampaignNow(req, res) {
  try {
    const campaignId = req.params.id;
    const { shop } = req.body;

    if (!shop) return res.status(400).json({ error: "Shop is required" });

    // Check campaign exists
    const [campaigns] = await pool.query(
      `SELECT * FROM campaigns WHERE id = ? AND shop = ?`,
      [campaignId, shop]
    );

    if (campaigns.length === 0) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const campaign = campaigns[0];

    if (campaign.status === "completed") {
      return res.status(400).json({ error: "Campaign already ended" });
    }

    if (campaign.status === "cancelled") {
      return res.status(400).json({ error: "Campaign already cancelled" });
    }

    // End the sale immediately
    await endSale(parseInt(campaignId), shop);

    res.json({ success: true, message: "Campaign ended successfully" });

  } catch (error) {
    console.error("❌ End campaign now error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

module.exports = { createCampaign, startSale, endSale, getCampaigns, endCampaignNow, getConflicts };